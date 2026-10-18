-- ═══════════════════════════════════════════════════════════════════════════
-- Tus productos (Opsi Premium ⭐)
--
-- Lo que ya has añadido a una nevera, sin repetidos, para volver a guardarlo en la
-- nevera o apuntarlo en la lista de un toque en vez de escribirlo o escanearlo otra
-- vez.
--
-- No hay tabla nueva. Lo que cada persona ha añadido YA está en `inventory_items`
-- (con su `created_by`, y el producto del catálogo si se escaneó), así que esto es una
-- consulta y no una copia que mantener al día: una segunda lista de «productos
-- guardados» tendría que sincronizarse con los elementos, y un día dejaría de decir lo
-- mismo. Lo que NO sale es lo que se escaneó y nunca se llegó a guardar: escanear no
-- deja rastro, guardar sí.
--
-- «Tuyos» es lo que añadiste TÚ (`created_by`), no lo de toda la nevera: en una nevera
-- compartida cada persona tiene su propia lista. La RLS de `inventory_items` acota,
-- además, a las neveras de quien llama.
--
-- Se agrupa por producto del catálogo si lo hay y, si no (lo que se escribió a mano),
-- por el nombre sin mayúsculas ni espacios de más: «Leche» y «leche » son lo mismo.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.my_known_products(
  p_household_id uuid,
  p_limit        integer default 40
)
returns table (
  product_id    uuid,
  product_name  text,
  brand         text,
  unit_family   public.unit_family,
  display_unit  public.measurement_unit,
  quantity      numeric,
  times_added   integer,
  last_added_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if public.my_plan() <> 'premium' then
    raise exception 'Esto es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Pide entre 1 y 100 productos.' using errcode = '22023';
  end if;

  -- Lo último que añadiste de cada cosa manda: su nombre, su cantidad y su unidad son
  -- los que se proponen al volver a guardarla.
  return query
  select (array_agg(i.product_id order by i.created_at desc) filter (where i.product_id is not null))[1],
         (array_agg(i.name order by i.created_at desc))[1],
         (array_agg(p.brand order by i.created_at desc))[1],
         (array_agg(i.unit_family order by i.created_at desc))[1],
         (array_agg(i.display_unit order by i.created_at desc))[1],
         (array_agg(i.initial_quantity order by i.created_at desc))[1],
         count(*)::integer,
         max(i.created_at)
    from public.inventory_items i
    left join public.products p on p.id = i.product_id
   where i.household_id = p_household_id
     and i.created_by = (select auth.uid())
   group by coalesce(i.product_id::text, lower(trim(i.name)))
   order by 8 desc
   limit p_limit;
end;
$$;

comment on function public.my_known_products(uuid, integer) is
  'Premium. Lo que ha añadido quien llama a una nevera, sin repetidos y lo último primero. '
  'No hay tabla: sale de inventory_items, acotado por su RLS y por created_by.';

revoke all on function public.my_known_products(uuid, integer) from public, anon;
grant execute on function public.my_known_products(uuid, integer) to authenticated;
