# Puesta en marcha

Guía para dejar Opsi funcionando en local y, cuando toque, enlazarlo con un proyecto
de Supabase en la nube.

> [!NOTE]
> **Estado verificado:** el esquema completo se aplica y se comporta como debe —
> `npm run db:check` lo comprueba sin Docker y pasa. Los comandos que levantan
> servicios (`db:start`, `db:reset`, `db:test`) **siguen sin ejecutarse** porque
> necesitan Docker. Si algo falla al seguir esta guía, es un error a corregir.

## Requisitos

| Herramienta | Para qué | Comprobar |
|---|---|---|
| **Node ≥ 20** | CLI de Supabase y app Expo | `node -v` |
| **Docker Desktop** (o Colima/OrbStack) | Supabase local: Postgres, Auth, Storage, Studio | `docker ps` |
| Cuenta en [supabase.com](https://supabase.com) | Solo para desplegar. **No hace falta para desarrollar** | — |

## 1. Local (no necesita cuenta)

```bash
git clone https://github.com/sira616/Opsi-app.git
cd Opsi-app
npm install          # instala la CLI de Supabase fijada en package.json
npm run db:start     # levanta Postgres, Auth, Storage y Studio en Docker
```

La primera vez tarda unos minutos: descarga las imágenes. Al terminar imprime las URLs
y las claves locales:

```
API URL: http://127.0.0.1:54321
Studio URL: http://127.0.0.1:54323
Mailpit URL: http://127.0.0.1:54324      ← aquí llegan los magic links
anon key: eyJhb...
service_role key: eyJhb...               ← esta NO sale nunca del servidor
```

Copia la `anon key` a tu `.env`:

```bash
cp .env.example .env
npm run db:status    # vuelve a imprimir las claves cuando las necesites
```

> [!IMPORTANT]
> Las claves locales son **siempre las mismas** para todo el mundo: forman parte de la
> CLI, no son secretas y no protegen nada. Las de tu proyecto en la nube sí lo son.

### Comandos del día a día

| Comando | Qué hace |
|---|---|
| `npm run db:start` / `db:stop` | Arranca o para los contenedores |
| `npm run db:status` | URLs y claves locales |
| `npm run db:reset` | **Borra la base y la reconstruye** desde `supabase/migrations/` + `supabase/seed/` |
| `npm run db:test` | Ejecuta los tests pgTAP de `supabase/tests/` |
| `npm run db:check` | **Comprueba el esquema sin Docker**, en segundos (ver abajo) |
| `npm run db:diff` | Genera una migración a partir de cambios hechos en Studio |
| `npm run types` | Regenera `app/src/lib/database.types.ts` desde el esquema local |

`db:reset` es destructivo y se usa constantemente: en local **la base de datos es
desechable**. Lo que no esté en una migración o en el seed, se pierde. Es intencionado.

### Comprobar el esquema sin Docker

```bash
npm run db:check
```

Aplica todas las migraciones sobre un Postgres real compilado a WebAssembly
([PGlite](https://pglite.dev)) y ejecuta las comprobaciones de aislamiento y de
restricciones, incluidos los dos ficheros de `supabase/tests/` con dobles de pgTAP.
Tarda segundos y no necesita nada instalado.

**No sustituye a `npm run db:test`**, que es el veredicto real: allí corre pgTAP de
verdad sobre el Supabase de verdad. Las diferencias asumidas a cambio de la rapidez:
el esquema `auth` es un doble mínimo, PGlite trae Postgres 18 (el proyecto fija la 17)
y no hay Storage, Realtime ni Edge Functions.

### El correo no sale a internet

Los magic links de desarrollo **no se envían**: los captura Mailpit en
<http://127.0.0.1:54324>. Registrarte con `test@ejemplo.com` funciona sin que exista
ese buzón.

## 2. Nube (cuando haya algo que desplegar)

No hace falta todavía. Cuando toque:

```bash
# 1. Crear el proyecto en supabase.com → región EU (Fráncfort o Irlanda), por RGPD
# 2. Enlazar este repositorio con él
npx supabase login
npm run link -- --project-ref <ref>     # el ref sale de la URL del panel

# 3. Subir el esquema
npx supabase db push

# 4. Cargar los secrets del servidor
npx supabase secrets set --env-file supabase/.env
```

> [!WARNING]
> **`supabase config push` puede pisar ajustes del panel.** Sube todo lo que declara
> `config.toml`, incluidos valores que escribió la plantilla de `supabase init` y que
> nadie ha revisado. Ejecuta **siempre** `npx supabase config diff` antes y lee el
> resultado. Sin TTY, el comando asume que sí a todo.

### Qué es secreto y qué no

| Valor | Dónde vive | ¿Puede ir en el repo? |
|---|---|---|
| `anon key` | `.env` del cliente, incrustada en el binario | Sí, es pública por diseño |
| URL del proyecto | Ídem | Sí |
| `project-ref` | `supabase/.temp/` (ignorado) | Es un identificador, no una credencial |
| **`service_role` key** | Solo en el servidor | **No. Salta toda la RLS** |
| **`ANTHROPIC_API_KEY`** | `supabase/.env` → `secrets set` | **No** |
| Access token de la CLI | `supabase login`, fuera del repo | **No** |

La regla corta: **si empieza por `EXPO_PUBLIC_`, dalo por publicado.**

Para la CI, esos valores van como *secrets* del repositorio en
GitHub → Settings → Secrets and variables → Actions. Nunca en un fichero versionado.

## 3. App Expo

Aún no existe: es la tarea D1 de la fase 0. Cuando esté, se arranca con `npm start`
desde `app/`. Ver [`app/README.md`](../app/README.md).

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `failed to connect to docker API` | Docker no está arrancado | Abrir Docker Desktop y reintentar |
| `db:start` se queda colgado | Descargando imágenes la primera vez | Esperar; la segunda vez tarda segundos |
| Puerto 54322 ocupado | Otro proyecto Supabase levantado | `npx supabase stop --project-id <otro>` |
| El móvil no conecta con la API | `127.0.0.1` es el propio móvil | Poner la IP local del ordenador en `.env` |
| No llega el magic link | En local no se envía ningún correo | Mirar en Mailpit: <http://127.0.0.1:54324> |
