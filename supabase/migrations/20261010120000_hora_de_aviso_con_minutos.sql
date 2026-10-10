-- ═══════════════════════════════════════════════════════════════════════════
-- La hora del aviso con minutos
--
-- El resumen diario se guardaba como una HORA entera (`digest_hour`, 0 a 23), y
-- la pantalla de ajustes lo reflejaba con una fila de 24 cuadros. Para que se
-- pueda elegir con un reloj —8:30, no «las 8» o «las 9»— hace falta guardar
-- también los minutos.
--
-- Una columna aparte y no una hora en minutos (`digest_minute_of_day`): así
-- `digest_hour` sigue significando lo que significa, el índice parcial que ya
-- existe sobre ella sigue sirviendo, y `daily-digest` (fase 3) puede seguir
-- filtrando por hora y mirar los minutos solo en las filas que quedan.
--
-- Por omisión 0: quien ya tenía elegidas «las 9» sigue recibiéndolo a las 9:00.
--
-- El permiso es por columna, como el del resto de ajustes (ver
-- 20260924100000_neveras_esquema): sin él, el cliente no podría escribirla. No
-- se añade al INSERT porque nadie crea una fila de ajustes eligiendo ya los
-- minutos: entra con su valor por omisión.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.user_settings
  add column digest_minute smallint not null default 0
  check (digest_minute between 0 and 59);

comment on column public.user_settings.digest_minute is
  'Minuto de la hora del resumen diario (0 a 59). Junto con digest_hour, en la '
  'zona horaria de la persona.';

grant update (digest_minute) on public.user_settings to authenticated;
