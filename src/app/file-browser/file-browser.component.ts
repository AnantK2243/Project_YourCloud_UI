import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FileService, DirectoryItem } from '../file.service';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { formatFileSize, formatDate } from '../utils/utils';

// Interface for breadcrumb path
@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-browser.component.html'
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  nodeId: string = '';
  nodeName: string = '';

  directoryList: DirectoryItem[] = [];
  directoryPath: string[] = [];

  loading: boolean = false;
  error: string = '';
  warning: string = '';

  initialized: boolean = false;

  isUploading: boolean = false;
  uploadStatus: string = '';

  isDownloading: boolean = false;
  downloadStatus: string = '';

  isCreatingDirectory: boolean = false;
  newDirectoryName: string = '';

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private routeSub: Subscription | undefined;
  private directorySub: Subscription | undefined;

  public formatFileSize = formatFileSize;
  public formatDate = formatDate;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public fileService: FileService,
    private authService: AuthService,
    private sessionHandler: SessionHandlerService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe(params => {
      this.nodeId = params['nodeId'];
      this.nodeName = params['nodeName'];
      if (this.nodeId) {
        this.initializeFileSystem();
      }
    });

    // Subscribe to directory changes
    this.directorySub = this.fileService['directory'].subscribe(dir => {
      if (dir) {
        this.fileService.getDirectoryContents().then(contents => {
          this.directoryList = contents;
        });
      } else {
        this.directoryList = [];
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    if (this.directorySub) {
      this.directorySub.unsubscribe();
    }
  }

  triggerFileUpload(): void {
    this.fileInput.nativeElement.click();
  }

  startCreatingDirectory(): void {
    this.isCreatingDirectory = true;
    this.newDirectoryName = '';
    this.error = '';
  }

  cancelCreateDirectory(): void {
    this.isCreatingDirectory = false;
    this.newDirectoryName = '';
  }

  clearMessages(): void {
    this.error = '';
    this.warning = '';
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  getPath(): string {
    return this.directoryPath.join("/") || '/';
  }

  async initializeFileSystem() {
    this.loading = true;
    this.clearMessages();
    this.initialized = false;

    try {
      const password = await this.authService.getUserPassword();
      if (!password) {
        // Session expired - redirect to login immediately
        this.sessionHandler.handleSessionExpired();
        return;
      }

      // Initialize the file service
      const result = await this.fileService.initializePage(password, this.nodeId);

      if (result.success) {
        // Set the initial path
        this.directoryPath = [ '' ];
        
        this.initialized = true;
      } else {
        // Some error occured
        this.error = result.message || 'Unknown error';
      }
    } catch (error: any) {    
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      throw error;
    } finally {
      this.loading = false;
    }
  }

  private updateDirectoryListing(): void {
    this.clearMessages();

    this.fileService.getDirectoryContents().then(contents => {
      this.directoryList = contents;
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const browserFile = input.files?.[0];
    
    if (!browserFile) {
      return;
    }

    this.clearMessages();
    this.isUploading = true;
    this.uploadStatus = `Uploading ${browserFile.name}...`;

    try {
      const result = await this.fileService.uploadFile(browserFile, browserFile.name);

      if (result.success) {
        this.uploadStatus = `Successfully uploaded ${browserFile.name}`;
        this.updateDirectoryListing();
      } else {
        this.error = `Upload failed: ${result.message}`;
        this.uploadStatus = '';
      }
    } catch (error: any) {
      this.error = `Upload failed: ${error.message || 'A critical error occurred.'}`;
      this.uploadStatus = '';
    } finally {
      // Reset the upload UI state after 2 seconds on success/failure
      setTimeout(() => {
        this.isUploading = false;
        this.uploadStatus = '';
      }, 2000);
      
      // Reset the input so the user can select the same file again
      input.value = '';
    }
  }

  async onFileDownload(item: DirectoryItem): Promise<void> {
    // Only allow downloading files, not directories
    if (item.type !== 'file') {
      this.error = 'Cannot download directories';
      return;
    }

    this.clearMessages();
    this.isDownloading = true;
    this.downloadStatus = `Downloading ${item.name}...`;

    try {
      const decryptedBlob = await this.fileService.downloadFile(item);
      if (!(decryptedBlob instanceof Blob)) {
        throw new Error('Download failed: Not a valid file blob.');
      }
      // Create a temporary URL for the Blob and trigger a download
      const url = window.URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = item.name;
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      this.downloadStatus = `Successfully downloaded ${item.name}`;
    } catch (error: any) {
        // Check if this is a session/authentication error
        if (this.sessionHandler.checkAndHandleSessionError(error)) {
          return;
        }

        this.error = `Download failed: ${error.message || 'A critical error occurred.'}`;
    } finally {
      // Reset the download UI state after 2 seconds
      setTimeout(() => {
        this.isDownloading = false;
        this.downloadStatus = '';
      }, 2000);
    }
  }

  // TODO: FIX
  async deleteItem(item: DirectoryItem): Promise<void> {
    // Validate the item
    if (item.type === 'file' && !item.fileChunks[0]) {
      this.error = 'Cannot delete: Invalid item (missing file chunk(s))';
      return;
    } else if (item.type === 'directory' && !item.chunkId) {
      this.error = 'Cannot delete: Invalid item (missing directory ID)';
      return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    // Show loading state
    this.loading = true;
    this.clearMessages();

    try {      
      // Call the file service to delete the item
      await this.fileService.deleteItem(item);
      
      // Refresh the current directory listing after successful deletion
      this.updateDirectoryListing();
      
    } catch (error: any) {
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      throw error;
    } finally {
      this.loading = false;
    }
  }

  async enterDirectory(item: DirectoryItem): Promise<void> {
    if (item.type !== 'directory') {
      return;
    }

    try {
      this.loading = true;
      this.clearMessages();

      const result = await this.fileService.changeDirectory(item.chunkId);

      if (result.success) {
        // Update breadcrumb path
        this.directoryPath.push(item.name);

        // Force refresh the directory listing
        this.updateDirectoryListing();
      } else {
        this.error = result.message || 'Unknown error';
      }
    } catch (error: any) {
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      throw error;
    } finally {
      this.loading = false;
    }
  }
  
  async leaveDirectory(): Promise<void> {
    // Can't leave if we're at the root directory or path is empty
    if (this.directoryPath.length <= 1) {
      return;
    }

    try {
      this.loading = true;
      this.clearMessages();

      // Go to parent
      const result = await this.fileService.leaveDirectory();

      if (result.success) {
        // Update breadcrumb path by removing the last segment
        this.directoryPath.pop();

        // Force refresh the directory listing
        this.updateDirectoryListing();
      } else {
        this.error = result.message || 'Unknown error';
      }
    } catch (error: any) {
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }

      throw error;
    } finally {
      this.loading = false;
    }
  }

  async createNewDirectory(): Promise<void> {
    if (!this.newDirectoryName.trim()) {
      this.warning = 'Directory name cannot be empty';
      return;
    }

    // Validate directory name
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(this.newDirectoryName)) {
      this.warning = 'Directory name contains invalid characters';
      return;
    }

    this.loading = true;
    this.clearMessages();

    try {
      const result = await this.fileService.createSubdirectory(this.newDirectoryName.trim());

      if (result.success) {
        this.isCreatingDirectory = false;
        this.newDirectoryName = '';
      } else {
        this.error = result.message || 'Unknown error';
      }
    } catch (error: any) {
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      throw error;
    } finally {
      this.loading = false;
    }
  }
}
