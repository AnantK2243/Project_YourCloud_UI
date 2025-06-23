import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FileService, Directory, File } from '../file.service';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Simplified interface for display purposes
interface DisplayItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  createdAt?: string;
  chunkId: string;
}

// Interface for breadcrumb path
interface PathSegment {
  name: string;
  chunkId: string;
}

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-browser.component.html'
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  nodeId: string = '';
  nodeName: string = '';
  directoryListing: DisplayItem[] = [];
  directoryPath: PathSegment[] = [];
  loading: boolean = false;
  error: string = '';
  warning: string = '';
  initialized: boolean = false;
  uploadProgress: number = 0;
  isUploading: boolean = false;
  uploadStatus: string = '';
  downloadProgress: number = 0;
  isDownloading: boolean = false;
  downloadStatus: string = '';
  downloadingFileId: string = '';
  isCreatingDirectory: boolean = false;
  newDirectoryName: string = '';

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private routeSub: Subscription | undefined;
  private directorySub: Subscription | undefined;

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

    this.directorySub = this.fileService.getDirectoryObservable().subscribe(directory => {
      if (directory) {
        this.updateDirectoryListing(directory);
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

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  formatFileSize(size: number | undefined): string {
    if (size === undefined) return '';
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  }

  getPath(): string {
    return "/" + this.directoryPath.map(segment => segment.name).filter(name => name).join('/');
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
      const chunkId = await this.fileService.initializePage(password, this.nodeId);

      // Set the initial path
      this.directoryPath = [{ name: '', chunkId: chunkId }];

      this.initialized = true;
    } catch (error: any) {
      console.error('Error initializing file system:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Handle other errors normally
      this.error = 'Failed to initialize file system: ' + (error.message || 'Unknown error');
    } finally {
      this.loading = false;
    }
  }

  private updateDirectoryListing(directory: Directory): void {
    // Clear warnings and errors
    this.warning = '';
    this.error = '';

    const directoryItems: DisplayItem[] = directory.directories.map(dir => ({
      type: 'directory',
      name: dir.name,
      chunkId: dir.chunkId
    }));

    const fileItems: DisplayItem[] = directory.files.map(file => ({
      type: 'file',
      name: file.name,
      size: file.size,
      createdAt: file.createdAt,
      chunkId: file.chunkId
    }));

    this.directoryListing = [...directoryItems, ...fileItems].sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') {
        return -1; // Directories first
      }
      if (a.type === 'file' && b.type === 'directory') {
        return 1; // Files after
      }
      return a.name.localeCompare(b.name); // Sort by name otherwise
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const browserFile = input.files?.[0];
    
    if (!browserFile) {
      return;
    }

    // Clear previous warnings and errors
    this.clearMessages();

    try {
      // Calculate total space needed for both file and directory metadata
      const metadataSize = await this.fileService.estimateDirectoryMetadataSizeForFile(browserFile.name, browserFile.size);
      const totalSpaceNeeded = browserFile.size + metadataSize;

      // Check total space needed in one go
      await this.fileService.checkStorageCapacity(totalSpaceNeeded, 'file upload and directory metadata');

      // Only set upload UI state if storage check passes
      this.isUploading = true;
      this.uploadProgress = 0;
      this.uploadStatus = `Uploading ${browserFile.name}...`;
      this.error = ''; // Clear any previous errors
      this.warning = ''; // Clear any previous warnings

      await this.fileService.uploadFileStream(browserFile, (progress) => {
        this.uploadProgress = progress;
      });

      this.uploadStatus = `Successfully uploaded ${browserFile.name}`;

      // Reset upload state after 1 seconds
      setTimeout(() => {
        this.isUploading = false;
        this.uploadStatus = '';
        this.uploadProgress = 0;
      }, 1000);

    } catch (error: any) {
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Check if this is a storage space warning
      if (error.isStorageWarning) {
        const requiredSpace = (error.requiredSpace !== undefined && error.requiredSpace !== null) ? this.formatFileSize(error.requiredSpace) : 'unknown';
        const availableSpace = (error.availableSpace !== undefined && error.availableSpace !== null) ? this.formatFileSize(error.availableSpace) : 'unknown';
        const operationName = error.operationName || 'operation';
        this.warning = `Insufficient storage space for ${operationName}. Required: ${requiredSpace}, Available: ${availableSpace}. Upload blocked.`;
        
        // Ensure upload state is reset for storage warnings
        this.isUploading = false;
        this.uploadStatus = '';
        this.uploadProgress = 0;
        return;
      }
      
      console.error('Upload failed:', error);
      
      // Handle other errors normally
      this.error = `Upload failed: ${error.message || 'Unknown error'}`;
      
      // Ensure upload state is reset on any error
      this.isUploading = false;
      this.uploadStatus = '';
      this.uploadProgress = 0;
    }

    // Reset the input
    input.value = '';
  }

  async deleteItem(item: DisplayItem): Promise<void> {
    // Validate the item
    if (!item.chunkId) {
      this.error = 'Cannot delete: Invalid item (missing chunk ID)';
      return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    // Show loading state
    this.loading = true;
    this.error = '';
    this.warning = '';

    try {      
      // Call the appropriate delete method
      if (item.type === 'file') {
        await this.fileService.deleteFile(item.chunkId);
      } else if (item.type === 'directory') {
        const result = await this.fileService.deleteDirectory(item.chunkId);
        if (!result.success) {
          this.warning = result.message || 'Failed to delete directory';
          this.loading = false;
          return;
        }
      }
      
      // Refresh the current directory listing after successful deletion
      const currentDirectory = this.fileService.getCurrentDirectory();
      if (currentDirectory) {
        this.updateDirectoryListing(currentDirectory);
      }
      
    } catch (error: any) {
      console.error('Delete failed:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Handle other errors normally
      this.error = `Delete failed: ${error.message || 'Unknown error'}`;
    } finally {
      this.loading = false;
    }
  }

  async enterDirectory(item: DisplayItem): Promise<void> {
    if (item.type !== 'directory') {
      return;
    }

    try {
      this.loading = true;
      this.clearMessages();

      await this.fileService.changeDirectory(item.chunkId);
      
      // Update breadcrumb path
      this.directoryPath.push({ name: item.name, chunkId: item.chunkId });

      // Force refresh the directory listing to ensure UI is updated
      const currentDirectory = this.fileService.getCurrentDirectory();
      if (currentDirectory) {
        this.updateDirectoryListing(currentDirectory);
      }

    } catch (error: any) {
      console.error('Navigation failed:', error);
      
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      this.error = `Failed to open directory: ${error.message || 'Unknown error'}`;
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
      await this.fileService.leaveDirectory();

      // Update breadcrumb path by removing the last segment
      this.directoryPath.pop();

      // Force refresh the directory listing to ensure UI is updated
      const currentDirectory = this.fileService.getCurrentDirectory();
      if (currentDirectory) {
        this.updateDirectoryListing(currentDirectory);
      }

    } catch (error: any) {
      console.error('Navigation up failed:', error);
      
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      this.error = `Failed to navigate up: ${error.message || 'Unknown error'}`;
    } finally {
      this.loading = false;
    }
  }

  async downloadItem(item: DisplayItem): Promise<void> {
    // Only allow downloading files, not directories
    if (item.type !== 'file') {
      this.error = 'Cannot download directories';
      return;
    }

    // Validate the item
    if (!item.chunkId) {
      this.error = 'Cannot download: Invalid item (missing chunk ID)';
      return;
    }

    // Show loading state
    this.isDownloading = true;
    this.downloadProgress = 0;
    this.downloadStatus = `Downloading ${item.name}...`;
    this.downloadingFileId = item.chunkId;
    this.error = '';

    try {      
      await this.fileService.downloadFileStream(item.chunkId, (progress) => {
        this.downloadProgress = progress;
      });
      
      this.downloadStatus = `Successfully downloaded ${item.name}`;

      // Reset download state after 2 seconds
      setTimeout(() => {
        this.isDownloading = false;
        this.downloadStatus = '';
        this.downloadProgress = 0;
        this.downloadingFileId = '';
      }, 2000);

    } catch (error: any) {
      console.error('Download failed:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Handle other errors normally
      this.error = `Download failed: ${error.message || 'Unknown error'}`;
      this.isDownloading = false;
      this.downloadStatus = '';
      this.downloadProgress = 0;
      this.downloadingFileId = '';
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

  async createNewDirectory(): Promise<void> {
    if (!this.newDirectoryName.trim()) {
      this.warning = 'Directory name cannot be empty';
      return;
    }

    // Validate directory name (basic validation)
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(this.newDirectoryName)) {
      this.warning = 'Directory name contains invalid characters';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      // Check storage space BEFORE attempting directory creation
      const estimatedSize = await this.fileService.estimateDirectoryMetadataSize(this.newDirectoryName.trim());
      await this.fileService.checkStorageCapacity(estimatedSize, 'directory metadata storage');

      // Only proceed with directory creation if storage check passes
      await this.fileService.createSubdirectory(this.newDirectoryName.trim());
      
      // Success - reset the form
      this.isCreatingDirectory = false;
      this.newDirectoryName = '';
      
    } catch (error: any) {
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Check if this is a storage space warning
      if (error.isStorageWarning) {
        const requiredSpace = (error.requiredSpace !== undefined && error.requiredSpace !== null) ? this.formatFileSize(error.requiredSpace) : 'unknown';
        const availableSpace = (error.availableSpace !== undefined && error.availableSpace !== null) ? this.formatFileSize(error.availableSpace) : 'unknown';
        const operationName = error.operationName || 'directory creation';
        this.warning = `Insufficient storage space for ${operationName}. Required: ${requiredSpace}, Available: ${availableSpace}. Directory creation cancelled.`;
        return;
      }
      
      console.error('Failed to create directory:', error);
      
      // Handle other errors normally
      this.error = `Failed to create directory: ${error.message || 'Unknown error'}`;
    } finally {
      this.loading = false;
    }
  }

  // Clear any warnings
  clearWarnings(): void {
    this.warning = '';
  }

  // Clear any errors and warnings
  clearMessages(): void {
    this.error = '';
    this.warning = '';
  }
}
