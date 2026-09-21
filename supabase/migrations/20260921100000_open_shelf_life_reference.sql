-- ═══════════════════════════════════════════════════════════════════════════
-- Conservación tras apertura: tabla de referencia por categoría.
--
-- Decisión D-15 (cierra Q3). La estimación de días tras abrir se busca en tres
-- sitios, en este orden, y el primero que conteste gana:
--
--   1. products.open_shelf_life_days  — lo que diga el catálogo PARA ESE
--      producto. Es lo más específico, y lo que pidió Q3.
--   2. Esta tabla, por categoría de Open Food Facts. Cuando hay varias
--      categorías que encajan, gana LA MÁS CORTA: seguridad antes que
--      desperdicio.
--   3. Nada. Y «sin fecha» es una respuesta legítima, no un error a rellenar.
--
-- IMPORTANTE, y conviene no olvidarlo: todo lo que salga de aquí se etiqueta
-- como date_source = 'reference', es decir, ORIENTATIVO. Lo que diga el envase
-- manda siempre por encima de esta tabla.
--
-- Los valores sembrados son una base de trabajo conservadora, no una fuente
-- autorizada. Están pendientes de revisión contra una guía oficial: ver la
-- bitácora, Q3.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.open_shelf_life_reference (
  category_tag  text primary key check (category_tag ~ '^[a-z]{2}:[a-z0-9-]+$'),
  days          integer not null check (days between 1 and 3650),
  note          text,
  source        text not null,
  updated_at    timestamptz not null default now()
);

comment on table public.open_shelf_life_reference is
  'Días orientativos de conservación tras abrir, por categoría de Open Food '
  'Facts. Lectura para todo el mundo; escritura solo desde el servidor.';
comment on column public.open_shelf_life_reference.days is
  'Siempre ORIENTATIVO: lo que se derive de aquí lleva date_source = reference.';

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Datos de referencia, no de nadie: se leen enteros y no se escriben desde la
-- app. Sin políticas de escritura, solo la service_role puede tocarlos.
alter table public.open_shelf_life_reference enable row level security;

create policy open_shelf_life_reference_select on public.open_shelf_life_reference
  for select to authenticated
  using (true);

revoke all on public.open_shelf_life_reference from anon;
grant select on public.open_shelf_life_reference to authenticated;
