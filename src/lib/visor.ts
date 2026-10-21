/**
 * Visor Dinámico: lee `?doc=<id>`, descarga `<id>.md` del repositorio público,
 * lo convierte con marked, lo sanea con DOMPurify y lo inyecta en la página.
 */

interface Metadato {
  titulo: string;
  categoria: string;
  fecha: string;
  fechaLegible: string;
  autor: string;
  /** Ruta del PDF oficial en el propio sitio, si existe. */
  pdf?: string;
}

interface Config {
  baseDocumentos: string;
  repoDocumentos: string;
  cdnMarked: string;
  cdnDomPurify: string;
  metadatos: Record<string, Metadato>;
}

type Estado = 'cargando' | 'error' | 'documento';

class ErrorVisor extends Error {
  constructor(
    public titulo: string,
    detalle: string,
    public reintentable = false,
  ) {
    super(detalle);
  }
}

// Solo nombres simples (letras, números, guiones, guion bajo y subcarpetas): evita rutas arbitrarias.
const ID_VALIDO = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i;

/**
 * Limpia artefactos de transcripción presentes en algunos documentos:
 * marcas de citación ("[cite: 1]"), encabezado y pie de página repetidos en cada
 * página del original ("Aprobado en Reunión del Comité Ejecutivo… Pág. X").
 */
const limpiarMarkdown = (md: string) =>
  md
    .replace(/\s?\[cite(?:_start|:[^\]]*)\]/g, '')
    .replace(/^Aprobado en Reunión del Comité Ejecutivo del IPPSE[^\n]*$/gm, '')
    .replace(/^\*{0,2}Instituto de Profesionales Paraguayos del Sector Eléctrico\*{0,2}[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

const slug = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function iniciarVisor(raiz: HTMLElement) {
  const config: Config = JSON.parse(raiz.dataset.config ?? '{}');
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => raiz.querySelector<T>(sel)!;

  const mostrar = (estado: Estado) => {
    // Cada contenedor declara su display en data-display; solo uno es visible a la vez
    raiz.querySelectorAll<HTMLElement>('[data-estado]').forEach((el) => {
      const activo = el.dataset.estado === estado;
      el.classList.toggle('hidden', !activo);
      el.classList.toggle(el.dataset.display!, activo);
    });
  };

  const fijarTitulo = (titulo: string) => {
    $('[data-titulo]').textContent = titulo;
    document.title = `${titulo} | IPPSE`;
  };

  const mostrarError = (error: unknown) => {
    const e =
      error instanceof ErrorVisor
        ? error
        : new ErrorVisor('No se pudo cargar el documento', 'Ocurrió un error inesperado al procesar el documento.', true);
    $('[data-error-titulo]').textContent = e.titulo;
    $('[data-error-detalle]').textContent = e.message;
    $('[data-reintentar]').classList.toggle('hidden', !e.reintentable);
    $('[data-reintentar]').classList.toggle('inline-flex', e.reintentable);
    mostrar('error');
    console.error('[visor]', error);
  };

  const doc = new URLSearchParams(location.search).get('doc')?.trim() ?? '';
  const meta = config.metadatos[doc];

  // Metadatos conocidos: se muestran de inmediato, antes de descargar el documento
  if (meta) {
    fijarTitulo(meta.titulo);
    $('[data-meta-categoria]').textContent = meta.categoria;
    const fecha = $<HTMLTimeElement>('[data-meta-fecha]');
    fecha.dateTime = meta.fecha;
    fecha.textContent = meta.fechaLegible;
    $('[data-meta]').classList.replace('hidden', 'flex');
    const autor = $('[data-meta-autor]');
    autor.textContent = meta.autor;
    autor.classList.remove('hidden');
  }

  // El navegador recuerda un import() fallido para siempre: en cada reintento se usa una URL distinta
  let intento = 0;
  const urlModulo = (url: string) => (intento > 1 ? `${url}?reintento=${intento}` : url);

  async function cargar() {
    intento++;
    mostrar('cargando');
    try {
      if (!doc) {
        throw new ErrorVisor(
          'No se indicó ningún documento',
          'Seleccioná un informe desde el listado de Informes y Publicaciones.',
        );
      }
      if (!ID_VALIDO.test(doc)) {
        throw new ErrorVisor('Identificador de documento no válido', `“${doc}” no corresponde a un documento del IPPSE.`);
      }

      const [respuesta, { marked }, { default: DOMPurify }] = await Promise.all([
        fetch(`${config.baseDocumentos}/${doc}.md`, { cache: 'no-cache' }),
        import(/* @vite-ignore */ urlModulo(config.cdnMarked)),
        import(/* @vite-ignore */ urlModulo(config.cdnDomPurify)),
      ]).catch((e) => {
        if (e instanceof ErrorVisor) throw e;
        throw new ErrorVisor(
          'Sin conexión con el repositorio',
          'No fue posible descargar el documento. Verificá tu conexión a internet e intentá nuevamente.',
          true,
        );
      });

      if (respuesta.status === 404) {
        throw new ErrorVisor(
          'Documento no encontrado',
          `El documento “${doc}” no existe o todavía no fue publicado en el repositorio oficial.`,
        );
      }
      if (!respuesta.ok) {
        throw new ErrorVisor(
          'El repositorio no está disponible',
          `El servidor respondió con el código ${respuesta.status}. Intentá nuevamente en unos minutos.`,
          true,
        );
      }

      renderizar(await respuesta.text(), marked, DOMPurify);
      mostrar('documento');
    } catch (error) {
      mostrarError(error);
    }
  }

  // Tipos mínimos de las librerías cargadas por CDN
  type Marked = { lexer: (md: string) => { type: string; depth?: number; text?: string }[] & { links: object }; parser: (t: unknown) => string };
  type Purify = { sanitize: (html: string) => string };

  function renderizar(markdown: string, marked: Marked, DOMPurify: Purify) {
    const tokens = marked.lexer(limpiarMarkdown(markdown));

    // El H1 del archivo pasa a ser el título de la página (o se descarta si el índice ya da uno)
    const primero = tokens.findIndex((t) => t.type !== 'space');
    if (tokens[primero]?.type === 'heading' && tokens[primero].depth === 1) {
      if (!meta) fijarTitulo(tokens[primero].text ?? 'Documento oficial');
      tokens.splice(primero, 1);
    }

    const contenido = $('[data-contenido]');
    contenido.innerHTML = DOMPurify.sanitize(marked.parser(tokens));

    // Un solo <h1> por página: los H1 restantes del documento bajan a H2
    contenido.querySelectorAll('h1').forEach((h1) => {
      const h2 = document.createElement('h2');
      h2.innerHTML = h1.innerHTML;
      h1.replaceWith(h2);
    });

    // Tablas anchas: desplazamiento horizontal propio, sin romper el ancho de la página en móvil
    contenido.querySelectorAll('table').forEach((tabla) => {
      const envoltorio = document.createElement('div');
      envoltorio.className = 'tabla-desplazable';
      envoltorio.tabIndex = 0;
      envoltorio.setAttribute('role', 'region');
      envoltorio.setAttribute('aria-label', 'Tabla (desplazable horizontalmente)');
      tabla.replaceWith(envoltorio);
      envoltorio.append(tabla);
    });

    // Enlaces externos en pestaña nueva
    contenido.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });

    construirIndice(contenido);

    $<HTMLAnchorElement>('[data-fuente]').href = `${config.repoDocumentos}/${doc}.md`;

    // PDF oficial en el propio sitio: solo se ofrece si la publicación lo declara
    const pdf = $<HTMLAnchorElement>('[data-pdf]');
    if (meta?.pdf) {
      pdf.href = meta.pdf;
      pdf.classList.replace('hidden', 'inline-flex');
    }

    $('[data-acciones]').classList.replace('hidden', 'flex');
  }

  function construirIndice(contenido: HTMLElement) {
    const titulos = [...contenido.querySelectorAll<HTMLHeadingElement>('h2, h3')];
    const usados = new Set<string>();
    titulos.forEach((h) => {
      let id = slug(h.textContent ?? '') || 'seccion';
      for (let n = 2; usados.has(id); n++) id = `${slug(h.textContent ?? '')}-${n}`;
      usados.add(id);
      h.id = id;
    });

    if (titulos.length < 2) return;

    const lista = $('[data-indice-lista]');
    lista.replaceChildren(
      ...titulos.map((h) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${h.id}`;
        a.textContent = h.textContent;
        a.className =
          '-ml-px flex min-h-10 items-center border-l-2 border-transparent py-1 pr-2 text-gray-700 no-underline hover:border-py-rojo hover:text-py-azul lg:min-h-0 ' +
          (h.tagName === 'H3' ? 'pl-7 text-[0.8125rem]' : 'pl-4 font-semibold');
        li.append(a);
        return li;
      }),
    );

    const details = $<HTMLDetailsElement>('[data-indice-details]');
    const escritorio = matchMedia('(min-width: 1024px)');
    const sincronizar = () => (details.open = escritorio.matches);
    sincronizar();
    escritorio.addEventListener('change', sincronizar);

    // En móvil, al elegir una sección se cierra el desplegable
    lista.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a') && !escritorio.matches) details.open = false;
    });

    $('[data-indice]').classList.remove('hidden');
  }

  $('[data-reintentar]').addEventListener('click', cargar);
  $('[data-imprimir]').addEventListener('click', () => window.print());

  cargar();
}
