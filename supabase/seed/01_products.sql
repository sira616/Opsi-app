-- ═══════════════════════════════════════════════════════════════════════════
-- Datos de desarrollo: catálogo global mínimo.
--
-- Se cargan con `npm run db:reset`, después de las migraciones. NO van a
-- producción: allí el catálogo lo rellena lookup-barcode desde Open Food
-- Facts (fase 2).
--
-- Los códigos de barras son ficticios aunque tengan el formato de un EAN-13
-- español. No corresponden a productos reales: son para poder probar el
-- escáner sin ir a la compra.
--
-- Los días de conservación tras apertura son ORIENTATIVOS. Cualquier elemento
-- que los use debe guardar date_source = 'reference', nunca 'package'.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.products
  (barcode, name, brand, unit_family, net_quantity, open_shelf_life_days, data_source)
values
  ('8400000000017', 'Leche entera UHT 1 L',        'Marca Blanca', 'volume', 1000,  4, 'openfoodfacts'),
  ('8400000000024', 'Yogur natural pack 4',        'Marca Blanca', 'count',     4,  2, 'openfoodfacts'),
  ('8400000000031', 'Arroz redondo 1 kg',          'Marca Blanca', 'mass',   1000, null, 'openfoodfacts'),
  ('8400000000048', 'Aceite de oliva virgen 1 L',  'Marca Blanca', 'volume', 1000,   90, 'openfoodfacts'),
  ('8400000000055', 'Huevos frescos docena',       'Marca Blanca', 'count',    12, null, 'openfoodfacts'),
  ('8400000000062', 'Bacon en lonchas 200 g',      'Marca Blanca', 'mass',    200,    5, 'openfoodfacts'),
  ('8400000000079', 'Tomate frito 400 g',          'Marca Blanca', 'mass',    400,    5, 'openfoodfacts'),
  ('8400000000086', 'Queso rallado 150 g',         'Marca Blanca', 'mass',    150,    7, 'openfoodfacts'),
  ('8400000000093', 'Zumo de naranja 1 L',         'Marca Blanca', 'volume', 1000,    3, 'openfoodfacts'),
  ('8400000000109', 'Pan de molde integral 460 g', 'Marca Blanca', 'mass',    460,    5, 'openfoodfacts')
on conflict do nothing;
