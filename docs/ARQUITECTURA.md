# Arquitectura

Documento de decisiones técnicas. El [README](../README.md) cuenta *qué* hace Opsi;
esto cuenta *por qué* está construida así.

## 1. Una app móvil, no una web

El caso de uso es de pie en la cocina con el móvil en la mano: escanear un código,
marcar que has abierto algo, mirar qué caduca. Eso pide cámara, notificaciones push
y arranque instantáneo.

**Expo + React Native (TypeScript)** porque:

- iOS y Android con un solo código.
- Escáner, cámara y notificaciones tienen librerías oficiales mantenidas
  (`expo-camera`, `expo-notifications`).
- **EAS Build** compila en la nube: no hace falta un Mac para publicar en iOS.
- Mismo lenguaje que las Edge Functions → tipos compartidos entre cliente y servidor.

**Expo Router** para navegación basada en ficheros: la estructura de carpetas *es* el mapa
de pantallas, que es justo lo que se quiere cuando el número de pantallas crece por fases.

## 2. Supabase como backend completo

No solo base de datos: Postgres + Auth + Storage + Edge Functions en un solo proyecto,
con CLI y entorno local en Docker.

### Por qué relacional y no documental

El dominio es relacional de verdad: un **producto** del catálogo tiene N **elementos**
en casa, cada elemento genera N **eventos**, todo pertenece a un **hogar**. Las consultas
que importan («qué caduca antes», «qué se tira más») son agregaciones y ordenaciones sobre
esas relaciones. Postgres las hace sin esfuerzo.

### RLS como frontera de seguridad, no como adorno

**Todas** las tablas llevan Row Level Security. La regla es siempre la misma: puedes tocar
una fila si su `household_id` está entre los hogares de los que eres miembro.

Esto tiene dos consecuencias que valen oro:

1. **El cliente puede hablar con la base de datos directamente** sin que exista el riesgo de
   que un bug de la app filtre datos de otro hogar. La base de datos no se fía del cliente.
2. **Las herramientas de la asistente heredan la misma frontera.** Cuando Opsi ejecuta
   «actualizar elemento», lo hace con el JWT del usuario. Si el modelo alucinara un ID de
   otro hogar, la consulta simplemente no devuelve nada. *La seguridad no depende de que el
   modelo se porte bien.*

> El trigger que crea el hogar personal al registrarse existe para que **nunca** haya un
> usuario sin hogar: si lo hubiera, tendría filas sin `household_id` y las políticas RLS
> tendrían que contemplar un caso nulo. Se evita el caso, no se parchea.

### Acciones como funciones RPC, no como updates sueltos

Abrir un brick de leche son dos escrituras: cambiar el elemento y anotar el evento.
Si se hacen desde el cliente como dos llamadas, un fallo de red entre ambas deja el
inventario sin su rastro.

Por eso cada acción (abrir, usar cantidad, congelar, descongelar, terminar, tirar) es una
**función RPC en Postgres** que hace ambas cosas **en la misma transacción**. El cliente
llama a una función y recibe el elemento actualizado.

Beneficio lateral: el registro de eventos queda completo desde la fase 1, que es
exactamente lo que alimentará los patrones de consumo y desperdicio después del MVP.

### La vista de prioridad vive en la base de datos

`inventory_with_priority` calcula la **fecha límite efectiva** (que depende del estado:
un producto abierto no caduca cuando dice el envase) y la prioridad derivada.

Está en SQL y no en el cliente porque tres consumidores distintos necesitan el mismo
cálculo: la pantalla «Consumir primero», el resumen diario y la asistente. Duplicar esa
lógica en tres sitios es garantía de que diverja.

## 3. Las Edge Functions y por qué son cuatro

Todo lo que implica **un secreto o una fuente externa** pasa por el servidor.

| Función | Fase | Qué hace | Por qué no en el cliente |
|---|:--:|---|---|
| `lookup-barcode` | 2 | Busca en caché; si no está, consulta Open Food Facts y guarda el producto | La caché compartida evita repetir la llamada externa por cada usuario |
| `daily-digest` | 3 | Programada con `pg_cron`; calcula el resumen y envía el push | Tiene que ocurrir aunque la app esté cerrada |
| `opsi-chat` | 5 | Instrucciones de sistema, bucle de *tool use* y ejecución de herramientas | La clave de la API de Claude no puede salir del servidor |
| `parse-receipt` | 6 | Claude con visión extrae las líneas del ticket | Ídem, y el modelo cambia sin tocar la app |

## 4. La asistente

### Tool use, no generación de texto libre

Opsi no «describe» el inventario: lo **consulta y lo modifica** con herramientas:

- consultar inventario
- actualizar elemento
- añadir a la lista

El bucle tiene **límite de iteraciones** y **límite de uso por usuario**. Un modelo que se
atasca llamando herramientas en círculo es un problema de coste, no solo de latencia.

### Confirmación solo tras éxito del servidor

Una asistente que dice «hecho» sin que el cambio se haya guardado destruye la confianza en
todo el inventario. Opsi confirma leyendo la respuesta de la herramienta, no su intención.

### Texto externo = datos, nunca instrucciones

Los nombres de producto de Open Food Facts y el texto de los tickets son **entrada no
confiable**: cualquiera puede editar Open Food Facts. Van siempre encapsulados como datos
en el prompt, las herramientas están limitadas por RLS y los argumentos se validan contra
un esquema antes de ejecutarse. Tres capas, porque una sola no basta.

### Contener el coste

- Modelo pequeño para parseo (tickets), modelo capaz para conversación.
- Al modelo se le envía **solo el inventario activo y resumido**, no la tabla entera.
- Límites de uso por usuario.

## 5. Open Food Facts

Base abierta, sin coste, con buena cobertura en España y licencia que permite el uso.

Dos límites asumidos desde el principio:

1. **El código de barras no trae la fecha de caducidad.** La introduce siempre el usuario.
   Esto no es una carencia a resolver: es información que físicamente no está en el EAN.
2. **La cobertura no es total.** Cuando un producto no existe, la app cae al alta manual
   con el código ya relleno. El fallback es parte del flujo, no un error.

## 6. Qué se ha dejado preparado (y qué no)

| Futuro | Base ya puesta |
|---|---|
| Hogar compartido | `household_id` en todo, `household_members`, `user_id` en eventos |
| Patrones de consumo | `inventory_events` desde la fase 1 |
| Modo sin conexión | Caché de TanStack Query; faltaría una cola de cambios |
| **Precios** | **Nada.** Requiere una fuente fiable y revisar los términos de uso de cada supermercado |

## 7. Riesgos asumidos

| Riesgo | Mitigación |
|---|---|
| Fechas de conservación tras apertura poco fiables | Guardar siempre el origen; datos de referencia etiquetados como orientativos; lo que dice el envase manda |
| Tickets con abreviaturas imposibles | OCR **siempre** con revisión humana; fase al final del MVP a propósito |
| Coste de la API de Claude | Modelo pequeño para parseo, límites por usuario, contexto reducido |
| Prompt injection desde productos o tickets | Texto externo como datos, herramientas limitadas por RLS, validación por esquema |
| Fuga de datos entre hogares | RLS en todas las tablas + tests automáticos con dos usuarios en CI |
| Notificaciones molestas | Un único resumen diario configurable; ninguno si no hay urgencias |
