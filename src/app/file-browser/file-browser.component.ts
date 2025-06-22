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
  validationError: string = '';
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
    this.error = '';
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

    this.isUploading = true;
    this.uploadProgress = 0;
    this.uploadStatus = `Uploading ${browserFile.name}...`;
    this.error = '';

    try {
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
      console.error('Upload failed:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Handle other errors normally
      this.error = `Upload failed: ${error.message || 'Unknown error'}`;
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

    try {      
      // Call the delete API for files
      if (item.type === 'file') {
        await this.fileService.deleteFile(item.chunkId);
      } else {
        // For directories, use the existing deleteChunk method
        await this.fileService.deleteChunk(item.chunkId);
      }
          
      // Refresh the directory listing to reflect the deletion
      await this.initializeFileSystem();
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
      this.error = '';

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
      this.error = '';

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
    this.validationError = '';
  }

  cancelCreateDirectory(): void {
    this.isCreatingDirectory = false;
    this.newDirectoryName = '';
    this.validationError = '';
  }

  async createNewDirectory(): Promise<void> {
    this.validationError = '';
    
    if (!this.newDirectoryName.trim()) {
      this.validationError = 'Directory name cannot be empty';
      return;
    }

    // Validate directory name (basic validation)
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(this.newDirectoryName)) {
      this.validationError = 'Directory name contains invalid characters';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      await this.fileService.createSubdirectory(this.newDirectoryName.trim());
      
      // Success - reset the form
      this.isCreatingDirectory = false;
      this.newDirectoryName = '';
      
    } catch (error: any) {
      console.error('Failed to create directory:', error);
      
      // Check if this is a session/authentication error
      if (this.sessionHandler.checkAndHandleSessionError(error)) {
        return;
      }
      
      // Handle other errors normally
      this.error = `Failed to create directory: ${error.message || 'Unknown error'}`;
    } finally {
      this.loading = false;
    }
  }
}
