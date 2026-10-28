import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardPage } from './dashboard-page';
import { MetricRow } from '../../core/analysis.models';
describe('Dashboard indicators', () => {
  it('weights approval by known evaluation outcomes instead of averaging group percentages', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const page = TestBed.runInInjectionContext(() => new DashboardPage());
    page.annual.set([
      {
        group: { entryYear: 2023 },
        evaluationCount: 1000,
        knownOutcomeCount: 1000,
        approvedCount: 90,
      },
      { group: { entryYear: 2024 }, evaluationCount: 20, knownOutcomeCount: 10, approvedCount: 10 },
    ] as MetricRow[]);
    expect(page.totals().count).toBe(1020);
    expect(page.totals().approved).toBe(100);
    expect(page.totals().rate).toBeCloseTo(10000 / 1010);
    expect(page.totals().cycles).toBe(2);
    page.annual.set([]);
    expect(page.totals().rate).toBeNull();
    expect(page.totals().count).toBe(0);
  });
});
