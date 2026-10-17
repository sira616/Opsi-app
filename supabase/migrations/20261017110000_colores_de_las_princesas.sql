-- ═══════════════════════════════════════════════════════════════════════════
-- Los colores de la app: los de las siete princesas sirena de Pichi Pichi Pitch
--
-- La primera versión (20261017100000) admitía verde, azul, amarillo, naranja, rosa y
-- blanco. Los colores de la personalización pasan a ser los de las perlas de las
-- princesas: Lucia (rosa), Hanon (azul aguamarina), Rina (verde), Karen (morado), Noel
-- (índigo), Coco (amarillo) y Sara (naranja). El verde de Rina es el de siempre y no
-- exige premium; el resto sí (lo impone `check_accent`, que no cambia).
--
-- Se queda fuera el blanco, que no es de ninguna, y entran el morado y el índigo. Nadie
-- puede tener elegido el blanco en un entorno real (es premium y no hay forma de
-- contratarlo todavía), pero por si acaso quien lo tuviera pasa al verde antes de que
-- el nuevo CHECK lo rechace.
-- ═══════════════════════════════════════════════════════════════════════════

update public.user_settings
   set accent = 'green'
 where accent not in ('green', 'pink', 'blue', 'purple', 'indigo', 'yellow', 'orange');

alter table public.user_settings drop constraint user_settings_accent_ck;

alter table public.user_settings
  add constraint user_settings_accent_ck
    check (accent in ('green', 'pink', 'blue', 'purple', 'indigo', 'yellow', 'orange'));

comment on column public.user_settings.accent is
  'Color base de la app: el de la perla de una princesa sirena (green, pink, blue, purple, '
  'indigo, yellow u orange). Todos menos green son de Opsi Premium: lo impone user_settings_check_accent.';
