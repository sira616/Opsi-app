# Ver Opsi en el móvil

Paso a paso, desde cero. Unos 15 minutos la primera vez, dos las siguientes.

No hace falta publicar nada en ninguna tienda ni firmar nada: la app corre desde tu
ordenador y el móvil se conecta a él por la Wi-Fi de casa.

> [!NOTE]
> Esto es **desarrollo**, no una instalación de verdad. Si apagas el ordenador, la app
> deja de funcionar. Para tenerla instalada de verdad harán falta builds de EAS, que es
> otra historia y viene más adelante.

---

## Lo que necesitas

| | Dónde |
|---|---|
| **Docker Desktop** | <https://www.docker.com/products/docker-desktop/> · gratis |
| **Node 20 o superior** | <https://nodejs.org> · la versión LTS |
| **Git** | <https://git-scm.com> |
| **Expo Go** en el móvil | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent) · [iOS](https://apps.apple.com/app/expo-go/id982107779) |
| El móvil y el ordenador **en la misma Wi-Fi** | No vale que el móvil esté con datos móviles |

---

## Paso 1 · Descargar el proyecto

Abre una terminal (en Windows, **PowerShell** o **Símbolo del sistema**) y ve a donde
quieras guardarlo:

```
git clone https://github.com/sira616/Opsi-app.git
cd Opsi-app
npm install
```

`npm install` tarda unos minutos y descarga bastante. Es normal.

> Si ya lo tenías clonado, basta con `git pull` y `npm install`.

---

## Paso 2 · Arrancar Docker Desktop

Ábrelo y **espera a que diga que está corriendo** (el icono de la ballena deja de
moverse). Si no lo está, el siguiente paso falla con un error sobre `docker.sock`.

Para comprobarlo:

```
docker ps
```

Si imprime una tabla —aunque esté vacía—, vas bien.

---

## Paso 3 · Levantar el backend

```
npm run up
```

Esto hace tres cosas: arranca Supabase, crea la base de datos con sus tablas y datos de
ejemplo, y **escribe solo el fichero de configuración de la app**.

**La primera vez tarda varios minutos** y descarga unos 2 GB de imágenes de Docker. Las
siguientes veces son segundos.

Cuando termine verás algo así:

```
Todo levantado.

  API      http://127.0.0.1:54321
  Studio   http://127.0.0.1:54323
```

---

## Paso 4 · Decirle a la app dónde está tu ordenador

**Este es el paso que todo el mundo se salta, y sin él la app no conecta.**

Desde el móvil, `127.0.0.1` significa «el propio móvil», no tu ordenador. Hay que poner
la dirección de tu ordenador en la red de casa.

### Encontrar tu IP

**Windows** — en la terminal:

```
ipconfig
```

Busca el bloque de tu Wi-Fi y la línea **Dirección IPv4**. Será algo como
`192.168.1.42`.

**macOS o Linux**:

```
ipconfig getifaddr en0        # macOS
hostname -I                    # Linux
```

> Las IPs de casa empiezan casi siempre por `192.168.` o por `10.`. Si lo que ves empieza
> por `127.` es la dirección local y no sirve.

### Ponerla en el fichero

Abre `app/.env` con cualquier editor de texto. Verás dos líneas; cambia **solo** la
primera, sustituyendo `127.0.0.1` por tu IP y **dejando el resto igual**:

```
EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.42:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...     ← esta no se toca
```

Guarda el fichero.

> [!WARNING]
> Si vuelves a ejecutar `npm run up`, esa línea se reescribe con `127.0.0.1` y habrá que
> cambiarla otra vez. Es el precio de que el fichero se rellene solo.

---

## Paso 5 · Arrancar la app

En la **misma terminal** (o en otra, da igual, pero deja la de Docker en paz):

```
npm run app
```

Aparecerá un código QR grande en la terminal.

---

## Paso 6 · Abrirla en el móvil

**En Android:** abre **Expo Go** y pulsa *Scan QR code*.

**En iPhone:** abre la **cámara** normal, apunta al QR y toca el aviso que sale arriba.

La primera vez tarda unos segundos en cargar: está enviando la app al móvil.

---

## Paso 7 · Crear tu cuenta

En la pantalla de entrada, pulsa **Crear una**.

- **Correo:** cualquiera, aunque no exista. `prueba@opsi.test` vale.
  No se envía ningún correo: está desactivado a propósito para desarrollo.
- **Contraseña:** mínimo **10 caracteres**.

Al registrarte se crea tu casa automáticamente. Verás «Consumir primero» vacío.

---

## Paso 8 · Meter comida

Pulsa el botón **+** de arriba a la derecha y da de alta algo:

- **Qué es** — «Leche entera»
- **Cuánto** — `1`, y elige **l**
- **Dónde está** — Nevera
- **Tiene fecha en el envase** — márcalo, pon una fecha de dentro de 3 días, tipo
  *Consumo preferente*, origen *Del envase*

Guarda y aparecerá en la lista. Tócalo para abrir el detalle, donde están las seis
acciones: abrir, usar cantidad, congelar, descongelar, terminar y tirar.

**Prueba esto, que es donde se ve el diseño:** congela la leche, descongélala, y mira
cómo la fecha pasa a ser mañana con el motivo «se descongeló». La seguridad manda sobre
la fecha del envase.

---

## Cuando termines

En la terminal de la app, **Ctrl+C**. Y para parar la base de datos:

```
npm run db:stop
```

Para volver a empezar otro día: pasos 2, 3, 5 y 6. Los datos siguen ahí.

---

## Si algo no funciona

| Lo que ves | Qué pasa | Qué hacer |
|---|---|---|
| `failed to connect to the docker API` | Docker Desktop no está arrancado | Ábrelo, espera a que arranque, reintenta |
| `Missing script: "up"` | Tu copia del proyecto está desactualizada | `git pull` y `npm install` |
| El QR no carga en el móvil | El móvil no está en la misma Wi-Fi | Quítale los datos móviles y conéctalo a la Wi-Fi de casa |
| La app abre pero **falla al registrarse** | Casi siempre, el paso 4 sin hacer | Comprueba que `app/.env` tiene tu IP y no `127.0.0.1`. Tras cambiarlo, Ctrl+C y `npm run app` otra vez |
| Sigue fallando tras poner la IP | El cortafuegos de Windows bloquea el puerto | Permite Node.js en redes privadas cuando Windows lo pregunte, o abre el puerto 54321 |
| `Falta EXPO_PUBLIC_SUPABASE_URL` | Expo arrancó antes de que existiera el fichero | Ctrl+C y `npm run app` de nuevo |
| Puerto ocupado | Hay otro Supabase levantado | `npx supabase stop --all` y vuelve al paso 3 |

### Ver los datos a mano

<http://127.0.0.1:54323> abre el panel de Supabase en el navegador: las tablas, lo que
has dado de alta y los usuarios creados. Útil para comprobar que algo se guardó de verdad.

### Verla sin móvil

Si solo quieres echar un vistazo rápido, se abre en el navegador del ordenador y te
ahorras los pasos 4 y 6:

```
npm run app:web
```
