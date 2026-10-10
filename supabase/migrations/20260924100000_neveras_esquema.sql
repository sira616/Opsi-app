-- ═══════════════════════════════════════════════════════════════════════════
-- Neveras: una privada por persona, y las compartidas que quiera.
--
-- Sustituye el modelo de 20260922110000 (la nevera compartida), que nunca
-- llegó a desplegarse. Allí cada persona pertenecía a EXACTAMENTE un hogar y
-- aceptar una invitación la MOVÍA: quien entraba en la nevera de casa dejaba
-- la suya. Eso obligaba a elegir entre lo tuyo y lo de todos, y esa elección no
-- se le pide a nadie: uno quiere su nevera y además la del piso.
--
-- Esta migración toca el ESQUEMA y los permisos. Las funciones que lo usan
-- están en 20260924110000 y el arreglo de `create_item` en 20260924120000.
--
-- ── El modelo ─────────────────────────────────────────────────────────────
--
--   · Toda persona tiene UNA nevera privada (`kind = 'personal'`). La crea el
--     trigger de alta, es suya para siempre, no se comparte, no se abandona y
--     no se traspasa. Su `member_limit` es 1: no hay plaza para nadie más.
--   · Además puede crear neveras compartidas (`kind = 'shared'`), con nombre e
--     icono, invitar gente y cambiar entre todas.
--   · Aceptar una invitación AÑADE una pertenencia. No mueve a nadie ni saca
--     a nadie de nada.
--   · Cuántas neveras puede tener una persona lo dice
--     `user_settings.household_limit`, y cuenta TODAS, la privada incluida.
--     Hoy vale 2 (la tuya y una compartida). Es una columna por persona y no
--     una constante del código: subirla para quien tenga un plan mejor es un
--     UPDATE, no un despliegue. Hoy no existe ningún plan que la suba.
--   · Cuánta GENTE cabe en una nevera compartida (`member_limit`, 5) es otra
--     cosa: un tope técnico de la nevera. El plan no lo controla.
--
-- ── El invariante ─────────────────────────────────────────────────────────
--
-- Antes: «cada usuario pertenece SIEMPRE a exactamente un hogar». Ahora:
-- «pertenece SIEMPRE a AL MENOS UNO: el suyo privado». Es lo que sostiene que
-- un usuario nunca esté en blanco.
--
-- No se mantiene con un trigger sino por construcción: `household_members` no
-- tiene permiso de escritura desde el cliente, y las funciones que la tocan no
-- dejan salir de una nevera privada, ni echar de ella, ni traspasarla. La
-- única forma de perder la privada es borrar la cuenta.
--
-- La RLS NO cambia. Toda ella pasa por `is_household_member()`, que ya era
-- verdadera para N pertenencias. Lo que se rompe con N no es la base de datos
-- sino cualquier código que dé por hecho «EL hogar del usuario»: un `limit 1`
-- que coge una nevera al azar, o un `select` de una fila que falla al haber
-- dos. Este cambio los busca y los sustituye por un hogar explícito.
--
-- ── El inventario es de la nevera ─────────────────────────────────────────
--
-- Sigue igual que en el modelo anterior. Quien sale de una nevera compartida,
-- o a quien echan, NO se lleva la comida: el inventario, la lista y el
-- historial son de la nevera y se quedan en ella. La leche estaba en esa
-- nevera y ahí sigue. Y ahora es menos brusco que antes, porque nadie se queda
-- sin nada: la privada estaba ahí y sigue ahí.
--
-- Eso obliga a cerrar una puerta que con un solo hogar no importaba: con dos
-- pertenencias, un `update inventory_items set household_id = <mi privada>` es
-- una fila que cambia de nevera con el permiso y la política que ya existían
-- (la política solo exige ser miembro, y el permiso de tabla cubre la
-- columna), y su evento `created` se queda en la nevera vieja. La sección 8
-- lo prohíbe en el motor para las tres tablas que cuelgan de un hogar.
--
-- ── Huérfanas ─────────────────────────────────────────────────────────────
--
-- Una nevera compartida que se queda sin ningún miembro NO se borra. Se queda
-- en pie, huérfana, y es una decisión deliberada:
--
--   · Borrarla en cascada destruiría inventario, lista e historial —que es
--     inmutable por diseño— como efecto colateral de que la última persona
--     pulse «salir». Irreversible y sorprendente: la peor combinación.
--   · Es inalcanzable por construcción: ninguna política puede volver a casar
--     con ella, porque todas pasan por is_household_member(). No se filtra.
--   · Es recuperable: basta volver a insertar una pertenencia para que sus
--     datos reaparezcan, cosa que un DELETE no permite.
--
-- El precio es que se acumulan filas que nadie ve. Limpiarlas será un proceso
-- de mantenimiento con una política de retención escrita. Y NO existe «borrar
-- nevera»: dejarla huérfana es lo único que hay, y hoy basta, porque salir de
-- ella libera tu plaza en el límite.
--
-- ── Privacidad ────────────────────────────────────────────────────────────
--
-- Todo lo de 20260922110000 sigue valiendo: no hay búsqueda ni autocompletado
-- de nombres, y el único goteo es «existe una cuenta con exactamente ese
-- nombre», que solo se ve al invitar DE VERDAD, con el tope de 5 intentos por
-- hora. Lo nuevo no añade goteo:
--
--   · `my_households()` devuelve solo lo tuyo.
--   · `household_icons` es una lista de referencia, igual para todos.
--   · El tope de neveras de la persona que invitas NO se comprueba al invitar:
--     revelaría algo de la otra cuenta y cambia con el tiempo. Se comprueba al
--     ACEPTAR, que es cuando lo decide ella.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1 · Los iconos: una lista cerrada, en una tabla ═══════════════════════
--
-- Una tabla de referencia con clave foránea y no un CHECK ... IN (...), por
-- tres razones:
--
--   · Una sola definición. El CHECK habría que reescribirlo entero cada vez
--     que se añade un icono, con un ALTER TABLE que bloquea `households` y la
--     recorre. Aquí basta un INSERT.
--   · La app puede leer la lista, con su orden y su etiqueta, para pintar el
--     selector sin repetir las claves a mano.
--   · La clave foránea la hace cumplir el motor aunque alguien escriba en
--     `households` sin pasar por las funciones.
--
-- La CLAVE es el nombre del icono de Phosphor en snake_case (`users_three` →
-- `UsersThree`), y no un nombre inventado: así el mapa clave → componente de la
-- app es mecánico y se puede comprobar contra `node_modules`, que es lo que
-- hace `npm run db:check`. Las claves son datos guardados: si Phosphor
-- renombrase un icono, la clave se queda y solo cambia el mapa de la app.
--
-- Añadir uno: un INSERT aquí (otra migración) y su entrada en el mapa de la
-- app. Una clave que la app no conozca debe pintarse con el icono por defecto,
-- nunca romper la pantalla.
create table public.household_icons (
  key         text primary key
              check (key ~ '^[a-z][a-z0-9_]{1,31}$'),

  -- Corta y en español, para la etiqueta de accesibilidad del selector.
  -- Describe el dibujo, no la broma.
  label       text not null
              check (length(trim(label)) between 1 and 40),

  -- El orden en que se ofrecen: casa, gente, comida.
  sort_order  smallint not null
);

comment on table public.household_icons is
  'Lista cerrada de iconos que puede llevar una nevera. La clave es el nombre '
  'del icono de Phosphor en snake_case. Añadir uno es un INSERT.';

insert into public.household_icons (key, label, sort_order) values
  -- Casa. `house` es el de la nevera privada.
  ('house',       'Casa',                1),
  ('door',        'Puerta',              2),
  ('buildings',   'Edificio',            3),
  ('couch',       'Sofá',                4),
  ('tent',        'Tienda de campaña',   5),
  -- Gente. `users_three` es el que lleva una compartida si no se elige otro.
  ('users_three', 'Grupo de gente',      6),
  ('users',       'Dos personas',        7),
  ('users_four',  'Cuatro personas',     8),
  ('hand_heart',  'Mano con corazón',    9),
  ('student',     'Estudiante',         10),
  -- Comida.
  ('fork_knife',  'Cubiertos',          11),
  ('cooking_pot', 'Olla',               12),
  ('bowl_food',   'Cuenco',             13),
  ('pizza',       'Pizza',              14),
  ('carrot',      'Zanahoria',          15),
  ('coffee',      'Café',               16);

-- Datos de referencia, no de nadie: se leen enteros y no se escriben desde la
-- app. Sin políticas de escritura, solo la service_role puede tocarlos.
alter table public.household_icons enable row level security;

create policy household_icons_select on public.household_icons
  for select to authenticated
  using (true);

-- `authenticated` se nombra en el revoke a propósito: Supabase concede todos
-- los permisos a los roles de la Data API sobre cada tabla nueva del esquema
-- public, y este revoke es lo que lo deshace (ver 20260922120000).
revoke all on public.household_icons from anon, authenticated;
grant select on public.household_icons to authenticated;

-- ══ 2 · La nevera sabe qué es ═════════════════════════════════════════════

create type public.household_kind as enum (
  'personal',  -- la privada de una persona: una, suya, sin compartir
  'shared'     -- una nevera con nombre e icono a la que se invita gente
);

comment on type public.household_kind is
  'personal: la nevera privada de cada persona, que no se comparte nunca. '
  'shared: una nevera con dueño e invitados.';

-- Los valores por omisión son los de la privada, y no es casualidad: un INSERT
-- que se olvide de decir qué es no puede crear nada que se pueda compartir.
-- Las compartidas lo piden todo explícito.
alter table public.households
  add column kind public.household_kind not null default 'personal',
  add column icon text not null default 'house'
    constraint households_icon_fk references public.household_icons (key);

comment on column public.households.kind is
  'personal o shared. No cambia nunca: ninguna función lo toca y el cliente no '
  'tiene UPDATE sobre la tabla.';
comment on column public.households.icon is
  'Clave de household_icons. Por omisión una casa, que es la de la privada.';

-- ══ 3 · Lo que ya había: se reparte entre privadas y compartidas ══════════
--
-- La decisión es «todas son personales»: `kind` ya entró por omisión con ese
-- valor. Pero hay una excepción que no se puede ignorar, y solo puede darse en
-- una base de desarrollo local, porque el modelo anterior nunca se desplegó:
--
--   Un hogar con MÁS DE UN miembro no puede ser personal. Incumpliría
--   member_limit = 1, y sobre todo dejaría a esa gente sin poder verse, que es
--   justo lo que estaban haciendo.
--
-- Se resuelve sin perder nada de nadie:
--
--   1. Ese hogar se queda como está, con su inventario y sus miembros, y pasa
--      a ser COMPARTIDO. Nadie pierde acceso a lo que ya veía.
--   2. Cada persona que se queda sin privada —esos miembros, y cualquiera que
--      no tuviera hogar— recibe una nueva y vacía, de la que es dueña. Es lo
--      que sostiene el invariante «siempre al menos una».
--
-- Si el hogar seguía llamándose «Mi casa», se renombra: dos neveras con el
-- mismo nombre en el mismo selector no se distinguen.

-- 3.1 · Los hogares con más de una persona pasan a ser compartidos.
--
-- 5 plazas de tope, o las que ya hubiera si eran más: nadie queda por encima
-- de su propio límite. Y nunca más de 10, que es lo que admite la columna.
update public.households h
   set kind         = 'shared',
       icon         = 'users_three',
       name         = case when h.name = 'Mi casa' then 'Nevera compartida' else h.name end,
       member_limit = least(10, greatest(5, m.n))::smallint
  from (
    select mm.household_id, count(*) as n
    from public.household_members mm
    group by mm.household_id
    having count(*) > 1
  ) m
 where h.id = m.household_id;

-- 3.2 · Las personales, con su plaza única. El valor por omisión antiguo era 2.
update public.households
   set member_limit = 1
 where kind = 'personal';

-- 3.3 · Quien queda solo en una personal es su dueño. En el modelo anterior no
-- debería poder ser otra cosa, pero una privada con un `member` y ningún dueño
-- no tendría a quién pedirle nada.
update public.household_members m
   set role = 'owner'
  from public.households h
 where h.id = m.household_id
   and h.kind = 'personal'
   and m.role <> 'owner';

-- 3.4 · Invitaciones pendientes a una nevera que se queda personal: se
-- cancelan. Aceptarlas metería a alguien en una nevera que ya no se comparte.
-- Es lo único que un hogar de una sola persona con invitaciones enviadas
-- puede haber dejado, y responded_at es obligatorio en las canceladas.
update public.household_invitations i
   set status = 'cancelled', responded_at = now()
 where i.status = 'pending'
   and exists (
     select 1 from public.households h
     where h.id = i.household_id and h.kind = 'personal'
   );

-- 3.5 · Nadie sin privada.
do $$
declare
  v_persona record;
  v_hogar   uuid;
begin
  for v_persona in
    select u.id as user_id
    from auth.users u
    where not exists (
      select 1
      from public.household_members m
      join public.households h on h.id = m.household_id
      where m.user_id = u.id and h.kind = 'personal'
    )
  loop
    insert into public.households (name, kind, icon, member_limit)
    values ('Mi casa', 'personal', 'house', 1)
    returning id into v_hogar;

    insert into public.household_members (household_id, user_id, role)
    values (v_hogar, v_persona.user_id, 'owner');
  end loop;
end;
$$;

-- ══ 4 · La coherencia entre kind y member_limit, impuesta por el motor ════
--
-- Va DESPUÉS de repartir, o las filas antiguas la incumplirían por el camino.
--
--   · personal: exactamente 1. Sin plaza libre, no se puede invitar ni aceptar
--     a nadie: la privada no se comparte ni por error de una función.
--   · shared: de 2 a 10. Cinco por omisión (lo pone create_shared_household).
--     Es un tope técnico de gente por nevera; el plan de la persona no lo toca.
--
-- Se conserva el CHECK 1..10 de 20260922110000 (`households_member_limit_ck`):
-- esto lo afina, no lo sustituye.
alter table public.households
  alter column member_limit set default 1,
  add constraint households_kind_limit_ck check (
    (kind = 'personal' and member_limit = 1)
    or (kind = 'shared' and member_limit between 2 and 10)
  );

comment on column public.households.member_limit is
  'Cuánta gente cabe en esta nevera: 1 en la personal, 5 por omisión en una '
  'compartida. Un tope técnico de la nevera, no un plan: lo que depende del '
  'plan es cuántas neveras puede tener una persona (user_settings.household_limit). '
  'Solo se cambia desde el servidor.';

-- ══ 5 · El tope de neveras por persona ════════════════════════════════════
alter table public.user_settings
  add column household_limit smallint not null default 2
  constraint user_settings_household_limit_ck check (household_limit between 1 and 10);

comment on column public.user_settings.household_limit is
  'Cuántas neveras puede tener esta persona, la privada incluida. Hoy 2: la '
  'suya y una compartida. Solo lo escribe el servidor; el cliente la lee (la '
  'RLS deja ver la propia fila) y no puede insertarla ni actualizarla.';

-- ══ 6 · Permisos: lo que el cliente ya no puede tocar ═════════════════════
--
-- ── households ────────────────────────────────────────────────────────────
-- Nada de UPDATE directo. Hasta ahora quedaba concedido `update (name)`, y eso
-- dejaba que CUALQUIER miembro renombrara una nevera compartida; ahora
-- renombrar y cambiar el icono es cosa del dueño, y pasa por `update_household`.
-- Se quita también la política de UPDATE: sin permiso no sirve de nada, y el
-- día que alguien conceda un UPDATE «solo para probar» no debe encontrarse una
-- política que deje a todos los miembros escribir.
drop policy households_update on public.households;

revoke all on public.households from anon, authenticated;
grant select on public.households to authenticated;

-- ── user_settings ─────────────────────────────────────────────────────────
-- LA TRAMPA: 20260922120000 concedió INSERT a nivel de TABLA
-- (`grant select, insert`). Un permiso de tabla cubre también las columnas que
-- se añadan después, y hay una política (`user_settings_insert`) que deja a
-- cada uno insertar su propia fila. Sumado, cualquier cliente podía escribir
-- `insert into user_settings (user_id, username, household_limit) values
-- (..., 10)` y regalarse cinco neveras más de las que le tocan.
--
-- Revocar la sola columna `household_limit` no sirve de nada: en PostgreSQL un
-- permiso de tabla sigue cubriéndolas todas. Hay que quitar el de tabla y
-- concederlo columna a columna, y eso deja fuera cualquier columna que no se
-- nombre aquí. Un upsert que intente tocarla (`on conflict ... do update set
-- household_limit`) también muere, porque necesita el UPDATE de esa columna.
--
-- La lista de INSERT es la de las columnas con las que un cliente puede montar
-- una fila. `username` sí entra: es NOT NULL sin valor por omisión, y el caso
-- para el que existe este permiso —alguien anterior a la tabla que no tiene
-- fila— no puede crearla sin él. Su inmutabilidad es cosa del UPDATE, que sigue
-- sin incluirlo. Quedan fuera `household_limit` y las dos marcas de tiempo.
--
-- El UPDATE va repetido tal cual: `revoke all` se lleva también los permisos
-- por columna, así que hay que volver a concederlos enteros. Es la lista de
-- 20260921160000 y no cambia; esta migración pasa a ser el único sitio donde
-- mirar los permisos de user_settings. Cada columna nueva que el cliente deba
-- poder escribir hay que añadirla aquí, y las que no, se quedan fuera solas.
revoke all on public.user_settings from anon, authenticated;

grant select on public.user_settings to authenticated;

grant insert (
  user_id,
  username,
  timezone,
  digest_enabled,
  digest_hour,
  push_token,
  push_token_updated_at,
  auto_add_to_shopping_list,
  locale
) on public.user_settings to authenticated;

grant update (
  timezone,
  digest_enabled,
  digest_hour,
  push_token,
  push_token_updated_at,
  auto_add_to_shopping_list,
  locale
) on public.user_settings to authenticated;

-- ══ 7 · El alta crea la privada ═══════════════════════════════════════════
--
-- Igual que la versión de 20260921160000 —mismo nombre de usuario, mismos
-- ajustes, mismo `on conflict`— salvo que ahora dice qué hogar es: personal,
-- una casa y una sola plaza. `household_limit` no se nombra: entra con su valor
-- por omisión, que es la única definición del 2.
--
-- «Mi casa» se conserva como nombre. Es un nombre propio, no un texto de la
-- interfaz: la persona lo cambia cuando quiera con `update_household`, y es el
-- que ya llevan todas las neveras existentes. La guía de voz pide `nevera` para
-- hablar de dónde está la comida, y así se hace en cada mensaje; aquí solo hay
-- una etiqueta que hace juego con el icono de la casa.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_username     text;
begin
  -- Del metadato que manda la app al registrarse; si no llega, de la parte
  -- local del correo, que con el correo sintético es el propio usuario.
  --
  -- ⚠️  `raw_user_meta_data` lo escribe el CLIENTE al registrarse: es la única
  -- entrada que este trigger toma de fuera y NO es nueva (venía de
  -- 20260921160000_username.sql). Esta migración no la amplía: el tipo, el
  -- icono y el límite de plazas de la privada son constantes de aquí abajo, y
  -- nada del metadato llega a ellos. Endurecer el propio `username` (validarlo
  -- aquí, no solo en `user_settings`) queda para la auditoría de seguridad
  -- (docs/internal/AUDITORIA-2026-09-24.md), no para este cambio.
  v_username := lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(new.email, '@', 1)
  ));

  -- SECURITY DEFINER es imprescindible aquí: en el instante en que corre este
  -- trigger todavía no hay sesión autenticada (el usuario se está creando), así
  -- que auth.uid() es NULL y cualquier política RLS lo rechazaría.
  insert into public.households (name, kind, icon, member_limit)
  values ('Mi casa', 'personal', 'house', 1)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  insert into public.user_settings (user_id, username)
  values (new.id, v_username)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea la nevera privada, la pertenencia y los ajustes al registrarse. '
  'Garantiza que ningún usuario se queda sin nevera.';

-- ══ 8 · Un elemento no cambia de nevera ═══════════════════════════════════
--
-- `inventory_items`, `shopping_list_items` y `products` cuelgan de un hogar, y
-- ninguna de las tres tenía nada que impidiera reescribir `household_id`: las
-- políticas de UPDATE comprueban que quien escribe es miembro de la nevera de
-- la fila (`using`) y de la nueva (`with check`), y con dos pertenencias las dos
-- comprobaciones pasan. El resultado, reproducido: el alimento cambia de nevera
-- sin dejar rastro en el historial, que se queda en la vieja, y contradice la
-- regla de que el inventario es de la nevera.
--
-- Un trigger BEFORE UPDATE y no un CHECK, porque un CHECK no ve el valor
-- anterior. Solo se dispara si la columna cambia de verdad (`when`), así que
-- escribir la misma nevera, o cualquier otra columna, no lo toca. Se aplica a
-- TODOS los roles, `service_role` incluido: mover algo de nevera nunca es una
-- edición, y quien de verdad lo necesite —una fusión de neveras, una
-- migración— desactiva el trigger a propósito y a la vista.
--
-- `products.household_id` admite NULL: null es el catálogo global (caché de
-- Open Food Facts), y un valor es un producto privado de una nevera. Aquí los
-- cambios con NULL se rechazan igual que los demás, `null → nevera` y
-- `nevera → null` incluidos: convertir un producto privado en global, o al
-- revés, no es editarlo sino publicarlo o retirarlo del catálogo, además de
-- exigir cambiar `data_source` a la vez (`products_source_ck`). Es un proceso de
-- servidor con nombre propio, no un UPDATE. Quien actualiza un producto global
-- sin tocar su hogar (el upsert de `lookup-barcode`) no se ve afectado.
--
-- Mensaje en español y con salida: dice qué no se puede y qué hacer. Es P0001
-- y no un código de restricción, para que la app lo enseñe tal cual.
create function public.forbid_household_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', case tg_table_name
    when 'inventory_items'      then 'Un alimento no se puede pasar a otra nevera. Añádelo en la otra y termínalo aquí.'
    when 'shopping_list_items'  then 'Una línea de la lista no se puede pasar a otra nevera. Apúntala en la otra y bórrala aquí.'
    else                             'Un producto no se puede pasar a otra nevera. Créalo en la otra.'
  end
    using errcode = 'P0001';
end;
$$;

comment on function public.forbid_household_change() is
  'Trigger BEFORE UPDATE OF household_id: una fila no cambia de nevera. Solo '
  'salta cuando el valor cambia de verdad. Interna: no se concede a nadie.';

revoke all on function public.forbid_household_change() from public, anon, authenticated;

create trigger inventory_items_forbid_household_change
  before update of household_id on public.inventory_items
  for each row when (new.household_id is distinct from old.household_id)
  execute function public.forbid_household_change();

create trigger shopping_list_items_forbid_household_change
  before update of household_id on public.shopping_list_items
  for each row when (new.household_id is distinct from old.household_id)
  execute function public.forbid_household_change();

create trigger products_forbid_household_change
  before update of household_id on public.products
  for each row when (new.household_id is distinct from old.household_id)
  execute function public.forbid_household_change();

-- ══ 9 · Comprobación de lo que acaba de hacerse ═══════════════════════════
--
-- Si el reparto de arriba dejara a alguien sin privada, o con dos, lo que
-- viene después —las funciones— fallaría de formas que no se parecen a la
-- causa. Mejor que reviente aquí, con el nombre de lo que falta.
do $$
declare
  v_mal integer;
begin
  select count(*) into v_mal
  from auth.users u
  where (
    select count(*)
    from public.household_members m
    join public.households h on h.id = m.household_id
    where m.user_id = u.id and h.kind = 'personal'
  ) <> 1;

  if v_mal > 0 then
    raise exception 'Tras el reparto hay % usuarios sin exactamente una nevera privada', v_mal;
  end if;

  select count(*) into v_mal
  from public.households h
  where h.kind = 'personal'
    and (select count(*) from public.household_members m where m.household_id = h.id) > 1;

  if v_mal > 0 then
    raise exception 'Tras el reparto hay % neveras personales con más de una persona', v_mal;
  end if;
end;
$$;
