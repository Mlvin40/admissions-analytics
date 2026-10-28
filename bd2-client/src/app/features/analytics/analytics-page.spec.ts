import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AnalyticsPage } from './analytics-page';
const empty = {
  query: 'M15',
  unit: 'EVALUATIONS',
  offset: 0,
  limit: 25,
  total: 2,
  excludedEvaluations: 0,
  items: [],
  notes: [],
  summary: null,
  executionMs: 2,
  nextCursor: null,
};
describe('Analytics interaction', () => {
  let page: AnalyticsPage;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    });
    page = TestBed.runInInjectionContext(() => new AnalyticsPage());
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('uses history cursors without combining them with offset and preserves applied filters', () => {
    page.choose('M15');
    page.form.patchValue({ correlativo: 'a'.repeat(32), entryYear: 2024 });
    page.run();
    const first = http.expectOne((r) => r.url.endsWith('/applicant-history'));
    expect(first.request.params.get('entryYear')).toBe('2024');
    first.flush({ ...empty, nextCursor: 'opaque', items: [] });
    page.form.controls.entryYear.setValue(2020);
    page.next();
    const next = http.expectOne((r) => r.url.endsWith('/applicant-history'));
    expect(next.request.params.get('cursor')).toBe('opaque');
    expect(next.request.params.has('offset')).toBe(false);
    expect(next.request.params.get('entryYear')).toBe('2024');
    next.flush(empty);
  });
  it('rejects invalid ranges before HTTP and exposes the summary staleness without a write', () => {
    page.choose('M05');
    page.form.patchValue({ minAge: 20, maxAge: 16 });
    page.run();
    expect(page.validation()).toContain('rangos');
    http.expectNone((r) => r.url.startsWith('/api/'));
    page.choose('M06');
    page.run();
    const r = http.expectOne((req) => req.url.endsWith('/career-summary'));
    expect(r.request.method).toBe('GET');
    expect(r.request.params.has('entryYear')).toBe(false);
    r.flush({
      ...empty,
      summary: {
        generatedAt: '2026-10-01T00:00:00Z',
        sourceEvaluationCount: 1,
        sourceSnapshot: 's',
        refreshRequired: true,
      },
    });
    expect(page.metrics()?.summary?.refreshRequired).toBe(true);
    http.expectNone((req) => req.method !== 'GET');
  });
  it('clears obsolete results on selection and handles HTTP failure with retry', () => {
    page.choose('M04');
    page.run();
    http
      .expectOne((r) => r.url.endsWith('/approval-rate-by-subject'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.error()).toContain('MongoDB');
    expect(page.loading()).toBe(false);
    page.fetch(0);
    http
      .expectOne((r) => r.url.endsWith('/approval-rate-by-subject'))
      .flush({ ...empty, items: [] });
    expect(page.error()).toBe('');
    page.choose('M11');
    expect(page.page()).toBeNull();
    page.run();
    expect(page.validation()).toBeTruthy();
  });
});
