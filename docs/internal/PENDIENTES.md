# Pendientes de Opsi

> **Documento de trabajo.** El repositorio fue público del 2026-09-19 al 2026-10-18 y hoy es privado, pero se escribe como si pudiera volver a serlo: no escribir aquí
> nada que no pueda leer cualquiera.
> Todo lo que se ha quedado sin pulir, sin verificar o decidido a medias. La
> [bitácora](BITACORA.md) cuenta **qué se decidió y por qué**; esto cuenta **qué falta**.
>
> Última revisión: **2026-10-19**

## Cómo leerlo

| Marca | Significa |
|:--:|---|
| 🔴 | **Bloquea.** Nada avanza de verdad hasta resolverlo |
| 🟠 | Deuda real: funciona, pero está mal o incompleto y se va a notar |
| 🟡 | Mejora conocida. Ni urgente ni olvidada |
| ⚪ | Anotado para no perderlo. Puede quedarse así mucho tiempo |

---

## 1. Sin verificar 🔴

**Actualizado 2026-09-24.** Hasta hoy esta sección decía que nada se había ejecutado contra un
Supabase real. Ya no es cierto: Docker funciona y `db:reset`, `db:test`, `db:lint`, `db:check` y
`types` corren en verde (24 migraciones, **8 ficheros pgTAP con 241 tests** contra pgTAP real,
409 comprobaciones en PGlite). Lo que queda sin verificar:

| | Qué está sin verificar | Riesgo concreto |
|:--:|---|---|
| ✅ | **El escáner con la cámara de un móvil** | **Probado por el usuario en su móvil (declarado el 2026-10-19).** Antes solo estaba verificado en local salvo la cámara. Lo que sigue sin comprobarse caso a caso, por si algo concreto falla: UPC-A que en iOS llega como EAN-13 con un cero delante (la normalización lo cubre), la linterna y los botones de cerrar con notch |
| 🔴 | **Opsi Premium no se puede contratar** | El plan solo lo cambia quien tiene la base de datos (`npm run dev:plan`, solo local). Falta: elegir proveedor de pago (tiendas con RevenueCat, o Stripe), la función que reciba su aviso y escriba el plan, la pantalla de compra, restaurar compras, y decidir si el plan es **de la persona** (hoy) o de la nevera. La pantalla de Premium ya dice que aún no se puede contratar |
| 🟠 | **El campo de fecha nuevo, «tus productos» y la pestaña Premium en un móvil** | Verificados en el navegador. **Mantener pulsado el − o el +: probado por el usuario en su móvil (2026-10-19), repite y se deja así.** Sin ver en nativo: el calendario como hoja, y la hoja de opciones de «tus productos» sobre una pestaña con la barra flotante |
| 🟠 | **El escáner con notch, la ficha de producto y la tarjeta de fecha en un móvil** | Verificados en el navegador (excepto el notch, que no tiene equivalente allí). **Los botones de cerrar y la linterna volvieron a quedar bajo el recorte en un móvil (2026-10-19) y se reescribió el margen** ([D-47](BITACORA.md#d-47--el-margen-de-arriba-del-escáner-lo-pone-un-solo-sitio--2026-10-19)): **sin confirmar en el móvil que ya se tocan bien.** Sin ver en nativo: la ficha como hoja sobre una pantalla de pila, y la tarjeta de fecha con algo abierto o con el consumo preferente pasado |
| 🟠 | **Elegir nevera al guardar un producto y «Ver todos» de lo que más gastas, en un móvil** | Verificados en el navegador con dos neveras (la fila de neveras, «Guardarlo en…» cayendo en la elegida, apuntar en la lista de la elegida, el formulario completo con la nevera por la ruta, los cinco primeros y la pantalla con los ocho). Sin ver en nativo: la fila de neveras con muchas neveras largas y la ficha como hoja sobre una pantalla de pila |
| 🟠 | **Alérgenos e intolerancias, ingredientes y «congélalo o úsalo» con sesión y en un móvil** | Verificado: pgTAP real (RLS, permisos, los CHECK), las pruebas de la lógica con Node, las filas reales de la vista y los componentes pintados en el navegador **sin sesión** con datos de prueba (marcas del inventario, avisos, recuadro de congelar). Sin ver: Ajustes, la hoja rápida del escáner, el alta, la hoja de ingredientes y el botón «Congelar» con sesión; el modo claro; nada nativo; y **la renovación real de una ficha antigua llamando a OFF desde la función** (la función no se ha probado contra OFF con estos campos) |
| 🟡 | **`my_known_products` devuelve lo que la app ya no usa** | Veces, primera y última vez y cuánto hay ahora siguen en la función (y en sus tests) aunque el almacén ya no los enseña. Si no vuelven a hacer falta, quitarlos con una migración nueva (no se puede cambiar el tipo devuelto con `create or replace`) |
| 🟡 | **Tus productos: lo que falta** | Lo que se escaneó y no se guardó no sale (escanear no deja rastro); no hay forma de quitar algo del inventario ni foto del producto (el móvil no llama a terceros); si se quiere **guardar sin añadir**, hará falta una tabla de favoritos |
| 🟡 | **Apuntar solo, al agotar algo** | Con «apuntar lo que se acaba» encendido en Ajustes se apunta solo, sin preguntar, y va a la lista principal. Si se quiere elegir listas también ahí, hará falta un ajuste con la(s) lista(s) por omisión |
| 🟠 | **El chat de Opsi: lo que falta** | **Hecho:** la pantalla ([D-48](BITACORA.md#d-48--premium-en-widgets-pantalla-base-del-chat-y-avisos-al-abrir-la-app--2026-10-19)), la Edge Function `opsi-chat` con Ollama Cloud (`gemma4:31b`) y dos herramientas de **solo lectura** con la sesión de la persona (RLS, sin clave de servicio), la pantalla conectada a ella (#27), el aviso y `docs/PRIVACIDAD.md` al día, y, el 2026-10-24 ([D-51](BITACORA.md#d-51--la-deuda-del-chat-modelo-de-amenazas-saneo-de-nombres-y-cuota-por-persona--2026-10-24)): el **modelo de amenazas** (`threat-model.md` §10), los **nombres de producto limpios** antes de llegar al modelo, la respuesta saneada y la **cuota por persona** (20 por hora, 100 al día). **Falta:** (1) decidir si el chat es **de Premium** (hoy no lleva candado y cada mensaje cuesta); (2) 🔴 **antes de producción:** contrato de encargado con el proveedor, región y que no conserve ni entrene con lo enviado; (3) **tope de gasto global en el proveedor**: la cuota es por persona y el alta no está cerrada; (4) herramientas de **escritura**: no sin repasar el §10 y sin confirmación de la persona en la app para cada una, y quitar entonces el «de momento solo puedo mirar» del prompt; (5) probarla con sesión real, con `npm run fn:serve` y en el móvil (la cuota ya se ha probado con pgTAP real y con dos sesiones a la vez en `db:carreras`); (6) elegir el modelo de producción (Q4: el *tool use* de Claude no es igual) y desplegar la función con sus secretos (`OLLAMA_API_KEY`); (7) la burbuja flotante y la mascota; (8) ajustar la cuota con uso real |
| 🟡 | **La asistente y la nutrición** | `docs/NUTRICION.md` es un borrador con las raciones de la AESAN (2022), la OMS y el plato de Harvard. No está en el prompt: choca con `VOZ.md` («no opina sobre lo que comes»). Decidir si se usa solo para ordenar propuestas, y que lo revise una dietista antes de lanzar |
| 🟠 | **Nutrición: las pantallas, en el navegador y en un móvil** | Verificados con pgTAP, funciones, tests de la app y una revisión de seguridad ([D-49](BITACORA.md#d-49--nutrición-de-open-food-facts-por-producto-en-una-tabla-propia-que-solo-lee-premium--2026-10-19)); **las pantallas no se han visto**: cómo queda la escala del Nutri-Score en claro y en oscuro, la tabla, el lector de pantalla, la renovación de una ficha antigua al abrir el detalle (gasta cuota) y la hoja «Ver nutrición» en iOS. Para probarlo: `npm run dev:plan -- compi premium`, escanear algo y abrir Premium → Nutrición. También sin comprobar: la capa HTTP de PostgREST con un JWT (los roles se simularon en SQL) y `String.prototype.normalize` del buscador en Hermes |
| 🟡 | **Nutrición: lo que falta** | Un producto escaneado pero privado (origen `user`) se abre y dice «Sin datos nutricionales» sin poder reintentar; el resumen del widget es fijo («Nutri-Score y NOVA de tus productos»); el buscador pliega la ñ a n; `basis` (por 100 g o 100 ml) sale de la unidad del producto y, en lo que se mide por unidades, queda sin decir; el campo `no_nutrition_data` de OFF no se usa. **Al desplegar: la migración `20261024100000_nutricion` va ANTES que la nueva `lookup-barcode`** (el escáner hace el embed de la tabla en su camino crítico). No cruza nada con las preferencias de salud, ni compara productos, ni da cantidades recomendadas: es a propósito (VOZ §4, regla 10) |
| 🟡 | **La clase de caracteres prohibidos de `upsert_global_product` es la antigua** | La nutrición ya quita las «etiquetas» U+E0000, el uso privado y otros invisibles que esconden texto; el nombre, la marca y los ingredientes del catálogo (migraciones de `20261010100000` y `20261021100000`) siguen con la clase corta, y la app (`salud.ts`) igual. Cuando el chat lea ingredientes habrá que subirla en una migración nueva y en la app. La Edge Function ya filtra con `p{C}` |
| 🟡 | **Avisos: personalizarlos y sacarlos de la app** | Hoy avisa al abrir la nevera (una vez al día, hasta tres) por lo que vence pronto y no usa nada de la persona. Falta: que tenga en cuenta alérgenos, gustos y alimentación (cuando exista el perfil personal), «hacer una receta» con IA (hoy solo abre el chat), y los avisos fuera de la app (**push**, fase 3, que pide la build de desarrollo) |
| 🟡 | **Fecha: ya no se distingue «del envase»** | Todo lo que se guarda desde el formulario lleva origen `user`. Si algún día importa saber si la fecha estaba impresa (p. ej. para fiarse más de ella), habrá que volver a preguntarlo o inferirlo |
| 🟠 | **Listas y Premium en un móvil** | Verificados en el navegador (tres listas y el tope, colores bloqueados y desbloqueados, lo que más gastas). Sin ver en nativo; y **cambiar de cuenta en el mismo móvil** enseñaría un instante el color de la anterior (la copia local se pisa al cargar los ajustes) |
| 🟡 | **Docker se cuelga por falta de RAM** | El PC tiene 7,8 GB y se llegó a **176 MB libres** (Claude, Spotify, Discord y otro programa suman más de 2 GB): Storage no pasa el chequeo de salud y `docker ps` deja de contestar. `npm run up` ya no da por roto un reset cuyo único fallo es Storage (ver `scripts/up.mjs`), pero **esa vía de recuperación no se ha ejecutado de punta a punta** (no había Docker que contestara). Valorar un `.wslconfig` con tope de memoria para WSL |
| 🟡 | **Listas: lo que falta** | Mover una línea a otra lista (el servidor ya lo permite, la app no), reordenar las listas, y probar con dos sesiones que el tope de 3 no se pasa por una (como el de 300 líneas) |
| 🟡 | **Premium: más cosas** | Hoy solo hay color, lo que más gastas y más listas. «Lo que más gastas» cuenta veces agotadas, no cantidades ni dinero (no hay precios). |
| 🟠 | **La hoja rápida del escáner y el filtro «solo comida» en un móvil** | Verificados en el navegador (entrada manual: libro y cosmética rechazados, hoja, «Editar», guardar y volver al escáner). Sin ver en nativo: que el formulario completo se abra encima del escáner a pantalla completa y vuelva bien, que la cámara se apague al abrirlo, y la cámara en sí |
| 🟠 | **Editar un elemento en un móvil** | Verificado en el navegador (nombre, pasillo, sitio y fecha, con su evento en el historial). Sin ver en nativo, y **sin probar desde la interfaz la corrección de la cantidad** (sí por pgTAP) |
| 🟠 | **`npm run up` arrancando las funciones paradas** | El `docker start` del contenedor se probó a mano y el mensaje de la app con las funciones caídas en el navegador; el script `up` entero no se ha ejecutado con el contenedor parado |
| 🟠 | **La lista de la compra en un móvil** | Verificada en el navegador de punta a punta (apuntar, tachar, guardar en la nevera, ofrecer al agotarse). Sin ver en nativo, y **sin probar desde la interfaz con «apuntar lo que se acaba» ENCENDIDO** (el servidor sí lo permite, probado en pgTAP) |
| 🟠 | **Las hojas que suben desde abajo y el reloj de ruedas** | Se verificaron en el navegador (usar una fracción, el menú «⋯», elegir la hora y que se guarde). Sin ver en un móvil: arrastrar las ruedas con el dedo y que se queden clavadas, la animación de la hoja, el teclado sobre «Otra cantidad» y el lector de pantalla (cada rueda se anuncia como ajustable) |
| 🟠 | **Nativo: probado en general, sin lista de casos** | El usuario ha ido usando la app en su móvil todo este tiempo (declarado el 2026-10-19), pero no se anotaron casos concretos. Las filas de esta tabla con casos concretos («Sin ver en nativo: …») siguen abiertas hasta confirmarlos uno a uno; si alguno falla, se reabre. Sigue sin verse: el desenfoque real de iOS, la sombra de la barra y el área segura con barra gestual |
| ✅ | **La CI** | **Verificada en verde el 2026-10-08**, por primera vez, en la PR #1: los tres trabajos pasan, con los 8 ficheros de pgTAP corriendo en el runner. Hasta entonces llevaba 25 de 26 ejecuciones en rojo. **Ojo:** solo se dispara con `push` a `main` y con pull requests; una rama suelta no la lanza, y una PR con conflictos tampoco |
| 🟠 | **Aceptar, rechazar y cancelar invitaciones desde la interfaz con clics reales** | Invitar y aceptar se probaron en el navegador con dos cuentas; rechazar y cancelar solo por SQL (pgTAP). La lógica está probada, la pantalla no |
| 🟠 | **Las carreras de las funciones de neveras** | Crear/crear y aceptar/crear con dos sesiones a la vez las probó a mano el agente que las escribió (la segunda espera y ve la pertenencia ya confirmada). No hay test automático |
| 🟠 | **La build de desarrollo (D5)** | Notificaciones push (fase 3) y el almacén cifrado de la sesión. **El escáner no la necesita**: `expo-camera` viene en Expo Go (por probar, ver arriba) |
| 🟡 | Las versiones de Expo salen de `bundledNativeModules.json` | Expo avisa de que un paquete puede necesitar actualización. `npx expo install --check` desde `app/` lo dice |

**Ya cerrado, por si se buscaba aquí:** los `insert into auth.users` de los tests funcionan con el
`auth.users` real; `npm run types` corre y `app/src/lib/database.types.ts` existe (y desde hoy
`types` no puede pisarlo con un error: ver la bitácora, sesión 23).
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

### ✅ ~~El tope de 24 h tras descongelar desaparece al usar una parte o abrir lo descongelado~~ · resuelto 2026-10-19

Hallado al hacer [D-44](BITACORA.md#d-44--alérgenos-e-intolerancias-ingredientes-de-open-food-facts-y-congélalo-o-úsalo--2026-10-19)
y arreglado en [D-45](BITACORA.md#d-45--el-tope-de-24-h-tras-descongelar-depende-de-thawed_at-no-del-estado--2026-10-19)
(migración `20261022100000`): la vista aplica el tope mientras `thawed_at` esté puesto, no solo con el estado «descongelado».
Congelar y descongelar otra vez reinicia las 24 h. Lo vigila `supabase/tests/tope_descongelar_test.sql`, que falla con la vista antigua.

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

### ✅ ~~`user_settings.timezone` no se valida~~ · resuelto 2026-09-24

Un trigger (`20260924150000_zona_horaria_valida`) la contrasta con `pg_timezone_names` al
escribirla. Sin él, una zona inventada rompía `today_for_user()` y la vista de prioridad de
esa persona, y en la fase 3 abortaría el resumen diario de todos. Probado en
`supabase/tests/alta_test.sql`.

---

## 3. Decisiones a medio cerrar 🟠

### ✅ ~~Q9 · «Hoy» se calcula en UTC~~ · resuelto 2026-09-21

Nueva función `today_for_user()`, que lee `user_settings.timezone` y cae a
`Europe/Madrid` cuando no hay sesión —el caso del resumen diario, que corre con
`service_role`—. La vista de prioridad la usa en lugar de `current_date`.

Hay un test que lo comprueba de verdad: con el ajuste en `Pacific/Kiritimati` (UTC+14) la
función devuelve un día distinto que con Madrid, así que no es una tautología.

**Volvió a romperse y se arregló el 2026-09-24.** `20260921180000_categorias` tuvo que recrear
la vista y copió la definición anterior a este arreglo: durante días la vista volvió a usar
`current_date` (UTC) y nadie lo notó, porque ese test comprobaba la función y no la vista. Entre
medianoche y las 2 de la madrugada en España, lo que vencía hoy se enseñaba como que vencía
mañana. `20260924130000` la devuelve a `today_for_user()` y `prioridad_zona_horaria_test.sql`
la comprueba **a través de la vista**, con dos zonas extremas (UTC+14 y UTC−11) para que falle
a cualquier hora del día, no solo de madrugada.

### 🟠 Q3 · El campo de conservación de Open Food Facts sin confirmar

No pude comprobar que OFF tenga el dato de días tras apertura de forma estructurada: no
aparece en su taxonomía ni en el esquema de producto, y el proxy de red me impidió
consultar la API en vivo.

El plan B (tabla por categoría) ya está puesto y hace que el sistema funcione igual.
**Revisado en la fase 2** (2026-10-10): `lookup-barcode` pide a OFF nombre, marca, cantidad, imagen
y categorías, y **no** ningún campo de conservación; `open_shelf_life_days` se queda en `null` y manda
la tabla por categoría con las `categories_tags` que sí se guardan. Parsear un campo de texto libre
sigue sin merecer la pena hasta que se vea qué fichas lo traen.

### 🟠 Los valores de `open_shelf_life_reference` no tienen fuente autorizada

Las 10 filas sembradas recogen práctica común de conservación en frigorífico. Están del
lado corto a propósito y marcadas como orientativas en su columna `source`, pero **no
salen de ninguna guía oficial**.

Es el riesgo número uno del roadmap original y sigue abierto: mientras no haya fuente, todo
lo que derive de aquí es una estimación con buena intención.

### 🟠 El cruce de alérgenos solo lee las etiquetas de OFF, no el texto de los ingredientes

`evaluarSalud` cruza lo que la persona evita con `allergens_tags` y `traces_tags`. Un producto con los
ingredientes escritos pero sin esas etiquetas calculadas no avisaría: la app dice «sin datos» solo si faltan los
ingredientes o la ficha. Leer el texto sería poco fiable (idioma, sinónimos, «sin gluten» dentro del propio texto)
y no se hizo; la hoja de ingredientes está a un toque y Ajustes pide mirar siempre la etiqueta. Las etiquetas de
sin gluten y sin lactosa son declaraciones de quien edita la ficha y la app no las usa para descartar nada.
**Decidir** si merece una segunda pasada que busque palabras clave como aviso extra (un falso aviso cuesta menos
que uno que falta).

### 🟠 «Congélalo o úsalo»: la lista de lo congelable y el plazo son criterio de trabajo

La app no tenía ninguna lista de lo congelable. `shared/lib/congelar.ts` entra por categoría (carne, pescado,
panadería) y, en lácteos, por el nombre (queso, mantequilla, leche); el aviso sale con la fecha efectiva entre
hoy y pasado mañana. Es orientativo y sin fuente, como la tabla de conservación tras abrir: ante la duda no se
recomienda. Falta contrastarlo con una guía oficial, y decidir si «por acabarse» debe contar también lo que queda
en el envase (hoy solo cuenta la fecha).

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
| ⚪ | Los códigos de barras del seed son ficticios con formato EAN-13 válido | Empiezan por `84000000000xx` y **funcionan con el escáner** (se pueden teclear en la pantalla de escanear para probar sin ir a la compra). Podrían chocar con un producto real algún día |

---

## 6. Antes de publicar 🟠

Nada de esto corre prisa hoy, y todo es obligatorio antes de que lo use alguien que no seas
tú.

| | Qué | Por qué |
|:--:|---|---|
| ✅ | ~~Borrar `supabase/seed/03_usuario_dev.sql`~~ | **Resuelto 2026-10-18** ([D-42](BITACORA.md#d-42--ninguna-contraseña-en-el-repositorio--2026-10-18)): el seed ya no lleva ninguna contraseña (las genera `npm run dev:cuentas` al azar por ordenador) y la CI lo vigila (`check:credenciales`). Falta borrar el fichero **solo** si algún día se enlaza un proyecto de la nube: el seed ya se niega a sembrar fuera del Supabase local |
| 🔴 | **La contraseña de desarrollo sigue en la HISTORIA de git** | Estuvo en el repositorio público del 2026-09-21 al 2026-10-18 (commit `30df84a` y los siguientes). Ya está **rotada** y no abre nada, pero está en todos los commits viejos: **antes de volver a hacerlo público hay que purgar la historia** (`git filter-repo --replace-text` sobre todas las ramas y *force-push*, rehaciendo las PR abiertas) o publicar un repositorio nuevo desde una foto limpia |
| 🔴 | **`main` no está protegida mientras el repositorio sea privado** | La protección de ramas no existe en un repositorio privado de una cuenta gratuita (GitHub responde 403): nada exige ya las 4 comprobaciones ni impide empujar a `main`. Se recupera haciéndolo público otra vez (tras purgar la historia) o con GitHub Pro. Mientras tanto, se sigue yendo siempre por PR |
| 🟠 | **Datos de salud: lo que falta tras el consentimiento** | **Hecho el 2026-10-19 ([D-46](BITACORA.md#d-46--consentimiento-explícito-para-los-datos-de-salud-y-borrarlos--2026-10-19)):** el servidor no guarda una lista de salud sin el permiso de su dueña (`consent_version`, con la fecha que pone el servidor), Ajustes lo pide antes de enseñar las casillas y ofrece «Borrar mis datos de salud», y sin permiso vigente la app no cruza nada (y lo dice). **Falta, antes de abrir a usuarios reales:** el **aviso de privacidad completo** (hay un borrador con huecos en [`PRIVACIDAD.md`](../PRIVACIDAD.md): responsable, contacto y base legal los pones tú), **exportar** los datos y **borrar la cuenta desde la app** (hoy solo cae en cascada si alguien la borra en la base), y una **política de retención**. Y las filas de antes del permiso (la de syreta, 15 marcadas) siguen sin usarse hasta que su dueña acepte o las borre |
| 🔴 | **Antes de que la asistente use el perfil personal** | El perfil (ejercicio, dieta, gustos, productos concretos) está guardado y protegido ([D-50](BITACORA.md#d-50--perfil-personal-opcional-con-permiso-propio--2026-10-19)), pero **nada lo usa todavía**. Antes de que `opsi-chat` o los avisos lo lean: **un permiso propio para mandarlo al proveedor del modelo** (tenerlo guardado no lo es), actualizar `docs/PRIVACIDAD.md` y el modelo de amenazas, tratar los «productos concretos» como DATOS y nunca como instrucciones en el prompt, y que lo lea con la sesión de la persona (la RLS) y no con `service_role` |
| 🟡 | **Perfil personal: lo que no está** | Sin opciones religiosas (halal, kosher) ni objetivos (perder o ganar peso): serían otra categoría especial y no se han pedido. Sin exportar ni borrar la cuenta desde la app (como los datos de salud). Sin test automático de que el perfil no sale a un registro ni a una URL. Y la lista cerrada de alimentos (26) es un primer criterio de trabajo |
| 🟠 | SMTP real | Sin él, quien no añada un correo en Ajustes no puede recuperar su contraseña. Ver Q7 y [D-19](BITACORA.md#d-19--el-usuario-es-la-identidad-el-correo-es-opcional--2026-09-21-matiza-d-13) |
| 🟠 | **Borrado de cuenta y de datos** | No existe ninguna vía para que un usuario borre su hogar y su historial. Con datos personales en Europa, esto no es opcional. Tampoco hay política de retención |
| 🟠 | Proyecto de Supabase en **región EU** | Decidido, pero el proyecto aún no está creado |
| ✅ | ~~Límites de uso de la IA por usuario~~ | **Hecho el 2026-10-24** (D-51): `use_chat_quota`, 20 mensajes por hora y 100 al día por persona, con 429 y «Prueba otra vez en N minutos». Queda el **tope global** y ajustar las cifras con uso real (ver la fila del chat) |
| 🟠 | Revisar los términos de uso de Open Food Facts | Piden identificarse con un `User-Agent` con contacto (`OFF_USER_AGENT`), y la licencia ODbL obliga a atribución y compartir igual. Sube de prioridad: el límite real es de **15 peticiones/min por IP**, no 100, y eso condiciona el diseño de la fase 2. Ver [CATALOGOS.md](CATALOGOS.md) |

---

## 7. Lo siguiente, en orden

Actualizado 2026-10-10. **Cerrado esta sesión** (ver la sesión 25 de la bitácora): el repositorio se
revisó entero —no hay ninguna clave real—, `main` está protegida, el aviso privado de
vulnerabilidades y el escaneo de secretos están activos, y hay licencia
([D-30](BITACORA.md#d-30--licencia-todos-los-derechos-reservados--2026-10-10)).

**Decisiones tuyas, de GitHub (ajustes de la cuenta, no del repositorio):**

1. **Esconder tu correo personal.** 22 commits lo llevan y la historia no se toca (ver la
   bitácora). Settings → Emails → *Keep my email addresses private* y *Block command line pushes that
   expose my email*, para que no vuelva a pasar desde ningún equipo. En este repositorio ya se usa
   el correo de GitHub en local.
2. **Confirmar la licencia.** Es la que más conviene que mires: «todos los derechos reservados»,
   la reversible. Si prefieres otra, es un fichero.
3. **Decidir si `docs/internal/` debe ser público.** Lo es desde el primer día y sigue en la
   historia aunque se quite. No tiene claves ni datos personales. La auditoría es la más sensible
   (lista debilidades que aún no se han cerrado): antes de la primera publicación en las tiendas, o
   se mueve a un repositorio privado, o se acepta.

**Del sistema, vuestro:**

4. **A1 · Cortafuegos de Windows.** El stack local escucha en toda la red y el endpoint de SQL de
   `pg-meta` no pide clave. No dejes la pila levantada fuera de casa (`npm run db:stop`).
5. **Reserva DHCP** en el router para que la IP del portátil no cambie (cambió el 8/10 y rompió la
   conexión del móvil).
6. **A4 · Decidir cómo se recupera una cuenta.** Con un SMTP real, el cambio de correo no funciona.

**Fase 2 (el escáner): hecha en local, falta probarla en un móvil** (ver la sesión 26 de la
bitácora). Lo que queda:

7. **Probar la cámara en un móvil con Expo Go.** Es lo único del escáner sin ver. Escanea un
   producto de verdad (si OFF no lo conoce, se crea uno privado en tu nevera) y uno del seed
   tecleando `8400000000017`.
8. **Para que busque en Open Food Facts de verdad en local:** copiar `supabase/.env.example` a
   `supabase/functions/.env`, poner en `OFF_USER_AGENT` el nombre de la app y **un contacto real**
   (el valor de ejemplo se rechaza), y servir la función con `npm run fn:serve`. Sin eso solo
   resuelve lo que ya está en la caché y los códigos que tecleas del seed.
9. **Desplegar la función** cuando haya proyecto de Supabase en la nube: `supabase secrets set`
   con `OFF_USER_AGENT`, `supabase functions deploy lookup-barcode`, y repasar la ficha del endpoint
   del modelo de amenazas (`[ ] prod`).
10. **Ajustar los límites con uso real** (30/min y 500/día por persona, 10/min hacia OFF): son
    cifras razonables elegidas sin datos.
11. **Formatos que el lector no cubre:** UPC-E (hay que expandirlo a 12 cifras) e ITF-14 (cajas).
    Y **un producto escaneado no se puede corregir** (si OFF trae el nombre mal, se cambia el nombre
    del elemento, no el del producto).

**Pendiente de mantenimiento:** las dos exenciones de `docs/security-waivers.json` caducan y la CI
fallará ese día si nadie las revisa. Es a propósito. `node-forge` (sin versión corregida; renovada el
2026-10-19) **caduca el 2026-12-07**. `zod` (la copia 3.25.76 anidada en `@expo/cli`, sin 3.x
corregida; la del linter se subió a 4.6.7) **caduca el 2026-11-24**: se pone corta a propósito, porque
sale con el siguiente parche de Expo. La de `braces` se quitó el 2026-10-24: ya no sale en el informe.
Y **si se renombra un trabajo de la CI hay que actualizar la protección de
`main`**, o las PR se quedan esperando un check que ya no existe.

**Sigue pendiente además:** el logo y `icon.png`/`splash.png` en `app/assets` (ya hay un
`icon.png`; falta revisarlo); y que `eas.json` define `EXPO_PUBLIC_SUPABASE_URL` como `127.0.0.1` en la
build de desarrollo, que en un móvil físico es el propio móvil.
