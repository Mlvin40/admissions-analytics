import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DataImportPage } from './data-import-page';
import { ImportResult } from './data-import.service';

const result: ImportResult = { id: 'test', fileName: 'test.csv', status: 'PARTIAL', totalRead: 3,
  valid: 2, processed: 0, rejected: 1, pending: 2, mongoStored: 2, newEvaluations: 2,
  alreadyExisting: 0, duplicates: 0, elapsedMs: 150, attempt: 1, message: 'Sincronización pendiente' };

describe('CSV import HTTP flow', () => {
  let fixture: ComponentFixture<DataImportPage>;
  let http: HttpTestingController;
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [DataImportPage], providers: [provideHttpClient(), provideHttpClientTesting()]}).compileComponents();
    vi.useFakeTimers();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DataImportPage);
    vi.advanceTimersByTime(0);
    http.expectOne('/api/imports?offset=0&limit=50').flush([]);
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.useRealTimers(); });

  it('sends several CSV as multipart and keeps processing separate from upload', () => {
    const control = { clear: vi.fn() };
    fixture.componentInstance.upload([new File(['a'], 'one.csv'), new File(['b'], 'two.csv')], control);
    const request = http.expectOne('/api/imports');
    expect(request.request.method).toBe('POST');
    const body: FormData = request.request.body;
    expect(body.getAll('files').length).toBe(2);
    expect(fixture.componentInstance.loading()).toBe(true);
    request.flush([{...result,status:'QUEUED'}]);
    expect(control.clear).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.notice()).toContain('procesamiento');
  });

  it('preserves the selection and reports upload errors', () => {
    const control = { clear: vi.fn() };
    fixture.componentInstance.upload([new File(['a'], 'test.csv')], control);
    http.expectOne('/api/imports').flush({}, {status:413,statusText:'Too large'});
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
    http.expectOne('/api/imports/test/rejections?offset=25&limit=25')
      .flush({items:[{recordNumber:30,reason:'Identificador vacío',values:['']}],offset:25,limit:25,total:30});
    expect(fixture.componentInstance.rejected()?.items[0].recordNumber).toBe(30);
    expect(fixture.componentInstance.rejected()?.items[0].reason).toBe('Identificador vacío');
    expect(fixture.componentInstance.rejectionLoading()).toBe(false);
  });

  it('retries a partial import using its identifier', () => {
    fixture.componentInstance.results.set([result]);
    fixture.componentInstance.retry(result);
    const request = http.expectOne('/api/imports/test/retry');
    expect(request.request.method).toBe('POST');
    request.flush({...result,status:'QUEUED',attempt:2});
    expect(fixture.componentInstance.results()[0].status).toBe('QUEUED');
    expect(fixture.componentInstance.results()[0].attempt).toBe(2);
  });
});
