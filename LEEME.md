# Resultados académicos

Universidad Nacional de Colombia · Sede Medellín

Reemplaza el tablero de Power BI por una versión con la misma arquitectura y el mismo
sistema de diseño de los tableros construidos en esta serie. Conserva las tres secciones
del original: resultados agregados por asignatura, desagregados por grupo e índice crítico.

---

## 1. Los dos insumos

| Archivo | Contenido | Registros |
|---|---|---|
| `03_DATOS_LDA.xlsx` | Libro de actas: una fila por matrícula con su desenlace | 48.576 matrículas |
| `DATOS_ASIG.xlsx` | Agregado por asignatura con cupos, inscritos e índice crítico | 1.373 asignaturas |

El archivo `RE_MAT_PER_COR.xlsx` no fue necesario: el libro de actas ya trae el plan y la
facultad del estudiante, que son las dos variables para las que se habría usado. Queda
disponible por si más adelante se quieren incorporar atributos de caracterización que solo
están allí, como el puntaje básico de matrícula o el estrato.

Del archivo de oferta se recuperan el cupo, los inscritos, el índice crítico y el
porcentaje de solicitud de cupo. Ochocientas dos de las 1.070 asignaturas del libro de
actas tienen índice crítico calculado; las demás aparecen en las tablas pero no en la
dispersión correspondiente.

## 2. Unidad de análisis

Cada registro del núcleo es una **matrícula**: un estudiante en una asignatura y un grupo
durante el período. Los porcentajes de aprobación, reprobación y cancelación se calculan
sobre ese total. El promedio simple se calcula sobre las calificaciones numéricas
registradas, que por definición excluyen a las canceladas.

Cifras del período 2025-2S: 48.576 matrículas de 10.979 estudiantes, en 1.070 asignaturas,
2.242 grupos y 839 docentes. Aprobación del 74,51 por ciento, reprobación del 10,24 y
cancelación del 15,25, con promedio simple de 3,85.

## 3. Estructura de la salida

- **Núcleo** (`rac_nucleo.js`): combinaciones de grupo, plan del estudiante y desenlace,
  con el número de matrículas, la suma de calificaciones y cuántas tienen nota. Son 14.354
  combinaciones.
- **Catálogos** (`rac_meta.js`): atributos de cada grupo —asignatura, número, docente,
  categoría, unidad académica básica, facultad de la UAB, modalidad, condición de docente
  ocasional y umbral de cinco estudiantes—, de cada plan —nombre, facultad del estudiante y
  nivel— y de cada asignatura —cupo, inscritos, índice crítico y porcentaje de solicitud de
  cupo—. Los diez filtros se resuelven contra estos catálogos, sin repetirse en el núcleo.

Un detalle que conviene recordar al leer los datos: en el libro de actas la columna
`facultad` es la del **estudiante**, no la de la asignatura. La facultad de la asignatura
se toma del archivo de oferta a través de la unidad académica básica. Por eso el tablero
distingue «Facultad de la UAB» de «Facultad del estudiante», igual que el original.

## 4. Las tres secciones

**Resultados por asignatura.** Dispersión de las asignaturas con el porcentaje de
reprobación en el eje vertical y, a elección, el promedio o el porcentaje de cancelación en
el horizontal; el alternador está en el encabezado de la tarjeta. Debajo, la composición
del resultado de las veinticinco asignaturas con mayor reprobación, en barras apiladas al
cien por ciento, y la tabla de detalle.

**Resultados por grupo.** El mismo esquema con el grupo como unidad, y cuatro filtros
adicionales: docente, grupo, grupos de más de cinco estudiantes y condición de docente
ocasional. La tabla incorpora el nombre del docente y esa condición.

**Índice crítico.** Dos dispersiones lado a lado, del índice crítico y de los cupos
ofertados contra la reprobación, y una tabla con matriculados, promedio, los tres
porcentajes, el índice crítico y el porcentaje de solicitud de cupo.

En las tres dispersiones el tamaño del punto es el número de matrículas, de modo que un
caso extremo con pocos estudiantes se distingue a simple vista de uno con volumen.

## 5. Interacción

Los filtros son en cascada: cada lista muestra únicamente las categorías que conservan
matrículas bajo el resto de la selección. Las barras de composición y las filas de la tabla
filtran por asignatura al hacer clic. La franja gris bajo los filtros muestra la selección
vigente y permite retirar cada criterio por separado.

Todas las tablas se ordenan por cualquier columna y abren ordenadas por reprobación
descendente, que es la lectura de interés. Cada visualización se descarga en CSV con lo que
está en pantalla y en PNG con encabezado institucional.

## 6. Actualizar los datos

```bash
python3 etl_resultados.py 03_DATOS_LDA.xlsx DATOS_ASIG.xlsx datos
```

Requiere `pandas` y `openpyxl`. Al terminar imprime el peso de los módulos, el volumen, la
cobertura y los tres porcentajes, que deben contrastarse con los archivos de origen.

## 7. Protección de datos

El libro de actas contiene documento y nombre de los estudiantes. Ninguna de esas columnas
se exporta: la salida son conteos por combinación de grupo, plan y desenlace. El nombre del
docente sí se conserva, porque la sección por grupo lo requiere y hace parte de la
programación académica publicada.
