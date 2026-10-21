// Prensa y Novedades: el contenido vive en src/content/prensa/ (colección Markdown).
// Este módulo solo expone los datos ya tipados, ordenados y clasificados para las páginas.

import { getCollection, type CollectionEntry } from 'astro:content';

export type EntradaPrensa = CollectionEntry<'prensa'>;
export type Comunicado = Extract<EntradaPrensa['data'], { tipo: 'comunicado' }> & { id: string };
export type AparicionMedio = Extract<EntradaPrensa['data'], { tipo: 'aparicion' }> & { id: string };
export type Evento = Extract<EntradaPrensa['data'], { tipo: 'evento' }> & { id: string };

/** Ordena por fecha descendente (lo más reciente primero); el orden no depende del archivo. */
const porFechaDesc = (a: EntradaPrensa, b: EntradaPrensa) => b.data.fecha.localeCompare(a.data.fecha);

const conId = (e: EntradaPrensa) => ({ ...e.data, id: e.id });

/** Comunicados, del más reciente al más antiguo. */
export const getComunicados = async (): Promise<Comunicado[]> =>
  (await getCollection('prensa')).filter((e) => e.data.tipo === 'comunicado').sort(porFechaDesc).map(conId) as Comunicado[];

/** Apariciones en medios, de la más reciente a la más antigua. */
export const getApariciones = async (): Promise<AparicionMedio[]> =>
  (await getCollection('prensa')).filter((e) => e.data.tipo === 'aparicion').sort(porFechaDesc).map(conId) as AparicionMedio[];

/** Eventos divididos en próximos (hoy o después) y pasados, según la fecha actual. */
export const getEventos = async (): Promise<{ proximos: Evento[]; pasados: Evento[] }> => {
  const hoy = new Date().toISOString().slice(0, 10);
  const eventos = (await getCollection('prensa')).filter((e) => e.data.tipo === 'evento').sort(porFechaDesc).map(conId) as Evento[];
  // Próximos: del más cercano al más lejano (orden ascendente).
  const proximos = eventos.filter((e) => e.fecha >= hoy).reverse();
  const pasados = eventos.filter((e) => e.fecha < hoy);
  return { proximos, pasados };
};

const formatoDia = new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const formatoMes = new Intl.DateTimeFormat('es-PY', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "12 oct 2026" o, si la fecha es solo AAAA-MM, "oct 2026". */
export const fechaCorta = (iso: string) =>
  (iso.length === 7 ? formatoMes : formatoDia).format(new Date(iso.length === 7 ? `${iso}-01` : iso)).replace('.', '');
