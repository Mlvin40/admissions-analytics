import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { AnalysisApi, requestError } from '../../core/analysis-api.service';
import { Params, SearchPage as SearchResults } from '../../core/analysis.models';
import { DimensionPicker } from '../../shared/dimension-picker';
import { HistoryResults } from '../../shared/history-results';
import { Pagination } from '../../shared/pagination';
import { RequestState } from '../../shared/request-state';
@Component({
  selector: 'app-search-page',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MessageModule,
    DimensionPicker,
    HistoryResults,
    Pagination,
    RequestState,
  ],
  templateUrl: './search-page.html',
})
export class SearchPage {
  private readonly api = inject(AnalysisApi);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;
  private applied: Params = {};
  readonly loading = signal(false);
  readonly error = signal('');
  readonly validation = signal('');
  readonly result = signal<SearchResults | null>(null);
  readonly offset = signal(0);
  readonly form = new FormGroup({
    correlativo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(4096)],
    }),
    entryYear: new FormControl<number | null>(null, [
      Validators.min(1),
      Validators.max(9999),
      Validators.pattern(/^\d+$/),
    ]),
    careerKey: new FormControl<string | null>(null),
    subjectKey: new FormControl<string | null>(null),
    departmentKey: new FormControl<string | null>(null),
    municipalityKey: new FormControl<string | null>(null),
    institutionTypeKey: new FormControl<string | null>(null),
    limit: new FormControl(25, { nonNullable: true }),
  });
  readonly limits = [10, 25, 50, 100].map((value) => ({ label: String(value), value }));
  search() {
    this.validation.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.validation.set(
        'Introduce un ciclo entero entre 1 y 9999 y un identificador de hasta 4096 caracteres.',
      );
      return;
    }
    this.applied = { ...this.form.getRawValue() };
    this.fetch(0);
  }
  fetch(offset: number) {
    this.request?.unsubscribe();
    this.offset.set(offset);
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    this.request = this.api
      .search({ ...this.applied, offset })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: (e) => {
          this.loading.set(false);
          this.error.set(requestError(e, 'MongoDB'));
        },
      });
  }
  previous() {
    this.fetch(Math.max(0, this.offset() - Number(this.applied['limit'] ?? 25)));
  }
  next() {
    this.fetch(this.offset() + Number(this.applied['limit'] ?? 25));
  }
  caption() {
    const r = this.result();
    return r
      ? `${r.total.toLocaleString('es-GT')} evaluaciones · página ${Math.floor(r.offset / r.limit) + 1}`
      : '';
  }
}
