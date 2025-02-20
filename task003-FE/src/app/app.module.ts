// This file can be deleted as we're using standalone components

import { NgModule } from '@angular/core';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { HttpXsrfInterceptor } from './interceptors/http.interceptor';

@NgModule({
  // ...
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpXsrfInterceptor,
      multi: true,
    },
  ],
  // ...
})
export class AppModule {}
