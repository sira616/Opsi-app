/**
 * Regenera los tipos de la base de datos para la app.
 *
 *     npm run types
 *
 * Antes era `supabase gen types … > app/src/lib/database.types.ts`, y ese `>`
 * es el problema: el shell vacía el fichero ANTES de que la CLI arranque, y
 * si la CLI falla (Docker parado, Postgres todavía levantándose) lo que queda
 * dentro es el mensaje de error. No es TypeScript, así que `tsc` reventaba en
 * toda la app con «';' expected» y la causa —un `types` fallido de hace dos
 * días— no tenía ninguna pinta de serlo.
 *
 * Aquí la CLI escribe a memoria, se comprueba que lo que devolvió parece de
 * verdad un fichero de tipos, y solo entonces se sustituye el destino. Si algo
 * falla, el fichero anterior se queda como estaba.
 *
 * Está en Node y no en un .sh por lo mismo que `up.mjs`: tiene que funcionar
 * igual en Windows.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(ROOT, 'app', 'src', 'lib', 'database.types.ts');
const BIN = join(ROOT, 'node_modules', '.bin');

// Lo mínimo que tiene cualquier salida válida de `gen types`. Si falta, lo que
// llegó no es un fichero de tipos aunque la CLI haya salido con código 0.
const MARCA = 'export type Database';

function fallar(mensaje, pista) {
  console.error(`\n\x1b[31mNo se han regenerado los tipos:\x1b[0m ${mensaje}`);
  if (pista) console.error(`\x1b[2m  ${pista}\x1b[0m`);
  console.error(`\x1b[2m  El fichero anterior sigue como estaba.\x1b[0m`);
  process.exit(1);
}

if (!existsSync(join(BIN, process.platform === 'win32' ? 'supabase.cmd' : 'supabase'))) {
  fallar('No encuentro la CLI de Supabase.', 'Ejecuta primero: npm install');
}

// Comando entero y sin argumentos aparte: con `shell: true`, Node avisa de que
// los argumentos no se escapan. Aquí son constantes, pero así no hay aviso.
const resultado = spawnSync('supabase gen types typescript --local', {
  cwd: ROOT,
  shell: true,
  encoding: 'utf8',
  env: { ...process.env, PATH: `${BIN}${delimiter}${process.env.PATH ?? ''}` },
  stdio: ['inherit', 'pipe', 'inherit'],
  // Un esquema grande produce más de los 1 MB por defecto.
  maxBuffer: 32 * 1024 * 1024,
});

if (resultado.status !== 0) {
  fallar(
    `la CLI de Supabase salió con código ${resultado.status ?? 'desconocido'}.`,
    '¿Está Docker abierto y Supabase levantado? Compruébalo con: npm run db:status',
  );
}

const salida = resultado.stdout ?? '';
if (!salida.includes(MARCA)) {
  fallar(
    'la CLI no devolvió un fichero de tipos.',
    `Empieza así: ${JSON.stringify(salida.slice(0, 120))}`,
  );
}

// Escribir al lado y renombrar: en el mismo volumen es atómico, así que un
// corte a medias no deja el destino a la mitad.
const temporal = `${DESTINO}.tmp`;
writeFileSync(temporal, salida, 'utf8');
renameSync(temporal, DESTINO);

console.log(`Tipos regenerados: ${salida.split('\n').length} líneas en app/src/lib/database.types.ts`);
