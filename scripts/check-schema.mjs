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
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

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
    id                  uuid primary key,
    instance_id         uuid,
    aud                 text,
    role                text,
    email               text unique,
    encrypted_password  text,
    email_confirmed_at  timestamptz,
    created_at          timestamptz default now(),
    updated_at          timestamptz default now(),
    raw_app_meta_data   jsonb,
    raw_user_meta_data  jsonb
  );
  create function auth.uid() returns uuid language sql stable as $fn$
    select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
  $fn$;
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
    }
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
  await db.exec(`insert into auth.users (id, email) values ('${USER_A}', 'a@opsi.test'), ('${USER_B}', 'b@opsi.test');`);

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

  await db.close();

  // ══ Segunda fase: ejecutar los ficheros pgTAP ═══════════════════════════
  // Base nueva, para que los datos de las comprobaciones de arriba no choquen
  // con los usuarios que crean los tests.
  await runPgtapFiles();

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
