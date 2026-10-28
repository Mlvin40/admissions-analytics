import { MetricGroup, MetricKey } from '../../core/analysis.models';
export interface AnalyticsQuery {
  id: string;
  path: string;
  title: string;
  category: string;
  description: string;
  unit: string;
  groups: (keyof MetricGroup)[];
  metrics: MetricKey[];
  chart: 'bar' | 'trend' | 'none';
  history?: boolean;
}
const rate: MetricKey[] = [
  'evaluationCount',
  'approvedCount',
  'failedCount',
  'unknownOutcomeCount',
  'knownOutcomeCount',
  'approvalRate',
  'failureRate',
];
const age: MetricKey[] = [
  'applicantCount',
  'meanAge',
  'ageSampleCount',
  'excludedAgeApplicantCount',
];
export const ANALYTICS_QUERIES: AnalyticsQuery[] = [
  {
    id: 'M01',
    path: 'applicants-by-institution-type',
    title: 'Aspirantes por tipo de institución',
    category: 'Aspirantes y procedencia',
    description: 'Identidades distintas dentro de cada tipo de institución educativa.',
    unit: 'Aspirantes únicos por grupo',
    groups: ['institutionType'],
    metrics: ['applicantCount'],
    chart: 'bar',
  },
  {
    id: 'M02',
    path: 'approvals-by-subject',
    title: 'Evaluaciones aprobadas por materia',
    category: 'Aprobación',
    description: 'Número de evaluaciones con resultado aprobado para cada materia.',
    unit: 'Evaluaciones aprobadas',
    groups: ['subject'],
    metrics: ['evaluationCount'],
    chart: 'bar',
  },
  {
    id: 'M03',
    path: 'approved-applicants-by-career-year',
    title: 'Aspirantes aprobados por carrera y ciclo',
    category: 'Aprobación',
    description:
      'Aspirantes con alguna evaluación aprobada; no implica admisión ni aprobar todas las materias.',
    unit: 'Aspirantes con alguna aprobación',
    groups: ['career', 'entryYear'],
    metrics: ['applicantCount'],
    chart: 'bar',
  },
  {
    id: 'M04',
    path: 'approval-rate-by-subject',
    title: 'Porcentaje de aprobación por materia',
    category: 'Aprobación',
    description: 'Compara resultados y porcentajes sobre evaluaciones con resultado conocido.',
    unit: 'Evaluaciones y porcentajes',
    groups: ['subject'],
    metrics: rate,
    chart: 'bar',
  },
  {
    id: 'M05',
    path: 'mean-age-by-career',
    title: 'Edad promedio por carrera',
    category: 'Carreras y edades',
    description:
      'Edad aproximada al ingreso de la observación más reciente de cada aspirante y carrera.',
    unit: 'Edad por aspirante/carrera',
    groups: ['career'],
    metrics: age,
    chart: 'bar',
  },
  {
    id: 'M06',
    path: 'career-summary',
    title: 'Resumen por carrera',
    category: 'Carreras y edades',
    description:
      'Resumen global materializado: evaluaciones, aspirantes, resultados y muestra de edades.',
    unit: 'Resumen global por carrera',
    groups: ['career'],
    metrics: [
      'evaluationCount',
      'applicantCount',
      'approvedCount',
      'failedCount',
      'unknownOutcomeCount',
      'approvalRate',
      'applicantsWithApproval',
      'meanAge',
      'ageSampleCount',
      'excludedAgeApplicantCount',
    ],
    chart: 'none',
  },
  {
    id: 'M07',
    path: 'mean-age-approved-by-career-institution',
    title: 'Edad de aprobados por carrera e institución',
    category: 'Carreras y edades',
    description:
      'Edad representativa de aspirantes con alguna aprobación dentro de cada carrera y tipo de institución.',
    unit: 'Edad por aspirante/grupo',
    groups: ['career', 'institutionType'],
    metrics: age,
    chart: 'bar',
  },
  {
    id: 'M08',
    path: 'approved-applicants-by-municipality-career',
    title: 'Aprobados por municipio y carrera',
    category: 'Aspirantes y procedencia',
    description:
      'Aspirantes con alguna evaluación aprobada, contextualizando el municipio por departamento.',
    unit: 'Aspirantes con alguna aprobación',
    groups: ['department', 'municipality', 'career'],
    metrics: ['applicantCount'],
    chart: 'none',
  },
  {
    id: 'M09',
    path: 'public-evaluations-by-month-subject',
    title: 'Evaluaciones públicas por mes y materia',
    category: 'Evolución',
    description:
      'Evaluaciones de instituciones PUBLICO por mes de asignación UTC, no fecha efectiva de examen.',
    unit: 'Evaluaciones por mes y materia',
    groups: ['month', 'subject'],
    metrics: ['evaluationCount'],
    chart: 'none',
  },
  {
    id: 'M10',
    path: 'top-careers-age-16-18',
    title: 'Top 5 de carreras entre 16 y 18 años',
    category: 'Carreras y edades',
    description:
      'Carreras conocidas más demandadas por aspirantes con edades válidas entre 16 y 18 años.',
    unit: 'Aspirantes únicos por carrera',
    groups: ['career'],
    metrics: ['applicantCount'],
    chart: 'bar',
  },
  {
    id: 'M11',
    path: 'applicant-performance',
    title: 'Historial de desempeño',
    category: 'Historiales',
    description: 'Materias, oportunidades y resultados de un identificador anónimo completo.',
    unit: 'Evaluaciones de la identidad literal',
    groups: [],
    metrics: [],
    chart: 'none',
    history: true,
  },
  {
    id: 'M12',
    path: 'applicants-by-sex-institution',
    title: 'Aspirantes por sexo e institución',
    category: 'Aspirantes y procedencia',
    description: 'Identidades distintas por sexo registrado y tipo de institución educativa.',
    unit: 'Aspirantes únicos por combinación',
    groups: ['sex', 'institutionType'],
    metrics: ['applicantCount'],
    chart: 'bar',
  },
  {
    id: 'M13',
    path: 'approval-rate-by-age',
    title: 'Tasa de aprobación por edad',
    category: 'Carreras y edades',
    description:
      'Resultados por edad observada válida; las evaluaciones sin edad utilizable se informan aparte.',
    unit: 'Evaluaciones por edad',
    groups: ['age'],
    metrics: rate,
    chart: 'bar',
  },
  {
    id: 'M14',
    path: 'mean-observed-attempts-by-subject',
    title: 'Oportunidades promedio por materia',
    category: 'Oportunidades',
    description:
      'Promedio de oportunidades distintas observadas por aspirante, ciclo y materia. No es el ordinal máximo.',
    unit: 'Oportunidades observadas por aspirante/ciclo',
    groups: ['subject'],
    metrics: ['meanAttempts', 'applicantCycleCount', 'excludedAttemptGroups', 'evaluationCount'],
    chart: 'bar',
  },
  {
    id: 'M15',
    path: 'applicant-history',
    title: 'Historial completo del aspirante',
    category: 'Historiales',
    description:
      'Evaluaciones, contexto, advertencias y fuentes originales de una identidad literal, sin unir prefijos.',
    unit: 'Evaluaciones con procedencia',
    groups: [],
    metrics: [],
    chart: 'none',
    history: true,
  },
  {
    id: 'M16',
    path: 'first-attempt-failures-by-career',
    title: 'Reprobados en primera oportunidad por carrera',
    category: 'Oportunidades',
    description:
      'Aspirantes con una reprobación en oportunidad literal 1; una aprobación posterior no la elimina.',
    unit: 'Aspirantes únicos por carrera',
    groups: ['career'],
    metrics: ['applicantCount'],
    chart: 'bar',
  },
  {
    id: 'M17',
    path: 'top-municipalities',
    title: 'Top 5 de municipios de procedencia',
    category: 'Aspirantes y procedencia',
    description:
      'Municipios conocidos con más aspirantes; la clave conserva el contexto departamental.',
    unit: 'Aspirantes únicos por municipio',
    groups: ['department', 'municipality'],
    metrics: ['applicantCount'],
    chart: 'bar',
  },
  {
    id: 'M18',
    path: 'approval-rate-by-institution-type',
    title: 'Aprobación por tipo de institución',
    category: 'Aprobación',
    description:
      'Compara las evaluaciones aprobadas, reprobadas y sus tasas por tipo de institución.',
    unit: 'Evaluaciones y porcentajes',
    groups: ['institutionType'],
    metrics: rate,
    chart: 'bar',
  },
  {
    id: 'M19',
    path: 'career-demand-by-department',
    title: 'Demanda de carreras por departamento',
    category: 'Aspirantes y procedencia',
    description:
      'Ranking de carreras conocidas por aspirantes distintos dentro de cada departamento conocido.',
    unit: 'Aspirantes únicos por departamento/carrera',
    groups: ['department', 'career'],
    metrics: ['rank', 'applicantCount'],
    chart: 'none',
  },
  {
    id: 'M20',
    path: 'approval-evolution-by-entry-year',
    title: 'Evolución de aprobación por ciclo',
    category: 'Evolución',
    description:
      'Evaluaciones aprobadas, reprobadas y porcentajes por año de ingreso, distinto del año del archivo.',
    unit: 'Evaluaciones por ciclo de ingreso',
    groups: ['entryYear'],
    metrics: rate,
    chart: 'trend',
  },
];
export const QUERY_GROUPS = [...new Set(ANALYTICS_QUERIES.map((q) => q.category))].map((label) => ({
  label,
  items: ANALYTICS_QUERIES.filter((q) => q.category === label).map((q) => ({
    label: q.id + ' · ' + q.title,
    value: q.id,
  })),
}));
