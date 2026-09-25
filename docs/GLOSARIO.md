# Glosario

El vocabulario del dominio. Estos términos significan lo mismo en la base de datos,
en la interfaz y en lo que dice Opsi.

## Producto vs. elemento

| Término | Qué es | Ejemplo |
|---|---|---|
| **Producto** (`products`) | Una entrada del catálogo. Existe aunque no tengas ninguno en casa | «Leche entera Marca X, brick 1 L, EAN 8410…» |
| **Elemento** (`inventory_items`) | Una unidad concreta **en tu casa**, con su estado y sus fechas | «Ese brick que abriste el martes, medio lleno, en la nevera» |

Dos bricks iguales comprados el mismo día son **un producto y dos elementos**. Si abres uno,
sus fechas límite divergen.

## Estados de un elemento

| Estado | Significado |
|---|---|
| `cerrado` | Sin abrir. Vale la fecha del envase |
| `abierto` | Abierto. La fecha límite efectiva pasa a depender de la conservación tras apertura |
| `consumido_parcialmente` | Abierto y con menos cantidad de la inicial |
| `congelado` | En el congelador. La cuenta atrás se detiene |
| `descongelado` | Sacado del congelador. Consumo rápido |
| `agotado` | Terminado. Puede disparar la sugerencia de reposición |
| `desechado` | Tirado. Alimenta los patrones de desperdicio |

## Fechas

### Tipo de fecha

| Tipo | Qué implica | Cómo se comunica |
|---|---|---|
| **Caducidad** | Pasada la fecha es un riesgo de **seguridad alimentaria** | Aviso claro; Opsi nunca sugiere consumirlo |
| **Consumo preferente** | Pasada la fecha es una cuestión de **calidad** | Informativo; sigue siendo consumible |

> Esta distinción no es un matiz: es uno de los principios que no se negocian.
> Tratarlas igual sería o bien tirar comida buena, o bien sugerir comer algo inseguro.

### Origen de la fecha

Toda fecha guarda **de dónde viene**, y la interfaz lo muestra:

| Origen | Significado |
|---|---|
| `envase` | Leída de la etiqueta del producto. La más fiable |
| `usuario` | Introducida a mano |
| `fabricante` | De la ficha del producto (Open Food Facts) |
| `referencia` | De una tabla de conservación general. **Orientativa** |
| `estimacion` | Calculada por la app. **Orientativa** |

### Fecha límite efectiva

La fecha que realmente importa **ahora mismo**, dado el estado del elemento. Un yogur
con consumo preferente a 20 días que abres hoy tiene una fecha límite efectiva de 2 días,
no de 20. Es lo que ordena «Consumir primero».

## Prioridad

Agrupación derivada de la fecha límite efectiva:

| Grupo | Criterio |
|---|---|
| **Alta** | Caduca hoy o mañana, o ya está pasado |
| **Media** | Caduca en los próximos días |
| **Sin urgencia** | Queda margen de sobra |
| **Sin fecha** | No hay fecha registrada. No es lo mismo que «no urgente» |

## Otros

| Término | Significado |
|---|---|
| **Hogar** (`household`) | Unidad de aislamiento de datos. Todo cuelga de él. En la app se llama **nevera** |
| **Nevera privada** (`kind = 'personal'`) | La de cada persona, creada al registrarse. **No se comparte nunca**: no se invita a nadie, no se abandona y no se traspasa |
| **Nevera compartida** (`kind = 'shared'`) | La que crea una persona con nombre e icono, y a la que invita por nombre de usuario. Aceptar una invitación **añade** una nevera a las tuyas; no te saca de ninguna |
| **Límite de neveras** (`household_limit`) | Cuántas neveras puede tener una persona, la privada incluida: 2 hoy, previsto 5 con un plan de pago. Lo escribe el servidor, nunca la app |
| **Nevera huérfana** | Una compartida de la que salió la última persona. No se borra: su inventario existe, pero nadie llega a él |
| **Evento** (`inventory_event`) | Registro inmutable de una acción. Nunca se edita ni se borra |
| **Herramienta** | Función que la asistente puede ejecutar en el servidor, limitada por RLS |
| **Fecha límite efectiva** | Ver arriba. Se calcula en la vista `inventory_with_priority` |
