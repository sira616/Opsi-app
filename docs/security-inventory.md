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
| `service_role` | Solo las Edge Functions, en el servidor | Salta la RLS. Nunca sale del servidor. Sus permisos de tabla se reducen a `products` (leer, insertar y actualizar); en el resto, ninguno (comprobado en `privilegios_test.sql`) |
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
| `(app)/(tabs)/lista`, `chat` | Sesión | «Próximamente» (fases 4 y 5) |
| `(app)/alta` | Sesión | Alta manual en la nevera activa |
| `(app)/elemento/[id]` | Sesión | Detalle y acciones de un elemento |
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
| `products` | Tabla | Las cuatro sobre los **privados** | `household_id` NULL = catálogo global: nadie con sesión lo escribe; solo `service_role` (fase 2) |
| `shopping_list_items` | Tabla | Las cuatro | RLS por nevera (la funcionalidad llega en la fase 4) |
| `user_settings` | Tabla | Leer lo suyo; escribir **columna a columna** | `household_limit` y `username` no son editables; zona horaria validada por trigger |
| `category_shelf_life_reference`, `open_shelf_life_reference` | Tabla | Leer | Referencias de solo lectura |

### Funciones que puede llamar una persona con sesión

Se llaman por RPC (`supabase.rpc`). `anon` no puede ejecutar ninguna.

| Función | Modo | Qué autoriza en el servidor |
|---|---|---|
| `create_item` | invoker | Que la nevera pedida sea de quien llama |
| `open_item`, `use_quantity`, `freeze_item`, `thaw_item`, `finish_item`, `discard_item` | invoker | La RLS del elemento + `require_item()`, que **bloquea la fila** (dos personas a la vez no se pisan) |
| `require_item`, `record_inventory_event` | invoker | Auxiliares de las acciones |
| `shelf_life_for_item` | invoker | La RLS del elemento |
| `today_for_user` | invoker | Lee solo la zona horaria de quien llama |
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

## Edge Functions

**Ninguna todavía.** Las previstas, y su modelo de amenazas, en [`threat-model.md`](threat-model.md):

| Función | Fase | Quién la llama | Datos sensibles | Estado |
|---|---|---|---|---|
| `lookup-barcode` | 2 | Usuario con sesión | Código de barras (no es personal) | Diseño. STRIDE hecho |
| `daily-digest` | 3 | Cron del servidor (`pg_cron`) | Hora y zona de cada persona | Sin diseñar |
| `opsi-chat` | 5 | Usuario con sesión | Inventario, preguntas | Sin diseñar. Riesgo alto (escrituras) |
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
| Open Food Facts | El código de barras | **Solo desde una Edge Function**, nunca desde el móvil | Fase 2 |
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
