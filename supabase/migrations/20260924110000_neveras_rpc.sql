-- ═══════════════════════════════════════════════════════════════════════════
-- Neveras: las funciones del modelo nuevo.
--
-- El modelo, el invariante «siempre al menos una: la privada», el destino del
-- inventario, las neveras huérfanas y la privacidad están explicados en la
-- cabecera de 20260924100000. Esto es lo que lo hace cumplir.
--
-- ── Lo que cambia respecto a 20260922110000 ───────────────────────────────
--
-- Todo lo que hablaba de «el hogar» del usuario, en singular, recibe ahora el
-- hogar por parámetro (`p_household_id`) y comprueba EN EL SERVIDOR dos cosas:
-- que quien llama pertenece a él, y que es del tipo y del rol que la acción
-- exige. El cliente puede mandar cualquier uuid; lo que decide es esto.
--
--   · `accept_invitation` ya NO mueve a nadie: añade la pertenencia. Por eso
--     desaparece `rehouse_user`, que existía solo para dar hogar a quien
--     salía, y `leave_household` ya no devuelve nada: quien sale de una
--     compartida sigue teniendo su privada.
--   · La privada no se invita, no se abandona, no se vacía y no se traspasa.
--   · Salir de una compartida siendo la única persona es posible, y la deja
--     huérfana (ver la cabecera de la migración anterior). Es la única salida
--     que hay: no existe «borrar nevera», y sin ella una persona con una
--     compartida a la que ya no va no podría liberar su plaza.
--
-- ── Los errores que la app distingue ──────────────────────────────────────
--
-- Los mensajes van en español y dicen qué hacer: la app los enseña TAL CUAL
-- para los SQLSTATE P0001, P0002 y 22023, y para los 42501 que escribe una
-- función nuestra. Pero un mensaje se puede reescribir, así que los casos que
-- la app tiene que distinguir para hacer algo distinto —ofrecer «salir de una
-- nevera», ofrecer «traspasar»— llevan además un `hint` estable, que es el
-- contrato. Se lee en `error.hint`, sin olfatear texto:
--
--   hint               SQLSTATE   Cuándo
--   ─────────────────  ─────────  ────────────────────────────────────────────
--   limite_neveras     P0001      La persona ya tiene tantas neveras como su
--                                 household_limit. Al crear una compartida y
--                                 al aceptar una invitación.
--   nevera_llena       P0001      No queda plaza en la nevera. Al invitar
--                                 (contando las invitaciones sin responder) y
--                                 al aceptar.
--   nevera_personal    P0001      Se ha intentado compartir, invitar, echar,
--                                 traspasar o abandonar la privada.
--   debe_traspasar     P0001      Quien lleva una compartida con más gente
--                                 quiere salir sin traspasarla antes.
--
-- Sin `hint`, un P0001 es cualquier otra regla de negocio (invitación ya
-- respondida, caducada…) y basta con enseñar el mensaje.
--
-- `invite_to_household` SIGUE devolviendo como RESULTADO —no como excepción—
-- lo que depende de la otra cuenta (`desconocida`, `ya_es_miembro`,
-- `ya_invitada`), y no añade ningún `outcome`: «nevera personal» habla de TU
-- nevera, no de la otra cuenta, así que es una excepción con su hint y no
-- puede servir para enumerar nada. Por lo mismo el tope de neveras de la otra
-- persona no se mira al invitar.
--
-- ── Por qué casi todo lo de aquí es SECURITY DEFINER ──────────────────────
--
-- El resto del esquema prefiere SECURITY INVOKER y deja que mande la RLS. Aquí
-- no se puede: `households` y `household_members` no tienen permiso de
-- INSERT, UPDATE ni DELETE desde el cliente, a propósito —«todo pasa por las
-- RPC»—, y una función INVOKER no podría escribir en ellas. Cada una, además:
--
--   · `create_shared_household`  inserta en households y household_members, y
--     bloquea (o crea) la fila de ajustes de la persona.
--   · `update_household`         households no tiene UPDATE: es la única vía, y
--     por eso comprueba a mano que quien llama es el dueño.
--   · Las de invitaciones, salir, echar y traspasar: lo mismo que antes, ver
--     20260922110000, más leer el nombre de OTRA persona (user_settings solo se
--     lee a sí misma).
--
-- Sigue siendo INVOKER lo que solo lee y donde la RLS basta: `my_households`.
--
-- El precio de SECURITY DEFINER es que aquí dentro la RLS no protege nada, así
-- que cada función comprueba a mano la pertenencia y el rol. Todas llevan
-- `set search_path = ''` y sacan el usuario de `auth.uid()`, nunca de un
-- argumento.
--
-- ── El orden de los cerrojos ──────────────────────────────────────────────
--
-- Varias funciones bloquean filas, por dos motivos distintos: para que dos
-- llamadas simultáneas no se salten un límite (el de neveras, el de plazas, el
-- de intentos por hora) y para que una decisión de ROL no se tome sobre un rol
-- que otra llamada acaba de cambiar. Bloquean SIEMPRE en el mismo orden, que es
-- lo único que impide que dos se queden esperándose una a la otra:
--
--     1º ajustes de la persona   →   2º la nevera   →   3º la invitación
--
--   · `create_shared_household`: 1º.
--   · `invite_to_household`: 1º (serializa los intentos de esa persona: sin
--     cerrojo, doce llamadas simultáneas contaban las doce «cero intentos» y las
--     doce sondeaban) y 2º.
--   · `accept_invitation`: los tres.
--   · `update_household`, `transfer_household_ownership`,
--     `remove_household_member`, `leave_household`, `cancel_invitation`: 2º (y
--     3º si tocan invitaciones).
--
-- Ninguna va hacia atrás. Y todas las que deciden por el rol lo LEEN otra vez
-- después de tomar el cerrojo de la nevera: la lectura previa solo sirve para
-- descartar rápido a quien no es de esa nevera sin ponerse en su cola. Sin la
-- segunda lectura, «traspasar mientras el destinatario se va» dejaba la nevera
-- sin dueño, dos traspasos a la vez dejaban dos, y el único dueño que salía
-- mientras invitaba dejaba una invitación viva en una nevera sin miembros.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1 · Se retira lo del modelo anterior ══════════════════════════════════
--
-- Se borran y se vuelven a crear, en vez de `create or replace`, porque cambian
-- de parámetros o de tipo de retorno, y PostgreSQL crearía una SEGUNDA función
-- con el mismo nombre: PostgREST no sabría a cuál llamar y la app fallaría con
-- un error de ambigüedad que no se parece en nada a su causa.
--
-- No se tocan `expire_stale_invitations`, que ya recibe la nevera por parámetro,
-- ni la lógica de `reject_invitation`, que solo mira la invitación y a su
-- destinatario: ninguna asume una sola nevera. De esta última solo se cambia la
-- frase de «ya respondida» (sección 6), para que hable igual que las demás.
drop function public.invite_to_household(text);
drop function public.accept_invitation(uuid);
drop function public.cancel_invitation(uuid);
drop function public.leave_household();
drop function public.remove_household_member(uuid);
drop function public.transfer_household_ownership(uuid);
drop function public.household_member_names();
drop function public.household_sent_invitations();
drop function public.my_pending_invitations();
drop function public.require_owner_household();

-- Existía solo para dar una nevera nueva y vacía a quien salía o era expulsado.
-- Ya nadie se queda sin nevera al salir de una: tiene la suya.
drop function public.rehouse_user(uuid);

-- ══ 2 · Auxiliares internas ═══════════════════════════════════════════════
--
-- Ninguna se concede a nadie: solo las llaman las funciones DEFINER de abajo,
-- así que corren como su propietario. Son INVOKER a propósito —no crean nada
-- que el propietario no pudiera ya— y filtran por auth.uid() de forma
-- explícita: el resultado es el mismo con RLS o sin ella. Llevan igualmente
-- `set search_path = ''`, con todos los nombres cualificados: que no escalen
-- privilegios no es motivo para dejar que un esquema ajeno se cuele por delante.

-- El nombre de una nevera, ya recortado. Lo validan crear y renombrar, y la
-- regla es una sola. Cubre lo que el CHECK de la tabla no ve (mide con
-- `trim`, que solo quita el espacio ASCII) y el mensaje llega antes que el
-- nombre de una restricción.
create function public.check_household_name(p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  -- Lo que se ve como un hueco: los blancos ASCII (tabulador, saltos de línea…),
  -- el NBSP, el espacio ideográfico, la familia U+2000–U+200A, y los «rellenos»
  -- que se pintan en blanco sin ser espacios (Braille vacío, fillers de hangul).
  -- `trim()` solo quita el espacio ASCII: un nombre de puro NBSP o de puro
  -- tabulador pasaba por «no vacío».
  c_blancos    constant text := '[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u115F\u1160\u2800\u3164\uFFA0]';

  -- Lo que no se ve y no debe ir en un nombre: caracteres de control (también
  -- el tabulador y los saltos de línea DENTRO del nombre) y de formato: ancho
  -- cero, marcas de dirección (bidi) que invierten el texto que las sigue, el
  -- BOM, el guion blando y las etiquetas invisibles. Cuesta una cosa: una
  -- secuencia de emoji unida con U+200D (la familia, por ejemplo) tampoco pasa.
  c_invisibles constant text := '[\u0001-\u001F\u007F-\u009F\u00AD\u0600-\u0605\u061C\u06DD\u070F\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\U000E0001\U000E0020-\U000E007F]';

  v_nombre text;
begin
  -- Se recortan los blancos de los bordes, los de verdad y no solo el espacio.
  v_nombre := regexp_replace(coalesce(p_name, ''), '^' || c_blancos || '+|' || c_blancos || '+$', '', 'g');

  if length(v_nombre) = 0 then
    raise exception 'Ponle un nombre a la nevera: de 1 a 80 caracteres.'
      using errcode = '22023';
  end if;

  if v_nombre ~ c_invisibles then
    raise exception 'Ese nombre lleva caracteres que no se ven. Bórralos y vuelve a escribirlo.'
      using errcode = '22023';
  end if;

  -- El número va en el mensaje: «tiene 93 y el máximo son 80» se arregla,
  -- «demasiado largo» no.
  if length(v_nombre) > 80 then
    raise exception 'El nombre tiene % caracteres y el máximo son 80. Acórtalo.', length(v_nombre)
      using errcode = '22023';
  end if;

  return v_nombre;
end;
$$;

-- El icono, contra la lista cerrada. La clave foránea lo impondría igualmente,
-- pero con un error del motor que nombra una restricción; esto avisa antes y en
-- cristiano.
create function public.check_household_icon(p_icon text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_icon is null or not exists (
    select 1 from public.household_icons i where i.key = p_icon
  ) then
    raise exception 'Ese icono no está en la lista. Elige uno de los que se ofrecen.'
      using errcode = '22023';
  end if;

  return p_icon;
end;
$$;

-- Bloquea la fila de ajustes de la persona y devuelve su límite de neveras.
--
-- ES EL CERROJO DEL LÍMITE. Cuenta y escribe se hacen bajo él: sin esto, dos
-- llamadas simultáneas —crear una compartida mientras se acepta otra— leerían
-- las dos «tienes una, caben dos» y entrarían las dos. Con la fila bloqueada
-- la segunda espera a que la primera confirme y cuenta ya con su pertenencia.
--
-- Si no hay fila —alguien anterior a la tabla de ajustes, que es justo para
-- quien existe la política de INSERT— se crea aquí, en vez de dejar a esa
-- persona sin poder crear ni aceptar nada. El nombre de usuario sale de la parte
-- local del correo, igual que en el relleno de 20260921160000, y NUNCA de los
-- metadatos de usuario: los edita el propio usuario (`auth.updateUser`), así que
-- no pueden dar identidad a nadie. `on conflict do nothing` sin objetivo cubre
-- tanto una llamada simultánea que la cree antes como un nombre de usuario ya
-- cogido; si después de eso sigue sin haber fila, se dice y no se inventa un
-- límite.
create function public.lock_household_limit(p_user_id uuid)
returns smallint
language plpgsql
set search_path = ''
as $$
declare
  v_limite smallint;
begin
  select s.household_limit into v_limite
  from public.user_settings s
  where s.user_id = p_user_id
  for update;

  if found then
    return v_limite;
  end if;

  insert into public.user_settings (user_id, username)
  select u.id, lower(split_part(u.email, '@', 1))
  from auth.users u
  where u.id = p_user_id
  on conflict do nothing;

  select s.household_limit into v_limite
  from public.user_settings s
  where s.user_id = p_user_id
  for update;

  if not found then
    raise exception 'No encuentro los ajustes de tu cuenta y no he podido crearlos. Cierra sesión y vuelve a entrar.'
      using errcode = 'P0002';
  end if;

  return v_limite;
end;
$$;

-- Exige que quien llama pertenezca a esta nevera Y que sea compartida, y
-- devuelve su rol. Es la base de todo lo que solo tiene sentido con más gente.
--
-- Con `p_lock` además BLOQUEA la nevera (2º cerrojo) y vuelve a leer el rol
-- BAJO el cerrojo. Las dos lecturas no son redundantes: la primera descarta
-- sin cola a quien no es de esta nevera (si no, cualquiera podría ponerse
-- delante de la cola de una nevera ajena con solo mandar su uuid); la segunda es
-- la que vale, porque entre la primera y el cerrojo otra llamada puede haber
-- traspasado la nevera, echado a esta persona o hecho que se fuera. Quien decide
-- por el rol tiene que hacerlo con el rol que hay MIENTRAS tiene el cerrojo.
--
-- «No existe» y «no es tuya» dan el MISMO mensaje: si fueran distintos, con una
-- lista de uuids se podría averiguar qué neveras existen.
create function public.require_shared_household_member(
  p_household_id  uuid,
  p_lock          boolean default false
)
returns public.household_role
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.household_kind;
  v_rol  public.household_role;
begin
  select h.kind, m.role into v_tipo, v_rol
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.household_id = p_household_id
    and m.user_id = (select auth.uid());

  if not found then
    raise exception 'Esa nevera no existe o no es tuya.'
      using errcode = 'P0002';
  end if;

  -- El tipo no cambia nunca, así que sobre una privada no hace falta esperar a
  -- ningún cerrojo para saber que no.
  if v_tipo = 'personal' then
    raise exception 'Esa es tu nevera privada y no se comparte. Para compartir, crea una nevera compartida.'
      using errcode = 'P0001', hint = 'nevera_personal';
  end if;

  if p_lock then
    perform 1 from public.households h where h.id = p_household_id for update;

    select m.role into v_rol
    from public.household_members m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid());

    if not found then
      raise exception 'Esa nevera no existe o no es tuya.'
        using errcode = 'P0002';
    end if;
  end if;

  return v_rol;
end;
$$;

-- Lo mismo, exigiendo además ser su dueño, y SIEMPRE bajo el cerrojo de la
-- nevera: quien la llama tiene la nevera bloqueada hasta el final de su
-- transacción. Devuelve el hogar para poder encadenarlo:
-- `v_household := public.require_owner_household(p_household_id)`.
create function public.require_owner_household(p_household_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if public.require_shared_household_member(p_household_id, true) <> 'owner' then
    raise exception 'Solo quien lleva la nevera compartida puede hacer esto. Pídeselo a esa persona.'
      using errcode = '42501';
  end if;

  return p_household_id;
end;
$$;

-- El estado de una invitación, en cristiano. Los mensajes de «ya está
-- respondida» soltaban el valor del enum tal cual (`accepted`), y un mensaje en
-- español con una palabra en inglés entre paréntesis es jerga del backend
-- filtrándose a pantalla.
create function public.invitation_status_es(p_status public.household_invitation_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
           when 'pending'   then 'pendiente'
           when 'accepted'  then 'aceptada'
           when 'rejected'  then 'rechazada'
           when 'cancelled' then 'cancelada'
           when 'expired'   then 'caducada'
         end;
$$;

comment on function public.check_household_name(text) is
  'Nombre de nevera recortado, o error 22023. Interna: no se concede a authenticated.';
comment on function public.check_household_icon(text) is
  'Icono validado contra household_icons, o error 22023. Interna.';
comment on function public.lock_household_limit(uuid) is
  'Bloquea los ajustes de la persona y devuelve su household_limit; los crea si '
  'no existen. El cerrojo que impide saltarse el límite con dos llamadas a la '
  'vez. Interna.';
comment on function public.require_shared_household_member(uuid, boolean) is
  'Devuelve el rol de quien llama en esa nevera si es suya y compartida; si '
  'no, P0002 o P0001/nevera_personal. Con p_lock bloquea la nevera y relee el '
  'rol bajo el cerrojo. Interna.';
comment on function public.require_owner_household(uuid) is
  'El hogar, si quien llama es el dueño de esa nevera compartida, con la '
  'nevera bloqueada hasta el final de la transacción; si no, 42501. Interna.';

revoke all on function public.invitation_status_es(public.household_invitation_status) from public, anon, authenticated;
revoke all on function public.check_household_name(text)              from public, anon, authenticated;
revoke all on function public.check_household_icon(text)              from public, anon, authenticated;
revoke all on function public.lock_household_limit(uuid)              from public, anon, authenticated;
revoke all on function public.require_shared_household_member(uuid, boolean) from public, anon, authenticated;
revoke all on function public.require_owner_household(uuid)           from public, anon, authenticated;

-- ══ 3 · Mis neveras, crear y personalizar ═════════════════════════════════

-- SECURITY INVOKER: lee solo, y la RLS basta. `households_select` y
-- `household_members_select` dejan ver exactamente las filas de MIS neveras,
-- que es también lo que hace falta para contar la gente de cada una.
--
-- Orden estable: la privada siempre primero, y después por antigüedad de la
-- pertenencia, es decir, en el orden en que la persona fue entrando. `h.id`
-- desempata para que dos llamadas seguidas no barajen dos neveras entradas en
-- el mismo instante.
create function public.my_households()
returns table (
  id            uuid,
  name          text,
  icon          text,
  kind          public.household_kind,
  role          public.household_role,
  member_count  integer,
  member_limit  smallint
)
language sql
stable
set search_path = ''
as $$
  select h.id,
         h.name,
         h.icon,
         h.kind,
         m.role,
         (select count(*)::integer
            from public.household_members mm
           where mm.household_id = h.id),
         h.member_limit
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = (select auth.uid())
  order by (h.kind = 'personal') desc, m.created_at, h.id;
$$;

comment on function public.my_households() is
  'Las neveras a las que pertenezco, con mi rol y cuánta gente hay. La privada '
  'primero, luego por orden de entrada. SECURITY INVOKER: la RLS decide.';

-- Crea una nevera compartida de la que quien llama es el dueño.
--
-- El icono es opcional: por omisión, un grupo de gente. El límite de neveras se
-- comprueba aquí y no en la app, bajo el cerrojo de los ajustes, y cuenta TODAS
-- las pertenencias —la privada también—: con household_limit = 2, quien tiene
-- la suya y una compartida ya no crea otra.
--
-- 5 plazas es el tope técnico de una nevera compartida. Está aquí y en ningún
-- otro sitio: si algún día cambia, se cambia en esta función.
create function public.create_shared_household(
  p_name  text,
  p_icon  text default null
)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me          uuid := auth.uid();
  v_nombre      text;
  v_icono       text;
  v_limite      smallint;
  v_tiene       integer;
  v_compartidas integer;
  v_house       public.households;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión para crear una nevera'
      using errcode = '28000';
  end if;

  -- Primero lo que no necesita cerrojo: un nombre o un icono malos no deben
  -- hacer esperar a nadie ni tocar la fila de ajustes.
  v_nombre := public.check_household_name(p_name);
  v_icono  := public.check_household_icon(coalesce(p_icon, 'users_three'));

  v_limite := public.lock_household_limit(v_me);

  select count(*), count(*) filter (where h.kind = 'shared')
    into v_tiene, v_compartidas
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = v_me;

  if v_tiene >= v_limite then
    -- Salir de una compartida es lo que libera plaza, pero quien la LLEVA y
    -- tiene más gente dentro no puede irse sin traspasarla antes (hint
    -- debe_traspasar): decir solo «sal de una compartida» le mandaría a un error.
    raise exception 'Has llegado al máximo de neveras: tu plan por ahora llega a %.%',
      v_limite,
      case when v_compartidas > 0
           then ' Para hacer sitio, sal de una compartida. Si la llevas tú y hay más gente, traspásala antes.'
           else '' end
      using errcode = 'P0001', hint = 'limite_neveras';
  end if;

  insert into public.households (name, kind, icon, member_limit)
  values (v_nombre, 'shared', v_icono, 5)
  returning * into v_house;

  insert into public.household_members (household_id, user_id, role)
  values (v_house.id, v_me, 'owner');

  return v_house;
end;
$$;

comment on function public.create_shared_household(text, text) is
  'Crea una nevera compartida con nombre e icono, de la que soy el dueño. '
  'Comprueba en el servidor y bajo cerrojo que no supero mi household_limit '
  '(la privada cuenta). Error P0001 con hint limite_neveras si no cabe.';

-- Cambia el nombre y/o el icono. Solo el dueño, y solo esas dos cosas: ni
-- `kind` ni `member_limit` ni nada más se pueden tocar desde aquí.
--
-- Un parámetro a NULL significa «no lo cambies», así que la app puede mandar
-- solo lo que ha tocado la persona. Una cadena vacía NO es null: se valida y se
-- rechaza, en vez de dejar una nevera sin nombre por un campo mal leído.
--
-- Vale para la privada también: su dueño es su persona y puede ponerle el
-- nombre y el icono que quiera.
create function public.update_household(
  p_household_id  uuid,
  p_name          text default null,
  p_icon          text default null
)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_rol    public.household_role;
  v_nombre text;
  v_icono  text;
  v_house  public.households;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión'
      using errcode = '28000';
  end if;

  -- Primera lectura, sin cerrojo: descarta a quien no es de esta nevera sin
  -- ponerse en su cola.
  select m.role into v_rol
  from public.household_members m
  where m.household_id = p_household_id
    and m.user_id = v_me;

  if not found then
    raise exception 'Esa nevera no existe o no es tuya.'
      using errcode = 'P0002';
  end if;

  -- El cerrojo de la nevera y el rol OTRA VEZ, bajo él: entre la lectura y el
  -- cerrojo, una llamada simultánea puede haber traspasado la nevera.
  perform 1 from public.households h where h.id = p_household_id for update;

  select m.role into v_rol
  from public.household_members m
  where m.household_id = p_household_id
    and m.user_id = v_me;

  if not found then
    raise exception 'Esa nevera no existe o no es tuya.'
      using errcode = 'P0002';
  end if;

  -- El mensaje lo escribe esta función y no el motor: el 42501 que daría la
  -- falta de permiso de UPDATE diría «permission denied for table households».
  if v_rol <> 'owner' then
    raise exception 'Solo quien lleva la nevera puede cambiarle el nombre o el icono. Pídeselo a esa persona.'
      using errcode = '42501';
  end if;

  if p_name is not null then
    v_nombre := public.check_household_name(p_name);
  end if;
  if p_icon is not null then
    v_icono := public.check_household_icon(p_icon);
  end if;

  update public.households h
     set name = coalesce(v_nombre, h.name),
         icon = coalesce(v_icono, h.icon)
   where h.id = p_household_id
  returning h.* into v_house;

  return v_house;
end;
$$;

comment on function public.update_household(uuid, text, text) is
  'Renombra y/o cambia el icono de una nevera. Solo el dueño. null = no '
  'cambiar. Es la única vía de escritura sobre households.';

-- ══ 4 · Invitar ═══════════════════════════════════════════════════════════
--
-- Igual que en 20260922110000 en todo lo que tiene que seguir igual, que es
-- casi todo: SECURITY DEFINER por resolver un nombre ajeno y escribir en una
-- tabla sin INSERT; los fallos que dependen de la otra cuenta se DEVUELVEN, no
-- se lanzan; cinco intentos por hora; el registro de intentos no guarda el
-- nombre probado; y FOR UPDATE sobre la nevera mientras se cuenta.
--
-- ── Por qué esto DEVUELVE los fallos en vez de lanzarlos ──────────────────
--
-- Un `raise exception` deshace la transacción, y con ella el apunte del intento
-- en household_invite_attempts. O sea: si «ese nombre no existe» fuera una
-- excepción, probar nombres saldría GRATIS y el límite por hora no limitaría
-- nada. Justo el ataque que hay que frenar.
--
-- Así que los desenlaces que dependen de OTRA cuenta se devuelven como
-- resultado —con su código para la app y su frase en español— y la transacción
-- confirma, dejando el intento contado. Se lanzan como excepción, y por tanto se
-- deshacen, solo los errores que hablan de TI y de tu nevera: sin sesión, no
-- eres el dueño, la nevera es tu privada, el nombre está mal escrito, la nevera
-- está llena o te has pasado de intentos. Ninguno depende de si la cuenta
-- contraria existe, así que ninguno sirve para enumerar.
--
-- Lo único que cambia es el parámetro: ahora se dice A QUÉ nevera se invita,
-- porque se pertenece a varias.
create function public.invite_to_household(
  p_household_id  uuid,
  p_username      text
)
returns table (
  outcome        text,
  message        text,
  invitation_id  uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_household uuid;
  v_username  text;
  v_target    uuid;
  v_intentos  integer;
  v_limite    smallint;
  v_ocupadas  integer;
  v_id        uuid;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión para invitar a alguien'
      using errcode = '28000';
  end if;

  -- 1º cerrojo: los ajustes de QUIEN INVITA. Serializa a esta persona, y es lo
  -- que hace que el tope de intentos por hora sea un tope. El ritmo de más
  -- abajo cuenta filas ya confirmadas, y sin cerrojo doce llamadas simultáneas
  -- de una misma cuenta leían las doce «cero intentos», sondeaban las doce y
  -- quedaban registradas las doce. Con el cerrojo, la segunda espera a que la
  -- primera confirme su apunte y cuenta ya con él. Es también el primer eslabón
  -- de la cadena (ver la cabecera), así que no cambia el orden de nadie.
  perform public.lock_household_limit(v_me);

  -- 2º cerrojo, dentro de esto: la nevera, con el rol comprobado bajo él. Solo
  -- el dueño de una compartida invita. Sobre la privada, error con hint
  -- nevera_personal: la privada tiene una sola plaza y no se comparte.
  v_household := public.require_owner_household(p_household_id);

  -- El formato se valida antes de nada: un nombre que no puede existir no gasta
  -- intento y no llega a tocar el padrón.
  v_username := lower(trim(coalesce(p_username, '')));
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Un nombre de usuario son entre 3 y 20 letras, números o guion bajo. Revisa cómo lo has escrito.'
      using errcode = '22023';
  end if;

  -- El ritmo, antes que nada de lo demás. Cuenta los intentos ya confirmados,
  -- que es lo único que sobrevive a una excepción, y lo hace bajo el cerrojo de
  -- arriba. Es por PERSONA y no por nevera: quien tiene dos compartidas no tiene
  -- diez intentos por hora.
  select count(*) into v_intentos
  from public.household_invite_attempts a
  where a.user_id = v_me
    and a.created_at > now() - interval '1 hour';

  if v_intentos >= 5 then
    raise exception 'Has hecho demasiados intentos de invitación en la última hora. Espera un rato y vuelve a probar.'
      using errcode = 'P0001';
  end if;

  -- FOR UPDATE: bloquea la fila de la nevera mientras se cuenta. Es lo que
  -- impide que dos invitaciones simultáneas lean las dos «queda una plaza» y
  -- ocupen las dos la misma. El cerrojo se suelta al terminar la transacción.
  select h.member_limit into v_limite
  from public.households h
  where h.id = v_household
  for update;

  -- Las caducadas dejan de ocupar plaza y dejan de bloquear el índice único.
  --
  -- Va DESPUÉS del cerrojo de la nevera, no antes, y el orden importa: marcar
  -- caducadas es un UPDATE sobre invitaciones, que es el tercer cerrojo de la
  -- cadena. Tomarlo antes que el segundo se cruza con `accept_invitation`
  -- —que bloquea nevera y luego invitación— si alguien acepta justo la
  -- invitación caducada que esta pasada estaba marcando: cada una esperaría a la
  -- otra. Con el orden de la cabecera no hay ciclo posible.
  perform public.expire_stale_invitations(v_household);

  -- Miembros actuales MÁS invitaciones sin responder: una invitación pendiente
  -- es una plaza ya prometida. Contar solo los miembros permitiría invitar a
  -- diez personas para cinco plazas y que ganasen las primeras en aceptar.
  select
    (select count(*) from public.household_members m where m.household_id = v_household)
    + (select count(*) from public.household_invitations i
        where i.household_id = v_household and i.status = 'pending')
  into v_ocupadas;

  if v_ocupadas >= v_limite then
    raise exception 'Esta nevera está llena: % plazas contando las invitaciones sin responder. Cancela una invitación o saca a alguien antes de invitar.', v_limite
      using errcode = 'P0001', hint = 'nevera_llena';
  end if;

  -- Aquí, y solo aquí, se toca el padrón.
  select s.user_id into v_target
  from public.user_settings s
  where lower(s.username) = v_username;

  -- Invitarse a uno mismo no revela nada que no supieras, así que sí se lanza.
  if v_target = v_me then
    raise exception 'Ese nombre de usuario es el tuyo. Invita a otra persona.'
      using errcode = '22023';
  end if;

  if v_target is null then
    insert into public.household_invite_attempts (user_id, outcome) values (v_me, 'desconocida');
    return query select
      'desconocida'::text,
      'No hay ninguna cuenta con ese nombre de usuario. Compruébalo con la persona a la que quieres invitar'::text,
      null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.household_members m
    where m.household_id = v_household and m.user_id = v_target
  ) then
    insert into public.household_invite_attempts (user_id, outcome) values (v_me, 'ya_es_miembro');
    return query select
      'ya_es_miembro'::text,
      'Esa persona ya está en esta nevera'::text,
      null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.household_invitations i
    where i.household_id = v_household
      and i.invitee_id = v_target
      and i.status = 'pending'
  ) then
    insert into public.household_invite_attempts (user_id, outcome) values (v_me, 'ya_invitada');
    return query select
      'ya_invitada'::text,
      'Ya le enviaste una invitación y todavía no la ha respondido'::text,
      null::uuid;
    return;
  end if;

  insert into public.household_invitations (household_id, inviter_id, invitee_id)
  values (v_household, v_me, v_target)
  returning id into v_id;

  insert into public.household_invite_attempts (user_id, outcome) values (v_me, 'creada');

  return query select
    'creada'::text,
    'Invitación enviada. Le aparecerá en su app y caduca en siete días'::text,
    v_id;
end;
$$;

comment on function public.invite_to_household(uuid, text) is
  'Invita por nombre de usuario a una nevera compartida de la que soy dueño. '
  'Devuelve outcome creada | desconocida | ya_es_miembro | ya_invitada con su '
  'mensaje. Lanza error solo cuando el problema es tuyo: sesión, rol, nevera '
  'privada (hint nevera_personal), formato, nevera llena (hint nevera_llena) o '
  'ritmo.';

-- ══ 5 · Aceptar ═══════════════════════════════════════════════════════════
--
-- AÑADE una pertenencia. No mueve a nadie ni saca a nadie de nada: quien acepta
-- conserva su privada y cualquier otra nevera en la que ya estuviera.
--
-- Hay que pasar dos filtros y los dos son del servidor, porque los dos pueden
-- haber cambiado entre que se envió la invitación y que se acepta:
--
--   a) la nevera tiene sitio (`member_limit`), bajo el cerrojo de la nevera, y
--   b) quien acepta no supera su propio límite de neveras (`household_limit`),
--      bajo el cerrojo de SUS ajustes.
--
-- Se comprueba primero la nevera: si está llena, que la persona haga sitio en
-- su límite no arregla nada, y mandarla a salir de otra para descubrir después
-- que esta tampoco cabe sería peor que decirlo ya.
--
-- SECURITY DEFINER: escribe en household_members —sin política de INSERT— y
-- cierra la invitación, que tampoco tiene UPDATE. Comprueba a mano que la
-- invitación es TUYA: lo único que llega de fuera es su id.
create function public.accept_invitation(p_invitation_id uuid)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me              uuid := auth.uid();
  v_inv             public.household_invitations;
  v_limite_persona  smallint;
  v_limite_nevera   smallint;
  v_tipo            public.household_kind;
  v_miembros        integer;
  v_mias            integer;
  v_house           public.households;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión para aceptar una invitación'
      using errcode = '28000';
  end if;

  -- 1º cerrojo: mis ajustes. Es el primero de la cadena y se toma antes de
  -- saber siquiera si la invitación existe, porque el orden tiene que ser el
  -- mismo siempre (ver la cabecera). Bloquear tu propia fila es gratis: nadie
  -- más la usa para nada que no sea contar TUS neveras.
  v_limite_persona := public.lock_household_limit(v_me);

  -- Primera lectura SIN bloquear, solo para saber de qué nevera hablamos.
  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id;

  -- El mismo mensaje para «no existe» y «no es tuya»: si fueran distintos, con
  -- una lista de uuids se podría averiguar qué invitaciones existen.
  if not found or v_inv.invitee_id <> v_me then
    raise exception 'Esa invitación no existe o no es para ti.'
      using errcode = 'P0002';
  end if;

  -- 2º cerrojo: la nevera.
  select h.member_limit, h.kind into v_limite_nevera, v_tipo
  from public.households h
  where h.id = v_inv.household_id
  for update;

  -- 3º: la invitación. Entre la primera lectura y esta puede haber pasado
  -- cualquier cosa: aquí es donde se ve una doble aceptación.
  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id
  for update;

  if v_inv.status <> 'pending' then
    raise exception 'Esa invitación ya está % y no se puede volver a aceptar.', public.invitation_status_es(v_inv.status)
      using errcode = 'P0001';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'La invitación ha caducado. Pídele a esa persona que te invite otra vez.'
      using errcode = 'P0001';
  end if;

  -- No debería poder existir una invitación a una privada: invitar lo impide.
  -- Si alguna se colara, entrar en ella rompería la única promesa de la privada.
  if v_tipo = 'personal' then
    raise exception 'Esa invitación ya no es válida: la nevera es privada y no se comparte.'
      using errcode = 'P0001', hint = 'nevera_personal';
  end if;

  -- Quien invitó tiene que seguir llevando esta nevera, y la nevera tiene que
  -- seguir teniendo a alguien: una invitación es la palabra de un dueño, y si
  -- ese dueño se fue, dejó de serlo o expulsaron, ya no la respalda nadie. Sin
  -- esto, quien aceptaba una invitación huérfana entraba en una nevera sin
  -- miembros y leía el inventario de quien se fue.
  --
  -- Salir, ser expulsado y traspasar CANCELAN las invitaciones pendientes de
  -- esa persona, así que aquí no debería llegar ninguna: esto es el seguro para
  -- las que se cuelen (un dato heredado, un UPDATE a mano). No la marca como
  -- cancelada porque una excepción deshace el UPDATE; se rechaza, no revela
  -- nada más, y `my_pending_invitations` ya no la enseña.
  if not exists (
    select 1 from public.household_members m
    where m.household_id = v_inv.household_id
      and m.user_id = v_inv.inviter_id
      and m.role = 'owner'
  ) then
    raise exception 'Esa invitación ya no es válida. Pídele a esa persona que te invite otra vez.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.household_members m
    where m.household_id = v_inv.household_id and m.user_id = v_me
  ) then
    raise exception 'Ya estás en esa nevera.'
      using errcode = 'P0001';
  end if;

  -- a) ¿Cabe una persona más? Se cuentan solo los miembros: la plaza que te
  -- reservó tu propia invitación es justo la que vas a ocupar. Con la fila de
  -- la nevera bloqueada, dos aceptaciones simultáneas se ponen en fila y la
  -- segunda ve el recuento ya actualizado.
  select count(*) into v_miembros
  from public.household_members m
  where m.household_id = v_inv.household_id;

  if v_miembros >= v_limite_nevera then
    raise exception 'Esa nevera está llena: % plazas. Pídele a quien la lleva que haga sitio y vuelve a aceptar.', v_limite_nevera
      using errcode = 'P0001', hint = 'nevera_llena';
  end if;

  -- b) ¿Me cabe una nevera más a mí? Cuenta TODAS mis pertenencias, la
  -- privada incluida. Con mis ajustes bloqueados, esto y una creación
  -- simultánea de otra compartida se ponen en fila.
  select count(*) into v_mias
  from public.household_members m
  where m.user_id = v_me;

  if v_mias >= v_limite_persona then
    raise exception 'No puedes unirte: tu plan por ahora llega a % neveras y ya las tienes. Sal de una compartida y vuelve a aceptar. Si la llevas tú y hay más gente, traspásala antes.', v_limite_persona
      using errcode = 'P0001', hint = 'limite_neveras';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_inv.household_id, v_me, 'member');

  update public.household_invitations i
     set status = 'accepted', responded_at = now()
   where i.id = p_invitation_id;

  select h.* into v_house from public.households h where h.id = v_inv.household_id;
  return v_house;
end;
$$;

comment on function public.accept_invitation(uuid) is
  'Me añade a la nevera que me invitó, sin sacarme de ninguna. Comprueba, bajo '
  'cerrojo, que la nevera tiene plaza (hint nevera_llena) y que no supero mi '
  'límite de neveras (hint limite_neveras).';

-- ══ 6 · Rechazar y cancelar ═══════════════════════════════════════════════
--
-- `reject_invitation` conserva su lógica y su firma, que no asumen una sola
-- nevera: mira la invitación y a su destinatario, nada más. Solo se reescribe la
-- frase de «ya respondida», con `create or replace` (los permisos se conservan).
-- Cancelar sí cambia de verdad, porque comprobaba «eres el dueño de TU hogar» y
-- ahora la invitación dice de qué nevera es y se comprueba ESA.

create or replace function public.reject_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := auth.uid();
  v_inv public.household_invitations;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id
  for update;

  if not found or v_inv.invitee_id <> v_me then
    raise exception 'Esa invitación no existe o no es para ti.'
      using errcode = 'P0002';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Esa invitación ya está %.', public.invitation_status_es(v_inv.status)
      using errcode = 'P0001';
  end if;

  update public.household_invitations i
     set status = 'rejected', responded_at = now()
   where i.id = p_invitation_id;
end;
$$;

-- SECURITY DEFINER: household_invitations no tiene permiso de UPDATE, y cerrar
-- una invitación es un UPDATE. Nada más sale de fuera que el id; quién eres
-- sale de auth.uid().
create function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := auth.uid();
  v_inv public.household_invitations;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id;

  -- «No existe» y «es de una nevera que no es tuya» dicen lo mismo: si no,
  -- preguntar por uuids ajenos serviría para saber cuáles existen.
  if not found or not public.is_household_member(v_inv.household_id) then
    raise exception 'Esa invitación no existe o no la envió esta nevera.'
      using errcode = 'P0002';
  end if;

  -- Ya se sabe que es de una nevera tuya: ahora, que la lleves tú.
  perform public.require_owner_household(v_inv.household_id);

  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id
  for update;

  if v_inv.status <> 'pending' then
    raise exception 'Esa invitación ya está % y no hay nada que cancelar.', public.invitation_status_es(v_inv.status)
      using errcode = 'P0001';
  end if;

  update public.household_invitations i
     set status = 'cancelled', responded_at = now()
   where i.id = p_invitation_id;
end;
$$;

comment on function public.cancel_invitation(uuid) is
  'Retira una invitación que todavía no ha respondido nadie. Solo el dueño de '
  'la nevera a la que apunta.';

-- ══ 7 · Salir, expulsar y traspasar ═══════════════════════════════════════

-- Salir de una nevera compartida. La privada no se abandona.
--
-- Ya no crea nada: quien sale sigue teniendo su privada, y lo que había en la
-- nevera que deja se queda allí, porque es de la nevera y no suyo.
--
-- Si quien sale es el dueño y hay más gente, tiene que traspasarla antes, o se
-- iría dejando la casa sin llaves (hint debe_traspasar). Si es la ÚNICA persona,
-- sí puede irse: la nevera queda huérfana, que es la decisión documentada en la
-- cabecera de 20260924100000, y es la única forma que hay de liberar su plaza
-- en el límite de neveras.
--
-- Las invitaciones PENDIENTES que envió quien se va se cancelan, sea quien sea
-- y queden otros o no, y si la nevera queda sin nadie se cancelan TODAS:
-- aceptar una metería a alguien en una nevera sin dueño, donde nadie podría
-- invitar ni traspasar nada.
--
-- El rol se lee bajo el cerrojo de la nevera. Con la lectura previa, «el
-- destinatario de un traspaso se va mientras se le traspasa» y «el que iba a
-- ser el último se va cuando ya no lo era» decidían sobre un rol viejo.
--
-- SECURITY DEFINER: borra su pertenencia (household_members no tiene política de
-- DELETE) y cancela invitaciones (household_invitations, ni de UPDATE).
create function public.leave_household(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := auth.uid();
  v_rol    public.household_role;
  v_quedan integer;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  -- Bloquea la nevera (2º cerrojo) y devuelve el rol BAJO el cerrojo. Es el
  -- mismo cerrojo que toman aceptar, invitar y traspasar, y por eso «me voy
  -- siendo el último», «entra alguien» y «me traspasan la nevera» no se cruzan.
  v_rol := public.require_shared_household_member(p_household_id, true);

  select count(*) into v_quedan
  from public.household_members m
  where m.household_id = p_household_id
    and m.user_id <> v_me;

  if v_rol = 'owner' and v_quedan > 0 then
    raise exception 'Llevas esta nevera y hay más gente en ella. Traspásala a otra persona antes de salir.'
      using errcode = 'P0001', hint = 'debe_traspasar';
  end if;

  delete from public.household_members m
  where m.household_id = p_household_id
    and m.user_id = v_me;

  -- Lo que envió quien se va deja de valer con él, y si la nevera se queda sin
  -- nadie no vale ninguna.
  update public.household_invitations i
     set status = 'cancelled', responded_at = now()
   where i.household_id = p_household_id
     and i.status = 'pending'
     and (i.inviter_id = v_me or v_quedan = 0);
end;
$$;

comment on function public.leave_household(uuid) is
  'Salgo de una nevera compartida. Sigo teniendo mi privada. El dueño tiene que '
  'traspasarla antes si hay más gente (hint debe_traspasar); si es el único, '
  'la nevera queda huérfana. La privada no se abandona (hint nevera_personal).';

-- Saca a alguien de una nevera compartida. Ya no le crea un hogar nuevo: tiene
-- el suyo. SECURITY DEFINER: borra la pertenencia de OTRA persona, cosa que esa
-- persona no ha pedido y que no puede hacer por ella. Quien llama sale de
-- auth.uid() y se le exige ser dueño de esa misma nevera.
create function public.remove_household_member(
  p_household_id  uuid,
  p_user_id       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_household uuid;
  v_borradas  integer;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  -- Con la nevera bloqueada y el rol leído bajo el cerrojo.
  v_household := public.require_owner_household(p_household_id);

  if p_user_id = v_me then
    raise exception 'No puedes sacarte a ti: traspasa la nevera a otra persona y sal después.'
      using errcode = 'P0001';
  end if;

  -- Se borra y se mira cuántas filas han caído, en vez de mirar antes y borrar
  -- después: aquí no hay hueco entre las dos cosas.
  delete from public.household_members m
  where m.household_id = v_household and m.user_id = p_user_id;

  get diagnostics v_borradas = row_count;
  if v_borradas = 0 then
    raise exception 'Esa persona no está en esta nevera.'
      using errcode = 'P0002';
  end if;

  -- Lo que esa persona hubiera enviado ya no lo respalda nadie.
  update public.household_invitations i
     set status = 'cancelled', responded_at = now()
   where i.household_id = v_household
     and i.inviter_id = p_user_id
     and i.status = 'pending';
end;
$$;

comment on function public.remove_household_member(uuid, uuid) is
  'Saca a alguien de una nevera compartida. Solo su dueño, y nunca a sí mismo. '
  'A quien sacan le quedan sus demás neveras, la privada siempre.';

-- Pasa el mando de una nevera compartida. SECURITY DEFINER: household_members
-- no tiene política de UPDATE, y cambiar el rol de dos filas —la de quien
-- entrega y la de quien recibe— es un UPDATE.
create function public.transfer_household_ownership(
  p_household_id  uuid,
  p_user_id       uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_household uuid;
  v_filas     integer;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  -- Con la nevera bloqueada y el rol leído bajo el cerrojo: dos traspasos a la
  -- vez ya no pasan los dos por «soy el dueño», y traspasar a alguien que se
  -- está yendo espera a que termine de irse.
  v_household := public.require_owner_household(p_household_id);

  if p_user_id = v_me then
    raise exception 'Esta nevera ya es tuya.'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = v_household and m.user_id = p_user_id
  ) then
    raise exception 'Esa persona no está en esta nevera: invítala antes de traspasársela.'
      using errcode = 'P0002';
  end if;

  update public.household_members m
     set role = 'owner'
   where m.household_id = v_household and m.user_id = p_user_id;

  -- Cada UPDATE tiene que haber tocado exactamente una fila. Con el cerrojo no
  -- puede ser otra cosa; si algún día lo fuera, se deshace todo en vez de dejar
  -- una nevera con dos dueños o con ninguno.
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'Esa persona no está en esta nevera: invítala antes de traspasársela.'
      using errcode = 'P0002';
  end if;

  update public.household_members m
     set role = 'member'
   where m.household_id = v_household and m.user_id = v_me;

  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'La nevera ha cambiado mientras la traspasabas. Vuelve a probar.'
      using errcode = 'P0001';
  end if;

  -- Las invitaciones que había enviado quien entrega el mando dejan de valer:
  -- las respaldaba un dueño que ya no lo es. Quien lleva ahora la nevera puede
  -- volver a enviarlas.
  update public.household_invitations i
     set status = 'cancelled', responded_at = now()
   where i.household_id = v_household
     and i.inviter_id = v_me
     and i.status = 'pending';
end;
$$;

comment on function public.transfer_household_ownership(uuid, uuid) is
  'Pasa el mando de una nevera compartida a otro miembro. Quien la entrega se '
  'queda dentro como member, que es lo que le permite salirse.';

-- ══ 8 · Quién hizo qué, y quién te ha invitado ════════════════════════════

-- `inventory_events.user_id` guarda quién hizo cada acción, pero el nombre vive
-- en user_settings, que por RLS solo se lee a sí misma. Sin esto, el historial
-- de un elemento solo puede decir «alguien».
--
-- SECURITY DEFINER porque tiene que leer el user_settings de otra persona. El
-- filtro es el que marca la frontera: los miembros de UNA nevera de la que quien
-- llama es miembro, y de ninguna más.
--
-- Vale también para la privada, y esto es lo único que se aparta de «solo
-- compartidas»: el historial de un elemento de tu privada necesita saber quién
-- hizo cada cosa igual que el de una compartida, y devolverte tu propio nombre
-- no filtra nada. Negarlo obligaría a la app a tratar la privada como un caso
-- aparte solo para esta pantalla.
--
-- Limitación conocida: quien ya se fue de la nevera no sale aquí, así que sus
-- eventos antiguos se quedan sin nombre. Es deliberado — lo contrario sería
-- seguir enseñando el nombre de alguien que ya no está.
create function public.household_member_names(p_household_id uuid)
returns table (
  user_id   uuid,
  username  text,
  role      public.household_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Esa nevera no existe o no es tuya.'
      using errcode = 'P0002';
  end if;

  return query
    select m.user_id, s.username, m.role
    from public.household_members m
    join public.user_settings s on s.user_id = m.user_id
    where m.household_id = p_household_id
    order by s.username;
end;
$$;

comment on function public.household_member_names(uuid) is
  'Los nombres de usuario de la gente de UNA nevera mía, y de nadie más. Para '
  'pintar el historial con nombres en vez de con uuids. Vale para la privada.';

-- Las invitaciones que me han mandado, con el nombre de quien invita y el de la
-- nevera, más su icono. La RLS deja ver la fila de la invitación, pero no el
-- nombre de la nevera (todavía no eres miembro) ni el de quien invita
-- (user_settings es privada), así que sin esto la pantalla solo podría enseñar
-- dos uuids. Es lo que hace posible el «Te han invitado a «X»» fuera de Ajustes.
--
-- SECURITY DEFINER por eso mismo. Y es exactamente el filtrado que la cabecera
-- de 20260922110000 describe como aceptable: quien te invita se identifica ante
-- ti porque ha decidido invitarte.
--
-- Cambia el tipo de retorno (añade `household_icon`), de ahí el drop de arriba.
create function public.my_pending_invitations()
returns table (
  id                uuid,
  household_id      uuid,
  household_name    text,
  household_icon    text,
  inviter_username  text,
  created_at        timestamptz,
  expires_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.household_id, h.name, h.icon, s.username, i.created_at, i.expires_at
  from public.household_invitations i
  join public.households h on h.id = i.household_id
  join public.user_settings s on s.user_id = i.inviter_id
  where i.invitee_id = (select auth.uid())
    and i.status = 'pending'
    and i.expires_at > now()
    -- Solo las que todavía respalda quien las envió, que tiene que seguir
    -- llevando la nevera. Es lo mismo que exige aceptar, dicho antes de que la
    -- persona toque el botón.
    and exists (
      select 1 from public.household_members m
      where m.household_id = i.household_id
        and m.user_id = i.inviter_id
        and m.role = 'owner'
    )
  order by i.created_at desc;
$$;

comment on function public.my_pending_invitations() is
  'Invitaciones pendientes y sin caducar dirigidas a mí, con el nombre y el '
  'icono de la nevera y el nombre de quien invita.';

-- Las que ha enviado UNA nevera compartida mía, con el nombre de a quién. Las
-- ve cualquier miembro, no solo el dueño: son gente que va a entrar en la misma
-- nevera y el nombre lo escribió alguien de casa. La privada no tiene: no hay a
-- quién invitar.
create function public.household_sent_invitations(p_household_id uuid)
returns table (
  id                uuid,
  invitee_username  text,
  status            public.household_invitation_status,
  created_at        timestamptz,
  expires_at        timestamptz,
  responded_at      timestamptz
)
language plpgsql
-- Sin `stable`: llama a require_shared_household_member, que es volátil, y el
-- linter avisa (con razón) de que una función marcada estable no puede fiarse
-- de lo que llama. Volátil basta: la app la llama con .rpc(), que es un POST.
security definer
set search_path = ''
as $$
begin
  perform public.require_shared_household_member(p_household_id);

  return query
    select i.id, s.username, i.status, i.created_at, i.expires_at, i.responded_at
    from public.household_invitations i
    join public.user_settings s on s.user_id = i.invitee_id
    where i.household_id = p_household_id
    order by i.created_at desc;
end;
$$;

comment on function public.household_sent_invitations(uuid) is
  'Historial de invitaciones enviadas por UNA nevera compartida mía, con el '
  'nombre de usuario de cada destinatario.';

-- ══ 9 · Permisos ══════════════════════════════════════════════════════════

revoke all on function public.my_households()                             from public, anon;
revoke all on function public.create_shared_household(text, text)        from public, anon;
revoke all on function public.update_household(uuid, text, text)         from public, anon;
revoke all on function public.invite_to_household(uuid, text)            from public, anon;
revoke all on function public.accept_invitation(uuid)                    from public, anon;
revoke all on function public.cancel_invitation(uuid)                    from public, anon;
revoke all on function public.leave_household(uuid)                      from public, anon;
revoke all on function public.remove_household_member(uuid, uuid)        from public, anon;
revoke all on function public.transfer_household_ownership(uuid, uuid)   from public, anon;
revoke all on function public.household_member_names(uuid)               from public, anon;
revoke all on function public.my_pending_invitations()                   from public, anon;
revoke all on function public.household_sent_invitations(uuid)           from public, anon;

grant execute on function public.my_households()                           to authenticated;
grant execute on function public.create_shared_household(text, text)      to authenticated;
grant execute on function public.update_household(uuid, text, text)       to authenticated;
grant execute on function public.invite_to_household(uuid, text)          to authenticated;
grant execute on function public.accept_invitation(uuid)                  to authenticated;
grant execute on function public.cancel_invitation(uuid)                  to authenticated;
grant execute on function public.leave_household(uuid)                    to authenticated;
grant execute on function public.remove_household_member(uuid, uuid)     to authenticated;
grant execute on function public.transfer_household_ownership(uuid, uuid) to authenticated;
grant execute on function public.household_member_names(uuid)             to authenticated;
grant execute on function public.my_pending_invitations()                 to authenticated;
grant execute on function public.household_sent_invitations(uuid)         to authenticated;

-- ── Por qué el member no invita ni echa a nadie ───────────────────────────
--
-- Sigue valiendo lo de 20260922110000: con los dos permisos iguales, cualquiera
-- podría echar al otro y la discusión la ganaría quien pulse antes. Con un
-- dueño, la asimetría es explícita y reversible —`transfer_household_ownership`
-- existe para eso—, y quien no está a gusto siempre puede salirse por su
-- cuenta: `leave_household` es la única acción que un member puede hacer sin
-- permiso de nadie. Y ahora salirse cuesta menos que antes: no te deja sin
-- nevera, porque la tuya sigue ahí.
