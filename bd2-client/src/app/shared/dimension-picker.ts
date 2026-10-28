import { Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { AnalysisApi } from '../core/analysis-api.service';
import { DimensionName, LookupOption } from '../core/analysis.models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dimension-picker',
  imports: [ReactiveFormsModule, AutoCompleteModule],
  template: `<label [for]="id()">{{ label() }}</label>
    <p-autocomplete
      [inputId]="id()"
      [formControl]="control"
      [suggestions]="suggestions()"
      optionLabel="label"
      [dropdown]="true"
      [forceSelection]="true"
      [showClear]="true"
      [minLength]="0"
      [delay]="300"
      appendTo="body"
      placeholder="Todas · escribe para buscar"
      emptyMessage="Sin coincidencias"
      [fluid]="true"
      (completeMethod)="search($event)"
      (onSelect)="valueChange.emit($event.value.key)"
      (onClear)="valueChange.emit(null)"
    />
    @if (error()) {
      <small class="field-error" role="status"
        >No se pudieron cargar las opciones. Vuelve a buscar.</small
      >
    }`,
})
export class DimensionPicker {
  readonly dimension = input.required<DimensionName>();
  readonly label = input.required<string>();
  readonly id = input.required<string>();
  readonly value = input<string | null>(null);
  readonly departmentKey = input<string | null>(null);
  readonly valueChange = output<string | null>();
  readonly suggestions = signal<LookupOption[]>([]);
  readonly error = signal(false);
  readonly control = new FormControl<LookupOption | string | null>(null);
  private readonly api = inject(AnalysisApi);
  private readonly destroy = inject(DestroyRef);
  private request?: Subscription;
  constructor() {
    effect((onCleanup) => {
      const key = this.value();
      const dimension = this.dimension();
      if (!key) {
        if (typeof this.control.value !== 'string')
          this.control.setValue(null, { emitEvent: false });
        return;
      }
      const subscription = this.api
        .options(dimension, { key })
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (page) => {
            if (page.items[0])
              this.control.setValue(this.decorate(page.items[0]), { emitEvent: false });
          },
          error: () => this.error.set(true),
        });
      onCleanup(() => subscription.unsubscribe());
    });
    this.control.valueChanges.pipe(takeUntilDestroyed(this.destroy)).subscribe((value) => {
      if (value === null || typeof value === 'string') this.valueChange.emit(null);
    });
  }
  private decorate(option: LookupOption): LookupOption {
    const name = (option.contextName ? option.contextName + ' · ' : '') + option.name;
    return {
      ...option,
      label:
        name +
        (option.sourceValue && option.sourceValue !== option.sourceValue.trim()
          ? ' · espacio en origen'
          : ''),
    };
  }
  search(event: AutoCompleteCompleteEvent): void {
    this.request?.unsubscribe();
    this.error.set(false);
    this.request = this.api
      .options(this.dimension(), {
        q: event.query,
        departmentKey: this.dimension() === 'municipality' ? this.departmentKey() : null,
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (page) => this.suggestions.set(page.items.map((o) => this.decorate(o))),
        error: () => {
          this.suggestions.set([]);
          this.error.set(true);
        },
      });
  }
}
