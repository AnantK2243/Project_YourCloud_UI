import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FileService, Directory, File } from '../file.service';
import { AuthService } from '../auth.service';
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
    private authService: AuthService
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
        throw new Error('User password not found. Please log in again.');
      }

      // Initialize the file service
      const chunkId = await this.fileService.initializePage(password, this.nodeId);

      // Set the initial path
      this.directoryPath = [{ name: '', chunkId: chunkId }];

      this.initialized = true;
    } catch (error: any) {
      console.error('Error initializing file system:', error);
      this.error = 'Failed to initialize file system: ' + (error.message || 'Unknown error');
      if (error.message.includes('password')) {
        setTimeout(() => this.router.navigate(['/login']), 2000);
      }
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

      // Reset upload state after 2 seconds
      setTimeout(() => {
        this.isUploading = false;
        this.uploadStatus = '';
        this.uploadProgress = 0;
      }, 2000);

    } catch (error: any) {
      console.error('Upload failed:', error);
      this.error = `Upload failed: ${error.message || 'Unknown error'}`;
      this.isUploading = false;
      this.uploadStatus = '';
      this.uploadProgress = 0;
    }

    // Reset the input
    input.value = '';
  }

  triggerFileUpload(): void {
    this.fileInput.nativeElement.click();
  }
}
