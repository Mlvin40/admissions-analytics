import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { GraphPage } from './graph-page';
describe('Graph filters and bounded responses', () => {
  let page: GraphPage;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    });
    page = TestBed.runInInjectionContext(() => new GraphPage());
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('requires exact graph identity and sends only supported N05 filters', () => {
    page.choose('N05');
    page.form.controls.entryYear.setValue(2024);
    page.run();
    expect(page.validation()).toBeTruthy();
    http.expectNone((r) => r.url.startsWith('/api/'));
    page.form.patchValue({
      applicantKey: 'full32:' + 'a'.repeat(32),
      municipalityKey: 'b'.repeat(64),
      limit: 5,
    });
    page.run();
    const r = http.expectOne((req) => req.url.endsWith('/municipality-peers'));
    expect(r.request.params.get('municipalityKey')).toBe('b'.repeat(64));
    expect(r.request.params.has('departmentKey')).toBe(false);
    expect(r.request.params.get('limit')).toBe('5');
    r.flush({
      query: 'N05',
      unit: 'OBSERVED_PATHS',
      items: [],
      graph: { nodes: [], edges: [] },
      offset: 0,
      limit: 5,
      hasMore: false,
      notes: [],
      executionMs: 1,
      databaseMs: 1,
    });
    expect(page.page()?.graph?.nodes).toEqual([]);
  });
  it('keeps Neo4j connection errors controlled', () => {
    page.choose('N02');
    page.form.controls.entryYear.setValue(2024);
    page.run();
    http
      .expectOne((r) => r.url.endsWith('/approval-by-subject-career'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.error()).toContain('Neo4j');
    expect(page.loading()).toBe(false);
  });
  it('releases required identity validation when leaving an applicant query', () => {
    page.choose('N01');
    expect(page.form.controls.applicantKey.hasError('required')).toBe(true);
    page.choose('N02');
    page.form.controls.entryYear.setValue(2024);
    expect(page.form.valid).toBe(true);
    page.run();
    http
      .expectOne((r) => r.url.endsWith('/approval-by-subject-career'))
      .flush({
        query: 'N02',
        items: [],
        offset: 0,
        limit: 25,
        hasMore: false,
        graph: null,
        notes: [],
        executionMs: 1,
        databaseMs: 1,
      });
    expect(page.validation()).toBe('');
  });
});
