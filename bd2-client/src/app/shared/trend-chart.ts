import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { BarDatum } from './bar-chart';
@Component({
  selector: 'app-trend-chart',
  template: ` <figure #frame>
    <figcaption>{{ title() }}</figcaption>
    <svg
      [attr.viewBox]="'0 0 ' + width() + ' 240'"
      role="img"
      [attr.aria-label]="
        title() + '. Porcentajes de aprobación por ciclo; detalle disponible en la tabla.'
      "
    >
      @for (level of [0, 25, 50, 75, 100]; track level) {
        <line
          x1="42"
          [attr.x2]="width() - 20"
          [attr.y1]="205 - level * 1.75"
          [attr.y2]="205 - level * 1.75"
          stroke="var(--color-border)"
        />
        <text x="5" [attr.y]="210 - level * 1.75">{{ level }} %</text>
      }
      @for (p of points(); track p.label) {
        @if (p.y !== null) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="5" fill="var(--color-primary-hover)">
            <title>{{ p.label }}: {{ p.value }} %</title>
          </circle>
        }
        @if (p.showLabel) {
          <text [attr.x]="p.x" y="230" text-anchor="middle">{{ p.label }}</text>
        }
      }
      @for (segment of segments(); track $index) {
        <polyline
          [attr.points]="segment"
          fill="none"
          stroke="var(--color-primary)"
          stroke-width="3"
        />
      }
    </svg>
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
        margin-bottom: 1rem;
      }
      svg {
        display: block;
        width: 100%;
        height: 240px;
      }
      text {
        font: 12px Arial;
        fill: var(--color-text-secondary);
      }
    `,
  ],
})
export class TrendChart implements OnDestroy {
  readonly title = input.required<string>();
  readonly data = input<BarDatum[]>([]);
  readonly width = signal(800);
  @ViewChild('frame', { static: true }) frame!: ElementRef<HTMLElement>;
  private observer?: ResizeObserver;
  constructor() {
    afterNextRender(() => {
      this.width.set(Math.max(260, this.frame.nativeElement.clientWidth));
      this.observer = new ResizeObserver(() =>
        this.width.set(Math.max(260, this.frame.nativeElement.clientWidth)),
      );
      this.observer.observe(this.frame.nativeElement);
    });
  }
  readonly points = computed(() =>
    this.data().map((item, i, items) => {
      const step = this.width() < 500 && items.length > 6 ? Math.ceil(items.length / 5) : 1;
      const last = items.length - 1;
      return {
        ...item,
        x: 52 + (i * (this.width() - 75)) / Math.max(1, last),
        y: item.value === null ? null : 205 - item.value * 1.75,
        showLabel: i === last || (i % step === 0 && i <= last - step),
      };
    }),
  );
  readonly segments = computed(() => {
    const segments: string[] = [];
    let current: string[] = [];
    for (const p of this.points()) {
      if (p.y === null) {
        if (current.length) segments.push(current.join(' '));
        current = [];
      } else current.push(`${p.x},${p.y}`);
    }
    if (current.length) segments.push(current.join(' '));
    return segments;
  });
  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
