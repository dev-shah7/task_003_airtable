import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

interface RevisionChange {
  field: string;
  oldValue: string;
  newValue: string;
}

interface RevisionHistory {
  timestamp: string;
  user: string;
  changes: RevisionChange[];
}

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './ticket-dialog.component.html',
  styleUrls: ['./ticket-dialog.component.scss'],
})
export class TicketDialogComponent implements OnInit {
  revisionHistory: RevisionHistory[] = [];
  loading = false;
  error = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private http: HttpClient
  ) {}

  ngOnInit() {
    this.fetchRevisionHistory();
  }

  private fetchRevisionHistory() {
    this.loading = true;

    // First get cookies
    this.http
      .get<any>(`${environment.apiUrl}/cookies`, {
        withCredentials: true,
        headers: {
          Accept: 'application/json',
        },
      })
      .pipe(
        switchMap((cookieResponse) => {
          console.log('Cookie response:', cookieResponse);
          if (!cookieResponse.success) {
            throw new Error('Failed to get cookies');
          }

          // Extract cookies from response
          const cookies = cookieResponse.debug;

          // Then use cookies to fetch history
          return this.http.get<any>(
            `${environment.apiUrl}/tickets/${this.data.airtableId}/history`,
            {
              withCredentials: true,
              headers: {
                Accept: 'application/json',
                Cookie: `__Host-airtable-session=${cookies.sessionCookie}; __Host-airtable-session.sig=${cookies.sessionSigCookie}`,
              },
            }
          );
        }),
        catchError((error) => {
          console.error('Error with full details:', error);
          return of({
            success: false,
            error: 'Failed to fetch revision history',
          });
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.revisionHistory = response.revisionHistory;
          } else {
            this.error = response.error || 'Failed to fetch revision history';
          }
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to fetch revision history';
          this.loading = false;
          console.error('Error:', error);
        },
      });
  }
}
