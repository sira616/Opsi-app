# Bitácora interna de Opsi

> **Documento de trabajo. No publicar.**
> Vive en `docs/internal/`, que se excluirá si el repositorio deja de ser privado.
> Sirve para dos cosas: recordar **qué se decidió y por qué**, y ser el material en bruto
> del que saldrá el **README final** cuando el MVP esté presentable.
>
> Última actualización: **2026-09-19** (sesión 3)

---

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

**2026-09-19 (sesión 3)** — Bloques B y C terminados: el esquema completo, la RLS y el
trigger de alta, con tests. **Sigue sin haber app.**

| Área | Qué hay hoy |
|---|---|
| Repositorio | Monorepo en `main`: `app/` + `supabase/` + `docs/` + `scripts/` |
| Supabase | CLI 2.117.0 fijada, `config.toml` ajustado a Opsi |
| Esquema | **7 migraciones**, 7 tablas, 8 tipos enumerados, RLS en todas |
| Seguridad | `is_household_member()` + 20 políticas + trigger de hogar personal |
| Tests | 2 ficheros pgTAP (39 aserciones) + `npm run db:check` (73 comprobaciones) |
| Datos | Seed con 10 productos ficticios de catálogo global |
| App Expo | **Nada.** Sigue siendo la tarea D1 |

### Verificado vs. no verificado

| | |
|---|---|
| ✅ **Verificado aquí** | Las 7 migraciones aplican en orden sobre Postgres 18 · el aislamiento entre dos cuentas funciona · el registro de eventos es inmutable · las restricciones rechazan lo que deben · **los dos ficheros pgTAP se ejecutan enteros** |
| ⚠️ **Sin verificar** | Nada se ha ejecutado contra Supabase real: **este contenedor no tiene daemon de Docker**. Falta `db:start`, `db:reset` y `db:test` |

**Cómo se verificó sin Docker:** `scripts/check-schema.mjs` levanta un Postgres real
compilado a WebAssembly ([PGlite](https://pglite.dev)), aplica las migraciones y corre
las aserciones. Los ficheros de `supabase/tests/` también se ejecutan ahí, con dobles de
las funciones de pgTAP, así que se validan de verdad y no solo «parecen correctos».

Diferencias asumidas frente al Supabase real, que es lo que queda por comprobar:

- El esquema `auth` es un doble mínimo (`users` + `uid()`), no GoTrue. **El riesgo real
  está aquí**: si `auth.users` tiene columnas NOT NULL que los tests no rellenan, los
  INSERT de los ficheros pgTAP fallarán. Es un arreglo de una línea, pero hay que verlo.
- PGlite trae Postgres 18; `config.toml` fija la 17.
- No hay pgTAP real, ni Storage, ni Realtime, ni Edge Functions.

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
| Q2 | ¿Se versionan los tipos generados? | Ya no afecta al día a día (monorepo), pero sí a la CI: regenerarlos es lento y no versionarlos hace que se olviden | Fase 0 (E4) |
| Q3 | ¿De dónde salen las fechas de conservación tras apertura? | Es el riesgo #1 del roadmap. Sin fuente, todo es `estimacion` | Fase 1 |
| Q4 | ¿Qué modelo de Claude para chat y cuál para tickets? | Coste. El roadmap dice «modelo pequeño para parseo» | Fase 5 / 6 |
| ~~Q5~~ | ~~¿Cuántas unidades permite el MVP?~~ | **Cerrada: masa, volumen y unidades** ([D-07](#d-07--masa-volumen-y-unidades--2026-09-19-cierra-q5)) | ✅ |
| Q6 | ¿Qué pasa con un elemento congelado y su fecha? | La cuenta atrás se detiene, pero ¿se reanuda al descongelar o se fija un plazo corto? | Fase 1 |
| Q7 | ¿Qué SMTP en producción? | Con magic link, el correo es punto único de fallo. El de Supabase tiene límites bajos | Antes de publicar |

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
