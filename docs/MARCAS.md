# Marcas en los tickets

Qué producto es cada línea de un ticket y de qué marca, **sin inventar ninguna**. Se ejecuta después de que
[`opsi-ticket`](../supabase/functions/opsi-ticket) haya leído la foto, y nunca toca lo que ese lector sacó: lo
enriquece. Es de Opsi Premium ⭐, como leer el ticket.

> **La idea en una frase:** el sistema *propone* con pruebas que se pueden leer, la persona *decide*, y solo lo
> que la persona confirma a propósito se recuerda. Una marca que nadie dio no existe.

## Qué hace y qué no

| Hace | No hace |
|---|---|
| Busca, por cada línea, productos que podrían ser, y los puntúa con señales explicadas | Asignar una marca por la tienda, por la categoría o por un nombre genérico |
| Asigna sola solo cuando hay un candidato claramente mejor **y** algo más que el nombre (tamaño, marca escrita…) | Presentar la puntuación como una probabilidad: no está calibrada |
| Enseña las alternativas cuando duda, y deja «Marca sin identificar» como respuesta válida | Obligar a elegir una marca para guardar |
| Recuerda lo que la persona confirma, elige o escribe (elegir otra cosa lo sustituye) | Aprender de una sugerencia que la persona no tocó |
| Sigue funcionando si Open Food Facts falla o se queda sin cupo | Guardar el ticket, sus líneas o la foto |
| Reutiliza el producto del catálogo si ya existe | Crear un producto duplicado cada vez que el artículo sale en un ticket nuevo |

## Cómo se resuelve una línea

```
foto ──opsi-ticket──► texto impreso · nombre · cantidad · importe · tienda          (evidencia de origen, intacta)
                          │
                          ▼   opsi-marcas  (por tandas de 8, sin bloquear la pantalla de revisión)
   1. ¿Es un producto?  subtotal, IVA, descuento, pago, mensaje del recibo → se descarta y se dice por qué
   2. Preparar la consulta  palabras distintivas · tamaño del envase · EAN impreso (si es válido) · tienda
   3. Preguntar a las fuentes EN ORDEN  historial → catálogo de Opsi → Open Food Facts → catálogos de supermercado
      (en cuanto una decide con garantías, no se gasta el cupo de las siguientes)
   4. Puntuar cada candidato y decidir
                          │
                          ▼   pantalla de revisión
   la persona confirma · elige otra opción · escribe la marca · lo deja sin identificar
                          │
                          ▼   «Guardar»
   se enlaza con un producto del catálogo (sin duplicar) y se guarda en el inventario
   → solo lo confirmado a propósito se recuerda (`ticket_associations`)
```

Código: [`texto-ticket.ts`](../supabase/functions/_shared/texto-ticket.ts) (normalizar, tamaños, líneas que no son
producto), [`resolver.ts`](../supabase/functions/_shared/resolver.ts) (puntuar y decidir),
[`fuentes-marcas.ts`](../supabase/functions/_shared/fuentes-marcas.ts) (las fuentes),
[`off-busqueda.ts`](../supabase/functions/_shared/off-busqueda.ts) (búsqueda de texto en OFF),
[`marcas.ts`](../supabase/functions/_shared/marcas.ts) (la petición), y en la app
[`features/ticket/marcas.ts`](../app/src/features/ticket/marcas.ts).

## Qué fuentes están realmente conectadas

| Fuente | Estado | Qué aporta | Límites |
|---|---|---|---|
| **Historial** (`ticket_associations`) | ✅ conectada | Lo que **esa persona** confirmó para **ese mismo texto** de ticket. En la misma tienda: evidencia fuerte. En otra tienda: solo una pista | Solo texto idéntico (con tamaño y todo): «LECHE ENTERA 1L» no se aplica a «LECHE ENTERA 200ML» ni a «LECHE» |
| **Catálogo de Opsi** (`products`) | ✅ conectada | Productos que ya se conocen: el global (copia de OFF) y los privados de la nevera. Gratis y sin red | Solo lo ya escaneado o guardado; búsqueda por palabras, sin acentos |
| **Open Food Facts** | ✅ conectada | Búsqueda de texto en `search.openfoodfacts.org` entre los productos vendidos en España, y por EAN cuando el ticket lo imprime | Base editada por cualquiera: nombres raros, marcas vacías o en el campo equivocado. **Cupo de 10 búsquedas por minuto entre todas las personas** (ver abajo). Si no hay `OFF_USER_AGENT` válido no se llama |
| **Catálogos de supermercado** | ❌ **ninguno conectado** | — | Ver «Por qué no hay catálogos de supermercado» |

El cliente de Open Food Facts es **el mismo** que usa el escáner (`off.ts`: mismo User-Agent, mismo tiempo máximo,
mismo tope de cuerpo, mismos filtros de texto, imagen y categorías); `off-busqueda.ts` añade solo la segunda
llamada (búsqueda de texto). No hay un segundo cliente.

### Por qué no hay catálogos de supermercado

La interfaz existe (`FuenteSupermercado` en `resolver.ts`, y la lista vacía `ADAPTADORES_SUPERMERCADO` en
`fuentes-marcas.ts`) y está probada con una fuente de mentira, pero **no se ha conectado ninguna cadena**: no se
encontró una fuente pública, documentada y con condiciones de uso que permitan consultarla desde una app de
terceros. Lo que existe son las APIs internas de sus webs y apps, que no están documentadas, pueden cambiar o
cortarse sin aviso y no ofrecen permiso de uso. Depender de ellas, o rascar sus webs, es lo que se pidió no hacer.

No se ha verificado el contrato de ninguna cadena concreta; esta frase describe lo que se encontró (nada utilizable),
no un análisis jurídico. Para conectar una: implementar `FuenteSupermercado` (mismas reglas que las demás fuentes:
devolver candidatos con `origenes: ['supermercado']`), añadirla a `ADAPTADORES_SUPERMERCADO` con las claves de
tienda que cubre (`claveDeTienda`), y escribir sus tests con respuestas simuladas. Cuando coincide con OFF en el
mismo producto cuenta como una corroboración **independiente**; el catálogo de Opsi y OFF no (son el mismo dato).

## Cómo se decide: puntuación y umbrales

**`puntos` (0–100) no es una probabilidad.** Es una suma de señales con pesos fijos que alguien eligió leyendo
ejemplos; no está calibrada con datos de acierto. `confianza` es un nombre para tramos de esa suma. Los umbrales
son conservadores a propósito: más revisión humana es el error barato; el caro es una marca equivocada guardada
como cierta.

| Señal | Puntos | Qué significa |
|---|---:|---|
| `ean` | +60 | La propia línea imprime un GTIN **válido** (dígito de control) y coincide con el del candidato. El código de barras del recibo **no** es un EAN de producto y no se usa |
| `historial` | +70 | La persona confirmó este texto, en esta tienda |
| `historial_otra_tienda` | +25 | Lo confirmó en otra tienda (o sin saber cuál): una **pista** que ayuda a ordenar y **no suma para decidir**. Un abreviado como «DESNAT 1L» no es el mismo producto en todas las cadenas |
| `nombre` | 0–50 | 40 × cuántas de las palabras de la línea están en el candidato (abreviaturas y plurales incluidos) + 10 × cuántas del candidato explica la línea |
| `marca_impresa` | +15 | La marca del candidato está **escrita en la línea** (salvo palabras como «natural» o «eco», que no demuestran nada) |
| `tamano` | +15 | Mismo tamaño de envase (2 % de margen; en un pack vale el total o una unidad) |
| `tamano_distinto` | −40 | Los dos tamaños se conocen y no cuadran: 2 L no es 330 ml. El candidato no se asigna solo |
| `categoria` / `categoria_distinta` | +5 / −10 | Misma categoría (lácteos, carne…) o claramente otra |
| `tienda` | +3 | OFF dice que se vende en esa tienda. **Ordena, no demuestra**: la tienda sola no prueba la marca |
| `corroborado` | +5 | Dos orígenes **distintos** (OFF y un catálogo de supermercado) dicen lo mismo |

**Se asigna solo** (`elegido`) cuando se cumple todo esto:

- **Evidencia directa** (EAN impreso, o lo confirmado antes para esta tienda) y ninguna contradicción; **o bien**
- `puntos ≥ 70` (sin contar la pista de otra tienda), cubre al menos el 75 % de las palabras de la línea, **hay algo
  más que el nombre** (tamaño igual, marca escrita o corroboración), no hay contradicción de tamaño y **le saca al
  segundo al menos 15 puntos**.

En cualquier otro caso es **ambigua** y se enseñan hasta 4 opciones. Debajo de 40 puntos (o con menos de la mitad
de las palabras) un candidato ni se ofrece. Todos los números están en `CONFIG_DEFECTO` y `PESOS`
(`resolver.ts`) y los prueba `resolver.test.ts`.

**Estados que salen:**

| Campo | Valores | Significado |
|---|---|---|
| `estado` | `resuelta` · `ambigua` · `sin_candidatos` · `no_producto` | `no_producto`: subtotal, descuento, pago… |
| `estadoMarca` | `confirmada` · `inferida` · `desconocida` | **confirmada**: la confirmó la persona, está escrita en la línea o la identifica el EAN impreso. **inferida**: sale de un candidato por nombre y tamaño; se enseña como «Sugerida» para confirmar. **desconocida**: no hay marca (o la ficha no la trae) |
| `confianza` | `alta` · `media` · `baja` · `ninguna` | Heurística. `alta` = se asignó sola; `media`/`baja` = hay opciones |
| `necesitaRevision` | sí/no | Sí si la marca es solo inferida o si hay que elegir |

Una ficha que identifica el producto pero **no trae marca** deja la marca `desconocida`: no se rellena.

## Qué se guarda y dónde

| Dato | Dónde | Quién lo ve |
|---|---|---|
| La foto, el ticket entero, sus líneas | **En ningún sitio** | — |
| El elemento de inventario, enlazado al producto del catálogo (`product_id`) | `inventory_items` (como siempre) | Los miembros de la nevera |
| El producto, si es nuevo: global por `lookup-barcode` (una sola vez por código) o privado de la nevera por `ensure_private_product` (uno por nombre y marca) | `products` | Todos / la nevera |
| Lo que la persona **confirmó, eligió o escribió**: texto de línea normalizado + tienda → nombre, marca, producto, origen y puntuación con la que se propuso | `ticket_associations` | **Solo la persona** (RLS). **No hay pantalla para verlas ni borrarlas**: se decidió mantener la app sencilla; hay que resolverlo antes de abrirla (ver «Limitaciones») |

Trazabilidad de una asociación: `source` (`history`·`catalog`·`off`·`supermarket`·`manual`), `match_score`,
`confirmations` (una corrección vuelve a 1), `barcode` y `product_id` cuando existen. No hay una tabla de líneas
de ticket: guardar cada compra día a día no lo necesita nada de lo que hace Opsi.

Se recuerda **solo lo que la persona hace a propósito** (confirmar, elegir otra opción, escribir la marca). Una
sugerencia que se queda como está al pulsar «Guardar» se usa para esa compra pero no se aprende. «Sin identificar»
tampoco se aprende. Tope de 2000 asociaciones por persona (sale la más antigua).

## Rendimiento, límites y errores

- **No bloquea:** la revisión sale en cuanto el lector termina; las marcas llegan después, por tandas de 8.
- **Cupo de OFF:** su documentación fija 10 búsquedas por minuto por IP para su API principal; para el buscador de
  texto no publican límite, y aquí se usa ese orden de magnitud: **10 por minuto entre todas las personas** y **60
  por hora por persona** (`consume_off_search`, aparte del cupo de códigos de barras). Un ticket de 24 líneas no cabe
  de golpe: la app espera lo que dice el servidor (acotado) y vuelve a pedir lo pendiente, hasta 4 veces; si falta
  mucho (tope de la hora) deja de insistir y cada fila tiene «Buscar marca».
- **Caché:** de resultados de OFF, **en memoria de la instancia** (6 h si hay resultados, 1 h si no; errores, nunca).
  A propósito no es una tabla compartida: escribirla exigiría la clave de servicio o dejar que el cliente la
  escriba, y una caché global que escribe el cliente es una caché que envenena cualquiera.
- **Duplicados:** las líneas iguales de una tanda comparten una sola consulta.
- **Fallos:** un error, un tiempo agotado, un 429 o una respuesta rara de una fuente quedan anotados en `fuentes` y
  la línea sigue con lo que haya. La importación nunca depende de esto.
- **Datos externos = no confiables:** todo lo que viene de OFF pasa por los filtros de `off.ts` (texto limpio y
  acotado, imágenes solo de su dominio, GTIN válido, tabaco fuera) y se vuelve a limpiar en la app.
- **Privacidad hacia OFF:** solo salen las palabras del producto (letras y cifras) y un filtro fijo de país. Ni la
  tienda, ni el importe, ni la nevera, ni quién pregunta.

## Para ponerlo en marcha

- **Migración:** `20261029100000_marcas_tickets` (aditiva: tabla `ticket_associations` y seis funciones). En local:
  `npm run db:migrate` (**no** `db:reset`, que borra la base local).
- **Función:** `opsi-marcas` (registrada en `supabase/config.toml`, `verify_jwt = true`). Sin clave de servicio.
- **Variables de entorno:** ninguna nueva. Usa `OFF_USER_AGENT` (la misma que `lookup-barcode`: nombre de la app y
  un contacto real). Sin ella, o con el valor de ejemplo, no se consulta OFF y la función sigue sirviendo el
  historial y el catálogo.
- **Tipos:** `npm run types` (en esta rama ya están actualizados).

## Cómo se prueba

```bash
npm run test:funciones   # núcleo, fuentes, OFF con respuestas simuladas, manejador
npm run test:app         # lógica de la pantalla de revisión
npm run db:test          # pgTAP real: marcas_test.sql
npm run db:check         # esquema en PGlite, sin Docker
```

Escenarios cubiertos con fuentes simuladas (ningún test llama a un servicio externo): EAN exacto, nombre y formato
con OFF, línea abreviada con varios candidatos, dos candidatos con distinto tamaño, producto no encontrado,
subtotal/descuento/pago, OFF caído o sin cupo, asociación del mismo supermercado, asociación que no debe aplicarse
(otra tienda, tamaño incompatible, texto distinto), corrección manual y su reutilización, prevención de duplicados y
compatibilidad con tickets leídos sin texto, precio ni tienda.

**Prueba real** (contra el Supabase local y Open Food Facts, con el ticket real de pruebas de 24 líneas): el lector
tardó ~6 s; las marcas, ~2 min por el cupo de OFF. Salió 1 línea asignada sola (una marca escrita en el ticket,
«Bronchales»), 10 con opciones para elegir y 13 sin candidatos (entre ellas las 2 que no son comida y varias de
producto fresco sin marca). Las funciones no crearon ningún elemento, asociación ni producto. **No se midió la
exactitud con un conjunto etiquetado**: esto es una comprobación de que funciona, no una cifra de acierto.

## Limitaciones conocidas

- **Alta precisión, recall modesto, por diseño.** Con los umbrales actuales, la mayoría de las líneas llegan a la
  pantalla como «sugerida» o «elige una opción», no resueltas. Bajarlos mejoraría la cobertura a costa de marcas
  equivocadas guardadas como ciertas.
- **Open Food Facts es ruidoso**: de una búsqueda salen fichas con el nombre y la marca cambiados, sin marca, o que
  no se parecen. Se filtran por parecido, pero el acierto depende de lo que haya en OFF para España.
- **El texto de la línea lo interpreta un modelo** (`opsi-ticket`): puede expandir mal una abreviatura. Por eso se
  guarda y se enseña también el texto impreso, y la clave de lo recordado sale del texto impreso.
- **El cupo de OFF es compartido**: con muchas personas a la vez, las marcas tardan más.
- **Al guardar,** un producto de OFF que Opsi aún no tiene entra en el catálogo por `lookup-barcode` (la misma puerta
  que el escáner), que comparte el cupo de 10 por minuto de códigos de barras. Si no cabe o OFF no contesta, la línea
  se guarda **sin enlace** (la asociación recuerda el código para la próxima vez): guardar nunca depende de esto.
- **La caché de OFF no se comparte entre instancias** ni sobrevive a un reinicio.
- **La búsqueda en el catálogo de Opsi** recorre la tabla; con decenas de miles de productos habría que añadir un
  índice de trigramas.
- **Sin catálogos de supermercado** (ver arriba), la tienda solo sirve para ordenar y para acotar lo recordado.
- **Lo recordado no se puede ver ni borrar desde la app.** La base de datos ya lo permite (la persona puede leer y
  borrar las suyas, y corregirlas por función), pero no hay pantalla, y hoy tampoco hay borrado de cuenta. Elegir otra
  opción en la revisión sustituye lo recordado, y se va con la cuenta, pero no es una vía de supresión. Pendiente antes de
  producción (RGPD): ver [`PENDIENTES.md`](internal/PENDIENTES.md).
- **Nada de la pantalla se ha visto en un móvil.**
