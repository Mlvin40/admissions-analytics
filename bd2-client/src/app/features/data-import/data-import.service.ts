import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export type ImportStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_REJECTIONS'
  | 'PARTIAL'
  | 'FAILED'
  | 'INTERRUPTED';
export interface ImportResult {
  id: string;
  fileName: string;
  status: ImportStatus;
  totalRead: number;
  valid: number;
  processed: number;
  rejected: number;
  pending: number;
  mongoStored: number;
  newEvaluations: number;
  alreadyExisting: number;
  duplicates: number;
  elapsedMs: number;
  attempt: number;
  message: string;
}
export interface Rejection {
  recordNumber: number;
  reason: string;
  values: string[];
}
export interface RejectionPage {
  items: Rejection[];
  total: number;
  offset: number;
  limit: number;
}

@Injectable({ providedIn: 'root' })
export class DataImportService {
  private readonly http = inject(HttpClient);
  upload(files: File[]) {
    const body = new FormData();
    files.forEach((file) => body.append('files', file, file.name));
    return this.http.post<ImportResult[]>('/api/imports', body);
  }
  list(offset = 0) {
    return this.http.get<ImportResult[]>('/api/imports', { params: { offset, limit: 50 } });
  }
  result(id: string) {
    return this.http.get<ImportResult>(`/api/imports/${encodeURIComponent(id)}`);
  }
  retry(id: string) {
    return this.http.post<ImportResult>(`/api/imports/${id}/retry`, {});
  }
  rejections(id: string, offset = 0) {
    return this.http.get<RejectionPage>(`/api/imports/${id}/rejections`, {
      params: { offset, limit: 25 },
    });
  }
}
