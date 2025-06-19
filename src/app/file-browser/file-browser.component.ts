import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FileService, Directory, File as AppFile } from '../file.service';
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

  private routeSub: Subscription | undefined;

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
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
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

  get currentDirectoryName(): string {
    return this.directoryPath.length > 0 ? this.directoryPath[this.directoryPath.length - 1].name : '';
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
      this.directoryPath = [{ name: '/', chunkId: chunkId }];

      // Load the root directory contents
      await this.loadCurrentDirectory();

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

  private async loadCurrentDirectory(): Promise<void> {
    this.loading = true;
    try {
      const fileList = await this.fileService.getDirectoryFiles();
      this.directoryListing = fileList.map(file => ({
        name: file.name,
        type: file.type,
        size: file.type === 'file' ? file.size : undefined,
        createdAt: file.type === 'file' ? file.createdAt : undefined,
        chunkId: file.chunkId
      }));
    } catch (err) {
      this.error = `Failed to load directory contents.`;
      console.error(err);
    } finally {
      this.loading = false;
    }
  }

  async handleItemClick(item: DisplayItem): Promise<void> {
    if (item.type === 'directory') {
      // Add new segment to path and load the directory
      this.directoryPath.push({ name: item.name, chunkId: item.chunkId });
      await this.loadCurrentDirectory();
    } else {
      // Handle file click (e.g., download)
      console.log('File clicked:', item.name);
      // this.downloadFile(item);
    }
  }

  async navigateTo(pathIndex: number): Promise<void> {
    if (pathIndex < 0 || pathIndex >= this.directoryPath.length - 1) {
      return; // Cannot navigate to current directory or out of bounds
    }

    const targetSegment = this.directoryPath[pathIndex];
    this.directoryPath = this.directoryPath.slice(0, pathIndex + 1);
    await this.loadCurrentDirectory();
  }
}
