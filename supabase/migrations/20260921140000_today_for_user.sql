-- ═══════════════════════════════════════════════════════════════════════════
-- «Hoy» en la zona horaria del usuario (cierra Q9).
--
-- La vista de prioridad usaba `current_date`, que es la fecha del SERVIDOR, y
-- el servidor va en UTC. Para alguien en España eso significa que entre
-- medianoche y las dos de la mañana —una o dos horas según el horario de
-- verano— la app vive en el día anterior: algo que vence «hoy» se enseña como
-- que vence «mañana».
--
-- No es un detalle estético. La fase 3 manda un resumen diario a la hora que
-- elija el usuario, y «los alimentos que vencen hoy» calculado en el día
-- equivocado es un aviso que llega tarde.
--
-- La zona sale de user_settings, que ya existía con 'Europe/Madrid' por
-- defecto desde la fase 0.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.today_for_user()
returns date
language sql
stable
as $$
  select (
    now() at time zone coalesce(
      (select s.timezone from public.user_settings s where s.user_id = (select auth.uid())),
      -- Sin sesión (la Edge Function del resumen diario usa service_role) o
      -- sin ajustes todavía: el mismo valor por defecto que la tabla.
      'Europe/Madrid'
    )
  )::date;
$$;

comment on function public.today_for_user() is
  'La fecha de HOY donde está el usuario, no donde está el servidor. '
  'La vista de prioridad la usa en lugar de current_date.';

revoke all on function public.today_for_user() from public, anon;
grant execute on function public.today_for_user() to authenticated;

-- ── La vista, con el mismo cuerpo salvo las tres apariciones de la fecha ──
-- create or replace conserva los permisos ya concedidos, y falla si la lista
-- de columnas cambiase: un seguro contra tocar de más sin darse cuenta.
create or replace view public.inventory_with_priority
with (security_invoker = true) as
with candidates as (
  select
    i.*,
    case
      when i.limit_date is not null then i.limit_date + i.frozen_days
    end as date_from_label,
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
      when c.state in ('finished', 'discarded') then null
      when c.state = 'frozen' then null
      else least(c.date_from_thaw, c.date_from_opening, c.date_from_label)
    end as effective_limit_date
  from candidates c
)
select
  r.*,
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'after_thawing'
    when r.effective_limit_date = r.date_from_opening then 'after_opening'
    else 'label'
  end::public.effective_date_reason as effective_date_reason,
  case
    when r.effective_limit_date is null then null
    when r.effective_limit_date = r.date_from_thaw    then 'reference'
    when r.effective_limit_date = r.date_from_opening then 'reference'
    else r.date_source
  end::public.date_source as effective_date_source,

  (r.effective_limit_date - public.today_for_user()) as days_left,

  case
    when r.state in ('finished', 'discarded')                    then 'closed_out'
    when r.state = 'frozen'                                       then 'frozen'
    when r.effective_limit_date is null                           then 'undated'
    when r.effective_limit_date <= public.today_for_user() + 1    then 'high'
    when r.effective_limit_date <= public.today_for_user() + 4    then 'medium'
    else 'low'
  end::public.priority_group as priority

from resolved r;
