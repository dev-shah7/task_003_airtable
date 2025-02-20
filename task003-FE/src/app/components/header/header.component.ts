import { Component, OnInit } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {
  ngOnInit() {
    // Check for token in URL params
    const params = new URLSearchParams(window.location.search);
    const token = params.get('airtableToken');

    if (token) {
      // Store token in localStorage
      localStorage.setItem('airtableToken', token);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  connectToAirtable() {
    // Redirect to backend auth endpoint
    window.location.href = `${environment.apiUrl}/airtable/auth`;
  }

  get isConnected(): boolean {
    return !!localStorage.getItem('airtableToken');
  }
}
