export const GRAPH_QUERIES = [
  {
    id: 'N01',
    path: 'applicant-history',
    title: 'Historial por aspirante y ciclo',
    description:
      'Evaluaciones, materias y resultados de una identidad completa dentro de un ciclo.',
    unit: 'Evaluaciones de la identidad',
  },
  {
    id: 'N02',
    path: 'approval-by-subject-career',
    title: 'Aprobación por materia y carrera',
    description:
      'Resultados de evaluaciones con materia y carrera representadas en el grafo; porcentajes sobre resultados conocidos.',
    unit: 'Evaluaciones con carrera conocida',
  },
  {
    id: 'N03',
    path: 'top-careers-by-department',
    title: 'Top 5 de carreras por departamento',
    description: 'Aspirantes distintos por carrera dentro del departamento y ciclo seleccionados.',
    unit: 'Aspirantes únicos por carrera',
  },
  {
    id: 'N04',
    path: 'improved-outcomes',
    title: 'Reprobación y aprobación en una oportunidad mayor',
    description:
      'Parejas de evaluaciones de una identidad y materia en el mismo ciclo. No cuentan personas ni prueban fechas de examen.',
    unit: 'Parejas de evaluaciones observadas',
  },
  {
    id: 'N05',
    path: 'municipality-peers',
    title: 'Explorador de procedencia compartida',
    description:
      'Aspirantes conectados por el municipio registrado de su institución. No demuestra misma escuela ni relación personal.',
    unit: 'Caminos de cuatro relaciones',
  },
];
