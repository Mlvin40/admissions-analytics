import { Dimension, MetricGroup, MetricKey } from '../core/analysis.models';
export const metricLabels: Record<MetricKey, string> = {
  applicantCount: 'Aspirantes únicos en el grupo',
  evaluationCount: 'Evaluaciones',
  approvedCount: 'Aprobadas',
  failedCount: 'Reprobadas',
  unknownOutcomeCount: 'Resultado desconocido',
  knownOutcomeCount: 'Resultados conocidos',
  approvalRate: 'Aprobación (%)',
  failureRate: 'Reprobación (%)',
  meanAge: 'Edad media al ingreso',
  ageSampleCount: 'Muestra de edades',
  excludedAgeApplicantCount: 'Aspirantes sin edad utilizable',
  meanAttempts: 'Oportunidades observadas por aspirante/ciclo',
  applicantCycleCount: 'Grupos aspirante/ciclo',
  excludedAttemptGroups: 'Grupos sin oportunidad válida',
  rank: 'Posición departamental',
  applicantsWithApproval: 'Aspirantes con alguna aprobación',
};
export const groupLabels: Record<keyof MetricGroup, string> = {
  career: 'Carrera',
  subject: 'Materia',
  institutionType: 'Tipo de institución',
  department: 'Departamento',
  municipality: 'Municipio',
  entryYear: 'Ciclo de ingreso',
  month: 'Mes de asignación',
  age: 'Edad al ingreso',
  sex: 'Sexo registrado',
};
export function dimensionLabel(dimension: Dimension | null | undefined): string {
  if (!dimension) return 'Sin registro';
  return (
    dimension.name +
    (dimension.sourceValue && dimension.sourceValue !== dimension.sourceValue.trim()
      ? ' · espacio en origen'
      : '')
  );
}
export function groupValue(group: MetricGroup, field: keyof MetricGroup): string {
  const value = group[field];
  if (value === null || value === undefined) return 'Sin registro';
  return typeof value === 'object' ? dimensionLabel(value) : String(value);
}
export function metricValue(value: number | null | undefined, key: MetricKey): string {
  if (value === null || value === undefined) return 'No calculable';
  const decimals = ['approvalRate', 'failureRate', 'meanAge', 'meanAttempts'].includes(key) ? 2 : 0;
  return new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
