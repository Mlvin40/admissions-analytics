import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, throwError, timeout } from 'rxjs';

export type ConnectionState = 'UP' | 'DOWN' | 'NOT_CHECKED';
export type StatusTarget = 'all' | 'mongodb' | 'neo4j';
export interface StatusResponse {
  api: ConnectionState;
  mongodb: ConnectionState;
  neo4j: ConnectionState;
}

function isStatusResponse(value: unknown): value is StatusResponse {
  if (typeof value !== 'object' || value === null) return false;
  const states: readonly unknown[] = ['UP', 'DOWN', 'NOT_CHECKED'];
  return 'api' in value && 'mongodb' in value && 'neo4j' in value
    && states.includes(value.api) && states.includes(value.mongodb) && states.includes(value.neo4j);
}

@Injectable({ providedIn: 'root' })
export class StatusService {
  private readonly http = inject(HttpClient);

  check(target: StatusTarget): Observable<StatusResponse> {
    return this.http.get<StatusResponse>('/api/status', { params: { target } }).pipe(
      timeout(15000),
      // Un 503 conserva el estado de cada motor; los demás errores llegan a la pantalla
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 503) {
          const body: unknown = error.error;
          if (isStatusResponse(body)) return of(body);
        }
        return throwError(() => error);
      })
    );
  }
}
