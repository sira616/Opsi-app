/**
 * Comprobación rápida del esquema SIN Docker.
 *
 * Aplica todas las migraciones de supabase/migrations sobre un Postgres real
 * compilado a WebAssembly (PGlite) y comprueba lo que importa: que el aislamiento
 * entre hogares funciona y que las restricciones rechazan los datos malos.
 *
 *     node scripts/check-schema.mjs        (o: npm run db:check)
 *
 * NO sustituye a `npm run db:test`, que corre los tests pgTAP contra el Supabase
 * de verdad. Esto es el ciclo corto: segundos en vez de minutos, y sirve cuando
 * no tienes Docker a mano.
 *
 * Diferencias con el Supabase real, asumidas a cambio de esa rapidez:
 *   · El esquema `auth` es un doble mínimo (users + uid()), no el de GoTrue.
 *   · PGlite trae Postgres 18; el proyecto fija la 17 en config.toml.
 *   · No hay Storage, ni Realtime, ni Edge Functions.
 */

import { PGlite } from '@electric-sql/pglite';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

// El secreto JWT por defecto de la CLI de Supabase: público, y es lo que hace
// reconocible a la base LOCAL. Los seeds de desarrollo solo siembran si lo ven.
const SECRETO_LOCAL = 'super-secret-jwt-token-with-at-least-32-characters-long';

const USER_A = '1111aaaa-1111-4111-8111-111111111111';
const USER_B = '2222bbbb-2222-4222-8222-222222222222';

/**
 * Doble mínimo del esquema `auth` de Supabase: lo justo para que las
 * migraciones y los tests corran. El real lo gestiona GoTrue.
 */
const AUTH_DOUBLE = `
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;
  create table auth.users (
    id                      uuid primary key,
    instance_id             uuid,
    aud                     text,
    role                    text,
    email                   text unique,
    encrypted_password      text,
    email_confirmed_at      timestamptz,
    created_at              timestamptz default now(),
    updated_at              timestamptz default now(),
    raw_app_meta_data       jsonb,
    raw_user_meta_data      jsonb,
    -- GoTrue lee estas como texto y revienta con null: por eso el seed las
    -- pone a cadena vacía, y por eso están aquí.
    confirmation_token      text,
    recovery_token          text,
    email_change            text,
    email_change_token_new  text
  );

  -- El inicio de sesión por contraseña necesita su fila de identidad.
  create table auth.identities (
    provider_id      text,
    user_id          uuid references auth.users (id) on delete cascade,
    identity_data    jsonb,
    provider         text,
    last_sign_in_at  timestamptz,
    created_at       timestamptz default now(),
    updated_at       timestamptz default now(),
    primary key (provider_id, provider)
  );

  -- pgcrypto no viene con PGlite. Aquí solo importa que el seed pueda
  -- llamarlas; el hash de verdad lo hace Postgres en la máquina del usuario.
  create schema if not exists extensions;
  create function extensions.gen_salt(t text) returns text language sql as $fn$ select '$2a$10$stub' $fn$;
  create function extensions.crypt(p text, s text) returns text language sql as $fn$ select s || md5(p) $fn$;
  create function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
  $fn$;

  -- Supabase concede esto en su instalación, y sin ello cualquier función que
  -- llame a auth.uid() como el usuario falla con "permission denied for schema
  -- auth". Omitirlo hacía que este doble fuera MÁS restrictivo que el Supabase
  -- real y produjera fallos que allí no existen.
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

/** Ejecuta como un usuario autenticado concreto, igual que hace Supabase. */
async function asUser(db, userId, fn) {
  await db.exec(`set role authenticated;`);
  await db.exec(`set request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}';`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; reset request.jwt.claims;`);
  }
}

/** Espera que la consulta falle. Devuelve el mensaje de error. */
async function mustFail(db, sql) {
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return error.message;
  }
}

/**
 * Igual, pero devuelve también el SQLSTATE y el `hint`, que es el contrato con
 * el que la app distingue «límite de neveras» de «nevera llena» sin olfatear
 * texto. `null` si la consulta NO falló.
 */
async function mustFailWith(db, sql) {
  try {
    await db.query(sql);
    return null;
  } catch (error) {
    return { code: error.code, hint: error.hint ?? null, message: error.message };
  }
}

/** `users_three` → `UsersThree`: el nombre del icono en phosphor-react-native. */
const aPascal = (clave) =>
  clave
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');


/**
 * Dobles de las funciones de pgTAP que usan los tests.
 *
 * pgTAP no está compilado para WebAssembly, así que aquí se define un puñado de
 * funciones con la misma firma que sí ejecutan la aserción y apuntan el
 * resultado. Sirve para cazar lo que más duele descubrir en la máquina de
 * otro: un error de sintaxis, una columna mal escrita o una aserción que no se
 * cumple. El veredicto de verdad lo da `npm run db:test` con pgTAP real.
 */
const PGTAP_DOUBLES = `
  create schema if not exists extensions;
  create table pgtap_results (ok boolean, description text);
  -- pgTAP de verdad no escribe en ninguna tabla, así que sus funciones valen
  -- para cualquier rol. Estos dobles sí escriben, y sin este grant los tests
  -- que cambian de rol fallarían por permisos y no por lo que quieren probar.
  grant all on pgtap_results to public;

  create function no_plan() returns setof text language sql as $fn$ select 'plan'::text $fn$;

  create function finish() returns setof text language sql as $fn$ select 'done'::text $fn$;

  create function ok(p_ok boolean, p_desc text) returns text language plpgsql as $fn$
  begin
    insert into pgtap_results values (coalesce(p_ok, false), p_desc);
    return p_desc;
  end $fn$;

  create function is(p_got anyelement, p_want anyelement, p_desc text)
  returns text language plpgsql as $fn$
  begin
    insert into pgtap_results
    values (p_got is not distinct from p_want,
            p_desc || coalesce('  [obtenido: ' || p_got::text || ', esperado: ' || p_want::text || ']', ''));
    return p_desc;
  end $fn$;

  create function lives_ok(p_sql text, p_desc text) returns text language plpgsql as $fn$
  begin
    execute p_sql;
    insert into pgtap_results values (true, p_desc);
    return p_desc;
  exception when others then
    insert into pgtap_results values (false, p_desc || '  [lanzó ' || SQLSTATE || ': ' || SQLERRM || ']');
    return p_desc;
  end $fn$;

  create function throws_ok(p_sql text, p_state text, p_msg text, p_desc text)
  returns text language plpgsql as $fn$
  begin
    execute p_sql;
    insert into pgtap_results values (false, p_desc || '  [no lanzó nada; se esperaba ' || p_state || ']');
    return p_desc;
  exception when others then
    insert into pgtap_results
    values (SQLSTATE = p_state, p_desc || case when SQLSTATE = p_state then '' else '  [lanzó ' || SQLSTATE || ', se esperaba ' || p_state || ']' end);
    return p_desc;
  end $fn$;
`;

async function runPgtapFiles() {
  const dir = join(ROOT, 'supabase', 'tests');
  const files = (await readdir(dir)).filter((f) => f.endsWith('_test.sql')).sort();

  for (const file of files) {
    console.log(`\n\x1b[1mpgTAP · ${file}\x1b[0m`);
    const db = await PGlite.create();
    try {
      await db.exec(AUTH_DOUBLE);
      for (const migration of (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()) {
        await db.exec(await readFile(join(MIGRATIONS, migration), 'utf8'));
      }
      await db.exec(PGTAP_DOUBLES);

      // La extensión real no existe aquí; el resto del fichero se ejecuta tal cual.
      const sql = (await readFile(join(dir, file), 'utf8')).replace(
        /create extension if not exists pgtap[^;]*;/i,
        ''
      );
      await db.exec(sql);

      // El fichero termina en ROLLBACK, así que los resultados se pierden con él.
      // Se vuelven a ejecutar sin la transacción para poder leerlos.
      const db2 = await PGlite.create();
      await db2.exec(AUTH_DOUBLE);
      for (const migration of (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()) {
        await db2.exec(await readFile(join(MIGRATIONS, migration), 'utf8'));
      }
      await db2.exec(PGTAP_DOUBLES);
      await db2.exec(sql.replace(/^\s*begin;/im, '').replace(/rollback;\s*$/im, ''));
      const results = await db2.query('select ok, description from pgtap_results order by ctid');
      for (const row of results.rows) check(row.description, row.ok);
      if (results.rows.length === 0) check(`${file}: no se registró ninguna aserción`, false);
      await db2.close();
    } catch (error) {
      check(`${file} se ejecuta entero`, false, `${error.message}`);
      // El fichero empieza con BEGIN: si revienta a medias deja la transacción
      // abortada, y la comprobación de la capa de datos que viene justo después
      // sobre esta misma base fallaría con «current transaction is aborted» por
      // una causa que no es la suya.
      await db.exec('rollback;').catch(() => {});
    }
    // ── Lo que la app pide existe de verdad ─────────────────────────────────
  //
  // src/api/inventory.ts afirma sus tipos con `as unknown as` porque
  // database.types.ts necesita Docker para generarse. Eso deja un agujero: si
  // una columna se renombra, TypeScript compila igual y la app revienta en
  // ejecución con «column does not exist». Esto lo cierra leyendo la lista de
  // columnas del propio fichero y comprobándola contra la vista.
  console.log(`\n\x1b[1mLa capa de datos cuadra con el esquema\x1b[0m`);
  try {
    const apiSrc = await readFile(join(ROOT, 'app', 'src', 'api', 'inventory.ts'), 'utf8');
    const bloque = apiSrc.match(/const PRIORITY_FIELDS =([\s\S]*?);/)?.[1] ?? '';
    const pedidas = bloque
      .replace(/['"+\n\r]/g, ' ')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    check('se han encontrado las columnas que pide la lista', pedidas.length > 0);

    const existentes = new Set(
      (
        await db.query(
          `select column_name from information_schema.columns
            where table_schema = 'public' and table_name = 'inventory_with_priority'`,
        )
      ).rows.map((r) => r.column_name),
    );

    const ausentes = pedidas.filter((col) => !existentes.has(col));
    check(
      'todas existen en inventory_with_priority',
      ausentes.length === 0,
      ausentes.length ? `no existen: ${ausentes.join(', ')}` : '',
    );

    // Las categorías están escritas dos veces: el enum de la migración y la
    // lista de la app, que además lleva sus etiquetas y sus reglas. Que se
    // separen no daría un error de compilación, solo un alta que falla al
    // guardar con un valor que la base no conoce.
    const catSrc = await readFile(join(ROOT, 'app', 'src', 'shared', 'lib', 'categorias.ts'), 'utf8');
    const enApp = new Set(
      [...catSrc.matchAll(/valor: '([a-z_]+)'/g)].map((m) => m[1]),
    );
    const enBase = new Set(
      (
        await db.query(
          `select unnest(enum_range(null::public.food_category))::text as v`,
        )
      ).rows.map((r) => r.v),
    );

    const soloApp = [...enApp].filter((v) => !enBase.has(v));
    const soloBase = [...enBase].filter((v) => !enApp.has(v));
    check(
      'las categorías de la app y las del enum son las mismas',
      soloApp.length === 0 && soloBase.length === 0 && enApp.size > 0,
      [
        soloApp.length ? `solo en la app: ${soloApp.join(', ')}` : '',
        soloBase.length ? `solo en la base: ${soloBase.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    );
  } catch (error) {
    check('la capa de datos cuadra con el esquema', false, error.message);
  }

  // ══ Segunda fase: ejecutar los ficheros pgTAP ═══════════════════════════
  // Base nueva, para que los datos de las comprobaciones de arriba no choquen

  await db.close();
  }
}

async function main() {
  const db = await PGlite.create();

  await db.exec(AUTH_DOUBLE);

  // ── Migraciones, en orden ───────────────────────────────────────────────
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error('No hay migraciones en supabase/migrations');

  console.log(`\n\x1b[1mMigraciones\x1b[0m (${files.length})`);
  for (const file of files) {
    try {
      await db.exec(await readFile(join(MIGRATIONS, file), 'utf8'));
      check(file, true);
    } catch (error) {
      check(file, false, error.message);
      console.log('\n\x1b[31mUna migración no aplica: el resto de comprobaciones no tiene sentido.\x1b[0m\n');
      process.exit(1);
    }
  }

  // ── El trigger de alta ──────────────────────────────────────────────────
  console.log(`\n\x1b[1mAlta de usuario\x1b[0m`);
  await db.exec(`insert into auth.users (id, email) values ('${USER_A}', 'ana@usuarios.opsi.local'), ('${USER_B}', 'bruno@usuarios.opsi.local');`);

  const households = await db.query(`select count(*)::int as n from public.households`);
  check('registrarse crea un hogar por usuario', households.rows[0].n === 2, `hogares creados: ${households.rows[0].n}`);

  const members = await db.query(
    `select role from public.household_members where user_id = '${USER_A}'`
  );
  check('el usuario queda como owner de su hogar', members.rows.length === 1 && members.rows[0].role === 'owner');

  const settings = await db.query(`select count(*)::int as n from public.user_settings`);
  check('se crean sus ajustes', settings.rows[0].n === 2);

  const auto = await db.query(`select bool_or(auto_add_to_shopping_list) as any_on from public.user_settings`);
  check('el añadido automático a la lista viene DESACTIVADO', auto.rows[0].any_on === false);

  // El modelo de neveras: cada persona empieza con UNA privada, de una plaza, y
  // con el tope de neveras que le toca. Lo dice el trigger de alta.
  const privadas = await db.query(`select kind, icon, member_limit, name from public.households`);
  check(
    'el alta crea neveras PRIVADAS: personal, con icono de casa y una sola plaza',
    privadas.rows.length === 2 &&
      privadas.rows.every((h) => h.kind === 'personal' && h.icon === 'house' && h.member_limit === 1),
    JSON.stringify(privadas.rows),
  );
  const limites = await db.query(`select household_limit from public.user_settings`);
  check(
    'y cada persona nace con el tope de neveras por omisión (2)',
    limites.rows.length === 2 && limites.rows.every((r) => r.household_limit === 2),
  );

  const [hhA, hhB] = (
    await db.query(`select household_id, user_id from public.household_members order by user_id`)
  ).rows.map((r) => r.household_id);

  // ── Aislamiento entre hogares: el criterio de salida de la fase 0 ───────
  console.log(`\n\x1b[1mAislamiento entre hogares\x1b[0m`);

  await asUser(db, USER_A, async () => {
    await db.query(`
      insert into public.inventory_items
        (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity,
         limit_date, date_kind, date_source, created_by)
      values ('${hhA}', 'Leche entera', 'volume', 'l', 1000, 1000,
              current_date + 7, 'best_before', 'package', '${USER_A}');
    `);
    await db.query(`
      insert into public.shopping_list_items (household_id, name, created_by)
      values ('${hhA}', 'Huevos', '${USER_A}');
    `);
    await db.query(`
      insert into public.inventory_events (household_id, user_id, type)
      values ('${hhA}', '${USER_A}', 'created');
    `);
  });

  await asUser(db, USER_A, async () => {
    const r = await db.query(`select count(*)::int as n from public.inventory_items`);
    check('A ve su propio inventario', r.rows[0].n === 1);
    const h = await db.query(`select count(*)::int as n from public.households`);
    check('A ve su hogar y solo el suyo', h.rows[0].n === 1);
  });

  await asUser(db, USER_B, async () => {
    for (const table of [
      'households',
      'household_members',
      'inventory_items',
      'inventory_events',
      'shopping_list_items',
    ]) {
      const r = await db.query(`select count(*)::int as n from public.${table}`);
      const expected = table === 'households' || table === 'household_members' ? 1 : 0;
      check(`B no ve nada de A en ${table}`, r.rows[0].n === expected, `filas visibles: ${r.rows[0].n}`);
    }

    const settingsB = await db.query(`select count(*)::int as n from public.user_settings`);
    check('B solo ve sus propios ajustes', settingsB.rows[0].n === 1);

    const err = await mustFail(
      db,
      `insert into public.inventory_items
         (household_id, name, unit_family, display_unit, initial_quantity, remaining_quantity)
       values ('${hhA}', 'Intruso', 'count', 'unit', 1, 1)`
    );
    check('B no puede escribir en el hogar de A', err !== null, 'el INSERT debería haber fallado');

    const moved = await db.query(
      `update public.inventory_items set name = 'Secuestrado' where household_id = '${hhA}'`
    );
    check('B no puede modificar elementos de A', moved.affectedRows === 0);
  });

  // ── El registro de eventos es inmutable ─────────────────────────────────
  console.log(`\n\x1b[1mInmutabilidad del registro\x1b[0m`);
  await asUser(db, USER_A, async () => {
    const upd = await mustFail(db, `update public.inventory_events set type = 'discarded'`);
    check('nadie puede reescribir un evento', upd !== null);
    const del = await mustFail(db, `delete from public.inventory_events`);
    check('nadie puede borrar un evento', del !== null);
  });

  // ── Los principios, convertidos en restricciones ────────────────────────
  console.log(`\n\x1b[1mRestricciones del dominio\x1b[0m`);
  await asUser(db, USER_A, async () => {
    const base = (cols, vals) =>
      `insert into public.inventory_items (household_id, name, unit_family, display_unit,
         initial_quantity, remaining_quantity${cols}) values ('${hhA}', 'X', ${vals})`;

    check(
      'una fecha sin origen es rechazada («no inventar datos»)',
      (await mustFail(db, base(`, limit_date`, `'volume', 'l', 1000, 1000, current_date + 3`))) !== null
    );
    check(
      'kg en un producto medido en volumen es rechazado (D-07)',
      (await mustFail(db, base(``, `'volume', 'kg', 1000, 1000`))) !== null
    );
    check(
      'no se puede tener más cantidad restante que inicial',
      (await mustFail(db, base(``, `'count', 'unit', 1, 5`))) !== null
    );
    check(
      'un elemento cerrado no puede tener fecha de apertura',
      (await mustFail(db, base(`, opened_at`, `'count', 'unit', 1, 1, now()`))) !== null
    );
    check(
      'un evento de consumo sin cantidad es rechazado',
      (await mustFail(
        db,
        `insert into public.inventory_events (household_id, type) values ('${hhA}', 'quantity_used')`
      )) !== null
    );
    check(
      'algo congelado tiene que decir desde cuándo (D-12)',
      (await mustFail(db, base(`, state`, `'count', 'unit', 1, 1, 'frozen'`))) !== null
    );
    check(
      'algo que no está congelado no puede arrastrar un tramo abierto',
      (await mustFail(db, base(`, frozen_at`, `'count', 'unit', 1, 1, now()`))) !== null
    );
    check(
      'los días acumulados en el congelador no pueden ser negativos',
      (await mustFail(db, base(`, frozen_days`, `'count', 'unit', 1, 1, -3`))) !== null
    );
    check(
      'un elemento congelado con su fecha de congelación sí se acepta',
      (await mustFail(db, base(`, state, frozen_at`, `'count', 'unit', 1, 1, 'frozen', now()`))) === null
    );
    check(
      'una fecha completa (valor + tipo + origen) sí se acepta',
      (await mustFail(
        db,
        base(`, limit_date, date_kind, date_source`, `'mass', 'g', 500, 500, current_date + 3, 'expiry', 'package'`)
      )) === null
    );
  });

  // ── El catálogo global ──────────────────────────────────────────────────
  console.log(`\n\x1b[1mCatálogo de productos\x1b[0m`);
  await db.exec(`
    insert into public.products (household_id, barcode, name, data_source)
    values (null, '8410000000001', 'Leche entera 1 L', 'openfoodfacts');
  `);

  await asUser(db, USER_A, async () => {
    const r = await db.query(`select count(*)::int as n from public.products where household_id is null`);
    check('el catálogo global lo ve todo el mundo', r.rows[0].n === 1);

    const err = await mustFail(
      db,
      `insert into public.products (household_id, name, data_source)
       values (null, 'Falso global', 'openfoodfacts')`
    );
    check('un usuario no puede escribir en el catálogo global', err !== null);

    await db.query(
      `insert into public.products (household_id, name) values ('${hhA}', 'Tarta de la abuela')`
    );
    check('un usuario sí puede crear productos privados de su hogar', true);
  });

  await asUser(db, USER_B, async () => {
    const r = await db.query(`select count(*)::int as n from public.products`);
    check('B ve el catálogo global pero no los productos privados de A', r.rows[0].n === 1, `ve ${r.rows[0].n}`);
  });

  const dup = await mustFail(
    db,
    `insert into public.products (household_id, barcode, name, data_source)
     values (null, '8410000000001', 'Duplicado', 'openfoodfacts')`
  );
  check('un código de barras no se repite en el catálogo global', dup !== null);

  // ── Neveras: una privada por persona, y las compartidas que quiera ──────
  //
  // Sustituye a lo de «un hogar por persona»: aceptar una invitación AÑADE una
  // pertenencia y no mueve a nadie, el tope de neveras es una columna por
  // persona que el cliente no puede escribir, y `create_item` dice en qué
  // nevera va en vez de adivinarla. Esto es el ciclo corto de todo eso; el
  // veredicto del pgTAP real lo da `npm run db:test`.
  console.log(`\n\x1b[1mNeveras: privada + compartidas\x1b[0m`);

  const fila = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const priv = async (sql) => (await fila(sql)).ok;

  // El esquema
  const columnas = new Set(
    (
      await db.query(
        `select table_name || '.' || column_name as c from information_schema.columns
          where table_schema = 'public'
            and ((table_name = 'households' and column_name in ('kind', 'icon', 'member_limit'))
              or (table_name = 'user_settings' and column_name = 'household_limit'))`,
      )
    ).rows.map((r) => r.c),
  );
  check(
    'existen households.kind, households.icon y user_settings.household_limit',
    ['households.kind', 'households.icon', 'households.member_limit', 'user_settings.household_limit'].every((c) =>
      columnas.has(c),
    ),
  );

  const kindVsLimite = await mustFailWith(
    db,
    `insert into public.households (name, kind, member_limit) values ('x', 'personal', 2)`,
  );
  check('una nevera personal con más de una plaza la rechaza el motor', kindVsLimite?.code === '23514', JSON.stringify(kindVsLimite));
  const kindVsLimite2 = await mustFailWith(
    db,
    `insert into public.households (name, kind, member_limit) values ('x', 'shared', 1)`,
  );
  check('y una compartida con una sola plaza también', kindVsLimite2?.code === '23514', JSON.stringify(kindVsLimite2));

  // Los iconos: una lista cerrada, y cada clave existe DE VERDAD en Phosphor
  const iconos = (await db.query(`select key from public.household_icons order by sort_order`)).rows.map((r) => r.key);
  check('hay 16 iconos', iconos.length === 16, `hay ${iconos.length}`);
  check('están los dos de por omisión: house y users_three', iconos.includes('house') && iconos.includes('users_three'));
  const carpetaIconos = join(ROOT, 'node_modules', 'phosphor-react-native', 'lib', 'typescript', 'icons');
  check(
    'phosphor-react-native está instalado (hace falta para comprobar los iconos)',
    existsSync(carpetaIconos),
    'ejecuta: npm install',
  );
  const sinIcono = iconos.filter((k) => !existsSync(join(carpetaIconos, `${aPascal(k)}.d.ts`)));
  check(
    'cada clave de icono existe en phosphor-react-native con el nombre que sale de la clave',
    sinIcono.length === 0,
    `no existen: ${sinIcono.map((k) => `${k} → ${aPascal(k)}`).join(', ')}`,
  );
  const iconoMalo = await mustFailWith(
    db,
    `insert into public.households (name, kind, icon, member_limit) values ('x', 'shared', 'fridge', 5)`,
  );
  check('la clave foránea impide un icono que no está en la lista', iconoMalo?.code === '23503', JSON.stringify(iconoMalo));

  // Los permisos: el cliente NO escribe household_limit
  const puede = (tabla, col, tipo) =>
    priv(`select has_column_privilege('authenticated', 'public.${tabla}', '${col}', '${tipo}') as ok`);
  check('el cliente no puede INSERTAR user_settings.household_limit', !(await puede('user_settings', 'household_limit', 'INSERT')));
  check('ni ACTUALIZARLA', !(await puede('user_settings', 'household_limit', 'UPDATE')));
  check('pero sí LEERLA (la RLS deja ver la propia fila)', await puede('user_settings', 'household_limit', 'SELECT'));
  check(
    'y no queda un INSERT de tabla que la cubra por la puerta de atrás',
    !(await priv(`select has_table_privilege('authenticated', 'public.user_settings', 'INSERT') as ok`)),
  );
  check('el resto de los ajustes sigue editable', await puede('user_settings', 'digest_hour', 'UPDATE'));
  check('el usuario sigue siendo inmutable', !(await puede('user_settings', 'username', 'UPDATE')));
  check(
    'pero se puede INSERTAR, que es lo que necesita quien no tiene fila de ajustes',
    await puede('user_settings', 'username', 'INSERT'),
  );
  check(
    'households no se escribe desde el cliente: ni UPDATE, ni INSERT, ni DELETE',
    !(await priv(`select has_table_privilege('authenticated', 'public.households', 'UPDATE') as ok`)) &&
      !(await priv(`select has_table_privilege('authenticated', 'public.households', 'INSERT') as ok`)) &&
      !(await priv(`select has_table_privilege('authenticated', 'public.households', 'DELETE') as ok`)) &&
      !(await puede('households', 'name', 'UPDATE')),
  );
  check(
    'y ya no queda una política de UPDATE que lo permita si alguien concede el permiso',
    (await db.query(`select 1 from pg_policies where tablename = 'households' and cmd = 'UPDATE'`)).rows.length === 0,
  );

  // Las funciones: la firma nueva, y solo esa
  const firmas = async (nombre) =>
    (
      await db.query(
        `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = $1`,
        [nombre],
      )
    ).rows.map((r) => r.args);

  for (const nombre of [
    'create_item',
    'invite_to_household',
    'household_member_names',
    'household_sent_invitations',
    'remove_household_member',
    'transfer_household_ownership',
    'leave_household',
    'update_household',
  ]) {
    const f = await firmas(nombre);
    check(
      `${nombre} recibe la nevera y no queda una firma antigua`,
      f.length === 1 && f[0].startsWith('p_household_id uuid'),
      JSON.stringify(f),
    );
  }
  check('rehouse_user ya no existe: aceptar una invitación no mueve a nadie', (await firmas('rehouse_user')).length === 0);
  for (const nombre of ['create_shared_household', 'my_households', 'accept_invitation', 'cancel_invitation', 'my_pending_invitations']) {
    check(`${nombre} existe, una sola vez`, (await firmas(nombre)).length === 1);
  }
  for (const nombre of [
    'check_household_name',
    'check_household_icon',
    'invitation_status_es',
    'lock_household_limit',
    'require_shared_household_member',
    'require_owner_household',
  ]) {
    const ok = await priv(
      `select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as ok
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = '${nombre}'`,
    );
    check(`${nombre} es interna: no se concede a authenticated`, ok === false);
  }

  // Lo que pasa de verdad. A (ana) y B (bruno) ya existen, cada una con su privada.
  const misNeveras = async (id) => asUser(db, id, async () => (await db.query(`select * from public.my_households()`)).rows);
  const enA = await misNeveras(USER_A);
  check(
    'my_households: una sola nevera al principio, la privada, con su rol y su plaza',
    enA.length === 1 && enA[0].kind === 'personal' && enA[0].role === 'owner' && enA[0].member_limit === 1,
    JSON.stringify(enA),
  );
  const privadaA = enA[0].id;
  const privadaB = (await misNeveras(USER_B))[0].id;

  let piso;
  await asUser(db, USER_A, async () => {
    piso = (await db.query(`select * from public.create_shared_household('  Piso  ', 'pizza')`)).rows[0];

    check(
      'crear una compartida: nombre recortado, su icono, tipo shared y 5 plazas',
      piso?.name === 'Piso' && piso.icon === 'pizza' && piso.kind === 'shared' && piso.member_limit === 5,
      JSON.stringify(piso),
    );

    const tope = await mustFailWith(db, `select public.create_shared_household('Otra')`);
    check(
      'el tope de neveras cuenta la privada: la tercera falla con P0001 y el hint limite_neveras',
      tope?.code === 'P0001' && tope.hint === 'limite_neveras',
      JSON.stringify(tope),
    );

    for (const [nombre, sql] of [
      ['un nombre vacío', `select public.create_shared_household('  ')`],
      ['un nombre de 81 caracteres', `select public.create_shared_household(repeat('x', 81))`],
      ['un icono que no está en la lista', `select public.create_shared_household('Piso 2', 'fridge')`],
    ]) {
      const e = await mustFailWith(db, sql);
      check(`crear con ${nombre} da 22023 en español`, e?.code === '22023' && /[a-záéíóú]/.test(e?.message ?? ''), JSON.stringify(e));
    }

    const orden = (await db.query(`select kind from public.my_households()`)).rows.map((r) => r.kind);
    check('my_households pone la privada primero', orden.join(',') === 'personal,shared', orden.join(','));

    const aLaPrivada = await mustFailWith(db, `select * from public.invite_to_household('${privadaA}', 'bruno')`);
    check(
      'no se invita a una nevera personal: P0001 con hint nevera_personal',
      aLaPrivada?.code === 'P0001' && aLaPrivada.hint === 'nevera_personal',
      JSON.stringify(aLaPrivada),
    );

    const inv = (await db.query(`select * from public.invite_to_household('${piso.id}', 'bruno')`)).rows[0];
    check('invitar a la compartida sigue devolviendo un resultado con su outcome', inv?.outcome === 'creada', JSON.stringify(inv));
    const desconocida = (await db.query(`select outcome from public.invite_to_household('${piso.id}', 'fantasma')`)).rows[0];
    check('y lo que depende de la otra cuenta sigue siendo un RESULTADO, no una excepción', desconocida?.outcome === 'desconocida');
  });

  // B recibe la invitación y acepta: se AÑADE, no se mueve
  let invB;
  await asUser(db, USER_B, async () => {
    invB = (await db.query(`select * from public.my_pending_invitations()`)).rows[0];
    check(
      'la invitación recibida trae el nombre y el icono de la nevera y quién invita',
      invB?.household_name === 'Piso' && invB.household_icon === 'pizza' && invB.inviter_username === 'ana',
      JSON.stringify(invB),
    );
    await db.query(`select public.accept_invitation('${invB.id}')`);
    const tras = (await db.query(`select id, kind, role from public.my_households()`)).rows;
    check(
      'aceptar AÑADE: B tiene su privada y además la compartida',
      tras.length === 2 && tras[0].id === privadaB && tras[0].kind === 'personal' && tras[1].id === piso.id,
      JSON.stringify(tras),
    );

    const soyMember = await mustFailWith(db, `select * from public.invite_to_household('${piso.id}', 'ana')`);
    check('un member no invita: 42501', soyMember?.code === '42501', JSON.stringify(soyMember));
    const renombra = await mustFailWith(db, `select public.update_household('${piso.id}', 'golpe', null)`);
    check('ni renombra la nevera: 42501', renombra?.code === '42501', JSON.stringify(renombra));

    const tope = await mustFailWith(db, `select public.create_shared_household('De B')`);
    check(
      'B ya tiene 2 neveras: no crea otra (limite_neveras)',
      tope?.code === 'P0001' && tope.hint === 'limite_neveras',
      JSON.stringify(tope),
    );

    const salirPrivada = await mustFailWith(db, `select public.leave_household('${privadaB}')`);
    check(
      'la privada no se abandona: hint nevera_personal',
      salirPrivada?.code === 'P0001' && salirPrivada.hint === 'nevera_personal',
      JSON.stringify(salirPrivada),
    );
  });

  // A: las reglas del dueño
  await asUser(db, USER_A, async () => {
    const salir = await mustFailWith(db, `select public.leave_household('${piso.id}')`);
    check(
      'el dueño con más gente no se va sin traspasar: hint debe_traspasar',
      salir?.code === 'P0001' && salir.hint === 'debe_traspasar',
      JSON.stringify(salir),
    );
    const nombres = (await db.query(`select username from public.household_member_names('${piso.id}') order by 1`)).rows.map((r) => r.username);
    check('los nombres de la compartida: los dos', nombres.join(',') === 'ana,bruno', nombres.join(','));
    const propios = (await db.query(`select username from public.household_member_names('${privadaA}')`)).rows;
    check('y los de la privada: solo la persona, que es lo que necesita el historial', propios.length === 1 && propios[0].username === 'ana');
    const ajena = await mustFailWith(db, `select * from public.household_member_names('${privadaB}')`);
    check('los nombres de una nevera que no es tuya: P0002', ajena?.code === 'P0002', JSON.stringify(ajena));
    const renombrada = (await db.query(`select name, icon from public.update_household('${piso.id}', 'Piso de Ana', 'couch')`)).rows[0];
    check('el dueño renombra y cambia el icono', renombrada?.name === 'Piso de Ana' && renombrada.icon === 'couch', JSON.stringify(renombrada));
    const soloIcono = (await db.query(`select name, icon from public.update_household('${piso.id}', null, 'tent')`)).rows[0];
    check('con null en un parámetro no se toca', soloIcono?.name === 'Piso de Ana' && soloIcono.icon === 'tent', JSON.stringify(soloIcono));
  });

  await asUser(db, USER_B, async () => {
    await db.query(`select public.leave_household('${piso.id}')`);
    const quedan = (await db.query(`select kind from public.my_households()`)).rows;
    check('salir de una compartida deja a B con su privada, sin crearle nada', quedan.length === 1 && quedan[0].kind === 'personal', JSON.stringify(quedan));
  });

  // El bug de create_item: la nevera se dice, no se adivina
  await asUser(db, USER_A, async () => {
    const enPrivada = (await db.query(`select household_id from public.create_item('${privadaA}', 'Leche', 'volume', 'l', 1000)`)).rows[0];
    check('create_item guarda en la nevera que se le dice (la privada)', enPrivada?.household_id === privadaA);
    const enPiso = (await db.query(`select household_id from public.create_item('${piso.id}', 'Cerveza', 'volume', 'l', 330)`)).rows[0];
    check('y en la compartida, con la misma cuenta: ya no cae en una al azar', enPiso?.household_id === piso.id);

    const ajenaItem = await mustFailWith(db, `select public.create_item('${privadaB}', 'Intruso', 'count', 'unit', 1)`);
    check(
      'create_item en una nevera ajena da P0002 y un mensaje claro',
      ajenaItem?.code === 'P0002' && /nevera/i.test(ajenaItem.message),
      JSON.stringify(ajenaItem),
    );
    const sinNevera = await mustFailWith(db, `select public.create_item(null, 'Nada', 'count', 'unit', 1)`);
    check('sin nevera da 22023', sinNevera?.code === '22023', JSON.stringify(sinNevera));
    const familia = await mustFailWith(db, `select public.create_item('${privadaA}', 'Malo', 'volume', 'kg', 100)`);
    check('sigue rechazando una unidad que no encaja con su familia (23514)', familia?.code === '23514', JSON.stringify(familia));
    const eventos = await fila(`select count(*)::int as n from public.inventory_events where type = 'created' and item_id in (select id from public.inventory_items where name in ('Leche', 'Cerveza'))`);
    check('y cada alta deja su evento created', eventos.n === 2);
  });
  const rastro = await fila(`select count(*)::int as n from public.inventory_items where name = 'Intruso'`);
  check('el intruso no se insertó en ninguna parte', rastro.n === 0);

  // household_limit desde el cliente: 42501 de verdad
  await asUser(db, USER_A, async () => {
    for (const [nombre, sql] of [
      ['un UPDATE', `update public.user_settings set household_limit = 10`],
      ['un UPSERT ... DO UPDATE', `insert into public.user_settings (user_id, username) values ('${USER_A}', 'ana') on conflict (user_id) do update set household_limit = 10`],
      ['un INSERT que la nombra', `insert into public.user_settings (user_id, username, household_limit) values ('${USER_A}', 'ana', 10) on conflict (user_id) do nothing`],
    ]) {
      const e = await mustFailWith(db, sql);
      check(`${nombre} de household_limit da 42501`, e?.code === '42501', JSON.stringify(e));
    }
    const suyo = await fila(`select household_limit from public.user_settings`);
    check('y la puede leer: es 2', suyo.household_limit === 2);
  });

  await db.close();

  // con los usuarios que crean los tests.
  await runPgtapFiles();

  // ── Los seeds ───────────────────────────────────────────────────────────
  console.log(`\n\x1b[1mDatos de arranque\x1b[0m`);
  const dbSeed = await PGlite.create();
  try {
    await dbSeed.exec(AUTH_DOUBLE);
    for (const migration of (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()) {
      await dbSeed.exec(await readFile(join(MIGRATIONS, migration), 'utf8'));
    }
    const SEEDS = join(ROOT, 'supabase', 'seed');
    // El seed de desarrollo solo siembra en el Supabase LOCAL, y lo sabe por el
    // secreto JWT que trae por defecto la CLI. PGlite no lo tiene: se le da aquí,
    // como lo tendría la base local, para que siembre.
    await dbSeed.exec(`set app.settings.jwt_secret = '${SECRETO_LOCAL}'`);
    for (const seed of (await readdir(SEEDS)).filter((f) => f.endsWith('.sql')).sort()) {
      await dbSeed.exec(await readFile(join(SEEDS, seed), 'utf8'));
    }
    check('los seeds se aplican sin errores', true);

    const prod = await dbSeed.query(`select count(*)::int as n from public.products where household_id is null`);
    check('el catálogo global queda sembrado', prod.rows[0].n >= 10, `productos: ${prod.rows[0].n}`);

    const ref = await dbSeed.query(`select count(*)::int as n from public.open_shelf_life_reference`);
    check('la tabla de conservación queda sembrada', ref.rows[0].n >= 10);

    // Dos cuentas y no una desde que existe la nevera compartida: invitar,
    // aceptar y el límite de plazas no se prueban con una sola. Se comprueba
    // cada una por su nombre en vez de contar filas: un `n === 1` aquí se
    // quedó viejo el día que se sembró la segunda, y falló por eso y no por
    // nada que estuviera roto.
    for (const usuario of ['syreta', 'compi']) {
      const dev = await dbSeed.query(
        `select u.id, u.email from auth.users u
           join public.user_settings s on s.user_id = u.id
          where s.username = $1`,
        [usuario],
      );
      check(`el usuario de desarrollo ${usuario} existe`, dev.rows.length === 1);
      check(
        `y su correo es sintético, no uno real`,
        dev.rows[0]?.email === `${usuario}@usuarios.opsi.local`,
        `correo: ${dev.rows[0]?.email}`,
      );

      const casa = await dbSeed.query(
        `select count(*)::int as n from public.household_members m
           join public.user_settings s on s.user_id = m.user_id
          where s.username = $1`,
        [usuario],
      );
      check(`y el trigger le creó su hogar`, casa.rows[0].n === 1);

      const privada = await dbSeed.query(
        `select h.kind, h.icon,
                (select count(*)::int from public.household_members mm where mm.household_id = h.id) as gente
           from public.household_members m
           join public.households h on h.id = m.household_id
           join public.user_settings s on s.user_id = m.user_id
          where s.username = $1`,
        [usuario],
      );
      check(
        `y esa nevera es privada: personal, con su icono y una sola persona`,
        privada.rows.length === 1 &&
          privada.rows[0].kind === 'personal' &&
          privada.rows[0].icon === 'house' &&
          privada.rows[0].gente === 1,
        JSON.stringify(privada.rows),
      );

      const ident = await dbSeed.query(
        `select count(*)::int as n from auth.identities where user_id = $1`,
        [dev.rows[0]?.id],
      );
      check(`con su fila de identidad, que GoTrue exige`, ident.rows[0].n === 1);
    }

    const compartidas = await dbSeed.query(`select count(*)::int as n from public.households where kind = 'shared'`);
    check('las cuentas de desarrollo no comparten nada de salida', compartidas.rows[0].n === 0);

    // ── El inventario de superficie está al día ───────────────────────────────
    //
    // docs/security-inventory.md es la tabla de qué hay expuesto y con qué control
    // (§2 de la lista de seguridad). Un documento así se pudre en cuanto se añade
    // una función y nadie lo toca, así que esto convierte «acordarse de
    // actualizarlo» en algo que la CI exige: toda tabla, vista o función de
    // `public` tiene que aparecer en él con su nombre entre comillas inversas.
    //
    // Es en un solo sentido a propósito: lo que existe tiene que estar documentado.
    // Lo contrario (que el documento no nombre cosas que ya no existen) lo vigila
    // quien lo lee, y exigirlo aquí haría que renombrar algo rompiera la CI por una
    // cita en un párrafo.
    const inventario = await readFile(join(ROOT, 'docs', 'security-inventory.md'), 'utf8');
    const documentados = new Set([...inventario.matchAll(/`([a-z_][a-z0-9_]*)`/g)].map((m) => m[1]));
    const existentes = await dbSeed.query(`
      select c.relname as nombre, case c.relkind when 'v' then 'vista' else 'tabla' end as tipo
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
      union
      select p.proname, 'función'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prokind = 'f'
       order by 2, 1
    `);
    const sinDocumentar = existentes.rows.filter((r) => !documentados.has(r.nombre));
    check(
      `todo lo público está en docs/security-inventory.md (${existentes.rows.length} nombres)`,
      sinDocumentar.length === 0,
      sinDocumentar.length === 0
        ? ''
        : `falta: ${sinDocumentar.map((r) => `${r.tipo} ${r.nombre}`).join(', ')}`,
    );
  } catch (error) {
    check('los seeds se aplican sin errores', false, error.message);
  }
  await dbSeed.close();

  // ── La guarda del seed: fuera del Supabase local, no siembra NADA ───────────
  //
  // Las cuentas de desarrollo tienen una contraseña escrita en el repositorio.
  // Lo que impide que lleguen a un proyecto de la nube es que el seed mira el
  // secreto JWT: si no es el que la CLI trae por defecto, no es el local. Esto
  // lo comprueba con dos bases sin ese ajuste —«no hay ninguno» y «hay otro»—,
  // que es lo que vería un proyecto real.
  for (const [nombre, preparar] of [
    ['sin secreto JWT', async () => {}],
    ['con otro secreto JWT (uno de la nube)', (d) => d.exec(`set app.settings.jwt_secret = 'otro-secreto-que-no-es-el-de-la-cli-local-0123456789'`)],
  ]) {
    const dbNube = await PGlite.create();
    try {
      await dbNube.exec(AUTH_DOUBLE);
      for (const migration of (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort()) {
        await dbNube.exec(await readFile(join(MIGRATIONS, migration), 'utf8'));
      }
      await preparar(dbNube);
      const SEEDS_NUBE = join(ROOT, 'supabase', 'seed');
      for (const seed of (await readdir(SEEDS_NUBE)).filter((f) => f.endsWith('.sql')).sort()) {
        await dbNube.exec(await readFile(join(SEEDS_NUBE, seed), 'utf8'));
      }
      const usuarios = await dbNube.query(`select count(*)::int as n from auth.users`);
      check(`${nombre}: el seed de desarrollo no crea ninguna cuenta`, usuarios.rows[0].n === 0, `cuentas: ${usuarios.rows[0].n}`);
    } catch (error) {
      check(`${nombre}: el seed se omite sin errores`, false, error.message);
    }
    await dbNube.close();
  }

  // ── Resultado ───────────────────────────────────────────────────────────
  console.log(
    failures.length === 0
      ? `\n\x1b[32m\x1b[1m${passed} comprobaciones, todas correctas.\x1b[0m\n`
      : `\n\x1b[31m\x1b[1m${failures.length} fallo(s) de ${passed + failures.length}:\x1b[0m\n${failures
          .map((f) => `  · ${f}`)
          .join('\n')}\n`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\n\x1b[31mLa comprobación no llegó a terminar:\x1b[0m\n${error.stack}\n`);
  process.exit(1);
});
