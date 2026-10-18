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
| **E**levation | Escribir el catálogo global desde el cliente | Imposible por diseño: `is_household_member(NULL)` es falso, así que ninguna política de escritura admite filas globales. `service_role` solo **lee** `products` y **ejecuta** cinco funciones; ni `anon` ni `authenticated` ejecutan ninguna | `privilegios_test.sql`, `escaner_test.sql` |
| **E**levation | El contenido de OFF (nombres, marcas) se interpreta como instrucción cuando llegue al chat | Nunca se interpola en un prompt: se pasa como datos, recortado y sin saltos de línea. Los filtros de arriba ya quitan lo que sirve para esconder una instrucción (saltos de línea, caracteres de control y direccionales), pero **el encapsulado en el prompt se hace en la fase 5** | no probado (fase 5) |

### Ficha del endpoint

- **Nombre:** `lookup-barcode`
- **Tipo:** Edge Function (Deno)
- **Método y ruta:** `POST /functions/v1/lookup-barcode`, cuerpo `{ "barcode": "<8–14 cifras>" }`, máximo 1 KB (también `OPTIONS`, para el preflight de la versión web)
- **Autenticación:** JWT de una persona con sesión, **verificado dentro de la función**
- **Autorización:** cualquier persona autenticada puede consultar el catálogo; nadie puede escribir en él excepto la propia función, y solo por `upsert_global_product`
- **Entrada validada:** solo cifras, 8, 12, 13 o 14 de ellas, dígito de control GS1 correcto, y no una cadena de ceros. Además, **solo comida**: un EAN-13 con prefijo de revista, libro, recibo o cupón (977–984 y 990–999) contesta «no es comida» sin gastar cuota ni preguntar a nadie, y un código que OFF dice que es de otra base (cosmética, mascotas, otros productos) también
- **Salida:** `{ "found": true, "product": { id, barcode, name, brand, unit_family, net_quantity, image_url, source: "openfoodfacts" } }` o `{ "found": false, "barcode": "…" }` (con `"not_food": true` si no es comida). Nunca el `off_payload`. Errores: `{ "code", "message" }` con 400, 401, 405, 413, 429 (con `Retry-After`), 500 o 503
- **Límites:** 30/min y 500/día por persona; 10/min globales hacia OFF; timeout 4 s; respuesta de OFF ≤ 256 KB
- **Riesgos:** SSRF, envenenamiento de la caché, abuso de cuota, filtrado de errores, entrada no confiable hacia el modelo
- **Controles en servidor:** los de la tabla de arriba
- **Secretos:** `OFF_USER_AGENT` (nombre de la app y un contacto **real**; el valor de ejemplo se rechaza) en el entorno de la función. La clave de servicio la inyecta Supabase y no sale de ahí
- **Tests automatizados:** `npm run test:funciones` (67, sin Deno ni red), `npm run db:test` (`escaner_test.sql`, 60), `npm run db:carreras` y `npm run fn:check` (21, en el runtime de Edge Functions de verdad)
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
| **T**ampering | Colgar una línea de la lista de OTRA nevera (quien está en dos neveras) | `check_shopping_item` exige que la lista sea de la misma nevera que la línea, al crear y al mover | `listas_premium_test.sql` (P0002) |
| **E**levation | Crear o renombrar una lista en la nevera de otra persona, o cambiarla de nevera | RLS por `is_household_member`; el permiso de UPDATE es solo `name` y el de INSERT solo `household_id` y `name` | `listas_premium_test.sql` (42501) |
| **S**poofing | Crear una lista «de parte de» otra persona | El trigger pisa `created_by` con `auth.uid()` | `listas_premium_test.sql` |
| **D**oS | Acumular listas sin límite | Tope por nevera: 3 con el plan básico, 20 con premium, según quien la **crea**. El de 20 es una red, no un valor de venta | `listas_premium_test.sql` |
| **D**oS | Quedarse sin ninguna lista | El trigger no deja borrar la última. El borrado en cascada de una nevera entera sí pasa (se mira que la nevera ya no exista) | `listas_premium_test.sql` |
| **E**levation | `create_default_list` (definer) escribe donde la RLS no dejaría | Solo se dispara al nacer una nevera y solo inserta una fila con **su** id y un nombre fijo; sin permiso de ejecución para nadie | `listas_premium_test.sql` (la nevera nace con su lista) |

**Lo que no cubre:** los dos topes (listas y líneas) cuentan filas dentro del trigger, así que dos inserciones
**simultáneas** pueden pasarse por una; no se ha probado con dos sesiones. Un fallo del servidor de pagos —que
no existe todavía— es lo primero que habrá que modelar cuando se añada: quién puede decir «esta cuenta es
premium», y con qué comprobación.

---

## Lo que este documento todavía no cubre

`daily-digest` (fase 3), `opsi-chat` (fase 5) y `parse-receipt` (fase 6) no tienen tabla
STRIDE. Las dos últimas son las de más riesgo —el chat escribe sobre el inventario con
el token de la persona, y los tickets llevan datos personales— y **no se construyen sin
su tabla aquí primero**. Los controles previstos están en
[`internal/AUDITORIA-2026-09-24.md`](internal/AUDITORIA-2026-09-24.md), secciones P3 a P5.
