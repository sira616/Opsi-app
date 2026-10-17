/**
 * Cambia el plan de una cuenta en la base de datos LOCAL, para probar Opsi Premium ⭐.
 *
 *     npm run dev:plan -- <usuario> <basic|premium>
 *     npm run dev:plan -- syreta premium
 *
 * El plan es del servidor: ningún permiso de columna deja a la app escribirlo (ver
 * 20261017100000_listas_y_premium.sql), y por eso hay que hacerlo con acceso a la base
 * de datos. Esto es ese acceso, en la de desarrollo. Cuando haya pago, lo escribirá la
 * función que reciba el aviso del proveedor, y este script dejará de hacer falta.
 *
 * Solo habla con el contenedor local de Supabase (`supabase_db_opsi`, o el que diga
 * `OPSI_DB_CONTAINER`): no tiene forma de apuntar a otra base. El usuario y el plan
 * viajan como variables de psql (`:'u'`), no pegados en el SQL.
 */

import { spawnSync } from 'node:child_process';

const CONTENEDOR = process.env.OPSI_DB_CONTAINER ?? 'supabase_db_opsi';
const [usuario, plan] = process.argv.slice(2);

if (!usuario || !['basic', 'premium'].includes(plan ?? '') || !/^[A-Za-z0-9._-]{1,40}$/.test(usuario)) {
  console.error('Uso: npm run dev:plan -- <usuario> <basic|premium>');
  process.exit(2);
}

const sql = `
update public.user_settings
   set plan = :'p'
 where username = :'u'
returning username || ' → ' || plan as resultado;
`;

const r = spawnSync(
  'docker',
  ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A',
   '-v', 'ON_ERROR_STOP=1', '-v', `u=${usuario}`, '-v', `p=${plan}`],
  { input: sql, encoding: 'utf8' },
);

if (r.status !== 0) {
  console.error(r.stderr?.trim() || '¿Está Docker abierto y Supabase levantado?  npm run db:start');
  process.exit(1);
}

const salida = r.stdout.trim();
if (!salida) {
  console.error(`No hay ningún usuario «${usuario}» en la base de datos local.`);
  process.exit(1);
}
console.log(salida);
