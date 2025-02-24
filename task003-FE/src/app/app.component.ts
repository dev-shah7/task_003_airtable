import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { TicketsComponent } from './components/tickets/tickets.component';
import { AirtableService } from './services/airtable.service';
import { Subscription, Observable } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

interface TicketResponse {
  success: boolean;
  data: any[];
  pagination: {
    offset: string | null;
    hasMore: boolean;
    pageSize: number;
    totalRecords: number;
  };
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [CommonModule, HeaderComponent, TicketsComponent],
})
export class AppComponent implements OnInit, OnDestroy {
  bases: any[] = [];
  currentTickets: any[] = [];
  currentBaseName: string = '';
  error: string = '';
  syncStatus: string = '';
  private subscription = new Subscription();
  tickets: any[] = [];
  selectedBaseId: string = '';
  showTickets: boolean = false;
  selectedBaseName: string = '';
  ticketsPagination: {
    offset: string | null;
    hasMore: boolean;
    pageSize: number;
    totalRecords: number;
  } | null = null;

  constructor(
    private airtableService: AirtableService,
    private snackBar: MatSnackBar
  ) {
    this.subscription.add(
      this.airtableService.token$.subscribe((token) => {
        if (token) {
          console.log('Token detected, loading bases...');
          this.loadBases();
        }
      })
    );
  }

  ngOnInit() {
    if (!!localStorage.getItem('airtableToken')) {
      this.loadBases();
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loadBases() {
    this.airtableService.getUserBases().subscribe({
      next: (response) => {
        this.bases = response.bases;
      },
      error: (error) => {
        console.error('Error loading bases:', error);
        this.error = 'Failed to load bases';
      },
    });
  }

  syncTickets(baseId: string) {
    this.syncStatus = 'Syncing tickets...';
    this.error = '';

    this.airtableService.syncTickets(baseId, 'tickets').subscribe({
      next: (response) => {
        if (response.success) {
          this.syncStatus = `Successfully synced ${response.tickets.length} tickets`;
          this.verifyTickets(baseId);
        } else {
          this.error = 'Sync completed but no success confirmation';
        }
      },
      error: (error) => {
        console.error('Error syncing tickets:', error);
        this.error = error.error?.error || 'Failed to sync tickets';
        this.syncStatus = '';
      },
    });
  }

  verifyTickets(baseId: string) {
    const queryParams = new URLSearchParams({ pageSize: '100' }).toString();

    this.airtableService.getTickets(baseId, 'tickets', queryParams).subscribe({
      next: (response) => {
        if (response.success) {
          this.syncStatus += ` (Verified ${response.data.length} tickets in database)`;
        }
      },
      error: (error) => {
        console.error('Error verifying tickets:', error);
        this.error = 'Tickets synced but verification failed';
      },
    });
  }

  private loadTickets(baseId: string): void {
    const queryParams = new URLSearchParams({
      pageSize: '10',
    }).toString();

    this.airtableService.getTickets(baseId, 'tickets', queryParams).subscribe({
      next: (response: TicketResponse) => {
        if (response.success) {
          this.tickets = response.data;
          this.selectedBaseId = baseId;
          this.showTickets = true;
        } else {
          console.error('Failed to load tickets:', response);
          this.snackBar.open('Failed to load tickets', 'Close', {
            duration: 3000,
          });
        }
      },
      error: (error: Error) => {
        console.error('Error loading tickets:', error);
        this.snackBar.open('Error loading tickets', 'Close', {
          duration: 3000,
        });
      },
    });
  }

  onBaseSelect(baseId: string, baseName: string): void {
    const queryParams = new URLSearchParams({
      pageSize: '10',
    }).toString();

    this.airtableService.getTickets(baseId, 'tickets', queryParams).subscribe({
      next: (response: TicketResponse) => {
        if (response.success && response.data) {
          this.tickets = [...response.data];
          this.selectedBaseId = baseId;
          this.selectedBaseName = baseName;
          this.showTickets = true;

          this.ticketsPagination = {
            offset: response.pagination.offset,
            hasMore: response.pagination.hasMore,
            pageSize: response.pagination.pageSize,
            totalRecords: response.pagination.totalRecords,
          };
        } else {
          console.error('Failed to load tickets:', response);
          this.snackBar.open('Failed to load tickets', 'Close', {
            duration: 3000,
          });
        }
      },
      error: (error: Error) => {
        console.error('Error loading tickets:', error);
        this.snackBar.open('Error loading tickets', 'Close', {
          duration: 3000,
        });
        this.showTickets = false;
      },
    });
  }
}
