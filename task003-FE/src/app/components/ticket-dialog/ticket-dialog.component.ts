import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialog,
} from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { switchMap, catchError } from 'rxjs/operators';
import { of, firstValueFrom } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MFADialogComponent } from '../mfa-dialog/mfa-dialog.component';

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

interface CookieResponse {
  status?: string;
  success?: boolean;
  message?: string;
  type?: string;
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
    private dialog: MatDialog,
    private http: HttpClient
  ) {
    this.dialogRef.updateSize('800px', '600px');
  }

  ngOnInit() {
    this.fetchTicketHistory();
  }

  async fetchTicketHistory() {
    try {
      this.loading = true;
      console.log('Fetching history for ticket:', this.data.airtableId);

      const cookiesTimestamp = localStorage.getItem('cookiesTimestamp');
      const cookiesValid =
        cookiesTimestamp && Date.now() - parseInt(cookiesTimestamp) < 3600000; // 1 hour validity

      if (!cookiesValid) {
        const cookieResponse = await firstValueFrom<CookieResponse>(
          this.http.post<CookieResponse>(
            `${environment.apiUrl}/airtable/cookies`,
            {},
            { withCredentials: true }
          )
        );

        if (cookieResponse.status === 'MFA_REQUIRED') {
          const mfaCode = await this.showMFADialog();

          if (mfaCode) {
            const mfaResponse = await firstValueFrom<CookieResponse>(
              this.http.post<CookieResponse>(
                `${environment.apiUrl}/airtable/mfa`,
                { mfaCode },
                { withCredentials: true }
              )
            );

            if (!mfaResponse.success) {
              throw new Error('MFA verification failed');
            }

            localStorage.setItem('cookiesTimestamp', Date.now().toString());
          } else {
            throw new Error('MFA cancelled');
          }
        } else if (cookieResponse.success) {
          localStorage.setItem('cookiesTimestamp', Date.now().toString());
        }
      }

      const historyResponse = await firstValueFrom(
        this.http.get<any>(
          `${environment.apiUrl}/tickets/${this.data.airtableId}/history`,
          { withCredentials: true }
        )
      );

      this.handleHistoryResponse(historyResponse);
    } catch (error: any) {
      console.error('Error in fetch history:', error);
      this.handleHistoryResponse({
        success: false,
        error: error.message || 'Failed to fetch history',
      });
    } finally {
      this.loading = false;
    }
  }

  private async showMFADialog(): Promise<string | null> {
    const dialogRef = this.dialog.open(MFADialogComponent, {
      width: '400px',
      disableClose: true,
      data: {
        title: 'Enter Authentication Code',
        message: 'Please enter the code from your authenticator app',
      },
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private handleHistoryResponse(response: any) {
    console.log('Revision history response:', response);
    if (response.success && response.revisions) {
      this.revisionHistory = response.revisions;
    } else {
      this.error = response.error || 'Failed to fetch revision history';
    }
  }
}
