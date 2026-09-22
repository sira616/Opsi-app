# Dejar de depender de Docker

> **Privado.** Notas de trabajo, no documentación de usuario.
> Escrito el 2026-09-22.

## El hallazgo

Docker hace falta para **un solo comando**: `supabase start`. Levanta la pila local en
contenedores —Postgres, GoTrue, PostgREST, Storage, Studio y Mailpit— y de ahí cuelga
todo lo demás.

Lo que no sabíamos hasta comprobarlo: **los tres comandos que importan aceptan `--db-url`
o `--linked`**.

```
supabase db push    --db-url / --linked / --project-ref
supabase test db    --db-url / --linked / --project-ref
supabase gen types  --db-url / --linked / --project-id
```

Es decir: la CLI necesita Docker para **hospedar** una base de datos, no para **trabajar
contra** una. Si la base la pone otro, Docker sobra.

### Lo que ya no lo toca

| Comando | Qué hace |
|---|---|
| `npm run db:check` | 154 comprobaciones sobre PGlite (Postgres en WebAssembly) |
| `npm run check:contrast` | WCAG AA de la paleta |
| `npm run app` / `app:web` | La app de Expo |
| `npx tsc` / `eslint` / `expo export` | Tipos, lint y empaquetado |

## Tres caminos

### A · Supabase en la nube como backend de desarrollo

Un proyecto gratis en región EU —decisión que ya estaba tomada en PENDIENTES pero sin
ejecutar— hace de backend mientras se desarrolla.

```bash
npx supabase link --project-ref xxxxxxxx
npx supabase db push --linked          # migraciones, sin Docker
npx supabase gen types --linked        # database.types.ts, sin Docker
```

**Lo que gana, y no es poco:**

- Cero Docker en la máquina.
- **Se acaba el problema de la IP del móvil.** La app apunta a `https://xxx.supabase.co`
  y funciona desde cualquier red, con datos móviles, con el túnel de Expo y sin tocar el
  cortafuegos. Ese problema nos costó una sesión entera.
- Cierra el pendiente de `database.types.ts`, que hoy obliga a la capa de datos a usar
  `as unknown as` porque generarlo necesitaba Docker.

**Lo que cuesta:**

- Hace falta internet para desarrollar.
- El plan gratis pausa el proyecto tras ~1 semana sin actividad.
- `db reset` deja de ser inocuo: un error se arregla con otra migración, no volviendo a
  cero. El `db:check` de PGlite pasa de comodidad a red de seguridad.

### B · Postgres nativo, solo para los tests

PostgreSQL 17 instalado en el sistema, sin contenedores. No trae Auth ni PostgREST, así
que **la app no puede funcionar contra esto**: sirve solo para SQL.

```bash
npx supabase test db --db-url "postgresql://postgres:...@localhost:5432/opsi"
```

Y eso es exactamente lo que falta hoy: **pgTAP de verdad**. El arnés de PGlite usa dobles
escritos a mano de las funciones de pgTAP, y eso está documentado como una limitación
asumida. Con Postgres nativo se ejecuta el pgTAP real.

No sustituye a A. Lo complementa.

### C · Podman en vez de Docker Desktop

Mismo `supabase start`, otro motor de contenedores, apuntando `DOCKER_HOST` al socket de
Podman. Quita Docker Desktop —que en Windows pesa y tiene licencia para empresas— pero
sigue dependiendo de contenedores. Es aliviar, no quitar.

## Lo que haríamos: A + B

No son alternativas.

| | Dónde | Para qué |
|---|---|---|
| `npm run db:check` | PGlite, sin instalar nada | Verificación rápida en cada cambio |
| `npm run db:test` | Postgres nativo | pgTAP real antes de subir |
| `npm run db:push` | Proyecto en la nube | Aplicar migraciones |
| `npm run types` | Proyecto en la nube | `database.types.ts` |

## Lo que hay que vigilar

### 🔴 El seed de `syreta` no puede subir nunca

`supabase db push --include-seed` llevaría `supabase/seed/03_usuario_dev.sql` a la nube, y
es una contraseña conocida escrita en el repositorio. Con un proyecto en la nube deja de
ser un riesgo teórico.

Lo correcto: separar los seeds en dos carpetas —«catálogo», que sí sube, y «desarrollo»,
que nunca— y ajustar `db.seed.sql_paths` en `config.toml`. O simplemente borrar el
fichero cuando llegue el momento.

### `npm run up` habría que partirlo

Hoy hace `supabase start` lo primero. Haría falta un `up:nube` que solo haga `db push` +
`gen types` + escribir `app/.env` con la URL y la anon key del proyecto remoto.

Ojo con una cosa que ya está resuelta: `up.mjs` respeta una URL que no sea de loopback,
así que una URL `https://xxx.supabase.co` en `app/.env` no la machacaría.

### El SMTP deja de ser opcional antes de lo previsto

En local, Mailpit captura los correos de confirmación. En la nube no hay Mailpit: o se usa
el correo integrado de Supabase —con límites de envío bajos— o se configura un SMTP real.
Afecta al flujo de «confirmar correo» de Ajustes.

## Siguiente paso

Crear el proyecto es una decisión del dueño de los datos, no algo que se pueda automatizar
desde aquí. Con el `project-ref` en la mano quedan por hacer:

1. Separar los seeds (catálogo / desarrollo).
2. `up:nube`, `db:push`, `types` en `package.json`.
3. Generar y versionar `database.types.ts`, y quitar los `as unknown as` de
   `src/api/inventory.ts`.
4. Documentar el arranque sin Docker en `docs/SETUP.md`.
5. Decidir si se instala Postgres nativo para el pgTAP real.
