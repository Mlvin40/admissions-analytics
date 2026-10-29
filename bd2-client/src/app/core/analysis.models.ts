export type DimensionName =
  'career' | 'subject' | 'department' | 'municipality' | 'institutionType';
export interface Dimension {
  key: string;
  name: string;
  sourceValue: string | null;
  known?: boolean | null;
  departmentKey?: string | null;
}
export interface LookupOption extends Dimension {
  contextName: string | null;
  label?: string;
}
export interface OptionsPage {
  items: LookupOption[];
  total: number;
  offset: number;
  limit: number;
}
export interface Applicant {
  key: string;
  correlativo_aspirante: string;
  identityScheme: string;
}
export interface Source {
  fileSha256: string;
  recordNumber: number;
  fileYear: number | null;
  schemaId: string;
  sourceValues: Record<string, string>;
}
export interface EvaluationRecord {
  evaluationId: string;
  applicantKey?: string;
  applicant?: Applicant;
  assignmentDate: string | null;
  entryYear: number | null;
  opportunity: number | null;
  passed: boolean | null;
  subject: Dimension | null;
  career: Dimension | null;
  birthYear?: number | null;
  entryAge?: number | null;
  sex?: string | null;
  origin?: { department: Dimension; municipality: Dimension; institutionType: Dimension };
  qualityIssues?: string[];
  sources?: Source[];
}
export interface MetricGroup {
  career: Dimension | null;
  subject: Dimension | null;
  institutionType: Dimension | null;
  department: Dimension | null;
  municipality: Dimension | null;
  entryYear: number | null;
  month: string | null;
  age: number | null;
  sex: string | null;
}
export interface MetricRow {
  group: MetricGroup;
  applicantCount: number | null;
  evaluationCount: number | null;
  approvedCount: number | null;
  failedCount: number | null;
  unknownOutcomeCount: number | null;
  knownOutcomeCount: number | null;
  approvalRate: number | null;
  failureRate: number | null;
  meanAge: number | null;
  ageSampleCount: number | null;
  excludedAgeApplicantCount: number | null;
  meanAttempts: number | null;
  applicantCycleCount: number | null;
  excludedAttemptGroups: number | null;
  rank: number | null;
  applicantsWithApproval: number | null;
}
export type MetricKey = Exclude<keyof MetricRow, 'group'>;
export interface SummaryInfo {
  generatedAt: string | null;
  sourceSnapshot: string | null;
  sourceEvaluationCount: number;
  refreshRequired: boolean;
}
export interface SummaryRefreshResult {
  careerCount: number;
  summary: SummaryInfo;
}
export interface AnalyticsPage<T> {
  query: string;
  unit: string;
  offset: number;
  limit: number;
  total: number;
  excludedEvaluations: number;
  nextCursor: string | null;
  items: T[];
  notes: string[];
  summary: SummaryInfo | null;
  executionMs: number;
}
export interface SearchPage {
  items: EvaluationRecord[];
  total: number;
  offset: number;
  limit: number;
}
export type Params = Record<string, string | number | boolean | null | undefined>;
export interface GraphEvaluation {
  key: string;
  assignmentDate: string | null;
  entryYear: number | null;
  opportunity: number | null;
  passed: boolean | null;
}
export interface GraphHistory {
  applicantKey: string;
  evaluation: GraphEvaluation;
  subject: Dimension;
  career: Dimension | null;
}
export interface GraphApproval {
  subject: Dimension;
  career: Dimension;
  evaluationCount: number;
  approvedCount: number;
  failedCount: number;
  unknownOutcomeCount: number;
  approvalRate: number | null;
}
export interface GraphDemand {
  career: Dimension;
  applicantCount: number;
}
export interface GraphProgression {
  applicantKey: string;
  subject: Dimension;
  failed: GraphEvaluation;
  passed: GraphEvaluation;
}
export interface PeerPath {
  applicantKey: string;
  evaluationKey: string;
  municipalityKey: string;
  peerEvaluationKey: string;
  peerApplicantKey: string;
}
export interface NodeProperties {
  name: string | null;
  sourceValue: string | null;
  departmentKey: string | null;
  correlativo_aspirante: string | null;
  identityScheme: string | null;
  entryYear: number | null;
  assignmentDate: string | null;
  opportunity: number | null;
  passed: boolean | null;
  entryAge: number | null;
}
export interface GraphNode {
  id: string;
  label: string;
  key: string;
  properties: NodeProperties;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
export interface GraphPage<T> {
  query: string;
  unit: string;
  offset: number;
  limit: number;
  hasMore: boolean;
  items: T[];
  graph: GraphData | null;
  notes: string[];
  databaseMs: number;
  executionMs: number;
}
