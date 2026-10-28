import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
@Component({
  selector: 'app-pagination',
  styles: [
    `
      .pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin: 1.3rem 0 0;
        flex-wrap: wrap;
      }
      .pagination span {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
      }
      @media (max-width: 650px) {
        .pagination {
          justify-content: center;
        }
      }
    `,
  ],
  imports: [ButtonModule],
  template: ` <nav class="pagination" aria-label="Paginación de resultados">
    <p-button
      label="Anterior"
      severity="secondary"
      [disabled]="busy() || !canPrevious()"
      (onClick)="previous.emit()"
    />
    <span>{{ caption() }}</span>
    <p-button
      label="Siguiente"
      severity="secondary"
      [disabled]="busy() || !canNext()"
      (onClick)="next.emit()"
    />
  </nav>`,
})
export class Pagination {
  readonly busy = input(false);
  readonly canPrevious = input(false);
  readonly canNext = input(false);
  readonly caption = input('');
  readonly previous = output<void>();
  readonly next = output<void>();
}
