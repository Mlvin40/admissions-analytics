import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatusPage } from './status-page';

describe('StatusPage HTTP flow', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusPage], providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('shows empty, loading and successful results using a relative URL', () => {
    const fixture = TestBed.createComponent(StatusPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Todavía no');
    (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Comprobando conexiones');
    const request = TestBed.inject(HttpTestingController).expectOne('/api/status?target=all');
    expect(request.request.method).toBe('GET');
    request.flush({ api: 'UP', mongodb: 'UP', neo4j: 'UP' });
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Disponible');
  });

  it('shows per-motor connection failures returned as HTTP 503', () => {
    const fixture = TestBed.createComponent(StatusPage);
    fixture.componentInstance.check();
    TestBed.inject(HttpTestingController).expectOne('/api/status?target=all')
      .flush({ api: 'UP', mongodb: 'DOWN', neo4j: 'UP' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin conexión');
    expect(fixture.componentInstance.error()).toBe(false);
  });

  for (const code of [400, 500]) {
    it(`handles HTTP ${code} without showing internal error details`, () => {
      const fixture = TestBed.createComponent(StatusPage);
      fixture.componentInstance.check();
      TestBed.inject(HttpTestingController).expectOne('/api/status?target=all')
        .flush({ message: 'private details' }, { status: code, statusText: 'Error' });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No se pudo completar');
      expect(fixture.nativeElement.textContent).not.toContain('private details');
      expect(fixture.componentInstance.loading()).toBe(false);
    });
  }

  it('recovers after a network failure and honors the selected target', () => {
    const fixture = TestBed.createComponent(StatusPage);
    fixture.componentInstance.check();
    TestBed.inject(HttpTestingController).expectOne('/api/status?target=all').error(new ProgressEvent('error'));
    expect(fixture.componentInstance.error()).toBe(true);
    fixture.componentInstance.target.setValue('mongodb');
    fixture.componentInstance.check();
    TestBed.inject(HttpTestingController).expectOne('/api/status?target=mongodb')
      .flush({ api: 'UP', mongodb: 'UP', neo4j: 'NOT_CHECKED' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No comprobado');
  });
});
