import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { AnalysisApi, requestError } from '../../core/analysis-api.service';
import {
  EvaluationRecord,
  GraphApproval,
  GraphDemand,
  GraphHistory,
  GraphPage as ApiPage,
  GraphProgression,
  MetricRow,
  Params,
  PeerPath,
} from '../../core/analysis.models';
import { DimensionPicker } from '../../shared/dimension-picker';
import { RequestState } from '../../shared/request-state';
import { Pagination } from '../../shared/pagination';
import { HistoryResults } from '../../shared/history-results';
import { dimensionLabel } from '../../shared/value-format';
import { GraphCanvas } from './graph-canvas';
import { GRAPH_QUERIES } from './graph-catalog';
interface DisplayRow {
  cells: string[];
}
@Component({
  selector: 'app-graph-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MessageModule,
    TableModule,
    DimensionPicker,
    RequestState,
    Pagination,
    HistoryResults,
    GraphCanvas,
  ],
  templateUrl: './graph-page.html',
})
export class GraphPage implements OnInit {
  private readonly api = inject(AnalysisApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;
  readonly queryId = signal('N02');
  readonly query = computed(() => GRAPH_QUERIES.find((q) => q.id === this.queryId())!);
  readonly selector = new FormControl('N02', { nonNullable: true });
  readonly options = GRAPH_QUERIES.map((q) => ({ label: q.id + ' · ' + q.title, value: q.id }));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly validation = signal('');
  readonly page = signal<ApiPage<
    GraphHistory | GraphApproval | GraphDemand | GraphProgression | PeerPath
  > | null>(null);
  readonly rows = signal<DisplayRow[]>([]);
  readonly history = signal<EvaluationRecord[]>([]);
  readonly offset = signal(0);
  readonly form = new FormGroup({
    entryYear: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(1),
      Validators.max(9999),
      Validators.pattern(/^\d+$/),
    ]),
    applicantKey: new FormControl('', { nonNullable: true }),
    subjectKey: new FormControl<string | null>(null),
    careerKey: new FormControl<string | null>(null),
    departmentKey: new FormControl<string | null>(null),
    municipalityKey: new FormControl<string | null>(null),
    limit: new FormControl(25, { nonNullable: true }),
  });
  readonly limits = computed(() =>
    (this.queryId() === 'N05' ? [5, 10, 25] : [5, 10, 25, 50, 100]).map((value) => ({
      label: String(value),
      value,
    })),
  );
  readonly columns = computed(() =>
    this.queryId() === 'N02'
      ? [
          'Materia',
          'Carrera',
          'Evaluaciones',
          'Aprobadas',
          'Reprobadas',
          'Desconocidas',
          'Aprobación (%)',
        ]
      : this.queryId() === 'N03'
        ? ['Carrera', 'Aspirantes únicos']
        : this.queryId() === 'N04'
          ? [
              'Identificador completo',
              'Materia',
              'Evaluación reprobada',
              'Oportunidad reprobada',
              'Evaluación aprobada',
              'Oportunidad aprobada',
            ]
          : [
              'Aspirante origen',
              'Evaluación origen',
              'Municipio',
              'Evaluación relacionada',
              'Otro aspirante',
            ],
  );
  readonly requiresApplicant = computed(() => ['N01', 'N05'].includes(this.queryId()));
  private applied: Params = {};
  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      this.choose(params.get('query') ?? 'N02');
      if (params.get('applicantKey'))
        this.form.controls.applicantKey.setValue(params.get('applicantKey')!);
      if (params.get('entryYear'))
        this.form.controls.entryYear.setValue(Number(params.get('entryYear')));
      if (this.form.controls.entryYear.value && this.requirementsReady()) this.run();
    });
    this.api
      .analytics<MetricRow>('approval-evolution-by-entry-year', { limit: 100 })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => {
          if (!this.form.controls.entryYear.value) {
            const years = p.items
              .map((r) => r.group.entryYear)
              .filter((y): y is number => y !== null);
            if (years.length) {
              this.form.controls.entryYear.setValue(Math.max(...years));
              if (this.requirementsReady()) this.run();
            }
          }
        },
        error: () => {
          /* El ciclo puede introducirse manualmente si MongoDB no está disponible */
        },
      });
  }
  choose(id: string) {
    this.request?.unsubscribe();
    this.loading.set(false);
    this.error.set('');
    this.validation.set('');
    this.page.set(null);
    this.rows.set([]);
    this.history.set([]);
    this.offset.set(0);
    const q = GRAPH_QUERIES.find((q) => q.id === id) ?? GRAPH_QUERIES[1];
    this.queryId.set(q.id);
    this.selector.setValue(q.id);
    // Los requisitos de identidad no deben conservarse al pasar a una consulta sin aspirante
    this.form.controls.applicantKey.setValidators(
      this.requiresApplicant() ? Validators.required : null,
    );
    this.form.controls.applicantKey.updateValueAndValidity();
    const year = this.form.controls.entryYear.value;
    this.form.reset({ entryYear: year, applicantKey: '', limit: q.id === 'N05' ? 10 : 25 });
  }
  private requirementsReady() {
    const v = this.form.getRawValue();
    return (
      (!this.requiresApplicant() || !!v.applicantKey) &&
      (this.queryId() !== 'N03' || !!v.departmentKey) &&
      (this.queryId() !== 'N04' || !!v.subjectKey)
    );
  }
  run() {
    this.validation.set('');
    const v = this.form.getRawValue();
    const identityValid =
      !this.requiresApplicant() ||
      /^(full32:[0-9a-f]{32}|short:[0-9a-f]{20,23}|other:.{1,4096})$/.test(v.applicantKey);
    if (this.form.invalid || !this.requirementsReady() || !identityValid) {
      this.form.markAllAsTouched();
      this.validation.set(
        'Completa el ciclo y los filtros obligatorios. La clave del aspirante debe incluir su formato y el identificador completo.',
      );
      return;
    }
    const allowed: Record<string, string[]> = {
      N01: ['applicantKey', 'subjectKey'],
      N02: ['subjectKey', 'careerKey'],
      N03: ['departmentKey', 'municipalityKey'],
      N04: ['subjectKey'],
      N05: ['applicantKey', 'municipalityKey'],
    };
    const values: Params = { ...v };
    this.applied = { entryYear: v.entryYear, limit: v.limit };
    for (const key of allowed[this.queryId()]) this.applied[key] = values[key];
    this.fetch(0);
  }
  fetch(offset: number) {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.page.set(null);
    this.rows.set([]);
    this.history.set([]);
    this.offset.set(offset);
    this.request = this.api
      .graph<GraphHistory | GraphApproval | GraphDemand | GraphProgression | PeerPath>(
        this.query().path,
        { ...this.applied, offset },
      )
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.loading.set(false);
          if (this.queryId() === 'N01')
            this.history.set(
              (page.items as GraphHistory[]).map((r) => ({
                evaluationId: r.evaluation.key,
                applicantKey: r.applicantKey,
                ...r.evaluation,
                assignmentDate: r.evaluation.assignmentDate
                  ? r.evaluation.assignmentDate + 'T00:00:00Z'
                  : null,
                subject: r.subject,
                career: r.career,
              })),
            );
          else if (this.queryId() === 'N02')
            this.rows.set(
              (page.items as GraphApproval[]).map((r) => ({
                cells: [
                  dimensionLabel(r.subject),
                  dimensionLabel(r.career),
                  ...['evaluationCount', 'approvedCount', 'failedCount', 'unknownOutcomeCount'].map(
                    (k) => String(r[k as keyof GraphApproval]),
                  ),
                  r.approvalRate === null ? 'No calculable' : r.approvalRate.toFixed(2),
                ],
              })),
            );
          else if (this.queryId() === 'N03')
            this.rows.set(
              (page.items as GraphDemand[]).map((r) => ({
                cells: [dimensionLabel(r.career), r.applicantCount.toLocaleString('es-GT')],
              })),
            );
          else if (this.queryId() === 'N04')
            this.rows.set(
              (page.items as GraphProgression[]).map((r) => ({
                cells: [
                  r.applicantKey,
                  dimensionLabel(r.subject),
                  r.failed.key,
                  String(r.failed.opportunity ?? 'Sin registro'),
                  r.passed.key,
                  String(r.passed.opportunity ?? 'Sin registro'),
                ],
              })),
            );
          else
            this.rows.set(
              (page.items as PeerPath[]).map((r) => ({
                cells: [
                  r.applicantKey,
                  r.evaluationKey,
                  r.municipalityKey,
                  r.peerEvaluationKey,
                  r.peerApplicantKey,
                ],
              })),
            );
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(requestError(e, 'Neo4j'));
        },
      });
  }
  previous() {
    this.fetch(Math.max(0, this.offset() - Number(this.applied['limit'] ?? 25)));
  }
  next() {
    this.fetch(this.offset() + Number(this.applied['limit'] ?? 25));
  }
  caption() {
    const p = this.page();
    return p
      ? `Página ${Math.floor(p.offset / p.limit) + 1} · ${p.items.length} ${this.queryId() === 'N05' ? 'caminos' : 'filas'}`
      : '';
  }
}
