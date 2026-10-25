# Modelo de amenazas

Una tabla STRIDE por funcionalidad que maneja datos de usuario (§0.1 de la lista de
seguridad). Cada fila dice **qué amenaza concreta** hay en este proyecto, **qué la
frena** y **qué test lo demuestra**. Sin ejemplo concreto, la fila no cuenta, y sin
test, la columna dice «pendiente» en vez de fingir.

**Regla:** una PR que añade una funcionalidad con datos de usuario añade aquí su tabla.
El inventario de lo que hay expuesto está en [`security-inventory.md`](security-inventory.md).

Leyenda de la columna *Test*: un fichero de `supabase/tests/` es un test pgTAP que corre
en la CI; `db:carreras` es `scripts/check-carreras.mjs`, que abre dos sesiones a la vez;
**pendiente** significa que el control existe (o está decidido) pero nada lo comprueba
automáticamente todavía.

---

## 1 · Alta y entrada

Usuario y contraseña. El «usuario» viaja como un correo sintético
(`usuario@usuarios.opsi.local`) para que GoTrue lo trate como cualquier otro.

| STRIDE | Amenaza concreta | Mitigación | Test |
|---|---|---|---|
| **S**poofing | Probar contraseñas de otra persona | Mínimo 10 caracteres; 30 intentos cada 5 min por IP; el mensaje de error no distingue «usuario inexistente» de «contraseña mala» | pendiente (es configuración de GoTrue) |
| **T**ampering | Mandar `data.username = 'admin'` en un `signUp` directo para tener esa identidad | `handle_new_user` ignora los metadatos: el nombre sale del correo y solo se admite el dominio sintético | `alta_test.sql` |
| **R**epudiation | Ninguna traza de quién entró y cuándo fuera de GoTrue | Activar el registro de auditoría de Auth en el proyecto desplegado | pendiente (antes de publicar) |
| **I**nfo disclosure | La sesión vive en `AsyncStorage` sin cifrar; con copia de seguridad de Android activa, entra en la copia | `expo-secure-store` y `allowBackup: false` en la *development build* | pendiente (hallazgo M2) |
| **I**nfo disclosure | El alta revela si un nombre de usuario existe («ya está cogido») | Inherente a elegir un nombre público. Solo lo acota el límite de tasa. **Riesgo aceptado** hasta tener captcha | pendiente |
| **D**oS | Altas masivas: cada una crea nevera y ajustes | 30 cada 5 min por IP. Sin captcha | pendiente (antes de publicar: captcha o alta por Edge Function con tope) |
| **E**levation | Registrarse como `admin`, `opsi` o `soporte`; usar un correo real para saltarse el formato | Diez nombres reservados; correo y formato validados en el servidor | `alta_test.sql` |

## 2 · Inventario y acciones sobre un elemento

Las seis acciones (abrir, usar, congelar, descongelar, terminar, tirar) por RPC.

| STRIDE | Amenaza concreta | Mitigación | Test |
|---|---|---|---|
| **S**poofing | Llamar a una acción sin sesión, con solo la `anon key` (que va en el binario) | `anon` no tiene `EXECUTE` sobre ninguna función salvo `dominio_sintetico()` | `privilegios_test.sql` |
| **T**ampering | Dos personas actúan a la vez sobre el mismo elemento: una lo termina y otra lo tira, o gastan 600 g de un envase de 1000 g | `require_item()` bloquea la fila (`for update`); la segunda sesión relee el elemento ya cambiado y falla con su mensaje | `db:carreras` |
| **T**ampering | Escribir o borrar eventos del historial con un `update`/`delete` suelto | Sin permiso de `UPDATE` ni `DELETE` sobre `inventory_events`, y sin política | `privilegios_test.sql`, `rls_isolation_test.sql` |
| **R**epudiation | «Yo no tiré eso» | Cada acción escribe su evento con `user_id` **en la misma transacción**; el historial es inmutable | `inventory_actions_test.sql`, `rls_isolation_test.sql` |
| **I**nfo disclosure | Ver elementos de otra nevera, también a través de la vista de prioridad | RLS por pertenencia; la vista es `security_invoker` y aplica la RLS de quien pregunta | `rls_isolation_test.sql`, `inventory_actions_test.sql` |
| **I**nfo disclosure | Un error de la base de datos llega a la pantalla con nombres de tablas o restricciones | Lo que no se reconoce se sustituye por un mensaje genérico; el detalle solo sale por la consola en desarrollo | pendiente (la app no tiene runner de tests; comprobado a mano) |
| **D**oS | Crear elementos sin tope o lanzar acciones en bucle | Longitudes máximas en las columnas. **Sin límite** de elementos por nevera ni de acciones por minuto | pendiente (hallazgo B3) |
| **E**levation | Mover un elemento a otra nevera para colarlo en una que no es tuya | Un trigger impide cambiar `household_id` de un elemento, una línea de la lista o un producto | `household_sharing_test.sql` |

## 3 · Neveras compartidas e invitaciones

| STRIDE | Amenaza concreta | Mitigación | Test |
|---|---|---|---|
| **S**poofing | Aceptar la invitación de otra persona | `accept_invitation` exige que la invitación sea **para** `auth.uid()`; la identidad nunca viene de un argumento | `household_sharing_test.sql` |
| **T**ampering | Subirse el límite de neveras (`household_limit`) o de plazas (`member_limit`) | Ninguna de las dos columnas es escribible por el cliente, ni al insertar ni al actualizar | `privilegios_test.sql`, `household_sharing_test.sql` |
| **T**ampering | Crear una nevera saltándose el tope con dos peticiones simultáneas | Bloqueo de la fila de ajustes de la persona antes de contar | `household_sharing_test.sql` (tope); pendiente la carrera (probada a mano) |
| **R**epudiation | «Yo no invité a esa persona» | `household_invitations` guarda quién, a quién y cuándo respondió | `household_sharing_test.sql` |
| **I**nfo disclosure | **Enumerar usuarios** invitando a nombres al azar para ver cuáles existen | `invite_to_household` devuelve el fallo como **resultado**, no como error (así el intento queda contado); 5 intentos por hora; el registro de intentos no guarda el nombre probado y no lo lee nadie | `household_sharing_test.sql` |
| **I**nfo disclosure | Leer el registro de intentos de invitación | Sin permiso ni política para ningún rol del cliente | `privilegios_test.sql` |
| **D**oS | Inundar a alguien de invitaciones | 5 por hora y por persona; una pendiente por nevera y destinatario; caducan a los 7 días | `household_sharing_test.sql` |
| **E**levation | Echar, traspasar, renombrar o invitar sin ser el dueño; invitar a una nevera **privada** | `require_owner_household()` en el servidor; las privadas devuelven `nevera_personal` | `household_sharing_test.sql` |

## 4 · `lookup-barcode` (fase 2) — *código y tests hechos; sin desplegar*

Se escribió aquí **antes** que el código, como pide la lista (§22). Es la primera Edge
Function: lleva la clave de servicio y llama a un tercero (Open Food Facts), así que es
donde más fácil es meter una deuda de seguridad que luego no se paga. La columna «Dónde se
prueba» dice qué fichero lo comprueba; las filas que dicen *no probado* son lo que falta.

**Flujo:** app → producto privado de la nevera (lectura normal, sin cuota) → Edge Function
(con el JWT de la persona) → caché global en `products` → si falta, Open Food Facts →
normalizar → guardar con `upsert_global_product()` → devolver.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **S**poofing | Llamar a la función sin ser nadie: `verify_jwt` solo comprueba que el JWT sea válido, y la `anon key` **es** un JWT válido | Dentro de la función: `auth.getUser(token)` y exigir `role === 'authenticated'` y que no sea una sesión anónima (esto último, sin test: el proyecto no activa el acceso anónimo) | `lookup.test.ts` (sin cabecera, cabecera mal formada, JWT que no es de persona: no se llama a nadie) y `npm run fn:check` (con el gateway real: sin token, `anon key` y token manipulado dan 401) |
| **T**ampering (SSRF) | El código de barras se usa para construir la URL de OFF | Host y ruta fijos en el código; el código solo si son 8, 12, 13 o 14 cifras **y** con dígito de control GS1 válido; `consultarOff` vuelve a exigir solo cifras antes de poner nada en una URL; `redirect: 'error'`; del cliente solo se lee `barcode`: nunca URL, host ni ruta | `gtin.test.ts`, `off.test.ts` (rutas tipo `../../etc/passwd`, `?x=1`, `#`: no se llama a `fetch`; host, método, `redirect`), `lookup.test.ts` (`url`, `host`, `path` en el cuerpo se ignoran), `fn:check` |
| **T**ampering | La caché se **envenena**: OFF lo edita cualquiera, y lo que se guarda lo ven todas las personas (y en la fase 5, el modelo) | **Dos filtros de dos lenguajes.** El de la función se queda con un subconjunto de campos: texto sin saltos de línea ni caracteres de control, de formato, bidireccionales o de ancho cero, sin `<` `>`, con tope de longitud; `image_url` solo de `images.openfoodfacts.org` por https y sin puerto ni credenciales; categorías con el formato exacto de OFF. El de la base de datos (`upsert_global_product`) lo **revalida** todo: si la función tuviera un fallo, rechaza igualmente. `service_role` no puede escribir `products` directamente | `off.test.ts` (una ficha envenenada sale limpia), `escaner_test.sql` (22 casos rechazados en SQL y comprobación de que no entró nada) |
| **T**ampering | Una nevera compartida pone en un producto **privado** la URL de su servidor como imagen y se entera de cuándo y desde qué IP lo abre cada compañera | `products_image_url_ck`: la imagen de **cualquier** producto, privado o global, solo puede ser de `images.openfoodfacts.org` | `escaner_test.sql` |
| **T**ampering | Enlazar un elemento a un producto privado de **otra** nevera conociendo su uuid | `create_item` exige que el producto sea global o de la misma nevera, con el mismo mensaje para «no existe» y «no es tuyo» | `escaner_test.sql` |
| **T**ampering | El texto con el que OFF dice «esto no es comida» (`status_verbose`) se toma por una orden, o se guarda y se enseña | Solo cuenta la frase **exacta** `product found with a different product type: <tipo corto en minúsculas>`, y de ella solo sale un booleano: el texto no se guarda, no se registra y no llega a la app. Cualquier otra cosa (otra frase, mayúsculas, un añadido tras el tipo) es «no existe». Un 404 con el cuerpo roto o enorme no lanza | `off.test.ts` (las tres bases de la familia, y cinco textos que no cuentan) |
| **T**ampering | Dos filas para el mismo producto por escribir el código distinto (el UPC-A de 12 cifras y su EAN-13 con un cero delante son el mismo artículo) | Normalizar antes de buscar y de guardar: 12 cifras → se antepone `0`; 14 cifras con `0` delante → se quita; un GTIN-14 con otro indicador es otro artículo (una caja) y se deja; la normalización **nunca arregla** un código (ni rellena por la izquierda ni corrige el control) | `gtin.test.ts`, `lookup.test.ts` (los tres escriben el mismo código) |
| **R**epudiation | No saber quién consultó qué | Un registro por petición con `request_id`, `user_id`, resultado, estado y milisegundos; **sin** token, cuerpo ni código de barras (el código dice qué compra la persona) | `lookup.test.ts`; visto en el log del runtime real |
| **I**nfo disclosure | Un error de OFF o una excepción llega a la app con detalle interno | Código de error propio y mensaje en español sin detalle; el motivo (`http_429`, el mensaje de la base de datos…) va solo al log | `lookup.test.ts` |
| **I**nfo disclosure | OFF ve de dónde vienen las consultas | La llamada sale **del servidor**: OFF ve la IP de Supabase, no la de la persona. No se mueve al móvil | n/a (decisión de diseño) |
| **D**oS | Un usuario consulta en bucle | `consume_lookup_quota()`: 30 por minuto y 500 por día **por persona**, con un solo `insert … on conflict do update` (atómico). Cuenta aunque se resuelva desde la caché. Una lectura sucia (código inválido) no gasta cuota | `escaner_test.sql`, `lookup.test.ts` (orden: nada se cuenta antes de validar), `npm run db:carreras` (**dos sesiones a la vez**: 40 consultas dan exactamente 30 permitidas y el contador marca 40) |
| **D**oS | OFF nos limita y el escáner entero deja de funcionar | `consume_off_slot()`: 10 por minuto entre **todas** las personas (por debajo del límite que recoge `PENDIENTES.md`, unas 15 por IP); timeout de 4 s; cuerpo máximo de 256 KB leído en flujo; **caché de faltas** de 6 horas; ficha caducada (30 días) sigue sirviéndose si OFF falla; si no hay respuesta, la app degrada al alta a mano con el código ya puesto | `escaner_test.sql`, `off.test.ts` (tiempo agotado, respuesta enorme con y sin `content-length`), `lookup.test.ts` |
| **D**oS | Sin `OFF_USER_AGENT` (o con el valor de ejemplo) la función llamaría a OFF de forma anónima | No llama: sigue sirviendo la caché y degrada lo demás | `lookup.test.ts` |
| **E**levation | Escribir el catálogo global desde el cliente | Imposible por diseño: `is_household_member(NULL)` es falso, así que ninguna política de escritura admite filas globales. `service_role` solo **lee** `products` (y dos columnas de `product_nutrition`) y **ejecuta** seis funciones; ni `anon` ni `authenticated` ejecutan ninguna | `privilegios_test.sql`, `escaner_test.sql` |
| **E**levation | El contenido de OFF (nombres, marcas) se interpreta como instrucción cuando llegue al chat | Nunca se interpola en un prompt: se pasa como datos, recortado y sin saltos de línea. Los filtros de arriba ya quitan lo que sirve para esconder una instrucción (saltos de línea, caracteres de control y direccionales), pero **el encapsulado en el prompt se hace en la fase 5** | no probado (fase 5) |

### Ficha del endpoint

- **Nombre:** `lookup-barcode`
- **Tipo:** Edge Function (Deno)
- **Método y ruta:** `POST /functions/v1/lookup-barcode`, cuerpo `{ "barcode": "<8–14 cifras>" }`, máximo 1 KB (también `OPTIONS`, para el preflight de la versión web)
- **Autenticación:** JWT de una persona con sesión, **verificado dentro de la función**
- **Autorización:** cualquier persona autenticada puede consultar el catálogo; nadie puede escribir en él excepto la propia función, y solo por `upsert_global_product` (y, para la nutrición, `upsert_product_nutrition`: ver §8)
- **Entrada validada:** solo cifras, 8, 12, 13 o 14 de ellas, dígito de control GS1 correcto, y no una cadena de ceros. Además, **solo comida**: un EAN-13 con prefijo de revista, libro, recibo o cupón (977–984 y 990–999) contesta «no es comida» sin gastar cuota ni preguntar a nadie, y un código que OFF dice que es de otra base (cosmética, mascotas, otros productos) también
- **Salida:** `{ "found": true, "product": { id, barcode, name, brand, unit_family, net_quantity, image_url, allergens_tags, traces_tags, labels_tags, ingredients_text, health_data, source: "openfoodfacts" } }` (los datos de salud, ver §7) o `{ "found": false, "barcode": "…" }` (con `"not_food": true` si no es comida). Nunca el `off_payload` ni nada de **nutrición** (es premium y esta función no mira el plan: §8). Errores: `{ "code", "message" }` con 400, 401, 405, 413, 429 (con `Retry-After`), 500 o 503
- **Límites:** 30/min y 500/día por persona; 10/min globales hacia OFF; timeout 4 s; respuesta de OFF ≤ 256 KB
- **Riesgos:** SSRF, envenenamiento de la caché, abuso de cuota, filtrado de errores, entrada no confiable hacia el modelo
- **Controles en servidor:** los de la tabla de arriba
- **Secretos:** `OFF_USER_AGENT` (nombre de la app y un contacto **real**; el valor de ejemplo se rechaza) en el entorno de la función. La clave de servicio la inyecta Supabase y no sale de ahí
- **Tests automatizados:** `npm run test:funciones` (150 con los del chat, sin Deno ni red), `npm run db:test` (`escaner_test.sql`, `nutricion_test.sql`), `npm run db:carreras` y `npm run fn:check` (25, en el runtime de Edge Functions de verdad)
- **Estado:** `[x] diseño`  `[x] código`  `[x] tests`  `[x] inventario`  `[ ] prod`

**Lo que no está probado:** la cámara en un móvil real; la llamada a OFF desde el runtime con la
configuración de producción (sí en local, con `supabase functions serve`); y cómo se porta OFF
con el tráfico de más de una persona.

## 5 · Lista de la compra (fase 4)

Tabla y RLS desde la fase 0; las reglas que la RLS no dice, en el trigger `check_shopping_item`
(`20261011100000_lista_de_la_compra`). **Sin Edge Function**: la app habla con la tabla y con una
función de la base de datos.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **S**poofing | Apuntar una línea «de parte de» otra persona de la nevera (`created_by` lo escribía el cliente) | El trigger pisa `created_by` con `auth.uid()` al insertar, y no deja cambiarlo después | `lista_compra_test.sql` |
| **T**ampering | Que algo se apunte **solo** sin que la persona lo haya encendido (el principio del proyecto era solo un comentario) | `source = 'auto_restock'` se rechaza (P0001) salvo que `user_settings.auto_add_to_shopping_list` sea verdadero; el origen no se puede cambiar después | `lista_compra_test.sql` |
| **T**ampering | Enlazar un producto privado de **otra** nevera conociendo su uuid | El producto tiene que ser global o de la misma nevera; mismo mensaje para «no existe» y «no es tuyo» | `lista_compra_test.sql` |
| **T**ampering | Marcar como comprado y que **no** entre en el inventario (o al revés) por fallar la segunda de dos llamadas | `stock_from_list` hace las dos cosas en una transacción; si el alta falla, la línea no se toca | `lista_compra_test.sql` |
| **T**ampering | Dos personas marcan la misma línea a la vez y se crean **dos** elementos | `stock_from_list` bloquea la línea (`for update`): la segunda ve «ya está marcado como comprado» | `npm run db:carreras` (**dos sesiones solapadas**) |
| **I**nfo disclosure | Leer la lista de otra nevera | RLS por `is_household_member`; el cliente además filtra por la nevera activa | `lista_compra_test.sql` |
| **D**oS | Una nevera acumula líneas sin límite | Tope de 300 por nevera (contando lo comprado), con mensaje que se entiende. Es una red contra un cliente descontrolado, **no** una limitación pensada para nadie | `lista_compra_test.sql` |
| **E**levation | Dar de alta, desde una línea ajena, un elemento en la nevera de otra persona | `stock_from_list` lee la línea con la RLS: una línea de otra nevera «no existe» para quien llama | `lista_compra_test.sql` |

**Lo que no cubre:** el origen `chat` (fase 5) se acepta tal cual desde el cliente; solo es una etiqueta y
no da ningún permiso, pero cuando exista `opsi-chat` hay que decidir si lo escribe solo el servidor. El
tope se comprueba contando filas dentro del trigger, así que dos inserciones **simultáneas** pueden pasarse
por una o dos líneas: es aceptable para lo que es, y no se ha probado con dos sesiones.

---

## 6 · Varias listas, plan y Opsi Premium ⭐

Una tabla nueva (`shopping_lists`), dos columnas de `user_settings` (`plan`, `accent`) y una función
(`most_used_products`), en `20261017100000_listas_y_premium`. **Sin Edge Function** y sin pago: el plan solo
lo cambia quien tiene la base de datos. Lo que importa aquí es que **todo lo premium se decide en el servidor**.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **E**levation | Subirse el plan desde la app (`update user_settings set plan = 'premium'`) | Ningún permiso de columna concede `plan`: ni en INSERT ni en UPDATE (como `household_limit`) | `listas_premium_test.sql` (42501) |
| **E**levation | Ponerse un color premium sin serlo | Trigger `check_accent`: distinto del verde exige `plan = 'premium'` en la propia fila, que el cliente no cambia. Lo que oculta la app (candados) no es la protección | `listas_premium_test.sql` |
| **E**levation | Pedir «lo que más gastas» sin premium | `most_used_products` comprueba el plan antes de leer nada (42501, pista `premium`) | `listas_premium_test.sql` |
| **I**nfo disclosure | Ver «tus productos» de otra persona, o de una nevera que no es tuya | `my_known_products` (premium, 42501 sin plan) es SECURITY INVOKER: lee `inventory_items` con la RLS de quien llama **y** `created_by = auth.uid()`, así que lo que añadió otra persona de la misma nevera tampoco sale. No hay tabla nueva que proteger | `tus_productos_test.sql` |
| **I**nfo disclosure | Leer lo que más se gasta en la nevera de otra persona, siendo premium | Es SECURITY INVOKER: lee `inventory_events` e `inventory_items` con la RLS de quien llama, y una nevera ajena sale **vacía** | `listas_premium_test.sql` |
| **T**ampering | Colgar una línea de la lista de OTRA nevera (quien está en dos neveras) | `check_shopping_item` exige que la nevera de la línea sea la de su lista (ninguna, si la lista es individual), al crear y al mover | `listas_premium_test.sql`, `lista_compra_test.sql` (P0002) |
| **E**levation | Crear o renombrar una lista en la nevera de otra persona, o cambiarla de nevera o de tipo | RLS por tipo (`is_household_member` en las compartidas, `owner_id = auth.uid()` en las individuales); el permiso de UPDATE es solo `name` y el de INSERT solo `kind`, `household_id` y `name` | `listas_premium_test.sql` (42501) |
| **S**poofing | Crear una lista «de parte de» otra persona, o una individual a nombre de otra | El trigger pisa `created_by` y `owner_id` con `auth.uid()`; `owner_id` no es escribible por el cliente | `listas_premium_test.sql` |
| **D**oS | Acumular listas sin límite | Tope **por cuenta**, según quien las **crea**: básico 1 compartida + 1 individual, premium 5 en total. Una compartida creada en una nevera de la que luego se sale ya no se ve y no cuenta: no se persigue (exigiría que te volvieran a invitar) | `listas_premium_test.sql` |
| **D**oS | Quedarse sin ninguna lista | El trigger no deja borrar la última **individual**. El borrado en cascada de la cuenta sí pasa (se detecta por la profundidad del trigger, no por el orden en que se borren las filas) | `listas_premium_test.sql` |
| **I**nfo disclosure | Ver las listas individuales de otra persona, o sus líneas | RLS: una individual solo la ve su dueña/o; las líneas heredan la visibilidad de su lista (`exists` sobre `shopping_lists`, que ya filtra por RLS) | `lista_compra_test.sql` (sección I), `rls_isolation_test.sql` |
| **I**nfo disclosure | Un producto privado de la nevera de otra persona colado en una lista individual | `check_shopping_item` solo deja enlazar productos globales o que la persona ve (la RLS de `products`); mismo mensaje para «no existe» y «no es tuyo» | `lista_compra_test.sql` |
| **E**levation | Pasar una línea individual al inventario de una nevera ajena | `stock_from_list` exige `p_household_id` y `create_item` comprueba que quien llama sea miembro (P0002); la línea no se marca si falla | `lista_compra_test.sql` |
| **T**ampering | Subirse el tope de neveras cambiando de plan a mano | `household_limit` lo fija el trigger `sync_household_limit` al cambiar `plan` (5 premium, 2 básico); ninguna de las dos columnas es escribible por el cliente | `listas_premium_test.sql`, `privilegios_test.sql` |

**Lo que no cubre:** los dos topes (listas y líneas) cuentan filas dentro del trigger, así que dos inserciones
**simultáneas** pueden pasarse por una; no se ha probado con dos sesiones. Un fallo del servidor de pagos —que
no existe todavía— es lo primero que habrá que modelar cuando se añada: quién puede decir «esta cuenta es
premium», y con qué comprobación.

---

## 7 · Salud: lo que evita cada persona, y alérgenos e ingredientes de un producto

Una tabla nueva (`user_health_preferences`), cinco columnas nuevas en `products` (`allergens_tags`, `traces_tags`,
`labels_tags`, `ingredients_text`, `health_data_at`) y una firma nueva de `upsert_global_product`, en
`20261021100000_salud_y_ingredientes`; `lookup-barcode` devuelve esos datos y la app los cruza. Lo que cada persona evita
es un **dato de salud (categoría especial del RGPD)**.

**Flujo:** la persona marca lo que evita → una fila propia en `user_health_preferences` (RLS) → la app lee esa fila y la
ficha de salud de cada producto (de Open Food Facts, vía `lookup-barcode`) y las **cruza en el móvil** (`evaluarSalud`).
El servidor no cruza nada: ninguna función ni la Edge Function lee las preferencias, y eso es lo que más las protege.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **I**nfo disclosure | Otra persona —de la misma nevera compartida o no— lee lo que evito | RLS: solo la fila propia en select, insert, update y delete (borrar la suya es retirar el permiso). Permisos por columna (`insert (user_id, avoid, consent_version)`, `update (avoid, consent_version)`); `anon` y `service_role` sin ningún privilegio sobre la tabla | `salud_test.sql` (quien no es la dueña no ve, no inserta y no actualiza; un miembro de la misma nevera tampoco; `anon` y `service_role` sin acceso) |
| **I**nfo disclosure | Una función SECURITY DEFINER, una vista o la Edge Function leen las preferencias y un fallo suyo (o la clave `service_role`, que salta la RLS) las saca | Ninguna lo hace: el cruce es del móvil. La Edge Function solo recibe un código de barras | `salud_test.sql` (busca el nombre de la tabla en el código de todas las funciones; ninguna vista depende de ella), `privilegios_test.sql` |
| **I**nfo disclosure | Las preferencias salen en un mensaje de error (PostgREST copia la fila fallida en `details`), en un registro, en una URL o en el disco del aparato | `guardarPreferenciasSalud` quita `details` antes de que el error llegue a `describeDbError`; la app no escribe las preferencias en ningún `console.*`, URL, ruta ni almacenamiento; la caché de TanStack Query está en memoria y se vacía al cambiar de persona (`session.tsx`) | revisión del código; **sin test automático** del «no sale» (pendiente) |
| **T**ampering | Guardar valores que no son de la lista, o enormes | CHECK de lista cerrada (los 14 alérgenos UE y la lactosa) con tope de 15; un trigger deja la lista sin repetidos y ordenada | `salud_test.sql` |
| **E**levation | Reescribir la identidad de la fila (`user_id`) o escribir la de otra persona | Sin permiso de UPDATE sobre `user_id`; la RLS comprueba `user_id = auth.uid()` en el INSERT y en el UPDATE. Por eso la app hace UPDATE y luego INSERT, no `upsert` (que pediría UPDATE sobre `user_id`) | `salud_test.sql` (42501) |
| **I**nfo disclosure | Se guarda un dato de salud sin consentimiento explícito | **Mitigado (20261023100000).** El servidor no guarda una lista no vacía sin `consent_version` (trigger `check_health_consent`, P0001, pista `consentimiento_salud`); la fecha del permiso (`consented_at`) la pone el servidor y la persona no puede escribirla; la app no enseña casillas hasta aceptar el aviso ni cruza nada sin permiso vigente. Las filas de antes del permiso no se borran ni se les inventa permiso: no se usan y el inventario lo dice | `salud_consentimiento_test.sql` (30), `salud_test.sql`, `salud.test.ts` (lógica del permiso) |
| **I**nfo disclosure | No se puede retirar el consentimiento ni borrar lo guardado | **Mitigado.** La persona borra su fila (retirar el permiso es borrar: la lista y la fecha); la RLS solo deja la suya; Ajustes lo ofrece con confirmación. Al borrar la cuenta la fila se va con ella (`on delete cascade`). **Falta** borrar la cuenta desde la app y exportar los datos (`PENDIENTES.md`, 🟠) | `salud_consentimiento_test.sql` (borrar la suya, no la ajena) |
| **I**nfo disclosure | Una versión nueva del aviso de consentimiento no se pide de nuevo y se sigue usando el permiso viejo | `VERSION_AVISO_SALUD` en el cliente: con un permiso de una versión anterior no se cruza nada y el inventario avisa. **Solo lo comprueba el cliente** (el servidor exige que haya versión, no cuál): un cliente modificado puede saltarse la renovación, pero solo se perjudica a sí mismo | `salud.test.ts` |
| **T**ampering | Una persona de una nevera pone en un producto **privado** `health_data_at` y `allergens_tags = '{}'` y finge ante sus compañeras un «sin alérgenos» | CHECK `products_health_global_only_ck`: en un producto con `household_id` todas las columnas de salud son NULL. Además la app trata como «sin datos» todo lo que no sea `data_source = 'openfoodfacts'` | `salud_test.sql`, `salud.test.ts` |
| **T**ampering | La caché global se envenena con alérgenos, trazas, etiquetas o ingredientes falsos o con texto malicioso (OFF lo edita cualquiera) | Tres filtros: `off.ts` (formato exacto de etiqueta, tope de 40, `labels_tags` solo de una lista cerrada de 3, ingredientes ≤ 2000 caracteres sin control, bidireccionales, ancho cero ni `<` `>`), `upsert_global_product` (lo revalida todo) y los CHECK de la tabla. La app lo vuelve a comprobar (`leerSalud`): lo que no cuadra se tira y la ficha pasa a «sin datos» | `off.test.ts` (fichas envenenadas, 100 alérgenos, listas rotas), `lookup.test.ts`, `salud_test.sql`, `salud.test.ts` (entrada hostil) |
| **T**ampering | **Un falso «todo bien»**: un producto sin datos (ficha antigua, hecho a mano, sin ingredientes, lista rota, consulta fallida) se lee como «sin alérgenos» o «apto» | `health_data_at` separa «no consta» de «OFF no declara nada»; `evaluarSalud` marca «Sin datos de alérgenos» si la ficha no es de OFF, no consta, no trae ingredientes o algo se descartó; con datos completos y sin aviso no se pinta nada, y ningún texto dice «apto» ni «seguro». Una etiqueta de sin gluten o sin lactosa nunca anula un «contiene» ni unas trazas | `salud.test.ts` (todos los casos de «sin datos»; 15 mutaciones de estas reglas, todas detectadas por alguna prueba) |
| **E**levation | El texto de OFF se interpreta: como marcado, enlace, ruta, consulta o instrucción para un modelo | Se pinta solo en un `<Text>` plano; sin enlaces automáticos ni `Linking`; nunca se interpola en una ruta ni una consulta. En el prompt del chat (fase 5) irá encapsulado, como el resto del texto de OFF | `salud.test.ts`; **no probado** el encapsulado (fase 5) |
| **D**oS | Una ficha antigua sin `health_data_at` se renueva en cada escaneo y agota la cuota hacia OFF | Se renueva **una vez**: `upsert_global_product` fija la fecha. Sigue valiendo la cuota por persona (30/min, 500/día) y el hueco global hacia OFF (10/min); si OFF no contesta se sirve la ficha vieja con `health_data: false` | `lookup.test.ts`, `escaner_test.sql` |
| **T**ampering | La app recomienda congelar algo ya descongelado, vencido o que no se congela | `recomendarCongelar`: solo en la nevera, con la fecha entre hoy y pasado mañana, sin `thawed_at` (el estado cambia al usar una parte, la fecha de descongelación no) y de una categoría congelable | `congelar.test.ts` |

**Lo que no cubre:** el cruce **no lee el texto de los ingredientes**, solo las etiquetas de alérgenos y trazas de OFF; un
producto con ingredientes rellenados pero sin las etiquetas calculadas no avisaría. Las etiquetas de sin gluten y sin lactosa
son declaraciones de quien edita la ficha. No se detectan otras intolerancias (histamina, fructosa…). Nada de esto se ha
probado con un móvil real ni con una llamada real de la función a OFF desde el runtime de producción.

## 9 · Perfil personal: lo que cada persona cuenta de sí (opcional)

Una tabla nueva (`user_profile`) y un trigger (`check_user_profile`), en `20261025100000_perfil_personal`. Nivel de ejercicio, dieta, gustos, disgustos y productos concretos que no gustan.
**Todo es opcional**, y se trata con el cuidado de un dato de salud: una dieta o lo que no se tolera rozan la salud y las creencias, y cuánto se mueve alguien no es asunto de nadie más.

**Flujo:** la persona acepta un aviso («Aceptar y rellenar») → una fila propia con su permiso (`consent_version`) → rellena lo que quiere → la app lo lee de esa fila. **Hoy nada recomienda con
él**: se guarda para cuando algo lo haga, y el aviso lo dice.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **I**nfo disclosure | Otra persona —de la misma nevera compartida o no— lee el perfil | RLS por `user_id` en select, insert, update y delete; permisos por columna; `anon` y `service_role` sin ningún privilegio sobre la tabla | `perfil_personal_test.sql` (quien no es la dueña no ve, no inserta, no actualiza y no borra; `anon` y `service_role` sin acceso) |
| **I**nfo disclosure | Una función SECURITY DEFINER, una vista o la Edge Function lo leen y un fallo suyo lo saca | Ninguna lo hace. **Cuando la asistente lo use hará falta un permiso PROPIO para mandarlo al proveedor del modelo**: tener el perfil guardado no es permiso para enviarlo | `perfil_personal_test.sql` (busca el nombre de la tabla en el código de todas las funciones; ninguna vista ni política de otra tabla depende de ella) |
| **I**nfo disclosure | Se guarda sin consentimiento | El trigger no deja guardar nada que no esté vacío sin `consent_version` (P0001, pista `consentimiento_perfil`); la fecha del permiso la pone el servidor y no se puede escribir; el permiso es PROPIO, distinto del de salud | `perfil_personal_test.sql`, `perfil.test.ts` |
| **I**nfo disclosure | No se puede retirar el permiso ni borrar | La persona borra su fila (retirar el permiso es borrar); la RLS solo deja la suya; al borrar la cuenta se va con ella (`on delete cascade`) | `perfil_personal_test.sql` |
| **I**nfo disclosure | El perfil sale en un mensaje de error (PostgREST copia la fila fallida en `details`), en un registro, en una URL o en el disco | `api/perfil.ts` quita `details` antes de que el error llegue a `describeDbError`; no se escribe en ningún `console.*`, URL, ruta ni almacenamiento; la caché es memoria y se vacía al cambiar de persona | revisión del código; **sin test automático** del «no sale» (pendiente) |
| **T**ampering | Valores que no son de las listas, o enormes | CHECK de listas cerradas con tope; una cosa no puede estar en «me gusta» y «no me gusta» a la vez; el trigger deja las listas sin repetidos y ordenadas | `perfil_personal_test.sql` |
| **T**ampering / **E**levation | **Texto libre con instrucciones** (los «productos concretos» pueden acabar algún día en una petición a un modelo): marcado, llaves, comillas inversas, caracteres de control, de formato (dirección, ancho cero) o las «etiquetas» U+E0000 que no se ven | El trigger rechaza todo eso (22023, «Escribe solo el nombre del producto, de 2 a 40 caracteres.»), recorta, quita repetidos sin distinguir mayúsculas y limita a 10; la app aplica la misma regla antes de mandar (`limpiarProducto`) y vuelve a limpiar lo que lee (`leerPerfil`). **Lo libre se trata siempre como dato, nunca como instrucción** | `perfil_personal_test.sql` (las entradas hostiles: marcado, llaves, comillas inversas, control, dirección, ancho cero y etiquetas), `perfil.test.ts` (incluye el BOM, que el `\s` de JavaScript se comía) |
| **E**levation | Reescribir la identidad de la fila (`user_id`) o escribir la de otra persona | Sin permiso de UPDATE sobre `user_id`; la RLS comprueba `user_id = auth.uid()` en el INSERT y en el UPDATE; la app hace UPDATE y luego INSERT, no `upsert` | `perfil_personal_test.sql` (42501) |
| **I**nfo disclosure | Un perfil de antes del permiso (no hay: la tabla es nueva), o de una versión vieja del aviso, se sigue usando | `perfilEfectivo`: sin permiso vigente no se usa nada. Solo lo comprueba el cliente (el servidor exige que haya versión, no cuál) | `perfil.test.ts` |

**Lo que no cubre:** no hay opciones religiosas (halal, kosher) a propósito, porque serían otra categoría especial. Nada recomienda con el perfil todavía, así que no hay riesgo de que una recomendación lo
filtre; ese riesgo nace cuando se use. Nada se ha probado en un móvil real.

## 10 · El chat de Opsi: la asistente (`opsi-chat`)

Una Edge Function (`supabase/functions/opsi-chat`, lógica en `_shared/chat.ts`, `herramientas.ts`, `modelo.ts` y `saneo.ts`), la tabla `chat_usage` y la función `use_chat_quota` (migración
`20261026100000`). Es la parte del proyecto donde datos de la persona **salen hacia un tercero** (el proveedor del modelo, hoy Ollama Cloud en desarrollo) y donde lo que ESCRIBE cualquiera
(nombres de productos, notas) **lo lee un modelo**. Este documento exigía esta tabla antes de construirla; llegó después, y esta sección salda esa deuda.

**Flujo:** la app manda la conversación (los últimos 20 mensajes) con el token de la persona → la función **verifica la sesión** → valida la forma → **gasta un mensaje de la cuota** → llama al
modelo → si el modelo pide una herramienta (`ver_inventario`, `ver_lista_compra`; **solo lectura**), la ejecuta con **el token de la persona** (RLS, sin clave de servicio) y le devuelve el
resultado como DATO → devuelve texto plano. Cada paso solo corre si pasó el anterior, así que lo inválido no gasta ni cuota ni modelo.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **S**poofing | Usar el chat sin sesión, con un token anónimo o de otro rol | `verificarUsuario`: `auth.getUser(token)` con rol `authenticated` y sin `is_anonymous`; sin cabecera `Authorization` válida, 401 **antes** de leer el cuerpo, validar, gastar cuota o tocar el modelo | `chat.test.ts` (sin sesión, sin cabecera, método y tamaño) |
| **S**poofing | Gastar la cuota de otra persona | `use_chat_quota()` saca quién es de `auth.uid()` (la sesión), **nunca de un argumento** | `cuota_chat_test.sql` (Jon no paga lo de Inés; sin sesión, 28000) |
| **T**ampering | La persona falsifica turnos de «opsi» en la conversación que manda | La conversación la manda el cliente y se trata como entrada no confiable: forma, 20 mensajes, 500 caracteres, el último de la persona, y el modelo no gana ninguna autoridad por lo que ponga en ellos. **Solo se perjudica a sí misma**: no hay herramientas que escriban | `chat.test.ts` (`validarConversacion`) |
| **T**ampering | **Inyección indirecta:** un nombre de producto o de lista —escrito por otra persona de una nevera compartida, o traído de Open Food Facts— contiene una orden y el modelo la obedece | (1) **Las herramientas solo leen**: el peor caso es una respuesta engañosa para quien pregunta, no un cambio de datos; (2) corren con la sesión de la persona (RLS); (3) **los nombres se limpian antes de llegar al modelo** (`sanearDato`: sin las «etiquetas» U+E0000 que codifican texto invisible, sin marcas de dirección, ancho cero ni control; 80 caracteres); (4) el resultado va marcado como `datos` y las instrucciones dicen que dentro de un dato no hay órdenes; (5) las instrucciones prohíben afirmar que algo «está bueno» y dar consejo de salud | `chat.test.ts` (un nombre con texto escondido llega limpio; un nombre largo llega acotado), `saneo.test.ts` (10) |
| **T**ampering | El modelo (o un dato inyectado) hace que la respuesta enseñe algo distinto de lo que contiene: dirección invertida, caracteres invisibles | `limpiarRespuesta` quita control, formato, dirección y «etiquetas», conserva los saltos de línea y acota a 1500 caracteres; la app lo pinta como texto plano (sin marcado) y `selectable` | `chat.test.ts` (`limpiarRespuesta`) |
| **R**epudiation | No hay registro de qué se preguntó | **A propósito**: el log guarda solo el evento y el recuento de mensajes, nunca el texto de la persona ni el del modelo; `chat_usage` apunta cuándo, no qué. Se acepta | `chat.test.ts` (el motivo del proveedor y la pregunta no salen) |
| **I**nfo disclosure | **Datos de salud o del perfil llegan al proveedor** | Las herramientas solo leen `inventory_with_priority` y `shopping_list_items`: **ni las preferencias de salud (`user_health_preferences`), ni el perfil (`user_profile`), ni la nutrición** están al alcance, y la RLS de las dos primeras es solo de su dueña, así que ni con una herramienta nueva por error las leería otra persona. **Antes de darle al modelo cualquiera de ellos hace falta un permiso propio para enviarlo** (tener el dato guardado no lo es) | `chat.test.ts` (guarda de código: `opsi-chat/index.ts` no nombra esas tablas) |
| **I**nfo disclosure | Lo que sale hacia el proveedor: los últimos 20 mensajes y, cuando el modelo lo pide, nombres, cantidades y fechas del inventario y la lista | La pantalla lo dice a la vista («Lo que escribas aquí se envía a un servicio de IA para contestarte»); `docs/PRIVACIDAD.md` lo recoge con el proveedor. **Antes de producción:** contrato de encargado con el proveedor, región, y que no conserve ni entrene con lo enviado | **pendiente** (`PENDIENTES.md`, 🔴) |
| **I**nfo disclosure | Ver lo de otra persona o de otra nevera | Sin clave de servicio: cada consulta va con el token de quien pregunta y la RLS decide. No hay filtro de hogar en la herramienta, a propósito: si hiciera falta, sería señal de que la RLS falla | `rls_isolation_test.sql` (la RLS de `inventory_with_priority` y de la lista) |
| **I**nfo disclosure | El error del proveedor o del servidor revela la pregunta, la clave o el motivo | 502/503 genéricos; el motivo del proveedor no sale; la clave (`OLLAMA_API_KEY`) vive solo en el entorno de la función | `chat.test.ts` |
| **D**oS / coste | **Una persona (o un bucle) gasta sin límite**: cada mensaje cuesta | **Cuota por persona** (`use_chat_quota`: 20 por hora y 100 al día), gastada **después** de validar y **antes** del modelo; 429 con `Retry-After`. **Si no se puede comprobar la cuota, no se contesta** (503): gastar sin límite es peor que fallar. Además, por petición: cuerpo 16 KB, 20 mensajes, 500 caracteres, 4 rondas de herramientas, 1500 de respuesta y un tiempo máximo del modelo | `chat.test.ts` (429, mínimo 1 s, falla cerrado, lo inválido no gasta, 403 sin Premium), `cuota_chat_test.sql` |
| **D**oS / coste | Saltarse la cuota borrándola, escribiéndola o llamando a la función por otro lado | La tabla **no concede ningún permiso a nadie** (ni `authenticated` ni `service_role`) y la función es la única que la toca; `anon` no la ejecuta; la RLS está puesta y sin políticas | `cuota_chat_test.sql` (permisos, borrar, escribir, leer) |
| **D**oS / coste | Dos mensajes a la vez de la misma persona se cuelan entre sí | `pg_advisory_xact_lock` por persona dentro de la función: se espera el turno | revisión (**sin test de carrera**) |
| **E**levation | La asistente cambia datos (apunta, gasta, tira) por una orden inyectada | **Hoy no puede**: no tiene herramientas de escritura y las instrucciones lo dicen. **Antes de dárselas:** cada escritura con confirmación explícita de la persona en la app (nunca ejecutada solo por el modelo), llamando a las mismas funciones de la base de datos que la app, con su sesión, y repasar esta sección entera: con escritura, la inyección indirecta deja de ser un engaño y pasa a ser un cambio de datos | `chat.test.ts` (las reglas que no se negocian) |

**Lo que no cubre:**
- **No hay tope global**: la cuota es por persona. Una racha de cuentas nuevas gastaría hasta el límite de cada una; el proveedor tiene que tener un tope de gasto propio. **El alta no está cerrada** (cualquiera puede crear una cuenta, con nombre de usuario), así que ese tope del proveedor es el único freno al gasto total.
- **Un modelo puede ignorar las instrucciones.** Por eso la defensa real es que las herramientas son de solo lectura, no que el texto diga «no obedezcas».
- **Nada de esto se ha probado en un móvil ni con tráfico real.** La cuota sí: con pgTAP real y, para el candado por persona, con dos sesiones a la vez (`npm run db:carreras`, escenario E).
- **El chat es de Premium** (migración `20261027100000`): lo decide `use_chat_quota` en la base de datos (42501 con pista `premium`) y `opsi-chat` contesta 403 `solo_premium` antes de llamar al modelo y sin gastar cuota. Es una decisión de coste, no de seguridad; el candado de la app solo evita enseñar un cuadro de escribir que no va a funcionar.

---

## 8 · Nutrición de los productos (Opsi Premium ⭐)

Una tabla nueva (`product_nutrition`), una función de lectura (`nutrition_of_products`) y una de escritura
(`upsert_product_nutrition`), en `20261024100000_nutricion` (D-49). `lookup-barcode` la guarda pero **no la devuelve**.
Nutri-Score, grupo NOVA, valores por 100 g o 100 ml, semáforos, ración y aditivos de un producto del catálogo global,
de Open Food Facts. **El plan lo decide el servidor**: ocultar la pantalla no es una puerta.

**Flujo:** `lookup-barcode` consulta OFF → `normalizarNutricion` filtra → guarda la ficha (`upsert_global_product`) y justo
después su nutrición (`upsert_product_nutrition`, que lo revalida todo; si ésta falla se registra y el escaneo sigue) → responde **sin** nutrición. La app, si la persona
es premium, la pide con `nutrition_of_products(ids)`. Sin plan, la función da 42501 con pista `premium` y un `select` directo
a la tabla da cero filas: son dos candados independientes (la función es SECURITY INVOKER, así que la RLS sigue por debajo).

**Por qué una tabla aparte y no columnas en `products`:** `products` la lee cualquier persona con sesión. Cerrar unas columnas
exigiría pasar `products` a permisos de columna, uno a uno: cada columna nueva nace cerrada (o, si se olvida, un permiso de tabla
la abre) y cada `select *` del código falla entero. La RLS filtra filas, no columnas. Una tabla propia se cierra con RLS por plan
en un solo sitio, y `products` no cambia. Además la **fila es la marca** de «se consultó OFF»: sin fila no consta; fila con todo
NULL = OFF no declara nada. «Sin datos» nunca es cero.

| STRIDE | Amenaza concreta | Mitigación | Dónde se prueba |
|---|---|---|---|
| **E**levation | Leer la nutrición sin ser premium: un `select` directo a la tabla o la función | Candado 1, RLS: `select` solo si `my_plan() = 'premium'` (sin plan, **0 filas**). Candado 2, `nutrition_of_products`: comprueba el plan **antes de leer nada** (42501, pista `premium`, el mismo mensaje que `my_known_products`). Probado quitando cada uno por separado: el test falla | `nutricion_test.sql` (E: Bruno básico no lee por ninguna de las dos vías; Ana premium sí) |
| **E**levation | Ponerse premium desde la app para leerla | Ningún permiso de columna concede `plan`; sin fila de ajustes cuenta como básico. El plan se lee en cada consulta: si baja de plan, deja de leer en la misma sesión | `nutricion_test.sql` (E), `listas_premium_test.sql` |
| **S**poofing | Llamar a la función o leer la tabla sin sesión, con la `anon key` | `anon` sin EXECUTE ni ningún permiso de tabla o de columna; `service_role` tampoco ejecuta la función de lectura | `nutricion_test.sql` (A, E), `privilegios_test.sql` |
| **I**nfo disclosure | `lookup-barcode` devuelve la nutrición a todo el mundo: la función no mira el plan | **No la devuelve.** `publico()` copia campo a campo; el booleano con el que decide la caducidad (`nutrition_data`) tampoco sale; `buscarEnCatalogo` pide solo la fecha del embed | `lookup.test.ts` (una fila con nutrición pegada de varias maneras no llega a la respuesta; la ficha recién traída de OFF tampoco), `fn:check` (la respuesta real no lleva ni una palabra de nutrición) |
| **I**nfo disclosure | La nutrición se cuela en `products.off_payload`, que lee cualquiera | `payloadDeOrigen` **nombra** los campos que guarda en vez de quitar los que sobran: un campo nuevo no entra solo | `off.test.ts` |
| **I**nfo disclosure | La clave `service_role` (que vive en la Edge Function) saca los valores | `service_role` solo lee `product_id` y `nutrition_data_at` y ejecuta `upsert_product_nutrition`, que no devuelve nada. Sin SELECT de tabla ni de ninguna otra columna (tampoco las futuras) | `privilegios_test.sql`, `nutricion_test.sql` (A, E) |
| **T**ampering | Una persona de una nevera escribe nutrición falsa en un producto **privado** («0 g de azúcar») para que sus compañeras la vean | Nadie con sesión tiene permiso de escritura sobre la tabla (ni de columna). Un trigger (`check_nutrition_product`) rechaza cualquier fila cuyo producto sea privado o no exista, **también escribiendo como `postgres`**. `products` no tiene columnas de nutrición a las que agarrarse. Un producto no cambia de nevera (`forbid_household_change`) | `nutricion_test.sql` (C, F). Probado quitando el trigger: el test falla |
| **T**ampering | La caché global se envenena (OFF lo edita cualquiera): valores imposibles, textos con marcado o instrucciones, listas enormes | **Tres filtros.** `off.ts`: solo un `number` finito dentro de rango (si no, ese campo a NULL y la ficha se conserva), listas cerradas para Nutri-Score, NOVA y semáforos, textos limpios, ración de ≤ 60 sin recortar, aditivos con formato exacto (`en:e` + 3 o 4 cifras + hasta 4 letras, para `en:e330`, `en:e150d` y subformas como `en:e331iii`). `upsert_product_nutrition` lo revalida todo (22023). Los CHECK de la tabla (23514) son el último cerrojo | `off.test.ts` (campos fuera de rango, de otro tipo, NaN, Infinity, textos de megabytes, 100 000 aditivos), `nutricion_test.sql` (B y D: cada rango, lista, formato y par; la función da 22023 y la tabla 23514, así que si falta una comprobación de la función el test lo nota) |
| **T**ampering | Una ficha incoherente hace pasar un producto por sano (más saturadas que grasas, más azúcares que hidratos, 1000 kcal por 100 g) | Rangos (energía 0–950, el resto 0–100) y dos pares coherentes con 0,5 g de margen. En la Edge Function el par que se contradice se descarta **entero** (los dos valores a NULL), no se «arregla» ninguno | `off.test.ts`, `nutricion_test.sql` |
| **T**ampering | **Un falso cero**: «sin datos» se lee como 0 g de azúcar o 0 aditivos | Todo es NULL-able y nada se rellena con 0 (`numeroEnRango` devuelve null, no 0; y un positivo que al redondear a dos decimales queda en 0, como una sal de 0,004 g, también es null: un 0 significa «OFF declara cero»). La fila es la marca de «se consultó»: sin fila = no consta; fila con todo NULL = OFF no declara nada; un NULL suelto = ese dato no consta. `nutrition_of_products` no devuelve filas de lo que no consta. **Aditivos:** OFF los saca de los ingredientes, así que una lista vacía de una ficha sin ingredientes no dice «sin aditivos». `lookup-barcode` guarda `additives_tags = NULL` (no se sabe) si no es una lista, si es vacía y la ficha no trae ingredientes, o si trae algo pero nada con formato válido; `{}` solo si la lista viene vacía CON ingredientes. Aun así la app nunca afirma «sin aditivos» | `off.test.ts` (`aditivosDeLaFicha` y la ficha completa: con y sin ingredientes), `nutricion_test.sql` (D y G: NULL y `{}` se guardan distintos) |
| **E**levation | El texto de OFF (la ración) se interpreta como marcado, enlace o instrucción | Texto plano, con tres filtros (como los ingredientes): `off.ts` quita todo `\p{C}` (control, formato, bidireccionales, ancho cero, uso privado, «etiqueta») y `<` `>`; la función SQL y el CHECK de la tabla rechazan una **clase ampliada** (la antigua de `upsert_global_product` más U+061C, U+180E, U+FFF9 a U+FFFB, el uso privado U+E000 a U+F8FF y los caracteres «etiqueta» U+E0000 a U+E007F, con los que se esconde texto invisible), escrita con escapes. Una ración que no cabe en 60 caracteres es NULL, no un recorte. En el prompt del chat (fase 5) irá encapsulada | `off.test.ts`, `nutricion_test.sql` (B y D: los extremos de cada rango nuevo, rechazados en la función y en el CHECK, y los vecinos de fuera, aceptados); **no probado** el encapsulado (fase 5) |
| **D**oS | Una ficha sin fila de nutrición se renueva en cada escaneo y agota la cuota hacia OFF | Cuenta como caducada y se renueva **una vez**: aunque OFF no declare nada se guarda la fila (todo NULL). Esto vale también cuando OFF ya no devuelve el producto (`no_existe`) o dice que no es comida: si la ficha del catálogo no tiene su fila, se deja la marca vacía («consultado y sin datos») y se sigue sirviendo la ficha como hasta ahora. Con un **error** de OFF (red, tiempo, 5xx) no se marca nada: eso se reintenta; y sin hueco o sin User-Agent tampoco, porque no se consultó. Siguen la cuota por persona (30/min, 500/día) y el hueco global (10/min) | `lookup.test.ts` (cada rama, y que con un error de OFF no se escribe), `fn:check` (la ficha sin fila sale como `cache_vieja` en el registro del runtime real) |
| **D**oS | Pedir la nutrición de miles de productos de golpe | Un solo POST de RPC con 200 ids como máximo (22023 si es más, o si el array es nulo), tras comprobar el plan | `nutricion_test.sql` (E) |
| **D**oS | Un fallo de la nutrición (red, base de datos) tumba el escaneo, que es la función central: la nutrición es solo un extra de Premium | **No lo tumba.** Si `upsert_product_nutrition` falla tras guardar la ficha, `manejar` lo captura, lo registra con el resultado `nutricion_error` (solo el nombre del error y su mensaje cortado a 200 caracteres: nunca la fila, los datos de OFF ni el código de barras) y devuelve igualmente la ficha, con un 200. Sin fila de nutrición cuenta como caducada, así que la próxima vez que se escanee se reintenta. Nada queda a medias de forma que parezca «consta». Un fallo al guardar la **ficha** sí sigue siendo un 500 genérico | `lookup.test.ts` (200 con la ficha, el evento `nutricion_error` sin datos, errores que no son `Error`, y el reintento en el escaneo siguiente) |

**Lo que no cubre:**

- El `off_payload` de un producto **privado** lo escribe cualquier miembro de su nevera (es una columna de `products`) y puede llevar lo que quiera,
  también cifras que parezcan nutrición. Es inofensivo mientras nadie lo lea como tal: **la app solo lee la nutrición por
  `nutrition_of_products`**, nunca de `off_payload` ni de ninguna otra parte.
- Lo premium depende de quién puede escribir `user_settings.plan`: hoy solo quien tiene la base de datos. Cuando haya pago, la función que
  reciba el aviso del proveedor pasa a ser la llave de todo esto y habrá que modelarla.
- Lo que una persona premium ya ha leído y guardado en su móvil (la caché de la app, en memoria) no se retira si baja de plan.
- No se comprueba la coherencia entre nutrientes más allá de los rangos y los dos pares (grasas + hidratos + proteínas por encima de 100,
  o una energía que no cuadra con los macros, pasan).
- La diferencia entre `additives_tags = NULL` («no se sabe») y `{}` («OFF analizó los ingredientes y no declara ninguno») la decide solo la Edge Function,
  que es quien conoce los ingredientes: la base de datos guarda lo que llega y no la comprueba. Y `{}` sigue siendo lo que OFF declara, no una garantía:
  la app no afirma «sin aditivos». La lista de aditivos es de todo o nada: un solo elemento con formato inválido, o más de 60, la dejan en NULL (una lista
  parcial o truncada daría un recuento menor que el real).
- Lo mismo con el redondeo: un valor positivo que al redondear a dos decimales queda en 0 (una sal de 0,004 g) lo guarda la Edge Function como NULL, porque
  un 0 significa «OFF declara cero». La base de datos **no lo impone**: guarda el 0,00 que le llegue.
- **Deuda (a `PENDIENTES`):** la clase de caracteres prohibidos de `upsert_global_product` (nombre, marca e ingredientes, migraciones antiguas) es la débil, sin
  los rangos que aquí se añaden (U+061C, U+180E, U+FFF9 a U+FFFB, uso privado y «etiqueta»), y es más estrecha que el `\p{C}` de `off.ts`. Queda sin tocar.
  El filtro de la Edge Function sí los quita, pero la base de datos no los rechazaría si ese filtro fallara.
- **Despliegue:** la migración `20261024100000_nutricion` tiene que estar aplicada **antes** que la nueva versión de `lookup-barcode`. `buscarEnCatalogo` hace
  el embed `product_nutrition(nutrition_data_at)` en el camino crítico del escáner: sin la tabla, todos los escaneos darían 500.
- `basis` (g o ml) se deduce de la familia de unidades del producto; si se desconoce es NULL aunque haya valores. Nada de esto se ha probado con un
  móvil real ni con una llamada real de la función a OFF desde el runtime de producción.

---

## Lo que este documento todavía no cubre

`daily-digest` (fase 3) y `parse-receipt` (fase 6) no tienen tabla STRIDE. La segunda es de las de más
riesgo —los tickets llevan datos personales— y **no se construye sin su tabla aquí primero**. El chat
(`opsi-chat`) ya la tiene, en el §10; **le toca repasarla antes de cualquier herramienta que escriba**. Los controles previstos están en
[`internal/AUDITORIA-2026-09-24.md`](internal/AUDITORIA-2026-09-24.md), secciones P3 a P5.
