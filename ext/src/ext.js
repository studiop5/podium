/**
 * Extension-specific code for loading PDFs from URL parameters
 * This file is only loaded by the browser extension, not the bundled build
 */

import { dialog, toast } from "./common.js";
import { escapeHtml } from "./file.js";
import { panels } from "./panel.js";
import { Score } from "./score.js";

// _shade_ is a global singleton defined in common.js

// Make fetchPdfFromUrl available globally for recent list
window.fetchPdfFromUrl = fetchPdfFromUrl;

export async function loadPdfFromUrl() {
  //  If url query parameter "url" or "file" is defined, open it.
  //  If "open" parameter is defined, show the Open panel as a hint.
  //  This is used when running podium as a browser extension.
  //  Note: This must be called after _menu_ is initialized.
  if (!location.search) return;
  // Try both "url" and "file" parameters for compatibility
  let params = new URLSearchParams(location.search);
  let path = params.get("url") || params.get("file");
  if (path) {
    await fetchPdfFromUrl(path);
    return;
  }
  // Check for "open" hint - show Open panel for local file memory jog
  let openHint = params.get("open");
  if (openHint) {
    let cell = _menu_.rings.score.cells.open;
    let panel = panels.OpenPanel.get(cell);
    panel.show();
    panel.setPosition(_menu_.grip);
  }
}

async function fetchPdfFromUrl(path) {
  // Fetch a PDF from the given URL and open it as a score.
  // Called from loadPdfFromUrl() on initial load, and from the recent list.
  // Set up abort controller for cancellation
  let abortController = new AbortController();
  let signal = abortController.signal;
  window._shade_.show("Downloading");
  window._shade_.onCancel = () => abortController.abort();

 
  try {
    // We add credentials: 'include' for cases where the final PDF URL might
    // still require cookies (e.g., from a CDN session).
    let response = await fetch(path, { method: "GET", signal, credentials: 'include' });
    if (response.ok) {
      let contentType = response.headers.get("content-type");
      // Stream the response to show download progress
      let contentLength = response.headers.get("Content-Length");
      let total = contentLength ? parseInt(contentLength, 10) : 0;
      let received = 0;

      let reader = response.body.getReader();
      let chunks = [];

      while (true) {
        let { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;

        if (total > 0) {
          let percent = Math.round((received / total) * 100);
          window._shade_.update(`Downloading (${percent}%)`);
        } else {
          // No Content-Length header, show bytes received
          let mb = (received / (1024 * 1024)).toFixed(1);
          window._shade_.update(`Downloading (${mb} MB)`);
        }
      }

      // Combine chunks into a single ArrayBuffer
      let data = new Uint8Array(received);
      let position = 0;
      for (let chunk of chunks) {
        data.set(chunk, position);
        position += chunk.length;
      }

      // Check if it starts with PDF magic bytes (%PDF)
      let bytes = new Uint8Array(data.slice(0, 4));
      let isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

      if (!isPDF) {
        dialog(`Error: The URL returned ${contentType || "non-PDF content"} instead of a PDF file.<br>The link may point to a webpage rather than a direct PDF download.`);
        return;
      }

      // Extract filename from Content-Disposition header, URL, or fallback
      let name = "";
      let cd = response.headers.get("Content-Disposition");
      if (cd) {
        // Try RFC 5987 UTF-8 encoded filename first (filename*=UTF-8''...)
        let utf8Match = cd.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
        if (utf8Match) name = decodeURIComponent(utf8Match[1]);
        // Fall back to regular filename="..." or filename=...
        if (!name) {
          let match = cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;\s]+)/i);
          if (match) name = match[1];
        }
      }
      if (!name) name = decodeURIComponent(path.split('/').pop().split('?')[0]) || "download.pdf";
      if (!name.toLowerCase().endsWith('.pdf')) name += '.pdf';

      let score = await new Score().init(Score.sources.url, path, name, data);
      Score.visit(score, { size: received, created: null, modified: Date.now() });
      _menu_.park();
      toast("File downloaded");
    } else {
      dialog(`Error opening url <i>${escapeHtml(path)}</i><br>HTTP ${response.status}: ${response.statusText}<br>`);
    }
  } catch (error) {
    if (error.name === "AbortError") return; // User cancelled
    // The fetch can still fail due to CORS on the final PDF if the CDN is strict
    // and the required host permissions haven't been granted via the popup.
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        dialog(`A network error occurred. This can be caused by a strict CORS policy on the server.<br><br>Please try clicking the Podium extension icon and granting the optional host permission.`);
    } else {
        dialog(`Error opening url <i>${escapeHtml(path)}</i><br>${error}`);
    }
  } finally {
    window._shade_.hide();
    window._shade_.onCancel = null;
  }
}
