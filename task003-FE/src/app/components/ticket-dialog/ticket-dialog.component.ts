import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface TicketRevision {
  activityId: string;
  issueId: string;
  columnType: string;
  oldValue: string | null;
  newValue: string | null;
  createdDate: string;
  authoredBy: string;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-ticket-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './ticket-dialog.component.html',
  styleUrls: ['./ticket-dialog.component.scss'],
})
export class TicketDialogComponent implements OnInit {
  revisionHistory: TicketRevision[] = [];
  loading = false;
  error = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<TicketDialogComponent>,
    private http: HttpClient
  ) {
    this.dialogRef.updateSize('800px', '600px');
  }

  ngOnInit() {
    this.fetchRevisionHistory();
  }

  private fetchRevisionHistory() {
    this.loading = true;
    console.log('Fetching revision history for ticket:', this.data.airtableId);

    const cookiesFetched = localStorage.getItem('cookiesFetched') === 'true';
    console.log('cookies', cookiesFetched);

    if (cookiesFetched === true) {
      console.log('On fetched');
      // Skip cookies fetch if already done
      this.fetchHistory();
    } else {
      // First time - fetch cookies then history
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
            localStorage.setItem('cookiesFetched', 'true');
            return this.http.get<any>(
              `${environment.apiUrl}/tickets/${this.data.airtableId}/history`,
              { withCredentials: true }
            );
          }),
          catchError((error) => {
            console.error('Error:', error);
            return of({
              success: false,
              error: error.message || 'Failed to fetch history',
            });
          })
        )
        .subscribe(this.handleHistoryResponse.bind(this));
    }
  }

  private fetchHistory() {
    this.http
      .get<any>(
        `${environment.apiUrl}/tickets/${this.data.airtableId}/history`,
        { withCredentials: true }
      )
      .subscribe(this.handleHistoryResponse.bind(this));
  }

  private handleHistoryResponse(response: any) {
    console.log('Revision history response:', response);
    if (response.success && response.revisions) {
      this.revisionHistory = response.revisions;
    } else {
      this.error = response.error || 'Failed to fetch revision history';
    }
    this.loading = false;
  }
}
