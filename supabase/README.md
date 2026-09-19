# Opsi · backend

Rama de la **capa de datos y servidor**: Supabase (Postgres, Auth, Storage, Edge Functions).

> Para saber **qué es Opsi y cómo funciona**, ve a [`main`](../../tree/main).
> El cliente móvil está en [`frontend`](../../tree/frontend).
> Esta rama **no se fusiona con `main`**.

## Estructura

```
supabase/
├── migrations/     Esquema versionado. Una migración por cambio, nunca se edita una aplicada
├── functions/      Edge Functions (Deno + TypeScript)
│   ├── lookup-barcode/     fase 2 · Open Food Facts con caché
│   ├── daily-digest/       fase 3 · resumen diario vía pg_cron
│   ├── opsi-chat/          fase 5 · asistente con tool use
│   └── parse-receipt/      fase 6 · OCR de tickets con visión
├── tests/          pgTAP: RLS con dos usuarios, RPC, vista de prioridad
└── seed/           Datos de desarrollo (productos de ejemplo)
```

## Reglas de esta rama

1. **Todo cambio de esquema es una migración.** Nada de tocar el esquema desde el panel de
   Supabase: lo que no está en `migrations/` no existe.
2. **RLS activada en toda tabla nueva**, en la misma migración que la crea. Una tabla sin
   política es una fuga.
3. **Las acciones son funciones RPC.** Actualizar el elemento y registrar el evento ocurren
   en la misma transacción, nunca como dos llamadas desde el cliente.
4. **Los secretos viven en el servidor.** La clave de la API de Claude es una variable de
   entorno de la Edge Function. Jamás en el cliente ni en el repositorio.
5. **Texto externo (Open Food Facts, tickets) es dato, nunca instrucción.** Encapsulado en
   el prompt y validado por esquema antes de llegar a una herramienta.

## Puesta en marcha

> [!WARNING]
> Pendiente de la **fase 0**: todavía no hay proyecto de Supabase enlazado ni migraciones.
> Lo que sigue es el procedimiento previsto, no un estado verificado.

```bash
npm i -g supabase          # CLI
supabase login
supabase link --project-ref <ref>
supabase start             # entorno local con Docker
supabase db reset          # aplica migrations/ + seed/
supabase test db           # pgTAP
```

## Estado por fases

- [ ] **Fase 0** — Proyecto, CLI enlazada, entorno local, esquema inicial, RLS, trigger de
      hogar personal, auth, CI (lint + typecheck + tests de BD)
- [ ] **Fase 1** — RPC de acciones, `inventory_events`, vista `inventory_with_priority`
- [ ] **Fase 2** — `lookup-barcode` + caché de productos
- [ ] **Fase 3** — `daily-digest` + `pg_cron` + tokens push en `user_settings`
- [ ] **Fase 4** — Tablas y RPC de la lista de la compra
- [ ] **Fase 5** — `opsi-chat`, herramientas y límites de uso
- [ ] **Fase 6** — Bucket privado de tickets + `parse-receipt`

**Criterio de salida de la fase 0:** un usuario se registra, tiene su hogar creado
automáticamente y **no puede leer datos de otro usuario** — probado con dos cuentas en un
test automático, no a mano.
