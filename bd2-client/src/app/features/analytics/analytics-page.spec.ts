import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AnalyticsPage } from './analytics-page';
import { ANALYTICS_QUERIES } from './query-catalog';
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
const refreshed = {
  careerCount: 17,
  summary: {
    generatedAt: '2026-11-02T00:00:00Z',
    sourceEvaluationCount: 207622,
    sourceSnapshot: 'snapshot',
    refreshRequired: false,
  },
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
  it('reads M06 without generating automatically and restricts refresh to M06', () => {
    page.refreshSummary();
    http.expectNone((r) => r.method === 'POST');
    page.choose('M06');
    page.run();
    http.expectOne((r) => r.url.endsWith('/career-summary')).flush(empty);
    http.expectNone((r) => r.method === 'POST');
  });
  it('prevents duplicate generation and reloads the selected career after confirmation', () => {
    page.choose('M06');
    page.form.patchValue({ careerKey: 'a'.repeat(64), limit: 50, sort: 'age' });
    page.refreshSummary();
    page.refreshSummary();
    expect(page.refreshing()).toBe(true);
    expect(page.refreshNotice()).toBe('');
    const request = http.expectOne('/api/analytics/career-summary/refresh');
    expect(request.request.method).toBe('POST');
    http.expectNone((r) => r.method === 'GET');
    page.form.controls.careerKey.setValue('b'.repeat(64));
    request.flush(refreshed);
    expect(page.refreshing()).toBe(false);
    expect(page.refreshNotice()).toContain('correctamente');
    const read = http.expectOne((r) => r.url.endsWith('/career-summary'));
    expect(read.request.params.get('careerKey')).toBe('b'.repeat(64));
    expect(read.request.params.get('limit')).toBe('50');
    expect(read.request.params.get('sort')).toBe('age');
    expect(read.request.params.get('offset')).toBe('0');
    read.flush({ ...empty, summary: refreshed.summary });
    expect(page.metrics()?.summary?.generatedAt).toBe(refreshed.summary.generatedAt);
  });
  it('reports changed source without success and permits a manual retry', () => {
    page.choose('M06');
    page.refreshSummary();
    http
      .expectOne('/api/analytics/career-summary/refresh')
      .flush({}, { status: 409, statusText: 'Conflict' });
    expect(page.refreshing()).toBe(false);
    expect(page.refreshError()).toContain('origen cambiaron');
    expect(page.refreshNotice()).toBe('');
    http.expectNone((r) => r.method === 'GET');
    page.refreshSummary();
    expect(page.refreshError()).toBe('');
    http.expectOne('/api/analytics/career-summary/refresh').flush(refreshed);
    http.expectOne((r) => r.url.endsWith('/career-summary')).flush(empty);
    expect(page.refreshNotice()).toContain('correctamente');
  });
  it('handles generation failure without automatic retries or false confirmation', () => {
    page.choose('M06');
    page.refreshSummary();
    http
      .expectOne('/api/analytics/career-summary/refresh')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.refreshing()).toBe(false);
    expect(page.refreshError()).toContain('No se pudo confirmar');
    expect(page.refreshNotice()).toBe('');
    http.expectNone((r) => r.url.startsWith('/api/'));
    page.refreshSummary();
    http
      .expectOne('/api/analytics/career-summary/refresh')
      .flush({ ...refreshed, summary: { ...refreshed.summary, refreshRequired: true } });
    expect(page.refreshError()).toContain('No se confirmó');
    expect(page.refreshNotice()).toBe('');
    expect(page.refreshing()).toBe(false);
    http.expectNone((r) => r.method === 'GET');
  });
  it('does not replace another query with a late generation response', () => {
    page.choose('M06');
    page.refreshSummary();
    const refresh = http.expectOne('/api/analytics/career-summary/refresh');
    page.choose('M04');
    page.run();
    const read = http.expectOne((r) => r.url.endsWith('/approval-rate-by-subject'));
    read.flush({ ...empty, query: 'M04' });
    refresh.flush(refreshed);
    expect(page.queryId()).toBe('M04');
    expect(page.metrics()?.query).toBe('M04');
    expect(page.refreshing()).toBe(false);
    expect(page.refreshNotice()).toBe('');
    http.expectNone((r) => r.url.endsWith('/career-summary'));
  });
  it('preserves the read endpoints of the other nineteen queries', () => {
    for (const query of ANALYTICS_QUERIES.filter((q) => q.id !== 'M06')) {
      page.choose(query.id);
      if (query.history) page.form.controls.correlativo.setValue('a'.repeat(32));
      page.run();
      const request = http.expectOne(
        '/api/analytics/' +
          query.path +
          (query.history ? '?correlativo=' + 'a'.repeat(32) + '&limit=25' : '?limit=25&offset=0'),
      );
      expect(request.request.method).toBe('GET');
      request.flush({ ...empty, query: query.id });
    }
    http.expectNone((r) => r.method === 'POST');
  });
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
