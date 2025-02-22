import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class MfaService {
  constructor(private http: HttpClient) {}

  submitMfaCode(code: string): Observable<any> {
    return this.http.post(
      `${environment.apiUrl}/auth/mfa`,
      { code },
      {
        withCredentials: true,
      }
    );
  }
}
