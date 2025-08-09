// File: src/app/node.service.ts - Manage storage nodes (register, list, status, delete).

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom, BehaviorSubject, Observable } from 'rxjs';

export interface StorageNode {
	node_name: string;
	node_id: string;
	status: string;
	total_available_space: number;
	used_space: number;
	num_chunks: number;
	last_seen: Date | null;
}

export interface RegistrationResult {
	node_name: string;
	node_id: string;
	auth_token: string;
}

@Injectable({ providedIn: 'root' })
/** Storage node management service. */
export class NodeService {
	private apiUrl: string;
	private get apiHeaders(): HttpHeaders {
		return this.authService.getAuthHeaders();
	}

	nodeId: string = '';
	private userStorageNodes = new BehaviorSubject<StorageNode[]>([]);

	public get userStorageNodes$(): Observable<StorageNode[]> {
		return this.userStorageNodes.asObservable();
	}

	constructor(
		private http: HttpClient,
		private authService: AuthService
	) {
		this.apiUrl = this.authService.getApiUrl();
	}

	/** Register a new storage node. */
	async registerNode(node_name: string): Promise<{
		success: boolean;
		registration_result?: RegistrationResult;
		message?: string;
	}> {
		// Check node name does not exist
		if (!node_name || this.userStorageNodes.value.find(d => d.node_name === node_name)) {
			return {
				success: false,
				message: 'Node Already Exists. Please Choose a Different Name.'
			};
		}

		try {
			const response: any = await firstValueFrom(
				this.http.post(
					`${this.apiUrl}/nodes`,
					{ node_name },
					{
						headers: this.apiHeaders
					}
				)
			);
			if (response?.success && response.data) {
				const result: RegistrationResult = {
					node_name: response.data.nodeName,
					node_id: response.data.nodeId,
					auth_token: response.data.authToken
				};
				return { success: true, registration_result: result, message: response.message };
			}
			return { success: false, message: response?.message || 'Node registration failed' };
		} catch (error: any) {
			return { success: false, message: error?.message || 'Node registration failed' };
		}
	}

	/** Load user's nodes into local cache. */
	async loadUserStorageNodes(): Promise<{
		success: boolean;
		message?: string;
	}> {
		try {
			const response: any = await firstValueFrom(
				this.http.get(`${this.apiUrl}/nodes`, {
					headers: this.apiHeaders
				})
			);
			if (response?.success) {
				const nodes = (response.data || []).map((n: any) => ({
					node_name: n.node_name,
					node_id: n.node_id,
					status: n.status,
					total_available_space: n.total_available_space,
					used_space: n.used_space,
					num_chunks: n.num_chunks,
					last_seen: n.last_seen
				}));
				this.userStorageNodes.next(nodes);
				return { success: true };
			}
			this.userStorageNodes.next([]);
			return {
				success: false,
				message: response?.message || 'Failed to fetch storage nodes'
			};
		} catch (error: any) {
			this.userStorageNodes.next([]);
			return { success: false, message: error.message || 'An unexpected error occurred' };
		}
	}

	/** Refresh status for a node & update cache. */
	async updateNodeStatus(nodeId: string): Promise<{ success: boolean; message?: string }> {
		try {
			const response: any = await firstValueFrom(
				this.http.get(`${this.apiUrl}/nodes/${nodeId}/status`, {
					headers: this.apiHeaders
				})
			);
			if (response?.success && response.data) {
				const nodes = this.userStorageNodes.value.map(node =>
					node.node_id === nodeId
						? {
								...node,
								status: response.data.status,
								total_available_space: response.data.total_available_space,
								used_space: response.data.used_space,
								num_chunks: response.data.num_chunks,
								last_seen: response.data.last_seen
							}
						: node
				);
				this.userStorageNodes.next(nodes);
				return { success: true };
			}
			return {
				success: false,
				message:
					response?.message ||
					'Failed to fetch node status. Please confirm node was initialized before timeout.'
			};
		} catch (error: any) {
			return { success: false, message: error.message || 'An unexpected error occurred' };
		}
	}

	/** Delete a storage node and update cache. */
	async deleteStorageNode(nodeId: string): Promise<{ success: boolean; message?: string }> {
		try {
			const response: any = await firstValueFrom(
				this.http.delete(`${this.apiUrl}/nodes/${nodeId}`, {
					headers: this.apiHeaders
				})
			);
			if (response?.success) {
				this.userStorageNodes.next(
					this.userStorageNodes.value.filter(n => n.node_id !== nodeId)
				);
				return { success: true, message: response.message };
			}
			return {
				success: false,
				message: response?.message || 'Failed to delete storage node'
			};
		} catch (error: any) {
			return { success: false, message: error.message || 'An unexpected error occurred' };
		}
	}
}
