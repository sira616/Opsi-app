-- ═════════════════════════════════════════════════════════════════
-- El chat de Opsi es de Premium
--
-- Hasta ahora el chat lo usaba cualquiera con sesión, con el tope de mensajes por persona
-- (`use_chat_quota`, 20261026100000_cuota_chat). Pasa a ser de Opsi Premium ⭐, y lo decide el SERVIDOR,
-- como todo lo premium (`my_known_products`, `most_used_products`, `nutrition_of_products`):
-- una app que enseñe un candado no protege nada por sí sola.
--
-- ── Dónde se comprueba ────────────────────────────────────────────────────
--
-- En `use_chat_quota()`, que es lo primero que toca `opsi-chat` después de validar la petición y
-- ANTES de llamar al modelo (que es lo que cuesta). Quien no es premium recibe 42501 con pista
-- `premium` y NO gasta un mensaje de cuota ni escribe nada. `my_plan()` mira el plan de quien
-- llama (sale de su sesión), así que no se puede preguntar «como» otra persona.
--
-- Solo cambia el cuerpo de la función: la firma, los permisos y la tabla siguen igual.
-- ═════════════════════════════════════════════════════════════════

create or replace function public.use_chat_quota()
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

  -- El chat es de Premium. Antes de mirar ni apuntar nada: lo que se rechaza aquí no cuesta cuota.
  if public.my_plan() <> 'premium' then
    raise exception 'El chat es de Opsi Premium ⭐.' using errcode = '42501', hint = 'premium';
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
  'Premium. Gasta un mensaje de la cuota de chat de QUIEN LLAMA (sale de la sesión): 20 por hora y 100 '
  'al día. Devuelve (allowed, wait_s): si no cabe, cuántos segundos faltan para que vuelva a caber. '
  'Quien no es premium recibe 42501 (pista premium) sin gastar nada. SECURITY DEFINER porque la tabla '
  'no concede nada a nadie. Sin sesión, 28000.';
