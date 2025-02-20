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
  revisionHistory: any[] = [];
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
    console.log('Fetching revision history for ticket:', this.data.airtableId);

    // Get cookies first
    this.http
      .get<any>(`${environment.apiUrl}/cookies`, {
        withCredentials: true,
      })
      .pipe(
        switchMap((cookieResponse) => {
          console.log('Cookie response:', cookieResponse);

          if (!cookieResponse.success) {
            throw new Error('Failed to get cookies: ' + cookieResponse.error);
          }

          // Now fetch the revision history
          return this.http.get<any>(
            `${environment.apiUrl}/tickets/${this.data.airtableId}/history`,
            {
              withCredentials: true,
            }
          );
        }),
        catchError((error) => {
          console.error('Error fetching history:', error);
          return of({
            success: false,
            error: error.message || 'Failed to fetch revision history',
          });
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Revision history response:', response);
          if (response.success && response.revisionHistory) {
            this.revisionHistory = response.revisionHistory;
          } else {
            this.error = response.error || 'Failed to fetch revision history';
          }
          this.loading = false;
        },
        error: (error) => {
          console.error('Subscription error:', error);
          this.error = 'Failed to fetch revision history';
          this.loading = false;
        },
      });
  }
}
