-- ═══════════════════════════════════════════════════════════════════════════
-- La zona horaria de un usuario tiene que ser una zona horaria
--
-- `user_settings.timezone` solo tenía un CHECK de longitud, y el cliente puede
-- escribirla. Cualquiera podía guardar `Basura/Zona`. Y lo que se hace con ella
-- es `now() at time zone <eso>` (en `today_for_user()`, de la que cuelga la vista
-- de prioridad), que PostgreSQL rechaza con «time zone "Basura/Zona" not
-- recognized».
--
-- Dos consecuencias:
--
--   · Hoy: `inventory_with_priority` revienta para ESE usuario. Se rompe a sí
--     mismo, que es feo pero no cruza a nadie.
--   · Fase 3: el resumen diario evaluará `now() at time zone s.timezone` para
--     todos los usuarios en una sola consulta, y UNA fila mala la aborta entera:
--     una persona con una zona inventada, o un fallo del selector, dejaría sin
--     aviso a todos los demás.
--
-- Se valida al escribir, contra el catálogo del propio servidor, que es lo que
-- luego se usará para calcular. Así lo que hay en la columna vale siempre.
--
-- No hace falta reparar filas existentes: la columna nació con 'Europe/Madrid' y
-- la app solo la escribe con nombres del catálogo de zonas del sistema.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.check_user_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone
  ) then
    raise exception 'Esa zona horaria no existe: %. Elige una de la lista.', new.timezone
      using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.check_user_timezone() is
  'Rechaza una zona horaria que PostgreSQL no conozca. Sin esto, una fila mala '
  'rompe `today_for_user()` y, en la fase 3, el resumen diario de todos.';

-- Es una función de trigger: nadie tiene por qué llamarla, y este proyecto
-- revoca EXECUTE en todas las suyas.
revoke all on function public.check_user_timezone() from public, anon, authenticated;

-- `update of timezone` para que cambiar el idioma o la hora del aviso no pague
-- una consulta al catálogo de zonas que no viene a cuento.
create trigger user_settings_check_timezone
  before insert or update of timezone on public.user_settings
  for each row execute function public.check_user_timezone();
