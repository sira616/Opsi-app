# Ver Opsi en el móvil

Paso a paso, desde cero. Unos 15 minutos la primera vez, dos las siguientes.

No hace falta publicar nada en ninguna tienda ni firmar nada: la app corre desde tu
ordenador y el móvil se conecta a él por la Wi-Fi de casa.

> [!NOTE]
> Esto es **desarrollo**, no una instalación de verdad. Si apagas el ordenador, la app
> deja de funcionar. Para tenerla instalada de verdad harán falta builds de EAS: ver
> [`NATIVA.md`](NATIVA.md).
>
> **En iPhone esto NO cuesta nada.** Los 99 $ al año del programa de Apple son para una
> app nativa instalada; para ver la app en desarrollo, Expo Go es gratis y basta.

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

> [!IMPORTANT]
> **Después de cada `git pull`, ejecuta `npm run up`.**
>
> Casi todos los cambios traen migraciones nuevas, y una base de datos que va por
> detrás del código falla de formas que no se parecen a su causa: el caso típico es que
> la pantalla de añadir comida no guarda nada, porque la función que usa todavía no
> existe en tu base. `npm run up` las aplica.

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

**En iPhone:** abre la app **Cámara** normal —no Expo Go—, apunta al QR y toca el aviso
que aparece arriba. Expo Go en iOS ya no trae lector de QR propio: se usa el del sistema.

La primera vez tarda unos segundos: está enviando la app al móvil.

### iPhone · si la cámara dice «No hay datos»

Significa que lee el código pero iOS no sabe qué hacer con él. El QR contiene una
dirección `exp://…`, y el sistema solo la reconoce si **Expo Go ya está instalado**. Si
lo está y sigue fallando, suele ser que el QR sale deformado en la terminal de Windows.

**La vía que nunca falla es no usar la cámara:**

1. En la terminal donde corre `npm run app`, debajo del QR está la dirección impresa en
   texto. Algo como `exp://192.168.1.42:8081`.
2. Abre **Expo Go** en el iPhone.
3. Toca **«Enter URL manually»** en la pantalla de inicio.
4. Escribe esa dirección tal cual y conecta.

Es más rápido que pelearse con el QR, y una vez conectado queda en «Recently opened»:
las siguientes veces es un toque.

### iPhone · el permiso que hay que dar

La primera vez, iOS preguntará si Expo Go puede acceder a la **red local**. **Di que
sí.** Sin ese permiso, Expo Go no puede hablar con tu ordenador y se queda cargando para
siempre sin decir por qué.

Si le diste a «No permitir» sin querer, se arregla en:

**Ajustes → Expo Go → Red local**, y lo activas.

Es el fallo más común en iPhone y no da ningún mensaje útil, así que si el QR se abre
pero la pantalla se queda en blanco o cargando, mira ahí primero.

---

## Paso 7 · Entrar

Hay una cuenta de desarrollo ya creada por los seeds:

| Usuario | Contraseña |
|---|---|
| `syreta` | `opsi-dev-2026` |

Si prefieres la tuya, pulsa **Crear una**:

- **Usuario:** de 3 a 20 caracteres, solo letras sin acentos, números y `_`.
- **Contraseña:** mínimo **10 caracteres**.

No se pide correo. Se puede añadir después en **Ajustes → Cuenta**, y solo sirve para
recuperar la contraseña si se olvida.

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
| **iPhone:** el QR abre Expo Go y se queda cargando | Falta el permiso de red local | **Ajustes → Expo Go → Red local**, actívalo |
| **iPhone:** Expo Go no encuentra el lector de QR | En iOS no lo trae | Usa la app **Cámara** del sistema |
| **iPhone:** la cámara dice «No hay datos» | iOS no reconoce la dirección `exp://` | Escribe la dirección a mano en Expo Go (ver arriba). Comprueba también que Expo Go está instalado |
| El QR no carga y la Wi-Fi es de invitados o de oficina | La red aísla los dispositivos | `npm run app:tunnel` (ver arriba, con su aviso) |
| `Falta EXPO_PUBLIC_SUPABASE_URL` | Expo arrancó antes de que existiera el fichero | Ctrl+C y `npm run app` de nuevo |
| Puerto ocupado | Hay otro Supabase levantado | `npx supabase stop --all` y vuelve al paso 3 |
| **No puedo añadir comida** · «faltan tablas» | Tu base va por detrás del código | `npm run up`. La app te lo dice ahora con esas palabras |
| «Tu sesión ya no vale» · ajustes en blanco | Reiniciaste la base y tu usuario desapareció, pero el móvil conserva el token | Cierra sesión desde esa pantalla y crea la cuenta otra vez |

### Ver los datos a mano

<http://127.0.0.1:54323> abre el panel de Supabase en el navegador: las tablas, lo que
has dado de alta y los usuarios creados. Útil para comprobar que algo se guardó de verdad.

### Si la Wi-Fi no deja que se vean

Algunas redes —sobre todo las de invitados, las de oficina y algunos routers de
operadora— aíslan los dispositivos entre sí, así que el móvil no puede llegar a tu
ordenador aunque estén en la misma Wi-Fi. El síntoma es el mismo: el QR se abre y no
carga nada.

La salida es hacer que la conexión pase por los servidores de Expo en vez de por tu red:

```
npm run app:tunnel
```

La primera vez te pedirá instalar un paquete extra (`@expo/ngrok`); acepta. Escanea el QR
nuevo y funcionará desde cualquier red, incluso con datos móviles.

> [!WARNING]
> **El túnel solo lleva la app, no la base de datos.** Expo Go cargará bien, pero la app
> seguirá sin poder hablar con tu Supabase, que sigue estando solo en tu red local. Verás
> la app y sus pantallas, pero fallará al registrarte o al cargar el inventario.
>
> Para que funcione de verdad desde fuera de casa hace falta subir Supabase a la nube:
> ver [`SETUP.md`](SETUP.md), sección «Nube».

### Verla sin móvil

Si solo quieres echar un vistazo rápido, se abre en el navegador del ordenador y te
ahorras los pasos 4 y 6:

```
npm run app:web
```
