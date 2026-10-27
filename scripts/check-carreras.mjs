/**
 * Comprobación de carreras: dos personas actuando a la vez sobre lo mismo.
 *
 *     npm run db:carreras
 *
 * Necesita el Supabase local levantado (`npm run db:start`) y Docker, porque
 * abre DOS sesiones de `psql` contra el contenedor de la base de datos. Por eso
 * no está en pgTAP: pgTAP corre todo en una sola transacción, y una carrera
 * necesita dos que se solapen.
 *
 * ── Cómo fuerza el solape ─────────────────────────────────────────────────
 *
 * La sesión 1 hace la acción y se queda con la transacción abierta unos
 * segundos (`pg_sleep`), con el cerrojo de la fila cogido. La sesión 2 arranca
 * a continuación e intenta lo suyo sobre el MISMO elemento. Lo que se comprueba
 * no son tiempos sino el RESULTADO: quién gana, qué error recibe quien pierde,
 * y que el historial no se contradiga.
 *
 * ── Lo que hay que saber de lo que prueba ─────────────────────────────────
 *
 * Sin el `for update` de `require_item`, la sesión 2 lee el elemento «abierto»
 * (la sesión 1 aún no ha confirmado), pasa la comprobación y escribe cuando la
 * 1 suelta la fila. Resultado: el historial dice que se terminó y que se tiró.
 * Esta comprobación falla en ese caso, y por eso existe.
 *
 * Crea su propia cuenta de prueba (`zzcarrera`) y la borra, con su nevera, al
 * empezar y al acabar: no toca las cuentas de desarrollo.
 */

import { spawn } from 'node:child_process';

const CONTENEDOR = process.env.OPSI_DB_CONTAINER ?? 'supabase_db_opsi';
const USUARIO = 'cafe0000-0000-4000-8000-0000000000c1';
const CORREO = 'zzcarrera@usuarios.opsi.local';
const CLAIMS = JSON.stringify({ sub: USUARIO, role: 'authenticated' });

/** Segundos que la sesión 1 mantiene el cerrojo; más que el arranque de la 2. */
const RETENCION = 5;
/** Pausa antes de lanzar la sesión 2: que la 1 ya haya tomado el cerrojo. */
const ESPERA_SEGUNDA_MS = 1500;

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

/** Ejecuta SQL en una sesión nueva de psql y devuelve lo que salió. */
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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Una acción como la persona de prueba, con el cerrojo retenido unos segundos. */
function comoPersona(accion, retener) {
  return `
    begin;
    set local role authenticated;
    set local request.jwt.claims = '${CLAIMS}';
    ${accion}
    ${retener ? `select pg_sleep(${RETENCION});` : ''}
    commit;
  `;
}

/** Lanza dos sesiones solapadas y devuelve lo que contestó cada una. */
async function carrera(accionPrimera, accionSegunda) {
  const primera = psql(comoPersona(accionPrimera, true));
  await dormir(ESPERA_SEGUNDA_MS);
  const segunda = psql(comoPersona(accionSegunda, false));
  return { primera: await primera, segunda: await segunda };
}

async function limpiar() {
  await psql(`
    delete from public.households
     where id in (select household_id from public.household_members where user_id = '${USUARIO}');
    delete from auth.users where id = '${USUARIO}';
    delete from public.lookup_usage where clave like 'u:${USUARIO}:%';
  `);
}

async function preparar() {
  await limpiar();
  // El trigger de alta crea la nevera privada, la pertenencia y los ajustes.
  const r = await psql(`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', '${USUARIO}', 'authenticated', 'authenticated',
      '${CORREO}', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    );
    select m.household_id from public.household_members m where m.user_id = '${USUARIO}';
  `);
  if (r.codigo !== 0 || !r.salida) {
    throw new Error(`No he podido crear la cuenta de prueba: ${r.error || 'sin respuesta'}`);
  }
  return r.salida.split('\n').pop().trim();
}

async function elemento(nevera, nombre, familia, unidad, cantidad) {
  const r = await psql(`
    insert into public.inventory_items
      (household_id, name, category, unit_family, display_unit, initial_quantity, remaining_quantity, created_by)
    values ('${nevera}', '${nombre}', 'otros', '${familia}', '${unidad}', ${cantidad}, ${cantidad}, '${USUARIO}')
    returning id;
  `);
  return r.salida.split('\n')[0].trim();
}

async function estado(id) {
  const r = await psql(`
    select state || '|' || remaining_quantity from public.inventory_items where id = '${id}';
  `);
  const [state, restante] = r.salida.split('|');
  return { state, restante: Number(restante) };
}

async function eventos(id, tipos) {
  const r = await psql(`
    select count(*) from public.inventory_events
     where item_id = '${id}' and type::text in (${tipos.map((t) => `'${t}'`).join(',')});
  `);
  return Number(r.salida);
}

// ── Arranque ─────────────────────────────────────────────────────────────────
const sonda = await psql('select 1');
if (sonda.codigo !== 0) {
  console.error(rojo('\nNo llego a la base de datos.'));
  console.error(tenue(`  Contenedor: ${CONTENEDOR}. ¿Está Docker abierto y Supabase levantado? (npm run db:start)`));
  console.error(tenue(`  ${sonda.error.split('\n')[0]}`));
  process.exit(2);
}

console.log(`\nCarreras entre dos personas ${tenue(`(cada escenario tarda unos ${RETENCION + 2} s)`)}\n`);

try {
  const nevera = await preparar();

  // ── A · Una termina y otra tira, a la vez ──────────────────────────────────
  console.log('  Una persona termina un elemento mientras otra lo tira');
  const a = await elemento(nevera, 'carrera-terminar-o-tirar', 'count', 'unit', 1);
  const resA = await carrera(
    `select 'ok ' || (public.finish_item('${a}')).state;`,
    `select 'ok ' || (public.discard_item('${a}', 'carrera')).state;`,
  );
  comprobar('la primera lo termina', resA.primera.codigo === 0 && /ok finished/.test(resA.primera.salida), resA.primera.error);
  comprobar(
    'la segunda no puede tirarlo: ya está cerrado',
    resA.segunda.codigo !== 0 && /ya está cerrado/.test(resA.segunda.error),
    `respuesta: ${resA.segunda.error || resA.segunda.salida || '(nada)'}`,
  );
  const estadoA = await estado(a);
  comprobar('el elemento queda terminado, no tirado', estadoA.state === 'finished', `estado: ${estadoA.state}`);
  const cierres = await eventos(a, ['finished', 'discarded']);
  comprobar('el historial no se contradice: un solo cierre', cierres === 1, `eventos de cierre: ${cierres}`);

  // ── B · Dos personas gastan más de lo que queda ───────────────────────────
  console.log('\n  Dos personas usan 600 g de un envase de 1000 g');
  const b = await elemento(nevera, 'carrera-usar-dos-veces', 'mass', 'g', 1000);
  const resB = await carrera(
    `select 'ok ' || (public.use_quantity('${b}', 600)).remaining_quantity;`,
    `select 'ok ' || (public.use_quantity('${b}', 600)).remaining_quantity;`,
  );
  comprobar('la primera gasta 600 y quedan 400', resB.primera.codigo === 0 && /ok 400/.test(resB.primera.salida), resB.primera.error);
  comprobar(
    'la segunda recibe «solo quedan 400», no un error de restricción',
    resB.segunda.codigo !== 0 && /solo quedan 400/.test(resB.segunda.error),
    `respuesta: ${resB.segunda.error || resB.segunda.salida || '(nada)'}`,
  );
  const estadoB = await estado(b);
  comprobar('quedan 400, no −200', estadoB.restante === 400, `quedan: ${estadoB.restante}`);
  const usos = await eventos(b, ['quantity_used']);
  comprobar('un solo uso en el historial', usos === 1, `usos registrados: ${usos}`);

  // ── D · Dos personas marcan como comprada la MISMA línea de la lista ───────
  // Sin el `for update` de `stock_from_list`, las dos leerían la línea «sin
  // comprar», las dos darían de alta el elemento y el inventario tendría el zumo
  // por duplicado.
  console.log('\n  Dos personas marcan como comprada la misma línea de la lista');
  // Las neveras no traen lista: se cuelga la línea de una compartida creada para la prueba.
  const listaR = await psql(`
    insert into public.shopping_lists (household_id, name, kind)
    values ('${nevera}', 'carrera-lista', 'shared')
    returning id;
  `);
  const lista = listaR.salida.split('\n')[0].trim();
  const lineaR = await psql(`
    insert into public.shopping_list_items (household_id, list_id, name, unit_family, display_unit, quantity)
    values ('${nevera}', '${lista}', 'carrera-lista', 'volume', 'l', 1000)
    returning id;
  `);
  const linea = lineaR.salida.split('\n')[0].trim();
  const altaLinea = `select 'ok ' || (public.stock_from_list('${linea}', 'carrera-zumo', 'volume', 'l', 1000)).id;`;
  const resD = await carrera(altaLinea, altaLinea);
  comprobar('la primera da de alta el elemento', resD.primera.codigo === 0 && /^ok /.test(resD.primera.salida), resD.primera.error);
  comprobar(
    'la segunda recibe «ya está marcado como comprado», no un duplicado',
    resD.segunda.codigo !== 0 && /ya est[aá] marcado como comprado/.test(resD.segunda.error),
    `respuesta: ${resD.segunda.error || resD.segunda.salida || '(nada)'}`,
  );
  const duplicados = await psql(`select count(*) from public.inventory_items where name = 'carrera-zumo';`);
  comprobar('un solo elemento en el inventario', Number(duplicados.salida) === 1, `elementos: ${duplicados.salida}`);

  // ── F · Dos altas de una lista compartida a la vez, con el tope del plan básico en 1 ──
  // Sin el candado por persona de `check_shopping_list`, las dos contarían «0 compartidas», las dos
  // pasarían el tope y la cuenta acabaría con dos (un doble toque en «Crear lista»).
  console.log('\n  Dos altas a la vez de una lista compartida (el plan básico llega a una)');
  await psql(`delete from public.shopping_lists where name like 'carrera-tope-%';`);
  const alta = (n) =>
    `insert into public.shopping_lists (household_id, name, kind) values ('${nevera}', 'carrera-tope-${n}', 'shared');`;
  const resF = await carrera(alta(1), alta(2));
  comprobar('la primera entra', resF.primera.codigo === 0, resF.primera.error);
  comprobar(
    'la segunda recibe el aviso del tope, no se cuela',
    resF.segunda.codigo !== 0 && /plan básico puedes tener 1 lista compartida/.test(resF.segunda.error),
    `respuesta: ${resF.segunda.error || resF.segunda.salida || '(nada)'}`,
  );
  const listasTope = await psql(`select count(*) from public.shopping_lists where name like 'carrera-tope-%';`);
  comprobar('queda una sola lista', Number(listasTope.salida) === 1, `listas: ${listasTope.salida}`);

  // ── C · La cuota del escáner, gastada desde dos sesiones a la vez ─────────
  // Treinta consultas por minuto. Si el contador se leyera y luego se escribiera,
  // dos consultas simultáneas verían el mismo número y se colarían las dos; con
  // el `insert … on conflict do update` la segunda espera a la primera.
  console.log('\n  Dos sesiones gastan a la vez la cuota del minuto (30): 20 consultas cada una');
  await psql(`delete from public.lookup_usage where clave like 'u:${USUARIO}:%';`);
  // Las dos tienen que caer en el MISMO minuto: si el reloj está a punto de
  // cambiar, se espera a que cambie.
  const segundos = new Date().getSeconds();
  if (segundos >= 45) await dormir((62 - segundos) * 1000);

  const veinte =
    `select count(*) filter (where (t.q).permitido) || '/' || count(*) ` +
    `from (select public.consume_lookup_quota('${USUARIO}') as q from generate_series(1, 20)) as t;`;
  const comoFuncion = (retener) =>
    `begin; set local role service_role; ${veinte} ${retener ? `select pg_sleep(${RETENCION});` : ''} commit;`;

  const primeraC = psql(comoFuncion(true));
  await dormir(ESPERA_SEGUNDA_MS);
  const segundaC = psql(comoFuncion(false));
  const [resC1, resC2] = [await primeraC, await segundaC];

  const permitidas = (r) => Number((r.salida.split('\n')[0] ?? '').split('/')[0]);
  comprobar('la primera pasa sus 20', permitidas(resC1) === 20, `respuesta: ${resC1.error || resC1.salida}`);
  comprobar(
    'la segunda solo pasa 10: las otras 10 se pasan del cupo',
    permitidas(resC2) === 10,
    `respuesta: ${resC2.error || resC2.salida}`,
  );
  const contadas = await psql(
    `select coalesce(sum(n), 0) from public.lookup_usage where clave = 'u:${USUARIO}:m';`,
  );
  comprobar('el contador del minuto marca 40: ninguna consulta se perdió', Number(contadas.salida) === 40, `marca: ${contadas.salida}`);

  // ── E · La cuota del chat, gastada por la MISMA persona desde dos sesiones ─
  // Veinte mensajes por hora. `use_chat_quota` cuenta y luego apunta: sin el candado
  // por persona, las dos sesiones contarían cero filas confirmadas y se colarían las
  // quince de cada una (30 en total). Con él, la segunda espera a que la primera
  // confirme y solo caben cinco.
  console.log('\n  Dos sesiones de la misma persona gastan a la vez la cuota del chat (20 por hora): 15 mensajes cada una');
  await psql(`delete from public.chat_usage where user_id = '${USUARIO}';`);
  // El chat es de Premium: con el plan básico la función rechaza antes de contar nada.
  await psql(`update public.user_settings set plan = 'premium' where user_id = '${USUARIO}';`);
  const quince =
    `select count(*) filter (where (t.q).allowed) || '/' || count(*) ` +
    `from (select public.use_chat_quota() as q from generate_series(1, 15)) as t;`;
  const resE = await carrera(quince, quince);
  const pasadas = (r) => Number((r.salida.split('\n')[0] ?? '').split('/')[0]);
  comprobar('la primera pasa sus 15', pasadas(resE.primera) === 15, `respuesta: ${resE.primera.error || resE.primera.salida}`);
  comprobar(
    'la segunda solo pasa 5: las otras 10 se pasan del cupo',
    pasadas(resE.segunda) === 5,
    `respuesta: ${resE.segunda.error || resE.segunda.salida}`,
  );
  const apuntadas = await psql(`select count(*) from public.chat_usage where user_id = '${USUARIO}';`);
  comprobar('quedan apuntados 20, no 30: ningún mensaje se coló', Number(apuntadas.salida) === 20, `apuntados: ${apuntadas.salida}`);
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
