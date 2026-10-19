-- ═══════════════════════════════════════════════════════════════════════════
-- El tope de 24 h tras descongelar no se pierde al usar o abrir lo descongelado
--
-- D-14: algo descongelado se consume en 24 horas, gane o no la fecha del envase.
-- La vista lo aplicaba solo mientras `state = 'thawed'`. Pero en cuanto se usa
-- una parte (`use_quantity` → `partially_consumed`) o se abre (`open_item` →
-- `open`), el estado cambia y `thawed_at` se queda puesto: el tope dejaba de
-- contar y la fecha volvía a ser la del envase. Comprobado contra la base local:
-- algo descongelado hace 3 días salía «−2 días» (vencido por el tope) y, tras
-- usar una parte, «10 días». Es justo lo que D-14 existe para impedir.
--
-- Arreglo: el tope depende de `thawed_at`, no del estado. Se puede mirar
-- `thawed_at` a secas porque:
--   · `thaw_item` es lo único que lo escribe, y lo sobrescribe en cada
--     descongelación: congelar y descongelar de nuevo reinicia las 24 h.
--   · Mientras está congelado la fecha efectiva es null (la cuenta atrás está
--     parada) y no llega a mirarse el tope.
--   · Lo agotado y lo tirado tampoco tiene fecha (`finished`, `discarded`).
--
-- Efecto sobre lo ya guardado: lo descongelado antes de esta migración y usado o
-- abierto después pasa a salir con el tope (la fecha que debió tener siempre).
--
-- Las columnas no cambian ni de nombre, ni de tipo, ni de orden: basta
-- `create or replace view`, que conserva permisos y comentario. La definición es
-- la de `20260924130000` (la ÚLTIMA que la define, no una anterior: ver la
-- lección de esa migración) con UNA diferencia, el `when` del tope.
-- Lo vigila `supabase/tests/tope_descongelar_test.sql`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.inventory_with_priority
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

    -- 3) El tope de seguridad: 24 h desde que se descongeló. Ya no depende del
    --    estado: seguir contando tras usar una parte o abrirlo es el punto.
    case
      when i.thawed_at is not null
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

  (r.effective_limit_date - public.today_for_user()) as days_left,

  case
    when r.state in ('finished', 'discarded')     then 'closed_out'
    when r.state = 'frozen'                        then 'frozen'
    when r.effective_limit_date is null            then 'undated'
    when r.effective_limit_date <= public.today_for_user() + 1 then 'high'
    when r.effective_limit_date <= public.today_for_user() + 4 then 'medium'
    else 'low'
  end::public.priority_group as priority

from resolved r;
