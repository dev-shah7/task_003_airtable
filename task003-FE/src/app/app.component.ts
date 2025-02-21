import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/header/header.component';
import { TicketsComponent } from './components/tickets/tickets.component';
import { AirtableService } from './services/airtable.service';
import { Subscription } from 'rxjs';

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

  constructor(private airtableService: AirtableService) {
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

    this.airtableService.syncTickets(baseId).subscribe({
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
    this.airtableService.getTickets(baseId).subscribe({
      next: (response) => {
        console.log('Verified tickets:', response);
        if (response.success) {
          this.syncStatus += ` (Verified ${response.tickets.length} tickets in database)`;
        }
      },
      error: (error) => {
        console.error('Error verifying tickets:', error);
        this.error = 'Tickets synced but verification failed';
      },
    });
  }

  loadTickets(baseId: string, baseName: string) {
    console.log('Loading tickets for base:', baseId);
    this.currentBaseName = baseName;
    this.error = '';
    this.currentTickets = []; // Clear current tickets before loading new ones

    this.airtableService.getTickets(baseId).subscribe({
      next: (response) => {
        console.log('Tickets loaded:', response);
        if (response.success && response.tickets) {
          // Don't modify the data structure, use it as is
          this.currentTickets = response.tickets;
          console.log('Processed tickets:', this.currentTickets);
        } else {
          this.error = 'Failed to load tickets';
          this.currentTickets = [];
        }
      },
      error: (error) => {
        console.error('Error loading tickets:', error);
        this.error = 'Failed to load tickets';
        this.currentTickets = [];
      },
    });
  }
}
