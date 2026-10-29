import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, forkJoin, map, of, timeout, timer } from 'rxjs';
import { DataImportService, ImportResult } from './data-import.service';

export interface ImportBatch {
  id: number;
  files: ImportResult[];
  notificationDismissed: boolean;
  unavailableIds: string[];
}

export function isTerminal(file: ImportResult): boolean {
  return file.status !== 'QUEUED' && file.status !== 'RUNNING';
}

export function batchProgress(batch: ImportBatch) {
  const completed = batch.files.filter(isTerminal).length;
  const total = batch.files.length;
  return {
    completed,
    total,
    percent: total ? (completed / total) * 100 : 0,
    finished: total > 0 && completed === total,
    queued: batch.files.filter((file) => file.status === 'QUEUED').length,
    running: batch.files.filter((file) => file.status === 'RUNNING'),
    retryable: batch.files.filter((file) =>
      ['PARTIAL', 'FAILED', 'INTERRUPTED'].includes(file.status),
    ),
    observations: batch.files.some(
      (file) => file.status === 'COMPLETED_WITH_REJECTIONS' || file.rejected > 0,
    ),
    read: batch.files.reduce((sum, file) => sum + file.totalRead, 0),
    processed: batch.files.reduce((sum, file) => sum + file.processed, 0),
    rejected: batch.files.reduce((sum, file) => sum + file.rejected, 0),
    pending: batch.files.reduce((sum, file) => sum + file.pending, 0),
  };
}

// El lote pertenece al envío, no a la página del historial; permanece al navegar durante esta sesión
@Injectable({ providedIn: 'root' })
export class ImportBatchTracker {
  private readonly service = inject(DataImportService);
  private readonly state = signal<ImportBatch[]>([]);
  readonly batches = this.state.asReadonly();
  private sequence = 0;

  constructor() {
    timer(0, 1500)
      .pipe(
        // No cancelar lecturas lentas con cada tick ni superponer consultas del mismo lote
        exhaustMap(() => {
          const active = this.state().flatMap((batch) => batch.files.filter((f) => !isTerminal(f)));
          const ids = [...new Set(active.map((file) => file.id))];
          return ids.length
            ? forkJoin(
                ids.map((id) =>
                  this.service.result(id).pipe(
                    timeout(10000),
                    map((file) => ({ id, file })),
                    catchError(() => of({ id, file: null })),
                  ),
                ),
              )
            : EMPTY;
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((updates) => {
        const byId = new Map(updates.map((update) => [update.id, update.file]));
        this.state.update((batches) =>
          batches.map((batch) => {
            if (batch.files.every(isTerminal)) return batch;
            const unavailable = new Set(batch.unavailableIds);
            const files = batch.files.map((previous) => {
              if (isTerminal(previous) || !byId.has(previous.id)) return previous;
              const current = byId.get(previous.id);
              if (!current || current.attempt !== previous.attempt) {
                unavailable.add(previous.id);
                return previous;
              }
              unavailable.delete(previous.id);
              return current;
            });
            return { ...batch, files, unavailableIds: [...unavailable] };
          }),
        );
      });
  }

  start(files: ImportResult[]): void {
    if (!files.length) return;
    this.state.update((batches) => [
      { id: ++this.sequence, files: [...files], notificationDismissed: false, unavailableIds: [] },
      ...batches,
    ]);
  }

  dismiss(id: number): void {
    this.state.update((batches) =>
      batches.map((batch) => (batch.id === id ? { ...batch, notificationDismissed: true } : batch)),
    );
  }
}
