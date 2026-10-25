Aplicación web para el procesamiento, consulta y análisis de resultados de las **pruebas específicas de aspirantes de primer ingreso a la Facultad de Ingeniería de la Universidad de San Carlos de Guatemala (USAC)**.

El proyecto utiliza **MongoDB** para almacenar y analizar registros de evaluaciones y **Neo4j** para representar y explorar relaciones entre los datos. El frontend se comunica con ambas bases de datos exclusivamente a través de una API REST.

## Tecnologías

| Componente | Tecnología |
| --- | --- |
| Frontend | Angular 21, PrimeNG 21 (tema Aura), Cytoscape.js y CSS |
| Backend | Java 21, Spring Boot 4.1.2 y Maven |
| Base de datos documental | MongoDB 7.0.45 |
| Base de datos de grafos | Neo4j 5.26 Community |
| Entorno de bases de datos | Docker Compose |

## Estructura del proyecto

```text
.
├── bd2-api/          # API REST con Spring Boot
├── bd2-client/       # Aplicación Angular
├── compose.yaml      # MongoDB y Neo4j
├── .env.example      # Plantilla de variables de entorno
└── README.md
```

**Arquitectura:** Angular → Spring Boot (API REST) → MongoDB / Neo4j.

## Requisitos

- Docker Engine y Docker Compose
- Java Development Kit (JDK) 21
- Node.js 24 y npm
- Bash para cargar las variables de entorno locales

El backend incluye Maven Wrapper (`./mvnw`), por lo que no es necesario instalar Maven globalmente.

## 1. Configurar las variables de entorno

Desde la raíz del proyecto:

```bash
cp .env.example .env
chmod 600 .env
```

Edita `.env` y configura los valores indicados en `.env.example`, especialmente `MONGO_PASSWORD` y `NEO4J_PASSWORD`. Utiliza contraseñas distintas y de al menos ocho caracteres; conserva `NEO4J_USERNAME=neo4j`.

El archivo `.env` contiene credenciales locales y **no debe incorporarse al repositorio**. Las credenciales iniciales se aplican al crear los volúmenes de las bases de datos por primera vez; modificarlas después en `.env` no cambia las contraseñas ya almacenadas.

## 2. Iniciar MongoDB y Neo4j

Desde la raíz del proyecto:

```bash
docker compose up -d --wait --wait-timeout 180 mongodb neo4j
docker compose ps
```

Docker descarga las imágenes cuando es necesario y mantiene los datos en volúmenes persistentes.

| Servicio | Dirección local |
| --- | --- |
| MongoDB | `127.0.0.1:27017` |
| Neo4j Browser | <http://127.0.0.1:7474> |
| Neo4j Bolt | `127.0.0.1:7687` |

Los puertos de las bases de datos están publicados únicamente en `127.0.0.1`.

## 3. Ejecutar el backend

En una terminal, desde la raíz del proyecto:

```bash
set -a
source ./.env
set +a
export BD2_IMPORT_DIRECTORY="$PWD/.local/imports"

cd bd2-api
./mvnw spring-boot:run
```

La API estará disponible en <http://localhost:8080>.

**Importante:** Docker Compose utiliza `.env`, pero Spring Boot no lo carga automáticamente cuando se ejecuta fuera de Docker. Por ello es necesario exportar las variables antes de iniciar el backend. Comprueba que tu terminal está utilizando Java 21 con `java -version`.

## 4. Ejecutar el frontend

En otra terminal, desde la raíz del proyecto:

```bash
cd bd2-client
npm ci
npm start
```

Abre <http://localhost:4200>.

En desarrollo, Angular utiliza un proxy para enviar las solicitudes `/api/**` al backend en `http://127.0.0.1:8080`. Por tanto, ambos procesos deben estar en ejecución para utilizar las funciones que consultan la API.

## Pantallas de análisis

| Ruta | Uso |
|---|---|
| `/` | Dashboard con indicadores, distribución por materia y evolución de aprobación |
| `/analytics` | Catálogo de las veinte consultas MongoDB, filtros, tablas, gráficas e historiales |
| `/graph` | Cinco consultas Neo4j y explorador interactivo de procedencia municipal |
| `/search` | Búsqueda de evaluaciones por correlativo completo y dimensiones registradas |
| `/data-import` | Selección múltiple de CSV, seguimiento y consulta de rechazos |
| `/status` | Comprobación técnica secundaria de las conexiones |

Selecciona una consulta y pulsa **Ejecutar consulta**. Los resultados conservan
sus unidades: evaluaciones, aspirantes únicos dentro de cada grupo, oportunidades
observadas o parejas de evaluaciones. Los historiales exigen el correlativo literal
completo y permiten consultar las fuentes originales. El resumen por carrera
informa su fecha de corte y avisa si está desactualizado; abrirlo no lo reconstruye.

En el buscador, escribe nombres y selecciona una opción antes de buscar. Municipio
incluye contexto departamental y «institución» corresponde al tipo registrado.
Puedes abrir el historial o las relaciones desde cada evaluación encontrada.
El explorador N05 requiere ciclo y clave de aspirante con formato `full32:...`,
`short:...` u `other:...`; los enlaces de resultados la completan. Comienza con diez
caminos y admite hasta 25 por página, con selección de propiedades, zoom, ajuste de
vista y lista accesible de nodos/aristas. La procedencia compartida no demuestra
misma escuela ni relación personal.

Cytoscape.js 3.34.4 se instala mediante `npm ci` y se carga únicamente al abrir
Grafos Neo4j; no requiere CDN ni configuración adicional. Las comparaciones
estadísticas utilizan HTML/CSS y SVG, sin otra biblioteca de gráficas.

## 5. Comprobar las conexiones

La aplicación dispone de una comprobación técnica de conectividad con MongoDB y Neo4j. Puedes utilizarla desde el frontend o consultar el endpoint directamente:

```bash
curl -i 'http://localhost:8080/api/status?target=all'
```

El parámetro `target` acepta `all`, `mongodb` o `neo4j`. La respuesta informa el estado de la API y las conexiones seleccionadas.

## Importar archivos CSV

Abre **Carga CSV** desde el topbar, selecciona de uno a diez CSV y pulsa
**Importar archivos**. Cada archivo admite hasta 16 MB. Los originales locales
se encuentran en `datas/ArchivosCSV/`; ambos formatos históricos se reconocen
por sus encabezados, sin necesidad de convertirlos manualmente.

La aplicación muestra el estado, registros leídos, procesados, rechazados,
pendientes y tiempo por archivo. **Ver rechazos** permite consultar el número de
registro y su causa. **Reintentar** utiliza la copia conservada del archivo cuando
una importación falla o queda parcial/interrumpida. Si el CSV es ilegible o sus
encabezados son incorrectos, corrige una copia y selecciónala como una nueva carga.

Repetir archivos no añade evaluaciones, nodos, relaciones ni ocurrencias de origen
ya registradas. Los registros incompletos admitidos se conservan con advertencias.
Los procesados se confirman en ambos motores; los pendientes pueden estar guardados
parcialmente y se recuperan mediante el reintento, sin transacción distribuida.

`BD2_IMPORT_DIRECTORY` determina dónde se conservan copias, resultados y rechazos.
El comando de inicio establece una ruta absoluta compartida entre ejecuciones;
si se omite, se utiliza `.local/imports` relativo al directorio del proceso.
Conserva y respalda ese directorio para mantener el historial y poder reintentar.
Está excluido de Git. Una sola instancia puede utilizarlo a la vez; los archivos
se procesan secuencialmente y sus registros en lotes. Tras un reinicio, las cargas
en cola continúan y las que estaban ejecutándose quedan disponibles para reintento.

Las estructuras e índices se inicializan automáticamente al importar a partir de
los recursos versionados `bd2-api/src/main/resources/db/`. No se necesitan comandos
de inicialización manuales. Los endpoints son `POST /api/imports`, `GET /api/imports`,
`GET /api/imports/{id}`, `GET /api/imports/{id}/rejections` y
`POST /api/imports/{id}/retry`; las listas y los rechazos están paginados.

## Consultas analíticas

La API ofrece veinte consultas MongoDB con resultados tipados y paginados bajo
`/api/analytics/`. Por ejemplo:

```bash
curl 'http://localhost:8080/api/analytics/approval-rate-by-subject'
curl 'http://localhost:8080/api/analytics/approval-evolution-by-entry-year?entryYear=2024'
curl 'http://localhost:8080/api/analytics/applicant-history?correlativo=CORRELATIVO_COMPLETO&limit=25'
```

Las consultas distinguen evaluaciones de aspirantes únicos y conservan las categorías
observadas. Los filtros incluyen ciclo, claves de dimensiones, sexo, resultado,
edad y fechas de asignación. `limit` admite de 1 a 100 y los historiales permiten
continuar con `nextCursor`. Un correlativo parcial no combina identidades.

Después de terminar nuevas importaciones o reintentos, reconstruye el resumen global
por carrera:

```bash
curl -X POST 'http://localhost:8080/api/analytics/career-summary/refresh'
curl 'http://localhost:8080/api/analytics/career-summary?limit=100'
```

La respuesta informa cuándo fue generado y `summary.refreshRequired` indica si
cambiaron los datos desde entonces. Si hubo una carga concurrente y la reconstrucción
devuelve 409, espera a que finalice y repite el POST. Las evaluaciones se conservan.
El [catálogo de consultas](docs/consultas/mongodb.md) detalla endpoints, métricas,
filtros, ordenamiento y tratamiento de valores desconocidos.

## Consultas de grafos

La API expone cinco consultas de lectura bajo `/api/graph/`: historial por aspirante,
aprobación por materia/carrera, demanda por departamento, cambios de resultado entre
oportunidades y un subgrafo de procedencia municipal compartida. Todas requieren
`entryYear`; los filtros y claves requeridos se detallan en el
[catálogo Neo4j](docs/consultas/neo4j.md).

```bash
curl 'http://localhost:8080/api/graph/approval-by-subject-career?entryYear=2024&limit=25'
```

Las respuestas incluyen `items` y `hasMore` para continuar mediante `offset`.
El subgrafo devuelve nodos y aristas tipados, con un máximo de 25 caminos por página.
Las consultas conservan los datos existentes y utilizan claves completas de identidad.

## Búsqueda por API

Los endpoints de lectura `GET /api/search/options` y
`GET /api/search/evaluations` complementan las consultas existentes.

- `options`: requiere `dimension=career|subject|department|municipality|institutionType`;
  admite `q`, clave exacta `key`, paginación y `departmentKey` para municipios.
  La búsqueda textual resuelve etiquetas y conserva variantes con claves distintas
- `evaluations`: admite `correlativo`, `identityScheme`, `entryYear`, `careerKey`,
  `subjectKey`, `departmentKey`, `municipalityKey` e `institutionTypeKey`;
  los filtros se combinan y el identificador nunca se busca por prefijo
- Ambos devuelven `items`, `total`, `offset` y `limit`; máximo 100 resultados.
  Las búsquedas cuentan evaluaciones, no aspirantes globales

## Pruebas y compilación

Con las bases de datos iniciadas y las variables de entorno cargadas, ejecuta desde `bd2-api/`. Si el backend se está ejecutando desde un JAR, detén ese proceso antes de `clean package` y reinícialo con el JAR generado:

```bash
./mvnw test
./mvnw -DskipTests clean package
```

Desde `bd2-client/`:

```bash
npm test -- --watch=false
npm run build
```

Las pruebas de integración requieren que MongoDB y Neo4j estén disponibles y sus credenciales sean correctas. Las del ETL escriben pequeñas muestras oficiales de forma idempotente en los motores configurados. Las analíticas contrastan los datos importados y usan una base temporal propia para casos sintéticos; no cambian las evaluaciones originales ni Neo4j. Las pruebas de consultas de grafos son de lectura. Los directorios de importación de prueba son temporales.

### Comprobación opcional en navegador

`bd2-client/e2e/analysis.cjs` e `interaction.cjs` verifican las pantallas contra
la API real, sin importar archivos ni ejecutar escrituras. Requieren Spring Boot
y Angular iniciados, datos ya importados, Playwright disponible y Chrome/Chromium.
Playwright puede estar instalado como herramienta externa: no es una dependencia
de la aplicación ni es necesario para `npm test`.

Desde `bd2-client/`, si Playwright está fuera de la resolución normal de Node:

```bash
BD2_PLAYWRIGHT_MODULE=/ruta/herramientas/node_modules/playwright npm run test:browser
```

`BD2_CHROME` permite indicar el ejecutable del navegador y `BD2_BASE_URL` otra
URL del frontend; por defecto se utiliza Chrome en `/usr/bin/google-chrome`. Reportes y capturas quedan en `.local/browser/`, excluido de Git.
Los fallos de HTTP/red se inyectan solo en el navegador; las consultas normales
se comprueban con respuestas reales. Los CSV locales se seleccionan y se limpian
sin enviarlos para comprobar la conservación del módulo de carga.

## Detener los servicios

Detén Spring Boot y Angular con `Ctrl+C` en sus terminales. Para detener las bases de datos sin borrar la información, ejecuta desde la raíz:

```bash
docker compose stop mongodb neo4j
```

Para volver a iniciarlas, utiliza el comando de la sección **Iniciar MongoDB y Neo4j**. Evita `docker compose down -v`, porque elimina los volúmenes y los datos persistidos.

## Datos de origen

El conjunto de datos utilizado es **Pruebas específicas**, publicado por la Facultad de Ingeniería de la USAC:

<https://datosabiertos.ingenieria.usac.edu.gt/en/dataset/pruebas-especificas>
