-- ═══════════════════════════════════════════════════════════════════════════
-- El alta solo admite usuarios de Opsi, y el nombre sale del correo, no del cliente
--
-- `handle_new_user` construía el nombre visible con
-- `raw_user_meta_data ->> 'username'`, que lo escribe EL CLIENTE al registrarse
-- (y que cualquiera puede cambiar después con `auth.updateUser({ data })`).
-- Resultado, comprobado en la auditoría de seguridad
-- (docs/internal/AUDITORIA-2026-09-24.md, M1):
--
--   · Un `signUp` directo a GoTrue con un correo cualquiera y
--     `data.username = 'admin'` creaba la cuenta con ese nombre visible, sin
--     que coincidiera con el correo. Nombre suplantable: «admin», «opsi»,
--     «soporte».
--   · Y un nombre que chocaba con uno existente respondía con la restricción
--     de unicidad en claro, que sirve para averiguar qué nombres existen.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────
--
--   1. Solo se admiten correos SINTÉTICOS válidos (`usuario@usuarios.opsi.local`,
--      3–20 caracteres de `[a-z0-9_]`): es como crea cuentas el producto, y lo que
--      la app construye a partir del usuario. Un correo real o cualquier otra cosa
--      se rechaza.
--   2. El nombre sale de la parte local de ESE correo. Los metadatos no se leen.
--   3. Hay nombres reservados que nadie puede registrar.
--
-- ── Lo que NO se rompe ────────────────────────────────────────────────────
--
-- Añadir un correo real después, desde Ajustes, es un `UPDATE` de `auth.users`,
-- no un `INSERT`: este trigger no interviene, y esa función sigue funcionando.
-- Solo el ALTA queda restringida, que es lo que se quería.
--
-- Lo que queda pendiente y NO cubre esto: el alta sigue abierta y sin
-- captcha (30 por IP cada 5 minutos). Antes de publicar hay que ponerlo, o mover
-- el alta a una Edge Function con límite por IP. Ver la auditoría.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_username     text;
begin
  -- 1 · Solo el correo sintético, que es como se crean las cuentas.
  --
  -- El dominio se compara escapando los puntos, porque en una expresión regular
  -- `.` es «cualquier carácter»: sin escapar, `ana@usuariosXopsiYlocal` pasaría.
  if new.email is null
     or lower(new.email) !~ (
          '^[a-z0-9_]{3,20}@' || replace(public.dominio_sintetico(), '.', '\.') || '$'
        )
  then
    -- 42501 (permiso denegado) y no 22023: no es un dato mal escrito, es una
    -- puerta que no está abierta. GoTrue lo devuelve como «Database error saving
    -- new user», y no cuenta nada más de por qué.
    raise exception 'El registro solo admite usuarios de Opsi.'
      using errcode = '42501';
  end if;

  -- 2 · El nombre sale del correo, NUNCA de los metadatos: los escribe el
  -- cliente, y un nombre visible que el cliente elige a su gusto es un nombre
  -- que se puede suplantar.
  v_username := lower(split_part(new.email, '@', 1));

  -- 3 · Nombres reservados. Que nadie pueda hacerse pasar por la casa.
  if v_username = any (array[
       'admin', 'administrador', 'opsi', 'soporte', 'support',
       'root', 'sistema', 'system', 'ayuda', 'help'
     ])
  then
    raise exception 'Ese usuario no está disponible.'
      using errcode = '42501';
  end if;

  -- SECURITY DEFINER es imprescindible aquí: en el instante en que corre este
  -- trigger todavía no hay sesión autenticada (el usuario se está creando), así
  -- que auth.uid() es NULL y cualquier política RLS lo rechazaría.
  insert into public.households (name, kind, icon, member_limit)
  values ('Mi casa', 'personal', 'house', 1)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  insert into public.user_settings (user_id, username)
  values (new.id, v_username)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea la nevera privada, la pertenencia y los ajustes al registrarse. Solo '
  'admite correos sintéticos y saca el nombre del correo, no de los metadatos, '
  'que los escribe el cliente.';
