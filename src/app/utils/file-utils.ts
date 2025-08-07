// src/app/utils/file-utils.ts

// File download utilities
export function downloadBlob(blob: Blob, filename: string): void {
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	window.URL.revokeObjectURL(url);
}

// File selection and management utilities
export interface FileItem {
	name: string;
	type: 'file' | 'directory';
	size?: number;
	lastModified?: string;
	path: string;
}

export function isItemSelected(item: FileItem, selectedItems: FileItem[]): boolean {
	return selectedItems.some(
		selected =>
			selected.name === item.name &&
			selected.path === item.path &&
			selected.type === item.type
	);
}

export function toggleItemSelection(item: FileItem, selectedItems: FileItem[]): FileItem[] {
	const isSelected = isItemSelected(item, selectedItems);

	if (isSelected) {
		return selectedItems.filter(
			selected =>
				!(
					selected.name === item.name &&
					selected.path === item.path &&
					selected.type === item.type
				)
		);
	} else {
		return [...selectedItems, item];
	}
}

export function selectAllItems(items: FileItem[]): FileItem[] {
	return [...items];
}

export function clearSelection(): FileItem[] {
	return [];
}

// Path utilities
export function joinPath(basePath: string, ...segments: string[]): string {
	const cleanBase = basePath.replace(/\/+$/, ''); // Remove trailing slashes
	const cleanSegments = segments
		.filter(segment => segment) // Remove empty segments
		.map(segment => segment.replace(/^\/+|\/+$/g, '')); // Remove leading/trailing slashes

	if (cleanSegments.length === 0) {
		return cleanBase || '/';
	}

	return cleanBase + '/' + cleanSegments.join('/');
}

export function getParentPath(path: string): string {
	if (!path || path === '/') {
		return '/';
	}

	const cleanPath = path.replace(/\/+$/, ''); // Remove trailing slashes
	const lastSlashIndex = cleanPath.lastIndexOf('/');

	if (lastSlashIndex <= 0) {
		return '/';
	}

	return cleanPath.substring(0, lastSlashIndex);
}

export function getFileName(path: string): string {
	if (!path) {
		return '';
	}

	const cleanPath = path.replace(/\/+$/, ''); // Remove trailing slashes
	const lastSlashIndex = cleanPath.lastIndexOf('/');

	if (lastSlashIndex === -1) {
		return cleanPath;
	}

	return cleanPath.substring(lastSlashIndex + 1);
}

// File type utilities
export function getFileExtension(filename: string): string {
	const lastDotIndex = filename.lastIndexOf('.');
	if (lastDotIndex === -1 || lastDotIndex === 0) {
		return '';
	}
	return filename.substring(lastDotIndex + 1).toLowerCase();
}

export function isImageFile(filename: string): boolean {
	const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
	const extension = getFileExtension(filename);
	return imageExtensions.includes(extension);
}

export function isVideoFile(filename: string): boolean {
	const videoExtensions = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'];
	const extension = getFileExtension(filename);
	return videoExtensions.includes(extension);
}

export function isAudioFile(filename: string): boolean {
	const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
	const extension = getFileExtension(filename);
	return audioExtensions.includes(extension);
}

export function isDocumentFile(filename: string): boolean {
	const documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
	const extension = getFileExtension(filename);
	return documentExtensions.includes(extension);
}

// Validation utilities
export function validateFileName(name: string): { isValid: boolean; message?: string } {
	if (!name || name.trim() === '') {
		return { isValid: false, message: 'File name cannot be empty' };
	}

	if (name.length > 255) {
		return { isValid: false, message: 'File name is too long (max 255 characters)' };
	}

	// Check for invalid characters
	const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
	if (invalidChars.test(name)) {
		return { isValid: false, message: 'File name contains invalid characters' };
	}

	// Check for reserved names on Windows
	const reservedNames = [
		'CON',
		'PRN',
		'AUX',
		'NUL',
		'COM1',
		'COM2',
		'COM3',
		'COM4',
		'COM5',
		'COM6',
		'COM7',
		'COM8',
		'COM9',
		'LPT1',
		'LPT2',
		'LPT3',
		'LPT4',
		'LPT5',
		'LPT6',
		'LPT7',
		'LPT8',
		'LPT9'
	];

	const nameWithoutExt = name.split('.')[0].toUpperCase();
	if (reservedNames.includes(nameWithoutExt)) {
		return { isValid: false, message: 'File name is reserved and cannot be used' };
	}

	return { isValid: true };
}

export function validateDirectoryName(name: string): { isValid: boolean; message?: string } {
	if (!name || name.trim() === '') {
		return { isValid: false, message: 'Directory name cannot be empty' };
	}

	if (name === '.' || name === '..') {
		return { isValid: false, message: 'Directory name cannot be "." or ".."' };
	}

	return validateFileName(name); // Same rules as file names
}
