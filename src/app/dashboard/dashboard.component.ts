import { Component, OnInit, Inject, PLATFORM_ID, afterNextRender } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

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

  // Node registration popup
  showRegisterPopup: boolean = false;
  registerNodeName: string = '';
  registerMessage: string = '';
  registrationResult: any = null;

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

  showNodeRegistrationPopup() {
    this.showRegisterPopup = true;
    this.registerNodeName = '';
    this.registerMessage = '';
    this.registrationResult = null;
  }

  hideNodeRegistrationPopup() {
    this.showRegisterPopup = false;
    this.registerNodeName = '';
    this.registerMessage = '';
    this.registrationResult = null;
  }

  async loadUserStorageNodes() {
    this.loadingNodes = true;
    this.userStorageNodes = [];
    try {
      // Fetch user storage nodes
      const StorageNodes: any = await this.authService.getUserStorageNodes();

      if (StorageNodes.success) {
        this.userStorageNodes = StorageNodes.storage_nodes || [];
      } else {
        throw new Error(StorageNodes.error);
      }
    } catch (error: any) {
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }

      throw error;
    } finally {
      this.loadingNodes = false;
    }
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

      const response: any = await this.authService.registerNode({
        node_name: this.registerNodeName.trim()
      });

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

  
  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  openFileBrowser(node: any) {
    this.router.navigate(['/file-browser', node.node_id], {
      queryParams: { nodeName: node.label }
    });
  }
}
