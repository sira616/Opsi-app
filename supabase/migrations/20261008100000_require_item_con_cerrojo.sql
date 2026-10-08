-- ═══════════════════════════════════════════════════════════════════════════
-- Las acciones sobre un elemento ya no se pisan entre sí
--
-- Las seis acciones (abrir, usar, congelar, descongelar, terminar, tirar)
-- empiezan igual: `require_item()` lee el elemento, se comprueba que la
-- transición es válida con lo que se ha leído, y se escribe el cambio. Leer y
-- escribir son dos pasos, y entre ellos puede colarse otra persona.
--
-- Con una sola persona por nevera casi no pasaba. Con neveras compartidas, dos
-- personas pueden pulsar a la vez sobre el mismo yogur, y hay dos formas de
-- que salga mal (las dos comprobadas con dos sesiones reales):
--
--   · Una lo termina y otra lo tira. Las dos leen «abierto», las dos pasan la
--     comprobación, las dos escriben. El elemento queda `discarded` y su
--     historial dice que se terminó Y que se tiró. El historial es inmutable
--     (D-09) y es lo que alimentará los patrones de consumo y desperdicio: una
--     contradicción ahí no se puede arreglar después.
--   · Dos personas usan 600 g de un envase de 1000 g. Las dos leen «1000», las
--     dos aprueban, y el segundo UPDATE deja la cantidad en −200. No llega a
--     guardarse porque un CHECK lo rechaza, pero el error que ve la segunda
--     persona es el de la restricción en vez de «solo quedan 400».
--
-- ── El arreglo ────────────────────────────────────────────────────────────
--
-- `for update` en la lectura. La segunda sesión espera a que la primera
-- confirme y entonces VUELVE A LEER la fila ya modificada (así se comporta
-- READ COMMITTED con un bloqueo de fila): ve «terminado» o «quedan 400» y falla
-- con el mensaje que ya existía para eso. Nada más cambia.
--
-- Es la única función que lee el elemento para decidir una acción: las seis
-- pasan por aquí, así que se cierra en un solo sitio.
--
-- ── Lo que se descarta, y por qué ─────────────────────────────────────────
--
--   · `lock_timeout`: cada acción es una sola llamada corta, y PostgREST ya
--     corta las peticiones largas con su propio `statement_timeout`. Un cerrojo
--     que no se suelta no tiene de dónde salir.
--   · Un número de versión en la fila (bloqueo optimista): obliga a que el
--     cliente lo mande y lo reintente, y aquí lo que se quiere es que el
--     servidor decida sin que la app tenga que saberlo.
--
-- La comprobación vive en `scripts/check-carreras.mjs` y no en pgTAP, porque
-- hacen falta DOS sesiones a la vez y pgTAP corre en una sola transacción.
--
-- Una `create or replace` conserva los permisos de la función (revoke a
-- public y anon, execute a authenticated); no hace falta repetirlos.
--
-- La definición es la VIGENTE, leída con pg_get_functiondef de la base real, no
-- la de la migración original: la vista de prioridad ya perdió un arreglo por
-- copiar una definición vieja.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.require_item(p_item_id uuid)
returns public.inventory_items
language plpgsql
as $$
declare
  v_item public.inventory_items;
begin
  -- `for update` bajo SECURITY INVOKER sigue pasando por la RLS: pide también la
  -- política de UPDATE, que es la de pertenecer a la nevera. Un elemento de otra
  -- nevera sigue sin verse: no se encuentra, no se bloquea.
  select * into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'El elemento no existe o no pertenece a tu hogar'
      using errcode = 'P0002';
  end if;
  if v_item.state in ('finished', 'discarded') then
    raise exception 'El elemento ya está cerrado (%). No admite más acciones', v_item.state
      using errcode = 'P0001';
  end if;
  return v_item;
end;
$$;

comment on function public.require_item(uuid) is
  'Lee el elemento CON cerrojo de fila y comprueba que admite acciones. El '
  'cerrojo es lo que impide que dos personas pisen la misma acción a la vez.';
