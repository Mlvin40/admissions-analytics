import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { EMPTY, expand, reduce, timeout } from 'rxjs';
import {
  AnalyticsPage,
  DimensionName,
  GraphPage,
  MetricRow,
  OptionsPage,
  Params,
  SearchPage,
  SummaryRefreshResult,
} from './analysis.models';

export function httpParams(values: Params): HttpParams {
  let params = new HttpParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '')
      params = params.set(key, String(value));
  });
  return params;
}
export function requestError(error: unknown, motor = 'la API'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 400)
      return 'Revisa los filtros, el identificador completo y los límites de la consulta.';
    if (error.status === 0)
      return 'No se pudo conectar con la API. Comprueba la conexión y vuelve a intentarlo.';
    if (error.status === 503)
      return `No se pudo consultar ${motor}. Vuelve a intentarlo en unos momentos.`;
    if (error.status === 404) return 'El recurso solicitado no está disponible.';
    if (error.status >= 500)
      return 'El servicio no pudo completar la consulta. Vuelve a intentarlo.';
    if (error.status === 200)
      return 'La respuesta recibida no se pudo interpretar. Vuelve a intentarlo.';
  }
  return 'La consulta no pudo completarse a tiempo. Puedes acotar la búsqueda o volver a intentarlo.';
}
@Injectable({ providedIn: 'root' })
export class AnalysisApi {
  private readonly http = inject(HttpClient);
  analytics<T>(path: string, params: Params = {}) {
    return this.http
      .get<AnalyticsPage<T>>('/api/analytics/' + path, { params: httpParams(params) })
      .pipe(timeout(25000));
  }
  refreshCareerSummary() {
    return this.http
      .post<SummaryRefreshResult>('/api/analytics/career-summary/refresh', null)
      .pipe(timeout(90000));
  }
  graph<T>(path: string, params: Params) {
    return this.http
      .get<GraphPage<T>>('/api/graph/' + path, { params: httpParams(params) })
      .pipe(timeout(25000));
  }
  search(params: Params) {
    return this.http
      .get<SearchPage>('/api/search/evaluations', { params: httpParams(params) })
      .pipe(timeout(25000));
  }
  options(dimension: DimensionName, params: Params = {}) {
    return this.http
      .get<OptionsPage>('/api/search/options', { params: httpParams({ dimension, ...params }) })
      .pipe(timeout(15000));
  }
  completeMetrics(path: string) {
    return this.analytics<MetricRow>(path, { limit: 100 }).pipe(
      expand((page) =>
        page.offset + page.items.length < page.total && page.items.length > 0
          ? this.analytics<MetricRow>(path, { offset: page.offset + page.items.length, limit: 100 })
          : EMPTY,
      ),
      reduce((rows: MetricRow[], page) => rows.concat(page.items), []),
    );
  }
}
