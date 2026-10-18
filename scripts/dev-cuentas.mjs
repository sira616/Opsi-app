/**
 * Las contraseñas de las cuentas de desarrollo (`syreta`, `compi`), de ESTE ordenador.
 *
 *     npm run dev:cuentas
 *
 * No hay ninguna contraseña en el repositorio. Esto las genera al azar la primera vez,
 * las guarda en `.dev-cuentas.local` (que git ignora) y las escribe en la base de datos
 * LOCAL, y cada vez que se ejecuta vuelve a aplicar las guardadas: el seed deja las
 * cuentas con una contraseña aleatoria que nadie sabe, así que tras un `db:reset` hay
 * que volver a ejecutarlo (`npm run up` ya lo hace).
 *
 * Imprime las contraseñas en TU terminal, que es donde tiene que verlas quien las usa.
 *
 * Solo habla con el contenedor local de Supabase (`supabase_db_opsi`, o el que diga
 * `OPSI_DB_CONTAINER`): no puede apuntar a otra base. Las contraseñas viajan como
 * variables de psql, no pegadas en el SQL.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FICHERO = join(RAIZ, '.dev-cuentas.local');
const CONTENEDOR = process.env.OPSI_DB_CONTAINER ?? 'supabase_db_opsi';
const USUARIOS = ['syreta', 'compi'];

/** Las guardadas, o unas nuevas al azar para las que falten. */
function leerOCrear() {
  let guardadas = {};
  if (existsSync(FICHERO)) {
    try {
      guardadas = JSON.parse(readFileSync(FICHERO, 'utf8'));
    } catch {
      guardadas = {};
    }
  }
  let nuevas = false;
  for (const usuario of USUARIOS) {
    // 18 bytes al azar, en base64 de URL: 24 caracteres sin signos que estorben al teclear.
    if (typeof guardadas[usuario] !== 'string' || guardadas[usuario].length < 16) {
      guardadas[usuario] = randomBytes(18).toString('base64url');
      nuevas = true;
    }
  }
  if (nuevas || !existsSync(FICHERO)) {
    writeFileSync(FICHERO, `${JSON.stringify(guardadas, null, 2)}\n`, { mode: 0o600 });
  }
  return guardadas;
}

/** Escribe la contraseña de una cuenta en la base local. Devuelve si había tal cuenta. */
function aplicar(usuario, contrasena) {
  const sql = `
update auth.users
   set encrypted_password = extensions.crypt(:'p', extensions.gen_salt('bf'))
 where email like :'u' || '@%'
returning 1;
`;
  const r = spawnSync(
    'docker',
    ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A',
     '-v', 'ON_ERROR_STOP=1', '-v', `u=${usuario}`, '-v', `p=${contrasena}`],
    { input: sql, encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(r.stderr?.trim() || '¿Está Docker abierto y Supabase levantado?  npm run db:start');
  }
  return r.stdout.trim() !== '';
}

/**
 * Para `up.mjs`: asegura las contraseñas y las aplica. Nunca lanza: si no se puede,
 * devuelve el motivo y quien llama lo cuenta sin romper el arranque.
 */
export function asegurarCuentas() {
  try {
    const contrasenas = leerOCrear();
    const aplicadas = USUARIOS.filter((u) => aplicar(u, contrasenas[u]));
    return { ok: true, contrasenas, aplicadas };
  } catch (error) {
    return { ok: false, motivo: error instanceof Error ? error.message : String(error) };
  }
}

// Como comando: `npm run dev:cuentas`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = asegurarCuentas();
  if (!r.ok) {
    console.error(r.motivo);
    process.exit(1);
  }
  console.log('Cuentas de desarrollo (solo esta máquina; no se guardan en el repositorio):\n');
  for (const usuario of USUARIOS) {
    const hay = r.aplicadas.includes(usuario);
    console.log(`  ${usuario.padEnd(8)} ${r.contrasenas[usuario]}${hay ? '' : '   (la cuenta no existe en la base local)'}`);
  }
  console.log('\nGuardadas en .dev-cuentas.local (git lo ignora).');
}
