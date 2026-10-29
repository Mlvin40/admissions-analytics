import { TestBed } from '@angular/core/testing';
import { ImportBatchProgress } from './import-batch-progress';
import { ImportBatch } from './import-batch-tracker';
import { ImportResult } from './data-import.service';
const completed: ImportResult = {
  id: 'one',
  fileName: 'one.csv',
  status: 'COMPLETED',
  totalRead: 100,
  valid: 100,
  processed: 100,
  rejected: 0,
  pending: 0,
  mongoStored: 100,
  newEvaluations: 100,
  alreadyExisting: 0,
  duplicates: 0,
  elapsedMs: 10,
  attempt: 1,
  message: '',
};
describe('Import batch progress presentation', () => {
  async function render(files: ImportResult[]) {
    await TestBed.configureTestingModule({ imports: [ImportBatchProgress] }).compileComponents();
    const fixture = TestBed.createComponent(ImportBatchProgress);
    const batch: ImportBatch = { id: 1, files, notificationDismissed: false, unavailableIds: [] };
    fixture.componentRef.setInput('batch', batch);
    fixture.detectChanges();
    return { fixture, batch, element: fixture.nativeElement as HTMLElement };
  }
  it('shows exact ten-file success, counters and persistent summary after dismissal', async () => {
    const { fixture, batch, element } = await render(
      Array.from({ length: 10 }, (_, i) => ({ ...completed, id: `${i}` })),
    );
    const notice = element.querySelector('.completion-notice');
    expect(notice?.textContent).toContain(
      'Importación completada. Los 10 archivos finalizaron correctamente.',
    );
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '100',
    );
    const dismiss = vi.fn();
    fixture.componentInstance.dismiss.subscribe(dismiss);
    (notice?.querySelector('button') as HTMLButtonElement).click();
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1);
    fixture.componentRef.setInput('batch', { ...batch, notificationDismissed: true });
    fixture.detectChanges();
    expect(element.querySelector('.completion-notice')).toBeNull();
    expect(element.querySelector('.final-summary')?.textContent).toContain(
      'finalizaron correctamente',
    );
    expect(fixture.componentInstance.progress().processed).toBe(1000);
  });
  it('shows observations instead of clean success for rejected rows', async () => {
    const { element } = await render([
      { ...completed, status: 'COMPLETED_WITH_REJECTIONS', rejected: 2 },
    ]);
    expect(element.querySelector('.completion-notice')?.textContent).toContain(
      'finalizada con observaciones',
    );
    expect(element.querySelector('.final-summary')?.textContent).toContain('Rechazados: 2');
    expect(element.textContent).not.toContain('finalizó correctamente');
  });
  it('offers retry for partial failures and never claims success at 100 percent', async () => {
    const partial: ImportResult = {
      ...completed,
      status: 'PARTIAL',
      pending: 2,
      message: 'Conexión interrumpida',
    };
    const { fixture, element } = await render([partial]);
    expect(element.textContent).toContain('requieren revisión o reintento');
    expect(element.textContent).not.toContain('finalizó correctamente');
    const retry = vi.fn();
    fixture.componentInstance.retryImport.subscribe(retry);
    (element.querySelector('.retry-action button') as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledExactlyOnceWith(partial);
  });
  it('shows filenames, queue count and no premature final notification', async () => {
    const { element } = await render([
      { ...completed, status: 'RUNNING', fileName: 'actual.csv' },
      { ...completed, id: 'queued', status: 'QUEUED' },
    ]);
    expect(element.querySelector('.current')?.textContent).toContain('Procesando: actual.csv');
    expect(element.querySelector('.status')?.textContent).toContain('1 en cola');
    expect(element.querySelector('.completion-notice')).toBeNull();
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');
  });
});
