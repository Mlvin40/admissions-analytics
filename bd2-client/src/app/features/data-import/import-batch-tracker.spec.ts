import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ImportBatchTracker, batchProgress } from './import-batch-tracker';
import { ImportResult } from './data-import.service';

function file(id: string, changes: Partial<ImportResult> = {}): ImportResult {
  return {
    id,
    fileName: `${id}.csv`,
    status: 'QUEUED',
    totalRead: 0,
    valid: 0,
    processed: 0,
    rejected: 0,
    pending: 0,
    mongoStored: 0,
    newEvaluations: 0,
    alreadyExisting: 0,
    duplicates: 0,
    elapsedMs: 0,
    attempt: 1,
    message: '',
    ...changes,
  };
}

describe('Import batch progress from backend operation IDs', () => {
  let tracker: ImportBatchTracker;
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    tracker = TestBed.inject(ImportBatchTracker);
    vi.advanceTimersByTime(0);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });
  const progress = () => batchProgress(tracker.batches()[0]);
  function poll(files: ImportResult[]) {
    vi.advanceTimersByTime(1500);
    for (const f of files) http.expectOne(`/api/imports/${f.id}`).flush(f);
  }
  it('tracks a running file with observed counts without estimating row completion', () => {
    tracker.start([file('a')]);
    poll([
      file('a', { status: 'RUNNING', totalRead: 250, processed: 200, rejected: 2, pending: 48 }),
    ]);
    expect(progress()).toMatchObject({
      percent: 0,
      completed: 0,
      total: 1,
      queued: 0,
      read: 250,
      processed: 200,
      rejected: 2,
      pending: 48,
    });
    expect(progress().running[0].id).toBe('a');
  });
  it('advances ten queued files from 0 to 100 percent and stops polling terminal jobs', () => {
    const files = Array.from({ length: 10 }, (_, i) => file(`year-${i}`));
    tracker.start(files);
    expect(progress()).toMatchObject({ percent: 0, queued: 10, total: 10 });
    for (let i = 0; i < files.length; i++) {
      poll(
        files
          .slice(i)
          .map((f, j) => ({
            ...f,
            status: j === 0 ? ('COMPLETED' as const) : ('QUEUED' as const),
            processed: j === 0 ? 10 : 0,
          })),
      );
      expect(progress().percent).toBe((i + 1) * 10);
      expect(progress().queued).toBe(9 - i);
    }
    expect(progress()).toMatchObject({ percent: 100, finished: true, processed: 100 });
    vi.advanceTimersByTime(1500);
    http.expectNone((r) => r.url.startsWith('/api/imports'));
  });
  it('reports rejected rows separately from partial operations', () => {
    tracker.start([file('a'), file('b')]);
    poll([
      file('a', { status: 'COMPLETED', processed: 2 }),
      file('b', { status: 'COMPLETED_WITH_REJECTIONS', processed: 3, rejected: 2 }),
    ]);
    expect(progress()).toMatchObject({
      percent: 100,
      finished: true,
      observations: true,
      processed: 5,
      rejected: 2,
      retryable: [],
    });
  });
  it.each(['FAILED', 'PARTIAL', 'INTERRUPTED'] as const)(
    'counts %s as terminal while retaining retries and pending counts',
    (status) => {
      tracker.start([file('a')]);
      poll([file('a', { status, pending: 4 })]);
      expect(progress()).toMatchObject({ percent: 100, finished: true, pending: 4 });
      expect(progress().retryable[0].status).toBe(status);
    },
  );
  it('distinguishes identical names by ID and never queries or totals historical imports', () => {
    tracker.start([
      file('new-a', { fileName: 'same.csv' }),
      file('new-b', { fileName: 'same.csv' }),
    ]);
    poll([
      file('new-a', { fileName: 'same.csv', status: 'COMPLETED', processed: 7 }),
      file('new-b', { fileName: 'same.csv', status: 'RUNNING', processed: 2 }),
    ]);
    expect(progress()).toMatchObject({ total: 2, percent: 50, processed: 9 });
    expect(tracker.batches()[0].files.map((f) => f.id)).toEqual(['new-a', 'new-b']);
    http.expectNone('/api/imports?offset=0&limit=50');
  });
  it('retains confirmed progress on connection errors and recovers automatically', () => {
    tracker.start([file('a', { status: 'RUNNING', processed: 3 })]);
    vi.advanceTimersByTime(1500);
    http.expectOne('/api/imports/a').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(progress()).toMatchObject({ percent: 0, processed: 3, finished: false });
    expect(tracker.batches()[0].unavailableIds).toEqual(['a']);
    poll([file('a', { status: 'COMPLETED', processed: 5 })]);
    expect(tracker.batches()[0].unavailableIds).toEqual([]);
    expect(progress().finished).toBe(true);
  });
  it('does not cancel slow reads every tick and recovers after timeout', () => {
    tracker.start([file('a')]);
    vi.advanceTimersByTime(1500);
    const slow = http.expectOne('/api/imports/a');
    vi.advanceTimersByTime(1500);
    expect(slow.cancelled).toBe(false);
    http.expectNone('/api/imports/a');
    vi.advanceTimersByTime(8500);
    expect(slow.cancelled).toBe(true);
    expect(tracker.batches()[0].unavailableIds).toEqual(['a']);
    vi.advanceTimersByTime(500);
    http.expectOne('/api/imports/a').flush(file('a', { status: 'COMPLETED' }));
    expect(progress().finished).toBe(true);
  });
  it('dismisses a notification once and keeps the frozen final summary', () => {
    tracker.start([file('a')]);
    poll([file('a', { status: 'COMPLETED', processed: 10 })]);
    tracker.dismiss(tracker.batches()[0].id);
    const batch = tracker.batches()[0];
    vi.advanceTimersByTime(15000);
    expect(tracker.batches()[0]).toBe(batch);
    expect(batch.notificationDismissed).toBe(true);
    expect(progress()).toMatchObject({ finished: true, processed: 10 });
  });
  it('keeps concurrent batches and retries separate when retries reuse operation IDs', () => {
    tracker.start([file('a', { status: 'PARTIAL', pending: 5 })]);
    tracker.dismiss(1);
    tracker.start([file('a', { attempt: 2 }), file('b')]);
    poll([
      file('a', { attempt: 2, status: 'COMPLETED', processed: 5 }),
      file('b', { status: 'RUNNING' }),
    ]);
    expect(batchProgress(tracker.batches()[1])).toMatchObject({ finished: true, pending: 5 });
    expect(tracker.batches()[1].notificationDismissed).toBe(true);
    expect(progress()).toMatchObject({ finished: false, percent: 50 });
  });
  it('ignores empty submissions', () => {
    tracker.start([]);
    expect(tracker.batches()).toEqual([]);
  });
});
