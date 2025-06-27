// src/app/node.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { firstValueFrom, BehaviorSubject, Observable } from 'rxjs';

export interface StorageNode {
  node_name: string,
  node_id: string,
  status: string,
  total_available_space: number,
  used_space: number,
  num_chunks: number,
  last_seen: Date | null
}

export interface RegistrationResult {
  node_name: string,
  node_id: string,
  auth_token: string
}

@Injectable({ providedIn: 'root' })
export class NodeService {
  private apiUrl: string;
  private apiHeaders: HttpHeaders;

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
    this.apiHeaders = this.authService.getAuthHeaders();
  }

  async registerNode(node_name: string): Promise<{success: boolean, registration_result?: RegistrationResult, message?: string}> {
    // Check node name does not exist
    if (!node_name || this.userStorageNodes.value.find(d => d.node_name === node_name)) {
      return { success: false, message: 'Node Already Exists. Please Choose a Different Name.' };
    }

    try {
      const response = await firstValueFrom(this.http.post(`${this.apiUrl}/register-node`, { node_name }, {
        headers: this.apiHeaders,
      })) as any;
      if (response && response.success) {
        const result: RegistrationResult = {
          node_name: response.node_name,
          node_id: response.node_id,
          auth_token: response.auth_token
        };
        return { success: true, registration_result: result };
      }
      else return { success: false, message: response?.error || 'Node registration failed' };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Node registration failed' };
    }
  }

  async loadUserStorageNodes(): Promise<{success: boolean, message?: string}> {
    try {
      const response = await firstValueFrom(this.http.get(`${this.apiUrl}/user/storage-nodes`, {
        headers: this.apiHeaders,
      })) as any;
      if (response && response.success) {
        const nodes = (response.storage_nodes || []).map((n: any) => ({
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
      } else {
        this.userStorageNodes.next([]);
        return { success: false, message: response?.error || 'Failed to fetch storage nodes' };
      }
    } catch (error: any) {
      this.userStorageNodes.next([]);
      return { success: false, message: error.message || 'An unexpected error occurred' };
    }
  }

  async updateNodeStatus(nodeId: string): Promise<{success: boolean, message?: string}> {
    try {
      const response = await firstValueFrom(this.http.get(`${this.apiUrl}/node/check-status/${nodeId}`, {
        headers: this.apiHeaders,
      })) as any;
      if (response && response.success && response.node_status) {
        // Update the node in the subject
        const nodes = this.userStorageNodes.value.map(node => {
          if (node.node_id === nodeId) {
            return {
              ...node,
              status: response.node_status.status,
              total_available_space: response.node_status.total_available_space,
              used_space: response.node_status.used_space,
              num_chunks: response.node_status.num_chunks,
              last_seen: response.node_status.last_seen
            };
          }
          return node;
        });
        this.userStorageNodes.next(nodes);
        return { success: true };
      } else {
        return { success: false, message: response?.error || 'Failed to fetch node status. Please confirm node was initialized before timeout.' };
      }
    } catch (error: any) {
      return { success: false, message: error.message || 'An unexpected error occurred' };
    }
  }

  async deleteStorageNode(nodeId: string): Promise<{success: boolean, message?: string}> {
    try {
      const response = await firstValueFrom(this.http.delete(`${this.apiUrl}/node/delete-node/${nodeId}`, {
        headers: this.apiHeaders,
      })) as any;
      if (response && response.success) {
        this.userStorageNodes.next(this.userStorageNodes.value.filter(n => n.node_id !== nodeId));
        return { success: true };
      } else {
        return { success: false, message: response?.error || 'Failed to delete storage node' };
      }
    } catch (error: any) {
      return { success: false, message: error.message || 'An unexpected error occurred' };
    }
  }
}