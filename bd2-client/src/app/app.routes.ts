import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Inicio · BD2 NoSQL',
    loadComponent: () => import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    path: 'analytics',
    title: 'Consultas MongoDB · BD2 NoSQL',
    loadComponent: () => import('./features/analytics/analytics-page').then((m) => m.AnalyticsPage),
  },
  {
    path: 'graph',
    title: 'Grafos Neo4j · BD2 NoSQL',
    loadComponent: () => import('./features/graph-explorer/graph-page').then((m) => m.GraphPage),
  },
  {
    path: 'search',
    title: 'Buscador · BD2 NoSQL',
    loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'status',
    title: 'Conexión · BD2 NoSQL',
    loadComponent: () => import('./features/status/status-page').then((m) => m.StatusPage),
  },
  {
    path: 'data-import',
    loadComponent: () =>
      import('./features/data-import/data-import-page').then((m) => m.DataImportPage),
  },
  { path: '**', redirectTo: '' },
];
