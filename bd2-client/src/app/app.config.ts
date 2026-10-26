import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';

const AppPreset = definePreset(Aura, {
  semantic: {
    primary: { 500: '#00ACAC', 600: '#008F8F', 700: '#008F8F' },
    colorScheme: {
      light: {
        primary: {
          color: '#00ACAC', hoverColor: '#008F8F', activeColor: '#008F8F',
          contrastColor: '#111827'
        }
      }
    }
  },
  components: {
    message: {
      colorScheme: {
        light: {
          success: { color: '#111827', borderColor: '#16A34A', background: '#FFFFFF' },
          error: { color: '#111827', borderColor: '#DC2626', background: '#FFFFFF' },
          info: { color: '#111827', borderColor: '#0284C7', background: '#FFFFFF' },
          secondary: { color: '#464545', borderColor: '#E2E8F0', background: '#F3F5F7' }
        }
      }
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    providePrimeNG({
      theme: {
        preset: AppPreset,
        options: { darkModeSelector: false }
      }
    })
  ]
};
