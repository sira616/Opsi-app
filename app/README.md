# app/

El **cliente móvil**: React Native + Expo (TypeScript) con Expo Router.

> Qué es Opsi y cómo funciona: [`../README.md`](../README.md).
> Cómo levantar el backend en local: [`../docs/SETUP.md`](../docs/SETUP.md).

## Estructura

```
├── src/
│   ├── app/            Rutas (Expo Router): la carpeta es el mapa de pantallas
│   ├── api/            Las llamadas al servidor, una por función o consulta, ya tipadas
│   ├── features/       Lo de cada dominio: ajustes, elemento, neveras (y más adelante scanner, chat)
│   ├── shared/         Lo que usan varios dominios: ui/ (piezas), lib/ (utilidades), theme/ (tokens)
│   └── lib/            Solo los tipos generados de la base de datos (database.types.ts)
└── assets/             Iconos, splash, fuentes
```

## Reglas de esta mitad

1. **Los tipos de la base de datos se generan, no se escriben.**
   `npm run types` desde la raíz → `src/lib/database.types.ts`. Si el esquema cambia,
   se regeneran; no se parchean a mano.
2. **Las acciones se llaman por RPC**, nunca como `update` sueltos. Abrir un elemento es
   una llamada a una función del servidor, no dos escrituras desde el móvil.
3. **El origen de cada fecha se muestra siempre.** Una fecha sin su procedencia en pantalla
   incumple el primer principio del proyecto.
4. **Caducidad y consumo preferente se ven distinto.** Color, icono y texto diferentes:
   una es seguridad, la otra calidad.
5. **Nada se añade solo a la lista de la compra.** Siempre una pregunta explícita, salvo
   que el usuario active la opción automática en ajustes.
6. **Ninguna clave en el cliente.** Solo la `anon key` de Supabase, que existe para eso.
   Todo lo demás pasa por una Edge Function. Lo que lleva prefijo `EXPO_PUBLIC_` acaba
   incrustado en el binario: dalo por publicado.
7. **Se entra con correo y contraseña.** Mínimo 10 caracteres, sin reglas de composición.
   El login no necesita deep links; solo el correo de recuperación, que usa el esquema
   `opsi://` declarado en `supabase/config.toml`.

## Puesta en marcha

Desde la raíz del repositorio:

```bash
npm install
npm run up         # levanta el backend y escribe app/.env por ti

npm run app:web    # en el navegador. Lo más rápido para mirarla
npm run app        # QR para Expo Go en el móvil
```

> [!IMPORTANT]
> El `.env` va en **`app/.env`**, no en la raíz: Expo lee el suyo desde su propia raíz de
> proyecto y en la del monorepo no lo ve.

> [!NOTE]
> Desde un **dispositivo físico**, `127.0.0.1` es el propio móvil. Hay que poner la IP de
> tu ordenador en la red local en `EXPO_PUBLIC_SUPABASE_URL`.

Para las notificaciones (fase 3) hará falta una *development build*; el escáner (fase 2) no. Cómo generarla, y qué cuesta cada plataforma, en
[`../docs/NATIVA.md`](../docs/NATIVA.md).

Qué hace falta para cada cosa, **comprobado el 2026-10-10** contra la lista de módulos que trae
Expo Go para este SDK (`node_modules/expo/bundledNativeModules.json`):

- **El escáner** (`expo-camera`): el módulo **viene incluido en Expo Go**, así que no hace falta
  *development build*. La pantalla (`escanear`) y el alta están hechas y probadas en el navegador con la
  entrada a mano. Lo que no he hecho es escanear un código con la **cámara** de un móvil: está
  comprobado que el módulo está, no que el escáner funcione allí. Sin cámara (en el navegador, o si no
  das el permiso) se escribe el código.
- **Las notificaciones push** y el **almacén cifrado de la sesión** para una build real: sí piden
  *development build*. Que `expo-notifications` venga en Expo Go no significa que las push
  remotas funcionen en él (sin verificar).
- **El login** funciona en Expo Go, porque con contraseña no hay que volver de ningún correo:
  por eso se puede probar la app entera hoy sin montar nada.

## Estado por fases

- [x] **Fase 0** — Expo + TypeScript + Expo Router, cliente de Supabase, alta y login
      con correo y contraseña, rutas protegidas. Falta la development build (D5)
- [x] **Fase 1** — Alta manual, «Consumir primero», detalle con las seis acciones y **neveras**
      (privada + compartidas, con selector en el inicio). Solo probada en el navegador
- [ ] **Fase 2** — Pantalla de cámara EAN-13/EAN-8/UPC, confirmación precargada, fallback manual
- [ ] **Fase 3** — Permiso y registro del token push, pantalla de ajustes de aviso
- [ ] **Fase 4** — Lista de la compra, marcar comprado, paso a inventario
- [ ] **Fase 5** — Pantalla de chat con Opsi
- [ ] **Fase 6** — Cámara de tickets y pantalla de revisión línea a línea

**Criterio de salida de la fase 1:** abrir la leche cambia su estado, su fecha límite y su
posición en «Consumir primero», y deja un evento registrado.
