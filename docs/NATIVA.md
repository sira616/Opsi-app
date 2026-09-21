# Generar la app nativa (iOS y Android)

Lo que has visto hasta ahora corre dentro de **Expo Go**, que es una app contenedora: no
es Opsi instalada, es Opsi ejecutándose dentro de otra cosa. Este documento explica cómo
salir de ahí y tener un `.apk` o un `.ipa` de verdad.

> **La respuesta corta:** Android sale gratis y en 20 minutos. iOS cuesta **99 $ al año**
> y no hay forma legal de saltárselo si quieres la app en un iPhone que no sea a través de
> un Mac con Xcode.

---

## Los tres niveles, y cuál necesitas

| | Qué es | Qué hace falta | Cuándo usarlo |
|---|---|---|---|
| **Expo Go** | Lo de ahora. La app dentro de un contenedor | Nada | Desarrollo del día a día |
| **Development build** | App nativa **tuya**, con tus dependencias, que sigue recargando al guardar | Cuenta de Expo (gratis) · iOS pide Apple | **Obligatoria para la fase 2**: el escáner de códigos no funciona en Expo Go |
| **Preview / producción** | El `.apk` o `.ipa` final | Lo anterior + cuentas de tienda si publicas | Cuando quieras instalarla de verdad o publicarla |

Muy importante y a menudo malentendido: **la development build no es un paso previo
desechable**. Es la app nativa de verdad, solo que con las herramientas de desarrollo
dentro. Para la fase 2 (escáner) y la 3 (notificaciones) es imprescindible, porque Expo
Go no incluye esos módulos nativos.

---

## Android · gratis

**No necesitas cuenta de Google Play ni pagar nada** para instalar la app en tu propio
móvil. Solo si un día quieres publicarla en la tienda.

```bash
npm install -g eas-cli
eas login                 # cuenta de expo.dev, gratis
cd app
eas init                  # enlaza este proyecto con tu cuenta
eas build --platform android --profile preview
```

La build ocurre en los servidores de Expo, tarda entre 10 y 25 minutos, y al terminar te
da un enlace. Lo abres **desde el móvil**, descargas el `.apk`, y Android te pedirá
permiso para instalar de orígenes desconocidos. Aceptas y ya está instalada.

**Coste:** 0 €. El plan gratuito de Expo da **15 builds de Android y 15 de iOS al mes**,
de sobra para esto.

**Si algún día la publicas en Google Play:** 25 $ **una sola vez**, de por vida.

---

## iOS · 99 $ al año, sin escapatoria

Aquí Apple manda. Para que una app se ejecute en un iPhone tiene que estar **firmada**, y
firmar para un dispositivo real exige una de estas dos cosas:

### Opción A · Apple Developer Program — 99 $/año

Es el camino normal y el único que funciona sin un Mac.

```bash
cd app
eas build --platform ios --profile preview
```

EAS te pedirá tus credenciales de Apple y gestiona los certificados solo. Al terminar,
instalas por enlace directo o subes a **TestFlight**, que permite hasta 100 probadores
internos.

**Qué incluye los 99 $:** publicar en la App Store, TestFlight, notificaciones push,
Apple Pay, y el acceso a las herramientas de App Store Connect. Se renueva cada año: si
dejas de pagar, la app deja de funcionar en los dispositivos.

### Opción B · Mac con Xcode y Apple ID gratis

Si tienes un Mac, puedes firmar con tu Apple ID normal sin pagar. Dos pegas serias:

- **La app caduca a los 7 días** y hay que reinstalarla desde el Mac.
- Hay que conectar el iPhone por cable cada vez.

Sirve para probar. No sirve para usar la app de verdad ni para dársela a nadie.

> **No hay opción C.** Ni EAS ni ningún servicio puede instalar en un iPhone sin una de
> esas dos. No es una limitación de Expo, es de Apple.

---

## Qué está ya preparado en el repositorio

- **`app/eas.json`** con los tres perfiles: `development`, `preview` y `production`.
- **`expo-dev-client`** como dependencia, que es lo que convierte la build en una
  development build recargable.
- Los identificadores de aplicación, en `app/app.json`: `com.opsi.app` para las dos
  plataformas. **Cámbialos antes de publicar** si quieres otro nombre: una vez subido a
  una tienda, el identificador no se puede cambiar.

## Qué falta y tienes que hacer tú

| | Por qué |
|---|---|
| **Cuenta en expo.dev** | Gratis. `eas login` |
| **`eas init`** | Genera el `projectId` y lo escribe en `app.json`. Necesita tu cuenta, no lo puedo hacer yo |
| **Icono y pantalla de carga** | `app/assets` está vacío: la build saldrá con el icono genérico de Expo. Hacen falta un `icon.png` de 1024×1024 y un `splash.png` |
| **Apple Developer Program**, solo para iPhone | 99 $/año |

---

## El problema que te vas a encontrar: la URL del backend

Una build nativa **no lee tu `app/.env` local**. Las variables se congelan en el momento
de construirla, y `127.0.0.1` dentro del móvil sigue siendo el propio móvil.

Eso significa que una app nativa apuntando a tu Supabase local **solo funciona mientras
tu ordenador esté encendido y en la misma Wi-Fi**. Para que funcione de verdad hace falta
un Supabase en la nube:

```bash
# 1. Crear el proyecto en supabase.com, región EU
npx supabase login
npm run link -- --project-ref <ref>
npx supabase db push          # sube las migraciones
npx supabase secrets set --env-file supabase/.env
```

Y entonces la build usa esa URL en lugar de la local. Ese paso está en
[`docs/SETUP.md`](SETUP.md), sección «Nube».

> [!IMPORTANT]
> Antes de que la use alguien que no seas tú hacen falta dos cosas más, y están en los
> pendientes: un **SMTP real** con `enable_confirmations = true` —ahora mismo puede haber
> cuentas con el correo sin verificar— y una vía para **borrar la cuenta y los datos**,
> que con datos personales en Europa no es opcional.

---

## Lo que yo haría, en este orden

1. **Android, perfil `preview`.** Gratis, 20 minutos, y tienes la app instalada de verdad
   en tu móvil esta misma tarde.
2. **Development build de Android** cuando empecemos la fase 2, porque el escáner no
   funciona sin ella.
3. **Supabase en la nube** en cuanto quieras usar la app sin tener el ordenador encendido.
4. **Los 99 $ de Apple** solo cuando de verdad la necesites en un iPhone. No corre prisa
   y el año empieza a contar desde que pagas.

**Sources:** [Apple Developer Program](https://developer.apple.com/programs/whats-included/) · [Precios de Expo](https://expo.dev/pricing) · [Crear tu primera build](https://docs.expo.dev/build/setup/)
