import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { ColDef, RowClickedEvent } from 'ag-grid-community';
import { ClientSideRowModelModule, ModuleRegistry } from 'ag-grid-community';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TicketDialogComponent } from '../ticket-dialog/ticket-dialog.component';

// Register AG Grid Modules
ModuleRegistry.registerModules([ClientSideRowModelModule]);

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, AgGridModule, MatDialogModule],
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.scss'],
})
export class TicketsComponent implements OnChanges {
  constructor(private dialog: MatDialog) {}

  @Input() tickets: any[] = [];
  @Input() baseName: string = '';
  // show tickets data in console
  ngOnInit() {
    console.log('Tickets:', this.tickets);
    if (this.tickets && this.tickets.length > 0) {
      this.generateColumns();
    }
  }
  columnDefs: ColDef[] = [];

  defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
    flex: 1,
  };

  modules = [ClientSideRowModelModule];

  ngOnChanges() {
    console.log('Tickets updated:', this.tickets);
    if (this.tickets && this.tickets.length > 0) {
      this.generateColumns();
    }
  }

  private generateColumns() {
    // Get the first ticket to analyze its structure
    const sampleTicket = this.tickets[0];
    this.columnDefs = [];

    // Add ID column first
    this.columnDefs.push({
      field: 'ticketId',
      headerName: 'ID',
      width: 80,
      sort: 'asc',
    });

    // Add other columns based on the data
    Object.keys(sampleTicket).forEach((key) => {
      // Skip internal MongoDB fields and ID (already added)
      if (['_id', '__v', 'userId', 'baseId', 'ticketId'].includes(key)) {
        return;
      }

      let column: ColDef = {
        field: key,
        headerName: this.formatHeaderName(key),
      };

      // Special handling for different field types
      switch (key) {
        case 'title':
          column = {
            ...column,
            flex: 1,
            minWidth: 200,
          };
          break;

        case 'description':
          column = {
            ...column,
            flex: 2,
            minWidth: 300,
          };
          break;

        case 'status':
          column = {
            ...column,
            width: 120,
            cellStyle: (params) => {
              switch (params.value) {
                case 'In Progress':
                  return { color: '#3182ce' };
                case 'Closed':
                  return { color: '#48bb78' };
                default:
                  return null;
              }
            },
          };
          break;

        case 'priority':
          column = {
            ...column,
            width: 100,
            cellStyle: (params) => {
              switch (params.value) {
                case 'High':
                  return { color: '#e53e3e' };
                case 'Medium':
                  return { color: '#dd6b20' };
                case 'Low':
                  return { color: '#718096' };
                default:
                  return null;
              }
            },
          };
          break;

        case 'submittedBy':
          column = {
            ...column,
            field: 'submittedBy.name',
            width: 150,
          };
          break;

        case 'assignee':
          column = {
            ...column,
            field: 'assignee.name',
            width: 150,
            valueGetter: (params) => params.data.assignee?.name || 'Unassigned',
          };
          break;

        case 'createdTime':
          column = {
            ...column,
            width: 160,
            valueFormatter: (params) =>
              params.value ? new Date(params.value).toLocaleString() : '',
          };
          break;

        case 'daysUntilSLABreach':
          column = {
            ...column,
            width: 120,
            headerName: 'Days to SLA',
          };
          break;

        case 'resolutionNotes':
          column = {
            ...column,
            flex: 1,
            minWidth: 200,
          };
          break;

        default:
          column.width = 120;
      }

      this.columnDefs.push(column);
    });

    console.log('Generated columns:', this.columnDefs);
  }

  private formatHeaderName(key: string): string {
    // Convert camelCase to Title Case with spaces
    return key
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
      .trim();
  }

  // Add new properties for menu
  showMenu = false;
  menuX = 0;
  menuY = 0;

  // Add click handler
  onRowClicked(event: RowClickedEvent) {
    this.dialog.open(TicketDialogComponent, {
      width: '400px',
      data: event.data,
    });
  }
}
