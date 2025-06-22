import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FileService, Directory, File } from '../file.service';
import { AuthService } from '../auth.service';
import { SessionHandlerService } from '../session-handler.service';
import { CommonModule } from '@angular/common';

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
  imports: [CommonModule],
  templateUrl: './file-browser.component.html'
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  nodeId: string = '';
  nodeName: string = '';
  directoryListing: DisplayItem[] = [];
  directoryPath: PathSegment[] = [];
  loading: boolean = false;
  error: string = '';
  initialized: boolean = false;
  uploadProgress: number = 0;
  isUploading: boolean = false;
  uploadStatus: string = '';

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

  triggerFileUpload(): void {
    this.fileInput.nativeElement.click();
  }
}
