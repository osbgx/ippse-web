// Índice de publicaciones. Cada `id` debe coincidir con el nombre del archivo
// en el repositorio de documentos: https://github.com/IPPSE/documentos/<id>.md

import { pdfInforme226 } from './documentos';
import { conBase } from '../lib/rutas';

export const categorias = {
  diagnostico: 'Diagnóstico',
  propuesta: 'Propuesta',
  opinion: 'Opinión',
} as const;

export type Categoria = keyof typeof categorias;

export interface Publicacion {
  id: string;
  titulo: string;
  /** Fecha ISO (AAAA-MM-DD). */
  fecha: string;
  categoria: Categoria;
  autor: string;
  extracto: string;
  /** Minutos de lectura estimados. */
  lectura: number;
  /** true si el .md ya está publicado en el repositorio; si no, la tarjeta no enlaza al visor. */
  disponible: boolean;
  /** Ruta del PDF oficial en el propio sitio, si ya fue cargado en public/documentos/. */
  pdf?: string;
}

const publicaciones: Publicacion[] = [
  {
    id: 'informe-2-26',
    disponible: true,
    lectura: 51,
    pdf: pdfInforme226.href,
    titulo: 'Informe Técnico Nº 2/26 — Requerimientos de generación eléctrica 2026–2035. Parte II: alternativas de nuevas fuentes',
    fecha: '2026-10-14',
    categoria: 'diagnostico',
    autor: 'Comité Ejecutivo',
    extracto:
      'Parte II del análisis del IPPSE sobre el riesgo de crisis energética 2026–2035: evalúa hidroeléctricas ' +
      'binacionales y de ríos interiores, solar con bancos de baterías, eólica, térmica, nuclear (SMR) e ' +
      'interconexiones con Brasil y Argentina, con plazos de habilitación de 3 a 15 años.',
  },
  {
    id: 'balance-oferta-demanda-sin-2026-2030',
    disponible: false,
    lectura: 32,
    titulo: 'Balance oferta-demanda del Sistema Interconectado Nacional 2026–2030',
    fecha: '2026-10-01',
    categoria: 'diagnostico',
    autor: 'Comité Técnico Asesor',
    extracto: 'Actualización del balance entre oferta y demanda de potencia y energía del SIN para el próximo quinquenio.',
  },
  {
    id: 'hacia-un-ministerio-de-energia',
    disponible: false,
    lectura: 24,
    titulo: 'Hacia un Ministerio de Energía: marco institucional para Paraguay',
    fecha: '2026-09-15',
    categoria: 'propuesta',
    autor: 'Ing. Ángel María Recalde',
    extracto: 'Propuesta de un marco institucional que concentre la rectoría de la política energética nacional.',
  },
  {
    id: 'diversificacion-matriz-solar-eolica',
    disponible: false,
    lectura: 12,
    titulo: 'Diversificación de la matriz: el rol de la solar y eólica complementaria',
    fecha: '2026-09-01',
    categoria: 'opinion',
    autor: 'Comité Técnico Asesor',
    extracto: 'Análisis del aporte de las fuentes solar y eólica como complemento de la base hidroeléctrica.',
  },
  {
    id: 'cuellos-de-botella-transmision-500kv',
    disponible: false,
    lectura: 28,
    titulo: 'Cuellos de botella en transmisión: análisis de la red de 500 kV',
    fecha: '2026-08-15',
    categoria: 'diagnostico',
    autor: 'Comité Técnico Asesor',
    extracto: 'Identificación de restricciones en la red troncal de 500 kV y su impacto en la confiabilidad del sistema.',
  },
  {
    id: 'fast-track-planes-maestros',
    disponible: false,
    lectura: 18,
    titulo: 'Fast track para Planes Maestros de Generación y Transmisión',
    fecha: '2026-08-01',
    categoria: 'propuesta',
    autor: 'Comisión Directiva',
    extracto: 'Mecanismos para agilizar la aprobación y ejecución de los Planes Maestros del sector eléctrico.',
  },
  {
    id: 'soberania-energetica-mas-alla-hidroelectricidad',
    disponible: false,
    lectura: 15,
    titulo: 'Soberanía energética: más allá de la hidroelectricidad',
    fecha: '2026-07-15',
    categoria: 'opinion',
    autor: 'Ing. Ángel María Recalde',
    extracto: 'Reflexión sobre los pilares de la soberanía energética paraguaya en un escenario de demanda creciente.',
  },
  {
    id: 'alerta-deficit-potencia-2028',
    disponible: false,
    lectura: 20,
    titulo: 'Alerta temprana: déficit de potencia firme proyectado para 2028',
    fecha: '2026-07-01',
    categoria: 'diagnostico',
    autor: 'Comité Técnico Asesor',
    extracto: 'Proyección del déficit de potencia firme y medidas necesarias para evitarlo.',
  },
  {
    id: 'biomasa-generacion-distribuida',
    disponible: false,
    lectura: 22,
    titulo: 'Biomasa y generación distribuida: oportunidades para el sector',
    fecha: '2026-06-15',
    categoria: 'propuesta',
    autor: 'Comité Técnico Asesor',
    extracto: 'Oportunidades de la biomasa y la generación distribuida para ampliar y descentralizar la oferta eléctrica.',
  },
];

/** Publicaciones ordenadas de la más reciente a la más antigua. */
export const publicacionesOrdenadas = [...publicaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));

export const urlVisor = (id: string) => conBase(`/visor/?doc=${encodeURIComponent(id)}`);

/** Enlaces a PDF: se abren en pestaña nueva para no sacar al usuario del sitio. */
export const atributosPdf = { target: '_blank', rel: 'noopener' } as const;

const formatoFecha = new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const fechaLegible = (iso: string) => formatoFecha.format(new Date(iso));
