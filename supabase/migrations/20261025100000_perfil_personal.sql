-- ═══════════════════════════════════════════════════════════════════════════
-- Perfil personal: lo que cada persona cuenta de sí para que Opsi la conozca
--
-- Nivel de ejercicio, cómo come, qué le gusta y qué no. TODO es opcional: una persona puede
-- no rellenar nada, rellenar una cosa o borrarlo todo, y la app funciona igual. Sirve para que
-- más adelante las recomendaciones (los avisos, la asistente) se parezcan a quien las recibe.
--
-- ── Por qué se trata con el cuidado de un dato de salud ───────────────────
--
-- Cuánto te mueves y cómo comes dicen cosas de la persona que no son asunto de nadie más, y
-- algunas respuestas (una dieta, un alimento que no se tolera) rozan la salud o las creencias.
-- Por eso, igual que `user_health_preferences` (20261021100000 / 20261023100000):
--
--   · **Solo su dueña** la lee, la escribe y la borra: RLS por `user_id`. Ni la gente de una
--     nevera compartida, ni `service_role`, ni `anon`. Ninguna función ni vista la lee.
--   · **Sin permiso no se guarda nada.** `consent_version` / `consented_at` (la fecha la
--     pone el servidor). Es un permiso PROPIO, distinto del de salud: es otro fin y se
--     acepta por separado. Una fila vacía (solo el permiso) sí se puede crear.
--   · **Se puede borrar** (retirar el permiso es borrar la fila, sin dejar nada detrás).
--   · **Listas cerradas**, validadas en el servidor: ni texto libre donde no hace falta ni
--     valores que la app no sabe nombrar. La única parte libre son los «productos concretos
--     que no te gustan», con tope de cantidad y de longitud, y limpia de caracteres de
--     control, de formato y de marcado (esa lista puede acabar algún día en una petición a
--     un modelo, y por eso se trata como entrada no confiable).
--
-- Lo que NO hace: no la lee ninguna función de la base de datos ni la Edge Function. Cuando
-- la asistente use el perfil, hará falta un permiso propio para mandarlo al proveedor del
-- modelo (ver docs/PRIVACIDAD.md): tener el perfil guardado NO es permiso para enviarlo.
--
-- No se ofrecen opciones religiosas (halal, kosher): serían una categoría especial más y no
-- se han pedido. Anotado en PENDIENTES.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.user_profile (
  user_id         uuid primary key references auth.users (id) on delete cascade,

  -- Cuánto se mueve. NULL = prefiere no decirlo.
  activity_level  text,
  -- Cómo come. NULL = prefiere no decirlo.
  diet            text,
  -- Lo que le gusta y lo que no, del MISMO vocabulario cerrado (una cosa no puede estar en las dos).
  likes           text[] not null default '{}',
  dislikes        text[] not null default '{}',
  -- Productos concretos que no le gustan y no están en la lista cerrada. Texto de la persona.
  dislikes_custom text[] not null default '{}',

  consent_version smallint,
  consented_at    timestamptz,
  updated_at      timestamptz not null default now(),

  constraint user_profile_activity_ck check (
    activity_level is null
    or activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')
  ),
  constraint user_profile_diet_ck check (
    diet is null
    or diet in ('omnivore', 'vegetarian', 'vegan', 'pescatarian', 'flexitarian')
  ),
  -- El vocabulario de gustos, con tope. Cada lista es subconjunto del vocabulario; el trigger
  -- las deja sin repetidos y ordenadas, así que 26 es el máximo posible; se escribe por si un
  -- día se quita el trigger.
  constraint user_profile_likes_ck check (
    likes <@ array[
      'vegetables', 'fruit', 'legumes', 'pasta', 'rice', 'bread', 'fish', 'oily_fish', 'seafood',
      'chicken', 'red_meat', 'offal', 'eggs', 'cheese', 'strong_cheese', 'nuts', 'spicy', 'sweets',
      'mushrooms', 'onion', 'tomato', 'olives', 'crucifers', 'cilantro', 'eggplant', 'beetroot'
    ]
    and cardinality(likes) <= 26
  ),
  constraint user_profile_dislikes_ck check (
    dislikes <@ array[
      'vegetables', 'fruit', 'legumes', 'pasta', 'rice', 'bread', 'fish', 'oily_fish', 'seafood',
      'chicken', 'red_meat', 'offal', 'eggs', 'cheese', 'strong_cheese', 'nuts', 'spicy', 'sweets',
      'mushrooms', 'onion', 'tomato', 'olives', 'crucifers', 'cilantro', 'eggplant', 'beetroot'
    ]
    and cardinality(dislikes) <= 26
  ),
  constraint user_profile_no_overlap_ck check (not (likes && dislikes)),
  -- La forma de cada producto concreto la comprueba el trigger (un CHECK no puede mirar elemento
  -- a elemento sin una función); aquí el tope de cuántos.
  constraint user_profile_custom_ck check (cardinality(dislikes_custom) <= 10),
  -- Las dos cosas del permiso van juntas: o hay versión y fecha, o ninguna.
  constraint user_profile_consent_ck check (
    (consent_version is null and consented_at is null)
    or (consent_version >= 1 and consented_at is not null)
  )
);

comment on table public.user_profile is
  'PERFIL PERSONAL, opcional y tratado como un dato sensible. Nivel de ejercicio, dieta, gustos '
  'y disgustos de cada persona. Solo su dueña lo lee, lo escribe o lo borra: la RLS es la única '
  'barrera, ni la gente de su nevera, ni service_role, ni anon lo ven. Ninguna función lo lee. '
  'No se guarda nada sin su permiso (consent_version / consented_at), que es propio y distinto '
  'del de salud.';

comment on column public.user_profile.activity_level is
  'sedentary, light, moderate, active o very_active. NULL = prefiere no decirlo.';
comment on column public.user_profile.diet is
  'omnivore, vegetarian, vegan, pescatarian o flexitarian. NULL = prefiere no decirlo. Sin '
  'opciones religiosas a propósito.';
comment on column public.user_profile.likes is
  'Vocabulario cerrado, sin repetidos y ordenado. Una cosa no puede estar a la vez en likes y dislikes.';
comment on column public.user_profile.dislikes_custom is
  'Hasta 10 productos concretos, texto de la persona: 2 a 40 caracteres, sin caracteres de '
  'control, de formato ni de marcado, sin repetidos (sin distinguir mayúsculas).';
comment on column public.user_profile.consent_version is
  'Versión del aviso de consentimiento del perfil que la persona aceptó. NULL = sin permiso: no se guarda nada.';
comment on column public.user_profile.consented_at is
  'Cuándo se dio el permiso. Lo pone el servidor (trigger): la persona no lo escribe.';

-- ── El trigger: permiso, normalización y la forma de lo libre ──────────────
--
-- Va antes que las comprobaciones CHECK (los triggers BEFORE se disparan primero). Hace tres
-- cosas, en este orden, y por eso es UNO solo:
--   1. La fecha del permiso es del servidor.
--   2. Las listas quedan sin repetidos y ordenadas; los productos concretos, recortados y sin
--      repetidos (sin distinguir mayúsculas), y se rechaza el que no tenga forma de nombre.
--   3. Sin permiso no se guarda nada que no esté vacío.

create function public.check_user_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entrada text;
  v_limpio  text[] := '{}';
  v_visto   text[] := '{}';
  v_clave   text;
begin
  -- 1 · La fecha del permiso.
  if new.consent_version is null then
    new.consented_at := null;
  elsif tg_op = 'INSERT' or new.consent_version is distinct from old.consent_version then
    new.consented_at := now();
  else
    new.consented_at := old.consented_at;
  end if;

  -- 2 · Normalizar. Un NULL se deja pasar para que hable el NOT NULL, y un valor fuera de la
  -- lista, para que hable el CHECK (los dos se comprueban DESPUÉS de este trigger).
  if new.likes is not null then
    new.likes := coalesce(
      (select array_agg(a order by a collate "C") from (select distinct a from unnest(new.likes) as u(a)) as d),
      '{}'::text[]);
  end if;
  if new.dislikes is not null then
    new.dislikes := coalesce(
      (select array_agg(a order by a collate "C") from (select distinct a from unnest(new.dislikes) as u(a)) as d),
      '{}'::text[]);
  end if;

  if new.dislikes_custom is not null then
    foreach v_entrada in array new.dislikes_custom loop
      -- Un NULL dentro de la lista no es un producto.
      if v_entrada is null then
        raise exception 'Escribe solo el nombre del producto, de 2 a 40 caracteres.'
          using errcode = '22023', hint = 'gusto_no_valido';
      end if;
      v_entrada := regexp_replace(btrim(v_entrada), '\s+', ' ', 'g');
      -- Vacío tras recortar: se descarta sin quejarse (un espacio de más no es un error).
      continue when v_entrada = '';
      if char_length(v_entrada) not between 2 and 40
         -- Control, formato (dirección, ancho cero, uniones, BOM), «etiquetas» U+E0000 y
         -- el marcado y las comillas inversas que no tienen sitio en el nombre de un producto.
         or v_entrada ~ '[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁩﻿<>{}\[\]`\\|$\U000E0000-\U000E007F]'
      then
        raise exception 'Escribe solo el nombre del producto, de 2 a 40 caracteres.'
          using errcode = '22023', hint = 'gusto_no_valido';
      end if;
      v_clave := lower(v_entrada);
      -- Sin repetidos, sin distinguir mayúsculas.
      continue when v_clave = any (v_visto);
      v_visto := v_visto || v_clave;
      v_limpio := v_limpio || v_entrada;
    end loop;
    -- Orden estable (sin distinguir mayúsculas) para que «las mismas respuestas» sean el mismo valor.
    new.dislikes_custom := coalesce(
      (select array_agg(a order by lower(a) collate "C", a collate "C") from unnest(v_limpio) as u(a)),
      '{}'::text[]);
  end if;

  -- 3 · Sin permiso, nada guardado. Vacío no es un dato.
  if new.consent_version is null and (
       new.activity_level is not null
       or new.diet is not null
       or coalesce(cardinality(new.likes), 0) > 0
       or coalesce(cardinality(new.dislikes), 0) > 0
       or coalesce(cardinality(new.dislikes_custom), 0) > 0)
  then
    raise exception 'Antes de guardar tu perfil necesito tu permiso.'
      using errcode = 'P0001', hint = 'consentimiento_perfil';
  end if;

  return new;
end;
$$;

comment on function public.check_user_profile() is
  'Trigger de user_profile: pone la fecha del permiso, deja las listas sin repetidos y ordenadas, '
  'comprueba la forma de los productos concretos y no deja guardar nada sin permiso (P0001, pista '
  'consentimiento_perfil). No lee ninguna tabla.';

create trigger user_profile_check
  before insert or update on public.user_profile
  for each row execute function public.check_user_profile();

create trigger user_profile_touch_updated_at
  before update on public.user_profile
  for each row execute function public.touch_updated_at();

-- ── RLS y permisos: solo su dueña, columna a columna ───────────────────────

alter table public.user_profile enable row level security;

create policy user_profile_select on public.user_profile
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_profile_insert on public.user_profile
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_profile_update on public.user_profile
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_profile_delete on public.user_profile
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Permisos mínimos, como en `user_health_preferences`. `service_role` se nombra aunque ya
-- nazca sin nada: que siga sin nada si cambian los privilegios por defecto del proyecto.
revoke all on public.user_profile from anon, authenticated, service_role;

grant select on public.user_profile to authenticated;
grant insert (user_id, activity_level, diet, likes, dislikes, dislikes_custom, consent_version)
  on public.user_profile to authenticated;
grant update (activity_level, diet, likes, dislikes, dislikes_custom, consent_version)
  on public.user_profile to authenticated;
grant delete on public.user_profile to authenticated;

revoke all on function public.check_user_profile() from public, anon, authenticated;
