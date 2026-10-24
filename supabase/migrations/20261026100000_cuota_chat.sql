-- ═══════════════════════════════════════════════════════════════════════════
-- Cuota de mensajes del chat, por persona
--
-- Cada mensaje al chat (`opsi-chat`) llama a un modelo de pago: sin un tope por persona, una
-- sola cuenta —o un bucle en un cliente— puede gastar sin límite. El tope ya existe por
-- petición (20 mensajes de contexto, 500 caracteres, 4 rondas de herramientas); faltaba por
-- PERSONA. Es el hueco que `docs/internal/PENDIENTES.md` llamaba «límites de uso de la IA».
--
-- ── Cómo se aplica ────────────────────────────────────────────────────────
--
-- La Edge Function llama a `use_chat_quota()` con el token de la persona, DESPUÉS de validar la
-- petición y ANTES de llamar al modelo (que es lo que cuesta). La función cuenta los mensajes
-- de ESA persona en la última hora y en las últimas 24 h y, si caben, apunta uno más. Si no
-- cabe, dice cuánto falta para que vuelva a caber. La función `opsi-chat` NO usa clave de
-- servicio (a propósito): esto es lo que le permite apuntar el uso sin ella.
--
-- Por eso es `SECURITY DEFINER` y la tabla no concede NADA a nadie: ni `authenticated` ni
-- `service_role` pueden leerla, escribirla ni borrarla a mano. Si la persona pudiera borrar sus
-- filas, se resetearía la cuota; si pudiera insertar, solo se perjudicaría a sí misma, pero
-- tampoco hace falta. La función saca quién es de la sesión (`auth.uid()`), nunca de un
-- argumento: no se puede gastar la cuota de otra persona.
--
-- No se guarda NADA del contenido: solo cuándo y de quién (una fila por mensaje), y las filas de
-- más de dos días se borran al usarla. Se van con la cuenta (`on delete cascade`).
--
-- Los números (20 por hora, 100 al día) son cifras razonables elegidas sin datos de uso real,
-- como las de `lookup-barcode`. Cambiarlos es cambiar dos constantes de abajo.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.chat_usage (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  used_at timestamptz not null default now()
);

comment on table public.chat_usage is
  'Un mensaje al chat de Opsi por fila: de quién y cuándo, nunca el contenido. Solo lo toca '
  'use_chat_quota(); nadie tiene permisos sobre la tabla. Se borra con la cuenta.';

create index chat_usage_user_used_at_idx on public.chat_usage (user_id, used_at desc);

alter table public.chat_usage enable row level security;
-- Sin ninguna política: con la RLS puesta y sin políticas no se ve ni se escribe nada, y los
-- permisos de abajo lo cierran por segunda vez.
revoke all on public.chat_usage from anon, authenticated, service_role;

create function public.use_chat_quota()
returns table (allowed boolean, wait_s integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_por_hora   constant integer := 20;
  c_por_dia    constant integer := 100;
  v_user       uuid := auth.uid();
  v_hora       integer;
  v_dia        integer;
  v_hora_desde timestamptz;
  v_dia_desde  timestamptz;
  v_espera     integer := 0;
begin
  -- Quién es sale de la sesión, nunca de un argumento.
  if v_user is null then
    raise exception 'Hace falta una sesión.' using errcode = '28000';
  end if;

  -- Dos mensajes de la misma persona a la vez no se cuelan entre sí: se espera el turno.
  perform pg_advisory_xact_lock(hashtextextended('chat_usage:' || v_user::text, 0));

  -- Lo viejo no sirve para nada (la ventana más larga es de un día).
  delete from public.chat_usage
   where user_id = v_user and used_at < now() - interval '2 days';

  select count(*), min(used_at) into v_hora, v_hora_desde
    from public.chat_usage
   where user_id = v_user and used_at > now() - interval '1 hour';

  select count(*), min(used_at) into v_dia, v_dia_desde
    from public.chat_usage
   where user_id = v_user and used_at > now() - interval '1 day';

  -- Sin hueco: cuánto falta para que caduque el mensaje más antiguo de esa ventana (nunca hay
  -- más filas que el tope, porque solo se inserta si cabe). Si no cabe en ninguna, la espera
  -- mayor: hasta que quepa en las dos.
  if v_hora >= c_por_hora then
    v_espera := greatest(v_espera, ceil(extract(epoch from (v_hora_desde + interval '1 hour' - now())))::integer);
  end if;
  if v_dia >= c_por_dia then
    v_espera := greatest(v_espera, ceil(extract(epoch from (v_dia_desde + interval '1 day' - now())))::integer);
  end if;

  if v_hora >= c_por_hora or v_dia >= c_por_dia then
    return query select false, greatest(v_espera, 1);
    return;
  end if;

  insert into public.chat_usage (user_id) values (v_user);
  return query select true, 0;
end;
$$;

comment on function public.use_chat_quota() is
  'Gasta un mensaje de la cuota de chat de QUIEN LLAMA (sale de la sesión): 20 por hora y 100 al día. '
  'Devuelve (allowed, wait_s): si no cabe, cuántos segundos faltan para que vuelva a caber. '
  'SECURITY DEFINER porque la tabla no concede nada a nadie. Sin sesión, 28000.';

-- Solo quien tiene sesión. `service_role` no la llama: opsi-chat va con el token de la persona.
revoke all on function public.use_chat_quota() from public, anon, authenticated, service_role;
grant execute on function public.use_chat_quota() to authenticated;
