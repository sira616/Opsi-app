-- ═══════════════════════════════════════════════════════════════════════════
-- Consentimiento explícito para los datos de salud, y borrarlos
--
-- `user_health_preferences` guarda qué alérgenos o intolerancias evita cada persona:
-- un DATO DE SALUD (RGPD, categoría especial, art. 9). Hasta ahora se guardaba al
-- marcar la primera casilla, sin pedir permiso y sin poder retirarlo.
--
--   1. El servidor NO guarda una lista de salud sin el permiso de su dueña. Se
--      registra qué versión del aviso aceptó (`consent_version`) y CUÁNDO
--      (`consented_at`, que pone el servidor: la persona no puede escribir la fecha).
--   2. Retirar el permiso es borrar lo guardado: la persona puede borrar su fila
--      (antes no había DELETE). Es el derecho de supresión, y el de retirar el
--      consentimiento sin dejar nada detrás.
--
-- ── Cómo se aplica el consentimiento ──────────────────────────────────────
--
-- Un trigger BEFORE INSERT OR UPDATE (no un CHECK) por dos razones: pone la fecha
-- del permiso él mismo, y su mensaje sale en español con una pista estable
-- (`consentimiento_salud`) en vez de un «violates check constraint». Una lista
-- vacía no necesita permiso (no hay dato de salud): así se puede crear la fila solo
-- con el permiso, antes de marcar nada.
--
-- Las filas que ya existían sin permiso (las de antes de esta migración) NO se
-- tocan ni se borran: no se inventa un consentimiento que nadie dio. Siguen ahí, la
-- app no las usa mientras no haya permiso, y el trigger solo mira las filas que se
-- escriben: para cambiar una de ellas hace falta dar el permiso antes.
--
-- La versión es de la app: la sube cuando cambia el aviso y obliga a aceptarlo de
-- nuevo. El servidor solo exige que exista (≥ 1).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.user_health_preferences
  add column consent_version smallint,
  add column consented_at    timestamptz;

comment on column public.user_health_preferences.consent_version is
  'Versión del aviso de consentimiento que la persona aceptó. NULL = no ha dado permiso: '
  'el servidor no deja guardar una lista no vacía sin él, y la app no usa la que hubiera.';

comment on column public.user_health_preferences.consented_at is
  'Cuándo se dio el permiso. Lo pone el servidor (trigger) al guardar una versión nueva: '
  'la persona no lo escribe.';

-- Las dos cosas van juntas: o hay versión y fecha, o ninguna.
alter table public.user_health_preferences
  add constraint user_health_preferences_consent_ck check (
    (consent_version is null and consented_at is null)
    or (consent_version >= 1 and consented_at is not null)
  );

create function public.check_health_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- La fecha del permiso es del servidor. Sin versión no hay fecha; con una versión
  -- nueva (o en el alta) es ahora; si la versión no cambia, la que ya había.
  if new.consent_version is null then
    new.consented_at := null;
  elsif tg_op = 'INSERT' or new.consent_version is distinct from old.consent_version then
    new.consented_at := now();
  else
    new.consented_at := old.consented_at;
  end if;

  -- Sin permiso no se guarda nada de salud. Una lista vacía no lo es.
  if new.avoid is not null and cardinality(new.avoid) > 0 and new.consent_version is null then
    raise exception 'Antes de guardar lo que evitas necesito tu permiso.'
      using errcode = 'P0001', hint = 'consentimiento_salud';
  end if;

  return new;
end;
$$;

comment on function public.check_health_consent() is
  'Trigger de user_health_preferences: pone la fecha del permiso y no deja guardar una '
  'lista de salud no vacía sin él (P0001, pista consentimiento_salud).';

-- Antes que `normalize` y `touch_updated_at` (el disparo es por orden alfabético), de
-- modo que lo que se rechaza por falta de permiso se rechaza sin haberlo tocado.
create trigger user_health_preferences_consent
  before insert or update on public.user_health_preferences
  for each row execute function public.check_health_consent();

revoke all on function public.check_health_consent() from public, anon, authenticated;

-- Escribir la versión (la fecha NO: la pone el trigger) y poder borrar la propia fila.
grant insert (consent_version) on public.user_health_preferences to authenticated;
grant update (consent_version) on public.user_health_preferences to authenticated;
grant delete on public.user_health_preferences to authenticated;

create policy user_health_preferences_delete on public.user_health_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.user_health_preferences is
  'DATO DE SALUD (RGPD, categoría especial). Qué alérgenos o intolerancias evita cada '
  'persona. Solo su dueña la lee, la escribe o la borra: la RLS es la única barrera, ni la '
  'gente de su nevera, ni service_role, ni anon la ven. Ninguna función la lee. No se '
  'guarda una lista sin el permiso de su dueña (consent_version / consented_at). El cruce '
  'con los productos se hace en el móvil.';
