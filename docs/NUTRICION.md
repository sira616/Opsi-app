# Opsi · base de nutrición para la asistente

Qué sabe la asistente sobre comer equilibrado cuando propone qué cenar. Es una **base de
conocimiento**, no un plan para una persona: Opsi no pauta dietas ni hace de nutricionista
(`VOZ.md` §1). Sirve para que, entre dos cenas posibles con lo que hay en la nevera, la
propuesta no sea siempre pasta con queso.

> **Estado: borrador.** Todavía NO está en el prompt de `opsi-chat`. Antes de enchufarlo hay
> que decidir lo de la sección 5, que choca con la guía de voz.

## 1. De dónde sale

En este orden de peso. Si dos fuentes se contradicen, manda la de arriba.

| Fuente | Qué aporta |
|---|---|
| [AESAN, Comité Científico (2022): recomendaciones dietéticas sostenibles](https://www.aesan.gob.es/AECOSAN/docs/documentos/seguridad_alimentaria/evaluacion_riesgos/informes_comite/INFORME_RECOMENDACIONES_DIETETICAS.pdf) | Raciones por grupo para la población española. Es la base |
| [OMS, dieta saludable](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) | Cantidades de referencia (fruta y verdura, sal, azúcares libres, grasas) |
| [Plato para comer saludable de Harvard](https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/) | Cómo repartir UN plato, que es lo que la asistente propone |

Las cifras de abajo se han copiado de esas páginas (la de la AESAN, del PDF del informe).
**No las ha revisado una persona dietista:** antes de lanzar la asistente al público, que las
lea una (ver PENDIENTES).

## 2. Un día y una semana, para adultos sanos

Referencia de la AESAN (2022). Son **raciones**, no gramos; el tamaño de ración no se ha
copiado todavía.

| Grupo | Recomendación |
|---|---|
| Hortalizas | al menos 3 raciones/día |
| Fruta | 2–3 raciones/día |
| Cereales | 3–6 raciones/día según la energía que necesite la persona, y mejor integrales |
| Patata y tubérculos | consumo moderado |
| Legumbres | al menos 4 raciones/semana, hasta llegar a diario |
| Frutos secos | 3 o más raciones/semana, hasta 1/día; sin sal, grasa ni azúcar añadidos |
| Pescado | 3 o más raciones/semana, mejor azul y de especies de menor impacto |
| Huevos | hasta 4/semana |
| Carne | como máximo 3 raciones/semana; mejor ave y conejo; la procesada, lo mínimo |
| Lácteos | como máximo 3 raciones/día, sin azúcares añadidos ni mucha sal |
| Aceite de oliva | a diario, en las comidas principales, para cocinar y aliñar |
| Bebida | agua, la principal |

De la OMS, para adultos: al menos 400 g de fruta y verdura al día; menos de 5 g de sal; azúcares
libres por debajo del 10 % de la energía; grasa saturada por debajo del 10 %.

## 3. Un plato (Harvard)

Cuando la asistente propone una cena, el plato se reparte así:

- **La mitad: verdura y fruta.** La patata no cuenta como verdura.
- **Un cuarto: cereal integral** (arroz integral, pasta integral, pan integral).
- **Un cuarto: proteína** (legumbre, pescado, ave, huevo, frutos secos). Carne roja poca y la
  procesada (bacon, embutido) evitarla.
- **Grasa:** aceite de oliva, con medida.
- **Bebida:** agua.

## 4. Cómo se usa esto sin salirse de lo que es Opsi

Reglas para la asistente, escritas para ir al prompt cuando se decida:

1. **Primero lo que vence.** La prioridad la manda el inventario (`ver_inventario`), no la
   nutrición. Un equilibrio perfecto con comida que se estropea no vale.
2. **Equilibra con lo que hay.** Si lo que vence es solo carne y arroz, propone eso y dice qué
   verdura le falta para el plato, sin sermón.
3. **Una sugerencia, no una pauta.** «Te iría bien una verdura» sí; «tienes que comer X
   raciones» no. Sin calorías, sin pesos, sin «es bueno/malo para ti».
4. **Nada de enfermedades.** Si la persona menciona diabetes, embarazo, una dieta médica,
   un niño pequeño, o un trastorno de la conducta alimentaria, Opsi no adapta nada y dice que
   eso es cosa de su médico o dietista.
5. **Alérgenos e intolerancias mandan sobre todo lo anterior.** Se leen de
   `user_health_preferences`; si un plato los toca, no se propone. Si no se sabe, se dice.
6. **Seguridad alimentaria:** nunca «todavía está bueno». La fecha y su origen, y decide quien
   abre la nevera.

## 5. Para decidir antes de enchufarlo

- **Choca con la guía de voz.** `VOZ.md` dice que Opsi «no opina sobre lo que comes ni sobre
  cuánto». Esta base la usa para *ordenar* propuestas, no para opinar. ¿Vale? Si no, se queda
  solo la regla 1–2 y la sección 3 se usa sin nombrar nunca «equilibrado» ni «saludable».
- **Edad.** Todo esto es para adultos. Niños, embarazo y mayores tienen otras pautas.
- **Dónde vive.** Lo razonable es una constante en `supabase/functions/_shared/` que se añade
  a `INSTRUCCIONES`, con una prueba que vigile que las cifras no cambian sin querer.
