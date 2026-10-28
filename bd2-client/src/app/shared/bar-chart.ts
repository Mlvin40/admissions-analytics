import { Component, computed, input } from '@angular/core';
export interface BarDatum {
  label: string;
  value: number | null;
}
@Component({
  selector: 'app-bar-chart',
  template: ` <figure class="bar-chart" [attr.aria-label]="title()">
    <figcaption>{{ title() }}</figcaption>
    @for (item of data(); track $index) {
      <div class="bar-item">
        <div class="bar-label">
          <span>{{ item.label }}</span
          ><strong
            >{{ format(item.value) }}{{ percent() && item.value !== null ? ' %' : '' }}</strong
          >
        </div>
        <div class="bar-track">
          <div class="bar-fill" [style.width.%]="width(item.value)"></div>
        </div>
      </div>
    }
  </figure>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      figure {
        margin: 0;
      }
      figcaption {
        font-weight: 700;
        margin-bottom: 1.2rem;
      }
      .bar-item {
        margin: 0.9rem 0;
      }
      .bar-label {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        font-size: 0.86rem;
        margin-bottom: 0.35rem;
      }
      .bar-label span {
        overflow-wrap: anywhere;
      }
      .bar-label strong {
        white-space: nowrap;
      }
      .bar-track {
        height: 9px;
        background: var(--color-surface-muted);
        border-radius: 10px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        background: var(--color-primary);
        border-radius: 10px;
        min-width: 0;
      }
    `,
  ],
})
export class BarChart {
  readonly title = input.required<string>();
  readonly data = input<BarDatum[]>([]);
  readonly percent = input(false);
  readonly max = computed(() =>
    this.percent() ? 100 : Math.max(1, ...this.data().map((d) => d.value ?? 0)),
  );
  width(value: number | null) {
    return value === null ? 0 : Math.max(0, Math.min(100, (100 * value) / this.max()));
  }
  format(value: number | null) {
    return value === null
      ? 'No calculable'
      : new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 }).format(value);
  }
}
