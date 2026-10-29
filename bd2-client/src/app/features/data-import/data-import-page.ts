import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe, JsonPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of, Subscription, switchMap, timer } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { FileUploadModule, FileUpload } from 'primeng/fileupload';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ImportBatchTracker } from './import-batch-tracker';
import { ImportBatchProgress } from './import-batch-progress';
import {
  DataImportService,
  ImportResult,
  ImportStatus,
  RejectionPage,
} from './data-import.service';

@Component({
  selector: 'app-data-import-page',
  imports: [
    DecimalPipe,
    JsonPipe,
    ButtonModule,
    CardModule,
    FileUploadModule,
    TableModule,
    MessageModule,
    TagModule,
    DialogModule,
    ImportBatchProgress,
  ],
  templateUrl: './data-import-page.html',
  styleUrl: './data-import-page.css',
})
export class DataImportPage {
  private readonly service = inject(DataImportService);
  private readonly destroyRef = inject(DestroyRef);
  readonly batchTracker = inject(ImportBatchTracker);
  readonly results = signal<ImportResult[]>([]);
  readonly loading = signal(false);
  readonly initialLoading = signal(true);
  readonly actionError = signal('');
  readonly connectionError = signal(false);
  readonly notice = signal('');
  readonly offset = signal(0);
  readonly selected = signal<ImportResult | null>(null);
  readonly rejected = signal<RejectionPage | null>(null);
  readonly rejectionLoading = signal(false);
  readonly rejectionError = signal('');
  readonly rejectionOffset = signal(0);
  readonly expandedImportIds = signal<ReadonlySet<string>>(new Set());
  readonly trackImport = (_index: number, result: ImportResult): string => result.id;
  private rejectionRequest?: Subscription;

  constructor() {
    timer(0, 1500)
      .pipe(
        switchMap(() => this.service.list(this.offset()).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.initialLoading.set(false);
        this.connectionError.set(results === null);
        if (results !== null) this.results.set(results);
      });
  }

  upload(
    files: File[],
    control: Pick<FileUpload, 'clear'> & Partial<Pick<FileUpload, 'uploadedFileCount'>>,
  ): void {
    if (this.loading()) return;
    this.loading.set(true);
    // PrimeNG acumula este contador incluso en cargas personalizadas; el límite es por envío
    control.uploadedFileCount = 0;
    this.actionError.set('');
    this.notice.set('');
    this.service
      .upload(files)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (files) => {
          this.batchTracker.start(files);
          this.loading.set(false);
          this.offset.set(0);
          control.clear();
          this.notice.set('Archivos recibidos. Puedes seguir el procesamiento en los resultados.');
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.actionError.set(this.errorMessage(error));
        },
      });
  }

  retry(result: ImportResult): void {
    this.actionError.set('');
    this.service
      .retry(result.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.batchTracker.start([updated]);
          this.results.update((results) =>
            results.map((item) => (item.id === updated.id ? updated : item)),
          );
        },
        error: (error: unknown) => this.actionError.set(this.errorMessage(error)),
      });
  }

  onProcessingToggle(id: string, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    if (this.expandedImportIds().has(id) === open) return;
    this.expandedImportIds.update((ids) => {
      const next = new Set(ids);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  showRejections(result: ImportResult, offset = 0): void {
    // El refresco del historial no controla el diálogo; cancelar evita mezclar respuestas de archivos o páginas distintos
    this.rejectionRequest?.unsubscribe();
    this.selected.set(result);
    this.rejected.set(null);
    this.rejectionOffset.set(offset);
    this.rejectionLoading.set(true);
    this.rejectionError.set('');
    this.rejectionRequest = this.service
      .rejections(result.id, offset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.rejected.set(page);
          this.rejectionLoading.set(false);
        },
        error: (error: unknown) => {
          this.rejectionError.set(this.errorMessage(error));
          this.rejectionLoading.set(false);
        },
      });
  }

  closeRejections(): void {
    this.rejectionRequest?.unsubscribe();
    this.selected.set(null);
    this.rejected.set(null);
    this.rejectionError.set('');
    this.rejectionLoading.set(false);
    this.rejectionOffset.set(0);
  }

  onRejectionVisibility(visible: boolean): void {
    if (!visible) this.closeRejections();
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const body: unknown = error.error;
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string')
        return body.message;
    }
    if (error instanceof HttpErrorResponse && error.status === 413)
      return 'Los archivos superan el tamaño máximo permitido.';
    return 'No se pudo completar la solicitud. Comprueba la conexión y vuelve a intentarlo; las cargas recibidas conservan sus resultados.';
  }

  canRetry(status: ImportStatus): boolean {
    return ['PARTIAL', 'FAILED', 'INTERRUPTED'].includes(status);
  }
  statusLabel(status: ImportStatus): string {
    return {
      QUEUED: 'En cola',
      RUNNING: 'Procesando',
      COMPLETED: 'Completado',
      COMPLETED_WITH_REJECTIONS: 'Completado con rechazos',
      PARTIAL: 'Parcial',
      FAILED: 'Error',
      INTERRUPTED: 'Interrumpido',
    }[status];
  }
  statusColor(status: ImportStatus): string {
    if (status === 'COMPLETED') return 'var(--color-success)';
    if (status === 'FAILED') return 'var(--color-danger)';
    if (this.canRetry(status) || status === 'COMPLETED_WITH_REJECTIONS')
      return 'var(--color-warning)';
    return 'var(--color-info)';
  }
}
