import {
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { AnalysisApi, requestError } from '../../core/analysis-api.service';
import { MetricRow } from '../../core/analysis.models';
import { RequestState } from '../../shared/request-state';
import { BarChart } from '../../shared/bar-chart';
import { TrendChart } from '../../shared/trend-chart';
import { dimensionLabel } from '../../shared/value-format';
@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, ButtonModule, RequestState, BarChart, TrendChart],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.css',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(AnalysisApi);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly annual = signal<MetricRow[]>([]);
  readonly subjects = signal<MetricRow[]>([]);
  readonly institutions = signal<MetricRow[]>([]);
  readonly ready = signal(false);
  readonly totals = computed(() => {
    const rows = this.annual();
    const count = rows.reduce((s, r) => s + (r.evaluationCount ?? 0), 0);
    const approved = rows.reduce((s, r) => s + (r.approvedCount ?? 0), 0);
    const known = rows.reduce((s, r) => s + (r.knownOutcomeCount ?? 0), 0);
    return {
      count,
      approved,
      rate: known ? (100 * approved) / known : null,
      cycles: rows.filter((r) => r.group.entryYear !== null).length,
    };
  });
  readonly subjectRates = computed(() =>
    this.subjects().map((r) => ({ label: dimensionLabel(r.group.subject), value: r.approvalRate })),
  );
  readonly subjectCounts = computed(() =>
    this.subjects().map((r) => ({
      label: dimensionLabel(r.group.subject),
      value: r.evaluationCount,
    })),
  );
  readonly originCounts = computed(() =>
    this.institutions().map((r) => ({
      label: dimensionLabel(r.group.institutionType),
      value: r.applicantCount,
    })),
  );
  readonly trend = computed(() =>
    [...this.annual()]
      .sort((a, b) => (a.group.entryYear ?? 0) - (b.group.entryYear ?? 0))
      .map((r) => ({ label: String(r.group.entryYear ?? 'Sin ciclo'), value: r.approvalRate })),
  );
  ngOnInit() {
    this.reload();
  }
  reload() {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set('');
    this.ready.set(false);
    this.request = forkJoin({
      annual: this.api.completeMetrics('approval-evolution-by-entry-year'),
      subjects: this.api.completeMetrics('approval-rate-by-subject'),
      institutions: this.api.completeMetrics('applicants-by-institution-type'),
    })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (data) => {
          this.annual.set(data.annual);
          this.subjects.set(data.subjects);
          this.institutions.set(data.institutions);
          this.loading.set(false);
          this.ready.set(true);
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(requestError(e, 'MongoDB'));
        },
      });
  }
  format(value: number | null, decimals = 0) {
    return value === null
      ? 'No calculable'
      : new Intl.NumberFormat('es-GT', {
          maximumFractionDigits: decimals,
          minimumFractionDigits: decimals,
        }).format(value);
  }
}
