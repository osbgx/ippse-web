import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { basePrensa, patronPrensa } from './data/fuentePrensa';

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

export const collections = { institucional, prensa };
