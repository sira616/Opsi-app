# Opsi · sistema de diseño

Propuesta de identidad e interfaz. Qué aspecto tiene la app, con qué recursos se
construye y por qué cada decisión.

> **Estado:** implementado, salvo el logo. Paleta, tipografías, iconos, modo oscuro,
> hojas modales y barra translúcida están en la app.

---

## 1. La idea en una frase

**Una app de cocina, no de contabilidad.** Opsi maneja fechas, cantidades y estados —todo
lo que suele producir interfaces de hoja de cálculo— y tiene que parecer lo contrario:
ligera, con color, agradable de abrir un martes a las ocho de la tarde.

Tres decisiones que salen de ahí:

1. **El dato manda, la interfaz se aparta.** Tipografía grande para lo que importa (qué
   es, cuánto queda, cuándo vence) y cromo mínimo alrededor.
2. **El color significa algo.** Verde, rojo, ámbar y azul no son decoración: son
   seguridad, calidad, urgencia y congelado. Nunca se usan por gusto.
3. **Juvenil sin ser infantil.** Radios generosos, una tipografía con carácter y acentos
   vivos; pero contraste alto y nada de degradados de colorines.

## 2. Sobre el estilo iOS, y una corrección importante

Apple presentó **Liquid Glass** en 2025 y exige soporte desde **septiembre de 2026**. Es
tentador copiarlo entero, pero hay que saber lo que ha pasado desde entonces:

- Nielsen Norman Group lo criticó duramente por usabilidad: la translucidez reduce el
  contraste justo donde hay texto.
- En la **WWDC 2026 Apple lo revisó**: bajó la transparencia por defecto, cambió el efecto
  del cristal y rehízo los iconos de aplicación para que se reconozcan mejor.

**Qué hacemos:** iOS de verdad, pero de la versión corregida.

| Sí | No |
|---|---|
| Barras superior e inferior con translucidez suave y desenfoque | Tarjetas de cristal, formularios translúcidos |
| Jerarquía por profundidad: el contenido delante, el cromo detrás | Transparencia sobre texto |
| Gestos y físicas nativas (rebote, arrastre, hoja modal) | Animaciones decorativas |
| Esquinas continuas grandes, al estilo de iOS | Bordes duros de 2px |

La regla que zanja las dudas: **si el cristal reduce el contraste de un texto, no hay
cristal.** El contraste no es negociable, el efecto sí.

**Cómo ha quedado.** La barra de pestañas flota sobre el contenido con desenfoque real
en iOS (`expo-blur`, material del sistema). En Android va un color casi opaco: el
desenfoque en tiempo real es caro y se nota en gama media, y la barra se ve igual de bien
sin costar fotogramas. El desenfoque queda **detrás de los iconos**, nunca sobre texto.

## 3. Colorimetría

Diseñada y **verificada contra WCAG 2.1 AA** con un validador propio
(`scripts/check-contrast.mjs`). Todas las combinaciones de texto llegan a 4.5:1 y los
elementos de interfaz a 3:1. Los números de las tablas son reales, no aspiracionales.

### Modo claro

| Token | Hex | Para qué | Contraste |
|---|---|---|---|
| `bg` | `#F6F5F2` | Fondo de la app. Marfil cálido, no blanco clínico | — |
| `surface` | `#FFFFFF` | Tarjetas y campos | — |
| `surfaceAlt` | `#EFEDE7` | Zonas hundidas, barras de progreso | — |
| `line` | `#E3E0D8` | Separadores decorativos | — |
| `lineStrong` | `#9D947F` | Bordes de controles | 3.01:1 |
| `ink` | `#16181A` | Texto principal | 17.8:1 |
| `inkMuted` | `#5F6470` | Texto secundario | 5.93:1 |
| `inkFaint` | `#717683` | Notas de 11px | 4.54:1 |
| **`brand`** | **`#0A7D56`** | Verde Opsi: acciones y enlaces | 4.7:1 |
| `brandBright` | `#10B981` | **Solo decorativo**: puntos, ilustraciones, logo | — |
| `brandSoft` | `#DDF5EB` | Fondo de distintivos | — |
| **`expiry`** | **`#C23B2B`** | **Caducidad: seguridad alimentaria** | 5.31:1 |
| `expirySoft` | `#FBE8E4` | Su fondo suave | — |
| `warn` | `#A46718` | Prioridad media | 4.63:1 |
| `frost` | `#2A7BB8` | Congelado | 4.54:1 |
| `frostSoft` | `#E2F0FA` | Su fondo suave | — |
| `frostInk` | `#1D5580` | Texto sobre `frostSoft` (`frost` ahí se queda en 3.9:1) | 6.79:1 |

### Modo oscuro

No es el claro invertido. Los fondos son **grises cálidos, no negro puro** —el negro
absoluto sobre OLED produce halos en los bordes— y los acentos suben de luminosidad
porque los colores oscuros desaparecen sobre fondo oscuro.

| Token | Hex | Contraste |
|---|---|---|
| `bg` | `#111316` | — |
| `surface` | `#1B1E22` | — |
| `surfaceAlt` | `#23272C` | — |
| `line` | `#2E3339` | — |
| `lineStrong` | `#616974` | 3.01:1 |
| `ink` | `#F2F3F5` | 15.1:1 |
| `inkMuted` | `#A8AFBA` | 7.57:1 |
| `inkFaint` | `#7F8690` | 4.55:1 |
| **`brand`** | **`#34D399`** | 8.70:1 |
| **`expiry`** | **`#FF8A75`** | 7.28:1 |
| `warn` | `#F2B65A` | 9.25:1 |
| `frost` | `#7CC4F2` | 8.79:1 |
| `frostInk` | `#B4DCF7` | 10.72:1 sobre `frostSoft` |

### El código de color, que es lo importante

| Color | Significa | Dónde |
|---|---|---|
| 🔴 Rojo | **Caducidad.** Pasada la fecha es un riesgo de seguridad | Grupo de prioridad alta, etiqueta de caducidad, botón de tirar |
| 🟠 Ámbar | Prioridad media, o dato **orientativo** | Grupo medio, origen «reference» |
| 🟢 Verde | Acción, marca, lo que va bien | Botones, distintivos de estado |
| 🔵 Azul | **Congelado.** Cuenta atrás parada | Grupo de congelados, acción de congelar |
| ⚪ Gris | Sin urgencia, o **sin fecha** | Grupos bajo y sin fecha |

El consumo preferente **no tiene color propio**: va en neutro. Es deliberado — si todo
grita, nada grita, y lo que de verdad importa que se distinga es la caducidad.

La escala del Nutri-Score tiene sus propios colores y **no es una fila más de esta tabla**:
sale en la sección siguiente, con las reglas que la separan de la caducidad.

## 3 bis · Nutri-Score y NOVA

Lo que Open Food Facts (OFF) declara de la nutrición de un producto, en la sección de
Nutrición de Premium. Opsi **enseña el dato con su origen y no opina** (`VOZ.md`): ni «sano»,
ni «cuidado», ni una escala de buenos y malos que sea suya. Por eso el Nutri-Score, que es una
escala de color por naturaleza, es el único sitio donde el color aparece, y NOVA y los niveles
no llevan ninguno.

### El Nutri-Score: cinco fichas en fila

Es la escala que se reconoce en un envase: **A B C D E**, de izquierda a derecha. La que toca
va **más grande, con su color y un borde grueso de 3px**; las otras cuatro quedan apagadas,
en neutro (`surfaceAlt`, letra `inkMuted`). En una fila de lista va una sola ficha pequeña
(34px, borde de 2px). Debajo del sello, siempre, de dónde sale: «Nutri-Score calculado por
Open Food Facts».

Tres reglas que no se tocan:

1. **La letra se ve siempre y el color nunca va solo.** Quien no distingue un verde de un
   naranja lee una C. Las fichas apagadas también llevan su letra.
2. **Un sello, una frase.** Para el lector de pantalla todo el sello es UN elemento con una
   etiqueta («Nutri-Score C, calculado por Open Food Facts»), y las fichas quedan ocultas:
   oír «A, B, C, D, E» no dice cuál es. Cada ficha pequeña de la lista tiene la suya.
3. **El color es de la escala.** Los tokens `nutriA` a `nutriE` solo los usa
   `features/nutricion`. Ningún otro rincón de la app los toma prestados, ni la escala toma
   prestado el rojo de la caducidad ni el ámbar del aviso.

### Colores

| Token | Relleno | Letra (`…Ink`) | Contraste de la letra, claro / oscuro |
|---|---|---|---|
| `nutriA` | `#0B7F43` verde | `#FFFFFF` | 5.08:1 / 5.08:1 |
| `nutriB` | `#8FC83A` lima | `#16181A` claro · `#111316` oscuro | 8.89:1 / 9.30:1 |
| `nutriC` | `#F2D90F` amarillo | `#16181A` claro · `#111316` oscuro | 12.47:1 / 13.03:1 |
| `nutriD` | `#F5B50A` ámbar | `#16181A` claro · `#111316` oscuro | 9.75:1 / 10.19:1 |
| `nutriE` | `#F07A0A` naranja | `#16181A` claro · `#111316` oscuro | 6.35:1 / 6.64:1 |
| `nutriBorder` | `#16181A` claro · `#F2F3F5` oscuro | — | — |

Los rellenos son los mismos en claro y en oscuro: todos superan los 3:1 contra el fondo
oscuro tal cual. Lo que cambia es el borde, que pasa a claro, y la tinta de las letras oscuras.

**El borde es obligatorio, no decorativo.** Un lima o un amarillo sobre blanco no llegan a 3:1
por sí solos (el relleno de la B da 2.00:1; el de la C, 1.43:1), así que la forma contra el
fondo la da el borde grueso, que llega a 17.80:1 sobre tarjeta en claro y a 15.07:1 en oscuro.
Una ficha activa sin su borde no pasa el contraste.

El validador (`npm run check:contrast`) comprueba estos pares: la letra de cada ficha sobre su
relleno (4.5:1), el borde sobre tarjeta y sobre el fondo (3:1) y la letra de una ficha apagada
sobre su fondo neutro (5.06:1 claro, 6.80:1 oscuro).

### Cómo se evita que la E parezca caducidad

El rojo es solo de la caducidad (sección 3), y la E es la ficha que más se parece a él en
cualquier Nutri-Score: el oficial es un rojo anaranjado. Aquí es **un naranja** y se asegura
de tres maneras:

- **No reutiliza ningún token de caducidad** (`expiry`, `expirySoft`, `expiryInk`,
  `expiryLine`), ni en claro ni en oscuro.
- **Queda a más de 15° de matiz de todos ellos.** `nutriE` está en 29.2° de matiz, y la
  caducidad en 6° a 12°: la distancia más corta es de 18.8° en claro y de 17.4° en oscuro. El
  validador lo comprueba con cada token de caducidad, así que mover la E o la caducidad hacia
  el otro sin querer rompe `check:contrast`.
- **La escala entera se aparta del rojo.** Para dejar sitio a una E naranja, la D es ámbar
  (matiz 44°) y la C amarillo (53°): va del verde al naranja y no llega al rojo. Lo que hace
  de última a la E es su sitio al final de la fila y su letra, no un color más cálido.

El naranja de la E y el ámbar del aviso (`warning`) conviven sin confundirse: la escala siempre
va en una fila de cinco con su letra y su origen, y el ámbar de aviso nunca sale así.

### NOVA y los niveles: en neutro

El **grupo NOVA** es una clasificación, no un semáforo. Se pinta como un cuadrado neutro con el
número (44px, `surfaceAlt`, borde `borderStrong`) y el nombre de su grupo al lado, tal cual lo
nombra su clasificación y sin un adjetivo más: 1 «Sin procesar o mínimamente procesado», 2
«Ingrediente culinario procesado», 3 «Procesado», 4 «Ultraprocesado». Sin color, sin iconos de
alarma y siempre con «Grupo NOVA según Open Food Facts» debajo. En la lista, una pastilla
neutra («NOVA 4»).

Los **niveles** de OFF (grasas, saturadas, azúcares y sal) son **texto** («Nivel alto») bajo el
nutriente, en `inkMuted`, con una línea que los atribuye («Niveles calculados por Open Food
Facts»). No son un semáforo: un nivel «alto» en rojo sería un aviso de caducidad que no lo es.

### La tabla y el resto

- **Tabla «Información nutricional»** por 100 g, por 100 ml o «por 100 g o 100 ml» si OFF no
  dice la base. Energía en kcal, grasas, de las cuales saturadas, hidratos, de los cuales
  azúcares, fibra, proteínas y sal. Cifras con coma y **tabulares**, sin decimales que no
  aportan (12,5 g; 12 g; 0,07 g). Una fila por nutriente, con la subfila sangrada.
- **Un dato que no consta es «—», nunca 0.** Un 0 de verdad («0 g») significa que OFF declara
  cero. Si no consta ninguno, no hay tabla: «Sin datos nutricionales» y nada más.
- **Aditivos**, como los declara OFF («Open Food Facts declara 3 aditivos: E330, E322, E150D»)
  o, con la lista vacía, «Open Food Facts no declara aditivos». Nunca «sin aditivos» como
  afirmación propia. Si OFF no da la lista, el bloque no sale.
- **Una línea que no falta nunca**, haya o no datos: «Open Food Facts puede estar incompleto o
  desactualizado. Mira siempre la etiqueta.» y la licencia ODbL.
- Los textos de OFF (la ración, los aditivos) van en un `<Text>` plano: sin marcado, sin
  enlaces, sin abrir nada.
- Áreas táctiles de 44px en lo pulsable (las filas, «Ver nutrición», «Reintentar»). Las fichas
  del sello no son pulsables.

## 4. Tipografía

Dos familias, las dos de Google Fonts con licencia **OFL 1.1** (libre, también comercial).

| Rol | Familia | Por qué |
|---|---|---|
| **Títulos** | [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) | Variable, con carácter, algo excéntrica sin llegar a rara. Es lo que pone el «juvenil» sin recurrir a una redonda infantil |
| **Interfaz y texto** | [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) | Geométrica con las esquinas suavizadas. Números excelentes, que en esta app se leen todo el rato |

### Escala

| Uso | Tamaño / peso | Familia |
|---|---|---|
| Título de pantalla | 30 / 700, tracking −0.02em | Bricolage |
| Título de tarjeta | 17 / 600 | Jakarta |
| Cuerpo | 15 / 400 | Jakarta |
| Secundario | 13 / 400 | Jakarta |
| Nota | 11.5 / 400 | Jakarta |
| Etiqueta de sección | 11 / 700, VERSALITAS, tracking 0.1em | Jakarta |
| Dato grande (días) | 17 / 700, cifras tabulares | Jakarta |

> **Cifras tabulares** en cantidades y fechas: sin ellas, una lista de números baila al
> actualizarse porque el `1` es más estrecho que el `8`.

```bash
npx expo install @expo-google-fonts/bricolage-grotesque @expo-google-fonts/plus-jakarta-sans expo-font
```

## 5. Iconos

**[Phosphor Icons](https://phosphoricons.com)**, vía `phosphor-react-native`.

| | |
|---|---|
| **Licencia** | MIT. Libre para uso comercial, sin atribución obligatoria |
| **Catálogo** | Más de 9.000 iconos |
| **Pesos** | `thin`, `light`, `regular`, `bold`, `fill` y `duotone` |

**Por qué Phosphor y no otro.** Los seis pesos son la razón de peso: la barra de
pestañas puede usar `regular` en reposo y `fill` en la activa, que es exactamente el
patrón de iOS, con el mismo icono y sin buscar un sustituto. Lucide (ISC) y Tabler (MIT)
son igual de buenos en calidad, pero solo traen contorno.

```bash
npx expo install phosphor-react-native react-native-svg
```

### Iconos elegidos

| Sitio | Icono | Peso |
|---|---|---|
| Pestaña Inventario | `Basket` | `fill` activa / `regular` en reposo |
| Pestaña Lista | `ListChecks` | ídem |
| Pestaña Opsi | `ChatCircleDots` | ídem |
| Pestaña Ajustes | `GearSix` | ídem |
| Añadir | `Plus` | `bold` |
| Abrir | `Package` | `duotone` |
| Usar cantidad | `ForkKnife` | `duotone` |
| Descontar | `Minus` | `bold` |
| Congelar | `Snowflake` | `duotone` |
| Descongelar | `Drop` | `duotone` |
| Terminar | `CheckCircle` | `duotone` |
| Tirar | `Trash` | `duotone` |
| Cuenta atrás parada | `Snowflake` | `fill`, 11px, en la fila |
| Escáner | `Barcode` | `regular` |
| Cuánto (alta) | `Scales` | `duotone` |
| Qué pasillo (alta) | `Tag` | `duotone` |
| Dónde lo guardas (alta) | `MapPin` | `duotone` |
| Hasta cuándo (alta) | `CalendarBlank` | `duotone` |
| Categoría adivinada | `Sparkle` | `fill`, 11px |
| Filtro | `FunnelSimple` | `duotone` |
| Usar ½ | `CircleHalf` | `duotone` |
| Usar ⅓ | `ChartPieSlice` | `duotone` |
| Usar ¼ | `ChartPie` | `duotone` |
| Otra cantidad | `PencilSimple` | `duotone` |
| Volver | `CaretLeft` | `bold` |
| Nutrición (widget de Premium) | `JarLabel` | `duotone` |
| Ver nutrición (botón de la ficha) | `JarLabel` | `bold` |

> Las fracciones de «Usar» son la excepción a lo de abajo, y con motivo: el glifo
> **½ ⅓ ¼** ya es el texto, y debajo va la cantidad real que se descontará («0,5 l»).
> Un botón que dice lo que va a pasar no necesita más palabras.
>
> Los iconos **nunca van solos** en una acción destructiva. Un cubo de basura sin la
> palabra «Tirar» al lado se confunde con «vaciar» o «borrar todo». Por eso todos los
> botones de la pantalla de detalle llevan icono **y** texto, alineados a la izquierda:
> el icono da el reconocimiento de un vistazo, la palabra quita la ambigüedad.
>
> `duotone` y no `regular`: con una sola línea, siete botones apilados se leen como una
> lista de ajustes. El relleno tenue del duotone les da peso de acción sin gritar.

### Un icono por pasillo

Las diez categorías de supermercado llevan el suyo: `Carrot` fruta y verdura, `Hamburger`
carne, `Fish` pescado, `Egg` lácteos y huevos, `Bread` panadería, `Grains` despensa,
`Snowflake` congelados, `BeerBottle` bebidas, `Cookie` dulces y `Basket` otros.

Phosphor no tiene icono de carne; `Hamburger` es lo más cercano y se lee a la primera,
que es lo único que se le pide.

### Un icono por alimento

Cada elemento del inventario lleva **su propio icono de comida, deducido del nombre**.
«Leche entera» trae una jarra, «huevos» un huevo, «merluza» un pez. Nadie lo elige: sale
de lo que escribes.

Es lo que más cambia la sensación de la app: una lista de texto con fechas parece una
hoja de cálculo; la misma lista con un icono de comida a la izquierda parece una cocina.
Y no le cuesta nada al usuario.

El icono va en **peso `duotone`** dentro de una pastilla redondeada, teñido según la
urgencia: verde lo normal, rojo lo que corre prisa, azul lo congelado. Cuando no acierta
cae en unos cubiertos — equivocarse es barato, porque el icono acompaña al nombre y
nunca lo sustituye.

Las reglas viven en `app/src/shared/lib/iconos-comida.tsx`, y ampliarlas es añadir una
línea.

## 5 bis · El aspecto lo elige el usuario

Tres opciones en Ajustes: **Automático · Claro · Oscuro**. Automático sigue el ajuste del
teléfono; las otras dos lo fijan.

La preferencia se guarda **en el dispositivo**, no en la cuenta. Es deliberado: el
aspecto es una preferencia del aparato —un móvil en oscuro y una tablet en claro es
razonable—, funciona sin conexión y se aplica al instante. Guardarla en `user_settings`
habría obligado a una migración para algo que no necesita viajar entre dispositivos.

Nada se pinta hasta saber qué aspecto toca: arrancar en claro y saltar a oscuro medio
segundo después se ve como un fogonazo. Y si el almacenamiento falla, se sigue con el
ajuste del sistema en lugar de quedarse en blanco.

## 6. Layout

| | |
|---|---|
| **Margen lateral** | 20px, constante en todas las pantallas |
| **Separación entre tarjetas** | 10px dentro de un grupo, 24px entre grupos |
| **Radios** | 14px tarjetas · 12px botones y campos · 999px distintivos |
| **Área táctil** | 44px mínimo, sin excepciones |
| **Sombras** | Una sola, muy suave: `0 1px 2px rgba(0,0,0,.04)`. La jerarquía la dan el color y el espacio |

### La fila del inventario

Es el componente que más se repite y el que decide si la app se entiende:

```
┌──────────────────────────────────────────────┐
│  Leche entera                     CADUCIDAD  │   ← nombre 17/600 · etiqueta 9.5/700
│  Abierta · 400 ml de 1 L · Nevera   Mañana   │   ← meta 13 · dato 17/600
│  orientativo · tras abrir                    │   ← nota 11.5, el origen SIEMPRE
└──────────────────────────────────────────────┘
```

Tres niveles de información y ni uno más. El origen de la fecha en la tercera línea no es
relleno: es un principio del proyecto hecho visible.

## 7. Movimiento

Poco y con sentido. Todo con `react-native-reanimated`, que ya viene con Expo.

| Qué | Cómo |
|---|---|
| Entrar en una pantalla | Empuje lateral nativo de iOS, sin tocar |
| Alta y detalle | Hoja modal que sube desde abajo, con arrastre para cerrar |
| Cambio de prioridad tras una acción | La fila se desvanece y reaparece en su grupo nuevo, 250ms |
| Confirmar | El botón se expande a las dos opciones, 180ms |
| Carga | Esqueletos con la forma de la fila, nunca una ruleta centrada |

**Se respeta «Reducir movimiento»** del sistema: con esa opción activada, todo son cortes
secos. No es opcional, es accesibilidad.

## 8. El logo

Opsi necesita **una marca que funcione a 60px**, que es como se ve un icono en la pantalla
de inicio. En la WWDC 2026 Apple rehízo sus iconos precisamente para que se reconozcan
mejor: formas simples y rotundas.

### El concepto

Una **«O» que es a la vez un alimento y una cuenta atrás**: un círculo lleno con un
segmento abierto arriba a la derecha, como la porción que falta en un gráfico de tarta, y
una hoja pequeña naciendo de ese hueco. Se lee como la inicial de Opsi, como comida
fresca y como tiempo que corre.

### Prompt para generarlo

```
A minimalist app icon mark: a single thick ring forming the letter "O",
with a clean wedge cut out of the upper-right, like a slice missing from
a pie chart. A small simple leaf grows from the gap, angled up-right.
Solid flat vector shapes, no gradients, no outlines, no text.
Geometric and friendly, generous rounded terminals, uniform stroke weight.
Colour: a single warm emerald green (#10B981) mark on a soft ivory
background (#F6F5F2). Centred, balanced, lots of breathing room.
Designed to stay legible at 60 pixels. Flat vector illustration style,
in the manner of a modern iOS app icon.
```

**Variante para el icono de la pantalla de inicio** (fondo lleno, como manda Apple):

```
Same mark, inverted: ivory (#F6F5F2) mark centred on a solid emerald
green (#0A7D56) rounded-square background, edge to edge, no padding
around the square. Flat, no gradient, no shadow, no bevel.
```

### Qué pedirle al resultado

| Debe | No debe |
|---|---|
| Leerse de un vistazo a 60px | Tener detalles finos que desaparecen |
| Funcionar en una sola tinta | Depender de un degradado |
| Ser un SVG limpio | Traer sombras o biseles incrustados |
| Sobrevivir al recorte circular de Android | Llegar a los bordes del cuadrado |

Cuando tengas el SVG: `app/assets/icon.png` a 1024×1024 y `app/assets/splash.png`, que es
la marca centrada sobre `bg`. Se declaran en `app/app.json`.

## 9. Qué hay que cambiar en el código

| Paso | Estado |
|---|---|
| 1 · Las dos paletas y `useTheme()` | ✅ En `src/shared/theme/tokens.ts`, con `makeStyles()` para hojas que conocen el tema |
| 2 · Cargar las tipografías | ✅ En `_layout.tsx`, con la pantalla de carga esperando a que estén |
| 3 · Phosphor en vez de `@expo/vector-icons` | ✅ Y un icono de comida por alimento |
| 4 · Pestañas con `fill` en la activa | ✅ |
| 5 · Alta y detalle como hoja modal | ✅ `formSheet` nativa, con tirador y arrastre para cerrar |
| 6 · El contraste en la CI | ✅ `npm run check:contrast`, y **lee los colores de `tokens.ts`** |

Sobre el paso 6: la primera versión del validador tenía su propia copia de la paleta, y
las dos se separaron — daba todo por bueno mientras la app usaba otros valores. Ahora
parsea `tokens.ts`, así que no pueden divergir.

## El prototipo

Pantallas navegables, en claro y en oscuro, con esta paleta y esta tipografía:

→ **[Prototipo de Opsi](https://claude.ai/artifact/YCrfvirHWQyDQMJTQo4EqD)**

---

## Fuentes

- [Liquid Glass — Wikipedia](https://en.wikipedia.org/wiki/Liquid_Glass)
- [Liquid Glass Is Cracked, and Usability Suffers in iOS 26 — Nielsen Norman Group](https://www.nngroup.com/articles/liquid-glass/)
- [Phosphor Icons](https://phosphoricons.com) · MIT
- [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) · OFL 1.1
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) · OFL 1.1
