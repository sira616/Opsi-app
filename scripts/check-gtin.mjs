/**
 * Comprueba que las dos copias de `gtin.ts` son idénticas.
 *
 *     npm run check:gtin
 *
 * El código de barras se valida en dos sitios y tiene que dar la misma respuesta
 * en los dos: la Edge Function `lookup-barcode` (que es quien manda) y la app (que
 * lo repite antes de gastar una consulta). Metro no sigue rutas fuera de `app/` y
 * Deno no entiende los alias de la app, y compartirlo con un enlace simbólico no
 * funciona en Windows, así que hay dos copias. Esto es lo que impide que se
 * separen sin que nadie se dé cuenta.
 *
 * Se compara sin tener en cuenta los finales de línea: en Windows git deja los
 * ficheros con CRLF en el árbol de trabajo y con LF en el repositorio.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPIAS = ['supabase/functions/_shared/gtin.ts', 'app/src/shared/lib/gtin.ts'];

const [a, b] = COPIAS.map((ruta) => readFileSync(join(ROOT, ruta), 'utf8').replace(/\r\n/g, '\n'));

if (a !== b) {
  console.error(`✗ ${COPIAS[0]} y ${COPIAS[1]} no son iguales.`);
  console.error('  Son la misma lógica en dos sitios: copia el cambio en el otro y vuelve a probar.');
  process.exit(1);
}

console.log(`✓ Las dos copias de gtin.ts son idénticas (${a.split('\n').length} líneas).`);
