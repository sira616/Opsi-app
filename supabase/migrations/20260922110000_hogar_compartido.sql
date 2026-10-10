-- ═══════════════════════════════════════════════════════════════════════════
-- Nevera compartida: invitaciones, roles y límite de miembros.
--
-- El modelo ya soportaba el hogar compartido desde la migración fundacional
-- —`household_members` admite varias filas por hogar y toda la RLS pasa por
-- `is_household_member()`—; lo que faltaba era poder entrar. Esto es eso.
--
-- ── El invariante que no se puede romper ──────────────────────────────────
--
-- Cada usuario pertenece SIEMPRE a exactamente un hogar. No a cero. Todas las
-- políticas del esquema lo dan por hecho: un usuario sin hogar no ve nada, no
-- puede dar de alta nada y la app se le queda en blanco sin un error que lo
-- explique. Por eso salir de un hogar no es «borrar la fila y ya», sino
-- MOVERSE: se borra la pertenencia vieja y se crea un hogar nuevo y vacío del
-- que esa persona es `owner`, en la misma transacción.
--
-- ── La decisión menos obvia: el inventario es del hogar ───────────────────
--
-- Quien sale, o a quien echan, NO se lleva la comida. El inventario, la lista
-- de la compra y el historial se quedan en el hogar que se abandona, porque
-- son del hogar y no de la persona: la leche estaba en esa nevera y ahí sigue.
-- La persona empieza con un hogar vacío.
--
-- Lo mismo vale al ACEPTAR una invitación: te vas de tu hogar actual al de
-- quien te invita, y lo que tenías se queda donde estaba. La app tiene que
-- avisarlo antes de que alguien toque «aceptar», porque no se ve venir.
--
-- ── Y qué pasa con un hogar que se queda sin nadie ────────────────────────
--
-- Se queda en pie, huérfano. Es la decisión conservadora y es deliberada:
--
--   · Borrarlo en cascada destruiría inventario, lista e historial —que es
--     inmutable por diseño— como efecto colateral de que alguien pulse
--     «aceptar». Irreversible y sorprendente: la peor combinación.
--   · Un hogar sin miembros es inalcanzable por construcción: ninguna política
--     puede volver a casar con él, porque todas pasan por
--     is_household_member(). No se filtra a nadie.
--   · Y es recuperable: basta volver a insertar una pertenencia para que sus
--     datos reaparezcan, cosa que un DELETE no permite.
--
-- El precio es que se acumulan filas que nadie ve. Limpiarlas será un proceso
-- de mantenimiento con una política de retención escrita, no un CASCADE puesto
-- de paso en esta migración.
--
-- ── Privacidad: qué se filtra, qué no, y dónde está la frontera ───────────
--
-- NO existe, y no debe existir nunca, ningún endpoint de búsqueda, de
-- autocompletado ni de «¿está libre este nombre?». `user_settings` solo se lee
-- a sí mismo por RLS, así que el nombre de usuario de un desconocido no es
-- consultable por ninguna vía. Las únicas funciones que devuelven el nombre de
-- otra persona son las de aquí abajo, y solo el de la gente de tu propio hogar
-- o el de quien te ha invitado a ti.
--
-- SÍ se filtra una cosa, a propósito: al invitar, quien invita se entera de si
-- existe una cuenta con EXACTAMENTE el nombre que ha escrito. Esa es la
-- frontera, y está ahí porque la alternativa es peor: si invitar a un nombre
-- mal escrito no dijera nada, la invitación se perdería en silencio y la
-- función sería inútil. Se revela como efecto de invitar DE VERDAD —hay que
-- ser `owner`, tener sitio libre y gastar uno de los intentos de la hora—, no
-- como respuesta a una consulta.
--
-- Para que ese goteo no sirva para barrer el padrón, `invite_to_household`
-- limita a 5 intentos por usuario y hora, contando también los fallidos. Un
-- hogar de cinco personas necesita cuatro invitaciones en toda su vida; cinco
-- por hora deja sitio de sobra para las erratas y para reenviar, y al mismo
-- tiempo topa la enumeración en 120 nombres al día por cuenta, que hace
-- inviable barrer un espacio de nombres de 3 a 20 caracteres.
--
-- El registro de intentos guarda QUIÉN lo intentó y CÓMO acabó, pero nunca el
-- nombre probado: un historial de «quién preguntó por quién» sería un dato más
-- sensible que el que estamos protegiendo.
--
-- Y los mensajes distinguen lo justo. «No existe» y «ya está en tu nevera» se
-- separan porque lo segundo no revela nada nuevo: a la gente de tu propio
-- hogar ya la puedes listar con `household_member_names()`.
--
-- ── SECURITY DEFINER: por qué casi todo lo de aquí lo es ──────────────────
--
-- El resto del esquema prefiere SECURITY INVOKER y deja que mande la RLS. Aquí
-- no se puede, y no por descuido: `household_invitations` y `household_members`
-- NO tienen política ni permiso de escritura a propósito —«todo pasa por las
-- RPC»—, así que una función INVOKER no podría escribir en ellas. Además hay
-- dos cosas que la RLS esconde por diseño y que estas funciones necesitan:
-- resolver el nombre de usuario de OTRA persona, y crearle un hogar a quien se
-- va (que no es quien llama).
--
-- El precio es que aquí dentro la RLS no protege nada, así que cada función
-- comprueba a mano la pertenencia y el rol. Todas llevan `set search_path = ''`
-- y todas sacan el usuario de `auth.uid()`, nunca de un argumento, igual que
-- `is_household_member()`. Cada una explica su caso en su comentario.
--
-- Nada de aquí lee `auth.users`: el nombre de usuario vive en `user_settings`,
-- que es una tabla normal. Un motivo menos para tocar el esquema de GoTrue.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══ 1 · El límite de miembros ══════════════════════════════════════════════
--
-- Va en la fila del hogar, no en una constante del servidor ni —mucho menos—
-- repartido por el código. Tres razones, por orden de peso:
--
--   · Es por hogar, no global: el plan de pago que suba el límite a cinco lo
--     sube PARA ESE HOGAR. Una constante obligaría a un despliegue por cliente.
--   · Se comprueba dentro de una transacción que ya bloquea esta fila para
--     contar (ver invite/accept). El límite y el recuento se leen bajo el mismo
--     cerrojo; una constante en otro sitio no se puede bloquear.
--   · Un solo sitio significa un solo sitio: hoy vale 2 y se cambia con un
--     UPDATE, sin tocar ni la app ni una migración.
alter table public.households
  add column member_limit smallint not null default 2
  constraint households_member_limit_ck check (member_limit between 1 and 10);

comment on column public.households.member_limit is
  'Cuánta gente cabe en este hogar. Hoy 2; pensado para 5 con planes de pago. '
  'Única definición del límite en todo el sistema: se comprueba al invitar y '
  'al aceptar, siempre en el servidor.';

-- Y no se toca desde el cliente. `households` tenía UPDATE concedido a nivel de
-- tabla, o sea que cualquier miembro podría subirse el límite a 10 con un
-- UPDATE suelto y saltarse el plan de pago entero. Se quita el permiso de tabla
-- y se devuelve solo por la columna que sí se edita, que es el nombre.
--
-- Revocar una columna de un permiso de tabla no surte efecto en PostgreSQL: el
-- permiso de tabla sigue cubriéndolas todas. Hay que quitarlo y volver a
-- concederlo por columnas, como ya se hizo con user_settings.username.
--
-- Contrapartida: cada columna nueva que deba poder editarse desde la app hay
-- que añadirla aquí.
revoke update on public.households from authenticated;
grant update (name) on public.households to authenticated;

-- ══ 2 · Invitaciones ═══════════════════════════════════════════════════════

create type public.household_invitation_status as enum (
  'pending',    -- enviada y sin responder
  'accepted',   -- aceptada: esa persona ya está dentro
  'rejected',   -- rechazada por quien la recibió
  'cancelled',  -- retirada por quien la envió
  'expired'     -- se le pasó el plazo sin que nadie hiciera nada
);

create table public.household_invitations (
  id            uuid primary key default gen_random_uuid(),

  household_id  uuid not null references public.households (id) on delete cascade,

  -- Quién invitó. Se guarda aunque el hogar ya lo diga, porque el hogar puede
  -- cambiar de dueño y la invitación la mandó una persona concreta.
  inviter_id    uuid not null references auth.users (id) on delete cascade,

  -- A quién. El uuid, no el nombre: el nombre se resuelve UNA vez, al invitar,
  -- y guardarlo aquí dejaría una copia del padrón legible por la otra parte.
  invitee_id    uuid not null references auth.users (id) on delete cascade,

  status        public.household_invitation_status not null default 'pending',

  created_at    timestamptz not null default now(),

  -- Siete días. Una invitación que no caduca es una puerta abierta para
  -- siempre: si alguien acepta dentro de un año, entra en una nevera que ya no
  -- recuerda haberle invitado.
  expires_at    timestamptz not null default now() + interval '7 days',

  -- Cuándo se respondió. Null mientras está pendiente… y también cuando caduca,
  -- porque a una invitación caducada no la respondió nadie: se le pasó el
  -- plazo. Esa diferencia es justo la que el historial debe poder contar.
  responded_at  timestamptz,

  constraint household_invitations_self_ck
    check (inviter_id <> invitee_id),

  constraint household_invitations_expires_ck
    check (expires_at > created_at),

  constraint household_invitations_responded_ck check (
    case status
      when 'pending' then responded_at is null
      when 'expired' then responded_at is null
      else responded_at is not null
    end
  )
);

comment on table public.household_invitations is
  'Invitaciones a un hogar. Se escriben solo desde las RPC de esta migración: '
  'la tabla no tiene permiso de INSERT ni de UPDATE a propósito.';

-- Las dos consultas que la app hace de verdad, y nada más.
--
-- «Mis invitaciones recibidas pendientes»: es lo que se mira al abrir la app,
-- así que el índice es parcial sobre las pendientes y no carga con el historial.
create index household_invitations_invitee_idx
  on public.household_invitations (invitee_id, created_at desc)
  where status = 'pending';

-- «Las que ha enviado mi hogar»: aquí sí interesa el historial completo, que es
-- lo que se pinta en la pantalla de ajustes del hogar.
create index household_invitations_household_idx
  on public.household_invitations (household_id, created_at desc);

-- Una sola invitación viva por persona y hogar. Sin esto, tocar dos veces el
-- botón deja dos invitaciones pendientes, las dos aceptables, y la segunda
-- aceptación entra por una puerta que el recuento ya había cerrado. Es único
-- PARCIAL porque el historial sí puede tener varias: invitar, que rechacen, y
-- volver a invitar es una secuencia normal.
create unique index household_invitations_pending_key
  on public.household_invitations (household_id, invitee_id)
  where status = 'pending';

-- ── El registro de intentos de invitación ─────────────────────────────────
--
-- Sostiene el límite por hora, y solo eso. No guarda el nombre probado: ver la
-- cabecera. Nadie lo lee desde la app —no tiene ni permisos ni políticas—, así
-- que tampoco sirve para espiar a nadie.
create table public.household_invite_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  outcome     text not null check (outcome in ('creada', 'desconocida', 'ya_es_miembro', 'ya_invitada')),
  created_at  timestamptz not null default now()
);

comment on table public.household_invite_attempts is
  'Intentos de invitación por usuario y hora. Existe para acotar la '
  'enumeración de nombres de usuario. No guarda qué nombre se probó.';

create index household_invite_attempts_user_idx
  on public.household_invite_attempts (user_id, created_at desc);

-- Sin políticas: RLS activada y ninguna regla que deje pasar nada. Solo
-- escriben las funciones SECURITY DEFINER de más abajo, que corren como el
-- propietario de la tabla.
alter table public.household_invite_attempts enable row level security;
revoke all on public.household_invite_attempts from anon, authenticated;

-- ══ 3 · Auxiliares internas ════════════════════════════════════════════════

-- El hogar del que llama, exigiendo que sea su `owner`.
--
-- SECURITY INVOKER: no hace falta más. Solo se llama desde las funciones
-- DEFINER de abajo —no se concede a nadie—, así que corre como el propietario,
-- y su WHERE filtra por auth.uid() de forma explícita: el resultado es el
-- mismo con RLS o sin ella.
create function public.require_owner_household()
returns uuid
language plpgsql
stable
as $$
declare
  v_household uuid;
begin
  select m.household_id into v_household
  from public.household_members m
  where m.user_id = (select auth.uid())
    and m.role = 'owner';

  if not found then
    raise exception 'Solo quien creó la nevera compartida puede hacer esto. Pídeselo a esa persona'
      using errcode = '42501';
  end if;

  return v_household;
end;
$$;

comment on function public.require_owner_household() is
  'El hogar del usuario si es su owner; si no, error 42501. Interna: no se '
  'concede a authenticated.';

revoke all on function public.require_owner_household() from public, anon, authenticated;

-- Marca como caducadas las invitaciones pendientes a las que se les pasó el
-- plazo. No es cosmético: una pendiente caducada sigue ocupando plaza en el
-- recuento y sigue bloqueando el índice único, así que sin esta pasada no se
-- podría volver a invitar a la misma persona nunca más.
--
-- Solo mueve filas de 'pending' a 'expired' y solo cuando el reloj ya lo dice,
-- así que es idempotente y no hay nada que decidir en ella. Interna: no se
-- concede a nadie.
create function public.expire_stale_invitations(p_household_id uuid)
returns void
language sql
as $$
  update public.household_invitations i
     set status = 'expired'
   where i.household_id = p_household_id
     and i.status = 'pending'
     and i.expires_at <= now();
$$;

revoke all on function public.expire_stale_invitations(uuid) from public, anon, authenticated;

-- Le da a alguien un hogar nuevo y vacío, del que es owner. Es lo que sostiene
-- el invariante «siempre exactamente un hogar»: quien sale o a quien echan
-- aterriza aquí, en la misma transacción en la que pierde el anterior.
--
-- SECURITY DEFINER porque ni `households` ni `household_members` tienen
-- política de INSERT —los hogares los crea el trigger de alta, y las
-- pertenencias solo estas funciones—, y porque a quien se le crea el hogar
-- puede no ser quien llama: al expulsar, el owner le está creando un hogar a
-- otra persona. Por eso mismo recibe el usuario por argumento, y por eso mismo
-- NO se concede a nadie: expuesta, dejaría mover a cualquiera de su casa.
--
-- Precondición: quien llama ya ha borrado la pertenencia anterior.
create function public.rehouse_user(p_user_id uuid)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_house public.households;
begin
  insert into public.households (name) values ('Mi casa')
  returning * into v_house;

  insert into public.household_members (household_id, user_id, role)
  values (v_house.id, p_user_id, 'owner');

  return v_house;
end;
$$;

revoke all on function public.rehouse_user(uuid) from public, anon, authenticated;

-- ══ 4 · Invitar ════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER por dos motivos, los dos imprescindibles: resolver un nombre
-- de usuario ajeno (user_settings solo se lee a sí misma por RLS) e insertar en
-- household_invitations, que no tiene permiso de INSERT. Comprueba a mano el
-- rol, el límite y el ritmo, porque aquí dentro la RLS ya no comprueba nada.
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
-- confirma, dejando el intento contado. Se lanzan como excepción, y por tanto
-- se deshacen, solo los errores que hablan de TI y de tu hogar: sin sesión, no
-- eres owner, el nombre está mal escrito, tu nevera está llena o te has pasado
-- de intentos. Ninguno de esos depende de si la cuenta contraria existe, así
-- que ninguno sirve para enumerar.
create function public.invite_to_household(p_username text)
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

  -- Solo el owner invita. Ver la nota sobre los roles al final del fichero.
  v_household := public.require_owner_household();

  -- El formato se valida antes de nada: un nombre que no puede existir no gasta
  -- intento y no llega a tocar el padrón.
  v_username := lower(trim(coalesce(p_username, '')));
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Un nombre de usuario son entre 3 y 20 letras, números o guion bajo. Revisa cómo lo has escrito'
      using errcode = '22023';
  end if;

  -- El ritmo, antes que nada de lo demás. Cuenta los intentos ya confirmados,
  -- que es lo único que sobrevive a una excepción.
  select count(*) into v_intentos
  from public.household_invite_attempts a
  where a.user_id = v_me
    and a.created_at > now() - interval '1 hour';

  if v_intentos >= 5 then
    raise exception 'Has hecho demasiados intentos de invitación en la última hora. Espera un rato y vuelve a probar'
      using errcode = 'P0001';
  end if;

  -- Las caducadas dejan de ocupar plaza y dejan de bloquear el índice único.
  perform public.expire_stale_invitations(v_household);

  -- FOR UPDATE: bloquea la fila del hogar mientras se cuenta. Es lo que impide
  -- que dos invitaciones simultáneas lean las dos «queda una plaza» y ocupen
  -- las dos la misma. El cerrojo se suelta al terminar la transacción.
  select h.member_limit into v_limite
  from public.households h
  where h.id = v_household
  for update;

  -- Miembros actuales MÁS invitaciones sin responder: una invitación pendiente
  -- es una plaza ya prometida. Contar solo los miembros permitiría invitar a
  -- diez personas para dos plazas y que ganase quien aceptase primero.
  select
    (select count(*) from public.household_members m where m.household_id = v_household)
    + (select count(*) from public.household_invitations i
        where i.household_id = v_household and i.status = 'pending')
  into v_ocupadas;

  if v_ocupadas >= v_limite then
    raise exception 'Tu nevera compartida ya está completa: % plazas contando las invitaciones sin responder. Cancela una invitación o saca a alguien antes de invitar', v_limite
      using errcode = 'P0001';
  end if;

  -- Aquí, y solo aquí, se toca el padrón.
  select s.user_id into v_target
  from public.user_settings s
  where lower(s.username) = v_username;

  -- Invitarse a uno mismo no revela nada que no supieras, así que sí se lanza.
  if v_target = v_me then
    raise exception 'Ese nombre de usuario es el tuyo: ya estás en tu propia nevera'
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
      'Esa persona ya está en tu nevera compartida'::text,
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

comment on function public.invite_to_household(text) is
  'Invita por nombre de usuario. Devuelve outcome creada | desconocida | '
  'ya_es_miembro | ya_invitada con su mensaje en español. Lanza error solo '
  'cuando el problema es tuyo: sesión, rol, formato, nevera llena o ritmo.';

-- ══ 5 · Aceptar ════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER: escribe en household_members —sin política de INSERT ni de
-- DELETE— y cierra la invitación, que tampoco tiene UPDATE. Comprueba a mano
-- que la invitación es TUYA: lo único que llega de fuera es su id, y el usuario
-- sale de auth.uid().
create function public.accept_invitation(p_invitation_id uuid)
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := auth.uid();
  v_inv      public.household_invitations;
  v_limite   smallint;
  v_miembros integer;
  v_old      uuid;
  v_role     public.household_role;
  v_quedan   integer;
  v_house    public.households;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión para aceptar una invitación'
      using errcode = '28000';
  end if;

  -- Primera lectura SIN bloquear, solo para saber de qué hogar hablamos. El
  -- orden de los cerrojos es siempre el mismo —primero el hogar, después la
  -- invitación—, y esa es la única forma de que dos aceptaciones cruzadas no se
  -- queden esperándose la una a la otra.
  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id;

  -- El mismo mensaje para «no existe» y «no es tuya»: si fueran distintos, con
  -- una lista de uuids se podría averiguar qué invitaciones existen.
  if not found or v_inv.invitee_id <> v_me then
    raise exception 'Esa invitación no existe o no es para ti'
      using errcode = 'P0002';
  end if;

  select h.member_limit into v_limite
  from public.households h
  where h.id = v_inv.household_id
  for update;

  -- Y ahora sí, la invitación bloqueada. Entre la primera lectura y esta puede
  -- haber pasado cualquier cosa: aquí es donde se ve una doble aceptación.
  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id
  for update;

  if v_inv.status <> 'pending' then
    raise exception 'Esa invitación ya está respondida (%) y no se puede volver a aceptar', v_inv.status
      using errcode = 'P0001';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'La invitación ha caducado. Pídele a esa persona que te invite otra vez'
      using errcode = 'P0001';
  end if;

  -- Aceptar es irse de tu hogar actual, así que la regla del dueño vale igual
  -- que al salir: si no, aceptar una invitación sería el atajo para dejar tu
  -- nevera sin nadie que la lleve.
  select m.household_id, m.role into v_old, v_role
  from public.household_members m
  where m.user_id = v_me;

  if not found then
    raise exception 'No perteneces a ningún hogar. Cierra sesión y vuelve a entrar'
      using errcode = 'P0002';
  end if;

  if v_role = 'owner' then
    select count(*) - 1 into v_quedan
    from public.household_members m
    where m.household_id = v_old;

    if v_quedan > 0 then
      raise exception 'Eres quien creó tu nevera actual y hay más gente en ella: traspásala a otra persona antes de unirte a otra'
        using errcode = 'P0001';
    end if;
  end if;

  -- Al aceptar se cuentan solo los miembros: la plaza que te reservó tu propia
  -- invitación es justo la que vas a ocupar. Con la fila del hogar bloqueada
  -- más arriba, dos aceptaciones simultáneas se ponen en fila y la segunda ve
  -- el recuento ya actualizado.
  select count(*) into v_miembros
  from public.household_members m
  where m.household_id = v_inv.household_id;

  if v_miembros >= v_limite then
    raise exception 'Esa nevera compartida ya está completa (% plazas). Pide que saquen a alguien y vuelve a intentarlo', v_limite
      using errcode = 'P0001';
  end if;

  -- El traslado. Lo que tenía en su hogar anterior se queda allí: ver la
  -- cabecera. Si ese hogar se queda sin nadie, se queda huérfano y en pie.
  delete from public.household_members m where m.user_id = v_me;

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
  'Entra en la nevera que te invitó y sale de la tuya. El inventario anterior '
  'se queda donde estaba: la app tiene que avisarlo antes.';

-- ══ 6 · Rechazar y cancelar ════════════════════════════════════════════════
--
-- Las dos son SECURITY DEFINER por lo mismo: household_invitations no tiene
-- permiso de UPDATE, y cerrar una invitación es un UPDATE. Nada más sale de
-- fuera que el id; quién eres sale de auth.uid().

create function public.reject_invitation(p_invitation_id uuid)
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
    raise exception 'Esa invitación no existe o no es para ti'
      using errcode = 'P0002';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Esa invitación ya está respondida (%)', v_inv.status
      using errcode = 'P0001';
  end if;

  update public.household_invitations i
     set status = 'rejected', responded_at = now()
   where i.id = p_invitation_id;
end;
$$;

comment on function public.reject_invitation(uuid) is
  'Rechaza una invitación dirigida a ti. No avisa a quien la envió: lo verá '
  'en el estado de la invitación.';

create function public.cancel_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_household uuid;
  v_inv       public.household_invitations;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  v_household := public.require_owner_household();

  select i.* into v_inv
  from public.household_invitations i
  where i.id = p_invitation_id
  for update;

  if not found or v_inv.household_id <> v_household then
    raise exception 'Esa invitación no existe o no la envió tu nevera'
      using errcode = 'P0002';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'Esa invitación ya está respondida (%) y no hay nada que cancelar', v_inv.status
      using errcode = 'P0001';
  end if;

  update public.household_invitations i
     set status = 'cancelled', responded_at = now()
   where i.id = p_invitation_id;
end;
$$;

comment on function public.cancel_invitation(uuid) is
  'Retira una invitación que todavía no ha respondido nadie. Solo el owner.';

-- ══ 7 · Salir, expulsar y traspasar ════════════════════════════════════════

-- SECURITY DEFINER: borra su pertenencia (household_members no tiene política
-- de DELETE) y crea el hogar nuevo por el que se sale. El usuario sale de
-- auth.uid(); la función no acepta ningún argumento precisamente para que no
-- pueda usarse para sacar a otro.
create function public.leave_household()
returns public.households
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_old   uuid;
  v_role  public.household_role;
  v_total integer;
  v_house public.households;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  select m.household_id, m.role into v_old, v_role
  from public.household_members m
  where m.user_id = v_me;

  if not found then
    raise exception 'No perteneces a ningún hogar. Cierra sesión y vuelve a entrar'
      using errcode = 'P0002';
  end if;

  select count(*) into v_total
  from public.household_members m
  where m.household_id = v_old;

  -- El dueño no se va y deja la casa sin llaves. Dos mensajes distintos porque
  -- son dos situaciones distintas y solo una tiene arreglo.
  if v_role = 'owner' and v_total > 1 then
    raise exception 'Eres quien creó esta nevera compartida: no puedes salir sin traspasarla antes a otra persona'
      using errcode = 'P0001';
  end if;

  if v_role = 'owner' then
    raise exception 'Eres la única persona en esta nevera: salir de ella no te llevaría a ningún sitio'
      using errcode = 'P0001';
  end if;

  delete from public.household_members m where m.user_id = v_me;

  -- Hogar nuevo y vacío: el invariante «siempre exactamente un hogar» es lo
  -- que sostiene toda la RLS del esquema. Lo que había en el hogar que dejas
  -- se queda allí, porque es del hogar y no tuyo.
  v_house := public.rehouse_user(v_me);
  return v_house;
end;
$$;

comment on function public.leave_household() is
  'Sales de la nevera compartida y empiezas con una tuya, vacía. El inventario '
  'se queda en la que dejas. El owner tiene que traspasarla antes.';

-- SECURITY DEFINER: borra la pertenencia de OTRA persona y le crea su hogar
-- nuevo, dos cosas que esa persona no ha pedido y que por tanto no puede hacer
-- ella misma en esa transacción. Quien llama sale de auth.uid() y se le exige
-- ser owner del mismo hogar que la persona a la que saca.
create function public.remove_household_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_household uuid;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  v_household := public.require_owner_household();

  if p_user_id = v_me then
    raise exception 'No puedes sacarte a ti: traspasa la nevera a otra persona y después sal de ella'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = v_household and m.user_id = p_user_id
  ) then
    raise exception 'Esa persona no está en tu nevera compartida'
      using errcode = 'P0002';
  end if;

  delete from public.household_members m
  where m.household_id = v_household and m.user_id = p_user_id;

  -- A quien sacas también le toca su hogar vacío: sin él se quedaría sin
  -- ninguno, y un usuario sin hogar no ve nada en toda la app.
  perform public.rehouse_user(p_user_id);
end;
$$;

comment on function public.remove_household_member(uuid) is
  'Saca a alguien de la nevera compartida y le deja una suya, vacía. Solo el '
  'owner, y nunca a sí mismo.';

-- SECURITY DEFINER: household_members no tiene política de UPDATE, y cambiar
-- el rol de dos filas —la de quien entrega y la de quien recibe— es un UPDATE.
create function public.transfer_household_ownership(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_household uuid;
begin
  if v_me is null then
    raise exception 'Tienes que haber iniciado sesión' using errcode = '28000';
  end if;

  v_household := public.require_owner_household();

  if p_user_id = v_me then
    raise exception 'Esta nevera ya es tuya'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.household_members m
    where m.household_id = v_household and m.user_id = p_user_id
  ) then
    raise exception 'Esa persona no está en tu nevera compartida: invítala antes de traspasársela'
      using errcode = 'P0002';
  end if;

  update public.household_members m
     set role = 'owner'
   where m.household_id = v_household and m.user_id = p_user_id;

  update public.household_members m
     set role = 'member'
   where m.household_id = v_household and m.user_id = v_me;
end;
$$;

comment on function public.transfer_household_ownership(uuid) is
  'Pasa el mando de la nevera a otro miembro. Quien la entrega se queda '
  'dentro como member, que es lo que permite al antiguo owner salirse.';

-- ══ 8 · Quién hizo qué, y quién te ha invitado ═════════════════════════════

-- `inventory_events.user_id` guarda quién hizo cada acción, pero el nombre vive
-- en user_settings, que por RLS solo se lee a sí misma. Sin esto, el historial
-- de un elemento solo puede decir «alguien».
--
-- SECURITY DEFINER porque tiene que leer el user_settings de otra persona. El
-- filtro es el que marca la frontera: el hogar que sale de auth.uid(), y ni uno
-- más. No acepta argumentos, así que no hay nada que manipular para que mire
-- otro sitio.
--
-- Limitación conocida: quien ya se fue del hogar no sale aquí, así que sus
-- eventos antiguos se quedan sin nombre. Es deliberado — lo contrario sería
-- seguir enseñando el nombre de alguien que ya no está.
create function public.household_member_names()
returns table (
  user_id   uuid,
  username  text,
  role      public.household_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, s.username, m.role
  from public.household_members m
  join public.user_settings s on s.user_id = m.user_id
  where m.household_id = (
    select mm.household_id
    from public.household_members mm
    where mm.user_id = (select auth.uid())
  )
  order by s.username;
$$;

comment on function public.household_member_names() is
  'Los nombres de usuario de la gente de MI hogar, y de nadie más. Para pintar '
  'el historial con nombres en vez de con uuids.';

-- Las invitaciones que me han mandado, con el nombre de quien invita y el de la
-- nevera. La RLS deja ver la fila de la invitación, pero no el nombre del hogar
-- (todavía no eres miembro) ni el de quien invita (user_settings es privada),
-- así que sin esto la pantalla solo podría enseñar dos uuids.
--
-- SECURITY DEFINER por eso mismo. Y es exactamente el filtrado que la cabecera
-- describe como aceptable: quien te invita se identifica ante ti porque ha
-- decidido invitarte.
create function public.my_pending_invitations()
returns table (
  id                uuid,
  household_id      uuid,
  household_name    text,
  inviter_username  text,
  created_at        timestamptz,
  expires_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.household_id, h.name, s.username, i.created_at, i.expires_at
  from public.household_invitations i
  join public.households h on h.id = i.household_id
  join public.user_settings s on s.user_id = i.inviter_id
  where i.invitee_id = (select auth.uid())
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$$;

comment on function public.my_pending_invitations() is
  'Invitaciones pendientes y sin caducar dirigidas a mí, con el nombre de '
  'quien invita y el de su nevera.';

-- Las que ha enviado mi hogar, con el nombre de a quién. Lo ve cualquier
-- miembro, no solo el owner: son gente que va a entrar en la misma nevera y el
-- nombre lo escribió alguien de casa.
create function public.household_sent_invitations()
returns table (
  id                uuid,
  invitee_username  text,
  status            public.household_invitation_status,
  created_at        timestamptz,
  expires_at        timestamptz,
  responded_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, s.username, i.status, i.created_at, i.expires_at, i.responded_at
  from public.household_invitations i
  join public.user_settings s on s.user_id = i.invitee_id
  where i.household_id = (
    select m.household_id
    from public.household_members m
    where m.user_id = (select auth.uid())
  )
  order by i.created_at desc;
$$;

comment on function public.household_sent_invitations() is
  'Historial de invitaciones enviadas por mi hogar, con el nombre de usuario '
  'de cada destinatario.';

-- ══ 9 · RLS y permisos ═════════════════════════════════════════════════════

alter table public.household_invitations enable row level security;

-- Veo las que me han mandado y las que ha mandado mi hogar. Nada más: una
-- invitación entre dos desconocidos no aparece por ningún lado.
create policy household_invitations_select on public.household_invitations
  for select to authenticated
  using (
    invitee_id = (select auth.uid())
    or public.is_household_member(household_id)
  );

-- Sin INSERT, sin UPDATE y sin DELETE, a propósito: que no exista la política
-- es lo que los prohíbe. Todo cambio pasa por las funciones de arriba, que son
-- las que comprueban rol, límite, caducidad y ritmo. Un INSERT abierto dejaría
-- invitarse a uno mismo al hogar de cualquiera.
-- `authenticated` se nombra en el revoke a propósito: Supabase concede todos
-- los permisos a los roles de la Data API sobre cada tabla nueva del esquema
-- public (ver la migración de permisos explícitos, la siguiente). Sin esto, la
-- tabla nacería con INSERT y UPDATE concedidos y solo la RLS los pararía.
revoke all on public.household_invitations from anon, authenticated;
grant select on public.household_invitations to authenticated;

-- `household_members` NO necesita ninguna política nueva. La que ya tiene
-- —select using is_household_member(household_id)— deja ver todas las filas de
-- tu hogar, y eso incluye la columna `role`: la app puede saber quién lleva la
-- nevera sin preguntar nada más. Escritura sigue sin tener, que es justo lo que
-- obliga a pasar por estas RPC.

revoke all on function public.invite_to_household(text)            from public, anon;
revoke all on function public.accept_invitation(uuid)              from public, anon;
revoke all on function public.reject_invitation(uuid)              from public, anon;
revoke all on function public.cancel_invitation(uuid)              from public, anon;
revoke all on function public.leave_household()                    from public, anon;
revoke all on function public.remove_household_member(uuid)        from public, anon;
revoke all on function public.transfer_household_ownership(uuid)   from public, anon;
revoke all on function public.household_member_names()             from public, anon;
revoke all on function public.my_pending_invitations()             from public, anon;
revoke all on function public.household_sent_invitations()         from public, anon;

grant execute on function public.invite_to_household(text)          to authenticated;
grant execute on function public.accept_invitation(uuid)            to authenticated;
grant execute on function public.reject_invitation(uuid)            to authenticated;
grant execute on function public.cancel_invitation(uuid)            to authenticated;
grant execute on function public.leave_household()                  to authenticated;
grant execute on function public.remove_household_member(uuid)      to authenticated;
grant execute on function public.transfer_household_ownership(uuid) to authenticated;
grant execute on function public.household_member_names()           to authenticated;
grant execute on function public.my_pending_invitations()           to authenticated;
grant execute on function public.household_sent_invitations()       to authenticated;

-- ── Por qué el member no invita ni echa a nadie ───────────────────────────
--
-- Un hogar de dos personas con los dos permisos iguales parece más justo, y es
-- peor: cualquiera de los dos podría echar al otro, y la discusión la gana
-- quien pulse antes. Con un owner, la asimetría es explícita y reversible
-- —`transfer_household_ownership` existe para eso—, y quien no está a gusto
-- siempre puede salirse por su cuenta: `leave_household()` es la única acción
-- que un member puede hacer sin permiso de nadie.
