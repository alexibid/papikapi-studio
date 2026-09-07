import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./ui/pages/studio/studio.page').then((m) => m.StudioPage),
  },
  {
    path: 'lab',
    loadComponent: () => import('./ui/pages/lab/lab.page').then((m) => m.LabPage),
  },
];
