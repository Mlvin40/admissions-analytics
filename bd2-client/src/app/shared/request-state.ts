import { Component, input, output } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';
@Component({
  selector: 'app-request-state',
  styles: [
    `
      .request-state {
        display: grid;
        gap: 0.7rem;
        margin: 0.7rem 0;
      }
    `,
  ],
  imports: [MessageModule, ButtonModule],
  template: ` <div aria-live="polite" class="request-state">
    @if (loading()) {
      <p-message severity="info"
        >Consultando datos… Puedes mantener esta pantalla abierta.</p-message
      >
    }
    @if (error()) {
      <p-message severity="error">{{ error() }}</p-message
      ><p-button label="Reintentar consulta" severity="secondary" (onClick)="retry.emit()" />
    }
  </div>`,
})
export class RequestState {
  readonly loading = input(false);
  readonly error = input('');
  readonly retry = output<void>();
}
