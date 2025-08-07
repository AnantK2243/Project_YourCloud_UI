// src/app/utils/node-utils.ts

import { StorageNode } from '../node.service';

// Node status utilities
export function getNodeStatusColor(status: string): string {
	switch (status) {
		case 'online':
			return 'text-green-600 bg-green-100/50';
		case 'offline':
			return 'text-red-600 bg-red-100/50';
		case 'pending':
			return 'text-yellow-600 bg-yellow-100/50';
		default:
			return 'text-gray-600 bg-gray-100/50';
	}
}

export function getNodeStatusText(status: string): string {
	switch (status) {
		case 'online':
			return 'Online';
		case 'offline':
			return 'Offline';
		case 'pending':
			return 'Pending';
		default:
			return 'Unknown';
	}
}

// Storage calculation utilities
export function calculateStoragePercentage(used: number, total: number): number {
	if (total <= 0) return 0;
	return Math.min(Math.round((used / total) * 100), 100);
}

export function formatStorageInfo(used: number, total: number): string {
	if (total <= 0) return 'No storage info';

	const percentage = calculateStoragePercentage(used, total);
	return `${formatBytes(used)} / ${formatBytes(total)} (${percentage}%)`;
}

// Storage formatting (enhanced version of existing formatFileSize)
export function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined || bytes === null) return '0 B';
	if (bytes === 0) return '0 B';

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	if (i >= sizes.length) {
		return `${parseFloat((bytes / Math.pow(k, sizes.length - 1)).toFixed(2))} ${sizes[sizes.length - 1]}`;
	}

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Node validation utilities
export function validateNodeName(name: string): { isValid: boolean; message?: string } {
	if (!name || name.trim() === '') {
		return { isValid: false, message: 'Node name is required' };
	}

	const trimmedName = name.trim();

	if (trimmedName.length < 3) {
		return { isValid: false, message: 'Node name must be at least 3 characters long' };
	}

	if (trimmedName.length > 50) {
		return { isValid: false, message: 'Node name must be 50 characters or less' };
	}

	// Allow alphanumeric characters, spaces, hyphens, and underscores
	if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
		return {
			isValid: false,
			message: 'Node name can only contain letters, numbers, spaces, hyphens, and underscores'
		};
	}

	return { isValid: true };
}

// Node filtering and sorting utilities
export function sortNodesByStatus(nodes: StorageNode[]): StorageNode[] {
	const statusOrder = { online: 0, pending: 1, offline: 2 };

	return [...nodes].sort((a, b) => {
		const aOrder = statusOrder[a.status as keyof typeof statusOrder] ?? 3;
		const bOrder = statusOrder[b.status as keyof typeof statusOrder] ?? 3;

		if (aOrder !== bOrder) {
			return aOrder - bOrder;
		}

		// If status is the same, sort by name
		return a.node_name.localeCompare(b.node_name);
	});
}

export function filterNodesByStatus(nodes: StorageNode[], status: string): StorageNode[] {
	return nodes.filter(node => node.status === status);
}

export function getOnlineNodes(nodes: StorageNode[]): StorageNode[] {
	return filterNodesByStatus(nodes, 'online');
}

export function getOfflineNodes(nodes: StorageNode[]): StorageNode[] {
	return filterNodesByStatus(nodes, 'offline');
}

// Node statistics utilities
export interface NodeStatistics {
	totalNodes: number;
	onlineNodes: number;
	offlineNodes: number;
	pendingNodes: number;
	totalStorage: number;
	usedStorage: number;
	availableStorage: number;
}

export function calculateNodeStatistics(nodes: StorageNode[]): NodeStatistics {
	const stats: NodeStatistics = {
		totalNodes: nodes.length,
		onlineNodes: 0,
		offlineNodes: 0,
		pendingNodes: 0,
		totalStorage: 0,
		usedStorage: 0,
		availableStorage: 0
	};

	nodes.forEach(node => {
		// Count by status
		switch (node.status) {
			case 'online':
				stats.onlineNodes++;
				break;
			case 'offline':
				stats.offlineNodes++;
				break;
			case 'pending':
				stats.pendingNodes++;
				break;
		}

		// Calculate storage (only for online nodes)
		if (node.status === 'online' && node.total_available_space > 0) {
			stats.totalStorage += node.total_available_space;
			stats.usedStorage += node.used_space || 0;
		}
	});

	stats.availableStorage = stats.totalStorage - stats.usedStorage;

	return stats;
}

// Time utilities for node management
export function formatLastSeen(lastSeen: string | undefined): string {
	if (!lastSeen) return 'Never';

	const date = new Date(lastSeen);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMinutes < 1) {
		return 'Just now';
	} else if (diffMinutes < 60) {
		return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
	} else if (diffHours < 24) {
		return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
	} else if (diffDays < 7) {
		return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
	} else {
		return date.toLocaleDateString();
	}
}

export function isNodeStale(
	lastSeen: string | undefined,
	staleThresholdMinutes: number = 60
): boolean {
	if (!lastSeen) return true;

	const date = new Date(lastSeen);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMinutes = Math.floor(diffMs / (1000 * 60));

	return diffMinutes > staleThresholdMinutes;
}
