# Bitácora interna de Opsi

> **Documento de trabajo. No publicar.**
> Vive en `docs/internal/`, que se excluirá si el repositorio deja de ser privado.
> Sirve para dos cosas: recordar **qué se decidió y por qué**, y ser el material en bruto
> del que saldrá el **README final** cuando el MVP esté presentable.
>
> Última actualización: **2026-10-08** (sesión 24)

---

> Los cabos sueltos viven en **[PENDIENTES.md](PENDIENTES.md)**: lo que falta, lo que está
> sin verificar y lo que quedó a medias. Este documento es el porqué; aquél, el qué falta.

## 0. Cómo se usa este documento

| Sección | Para qué | Cuándo se toca |
|---|---|---|
| [1. Estado](#1-estado-actual) | Qué existe hoy, rama por rama | Al terminar cualquier tarea |
| [2. Decisiones](#2-decisiones-tomadas) | Por qué está así. Cada entrada se añade, no se reescribe | Al decidir algo que cueste revertir |
| [3. Convenciones](#3-convenciones) | Cómo se trabaja | Cuando cambia el proceso |
| [4. Próximos pasos](#4-próximos-pasos-fase-0) | Tareas ordenadas con criterio de aceptación | Continuamente |
| [5. Plantilla del README](#5-plantilla-del-readme-final) | El esqueleto del README bonito + qué material falta | Al acercarse a una demo |
| [6. Abierto](#6-preguntas-abiertas) | Lo que aún no está decidido | Continuamente |
| [7. Registro](#7-registro-de-sesiones) | Qué se hizo cada día | Al final de cada sesión |

Regla: **si una decisión se toma en una conversación y no acaba aquí, se ha perdido.**

---

## 1. Estado actual

**2026-09-25 (sesión 23)** — **La fase 1 está completa y ampliada**: inventario, acciones,
«Consumir primero», alta manual, detalle con conservación tras abrir, y ahora **neveras**
([D-21](#d-21--neveras-una-privada-por-persona-y-las-compartidas-que-quiera--2026-09-25)): una
privada por persona más las compartidas que quiera, con nombre e icono y selector en el inicio.
Ajustes está reorganizado por secciones y la app habla con la voz de `docs/VOZ.md`. Tras la
auditoría de seguridad, una **primera pasada** de arreglos ya está aplicada. Lo siguiente es la
fase 2 (el escáner), y antes de ella lo que dice la sección 7 de `PENDIENTES.md`.

| Área | Qué hay hoy |
|---|---|
| Esquema | **26 migraciones**, RLS en todas las tablas, privilegios por defecto cerrados ([D-22](#d-22--los-privilegios-por-defecto-nacen-cerrados--2026-09-25)) |
| Neveras | Privada (nunca se comparte) + compartidas. Límite de **2 neveras por persona** (`household_limit`, que el cliente no escribe), 5 personas por compartida. Se invita por nombre de usuario; aceptar añade |
| Auth | Usuario y contraseña. El alta solo admite correo sintético y el nombre sale del correo ([D-23](#d-23--el-alta-solo-admite-usuarios-de-opsi--2026-09-25)) |
| Tests | **8 ficheros pgTAP, 243 tests**, contra pgTAP real · `db:check`: **414 comprobaciones** en PGlite · `db:carreras`: 8, con dos sesiones a la vez |
| App | Expo SDK 57 · pestañas con barra flotante · inicio con selector de nevera y aviso de invitaciones · Ajustes en 8 secciones · alta con modo «días» · detalle con conservación orientativa e historial |
| Auditoría | `docs/internal/AUDITORIA-2026-09-24.md` (602 líneas, con pruebas contra el entorno local) |

### Verificado vs. no verificado

| | |
|---|---|
| ✅ **Verificado aquí** | `db:reset` (26 migraciones y los 3 seeds) · `db:test` (243) · `db:lint` sin avisos · `db:check` (414) · `db:carreras` (8) · **la CI en verde, por primera vez, en la PR #1** · `types` · en la app: `typecheck`, `lint` y contraste WCAG AA · **en el navegador (web, ancho de móvil) con `syreta` y `compi`**: crear una compartida con nombre e icono, cambiar a ella desde el inicio, dar de alta un alimento y ver en la base que cae en LA elegida y no en la privada, que al volver a la privada no aparece, invitar, ver el aviso en el inicio de la otra cuenta, aceptar (añade, no saca de la propia), el tope de 2 con su mensaje, la gestión como miembro y como privada, renombrar y cambiar el icono |
| ⚠️ **Sin verificar** | **Nada nativo** (desenfoque de iOS, área segura, filas del inventario en nativo) · rechazar y cancelar invitaciones **desde la interfaz** (sí por pgTAP) · las carreras de las funciones de neveras (solo a mano) · dispositivos físicos |

### Tres fallos que cazó `db:check` esta sesión

Vale la pena tenerlos presentes, porque los tres se habrían ido a producción:

1. **`require_item` revocada de más.** Las acciones son SECURITY INVOKER, así que corren
   como el usuario; si él no puede ejecutar la función auxiliar, no puede ejecutar ninguna
   acción. Fallaba todo el bloque de acciones.
2. **`CASE` devolviendo `text` en una columna enum.** En `use_quantity`, los literales
   `'finished'` / `'partially_consumed'` se resolvían como `text` y Postgres rechazaba el
   UPDATE entero. Hacía falta castear a `public.item_state`.
3. **Mi doble de `auth` era más restrictivo que Supabase.** Le faltaba
   `grant usage on schema auth to authenticated`, que Supabase sí concede. Producía un
   fallo que en el Supabase real no existe — el tipo de divergencia que obliga a seguir
   ejecutando `db:test` de verdad.

## 2. Decisiones tomadas

### D-01 · `main` es solo documentación · 2026-09-19

Tres ramas de larga vida: `main` (docs), `backend` (Supabase), `frontend` (Expo).
`backend` y `frontend` **no se fusionan** con `main`; salen de ella y siguen en paralelo.

**Coste asumido, conviene tenerlo presente:**

- No hay un checkout con las dos mitades a la vez → probar app contra backend local exige
  **dos clones** (o dos *worktrees*: `git worktree add ../opsi-backend backend`).
- Los tipos generados por Supabase se producen en `backend` y se consumen en `frontend`:
  hay que **copiarlos a mano** entre ramas, o publicarlos como artefacto de CI.
- `docs/` está duplicada en las tres ramas → **puede divergir**. Regla: la copia de `main`
  es la única fuente de verdad; las otras son solo comodidad de lectura.
- CI tendrá que configurarse por rama, no una vez.

**Alternativa descartada (de momento):** monorepo con `app/` y `supabase/` en `main` y ramas
cortas por tarea. Resuelve los cuatro puntos anteriores. Si el trasiego entre ramas empieza a
doler —probablemente en la fase 2, cuando la app llame a `lookup-barcode`— la migración es
barata: fusionar ambas ramas en `main` conserva todo el historial. **Dejar esa puerta
abierta: no reescribir historia en `backend` ni `frontend`.**

### D-02 · Empezar por el backend · 2026-09-19

La fase 0 se hace en `backend` antes que en `frontend`. Motivo: el esquema y las políticas
RLS condicionan todo lo demás, y el criterio de salida de la fase 0 (dos cuentas que no se
ven) se prueba con tests de base de datos, sin necesidad de interfaz.

### D-03 · La development build se monta en la fase 0 · 2026-09-19

El escáner (fase 2) y las notificaciones push (fase 3) **no funcionan en Expo Go**.
Montar EAS y una *development build* al principio, cuando no hay nada que romper, en lugar
de descubrirlo con la fase 2 a medias.

### D-04 · Los tests de aislamiento entre hogares son de la fase 0 · 2026-09-19

El riesgo «fuga de datos entre hogares» tiene una única mitigación real: un test automático
con dos usuarios que falle en CI. Escribirlo cuando solo hay tres tablas cuesta una tarde;
escribirlo en la fase 5 no se escribe nunca.

---

### D-05 · Monorepo, no ramas paralelas · 2026-09-19 *(revierte D-01)*

`backend` y `frontend` fusionadas en `main` (sin pérdida de historial: ambas salieron de
`main`, así que fue un merge limpio). Estructura: `app/` y `supabase/` en el tronco.

**Motivo:** el coste anticipado en D-01 no compensaba. Con un solo árbol, una columna nueva
en `inventory_items` es **un commit** que toca la migración, los tipos generados y la
pantalla. Repartido en dos ramas era una coreografía a mano, y el trasiego de
`database.types.ts` entre ramas no tenía solución decente.

`main` deja de ser solo documentación: es el tronco. El trabajo va en ramas cortas
(`feat/…`, `fix/…`) que vuelven por PR. Los README de `app/` y `supabase/` conservan las
reglas propias de cada mitad, que era lo bueno de la separación.

**SHA de las ramas antiguas, por si hiciera falta resucitarlas:**
`backend` = `633c043`, `frontend` = `e93e52e`.

### D-06 · Magic link como única entrada · 2026-09-19 *(cierra Q1)*

Sin contraseñas en el MVP.

- **A favor:** nada que almacenar, recuperar ni filtrar. Sin pantalla de recuperación, sin
  validación de fuerza, sin `password_requirements`. Menos superficie y menos pantallas.
- **En contra:** el usuario sale de la app al correo, y volver exige **deep links**
  configurados de verdad (`opsi://`, y que coincida con `app.json`).

**Consecuencias ya aplicadas en `config.toml`:**

| Ajuste | Valor | Por qué |
|---|---|---|
| `auth.site_url` | `opsi://` | Es una app móvil, no hay web a la que volver |
| `auth.additional_redirect_urls` | `opsi://auth/callback` + dos `exp://` | Lista exacta; los `exp://` son solo para Expo Go en desarrollo |
| `auth.email.enable_confirmations` | `true` | Con magic link el enlace *es* la confirmación: así no existen cuentas sin verificar |
| `auth.rate_limit.email_sent` | `30`/hora (por defecto 2) | Con el correo como única vía, 2/hora deja fuera a quien teclee mal su dirección |
| `auth.enable_anonymous_sign_ins` | `false` | Todo cuelga de un hogar; un usuario anónimo no tiene hogar |

**Riesgo asumido:** el correo se convierte en punto único de fallo. Si el proveedor de
SMTP falla en producción, nadie entra. Antes de publicar hay que configurar un SMTP real
(el de Supabase tiene límites bajos) y vigilar la entregabilidad.

### D-07 · Masa, volumen y unidades · 2026-09-19 *(cierra Q5)*

Tres familias: **masa** (g, kg), **volumen** (ml, l) y **unidades** (piezas).

Regla de almacenamiento, que es lo que hay que fijar antes de crear `inventory_items`:

- Se guarda **siempre en la unidad base**: `quantity` en **gramos**, **mililitros** o
  **piezas**, según `unit_family`.
- Se guarda además la unidad **que eligió el usuario** (`display_unit`) para mostrarla
  como la escribió. Quien compra «1 kg de arroz» quiere ver «1 kg», no «1000 g».
- **Entre familias no se convierte nunca.** 200 g de harina no son 200 ml de harina.
  Un producto con `unit_family = 'mass'` no acepta litros, y punto.

Esto hace que «usar cantidad» sea una resta de enteros, y que el chat pueda comparar
cantidades sin adivinar. El coste es una columna más y una conversión en la interfaz.

**Queda fuera:** porciones y estimaciones cualitativas (poco/medio/lleno). Se valorará en
la fase 1 si al usarlo se echan de menos; añadirlas después es una columna, no una migración
dolorosa.

### D-08 · El catálogo global es la única excepción a «todo cuelga de un hogar» · 2026-09-19

`products.household_id` admite NULL, y eso significa «catálogo global»: la caché
compartida que rellena `lookup-barcode` desde Open Food Facts.

**Por qué se acepta la excepción:** sin ella, cada hogar tendría su propia copia de Open
Food Facts. Escanear un producto que otro usuario ya escaneó volvería a provocar una
llamada externa, y la caché de la fase 2 no serviría de nada.

**Cómo se contiene el riesgo:** `is_household_member(NULL)` devuelve `false`, así que las
políticas de INSERT, UPDATE y DELETE **excluyen las filas globales por construcción**.
Un usuario puede leer el catálogo global, pero no escribir en él. Ahí solo escribe
`lookup-barcode` con la `service_role` key, que salta la RLS. Un CHECK remata la regla:
una fila global tiene que declarar `data_source = 'openfoodfacts'`.

### D-09 · El registro de eventos no tiene políticas de escritura · 2026-09-19

`inventory_events` tiene política de SELECT y de INSERT. **No tiene de UPDATE ni de
DELETE**, y eso es lo que las prohíbe: con RLS activada, lo que no está permitido
explícitamente está denegado.

No es un descuido que haya que «completar» más adelante. Un registro que se puede
reescribir no es un registro, y los patrones de consumo y desperdicio posteriores al MVP
se apoyan en que esta tabla sea fiable. El `item_id` usa `ON DELETE SET NULL`, no
CASCADE, por lo mismo: si se borra el elemento, su historia sobrevive.

### D-10 · Todo en unidad base, con la unidad del usuario al lado · 2026-09-19 *(aplica D-07)*

Traducción de D-07 a columnas, ya en `inventory_items`:

| Columna | Qué guarda |
|---|---|
| `unit_family` | `mass` \| `volume` \| `count` |
| `initial_quantity`, `remaining_quantity` | **Siempre en unidad base**: gramos, mililitros o piezas |
| `display_unit` | Lo que eligió el usuario (`g`, `kg`, `ml`, `l`, `unit`) |

Un CHECK impide las combinaciones imposibles: `volume` no acepta `kg`, `count` solo
acepta `unit`. Así «usar cantidad» es una resta de enteros y la conversión vive en la
interfaz, en un solo sitio.

### D-12 · Congelar pausa la cuenta atrás; descongelar la reanuda · 2026-09-19 *(cierra Q6)*

Un yogur al que le quedaban 3 días, congelado 30 y descongelado hoy, vuelve a tener
**3 días**, no 30 ni 1.

**En columnas** (ya en `inventory_items`):

| Columna | Qué guarda |
|---|---|
| `frozen_at` | Cuándo empezó la congelación **en curso**. NULL si no está congelado |
| `frozen_days` | Días completos acumulados de tramos **ya terminados** |

Al descongelar: `frozen_days += (hoy − frozen_at)`, `frozen_at = NULL`, `thawed_at = ahora`.
La fecha límite efectiva es `limit_date + frozen_days`.

Hacen falta las dos columnas porque se puede congelar, descongelar y volver a congelar:
un solo campo perdería los tramos anteriores. Un CHECK garantiza la coherencia
(`state = 'frozen'` ⟺ `frozen_at is not null`), y es lo que impide que un tramo se cuente
dos veces o se pierda.

> **Riesgo que esta decisión acepta, y conviene tener presente.**
> Reanudar el reloj no es lo que dicen las guías de seguridad alimentaria para muchos
> alimentos: lo descongelado suele consumirse en 24 h, tenga los días que tenga. Una
> leche con 3 días, congelada 3 meses y descongelada, aquí muestra 3 días; la
> recomendación real sería «hoy».
>
> Choca con el principio «seguridad antes que desperdicio», así que queda **Q8** abierta:
> ¿se pone un tope al descongelar, del tipo `min(fecha reanudada, descongelado + N días)`?
> Sería un cambio de una línea en la vista de la fase 1, no una migración.

### D-13 · Correo y contraseña en vez de magic link · 2026-09-19 *(revierte D-06, cierra Q7)*

El SMTP de producción (Q7) exige darse de alta en un proveedor y verificar un dominio, y
eso no lo puedo hacer yo. Ante la alternativa planteada, se elige lo simple.

**Lo que se gana, y no es poco:**

- **Registrarse y entrar funciona sin ningún correo configurado.** `enable_confirmations`
  queda en `false` a propósito: creas la cuenta y ya estás dentro.
- **El login funciona en Expo Go desde el primer día.** Con magic link había que volver
  de un correo por deep link, lo que obligaba a montar la development build antes de
  poder probar nada. Ya no.
- Con magic link, un fallo del proveedor de correo dejaba a **todo el mundo fuera**. Con
  contraseña, solo afecta a quien quiera recuperarla.

**Lo que se pierde:** hay contraseñas que gestionar, y **puede haber cuentas con un correo
sin verificar** mientras `enable_confirmations` siga desactivado.

**Ajustes en `config.toml`:**

| Ajuste | Valor | Por qué |
|---|---|---|
| `minimum_password_length` | `10` | La longitud es lo que protege; las reglas de composición solo empujan a «Contrasena1!» |
| `password_requirements` | `""` | Vacío a propósito, por lo mismo |
| `enable_confirmations` | `false` | Para no depender de ningún correo. **Poner a `true` cuando haya SMTP** |
| `site_url` | `opsi://` | Se queda: el correo de recuperación sí necesita volver a la app |

**Q7 no desaparece, baja de prioridad.** Sigue haciendo falta un SMTP real antes de
publicar, para la recuperación de contraseña y para verificar los correos. Pero ya no
bloquea el desarrollo.

### D-14 · Tope de 24 h tras descongelar · 2026-09-21 *(corrige D-12, cierra Q8)*

La fecha límite efectiva de algo descongelado es **la menor** entre la fecha reanudada y
`descongelado + 24 h`. En la práctica gana casi siempre el tope.

**Lo que dicen las fuentes, que no coinciden:**

| Fuente | Qué dice |
|---|---|
| [FSA (Reino Unido)](https://www.food.gov.uk/safety-hygiene/how-to-chill-freeze-and-defrost-food-safely) | Consumir **en 24 h** tras descongelar del todo. No recongelar salvo que se cocine antes |
| [AESAN / agencias españolas](https://www.aesan.gob.es/AECOSAN/web/noticias_y_actualizaciones/noticias/2025/alimentos_refrigerados.htm) | Descongelar en nevera y consumir en **24–48 h**, cuanto antes mejor |
| [USDA FSIS (EE. UU.)](https://ask.fsis.usda.gov/article/How-long-can-meat-and-poultry-remain-in-the-refrigerator-once-thawed) | Más permisivo y **por categoría**: carne picada 1–2 días, piezas de vacuno/cerdo/cordero 3–5 días. Permite recongelar si se descongeló en nevera |

**Por qué 24 h y no la tabla del USDA.** Tres razones, en orden:

1. Opsi es una app española y AESAN es la autoridad que aplica. Coincide con la FSA.
2. Los plazos del USDA son **por categoría de alimento**, y Opsi no sabe con fiabilidad la
   categoría de un elemento dado de alta a mano. Aplicar «3–5 días» a algo que resulta ser
   pescado sería justo el error que este proyecto no quiere cometer.
3. El principio «seguridad antes que desperdicio» rompe los empates hacia el plazo corto.

**Dónde vive:** en la vista `inventory_with_priority`, como una de las tres candidatas.
El número está en un solo sitio (`thawed_at::date + 1`), así que afinarlo por categoría
el día que haya categorías fiables es un cambio localizado.

> **Lo que este tope NO hace:** no distingue tipos de alimento. Un pan descongelado y una
> merluza descongelada reciben el mismo plazo. Es conservador para el pan y correcto para
> la merluza, y ese desequilibrio es deliberado.

### D-15 · Conservación tras apertura: producto → categoría → nada · 2026-09-21 *(cierra Q3)*

Tres sitios, en orden, y el primero que conteste gana:

1. `products.open_shelf_life_days` — lo que el catálogo diga **para ese producto**.
2. `open_shelf_life_reference`, por categoría de Open Food Facts. Si encajan varias, gana
   **la más corta**.
3. Nada. Y «sin fecha» es una respuesta legítima.

Todo lo que salga de 1 o 2 se muestra como `date_source = 'reference'`, es decir
**orientativo**. Lo que diga el envase manda siempre.

> **Un aviso sobre la premisa de Q3.** La respuesta fue «se busca en la base de datos de
> los catálogos la estimación de días abierto por producto». **No he podido confirmar que
> Open Food Facts tenga ese dato de forma estructurada y fiable.** Busqué el campo
> `conservation_conditions` en su taxonomía de categorías y en el esquema de producto de su
> API y no aparece; el proxy de red del entorno me impidió consultar la API en vivo para
> salir de dudas.
>
> Lo que sí sé: OFF tiene un campo de texto libre de condiciones de conservación, en el
> idioma del envase, escrito por voluntarios y **muy disperso**. De ahí no sale un número
> fiable sin parsear frases.
>
> Por eso el paso 2 existe: es el plan B que hace que el sistema funcione aunque el
> catálogo no traiga nada. **Queda por verificar contra la API en vivo** cuando se haga la
> fase 2, y ahí se decidirá si merece la pena parsear ese texto.

Los valores sembrados en `open_shelf_life_reference` son **conservadores y provisionales**:
recogen práctica común de conservación en frigorífico, no una fuente autorizada. Están
marcados como tales en la columna `source` y pendientes de revisión.

### D-16 · Los tipos generados se versionan · 2026-09-21 *(cierra Q2)*

`app/src/lib/database.types.ts` sale de `.gitignore` y se commitea. La CI ejecuta
`npm run types` y falla si el fichero cambia.

**Por qué así y no regenerándolos en cada trabajo:** el trabajo de typecheck de la app no
necesita entonces ni Docker ni base de datos, con lo que tarda segundos en vez de minutos.
Y quien clona el repositorio tiene tipos válidos sin levantar nada. El riesgo de esta
opción —olvidarse de regenerarlos tras cambiar el esquema— es exactamente lo que caza la
comprobación de la CI.

**Pendiente:** el fichero **todavía no existe**, porque generarlo exige Docker. La
comprobación de la CI está condicionada a que exista `app/package.json`, así que no pone
nada en rojo mientras no haya app. El primer `npm run types` en una máquina con Docker lo
crea, y ahí hay que commitearlo.

### D-17 · Ollama en desarrollo; el modelo de producción sin decidir · 2026-09-21 *(aplaza Q4)*

Las pruebas de la fase 5 se harán contra Ollama en local. No se cierra nada sobre el
modelo de producción.

**Consecuencia para el diseño, y es la razón de anotarlo ahora:** la Edge Function
`opsi-chat` tendrá que hablar con el modelo **detrás de una costura**, no llamando a un
SDK concreto desde su lógica. El bucle de *tool use* y la ejecución de herramientas son
nuestros; el cliente del modelo, intercambiable por variable de entorno.

Ojo con lo que esto no resuelve: el *tool use* de Ollama y el de la API de Claude no son
idénticos en formato ni en fiabilidad. Que funcione en Ollama no demostrará que funciona
en producción, y viceversa. Sirve para desarrollar sin gastar, no para validar.

### D-18 · Convenciones de psique, no su código · 2026-09-21

Se revisaron `psique-frontend`, `morfeo` y `back-sira-platano` para reaprovechar trabajo.
**No hay código portable**, y conviene que quede escrito para no volver a mirarlo:

| Proyecto | Qué es | Por qué no se puede copiar |
|---|---|---|
| `psique-frontend` | React **web**: Vite, Tailwind, React Router, TanStack Query, Zustand | Opsi es React Native. Ahí no existen `div`, `className` ni Tailwind: sus componentes no compilan |
| `morfeo` | Backend **Python/FastAPI** con Alembic | Opsi es SQL sobre Supabase |

Lo que sí se ha traído, que es lo que de verdad valía:

1. **La estructura de carpetas.** `src/shared/ui`, `src/shared/lib`, `src/api/<dominio>.ts`.
   Opsi tenía `src/components` y `src/lib`; ahora las dos bases se leen igual.
2. **El patrón de los módulos de API.** En psique, `src/api/stories.ts` son funciones
   planas, sin hooks, una por operación. Opsi copia la forma en `src/api/inventory.ts`:
   los hooks de TanStack Query viven en las pantallas, no en la capa de datos.
3. **TanStack Query**, que psique ya usa y estaba anotado como deuda en PENDIENTES.
4. **De morfeo, una idea, no código**: *«el LLM no calcula»*. Allí los minutos los pone
   una función pura del dominio y el modelo solo entrevista y explica. Es exactamente la
   postura que necesita la fase 5 de Opsi: la fecha límite la calcula la vista en SQL, y
   la asistente la cuenta. Queda apuntado para cuando llegue.

**Lo que NO se ha traído:** Zustand. Psique lo usa para su store de auth; Opsi usa un
contexto de React, que ya funciona y es lo idiomático con los layouts de Expo Router.
Cambiarlo sería churn sin ganancia. Si algún día hay estado compartido de verdad —más
allá de la sesión— se reconsidera.

### D-19 · El usuario es la identidad; el correo es opcional · 2026-09-21 *(matiza D-13)*

D-13 cambió el magic link por correo y contraseña y quitó la dependencia del SMTP para
entrar. Quedaba una fricción que no tenía por qué existir: **pedir un correo para algo
que no lo necesita**. Opsi no manda nada salvo la recuperación de contraseña, así que el
correo pasa a ser opcional y la identidad pasa a ser el nombre de usuario.

**El problema:** GoTrue solo sabe autenticar por correo o por teléfono. No existe el
inicio de sesión por nombre de usuario, ni un ajuste que lo active.

**Lo que se descartó, y por qué:**

| Opción | Por qué no |
|---|---|
| Buscar el correo por usuario antes de entrar | Necesita una función pública que responda «este usuario existe» a quien pregunte: un oráculo de enumeración de cuentas, y encima abierto a `anon` |
| Un Auth Hook que traduzca usuario → correo | Solo en planes de pago de Supabase, y no existe en el entorno local |
| Teléfono en lugar de correo | Pide un proveedor de SMS, que es exactamente la dependencia que D-13 quitó |

**Lo elegido: correo sintético.** Cada cuenta lleva un correo derivado del nombre,
`syreta@usuarios.opsi.local`, que no existe y al que no se envía nada. La app lo compone
en el cliente y el usuario no lo ve nunca.

Tiene una ventaja que no era el objetivo: **GoTrue ya exige que el correo sea único**, así
que el nombre de usuario es único gratis, sin consultas previas y sin oráculo.

**El correo de verdad** se añade en Ajustes → Cuenta. Al confirmarlo, GoTrue
*reemplaza* el sintético por el real, y desde ese momento la recuperación estándar de
Supabase funciona sin que haya que inventar nada. `mi_correo()` distingue los dos casos
mirando el dominio, sin exponer `auth.users`.

**El usuario es inmutable**, y no por una regla de la app: la migración quita el `UPDATE`
de tabla sobre `user_settings` y lo devuelve columna a columna, dejando `username` fuera.
Cambiarlo dejaría el correo sintético apuntando al nombre anterior —se seguiría entrando
con el viejo mientras la app enseña el nuevo—, y esa incoherencia es peor que la
limitación. Revocar solo la columna no habría servido: en PostgreSQL un permiso de tabla
sigue cubriéndolas todas.

**La regla vive en dos sitios**, `public.dominio_sintetico()` y `shared/lib/usuario.ts`,
porque el cliente tiene que componer el correo **antes** de tener sesión, que es
justamente cuando no puede preguntarle nada a la base de datos.

**Usuario de desarrollo:** `syreta` / `opsi-dev-2026`, sembrado en
`supabase/seed/03_usuario_dev.sql`. Es una contraseña conocida escrita en el repositorio:
vale solo para el Supabase local y hay que borrar ese fichero antes de sembrar en la nube.
Queda anotado en los pendientes.

**Q7 sigue abierta y sube un poco de prioridad**: quien no añada un correo no tiene forma
de recuperar la contraseña.

### D-20 · Categorías de supermercado · 2026-09-21

El nombre de un alimento es texto libre y tiene que seguirlo siendo —nadie busca «Leche
semidesnatada sin lactosa» en un desplegable—, pero eso dejaba el inventario **sin ninguna
forma de agruparlo que no fuera la urgencia**. Diez pasillos de supermercado son esa
forma, y se elige el supermercado porque es como ya tiene la gente organizada la cabeza al
hacer la compra.

**Por qué un enum nuevo y no `products.categories_tags`:**

| | |
|---|---|
| `categories_tags` | Viene de Open Food Facts, son decenas de etiquetas por producto y sirven para **buscar** la conservación tras apertura ([D-15](#d-15--conservación-tras-apertura-producto--categoría--nada--2026-09-21-cierra-q3)). No es una taxonomía con la que pintar una lista |
| Un alta manual | No tiene producto de catálogo, así que no tendría ninguna etiqueta. Y el alta manual es el camino principal |

**Diez valores, ni uno más.** Una fila de filtros que no cabe en un móvil no la usa nadie.

**Se adivina, no se pregunta.** `adivinarCategoria()` la deduce del nombre con las mismas
reglas que ya elegían el icono, y el usuario solo la toca si falla. Un campo obligatorio
que casi nunca hay que rellenar es la diferencia entre un formulario corto y uno que da
pereza. El chip propuesto se marca con una estrellita: que se note que lo ha puesto la app.

**Abierto y cerrado no son estados, es una fecha.** El filtro mira `opened_at`, no una
lista de estados. Lo abierto no se vuelve a cerrar, y por eso no existe un estado
«cerrado» en el enum: mirar la fecha evita que «descongelado» o «medio usado» se queden
fuera de las dos cajas.

**El filtro no filtra por defecto.** «Consumir primero» ordenado por urgencia es lo que
hay que ver al abrir la app; buscar algo concreto es la excepción. Y solo se ofrecen los
pasillos que existen en tu inventario: enseñar «Pescado» sin tener ninguno es prometer una
lista vacía.

### D-21 · Neveras: una privada por persona y las compartidas que quiera · 2026-09-25

*Decidida por el usuario; sustituye a «un hogar por persona» del MVP. Los detalles de
implementación y de migración de datos están en la sesión 22.*

Cada persona tiene **una nevera privada** que no se comparte nunca, y puede **crear neveras
compartidas** con nombre e icono, invitar por nombre de usuario y cambiar entre todas desde el
inicio. **Aceptar una invitación añade una nevera; no saca de ninguna.** El límite es de
**neveras por persona**: 2 ahora (la tuya y una compartida) y 5 con un plan de pago que aún no
existe. Vive en `user_settings.household_limit`, y el cliente no puede escribirlo.

**Alternativas descartadas:**

- *Compartir tu propia nevera* (lo que había): invitar a alguien enseñaba TODO lo de tu
  privada, y «la mía» y «la compartida» eran la misma para quien invitaba. Además aceptar te
  movía y dejabas la tuya.
- *Solo nombre e icono, sin selector*: dejaba sin resolver que una persona no puede estar en dos
  sitios.

**Lo que costó, y conviene tener presente:** «el hogar del usuario» dejó de existir. Solo
`create_item` lo daba por hecho en el servidor (con un `limit 1` sin `order by`: con dos
pertenencias caía en una nevera al azar y en silencio), pero **todo cliente tiene que acotar por
`household_id`**: `inventory_items`, `inventory_with_priority` e `inventory_events` devuelven ahora
las neveras de la persona **mezcladas**. Hay un test que lo documenta.

### D-22 · Los privilegios por defecto nacen cerrados · 2026-09-25

Supabase concede todo a `anon`, `authenticated` y `service_role` sobre cada tabla nueva. Ya pasó
una vez (fase 0: `authenticated` con INSERT/UPDATE/DELETE sobre todo) y se arregló **por
disciplina**, tabla a tabla. Ahora es estructural: `auto_expose_new_tables = false` en
`config.toml` y `alter default privileges` en `20260924140000`. Una tabla nueva nace sin permisos
para nadie y cada migración concede lo que quiere. Incluye a `service_role`, porque en la nube
nueva también lo exige (proyectos nuevos desde 2026-05-30, todos el 2026-10-30).

**Lo que NO cubre:** las funciones (PUBLIC conserva EXECUTE por omisión y quitarlo globalmente
rompería a pgTAP y a las extensiones que se instalen después) y los objetos que cree
`supabase_admin`, cuyos permisos por defecto no se pueden cambiar desde `postgres`. Para las
funciones, lo que hace cumplir la regla es `privilegios_test.sql`: falla si `anon` puede ejecutar
algo que no sea `dominio_sintetico()`. **Salieron dos cosas que la auditoría no vio**: `anon`
podía ejecutar `touch_updated_at()` y había permisos sobre dos secuencias. Ambas cerradas.

### D-23 · El alta solo admite usuarios de Opsi · 2026-09-25

`handle_new_user` sacaba el nombre visible de `raw_user_meta_data`, que escribe el cliente: con
un `signUp` directo se podía tener la cuenta «admin». Ahora **solo se admiten correos sintéticos**
(`usuario@usuarios.opsi.local`, 3–20 de `[a-z0-9_]`), **el nombre sale del correo**, y hay diez
nombres reservados. Añadir un correo real después sigue funcionando (es un UPDATE, no un alta).
**Coste asumido:** una cuenta creada desde el dashboard con un correo real se rechaza.
**Sigue pendiente:** captcha o alta por Edge Function (30 altas por IP cada 5 minutos, sin
fricción) y comprobar contraseñas filtradas. Antes de publicar.

### D-24 · La zona horaria se valida en el servidor · 2026-09-25

Un trigger contrasta `user_settings.timezone` con `pg_timezone_names`. Sin él, una zona inventada
rompía `today_for_user()` y, en la fase 3, un solo usuario abortaría el resumen diario de todos.

### D-25 · Los tipos los escribe un script, no una redirección · 2026-09-25

`npm run types` era `supabase gen types … > app/src/lib/database.types.ts`. El `>` vacía el
fichero **antes** de que la CLI arranque: cuando falló (Postgres todavía levantándose), lo que quedó
dentro fue el mensaje de error, y `tsc` reventó en toda la app con «';' expected» cuya causa —un
`types` fallido de dos días antes— no se parecía en nada al síntoma. `scripts/gen-types.mjs`
genera a memoria, comprueba que sea de verdad un fichero de tipos y solo entonces lo sustituye. Si
algo falla, el anterior queda intacto.

### D-26 · Las acciones sobre un elemento bloquean la fila · 2026-10-08

`require_item()` leía el elemento sin bloquearlo y las seis acciones decidían con lo leído.
Con neveras compartidas, dos personas pueden pulsar a la vez sobre el mismo yogur. Comprobado
con dos sesiones reales: una lo terminaba y otra lo tiraba, y el elemento acababa `discarded`
con un historial —inmutable— que decía las dos cosas; o dos personas gastaban 600 g de 1000 g y
la segunda recibía el error de un CHECK en vez de «solo quedan 400». **`for update` en la
lectura**: la segunda sesión espera y vuelve a leer la fila ya cambiada. Una sola función, un solo
sitio. Se comprueba con `scripts/check-carreras.mjs` (`npm run db:carreras`, también en la CI),
no con pgTAP, porque una carrera necesita dos sesiones y pgTAP corre en una. **Se verificó que
falla sin la migración.**

**Descartado:** `lock_timeout` (cada acción es una llamada corta y PostgREST ya corta las largas) y
una versión en la fila para bloqueo optimista (obliga al cliente a saberlo y reintentar).

### D-27 · `service_role` solo con lo que usa · 2026-10-08

Es la clave que vivirá dentro de las Edge Functions y salta la RLS: lo único que la acota son sus
permisos de tabla. Salió que, en las tablas existentes, conservaba `TRUNCATE`, `REFERENCES`,
`TRIGGER` y `MAINTAIN` —los permisos «de fábrica» de Supabase— porque las migraciones de la fase 0
solo revocaron los de `anon` y `authenticated`. Ahora no tiene **nada** salvo `SELECT`, `INSERT` y
`UPDATE` sobre `products` (lo que necesita `lookup-barcode`). Cada función nueva que necesite otra
tabla lo pide por escrito, y `privilegios_test.sql` falla si aparece algo que no estaba previsto.
**Lo encontré al escribir el inventario de superficie, no en la auditoría**, que no miró `service_role`.

### D-28 · Un error que no se reconoce no se enseña · 2026-10-08

`describeDbError` y `describeAuthError` terminaban en `return message`: lo que no reconocían salía
tal cual, en inglés y a veces con el nombre de una restricción. Ahora va a un mensaje genérico que
dice qué hacer (`error-generico.ts`), y el detalle sale por la consola **solo en desarrollo**. Ese
fichero es además el único punto por el que pasa todo lo no traducido: ahí se engancha la
monitorización cuando exista. Para que esto no se tragase mensajes nuestros, `28000` pasa a la lista
de códigos propios (16 sitios de las migraciones lo lanzan), y **añadir un `errcode` nuevo en una
migración obliga ahora a decidir aquí qué se hace con él**. También hay un *error boundary* en el
layout raíz que no depende del tema ni de las fuentes, porque puede ser justo lo que falló.

### D-29 · La CI tiene puertas de seguridad bloqueantes, y las exenciones caducan · 2026-10-08

Acciones pinadas a SHA completo, permisos mínimos, `persist-credentials: false`, tiempo máximo por
trabajo, Node 24 (el 20 salió de soporte en abril). Y dos puertas nuevas: **gitleaks** sobre todo el
historial, y una de **dependencias** (`scripts/check-audit.mjs`).

`npm audit --audit-level=high` a secas no sirve aquí: da 21 paquetes marcados, **todos de la
cadena de herramientas de Expo** (Metro, Expo CLI), y los «arreglos» que sugiere son *bajar* a
`expo@44` o `react-native@0.72`. Una puerta que falla siempre acaba ignorada, y entonces deja de
vigilar también lo que sí importa. Esas 21 salían de **solo 4 avisos**: uno crítico (`shell-quote`)
y tres altos. El crítico y uno alto (`source-map-js`) se arreglaron subiendo **solo ese paquete**
dentro de su rango (dos cambios en el lockfile, nada más). Los otros dos (`braces`, `node-forge`)
**no tienen versión corregida publicada**, y están exentos en `docs/security-waivers.json`, por
aviso y no por paquete —eximir un paquete entero taparía los avisos de mañana— con motivo y **fecha
límite**: pasada, la puerta vuelve a fallar. No hay exenciones permanentes.

**Descartado:** `npm audit fix --force` (bajaría Expo cuarenta versiones) y `audit-ci` (una
dependencia nueva para lo que hacen cincuenta líneas).

## 3. Convenciones

### Ramas

`main` es el tronco y lleva todo el código. El trabajo va en ramas cortas que salen de
`main` y vuelven por PR:

```
main  ──●────●────────●────●──────►
         \        /      \      /
          ●──────●        ●────●
      feat/rls-hogares   chore/ci-pgtap
```

Nombres: `feat/rls-hogares`, `fix/fecha-efectiva-congelado`, `chore/ci-pgtap`.

### Commits

Formato convencional con ámbito: `tipo(ámbito): qué`, en imperativo y en español.

```
feat(inventory): registrar evento al abrir un elemento
fix(rls): impedir lectura cruzada en shopping_list_items
chore(ci): ejecutar pgTAP en cada push
```

### Migraciones

- Una migración por cambio conceptual. **Una migración aplicada no se edita jamás**: se
  corrige con otra nueva.
- «Aplicada» significa **ejecutada en algún sitio que sobreviva**: un `db:push` a la nube,
  o la base local de alguien. Mientras nada se haya desplegado —el caso de hoy— editar una
  migración en el sitio es lo correcto: no hay divergencia que proteger y el historial
  queda limpio. Desde el primer `db:push`, la regla manda sin excepciones.
- La tabla y su política RLS van **en la misma migración**. Nunca una tabla sin política,
  ni siquiera «por un rato».
- Nombre: `<YYYYMMDDHHMMSS>_descripcion.sql`, por ejemplo
  `20260919120200_inventory_items.sql`.

> **Corrección de la sesión 1.** Aquí ponía `20260919T1200_…`, con una `T`. La CLI de
> Supabase lee la versión de la migración de los **dígitos iniciales** del nombre, así que
> esa `T` habría partido el identificador y roto el orden de aplicación. Catorce dígitos
> seguidos, sin separadores.

### Tipos generados

`npm run types` → `app/src/lib/database.types.ts`.

Sigue en `.gitignore`: se regenera, no se versiona. Con el monorepo (D-05) esto ya no
duele, porque el esquema y la app están en el mismo checkout: quien cambia una migración
regenera los tipos en el mismo `npm run db:reset && npm run types`.

**Q2 sigue abierta** para la CI: habrá que decidir si el pipeline regenera los tipos
(levantar Postgres en cada PR, lento pero siempre correcto) o si se versionan y se
comprueba que no han cambiado (rápido, pero se olvida regenerarlos).

---

## 4. Próximos pasos (fase 0)

Objetivo: **un esqueleto que compila, autentica y despliega.**
Criterio de salida: *un usuario se registra, tiene su hogar creado y no puede leer datos de
otro usuario, probado con dos cuentas.*

### Bloque A · Supabase en marcha — ✅ hecho (2026-09-19)

Enfoque *local-first*: **no hace falta cuenta en supabase.com para desarrollar.** La nube
se enlaza cuando haya algo que desplegar, y el procedimiento está escrito en
[`docs/SETUP.md`](../SETUP.md).

| # | Tarea | Resultado |
|:--:|---|---|
| A1 | ~~Crear proyecto en supabase.com~~ → **aplazado a propósito** | Todo corre en Docker. Crear el proyecto en la nube es un paso de despliegue, no de arranque. Cuando toque: **región EU** (Fráncfort o Irlanda), por RGPD |
| A2 | CLI + `supabase init` + configuración | ✅ CLI 2.117.0 fijada en `package.json`, `config.toml` ajustado a Opsi y validado. **`db:start` sin probar: falta Docker aquí** |
| A3 | Separación de secretos | ✅ `.env.example` (público, cliente) y `supabase/.env.example` (servidor). Tabla de qué es secreto en `docs/SETUP.md` |

**Lo importante de A3**, que es lo que se olvida y luego cuesta caro: lo que lleva prefijo
`EXPO_PUBLIC_` **acaba incrustado en el binario** y es legible por cualquiera que descargue
la app. Ahí solo va la URL y la `anon key`, que son públicas por diseño y están protegidas
por RLS. La `service_role` key y la de Anthropic no tocan el cliente jamás.

**Scripts disponibles desde la raíz:** `db:start`, `db:stop`, `db:status`, `db:reset`,
`db:diff`, `db:test`, `db:lint`, `types`, `link`.

### Bloques B y C · Esquema y seguridad — ✅ hechos (2026-09-19)

Siete migraciones, una por tabla salvo la primera, que lleva `households`,
`household_members` y la función de la que depende toda la RLS.

| Migración | Contiene |
|---|---|
| `…120000_households.sql` | `households`, `household_members`, `is_household_member()`, `touch_updated_at()` |
| `…120100_products.sql` | Catálogo, con la mitad global ([D-08](#d-08--el-catálogo-global-es-la-única-excepción-a-todo-cuelga-de-un-hogar--2026-09-19)) |
| `…120200_inventory_items.sql` | El elemento real, con los principios como CHECK |
| `…120300_inventory_events.sql` | Registro inmutable ([D-09](#d-09--el-registro-de-eventos-no-tiene-políticas-de-escritura--2026-09-19)) |
| `…120400_shopping_list_items.sql` | Lista de la compra (tabla ya, funcionalidad en fase 4) |
| `…120500_user_settings.sql` | Ajustes por usuario, no por hogar |
| `…120600_new_user_trigger.sql` | `handle_new_user()` + trigger sobre `auth.users` |

**Las tres decisiones de diseño que conviene no olvidar:**

1. **`is_household_member()` es `SECURITY DEFINER` por necesidad, no por comodidad.** Se
   usa dentro de la política de la propia `household_members`; si se ejecutara con los
   permisos de quien consulta, leer la tabla volvería a evaluar la política, que volvería
   a llamar a la función: Postgres corta con *infinite recursion detected in policy*.
   Ejecutándose como el propietario, la lectura interna no pasa por RLS y el ciclo se
   rompe. A cambio hay que blindarla: `search_path = ''` y nombres cualificados, para que
   nadie pueda colar un esquema propio por delante.

2. **Los principios del proyecto son CHECK, no convenciones.** `num_nonnulls(limit_date,
   date_kind, date_source) in (0, 3)` es «no inventar datos» hecho cumplir por la base:
   una fecha sin saber si es caducidad o preferente y de dónde salió **no entra**.

3. **RLS y GRANT son dos capas distintas y hacen falta las dos.** La RLS filtra filas;
   los GRANT deciden quién puede siquiera intentarlo. Se revoca todo a `anon` en cada
   tabla: sin GRANT, la política nunca llega a evaluarse.

**Lo que se dejó fuera a propósito:** la vista `inventory_with_priority` y las funciones
RPC de acciones son **fase 1**, no fase 0. La vista además depende de [Q6](#6-preguntas-abiertas),
que sigue abierta: no se puede calcular la fecha límite efectiva de un elemento
descongelado sin decidir antes qué le pasa a su cuenta atrás.

### Bloque C4 · Tests — ✅ hechos

| Fichero | Qué prueba |
|---|---|
| `supabase/tests/rls_isolation_test.sql` | El criterio de salida: dos cuentas, siete tablas, y que Bruno no ve ni toca nada de Ana. También que `anon` no llega ni a leer |
| `supabase/tests/domain_constraints_test.sql` | Que las restricciones rechazan el dato malo: fechas sin origen, unidades imposibles, eventos incoherentes |

**Sin `plan(N)`, con `no_plan()`**, a propósito: un plan mal contado falla por una razón
que no tiene nada que ver con la seguridad, y aquí nadie ha podido ejecutar pgTAP real
todavía. Cuando los ficheros se estabilicen, pasar a `plan(N)` para detectar además los
tests que no llegan a correr.

**Un detalle que costó un fallo y conviene recordar:** un UPDATE o un DELETE bloqueados
por RLS **no lanzan error**, simplemente no encuentran filas. Un test que solo busque
excepciones da por buenas esas dos vías. Por eso se comprueban contando.

### Bloque D · App en marcha

| # | Tarea | Hecho cuando |
|:--:|---|---|
| D1 | `npx create-expo-app app --template` con TypeScript + Expo Router | `npx expo start` arranca |
| D2 | Cliente de Supabase en `src/lib/supabase.ts` con `anon key` desde env | Conecta contra el Supabase local |
| D3 | Pantalla de login (magic link) + sesión persistida | Cerrar y abrir la app mantiene la sesión |
| D4 | Rutas protegidas: sin sesión → login | No se llega al inventario sin autenticarse |
| D5 | Cuenta EAS + *development build* ([D-03](#d-03--la-development-build-se-monta-en-la-fase-0--2026-09-19)) | La build instala en un móvil real |

### Bloque E · CI

| # | Tarea |
|:--:|---|
| E1 | `npm run db:lint`, `db:reset` y `db:test` en cada push (Supabase en Docker sobre el runner) |
| E2 | `tsc --noEmit` + ESLint + Prettier sobre `app/` |
| E3 | `main` protegida: no se mergea con CI en rojo |
| E4 | Resolver Q2: ¿la CI regenera los tipos o comprueba que los versionados siguen al día? |

### Orden sugerido

```
[A✅ B✅ C✅] ──► queda ejecutarlo con Docker
                 D1 → D2 → D3 → D4 → D5      ← el camino que sigue
                             E1 → E2 → E3 → E4
```

**Siguiente tarea concreta, y es una sola:**

```bash
npm run db:start && npm run db:reset && npm run db:test
```

En una máquina con Docker. Es lo único que separa la fase 0 de estar terminada. Si los
INSERT en `auth.users` de los ficheros pgTAP fallan por una columna NOT NULL, es un
arreglo de una línea en la lista de columnas.

Después, D1: `npx create-expo-app` con TypeScript y Expo Router.

---

## 5. Plantilla del README final

El README de `main` de hoy es **funcional pero sobrio**: explica bien y no tiene una sola
imagen. El README «bonito» se escribe cuando haya algo que enseñar (final de la fase 1 o 2,
cuando el escáner funcione). Este es el esqueleto y el material que hará falta.

### Esqueleto

```markdown
<div align="center">
  <img src="docs/assets/logo.svg" width="120">
  <h1>Opsi</h1>
  <p><b>Know what you have. Know when to use it. Waste less. Buy smarter.</b></p>
  [badges: build · licencia · Expo · Supabase]
  <img src="docs/assets/demo.gif" width="280">      ← el GIF es lo que engancha
</div>

1. El problema           2 frases. «Tiras comida que no sabías que tenías»
2. Qué hace Opsi         3 capturas en fila: Consumir primero · Escáner · Chat
3. Cómo funciona         El diagrama del recorrido del alimento
4. Arquitectura          Tabla de decisiones + diagrama de capas
5. Empezar               Bloque de comandos que funcionen de verdad, copiar y pegar
6. Estado                Tabla de fases con casillas marcadas
7. Principios            Los seis innegociables (es lo que diferencia el proyecto)
8. Licencia y créditos   Open Food Facts merece mención explícita
```

### Material que hay que producir

| Qué | Cuándo se puede | Nota |
|---|---|---|
| **GIF de demo** (10-15 s) | Tras fase 2 | Escanear → aparece en inventario → abrir → sube en «Consumir primero». *Es el 80 % del impacto del README* |
| 3 capturas | Tras fase 1-2 | Mismo dispositivo, mismos datos de ejemplo, modo claro |
| Logo / wordmark | Cuando sea | Un SVG sencillo basta |
| Diagrama de capas | Ya | Pasar el ASCII actual a SVG (Excalidraw) |
| Badges de CI | Tras E1-E3 | Solo cuando la CI sea real; un badge en rojo es peor que ninguno |
| Datos de ejemplo bonitos | Tras fase 1 | Un `seed/` con nombres reales y fechas creíbles para las capturas |

### Reglas para que quede bien

- **Una imagen antes del primer scroll.** Sin eso, el resto da igual.
- Capturas **siempre con los mismos datos**: un inventario incoherente entre capturas se nota.
- Los comandos del README se prueban en un clon limpio antes de publicarlos.
- Nada de casillas marcadas en fases que no estén terminadas de verdad.
- El README de `main` de hoy ya sirve de base: lo que falta es **material visual**, no texto.

---

## 6. Preguntas abiertas

| # | Pregunta | Por qué importa | Cuándo hay que decidirlo |
|:--:|---|---|---|
| ~~Q1~~ | ~~¿Magic link o contraseña?~~ | **Cerrada: magic link** ([D-06](#d-06--magic-link-como-única-entrada--2026-09-19-cierra-q1)) | ✅ |
| ~~Q2~~ | ~~¿Se versionan los tipos generados?~~ | **Cerrada: sí, con comprobación en CI** ([D-16](#d-16--los-tipos-generados-se-versionan--2026-09-21-cierra-q2)) | ✅ |
| ~~Q3~~ | ~~¿De dónde salen las fechas de conservación tras apertura?~~ | **Cerrada: producto → categoría → nada** ([D-15](#d-15--conservación-tras-apertura-producto--categoría--nada--2026-09-21-cierra-q3)). Queda verificar el campo de Open Food Facts en la fase 2 | ⚠️ |
| Q4 | ¿Qué modelo en producción? | **Aplazada**: en desarrollo se usa Ollama ([D-17](#d-17--ollama-en-desarrollo-el-modelo-de-producción-sin-decidir--2026-09-21-aplaza-q4)). La costura tiene que estar puesta desde el principio | Fase 5 |
| ~~Q5~~ | ~~¿Cuántas unidades permite el MVP?~~ | **Cerrada: masa, volumen y unidades** ([D-07](#d-07--masa-volumen-y-unidades--2026-09-19-cierra-q5)) | ✅ |
| ~~Q6~~ | ~~¿Qué pasa con un elemento congelado?~~ | **Cerrada: se reanuda** ([D-12](#d-12--congelar-pausa-la-cuenta-atrás-descongelar-la-reanuda--2026-09-19-cierra-q6)) | ✅ |
| Q7 | ¿Qué SMTP en producción? | No bloquea el desarrollo: se entra con usuario y contraseña ([D-13](#d-13--correo-y-contraseña-en-vez-de-magic-link--2026-09-19-revierte-d-06-cierra-q7), [D-19](#d-19--el-usuario-es-la-identidad-el-correo-es-opcional--2026-09-21-matiza-d-13)). Pero sin SMTP, quien no añada un correo no puede recuperar la contraseña | Antes de publicar |
| **Q8** | ¿Se pone tope de seguridad al descongelar? | Reanudar el reloj choca con «seguridad antes que desperdicio» para lo descongelado. Ver el aviso en [D-12](#d-12--congelar-pausa-la-cuenta-atrás-descongelar-la-reanuda--2026-09-19-cierra-q6) | Fase 1, con la vista |

---

## 7. Registro de sesiones

### 2026-09-19 · Estructura del repositorio

- Leído y analizado `Opsi_01_Roadmap.pdf` (5 páginas, fases 0-6).
- Creadas las tres ramas de larga vida con su propósito ([D-01](#d-01--main-es-solo-documentación--2026-09-19)).
- `main`: README explicativo, `docs/ARQUITECTURA.md` (decisiones y su porqué),
  `docs/GLOSARIO.md` (producto vs. elemento, estados, tipos y orígenes de fecha).
- `backend` y `frontend`: README propio, esqueleto de carpetas, `.gitignore`.
- Creada esta bitácora con la fase 0 desglosada en 5 bloques y 19 tareas.
- **Sin código ejecutable todavía.** Siguiente sesión: bloque A.

### 2026-09-19 (sesión 2) · Monorepo y bloque A

- **Revertida D-01**: `backend` y `frontend` fusionadas en `main` ([D-05](#d-05--monorepo-no-ramas-paralelas--2026-09-19-revierte-d-01)).
  Merge limpio, sin pérdida de historial. Los README de cada mitad sobreviven como
  `supabase/README.md` y `app/README.md`.
- **Respondidas Q1 y Q5** → [D-06](#d-06--magic-link-como-única-entrada--2026-09-19-cierra-q1) (magic link) y [D-07](#d-07--masa-volumen-y-unidades--2026-09-19-cierra-q5) (unidades).
- **Bloque A terminado** en modo local-first: CLI fijada, `config.toml` ajustado y validado,
  secretos separados en dos `.env.example`, `docs/SETUP.md` escrito.
- **Pendiente de verificar:** ningún comando que levante Docker se ha podido ejecutar.
- Abierta Q7 (SMTP de producción), consecuencia directa de elegir magic link.

### 2026-09-19 (sesión 3) · Esquema, seguridad y tests

- **Bloques B y C terminados**: 7 migraciones, 7 tablas, 8 enumerados, 20 políticas RLS,
  función `is_household_member()` y trigger de hogar personal.
- **Bloque C4**: dos ficheros pgTAP con 39 aserciones, incluido el criterio de salida.
- **Montado `npm run db:check`**: aplica las migraciones sobre Postgres compilado a
  WebAssembly y ejecuta las aserciones, incluidos los ficheros pgTAP con dobles. 73
  comprobaciones, todas en verde, sin necesidad de Docker.
- **Tres decisiones nuevas**: [D-08](#d-08--el-catálogo-global-es-la-única-excepción-a-todo-cuelga-de-un-hogar--2026-09-19) (catálogo global), [D-09](#d-09--el-registro-de-eventos-no-tiene-políticas-de-escritura--2026-09-19) (eventos inmutables) y [D-10](#d-10--todo-en-unidad-base-con-la-unidad-del-usuario-al-lado--2026-09-19-aplica-d-07) (unidades en columnas).
- **Corregido un error de la sesión 1**: la convención de nombre de migración llevaba una
  `T` (`20260919T1200_`) que habría roto el orden de aplicación de la CLI.
- Seed con 10 productos ficticios para poder probar el escáner sin ir a la compra.
- **Sigue sin ejecutarse nada contra Supabase real.** Es lo único pendiente de la fase 0.

### 2026-09-19 (sesión 4) · Q6 y Q7 resueltas

- **Q6 → [D-12](#d-12--congelar-pausa-la-cuenta-atrás-descongelar-la-reanuda--2026-09-19-cierra-q6)**: congelar pausa, descongelar reanuda. Añadidas `frozen_days` y el
  CHECK de coherencia a `inventory_items` (editando la migración en el sitio: no se ha
  desplegado en ningún lado). Abre **Q8**, el tope de seguridad al descongelar.
- **Q7 → [D-13](#d-13--correo-y-contraseña-en-vez-de-magic-link--2026-09-19-revierte-d-06-cierra-q7)**: correo y contraseña, revirtiendo D-06. Desbloquea dos cosas: entrar
  sin ningún correo configurado, y probar el login en Expo Go sin development build.
- 8 comprobaciones nuevas sobre congelado y descongelado. **81 en total, todas en verde.**
- Sigue sin ejecutarse nada contra Supabase real.

### 2026-09-21 (sesión 5) · Fase 1 del backend y cierre de preguntas

- **Q8 → [D-14](#d-14--tope-de-24-h-tras-descongelar--2026-09-21-corrige-d-12-cierra-q8)**: tope de 24 h tras descongelar, con las fuentes contrastadas y la
  divergencia del USDA documentada. Corrige el comportamiento inseguro de D-12 a secas.
- **Q3 → [D-15](#d-15--conservación-tras-apertura-producto--categoría--nada--2026-09-21-cierra-q3)**, **Q2 → [D-16](#d-16--los-tipos-generados-se-versionan--2026-09-21-cierra-q2)**, **Q4 → [D-17](#d-17--ollama-en-desarrollo-el-modelo-de-producción-sin-decidir--2026-09-21-aplaza-q4)** (aplazada).
- **Fase 1 del backend hecha**: vista `inventory_with_priority` con `security_invoker`, y
  seis acciones RPC que actualizan el elemento y escriben su evento en una transacción.
- **CI escrita**: tres trabajos. El rápido sin Docker da señal en segundos.
- 32 comprobaciones nuevas. **117 en total, todas en verde.**
- Abierta **Q9**: la vista calcula «hoy» en UTC.

### 2026-09-21 (sesión 6) · La app existe

- **D1–D4**: proyecto Expo (SDK 57, React 19.2, RN 0.86), Expo Router con rutas en
  `src/app`, cliente de Supabase con sesión persistida en AsyncStorage, alta y login con
  correo y contraseña, y rutas protegidas.
- Versiones resueltas desde `bundledNativeModules.json` del propio paquete `expo`: el
  proxy bloquea la API de `expo install`, y era eso o inventármelas.
- **Dos fallos cazados antes de commitear**:
  - Fijé ESLint 10 y `eslint-config-expo` todavía va con la 9 — su `eslint-plugin-react`
    usa una API que la 10 eliminó. Fijado en `^9.39.5`.
  - El linter encontró un `setState` síncrono dentro de un `useEffect`, que provoca
    renders en cascada. Reestructurado con un contador de recarga, de modo que todas las
    escrituras de estado ocurren tras un `await`.
- **Corregido un error de diseño mío**: el `.env` del cliente estaba en la raíz del
  repositorio, y Expo lee el suyo desde su propia raíz de proyecto. Movido a `app/.env`.
- La pantalla de aterrizaje lee el hogar y cuenta el inventario a propósito: comprueba de
  una vez la sesión, el trigger de alta y la RLS.
- **Nadie ha arrancado la app todavía.** `tsc` y ESLint pasan; eso no es lo mismo.

### 2026-09-21 (sesión 6b) · Soporte web y atajos

- Añadido `react-native-web` para poder mirar la app en el navegador sin móvil ni
  emulador. **Es una comodidad de desarrollo, no un objetivo**: el producto es móvil.
- **Verificado que la app compila**: `expo export --platform web` genera el bundle sin
  errores. Es más que un typecheck, aunque sigue sin ser haberla ejecutado.
- Atajos desde la raíz: `npm run app` (Expo Go) y `npm run app:web` (navegador).
- El «Missing script: dev» del primer intento era un clon sin actualizar, no un fallo.

### 2026-09-21 (sesión 7) · Alta manual y «Consumir primero»

- Revisados `psique-frontend` y `morfeo`: **nada de código es portable** (web React y
  Python contra React Native y SQL), pero sí sus convenciones → [D-18](#d-18--convenciones-de-psique-no-su-código--2026-09-21).
- **Cerrado el hueco del evento `created`**, que estaba en PENDIENTES desde la sesión 5:
  nueva RPC `create_item` que inserta y registra el evento en la misma transacción. Se
  eligió función y no trigger por coherencia con las otras seis acciones.
- **Pantalla de alta manual**: la fecha es opcional y, si se pone, obliga a decir de qué
  tipo es y de dónde sale. La familia de unidades sale de la unidad elegida, así que es
  imposible pedir «2 kg» de algo medido en volumen.
- **Pantalla «Consumir primero»**: agrupada por prioridad, con el origen de cada fecha
  siempre visible y el motivo cuando no es la etiqueta.
- Reestructurado a `src/shared/ui`, `src/shared/lib`, `src/api`; añadido TanStack Query.
- Verificado: typecheck, lint y `expo export --platform web` pasan. 124 comprobaciones de
  esquema en verde. **Sigue sin haberse ejecutado contra un backend real.**

### 2026-09-21 (sesión 8) · Detalle con acciones · fase 1 cerrada

- **Pantalla de detalle**: las seis acciones, el historial de eventos y —lo que justifica
  que la pantalla exista— la **explicación** de la fecha límite. Que un brick abierto
  venza antes de lo que pone el envase parece un error hasta que se dice por qué.
- Las acciones se filtran por estado: lo congelado solo se descongela o se tira, y lo ya
  abierto no ofrece «abrir». Congelar algo descongelado avisa de que no se recongela sin
  cocinar antes, siguiendo a la FSA.
- Cada acción invalida **también** la lista, no solo el detalle: cualquiera de ellas
  cambia la fecha límite efectiva y por tanto el sitio del elemento en «Consumir
  primero». Olvidarlo es el bug clásico de estas pantallas.
- Escrita [`docs/MOVIL.md`](../MOVIL.md): guía de instalación en el móvil paso a paso,
  con el paso de la IP local destacado porque es el que todo el mundo se salta.
- Verificado: typecheck, lint y `expo export` pasan.

### 2026-09-21 (sesión 9) · Zona horaria y confirmaciones

- **Q9 cerrada.** `today_for_user()` lee `user_settings.timezone` y la vista la usa en
  lugar de `current_date`. Antes, entre medianoche y las dos de la mañana la app vivía en
  el día anterior, y la fase 3 manda un resumen diario: un aviso calculado en el día
  equivocado llega tarde. El test lo comprueba con `Pacific/Kiritimati`, que a UTC+14
  devuelve otro día.
- **Confirmación en tirar y terminar.** En línea y no con `Alert.alert`, porque ese no
  hace nada en la versión web y la app también se mira en el navegador. Se descarta sola
  a los 6 segundos: un «¿seguro?» colgado en pantalla invita a confirmarlo sin leerlo.
- **La fase 0 queda verificada en un dispositivo real.** El usuario describió la pantalla
  vieja corriendo en su iPhone con su hogar y su recuento de alimentos, lo que demuestra
  sesión, trigger de alta y RLS funcionando contra Supabase de verdad.

### 2026-09-21 (sesión 10) · Navegación y ajustes

- **Barra inferior con las cuatro secciones**: inventario, lista, chat y ajustes. Las dos
  del medio son pantallas de «llega en la fase N», visibles **a propósito**: mover una
  sección de sitio a mitad de proyecto desorienta a quien ya se acostumbró, y así se ve
  de un vistazo hacia dónde va esto. Cada una dice además qué parte ya está hecha por
  debajo, que en este proyecto es bastante.
- El alta y el detalle no son pestañas: se apilan encima. Son cosas que se abren y se
  cierran, no sitios donde estar.
- **Pantalla de ajustes real**, conectada a `user_settings`: resumen diario y su hora,
  zona horaria y el interruptor de añadido automático a la lista —desactivado por
  defecto, como manda el principio—.
- Cambiar la zona horaria invalida también la lista de prioridad: cambia lo que cuenta
  como «hoy» y por tanto los días que quedan. Sin eso seguiría enseñando los números
  calculados con la zona anterior.
- Anotado que la lista de zonas está escrita a mano: seis más la del dispositivo.

### 2026-09-21 (sesión 11) · Iconos de comida, fecha y errores que se entienden

- **Un icono por alimento, deducido del nombre.** Es lo que más cambia la sensación de la
  app: la misma lista con un icono de comida a la izquierda deja de parecer una hoja de
  cálculo. Las reglas devuelven el elemento ya construido y no el componente, porque
  guardar un componente en una variable durante el render es un patrón que React penaliza
  —y que el linter cazó.
- **Phosphor sustituye a `@expo/vector-icons`.** Pestaña activa en `fill`, las demás en
  contorno: el patrón de iOS, posible solo porque Phosphor trae seis pesos del mismo
  dibujo.
- **Arreglado el campo de fecha.** El bug: `inputMode="numeric"` gana al `keyboardType`, y
  en iOS eso da un teclado sin la barra «/», así que era imposible escribir la fecha.
  Ahora se teclean ocho dígitos y las barras se ponen solas, más atajos de 3 días, 1
  semana y 1 mes.
- **Errores de base de datos traducidos a algo accionable.** El caso que lo motivó: una
  base por detrás del código responde con un mensaje de PostgREST sobre la caché del
  esquema, que en la app se veía como «no puedo añadir comida». Ahora dice qué ejecutar.
- Quitado el `.single()` de `create_item`: la función devuelve una fila suelta y pedirle a
  PostgREST que la trate como objeto único era una forma de fallar a cambio de un dato que
  no se usaba.

### 2026-09-21 (sesión 12) · La paleta y las tipografías, aplicadas

- **Dos paletas y modo oscuro automático.** `useTheme()` lee el ajuste del sistema y
  `makeStyles()` construye hojas de estilo que lo conocen, memoizadas por paleta. Hubo que
  tocar los 17 ficheros que usaban los colores viejos.
- **Bricolage Grotesque y Plus Jakarta Sans**, cargadas al arrancar con la pantalla de
  carga esperando a que estén: sin eso la app aparece con la tipografía del sistema y
  salta a la suya medio segundo después, que se ve como un fallo.
- **El validador de contraste ahora lee `tokens.ts`.** Su primera versión tenía copia
  propia de la paleta y las dos se separaron: daba todo por bueno mientras la app usaba
  otros valores. Ese fallo se repitió dos veces en esta sesión antes de arreglarlo de
  raíz. Ya está en la CI.
- **Ni un color fuera del sistema**: los catorce hexadecimales sueltos que quedaban se
  convirtieron en tokens, y dos de ellos —`expiryLine` y `brandInk`— hicieron falta
  crearlos. El borde de las tarjetas de caducidad no llegaba a 3:1 y se calculó el valor
  que sí llega en vez de bajar el listón.

### 2026-09-21 (sesión 13) · Hojas modales, cristal y selector de aspecto

- **Alta y detalle pasan a `formSheet` nativa**, con tirador y arrastre para cerrar. Dentro
  de una hoja el área segura superior sobra, así que esas dos pantallas solo respetan el
  borde inferior; si no, salía un hueco grande arriba.
- **Barra de pestañas translúcida**, flotando sobre el contenido. Desenfoque real en iOS
  con el material del sistema; en Android, color casi opaco a propósito. Como la barra ya
  no reserva su espacio, las listas necesitan un hueco al final: de ahí `tabBarClearance`.
- **Selector de aspecto en Ajustes**: Automático, Claro y Oscuro. Se guarda en el
  dispositivo y no en la cuenta, porque es una preferencia del aparato, funciona sin
  conexión y no necesita migración.
- El proveedor no pinta nada hasta saber qué aspecto toca, y si el almacenamiento falla
  cae al ajuste del sistema en lugar de quedarse en blanco.

### 2026-09-21 (sesión 14) · Tres fallos con una misma lección

- **Las hojas modales nunca fueron hojas.** Declaré las pantallas en el Stack raíz, donde
  solo existen `index`, `(app)` y `(auth)`: desde allí `(app)` es una sola ruta, porque
  tiene su propio layout. No daba error, simplemente no hacía nada. El aviso
  «No route named … exists in nested children» lo decía literalmente, y conviene leer los
  avisos del empaquetador aunque la app arranque.
- **Sesiones huérfanas.** `db:reset` vacía también la tabla de usuarios, pero en local la
  clave de firma es fija, así que el token guardado en el móvil sigue validando. Resultado:
  sesión válida apuntando a un usuario que no existe, sin hogar y sin ajustes. Se
  manifestaba como «no me deja añadir» y «ajustes en blanco», dos síntomas que no se
  parecen a su causa. Ahora se detecta una vez, en el layout, y se explica.
- **Y un error mío que tapó la pista**: `describeDbError` reemplazaba el código P0002 por
  «ese elemento ya no existe», pisando el «No tienes ningún hogar» que lanzaba la función
  y que era exactamente el diagnóstico. Los mensajes de nuestras RPC ya vienen en español:
  traducirlos encima solo quita información.
- Un fallo de red no es una sesión huérfana: se distinguen, porque confundirlos mandaría a
  cerrar sesión a quien solo tiene el servidor apagado.

### 2026-09-21 (sesión 15) · El usuario, no el correo

- **Login por usuario y contraseña** ([D-19](#d-19--el-usuario-es-la-identidad-el-correo-es-opcional--2026-09-21-matiza-d-13)).
  El correo deja de pedirse al registrarse y pasa a Ajustes → Cuenta, donde además se
  cambia la contraseña.
- **Usuario de desarrollo `syreta`** sembrado directamente en `auth.users`. Costó dos
  detalles que no están documentados en ningún sitio obvio: GoTrue lee las columnas de
  token como texto y revienta con `null` —se ponen a cadena vacía—, y exige una fila en
  `auth.identities` o el inicio de sesión por contraseña no encuentra al usuario.
- **Un fixture invisible**: los correos de prueba eran `a@opsi.test`, y el nuevo CHECK del
  usuario exige 3 caracteres. Un test que no probaba nada de esto habría fallado por una
  letra.
- **`mi_correo()` pasaba por la razón equivocada.** El test corría como dueño de la base,
  sin `auth.uid()`, así que la función devolvía `null` pasara lo que pasara. Ahora corre
  como Ana y con correo sintético de verdad. Una aserción que pasa sin ejercitar lo que
  cree ejercitar es peor que no tenerla.

### 2026-09-21 (sesión 16) · El script que se comía la configuración

- **`npm run up` reescribía `EXPO_PUBLIC_SUPABASE_URL` con `127.0.0.1` siempre.** Quien
  prueba en el móvil tiene que poner ahí la IP del ordenador, así que cada actualización
  del backend le rompía la app. Estaba *documentado* como una advertencia en MOVIL.md, que
  es la forma de convertir un fallo en una tradición. Ahora, si la URL no es de loopback,
  se respeta; y si lo es, el script imprime la IP detectada y la línea lista para pegar.
- **El mensaje de red no decía contra qué URL fallaba.** «¿Está levantado Supabase?» es
  la pregunta equivocada cuando el problema es que la app apunta al propio móvil. Ahora
  lo escribe `shared/lib/conexion.ts`, nombra la URL y cambia según sea local o de red.
  Lo usan los dos traductores de errores, que antes tenían cada uno su versión.
- Lección repetida: un error de conexión tiene que decir **a dónde** no llegó. Sin ese
  dato, todas las causas posibles se parecen entre sí.

### 2026-09-21 (sesión 17) · Lo que se ve al usarla

Tres cosas que solo salen usando la app con datos de verdad, no mirando capturas:

- **La columna de la derecha bailaba.** Cada fila medía lo que midiera su frase —«Venció
  hace 12 días» al lado de «Hoy»—, así que a partir del tercer elemento la lista se veía
  torcida en un móvil. Ahora la etiqueta, la cifra y la unidad van separadas, en una
  columna de ancho fijo: la cifra cae siempre en el mismo sitio. `diasRestantes()` devuelve
  las tres piezas; `describeDaysLeft()` se queda para los lectores de pantalla, donde la
  frase entera sí es lo correcto.
- **Congelado no es «sin fecha».** La vista pone `days_left` a null mientras algo está
  congelado —la cuenta atrás está parada—, y la fila lo enseñaba como «Sin fecha», que es
  otra cosa completamente distinta. Ahora dice desde cuándo lleva dentro, contando desde
  `frozen_at`. La tarjeta del detalle también: antes solo enseñaba `frozen_days`, que son
  los tramos **anteriores** y vale 0 la primera vez que congelas algo. O sea, que quien
  congelaba un alimento no veía ningún número.
- **Los botones de acción eran siete rectángulos con texto**, indistinguibles de un
  formulario de ajustes. Llevan icono en `duotone`: `Package` abrir, `ForkKnife` usar,
  `Snowflake` congelar, `Drop` descongelar, `CheckCircle` terminar, `Trash` tirar.

Y una promesa incumplida que salió al mirar: el comentario de `ItemRow` decía que
caducidad y consumo preferente **no se pintan igual**, pero la fila ponía «Preferente»
para las dos porque nunca llegó a pedir `date_kind`. Ahora lo pide y distingue «Caduca»
de «Preferente», que es justo la diferencia entre seguridad y calidad.

**Una comprobación nueva que cierra un agujero real.** `src/api/inventory.ts` afirma sus
tipos con `as unknown as` porque `database.types.ts` necesita Docker. Si una columna se
renombrara, TypeScript compilaría y la app reventaría en ejecución. `check-schema` lee
ahora la lista de columnas del propio fichero y la comprueba contra la vista. Probada en
negativo: con una columna inventada, falla.

**`frostInk`.** Azul sobre el fondo azul suave se quedaba en 3.91:1 en modo claro. Se
añade el token que faltaba, igual que ya existían `brandInk` y `expiryInk`.

### 2026-09-21 (sesión 18) · Dos correcciones de las de usar la app

- **Me pasé arreglando la columna.** Al darle ancho fijo cambié también el tamaño de
  letra y la partí en tres líneas, y eso bajó la primera línea respecto al título. El ancho
  fijo era la solución; el resto era yo rediseñando algo que ya estaba bien. Vuelta a las
  dos líneas y a la tipografía de siempre: lo único que se acorta es el TEXTO —«Venció ·
  12 días» en vez de la frase entera—, no el estilo.
- **«A ojo» y «La pongo yo» eran la misma opción.** En las dos la fecha la escribe la
  persona, y elegir entre ellas no cambiaba nada en la app: solo servía para hacer dudar.
  Fuera. Y `estimate` no se pierde: el comentario de su propia migración ya decía
  «calculada por la app», así que lo que estaba mal era ofrecerla en un formulario.
- De paso, la casilla decía **«Tiene fecha en el envase»** cuando justo debajo se podía
  responder que la fecha no venía del envase. Ahora dice «Ponerle fecha», que es lo que
  realmente pregunta.

La lección de las tres: el formulario y la fila llevaban semanas pidiendo al usuario que
resolviera contradicciones nuestras. Ninguna se ve leyendo el código; se ven usándolo.

### 2026-09-21 (sesión 19) · Categorías, filtro y un formulario que no interroga

- **Categorías de supermercado** ([D-20](#d-20--categorías-de-supermercado--2026-09-21)), con
  filtro por pasillo y por abierto/sin abrir en «Consumir primero».
- **El alta, reescrita.** Bloques con icono en vez de siete campos seguidos, el icono del
  alimento cambiando en vivo mientras escribes el nombre, cantidad y unidad en la misma
  línea, atajos de fecha antes del campo —quien los use no llega a teclear— y la categoría
  ya propuesta.
- **La fecha admite el año de dos cifras.** `31/12/26` es como viene en la mitad de los
  envases; exigir el siglo eran dos pulsaciones a cambio de nada.
- **Y el mensaje de error era el problema de verdad**: «Esa fecha no existe. Escribe los
  ocho dígitos: 31122026» decía dos cosas a la vez y la segunda parecía un código que
  había que copiar tal cual. Ahora cada caso dice lo suyo —falta el año, ese día no
  existe, está vacía— y ninguno enseña una ristra de dígitos como ejemplo.

**Lo que cazó la comprobación nueva de la sesión anterior**, y esto vale por sí solo:
PostgreSQL guarda el `select i.*` de una vista **ya expandido en columnas** al crearla.
Añadir `category` a la tabla no la añadía a `inventory_with_priority`, que es justo de
donde lee la lista. Habría salido como «column category does not exist» al filtrar, en el
móvil, después de dar todo por bueno. La comprobación que compara las columnas que pide la
app con las que tiene la vista lo dijo en la primera pasada.

Se añade otra del mismo tipo: las categorías están escritas dos veces —el enum de la
migración y la lista de la app, con sus etiquetas y sus reglas—, y ahora se comprueba que
son las mismas. Separarse no daría error de compilación, solo un alta que falla al guardar.

### 2026-09-22 (sesión 20) · El detalle, y tres bugs que tapaban información

**Fracciones en «Usar».** ½, ⅓ y ¼ de **lo que queda** —«me he bebido la mitad» de un
brick mediado es la mitad de lo que había, no del litro original—, cada botón con su
icono y con la cantidad real debajo. No hay botón de «todo»: llegar a cero cierra el
elemento, y para eso está «Terminar», que pregunta antes. Una fracción nunca llega a
cero, así que ninguna puede cerrar nada por accidente. Por lo mismo, la fracción **no se
ajusta** al resto exacto aunque falte poco: cuadrarlo parece amable hasta que se ve que
convertiría un toque en «⅓» en un cierre sin preguntar.

**Tres bugs, y los tres eran de lo mismo: esconder lo que el sistema ya sabía.**

- `run()` pasaba su propio `onError` y sustituía el mensaje del servidor por «No se pudo
  usar esa cantidad». `use_quantity` ya contesta «Quieres usar 500 pero solo quedan 300»,
  en español y con los números. Es **el tercer caso** de lo mismo en este proyecto, tras
  P0002 y el error de red sin URL. Regla, ya: un mensaje que viene escrito para leerse no
  se traduce encima.
- **Un fallo de red se veía como «ese elemento ya no está».** Los dos dejaban `data`
  vacío. Mandar a alguien a buscar un elemento borrado cuando lo único que pasa es que el
  servidor no contesta. Ahora se distinguen, y solo el caso real ofrece volver.
- **El historial que no se pudo leer se veía igual que uno vacío.** «Todavía no hay nada
  registrado» dicho cuando la consulta ha fallado es una mentira, y encima una que oculta
  el fallo.

**Y uno de color:** el cuadro de confirmación se pintaba de rojo para cualquier pregunta,
«Terminar» incluido. El rojo es para lo que puede salir caro; gastarlo en todo enseña a
ignorarlo, y entonces tampoco se lee cuando sí es «Tirar».

Además: cabecera con el icono del alimento —el mismo que en la lista—, la cantidad
restante en grande con su barra teñida según la urgencia, «abierto hace N días» en la
cabecera, y el historial con **hora** además de día, que sin ella dos acciones de la misma
tarde salían como dos líneas idénticas.

### 2026-09-22 (sesión 21) · Dos preguntas contestadas por escrito

Nada de código; dos notas internas que cierran dos dudas que se repetían.

**[SIN-DOCKER.md](SIN-DOCKER.md).** Docker hace falta para UN comando, `supabase start`.
Comprobado en la CLI: `db push`, `test db` y `gen types` aceptan los tres `--db-url` y
`--linked`. Es decir, la CLI necesita Docker para *hospedar* una base, no para *trabajar
contra* una. El camino es un proyecto gratis en la nube (que además acaba con el problema
de la IP del móvil, que costó una sesión entera) más Postgres nativo para el pgTAP real,
que es el hueco que deja el arnés de PGlite con sus dobles escritos a mano.

**[CATALOGOS.md](CATALOGOS.md).** La pregunta era «cómo conecto con los catálogos de
Carrefour, Mercadona, Consum…», y la respuesta empieza por reformularla: el código de
barras es un EAN de GS1, lo pone el fabricante, y es el MISMO en todas las cadenas. La
fuente correcta es una base indexada por EAN —Open Food Facts, que ya está en el esquema
desde el primer día— y no la web de una cadena. Ninguno de esos supermercados publica API
para terceros; lo que circula es su API interna sin documentar, que ni está licenciada ni
tiene compromiso de estabilidad.

**Y una corrección a lo que dábamos por sabido:** el límite de Open Food Facts es de **15
peticiones por minuto y por IP** para leer un producto, no 100. Eso convierte la caché
global (`products` con `household_id IS NULL`) de optimización en requisito, y empuja a
importar el volcado del subconjunto español antes de publicar en vez de tirar de la API en
vivo. Se sube la prioridad del pendiente de Open Food Facts de 🟡 a 🟠.

### 2026-09-24 (sesión 22) · Neveras: una privada por persona y las compartidas que quieras

**El modelo cambia en el servidor.** Antes (`20260922110000`, que nunca se desplegó) cada
persona pertenecía a exactamente un hogar y aceptar una invitación la **movía**: quien
entraba en la nevera del piso dejaba la suya. Ahora cada persona tiene **una nevera
privada** que no se comparte nunca, y además puede crear y pertenecer a neveras compartidas,
con nombre e icono. Aceptar una invitación **añade** una pertenencia y no saca a nadie de
nada. Tres migraciones nuevas, sin tocar las existentes: `20260924100000_neveras_esquema`,
`…110000_neveras_rpc` y `…120000_create_item_con_hogar`.

**Decisiones, con su porqué:**

- **El invariante pasa de «siempre exactamente un hogar» a «siempre al menos uno: la
  privada».** No lo mantiene un trigger sino la construcción: nada del cliente escribe
  `household_members`, y ninguna función deja salir de una privada, echar de ella,
  traspasarla ni invitar. La RLS no cambia una línea: siempre fue verdadera para N
  pertenencias. Lo que se rompe con N no es la base de datos sino el código que da por hecho
  «EL hogar del usuario».
- **Dos límites distintos, y no se mezclan.** `user_settings.household_limit` (2, con
  `CHECK 1..10`) es cuántas neveras puede tener una persona, la privada incluida, y es lo que
  en el futuro podrá depender de un plan. `households.member_limit` es cuánta gente cabe en
  UNA nevera: 1 en la personal, 5 en la compartida, tope técnico que el plan no controla. Un
  `CHECK` impone la coherencia con `kind`. Guardar el límite de personas en una columna y no en
  una constante ya venía de antes; se aplica igual al de neveras: subirlo a alguien es un
  `UPDATE`, no un despliegue.
- **Los iconos, en una tabla y no en un `CHECK … IN (…)`.** Una sola definición, ampliable con un
  `INSERT` (el `CHECK` obliga a reescribirlo entero y bloquea `households`), legible por la app
  para pintar el selector, y la clave foránea la hace cumplir el motor aunque alguien escriba
  sin pasar por las funciones. Dieciséis claves, todas verificadas contra
  `phosphor-react-native` 3.0.6. **La clave es el nombre del icono en snake_case**
  (`users_three` → `UsersThree`), así el mapa clave → componente de la app es mecánico y
  `db:check` lo comprueba contra `node_modules`. Por omisión, una casa para la privada y un
  grupo de gente para las compartidas.
- **La trampa de los permisos, y por qué revocar una columna no bastaba.** `20260922120000`
  concedió `INSERT` sobre `user_settings` **a nivel de tabla**, y un permiso de tabla cubre
  también las columnas que se añadan después. Con la política `user_settings_insert`, cualquier
  cliente podía escribir `insert … (user_id, username, household_limit) values (…, 10)` y
  regalarse cinco neveras. Se quita el permiso de tabla y se concede columna a columna, sin
  `household_limit`; `username` sí entra en el `INSERT` (es `NOT NULL` y lo necesita quien no
  tiene fila) pero sigue fuera del `UPDATE`. Comprobado en la base real como `authenticated`:
  `UPDATE`, `UPSERT … DO UPDATE` e `INSERT` nombrando la columna dan 42501.
- **`households` sin `UPDATE` de ningún tipo, y sin política.** Estaba `update (name)`, lo que
  dejaba que cualquier miembro renombrara una compartida. Ahora renombrar y cambiar el icono
  es de `update_household`, que solo admite el dueño y no puede tocar `kind` ni `member_limit`.
  Es `SECURITY DEFINER` porque la tabla no tiene `UPDATE`: es la única vía.
- **`create_item` ya no adivina la nevera.** Tenía `select household_id from household_members
  limit 1`, sin `order by`: con dos pertenencias, el alimento caía en una nevera al azar, en
  silencio y con «Guardado» en pantalla. Ordenar la consulta habría elegido siempre la privada
  y no se podría guardar nada en la compartida, así que la nevera pasa a ser un parámetro
  obligatorio (`p_household_id`, el primero: sin valor por omisión, que sería la adivinanza con
  otra forma) y se comprueba que es de quien llama. Se borró la firma antigua; dejarla viva
  seguiría eligiendo al azar.
- **Salir siendo la única persona deja la nevera huérfana, y es lo único que hay.** No se
  implementa «borrar nevera». Sin esta salida, quien tiene una compartida a la que ya no va no
  podría liberar su plaza en el límite. Al quedar sin nadie se cancelan las invitaciones
  pendientes: aceptar una metería a alguien en una nevera sin dueño. Sigue sin borrarse por lo
  mismo de antes: es irreversible, sorprendente, y el historial es inmutable.
- **`household_member_names` vale también para la privada.** Es lo único que se aparta de
  «solo compartidas»: el historial de un elemento de tu privada necesita resolver quién hizo cada
  cosa, y devolverte tu propio nombre no filtra nada. Negarlo obliga a la app a un caso aparte
  solo para esa pantalla.
- **Orden de cerrojos: ajustes de la persona → nevera → invitación.** Siempre ese, en las cuatro
  funciones que bloquean, que es lo único que impide que dos se esperen entre sí. Comprobado con
  dos sesiones reales de la misma persona: crear/crear y aceptar/crear; la segunda espera y luego
  ve la pertenencia ya confirmada, y el tope no se salta.
- **El tope de neveras de quien invitas no se mira al invitar**, sino al aceptar. Mirarlo
  revelaría algo de la otra cuenta y además cambia con el tiempo.

**El reparto de lo que ya había.** «Todas son personales», con una excepción que solo puede
darse en una base de desarrollo: un hogar con más de una persona no puede ser personal. Se
queda como está, con su inventario y sus miembros, y pasa a **compartido** (5 plazas, o las que
ya tuviera si eran más; si se llamaba «Mi casa» se renombra, para no tener dos iguales en el
selector). Cada persona que se queda sin privada recibe una nueva y vacía, y lo mismo quien no
tuviera hogar. Las invitaciones pendientes a un hogar que se queda personal se cancelan. Probado
sobre datos del modelo viejo (pareja, trío con nombre propio, huérfanos, usuario sin hogar,
uno solo como `member`, uno sin fila de ajustes): todos acaban con exactamente una privada y ninguno
supera su tope. La migración termina con una comprobación que revienta si no fuera así.

**Contrato de errores para la app.** Los mensajes van en español y se enseñan tal cual. Los casos
que la app debe distinguir llevan además un `hint` estable, en `error.hint`:

| `hint` | SQLSTATE | Cuándo |
|---|---|---|
| `limite_neveras` | `P0001` | La persona ya tiene tantas neveras como su `household_limit`: al crear y al aceptar |
| `nevera_llena` | `P0001` | No queda plaza: al invitar (contando invitaciones sin responder) y al aceptar |
| `nevera_personal` | `P0001` | Se intenta compartir, invitar, echar, traspasar o abandonar la privada |
| `debe_traspasar` | `P0001` | El dueño de una compartida con más gente quiere salir sin traspasar |

`invite_to_household` **sigue devolviendo como resultado** lo que depende de la otra cuenta
(`desconocida`, `ya_es_miembro`, `ya_invitada`) y no añade ningún `outcome`: «nevera personal»
habla de TU nevera, así que es excepción con su hint y no sirve para enumerar.

**Auditoría de «un solo hogar».** Solo `create_item` tenía el `limit 1`. Las seis acciones,
`require_item`, `record_inventory_event` y `shelf_life_for_item` parten de un `item_id` que ya
lleva su hogar, y `today_for_user` y `handle_new_user` no dependen de él. Las vistas y las
políticas pasan por `is_household_member()`, que vale para N. Lo que sí se rompía y se
reescribe: `household_member_names` y `household_sent_invitations` usaban una subconsulta de una
fila (con dos pertenencias, «more than one row returned») y todas las de invitaciones asumían el
hogar único. **La consecuencia para el cliente:** `inventory_items`, `inventory_with_priority`,
`inventory_events` y `shopping_list_items` devuelven ahora las filas de TODAS tus neveras
mezcladas; cada consulta tiene que filtrar por `household_id`. El script de demo de Studio
elegía «el hogar más antiguo»: ahora pide la personal.

**Verificado:** `db:reset`, `db:lint` y `types` en verde. `db:test`: `domain_constraints`,
`inventory_actions` (con la firma nueva de `create_item`, cambio mecánico) y `rls_isolation`
pasan; `household_sharing_test` falla entero por aserciones del modelo viejo (la firma antigua
de `invite_to_household`, `household_member_names()`, el `UPDATE` de `member_limit` sobre una
personal, «un hogar nuevo admite dos personas», el `UPDATE` de `name`) y lo reescribe otra
sesión. `db:check`: 1 fallo de 244, ese mismo fichero. Probados a mano como `authenticated`
sobre Postgres real: crear compartida, tope, aceptar sin salir de la propia, salir/echar/traspasar,
huérfanas, `create_item` con nevera propia y ajena, los tres 42501 de `household_limit` y las dos
carreras de arriba.

**Queda abierto, y no es de esta sesión:** `inventory_with_priority` volvió a `current_date` sin
que nadie lo notara. `20260921140000` la había pasado a `today_for_user()` (Q9), pero
`20260921180000` la recreó copiando la definición anterior a ese arreglo. La base real lo
confirma: la vista usa la fecha del servidor (UTC) y no la del usuario, así que entre medianoche
y las 2 de la madrugada en España un elemento que vence hoy se enseña como que vence mañana.
Arreglarlo es recrear la vista con `today_for_user()`.

**Y en la documentación:** `docs/GLOSARIO.md` sigue diciendo que en el MVP hay un hogar por
usuario y `supabase/README.md` lista `households` con política de `update`; ambos han quedado
viejos.

### 2026-09-25 (sesión 23) · Cerrar las neveras, y la primera pasada de seguridad

**Cómo fue.** El orquestador de las neveras cayó dos veces por el límite de sesión (429) con
casi todo hecho, y se remató directamente, sin árbol de agentes, que es lo que más gasta. Antes
de continuar apareció **el equipo reiniciado**: Docker Desktop parado, y un `db:reset` interrumpido
que dejó la base recreada pero **vacía** (sin ni la tabla de migraciones). Se arrancó Docker una
sola vez y se repitió.

**Lo que estaba roto y nadie sabía:**

- **`tsc` fallaba en toda la app.** `database.types.ts` contenía un mensaje de error en vez de
  TypeScript ([D-25](#d-25--los-tipos-los-escribe-un-script-no-una-redirección--2026-09-25)).
- **La vista de prioridad usaba otra vez `current_date`.** `20260921180000` la recreó copiando una
  definición anterior a `today_for_user()` y el arreglo se perdió sin que ningún test fallara,
  porque el test comprobaba la función y no la vista. Entre medianoche y las 2 en España, lo que
  vencía hoy se enseñaba como que vencía mañana. `20260924130000` la devuelve, y
  `prioridad_zona_horaria_test.sql` la prueba **a través de la vista** con UTC+14 y UTC−11 (falla
  a cualquier hora, no solo de madrugada). Comprobado: con la vista vieja fallan 2 aserciones.
- **`db:check` esperaba una sola cuenta de desarrollo** y desde que hay dos falló, sin que nada
  estuviera roto. Ahora comprueba cada cuenta por nombre.

**Lo hecho:**

- **`household_sharing_test.sql` reescrito para el modelo nuevo: 96 aserciones**, con el ciclo
  entero (crear, tope, invitar, aceptar, rechazar, cancelar, caducar, traspasar, salir, echar,
  huérfana, plan de pago, ritmo de invitaciones, permisos). Lo de conservación, que no tenía
  nada que ver, se separó a `conservacion_test.sql`. **Con prueba de mutación**: dándole al cliente
  permiso de escribir su límite, el test correspondiente se pone en rojo.
- **Frontend de neveras**: «Mis neveras» en Ajustes (lista, recuento «Tienes 1 de 2» y crear con
  su tope explicado), una pantalla de gestión por nevera (miembros, invitar, salir; en una privada
  solo nombre e icono y una nota de por qué no hay más), aviso «Te han invitado a «X»» en el
  inicio, y los textos de aceptar y salir ya para el modelo nuevo. Salir siendo la única persona
  deja la nevera huérfana: es la única forma de liberar plaza, porque no existe «borrar nevera».
- **Primera pasada de seguridad**, con su test cada una: D-22, D-23, D-24 y la **guarda del seed**
  (las cuentas con contraseña conocida solo se siembran si la base tiene el secreto JWT por
  defecto de la CLI; sin él, o con otro, no se crea ninguna: comprobado en `db:check`). Ya estaba
  hecho el vaciado de la caché al cerrar sesión (M3). Los tests de privilegios y de alta también
  llevan prueba de mutación: abriendo un agujero a propósito, se ponen en rojo.

**Se aprendió:** los clics por coordenadas en el navegador integrado son poco fiables con la
ventana detrás de otra (las capturas llegan con un paso de retraso y a veces en mosaico). Lo que
funciona es leer el DOM, rellenar con `form_input` y **comprobar el resultado en la base**, no en
la pantalla.

**Queda, en este orden** (detalle y porqué en `AUDITORIA-2026-09-24.md` y `PENDIENTES.md` §7):
cortafuegos (A1, tuyo), CI en verde, decidir la recuperación de cuenta (A4), una sola development
build con almacén cifrado + cámara + notificaciones, y entonces `lookup-barcode`.

### 2026-10-08 (sesión 24) · Abrir la PR y el bloque previo a la fase 2

**Cómo fue.** Se abrió la PR #1 con las neveras y la primera pasada de seguridad, y la CI **no
arrancó**. **Yo había dicho lo contrario**: tras el `push` anuncié que la CI estaba corriendo sobre la
rama, y no era cierto. El workflow solo se dispara con `push` a `main` y con pull requests, así que
una rama suelta no lo lanza; y una PR con conflictos tampoco, porque GitHub no puede construir la
fusión que la CI prueba. Había conflicto: **otra sesión de Claude había empujado a `main`** (el 29/09,
autor «Claude», hora UTC) un retoque del aviso del README. Se resolvió fusionando `main` en la rama,
sin reescribir historia, y entonces **la CI pasó por primera vez en toda la historia del
repositorio** (25 de 26 en rojo antes).

**Lo que salió, además de lo pedido:**

- **El repositorio es público.** Los documentos internos asumían que no. Cualquiera puede leer sin
  sesión la bitácora, el informe de auditoría y las cuentas de desarrollo. Se comprobó que **no
  hay ninguna clave real** (patrones sobre todo el historial y gitleaks sobre las 47 revisiones),
  pero es el mapa de dónde apretar. Decisión pendiente, **tuya**: ver `PENDIENTES.md` §7.
- `main` **no está protegida** y hay al menos otro escritor. En un repositorio público la
  protección de ramas es gratuita.
- `service_role` tenía permisos de más ([D-27](#d-27--service_role-solo-con-lo-que-usa--2026-10-08)).
- Tu Expo se había lanzado una vez desde la **raíz** del repositorio (dejó `.expo/` y un
  `tsconfig.json` sueltos), y tu IP del Wi-Fi había cambiado de `.19` a `.11`: el móvil abría la app
  pero esta hablaba con una dirección que ya no era el portátil. `npm run up` **no lo habría
  arreglado**: respeta a propósito cualquier URL que no sea `127.0.0.1`.

**Hecho** (cada punto con su prueba; los tres de seguridad, comprobados por **mutación**):

- La carrera de las acciones ([D-26](#d-26--las-acciones-sobre-un-elemento-bloquean-la-fila--2026-10-08)).
- Errores genéricos y *error boundary* ([D-28](#d-28--un-error-que-no-se-reconoce-no-se-ense%C3%B1a--2026-10-08)),
  probados en el navegador con una ruta que revienta (claro y oscuro) y con un `22P02` real.
- Las puertas de la CI ([D-29](#d-29--la-ci-tiene-puertas-de-seguridad-bloqueantes-y-las-exenciones-caducan--2026-10-08)):
  el escáner salta con un token falso plantado y deja pasar el valor público exento.
- `docs/security-inventory.md`, y `db:check` **falla si una tabla, vista o función pública no
  aparece en él** (comprobado quitando una). Y `docs/threat-model.md`: STRIDE de las tres
  funcionalidades que existen y de `lookup-barcode` **antes de escribirla**, con su ficha.
- `SECURITY.md`, `CODEOWNERS` y Dependabot, con las dependencias que Expo fija por SDK **excluidas**:
  subir una sola desalinearía la app con Expo Go.

**Sin hacer, a propósito:** protección de `main`, activar el aviso privado de vulnerabilidades, elegir
licencia y el cortafuegos. Son ajustes del repositorio o del sistema, y no me tocan a mí.

**Lagunas que quedan:** la app **no tiene runner de tests** (los errores se comprobaron a mano); el
cambio de Node de la CI de 20 a 24 y las versiones nuevas de las acciones solo las prueba la propia
CI; y no se ha probado nada en un móvil real.

**Se aprendió:** (1) «la CI está corriendo» se comprueba, no se supone: `gh pr checks` antes de
decirlo. (2) Una tabla recién escrita con las cosas que yo creía saber del catálogo (`service_role`)
estaba mal: el inventario obliga a mirar, y mirar encontró un fallo que la auditoría no vio. (3)
Antes de abrir una PR, `git fetch` y mirar si `main` se ha movido.
