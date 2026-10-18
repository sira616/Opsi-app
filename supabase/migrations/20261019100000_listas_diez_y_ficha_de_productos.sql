-- ═══════════════════════════════════════════════════════════════════════════
-- Hasta 10 listas en premium, y la ficha de «tus productos»
--
-- 1. El tope de listas del plan premium baja de 20 a 10 (el básico sigue en 3). Era una
--    red contra un cliente que se descontrola y no un valor de venta; 10 lo es igual y
--    es lo que se quiere anunciar. Nadie puede tener más de 3 sin premium y premium no
--    se puede contratar todavía, así que no hay listas que sobren.
--
-- 2. `my_known_products` devuelve ahora lo que hace falta para una FICHA de cada
--    producto, no solo para volver a guardarlo: el código de barras y de dónde salió
--    (para distinguir lo escaneado de lo añadido a mano), el pasillo, la primera y la
--    última vez, y cuánto tienes ahora en la nevera. Cambia el tipo que devuelve, y eso
--    no se puede hacer con `create or replace`: se borra y se vuelve a crear.
--
--    «Escaneado» es lo que tiene producto del catálogo con código de barras; lo que se
--    escribió a mano no tiene ninguno. «Ahora» cuenta TODO lo que hay en la nevera de ese
--    producto (no solo lo que añadió quien pregunta): lo que hay en la nevera es de la
--    nevera. Lo demás (veces, primera y última) sigue siendo solo lo de quien llama.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. El tope de listas ─────────────────────────────────────────────────

create or replace function public.check_shopping_list()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c_basico constant integer := 3;
  c_premium constant integer := 10;
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

  -- DELETE: siempre queda una. Si la nevera ya no existe, es el borrado en cascada de la
  -- propia nevera y se deja pasar.
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
  'nevera en el plan básico (10 en premium) y no se borra la última.';

-- ── 2. La ficha de «tus productos» ───────────────────────────────────────

drop function public.my_known_products(uuid, integer);

create function public.my_known_products(
  p_household_id uuid,
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
  in_stock       integer
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
           i.name       as nombre,
           i.category   as pasillo,
           i.unit_family as familia,
           i.display_unit as unidad,
           i.initial_quantity as cantidad,
           i.created_at as creado,
           coalesce(i.product_id::text, lower(trim(i.name))) as clave
      from public.inventory_items i
     where i.household_id = p_household_id
       and i.created_by = (select auth.uid())
  ),
  agrupado as (
    select m.clave,
           (array_agg(m.pid order by m.creado desc) filter (where m.pid is not null))[1] as pid,
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
           where j.household_id = p_household_id
             and j.state not in ('finished', 'discarded')
             and coalesce(j.product_id::text, lower(trim(j.name))) = a.clave)
    from agrupado a
    left join public.products p on p.id = a.pid
   order by a.ultima desc
   limit p_limit;
end;
$$;

comment on function public.my_known_products(uuid, integer) is
  'Premium. La ficha de lo que ha añadido quien llama a una nevera, sin repetidos y lo '
  'último primero: código y origen (escaneado o a mano), pasillo, cuántas veces y cuánto '
  'hay ahora. No hay tabla: sale de inventory_items, acotado por su RLS y por created_by.';

revoke all on function public.my_known_products(uuid, integer) from public, anon;
grant execute on function public.my_known_products(uuid, integer) to authenticated;
