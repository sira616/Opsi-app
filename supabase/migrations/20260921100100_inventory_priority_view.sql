-- ═══════════════════════════════════════════════════════════════════════════
-- inventory_with_priority: la fecha límite efectiva y su urgencia.
--
-- Vive en SQL y no en la app porque tres consumidores necesitan exactamente el
-- mismo cálculo: la pantalla «Consumir primero», el resumen diario (fase 3) y
-- la asistente (fase 5). Repetirlo en tres sitios es garantizar que diverja.
--
-- ─── La fecha límite efectiva sale de la más CORTA de tres candidatas ──────
--
--   1. La del envase, desplazada por el tiempo en el congelador.
--      Congelar pausa la cuenta atrás y descongelar la reanuda (D-12): un
--      yogur con 3 días, congelado 30, vuelve a tener 3.
--
--   2. La conservación tras apertura, si está abierto (D-15).
--      Del producto si el catálogo la trae; si no, de la tabla por categoría.
--
--   3. 24 HORAS DESDE QUE SE DESCONGELÓ (D-14).
--      Este es el tope de seguridad, y gana a los otros dos siempre que sea
--      menor. Reanudar el reloj sin más (D-12 a secas) daba resultados
--      inseguros: una leche con 3 días, congelada 3 meses y descongelada,
--      mostraba 3 días cuando la recomendación es consumirla en 24 h.
--
-- Nota sobre LEAST: en Postgres ignora los NULL y devuelve la menor de las no
-- nulas. Eso es justo lo que se quiere aquí, porque una candidata que no
-- aplica no debe anular a las demás.
-- ═══════════════════════════════════════════════════════════════════════════

create type public.priority_group as enum (
  'high',        -- vence hoy o mañana, o ya venció
  'medium',      -- vence dentro de los próximos días
  'low',         -- queda margen de sobra
  'undated',     -- sin fecha. NO es lo mismo que «sin urgencia»
  'frozen',      -- congelado: la cuenta atrás está parada
  'closed_out'   -- agotado o tirado: fuera de la lista
);

create type public.effective_date_reason as enum (
  'label',           -- la fecha del envase (desplazada por el congelador)
  'after_opening',   -- la conservación tras abrir
  'after_thawing'    -- el tope de 24 h tras descongelar
);

-- ¡security_invoker = true NO ES OPCIONAL!
--
-- Una vista normal se ejecuta con los permisos de SU PROPIETARIO, así que
-- atraviesa la RLS de las tablas que consulta. Sin esta opción, esta vista
-- devolvería el inventario de TODOS LOS HOGARES a cualquiera que la leyera, y
-- las políticas de inventory_items no servirían de nada. Con ella, la vista se
-- ejecuta como quien pregunta y la RLS se aplica igual que en la tabla.
-- Hay un test que lo comprueba: si alguien quita esta línea, se pone en rojo.
create view public.inventory_with_priority
with (security_invoker = true) as
with candidates as (
  select
    i.*,

    -- 1) La del envase, más los días que estuvo parada en el congelador.
    case
      when i.limit_date is not null then i.limit_date + i.frozen_days
    end as date_from_label,

    -- 2) La de conservación tras apertura: primero la del producto, si no la
    --    de su categoría, y de las categorías que encajen la MÁS CORTA.
    case
      when i.opened_at is not null then
        i.opened_at::date + coalesce(
          p.open_shelf_life_days,
          (
            select min(r.days)
            from public.open_shelf_life_reference r
            where r.category_tag = any (p.categories_tags)
          )
        )
    end as date_from_opening,

    -- 3) El tope de seguridad: 24 h desde que se descongeló.
    case
      when i.state = 'thawed' and i.thawed_at is not null
      then i.thawed_at::date + 1
    end as date_from_thaw

  from public.inventory_items i
  left join public.products p on p.id = i.product_id
),
resolved as (
  select
    c.*,
    case
      -- Lo agotado y lo tirado ya no tiene fecha que vigilar.
      when c.state in ('finished', 'discarded') then null
      -- Mientras está congelado, la cuenta atrás está parada: no vence.
      when c.state = 'frozen' then null
      else least(c.date_from_thaw, c.date_from_opening, c.date_from_label)
    end as effective_limit_date
  from candidates c
)
select
  r.*,

  -- Por qué esa fecha y no otra. La pantalla de detalle lo explica con esto,
  -- en vez de soltar un número sin más.
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'after_thawing'
    when r.effective_limit_date = r.date_from_opening then 'after_opening'
    else 'label'
  end::public.effective_date_reason as effective_date_reason,

  -- El origen que se muestra al usuario. Todo lo que no venga del envase es
  -- orientativo, y se dice.
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'reference'
    when r.effective_limit_date = r.date_from_opening then 'reference'
    else r.date_source
  end::public.date_source as effective_date_source,

  (r.effective_limit_date - current_date) as days_left,

  case
    when r.state in ('finished', 'discarded')     then 'closed_out'
    when r.state = 'frozen'                        then 'frozen'
    when r.effective_limit_date is null            then 'undated'
    when r.effective_limit_date <= current_date + 1 then 'high'
    when r.effective_limit_date <= current_date + 4 then 'medium'
    else 'low'
  end::public.priority_group as priority

from resolved r;

comment on view public.inventory_with_priority is
  'Inventario con la fecha límite efectiva, por qué es esa y su urgencia. '
  'security_invoker: la RLS de inventory_items se aplica igual que en la tabla.';

revoke all on public.inventory_with_priority from anon;
grant select on public.inventory_with_priority to authenticated;
