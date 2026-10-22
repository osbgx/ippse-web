import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { basePrensa, patronPrensa } from './data/fuentePrensa';
import { publicacionesRemotas } from './lib/cargador-publicaciones';

// Documentos institucionales (Constitución, Estatutos, Código de Ética, etc.)
const institucional = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/institucional' }),
});

// Prensa y Novedades: comunicados, apariciones en medios y eventos.
// Un solo directorio; el campo `tipo` distingue la clase de entrada.
// La ubicación de la carpeta se define en `src/data/fuentePrensa.ts`.
const prensa = defineCollection({
  loader: glob({ pattern: patronPrensa, base: basePrensa }),
  schema: z
    .object({
      tipo: z.enum(['comunicado', 'aparicion', 'evento']),
      /** Fecha ISO: AAAA-MM-DD, o AAAA-MM cuando no hay día exacto. Acepta fechas sin comillas de YAML. */
      fecha: z.coerce.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Usar AAAA-MM-DD o AAAA-MM'),
      titulo: z.string(),
    })
    .and(
      z.discriminatedUnion('tipo', [
        z.object({ tipo: z.literal('comunicado'), extracto: z.string() }),
        z.object({ tipo: z.literal('aparicion'), medio: z.string(), url: z.string().url().optional() }),
        z.object({ tipo: z.literal('evento'), tipoEvento: z.string(), lugar: z.string() }),
      ]),
    ),
});

// Informes y Publicaciones: el contenido vive en el repositorio externo de
// documentos (ver src/data/fuenteDocumentos.ts). El loader lo descarga en build.
// El esquema refleja esquema/publicacion.schema.json del repositorio.
const publicaciones = defineCollection({
  loader: publicacionesRemotas,
  schema: z.object({
    titulo: z.string().min(3),
    /** Fecha ISO (AAAA-MM-DD o AAAA-MM); se acepta sin comillas en el YAML. */
    fecha: z.coerce.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Usar AAAA-MM-DD o AAAA-MM'),
    categoria: z.enum(['diagnostico', 'propuesta', 'opinion']),
    autor: z.string().min(2),
    extracto: z.string().min(10).max(320),
    /** Minutos de lectura estimados (opcional). */
    lectura: z.number().int().positive().optional(),
    /** "proximamente" deja la tarjeta sin enlace al visor. */
    estado: z.enum(['publicado', 'proximamente']).default('publicado'),
    /** Ruta del PDF oficial en el propio sitio, si existe. */
    pdf: z.string().optional(),
    /** Imagen de portada, relativa a imagenes/<id>/. */
    portada: z.string().optional(),
    etiquetas: z.array(z.string()).default([]),
    /** true para resaltar la publicación en la portada. */
    destacado: z.boolean().default(false),
  }),
});

export const collections = { institucional, prensa, publicaciones };
