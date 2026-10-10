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
npm install
npm run up           # levanta todo Y escribe app/.env por ti
npm run app:web      # abre la app en el navegador
```

**`npm run up` es el comando bueno.** Además de arrancar Supabase y aplicar migraciones y
seed, lee la `anon key` recién generada y la escribe en `app/.env`. Copiar esa clave a
mano es donde más fácil se falla, y el síntoma —un error al registrarse— no se parece
nada a la causa.

`npm run dev` hace lo mismo sin tocar el `.env`, por si prefieres controlarlo tú.

La primera vez tarda unos minutos: descarga las imágenes. Al terminar imprime las URLs
y las claves locales:

```
API URL: http://127.0.0.1:54321
Studio URL: http://127.0.0.1:54323
Mailpit URL: http://127.0.0.1:54324      ← aquí llegan los correos de recuperación
anon key: eyJhb...
service_role key: eyJhb...               ← esta NO sale nunca del servidor
```

Si usaste `npm run up`, el `app/.env` ya está escrito y no tienes que tocar nada. Para
verlo o cambiarlo a mano:

```bash
npm run db:status    # vuelve a imprimir las claves cuando las necesites
```

> [!IMPORTANT]
> El `.env` del cliente va en **`app/.env`**, no en la raíz. Expo lee el suyo desde su
> propia raíz de proyecto.

> [!IMPORTANT]
> Las claves locales son **siempre las mismas** para todo el mundo: forman parte de la
> CLI, no son secretas y no protegen nada. Las de tu proyecto en la nube sí lo son.

> [!IMPORTANT]
> **`npm run up` después de cada `git pull`.** Una base de datos por detrás del código
> falla de formas que despistan: lo habitual es que una pantalla deje de guardar porque
> la función que llama aún no existe. La app ya lo detecta y lo dice, pero mejor no
> llegar ahí.

### Comandos del día a día

| Comando | Qué hace |
|---|---|
| `npm run up` | **El bueno**: arranca, aplica migraciones y seed, y escribe `app/.env` |
| `npm run dev` | Lo mismo sin tocar el `.env` |
| `npm run db:start` / `db:stop` | Arranca o para los contenedores |
| `npm run db:status` | URLs y claves locales |
| `npm run db:reset` | **Borra la base y la reconstruye** desde `supabase/migrations/` + `supabase/seed/` |
| `npm run db:test` | Ejecuta los tests pgTAP de `supabase/tests/` |
| `npm run db:check` | **Comprueba el esquema sin Docker**, en segundos (ver abajo) |
| `npm run db:diff` | Genera una migración a partir de cambios hechos en Studio |
| `npm run types` | Regenera `app/src/lib/database.types.ts` desde el esquema local |
| `npm run db:carreras` | Dos sesiones a la vez sobre lo mismo (necesita Docker) |
| `npm run test:funciones` | Los tests de la lógica de las Edge Functions, sin Deno ni red |
| `npm run fn:check` | `lookup-barcode` en el runtime de Edge Functions de verdad (necesita Supabase levantado) |
| `npm run fn:serve` | Sirve las Edge Functions con `supabase/functions/.env` (para que busque en Open Food Facts) |

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

### Probar el escáner

Los códigos del seed (`8400000000017`, `…024`, `…031`…) son EAN-13 válidos y funcionan **sin configurar
nada**: en la pantalla de escanear, «Escribir el código a mano» y teclear uno. Para que busque en Open
Food Facts de verdad:

```bash
cp supabase/.env.example supabase/functions/.env   # y pon en OFF_USER_AGENT un contacto REAL
npm run fn:serve
```

Sin un contacto real la función no llama a Open Food Facts (su política de uso lo pide) y solo sirve lo que
ya está en la caché. La cámara se prueba en un móvil con Expo Go: `expo-camera` viene incluido.

### Se entra con usuario y contraseña; el correo es opcional

No se pide correo para registrarse. Supabase Auth solo sabe autenticar por correo, así
que por debajo cada cuenta lleva uno **sintético** derivado del nombre:

```
syreta  →  syreta@usuarios.opsi.local
```

Ese dominio no existe y nadie le manda nada. El usuario no lo ve en ningún sitio.

El correo de verdad se añade después, en **Ajustes → Cuenta**, y sirve para una sola
cosa: recuperar la contraseña. Al confirmarlo, GoTrue **sustituye** el sintético por el
real, y a partir de ahí la recuperación estándar de Supabase funciona sin nada extra.
En local ese enlace no sale a internet: lo captura Mailpit en <http://127.0.0.1:54324>.

El nombre de usuario admite `a-z`, `0-9` y `_`, entre 3 y 20 caracteres, y **no se puede
cambiar**: la base de datos ni siquiera concede `UPDATE` sobre esa columna, porque
cambiarlo dejaría el correo sintético apuntando al nombre anterior.

> [!IMPORTANT]
> Antes de publicar hay que configurar un SMTP real. Sin él, quien no haya añadido un
> correo no tiene forma de recuperar la contraseña si la olvida.

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
npx supabase secrets set --env-file supabase/functions/.env
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
| **`ANTHROPIC_API_KEY`** | `supabase/functions/.env` → `secrets set` | **No** |
| `OFF_USER_AGENT` | Ídem. Es un nombre y un contacto, no una clave | **No**: lleva un correo o una dirección de contacto real |
| Access token de la CLI | `supabase login`, fuera del repo | **No** |

La regla corta: **si empieza por `EXPO_PUBLIC_`, dalo por publicado.**

Para la CI, esos valores van como *secrets* del repositorio en
GitHub → Settings → Secrets and variables → Actions. Nunca en un fichero versionado.

## 3. App Expo

Dos formas de verla, ambas desde la raíz del repositorio:

```bash
npm run app:web    # se abre en el navegador. Lo más rápido
npm run app        # QR para Expo Go en el móvil
```

Necesita el backend levantado y `app/.env` relleno.

### En el móvil, con Expo Go

> Guía completa paso a paso, con capturas de los errores frecuentes:
> [`docs/MOVIL.md`](MOVIL.md).

1. Instala **Expo Go** ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) ·
   [iOS](https://apps.apple.com/app/expo-go/id982107779)).
2. El móvil y el ordenador, **en la misma Wi-Fi**.
3. `npm run app` y escanea el QR (en iOS, con la cámara; en Android, desde Expo Go).

> [!IMPORTANT]
> Desde el móvil, `127.0.0.1` es el propio móvil, no tu ordenador. Hay que poner la IP
> local de tu ordenador en `app/.env`:
>
> ```
> EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.42:54321
> ```
>
> La IP sale de `ipconfig` (Windows) o `ifconfig | grep inet` (macOS y Linux). Si aun así
> no conecta, suele ser el cortafuegos bloqueando el puerto 54321.

En el navegador no hace falta nada de esto: `127.0.0.1` funciona tal cual.

### Usuario de desarrollo

El seed crea uno, ya listo para entrar:

| Usuario | Contraseña |
|---|---|
| `syreta` | `opsi-dev-2026` |

> [!CAUTION]
> Es una contraseña conocida y escrita en el repositorio. Vale **solo para el Supabase
> local**. Antes de ejecutar los seeds contra un proyecto en la nube hay que borrar
> `supabase/seed/03_usuario_dev.sql`.

También puedes crearte la tuya desde la app: usuario, contraseña de 10 caracteres y
listo. Registrarte es lo que dispara el trigger que crea tu hogar.

### Llenar el inventario para tener algo que mirar

Una vez tengas cuenta, abre el Studio (<http://127.0.0.1:54323>) → **SQL Editor**, pega
[`supabase/demo/inventario-de-ejemplo.sql`](../supabase/demo/inventario-de-ejemplo.sql)
y ejecútalo. Mete nueve alimentos elegidos para que se vea cada grupo de prioridad, y
te imprime la tabla resultante.

Se puede ejecutar las veces que quieras: limpia antes lo que creó él mismo.

Si al actualizar Expo algo deja de cuadrar, `npx expo install --fix` desde `app/`
realinea las dependencias con las que recomienda el SDK.

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `failed to connect to docker API` | Docker no está arrancado | Abrir Docker Desktop y reintentar |
| `db:start` se queda colgado | Descargando imágenes la primera vez | Esperar; la segunda vez tarda segundos |
| Puerto 54322 ocupado | Otro proyecto Supabase levantado | `npx supabase stop --project-id <otro>` |
| El móvil no conecta con la API | `127.0.0.1` es el propio móvil | Poner la IP local del ordenador en `app/.env`. `npm run up` la imprime al terminar |
| «No llego a http://127.0.0.1:54321» al entrar, y antes funcionaba | Un `npm run up` anterior a 2026-09-21 machacaba la URL que habías puesto a mano | Volver a poner la IP. Desde esta versión ya se respeta |
| No llega el correo de confirmación | En local no sale a internet | Mirar en Mailpit: <http://127.0.0.1:54324> |
| `syreta` no entra | Los seeds no se han aplicado | `npm run db:reset` |
