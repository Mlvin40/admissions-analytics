import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchPage } from './search-page';
describe('Search criteria and empty responses', () => {
  it('keeps literal identities and applied filters across pages without writes', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const page = TestBed.runInInjectionContext(() => new SearchPage());
    const http = TestBed.inject(HttpTestingController);
    page.form.patchValue({ correlativo: 'abcdef123456', entryYear: 2024, limit: 10 });
    page.search();
    const first = http.expectOne((r) => r.url.endsWith('/evaluations'));
    expect(first.request.method).toBe('GET');
    expect(first.request.params.get('correlativo')).toBe('abcdef123456');
    first.flush({ items: [], total: 30, offset: 0, limit: 10 });
    page.form.controls.entryYear.setValue(2020);
    page.next();
    const next = http.expectOne((r) => r.url.endsWith('/evaluations'));
    expect(next.request.params.get('entryYear')).toBe('2024');
    expect(next.request.params.get('offset')).toBe('10');
    next.flush({ items: [], total: 0, offset: 10, limit: 10 });
    expect(page.result()?.items).toEqual([]);
    http.verify();
  });
});
