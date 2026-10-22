// Configuración del Visor Dinámico de documentos.
//
// La ubicación del repositorio de contenido se define en un solo lugar:
// `src/data/fuenteDocumentos.ts` (o la variable de entorno PUBLIC_DOCS_REPO).
// Este módulo solo la reexporta y ajusta las piezas propias del visor.

import { baseDocumentos, carpetaPublicaciones, urlCruda, urlEnGitHub } from './fuenteDocumentos';

/** Base cruda del repositorio (https://raw.githubusercontent.com/...), como función. */
export { baseDocumentos, carpetaPublicaciones };

/** Construye la URL cruda de una publicación: <base>/contenido/publicaciones/<id>.md */
export const urlPublicacion = (id: string) => urlCruda(`${carpetaPublicaciones}/${id}.md`);

/** Página del archivo en GitHub (enlace "Ver fuente"). */
export const urlFuentePublicacion = (id: string) => urlEnGitHub(`${carpetaPublicaciones}/${id}.md`);

// Librerías por CDN, con versión exacta fijada.
//
// Todas se cargan SOLO en el visor (import dinámico en el navegador), así que no
// afectan al resto del sitio. Para actualizar una versión se cambia acá y listo.
export const cdnMarked = 'https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.esm.js';
export const cdnDomPurify = 'https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs';

/** Diagramas (flowchart, gantt, secuencia…) escritos en bloques ```mermaid */
export const cdnMermaid = 'https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.esm.min.mjs';

/** Fórmulas matemáticas: $...$ en línea y $$...$$ en bloque. */
export const cdnKatex = 'https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.mjs';
/** Hoja de estilos de KaTeX (se inyecta en el visor). */
export const cdnKatexCss = 'https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css';
