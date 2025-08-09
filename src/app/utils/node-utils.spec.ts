// File: src/app/utils/node-utils.spec.ts - Tests node utility helpers (status, storage, validation)
import {
	getNodeStatusColor,
	getNodeStatusText,
	calculateStoragePercentage,
	formatStorageInfo,
	formatBytes,
	validateNodeName,
	sortNodesByStatus,
	filterNodesByStatus,
	getOnlineNodes,
	getOfflineNodes,
	calculateNodeStatistics,
	formatLastSeen,
	isNodeStale
} from './node-utils';

describe('node-utils', () => {
	// Suite: ensures mapping/format/calculation helpers behave
	it('maps status to color and text', () => {
		expect(getNodeStatusColor('online')).toMatch(/green/);
		expect(getNodeStatusColor('offline')).toMatch(/red/);
		expect(getNodeStatusText('pending')).toBe('Pending');
		expect(getNodeStatusText('other')).toBe('Unknown');
	});

	it('calculates and formats storage', () => {
		expect(calculateStoragePercentage(50, 0)).toBe(0);
		expect(calculateStoragePercentage(50, 100)).toBe(50);
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(1024)).toMatch(/KB/);
		expect(formatStorageInfo(0, -1)).toBe('No storage info');
		expect(formatStorageInfo(512, 1024)).toMatch(/50%/);
	});

	it('validates node names', () => {
		expect(validateNodeName('')).toMatchObject({ isValid: false });
		expect(validateNodeName('ab')).toMatchObject({ isValid: false });
		expect(validateNodeName('a'.repeat(51))).toMatchObject({ isValid: false });
		expect(validateNodeName('Good_Name-1')).toMatchObject({ isValid: true });
		expect(validateNodeName('Bad*Name')).toMatchObject({ isValid: false });
	});

	it('sorts and filters nodes', () => {
		const nodes = [
			{ node_name: 'B', status: 'offline', total_available_space: 0, used_space: 0 },
			{ node_name: 'A', status: 'online', total_available_space: 100, used_space: 20 },
			{ node_name: 'C', status: 'pending', total_available_space: 0, used_space: 0 }
		] as any;

		const sorted = sortNodesByStatus(nodes);
		expect(sorted[0].status).toBe('online');

		expect(getOnlineNodes(nodes).length).toBe(1);
		expect(getOfflineNodes(nodes).length).toBe(1);
		expect(filterNodesByStatus(nodes, 'pending').length).toBe(1);
	});

	it('computes statistics', () => {
		const nodes = [
			{ status: 'online', total_available_space: 100, used_space: 20 },
			{ status: 'online', total_available_space: 50, used_space: 10 },
			{ status: 'offline', total_available_space: 100, used_space: 0 }
		] as any;

		const stats = calculateNodeStatistics(nodes);
		expect(stats.totalNodes).toBe(3);
		expect(stats.onlineNodes).toBe(2);
		expect(stats.offlineNodes).toBe(1);
		expect(stats.usedStorage).toBe(30);
		expect(stats.totalStorage).toBe(150);
		expect(stats.availableStorage).toBe(120);
	});

	it('formats last seen and staleness', () => {
		expect(formatLastSeen(undefined)).toBe('Never');

		const now = new Date();
		const oneMinAgo = new Date(now.getTime() - 60 * 1000).toISOString();
		expect(formatLastSeen(oneMinAgo)).toMatch(/minute/);

		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
		expect(formatLastSeen(twoHoursAgo)).toMatch(/hour/);

		const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
		expect(formatLastSeen(twoDaysAgo)).toMatch(/day|\//);

		expect(isNodeStale(undefined)).toBe(true);
		expect(isNodeStale(new Date().toISOString(), 1)).toBe(false);
	});
});
