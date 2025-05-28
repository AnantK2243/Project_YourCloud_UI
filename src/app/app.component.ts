import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http'; // Import HttpErrorResponse
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs'; // Import lastValueFrom

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
  nodeStatusSuccess: boolean = false;
  nodeStatusResult: any = null;
  isChecking: boolean = false;
  
  constructor(private http: HttpClient) {}
  
  // Check storage node status for specific node_id
  async checkNodeStatus() {
    if (!this.nodeId.trim()) {
      this.nodeStatusMessage = 'Please enter a valid Node ID';
      this.nodeStatusSuccess = false;
      return;
    }

    try {
      this.isChecking = true;
      this.nodeStatusMessage = 'Checking node status...';
      this.nodeStatusSuccess = false;
      this.nodeStatusResult = null;
      
      const response: any = await lastValueFrom(this.http.post('https://localhost:3001/api/check-status', 
        { node_id: this.nodeId.trim() },
        { withCredentials: true } // Explicitly set withCredentials
      ));
      
      console.log('Node status check response:', response);
      
      if (response.success) {
        this.nodeStatusResult = response;
        this.nodeStatusMessage = `Node status retrieved successfully`;
        this.nodeStatusSuccess = true;
      } else {
        this.nodeStatusMessage = response.error || 'Failed to check node status (server-side)';
        this.nodeStatusSuccess = false;
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
      this.nodeStatusSuccess = false;
      this.nodeStatusResult = null;
    } finally {
      this.isChecking = false;
    }
  }
  
  // Format bytes to human readable format
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Format date to human readable format
  formatDate(dateString: string): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  }
}
