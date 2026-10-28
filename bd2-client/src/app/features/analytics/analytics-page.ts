import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { AnalysisApi, requestError } from '../../core/analysis-api.service';
import {
  AnalyticsPage as ApiPage,
  EvaluationRecord,
  MetricRow,
  Params,
} from '../../core/analysis.models';
import { DimensionPicker } from '../../shared/dimension-picker';
import { RequestState } from '../../shared/request-state';
import { MetricResults } from '../../shared/metric-results';
import { HistoryResults } from '../../shared/history-results';
import { Pagination } from '../../shared/pagination';
import { ANALYTICS_QUERIES, QUERY_GROUPS } from './query-catalog';

@Component({
  selector: 'app-analytics-page',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MessageModule,
    DatePipe,
    RouterLink,
    DimensionPicker,
    RequestState,
    MetricResults,
    HistoryResults,
    Pagination,
  ],
  templateUrl: './analytics-page.html',
  styleUrl: './analytics-page.css',
})
export class AnalyticsPage implements OnInit {
  private readonly api = inject(AnalysisApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;
  readonly options = QUERY_GROUPS;
  readonly queryId = signal('M04');
  readonly query = computed(() => ANALYTICS_QUERIES.find((q) => q.id === this.queryId())!);
  readonly selector = new FormControl('M04', { nonNullable: true });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly validation = signal('');
  readonly metrics = signal<ApiPage<MetricRow> | null>(null);
  readonly history = signal<ApiPage<EvaluationRecord> | null>(null);
  readonly page = computed(() => this.metrics() ?? this.history());
  readonly pageIndex = signal(0);
  private cursors: (string | null)[] = [null];
  readonly form = new FormGroup({
    entryYear: new FormControl<number | null>(null, [
      Validators.min(1),
      Validators.max(9999),
      Validators.pattern(/^\d+$/),
    ]),
    correlativo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(4096)],
    }),
    identityScheme: new FormControl('', { nonNullable: true }),
    careerKey: new FormControl<string | null>(null),
    subjectKey: new FormControl<string | null>(null),
    departmentKey: new FormControl<string | null>(null),
    municipalityKey: new FormControl<string | null>(null),
    institutionTypeKey: new FormControl<string | null>(null),
    sex: new FormControl('', { nonNullable: true }),
    passed: new FormControl('', { nonNullable: true }),
    minAge: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(100),
      Validators.pattern(/^\d+$/),
    ]),
    maxAge: new FormControl<number | null>(null, [
      Validators.min(0),
      Validators.max(100),
      Validators.pattern(/^\d+$/),
    ]),
    assignmentFrom: new FormControl('', { nonNullable: true }),
    assignmentTo: new FormControl('', { nonNullable: true }),
    limit: new FormControl(25, { nonNullable: true }),
    sort: new FormControl('', { nonNullable: true }),
    direction: new FormControl('', { nonNullable: true }),
  });
  readonly limits = [10, 25, 50, 100].map((value) => ({ label: String(value), value }));
  readonly sexes = [
    { label: 'Todos', value: '' },
    { label: 'F', value: 'F' },
    { label: 'M', value: 'M' },
    { label: 'Sin registro', value: 'SIN REGISTRO' },
  ];
  readonly outcomes = [
    { label: 'Todos', value: '' },
    { label: 'Aprobada', value: 'true' },
    { label: 'Reprobada', value: 'false' },
  ];
  readonly schemes = [
    { label: 'Detectar formato', value: '' },
    { label: 'Completo (32 caracteres)', value: 'full32' },
    { label: 'Representación corta (20–23)', value: 'short' },
    { label: 'Otro identificador literal', value: 'other' },
  ];
  readonly directions = [
    { label: 'Predeterminado', value: '' },
    { label: 'Ascendente', value: 'asc' },
    { label: 'Descendente', value: 'desc' },
  ];
  readonly sorts = computed(() => {
    const result = [
      { label: 'Orden recomendado', value: '' },
      { label: 'Clave de grupo', value: 'key' },
      { label: 'Cantidad', value: 'count' },
    ];
    const m = this.query().metrics;
    if (m.includes('approvalRate')) result.push({ label: 'Aprobación', value: 'rate' });
    if (m.includes('meanAge')) result.push({ label: 'Edad media', value: 'age' });
    if (m.includes('meanAttempts')) result.push({ label: 'Oportunidades', value: 'attempts' });
    return result;
  });
  private applied: Params = {};
  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe((params) => {
      this.choose(params.get('query') ?? 'M04');
      if (params.get('correlativo'))
        this.form.controls.correlativo.setValue(params.get('correlativo')!);
      if (!this.query().history || this.form.controls.correlativo.value) this.run();
    });
  }
  choose(id: string) {
    this.request?.unsubscribe();
    this.loading.set(false);
    this.error.set('');
    this.validation.set('');
    this.metrics.set(null);
    this.history.set(null);
    const selected = ANALYTICS_QUERIES.find((q) => q.id === id) ?? ANALYTICS_QUERIES[3];
    this.queryId.set(selected.id);
    this.selector.setValue(selected.id);
    this.form.reset({
      correlativo: '',
      identityScheme: '',
      sex: '',
      passed: '',
      assignmentFrom: '',
      assignmentTo: '',
      limit: 25,
      sort: '',
      direction: '',
    });
    this.form.controls.correlativo.setValidators(
      selected.history
        ? [Validators.required, Validators.maxLength(4096)]
        : [Validators.maxLength(4096)],
    );
    this.form.controls.correlativo.updateValueAndValidity();
    this.cursors = [null];
    this.pageIndex.set(0);
  }
  run() {
    const v = this.form.getRawValue();
    this.validation.set('');
    if (
      this.form.invalid ||
      (this.query().history && !v.correlativo.trim()) ||
      (v.minAge !== null && v.maxAge !== null && v.minAge > v.maxAge) ||
      (v.assignmentFrom && v.assignmentTo && v.assignmentFrom > v.assignmentTo)
    ) {
      this.form.markAllAsTouched();
      this.validation.set(
        'Revisa el identificador completo, el ciclo y los rangos de edad o fechas.',
      );
      return;
    }
    this.applied =
      this.queryId() === 'M06'
        ? {
            careerKey: v.careerKey,
            limit: v.limit,
            sort: v.sort,
            direction: v.sort ? v.direction : null,
          }
        : { ...v, direction: v.sort ? v.direction : null };
    if (!this.query().history) {
      delete this.applied['correlativo'];
      delete this.applied['identityScheme'];
    } else {
      delete this.applied['sort'];
      delete this.applied['direction'];
    }
    this.cursors = [null];
    this.pageIndex.set(0);
    this.fetch(0);
  }
  fetch(index: number) {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.metrics.set(null);
    this.history.set(null);
    this.pageIndex.set(index);
    const params: Params = {
      ...this.applied,
      ...(this.query().history
        ? { cursor: this.cursors[index] }
        : { offset: index * Number(this.applied['limit'] ?? 25) }),
    };
    if (this.query().history)
      this.request = this.api
        .analytics<EvaluationRecord>(this.query().path, params)
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (page) => {
            this.history.set(page);
            this.loading.set(false);
          },
          error: (e) => this.fail(e),
        });
    else
      this.request = this.api
        .analytics<MetricRow>(this.query().path, params)
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (page) => {
            this.metrics.set(page);
            this.loading.set(false);
          },
          error: (e) => this.fail(e),
        });
  }
  private fail(error: unknown) {
    this.loading.set(false);
    this.error.set(requestError(error, 'MongoDB'));
  }
  next() {
    const page = this.page();
    if (!page) return;
    if (this.query().history) this.cursors[this.pageIndex() + 1] = page.nextCursor;
    this.fetch(this.pageIndex() + 1);
  }
  previous() {
    this.fetch(Math.max(0, this.pageIndex() - 1));
  }
  canNext() {
    const p = this.page();
    return p ? (this.query().history ? !!p.nextCursor : p.offset + p.limit < p.total) : false;
  }
  caption() {
    const p = this.page();
    return p
      ? `Página ${this.pageIndex() + 1} · ${p.total.toLocaleString('es-GT')} ${this.query().history ? 'evaluaciones' : 'grupos'}`
      : '';
  }
}
