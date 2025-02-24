import {
  Component,
  Inject,
  AfterViewInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import {
  MatDialogRef,
  MatDialogModule,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

interface DialogData {
  title: string;
  message: string;
}

@Component({
  selector: 'app-mfa-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDialogModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <mat-form-field appearance="outline">
        <mat-label>Authentication Code</mat-label>
        <input
          matInput
          [(ngModel)]="mfaCode"
          placeholder="Enter 6-digit code"
          type="text"
          maxlength="6"
          pattern="[0-9]*"
          autocomplete="off"
          (keyup.enter)="isValidCode() && onSubmit()"
          #codeInput
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!isValidCode()"
        (click)="onSubmit()"
      >
        Submit
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      mat-form-field {
        width: 100%;
      }
      mat-dialog-content {
        min-width: 300px;
        padding: 20px;
      }
      p {
        margin-bottom: 20px;
      }
      input {
        letter-spacing: 2px;
        font-size: 16px;
      }
    `,
  ],
})
export class MFADialogComponent implements AfterViewInit {
  @ViewChild('codeInput') codeInput!: ElementRef;
  mfaCode: string = '';

  constructor(
    private dialogRef: MatDialogRef<MFADialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {}

  ngAfterViewInit() {
    // Focus the input field when dialog opens
    setTimeout(() => {
      this.codeInput.nativeElement.focus();
    });
  }

  isValidCode(): boolean {
    return this.mfaCode?.length === 6 && /^\d+$/.test(this.mfaCode);
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSubmit(): void {
    if (this.isValidCode()) {
      this.dialogRef.close(this.mfaCode);
    }
  }
}
