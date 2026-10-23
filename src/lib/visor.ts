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
  /** URL del PDF oficial, ya resuelta (sitio o repositorio), si existe. */
  pdf?: string;
}

interface Config {
  baseDocumentos: string;
  /** Base de las páginas de archivo en GitHub (enlace "Ver fuente"). */
  urlGitHub: string;
  carpetaPublicaciones: string;
  /** URL del visor (con base), para enlazar otros informes entre sí. */
  urlVisor: string;
  cdnMarked: string;
  cdnDomPurify: string;
  /** Diagramas Mermaid (opcional: si falta, los bloques se muestran como código). */
  cdnMermaid?: string;
  /** KaTeX: fórmulas matemáticas (opcional). */
  cdnKatex?: string;
  /** Hoja de estilos de KaTeX (opcional). */
  cdnKatexCss?: string;
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
 *
 * También quita la cabecera YAML (frontmatter) del inicio del archivo: los datos
 * del informe (título, fecha, autor…) ya llegan por la configuración del visor,
 * así que no deben verse como texto en el documento.
 */
const limpiarMarkdown = (md: string) =>
  md
    .replace(/^\uFEFF/, '') // BOM, si lo hubiera
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '') // cabecera YAML
    .replace(/\s?\[cite(?:_start|:[^\]]*)\]/g, '')
    .replace(/^Aprobado en Reunión del Comité Ejecutivo del IPPSE[^\n]*$/gm, '')
    .replace(/^\*{0,2}Instituto de Profesionales Paraguayos del Sector Eléctrico\*{0,2}[ \t]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

/** Extrae el YAML del frontmatter (por si el visor necesita algún dato suelto). */
const leerFrontmatter = (md: string): Record<string, string> => {
  const m = md.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const datos: Record<string, string> = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const i = linea.indexOf(':');
    if (i === -1) continue;
    const clave = linea.slice(0, i).trim();
    let valor = linea.slice(i + 1).trim();
    if (/^".*"$/.test(valor) || /^'.*'$/.test(valor)) valor = valor.slice(1, -1);
    if (clave) datos[clave] = valor;
  }
  return datos;
};

/**
 * Notas al pie al estilo Markdown[^1], que `marked` no trae de fábrica.
 *
 * Se procesan sobre el MARKDOWN (no sobre el HTML ya parseado): insertar HTML
 * crudo en medio de un párrafo hace que `marked` cierre mal las etiquetas y
 * genere un DOM corrupto. Por eso acá solo se dejan marcadores de texto simples
 * (`@@IPPSE_NOTA_n@@`), que `marked` trata como texto normal, y recién después
 * del saneado se convierten en los enlaces reales.
 *
 * Devuelve el Markdown con marcadores y las notas detectadas, en orden de aparición.
 */
const procesarNotas = (md: string): { markdown: string; notas: { etiqueta: string; texto: string }[] } => {
  const definiciones = new Map<string, string>();

  // Definiciones: "[^etiqueta]: texto", que puede continuar en líneas indentadas.
  const sinDefiniciones = md.replace(
    /^\[\^([^\]]+)\]:[ \t]*(.*(?:\r?\n(?:[ \t]+\S.*)*)?)/gm,
    (_todo, etiqueta: string, texto: string) => {
      // Si ya existía una definición, se conserva la primera.
      if (definiciones.has(etiqueta)) return '';
      definiciones.set(
        etiqueta,
        texto
          .split(/\r?\n/)
          .map((l) => l.replace(/^[ \t]+/, ''))
          .join(' ')
          .trim(),
      );
      return '';
    },
  );

  if (definiciones.size === 0) return { markdown: md, notas: [] };

  const orden: { etiqueta: string; texto: string }[] = [];
  const markdown = sinDefiniciones.replace(/\[\^([^\]]+)\]/g, (todo, etiqueta: string) => {
    const texto = definiciones.get(etiqueta);
    if (texto === undefined) return todo; // referencia sin definición: se deja igual
    let numero = orden.findIndex((n) => n.etiqueta === etiqueta);
    if (numero === -1) {
      orden.push({ etiqueta, texto });
      numero = orden.length - 1;
    }
    return `@@IPPSE_NOTA_${numero + 1}@@`;
  });

  return { markdown, notas: orden };
};

/** Convierte los marcadores de nota en enlaces reales (luego del saneado). */
const restaurarNotas = (html: string, notas: { texto: string }[]): string => {
  if (notas.length === 0) return html;

  // Una misma nota puede citarse varias veces: cada referencia necesita un id
  // propio (no se pueden repetir ids en el documento).
  const apariciones = new Map<number, number>();

  // Referencias dentro del texto: marcador -> superíndice con enlace a la nota.
  let salida = html.replace(/@@IPPSE_NOTA_(\d+)@@/g, (_todo, numero: string) => {
    const n = Number(numero);
    const vez = (apariciones.get(n) ?? 0) + 1;
    apariciones.set(n, vez);
    const id = vez === 1 ? `nota-ref-${n}` : `nota-ref-${n}-${vez}`;
    const etiqueta = vez === 1 ? `Nota ${n}` : `Nota ${n} (referencia ${vez})`;
    return (
      `<sup class="nota-ref" id="${id}">` +
      `<a href="#nota-${n}" role="doc-noteref" aria-label="${etiqueta}">${n}</a>` +
      `</sup>`
    );
  });

  // Bloque final con las definiciones y su enlace de vuelta.
  const items = notas
    .map(
      (_nota, i) =>
        `<li id="nota-${i + 1}"><span class="nota-texto">${_nota.texto}</span> ` +
        `<a href="#nota-ref-${i + 1}" role="doc-backlink" aria-label="Volver a la referencia ${i + 1}">↩</a></li>`,
    )
    .join('');

  salida += `\n<hr class="notas-separador">\n<ol class="notas">${items}</ol>\n`;
  return salida;
};

/** Marcador temporal para no perder las fórmulas durante el saneado. */
const MARCA_FORMULA = /@@IPPSE_FORMULA_(\d+)@@/g;

/** Busca fórmulas $$…$$ (bloque) y $…$ (en línea) y las cambia por marcadores. */
const extraerFormulas = (html: string, formulas: { tex: string; display: boolean }[]): string => {
  let salida = html.replace(/\$\$([\s\S]+?)\$\$/g, (_todo, tex: string) => {
    formulas.push({ tex, display: true });
    return `@@IPPSE_FORMULA_${formulas.length - 1}@@`;
  });
  // En línea: un solo "$", sin cruzar líneas ni confundirse con "$$".
  salida = salida.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_todo, tex: string) => {
    formulas.push({ tex, display: false });
    return `@@IPPSE_FORMULA_${formulas.length - 1}@@`;
  });
  return salida;
};

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

      // Las tres librerías base son obligatorias; Mermaid y KaTeX son opcionales:
      // si no cargan, el documento se muestra igual (como código / texto).
      if (config.cdnKatexCss) asegurarEstilos(config.cdnKatexCss);

      const [respuesta, { marked }, { default: DOMPurify }, mermaid] = await Promise.all([
        fetch(`${config.baseDocumentos}/${config.carpetaPublicaciones}/${doc}.md`, { cache: 'no-cache' }),
        import(/* @vite-ignore */ urlModulo(config.cdnMarked)),
        import(/* @vite-ignore */ urlModulo(config.cdnDomPurify)),
        cargarOpcional<Mermaid>(config.cdnMermaid),
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

      await renderizar(await respuesta.text(), marked, DOMPurify);
      mostrar('documento');
      // Los diagramas se dibujan con la página ya visible, para no bloquear el texto.
      void dibujarMermaid(mermaid);
    } catch (error) {
      mostrarError(error);
    }
  }

  // Tipos mínimos de las librerías cargadas por CDN
  type Marked = { lexer: (md: string) => { type: string; depth?: number; text?: string }[] & { links: object }; parser: (t: unknown) => string };
  type Purify = { sanitize: (html: string) => string };
  type Katex = { renderToString: (tex: string, opciones?: Record<string, unknown>) => string };
  type Mermaid = {
    initialize: (config: Record<string, unknown>) => void;
    run: (opciones?: Record<string, unknown>) => Promise<void>;
  };

  /**
   * Carga una librería opcional por CDN; si falla, el documento se muestra igual.
   * Se prefiere `default` cuando el paquete lo expone (es el caso de Mermaid v12,
   * que concentra su API ahí), y si no, se usa el propio módulo.
   */
  async function cargarOpcional<T>(url: string | undefined): Promise<T | null> {
    if (!url) return null;
    try {
      const modulo = (await import(/* @vite-ignore */ urlModulo(url))) as Record<string, unknown> & { default?: unknown };
      return (modulo.default ?? modulo) as T;
    } catch {
      return null;
    }
  }

  /** Inyecta una hoja de estilos del CDN una sola vez. */
  function asegurarEstilos(href: string) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.append(link);
  }

  /**
   * Convierte los bloques ```mermaid en <div class="mermaid"> con el texto crudo.
   * Debe hacerse ANTES del saneado: DOMPurify se come el contenido de un diagrama
   * (por ejemplo el "-->"), así que el código se traslada tal cual y Mermaid lo
   * dibuja después, sobre HTML ya limpio.
   *
   * El HTML se manipula en un elemento DESCONECTADO del documento: si se usara el
   * contenedor real, el navegador dispararía la carga de las imágenes del informe
   * (que todavía tienen su ruta relativa) antes de poder resolverlas.
   */
  function prepararMermaid(html: string): string {
    const contenedor = document.createElement('div');
    contenedor.innerHTML = html;
    let hay = false;
    contenedor.querySelectorAll('pre > code.language-mermaid, pre > code.lang-mermaid').forEach((code) => {
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = code.textContent ?? '';
      code.parentElement!.replaceWith(div);
      hay = true;
    });
    return hay ? contenedor.innerHTML : html;
  }

  /** Restaura las fórmulas con KaTeX; si KaTeX no cargó, deja el texto original. */
  function restaurarFormulas(html: string, formulas: { tex: string; display: boolean }[], katex: Katex | null): string {
    return html.replace(MARCA_FORMULA, (_todo, indice: string) => {
      const f = formulas[Number(indice)];
      if (!f) return '';
      if (!katex) return f.display ? `$$${f.tex}$$` : `$${f.tex}$`;
      try {
        return katex.renderToString(f.tex, { displayMode: f.display, throwOnError: false, output: 'html' });
      } catch {
        // Fórmula inválida: se muestra el código en vez de romper la página.
        const escapado = f.tex.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
        return f.display ? `<span class="formula-invalida">$$${escapado}$$</span>` : `<span class="formula-invalida" title="Fórmula no válida">$${escapado}$</span>`;
      }
    });
  }

  /**
   * Reescribe las imágenes de ruta relativa con su URL final del repositorio,
   * ANTES de que el HTML entre al DOM.
   *
   * Si se dejara la ruta relativa, el navegador la cargaría contra el sitio (esa
   * ruta no existe: el archivo vive en el repositorio) y provocaría un 404 en
   * cada imagen del informe. Las rutas ya absolutas (http, data:, /) se respetan.
   */
  const resolverImagenes = (html: string): string =>
    html.replace(/(<img\b[^>]*?)\ssrc=(["'])([^"']*)\2/gi, (todo, antes: string, _c: string, src: string) => {
      const esExterna = /^[a-z]+:\/\//i.test(src) || src.startsWith('data:') || src.startsWith('/');
      return esExterna ? todo : `${antes} src="${unirRepo(src)}"`;
    });

  /**
   * Resuelve los enlaces de ruta relativa contra el repositorio de contenido.
   *
   * Las rutas se interpretan tomando como base la carpeta de publicaciones, que es
   * donde vive el .md: así `../imagenes/<id>/foto.png` sale de `contenido/` y cae
   * en `imagenes/`, que es la raíz del repositorio. Los `..` se resuelven de verdad
   * (no se pueden "escapar" más arriba de la raíz).
   */
  function resolverRecursos(contenido: HTMLElement) {
    // Los enlaces ya absolutos (http, mailto, #ancla) se dejan como están.
    contenido.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('#') || /^[a-z]+:/i.test(href) || href.startsWith('//')) return;

      // Enlace a otro informe del repositorio -> se abre en el visor.
      const mate = href.match(/^(?:\.{1,2}\/)*([^/]+?)\.md$/i);
      if (mate) {
        a.href = `${config.urlVisor}?doc=${encodeURIComponent(mate[1])}`;
        return;
      }

      // Cualquier otro archivo del repositorio (PDF, imagen, planilla…).
      a.href = unirRepo(href);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
  }

  /**
   * Resuelve una ruta relativa contra la carpeta donde vive el .md dentro del
   * repositorio (`contenido/publicaciones/`), que es la base real de las rutas
   * en Markdown. Los `..` se resuelven de verdad y no pueden salir de la raíz.
   *
   *   `../imagenes/<id>/foto.png`  -> <raíz>/imagenes/<id>/foto.png
   *   `../documentos/informe.pdf`   -> <raíz>/documentos/informe.pdf
   *   `anexo.pdf`                   -> contenido/publicaciones/anexo.pdf
   */
  function unirRepo(ruta: string): string {
    const partes = [...config.carpetaPublicaciones.split('/'), ...ruta.split('/')];
    const pila: string[] = [];
    for (const parte of partes) {
      if (parte === '' || parte === '.') continue;
      if (parte === '..') pila.pop();
      else pila.push(parte);
    }
    return `${config.baseDocumentos}/${pila.join('/')}`;
  }

  /** Dibuja los diagramas Mermaid ya presentes en el DOM. */
  async function dibujarMermaid(mermaid: Mermaid | null) {
    const contenido = $('[data-contenido]');
    const diagramas = contenido.querySelectorAll<HTMLElement>('.mermaid');
    if (!mermaid || diagramas.length === 0) return;

    // La línea de "hoy" no aporta en un cronograma proyectado y tapa el primer
    // año del eje: se oculta salvo que el autor la pida explícitamente.
    diagramas.forEach((d) => {
      const texto = d.textContent ?? '';
      if (/^\s*gantt\b/.test(texto) && !/^\s*todayMarker\b/m.test(texto)) {
        d.textContent = texto.replace(/^(\s*gantt\b.*)$/m, '$1\n    todayMarker off');
      }
    });

    // Mermaid mide el ancho del Gantt en un contenedor temporal (y le da ~300 px),
    // lo que encima etiquetas, años y títulos. Se le pasa el ancho real del
    // documento, con un mínimo legible: en móviles el diagrama se desplaza dentro
    // de su recuadro en vez de achicarse hasta ser ilegible.
    const anchoGantt = Math.max(diagramas[0].clientWidth - 32, 760);

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      fontFamily: 'inherit',
      themeVariables: {
        primaryColor: '#eef2ff',
        primaryBorderColor: '#1e3a8a',
        primaryTextColor: '#111827',
        lineColor: '#6b7280',
        fontSize: '14px',
        // Gantt: grilla tenue y bandas de sección uniformes.
        gridColor: '#e5e7eb',
        sectionBkgColor: '#f8fafc',
        altSectionBkgColor: '#ffffff',
        sectionBkgColor2: '#f8fafc',
      },
      gantt: {
        useWidth: anchoGantt,
        // Columna de secciones a la izquierda y margen a la derecha para que los
        // nombres de tareas que no caben en su barra se escriban a su lado.
        leftPadding: 190,
        rightPadding: 140,
        barHeight: 26,
        barGap: 8,
        topPadding: 56,
        fontSize: 13,
        sectionFontSize: 14,
        gridLineStartPadding: 40,
      },
    });

    try {
      await mermaid.run({ nodes: [...diagramas] });
      // Mermaid deja el Gantt con width="100%": se fija su ancho real para que en
      // móviles se desplace (ver global.css) en lugar de encogerse.
      contenido.querySelectorAll<SVGSVGElement>('.mermaid svg[aria-roledescription="gantt"]').forEach((svg) => {
        const ancho = svg.viewBox.baseVal?.width;
        if (ancho) svg.style.width = `${ancho}px`;
      });
    } catch (error) {
      // Si un diagrama tiene un error de sintaxis, se deja visible el código.
      console.warn('[visor] No se pudo dibujar un diagrama Mermaid', error);
      diagramas.forEach((d) => {
        if (!d.querySelector('svg')) {
          const pre = document.createElement('pre');
          pre.className = 'mermaid-error';
          pre.textContent = d.textContent ?? '';
          d.replaceWith(pre);
        }
      });
    }
  }

  async function renderizar(markdown: string, marked: Marked, DOMPurify: Purify) {
    // Se limpia UNA sola vez: quita el frontmatter YAML y los artefactos de
    // transcripción. Todo lo que sigue parte de este texto, así el YAML nunca
    // llega al parser (si llegara, se vería como texto plano en el documento).
    let limpio = limpiarMarkdown(markdown);

    // El H1 del archivo pasa a ser el título de la página, así que se quita del
    // cuerpo (si no, se vería repetido arriba del documento).
    const primerTitulo = limpio.match(/^\s*#\s+[^\n]*(?:\n|$)/);
    if (primerTitulo) {
      if (!meta) fijarTitulo(primerTitulo[0].replace(/^\s*#\s+/, '').trim() || 'Documento oficial');
      limpio = limpio.slice(primerTitulo[0].length).replace(/^\n+/, '');
    }

    // Notas al pie: se resuelven sobre el Markdown limpio (marcadores) antes de parsear.
    const { markdown: mdConNotas, notas } = procesarNotas(limpio);
    const html = marked.parser(marked.lexer(mdConNotas));

    const contenido = $('[data-contenido]');

    // Lo PRIMERO: resolver las imágenes relativas a su URL del repositorio.
    // Cualquier paso que parsee el HTML (aunque sea en un nodo desconectado) puede
    // disparar la carga de un `src` relativo, y esa ruta no existe en el sitio:
    // daría un 404 por cada imagen del informe.
    const conImagenes = resolverImagenes(html);

    // Diagramas y fórmulas se apartan del saneado en dos pasos:
    //  · Mermaid -> se convierte a <div class="mermaid"> con texto crudo.
    //  · Fórmulas -> se cambian por marcadores temporales.
    // Después del saneado se dibujan/restauran, que es cuando ya son de confianza.
    const conMermaid = prepararMermaid(conImagenes);

    const formulas: { tex: string; display: boolean }[] = [];
    const conFormulas = config.cdnKatex ? extraerFormulas(conMermaid, formulas) : conMermaid;

    contenido.innerHTML = DOMPurify.sanitize(conFormulas, { ADD_ATTR: ['target'] });

    // Notas al pie: los marcadores pasan a ser enlaces reales.
    if (notas.length > 0) contenido.innerHTML = restaurarNotas(contenido.innerHTML, notas);

    if (formulas.length > 0) {
      const katex = await cargarOpcional<Katex>(config.cdnKatex);
      contenido.innerHTML = restaurarFormulas(contenido.innerHTML, formulas, katex);
    }

    // Enlaces e imágenes relativos del repositorio: se resuelven contra su URL cruda.
    resolverRecursos(contenido);

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

    $<HTMLAnchorElement>('[data-fuente]').href = `${config.urlGitHub}/${config.carpetaPublicaciones}/${doc}.md`;

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
