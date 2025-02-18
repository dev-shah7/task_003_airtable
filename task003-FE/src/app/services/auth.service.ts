import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface User {
  googleId: string;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  profilePicture: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {
    this.checkAuthStatus();
  }

  login(): void {
    window.location.href = `${this.apiUrl}/google`;
  }

  logout(): Observable<any> {
    return this.http.get(`${this.apiUrl}/logout`, { withCredentials: true });
  }

  checkAuthStatus(): void {
    this.http
      .get<{ isAuthenticated: boolean; user: User | null }>(
        `${this.apiUrl}/status`,
        { withCredentials: true }
      )
      .subscribe({
        next: (response) => {
          this.userSubject.next(response.user);
        },
        error: () => {
          this.userSubject.next(null);
        },
      });
  }
}
