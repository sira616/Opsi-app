# Avisos de terceros

Opsi es código propio con los derechos reservados (ver [`LICENSE`](LICENSE)), pero usa
componentes y datos de terceros que **conservan sus propias licencias**. Esto es lo que
hay que atribuir y por qué.

## Datos

### Open Food Facts

Los nombres, marcas, cantidades, imágenes y categorías de los productos salen de [Open Food Facts](https://world.openfoodfacts.org)
(fase 2: la Edge Function `lookup-barcode` los consulta desde el servidor y los guarda en una caché
global; la app muestra «Datos de Open Food Facts» en el alta de un producto escaneado). Su base de datos se publica bajo la
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/), y sus
contenidos individuales bajo la Database Contents License.

Qué implica:

- **Atribución:** hay que citar a Open Food Facts donde se usen sus datos. La app ya lo hace
  en Ajustes → Acerca de y debe seguir haciéndolo en cada pantalla que enseñe un producto
  que venga de ahí (la interfaz ya marca el origen de cada dato).
- **Compartir igual:** la ODbL pide que una base de datos **derivada** que se publique se
  ofrezca bajo la misma licencia. La caché global de `products` es una base derivada. Mientras
  no se publique ni se ofrezca a terceros, no se activa; **si algún día se abre, hay que
  revisarlo**.

## Tipografías

| Fuente | Licencia | Paquete |
|---|---|---|
| Bricolage Grotesque | SIL Open Font License 1.1 | `@expo-google-fonts/bricolage-grotesque` |
| Plus Jakarta Sans | SIL Open Font License 1.1 | `@expo-google-fonts/plus-jakarta-sans` |

La OFL permite usarlas y redistribuirlas con la app, siempre que no se vendan solas.

## Iconos

[Phosphor Icons](https://phosphoricons.com), licencia MIT, a través de `phosphor-react-native`.

## Dependencias de código

Inventario del 2026-10-10 sobre el árbol de producción de la app (las dependencias directas y
todas sus transitivas), leyendo el campo `license` de cada `package.json`. Son 195 entradas:
**184 con licencia leída**, 10 dependencias opcionales que **no están instaladas** y no entran
en la app, y el propio paquete de la app.

| Licencia | Paquetes |
|---|---:|
| MIT | 165 |
| ISC | 8 |
| BlueOak-1.0.0 | 3 |
| Apache-2.0 | 3 |
| MIT y OFL-1.1 (las tipografías de arriba) | 2 |
| 0BSD, BSD-2-Clause, Unlicense | 3 |
| *Sin licencia declarada* | 0 |

**Ninguna es copyleft** (GPL, AGPL, SSPL o similares): no hay nada que obligue a abrir el
código de la app ni a cambiar su licencia. Todas son permisivas y exigen, como mucho,
conservar su aviso de copyright, que va en cada paquete dentro de `node_modules/`.

**Añadidas después del inventario, con el escáner (2026-10-10):** `expo-camera` y, por ella, `barcode-detector`,
`zxing-wasm`, `@types/emscripten`, `tagged-tag` y `type-fest`: todas MIT (`type-fest`, «MIT o CC0-1.0»). Siguen sin
entrar copyleft. Las cifras de la tabla de arriba son anteriores y no se han recalculado.

El otro tipo de dependencia, las de **desarrollo** (la CLI de Supabase, ESLint, PGlite…), no
va dentro de la app y no se distribuye.

Para repetir el inventario completo: `npm ls --omit=dev --all --workspace app`.
