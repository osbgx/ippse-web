// Configuración del Visor Dinámico de documentos.

/**
 * Carpeta "raw" del repositorio público de documentos. Cada publicación se lee de `${base}/${id}.md`.
 * Se puede sobrescribir al compilar con la variable PUBLIC_DOCS_BASE_URL (p. ej. para pruebas).
 */
export const baseDocumentos: string =
  import.meta.env.PUBLIC_DOCS_BASE_URL ?? 'https://raw.githubusercontent.com/IPPSE/documentos/main';

/** Página del repositorio en GitHub (enlace "Ver fuente"). */
export const repoDocumentos = 'https://github.com/IPPSE/documentos/blob/main';

// Librerías por CDN, con versión exacta fijada.
export const cdnMarked = 'https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.esm.js';
export const cdnDomPurify = 'https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs';
