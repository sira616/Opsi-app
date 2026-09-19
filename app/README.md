# app/

El **cliente móvil**: React Native + Expo (TypeScript) con Expo Router.

> Qué es Opsi y cómo funciona: [`../README.md`](../README.md).
> Cómo levantar el backend en local: [`../docs/SETUP.md`](../docs/SETUP.md).

## Estructura

```
├── src/
│   ├── app/            Rutas (Expo Router): la carpeta es el mapa de pantallas
│   ├── features/       Un módulo por dominio: inventory, scanner, shopping, chat, settings
│   ├── components/     UI reutilizable y sin lógica de dominio
│   ├── lib/            Cliente de Supabase, TanStack Query, tipos generados, utilidades
│   └── theme/          Tokens de color, tipografía y espaciado
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

> [!WARNING]
> **El proyecto de Expo aún no existe** (tarea D1 de la fase 0). Lo que sigue es el
> procedimiento previsto, no un estado verificado.

```bash
npm install             # desde la raíz: es un workspace
cd app
npx expo start          # Expo Go para iterar rápido
npx expo run:ios        # build nativa: necesaria para el escáner y las push
eas build --profile development
```

El backend tiene que estar levantado (`npm run db:start` desde la raíz) y la `anon key`
copiada al `.env`. Ver [`../docs/SETUP.md`](../docs/SETUP.md).

El escáner de códigos y las notificaciones push **no funcionan en Expo Go**: requieren una
*development build*. Conviene montarla ya en la fase 0 y no descubrirlo en la fase 2.

El **login sí funciona en Expo Go** desde el primer día: con contraseña no hace falta
volver de ningún correo, así que no depende de los deep links ni de la development build.

## Estado por fases

- [ ] **Fase 0** — Expo + TypeScript + Expo Router, cliente de Supabase, alta y login
      con correo y contraseña, CI (lint + typecheck)
- [ ] **Fase 1** — Alta manual, detalle del elemento con acciones, «Consumir primero»
- [ ] **Fase 2** — Pantalla de cámara EAN-13/EAN-8/UPC, confirmación precargada, fallback manual
- [ ] **Fase 3** — Permiso y registro del token push, pantalla de ajustes de aviso
- [ ] **Fase 4** — Lista de la compra, marcar comprado, paso a inventario
- [ ] **Fase 5** — Pantalla de chat con Opsi
- [ ] **Fase 6** — Cámara de tickets y pantalla de revisión línea a línea

**Criterio de salida de la fase 1:** abrir la leche cambia su estado, su fecha límite y su
posición en «Consumir primero», y deja un evento registrado.
