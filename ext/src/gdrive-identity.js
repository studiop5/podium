/**
  Copyright 2025 Glendon Diener

  This file is part of Podium.

  Podium is free software: you can redistribute it and/or modify it
  under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but
  WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
  Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public
  License along with Podium. If not, see
  <https://www.gnu.org/licenses/>.
**/

/**
 * Google Drive integration using Chrome Identity API
 * This replaces OAuth2 flow with simpler chrome.identity.getAuthToken()
 * Only works in Chrome extensions, not in standalone web app
 */

export class GDriveIdentity {
  constructor() {
    this.token = null;
  }

  /**
   * Get an auth token using Chrome Identity API
   * @param {boolean} interactive - Whether to show UI for login
   * @returns {Promise<string>} Access token
   */
  async getToken(interactive = true) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.token = token;
          resolve(token);
        }
      });
    });
  }

  /**
   * Remove cached auth token (logout)
   */
  async removeToken() {
    if (!this.token) return;

    return new Promise((resolve, reject) => {
      chrome.identity.removeCachedAuthToken({ token: this.token }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          this.token = null;
          resolve();
        }
      });
    });
  }

  /**
   * Fetch file metadata from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileId) {
    const token = await this.getToken();
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch file metadata: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Download file content from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @param {function} onProgress - Progress callback (percent)
   * @returns {Promise<ArrayBuffer>} File content
   */
  async downloadFile(fileId, onProgress = null) {
    const token = await this.getToken();
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    // Stream the response to track progress
    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    let received = 0;

    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      received += value.length;

      if (onProgress && total > 0) {
        onProgress(Math.round((received / total) * 100));
      }
    }

    // Combine chunks into single ArrayBuffer
    const data = new Uint8Array(received);
    let position = 0;
    for (const chunk of chunks) {
      data.set(chunk, position);
      position += chunk.length;
    }

    return data.buffer;
  }

  /**
   * List files in Google Drive
   * @param {string} query - Google Drive query string
   * @param {number} pageSize - Number of results per page
   * @returns {Promise<Object>} List of files
   */
  async listFiles(query = "mimeType='application/pdf'", pageSize = 100) {
    const token = await this.getToken();
    const params = new URLSearchParams({
      q: query,
      pageSize: pageSize.toString(),
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,iconLink),nextPageToken'
    });

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if currently authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.token !== null;
  }
}

// Create singleton instance
export const gdriveIdentity = new GDriveIdentity();
