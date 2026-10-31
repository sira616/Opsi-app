# Inventario de superficie

Qué hay expuesto, a quién, y con qué control. Es la tabla que la lista de seguridad
(§2) pide mantener viva. **Está comprobada**: `npm run db:check` falla si una tabla,
vista o función pública de `supabase/migrations/` no aparece aquí con su nombre entre
comillas inversas. No es un documento que se pueda olvidar actualizar; se olvida una
vez, la CI se pone en rojo y se arregla.

> La regla de oro de la lista: lo que el front oculta no es seguridad. Cada fila de
> aquí dice qué lo protege **en el servidor**.

Quién añade una ruta, tabla, función, Edge Function, cola o integración, añade su fila en
la misma PR (§22 de la lista). El modelo de amenazas por funcionalidad está en
[`threat-model.md`](threat-model.md).

## Roles

| Rol | Quién es | Qué puede |
|---|---|---|
| `anon` | Cualquiera con la `anon key` (va en cada binario) | Casi nada: solo ejecutar `dominio_sintetico()`. Ninguna tabla, vista ni otra función |
| `authenticated` | Una cuenta con sesión | Lo que dicen las filas de abajo, siempre acotado por RLS a sus neveras |
| `service_role` | Solo las Edge Functions, en el servidor | Salta la RLS. Nunca sale del servidor. Sus permisos de tabla se reducen a **leer** `products` y **dos columnas** de `product_nutrition` (`product_id` y `nutrition_data_at`: saber si una ficha ya tiene su nutrición, no cuál es); escribe solo ejecutando seis funciones concretas (comprobado en `privilegios_test.sql`, `escaner_test.sql` y `nutricion_test.sql`) |
| `postgres` | Migraciones y seeds | Dueño de todo |
| *dueño* / *miembro* | El papel de una persona **dentro de una nevera** (`household_members.role`) | El dueño invita, echa, traspasa y renombra |

## Pantallas (app)

La protección de las rutas es solo comodidad: si alguien se salta el guard, sigue sin
poder leer una fila (lo decide la RLS). Ver «Lo que el cliente NO garantiza» al final.

| Ruta | Guard | Qué enseña |
|---|---|---|
| `/entrar`, `/crear-cuenta` | Públicas | Login y alta |
| `/` | — | Redirige según haya sesión |
| `(app)/(tabs)/inventario` | Sesión | «Consumir primero» de la nevera activa |
| `(app)/(tabs)/ajustes` | Sesión | Perfil, aspecto, avisos, mis neveras, cuenta, privacidad |
| `(app)/(tabs)/lista` | Sesión | Las listas de la compra de la nevera activa |
| `(app)/productos` | Sesión | Tus productos ⭐: almacén con buscador, filtro (escaneados / a mano) y una ficha por producto, desde la que se guarda en la nevera que se elija o se apunta en una o varias listas de ella. Premium lo decide el servidor |
| `(app)/gastos` | Sesión | Lo que más gastas ⭐, entero: la pestaña de Premium enseña cinco y esta pantalla la lista completa. Premium lo decide el servidor |
| `(app)/chat` | Sesión | La pantalla del chat de Opsi ⭐ (solo Premium: con el plan básico enseña un candado). La conversación vive en memoria y **sale a un proveedor de IA** (`opsi-chat`). Las **propuestas** del modelo (apuntar, guardar, gastar, tirar) se enseñan en tarjetas con «Sí» y «No» y **solo con el «Sí»** las ejecuta la app, con la sesión de la persona y por las funciones de siempre; el modelo no escribe. `?mensaje=` solo rellena el cuadro de escribir (limpiado), nunca lo envía |
| `(app)/perfil` | Sesión | Tu perfil personal (opcional, dato sensible): pide el permiso antes de enseñar nada que rellenar, guarda cada toque y borra todo con confirmación. Solo lo ve su dueña; **hoy nada recomienda con él** |
| `(app)/(tabs)/premium` | Sesión | Pestaña de Opsi Premium ⭐ (donde estaba el chat): color de la app, tus productos y lo que más gastas. Lo premium lo decide el servidor; la pantalla solo enseña candados |
| `(app)/alta` | Sesión | Alta en la nevera activa, a mano o con los datos de un producto escaneado |
| `(app)/escanear` | Sesión | Cámara para leer un código de barras, con entrada a mano como alternativa |
| `(app)/ticket` | Sesión | Leer un ticket ⭐ (solo Premium): avisa de que la foto **sale a un proveedor de IA** y no se guarda, hace la foto, enseña lo leído en una **revisión editable** y solo guarda al confirmar. Sin cámara en el navegador |
| `(app)/elemento/[id]` | Sesión | Detalle y acciones de un elemento |
| `(app)/editar-elemento/[id]` | Sesión | Corregir un elemento que no esté cerrado |
| `(app)/cambiar-nevera` | Sesión | Selector de nevera |
| `(app)/nevera/nueva`, `nevera/[id]`, `nevera/[id]/editar` | Sesión | Crear, gestionar y renombrar una nevera |

## Base de datos

### Tablas y vistas

`authenticated` accede solo a las filas de sus neveras. Las columnas de permisos son lo
que **puede intentar**; la RLS decide además **sobre qué filas**.

| Recurso | Tipo | Lo que `authenticated` puede intentar | Control en el servidor |
|---|---|---|---|
| `households` | Tabla | Leer las suyas | RLS por `is_household_member()`. Sin INSERT/UPDATE/DELETE: todo pasa por funciones |
| `household_members` | Tabla | Leer | RLS. Sin escritura: las pertenencias las escriben solo las funciones |
| `household_invitations` | Tabla | Leer las suyas | RLS. Sin escritura directa |
| `household_invite_attempts` | Tabla | **Nada** (ni leer) | Sin política ni permiso: solo la usa `invite_to_household()`. No guarda el nombre probado |
| `household_icons` | Tabla | Leer | Lista cerrada de 16 iconos, solo lectura |
| `inventory_items` | Tabla | Las cuatro | RLS por nevera. Un trigger impide mover un elemento a otra nevera |
| `inventory_events` | Tabla | Insertar y leer | **Inmutable**: sin UPDATE ni DELETE por permisos Y por RLS |
| `inventory_with_priority` | Vista | Leer | `security_invoker = true`: aplica la RLS del que pregunta |
| `products` | Tabla | Las cuatro sobre los **privados** | `household_id` NULL = catálogo global: nadie con sesión lo escribe; `service_role` solo lo lee y lo escribe vía `upsert_global_product()`. Los datos de salud de la ficha (`allergens_tags`, `traces_tags`, `labels_tags`, `ingredients_text`, `health_data_at`) existen **solo en el global**: el CHECK `products_health_global_only_ck` impide que un producto privado traiga uno, para que un miembro de la nevera no pueda falsear un «sin alérgenos» ante sus compañeros; `health_data_at` NULL = «no consta», que no es lo mismo que «OFF no declara nada». La **nutrición no está aquí** (la leería cualquiera): vive en `product_nutrition`, y el `off_payload` no la lleva |
| `user_health_preferences` | Tabla | Leer lo suyo; escribir solo `avoid` y `consent_version` (`insert (user_id, avoid, consent_version)`, `update (avoid, consent_version)`; **nunca `consented_at`**: lo pone el servidor); **borrar solo la propia fila** (retirar el permiso) | **Dato de salud (RGPD, categoría especial).** La RLS (`user_id = auth.uid()`) es la única barrera: no la ve ni la gente de una nevera compartida. **Ningún permiso** para `anon` ni `service_role`, y ninguna función (ni la Edge Function) la lee: el cruce con los productos se hace en el móvil. Lista cerrada de 15 valores y tope (CHECK); un trigger (`normalize_health_preferences`) la deja sin repetidos y ordenada. **Sin el permiso de su dueña (`consent_version`) no se guarda una lista no vacía** (trigger `check_health_consent`, P0001, pista `consentimiento_salud`). Se borra con la cuenta (`on delete cascade`) o a mano |
| `product_nutrition` | Tabla | **Solo leer, y solo con plan premium.** Ninguna escritura (ni de tabla ni de columna) | **Opsi Premium.** Nutri-Score, NOVA, valores por 100 g/ml, semáforos, ración y aditivos de un producto del catálogo **global**, de Open Food Facts. Tabla aparte de `products` (que lee cualquiera) para cerrarla con RLS en un solo sitio. RLS: `select` para `authenticated` solo si `my_plan() = 'premium'` (sin plan, **cero filas**, no un error); sin políticas de escritura. **La fila es la marca de «se consultó OFF»**: sin fila = no consta; fila con todo NULL = OFF no declara nada; un NULL suelto = ese dato no consta (nunca es cero). Solo la escribe `upsert_product_nutrition` (`service_role`); un trigger (`check_nutrition_product`) impide que cuelgue de un producto privado de una nevera o inexistente, también para `postgres`. `service_role` solo lee `product_id` y `nutrition_data_at`. `lookup-barcode` **no** devuelve nutrición: la app la lee por `nutrition_of_products`. Si guardarla falla, `lookup-barcode` lo registra (`nutricion_error`) y devuelve igualmente la ficha: la nutrición no tumba el escaneo. `additives_tags`: NULL = no se sabe (OFF no da la lista, la da vacía de una ficha sin ingredientes, o algún elemento no vale o hay más de 60); `{}` = vacía CON ingredientes. Una ficha del catálogo sin fila a la que OFF ya no devuelve (`no_existe` o «no es comida») recibe una fila vacía («consultado y sin datos») para no renovarse en cada escaneo; con un error de OFF no. **Despliegue:** esta migración va antes que la versión de `lookup-barcode` que la usa (si no, todos los escaneos darían 500) |
| `user_profile` | Tabla | Leer lo suyo; escribir `activity_level`, `diet`, `likes`, `dislikes`, `dislikes_custom` y `consent_version` (`insert (user_id, …)`, `update (…)`; **nunca `consented_at`**: lo pone el servidor); **borrar solo la propia fila** (retirar el permiso) | **Perfil personal opcional, tratado como dato sensible** (ejercicio, dieta, gustos). La RLS (`user_id = auth.uid()`) es la única barrera: no lo ve ni la gente de una nevera compartida. **Ningún permiso** para `anon` ni `service_role`, y ninguna función (ni la Edge Function) lo lee. Listas cerradas, tope en los productos concretos (`dislikes_custom`, texto de la persona: 2–40 caracteres, sin control, formato ni marcado, validado por el trigger). **Sin el permiso de su dueña (`consent_version`, propio y distinto del de salud) no se guarda nada** (trigger `check_user_profile`, P0001, pista `consentimiento_perfil`). Se borra con la cuenta (`on delete cascade`) o a mano |
| `chat_usage` | Tabla | **Nadie** (ni `authenticated`, ni `anon`, ni `service_role`): solo la toca la función `use_chat_quota` | Un mensaje al chat por fila: de quién y cuándo, **nunca el contenido**. RLS puesta y sin políticas. Se borra con la cuenta (`on delete cascade`) y las filas de más de dos días las limpia la propia función |
| `lookup_usage` | Tabla | **Nada** (ni leer) | Contadores del límite de consultas del escáner. Sin política ni permiso para ningún rol: solo la tocan `consume_lookup_quota()` y `consume_off_slot()`. Se purga a los 2 días |
| `ticket_associations` | Tabla | **Leer y borrar las suyas.** Ninguna escritura suelta (ni INSERT ni UPDATE, ni de tabla ni de columna): se escribe por `confirm_ticket_association` y `update_ticket_association` | **Lo que una persona confirmó al revisar un ticket**: texto de la línea normalizado + tienda → nombre, marca, producto y origen. Revela *qué* compra y *dónde*, por eso es **solo suyo** (RLS `user_id = auth.uid()`; no lo ve la gente de su nevera) y la RLS le deja leer y borrar las suyas, pero **la app no tiene pantalla para hacerlo** (se quitó de Ajustes para mantener la app sencilla; 🟠 pendiente antes de producción). Escribir es de Premium; leer, corregir y borrar no dependen del plan. Ningún permiso para `anon` ni `service_role`. Tope de 2000 por persona (sale la más antigua). `product_id` pasa a NULL si el producto se borra, y todo se va con la cuenta (`on delete cascade`). **No hay tabla de tickets ni de líneas**: del ticket solo queda esto y el elemento de inventario |
| `barcode_misses` | Tabla | **Nada** (ni leer) | Caché de códigos que Open Food Facts no conoce. Sin política ni permiso; no guarda quién preguntó. Se purga a los 7 días |
| `shopping_list_items` | Tabla | Las cuatro | RLS **por lista**: una línea se ve y se toca si se ve su lista (individual de la cuenta, o compartida de una nevera de la que se es miembro). Un trigger (`check_shopping_item`) impone lo que la RLS no: `auto_restock` solo si la persona lo encendió, `created_by` siempre quien escribe, **la nevera de la línea es la de su lista (ninguna si es individual)**, producto global o de esa nevera (en una individual, cualquiera que la persona vea), la lista es obligatoria y un tope de 300 líneas por lista |
| `shopping_lists` | Tabla | Leer, borrar, crear (tipo, nevera y nombre) y renombrar | Una lista es **individual** (`kind = 'personal'`, de la cuenta, sin nevera, solo la ve su dueña/o) o **compartida** (`kind = 'shared'`, de una nevera y visible para sus miembros): lo dice la RLS. Un trigger (`check_shopping_list`) pone `created_by` y `owner_id`, impone el **tope por cuenta** (básico: 1 compartida + 1 individual; premium: 5 en total) y no deja borrar la última individual (sí en el borrado en cascada de la cuenta). Una lista no cambia de tipo ni de nevera (el permiso de UPDATE es solo el nombre) |
| `user_settings` | Tabla | Leer lo suyo; escribir **columna a columna** | `household_limit`, `username` y **`plan`** no son editables (ningún permiso de columna los concede); el color (`accent`) sí, pero todos menos el verde exigen `plan = premium` (trigger `check_accent`); zona horaria validada por trigger |
| `category_shelf_life_reference`, `open_shelf_life_reference` | Tabla | Leer | Referencias de solo lectura |

### Funciones que puede llamar una persona con sesión

Se llaman por RPC (`supabase.rpc`). `anon` no puede ejecutar ninguna.

| Función | Modo | Qué autoriza en el servidor |
|---|---|---|
| `create_item` | invoker | Que la nevera pedida sea de quien llama, y que el producto enlazado (si lo hay) sea del catálogo global o de esa misma nevera |
| `update_item` | invoker | Corregir un elemento (nombre, pasillo, sitio, fecha y, **solo sin abrir**, la cantidad) y escribir su evento `updated` con lo de antes y lo de ahora, en una transacción. Bloquea la fila, pasa por la RLS (lo de otra nevera «no existe») y rechaza lo cerrado. No toca el estado, la nevera ni el producto |
| `stock_from_list` | invoker | Marca una línea de la lista como comprada y da de alta el elemento, **en una transacción**. Bloquea la línea (dos personas a la vez no crean dos elementos) y la lee con la RLS: una línea de otra nevera «no existe». La nevera sale de la lista si es compartida; una línea de una lista **individual** no tiene nevera y hay que decir a cuál va (`p_household_id`): `create_item` comprueba que sea una de quien llama |
| `open_item`, `use_quantity`, `freeze_item`, `thaw_item`, `finish_item`, `discard_item` | invoker | La RLS del elemento + `require_item()`, que **bloquea la fila** (dos personas a la vez no se pisan) |
| `require_item`, `record_inventory_event` | invoker | Auxiliares de las acciones |
| `shelf_life_for_item` | invoker | La RLS del elemento |
| `today_for_user` | invoker | Lee solo la zona horaria de quien llama |
| `my_plan` | invoker | El plan (`basic` o `premium`) de quien llama, de su propia fila; sin fila, `basic` |
| `my_known_products` | invoker | **Premium** (si no, 42501): la **ficha** de lo que **ha añadido quien llama**, sin repetidos (código y origen —escaneado o a mano—, pasillo, veces, cuánto hay ahora y en qué nevera lo añadió la última vez). Sin nevera (`p_household_id` nulo) junta las de **todas las suyas**; con una, solo esa. No hay tabla: sale de `inventory_items` con su RLS y `created_by = auth.uid()`, así que lo de otra persona o de una nevera ajena no sale |
| `most_used_products` | invoker | **Premium** (si no, 42501): lo que más se ha agotado en una nevera en los últimos días (hasta 200 productos por llamada). Lee con la RLS de quien llama, así que una nevera ajena sale vacía |
| `nutrition_of_products` | invoker | **Premium** (si no, 42501 con pista `premium`, antes de leer nada): la nutrición de hasta 200 productos del catálogo (22023 si el array es nulo o pasa de 200). Un producto sin fila no sale: no consta. Es invoker, así que la RLS de `product_nutrition` sigue aplicándose por debajo: dos candados independientes |
| `my_households` | invoker | Solo las neveras de quien llama |
| `create_shared_household` | definer | Límite de neveras por persona (`household_limit`), con bloqueo para que dos llamadas a la vez no lo superen |
| `update_household` | definer | Solo el dueño; solo nombre e icono, y el icono de la lista cerrada |
| `invite_to_household` | definer | Solo el dueño de una **compartida**; 5 intentos por hora; devuelve como resultado, no como error, lo que depende de la otra cuenta |
| `accept_invitation`, `reject_invitation` | definer | Que la invitación sea **para** quien llama, esté pendiente y en plazo |
| `cancel_invitation`, `remove_household_member`, `transfer_household_ownership` | definer | Solo el dueño de esa nevera |
| `leave_household` | definer | Cualquiera menos el dueño de una con más gente; nunca la privada |
| `household_member_names`, `household_sent_invitations`, `my_pending_invitations` | definer | Solo miembros de esa nevera; leen nombres de OTRAS personas, que `user_settings` no deja leer |
| `is_household_member` | definer | La usa la propia RLS; es definer para no recursar |
| `mi_correo` | definer | Devuelve el correo **real** de quien llama, o nada si todavía usa el sintético. Nunca el de otra persona: lee `auth.users` por `auth.uid()` |
| `dominio_sintetico` | invoker | Es lo único que `anon` puede ejecutar: el cliente necesita el dominio del correo ANTES de tener sesión |

Todas las `definer` fijan `search_path = ''` y sacan la identidad de `auth.uid()`, nunca
de un argumento.

### Funciones internas y triggers

Sin permiso de ejecución para `anon` ni `authenticated`.

| Función | Para qué |
|---|---|
| `check_household_icon`, `check_household_name` | Validan icono y nombre al crear o renombrar |
| `check_user_timezone` | Trigger: rechaza una zona horaria que PostgreSQL no conozca |
| `expire_stale_invitations`, `invitation_status_es` | Caducan invitaciones y las describen |
| `lock_household_limit`, `require_owner_household`, `require_shared_household_member` | Bloqueos y comprobaciones de las funciones de neveras |
| `forbid_household_change` | Trigger: un elemento, una línea de la lista o un producto no se mueven de nevera |
| `handle_new_user` | Trigger de alta: solo admite correos sintéticos, saca el nombre del correo, crea la nevera privada |
| `touch_updated_at` | Trigger de `updated_at` |
| `normalize_health_preferences` | Trigger de `user_health_preferences`: deja `avoid` sin repetidos y ordenado. No lee ninguna tabla |
| `check_health_consent` | Trigger de `user_health_preferences`: pone la fecha del permiso (`consented_at`, que la persona no escribe) y no deja guardar una lista no vacía sin permiso. No lee ninguna tabla |
| `check_nutrition_product` | Trigger de `product_nutrition` (invoker): el producto tiene que existir y ser del catálogo global (23514). Es a la nutrición lo que `products_health_global_only_ck` es a la salud, con un trigger porque un CHECK no mira otra tabla |
| `check_user_profile` | Trigger de `user_profile`: pone la fecha del permiso (`consented_at`, que la persona no escribe), deja las listas sin repetidos y ordenadas, comprueba la forma de los productos concretos y no deja guardar nada sin permiso. No lee ninguna tabla |
| `use_chat_quota` | **SECURITY DEFINER** (`search_path` vacío): **el chat es de Premium** (sin el plan, 42501 con pista `premium` antes de gastar nada) y gasta un mensaje de la cuota de chat de **quien llama** (sale de `auth.uid()`, no de un argumento): 20 por hora y 100 al día. Devuelve `(allowed, wait_s)`. Solo `authenticated` la ejecuta; sin sesión, 28000. Lleva un candado por persona (`pg_advisory_xact_lock`) |
| `ticket_associations_for` | invoker | Las asociaciones de **quien llama** para una tanda de claves de línea (60 como mucho). Si el producto enlazado es privado de **otra** nevera, lo devuelve sin enlazar |
| `confirm_ticket_association` | **SECURITY DEFINER** (`search_path` vacío) | **Premium** (sin plan, 42501 con pista `premium`). Guarda o corrige lo que **quien llama** confirmó (sale de `auth.uid()`); suma una confirmación si es lo mismo y empieza de nuevo si cambia. Comprueba **a mano** que el producto enlazado lo ve quien llama (corre sin RLS), pone un tope de 2000 y lleva un candado por persona |
| `update_ticket_association` | **SECURITY DEFINER** | Corrige a mano el nombre y la marca de una asociación **propia** (no depende del plan); deja de apuntar al producto del catálogo. P0002 si no existe o no es suya |
| `search_catalog` | invoker | Busca por palabras (sin acentos ni comodines) o por código en el catálogo que quien llama ve: el global y los privados de UNA nevera. 30 como mucho |
| `ensure_private_product` | invoker | El producto privado sin código de una nevera por nombre y marca, o lo crea (con candado): evita un duplicado por ticket. La RLS exige ser miembro |
| `consume_off_search` | **SECURITY DEFINER** | **Premium.** Reserva búsquedas de texto hacia Open Food Facts: 60 por hora por persona y 10 por minuto entre todas (aparte de `off:m`). Mira primero el tope de la persona, y solo lo que concede toca el global |
| `check_shopping_item` | Trigger de la lista de la compra: ver la tabla `shopping_list_items` |
| `check_shopping_list` | Trigger de las listas: ver la tabla `shopping_lists` |
| `check_accent` | Trigger de `user_settings`: un color que no sea el verde exige premium |
| `sync_household_limit` | Trigger de `user_settings`: al cambiar el `plan`, `household_limit` pasa a 5 (premium) o 2 (básico). Solo salta cuando el plan cambia; el plan no lo escribe el cliente |

### Funciones que solo ejecuta `service_role` (el escáner)

Las llama `lookup-barcode` con la clave de servicio. Todas `definer` con `search_path = ''`, y sin
EXECUTE para `anon` ni `authenticated` (comprobado en `escaner_test.sql`).

| Función | Qué hace | Qué la acota |
|---|---|---|
| `consume_lookup_quota` | Cuenta una consulta de una persona y dice si cabe | 30 por minuto y 500 por día; el contador sube con un solo `insert … on conflict`, atómico |
| `consume_off_slot` | Reserva una llamada a Open Food Facts | 10 por minuto entre todas las personas |
| `is_recent_barcode_miss`, `record_barcode_miss` | Leer y anotar la caché de faltas | Código de 8 a 14 cifras; caduca a las 6 horas |
| `upsert_global_product` | **La única vía** de escritura al catálogo global | Revalida nombre, marca, imagen (solo `images.openfoodfacts.org`), categorías y cantidad; rechaza caracteres de control, bidireccionales, de ancho cero y marcado. Con los datos de salud: alérgenos, trazas y etiquetas con el formato de OFF y 40 como máximo, etiquetas de salud solo de una **lista cerrada** de tres, ingredientes de hasta 2000 caracteres y con los mismos caracteres prohibidos; los tres arrays son obligatorios y siempre fija `health_data_at = now()` |
| `upsert_product_nutrition` | **La única vía** de escritura a `product_nutrition` | Exige que el producto exista y sea del catálogo **global**; revalida Nutri-Score (a–e), NOVA (1–4), base (g/ml), niveles (low/moderate/high), energía 0–950 y nutrientes 0–100 (por 100 g/ml; un NaN o Infinity no pasa), que las saturadas no superen a las grasas ni los azúcares a los hidratos (+0,5), ración de 60 caracteres sin los caracteres prohibidos (la clase de `upsert_global_product` **ampliada**: U+061C, U+180E, U+FFF9 a U+FFFB, uso privado y «etiqueta» U+E0000 a U+E007F; el mismo filtro en el CHECK de la tabla) y aditivos con el formato de OFF (`en:e` + 3 o 4 cifras + hasta 4 letras, p. ej. `en:e331iii`), sin repetir y 60 como máximo. Todos los parámetros son obligatorios (NULL si OFF no lo da); siempre fija `nutrition_data_at = now()`; no devuelve nada |

## Edge Functions

Una en código, el resto previstas. El modelo de amenazas de cada una está en [`threat-model.md`](threat-model.md):

| Función | Fase | Quién la llama | Datos sensibles | Estado |
|---|---|---|---|---|
| `lookup-barcode` | 2 | Usuario con sesión (verificado dentro de la función) | Código de barras (no es personal) | Código y tests; sin desplegar. **Al desplegar, la migración `20261024100000_nutricion` va ANTES** que esta versión: `buscarEnCatalogo` hace el embed `product_nutrition(nutrition_data_at)` en el camino crítico del escáner y, sin la tabla, todos los escaneos darían 500 |
| `daily-digest` | 3 | Cron del servidor (`pg_cron`) | Hora y zona de cada persona | Sin diseñar |
| `opsi-chat` | 5 | Usuario con sesión (verificado dentro de la función, con el token de la persona; **sin clave de servicio**) | Nombres, cantidades y fechas del inventario y la lista, y lo que se pregunta: **sale a un proveedor de IA** (hoy Ollama Cloud, en desarrollo). **No lee salud, perfil ni nutrición** | Código, tests y conectada a la app. **No escribe nada**: lee y **propone** (la persona confirma en la app y es la app quien ejecuta, con su sesión). Solo Premium, solo habla de cocina (puerta del tema) y con cuota por persona (20/h, 100/día); sin desplegar. Modelo de amenazas: §10 |
| `opsi-ticket` | 5 | Usuario con sesión (verificado dentro de la función, con el token de la persona; **sin clave de servicio**) | **La foto de un ticket**, que **sale a un proveedor de IA** (hoy Ollama Cloud, en desarrollo). **No se guarda ni se registra**: la función no escribe nada, y solo devuelve nombre, cantidad, unidad y «comida» de cada línea | Código, tests y conectada a la app. Solo Premium, comparte la cuota de IA con el chat, y la persona **revisa y confirma** antes de guardar nada. Modelo de amenazas: §11 |
| `opsi-marcas` | 5 | Usuario con sesión (verificado dentro de la función, con el token de la persona; **sin clave de servicio**) | **Las palabras de lo que compra** (la línea impresa y el nombre leído) y la tienda de la cabecera. A Open Food Facts solo salen las palabras del producto (letras y cifras). **No usa IA ni escribe nada**; el registro cuenta líneas y fuentes, no su contenido | Código, tests y conectada a la app. Solo Premium. Propone con pruebas; la persona confirma y la app guarda. Modelo de amenazas: §12 |
| `parse-receipt` | 6 | Usuario con sesión | Fotos de tickets | Sin diseñar. Riesgo alto (PII) |

## Colas, workers y cron

Ninguno todavía. El resumen diario (fase 3) será el primero: un cron que lee los ajustes de
cada persona y manda una notificación.

## Almacenamiento (Storage)

Ningún bucket todavía. Fase 6: un bucket **privado** para fotos de tickets, con URL firmadas
de segundos y borrado tras la revisión.

## Integraciones externas

| Integración | Qué sale hacia ella | Desde dónde | Estado |
|---|---|---|---|
| Supabase Auth (GoTrue) | Usuario y contraseña | La app | En uso |
| Open Food Facts | El código de barras (escáner) y, al leer un ticket, las palabras del producto (letras y cifras, y un filtro de país fijo): **sin tienda, importe ni quién pregunta** | **Solo desde una Edge Function** (`lookup-barcode` y `opsi-marcas`), nunca desde el móvil | Fase 2: código escrito, sin desplegar. Búsqueda de texto: ver [`MARCAS.md`](MARCAS.md) |
| Proveedor de IA (hoy Ollama Cloud, en desarrollo) | Los últimos 20 mensajes de la conversación y, cuando el modelo lo pide, nombres, cantidades y fechas del inventario y la lista | **Solo desde la Edge Function `opsi-chat`**, con la clave en el entorno de la función, nunca en el móvil | Conectado en desarrollo. Antes de producción: contrato de encargado, región y que no conserve ni entrene con lo enviado |
| API de Claude | Nombres de alimentos y preguntas; fotos de tickets | **Solo desde una Edge Function** | Fases 5 y 6 |
| Expo / EAS | El código fuente para compilar | Al hacer una *build* | Sin cuenta todavía |
| GitHub Actions | El repositorio | La CI | En uso |

## Rutas «ocultas» que existen en el entorno local

Solo en el Supabase de desarrollo, no en un proyecto desplegado: Studio (`:54323`), el
correo de pruebas (`:54324`), `pg-meta` y la base de datos directa (`:54322`). **Escuchan
en toda la red local**, y el endpoint de SQL de `pg-meta` no pide clave. Es el hallazgo A1
de la auditoría. Hasta que se acote, no se deja la pila levantada fuera de casa.

## Lo que el cliente NO garantiza

La app oculta pantallas y botones según el rol, pero **cualquier cosa que importe se
comprueba otra vez en el servidor**: la RLS, los permisos por columna y las funciones. Un
cliente modificado puede llamar a cualquier función con cualquier argumento, y lo único
que lo frena es lo de las tablas de arriba.
