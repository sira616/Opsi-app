-- ═══════════════════════════════════════════════════════════════════════════
-- Varias listas de la compra, y la base de Opsi Premium
--
-- Dos cosas que se piden juntas y se apoyan la una en la otra: poder tener más de
-- una lista (con un tope en el plan básico), y que exista una forma de decir qué
-- plan tiene cada persona para que ese tope —y otras cosas— cambien.
--
-- ── El plan ──────────────────────────────────────────────────────────────
--
-- `user_settings.plan` ('basic' | 'premium'). Es del SERVIDOR, igual que
-- `household_limit`: ningún permiso de columna deja al cliente escribirlo, ni en
-- un INSERT ni en un UPDATE. Hoy solo lo cambia quien tiene acceso a la base de
-- datos (`npm run dev:plan` en local). Cuando haya pago, lo escribirá la función
-- que reciba el aviso del proveedor, y nada de esto tendrá que cambiar.
--
-- Todo lo premium se comprueba AQUÍ y no en la app: ocultar un botón no es una
-- puerta. La app solo enseña candados.
--
-- ── Las listas ───────────────────────────────────────────────────────────
--
-- Cada nevera tiene al menos una lista, «La compra», que se crea con la nevera (y
-- se crea ahora para las que ya existen). El plan básico deja tener hasta 3 por
-- nevera, la primera incluida; premium, hasta 20: no es un valor de venta sino una
-- red contra un cliente que se descontrola. Quien cuenta es la persona que crea la
-- lista, no la dueña de la nevera: una nevera compartida con una persona premium
-- puede tener más listas, y la básica no podrá crear más hasta que sobre sitio.
--
-- Una línea sin lista va a la primera (la más antigua): así lo que se apunta desde
-- sitios que no eligen lista —«¿lo apunto?» al agotarse algo— sigue funcionando.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── El plan y el color ───────────────────────────────────────────────────

alter table public.user_settings
  add column plan text not null default 'basic'
    constraint user_settings_plan_ck check (plan in ('basic', 'premium')),
  add column accent text not null default 'green'
    constraint user_settings_accent_ck
      check (accent in ('green', 'blue', 'yellow', 'orange', 'pink', 'white'));

comment on column public.user_settings.plan is
  'Plan de la cuenta. Solo lo escribe el servidor: ningún permiso de columna lo concede.';
comment on column public.user_settings.accent is
  'Color base de la app. Todos menos green son de Opsi Premium: lo impone user_settings_check_accent.';

-- El color sí lo elige la persona. Es la única columna nueva con permiso de
-- escritura; `plan` se queda fuera sola (ver 20260924100000: el permiso es por
-- columna y lo que no se nombra no se concede).
grant update (accent) on public.user_settings to authenticated;

create function public.check_accent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Se compara con el plan de LA FILA, que el cliente no puede cambiar, y no con
  -- `my_plan()`: así también vale cuando escribe alguien sin `auth.uid()`.
  if new.accent <> 'green' and new.plan <> 'premium' then
    raise exception 'Ese color es de Opsi Premium ⭐.'
      using errcode = '42501', hint = 'premium';
  end if;
  return new;
end;
$$;

comment on function public.check_accent() is
  'Trigger de user_settings: un color distinto del verde exige plan premium.';

create trigger user_settings_check_accent
  before insert or update of accent on public.user_settings
  for each row execute function public.check_accent();

revoke all on function public.check_accent() from public, anon, authenticated;

-- El plan de quien llama. SECURITY INVOKER: lee su propia fila por la RLS. Sin fila,
-- básico: es el valor seguro.
create function public.my_plan()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select s.plan from public.user_settings s where s.user_id = (select auth.uid())),
    'basic'
  );
$$;

comment on function public.my_plan() is
  'El plan de la persona que llama (basic o premium). Sin ajustes, basic.';

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ── Las listas ───────────────────────────────────────────────────────────

create table public.shopping_lists (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 40),
  created_by    uuid references auth.users (id) on delete set null,
  -- `clock_timestamp()` y no `now()`: `now()` es la hora de la TRANSACCIÓN, y dos listas
  -- creadas en la misma empatarían, con lo que "la primera" dejaría de estar definida.
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now()
);

comment on table public.shopping_lists is
  'Las listas de la compra de una nevera. Siempre hay al menos una.';

create index shopping_lists_household_idx
  on public.shopping_lists (household_id, created_at, id);

create trigger shopping_lists_touch_updated_at
  before update on public.shopping_lists
  for each row execute function public.touch_updated_at();

alter table public.shopping_lists enable row level security;

create policy shopping_lists_select on public.shopping_lists
  for select to authenticated
  using (public.is_household_member(household_id));

create policy shopping_lists_insert on public.shopping_lists
  for insert to authenticated
  with check (public.is_household_member(household_id));

create policy shopping_lists_update on public.shopping_lists
  for update to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy shopping_lists_delete on public.shopping_lists
  for delete to authenticated
  using (public.is_household_member(household_id));

-- Permisos por columna: al crear, solo se elige la nevera y el nombre (quién la crea
-- lo pone el trigger); al editar, solo el nombre. Una lista no cambia de nevera.
revoke all on public.shopping_lists from anon, authenticated;
grant select, delete on public.shopping_lists to authenticated;
grant insert (household_id, name) on public.shopping_lists to authenticated;
grant update (name) on public.shopping_lists to authenticated;

-- Las reglas: quién la crea, cuántas caben, y que no se borre la última.
-- SECURITY INVOKER: cuenta con la RLS de quien escribe, y `my_plan()` mira su fila.
create function public.check_shopping_list()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_basico constant integer := 3;
  c_premium constant integer := 20;
  v_tope integer;
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.name := trim(new.name);

    v_tope := case when public.my_plan() = 'premium' then c_premium else c_basico end;
    if (select count(*) from public.shopping_lists l
         where l.household_id = new.household_id) >= v_tope then
      if v_tope = c_basico then
        raise exception 'Con el plan básico puedes tener hasta % listas. Opsi Premium ⭐ te da más.', c_basico
          using errcode = 'P0001', hint = 'listas_limite';
      end if;
      raise exception 'Has llegado al máximo de % listas.', c_premium
        using errcode = 'P0001', hint = 'listas_maximo';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.name := trim(new.name);
    return new;
  end if;

  -- DELETE: siempre queda una. Si la nevera ya no existe, es el borrado en cascada
  -- de la propia nevera y se deja pasar.
  if exists (select 1 from public.households h where h.id = old.household_id)
     and (select count(*) from public.shopping_lists l
           where l.household_id = old.household_id) <= 1 then
    raise exception 'Tiene que quedar al menos una lista.'
      using errcode = 'P0001', hint = 'lista_ultima';
  end if;
  return old;
end;
$$;

comment on function public.check_shopping_list() is
  'Trigger de shopping_lists: created_by siempre quien escribe, tope de 3 listas por '
  'nevera en el plan básico (20 en premium) y no se borra la última.';

create trigger shopping_lists_check
  before insert or update or delete on public.shopping_lists
  for each row execute function public.check_shopping_list();

revoke all on function public.check_shopping_list() from public, anon, authenticated;

-- La lista de cada nevera nueva. SECURITY DEFINER porque, cuando se crea la nevera,
-- quien la crea todavía no es miembro y la RLS no le dejaría escribir. No coge nada
-- de fuera: solo el id de la nevera que acaba de nacer.
create function public.create_default_list()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.shopping_lists (household_id, name) values (new.id, 'La compra');
  return new;
end;
$$;

comment on function public.create_default_list() is
  'Trigger de households: cada nevera nace con su lista «La compra».';

create trigger households_create_default_list
  after insert on public.households
  for each row execute function public.create_default_list();

revoke all on function public.create_default_list() from public, anon, authenticated;

-- Las neveras que ya existen.
insert into public.shopping_lists (household_id, name)
select h.id, 'La compra' from public.households h;

-- ── Las líneas, en su lista ──────────────────────────────────────────────

alter table public.shopping_list_items
  add column list_id uuid references public.shopping_lists (id) on delete cascade;

update public.shopping_list_items i
   set list_id = (
     select l.id from public.shopping_lists l
      where l.household_id = i.household_id
      order by l.created_at, l.id
      limit 1
   );

alter table public.shopping_list_items alter column list_id set not null;

create index shopping_list_items_list_idx
  on public.shopping_list_items (list_id, created_at desc);

-- El trigger de las líneas, con lo de la lista: sin lista va a la primera, y la lista
-- tiene que ser de LA MISMA nevera que la línea. Sin esa comprobación, quien está en
-- dos neveras podría colgar una línea de una en la lista de la otra.
create or replace function public.check_shopping_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_tope constant integer := 300;
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
       where l.id = new.list_id and l.household_id = new.household_id
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

    -- Un tope por nevera, contando lo ya comprado. Es una red contra un cliente que
    -- se descontrola, no una limitación pensada para nadie.
    if (select count(*) from public.shopping_list_items i
         where i.household_id = new.household_id) >= c_tope then
      raise exception 'La lista está llena (% líneas). Quita lo ya comprado o lo que sobre antes de apuntar más.', c_tope
        using errcode = 'P0001', hint = 'lista_llena';
    end if;

    -- La lista: la que se pida, o la primera de la nevera.
    if new.list_id is null then
      new.list_id := (
        select l.id from public.shopping_lists l
         where l.household_id = new.household_id
         order by l.created_at, l.id
         limit 1
      );
    elsif not exists (
      select 1 from public.shopping_lists l
       where l.id = new.list_id and l.household_id = new.household_id
    ) then
      raise exception 'Esa lista no existe o no es de esta nevera.' using errcode = 'P0002';
    end if;
    -- Sin lista no se lanza nada aquí, y a propósito: quien NO es de esta nevera no ve
    -- sus listas, así que llegaría hasta aquí con `list_id` nulo, y el aviso de la RLS
    -- («no puedes escribir ahí», 42501) tiene que ser el que salte, no uno que dijera
    -- que la nevera «no tiene lista». Para quien sí es de ella, siempre hay una (se
    -- crea con la nevera), y si faltara, el NOT NULL de la columna lo diría.
  end if;

  -- El producto, si lo hay, es del catálogo global o de ESTA nevera. La clave
  -- foránea solo comprueba que exista; con el uuid de un producto privado ajeno se
  -- podía enlazar. Mismo mensaje para «no existe» y «no es tuyo».
  if new.product_id is not null and not exists (
    select 1 from public.products p
     where p.id = new.product_id
       and (p.household_id is null or p.household_id = new.household_id)
  ) then
    raise exception 'Ese producto no existe o no es de esta nevera.'
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

-- ── Lo que más gastas (premium) ──────────────────────────────────────────
--
-- Lo que se ha AGOTADO más veces en los últimos días, por nombre (sin mayúsculas ni
-- espacios de más: «Leche» y «leche » son lo mismo). Cuenta también lo tirado, aparte,
-- porque comprar algo que luego se tira es lo que de verdad cuesta dinero; pero no
-- ordena por eso, y algo solo tirado no sale: no es lo que se gasta.
--
-- SECURITY INVOKER: lee `inventory_events` e `inventory_items` con la RLS de quien
-- llama, así que una nevera ajena sale vacía. El plan se comprueba primero.

create function public.most_used_products(
  p_household_id uuid,
  p_days         integer default 90,
  p_limit        integer default 10
)
returns table (
  product_name    text,
  finished_count  integer,
  discarded_count integer,
  last_at         timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.my_plan() <> 'premium' then
    raise exception 'Esto es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
  end if;
  if p_days is null or p_days not between 1 and 3650 or p_limit is null or p_limit not between 1 and 50 then
    raise exception 'Pide entre 1 y 3650 días y entre 1 y 50 productos.' using errcode = '22023';
  end if;

  return query
  select (array_agg(i.name order by e.created_at desc))[1],
         (count(*) filter (where e.type = 'finished'))::integer,
         (count(*) filter (where e.type = 'discarded'))::integer,
         max(e.created_at)
    from public.inventory_events e
    join public.inventory_items i on i.id = e.item_id
   where e.household_id = p_household_id
     and e.type in ('finished', 'discarded')
     and e.created_at >= now() - make_interval(days => p_days)
   group by lower(trim(i.name))
  having count(*) filter (where e.type = 'finished') > 0
   order by 2 desc, 3 asc, 4 desc
   limit p_limit;
end;
$$;

comment on function public.most_used_products(uuid, integer, integer) is
  'Premium. Lo que más se ha agotado en una nevera en los últimos días, con lo que se '
  'tiró aparte. La RLS de quien llama acota la nevera.';

revoke all on function public.most_used_products(uuid, integer, integer) from public, anon;
grant execute on function public.most_used_products(uuid, integer, integer) to authenticated;
