import { TestBed } from '@angular/core/testing';
import { GraphCanvas } from './graph-canvas';
import { GraphData } from '../../core/analysis.models';
vi.mock('cytoscape', () => ({
  default: vi.fn(() => {
    throw new Error('Renderer unavailable');
  }),
}));
describe('Graph renderer failure', () => {
  it('reports render failure and retains accessible properties instead of crashing', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    try {
      await TestBed.configureTestingModule({ imports: [GraphCanvas] }).compileComponents();
      const fixture = TestBed.createComponent(GraphCanvas);
      const data: GraphData = {
        nodes: [
          {
            id: 'Municipality:key',
            key: 'key',
            label: 'Municipality',
            properties: {
              name: 'Municipio de prueba',
              sourceValue: 'Municipio de prueba',
              departmentKey: null,
              correlativo_aspirante: null,
              identityScheme: null,
              entryYear: null,
              assignmentDate: null,
              opportunity: null,
              passed: null,
              entryAge: null,
            },
          },
        ],
        edges: [],
      };
      fixture.componentRef.setInput('data', data);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.componentInstance.renderError()).toBe(true);
      const element = fixture.nativeElement as HTMLElement;
      expect(element.textContent).toContain('No se pudo dibujar el grafo');
      expect(element.textContent).toContain('Municipio de prueba');
      fixture.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
