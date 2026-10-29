# Consultas MongoDB independientes para la defensa

Veinte archivos ejecutables en `mongosh`, uno por consulta M01 a M20. Contienen las etapas completas de MongoDB y comentarios en español. No cargan código Java, otros scripts ni bibliotecas externas. Debe estar seleccionada la base **bd2_final**.

Al ejecutar cualquiera de los archivos se realizan únicamente lecturas. En M06, la generación persistida está completamente comentada y separada de la consulta de lectura. No se reconstruye automáticamente ninguna colección.

## Ejecución desde la terminal

Desde la raíz del proyecto, con `mongosh` instalado y las credenciales de tu entorno:

```bash
mongosh 'mongodb://127.0.0.1:27017/bd2_final?authSource=admin' \
  --username TU_USUARIO --password \
  --file docs/consultas/mongodb-scripts/M01.js
```

Sustituye `TU_USUARIO`. `--password` solicita la contraseña sin escribirla en el archivo. Cambia `M01.js` por cualquier archivo hasta `M20.js`. Si ya tienes una sesión o un mecanismo de conexión configurado, usa ese mismo acceso a `bd2_final`; los scripts no contienen credenciales.

Si `mongosh` está disponible dentro del contenedor MongoDB del proyecto, también puedes enviar el archivo por entrada estándar, sin copiarlo al contenedor:

```bash
docker exec -i NOMBRE_CONTENEDOR_MONGODB mongosh --quiet --eval '
  db.getSiblingDB("admin").auth(
    process.env.MONGO_INITDB_ROOT_USERNAME,
    process.env.MONGO_INITDB_ROOT_PASSWORD
  );
  db = db.getSiblingDB("bd2_final");
  load("/dev/stdin");
' < docs/consultas/mongodb-scripts/M01.js
```

Sustituye el nombre por el que muestra `docker ps`. Esta alternativa aprovecha las variables que ya recibe el contenedor de MongoDB; no requiere archivos de configuración adicionales. No hace falta tener `mongosh` instalado en el equipo anfitrión.

## Ejecución desde la consola mongosh

Conéctate a MongoDB con tu autenticación habitual y selecciona la base:

```javascript
use bd2_final
load("docs/consultas/mongodb-scripts/M01.js")
```

La ruta de `load` es relativa al directorio desde el que abriste `mongosh`. Puedes utilizar una ruta absoluta si abriste la consola desde otro lugar. Cada archivo está encerrado en un bloque de ejecución propio; puedes cargarlo nuevamente después de editarlo sin conflictos de constantes globales.

## Catálogo y correspondencia con Angular

En Angular abre **Consultas MongoDB**, selecciona el ID y pulsa **Ejecutar consulta**. También puedes abrir `http://localhost:4200/analytics?query=M01`, cambiando el identificador. La ruta REST exacta está en el encabezado de cada script.

| Archivo | Consulta | Total global observado en la verificación |
| --- | --- | ---: |
| [M01.js](M01.js) | Aspirantes por tipo de institución educativa | 6 grupos |
| [M02.js](M02.js) | Evaluaciones aprobadas por materia | 2 grupos |
| [M03.js](M03.js) | Aspirantes aprobados por carrera y ciclo de ingreso | 96 grupos |
| [M04.js](M04.js) | Porcentaje de aprobación por materia | 4 grupos |
| [M05.js](M05.js) | Promedio de edad por carrera | 17 grupos |
| [M06.js](M06.js) | Resumen de estadísticas por carrera | 0 documentos de resumen disponibles |
| [M07.js](M07.js) | Promedio de edad de aprobados por carrera y tipo de institución | 62 grupos |
| [M08.js](M08.js) | Aspirantes aprobados por municipio y carrera | 1.282 grupos |
| [M09.js](M09.js) | Evaluaciones de instituciones públicas por mes y materia | 99 grupos |
| [M10.js](M10.js) | Cinco carreras más solicitadas por aspirantes de 16 a 18 años | 5 grupos |
| [M11.js](M11.js) | Desempeño de un aspirante | 38 evaluaciones de la identidad de ejemplo |
| [M12.js](M12.js) | Aspirantes por sexo y tipo de institución | 13 grupos |
| [M13.js](M13.js) | Porcentaje de aprobación por edad | 46 grupos |
| [M14.js](M14.js) | Promedio de oportunidades observadas por materia | 3 grupos |
| [M15.js](M15.js) | Historial completo de un aspirante | 38 evaluaciones de la identidad de ejemplo |
| [M16.js](M16.js) | Aspirantes reprobados en la primera oportunidad por carrera | 15 grupos |
| [M17.js](M17.js) | Cinco municipios con más aspirantes | 5 grupos |
| [M18.js](M18.js) | Porcentaje de aprobación por tipo de institución | 6 grupos |
| [M19.js](M19.js) | Demanda de carreras por departamento | 302 grupos |
| [M20.js](M20.js) | Evolución de aprobación por ciclo de ingreso | 11 grupos, incluido ciclo desconocido |

`total` cuenta grupos o evaluaciones del historial, según la consulta. No es una cantidad global de aspirantes. Estos valores corresponden a la base activa al verificar; cambiarán si se realizan nuevas cargas.

## Modificar filtros durante la defensa

Los archivos tienen al principio un objeto `filters`. Un valor `null` omite el filtro. Por ejemplo:

```javascript
const filters = {
  entryYear: 2024,
  careerKey: null,
  subjectKey: null,
  institutionTypeKey: null,
  departmentKey: null,
  municipalityKey: null,
  sex: null,
  passed: false,
  minAge: 16,
  maxAge: 18,
  assignmentFrom: "2023-01-01",
  assignmentTo: "2024-12-31"
};
```

Edita el objeto existente del archivo, no agregues otro con el mismo nombre. Usa números para ciclo y edades, booleanos para `passed`, y fechas válidas `YYYY-MM-DD`. `false` sí filtra reprobadas; `null` conserva todos los resultados, incluidos desconocidos. `sex: "SIN REGISTRO"` selecciona sexo desconocido.

Los filtros se aplican antes del cálculo específico de la consulta. Por ejemplo, M02 filtra aprobadas después de los filtros comunes: combinarlo con `passed: false` produce un conjunto vacío, igual que la API.

Las claves de dimensiones son los SHA-256 almacenados, de 64 caracteres hexadecimales, no nombres visibles. Obténlas de `items[].group`, de una evaluación del buscador o de la petición de Angular en la pestaña Network. Municipio incluye el contexto departamental: copiar solo un nombre no reproduce la misma selección.

Las fechas usan UTC con ambos extremos incluidos: desde las 00:00 del primer día hasta antes de las 00:00 del día posterior al último. Usa los rangos admitidos por la aplicación: ciclo entero de 1 a 9999 y edades enteras de 0 a 100. Los archivos están orientados a parámetros válidos; no reproducen toda la validación Jakarta ni los errores HTTP del backend.

### Paginación y ordenamiento

```javascript
const page = { offset: 0, limit: 25, sort: null, direction: null };
```

- `offset`: de 0 a 1.000.000; `limit`: de 1 a 100; predeterminados 0 y 25
- `sort: null`: orden predeterminado de la consulta; `direction: null`: sentido predeterminado
- `sort: "key"`: clave del grupo; `sort: "count"`: cantidad según la unidad
- `sort: "rate"`: M04, M06, M13, M18 y M20
- `sort: "age"`: M05, M06 y M07
- `sort: "attempts"`: M14
- `direction: "asc"` o `"desc"`: cambia el sentido de la métrica elegida
- El desempate por clave permanece ascendente, como en la aplicación
- M19, sin `sort`, ordena por departamento y posición de ranking
- M10 y M17 seleccionan el top cinco antes de paginar, incluso con otro orden final
- M11 y M15 tienen orden cronológico fijo; no admiten `sort` ni `direction`

### Reglas de cálculo preservadas

- Identidades por igualdad completa de `applicant.key`, nunca por prefijos
- Evaluaciones por documento de `evaluations`; `sources` no multiplica conteos
- Aprobado en M03/M07/M08 significa alguna evaluación aprobada dentro del filtro y grupo, no admisión
- Tasas de 0 a 100 sobre resultados booleanos conocidos; cero conocidos produce `null`
- Edad `entryAge` válida de 0 a 100; es la edad aproximada al ciclo de ingreso calculada por el ETL
- M05/M07 y generación M06 usan el representante de mayor ciclo, fecha, oportunidad e ID antes de excluir edades desconocidas; no rellenan desde otro ciclo
- M14 promedia oportunidades positivas enteras distintas por identidad/ciclo/materia; no usa máximo ordinal ni cantidad de filas
- M16 exige oportunidad literal 1; una aprobación posterior no elimina la reprobación inicial
- Las categorías desconocidas se conservan salvo exclusiones específicas; los textos truncados y espacios significativos siguen identificados por sus claves
- `excludedEvaluations` reproduce el pipeline de exclusiones del backend para M09/M10/M13/M14/M16/M17/M19; no cuenta simplemente todo lo que queda fuera del top o del subconjunto analítico

## Historiales M11 y M15

Ambos incluyen el ejemplo real anónimo `8b3a7afeed814ad9bef0712a382355cc`, presente en la base usada para verificar. Sustituye `correlativo` por el valor completo de `applicant.correlativo_aspirante` de una evaluación. No pegues el prefijo `full32:` en esa variable. `identityScheme: null` detecta el formato como el backend; puedes indicar `full32`, `short` u `other` cuando corresponda.

M11 proyecta desempeño; M15 conserva además nacimiento, sexo, edad, origen, advertencias y fuentes completas. No se reemplazan por un agrupamiento de personas.

Los valores ausentes se ordenan al final mediante los mismos centinelas que Java. Se pide una fila adicional y se imprime `nextCursor` si hay otra página. Para continuar:

1. Copia el valor completo de `nextCursor` a `const cursor = "..."` en el archivo
2. Conserva identidad y filtros; usa `page.offset: 0`
3. Vuelve a ejecutar el archivo

Los cursores son interoperables con la API. Su texto Base64 puede diferir porque Java y mongosh serializan Extended JSON de distinta forma; representan la misma terna de ciclo, fecha e ID. Se conserva el entero BSON de 64 bits del centinela sin convertirlo a un número JavaScript impreciso. `total` sigue contando el historial filtrado completo, incluso después de aplicar un cursor a la página.

## M06: consulta y generación persistida son procedimientos distintos

**Ejecución normal de M06.js:** consulta `analytics_metadata` y `resumen_carrera`. Si faltan los metadatos, devuelve página vacía y `refreshRequired: true`, igual que GET de la API. Si existen, comprueba publicación coherente, calcula la huella actual y pagina el resumen persistido. Solo admite `careerKey`, paginación y ordenamiento; no aplica filtros de ciclo ni los demás filtros comunes.

**Generación:** al final del archivo hay un bloque `/* ... */` completamente desactivado. Contiene el pipeline completo de `AnalyticsPipelines.summary`, su `$out` a staging propio, comprobación de huella antes/después, publicación mediante `renameCollection` y metadatos. Puede estudiarse o copiarse deliberadamente a mongosh para una generación manual autorizada; selecciona solo el código desde `(() => {` hasta `})();`, excluyendo el encabezado descriptivo. No quites el comentario para realizar pruebas de lectura.

La generación escribe y reemplaza información derivada; es equivalente conceptual a `POST /api/analytics/career-summary/refresh`, no al GET de consulta. Debe realizarse sin importaciones ni otra reconstrucción concurrentes. El bloque manual no hereda la sincronización local del método Java `synchronized`; no reproduce un bloqueo de proceso entre clientes externos. Como en la aplicación, no hay transacción distribuida y un fallo entre publicación y metadatos se detecta como publicación incompleta en la lectura posterior.

**Limitación comprobada en esta tarea:** la base activa solo tenía `evaluations`; no existían `resumen_carrera` ni `analytics_metadata`. Por ello se comparó la respuesta vacía real de M06. También se ejecutó una vista previa en memoria de su pipeline de generación, retirando `$out` antes de enviarlo al motor: produjo 17 grupos y sus sumas coincidieron con 207.622 evaluaciones y 29.701 aprobadas. La vista previa no es un resumen almacenado ni una comprobación de publicación, actualización o lectura de un resumen existente. No se ejecutó el POST ni el bloque de escritura.

## Comparar con Angular y con la API

1. Selecciona el mismo ID y aplica exactamente los mismos filtros; en las dimensiones selecciona una opción, no solo escribas texto
2. Igualá `limit`, orden, sentido y página; para historiales, la misma identidad y cursor
3. Compara claves de grupo, cantidades, porcentajes, promedios, ranking y exclusiones
4. Revisa `items` y `total`; Angular redondea algunos valores para mostrarlos, mientras el script imprime el valor numérico original
5. En M06 compara el corte persistido, no una agregación recién calculada de `evaluations`

Ejemplo de contraste REST para M04:

```bash
curl 'http://localhost:8080/api/analytics/approval-rate-by-subject?entryYear=2024&limit=25'
```

En `M04.js` usa `filters.entryYear: 2024` y el mismo tamaño de página. Para consultar todas las filas de grupos numerosos, aumenta `offset` en pasos de `limit` hasta alcanzar `total`. Las barras de Angular muestran hasta diez grupos de la página y no sustituyen la tabla completa.

Los scripts imprimen `query`, `unit`, `offset`, `limit`, `total`, `excludedEvaluations`, `nextCursor`, `items` y `summary`. No imitan los campos explicativos `notes` ni la medición `executionMs` de la API. Un campo BSON ausente puede omitirse donde el DTO Java lo devuelve como `null`; las fechas se imprimen en Extended JSON. Estas son diferencias de representación, no de agrupación o cálculo. Se compararon fechas como instantes y los campos opcionales ausentes como `null`; los números se contrastaron con tolerancia de coma flotante de 1e-10 absoluta y 1e-12 relativa.

## Verificación realizada

Se revisaron `AnalyticsPipelines.java`, `AnalyticsRepository.java`, `AnalyticsService.java`, `AnalyticsQuery.java`, DTO, filtros y controlador, además del catálogo Angular y la documentación de consultas.

El 02/11/2026 se ejecutaron los archivos con mongosh contra `bd2_final` en MongoDB 7.0.45 y se compararon con los endpoints GET de la API activa. La primera batería completó **153 comparaciones correctas**:

- Los veinte archivos con sus valores predeterminados
- Todos los grupos globales, recorriendo páginas de hasta 100 elementos, incluidos los 1.282 grupos de M08 y 302 de M19
- Filtro de ciclo 2024 y combinación de ciclo, las cinco claves de dimensión, sexo, resultado, rango de edad y fecha exacta
- Filtro de ciclo sin coincidencias
- Orden por clave descendente con offset y orden por métrica ascendente, incluidos porcentajes, edades y oportunidades
- M11/M15 con página de un elemento, cursor emitido por la API y cursor emitido por el script
- M06 vacío, filtros/orden admitidos y vista previa de generación sin persistencia, con la limitación descrita arriba

| Consulta | Comparaciones correctas en la primera batería |
| --- | ---: |
| M01/M02/M03/M04/M05/M07 | 7 por consulta |
| M06 | 3, sobre resumen ausente |
| M08 | 19 |
| M09/M10 | 7 por consulta |
| M11 | 8 |
| M12/M13/M14 | 7 por consulta |
| M15 | 8 |
| M16/M17/M18 | 7 por consulta |
| M19 | 10 |
| M20 | 7 |

Una batería adicional completó **40 comparaciones correctas** de M11/M15 con fechas o ciclos ausentes, cursores de ambos orígenes y centinelas BSON Long, además de filtros de sexo desconocido y evaluaciones reprobadas en doce consultas. **Total: 193 comparaciones correctas con la API**.

Se comprobó sintaxis con `node --check` para los veinte scripts y ausencia de operaciones de escritura en sus bloques activos. No se repitieron compilaciones ni pruebas de la aplicación porque no se modificó su código. Las verificaciones no importan ni eliminan datos y no crean índices, colecciones, nodos ni relaciones.

Antes y después, MongoDB conservó únicamente `evaluations`, con **207.622 documentos** y el mismo `dbHash` de colección: `06af815c524ddf2b6285dda0e293d00e`. También coincidió el SHA-256 conjunto de los archivos existentes revisados de backend, frontend, documentación y archivos raíz: `a35334c07fb485482ec6a1d851455aa6c79af3bfe8621db738b2ec56fa1768b1`. La verificación del contenido incluye todas las evaluaciones, no solo sus conteos.

## Ubicación y alcance de los cambios

Solo se crearon `M01.js` a `M20.js` y este README dentro de ``. No se modificó la aplicación ni sus consultas existentes, configuración o documentación previa.

La carpeta `../../docs` está excluida localmente por `.git/info/exclude` en esta copia. Estos archivos existen en disco, aunque `git status` puede omitirlos. No se cambió esa regla ni se ejecutaron commits o push.

Commit sugerido: `docs: agregar veinte consultas mongosh independientes para defensa`
