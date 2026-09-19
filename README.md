<div align="center">

# Opsi

**Know what you have. Know when to use it. Waste less. Buy smarter.**

Gestión de alimentos del hogar con una asistente conversacional integrada.

`React Native + Expo` · `Supabase` · `Claude API` · `Open Food Facts`

</div>

---

> [!NOTE]
> Esta rama (`main`) es **solo documentación**: explica qué es Opsi y cómo funciona.
> El código vive en las ramas [`backend`](../../tree/backend) y [`frontend`](../../tree/frontend).
> Ver [Organización del repositorio](#organización-del-repositorio).

## Índice

- [Qué es Opsi](#qué-es-opsi)
- [Cómo funciona](#cómo-funciona)
- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Principios que no se negocian](#principios-que-no-se-negocian)
- [Alcance del MVP](#alcance-del-mvp)
- [Organización del repositorio](#organización-del-repositorio)
- [Documentación](#documentación)

## Qué es Opsi

Opsi **no es una lista de la compra ni un inventario de productos**. Es un sistema que
conoce el **estado real** de cada alimento del hogar —cuándo se compró, cuándo se abrió,
cuánto queda y cuándo conviene consumirlo— y convierte ese estado en **decisiones útiles**:
qué cenar hoy, qué gastar antes de que se estropee, qué reponer.

La diferencia está en el dato: Opsi distingue entre un brick de leche cerrado en la despensa
y el mismo brick abierto hace tres días en la nevera. Son el mismo *producto*, pero
**elementos** distintos, con fechas límite distintas y urgencias distintas.

## Cómo funciona

### El recorrido de un alimento

```
  ENTRADA                  VIDA EN CASA                      SALIDA
  ───────                  ───────────                       ──────

  Escáner  ─┐                                            ┌─ Terminado ─┐
  Manual   ─┼─►  Elemento  ──►  abierto  ──►  congelado  ─┤             ├─►  Lista
  Ticket   ─┘    (cerrado)      usado        descongelado └─ Tirado ────┘    de la compra
                                parcial
                                    │
                                    ▼
                          «Consumir primero»
                    (orden por fecha límite efectiva)
```

1. **Entra un alimento.** Por código de barras (Open Food Facts rellena el producto),
   a mano, o en bloque desde la foto de un ticket.
2. **Se convierte en un elemento** con estado (`cerrado`) y una fecha límite que
   **siempre guarda su origen**: envase, usuario, fabricante, referencia o estimación.
3. **Cambia de estado con el uso.** Abrir, usar cantidad, congelar, descongelar, terminar,
   tirar. Cada acción recalcula la fecha límite efectiva y **registra un evento**.
4. **La vista «Consumir primero»** ordena todo por esa fecha límite efectiva, agrupado en
   prioridad alta / media / sin urgencia / sin fecha.
5. **Un único aviso diario** (a la hora que elija el usuario) resume lo prioritario. Si no
   hay nada urgente, no hay aviso.
6. **Al agotarse**, Opsi ofrece añadirlo a la lista de la compra. Nunca lo añade sola salvo
   que el usuario active esa opción expresamente.

### La asistente

Opsi **consulta y modifica el inventario mediante herramientas ejecutadas en el servidor**
(tool use de la API de Claude). Las herramientas corren con el token del usuario, así que
**RLS limita lo que Opsi puede tocar**: no puede leer ni escribir fuera del hogar de quien
pregunta.

| El usuario dice | Opsi hace |
|---|---|
| «¿Qué ceno?» | Consulta el inventario activo, prioriza lo urgente y propone una receta indicando qué falta |
| «He terminado el bacon» | Llama a la herramienta de actualizar elemento y **solo confirma si el servidor devuelve éxito** |
| «¿Qué caduca esta semana?» | Consulta la vista de prioridad y responde con las fechas y su origen |

## Arquitectura

| Capa | Elección | Motivo |
|---|---|---|
| **Plataforma** | App móvil multiplataforma | iOS y Android con un solo código |
| **Frontend** | React Native + Expo (TypeScript) | Escáner, cámara y notificaciones con librerías oficiales; builds en la nube con EAS; mismo lenguaje que el backend |
| **Backend** | Supabase (Postgres, Auth, Storage, Edge Functions) | Modelo relacional producto/elemento; RLS para aislar hogares; funciones de servidor para llamar a Claude sin exponer claves |
| **IA** | API de Claude con *tool use* | Opsi consulta y modifica el inventario mediante herramientas ejecutadas en el servidor |
| **Catálogo** | Open Food Facts | Base abierta de productos por código de barras, con buena cobertura en España |

```
┌─────────────────────────────┐
│   App Expo (React Native)   │   escáner · cámara · push · UI
└──────────────┬──────────────┘
               │ supabase-js (JWT del usuario)
┌──────────────▼──────────────┐
│          Supabase           │
│  ┌───────────────────────┐  │
│  │ Postgres + RLS        │  │   hogares · productos · elementos · eventos · lista
│  │ RPC (acciones)        │  │   cada acción = update + evento en la misma transacción
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ Edge Functions        │  │   lookup-barcode · daily-digest · opsi-chat · parse-receipt
│  └───────────┬───────────┘  │
│  ┌───────────▼───────────┐  │
│  │ Storage (privado)     │  │   fotos de tickets
│  └───────────────────────┘  │
└────────┬───────────┬────────┘
         │           │
  Open Food Facts   API de Claude   (claves solo en el servidor)
```

**Por qué las Edge Functions:** las claves de la API de Claude nunca llegan al dispositivo.
Todo lo que implica un secreto o una fuente externa pasa por el servidor.

## Modelo de datos

Ocho piezas, todas colgando de `household_id`:

| Tabla | Qué guarda |
|---|---|
| `households` | El hogar. Se crea automáticamente al registrarse (trigger) |
| `household_members` | Quién pertenece a qué hogar y con qué rol |
| `products` | El catálogo: nombre, marca, código de barras, datos de Open Food Facts |
| `inventory_items` | **El elemento real en casa**: estado, cantidad, ubicación, fechas y su origen |
| `inventory_events` | Registro inmutable de cada acción (abrir, usar, tirar…) |
| `shopping_list_items` | La lista de la compra |
| `user_settings` | Zona horaria, hora del aviso, token de push, preferencias |
| `inventory_with_priority` | *Vista*: fecha límite efectiva + prioridad calculada |

> [!IMPORTANT]
> **`products` ≠ `inventory_items`.** Un producto es «Leche entera Marca X, EAN 84…».
> Un elemento es «ese brick concreto, abierto el martes, medio lleno, en la nevera».

**El hogar compartido está fuera del MVP pero preparado**: como todo cuelga ya de
`household_id` y los eventos guardan `user_id`, activarlo será invitar miembros, no migrar.

## Principios que no se negocian

1. **No inventar datos.** Cada fecha guarda su origen: envase, usuario, fabricante,
   referencia o estimación. La interfaz y Opsi lo muestran.
2. **Caducidad ≠ consumo preferente.** Pasada la caducidad es un tema de **seguridad**;
   pasado el consumo preferente, de **calidad**. Se tratan y se comunican distinto.
3. **Seguridad antes que desperdicio.** Opsi nunca anima a consumir algo dudoso para no tirarlo.
4. **Acciones verificadas.** Opsi solo confirma un cambio cuando el servidor devuelve éxito.
5. **Nada se añade solo a la lista** salvo que el usuario lo active expresamente.
6. **Seguridad por diseño.** RLS en todas las tablas, claves solo en el servidor, y textos
   externos (productos, tickets) tratados **como datos, nunca como instrucciones**.

## Alcance del MVP

| Fase | Qué entrega | Hecho cuando |
|:--:|---|---|
| **0** · Base | Repos, Expo + Router, Supabase + CLI, esquema, RLS, login, CI | Dos cuentas no pueden verse los datos |
| **1** · Inventario | Alta manual, acciones, eventos, vista de prioridad, «Consumir primero» | Abrir la leche cambia estado, fecha y posición, y deja evento |
| **2** · Escáner | Cámara EAN/UPC, `lookup-barcode`, confirmación precargada, fallback manual | Producto conocido al inventario en dos toques |
| **3** · Avisos | Token push, `daily-digest` con pg_cron, ajustes de hora | Un solo aviso al día; ninguno si no hay urgencias |
| **4** · Lista | CRUD, «¿lo añado?» al agotar, marcar comprado → inventario | Terminar los huevos ofrece añadirlos; comprarlos los devuelve al inventario |
| **5** · Chat | `opsi-chat`, herramientas con RLS, recetas, límites de uso | «¿Qué ceno?» responde con lo que hay; «he terminado el bacon» lo marca |
| **6** · Ticket | Subida a Storage privado, `parse-receipt` con visión, pantalla de revisión | Un ticket de 10 líneas → 10 elementos tras confirmar |

**Después del MVP:** hogar compartido · patrones de consumo y desperdicio · precios y
comparación por €/kg · modo sin conexión.

## Organización del repositorio

Tres ramas de larga vida, cada una con un propósito:

| Rama | Contenido | Se merge a `main` |
|---|---|:--:|
| [`main`](../../tree/main) | **Solo documentación.** Qué es Opsi y cómo funciona | — |
| [`backend`](../../tree/backend) | Supabase: migraciones, RLS, RPC, Edge Functions, tests de BD | No |
| [`frontend`](../../tree/frontend) | App Expo: pantallas, navegación, cliente de datos, UI | No |

`backend` y `frontend` **no se fusionan con `main`**: son líneas paralelas. El trabajo
diario se hace en ramas cortas que salen de una de ellas y vuelven a ella:

```
main       ──●───────────────●──────────►   docs
              \
backend        ●────●────●────●────────►    supabase/
                     \        ↑
                      ●───────●             feat/rls-hogares
frontend       ●────●────●─────────────►    app/
```

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) — decisiones técnicas en detalle
- [`docs/GLOSARIO.md`](docs/GLOSARIO.md) — estados, tipos de fecha y vocabulario del dominio
