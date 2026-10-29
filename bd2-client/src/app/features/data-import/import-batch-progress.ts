import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ProgressBarModule } from 'primeng/progressbar';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';
import { ImportBatch, batchProgress } from './import-batch-tracker';
import { ImportResult } from './data-import.service';

@Component({
  selector: 'app-import-batch-progress',
  imports: [DecimalPipe, ProgressBarModule, MessageModule, ButtonModule],
  templateUrl: './import-batch-progress.html',
  styleUrl: './import-batch-progress.css',
})
export class ImportBatchProgress {
  readonly batch = input.required<ImportBatch>();
  readonly dismiss = output<number>();
  readonly retryImport = output<ImportResult>();
  readonly progress = computed(() => batchProgress(this.batch()));
  readonly summary = computed(() => {
    const p = this.progress();
    if (p.retryable.length)
      return `Importación finalizada con incidencias. ${p.retryable.length} de ${p.total} archivos requieren revisión o reintento.`;
    if (p.observations)
      return 'Importación finalizada con observaciones. Hay registros rechazados; consulta sus motivos en los resultados por archivo.';
    return p.total === 1
      ? 'Importación completada. El archivo finalizó correctamente.'
      : `Importación completada. Los ${p.total} archivos finalizaron correctamente.`;
  });
}
