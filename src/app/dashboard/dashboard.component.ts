import { Component, OnInit, Inject, PLATFORM_ID, afterNextRender } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  nodeId: string = '';
  nodeStatusMessage: string = '';
  nodeStatusResult: any = null;

  // Node registration popup properties
  showRegisterPopup: boolean = false;
  registerNodeName: string = '';
  registerMessage: string = '';
  registrationResult: any = null;

  // User's storage nodes
  userStorageNodes: any[] = [];
  loadingNodes: boolean = true;

  constructor(
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private sessionHandler: SessionHandlerService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.loadUserStorageNodes();
    }
  }

  private getApiUrl(): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}`;
    }
    return 'https://localhost:4200/api';
  }

  // Load user's storage nodes
  async loadUserStorageNodes() {
    try {
      const response: any = await lastValueFrom(
        this.authService.getUserStorageNodes()
      );

      if (response.success) {
        this.userStorageNodes = response.storage_nodes || [];
      } else {
        // Handle SSR case or authentication failure gracefully
        if (response.message === 'Not authenticated or running on server') {
          this.userStorageNodes = [];
        } else {
          console.error('Failed to load storage nodes:', response.message);
        }
      }
    } catch (error: any) {
      console.error('Error loading storage nodes:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
    } finally {
      this.loadingNodes = false;
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  // Check storage node status for specific node_id
  async checkNodeStatus() {
    if (!this.nodeId.trim()) {
      this.nodeStatusMessage = 'Please enter a valid Node ID first';
      return;
    }

    try {
      this.nodeStatusMessage = 'Checking node status...';
      this.nodeStatusResult = null;

      const response: any = await lastValueFrom(
        this.http.get(`${this.getApiUrl()}/api/check-status/${this.nodeId.trim()}`)
      );

      if (response.success) {
        this.nodeStatusResult = response;
        this.nodeStatusMessage = '';
      } else {
        this.nodeStatusMessage =
          'Failed to check node status: ' + response.error;
      }
    } catch (error: any) {
      console.error('Node status check failed (raw error object):', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      if (error instanceof HttpErrorResponse) {
        console.error(
          `Status: ${error.status}, StatusText: ${error.statusText}`
        );
        console.error('Error details:', error.error);
        this.nodeStatusMessage = `Error: ${error.statusText} - ${
          error.error?.error || error.message
        }`;
      } else {
        this.nodeStatusMessage =
          error.message || 'An unexpected error occurred';
      }
    }
  }

  // Show node registration popup
  showNodeRegistrationPopup() {
    this.showRegisterPopup = true;
    this.registerNodeName = '';
    this.registerMessage = '';
    this.registrationResult = null;
  }

  // Hide node registration popup
  hideNodeRegistrationPopup() {
    this.showRegisterPopup = false;
    this.registerNodeName = '';
    this.registerMessage = '';
    this.registrationResult = null;
  }

  // Register a new node
  async registerNode() {
    if (!this.registerNodeName.trim()) {
      this.registerMessage = 'Please enter a valid Node Name';
      return;
    }

    try {
      this.registerMessage = 'Registering node...';
      this.registrationResult = null;

      const response: any = await lastValueFrom(
        this.authService.registerNode({
          node_name: this.registerNodeName.trim()
        })
      );

      if (response.success) {
        this.registrationResult = response;
        this.registerMessage = 'Node registered successfully!';
        // Refresh the node list to show the newly registered node
        await this.loadUserStorageNodes();
      } else {
        this.registerMessage = response.error || 'Node registration failed';
      }
    } catch (error: any) {
      console.error('Node registration failed:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      if (error instanceof HttpErrorResponse) {
        this.registerMessage =
          error.error?.error ||
          error.error?.message ||
          'Registration failed';
      } else {
        this.registerMessage =
          error.message || 'An unexpected error occurred';
      }
    }
  }

  openFileBrowser(node: any) {
    this.router.navigate(['/file-browser', node.node_id], {
      queryParams: { nodeName: node.label }
    });
  }
}
