import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-mfa-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  template: `
    <h2 mat-dialog-title>Enter MFA Code</h2>
    <mat-dialog-content>
      <mat-form-field>
        <input
          matInput
          [(ngModel)]="mfaCode"
          placeholder="Enter your MFA code"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-button color="primary" (click)="onSubmit()">Submit</button>
    </mat-dialog-actions>
  `,
})
export class MfaDialogComponent {
  mfaCode: string = '';

  constructor(public dialogRef: MatDialogRef<MfaDialogComponent>) {}

  onSubmit(): void {
    this.dialogRef.close(this.mfaCode);
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
