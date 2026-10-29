import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataImportPage } from './data-import-page';
import { ImportResult } from './data-import.service';

const result: ImportResult = {
  id: 'test',
  fileName: 'test.csv',
  status: 'PARTIAL',
  totalRead: 3,
  valid: 2,
  processed: 0,
  rejected: 1,
  pending: 2,
  mongoStored: 2,
  newEvaluations: 2,
  alreadyExisting: 0,
  duplicates: 0,
  elapsedMs: 150,
  attempt: 1,
  message: 'Sincronización pendiente',
};

describe('CSV import HTTP flow', () => {
  let fixture: ComponentFixture<DataImportPage>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataImportPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    vi.useFakeTimers();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DataImportPage);
    vi.advanceTimersByTime(0);
    http.expectOne('/api/imports?offset=0&limit=50').flush([]);
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.useRealTimers();
  });

  it('sends several CSV as multipart and keeps processing separate from upload', () => {
    const control = { clear: vi.fn() };
    fixture.componentInstance.upload(
      [new File(['a'], 'one.csv'), new File(['b'], 'two.csv')],
      control,
    );
    const request = http.expectOne('/api/imports');
    expect(request.request.method).toBe('POST');
    const body: FormData = request.request.body;
    expect(body.getAll('files').length).toBe(2);
    expect(fixture.componentInstance.loading()).toBe(true);
    request.flush([{ ...result, status: 'QUEUED' }]);
    expect(control.clear).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.notice()).toContain('procesamiento');
  });

  it('polls batch IDs independently of history pages while preserving details and rejection dialogs', () => {
    const c = fixture.componentInstance;
    c.results.set([result]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('tbody summary') as HTMLElement).click();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('tbody details') as HTMLDetailsElement;
    c.showRejections(result);
    http
      .expectOne('/api/imports/test/rejections?offset=0&limit=25')
      .flush({ items: [], total: 0, offset: 0, limit: 25 });
    c.upload([new File(['synthetic'], 'test.csv')], { clear: vi.fn() });
    http
      .expectOne('/api/imports')
      .flush([{ ...result, id: 'new', status: 'QUEUED', processed: 0 }]);
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1500);
      http.expectOne('/api/imports?offset=0&limit=50').flush([{ ...result }]);
      http
        .expectOne('/api/imports/new')
        .flush({ ...result, id: 'new', status: 'RUNNING', processed: i + 1 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('tbody details')).toBe(details);
      expect(details.open).toBe(true);
      expect(c.selected()?.id).toBe('test');
      expect(c.batchTracker.batches()[0].files[0].id).toBe('new');
    }
    c.offset.set(50);
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports?offset=50&limit=50').flush([]);
    http
      .expectOne('/api/imports/new')
      .flush({ ...result, id: 'new', status: 'COMPLETED', processed: 5, rejected: 0 });
    fixture.detectChanges();
    expect(c.batchTracker.batches()[0].files[0].processed).toBe(5);
    expect(c.selected()?.id).toBe('test');
    expect(fixture.nativeElement.querySelector('.final-summary')?.textContent).toContain(
      'finalizó correctamente',
    );
    c.closeRejections();
  });

  it('resets the PrimeNG cumulative file limit for each submission, including failed requests', () => {
    const control = { clear: vi.fn(), uploadedFileCount: 10 };
    fixture.componentInstance.upload([new File(['a'], 'test.csv')], control);
    expect(control.uploadedFileCount).toBe(0);
    http.expectOne('/api/imports').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(control.clear).not.toHaveBeenCalled();
    control.uploadedFileCount = 1;
    fixture.componentInstance.upload([new File(['a'], 'test.csv')], control);
    http.expectOne('/api/imports').flush([{ ...result, status: 'QUEUED' }]);
    expect(control.uploadedFileCount).toBe(0);
    expect(control.clear).toHaveBeenCalledOnce();
  });

  it('preserves the selection and reports upload errors', () => {
    const control = { clear: vi.fn() };
    fixture.componentInstance.upload([new File(['a'], 'test.csv')], control);
    http.expectOne('/api/imports').flush({}, { status: 413, statusText: 'Too large' });
    expect(fixture.componentInstance.actionError()).toContain('tamaño máximo');
    expect(control.clear).not.toHaveBeenCalled();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('recovers polling after a network failure and retains partial results', () => {
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports?offset=0&limit=50').error(new ProgressEvent('error'));
    expect(fixture.componentInstance.connectionError()).toBe(true);
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports?offset=0&limit=50').flush([result]);
    expect(fixture.componentInstance.connectionError()).toBe(false);
    expect(fixture.componentInstance.results()[0].pending).toBe(2);
    expect(fixture.componentInstance.canRetry(result.status)).toBe(true);
  });

  it('retrieves paginated rejected records with their causes', () => {
    fixture.componentInstance.showRejections(result, 25);
    http.expectOne('/api/imports/test/rejections?offset=25&limit=25').flush({
      items: [{ recordNumber: 30, reason: 'Identificador vacío', values: [''] }],
      offset: 25,
      limit: 25,
      total: 30,
    });
    expect(fixture.componentInstance.rejected()?.items[0].recordNumber).toBe(30);
    expect(fixture.componentInstance.rejected()?.items[0].reason).toBe('Identificador vacío');
    expect(fixture.componentInstance.rejectionLoading()).toBe(false);
  });

  it('retries a partial import using its identifier', () => {
    fixture.componentInstance.results.set([result]);
    fixture.componentInstance.retry(result);
    const request = http.expectOne('/api/imports/test/retry');
    expect(request.request.method).toBe('POST');
    request.flush({ ...result, status: 'QUEUED', attempt: 2 });
    expect(fixture.componentInstance.results()[0].status).toBe('QUEUED');
    expect(fixture.componentInstance.results()[0].attempt).toBe(2);
  });
  it('keeps each expanded processing detail and its DOM through eight fresh polling responses', () => {
    const component = fixture.componentInstance;
    const records = [result, { ...result, id: 'second', fileName: 'second.csv' }];
    component.results.set(records);
    fixture.detectChanges();
    const elements = fixture.nativeElement.querySelectorAll(
      'tbody details',
    ) as NodeListOf<HTMLDetailsElement>;
    const first = elements[0];
    const second = elements[1];
    first.querySelector('summary')!.click();
    second.querySelector('summary')!.click();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
    const paragraph = first.querySelector('p');
    for (let tick = 0; tick < 8; tick++) {
      vi.advanceTimersByTime(1500);
      http
        .expectOne('/api/imports?offset=0&limit=50')
        .flush(records.map((r) => ({ ...r, valid: tick + 3 })));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('tbody details')).toBe(first);
      expect(first.querySelector('p')).toBe(paragraph);
      expect(first.querySelector('p')?.textContent).toContain('Válidos: ' + (tick + 3));
      expect(first.open).toBe(true);
      expect(second.open).toBe(true);
    }
    first.querySelector('summary')!.click();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
    expect(first.open).toBe(false);
    expect(second.open).toBe(true);
  });

  it('opens rejected rows in a modal instead of appending an invisible panel below the history', () => {
    const component = fixture.componentInstance;
    component.results.set([
      {
        ...result,
        fileName: 'rejection-check.csv',
        status: 'COMPLETED_WITH_REJECTIONS',
        totalRead: 4,
        processed: 2,
        rejected: 2,
        pending: 0,
      },
    ]);
    fixture.detectChanges();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Ver rechazos'))!;
    button.click();
    fixture.detectChanges();
    const request = http.expectOne('/api/imports/test/rejections?offset=0&limit=25');
    request.flush({
      items: [
        { recordNumber: 2, reason: 'Dos columnas', values: ['wrong', 'width'] },
        { recordNumber: 4, reason: 'Identificador vacío', values: [''] },
      ],
      total: 2,
      offset: 0,
      limit: 25,
    });
    fixture.detectChanges();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('Registro 2');
    expect(dialog?.textContent).toContain('Registro 4');
  });
  it('restores per-file expansion when navigating away from a history page and back', () => {
    const c = fixture.componentInstance;
    c.results.set([result]);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('tbody summary') as HTMLElement).click();
    vi.advanceTimersByTime(0);
    fixture.detectChanges();
    c.offset.set(50);
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports?offset=50&limit=50').flush([{ ...result, id: 'other-page' }]);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('tbody details') as HTMLDetailsElement).open).toBe(
      false,
    );
    c.offset.set(0);
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports?offset=0&limit=50').flush([{ ...result }]);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('tbody details') as HTMLDetailsElement).open).toBe(
      true,
    );
  });

  it('keeps the same rejection panel and rows through refresh, closes explicitly and reopens from the first page', () => {
    const c = fixture.componentInstance;
    c.showRejections(result);
    http.expectOne('/api/imports/test/rejections?offset=0&limit=25').flush({
      items: [{ recordNumber: 2, reason: 'Invalid width', values: ['wrong', 'width'] }],
      offset: 0,
      limit: 25,
      total: 1,
    });
    fixture.detectChanges();
    const dialog = document.querySelector('[role="dialog"]');
    const article = dialog?.querySelector('article');
    for (let tick = 0; tick < 8; tick++) {
      vi.advanceTimersByTime(1500);
      http.expectOne('/api/imports?offset=0&limit=50').flush([{ ...result }]);
      fixture.detectChanges();
      expect(document.querySelector('[role="dialog"]')).toBe(dialog);
      expect(dialog?.querySelector('article')).toBe(article);
      expect(c.selected()?.id).toBe(result.id);
    }
    c.closeRejections();
    fixture.detectChanges();
    expect(c.selected()).toBeNull();
    expect(c.rejected()).toBeNull();
    c.showRejections(result);
    http
      .expectOne('/api/imports/test/rejections?offset=0&limit=25')
      .flush({ items: [], offset: 0, limit: 25, total: 0 });
    fixture.detectChanges();
    expect(c.selected()?.id).toBe(result.id);
  });

  it('keeps failures and empty results visible inside the rejection dialog and escapes preview values', () => {
    const c = fixture.componentInstance;
    c.showRejections(result, 25);
    http
      .expectOne('/api/imports/test/rejections?offset=25&limit=25')
      .flush({ message: 'private details' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('No se pudo completar');
    expect(dialog?.textContent).not.toContain('private details');
    expect(c.actionError()).toBe('');
    expect(c.selected()?.id).toBe(result.id);
    c.showRejections(result, 25);
    http
      .expectOne('/api/imports/test/rejections?offset=25&limit=25')
      .flush({ items: [], total: 30, offset: 25, limit: 25 });
    fixture.detectChanges();
    expect(dialog?.textContent).toContain('No hay registros rechazados');
    c.showRejections(result);
    http.expectOne('/api/imports/test/rejections?offset=0&limit=25').flush({
      items: [
        {
          recordNumber: 4,
          reason: 'Missing identity',
          values: ['<img id="unsafe-preview" src=x onerror="alert(1)">'],
        },
      ],
      total: 1,
      offset: 0,
      limit: 25,
    });
    fixture.detectChanges();
    expect(document.getElementById('unsafe-preview')).toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('<img');
  });

  it('cancels obsolete rejection requests on file switches and closing without reopening on a history refresh', () => {
    const c = fixture.componentInstance;
    c.showRejections(result);
    const first = http.expectOne('/api/imports/test/rejections?offset=0&limit=25');
    c.showRejections({ ...result, id: 'second' });
    expect(first.cancelled).toBe(true);
    const second = http.expectOne('/api/imports/second/rejections?offset=0&limit=25');
    c.closeRejections();
    expect(second.cancelled).toBe(true);
    expect(c.rejectionLoading()).toBe(false);
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports?offset=0&limit=50').flush([{ ...result }]);
    fixture.detectChanges();
    expect(c.selected()).toBeNull();
    expect(c.rejected()).toBeNull();
  });
});
