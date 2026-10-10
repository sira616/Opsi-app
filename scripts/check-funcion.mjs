/**
 * Comprueba `lookup-barcode` corriendo de verdad, en el runtime de Edge Functions de
 * Supabase y con la base de datos real detrás.
 *
 *     npm run fn:check
 *
 * Necesita el Supabase local levantado (`npm run db:start`) y los seeds cargados
 * (`npm run db:reset`). Lo que NO hace es llamar a Open Food Facts: ningún caso de
 * aquí depende de la red ni de que `OFF_USER_AGENT` esté o no configurado, para que
 * dé lo mismo en un portátil, en la CI y en una avioneta.
 *
 * ── Qué cubre que los tests de `supabase/functions/_shared` no ─────────────
 *
 * Aquellos prueban la lógica con dependencias de mentira. Esto prueba lo que solo
 * se ve con todo conectado: que el gateway y la función se ponen de acuerdo con el
 * JWT (la `anon key` es un JWT válido y NO debe pasar), que las funciones de la
 * base de datos existen con la firma que la función espera, y que `service_role`
 * llega a leer el catálogo con los permisos reducidos que tiene.
 *
 * Crea su propia cuenta de prueba (`zzfuncion`) y la borra, con su nevera y sus
 * contadores, al empezar y al acabar. No toca las cuentas de desarrollo.
 */

import { spawn, spawnSync } from 'node:child_process';

const CONTENEDOR = process.env.OPSI_DB_CONTAINER ?? 'supabase_db_opsi';
const CORREO = 'zzfuncion@usuarios.opsi.local';
const CLAVE = 'una-clave-de-prueba-larga';

/** Está en los seeds de desarrollo (supabase/seed/01_products.sql). */
const CODIGO_DEL_CATALOGO = '8400000000017';
/** Un GTIN-13 válido que no está en ninguna parte: se anota como falta a mano. */
const CODIGO_FALTA = '8499990000145';

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const tenue = (s) => `\x1b[2m${s}\x1b[0m`;

let correctas = 0;
const fallos = [];

function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    correctas++;
    console.log(`  ${verde('✓')} ${nombre}`);
  } else {
    fallos.push(nombre);
    console.log(`  ${rojo('✗')} ${nombre}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

/** SQL como `postgres` dentro del contenedor de la base de datos. */
function psql(sql) {
  return new Promise((resolve) => {
    const hijo = spawn(
      'docker',
      ['exec', '-i', CONTENEDOR, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let salida = '';
    let error = '';
    hijo.stdout.on('data', (d) => (salida += d));
    hijo.stderr.on('data', (d) => (error += d));
    hijo.on('error', (e) => resolve({ codigo: -1, salida, error: String(e) }));
    hijo.on('close', (codigo) => resolve({ codigo, salida: salida.trim(), error: error.trim() }));
    hijo.stdin.end(sql);
  });
}

function estadoDeSupabase() {
  // `npx` en Windows es un .cmd: hace falta shell para encontrarlo.
  const r = spawnSync('npx supabase status -o json', { encoding: 'utf8', shell: true });
  const texto = r.stdout ?? '';
  const inicio = texto.indexOf('{');
  if (r.status !== 0 || inicio < 0) return null;
  try {
    return JSON.parse(texto.slice(inicio));
  } catch {
    return null;
  }
}

async function limpiar() {
  await psql(`
    delete from public.lookup_usage where clave like 'u:%' and clave in (
      select 'u:' || id::text || ':' || s from auth.users, unnest(array['m','d']) as t(s) where email = '${CORREO}');
    delete from public.barcode_misses where barcode = '${CODIGO_FALTA}';
    delete from public.households
     where id in (select household_id from public.household_members m join auth.users u on u.id = m.user_id where u.email = '${CORREO}');
    delete from auth.users where email = '${CORREO}';
  `);
}

// ── Arranque ─────────────────────────────────────────────────────────────────
const estado = estadoDeSupabase();
if (!estado?.API_URL || !estado.ANON_KEY || !estado.FUNCTIONS_URL) {
  console.error(rojo('\nNo llego al Supabase local.'));
  console.error(tenue('  ¿Está Docker abierto y Supabase levantado?  npm run db:start'));
  process.exit(2);
}
const { API_URL, ANON_KEY, FUNCTIONS_URL } = estado;
const URL_FUNCION = `${FUNCTIONS_URL}/lookup-barcode`;

async function llamar({ token = null, metodo = 'POST', cuerpo = undefined, cabeceras = {} } = {}) {
  const headers = { 'content-type': 'application/json', ...cabeceras };
  if (token) headers.authorization = `Bearer ${token}`;
  const respuesta = await fetch(URL_FUNCION, {
    method: metodo,
    headers,
    body: metodo === 'POST' ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined,
  });
  let json = null;
  try {
    json = await respuesta.json();
  } catch {
    /* sin cuerpo JSON */
  }
  return { estado: respuesta.status, json, cabeceras: respuesta.headers };
}

console.log(`\nlookup-barcode en el runtime real ${tenue(`(${URL_FUNCION})`)}\n`);

try {
  await limpiar();

  // La cuenta de prueba, creada como lo haría la app: por el alta de GoTrue.
  const alta = await fetch(`${API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: CORREO, password: CLAVE }),
  });
  const sesion = await alta.json();
  const token = sesion.access_token;
  if (!token) {
    throw new Error(`No he podido crear la cuenta de prueba (${alta.status}): ${JSON.stringify(sesion).slice(0, 200)}`);
  }

  // ── Quién puede llamar ──────────────────────────────────────────────────
  console.log('  Quién puede llamar');
  const sinToken = await llamar({});
  comprobar('sin cabecera Authorization: 401', sinToken.estado === 401, `estado ${sinToken.estado}`);

  const conAnon = await llamar({ token: ANON_KEY, cuerpo: { barcode: CODIGO_DEL_CATALOGO } });
  comprobar(
    'con la clave anónima (un JWT válido, pero no es una persona): 401 de la función',
    conAnon.estado === 401 && conAnon.json?.code === 'sin_sesion',
    `estado ${conAnon.estado} ${JSON.stringify(conAnon.json)}`,
  );

  const manipulado = await llamar({ token: `${token.slice(0, -4)}AAAA`, cuerpo: { barcode: CODIGO_DEL_CATALOGO } });
  comprobar('con un token manipulado: 401', manipulado.estado === 401, `estado ${manipulado.estado}`);

  const preflight = await fetch(URL_FUNCION, { method: 'OPTIONS', headers: { origin: 'http://localhost:8081' } });
  comprobar('el preflight CORS contesta sin pedir sesión', preflight.status === 204, `estado ${preflight.status}`);

  // ── Qué se acepta ───────────────────────────────────────────────────────
  console.log('\n  Qué se acepta');
  const malos = ['', '123', '8400000000018', '84000000000a7', '../../etc/passwd', 'https://evil.example/x'];
  for (const barcode of malos) {
    const r = await llamar({ token, cuerpo: { barcode } });
    comprobar(
      `el código ${JSON.stringify(barcode)} se rechaza con 400`,
      r.estado === 400 && r.json?.code === 'codigo_invalido',
      `estado ${r.estado} ${JSON.stringify(r.json)}`,
    );
  }
  const rotoJson = await llamar({ token, cuerpo: '{no es json' });
  comprobar('un cuerpo que no es JSON: 400', rotoJson.estado === 400, `estado ${rotoJson.estado}`);
  const grande = await llamar({ token, cuerpo: { barcode: CODIGO_DEL_CATALOGO, relleno: 'x'.repeat(2000) } });
  comprobar('un cuerpo de más de 1 KB: 413', grande.estado === 413, `estado ${grande.estado}`);
  const get = await llamar({ token, metodo: 'GET' });
  comprobar('un GET: 405', get.estado === 405, `estado ${get.estado}`);

  // ── Lo que contesta ─────────────────────────────────────────────────────
  console.log('\n  Lo que contesta');
  const enCatalogo = await llamar({ token, cuerpo: { barcode: CODIGO_DEL_CATALOGO } });
  comprobar(
    'un producto del catálogo se sirve de la caché, con sus campos públicos',
    enCatalogo.estado === 200 &&
      enCatalogo.json?.found === true &&
      enCatalogo.json.product?.barcode === CODIGO_DEL_CATALOGO &&
      enCatalogo.json.product?.source === 'openfoodfacts' &&
      typeof enCatalogo.json.product?.id === 'string',
    `estado ${enCatalogo.estado} ${JSON.stringify(enCatalogo.json)}`,
  );
  comprobar(
    'y no se cuela nada más: ni payload ni fechas internas',
    enCatalogo.json?.product &&
      !('off_payload' in enCatalogo.json.product) &&
      !('updated_at' in enCatalogo.json.product) &&
      !('household_id' in enCatalogo.json.product),
    JSON.stringify(Object.keys(enCatalogo.json?.product ?? {})),
  );

  await psql(`insert into public.barcode_misses (barcode) values ('${CODIGO_FALTA}') on conflict (barcode) do update set missed_at = now();`);
  const falta = await llamar({ token, cuerpo: { barcode: CODIGO_FALTA } });
  comprobar(
    'un código anotado como falta contesta found:false sin llamar a nadie',
    falta.estado === 200 && falta.json?.found === false && falta.json?.barcode === CODIGO_FALTA,
    `estado ${falta.estado} ${JSON.stringify(falta.json)}`,
  );

  // ── El límite ───────────────────────────────────────────────────────────
  console.log('\n  El límite por persona (30 por minuto)');
  // Las llamadas de arriba que pasaron la validación ya han gastado cupo. Se sigue
  // hasta que salte el 429 y se mira que salta antes de pasar de 31 consultas.
  let primera429 = null;
  let llamadasHasta429 = 0;
  for (let i = 0; i < 40 && primera429 === null; i++) {
    const r = await llamar({ token, cuerpo: { barcode: CODIGO_DEL_CATALOGO } });
    llamadasHasta429++;
    if (r.estado === 429) primera429 = r;
  }
  comprobar('salta un 429', primera429 !== null, `tras ${llamadasHasta429} llamadas más`);
  comprobar(
    'con Retry-After y un mensaje que se entiende',
    primera429 !== null &&
      Number(primera429.cabeceras.get('retry-after')) >= 1 &&
      primera429.json?.code === 'demasiadas_consultas',
    JSON.stringify(primera429?.json),
  );
  const otraPersonaOk = await psql(`select count(*) from public.lookup_usage where clave like 'u:%:m' and n > 30;`);
  comprobar('el contador del minuto quedó por encima de 30 en la base de datos', Number(otraPersonaOk.salida) >= 1);
} catch (error) {
  fallos.push('la comprobación terminó con un error');
  console.error(rojo(`\n${error.message}`));
} finally {
  await limpiar();
}

console.log(
  fallos.length === 0
    ? `\n${verde(`${correctas} comprobaciones, todas correctas.`)}`
    : `\n${rojo(`${fallos.length} fallo(s) de ${correctas + fallos.length}:`)}\n${fallos.map((f) => `  · ${f}`).join('\n')}`,
);
process.exit(fallos.length === 0 ? 0 : 1);
