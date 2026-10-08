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

## 4 · `lookup-barcode` (fase 2) — *todavía no existe*

Se escribe aquí **antes** que el código, como pide la lista (§22). Es la primera Edge
Function: lleva la clave de servicio y llama a un tercero (Open Food Facts), así que es
donde más fácil es meter una deuda de seguridad que luego no se paga.

**Flujo:** app → Edge Function (con el JWT de la persona) → caché global en `products` →
si falta, Open Food Facts → normalizar → guardar con `service_role` → devolver.

| STRIDE | Amenaza concreta | Mitigación | Test |
|---|---|---|---|
| **S**poofing | Llamar a la función sin ser nadie: `verify_jwt` solo comprueba que el JWT sea válido, y la `anon key` **es** un JWT válido | Dentro de la función: `auth.getUser(token)` y exigir `role === 'authenticated'` | pendiente (con la función) |
| **T**ampering (SSRF) | El código de barras se usa para construir la URL de OFF | Host y ruta fijos en el código; el código solo si `^[0-9]{8,14}$` **y** con dígito de control GS1 válido; `redirect: 'error'`; nunca se acepta URL, host ni ruta del cliente | pendiente |
| **T**ampering | La caché se **envenena**: OFF lo edita cualquiera, y lo que se guarda lo ven todas las personas (y en la fase 5, el modelo) | Se guarda solo un subconjunto de campos, sin saltos de línea ni caracteres de control, bidireccionales o de ancho cero; longitudes máximas; `image_url` solo del dominio de imágenes de OFF; caducidad de la caché | pendiente |
| **T**ampering | Dos filas para el mismo código por ceros a la izquierda (`0012345678905` y `12345678905`) | Normalizar todo a GTIN-13 antes de buscar y de guardar | pendiente |
| **R**epudiation | No saber quién consultó qué | Log con `request_id` y `user_id`; sin cuerpo de la respuesta ni JWT | pendiente |
| **I**nfo disclosure | Un error de OFF o una excepción llega a la app con detalle interno | Error genérico con código propio; el detalle solo en el log | pendiente |
| **I**nfo disclosure | OFF ve de dónde vienen las consultas | La llamada sale **del servidor**: OFF ve la IP de Supabase, no la de la persona. No se mueve al móvil | n/a (decisión de diseño) |
| **D**oS | Un usuario consulta en bucle; o OFF nos limita y el escáner entero deja de funcionar | Contador atómico por usuario (≈30/min, 500/día); tope global hacia OFF (≈10/min); timeout de 4 s; cuerpo máximo de 256 KB; **caché de faltas** con caducidad de horas; si falla, se degrada a alta manual con el código ya relleno | pendiente |
| **E**levation | Escribir el catálogo global desde el cliente | Imposible por diseño: `is_household_member(NULL)` es falso, así que ninguna política de escritura admite filas globales. Solo `service_role`, con permisos únicamente sobre `products` | `privilegios_test.sql` |
| **E**levation | El contenido de OFF (nombres, marcas) se interpreta como instrucción cuando llegue al chat | Nunca se interpola en un prompt: se pasa como datos, recortado y sin saltos de línea (ver LLM01 en la lista de seguridad) | pendiente (fase 5) |

### Ficha del endpoint

- **Nombre:** `lookup-barcode`
- **Tipo:** Edge Function (Deno)
- **Método y ruta:** `POST /functions/v1/lookup-barcode`, cuerpo `{ "barcode": "<8–14 dígitos>" }`, máximo 1 KB
- **Autenticación:** JWT de una persona con sesión, **verificado dentro de la función**
- **Autorización:** cualquier persona autenticada puede consultar el catálogo; nadie puede escribir en él excepto la propia función
- **Entrada validada:** solo dígitos, 8 a 14, dígito de control GS1 correcto
- **Salida:** `{ name, brand, quantity, unit_family, image_url, source: 'openfoodfacts' }`, nunca el `off_payload` completo
- **Límites:** ≈30/min y 500/día por persona; ≈10/min globales hacia OFF; timeout 4 s
- **Riesgos:** SSRF, envenenamiento de la caché, abuso de cuota, filtrado de errores, entrada no confiable hacia el modelo
- **Controles en servidor:** los de la tabla de arriba
- **Secretos:** `OFF_USER_AGENT` (con un contacto real) en el entorno de la función. La clave de servicio nunca sale de ahí
- **Tests automatizados:** pendientes; se escriben con la función
- **Estado:** `[x] diseño`  `[ ] código`  `[ ] tests`  `[x] inventario`  `[ ] prod`

---

## Lo que este documento todavía no cubre

`daily-digest` (fase 3), `opsi-chat` (fase 5) y `parse-receipt` (fase 6) no tienen tabla
STRIDE. Las dos últimas son las de más riesgo —el chat escribe sobre el inventario con
el token de la persona, y los tickets llevan datos personales— y **no se construyen sin
su tabla aquí primero**. Los controles previstos están en
[`internal/AUDITORIA-2026-09-24.md`](internal/AUDITORIA-2026-09-24.md), secciones P3 a P5.
