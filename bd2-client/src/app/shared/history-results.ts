import { Component, input, ViewEncapsulation } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { EvaluationRecord } from '../core/analysis.models';
import { dimensionLabel } from './value-format';
@Component({
  selector: 'app-history-results',
  encapsulation: ViewEncapsulation.None,
  styleUrl: './history-results.css',
  imports: [TableModule, DatePipe, JsonPipe, RouterLink],
  template: ` <div
    class="table-scroll"
    tabindex="0"
    aria-label="Historial de evaluaciones, desplazamiento horizontal"
  >
    <p-table [value]="rows()" [tableStyle]="{ 'min-width': '55rem' }" size="small">
      <ng-template #header
        ><tr>
          <th>Identificador y ciclo</th>
          <th>Asignación</th>
          <th>Materia / carrera</th>
          <th>Oportunidad</th>
          <th>Resultado</th>
          <th>Explorar</th>
        </tr></ng-template
      >
      <ng-template #body let-row
        ><tr>
          <td>
            <code class="identifier">{{ identifier(row) }}</code
            ><br />Ciclo {{ row.entryYear ?? 'Sin registro' }}
            @if (details()) {
              <details>
                <summary>Información completa</summary>
                <dl class="record-details">
                  <dt>Evaluación</dt>
                  <dd class="identifier">{{ row.evaluationId }}</dd>
                  <dt>Formato del identificador</dt>
                  <dd>{{ row.applicant?.identityScheme ?? 'No informado' }}</dd>
                  <dt>Edad al ingreso</dt>
                  <dd>{{ row.entryAge ?? 'Sin registro utilizable' }}</dd>
                  <dt>Nacimiento</dt>
                  <dd>{{ row.birthYear ?? 'Sin registro' }}</dd>
                  <dt>Sexo registrado</dt>
                  <dd>{{ row.sex ?? 'Sin registro' }}</dd>
                  <dt>Departamento</dt>
                  <dd>{{ label(row.origin?.department) }}</dd>
                  <dt>Municipio</dt>
                  <dd>{{ label(row.origin?.municipality) }}</dd>
                  <dt>Institución</dt>
                  <dd>{{ label(row.origin?.institutionType) }}</dd>
                </dl>
                @if (row.qualityIssues?.length) {
                  <p>Advertencias del registro: {{ quality(row.qualityIssues) }}</p>
                }
                @for (source of row.sources ?? []; track $index) {
                  <details>
                    <summary>
                      Origen {{ source.fileYear ?? 'sin año' }} · registro {{ source.recordNumber }}
                    </summary>
                    <dl class="record-details">
                      <dt>SHA-256 del archivo</dt>
                      <dd class="identifier">{{ source.fileSha256 }}</dd>
                      <dt>Variante de encabezado</dt>
                      <dd>{{ source.schemaId }}</dd>
                    </dl>
                    <pre>{{ source.sourceValues | json }}</pre>
                  </details>
                }
              </details>
            }
          </td>
          <td>
            {{
              row.assignmentDate ? (row.assignmentDate | date: 'dd/MM/yyyy' : 'UTC') : 'Sin fecha'
            }}
          </td>
          <td>
            {{ label(row.subject) }}<br /><span class="secondary">{{ label(row.career) }}</span>
          </td>
          <td>{{ row.opportunity ?? 'Sin registro' }}</td>
          <td>
            <span
              class="outcome"
              [class.approved]="row.passed === true"
              [class.failed]="row.passed === false"
              >{{
                row.passed === true
                  ? 'Aprobada'
                  : row.passed === false
                    ? 'Reprobada'
                    : 'Desconocido'
              }}</span
            >
          </td>
          <td>
            <div class="row-links">
              <a
                [routerLink]="['/analytics']"
                [queryParams]="{ query: 'M15', correlativo: identifier(row) }"
                >Historial completo</a
              >
              <a
                [routerLink]="['/graph']"
                [queryParams]="{ query: 'N05', applicantKey: key(row), entryYear: row.entryYear }"
                >Ver relaciones</a
              >
            </div>
          </td>
        </tr></ng-template
      >
      <ng-template #emptymessage
        ><tr>
          <td colspan="6">No se encontraron evaluaciones con estos criterios.</td>
        </tr></ng-template
      >
    </p-table>
  </div>`,
})
export class HistoryResults {
  readonly rows = input<EvaluationRecord[]>([]);
  readonly details = input(false);
  readonly label = dimensionLabel;
  quality(issues: string[]): string {
    const labels: Record<string, string> = {
      FILE_YEAR_MISMATCH: 'El año del archivo difiere del ciclo de ingreso',
      MISSING_BIRTH_YEAR: 'Año de nacimiento ausente',
      INVALID_BIRTH_YEAR: 'Año de nacimiento no utilizable',
      AGE_OUTSIDE_POLICY: 'Edad fuera del criterio de validez',
      UNKNOWN_CAREER: 'Carrera no registrada',
      UNKNOWN_ORIGIN: 'Procedencia no registrada',
      UNKNOWN_INSTITUTION_TYPE: 'Tipo de institución no registrado',
      SOURCE_TEXT_POSSIBLY_TRUNCATED: 'Texto posiblemente truncado en el archivo',
      INVALID_ASSIGNMENT_DATE: 'Fecha de asignación inválida',
      INVALID_ENTRY_YEAR: 'Ciclo inválido',
      INVALID_OPPORTUNITY: 'Oportunidad inválida',
      UNKNOWN_OUTCOME: 'Resultado desconocido',
      UNKNOWN_SEX: 'Sexo no registrado',
      UNKNOWN_SUBJECT: 'Materia no registrada',
      UNRECOGNIZED_IDENTIFIER_FORMAT: 'Formato de identificador no reconocido',
    };
    return issues.map((issue) => labels[issue] ?? issue).join(' · ');
  }
  key(row: EvaluationRecord): string {
    return row.applicant?.key ?? row.applicantKey ?? '';
  }
  identifier(row: EvaluationRecord): string {
    const key = this.key(row);
    return row.applicant?.correlativo_aspirante ?? key.slice(key.indexOf(':') + 1);
  }
}
