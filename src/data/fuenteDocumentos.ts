// =============================================================================
// FUENTE DE LAS PUBLICACIONES (informes técnicos y ensayos)
// =============================================================================
// Este es el ÚNICO lugar donde se define de dónde sale el contenido de
// /publicaciones/ y del visor de documentos.
//
// El contenido vive en un repositorio aparte, con esta estructura:
//
//   ippse-documentos/
//   ├── contenido/
//   │   └── publicaciones/     <- un .md por informe (cabecera YAML + Markdown)
//   ├── documentos/            <- PDFs oficiales (los declara el campo `pdf`)
//   ├── imagenes/<id>/         <- imágenes de cada informe
//   └── esquema/publicacion.schema.json
//
// >>> PARA CAMBIAR DE REPOSITORIO <<<
// Cambiá SOLO la constante `repoDocumentos` (o definí la variable de entorno
// PUBLIC_DOCS_REPO) y listo: no hay que tocar ninguna página ni componente.
//
//   PUBLIC_DOCS_REPO=usuario/repositorio   (sin https://github.com/)
//
// La rama se toma de PUBLIC_DOCS_RAMA y por defecto es "main".
// =============================================================================

import { commitDocumentos } from './commitDocumentos';

const leer = (valor: string | undefined, porDefecto: string): string =>
  valor && valor.trim() !== '' ? valor.trim() : porDefecto;

/** Repositorio de contenido, en formato "usuario/repositorio". */
export const repoDocumentos = leer(import.meta.env.PUBLIC_DOCS_REPO, 'osbgx/ippse-documentos');

/** Rama del repositorio desde la que se lee el contenido. */
export const ramaDocumentos = leer(import.meta.env.PUBLIC_DOCS_RAMA, 'main');

/** Carpeta, dentro del repositorio, que contiene los .md de publicaciones. */
export const carpetaPublicaciones = 'contenido/publicaciones';

/** Carpeta, dentro del repositorio, que contiene los PDFs oficiales. */
export const carpetaPdfs = 'documentos';

// -----------------------------------------------------------------------------
// URLs derivadas (no hace falta editarlas)
// -----------------------------------------------------------------------------

/**
 * Referencia que se usa para leer los archivos: el SHA del último commit (fijado
 * en el build) o, si aún no se resolvió, el nombre de la rama.
 */
export const refDocumentos = (): string => commitDocumentos() ?? ramaDocumentos;

/**
 * Base para leer archivos crudos:
 *   https://raw.githubusercontent.com/<repo>/<sha-o-rama>
 *
 * Es una función (no una constante) porque el SHA recién se conoce cuando corre
 * el loader de publicaciones, antes de renderizar las páginas.
 */
export const baseDocumentos = (): string =>
  `https://raw.githubusercontent.com/${repoDocumentos}/${refDocumentos()}`;

/** Ruta dentro del repo crudo, p. ej. .../contenido/publicaciones/informe-2-26.md */
export const urlCruda = (rutaEnRepo: string) => `${baseDocumentos()}/${rutaEnRepo}`;

/** Página en GitHub de un archivo (enlace "Ver fuente"). */
export const urlEnGitHub = (rutaEnRepo: string) =>
  `https://github.com/${repoDocumentos}/blob/${ramaDocumentos}/${rutaEnRepo}`;

/** Página del repositorio en GitHub. */
export const urlRepo = `https://github.com/${repoDocumentos}`;

/**
 * Resuelve la ruta de un PDF declarada en el frontmatter (`pdf:`), que puede ser:
 *
 *   · Relativa -> vive en el repositorio de contenido, carpeta `documentos/`.
 *     Ej.: `pdf: informe-2-26.pdf` o `pdf: documentos/informe-2-26.pdf`
 *     -> https://raw.githubusercontent.com/<repo>/<rama>/documentos/informe-2-26.pdf
 *
 *   · Absoluta (empieza con "/") -> vive en el propio sitio, bajo public/.
 *     Ej.: `pdf: /documentos/informe-2-26.pdf`
 *     Se devuelve tal cual para que `conBase()` la ajuste al destino.
 *
 * Así el cliente puede subir el PDF junto al .md sin tocar el sitio, y los PDFs
 * que ya están alojados en el sitio siguen funcionando igual.
 */
export const resolverRutaPdf = (valor: string): string => {
  const ruta = valor.trim();
  if (ruta === '') return '';
  if (/^[a-z]+:\/\//i.test(ruta)) return ruta; // ya es una URL completa
  if (ruta.startsWith('/')) return ruta; // absoluta: la maneja el sitio (conBase)

  // Relativa: se asume dentro de `documentos/` del repositorio.
  const limpia = ruta.replace(/^\.\//, '').replace(/^\/+/, '');
  const conCarpeta =
    limpia === carpetaPdfs || limpia.startsWith(`${carpetaPdfs}/`) ? limpia : `${carpetaPdfs}/${limpia}`;
  return urlCruda(conCarpeta);
};

/** URL cruda de un recurso del repositorio (imágenes, PDFs, etc.). */
export const urlRecurso = (rutaEnRepo: string) => urlCruda(rutaEnRepo.replace(/^\.?\//, ''));
