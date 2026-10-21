// Documentos en PDF alojados en el propio sitio (public/documentos/).
// Cada archivo se copia al build, así que el enlace funciona sin pasos manuales.

import { conBase } from '../lib/rutas';
export interface DocumentoPdf {
  /** Ruta pública del archivo dentro del sitio. */
  href: string;
  titulo: string;
  /** Peso aproximado, en MB, para orientar al usuario antes de abrirlo. */
  peso: string;
}

/** Acta de Constitución del IPPSE. */
export const pdfConstitucion: DocumentoPdf = {
  href: conBase('/documentos/constitucion-ippse.pdf'),
  titulo: 'Constitución del IPPSE — Acta fundacional',
  peso: '5,9 MB',
};

/** Informe Técnico Nº 2/26 (Parte II). */
export const pdfInforme226: DocumentoPdf = {
  href: conBase('/documentos/informe-2-26.pdf'),
  titulo: 'Informe Técnico Nº 2/26 — Parte II',
  peso: '690 KB',
};
