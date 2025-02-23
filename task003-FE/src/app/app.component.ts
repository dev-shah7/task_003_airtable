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
    // Subscribe to token changes
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
    // Initial load if token exists
    console.log('hi');
    if (!!localStorage.getItem('airtableToken')) {
      this.loadBases();
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  loadBases() {
    console.log('Loading bases...');
    this.airtableService.getUserBases().subscribe({
      next: (response) => {
        console.log('Bases loaded:', response);
        this.bases = response.bases;
      },
      error: (error) => {
        console.error('Error loading bases:', error);
        this.error = 'Failed to load bases';
      },
    });
  }

  syncTickets(baseId: string) {
    console.log('Starting ticket sync for base:', baseId);
    this.syncStatus = 'Syncing tickets...';
    this.error = '';

    this.airtableService.syncTickets(baseId, 'tickets').subscribe({
      next: (response) => {
        console.log('Ticket sync response:', response);
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
    console.log('Verifying synced tickets for base:', baseId);
    const queryParams = new URLSearchParams({ pageSize: '100' }).toString();

    this.airtableService.getTickets(baseId, 'tickets', queryParams).subscribe({
      next: (response) => {
        console.log('Verified tickets:', response);
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
    console.log(`Selecting base: ${baseId} (${baseName})`);
    const queryParams = new URLSearchParams({
      pageSize: '10',
    }).toString();

    this.airtableService.getTickets(baseId, 'tickets', queryParams).subscribe({
      next: (response: TicketResponse) => {
        console.log('Received response:', response);
        if (response.success && response.data) {
          this.tickets = [...response.data];
          this.selectedBaseId = baseId;
          this.selectedBaseName = baseName;
          this.showTickets = true;

          // Pass pagination info to the tickets component
          this.ticketsPagination = {
            offset: response.pagination.offset,
            hasMore: response.pagination.hasMore,
            pageSize: response.pagination.pageSize,
            totalRecords: response.pagination.totalRecords,
          };

          console.log('Updated tickets:', this.tickets);
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
