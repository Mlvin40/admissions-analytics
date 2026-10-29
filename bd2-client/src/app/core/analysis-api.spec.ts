import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AnalysisApi } from './analysis-api.service';
import { ANALYTICS_QUERIES } from '../features/analytics/query-catalog';
import { GRAPH_QUERIES } from '../features/graph-explorer/graph-catalog';

describe('Analysis read contracts', () => {
  let api: AnalysisApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AnalysisApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('generates the summary only through the explicit refresh POST', () => {
    let count: number | undefined;
    api.refreshCareerSummary().subscribe((result) => (count = result.careerCount));
    const request = http.expectOne('/api/analytics/career-summary/refresh');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ careerCount: 17, summary: { generatedAt: '2026-11-02T00:00:00Z' } });
    expect(count).toBe(17);
  });
  it('exposes all twenty MongoDB and five Neo4j contracts through relative GET URLs', () => {
    expect(ANALYTICS_QUERIES.map((q) => q.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => 'M' + String(i + 1).padStart(2, '0')),
    );
    for (const q of ANALYTICS_QUERIES) {
      api.analytics(q.path, { entryYear: 2024, limit: 25, careerKey: null }).subscribe();
      const r = http.expectOne((req) => req.url === '/api/analytics/' + q.path);
      expect(r.request.method).toBe('GET');
      expect(r.request.params.has('careerKey')).toBe(false);
      r.flush({ items: [] });
    }
    expect(GRAPH_QUERIES).toHaveLength(5);
    for (const q of GRAPH_QUERIES) {
      api.graph(q.path, { entryYear: 2024 }).subscribe();
      const r = http.expectOne('/api/graph/' + q.path + '?entryYear=2024');
      expect(r.request.method).toBe('GET');
      r.flush({ items: [] });
    }
  });
  it('collects complete grouped pages for dashboard indicators', () => {
    let result: unknown;
    api.completeMetrics('approval-evolution-by-entry-year').subscribe((rows) => (result = rows));
    http
      .expectOne('/api/analytics/approval-evolution-by-entry-year?limit=100')
      .flush({ offset: 0, total: 2, items: [{ evaluationCount: 10 }] });
    http
      .expectOne('/api/analytics/approval-evolution-by-entry-year?offset=1&limit=100')
      .flush({ offset: 1, total: 2, items: [{ evaluationCount: 20 }] });
    expect(result).toEqual([{ evaluationCount: 10 }, { evaluationCount: 20 }]);
  });
});
