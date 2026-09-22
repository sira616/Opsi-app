# Pendientes de Opsi

> **Documento interno de trabajo. No publicar.**
> Todo lo que se ha quedado sin pulir, sin verificar o decidido a medias. La
> [bitácora](BITACORA.md) cuenta **qué se decidió y por qué**; esto cuenta **qué falta**.
>
> Última revisión: **2026-09-21** (tras el alta manual y «Consumir primero»)

## Cómo leerlo

| Marca | Significa |
|:--:|---|
| 🔴 | **Bloquea.** Nada avanza de verdad hasta resolverlo |
| 🟠 | Deuda real: funciona, pero está mal o incompleto y se va a notar |
| 🟡 | Mejora conocida. Ni urgente ni olvidada |
| ⚪ | Anotado para no perderlo. Puede quedarse así mucho tiempo |

---

## 1. Sin verificar 🔴

Lo más importante del documento. **Nada de lo construido se ha ejecutado nunca contra un
Supabase real**, porque el contenedor donde trabajo no tiene daemon de Docker.

| | Qué está sin verificar | Riesgo concreto |
|:--:|---|---|
| 🔴 | `db:start`, `db:reset`, `db:test` | Las 10 migraciones solo se han aplicado sobre PGlite (Postgres 18 en WebAssembly). El proyecto fija la 17 |
| 🔴 | **pgTAP real** | Los 3 ficheros de `supabase/tests/` se han ejecutado con *dobles* de las funciones de pgTAP, no con pgTAP |
| 🔴 | Los `insert into auth.users` de los tests | Mi `auth.users` es un doble mínimo. Si el real tiene columnas NOT NULL que los tests no rellenan, **fallarán los tres ficheros**. Arreglo de una línea, pero hay que verlo |
| 🟠 | La CI | `.github/workflows/ci.yml` no ha corrido nunca. El primer push dirá si el YAML y los pasos son correctos |
| 🟠 | `npm run types` | Nunca ejecutado: necesita Docker. **`app/src/lib/database.types.ts` no existe todavía**, así que las consultas del cliente van sin tipar |
| 🟡 | Las versiones de Expo salen de `bundledNativeModules.json` | Las resolví de la lista que trae el propio paquete `expo`, porque el proxy bloquea la API de `expo install`. `npx expo install --fix` desde `app/` lo confirmará |

**Cómo se cierra esto**, y es un solo rato delante del ordenador:

```bash
npm run dev          # levanta Supabase y aplica migraciones + seed
npm run db:test      # el veredicto de verdad
npm run types        # crea los tipos; hay que hacer commit del fichero
```

---

## 2. Huecos del backend 🟠

Cosas que faltan o que están decididas a medias, encontradas al repasar el código.

### ✅ ~~Nadie emite el evento `created`~~ · resuelto 2026-09-21

Se añadió la RPC `create_item`, que inserta el elemento y registra su evento en la misma
transacción. Se eligió función y no trigger por coherencia: las otras seis acciones ya
son RPC, y así el alta no es un caso aparte.

Queda un flanco: **un `INSERT` directo sobre `inventory_items` sigue siendo posible** y
no registraría nada. La app ya no lo hace, pero la política RLS lo permite. Si se quiere
cerrar del todo, habría que quitar el INSERT de la política y dejar solo la RPC.

### 🟠 Las acciones cambian la ubicación por su cuenta

`freeze_item` pone `location = 'freezer'` y `thaw_item` pone `location = 'fridge'`.

Lo primero es casi seguro correcto. Lo segundo es **una suposición mía**: descongelas algo
y Opsi decide que está en la nevera, cuando podrías haberlo sacado para cocinarlo ya. Nadie
lo ha pedido y no está discutido.

**Arreglo:** o quitarlo y que la ubicación la cambie solo el usuario, o dejarlo pero decirlo
en la interfaz. Lo que no vale es que la app mueva cosas de sitio sin avisar.

### 🟠 No se puede deshacer nada

Si marcas «tirado» por error, no hay vuelta atrás: `require_item` rechaza cualquier acción
sobre algo ya cerrado, y no existe una acción de reabrir. El usuario tendría que editar la
fila a mano, que desde la app no puede.

**Arreglo:** una acción `reopen_item` que devuelva el elemento a su estado anterior y deje
su propio evento. Nunca borrando el evento original: el registro es inmutable a propósito.

### 🟡 `open_shelf_life_reference` sin trigger de `updated_at`

Todas las demás tablas lo tienen. Esta se quedó sin él por despiste. La columna existe y
nunca se refresca.

### 🟡 La vista expone columnas internas

`inventory_with_priority` devuelve `date_from_label`, `date_from_opening` y
`date_from_thaw` además de las columnas útiles. Vienen bien para depurar y para los tests,
pero son ruido en la API pública y aparecerán en los tipos generados.

**Decidir:** dejarlas (útiles para explicar el cálculo en la pantalla de detalle) o
esconderlas en una vista interna aparte.

### ⚪ `products_source_ck` es rígido

Obliga a que todo producto del catálogo global declare `data_source = 'openfoodfacts'`. Si
algún día entra otra fuente, hay que tocar la restricción. Hoy es correcto y evita basura.

### ⚪ `user_settings.timezone` no se valida

Un `CHECK` no admite subconsultas, así que no se contrasta contra `pg_timezone_names`.
Hoy lo valida solo la aplicación, que todavía no existe. Un trigger lo resolvería.

---

## 3. Decisiones a medio cerrar 🟠

### ✅ ~~Q9 · «Hoy» se calcula en UTC~~ · resuelto 2026-09-21

Nueva función `today_for_user()`, que lee `user_settings.timezone` y cae a
`Europe/Madrid` cuando no hay sesión —el caso del resumen diario, que corre con
`service_role`—. La vista de prioridad la usa en lugar de `current_date`.

Hay un test que lo comprueba de verdad: con el ajuste en `Pacific/Kiritimati` (UTC+14) la
función devuelve un día distinto que con Madrid, así que no es una tautología.

### 🟠 Q3 · El campo de conservación de Open Food Facts sin confirmar

No pude comprobar que OFF tenga el dato de días tras apertura de forma estructurada: no
aparece en su taxonomía ni en el esquema de producto, y el proxy de red me impidió
consultar la API en vivo.

El plan B (tabla por categoría) ya está puesto y hace que el sistema funcione igual.
**Verificar en la fase 2**, al escribir `lookup-barcode`, y decidir entonces si merece la
pena parsear su campo de texto libre.

### 🟠 Los valores de `open_shelf_life_reference` no tienen fuente autorizada

Las 10 filas sembradas recogen práctica común de conservación en frigorífico. Están del
lado corto a propósito y marcadas como orientativas en su columna `source`, pero **no
salen de ninguna guía oficial**.

Es el riesgo número uno del roadmap original y sigue abierto: mientras no haya fuente, todo
lo que derive de aquí es una estimación con buena intención.

### 🟡 D-14 · El tope de 24 h no distingue alimentos

Un pan descongelado y una merluza descongelada reciben el mismo plazo. Es conservador para
el pan y correcto para la merluza, y el desequilibrio es deliberado. El número está en un
solo sitio de la vista, así que afinarlo por categoría el día que haya categorías fiables
es un cambio localizado.

### 🟡 Los tests usan `no_plan()` en vez de `plan(N)`

A propósito: un plan mal contado falla por una razón que no tiene nada que ver con lo que
se quiere probar, y pgTAP real nunca los ha ejecutado. **Cuando pasen en verde de verdad,
cambiar a `plan(N)`** para detectar además los tests que no llegan a correr.

---

## 4. La app 🟠

**D1–D4 hechos.** Proyecto Expo (SDK 57, React 19, RN 0.86), Expo Router, cliente de
Supabase con sesión persistida, alta y login con contraseña, y rutas protegidas.
`typecheck` y `lint` pasan limpios.

| | Qué falta | Notas |
|:--:|---|---|
| 🟠 | **Nadie ha ejecutado la app contra un backend real** | El bundle web **sí compila** (`expo export --platform web` pasa), así que el código es correcto. Lo que nadie ha visto es la app hablando con Supabase de verdad |
| 🟡 | Soporte web añadido para poder mirarla | `react-native-web`. Es una comodidad de desarrollo, **no un objetivo del producto**: el roadmap dice app móvil. Ojo con acabar diseñando para el navegador |
| 🟠 | La sesión se guarda en **AsyncStorage sin cifrar** | Es lo que recomienda la guía de Supabase para React Native, pero en un móvil con root o comprometido el token está en claro. `expo-secure-store` lo cifraría, a cambio de trocear el JWT: su límite es de 2048 bytes |
| 🟠 | D5 · Development build con EAS | `eas.json` ya está; falta `eas init` (necesita cuenta de Expo). Ver [`NATIVA.md`](../NATIVA.md) |
| 🟠 | **Sin icono ni pantalla de carga** | `app/assets` está vacío. El prompt para generar el logo está en [`DISENO.md`](../DISENO.md) |
| ⚪ | El desenfoque de la barra solo en iOS | En Android va un color casi opaco a propósito: el desenfoque en tiempo real cuesta fotogramas en gama media |
| ⚪ | Las hojas modales no se han visto en un móvil | `formSheet` con tirador y arrastre; en la versión web se comporta como una pantalla normal |
| 🟡 | `npm run up` deja sesiones huérfanas | Reiniciar la base borra los usuarios y el móvil conserva el token. La app lo detecta y lo explica, pero seguiría siendo mejor que `signOut()` ocurriera solo |
| 🟡 | Una build nativa no lee el `.env` local | Las variables se congelan al construir, así que apuntar a Supabase local solo funciona con el ordenador encendido. Necesita el proyecto en la nube |
| ✅ | ~~Sin confirmación al tirar ni al terminar~~ | Resuelto: confirmación en línea, con el nombre del alimento en la pregunta. En línea y no `Alert.alert` porque este último no hace nada en la versión web |
| 🟡 | Sin selector de fecha nativo | Ahora se teclean ocho dígitos y las barras salen solas, más tres atajos. Es rápido para copiar de un envase, pero un calendario debería existir como alternativa |
| 🟠 | **La lista de zonas horarias está escrita a mano** | Seis zonas más la del dispositivo. Sirve para España y Latinoamérica, pero alguien fuera de esa lista se queda con la del dispositivo o nada. Una búsqueda sobre `Intl.supportedValuesOf('timeZone')` lo resolvería |
| 🟡 | Sin recuperación de contraseña | Si olvidas la tuya, no hay pantalla. Necesita el SMTP de la sección 6 |
| 🟠 | **La app habla con Supabase sin tipos** | `src/api/inventory.ts` afirma los tipos a mano con `as unknown as`. Si una columna cambia de nombre, compila y revienta en ejecución. Lo arregla `npm run types` + quitar los casts |
| 🟡 | Sin pruebas de interfaz | Ni una. El typecheck y el linter son toda la red de seguridad del cliente |
| ⚪ | En Windows, `npm run types` depende del shell | El script redirige con `>`. npm usa `cmd.exe`, donde funciona; si alguien configura `script-shell` a PowerShell, el fichero saldría en UTF-16 y roto |
| ⚪ | `eslint-config-expo` no va con ESLint 10 | Su `eslint-plugin-react` usa una API que la 10 eliminó. ESLint queda fijado en `^9.39.5`; revisar cuando publiquen soporte |
| ⚪ | Traducir el prototipo a React Native | El [prototipo](https://claude.ai/artifact/GN9eqEFUn1vvBwVQBkgNpv) es HTML: referencia visual, no código |

## 5. Repositorio y proceso 🟡

| | Qué | Detalle |
|:--:|---|---|
| 🟠 | Borrar las ramas `backend` y `frontend` | Fusionadas en `main` y vacías de contenido propio. El borrado remoto me da 403 desde aquí: `git push origin --delete backend frontend` |
| 🟡 | No hay `CLAUDE.md` | Las convenciones están en la bitácora, que es interna. Un `CLAUDE.md` en la raíz las haría efectivas en cada sesión |
| 🟡 | No hay plantilla de PR ni `CONTRIBUTING.md` | |
| 🟡 | README sin material visual | Es lo que separa el README «correcto» del «bonito». El GIF de demo no se puede grabar hasta la fase 2. Esqueleto y lista de material en la [bitácora, sección 5](BITACORA.md#5-plantilla-del-readme-final) |
| ⚪ | Los códigos de barras del seed son ficticios con formato EAN-13 válido | Empiezan por `84000000000xx`. Podrían chocar con un producto real algún día |

---

## 6. Antes de publicar 🟠

Nada de esto corre prisa hoy, y todo es obligatorio antes de que lo use alguien que no seas
tú.

| | Qué | Por qué |
|:--:|---|---|
| 🔴 | **Borrar `supabase/seed/03_usuario_dev.sql`** | Siembra `syreta` con una contraseña escrita en el repositorio. Vale para el Supabase local; sembrarlo en la nube sería regalar una cuenta |
| 🟠 | SMTP real | Sin él, quien no añada un correo en Ajustes no puede recuperar su contraseña. Ver Q7 y [D-19](BITACORA.md#d-19--el-usuario-es-la-identidad-el-correo-es-opcional--2026-09-21-matiza-d-13) |
| 🟠 | **Borrado de cuenta y de datos** | No existe ninguna vía para que un usuario borre su hogar y su historial. Con datos personales en Europa, esto no es opcional. Tampoco hay política de retención |
| 🟠 | Proyecto de Supabase en **región EU** | Decidido, pero el proyecto aún no está creado |
| 🟠 | Límites de uso de la IA por usuario | Fase 5. El roadmap ya lo pide; sin ello, la factura es imprevisible |
| 🟠 | Revisar los términos de uso de Open Food Facts | Piden identificarse con un `User-Agent` con contacto (`OFF_USER_AGENT`), y la licencia ODbL obliga a atribución y compartir igual. Sube de prioridad: el límite real es de **15 peticiones/min por IP**, no 100, y eso condiciona el diseño de la fase 2. Ver [CATALOGOS.md](CATALOGOS.md) |

---

## 7. Lo siguiente, en orden

1. **Arrancar la app de verdad**: `npm run dev`, luego `npm run --workspace app start` y
   crear una cuenta desde Expo Go. Si la pantalla pinta tu hogar, la fase 0 funciona de
   punta a punta y se cierra casi toda la sección 1.
2. **`npm run types`** y commit del fichero: quita el typado a ciegas del cliente.
3. **Generar el logo** con el prompt de `DISENO.md` y meter `icon.png` y `splash.png` en
   `app/assets`, que sigue vacío.
4. **La fase 2**: escáner de códigos de barras y la Edge Function `lookup-barcode`. Ahí
   sí hace falta la development build de EAS.
