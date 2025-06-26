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

  // async onFileSelected(event: Event): Promise<void> {
  //   const input = event.target as HTMLInputElement;
  //   const browserFile = input.files?.[0];
    
  //   if (!browserFile) {
  //     return;
  //   }

  //   // Clear previous warnings and errors
  //   this.clearMessages();

  //   try {
  //     // Calculate total space needed for both file and directory metadata
  //     const metadataSize = await this.fileService.estimateDirectoryMetadataSizeForFile(browserFile.name, browserFile.size);
  //     const totalSpaceNeeded = browserFile.size + metadataSize;

  //     // Check total space needed in one go
  //     await this.fileService.checkStorageCapacity(totalSpaceNeeded, 'file upload and directory metadata');

  //     // Only set upload UI state if storage check passes
  //     this.isUploading = true;
  //     this.uploadProgress = 0;
  //     this.uploadStatus = `Uploading ${browserFile.name}...`;
  //     this.error = ''; // Clear any previous errors
  //     this.warning = ''; // Clear any previous warnings

  //     await this.fileService.uploadFileStream(browserFile, (progress) => {
  //       this.uploadProgress = progress;
  //     });

  //     this.uploadStatus = `Successfully uploaded ${browserFile.name}`;

  //     // Reset upload state after 1 seconds
  //     setTimeout(() => {
  //       this.isUploading = false;
  //       this.uploadStatus = '';
  //       this.uploadProgress = 0;
  //     }, 1000);

  //   } catch (error: any) {
  //     // Check if this is a session/authentication error
  //     if (this.sessionHandler.checkAndHandleSessionError(error)) {
  //       return;
  //     }
      
  //     // Check if this is a storage space warning
  //     if (error.isStorageWarning) {
  //       const requiredSpace = (error.requiredSpace !== undefined && error.requiredSpace !== null) ? this.formatFileSize(error.requiredSpace) : 'unknown';
  //       const availableSpace = (error.availableSpace !== undefined && error.availableSpace !== null) ? this.formatFileSize(error.availableSpace) : 'unknown';
  //       const operationName = error.operationName || 'operation';
  //       this.warning = `Insufficient storage space for ${operationName}. Required: ${requiredSpace}, Available: ${availableSpace}. Upload blocked.`;
        
  //       // Ensure upload state is reset for storage warnings
  //       this.isUploading = false;
  //       this.uploadStatus = '';
  //       this.uploadProgress = 0;
  //       return;
  //     }
      
  //     console.error('Upload failed:', error);
      
  //     // Handle other errors normally
  //     this.error = `Upload failed: ${error.message || 'Unknown error'}`;
      
  //     // Ensure upload state is reset on any error
  //     this.isUploading = false;
  //     this.uploadStatus = '';
  //     this.uploadProgress = 0;
  //   }

  //   // Reset the input
  //   input.value = '';
  // }

  // TODO: FIX
  async deleteItem(item: DirectoryItem): Promise<void> {
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

  // async downloadItem(item: DirectoryItem): Promise<void> {
  //   // Only allow downloading files, not directories
  //   if (item.type !== 'file') {
  //     this.error = 'Cannot download directories';
  //     return;
  //   }

  //   // Validate the item
  //   if (!item.chunkId) {
  //     this.error = 'Cannot download: Invalid item (missing chunk ID)';
  //     return;
  //   }

  //   // Show loading state
  //   this.isDownloading = true;
  //   this.downloadProgress = 0;
  //   this.downloadStatus = `Downloading ${item.name}...`;
  //   this.downloadingFileId = item.chunkId;
  //   this.error = '';

  //   try {      
  //     await this.fileService.downloadFileStream(item.chunkId, (progress) => {
  //       this.downloadProgress = progress;
  //     });
      
  //     this.downloadStatus = `Successfully downloaded ${item.name}`;

  //     // Reset download state after 2 seconds
  //     setTimeout(() => {
  //       this.isDownloading = false;
  //       this.downloadStatus = '';
  //       this.downloadProgress = 0;
  //       this.downloadingFileId = '';
  //     }, 2000);

  //   } catch (error: any) {
  //     console.error('Download failed:', error);
      
  //     // Check if this is a session/authentication error
  //     if (this.sessionHandler.checkAndHandleSessionError(error)) {
  //       return;
  //     }
      
  //     // Handle other errors normally
  //     this.error = `Download failed: ${error.message || 'Unknown error'}`;
  //     this.isDownloading = false;
  //     this.downloadStatus = '';
  //     this.downloadProgress = 0;
  //     this.downloadingFileId = '';
  //   }
  // }

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
