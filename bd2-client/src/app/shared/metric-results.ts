import { Component, computed, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { MetricKey, MetricRow } from '../core/analysis.models';
import { AnalyticsQuery } from '../features/analytics/query-catalog';
import { groupLabels, groupValue, metricLabels, metricValue } from './value-format';
import { BarChart } from './bar-chart';
import { TrendChart } from './trend-chart';
@Component({
  selector: 'app-metric-results',
  styles: [
    `
      .chart-panel {
        max-width: 800px;
        margin: 1rem auto 2rem;
      }
    `,
  ],
  imports: [TableModule, BarChart, TrendChart],
  template: ` @if (query().chart === 'bar' && rows().length) {
      <div class="chart-panel">
        <app-bar-chart
          [title]="'Comparación · hasta 10 grupos de esta página'"
          [data]="bars()"
          [percent]="primary() === 'approvalRate'"
        />
      </div>
    }
    @if (query().chart === 'trend' && rows().length) {
      <div class="chart-panel">
        <app-trend-chart
          title="Porcentaje de aprobación por ciclo · página actual"
          [data]="trend()"
        />
      </div>
    }
    <div class="table-scroll" tabindex="0" aria-label="Resultados, desplazamiento horizontal">
      <p-table [value]="rows()" [tableStyle]="{ 'min-width': '36rem' }" size="small">
        <ng-template #header
          ><tr>
            @for (group of query().groups; track group) {
              <th>{{ groupLabels[group] }}</th>
            }
            @for (metric of query().metrics; track metric) {
              <th>{{ metricLabels[metric] }}</th>
            }
          </tr></ng-template
        >
        <ng-template #body let-row
          ><tr>
            @for (group of query().groups; track group) {
              <td>{{ groupValue(row.group, group) }}</td>
            }
            @for (metric of query().metrics; track metric) {
              <td class="numeric">{{ metricValue(row[metric], metric) }}</td>
            }
          </tr></ng-template
        >
        <ng-template #emptymessage
          ><tr>
            <td [attr.colspan]="query().groups.length + query().metrics.length">
              No hay resultados con estos filtros.
            </td>
          </tr></ng-template
        >
      </p-table>
    </div>`,
})
export class MetricResults {
  readonly rows = input<MetricRow[]>([]);
  readonly query = input.required<AnalyticsQuery>();
  readonly groupLabels = groupLabels;
  readonly groupValue = groupValue;
  readonly metricLabels = metricLabels;
  readonly metricValue = metricValue;
  readonly primary = computed<MetricKey>(() =>
    this.query().metrics.includes('approvalRate')
      ? 'approvalRate'
      : this.query().metrics.includes('meanAge')
        ? 'meanAge'
        : this.query().metrics[0],
  );
  readonly bars = computed(() =>
    this.rows()
      .slice(0, 10)
      .map((row) => ({
        label: this.query()
          .groups.map((g) => groupValue(row.group, g))
          .join(' · '),
        value: row[this.primary()],
      })),
  );
  readonly trend = computed(() =>
    [...this.rows()]
      .sort((a, b) => (a.group.entryYear ?? 0) - (b.group.entryYear ?? 0))
      .map((row) => ({
        label: String(row.group.entryYear ?? 'Sin ciclo'),
        value: row.approvalRate,
      })),
  );
}
