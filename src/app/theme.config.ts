import {
  EnvironmentProviders,
  Provider,
  inject,
  provideEnvironmentInitializer,
} from '@angular/core';
import { THEME_CONFIG_TOKEN, ThemeConfig, ThemeService } from '@ibid/services';

export const STUDIO_THEME_CONFIG: ThemeConfig = {
  themes: [{ id: 'papikapi', label: 'Papikapi' }],
  defaultTheme: 'papikapi',
};

const wearConfiguredTheme = (): void => {
  inject(ThemeService);
};

export function provideStudioTheme(): readonly (Provider | EnvironmentProviders)[] {
  return [
    { provide: THEME_CONFIG_TOKEN, useValue: STUDIO_THEME_CONFIG },
    provideEnvironmentInitializer(wearConfiguredTheme),
  ];
}
