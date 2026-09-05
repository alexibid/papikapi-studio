import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { I18N_CONFIG_TOKEN } from '@ibid/services';
import { appRoutes } from './app.routes';
import { STUDIO_I18N_CONFIG } from './i18n.config';
import { provideStudioTheme } from './theme.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    { provide: I18N_CONFIG_TOKEN, useValue: STUDIO_I18N_CONFIG },
    ...provideStudioTheme(),
  ],
};
