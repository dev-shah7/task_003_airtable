import { Component, OnInit } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';
import { AirtableService } from '../../services/airtable.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {
  constructor(private airtableService: AirtableService) {}

  ngOnInit() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('airtableToken');

    if (token) {
      this.airtableService.setToken(token);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  connectToAirtable() {
    window.location.href = `${environment.apiUrl}/airtable/auth`;
  }

  handleCallback(token: string) {
    this.airtableService.setToken(token);
  }

  get isConnected(): boolean {
    return !!localStorage.getItem('airtableToken');
  }
}
