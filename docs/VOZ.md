# Opsi · guía de voz

Cómo escribe Opsi. Qué dice, cómo lo dice y en qué casos se calla la gracia. Está
pensada para usarse como lista de comprobación al escribir o revisar un texto de
pantalla, no para leerla una vez y olvidarla.

> **Estado:** los textos de la app existen y en general ya van por aquí. Esta guía
> fija la regla y marca, en la tabla de la sección 5, qué se queda igual y qué cambia.

> **Alcance:** texto visible, etiquetas de accesibilidad y mensajes de error del
> cliente. No cubre los mensajes que escribe el servidor —ver la sección 7— ni
> nada de diseño visual, que vive en [`DISENO.md`](DISENO.md).

---

## 1. Quién es Opsi

Opsi es **el compi de piso que se acuerda de lo que hay en la nevera**. Vive en la
casa, ha visto lo que hay dentro y te lo dice sin que se lo preguntes dos veces.
Tiene retranca, pero no es el gracioso del grupo: es el que se ha leído la etiqueta.

Tres cosas se siguen de ahí:

1. **Es un igual, no un servicio.** Habla de tú, sin fórmulas de atención al
   cliente («lamentamos las molestias», «por favor, inténtelo de nuevo»).
2. **Sabe algo que tú no tienes en la cabeza** —qué venció, qué llevas abierto tres
   días— y por eso vale la pena escucharle. Cuando no lo sabe, lo dice.
3. **La comida es cosa seria.** La broma se acaba donde empieza la seguridad
   alimentaria, y esa frontera no se discute pantalla por pantalla.

**Qué no es Opsi:**

| No es | Qué significa en la práctica |
|---|---|
| Una mascota | No tiene nombre propio de personaje, ni emociones, ni «¡me alegro de verte!». No saluda, no se despide, no echa de menos. |
| Un coach | No motiva, no felicita por hábitos, no lleva rachas ni medallas. «Llevas 5 días sin tirar nada» no se escribe aquí. |
| Un juez del desperdicio | Tirar comida es una acción de la app como cualquier otra. Ni sermón, ni cara triste, ni dato de impacto ambiental al confirmar. |
| Un nutricionista | No opina sobre lo que comes ni sobre cuánto. |
| Un experto que se moja | No dice si algo «todavía está bueno». Enseña el dato y su origen; la decisión es de quien abre la nevera. |

---

## 2. Cómo habla

Reglas, no adjetivos. Si una no se puede comprobar leyendo el texto, no está aquí.

**Persona y trato**

- **Siempre de tú.** Nunca usted, nunca impersonal («debe introducirse una fecha»).
- **Primera persona del singular cuando la app hace algo**: «te pregunto antes de
  apuntarlo», «el calendario lo pongo yo», «no he podido cargarlo».
- **Nunca «nosotros».** No hay equipo detrás de la pantalla; hay una app. «No
  sabemos cuándo vence» → «No sé cuándo vence».
- **Opsi no habla de Opsi en tercera persona** en la interfaz. «Opsi pregunta antes
  de añadir» solo vale en documentación, no en un ajuste.

**Longitud**

- Un texto de apoyo: **una o dos frases**. Tres es el máximo absoluto y solo si la
  tercera dice qué hacer.
- Frases de **menos de 15 palabras** siempre que se pueda. En móvil, una frase larga
  es tres líneas y nadie lee la tercera.
- Un botón: **una o dos palabras**. Si necesita tres, el problema es el botón.

**Puntuación y forma**

- Punto final en frases. Los títulos cortos y las etiquetas van sin punto.
- **Una exclamación por pantalla como mucho, y casi nunca.** Nunca dos seguidas.
- Comillas angulares «así», que es el estándar del proyecto y ya se usa en el código.
- Dos puntos para introducir algo, no para encadenar ideas. Si la frase tiene dos
  puntos y además una subordinada larga, pártela en dos frases.
- **Números en cifras** (3 días, 10 caracteres), salvo «un» y «una» cuando son
  artículo.
- **Cero emojis.** Los iconos ya son de Phosphor y están elegidos en `DISENO.md`.
- **Cero anglicismos evitables**: nada de «tips», «check», «snack», «tracking»,
  «setup». «Escanear» sí, porque en español no hay otra y ya está en el glosario.

**Vocabulario de la casa**

- Se dice **alimento** o **elemento** (el del inventario), no «producto» ni «ítem».
- Se dice **añadir**, no «dar de alta» ni «registrar».
- Se dice **nevera, congelador, despensa**, como en una cocina.
- Se dice **apuntar** para la lista de la compra, **guardar** para el inventario.
- Se dice **venció** para lo pasado y **vence** para lo futuro. «Expira» no existe.

**Humor: cuándo sí**

El humor se apoya en **lo doméstico** —la nevera vacía, las sobras, el cajón de las
verduras— nunca en lo que puede salir mal con la comida. Va en el escalón 1 y en el
escalón 2 con cuentagotas (sección 3). Si el texto tiene que enseñar una fecha, una
cantidad o un motivo, el dato va primero y la gracia después, si sobra sitio.

---

## 3. El termómetro del tono

Cuatro escalones. Lo que decide el escalón no es la pantalla, es **lo que se pierde
si el texto se lee mal**.

### Escalón 1 · Gracia libre

**Cuándo:** no hay nada en juego. Pantallas vacías, atajos, estados de «todo bien»,
pantallas de «próximamente», el saludo del alta.

**Casos concretos:** inventario vacío, lista de filtros sin resultados, «hoy no corre
prisa nada», historial vacío, `Proximamente` de lista y chat, título del alta,
atajos de fecha.

**Cómo suena:**

> Aquí no hay nada. Tu nevera está en modo monje.
> ¿Cuánto le das de vida?
> ¿Qué has traído?

### Escalón 2 · Cordial y directo

**Cuándo:** el usuario está decidiendo algo reversible. Ajustes, confirmaciones no
destructivas, textos de apoyo de un formulario, avisos de estado.

**Regla:** el dato primero, el tono después. Se permite un giro coloquial por
pantalla, no uno por línea.

**Casos concretos:** subtítulos de ajustes, `hint` de los campos, nota de la
categoría adivinada, aviso de correo pendiente de confirmar, nota de fase.

**Cómo suena:**

> Esta la he adivinado yo por el nombre. Si no he acertado, tócala.
> Mínimo 10 caracteres. Larga vale más que complicada.
> Si no hay nada urgente, no te molesto.

### Escalón 3 · Útil primero

**Cuándo:** algo ha fallado. Errores de validación, de red, de sesión, de permisos.

**Regla dura:** **todo error dice qué hacer.** El orden es (1) qué pasa, (2) qué
hacer, (3) —opcional, si cabe— un guiño. Un error con gracia que no orienta es peor
que un error seco. Si el guiño obliga a alargar el mensaje, se cae el guiño.

**Casos concretos:** `auth-errors.ts`, `db-errors.ts`, `conexion.ts`, los avisos de
`fecha-input.ts`, los `setError` del alta y del detalle, las pantallas de «Sin
conexión» y «Tu sesión ya no vale».

**Cómo suena:**

> Ese día no existe. Repasa el día y el mes.
> Has probado demasiadas veces seguidas. Espera un minuto.
> Ponle un nombre, aunque sea «eso verde del cajón».

El último es el límite superior de lo que se permite en un error: la gracia va
**dentro** de la instrucción, no añadida al lado.

### Escalón 4 · Seco

**Cuándo:** seguridad alimentaria. Aquí no hay tono, hay instrucción.

**Regla dura:** frases cortas, imperativo, sin metáforas, sin comparaciones, sin
paréntesis, sin guiños, sin atenuadores («quizá», «puede que», «suele»). Y **nunca**
una promesa en la dirección contraria: Opsi no dice que algo esté bueno, ni que no
pase nada, ni que «seguro que aún vale».

**Cómo suena:**

> Caducado el 12 de mayo. No te lo comas.
> Ya se descongeló una vez. No lo vuelvas a congelar sin cocinarlo antes.
> Una vez descongelado, 24 horas para consumirlo.

**Palabras y condiciones que disparan el escalón 4.** Si el texto contiene una de
estas, o se muestra en uno de estos estados, se escribe seco:

| Palabras | Estados del código |
|---|---|
| caduca, caducidad, caducado | `date_kind === 'expiry'` |
| venció, vencido, pasado de fecha | `days_left <= 0`, `vencido === true` en `diasRestantes` |
| descongelar, descongelado, recongelar | `state === 'thawed'`, `effective_date_reason === 'after_thawing'` |
| crudo, moho, olor, mal estado | — |
| tirar, desechar | `actions.discard`, confirmación de «Tirar» |
| 24 horas (la ventana tras descongelar) | `actions.thaw` y su `hint` |

**La frontera que no se cruza: caducidad ≠ consumo preferente.** Es el principio 2
del proyecto y aquí se traduce así:

| | Consumo preferente (`best_before`) | Caducidad (`expiry`) |
|---|---|---|
| Qué está en juego | Calidad | Seguridad |
| Escalón | 2 | 4 |
| Se puede decir | «Pasada la fecha es cuestión de calidad, no de seguridad.» | «Pasada la fecha no se come.» |
| No se puede decir | «Ya no sirve», «tíralo» | «Seguramente aún esté bien», «huélelo a ver» |
| Tono ligero | Sí, con medida | No |

Escribir el mismo texto para los dos borra la distinción, y borrarla es el error más
caro que puede cometer esta app.

---

## 4. Lo que Opsi no dice nunca

1. **Culpar por desperdiciar.** Ni «otra vez se te ha pasado», ni «has tirado 3 este
   mes», ni caritas tristes al confirmar. Tirar algo es una acción, no una falta.
2. **Prometer lo que no sabe.** Nada de «te aviso antes de que venza» mientras los
   avisos sean fase 3, ni «no se te va a olvidar nada».
3. **Fingir certeza sobre un dato orientativo.** Si el origen es `reference` o
   `estimate`, el texto dice «orientativo» o «estimado» y no lo disfraza de dato del
   envase. Una fecha sin procedencia no se enseña: es el principio 1 del proyecto.
4. **Bromear con que algo caducado «seguro que aún vale».** Ni en broma, ni con
   ironía evidente, ni como sugerencia de la asistente. Tampoco «huélelo», «pruébalo
   y verás» o «yo me lo comería».
5. **Jerga del backend.** Fuera de pantalla: RLS, JWT, RPC, PGRST202, `null`,
   «constraint», «schema», «query», «token», nombres de tabla o de función. La única
   excepción viva es el aviso de migración de `db-errors.ts`, que solo aparece en
   desarrollo y cuya única utilidad **es** el comando que hay que ejecutar.
6. **Exclamaciones en cadena** y mayúsculas para gritar. «¡¡Cuidado!!» no, «¡Genial!»
   tampoco.
7. **Disculpas de centro de llamadas.** «Lamentamos las molestias», «ha ocurrido un
   error inesperado», «por favor, inténtelo más tarde».
8. **Urgencia inventada.** El color y el orden de la lista ya dicen qué corre prisa.
   El texto no añade dramatismo encima.

---

## 5. Antes y después

**36 casos reales de la app**, más los textos de las neveras (5.5), que nacieron ya
con la guía. Las filas marcadas «Igual» están aquí a propósito:
son texto que ya cumple la guía y que no debe «mejorarse» en una limpieza futura.

### 5.1 Vacíos, listas y secciones pendientes

| Dónde | Texto actual | Texto propuesto | Por qué |
|---|---|---|---|
| `inventario.tsx` · inventario vacío, título | Aquí no hay ni las telarañas | Aquí no hay nada. Tu nevera está en modo monje. | Piedra de toque aprobada. «Ni las telarañas» es refranero de abuela, no compi de piso. |
| `inventario.tsx` · inventario vacío, cuerpo | Da de alta lo primero que pilles y aparecerá aquí, con lo que conviene gastar antes arriba del todo. | Añade lo primero que pilles. Lo que corra más prisa se pone arriba del todo. | «Dar de alta» es lenguaje de ventanilla. Dos frases cortas en vez de una con subordinada. |
| `inventario.tsx` · botón del vacío | Añadir un alimento | Añadir alimento | Botón = verbo corto sin artículos. Coincide con la etiqueta del botón «+» de la cabecera. |
| `inventario.tsx` · subtítulo sin nada guardado | Todavía no has guardado nada | Aún no hay nada guardado | El sujeto es la despensa, no la persona. Quita el «tú no has hecho» en la primera pantalla que se ve. |
| `inventario.tsx` · filtro sin resultados, título | Por ahí no sale nada | **Igual** | Escalón 1 bien resuelto: gracia corta y el botón «Ver todo» justo debajo. |
| `inventario.tsx` · filtro sin resultados, cuerpo | Tienes 12 alimentos guardados, pero ninguno encaja con lo que estás buscando. Prueba a quitar algún filtro. | Tienes 12 guardados, pero ninguno encaja con este filtro. Quítalo y vuelven todos. | Más corto y la instrucción es la última frase, que es la que se lee. |
| `inventario.tsx` · nada urgente hoy | Hoy no corre prisa nada. Cocina con calma, que la nevera está de tu parte. | Hoy no corre prisa nada. Cena lo que te apetezca. | Personificar la nevera cansa a la tercera vez, y este cartel sale a diario. |
| `lista.tsx` · próximamente | …Cuando algo se acabe, te preguntaré si lo añado. Preguntar: nunca apuntarlo por mi cuenta. | …Cuando algo se acabe te preguntaré si lo apunto; nunca lo haré por mi cuenta. | La frase telegráfica suena a nota interna. La promesa se mantiene entera porque es el principio 5. |
| `chat.tsx` · próximamente, qué hará | …Mirando tu inventario de verdad, sin inventarme nada. | …Miro tu inventario de verdad: no me invento lo que no hay. | Primera persona coherente con el resto de la pantalla. |
| `chat.tsx` · próximamente, lo que ya está | Las seis acciones que usará ya están hechas y probadas. Opsi llamará a las mismas funciones que tú, con tu sesión… | Ya está hecho y probado lo que usará por debajo. Hará lo mismo que puedes hacer tú a mano, con tu sesión: no podrá tocar nada que tú no puedas. | «Las seis acciones» y «llamará a las mismas funciones» son jerga del backend filtrada a pantalla. |

### 5.2 Alta

| Dónde | Texto actual | Texto propuesto | Por qué |
|---|---|---|---|
| `alta.tsx` · título | ¿Qué has traído? | **Igual** | Pregunta de compi de piso en la puerta de la cocina. Es la voz exacta. |
| `alta.tsx` · botón principal | Guardar | **Igual** | Verbo corto en infinitivo. Los botones no hacen gracia. |
| `alta.tsx` · error de nombre vacío | Ponle un nombre, aunque sea «eso verde del cajón». | **Igual** | El límite de lo que se permite en un error: la gracia va dentro de la instrucción. |
| `alta.tsx` · error de cantidad | La cantidad tiene que ser mayor que cero. Cero de algo es no tenerlo. | Pon una cantidad mayor que cero. | La segunda frase es un chiste explicativo que alarga un error. Además unifica con el mismo mensaje del detalle, que ya dice justo eso. |
| `alta.tsx` · campo de días (modo «la calculo yo») | O los días que le eches | ¿Cuánto le das de vida? | Ejemplo aprobado. Una pregunta pide mejor que una etiqueta, y es el único sitio del formulario donde cabe. |
| `alta.tsx` · `hint` del tipo «Caducidad» | Pasada la fecha es un riesgo de seguridad: no se come. | Pasada la fecha no se come. Es seguridad, no calidad. | Escalón 4: la instrucción va primero y en frase propia. |
| `alta.tsx` · `hint` del tipo «Consumo preferente» | Pasada la fecha es cuestión de calidad, no de seguridad. | Pasada la fecha es cuestión de calidad, no de seguridad. Lo que baja es el sabor. | Se explica la mitad amable sin prometer que sea inocuo, que es lo que Opsi no sabe. |
| `alta.tsx` · `accessibilityLabel` de los atajos | Que dure 3 días | Ponerle 3 días | Regla 4 de accesibilidad: la etiqueta describe la acción del botón, no el deseo del usuario. |
| `alta.tsx` · casilla «Ponerle fecha» | Si no la lleva o no te suena, déjalo sin marcar: «sin fecha» también es una respuesta, y tiene su propio grupo en la lista. | Si no la lleva o no te suena, déjalo sin marcar. «Sin fecha» también es una respuesta y tiene su grupo en la lista. | Dos puntos más coma larga es una frase de tres líneas en móvil. Mismo contenido, dos frases. |

### 5.3 Detalle: acciones y confirmaciones

| Dónde | Texto actual | Texto propuesto | Por qué |
|---|---|---|---|
| `elemento/[id].tsx` · `hint` de «Abrir» | Una vez abierto, muchos alimentos duran bastante menos de lo que pone el envase. | Muchos alimentos duran menos una vez abiertos. Al abrirlo recalculo la fecha. | «Bastante» no aporta. La segunda frase dice qué va a pasar al tocar el botón, que es lo que falta. |
| `elemento/[id].tsx` · `hint` de «Descongelar» | A partir de ahí, 24 horas para consumirlo. | Una vez descongelado, 24 horas para consumirlo. No se vuelve a congelar. | Escalón 4. El dato que más se incumple es justo el que faltaba. |
| `elemento/[id].tsx` · `hint` de «Congelar» ya descongelado | Ya se descongeló una vez: no vuelvas a congelarlo sin cocinarlo antes. | Ya se descongeló una vez. No lo vuelvas a congelar sin cocinarlo antes. | La orden no va subordinada a unos dos puntos. Frase propia, imperativo. |
| `elemento/[id].tsx` · confirmación de «Tirar» | ¿Tirar el yogur? No se puede deshacer. | **Igual** | Ni broma ni sermón sobre el desperdicio. Dice qué pasa y que es irreversible. |
| `elemento/[id].tsx` · elemento ya cerrado | Esto ya está tirado. Se queda en el historial, pero no admite más acciones. | Esto ya está tirado. Se queda en el historial y no admite más acciones. | El «pero» suena a consuelo. No hay nada que consolar. |
| `elemento/[id].tsx` · sin fecha límite | No sabemos cuándo vence | No sé cuándo vence | Opsi habla en singular. No hay un «nosotros» detrás de la app. |
| `elemento/[id].tsx` · error al cargar | No he podido cargarlo. + «Reintentar» | **Igual** | Distingue el fallo de red de «ya no está», que es la razón por la que existe esa rama. |

### 5.4 Errores de sistema, sesión y cuenta

| Dónde | Texto actual | Texto propuesto | Por qué |
|---|---|---|---|
| `db-errors.ts` · permisos / RLS | No tienes permiso para eso. Puede que tu sesión haya caducado: vuelve a entrar. | No tienes permiso para eso. Si la sesión ha caducado, vuelve a entrar y prueba otra vez. | «Puede que» es duda sin salida. La condicional deja la instrucción intacta. |
| `db-errors.ts` · sesión caducada | Tu sesión ha caducado. Vuelve a entrar. | **Igual** | Cuatro palabras y una instrucción. El patrón de todos los errores de sesión. |
| `conexion.ts` · sin conexión | No llego a http://…\n\n· ¿Está levantado? npm run up\n· ¿Sigue siendo esa la IP?… | **Igual** | Parece técnico porque el problema lo es. Nombra la URL y da tres cosas que probar: es exactamente el escalón 3. |
| `(app)/_layout.tsx` · sesión huérfana | Tu sesión ya no vale | **Igual** | Cuatro palabras, sin culpar a nadie, y el cuerpo explica la causa real. |
| `auth-errors.ts` · credenciales | Ese usuario y esa contraseña no coinciden. | **Igual** | No dice cuál de los dos falla, que es correcto, y no regaña. |
| `entrar.tsx` · reclamo bajo el título | Sabe lo que tienes. Sabe cuándo usarlo. | Sé lo que tienes. Y cuándo usarlo. | Único sitio donde Opsi se presenta: que lo haga en primera persona, como hablará después. Cambio opcional; afecta al reclamo de marca. |
| `ajustes.tsx` · fila «Usuario» | Es con lo que entras, y no hay forma de cambiarlo. Elegiste bien, seguro. | Es con lo que entras y no se puede cambiar. | Retranca a costa del usuario en un sitio donde solo estorba, y sale cada vez que abre ajustes. El chiste que se repite deja de serlo. |
| `ajustes.tsx` · lista de la compra automática | Desactivado a propósito. Con esto apagado, Opsi pregunta antes de añadir nada a tu lista. | Con esto apagado te pregunto antes de apuntar nada. Viene así a propósito. | Opsi no habla de Opsi en tercera persona. Y «apuntar» es el verbo de la lista. |
| `ajustes.tsx` · resumen diario | Un solo aviso al día con lo que conviene gastar. Si no hay nada urgente, no te molesto. | **Igual** | Promete poco y cumple. Primera persona bien usada. |
| `ajustes.tsx` · borrar la cuenta | Borrar la cuenta y sus datos todavía no es posible desde la app. Está pendiente. | **Igual** | Honesto sobre lo que no hay. Es el patrón para todo lo que falte. |

### 5.5 Neveras

Estos textos no tienen «texto actual» porque se escribieron con la guía delante: la
columna dice qué regla los sostiene. Las neveras son varias por persona —una privada y
las compartidas que quiera—, y casi todo lo de aquí existe para que se vea **en cuál se
está** y **qué pasa al elegir**.

| Dónde | Texto actual | Texto propuesto | Por qué |
|---|---|---|---|
| `PildoraNevera` · etiqueta de accesibilidad | — (nuevo) | Nevera activa: Mi casa. Abrir selector | Regla 4 de accesibilidad: el dato y la acción, sin gracia. El nombre va tal cual: lo puso la persona. |
| `SelectorNevera` · título | — (nuevo) | ¿Qué nevera miras? | Una pregunta corta y de tú, como «¿Qué has traído?». Sin «Elige», que es lenguaje de formulario. |
| `SelectorNevera` · subtítulo de cada fila | — (nuevo) | La tuya · Compartida · 3 personas | Solo el dato: qué es y cuánta gente hay. «La tuya» dice de un vistazo que la privada no se comparte. Con una persona, en singular. |
| `SelectorNevera` · etiquetas de accesibilidad de las filas | — (nuevo) | Cambiar a la nevera Piso compartido · Seguir en la nevera Piso compartido | Describen la acción de pulsar. La activa dice «seguir» porque pulsarla solo cierra la hoja. «La tuya» y el recuento de gente van en la pista, no en la etiqueta. |
| `SelectorNevera` · botón de crear | — (nuevo) | Crear nevera compartida | Tres palabras y es a propósito, la única excepción a la regla de las dos: «Crear nevera» a secas sonaría a que se puede crear otra privada, y no se puede. |
| `SelectorNevera` · tope de neveras | — (nuevo) | Tu plan por ahora llega a 2 neveras, la tuya incluida. Para crear otra, sal antes de una compartida. | Escalón 3 sin ser un fallo: recuadro de aviso, no rojo. El número sale del servidor, nunca de una constante. Dice qué hacer si hay algo que hacer. Ni fechas ni «pronto habrá más»: no se promete lo que la app no sabe (sección 4, regla 2). |
| `FormularioNevera` · título y botón | — (nuevo) | Nueva nevera · Editar nevera / Crear nevera · Guardar | Verbos cortos en infinitivo (sección 6). El título de crear no dice «compartida»: lo dice el texto de debajo. |
| `FormularioNevera` · texto de apoyo | — (nuevo) | Es compartida: tú la llevas y decides quién entra. · Es la tuya y no la ve nadie más. Ponle el nombre que quieras. · Lo que cambies lo ve toda la gente de esta nevera. | Escalón 2, dato primero: qué implica cada caso. El único giro coloquial es el de la privada; uno por pantalla. |
| `FormularioNevera` · campo Nombre | — (nuevo) | Nombre · Hasta 80 caracteres. | El límite va en el `hint` y con su número, como pide la sección 6. |
| `FormularioNevera` · etiquetas de los iconos | — (nuevo) | Elegir el icono olla | La acción, con el nombre del dibujo en minúscula. Las etiquetas vienen de la tabla de iconos del servidor y describen el dibujo, no la broma. |
| `FormularioNevera` · editar sin ser quien la lleva | — (nuevo) | Solo quien lleva la nevera puede cambiarle el nombre o el icono. Pídeselo a esa persona. | Se dice ANTES de enseñar un formulario que el servidor va a rechazar. Con las mismas palabras que su error, que ya dice a quién acudir. |
| `FormularioNevera` · el tope al crear | — (nuevo) | El mensaje del servidor, sin tocar, en un recuadro de aviso | El servidor ya escribió qué pasa y qué hacer. La app solo decide el color, con el `hint` (sección 7). |
| `nevera/[id]/editar` · una nevera que ya no es tuya | — (nuevo) | Esa nevera ya no es tuya. + «Volver» | Pasa con un enlace viejo o después de salir de ella. Corto y con salida. |
| `alta.tsx` · dónde se guarda | — (nuevo) | Se guarda en «Piso compartido» | Con varias neveras, guardar tiene consecuencias y hay que verlas. Es texto, no botón: cambiar de nevera se hace desde el inventario. |
| `SeccionMisNeveras` · título y recuento | — (nuevo) | Mis neveras · Tienes 1 de 2. | El recuento va en `caption`, sin gracia: es el dato que explica el tope. «Tienes 2 de 2» avisa antes de que alguien pulse «Crear». |
| `SeccionMisNeveras` · crear al llegar al tope | — (nuevo) | Tu plan por ahora llega a 2 neveras, la tuya incluida. Para crear otra, sal antes de una compartida. | El mismo texto que el selector, de la misma función (`textoTope`): que dos pantallas digan lo mismo con palabras distintas sería un concepto con dos nombres. |
| `GestionNevera` · una privada | — (nuevo) | Esta nevera es solo tuya: no se comparte ni se deja. Para compartir, crea una compartida y cambia entre las dos desde el inicio. | Escalón 2. Explica por qué no hay «invitar» en vez de esconder el botón sin decir nada, y dice qué hacer. |
| `GestionNevera` · quien no la lleva | — (nuevo) | Invitar y sacar gente es cosa de quien lleva la nevera. Tú siempre puedes irte. | Se dice antes de enseñar un botón que el servidor rechazaría. La segunda frase es la salida. |
| `GestionNevera` · plazas | — (nuevo) | Caben 5 personas en esta nevera, contando las invitaciones que aún no han contestado. | El número sale de la nevera, nunca de una constante. «Contando las invitaciones» porque una pendiente es una plaza ya prometida. |
| `InvitacionesEnviadas` · título | Invitaciones que has enviado | Invitaciones de esta nevera | Las ve cualquier miembro, no solo quien las mandó: «que has enviado» era falso para quien no las envió. |
| `AvisoInvitaciones` · el inicio | — (nuevo) | Te han invitado a «Piso» · syreta quiere compartir nevera contigo. Tú decides. | Escalón 1: es una invitación, no un peligro. «Tú decides» dice que no hay prisa ni compromiso. Existe porque aún no hay avisos push. |
| `InvitacionesRecibidas` · confirmar «Entrar» | ¿Entrar en «X»? Lo que tienes guardado se queda en tu nevera de ahora y no te lo llevas. | ¿Entrar en «Piso»? Se suma a tus neveras y puedes cambiar entre ellas cuando quieras. La tuya sigue como está. | El texto viejo era verdad en el modelo anterior (aceptar te movía). Ahora aceptar añade, y lo que hay que tranquilizar es lo contrario: que no pierdes nada. |
| `SalirDeLaNevera` · no la llevas | — (nuevo) | ¿Salir de «Piso»? Lo guardado se queda ahí y dejas de verla. Tu nevera sigue como está. Para volver, tendrían que invitarte otra vez. | Escalón 3, sin humor: es una salida que no se deshace sola. Dice qué se queda, qué no se pierde y cómo se vuelve. |
| `SalirDeLaNevera` · la llevas y eres la única persona | — (nuevo) | ¿Salir de «Piso»? Se queda sin nadie y lo que hay guardado deja de estar a tu alcance. No se puede deshacer. | Escalón 4: lo más serio de los tres casos. No hay «borrar nevera», así que esta es la única forma de liberar plaza, y por eso lleva encima una nota que lo explica. |

---

## 6. Microcopy de referencia

### Botones

**Verbo corto en infinitivo, sin artículo, sin punto.** Nunca en primera persona
(«Guardo»), nunca sustantivado («Guardado»), nunca con emoji.

| Sitio | Etiqueta |
|---|---|
| Guardar el alta | Guardar |
| Salir sin guardar | Cancelar |
| Acciones del detalle | Abrir · Congelar · Descongelar · Terminar · Tirar |
| Descontar cantidad | Descontar |
| Volver a intentarlo | Reintentar |
| Vaciar filtros | Quitar el filtro |
| Ir al alta desde un vacío | Añadir alimento |
| Cuenta | Entrar · Crear cuenta · Cerrar sesión |

**Confirmación destructiva:** la etiqueta de confirmar **repite la acción**, nunca
«Aceptar» ni «Sí» a secas. «Sí, tirarlo». «Sí, se ha terminado». La pregunta dice
qué se pierde y que no se puede deshacer, y nombra el alimento:
«¿Tirar la merluza? No se puede deshacer.»

### Estados de carga

- Lo normal es **no escribir nada**: un `ActivityIndicator` y hueco reservado. Un
  «Cargando…» que parpadea medio segundo es ruido.
- Si la espera es de una acción que el usuario acaba de pulsar, el botón se apaga y,
  si hace falta texto, va en gerundio corto: «Reenviando…».
- Nunca «Un momentito», «Preparando la magia» ni variantes.

### Vacíos

Tres piezas, en este orden:

1. **Título con gracia**, corto. «Aquí no hay nada. Tu nevera está en modo monje.»
2. **Una frase que diga qué pasaría si hubiera algo.** «Lo que corra más prisa se
   pone arriba del todo.»
3. **Un botón que resuelva el vacío.** «Añadir alimento», «Ver todo».

Un vacío sin salida es una pantalla rota, por mucha gracia que tenga el título.

### «Próximamente» honestos

Nunca un «próximamente» a secas, y nunca un control que finge funcionar. El patrón
del componente `Proximamente` es: **qué hará** en una o dos frases, **en qué fase**,
y **qué hay ya hecho por debajo** si de verdad lo hay. Si un ajuste se guarda pero
todavía no tiene efecto, se dice: «Los avisos llegan en la fase 3. Lo que elijas
aquí se guarda desde ya.»

### Errores

Plantilla: **qué ha pasado · qué hacer**. Con eso basta.

- Máximo dos frases, salvo que haya varias cosas que probar, y entonces van en lista
  como en `conexion.ts`.
- Si el error tiene un número —caracteres que faltan, cantidad que queda—, ese número
  va en el mensaje: «Te faltan 3 caracteres», «Solo quedan 300 ml».
- Ningún error empieza por «Error» ni por «Lo sentimos».

### Fechas y orígenes

El origen se enseña siempre, con las palabras de `describeDateSource`: «del envase»,
«la pusiste tú», «del fabricante», «orientativo», «estimado». En un texto redactado
se escribe entero: «La que pusiste tú, retrasada los 4 días que pasó congelado.»
Un dato `reference` o `estimate` **nunca** se cuenta como si fuera del envase.

---

## 7. Cómo aplicarla sin romper nada

Para quien vaya a tocar el código con esta guía delante.

### La etiqueta de accesibilidad y el texto visible pueden divergir, y suelen

`accessibilityLabel` y `accessibilityHint` **describen la acción o el dato**. Nada de
retranca: un lector de pantalla lee la broma entera, a velocidad de lectura y sin el
icono que la contextualiza.

| Visible | Etiqueta de accesibilidad |
|---|---|
| «+» | «Añadir alimento» |
| «½ · 250 ml» | «Usar ½, 250 ml» |
| «3 días» (atajo) | «Ponerle 3 días» |
| «Aquí no hay nada. Tu nevera está en modo monje.» | — (es texto, se lee tal cual; la gracia aquí no estorba porque no es un control) |

Regla práctica: si el elemento es **pulsable**, la etiqueta dice qué hace al pulsarlo.
Si es **texto**, se lee tal cual y no hace falta etiqueta.

### Los mensajes del servidor no se traducen ni se decoran por encima

Esta es la lección más cara del proyecto, y ya se ha pagado tres veces:

1. **P0002.** La app sustituía el mensaje por «Ese elemento ya no existe», y eso tapó
   durante días un «No tienes ningún hogar» que era la pista de verdad.
2. **Usar cantidad.** Un `onError` propio en el detalle cambiaba la respuesta del
   servidor por «No se pudo usar esa cantidad», borrando el «Quieres usar 500 pero
   solo quedan 300», que decía exactamente qué pasaba.
3. **Esquema desactualizado.** El error de PostgREST sobre la caché del esquema se
   veía como «no puedo añadir comida», que no se parece en nada a su causa: faltaba
   `npm run db:reset`.

Las reglas que salen de ahí:

- Los códigos `22023`, `P0001` y `P0002` **devuelven el mensaje del servidor tal
  cual**. Están escritos en español y dicen más que cualquier texto genérico.
- Una mutación **no pone su propio `onError`** con un texto de relleno. Si hay que
  añadir contexto, se añade **alrededor**, sin sustituir.
- Aplicar esta guía **no es motivo** para reescribir un mensaje que viene de la base
  de datos. Si suena raro, se cambia en SQL, no en la pantalla.
- Un `hint` estable (`limite_neveras`, `nevera_llena`…) sirve para decidir **qué se
  enseña además** —un recuadro de aviso en vez de uno rojo, refrescar una lista—, nunca
  para escribir otro texto en su lugar. Se lee con `pistaDeError` en `db-errors.ts`.

### Que no suene a plantilla

- **Una broma por pantalla.** Si ya hay gracia en el título del vacío, el cuerpo y el
  botón van rectos.
- **Ninguna broma en dos pantallas.** Si un giro funciona en el inventario vacío, no
  se recicla en la lista vacía: se escribe otro.
- Las frases que salen **a diario** —el contador de la cabecera, «nada urgente hoy»,
  los subtítulos de ajustes— se escriben pensando en la vez número cincuenta, no en
  la primera.
- Si dos textos del mismo escalón empiezan igual («Parece que…», «Vaya…»), uno de los
  dos está mal.

### Checklist antes de dar por bueno un texto

1. ¿De tú, sin «usted» y sin impersonal?
2. ¿Cabe en dos frases? ¿Alguna pasa de 15 palabras sin necesidad?
3. Si es un error: ¿dice qué hacer?
4. Si toca caducidad, descongelado o tirar: ¿está seco, sin adornos ni atenuadores?
5. Si enseña una fecha: ¿se ve de dónde sale? ¿Lo orientativo está marcado como tal?
6. ¿Promete algo que la app todavía no hace?
7. ¿Repite una broma que ya está en otra pantalla?
8. ¿Hay jerga del backend, anglicismos o exclamaciones de más?
9. Si es pulsable: ¿la etiqueta de accesibilidad describe la acción?
10. ¿Estás reescribiendo un mensaje que en realidad viene del servidor?
