import { Component } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-mobile-navigation',
  imports: [MenuModule, ButtonModule],
  template: `
    <p-menu #menu [model]="items" [popup]="true" appendTo="body" />
    <p-button
      label="Menú"
      severity="secondary"
      ariaLabel="Abrir navegación"
      (onClick)="menu.toggle($event)"
    />
  `,
})
export class MobileNavigation {
  readonly items: MenuItem[] = [
    { label: 'Inicio', routerLink: '/' },
    { label: 'Consultas MongoDB', routerLink: '/analytics' },
    { label: 'Grafos Neo4j', routerLink: '/graph' },
    { label: 'Buscador', routerLink: '/search' },
    { label: 'Carga CSV', routerLink: '/data-import' },
  ];
}
