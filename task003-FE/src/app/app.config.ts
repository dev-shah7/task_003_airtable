import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { AirtableService } from './services/airtable.service';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideAnimations } from '@angular/platform-browser/animations';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    AirtableService,
    provideAnimationsAsync(),
    provideAnimationsAsync(),
    provideAnimations(),
    // ... other providers
  ],
};
