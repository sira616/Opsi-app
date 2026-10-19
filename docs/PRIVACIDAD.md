# Opsi · aviso de privacidad (BORRADOR)

> **Esto es un borrador, no un documento legal.** Describe lo que la app hace hoy con los datos, según el código.
> Los huecos entre `[corchetes]` (quién es el responsable, cómo contactar, plazos) los tiene que rellenar quien
> publique la app, y **conviene que lo revise alguien que sepa de protección de datos** antes de abrirla a
> usuarios reales. Lo que no esté hecho (exportar, borrar la cuenta) figura como pendiente, no como prometido.
>
> En la app, el aviso corto que ve la persona justo antes de dar un dato de salud está en
> `app/src/features/ajustes/SeccionSalud.tsx`. Si cambia lo que dice, se sube `VERSION_AVISO_SALUD`
> (`app/src/shared/lib/salud.ts`) y quien ya aceptó tiene que aceptar de nuevo.

## 1 · Quién es el responsable

`[Nombre o razón social]` · `[Dirección]` · `[Correo de contacto para datos personales]`

## 2 · Qué datos trata Opsi

| Dato | Para qué | Quién lo ve |
|---|---|---|
| **Cuenta:** nombre de usuario, contraseña (guardada cifrada, nunca en claro) y, si lo añades, un correo | Entrar y recuperar la cuenta | Solo tú |
| **Tu nevera:** lo que guardas, cantidades, fechas, historial de cada cosa, listas de la compra | Decirte qué gastar primero | Tú y **las personas con las que compartes esa nevera** |
| **Ajustes:** zona horaria, hora del resumen, color, listas por omisión | Que la app funcione a tu manera | Solo tú |
| **Alérgenos e intolerancias** que marcas (**dato de salud**) | Marcarte en tu nevera lo que lleve eso | **Solo tú**, nunca quien comparte nevera contigo |
| **Códigos de barras** que escaneas (o de un producto cuya nutrición abres) | Buscar el producto y traer sus datos | El código viaja a un servidor propio, que consulta Open Food Facts; no se manda nada tuyo |

El aspecto claro u oscuro se guarda en tu aparato, no en tu cuenta.

## 3 · Base legal

- **Cuenta, nevera y ajustes:** la ejecución del servicio que pides al usar la app.
- **Alérgenos e intolerancias:** tu **consentimiento explícito** (RGPD, art. 9.2.a), que das con «Aceptar y elegir» en
  Ajustes. Sin él no se guarda ni se usa nada. Lo puedes retirar cuando quieras con «Borrar mis datos de salud», que
  elimina lo guardado y la fecha del permiso. El servidor guarda qué versión de este aviso aceptaste y cuándo.

## 4 · Con quién se comparte

| Quién | Qué recibe | Notas |
|---|---|---|
| **Supabase** (alojamiento de la base de datos y la cuenta) | Todo lo anterior, cifrado en tránsito | Región prevista: UE. `[Confirmar región y contrato de encargado]` |
| **Open Food Facts** | Solo el código de barras que escaneas o de un producto cuya nutrición abres, desde el servidor | No recibe datos personales. Sus datos son abiertos (ODbL) |
| **Proveedor de IA** (la asistente, solo en desarrollo) | Los mensajes de la conversación abierta (los últimos 20) y, cuando el modelo lo pide, los resultados de mirar tu inventario y tu lista de la compra: nombres, cantidades y fechas. No se envían alérgenos, ingredientes ni tu correo | Hoy: Ollama Cloud, solo con datos de prueba. **`[Pendiente: proveedor, país y contrato del modelo de producción (Q4) antes de abrirla a personas reales]`** |

Los datos de salud **no** salen de tu cuenta: ninguna función del servidor los lee, y el cruce con los productos se hace en tu móvil.

## 5 · Cuánto tiempo se guardan

`[Política de retención: pendiente de decidir]`. Hoy se guardan mientras exista la cuenta. Al borrar la cuenta
(directamente en la base de datos) todo lo suyo se borra en cascada.

## 6 · Tus derechos

| Derecho | Cómo, hoy |
|---|---|
| **Acceso** | La app te enseña lo que has marcado y cuándo aceptaste. Lo demás lo ves en sus pantallas |
| **Rectificación** | Editas lo tuyo en la app |
| **Supresión** | Los datos de salud, con «Borrar mis datos de salud». **Borrar la cuenta desde la app: pendiente** |
| **Portabilidad** | **Pendiente** (hoy no hay exportación) |
| **Retirar el consentimiento** | Igual que la supresión de los datos de salud |
| **Reclamar** | Ante la autoridad de control (en España, la AEPD) |

Para ejercer lo que la app aún no permite: `[correo de contacto]`.

## 7 · Menores

`[Decidir la edad mínima]`. La app no está pensada para menores y no pide la edad.

## 8 · Cambios en este aviso

Cuando cambie, se sube la versión y se pide aceptarlo de nuevo antes de volver a usar los datos de salud.
Versión del aviso de la app: **1**.
