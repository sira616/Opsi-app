# Catálogos de producto: qué fuente usar

> **Privado.** Notas de trabajo, no documentación de usuario.
> Escrito el 2026-09-22. Los límites y licencias que aparecen aquí se comprobaron
> ese día; conviene releerlos antes de publicar.

## La pregunta, reformulada

«Conectar Opsi con los catálogos de Carrefour, Mercadona, Consum, Condis…» suena a una
cosa y es otra. Lo que Opsi necesita de verdad es:

> **Un código de barras → qué producto es, de qué marca, cuánto trae y de qué tipo.**

Y el código de barras **no es de ningún supermercado**. Es un EAN-13, un identificador
global de GS1 que pone el *fabricante* en el envase. El mismo brick de leche tiene el
mismo EAN en Mercadona, en Condis y en el bazar de la esquina.

O sea: la fuente correcta es **una base de datos de productos indexada por EAN**, no la
web de una cadena. Los catálogos de los supermercados aportan otra cosa —precio, stock,
disponibilidad en tu tienda—, y eso pertenece a la lista de la compra (fase 4), no al
inventario.

## Lo que hay, realmente

### Ninguno de esos supermercados publica una API para terceros

Ni Mercadona, ni Carrefour España, ni Consum, ni Condis, ni Alcampo, ni DIA ofrecen una
API de catálogo documentada y abierta a desarrolladores.

Lo que sí existe, y conviene distinguir:

| Qué es | Realidad |
|---|---|
| **La API interna de la tienda online de Mercadona** (`tienda.mercadona.es/api/…`) | Existe y responde JSON. Es la que usa su propia web. **No está documentada, no está licenciada para terceros y puede cambiar o cerrarse cualquier día.** Hay proyectos en GitHub que la envuelven, lo cual no la convierte en pública |
| **«APIs de Carrefour» en marketplaces de scraping** | Son servicios de terceros que raspan la web y la revenden. No las publica Carrefour |
| **Programas de afiliación** | Existen para enlazar y cobrar comisión, no para descargarse el catálogo |
| **EDI / GS1 para proveedores** | Integraciones B2B entre cadena y proveedor. No aplica a una app de consumo |

### Por qué no vamos por ahí

1. **Legal.** Usar una API interna no documentada va contra las condiciones de uso de esos
   sitios. Una cosa es trastear un fin de semana y otra montar encima una app que otros
   instalan.
2. **Técnico.** Una API no documentada no tiene compromiso de estabilidad. El día que
   cambien un campo, Opsi deja de escanear, y el usuario no entiende por qué.
3. **De principios.** Este proyecto se ha comprometido a enseñar **siempre de dónde sale
   un dato** —`date_source` está en el esquema por eso—. «De la web de Mercadona, raspada
   sin permiso» no es una procedencia que se pueda escribir en una pantalla.
4. **De producto.** Aunque funcionara, un catálogo de cadena solo cubre lo que vende esa
   cadena. El EAN cubre todo.

## Lo que sí vamos a usar: Open Food Facts

Ya está previsto en el esquema desde el primer día. `products` tiene `barcode`,
`categories_tags`, `off_payload`, `data_source` y el catálogo global
(`household_id IS NULL`) documentado como «caché de Open Food Facts».

| | |
|---|---|
| **Qué es** | Base de datos colaborativa y abierta de productos alimentarios, con buena cobertura de España |
| **Endpoint** | `https://world.openfoodfacts.org/api/v2/product/{ean}.json` |
| **Autenticación** | Ninguna para leer. **Sí exige un `User-Agent` propio** que identifique la app y dé un contacto (ya está en `supabase/.env.example` como `OFF_USER_AGENT`) |
| **Licencia** | Datos bajo **ODbL**; contenidos bajo DbCL; imágenes CC-BY-SA. Obliga a **atribución** y **compartir igual** |

### El límite de peticiones manda en el diseño

**15 peticiones por minuto y por IP** para leer un producto. **10 por minuto** para
búsquedas. Eso es poco, y es el dato que decide la arquitectura:

- **La caché global no es una optimización, es un requisito.** Un producto escaneado una
  vez por cualquier usuario ya no vuelve a provocar una llamada externa. El esquema ya lo
  contempla.
- **Para producción, el volcado en vez de la API.** Open Food Facts publica volcados
  completos de su base. Importar el subconjunto español una vez y refrescarlo cada cierto
  tiempo elimina el límite por completo, y la API en vivo queda solo para los fallos de
  caché.
- La llamada sale de la **Edge Function `lookup-barcode`**, nunca del móvil: así el
  límite es por servidor y no por cada usuario, y el `User-Agent` se controla en un sitio.

### La licencia hay que mirarla antes de publicar, no después

ODbL tiene dos obligaciones: **atribución** y **compartir igual**. La atribución es
sencilla —citar Open Food Facts donde se muestre el dato—. La de compartir igual dice
que, si combinas su base con otra y **distribuyes** la base resultante, la resultante
también tiene que ser abierta.

Opsi guarda una caché en su propia base y no la distribuye como base de datos, que es el
caso habitual y el que hace la mayoría de las apps. Aun así, **esto no es una opinión
legal** y conviene leer las condiciones antes de publicar, no cuando ya hay usuarios.

## Y el precio, que es lo que de verdad aporta un supermercado

Si algún día Opsi quiere decir «esto te cuesta 1,29 € en tu Consum», las opciones honestas
son tres, por orden de sensatez:

1. **No hacerlo.** El objetivo del proyecto es no tirar comida, no comparar precios. Es
   otra app.
2. **Open Prices**, el proyecto hermano de Open Food Facts, donde los precios los aportan
   los propios usuarios con su ticket. Encaja con la fase 6 (leer tickets), que ya está
   en el roadmap: de un ticket salen producto, precio y tienda, y eso se puede devolver a
   la comunidad.
3. **Acuerdo o programa de afiliación con la cadena.** Es la vía legítima, y es una
   conversación comercial, no una integración técnica.

La opción 2 es la interesante: convierte una función que ya está planificada —leer el
ticket de la compra— en la fuente de precios, sin depender de nadie y sin raspar nada.

## Resumen para decidir

| Fuente | ¿La usamos? | Por qué |
|---|---|---|
| **Open Food Facts** | **Sí**, fase 2 | Abierta, por EAN, ya está en el esquema |
| Volcado de OFF (subconjunto ES) | Sí, antes de publicar | Elimina el límite de 15/min |
| Open Prices | Quizá, fase 6 | Encaja con la lectura de tickets |
| API interna de Mercadona | No | No documentada, no licenciada, inestable |
| Scrapers de terceros | No | Lo mismo, y encima de pago |
| Afiliación / acuerdo con cadena | Solo si el producto lo pide | Es una conversación comercial |

## Fuentes

- [Open Food Facts — Data, API and SDKs](https://world.openfoodfacts.org/data)
- [Open Food Facts — Introducción a la API](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Open Food Facts — ¿Hay condiciones para usar la API?](https://support.openfoodfacts.org/help/en-gb/12-api-data-reuse/94-are-there-conditions-to-use-the-api)
- [datania/mercadona-catalog — la API interna, documentada por terceros](https://github.com/datania/mercadona-catalog)
