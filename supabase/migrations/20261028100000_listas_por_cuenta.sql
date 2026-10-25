-- ═════════════════════════════════════════════════════════════════
-- Listas individuales y compartidas; productos y tope de neveras por cuenta
--
-- Hasta ahora una lista de la compra era de una NEVERA: quien compartía la nevera compartía
-- sus listas, y cada nevera podía tener hasta 3 (básico) o 10 (premium). No tenía sentido que
-- una nevera compartida tuviera hasta diez listas «de todos», ni que lo tuyo (tus listas, tus
-- productos) dependiera de qué nevera estabas mirando.
--
-- ── El modelo nuevo ───────────────────────────────────────────────────────
--
--   · Una lista es INDIVIDUAL (`kind = 'personal'`) o COMPARTIDA (`kind = 'shared'`).
--       individual  → es de la cuenta (`owner_id`), no cuelga de ninguna nevera, solo la ve su
--                     dueña/o y se usa desde cualquier nevera.
--       compartida  → cuelga de una nevera (`household_id`) y la ven todos sus miembros, como
--                     hasta ahora.
--   · El tope es POR CUENTA y cuenta lo que ha creado esa persona:
--       básico   → 1 compartida + 1 individual (2 en total)
--       premium  → 5 en total, de cualquier tipo
--   · Las neveras nacen SIN lista. La cuenta nace con una individual, «La compra», y la
--     compartida la crea quien quiere compartir, eligiendo en qué nevera. Siempre queda al menos
--     una lista individual (la última no se borra).
--   · El tope de NEVERAS por cuenta sigue en `user_settings.household_limit` (cuenta la privada),
--     pero ahora lo fija el plan: 2 en básico y 5 en premium.
--   · «Tus productos» (`my_known_products`) deja de ser de una nevera: sin argumento, junta lo que
--     has añadido tú en todas las tuyas.
--
-- ── Lo que ya existe se conserva ──────────────────────────────────────────
--
-- Las listas de una nevera COMPARTIDA siguen siendo compartidas, con sus líneas, aunque pasen
-- del tope nuevo: no se borra nada, solo deja de dejar crear más. Las de una nevera PRIVADA (que
-- solo veía una persona) pasan a ser individuales de esa persona, con sus líneas. Quien no tuviera
-- ninguna recibe «La compra».
--
-- ── Lo que se comprueba y dónde ───────────────────────────────────────────
--
--   · Quién ve qué lo dice la RLS. Las líneas heredan la visibilidad de su lista.
--   · Los topes los impone el trigger de `shopping_lists`, contando con la RLS de quien escribe.
--     Una lista compartida que creaste en una nevera de la que luego saliste ya no la ves y no
--     cuenta: no se persigue, porque saltarse un tope de comodidad así exige que te inviten otra
--     vez a esa nevera cada vez.
--   · Pasar una línea comprada al inventario necesita una nevera de destino: la de la lista si es
--     compartida, y la que se diga (`p_household_id`) si la lista es individual.
-- ═════════════════════════════════════════════════════════════════

-- ── 1 · La lista: de la cuenta o de una nevera ───────────────────────────

alter table public.shopping_lists
  add column kind text not null default 'shared'
    constraint shopping_lists_kind_ck check (kind in ('personal', 'shared')),
  add column owner_id uuid references auth.users (id) on delete cascade;

alter table public.shopping_lists alter column household_id drop not null;

alter table public.shopping_lists
  add constraint shopping_lists_scope_ck check (
    (kind = 'shared'   and household_id is not null and owner_id is null)
    or (kind = 'personal' and household_id is null and owner_id is not null)
  );

comment on column public.shopping_lists.kind is
  'personal = individual, de la cuenta (owner_id) y sin nevera; shared = compartida, de una nevera '
  '(household_id) y visible para todos sus miembros.';
comment on column public.shopping_lists.owner_id is
  'La dueña o dueño de una lista individual. NULL en las compartidas. Se va con la cuenta.';
comment on table public.shopping_lists is
  'Las listas de la compra: individuales (de una cuenta) y compartidas (de una nevera). Cada '
  'cuenta tiene siempre al menos una individual.';

create index shopping_lists_owner_idx
  on public.shopping_lists (owner_id, created_at, id)
  where kind = 'personal';

-- Las líneas de una lista individual no cuelgan de ninguna nevera.
alter table public.shopping_list_items alter column household_id drop not null;

comment on column public.shopping_list_items.household_id is
  'La nevera de la línea: la de su lista si es compartida. NULL en las líneas de una lista '
  'individual (que es de la cuenta).';

-- ── 2 · Las reglas de las listas ─────────────────────────────────────────
--
-- SECURITY INVOKER (el valor por omisión): cuenta con la RLS de quien escribe y `my_plan()` mira su
-- fila. Sin sesión (`auth.uid()` nulo: el alta de la cuenta, una migración) no hay persona a la que
-- aplicar un tope y no se aplica ninguno; un cliente siempre trae sesión, y `anon` no puede escribir.

create or replace function public.check_shopping_list()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_basico_compartidas  constant integer := 1;
  c_basico_individuales constant integer := 1;
  c_premium             constant integer := 5;
  v_uid          uuid := (select auth.uid());
  v_compartidas  integer;
  v_individuales integer;
begin
  if tg_op = 'INSERT' then
    new.name := trim(new.name);
    if v_uid is not null then
      new.created_by := v_uid;
    end if;

    -- Una individual es de quien la crea y no cuelga de ninguna nevera; una compartida no tiene
    -- dueña. Lo que mande el cliente en esas dos columnas se pisa.
    if new.kind = 'personal' then
      if v_uid is not null then
        new.owner_id := v_uid;
      end if;
      new.household_id := null;
    else
      new.owner_id := null;
      -- Una compartida en una nevera que no es de quien escribe no se mira aquí: que hable la RLS
      -- (42501) y no un aviso de tope. El WITH CHECK corre DESPUÉS de este trigger.
      if not public.is_household_member(new.household_id) then
        return new;
      end if;
    end if;

    if v_uid is not null then
      -- Dos altas de la misma persona a la vez (un doble toque) no se cuelan por encima del tope
      -- una a la otra: la segunda espera a que la primera acabe y entonces cuenta.
      perform pg_advisory_xact_lock(hashtextextended('shopping_lists:' || v_uid::text, 0));

      select count(*) filter (where l.kind = 'shared' and l.created_by = v_uid),
             count(*) filter (where l.kind = 'personal' and l.owner_id = v_uid)
        into v_compartidas, v_individuales
        from public.shopping_lists l;

      if public.my_plan() = 'premium' then
        if v_compartidas + v_individuales >= c_premium then
          raise exception 'Has llegado al máximo de % listas.', c_premium
            using errcode = 'P0001', hint = 'listas_maximo';
        end if;
      elsif new.kind = 'shared' and v_compartidas >= c_basico_compartidas then
        raise exception 'Con el plan básico puedes tener % lista compartida. Opsi Premium ⭐ te da más.', c_basico_compartidas
          using errcode = 'P0001', hint = 'listas_limite_compartida';
      elsif new.kind = 'personal' and v_individuales >= c_basico_individuales then
        raise exception 'Con el plan básico puedes tener % lista individual. Opsi Premium ⭐ te da más.', c_basico_individuales
          using errcode = 'P0001', hint = 'listas_limite_individual';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.name := trim(new.name);
    return new;
  end if;

  -- DELETE. Una compartida se borra sin más. De las individuales siempre queda una, salvo que sea
  -- el borrado en cascada de la cuenta entera (viene de otro trigger: profundidad mayor que 1).
  if old.kind = 'personal'
     and pg_trigger_depth() <= 1
     and (select count(*) from public.shopping_lists l
           where l.kind = 'personal' and l.owner_id = old.owner_id) <= 1 then
    raise exception 'Tiene que quedar al menos una lista individual.'
      using errcode = 'P0001', hint = 'lista_ultima';
  end if;
  return old;
end;
$$;

comment on function public.check_shopping_list() is
  'Trigger de shopping_lists: created_by y owner_id siempre quien escribe; tope POR CUENTA (básico: 1 '
  'compartida + 1 individual, premium: 5 en total); y no se borra la última individual.';

-- Neveras y cuentas: la lista de cada nevera ya no nace sola.
drop trigger households_create_default_list on public.households;
drop function public.create_default_list();

-- ── 3 · Las reglas de las líneas ─────────────────────────────────────────
--
-- La lista manda: la línea es de la nevera de su lista (o de ninguna, si es individual) y su
-- visibilidad es la de la lista. La nevera de la línea no se fía del cliente: tiene que coincidir.

create or replace function public.check_shopping_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_tope constant integer := 300;
  v_lista public.shopping_lists;
begin
  if tg_op = 'UPDATE' then
    -- Quién la puso y de dónde salió no cambian: son la prueba de qué pasó.
    if new.source is distinct from old.source then
      raise exception 'De dónde salió una línea de la lista no se puede cambiar.'
        using errcode = '22023';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'Quién apuntó una línea de la lista no se puede cambiar.'
        using errcode = '22023';
    end if;
    if new.list_id is distinct from old.list_id and not exists (
      select 1 from public.shopping_lists l
       where l.id = new.list_id and l.household_id is not distinct from new.household_id
    ) then
      raise exception 'Esa lista no existe o no es de esta nevera.' using errcode = 'P0002';
    end if;
    if new.product_id is not distinct from old.product_id then
      return new;
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- A nombre de quien escribe, y de nadie más. Un valor que mande el cliente se
    -- pisa: no hay forma legítima de apuntar algo «de parte de» otra persona.
    new.created_by := (select auth.uid());

    -- El principio del proyecto: nada se apunta solo salvo que la persona lo haya
    -- encendido. Aquí es donde se cumple, y no en un comentario.
    if new.source = 'auto_restock'
       and not coalesce(
         (select s.auto_add_to_shopping_list
            from public.user_settings s
           where s.user_id = (select auth.uid())),
         false
       ) then
      raise exception 'Tienes apagado apuntar lo que se acaba. Se puede encender en Ajustes.'
        using errcode = 'P0001', hint = 'autoanadir_apagado';
    end if;

    if new.list_id is null then
      raise exception 'Elige en qué lista se apunta.' using errcode = '22023';
    end if;

    -- La lista, con la RLS de quien escribe. Si no se ve (de otra persona o de una nevera ajena) no
    -- se lanza nada aquí: que hable la RLS (42501) y no un aviso que dijera que «no existe».
    select * into v_lista from public.shopping_lists l where l.id = new.list_id;
    if not found then
      return new;
    end if;
    if new.household_id is distinct from v_lista.household_id then
      raise exception 'Esa lista no existe o no es de esta nevera.' using errcode = 'P0002';
    end if;

    -- Un tope por lista, contando lo ya comprado. Es una red contra un cliente que
    -- se descontrola, no una limitación pensada para nadie.
    if (select count(*) from public.shopping_list_items i
         where i.list_id = new.list_id) >= c_tope then
      raise exception 'La lista está llena (% líneas). Quita lo ya comprado o lo que sobre antes de apuntar más.', c_tope
        using errcode = 'P0001', hint = 'lista_llena';
    end if;
  end if;

  -- El producto, si lo hay, es del catálogo global o de la nevera de la línea; en una lista
  -- individual vale cualquiera que la persona vea (global, o privado de una nevera suya: la RLS de
  -- `products` solo deja ver esos). Mismo mensaje para «no existe» y «no es tuyo».
  if new.product_id is not null and not exists (
    select 1 from public.products p
     where p.id = new.product_id
       and (p.household_id is null
            or new.household_id is null
            or p.household_id = new.household_id)
  ) then
    raise exception 'Ese producto no existe o no es de esta nevera.'
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

comment on function public.check_shopping_item() is
  'Trigger de la lista de la compra: auto_restock solo si la persona lo encendió, created_by siempre '
  'quien escribe, la nevera de la línea es la de su lista (ninguna si es individual), producto global o '
  'de esa nevera, y un tope por lista.';

-- ── 4 · Quién ve qué ─────────────────────────────────────────────────────

drop policy shopping_lists_select on public.shopping_lists;
drop policy shopping_lists_insert on public.shopping_lists;
drop policy shopping_lists_update on public.shopping_lists;
drop policy shopping_lists_delete on public.shopping_lists;

create policy shopping_lists_select on public.shopping_lists
  for select to authenticated
  using (
    (kind = 'shared' and public.is_household_member(household_id))
    or (kind = 'personal' and owner_id = (select auth.uid()))
  );

create policy shopping_lists_insert on public.shopping_lists
  for insert to authenticated
  with check (
    (kind = 'shared' and public.is_household_member(household_id))
    or (kind = 'personal' and owner_id = (select auth.uid()))
  );

create policy shopping_lists_update on public.shopping_lists
  for update to authenticated
  using (
    (kind = 'shared' and public.is_household_member(household_id))
    or (kind = 'personal' and owner_id = (select auth.uid()))
  )
  with check (
    (kind = 'shared' and public.is_household_member(household_id))
    or (kind = 'personal' and owner_id = (select auth.uid()))
  );

create policy shopping_lists_delete on public.shopping_lists
  for delete to authenticated
  using (
    (kind = 'shared' and public.is_household_member(household_id))
    or (kind = 'personal' and owner_id = (select auth.uid()))
  );

-- Al crear solo se elige el tipo, la nevera (si es compartida) y el nombre: quién la crea y de
-- quién es lo pone el trigger. Al editar, solo el nombre: una lista no cambia de tipo ni de nevera.
revoke all on public.shopping_lists from anon, authenticated;
grant select, delete on public.shopping_lists to authenticated;
grant insert (household_id, name, kind) on public.shopping_lists to authenticated;
grant update (name) on public.shopping_lists to authenticated;

-- Las líneas ven lo que ve su lista: la RLS de `shopping_lists` hace de filtro.
drop policy shopping_list_items_select on public.shopping_list_items;
drop policy shopping_list_items_insert on public.shopping_list_items;
drop policy shopping_list_items_update on public.shopping_list_items;
drop policy shopping_list_items_delete on public.shopping_list_items;

create policy shopping_list_items_select on public.shopping_list_items
  for select to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id));

create policy shopping_list_items_insert on public.shopping_list_items
  for insert to authenticated
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id));

create policy shopping_list_items_update on public.shopping_list_items
  for update to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id))
  with check (exists (select 1 from public.shopping_lists l where l.id = list_id));

create policy shopping_list_items_delete on public.shopping_list_items
  for delete to authenticated
  using (exists (select 1 from public.shopping_lists l where l.id = list_id));

-- ── 5 · Lo que ya existe ─────────────────────────────────────────────────
--
-- Las listas de una nevera privada (`kind = 'personal'`, una sola persona) pasan a ser individuales
-- de esa persona, con sus líneas. `shopping_list_items_forbid_household_change` impide mover una
-- línea de nevera a propósito (ver 20260924100000): esto SÍ es una migración, así que se apaga a
-- la vista, solo durante estas dos sentencias, y se vuelve a encender.

alter table public.shopping_list_items disable trigger shopping_list_items_forbid_household_change;

update public.shopping_list_items i
   set household_id = null
  from public.shopping_lists l
  join public.households h on h.id = l.household_id
 where i.list_id = l.id
   and h.kind = 'personal';

update public.shopping_lists l
   set kind         = 'personal',
       owner_id     = (select m.user_id from public.household_members m where m.household_id = l.household_id limit 1),
       household_id = null
  from public.households h
 where h.id = l.household_id
   and h.kind = 'personal';

alter table public.shopping_list_items enable trigger shopping_list_items_forbid_household_change;

-- Quien se quedara sin ninguna individual (no debería pasar) recibe «La compra».
insert into public.shopping_lists (kind, owner_id, created_by, name)
select 'personal', s.user_id, s.user_id, 'La compra'
  from public.user_settings s
 where not exists (
   select 1 from public.shopping_lists l where l.kind = 'personal' and l.owner_id = s.user_id
 );

-- ── 6 · La cuenta nueva nace con su lista individual ─────────────────────
--
-- Igual que la versión de 20260924160000_alta_estricta.sql, más la lista individual. SECURITY
-- DEFINER y sin sesión: el trigger de `shopping_lists` no aplica ningún tope sin `auth.uid()`.

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
  -- 1 · Solo el correo sintético, que es como se crean las cuentas.
  --
  -- El dominio se compara escapando los puntos, porque en una expresión regular
  -- `.` es «cualquier carácter»: sin escapar, `ana@usuariosXopsiYlocal` pasaría.
  if new.email is null
     or lower(new.email) !~ (
          '^[a-z0-9_]{3,20}@' || replace(public.dominio_sintetico(), '.', '\.') || '$'
        )
  then
    -- 42501 (permiso denegado) y no 22023: no es un dato mal escrito, es una
    -- puerta que no está abierta. GoTrue lo devuelve como «Database error saving
    -- new user», y no cuenta nada más de por qué.
    raise exception 'El registro solo admite usuarios de Opsi.'
      using errcode = '42501';
  end if;

  -- 2 · El nombre sale del correo, NUNCA de los metadatos: los escribe el
  -- cliente, y un nombre visible que el cliente elige a su gusto es un nombre
  -- que se puede suplantar.
  v_username := lower(split_part(new.email, '@', 1));

  -- 3 · Nombres reservados. Que nadie pueda hacerse pasar por la casa.
  if v_username = any (array[
       'admin', 'administrador', 'opsi', 'soporte', 'support',
       'root', 'sistema', 'system', 'ayuda', 'help'
     ])
  then
    raise exception 'Ese usuario no está disponible.'
      using errcode = '42501';
  end if;

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

  -- Su lista individual. Las neveras ya no traen la suya.
  insert into public.shopping_lists (kind, owner_id, name)
  values ('personal', new.id, 'La compra');

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea la nevera privada, la pertenencia, los ajustes y la lista individual «La compra» al registrarse. '
  'Solo admite correos sintéticos y saca el nombre del correo, no de los metadatos, que los escribe el '
  'cliente.';

-- ── 7 · Pasar lo comprado al inventario ──────────────────────────────────
--
-- Una línea de una lista compartida va a la nevera de su lista. Una de una lista individual no
-- tiene nevera: hay que decir cuál (`p_household_id`). El resto, igual que antes. La firma cambia
-- (un parámetro más al final, con valor por omisión), así que se borra la anterior.

drop function public.stock_from_list(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category
);

create function public.stock_from_list(
  p_list_item_id  uuid,
  p_name          text,
  p_unit_family   public.unit_family,
  p_display_unit  public.measurement_unit,
  p_quantity      numeric,
  p_location      public.storage_location default 'pantry',
  p_limit_date    date                    default null,
  p_date_kind     public.date_kind        default null,
  p_date_source   public.date_source      default null,
  p_product_id    uuid                    default null,
  p_notes         text                    default null,
  p_category      public.food_category    default 'otros',
  p_household_id  uuid                    default null
)
returns public.inventory_items
language plpgsql
set search_path = ''
as $$
declare
  v_linea    public.shopping_list_items;
  v_destino  uuid;
  v_producto uuid;
  v_item     public.inventory_items;
begin
  select * into v_linea
    from public.shopping_list_items
   where id = p_list_item_id
     for update;

  if not found then
    raise exception 'Esa línea de la lista ya no existe.' using errcode = 'P0002';
  end if;

  if v_linea.is_purchased then
    raise exception 'Eso ya está marcado como comprado.' using errcode = 'P0001';
  end if;

  -- La nevera de destino: la de la lista si es compartida; si es individual, la que se diga.
  if v_linea.household_id is not null then
    if p_household_id is not null and p_household_id <> v_linea.household_id then
      raise exception 'Esa línea es de otra nevera.' using errcode = '22023';
    end if;
    v_destino := v_linea.household_id;
  else
    if p_household_id is null then
      raise exception 'Elige en qué nevera lo guardas.' using errcode = '22023';
    end if;
    v_destino := p_household_id;
  end if;

  -- El producto de la línea solo vale si es global o de la nevera de destino: uno privado de otra
  -- nevera no se puede enlazar (create_item lo rechazaría), y la comida se guarda por su nombre.
  v_producto := coalesce(
    p_product_id,
    (select p.id from public.products p
      where p.id = v_linea.product_id
        and (p.household_id is null or p.household_id = v_destino))
  );

  -- Todo lo de `create_item` se comprueba ahí: la nevera, la cantidad, la fecha, el producto.
  -- Si falla, la línea no se toca (la función entera es una transacción).
  v_item := public.create_item(
    v_destino, p_name, p_unit_family, p_display_unit, p_quantity,
    p_location, p_limit_date, p_date_kind, p_date_source,
    v_producto, p_notes, p_category
  );

  update public.shopping_list_items
     set is_purchased = true, purchased_at = now()
   where id = v_linea.id;

  return v_item;
end;
$$;

comment on function public.stock_from_list is
  'Marca una línea de la lista como comprada y da de alta el elemento en el inventario, en la misma '
  'transacción. La nevera sale de la lista si es compartida; si es individual hay que pasar '
  'p_household_id.';

revoke all on function public.stock_from_list(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category, uuid
) from public, anon;

grant execute on function public.stock_from_list(
  uuid, text, public.unit_family, public.measurement_unit, numeric,
  public.storage_location, date, public.date_kind, public.date_source, uuid, text,
  public.food_category, uuid
) to authenticated;

-- ── 8 · Cuántas neveras, según el plan ───────────────────────────────────
--
-- `household_limit` sigue siendo el único sitio donde las funciones de neveras leen el tope (cuenta
-- la privada): 2 en básico, 5 en premium. Lo fija el plan, para que cambiar de plan no deje un
-- número viejo. Solo salta cuando el plan cambia de verdad; el plan solo lo escribe el servidor.

create function public.sync_household_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.household_limit := case when new.plan = 'premium' then 5 else 2 end;
  return new;
end;
$$;

comment on function public.sync_household_limit() is
  'Trigger de user_settings: al cambiar el plan, household_limit pasa a 5 (premium) o a 2 (básico). '
  'Interna: no se concede a nadie.';

revoke all on function public.sync_household_limit() from public, anon, authenticated;

create trigger user_settings_sync_household_limit
  before update of plan on public.user_settings
  for each row when (new.plan is distinct from old.plan)
  execute function public.sync_household_limit();

update public.user_settings set household_limit = 5 where plan = 'premium';

-- ── 9 · Tus productos, de la cuenta ──────────────────────────────────────
--
-- Sin nevera (`p_household_id` nulo) junta lo que has añadido tú en TODAS las tuyas (la RLS de
-- `inventory_items` ya limita a las neveras de quien llama); con una, sigue siendo lo de esa nevera.
-- Devuelve además en qué nevera lo añadiste la última vez (`household_id`): hace falta para saber si
-- un producto privado de esa nevera se puede enlazar al guardarlo en otra. El tipo de salida cambia,
-- así que se borra y se crea.

drop function public.my_known_products(uuid, integer);

create function public.my_known_products(
  p_household_id uuid    default null,
  p_limit        integer default 100
)
returns table (
  product_id     uuid,
  product_name   text,
  brand          text,
  barcode        text,
  data_source    text,
  category       public.food_category,
  unit_family    public.unit_family,
  display_unit   public.measurement_unit,
  quantity       numeric,
  times_added    integer,
  first_added_at timestamptz,
  last_added_at  timestamptz,
  in_stock       integer,
  household_id   uuid
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.my_plan() <> 'premium' then
    raise exception 'Esto es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Pide entre 1 y 200 productos.' using errcode = '22023';
  end if;

  -- Lo último que añadiste de cada cosa manda: su nombre, su pasillo, su cantidad y su
  -- unidad son los que se proponen al volver a guardarla.
  return query
  with mias as (
    select i.product_id as pid,
           i.household_id as casa,
           i.name       as nombre,
           i.category   as pasillo,
           i.unit_family as familia,
           i.display_unit as unidad,
           i.initial_quantity as cantidad,
           i.created_at as creado,
           coalesce(i.product_id::text, lower(trim(i.name))) as clave
      from public.inventory_items i
     where (p_household_id is null or i.household_id = p_household_id)
       and i.created_by = (select auth.uid())
  ),
  agrupado as (
    select m.clave,
           (array_agg(m.pid order by m.creado desc) filter (where m.pid is not null))[1] as pid,
           (array_agg(m.casa order by m.creado desc))[1]     as casa,
           (array_agg(m.nombre order by m.creado desc))[1]   as nombre,
           (array_agg(m.pasillo order by m.creado desc))[1]  as pasillo,
           (array_agg(m.familia order by m.creado desc))[1]  as familia,
           (array_agg(m.unidad order by m.creado desc))[1]   as unidad,
           (array_agg(m.cantidad order by m.creado desc))[1] as cantidad,
           count(*)::integer as veces,
           min(m.creado) as primera,
           max(m.creado) as ultima
      from mias m
     group by m.clave
  )
  select a.pid,
         a.nombre,
         p.brand,
         p.barcode,
         p.data_source::text,
         a.pasillo,
         a.familia,
         a.unidad,
         a.cantidad,
         a.veces,
         a.primera,
         a.ultima,
         (select count(*)::integer
            from public.inventory_items j
           where (p_household_id is null or j.household_id = p_household_id)
             and j.state not in ('finished', 'discarded')
             and coalesce(j.product_id::text, lower(trim(j.name))) = a.clave),
         a.casa
    from agrupado a
    left join public.products p on p.id = a.pid
   order by a.ultima desc
   limit p_limit;
end;
$$;

comment on function public.my_known_products(uuid, integer) is
  'Premium. La ficha de lo que ha añadido quien llama, sin repetidos y lo último primero: código y '
  'origen (escaneado o a mano), pasillo, cuántas veces, cuánto hay ahora y en qué nevera lo añadió '
  'la última vez. Sin nevera, de todas las suyas. No hay tabla: sale de inventory_items, acotado '
  'por su RLS y por created_by.';

revoke all on function public.my_known_products(uuid, integer) from public, anon;
grant execute on function public.my_known_products(uuid, integer) to authenticated;
