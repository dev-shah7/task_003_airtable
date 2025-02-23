import { Component, Input, OnChanges, ViewChild } from '@angular/core';
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
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AirtableService } from '../../services/airtable.service';

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
  ],
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.scss'],
})
export class TicketsComponent implements OnChanges {
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

  searchText: string = '';
  private searchSubject = new Subject<string>();
  private gridApi: any = null;

  private currentPage = 1;
  private offset: string | null = null;
  private hasMore = false;
  private loading = false;

  private readonly DEFAULT_PAGE_SIZE = 5;

  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    floatingFilter: true,
    resizable: true,
    filterParams: {
      buttons: ['reset', 'apply'],
      closeOnApply: true,
    },
    getQuickFilterText: (params) => {
      return params.value?.toString() || '';
    },
  };

  gridOptions: GridOptions = {
    pagination: true,
    paginationPageSize: this.DEFAULT_PAGE_SIZE,
    paginationPageSizeSelector: [5, 25, 50, 100],
    domLayout: 'autoHeight',
    animateRows: true,
    enableRangeSelection: true,
    suppressAggFuncInHeader: true,
    quickFilterText: '',
    suppressPaginationPanel: false,
    paginationAutoPageSize: false,
    onGridReady: (params) => {
      this.gridApi = params.api;

      // If we already have data, update the grid
      if (this.tickets?.length > 0) {
        this.updateGrid(this.tickets);
      }
      // If we don't have data but have pagination info, fetch initial data
      else if (this.pagination && this.baseId) {
        this.fetchInitialData();
      }
    },
    onPaginationChanged: (params) => {
      if (!this.gridApi) return;

      const newPageSize = this.gridApi.paginationGetPageSize();
      const currentPage = this.gridApi.paginationGetCurrentPage();

      console.log('Pagination changed:', {
        currentPage,
        newPageSize,
        hasMore: this.paginationState.hasMore,
        offset: this.paginationState.offset,
      });

      // Handle page size change
      if (newPageSize !== this.paginationState.pageSize) {
        this.onPageSizeChanged(newPageSize);
        return;
      }

      // Handle page navigation
      if (this.paginationState.hasMore && this.isLastPage()) {
        this.fetchNextPage();
      }
    },
  };

  columnDefs: ColDef[] = [
    {
      field: 'ticketId',
      headerName: 'ID',
      width: 100,
      filter: 'agNumberColumnFilter',
    },
    {
      field: 'title',
      headerName: 'Title',
      flex: 2,
      filter: 'agTextColumnFilter',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      filter: 'agSetColumnFilter',
    },
    {
      field: 'priority',
      headerName: 'Priority',
      width: 120,
      filter: 'agSetColumnFilter',
    },
    {
      field: 'submittedBy.name',
      headerName: 'Submitted By',
      width: 150,
      filter: 'agTextColumnFilter',
    },
    {
      field: 'assignee.name',
      headerName: 'Assignee',
      width: 150,
      filter: 'agTextColumnFilter',
      valueGetter: (params) => params.data.assignee?.name || 'Unassigned',
    },
    {
      field: 'createdTime',
      headerName: 'Created',
      width: 160,
      filter: 'agDateColumnFilter',
      valueFormatter: (params) =>
        params.value ? new Date(params.value).toLocaleString() : '',
    },
  ];

  constructor(
    private dialog: MatDialog,
    private airtableService: AirtableService
  ) {
    this.setupSearch();
  }

  ngOnInit() {
    console.log('Component initialized with:', {
      tickets: this.tickets,
      pagination: this.pagination,
      baseId: this.baseId,
    });

    // Initialize pagination state if we have initial data
    if (this.pagination) {
      this.paginationState = {
        currentPage: 0,
        pageSize: this.pagination.pageSize,
        offset: this.pagination.offset,
        hasMore: this.pagination.hasMore,
        totalRecords: this.pagination.totalRecords,
      };

      // Fetch initial data if we have baseId
      if (this.baseId) {
        this.fetchInitialData();
      }
    }
  }

  ngOnChanges() {
    console.log('Tickets changed:', this.tickets);
    if (this.tickets?.length > 0 && this.pagination) {
      // Update pagination state from parent component
      this.paginationState = {
        currentPage: 0,
        pageSize: this.pagination.pageSize,
        offset: this.pagination.offset,
        hasMore: this.pagination.hasMore,
        totalRecords: this.pagination.totalRecords,
      };
      this.updateGrid(this.tickets);
    }
  }

  private setupSearch(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((searchText) => {
        if (this.gridApi) {
          this.gridApi.setFilterModel({
            quickFilter: { filter: searchText },
          });
        }
      });
  }

  onSearchChange(value: string) {
    console.log('Search changed:', value);
    this.searchText = value;
    this.searchSubject.next(value);
  }

  clearSearch() {
    console.log('Clearing search');
    this.searchText = '';
    if (this.gridApi) {
      this.gridApi.setFilterModel(null);
    }
    this.searchSubject.next('');
  }

  // Initialize pagination state with default values
  private paginationState = {
    currentPage: 0,
    pageSize: this.DEFAULT_PAGE_SIZE,
    offset: null as string | null,
    hasMore: false,
    totalRecords: 0,
  };

  private onPageSizeChanged(newPageSize: number) {
    if (!this.gridApi) return;

    console.log('Page size changed to:', newPageSize);
    this.paginationState.pageSize = newPageSize;
    this.paginationState.offset = null;
    this.fetchTickets();
  }

  private fetchTickets() {
    if (!this.baseId) {
      console.error('No baseId provided');
      return;
    }

    const queryParams = new URLSearchParams({
      pageSize: this.paginationState.pageSize.toString(),
    });

    if (this.paginationState.offset) {
      queryParams.append('offset', this.paginationState.offset);
    }

    console.log('Fetching tickets with params:', queryParams.toString());

    this.airtableService
      .getTickets(this.baseId, queryParams.toString())
      .subscribe({
        next: (response: any) => {
          console.log('Received response:', response);
          if (response.success) {
            this.tickets = response.data; // Update the tickets array
            this.paginationState.offset = response.pagination.offset;
            this.paginationState.hasMore = response.pagination.hasMore;
            this.refreshGrid();
          }
        },
        error: (error) => {
          console.error('Error fetching tickets:', error);
        },
      });
  }

  private isLastPage(): boolean {
    if (!this.gridApi) return false;
    const currentPage = this.gridApi.paginationGetCurrentPage();
    const pageSize = this.gridApi.paginationGetPageSize();
    const totalRows = this.tickets.length;
    return (currentPage + 1) * pageSize >= totalRows;
  }

  private refreshGrid() {
    if (!this.gridApi) {
      console.warn('Grid API not ready');
      return;
    }

    try {
      console.log('Refreshing grid with', this.tickets.length, 'tickets');

      // Update the grid with all data
      this.gridApi.setRowData(this.tickets);

      // Calculate total rows including potential next page
      const totalRows = this.paginationState.hasMore
        ? this.tickets.length + this.paginationState.pageSize
        : this.tickets.length;

      // Update pagination state
      this.gridApi.paginationGoToPage(this.paginationState.currentPage);

      // Enable/disable next button based on hasMore
      const paginationProxy = this.gridApi.paginationProxy;
      if (paginationProxy) {
        paginationProxy.setRowCount(totalRows);
      }

      console.log('Grid refresh complete.', {
        totalRows,
        hasMore: this.paginationState.hasMore,
        offset: this.paginationState.offset,
        currentPage: this.paginationState.currentPage,
      });
    } catch (error) {
      console.error('Error refreshing grid:', error);
    }
  }

  private fetchNextPage() {
    if (
      !this.paginationState.hasMore ||
      !this.baseId ||
      !this.paginationState.offset
    ) {
      console.log('No more pages to fetch or missing data:', {
        hasMore: this.paginationState.hasMore,
        baseId: this.baseId,
        offset: this.paginationState.offset,
      });
      return;
    }

    const queryParams = new URLSearchParams({
      pageSize: this.paginationState.pageSize.toString(),
      offset: this.paginationState.offset,
    });

    console.log('Fetching next page with params:', queryParams.toString());

    this.airtableService
      .getTickets(this.baseId, queryParams.toString())
      .subscribe({
        next: (response: any) => {
          console.log('Received next page response:', response);
          if (response.success) {
            // Append new data to existing data
            this.tickets = [...this.tickets, ...response.data];
            this.paginationState.offset = response.pagination.offset;
            this.paginationState.hasMore = response.pagination.hasMore;
            this.paginationState.currentPage =
              this.gridApi.paginationGetCurrentPage();
            this.refreshGrid();
          }
        },
        error: (error) => {
          console.error('Error fetching next page:', error);
        },
      });
  }

  private updateGrid(data: any[]) {
    if (!this.gridApi) {
      console.warn('Grid API not ready');
      return;
    }

    try {
      const rowData = Array.isArray(data) ? data : [];
      console.log('Setting initial grid data:', rowData.length, 'rows');

      // Set the total row count for proper pagination
      const totalRows = this.paginationState.hasMore
        ? rowData.length + this.paginationState.pageSize
        : rowData.length;

      this.gridApi.paginationSetPageSize(this.paginationState.pageSize);
      this.gridApi.setRowData(rowData);

      // Enable/disable next button based on hasMore
      const paginationProxy = this.gridApi.paginationProxy;
      if (paginationProxy) {
        paginationProxy.setRowCount(totalRows);
      }

      console.log(
        'Initial grid setup complete. Has more:',
        this.paginationState.hasMore
      );
    } catch (error) {
      console.error('Error updating grid:', error);
    }
  }

  private fetchInitialData() {
    const queryParams = new URLSearchParams({
      pageSize: this.paginationState.pageSize.toString(),
    });

    console.log('Fetching initial data with params:', queryParams.toString());

    this.airtableService
      .getTickets(this.baseId, queryParams.toString())
      .subscribe({
        next: (response: any) => {
          console.log('Received initial response:', response);
          if (response.success) {
            this.tickets = response.data;
            this.paginationState.offset = response.pagination.offset;
            this.paginationState.hasMore = response.pagination.hasMore;

            if (this.gridApi) {
              this.refreshGrid();
            }
          }
        },
        error: (error) => {
          console.error('Error fetching initial data:', error);
        },
      });
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
}
