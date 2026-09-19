-- ═══════════════════════════════════════════════════════════════════════════
-- Alta de usuario: hogar personal automático.
--
-- Por qué existe: si un usuario pudiera quedarse sin hogar, todas las
-- políticas RLS tendrían que contemplar ese caso nulo, y la app tendría que
-- llevar una pantalla de «crea tu hogar» que nadie quiere ver. Se evita el
-- caso en lugar de parchearlo: al registrarse ya tienes hogar, pertenencia y
-- ajustes.
--
-- Corre como trigger de auth.users, no desde la app, por dos razones:
--   · Ocurre dentro de la transacción del registro. O sale todo, o no sale
--     el usuario: no existe el estado intermedio «usuario sin hogar».
--   · No depende de que el cliente se acuerde de llamar a nada. Da igual si
--     el alta vino de la app, del panel de Supabase o de un test.
-- ═══════════════════════════════════════════════════════════════════════════

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  -- SECURITY DEFINER es imprescindible aquí: en el instante en que corre este
  -- trigger todavía no hay sesión autenticada (el usuario se está creando),
  -- así que auth.uid() es NULL y cualquier política RLS lo rechazaría.
  insert into public.households (name)
  values ('Mi casa')
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea hogar, pertenencia y ajustes al registrarse. Garantiza que no exista '
  'ningún usuario sin hogar.';

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
