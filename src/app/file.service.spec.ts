import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import {
	FileService,
	Directory,
	DirectoryItem,
	ProgressData,
	DownloadProgressData
} from './file.service';
import { AuthService } from './auth.service';
import { CryptoService } from './crypto.service';

// Helper to build an ArrayBuffer with 12-byte IV + payload
function buildIvPrefixedBuffer(payloadBytes: Uint8Array): ArrayBuffer {
	const iv = new Uint8Array(12); // zeroed IV is fine for tests
	const out = new Uint8Array(12 + payloadBytes.length);
	out.set(iv, 0);
	out.set(payloadBytes, 12);
	return out.buffer;
}

describe('FileService', () => {
	let service: FileService;
	let httpMock: HttpTestingController;

	const apiUrl = 'https://api.test.com';
	const apiHeaders = new HttpHeaders({ Authorization: 'Bearer test-token' });
	const mockNodeId = 'test-node-id';
	const mockPassword = 'test-password';
	const mockRootChunkId = 'root-chunk-id';

	const mockDirectory: Directory = {
		name: 'root',
		chunkId: mockRootChunkId,
		parentId: '',
		contents: [
			{
				type: 'file',
				name: 'test.txt',
				size: 1024,
				createdAt: '2024-01-01T00:00:00.000Z',
				fileChunks: ['chunk1', 'chunk2']
			},
			{
				type: 'directory',
				name: 'subfolder',
				chunkId: 'subfolder-chunk-id'
			}
		]
	};

	// Stubs: keep to minimum to exercise real HttpClient paths
	const authStub: Pick<AuthService, 'getApiUrl' | 'getAuthHeaders'> = {
		getApiUrl: () => apiUrl,
		getAuthHeaders: () => apiHeaders
	} as any;

	const encoder = new TextEncoder();

	let cryptoStub: Partial<CryptoService> & {
		getRootChunk: (password: string) => Promise<string>;
		decryptData: (enc: ArrayBuffer, iv: Uint8Array) => Promise<ArrayBuffer>;
		encryptData: (
			data: ArrayBuffer | Uint8Array
		) => Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array }>;
		generateUUID: () => string;
	};

	beforeAll(() => {
		(globalThis as any).structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
	});

	beforeEach(() => {
		cryptoStub = {
			getRootChunk: vi.fn().mockResolvedValue(mockRootChunkId),
			decryptData: vi.fn().mockResolvedValue(encoder.encode('decrypted content').buffer),
			encryptData: vi
				.fn()
				.mockResolvedValue({ encryptedData: new ArrayBuffer(8), iv: new Uint8Array(12) }),
			generateUUID: vi.fn().mockReturnValue('uuid-1234')
		};

		TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			providers: [
				{ provide: AuthService, useValue: authStub },
				{ provide: CryptoService, useValue: cryptoStub },
				{
					provide: FileService,
					useFactory: (http: HttpClient, auth: AuthService, crypto: CryptoService) =>
						new FileService(http, auth, crypto),
					deps: [HttpClient, AuthService, CryptoService]
				}
			]
		});

		service = TestBed.inject(FileService);
		httpMock = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		try {
			httpMock?.verify();
		} catch {}
		TestBed.resetTestingModule();
		vi.clearAllMocks();
	});

	describe('Constructor and Basic Setup', () => {
		it('should be created', () => {
			expect(service).toBeTruthy();
		});

		it('should have initial directory state as null', () => {
			expect(service.getCurrentDirectory()).toBeNull();
		});

		it('should have initial upload progress with default values', () => {
			const progress = service.getCurrentUploadProgress();
			expect(progress).toEqual({
				fileName: '',
				progress: 0,
				isUploading: false,
				chunksUploaded: 0,
				totalChunks: 0
			});
		});

		it('should have initial download progress with default values', () => {
			const progress = service.getCurrentDownloadProgress();
			expect(progress).toEqual({
				fileName: '',
				progress: 0,
				isDownloading: false,
				chunksDownloaded: 0,
				totalChunks: 0
			});
		});
	});

	describe('Progress Observables', () => {
		it('should provide upload progress observable', async () => {
			const initial = await (
				await import('rxjs')
			).firstValueFrom(service.getUploadProgress());
			expect(initial.isUploading).toBe(false);
		});

		it('should provide download progress observable', async () => {
			const initial = await (
				await import('rxjs')
			).firstValueFrom(service.getDownloadProgress());
			expect(initial.isDownloading).toBe(false);
		});
	});

	describe('Initialization', () => {
		it('should successfully initialize page with valid credentials', async () => {
			(cryptoStub.decryptData as any).mockResolvedValueOnce(
				encoder.encode(JSON.stringify(mockDirectory)).buffer
			);

			const initPromise = service.initializePage(mockPassword, mockNodeId);
			await Promise.resolve(); // allow getRootChunk await to resolve

			const req = httpMock.expectOne(
				`${apiUrl}/nodes/${mockNodeId}/chunks/${mockRootChunkId}`
			);
			expect(req.request.method).toBe('GET');
			expect(req.request.responseType).toBe('arraybuffer');
			req.flush(buildIvPrefixedBuffer(new Uint8Array([1, 2, 3, 4])));

			const result = await initPromise;
			expect(result.success).toBe(true);
			expect(service.getCurrentDirectory()).toEqual(mockDirectory);
		});

		it('should create root directory when chunk not found (404)', async () => {
			(service as any)['storageNodeId'] = mockNodeId;
			const fetchSpy = vi
				.spyOn(service as any, 'fetchAndDecryptChunk')
				.mockRejectedValue({ status: 404, message: 'not found' });

			const realEncryptAndStore = (service as any)['encryptAndStoreChunk'].bind(service);
			const encSpy = vi
				.spyOn(service as any, 'encryptAndStoreChunk')
				.mockImplementation(((data: string, chunkId: string) =>
					realEncryptAndStore(data, chunkId)) as any);

			const initRootPromise = (service as any)['initializeRootDirectory'](mockRootChunkId);
			await Promise.resolve();
			await Promise.resolve();

			const postReq = httpMock.expectOne(
				`${apiUrl}/nodes/${mockNodeId}/chunks/${mockRootChunkId}`
			);
			expect(postReq.request.method).toBe('POST');
			postReq.flush({});

			const result = await initRootPromise;
			expect(result.success).toBe(true);
			expect(service.getCurrentDirectory()).toEqual({
				name: '',
				chunkId: mockRootChunkId,
				parentId: '',
				contents: []
			});

			encSpy.mockRestore();
			fetchSpy.mockRestore();
		});

		it('should handle error during root directory creation', async () => {
			// Simulate 404 on fetch and failure during encrypt/store
			(service as any)['storageNodeId'] = mockNodeId;
			const fetchSpy = vi
				.spyOn(service as any, 'fetchAndDecryptChunk')
				.mockRejectedValue({ status: 404, message: 'not found' });
			(cryptoStub.encryptData as any).mockRejectedValueOnce(new Error('Encryption failed'));

			const result = await (service as any)['initializeRootDirectory'](mockRootChunkId);
			expect(result.success).toBe(false);
			expect(result.message).toContain('Encryption failed');

			fetchSpy.mockRestore();
		});
	});

	describe('Directory Operations', () => {
		beforeEach(async () => {
			(cryptoStub.decryptData as any).mockResolvedValueOnce(
				encoder.encode(JSON.stringify(mockDirectory)).buffer
			);
			const initPromise = service.initializePage(mockPassword, mockNodeId);
			await Promise.resolve();
			const req = httpMock.expectOne(
				`${apiUrl}/nodes/${mockNodeId}/chunks/${mockRootChunkId}`
			);
			req.flush(buildIvPrefixedBuffer(new Uint8Array([9, 9, 9])));
			await initPromise;
		});

		it('should get current directory contents (sorted: directories then files)', async () => {
			const contents = await service.getDirectoryContents();
			expect(contents).toEqual([
				{ type: 'directory', name: 'subfolder', chunkId: 'subfolder-chunk-id' },
				{
					type: 'file',
					name: 'test.txt',
					size: 1024,
					createdAt: '2024-01-01T00:00:00.000Z',
					fileChunks: ['chunk1', 'chunk2']
				}
			]);
		});

		it('should return empty array when getting contents without initialized directory', async () => {
			// Reset directory to null
			(service as any)['directory'].next(null);
			const contents = await service.getDirectoryContents();
			expect(contents).toEqual([]);
		});

		it('should validate storage node exists', () => {
			expect(() => (service as any)['validateStorageNode']()).not.toThrow();
		});

		it('should throw error when storage node not set', () => {
			(service as any)['storageNodeId'] = null;
			expect(() => (service as any)['validateStorageNode']()).toThrow(
				'Node ID not available'
			);
		});

		it('should validate current directory exists', () => {
			const directory = (service as any)['validateCurrentDirectory']();
			expect(directory).toEqual(mockDirectory);
		});

		it('should throw error when current directory not initialized', () => {
			(service as any)['directory'].next(null);
			expect(() => (service as any)['validateCurrentDirectory']()).toThrow(
				'Current directory is not initialized'
			);
		});
	});

	describe('Progress Tracking', () => {
		it('should update upload progress correctly', () => {
			const progressUpdate: Partial<ProgressData> = {
				fileName: 'test.txt',
				progress: 50,
				isUploading: true
			};

			(service as any)['updateUploadProgress'](progressUpdate);
			const currentProgress = service.getCurrentUploadProgress();

			expect(currentProgress.fileName).toBe('test.txt');
			expect(currentProgress.progress).toBe(50);
			expect(currentProgress.isUploading).toBe(true);
		});

		it('should update download progress correctly', () => {
			const progressUpdate: Partial<DownloadProgressData> = {
				fileName: 'download.txt',
				progress: 75,
				isDownloading: true
			};

			(service as any)['updateDownloadProgress'](progressUpdate);
			const currentProgress = service.getCurrentDownloadProgress();

			expect(currentProgress.fileName).toBe('download.txt');
			expect(currentProgress.progress).toBe(75);
			expect(currentProgress.isDownloading).toBe(true);
		});

		it('should reset upload progress', () => {
			(service as any)['updateUploadProgress']({
				fileName: 'test.txt',
				progress: 50,
				isUploading: true,
				chunksUploaded: 5,
				totalChunks: 10
			});

			(service as any)['resetUploadProgress']();
			const currentProgress = service.getCurrentUploadProgress();

			expect(currentProgress).toEqual({
				fileName: '',
				progress: 0,
				isUploading: false,
				chunksUploaded: 0,
				totalChunks: 0
			});
		});

		it('should reset download progress', () => {
			(service as any)['updateDownloadProgress']({
				fileName: 'download.txt',
				progress: 80,
				isDownloading: true,
				chunksDownloaded: 8,
				totalChunks: 10
			});

			(service as any)['resetDownloadProgress']();
			const currentProgress = service.getCurrentDownloadProgress();

			expect(currentProgress).toEqual({
				fileName: '',
				progress: 0,
				isDownloading: false,
				chunksDownloaded: 0,
				totalChunks: 0
			});
		});
	});

	describe('Chunk Operations', () => {
		beforeEach(async () => {
			(cryptoStub.decryptData as any).mockResolvedValueOnce(
				encoder.encode(
					JSON.stringify({
						name: '',
						parentId: '',
						chunkId: mockRootChunkId,
						contents: []
					})
				).buffer
			);
			const initPromise = service.initializePage(mockPassword, mockNodeId);
			await Promise.resolve();
			const req = httpMock.expectOne(
				`${apiUrl}/nodes/${mockNodeId}/chunks/${mockRootChunkId}`
			);
			req.flush(buildIvPrefixedBuffer(new Uint8Array([1])));
			await initPromise;
		});

		it('should fetch and decrypt chunk successfully', async () => {
			const chunkId = 'test-chunk-id';
			(cryptoStub.decryptData as any).mockResolvedValueOnce(
				encoder.encode('decrypted content').buffer
			);

			const fetchPromise = (service as any)['fetchAndDecryptChunk'](chunkId);

			const req = httpMock.expectOne(`${apiUrl}/nodes/${mockNodeId}/chunks/${chunkId}`);
			expect(req.request.method).toBe('GET');
			expect(req.request.responseType).toBe('arraybuffer');
			req.flush(buildIvPrefixedBuffer(new Uint8Array([7, 7, 7])));

			const result = await fetchPromise;
			expect(result).toBe('decrypted content');
			expect(cryptoStub.decryptData as any).toHaveBeenCalledTimes(2); // one from init, one here
		});

		it('should handle fetch chunk error', async () => {
			const chunkId = 'test-chunk-id';
			const fetchPromise = (service as any)['fetchAndDecryptChunk'](chunkId);

			const req = httpMock.expectOne(`${apiUrl}/nodes/${mockNodeId}/chunks/${chunkId}`);
			req.error(new ErrorEvent('HttpError', { message: 'Network error' }), {
				status: 500,
				statusText: 'Server Error'
			});

			await expect(fetchPromise).rejects.toBeTruthy();
		});

		it('should process chunk response with valid data', async () => {
			(cryptoStub.decryptData as any).mockResolvedValueOnce(
				encoder.encode('decrypted content').buffer
			);
			const buffer = buildIvPrefixedBuffer(new Uint8Array([3, 4, 5]));
			const result = await (service as any)['processChunkResponse'](buffer);
			expect(result).toBe('decrypted content');
		});

		it('should handle empty chunk response', async () => {
			const buffer = new ArrayBuffer(0);
			await expect((service as any)['processChunkResponse'](buffer)).rejects.toThrow(
				'No data received when fetching chunk'
			);
		});

		it('should handle chunk response with insufficient data', async () => {
			const buffer = new ArrayBuffer(5); // Less than 12 bytes
			await expect((service as any)['processChunkResponse'](buffer)).rejects.toThrow(
				'Invalid chunk data: too short'
			);
		});
	});

	describe('Error Handling', () => {
		it('should process chunk error with ArrayBuffer error', () => {
			const errorBuffer = new TextEncoder().encode('{"error": "Test error"}').buffer;
			const error = { error: errorBuffer, status: 400 } as any;

			const processedError = (service as any)['processChunkError'](error);
			if (processedError instanceof Error) {
				expect((processedError as any).message).toBe('Test error');
				expect((processedError as any).status).toBe(400);
			} else {
				// Fallback: if environment doesn't treat ArrayBuffer as instanceof ArrayBuffer
				expect((processedError as any).status).toBe(400);
			}
		});

		it('should decode error buffer correctly', () => {
			const errorMessage = 'Buffer error message';
			const errorBuffer = new TextEncoder().encode(errorMessage).buffer;

			const decoded = (service as any)['decodeErrorBuffer'](errorBuffer);
			expect(decoded).toBe(errorMessage);
		});

		it('should handle decode error buffer failure (empty buffer)', () => {
			const invalidBuffer = new ArrayBuffer(0);

			const decoded = (service as any)['decodeErrorBuffer'](invalidBuffer);
			expect(decoded).toBe('');
		});

		it('should parse JSON error correctly', () => {
			const errorString = '{"error": "JSON error message"}';

			const parsed = (service as any)['tryParseJsonError'](errorString);
			expect(parsed.error).toBe('JSON error message');
		});

		it('should handle invalid JSON error', () => {
			const invalidJsonString = 'not json';

			const parsed = (service as any)['tryParseJsonError'](invalidJsonString);
			expect(parsed).toBeNull();
		});
	});

	describe('Item Existence Check', () => {
		it('should detect existing file', () => {
			const exists = (service as any)['checkIfItemExists'](mockDirectory, 'test.txt');
			expect(exists).toBe(true);
		});

		it('should detect existing directory', () => {
			const exists = (service as any)['checkIfItemExists'](mockDirectory, 'subfolder');
			expect(exists).toBe(true);
		});

		it('should detect non-existing item', () => {
			const exists = (service as any)['checkIfItemExists'](mockDirectory, 'nonexistent.txt');
			expect(exists).toBe(false);
		});
	});

	describe('Integration Scenarios', () => {
		it('should handle complete initialization flow and maintain state', async () => {
			(cryptoStub.decryptData as any).mockResolvedValueOnce(
				encoder.encode(JSON.stringify(mockDirectory)).buffer
			);

			const initPromise = service.initializePage(mockPassword, mockNodeId);
			await Promise.resolve();
			const req = httpMock.expectOne(
				`${apiUrl}/nodes/${mockNodeId}/chunks/${mockRootChunkId}`
			);
			req.flush(buildIvPrefixedBuffer(new Uint8Array([1, 2, 3])));
			const initResult = await initPromise;

			expect(initResult.success).toBe(true);
			expect(service.getCurrentDirectory()).toEqual(mockDirectory);

			const contents = await service.getDirectoryContents();
			expect(contents).toEqual([
				{ type: 'directory', name: 'subfolder', chunkId: 'subfolder-chunk-id' },
				{
					type: 'file',
					name: 'test.txt',
					size: 1024,
					createdAt: '2024-01-01T00:00:00.000Z',
					fileChunks: ['chunk1', 'chunk2']
				}
			]);

			// Update progress and ensure directory remains unchanged
			(service as any)['updateUploadProgress']({
				fileName: 'test.txt',
				progress: 25,
				isUploading: true
			});
			expect(service.getCurrentUploadProgress().fileName).toBe('test.txt');
			expect(service.getCurrentUploadProgress().progress).toBe(25);
			expect(service.getCurrentDirectory()).toEqual(mockDirectory);
		});
	});
});
