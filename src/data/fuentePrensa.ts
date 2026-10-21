// =============================================================================
// FUENTE DEL CONTENIDO DE PRENSA
// =============================================================================
// Este es el ÚNICO lugar donde se define de dónde salen los comunicados,
// las apariciones en medios y los eventos.
//
// Hoy apunta a la carpeta local `src/content/prensa/`, que contiene archivos
// .md de ejemplo para probar el listado, el scroll interno, el paginado y las
// páginas de detalle.
//
// >>> PARA PASAR A GITHUB <<<
// Cuando el contenido viva en un repositorio de GitHub, cambiá `basePrensa`
// según el método que uses (ver las 3 opciones abajo) y listo: nada más hay
// que tocar. El sitio seguirá generándose igual.
//
// Recordá que cada archivo .md debe respetar el frontmatter que valida
// `src/content.config.ts` (campos `tipo`, `fecha`, `titulo`, y los propios
// de cada tipo).
// =============================================================================

import { fileURLToPath } from 'node:url';

/** Opción A — Carpeta local (lo que se usa hoy). */
const CARPETA_LOCAL = new URL('../content/prensa/', import.meta.url);

/**
 * Ruta base desde la que se leen los .md de prensa.
 *
 * Opciones para cuando el contenido esté en GitHub:
 *
 *   A) Clonar el repo dentro del proyecto y apuntar a esa carpeta:
 *      const base = new URL('../content/prensa-repo/', import.meta.url);
 *
 *   B) Clonar el repo en cualquier parte del disco (ruta absoluta):
 *      const base = new URL('file:///C:/ruta/al/repo/contenido/prensa/');
 *
 *   C) Si preferís no clonar nada, se puede bajar el contenido por HTTP en
 *      tiempo de build (requiere un "loader" personalizado; ver nota al final).
 *
 * En todos los casos, apuntá a la CARPETA que contiene los .md.
 */
export const basePrensa: URL = CARPETA_LOCAL;

/** Patrón de archivos a leer dentro de la carpeta. */
export const patronPrensa = '**/*.md';

/**
 * NOTA sobre la opción C (contenido remoto por HTTP):
 * El loader `glob` de Astro lee del sistema de archivos, no de una URL HTTP.
 * Para traer el contenido directamente desde GitHub sin clonar, se reemplaza
 * `glob(...)` en `src/content.config.ts` por un loader propio que descargue
 * los archivos (por ejemplo desde la API de GitHub o un tarball del repo)
 * y los entregue a la colección. La ventaja de A o B es que el build es
 * reproducible y no depende de la red.
 */

/** Ayuda de diagnóstico: ruta real en disco de la carpeta configurada. */
export const rutaPrensaEnDisco = fileURLToPath(basePrensa);
