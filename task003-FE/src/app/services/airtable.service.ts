import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AirtableService {
  private tokenSubject = new BehaviorSubject<string | null>(
    localStorage.getItem('airtableToken')
  );
  token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {}

  fetchAndStoreBases(): Observable<any> {
    const token = localStorage.getItem('airtableToken');
    if (!token) {
      throw new Error('No Airtable token found');
    }

    return this.http.post(
      `${environment.apiUrl}/airtable/sync-bases`,
      {},
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${token}`,
        }),
        withCredentials: true,
      }
    );
  }

  getUserBases(): Observable<any> {
    const token = localStorage.getItem('airtableToken');
    if (!token) {
      throw new Error('No Airtable token found');
    }

    return this.http.get(`${environment.apiUrl}/airtable/user-bases`, {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`,
      }),
      withCredentials: true,
    });
  }

  testSession(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/auth/test-session`, {
      withCredentials: true,
    });
  }

  whoami(): Observable<any> {
    const token = localStorage.getItem('airtableToken');
    return this.http.get(`${environment.apiUrl}/auth/whoami`, {
      headers: token
        ? new HttpHeaders({
            Authorization: `Bearer ${token}`,
          })
        : undefined,
      withCredentials: true,
    });
  }

  refreshToken(): Observable<any> {
    return this.http
      .post(
        `${environment.apiUrl}/airtable/refresh-token`,
        {},
        {
          withCredentials: true,
        }
      )
      .pipe(
        tap(() => {
          // After successful token refresh, fetch and store bases
          this.fetchAndStoreBases().subscribe({
            next: (response) =>
              console.log(
                'Successfully synced bases after token refresh:',
                response
              ),
            error: (error) =>
              console.error('Error syncing bases after token refresh:', error),
          });
        })
      );
  }

  disconnect(): Observable<any> {
    return this.http.post(
      `${environment.apiUrl}/airtable/disconnect`,
      {},
      {
        withCredentials: true,
      }
    );
  }

  syncTickets(baseId: string): Observable<any> {
    console.log('AirtableService: Initiating ticket sync for base:', baseId);
    const token = localStorage.getItem('airtableToken');
    if (!token) {
      console.error('AirtableService: No token found');
      throw new Error('No Airtable token found');
    }

    return this.http
      .post(
        `${environment.apiUrl}/airtable/bases/${baseId}/sync-tickets`,
        {},
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${token}`,
          }),
          withCredentials: true,
        }
      )
      .pipe(
        tap((response) =>
          console.log('AirtableService: Sync response:', response)
        ),
        catchError((error) => {
          console.error('AirtableService: Sync error:', error);
          throw error;
        })
      );
  }

  getTickets(baseId: string, queryParams: string): Observable<any> {
    const token = localStorage.getItem('airtableToken');
    if (!token) {
      throw new Error('No Airtable token found');
    }

    return this.http.get(
      `${environment.apiUrl}/airtable/bases/${baseId}/tickets?${queryParams}`,
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${token}`,
        }),
        withCredentials: true,
      }
    );
  }

  setToken(token: string) {
    localStorage.setItem('airtableToken', token);
    this.tokenSubject.next(token);
  }
}
