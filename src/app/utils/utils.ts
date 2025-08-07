// src/app/utils/utils.ts

export function formatFileSize(size: number | undefined): string {
	if (size === undefined) return '';
	if (size === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(size) / Math.log(k));
	return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(dateString: string | undefined): string {
	if (!dateString) return '';
	return new Date(dateString).toLocaleDateString();
}

export function uint8ArrayToBase64(array: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < array.byteLength; i++) {
		binary += String.fromCharCode(array[i]);
	}
	return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
