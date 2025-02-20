import { ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { AirtableService } from './services/airtable.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    AirtableService,
    // ... other providers
  ],
};
