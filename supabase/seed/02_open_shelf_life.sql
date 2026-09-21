-- ═══════════════════════════════════════════════════════════════════════════
-- Conservación tras apertura, valores de partida.
--
-- ORIENTATIVOS. Recogen la práctica común de conservación en frigorífico y
-- están deliberadamente del lado corto. NO son una fuente autorizada y están
-- pendientes de revisión: ver Q3 en la bitácora.
--
-- Regla al añadir filas: ante la duda, el número más bajo. Este proyecto
-- prefiere que alguien tire un yogur bueno a que se coma uno malo.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.open_shelf_life_reference (category_tag, days, note, source) values
  ('en:yogurts',              2,  'Refrigerado y tapado',                    'orientativo · práctica común'),
  ('en:milks',                3,  'Abierta y en nevera',                     'orientativo · práctica común'),
  ('en:fruit-juices',         3,  'Refrigerado tras abrir',                  'orientativo · práctica común'),
  ('en:prepared-meats',       3,  'Embutido y fiambre loncheado',            'orientativo · práctica común'),
  ('en:fresh-cheeses',        3,  'Queso fresco, requesón',                  'orientativo · práctica común'),
  ('en:cheeses',              7,  'Quesos curados y semicurados',            'orientativo · práctica común'),
  ('en:tomato-sauces',        4,  'Pasar a recipiente cerrado',              'orientativo · práctica común'),
  ('en:breads',               4,  'A temperatura ambiente y cerrado',        'orientativo · práctica común'),
  ('en:jams',                30, 'Refrigerada tras abrir',                   'orientativo · práctica común'),
  ('en:olive-oils',          90, 'Al abrigo de luz y calor; es calidad',     'orientativo · práctica común')
on conflict (category_tag) do nothing;
