import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import cytoscape, { Core, ElementDefinition, StylesheetJson } from 'cytoscape';
import { GraphData, GraphEdge, GraphNode } from '../../core/analysis.models';

@Component({
  selector: 'app-graph-canvas',
  imports: [ButtonModule, MessageModule],
  template: ` <div class="graph-toolbar">
      <div class="graph-legend">
        <span><i class="applicant-dot"></i>Aspirante</span
        ><span><i class="evaluation-dot"></i>Evaluación</span
        ><span><i class="municipality-dot"></i>Municipio</span>
      </div>
      <div class="actions">
        <p-button label="Acercar" severity="secondary" (onClick)="zoom(1.3)" /><p-button
          label="Alejar"
          severity="secondary"
          (onClick)="zoom(1 / 1.3)"
        /><p-button label="Ajustar vista" severity="secondary" (onClick)="fit()" />
      </div>
    </div>
    <p class="secondary" id="graph-help">
      Arrastra para mover; usa la rueda para zoom. Con el área enfocada: + / −, flechas y 0 para
      ajustar. Selecciona nodos o aristas para ver propiedades.
    </p>
    <p class="secondary">
      {{ data().nodes.length }} nodos · {{ data().edges.length }} aristas. Línea continua: realizó
      evaluación. Línea discontinua: procedencia municipal.
    </p>
    @if (renderError()) {
      <p-message severity="error"
        >No se pudo dibujar el grafo. Puedes consultar los elementos en la lista
        accesible.</p-message
      ><p-button label="Reintentar visualización" (onClick)="draw(data())" />
    }
    <div class="graph-layout">
      <div
        #canvas
        class="graph-canvas"
        role="application"
        aria-label="Grafo de procedencia municipal"
        aria-describedby="graph-help"
        tabindex="0"
        (keydown)="onKey($event)"
      ></div>
      <aside class="graph-inspector" aria-live="polite">
        <h3>Elemento seleccionado</h3>
        @if (selectedNode(); as node) {
          <p class="unit-label">{{ typeLabel(node.label) }}</p>
          <p class="identifier">
            <strong>{{ node.key }}</strong>
          </p>
          <dl class="record-details">
            @for (item of properties(node); track item.label) {
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            }
          </dl>
        } @else if (selectedEdge(); as edge) {
          <p>
            {{ edge.type === 'TOOK' ? 'Realizó una evaluación' : 'Procedencia de institución' }}
          </p>
          <dl class="record-details">
            <dt>Desde</dt>
            <dd class="identifier">{{ edge.source }}</dd>
            <dt>Hacia</dt>
            <dd class="identifier">{{ edge.target }}</dd>
            <dt>Relación</dt>
            <dd>{{ edge.type }}</dd>
          </dl>
        } @else {
          <p class="secondary">
            Selecciona un nodo o una arista. La procedencia compartida no implica misma escuela ni
            relación personal.
          </p>
        }
      </aside>
    </div>
    <details>
      <summary>Lista accesible de nodos y aristas</summary>
      <div class="node-list">
        @for (node of data().nodes; track node.id) {
          <button type="button" (click)="selectNode(node)">
            {{ typeLabel(node.label) }} ·
            {{ node.properties.name ?? node.properties.correlativo_aspirante ?? node.key }}
          </button>
        }
      </div>
      <div class="node-list">
        @for (edge of data().edges; track edge.id) {
          <button type="button" (click)="selectEdge(edge)">
            {{ edge.type }} · {{ edge.source }} → {{ edge.target }}
          </button>
        }
      </div>
    </details>`,
  styleUrl: './graph-canvas.css',
})
export class GraphCanvas implements AfterViewInit, OnDestroy {
  readonly data = input.required<GraphData>();
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLDivElement>;
  readonly selectedNode = signal<GraphNode | null>(null);
  readonly selectedEdge = signal<GraphEdge | null>(null);
  readonly renderError = signal(false);
  private cy?: Core;
  private observer?: ResizeObserver;
  constructor() {
    effect(() => {
      const data = this.data();
      if (this.cy) this.draw(data);
    });
  }
  ngAfterViewInit() {
    this.draw(this.data());
    this.observer = new ResizeObserver(() => {
      this.cy?.resize();
      this.fit();
    });
    this.observer.observe(this.canvas.nativeElement);
  }
  draw(data: GraphData) {
    this.cy?.destroy();
    this.cy = undefined;
    this.selectedNode.set(null);
    this.selectedEdge.set(null);
    this.renderError.set(false);
    try {
      if (data.nodes.length > 125 || data.edges.length > 100)
        throw new Error('Graph exceeds the response contract');
      const ids = new Set(data.nodes.map((n) => n.id));
      if (
        ids.size !== data.nodes.length ||
        data.edges.some((e) => !ids.has(e.source) || !ids.has(e.target))
      )
        throw new Error('Invalid graph endpoints');
      const elements: ElementDefinition[] = [
        ...data.nodes.map((n) => ({ data: { id: n.id, label: this.caption(n), type: n.label } })),
        ...data.edges.map((e) => ({
          data: { id: e.id, source: e.source, target: e.target, type: e.type },
        })),
      ];
      const style: StylesheetJson = [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            width: 28,
            height: 28,
            'font-size': 12,
            color: '#111827',
            'text-valign': 'bottom',
            'text-margin-y': 7,
            'text-wrap': 'wrap',
            'text-max-width': '110px',
            'background-color': '#00ACAC',
            'border-width': 2,
            'border-color': '#FFFFFF',
          },
        },
        {
          selector: 'node[type="Evaluation"]',
          style: { 'background-color': '#0284C7', shape: 'round-rectangle' },
        },
        {
          selector: 'node[type="Municipality"]',
          style: { 'background-color': '#16A34A', shape: 'diamond', width: 40, height: 40 },
        },
        {
          selector: 'edge',
          style: {
            width: 1.5,
            'line-color': '#464545',
            'target-arrow-color': '#464545',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
        { selector: 'edge[type="FROM_MUNICIPALITY"]', style: { 'line-style': 'dashed' } },
        {
          selector: ':selected',
          style: {
            'border-color': '#111827',
            'border-width': 4,
            'line-color': '#00ACAC',
            'target-arrow-color': '#00ACAC',
          },
        },
      ];
      this.cy = cytoscape({
        container: this.canvas.nativeElement,
        elements,
        style,
        minZoom: 0.1,
        maxZoom: 4,
        layout: {
          name: 'cose',
          animate: false,
          nodeDimensionsIncludeLabels: true,
          padding: 35,
          numIter: 400,
          idealEdgeLength: () => 100,
          nodeRepulsion: () => 12000,
        },
      });
      this.cy.on('tap', 'node', (event) => {
        const node = data.nodes.find((n) => n.id === event.target.id());
        if (node) this.selectNode(node);
      });
      this.cy.on('tap', 'edge', (event) => {
        const edge = data.edges.find((e) => e.id === event.target.id());
        if (edge) this.selectEdge(edge);
      });
    } catch {
      this.renderError.set(true);
    }
  }
  private caption(node: GraphNode) {
    return node.label === 'Applicant'
      ? 'Aspirante ' + (node.properties.correlativo_aspirante ?? node.key).slice(0, 7) + '…'
      : node.label === 'Evaluation'
        ? 'Evaluación · op. ' + (node.properties.opportunity ?? '?')
        : (node.properties.name ?? 'Municipio');
  }
  typeLabel(label: string) {
    return (
      (
        { Applicant: 'Aspirante', Evaluation: 'Evaluación', Municipality: 'Municipio' } as Record<
          string,
          string
        >
      )[label] ?? label
    );
  }
  properties(node: GraphNode) {
    const p = node.properties;
    return [
      { label: 'Nombre observado', value: p.name },
      { label: 'Texto de origen', value: p.sourceValue },
      { label: 'Correlativo completo', value: p.correlativo_aspirante },
      { label: 'Formato', value: p.identityScheme },
      { label: 'Ciclo de ingreso', value: p.entryYear },
      { label: 'Asignación', value: p.assignmentDate },
      { label: 'Oportunidad observada', value: p.opportunity },
      { label: 'Resultado', value: p.passed === null ? null : p.passed ? 'Aprobada' : 'Reprobada' },
      { label: 'Edad al ingreso', value: p.entryAge },
    ].filter((v) => v.value !== null);
  }
  selectNode(node: GraphNode) {
    this.selectedNode.set(node);
    this.selectedEdge.set(null);
    this.cy?.elements().unselect();
    this.cy?.getElementById(node.id).select();
  }
  selectEdge(edge: GraphEdge) {
    this.selectedEdge.set(edge);
    this.selectedNode.set(null);
    this.cy?.elements().unselect();
    this.cy?.getElementById(edge.id).select();
  }
  zoom(factor: number) {
    if (this.cy)
      this.cy.zoom({
        level: this.cy.zoom() * factor,
        renderedPosition: {
          x: this.canvas.nativeElement.clientWidth / 2,
          y: this.canvas.nativeElement.clientHeight / 2,
        },
      });
  }
  fit() {
    this.cy?.fit(undefined, 35);
  }
  onKey(event: KeyboardEvent) {
    if (
      ['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === '0') this.fit();
      else if (['+', '='].includes(event.key)) this.zoom(1.2);
      else if (event.key === '-') this.zoom(1 / 1.2);
      else
        this.cy?.panBy({
          x: event.key === 'ArrowLeft' ? -25 : event.key === 'ArrowRight' ? 25 : 0,
          y: event.key === 'ArrowUp' ? -25 : event.key === 'ArrowDown' ? 25 : 0,
        });
    }
  }
  ngOnDestroy() {
    this.observer?.disconnect();
    this.cy?.destroy();
  }
}
