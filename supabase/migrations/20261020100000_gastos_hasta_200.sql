-- ═══════════════════════════════════════════════════════════════════════════
-- «Lo que más gastas»: ahora también la lista completa
--
-- La pestaña de Premium enseña solo los 5 primeros, y una pantalla aparte enseña TODOS
-- ordenados del más gastado al menos. Para eso el tope de `most_used_products` sube de 50
-- a 200 productos (lo mismo que `my_known_products`): es una red contra un cliente que se
-- descontrola, no una limitación. El resto de la función no cambia: premium, la RLS de
-- quien llama y el orden (lo más agotado primero, y a igualdad, lo menos tirado).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.most_used_products(
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
  if p_days is null or p_days not between 1 and 3650 or p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Pide entre 1 y 3650 días y entre 1 y 200 productos.' using errcode = '22023';
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
