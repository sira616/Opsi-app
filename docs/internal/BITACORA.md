# Bitácora interna de Opsi

> **Documento de trabajo. No publicar.**
> Vive solo en la rama `claude/repo-setup-roadmap-b2o8rw`, nunca en `main`.
> Sirve para dos cosas: recordar **qué se decidió y por qué**, y ser el material en bruto
> del que saldrá el **README final** cuando el MVP esté presentable.
>
> Última actualización: **2026-09-19**

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

**2026-09-19** — Repositorio estructurado. Todavía **no hay código ejecutable**: ni proyecto
Expo, ni proyecto Supabase, ni migraciones. Lo que hay es el andamiaje y la documentación.

| Rama | Qué contiene hoy | Siguiente hito |
|---|---|---|
| `main` | `README.md` (qué es Opsi y cómo funciona), `docs/ARQUITECTURA.md`, `docs/GLOSARIO.md` | Actualizar cuando cambie el diseño, no antes |
| `backend` | `README.md` propio, `supabase/{migrations,functions,tests,seed}/` vacíos, `.gitignore` | Fase 0: proyecto + esquema + RLS |
| `frontend` | `README.md` propio, `app/src/{app,features,components,lib,theme}/` vacíos, `.gitignore` | Fase 0: Expo + Router + login |
| `claude/repo-setup-roadmap-b2o8rw` | Esta bitácora | Se mantiene viva |

### Lo que NO existe todavía (para no engañarse)

- Ningún comando de los READMEs está verificado: son procedimientos previstos.
- No hay proyecto de Supabase creado ni `project-ref`.
- No hay CI. Los READMEs la prometen en la fase 0.
- No hay ni una migración, ni una política RLS, ni una pantalla.

---

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

## 3. Convenciones

### Ramas

```
main       docs                       ← nunca recibe código
backend    supabase/                  ← ramas cortas: feat/…, fix/… salen y vuelven aquí
frontend   app/                       ← ídem
```

Nombres de rama corta: `feat/rls-hogares`, `fix/fecha-efectiva-congelado`, `chore/ci-pgtap`.

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
- Nombre: `20260919T1200_crear_inventory_items.sql`.

### Tipos generados

`supabase gen types typescript --local > app/src/lib/database.types.ts`.
Está en `.gitignore` de `frontend` a propósito: se regenera, no se versiona. Si eso molesta
cuando entre CI, se revierte y se versiona — pero entonces hay que regenerarlo en cada PR.

---

## 4. Próximos pasos (fase 0)

Objetivo: **un esqueleto que compila, autentica y despliega.**
Criterio de salida: *un usuario se registra, tiene su hogar creado y no puede leer datos de
otro usuario, probado con dos cuentas.*

### Bloque A · Supabase en marcha (rama `backend`)

| # | Tarea | Hecho cuando |
|:--:|---|---|
| A1 | Crear el proyecto en supabase.com (región **EU**, por RGPD) | Existe el `project-ref` |
| A2 | `supabase init`, `supabase link`, `supabase start` con Docker | `supabase status` levanta en local |
| A3 | Guardar `project-ref` y claves como *secrets* del repo | Nada sensible en el repositorio |

### Bloque B · Esquema inicial (rama `backend`)

Una migración por tabla, en este orden (las dependencias mandan):

| # | Tabla | Notas |
|:--:|---|---|
| B1 | `households` | `id`, `nombre`, `created_at` |
| B2 | `household_members` | `household_id`, `user_id`, `rol`. **La tabla que define toda la RLS** |
| B3 | `products` | Catálogo. `barcode` único, campos de Open Food Facts, `source` |
| B4 | `inventory_items` | Estado, cantidad, unidad, ubicación, fecha, **tipo de fecha y origen** |
| B5 | `inventory_events` | Append-only: `item_id`, `user_id`, `tipo`, `payload`, `created_at` |
| B6 | `shopping_list_items` | Puede esperar a la fase 4, pero crearla ahora evita otra ronda de RLS |
| B7 | `user_settings` | Zona horaria, hora del aviso, token push, `auto_add_to_list` (por defecto **false**) |

> **Los enums del [glosario](../GLOSARIO.md) se crean como tipos de Postgres, no como texto
> libre.** `item_state`, `date_kind` (caducidad \| consumo preferente) y `date_source`
> (envase \| usuario \| fabricante \| referencia \| estimacion).

### Bloque C · Seguridad (rama `backend`) — *el bloque que no se recorta*

| # | Tarea | Hecho cuando |
|:--:|---|---|
| C1 | Función `is_household_member(household_id)` en SQL | Una sola definición de «pertenezco a este hogar» |
| C2 | Políticas RLS en las 7 tablas usando C1 | Ninguna tabla sin `enable row level security` |
| C3 | Trigger en `auth.users` que crea hogar + membresía al registrarse | Registrarse deja hogar y fila en `household_members` |
| C4 | **Test pgTAP con dos usuarios**: A no ve nada de B, en las 7 tablas | El test pasa y falla si se quita una política |

> C4 es el criterio de salida de la fase 0. Todo lo demás es andamiaje; esto es la garantía.

### Bloque D · App en marcha (rama `frontend`)

| # | Tarea | Hecho cuando |
|:--:|---|---|
| D1 | `npx create-expo-app app --template` con TypeScript + Expo Router | `npx expo start` arranca |
| D2 | Cliente de Supabase en `src/lib/supabase.ts` con `anon key` desde env | Conecta contra el Supabase local |
| D3 | Pantalla de login (magic link) + sesión persistida | Cerrar y abrir la app mantiene la sesión |
| D4 | Rutas protegidas: sin sesión → login | No se llega al inventario sin autenticarse |
| D5 | Cuenta EAS + *development build* ([D-03](#d-03--la-development-build-se-monta-en-la-fase-0--2026-09-19)) | La build instala en un móvil real |

### Bloque E · CI (ambas ramas)

| # | Tarea |
|:--:|---|
| E1 | `backend`: lint SQL, `supabase db reset` y `supabase test db` en cada push |
| E2 | `frontend`: `tsc --noEmit` + ESLint + Prettier en cada push |
| E3 | Rama protegida: no se mergea a `backend`/`frontend` con CI en rojo |

### Orden sugerido

```
A1 → A2 → A3 → B1 → B2 → C1 → C2(parcial) → C3 → C4 ──┐  ← el aislamiento ya está probado
                └→ B3 → B4 → B5 → B6 → B7 → C2(resto) ─┤
D1 → D2 → D3 → D4 → D5 ───────────────────────────────┤  ← se puede hacer en paralelo desde A2
                                          E1 → E2 → E3 ┘
```

**Los bloques D y A/B/C son independientes** hasta D2: la app se puede montar en paralelo al
esquema, y solo se encuentran cuando el login necesita un Supabase vivo.

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
| Q1 | ¿Magic link o contraseña? | El magic link evita gestionar contraseñas pero exige salir de la app | Fase 0 (D3) |
| Q2 | ¿Se versionan los tipos generados? | Afecta a la CI de `frontend` y al trasiego entre ramas | Fase 0 (E2) |
| Q3 | ¿De dónde salen las fechas de conservación tras apertura? | Es el riesgo #1 del roadmap. Sin fuente, todo es `estimacion` | Fase 1 |
| Q4 | ¿Qué modelo de Claude para chat y cuál para tickets? | Coste. El roadmap dice «modelo pequeño para parseo» | Fase 5 / 6 |
| Q5 | ¿Cuántas unidades permite el MVP? | g/kg/ml/l/unidades/porciones. Convertirlas es más trabajo del que parece | Fase 1 (B4) |
| Q6 | ¿Qué pasa con un elemento congelado y su fecha? | La cuenta atrás se detiene, pero ¿se reanuda al descongelar o se fija un plazo corto? | Fase 1 |

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
