# supabase/

La **capa de datos y servidor**: Postgres, Auth, Storage y Edge Functions.

> Qué es Opsi y cómo funciona: [`../README.md`](../README.md).
> Cómo levantarlo en local: [`../docs/SETUP.md`](../docs/SETUP.md).

## Estructura

```
├── config.toml     Configuración del proyecto (puertos, auth, seeds)
├── migrations/     Esquema versionado. Una migración por cambio, nunca se edita una aplicada
├── functions/      Edge Functions (Deno + TypeScript)
│   ├── lookup-barcode/     fase 2 · Open Food Facts con caché
│   ├── daily-digest/       fase 3 · resumen diario vía pg_cron
│   ├── opsi-chat/          fase 5 · asistente con tool use
│   └── parse-receipt/      fase 6 · OCR de tickets con visión
├── tests/          pgTAP: RLS con dos usuarios, RPC, vista de prioridad
└── seed/           Datos de desarrollo (productos de ejemplo)
```

## El esquema

| Tabla | Qué guarda | Políticas |
|---|---|---|
| `households` | El hogar. Lo crea el trigger de alta | select, update |
| `household_members` | Quién pertenece a qué hogar. **Define toda la RLS** | select |
| `products` | Catálogo. `household_id` NULL = global (caché de Open Food Facts) | las cuatro |
| `inventory_items` | El alimento real en casa: estado, cantidad, fechas y su origen | las cuatro |
| `inventory_events` | Registro **inmutable**: sin UPDATE ni DELETE, por diseño | select, insert |
| `shopping_list_items` | La lista de la compra | las cuatro |
| `user_settings` | Zona horaria, hora del aviso, token push. **No cuelga del hogar** | select, insert, update |
| `open_shelf_life_reference` | Días orientativos tras abrir, por categoría. Solo lectura | select |
| `inventory_with_priority` | *Vista*: fecha límite efectiva, su motivo y la prioridad | select |

Todas las políticas se apoyan en una sola función, `is_household_member()`, que es
`SECURITY DEFINER` por necesidad: sin eso, usarla dentro de la política de
`household_members` provocaría recursión infinita.

## Las acciones

Seis funciones RPC, una por acción. Cada una actualiza el elemento y escribe su evento
**en la misma transacción**, y son `SECURITY INVOKER`, así que la RLS decide a qué
elementos llegan:

```sql
select public.open_item(id);
select public.use_quantity(id, 400);     -- en unidad base: g, ml o piezas
select public.freeze_item(id);
select public.thaw_item(id);
select public.finish_item(id);
select public.discard_item(id, 'se puso malo');
```

> [!WARNING]
> `inventory_with_priority` lleva `with (security_invoker = true)`, y **no es opcional**.
> Una vista normal se ejecuta con los permisos de su propietario y atraviesa la RLS: sin
> esa línea devolvería el inventario de todos los hogares. Hay un test que lo comprueba.

## Reglas de esta mitad

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

Desde la raíz del repositorio:

```bash
npm install          # instala la CLI fijada en package.json
npm run db:start     # Postgres, Auth, Storage y Studio en Docker
npm run db:reset     # aplica migrations/ + seed/
npm run db:test      # pgTAP
npm run db:check     # comprobación rápida del esquema, sin Docker
```

Los detalles, las claves locales y los problemas frecuentes están en
[`../docs/SETUP.md`](../docs/SETUP.md). No hace falta cuenta en supabase.com
para desarrollar.

## Estado por fases

- [x] **Fase 0** — CLI y entorno local, esquema (7 tablas), RLS en todas, trigger de
      hogar personal y tests. Falta **ejecutarlos con Docker** y montar la CI
- [ ] **Fase 1** — RPC de acciones, `inventory_events`, vista `inventory_with_priority`
- [ ] **Fase 2** — `lookup-barcode` + caché de productos
- [ ] **Fase 3** — `daily-digest` + `pg_cron` + tokens push en `user_settings`
- [ ] **Fase 4** — Tablas y RPC de la lista de la compra
- [ ] **Fase 5** — `opsi-chat`, herramientas y límites de uso
- [ ] **Fase 6** — Bucket privado de tickets + `parse-receipt`

**Criterio de salida de la fase 0:** un usuario se registra, tiene su hogar creado
automáticamente y **no puede leer datos de otro usuario** — probado con dos cuentas en un
test automático, no a mano.
