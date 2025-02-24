import { Component, Input, OnChanges, ViewChild, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridModule, AgGridAngular } from 'ag-grid-angular';
import {
  ClientSideRowModelModule,
  ColDef,
  ModuleRegistry,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CustomFilterModule,
  QuickFilterModule,
  ExternalFilterModule,
  PaginationModule,
  GridOptions,
} from 'ag-grid-community';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TicketDialogComponent } from '../ticket-dialog/ticket-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  firstValueFrom,
} from 'rxjs';
import { AirtableService } from '../../services/airtable.service';
import { LoaderComponent } from '../shared/loader/loader.component';
import { MFADialogComponent } from '../mfa-dialog/mfa-dialog.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// Register AG Grid Modules
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CustomFilterModule,
  QuickFilterModule,
  ExternalFilterModule,
  PaginationModule,
]);

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [
    CommonModule,
    AgGridModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    LoaderComponent,
    MatSnackBarModule,
  ],
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.scss'],
})
export class TicketsComponent implements OnInit, OnChanges {
  @ViewChild(AgGridAngular) agGrid!: AgGridAngular;
  @Input() tickets: any[] = [];
  @Input() baseName: string = '';
  @Input() baseId: string = '';
  @Input() pagination: {
    offset: string | null;
    hasMore: boolean;
    pageSize: number;
    totalRecords: number;
  } | null = null;

  modules = [
    ClientSideRowModelModule,
    TextFilterModule,
    NumberFilterModule,
    DateFilterModule,
    CustomFilterModule,
    QuickFilterModule,
    ExternalFilterModule,
    PaginationModule,
  ];

  private currentPage = 1;
  private offset: string | null = null;
  private hasMore = false;
  private loading = false;

  private readonly DEFAULT_PAGE_SIZE = 10;

  private gridApi: any;
  private paginationState = {
    currentPage: 0,
    pageSize: this.DEFAULT_PAGE_SIZE,
    offset: null as string | null,
    hasMore: false,
    totalRecords: 0,
  };

  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    floatingFilter: true,
    resizable: true,
    filterParams: {
      buttons: ['reset', 'apply'],
      closeOnApply: true,
    },
  };

  gridOptions: GridOptions = {
    pagination: true,
    paginationPageSize: 10,
    paginationPageSizeSelector: [5, 25, 50, 100],
    domLayout: 'autoHeight',
    animateRows: true,
    enableRangeSelection: true,
    suppressAggFuncInHeader: true,
    suppressPaginationPanel: false,
    paginationAutoPageSize: false,
    onGridReady: (params) => {
      this.gridApi = params.api;
    },
    onPaginationChanged: (params) => {
      if (!this.gridApi) return;

      const newPageSize = this.gridApi.paginationGetPageSize();
      const currentPage = this.gridApi.paginationGetCurrentPage();

      // Handle page navigation
      if (this.shouldFetchNextPage()) {
        this.fetchNextPage();
      }
    },
    enableCellTextSelection: true,
    ensureDomOrder: true,
  };

  private shouldFetchNextPage(): boolean {
    if (!this.gridApi || !this.paginationState.hasMore) return false;

    const currentPage = this.gridApi.paginationGetCurrentPage();
    const pageSize = this.gridApi.paginationGetPageSize();
    const totalLoadedRows = this.tickets.length;
    const currentLastRow = (currentPage + 1) * pageSize;

    // Fetch next page when we're on the last loaded page and there's more data
    return currentLastRow >= totalLoadedRows && this.paginationState.hasMore;
  }

  columnDefs: ColDef[] = [];

  private setupColumns(fields: any[]) {
    this.columnDefs = fields.map((field) => {
      const colDef: ColDef = {
        field: `fields.${field.field}`,
        headerName: field.headerName,
        sortable: true,
        filter: true,
        resizable: true,
        width: 150,
      };

      // Special handling for specific field types
      if (
        field.field === 'Created time' ||
        field.field.includes('time') ||
        field.field.includes('date')
      ) {
        colDef.filter = 'agDateColumnFilter';
        colDef.valueFormatter = (params) =>
          params.value ? new Date(params.value).toLocaleString() : '';
      }

      // Handle nested objects like Submitted by, Assignee
      if (field.field === 'Submitted by' || field.field === 'Assignee') {
        colDef.field = `fields.${field.field}.name`;
        colDef.valueGetter = (params) =>
          params.data.fields[field.field]?.name || 'Unassigned';
      }

      return colDef;
    });
  }

  bases: any[] = [];
  tables: any[] = [];
  selectedBaseId: string = '';
  selectedTableId: string = '';
  showGrid: boolean = false;
  isLoadingBases: boolean = false;
  isLoadingTables: boolean = false;
  isLoadingTickets: boolean = false;
  isSyncing: boolean = false;

  constructor(
    private dialog: MatDialog,
    private airtableService: AirtableService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadBases();
  }

  ngOnChanges() {
    // No changes to handle in ngOnChanges
  }

  private fetchNextPage() {
    // Prevent multiple simultaneous requests
    if (this.isLoadingTickets) return;

    if (
      !this.paginationState.hasMore ||
      !this.selectedBaseId ||
      !this.selectedTableId ||
      !this.paginationState.offset
    ) {
      return;
    }

    this.isLoadingTickets = true;
    const queryParams = new URLSearchParams({
      pageSize: this.paginationState.pageSize.toString(),
      offset: this.paginationState.offset,
    });

    this.airtableService
      .getTickets(
        this.selectedBaseId,
        this.selectedTableId,
        queryParams.toString()
      )
      .subscribe({
        next: (response: any) => {
          if (response.success) {
            // Append new data to existing data
            this.tickets = [...this.tickets, ...response.data];
            this.paginationState = {
              ...this.paginationState,
              offset: response.pagination.offset,
              hasMore: response.pagination.hasMore,
            };
            this.refreshGrid();
          }
          this.isLoadingTickets = false;
        },
        error: (error) => {
          console.error('Error fetching next page:', error);
          this.isLoadingTickets = false;
        },
      });
  }

  private refreshGrid() {
    if (!this.gridApi) {
      console.warn('Grid API not ready');
      return;
    }

    try {
      // Get current page and page size
      const currentPage = this.gridApi.paginationGetCurrentPage();
      const pageSize = this.gridApi.paginationGetPageSize();

      // Update the row data
      this.gridApi.setGridOption('rowData', this.tickets);

      // Update total row count for pagination
      const totalRows = this.paginationState.hasMore
        ? this.tickets.length + pageSize
        : this.tickets.length;

      // Update pagination
      if (this.gridApi.paginationProxy) {
        this.gridApi.paginationProxy.setRowCount(totalRows);
        this.gridApi.paginationGoToPage(currentPage);
      }

      // Refresh the view
      this.gridApi.refreshCells({ force: true });
    } catch (error) {
      console.error('Error refreshing grid:', error);
    }
  }

  // Add new properties for menu
  showMenu = false;
  menuX = 0;
  menuY = 0;

  // Add click handler
  onRowClicked(event: any) {
    this.dialog.open(TicketDialogComponent, {
      width: '400px',
      data: event.data,
    });
  }

  loadBases() {
    this.isLoadingBases = true;
    this.airtableService.getUserBases().subscribe({
      next: (response: any) => {
        this.bases = response.bases || [];
        this.isLoadingBases = false;
      },
      error: (error) => {
        console.error('Error loading bases:', error);
        this.isLoadingBases = false;
      },
    });
  }

  onBaseSelect(baseId: string) {
    this.isLoadingTables = true;
    this.selectedBaseId = baseId;
    this.selectedTableId = '';
    this.showGrid = false;
    this.tables = [];

    this.airtableService.getBaseTables(baseId).subscribe({
      next: (response: any) => {
        this.tables = response.tables || [];
        this.isLoadingTables = false;
      },
      error: (error) => {
        console.error('Error loading tables:', error);
        this.isLoadingTables = false;
      },
    });
  }

  onTableSelect(tableId: string) {
    this.selectedTableId = tableId;
    this.showGrid = false;
  }

  syncTickets() {
    this.isSyncing = true;
    if (!this.selectedBaseId || !this.selectedTableId) return;

    this.airtableService
      .syncTickets(this.selectedBaseId, this.selectedTableId)
      .subscribe({
        next: (response: any) => {
          console.log('Tickets synced successfully');
          this.loadTickets();
          this.isSyncing = false;
        },
        error: (error) => {
          console.error('Error syncing tickets:', error);
          this.isSyncing = false;
        },
      });
  }

  viewTickets() {
    if (!this.selectedBaseId || !this.selectedTableId) return;

    this.showGrid = true;
    this.loadTickets();
  }

  private loadTickets() {
    if (this.isLoadingTickets) return;
    this.isLoadingTickets = true;

    this.airtableService
      .getUserTickets(this.selectedBaseId, this.selectedTableId)
      .subscribe({
        next: (response: any) => {
          this.isLoadingTickets = false;
          if (response.success) {
            this.tickets = response.data;
            if (response.metadata?.fields) {
              this.setupColumns(response.metadata.fields);
            }
            if (response.pagination) {
              this.paginationState = {
                currentPage: 0,
                pageSize: response.pagination.pageSize,
                offset: response.pagination.offset,
                hasMore: response.pagination.hasMore,
                totalRecords: response.pagination.totalRecords,
              };
            }
            if (this.gridApi) {
              this.refreshGrid();
            }
          } else {
            console.error('Failed to load tickets:', response);
          }
        },
        error: (error) => {
          console.error('Error loading tickets:', error);
          this.isLoadingTickets = false;
        },
        complete: () => {
          this.isLoadingTickets = false;
        },
      });
  }

  async refreshCookies() {
    try {
      const response = await firstValueFrom(this.airtableService.getCookies());
      console.log('Cookie response:', response);

      // Check if MFA is required
      if (response && response.status === 'MFA_REQUIRED') {
        console.log('MFA required, showing dialog...');
        const mfaCode = await this.showMFADialog();

        if (mfaCode) {
          try {
            const mfaResponse = await firstValueFrom(
              this.airtableService.submitMFACode(mfaCode)
            );
            console.log('MFA submission response:', mfaResponse);

            if (mfaResponse.success) {
              this.showSnackBar('Cookies updated successfully');
              return mfaResponse;
            } else {
              throw new Error(mfaResponse.error || 'Failed to submit MFA code');
            }
          } catch (mfaError: any) {
            console.error('MFA submission error:', mfaError);
            this.showSnackBar(
              mfaError.details || 'Failed to submit MFA code',
              'error'
            );
            throw mfaError;
          }
        } else {
          this.showSnackBar('MFA code entry cancelled', 'error');
          throw new Error('MFA code entry cancelled');
        }
      } else if (response && response.success) {
        this.showSnackBar('Cookies updated successfully');
        return response;
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Error getting cookies:', error);
      this.showSnackBar(
        error.details || error.message || 'Failed to get cookies',
        'error'
      );
      throw error;
    }
  }

  private async showMFADialog(): Promise<string | null> {
    console.log('Opening MFA dialog...');
    return new Promise((resolve) => {
      const dialogRef = this.dialog.open(MFADialogComponent, {
        width: '400px',
        disableClose: true,
        data: {
          title: 'Enter Authentication Code',
          message: 'Please enter the code from your authenticator app',
        },
      });

      dialogRef.afterClosed().subscribe((result) => {
        console.log('Dialog closed with result:', result);
        resolve(result);
      });
    });
  }

  // Add this helper method for showing messages
  private showSnackBar(message: string, type: 'success' | 'error' = 'success') {
    // You'll need to inject MatSnackBar in constructor
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: type === 'error' ? ['error-snackbar'] : ['success-snackbar'],
    });
  }
}
