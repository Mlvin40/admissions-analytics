import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ConnectionState, StatusResponse, StatusService, StatusTarget } from '../../core/status.service';

@Component({
  selector: 'app-status-page',
  imports: [ReactiveFormsModule, ButtonModule, CardModule, MessageModule, SelectModule],
  templateUrl: './status-page.html',
  styleUrl: './status-page.css'
})
export class StatusPage {
  private readonly service = inject(StatusService);
  private readonly destroyRef = inject(DestroyRef);
  readonly target = new FormControl<StatusTarget>('all', { nonNullable: true });
  readonly form = new FormGroup({ target: this.target });
  readonly options = [
    { label: 'Ambas bases de datos', value: 'all' },
    { label: 'MongoDB', value: 'mongodb' },
    { label: 'Neo4j', value: 'neo4j' }
  ];
  readonly loading = signal(false);
  readonly result = signal<StatusResponse | null>(null);
  readonly error = signal(false);

  check(): void {
    if (this.loading()) return;
    this.result.set(null);
    this.error.set(false);
    this.loading.set(true);
    this.service.check(this.target.getRawValue()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.result.set(result);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  label(state: ConnectionState): string {
    return { UP: 'Disponible', DOWN: 'Sin conexión', NOT_CHECKED: 'No comprobado' }[state];
  }
}
