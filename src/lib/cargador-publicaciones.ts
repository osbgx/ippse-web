// Loader de contenido remoto para Astro.
//
// Lee los .md de publicaciones desde el repositorio de contenido (ver
// src/data/fuenteDocumentos.ts) usando la API de GitHub, sin necesidad de
// clonar el repositorio. En tiempo de build:
//
//   1. Pide el listado de archivos de la carpeta de publicaciones.
//   2. Descarga cada .md en paralelo.
//   3. Parsea la cabecera YAML, valida con el esquema y renderiza el Markdown.
//
// Con esto, cambiar de repositorio es cambiar SOLO la URL (PUBLIC_DOCS_REPO).
// Si la red falla, el build corta con un mensaje claro en vez de generar un
// sitio vacío en silencio.

import type { Loader, LoaderContext } from 'astro/loaders';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fijarCommitDocumentos } from '../data/commitDocumentos';
import { carpetaLocal, carpetaPublicaciones, modoLocal, repoDocumentos, ramaDocumentos } from '../data/fuenteDocumentos';

interface OpcionesLoader {
  /** Repositorio en formato "usuario/repositorio". */
  repo: string;
  /** Rama desde la que se lee. */
  rama: string;
  /** Carpeta que contiene los .md. */
  carpeta: string;
}

interface ArchivoGitHub {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
}

/** Cabeceras para la API de GitHub (funciona igual con o sin token). */
const cabeceras = (): HeadersInit => {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ippse-web-build',
  };
  // Token opcional: sube el límite de peticiones y evita 403 en CI.
  const token = process.env.GITHUB_TOKEN ?? process.env.PUBLIC_DOCS_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

/**
 * Devuelve solo el cuerpo Markdown, sin la cabecera YAML.
 */
const quitarFrontmatter = (contenido: string): string => {
  const texto = contenido.replace(/^\uFEFF/, ''); // quita BOM si lo hubiera
  const coincide = texto.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return coincide ? coincide[1] : texto;
};

/** Loader de Astro: descarga las publicaciones del repositorio remoto. */
export function cargadorPublicaciones(opciones: OpcionesLoader): Loader {
  return {
    name: 'publicaciones-remotas',
    load: async (contexto: LoaderContext) => {
      const { store, logger, parseData, renderMarkdown, generateDigest } = contexto;
      const { repo, rama, carpeta } = opciones;

      // Modo local (temporal): leer los .md de `contenido-local/` en vez de GitHub.
      if (modoLocal) {
        const dir = path.resolve(process.cwd(), carpetaLocal, carpeta);
        let entradas: string[];
        try {
          entradas = (await fs.readdir(dir)).filter((f) => f.endsWith('.md') && !/^[._]/.test(f));
        } catch (error) {
          throw new Error(
            `Modo local activo (PUBLIC_DOCS_LOCAL) pero no se pudo leer ${dir}.\n` +
              `Detalle: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        logger.info(`Modo local: leyendo ${entradas.length} publicaciones de ${dir}`);
        store.clear();

        for (const nombre of entradas) {
          const id = nombre.replace(/\.md$/, '');
          const contenido = await fs.readFile(path.join(dir, nombre), 'utf8');
          const cuerpo = quitarFrontmatter(contenido);
          const datos = await parseData({ id, data: extraerFrontmatter(contenido) as Record<string, unknown> });
          const renderizado = await renderMarkdown(cuerpo);
          store.set({
            id,
            data: datos,
            body: cuerpo,
            rendered: renderizado,
            digest: generateDigest(contenido),
          });
        }

        logger.info(`Publicaciones cargadas (local): ${entradas.length}`);
        return;
      }

      // 1. Fijar el commit: todas las URLs del sitio (visor, PDFs, imágenes) usan
      //    este SHA en vez del nombre de la rama. Son URLs inmutables, así la CDN
      //    de raw.githubusercontent.com nunca sirve una versión cacheada.
      //    Si esto falla, no se aborta: se sigue con el nombre de la rama.
      let ref = rama;
      try {
        const rCommit = await fetch(`https://api.github.com/repos/${repo}/commits/${rama}`, {
          headers: cabeceras(),
        });
        if (rCommit.ok) {
          const commit = (await rCommit.json()) as { sha?: string };
          if (commit.sha) {
            fijarCommitDocumentos(commit.sha);
            ref = commit.sha;
          }
        } else {
          logger.warn(
            `No se pudo fijar el commit de ${repo}@${rama} (HTTP ${rCommit.status}); ` +
              `se usarán URLs con el nombre de la rama.`,
          );
        }
      } catch (error) {
        logger.warn(
          `No se pudo fijar el commit de ${repo}@${rama} (${error instanceof Error ? error.message : error}); ` +
            `se usarán URLs con el nombre de la rama.`,
        );
      }

      const urlListado = `https://api.github.com/repos/${repo}/contents/${carpeta}?ref=${ref}`;
      logger.info(`Leyendo publicaciones de ${repo} (${rama}/${carpeta})…`);

      let archivos: ArchivoGitHub[];
      try {
        const respuesta = await fetch(urlListado, { headers: cabeceras() });
        if (!respuesta.ok) {
          throw new Error(`La API de GitHub respondió ${respuesta.status} ${respuesta.statusText}`);
        }
        archivos = (await respuesta.json()) as ArchivoGitHub[];
      } catch (error) {
        throw new Error(
          `No se pudo leer el repositorio de publicaciones (${repo}). ` +
            `Verificá que PUBLIC_DOCS_REPO apunte a un repositorio público y que la rama "${rama}" exista.\n` +
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Solo archivos .md; se ignoran borradores (que empiezan con "_" o ".").
      const publicaciones = archivos.filter(
        (a) => a.type === 'file' && a.name.endsWith('.md') && !/^[._]/.test(a.name) && a.download_url,
      );

      store.clear();

      for (const archivo of publicaciones) {
        const id = archivo.name.replace(/\.md$/, '');
        let contenido: string;
        try {
          // Se pide el contenido a la API (no a `download_url`): el endpoint de
          // contenidos con `Accept: raw` responde siempre con el archivo del commit
          // pedido, mientras que las URLs de raw.githubusercontent.com pasan por una
          // CDN que puede servir una versión cacheada unos minutos.
          // Así el build nunca arma el sitio con datos viejos.
          const r = await fetch(
            `https://api.github.com/repos/${repo}/contents/${archivo.path}?ref=${ref}`,
            { headers: { ...cabeceras(), Accept: 'application/vnd.github.raw' } },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          contenido = await r.text();
        } catch (error) {
          logger.warn(`Se omite ${archivo.name}: no se pudo descargar (${error instanceof Error ? error.message : error})`);
          continue;
        }

        const cuerpo = quitarFrontmatter(contenido);

        // parseData valida el frontmatter contra el esquema de la colección y
        // devuelve los datos tipados; renderMarkdown genera el HTML del cuerpo.
        const datos = await parseData({ id, data: extraerFrontmatter(contenido) as Record<string, unknown> });
        const renderizado = await renderMarkdown(cuerpo);

        store.set({
          id,
          data: datos,
          body: cuerpo,
          rendered: renderizado,
          digest: generateDigest(contenido),
        });
      }

      logger.info(`Publicaciones cargadas: ${publicaciones.length}`);
    },
  };
}

/**
 * Extrae la cabecera YAML como objeto plano. Se usa un parser mínimo que cubre
 * el subconjunto que usamos (clave: valor, listas en línea y fechas sin comillas),
 * para no depender de un parser adicional. Si el archivo no trae cabecera,
 * devuelve un objeto vacío y la validación del esquema avisará.
 */
export function extraerFrontmatter(contenido: string): Record<string, unknown> {
  const texto = contenido.replace(/^\uFEFF/, '');
  const coincide = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!coincide) return {};

  const datos: Record<string, unknown> = {};
  for (const linea of coincide[1].split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf(':');
    if (i === -1) continue;
    const clave = limpia.slice(0, i).trim();
    let valor: string = limpia.slice(i + 1).trim();
    if (!clave) continue;

    // Quita comillas simples o dobles envolventes.
    if (/^".*"$/.test(valor) || /^'.*'$/.test(valor)) {
      valor = valor.slice(1, -1);
    }

    if (valor === '') {
      datos[clave] = '';
    } else if (valor === 'true' || valor === 'false') {
      datos[clave] = valor === 'true';
    } else if (/^-?\d+$/.test(valor)) {
      datos[clave] = Number(valor);
    } else if (/^\[.*\]$/.test(valor)) {
      datos[clave] = valor
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      datos[clave] = valor;
    }
  }
  return datos;
}

/** Instancia lista para usar en content.config.ts. */
export const publicacionesRemotas = cargadorPublicaciones({
  repo: repoDocumentos,
  rama: ramaDocumentos,
  carpeta: carpetaPublicaciones,
});
