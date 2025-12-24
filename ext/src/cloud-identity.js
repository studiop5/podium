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
 * OneDrive and Dropbox integration using Chrome Identity API
 * Uses chrome.identity.launchWebAuthFlow() for OAuth2
 * Only works in Chrome extensions, not in standalone web app
 */

/**
 * OneDrive client using Chrome Identity API
 */
export class OneDriveIdentity {
  constructor() {
    this.token = null;
    this.clientId = 'b81faf82-539b-4759-bcc9-8fdac6c7ceba'; // Same as web app
    this.redirectUri = chrome.identity.getRedirectURL('onedrive');
  }

  /**
   * Get an auth token using Chrome Identity API
   * @returns {Promise<string>} Access token
   */
  async getToken() {
    if (this.token) return this.token;

    const authUrl = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', this.redirectUri);
    authUrl.searchParams.set('scope', 'Files.Read offline_access');

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true
        },
        (redirectUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          // Extract access token from redirect URL fragment
          // Format: https://redirect-uri#access_token=...&token_type=bearer&...
          const url = new URL(redirectUrl);
          const params = new URLSearchParams(url.hash.substring(1)); // Remove leading #
          const token = params.get('access_token');

          if (!token) {
            reject(new Error('No access token in redirect URL'));
            return;
          }

          this.token = token;
          resolve(token);
        }
      );
    });
  }

  /**
   * Remove cached auth token (logout)
   */
  async removeToken() {
    this.token = null;
  }

  /**
   * Fetch file metadata from OneDrive
   * @param {string} fileId - OneDrive file ID or path
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileId) {
    const token = await this.getToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}`,
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
   * Download file content from OneDrive
   * @param {string} fileId - OneDrive file ID
   * @param {function} onProgress - Progress callback (percent)
   * @returns {Promise<ArrayBuffer>} File content
   */
  async downloadFile(fileId, onProgress = null) {
    const token = await this.getToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`,
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
   * List PDF files in OneDrive
   * @returns {Promise<Object>} List of files
   */
  async listFiles() {
    const token = await this.getToken();
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root/search(q='.pdf')?$select=id,name,size,createdDateTime,lastModifiedDateTime,file`,
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
}

/**
 * Dropbox client using Chrome Identity API
 */
export class DropboxIdentity {
  constructor() {
    this.token = null;
    this.clientId = 'erqcrdytyixn6h7'; // Same as web app
    this.redirectUri = chrome.identity.getRedirectURL('dropbox');
  }

  /**
   * Get an auth token using Chrome Identity API
   * @returns {Promise<string>} Access token
   */
  async getToken() {
    if (this.token) return this.token;

    const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', this.clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', this.redirectUri);

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive: true
        },
        (redirectUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          // Extract access token from redirect URL fragment
          // Format: https://redirect-uri#access_token=...&token_type=bearer&...
          const url = new URL(redirectUrl);
          const params = new URLSearchParams(url.hash.substring(1)); // Remove leading #
          const token = params.get('access_token');

          if (!token) {
            reject(new Error('No access token in redirect URL'));
            return;
          }

          this.token = token;
          resolve(token);
        }
      );
    });
  }

  /**
   * Remove cached auth token (logout)
   */
  async removeToken() {
    this.token = null;
  }

  /**
   * Fetch file metadata from Dropbox
   * @param {string} path - Dropbox file path (e.g., "/folder/file.pdf")
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(path) {
    const token = await this.getToken();
    const response = await fetch(
      'https://api.dropboxapi.com/2/files/get_metadata',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch file metadata: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Download file content from Dropbox
   * @param {string} path - Dropbox file path
   * @param {function} onProgress - Progress callback (percent)
   * @returns {Promise<ArrayBuffer>} File content
   */
  async downloadFile(path, onProgress = null) {
    const token = await this.getToken();
    const response = await fetch(
      'https://content.dropboxapi.com/2/files/download',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path })
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
   * List PDF files in Dropbox
   * @param {string} path - Folder path (default: root)
   * @returns {Promise<Object>} List of files
   */
  async listFiles(path = '') {
    const token = await this.getToken();
    const response = await fetch(
      'https://api.dropboxapi.com/2/files/search_v2',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: '.pdf',
          options: {
            path: path || '',
            file_extensions: ['pdf']
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }

    return response.json();
  }
}

// Create singleton instances
export const onedriveIdentity = new OneDriveIdentity();
export const dropboxIdentity = new DropboxIdentity();
