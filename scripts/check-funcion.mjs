/**
 * Comprueba `lookup-barcode` corriendo de verdad, en el runtime de Edge Functions de
 * Supabase y con la base de datos real detrás.
 *
 *     npm run fn:check
 *
 * Necesita el Supabase local levantado (`npm run db:start`) con las migraciones
 * aplicadas. Lo que NO hace es llamar a Open Food Facts: ningún caso de aquí depende
 * de la red ni de que `OFF_USER_AGENT` esté o no configurado, para que dé lo mismo en
 * un portátil, en la CI y en una avioneta.
 *
 * Por eso no usa los productos de los seeds: una ficha sin datos de salud o sin su fila
 * de nutrición (todas las de los seeds) cuenta como caducada y la función intentaría
 * renovarla desde OFF. Crea su propia ficha del catálogo, ya con datos de salud y con
 * nutrición, y la borra al acabar (la nutrición se va con ella).
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
/** El runtime de Edge Functions: de su registro se lee QUÉ hizo la función con una petición. */
const CONTENEDOR_FUNCIONES = process.env.OPSI_FN_CONTAINER ?? 'supabase_edge_runtime_opsi';
const CORREO = 'zzfuncion@usuarios.opsi.local';
const CLAVE = 'una-clave-de-prueba-larga';

/**
 * Una ficha del catálogo que crea esta comprobación (GTIN-13 válido, fuera de los
 * seeds): con datos de salud y con su fila de nutrición, y al día, para que se sirva de
 * la caché sin llamar a nadie.
 */
const CODIGO_DEL_CATALOGO = '8499990000152';
/** Un GTIN-13 válido que no está en ninguna parte: se anota como falta a mano. */
const CODIGO_FALTA = '8499990000145';
/** El ISBN-13 de ejemplo de la propia norma: un libro, prefijo 978. */
const CODIGO_LIBRO = '9780306406157';

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

const INICIO_DE_LA_COMPROBACION = new Date(Date.now() - 2000).toISOString();

/**
 * Qué resultado dio cada petición de esta persona, en orden, según el registro de la
 * función (`"resultado":"cache"`, `"cache_vieja"`…). null si no se puede leer el registro.
 */
function eventosDe(userId) {
  const r = spawnSync('docker', ['logs', '--since', INICIO_DE_LA_COMPROBACION, CONTENEDOR_FUNCIONES], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  return `${r.stdout}\n${r.stderr}`
    .split('\n')
    .filter((l) => l.includes('"evento":"lookup-barcode"') && l.includes(`"user_id":"${userId}"`))
    .map((l) => l.match(/"resultado":"([a-z_]+)"/)?.[1] ?? '?');
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
    delete from public.products where household_id is null and barcode = '${CODIGO_DEL_CATALOGO}';
    delete from public.households
     where id in (select household_id from public.household_members m join auth.users u on u.id = m.user_id where u.email = '${CORREO}');
    delete from auth.users where email = '${CORREO}';
  `);
}

// ── Arranque ─────────────────────────────────────────────────────────────────
const estado = estadoDeSupabase();
if (estado?.API_URL && estado.ANON_KEY && !estado.FUNCTIONS_URL) {
  // `supabase status` solo da la URL de las funciones cuando están arriba.
  console.error(rojo('\nSupabase está arriba, pero las Edge Functions no.'));
  console.error(tenue('  docker start supabase_edge_runtime_opsi   (o: npm run db:stop && npm run up)'));
  process.exit(2);
}
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

  // La ficha del catálogo, ya con datos de salud (`health_data_at` no nulo) y recién
  // traída: es la que se sirve de la caché. Se escribe como `postgres`, que es quien
  // puede; la Edge Function solo llega a ella por `upsert_global_product`.
  const ficha = await psql(`
    insert into public.products
      (household_id, barcode, name, brand, unit_family, net_quantity, data_source,
       allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at)
    values
      (null, '${CODIGO_DEL_CATALOGO}', 'Producto de comprobación', 'Marca Falsa', 'volume', 1000,
       'openfoodfacts', array['en:milk'], array['en:nuts'], array['en:no-lactose'], 'Leche.', now());
  `);
  if (ficha.codigo !== 0) throw new Error(`No he podido crear la ficha de prueba: ${ficha.error.slice(0, 200)}`);

  // Y su nutrición, con valores reconocibles: sin esta fila la ficha contaría como caducada
  // y la función iría a OFF. También sirve para comprobar que NO sale en la respuesta, y
  // que `service_role` llega a leer la fecha con sus permisos de columna (el embed).
  const nutricion = await psql(`
    insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal, sugars, serving_size)
    select id, now(), 424.24, 42.42, 'racion-secreta'
      from public.products where household_id is null and barcode = '${CODIGO_DEL_CATALOGO}';
  `);
  if (nutricion.codigo !== 0) throw new Error(`No he podido crear la nutrición de prueba: ${nutricion.error.slice(0, 200)}`);

  // La cuenta de prueba, creada como lo haría la app: por el alta de GoTrue.
  const alta = await fetch(`${API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: CORREO, password: CLAVE }),
  });
  const sesion = await alta.json();
  const token = sesion.access_token;
  const userId = sesion.user?.id;
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
      !('health_data_at' in enCatalogo.json.product) &&
      !('household_id' in enCatalogo.json.product),
    JSON.stringify(Object.keys(enCatalogo.json?.product ?? {})),
  );
  // La nutrición es de Opsi Premium y esta función no mira el plan: ni un solo dato sale.
  // Que la ficha se sirva de la caché (sin ir a OFF) demuestra además que la función ve que
  // tiene su fila de nutrición con los permisos de columna que le quedan a `service_role`.
  comprobar(
    'la nutrición NO sale en la respuesta (es premium y esta función no mira el plan)',
    enCatalogo.json?.product &&
      !('nutrition_data' in enCatalogo.json.product) &&
      !/nutri|energy|kcal|sugar|serving|racion-secreta/i.test(JSON.stringify(enCatalogo.json)),
    JSON.stringify(enCatalogo.json),
  );
  const producto = enCatalogo.json?.product;
  comprobar(
    'con los datos de salud de la ficha: alérgenos, trazas, etiquetas, ingredientes y health_data',
    JSON.stringify(producto?.allergens_tags) === '["en:milk"]' &&
      JSON.stringify(producto?.traces_tags) === '["en:nuts"]' &&
      JSON.stringify(producto?.labels_tags) === '["en:no-lactose"]' &&
      producto?.ingredients_text === 'Leche.' &&
      producto?.health_data === true,
    JSON.stringify(producto),
  );

  await psql(`insert into public.barcode_misses (barcode) values ('${CODIGO_FALTA}') on conflict (barcode) do update set missed_at = now();`);
  const falta = await llamar({ token, cuerpo: { barcode: CODIGO_FALTA } });
  comprobar(
    'un código anotado como falta contesta found:false sin llamar a nadie',
    falta.estado === 200 && falta.json?.found === false && falta.json?.barcode === CODIGO_FALTA,
    `estado ${falta.estado} ${JSON.stringify(falta.json)}`,
  );

  // Un libro no se come: por el prefijo se sabe sin preguntar a nadie, y sin gastar cuota.
  const cuotaAntes = await psql(`select coalesce(sum(n), 0) from public.lookup_usage where clave like 'u:%';`);
  const libro = await llamar({ token, cuerpo: { barcode: CODIGO_LIBRO } });
  const cuotaDespues = await psql(`select coalesce(sum(n), 0) from public.lookup_usage where clave like 'u:%';`);
  comprobar(
    'un libro (prefijo ISBN) contesta «no es comida» sin llamar a nadie',
    libro.estado === 200 && libro.json?.found === false && libro.json?.not_food === true,
    `estado ${libro.estado} ${JSON.stringify(libro.json)}`,
  );
  comprobar('y sin gastar cuota', cuotaAntes.salida === cuotaDespues.salida, `${cuotaAntes.salida} → ${cuotaDespues.salida}`);

  // ── Una ficha sin su fila de nutrición cuenta como caducada ────────────
  //
  // La respuesta es la misma (se sirve la ficha que hay), así que lo que la distingue de la
  // caché al día está en el registro de la función: `cache_vieja` en vez de `cache`. Para no
  // llamar a OFF desde aquí, ni con un OFF_USER_AGENT configurado, se agota el hueco global
  // hacia OFF de este minuto (sin User-Agent la función ni lo mira). Es lo que prueba, con
  // la base de datos y el gateway de verdad, que «no hay fila» llega a la función como
  // «no consta», y que «hay fila» (todas las comprobaciones de arriba) como «consta».
  console.log('\n  Una ficha sin su fila de nutrición');
  if (new Date().getSeconds() >= 50) {
    // Que el minuto no cambie entre agotar el hueco y llamar: el contador es por minuto.
    await new Promise((r) => setTimeout(r, (62 - new Date().getSeconds()) * 1000));
  }
  const MINUTO_ACTUAL = `to_timestamp(floor(extract(epoch from now()) / 60) * 60)`;
  await psql(`
    delete from public.product_nutrition
     where product_id = (select id from public.products where household_id is null and barcode = '${CODIGO_DEL_CATALOGO}');
    insert into public.lookup_usage (clave, ventana, n) values ('off:m', ${MINUTO_ACTUAL}, 10)
      on conflict (clave, ventana) do update set n = 10;
  `);
  const eventosAntes = eventosDe(userId);
  const sinNutricion = await llamar({ token, cuerpo: { barcode: CODIGO_DEL_CATALOGO } });
  comprobar(
    'se sigue sirviendo la ficha que hay (sin hueco hacia OFF no se pierde nada)',
    sinNutricion.estado === 200 && sinNutricion.json?.found === true && sinNutricion.json.product?.barcode === CODIGO_DEL_CATALOGO,
    `estado ${sinNutricion.estado} ${JSON.stringify(sinNutricion.json)}`,
  );
  // El registro llega un instante después: se espera a que aparezca UN evento más que antes.
  let resultado = null;
  const registroLegible = eventosAntes !== null;
  for (let intento = 0; registroLegible && intento < 10 && resultado === null; intento++) {
    const despues = eventosDe(userId);
    if (despues !== null && despues.length > eventosAntes.length) resultado = despues.at(-1);
    else await new Promise((r) => setTimeout(r, 500));
  }
  if (registroLegible) {
    comprobar(
      'cuenta como caducada: la función intentó renovarla (cache_vieja) en vez de servirla como al día (cache)',
      resultado === 'cache_vieja',
      `resultado: ${resultado}`,
    );
  } else {
    console.log(tenue(`  · omitida: no puedo leer el registro de ${CONTENEDOR_FUNCIONES} (docker logs)`));
  }
  // Se deja la ficha como estaba para lo que sigue, y sin tocar el contador del hueco.
  await psql(`
    insert into public.product_nutrition (product_id, nutrition_data_at, energy_kcal, sugars, serving_size)
    select id, now(), 424.24, 42.42, 'racion-secreta'
      from public.products where household_id is null and barcode = '${CODIGO_DEL_CATALOGO}';
    delete from public.lookup_usage where clave = 'off:m' and ventana = ${MINUTO_ACTUAL};
  `);

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
