import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent {
  title = 'Project_YourCloud_UI';
  nodeId: string = '';
  nodeStatusMessage: string = '';
  nodeStatusResult: any = null;
  
  constructor(private http: HttpClient) {}
  
  // Check storage node status for specific node_id
  async checkNodeStatus() {
    if (!this.nodeId.trim()) {
      this.nodeStatusMessage = 'Please enter a valid Node ID first';
      return;
    }

    try {
      this.nodeStatusMessage = 'Checking node status...';
      this.nodeStatusResult = null;
  
      const response: any = await lastValueFrom(this.http.post('http://127.0.0.1:3001/api/check-status', 
        { node_id: this.nodeId.trim() }
      ));

      if (response.success) {
        this.nodeStatusResult = response;
        this.nodeStatusMessage = '';
      } else {
        this.nodeStatusMessage = 'Failed to check node status: ' + response.error;
      }
    } catch (error: any) {
      console.error('Node status check failed (raw error object):', error);
      if (error instanceof HttpErrorResponse) {
        console.error(`Status: ${error.status}, StatusText: ${error.statusText}`);
        console.error('Error details:', error.error);
        this.nodeStatusMessage = `Error: ${error.statusText} - ${error.error?.error || error.message}`;
      } else {
        this.nodeStatusMessage = error.message || 'An unexpected error occurred';
      }
      this.nodeStatusResult = null;
    }
  }
}
