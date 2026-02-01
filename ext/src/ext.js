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

  // Handle IMSLP Special:ImagefromIndex URLs
  if (path.includes('imslp.org/wiki/Special:ImagefromIndex/')) {
    try {
      let response = await fetch(path, { method: "GET", redirect: "follow", signal });
      // Check if redirected to a PDF
      if (response.url !== path && response.url.toLowerCase().endsWith('.pdf')) {
        path = response.url;
      } else if (response.headers.get("content-type")?.includes("application/pdf")) {
        path = response.url;
      } else {
        // Got HTML - likely a disclaimer page. Parse to find PDF link or form.
        let html = await response.text();
        let pdfUrl = null;
        // Try meta refresh
        let metaMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'\s]+)['"]/i);
        if (metaMatch) pdfUrl = metaMatch[1];
        // Try window.location or document.location in JavaScript
        if (!pdfUrl) {
          let jsMatch = html.match(/(?:window\.location|document\.location)\s*=\s*["']([^"']+\.pdf[^"']*)["']/i);
          if (jsMatch) pdfUrl = jsMatch[1];
        }
        // Try href links to PDF
        if (!pdfUrl) {
          let hrefMatch = html.match(/href=["']([^"']+\.pdf[^"']*)['"]/i);
          if (hrefMatch) pdfUrl = hrefMatch[1];
        }
        // Try imslpcdn.org or other common IMSLP CDN patterns
        if (!pdfUrl) {
          let cdnMatch = html.match(/https?:\/\/[^"'\s<>]*(?:imslp|conquest).*?\.pdf/i);
          if (cdnMatch) pdfUrl = cdnMatch[0];
        }
        // Look for form that submits to accept disclaimer
        if (!pdfUrl) {
          let formMatch = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
          if (formMatch) {
            let formAction = formMatch[1];
            let formBody = formMatch[2];
            let formData = new URLSearchParams();
            let inputMatches = formBody.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["'][^>]*>/gi);
            for (let inputMatch of inputMatches) formData.append(inputMatch[1], inputMatch[2]);
            let inputMatches2 = formBody.matchAll(/<input[^>]+value=["']([^"']*)["'][^>]+name=["']([^"']+)["'][^>]*>/gi);
            for (let inputMatch of inputMatches2) formData.append(inputMatch[2], inputMatch[1]);
            // Submit the form
            try {
              let formUrl = formAction.startsWith('/') ? 'https://imslp.org' + formAction : formAction;
              let formResponse = await fetch(formUrl, {
                method: "POST",
                body: formData,
                redirect: "follow",
                signal,
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded"
                }
              });
              // Check if form submission redirected to PDF
              if (formResponse.url.toLowerCase().endsWith('.pdf') ||
                  formResponse.headers.get("content-type")?.includes("application/pdf")) {
                pdfUrl = formResponse.url;
              }
            } catch (formError) { /* ignore */ }
          }
        }
        // Look for any URL in onclick or data attributes
        if (!pdfUrl) {
          let onclickMatch = html.match(/(?:onclick|data-url)=["']([^"']*\.pdf[^"']*)["']/i);
          if (onclickMatch) pdfUrl = onclickMatch[1];
        }
        // Last resort: look for any mention of imslp CDN domains
        if (!pdfUrl) {
          let anyPdfMatch = html.match(/(https?:)?\/\/[^"'\s<>()]*\.pdf/i);
          if (anyPdfMatch) pdfUrl = anyPdfMatch[0];
        }
        if (pdfUrl) {
          // Handle protocol-relative URLs
          if (pdfUrl.startsWith('//')) pdfUrl = 'https:' + pdfUrl;
          // Handle relative URLs
          if (pdfUrl.startsWith('/')) pdfUrl = 'https://imslp.org' + pdfUrl;
          path = pdfUrl;
        } else {
          window._shade_.hide();
          window._shade_.onCancel = null;
          // Check if this is a non-member countdown page or friendlyredirect (JS-based redirect for non-members)
          if (html.includes('Your download will continue in') ||
              html.includes('Click here to continue your download') ||
              html.includes('"js-a4":"15"') ||
              html.includes('friendlyredirect') ||
              response.url.includes('friendlyredirect')) {
            dialog("Podium requires you to be logged in to IMSLP.<br><br>" +
                   "<a href='https://imslp.org/wiki/Special:UserLogin' target='_blank'>Log in to IMSLP</a> " +
                   "or <a href='https://imslp.org/wiki/IMSLP:Subscriptions' target='_blank'>become a member</a>.");
          // Check if this is a disclaimer page
          } else if (html.includes('Disclaimer') || html.includes('disclaimer')) {
            dialog("IMSLP requires you to accept their disclaimer first.<br><br>Please <a href='" + path + "' target='_blank'>accept the disclaimer on IMSLP</a>.<br><br>After accepting, use 'Open with Podium' on the score link again.");
          } else {
            dialog("Could not find PDF download link on IMSLP page.");
          }
          return;
        }
      }
    } catch (error) {
      window._shade_.hide();
      window._shade_.onCancel = null;
      if (error.name === "AbortError") return; // User cancelled
      console.error("Error processing IMSLP URL:", error);
      dialog(`Error processing IMSLP URL: ${error}`);
      return;
    }
  }

  try {
    let response = await fetch(path, { method: "GET", signal });
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

      // Extract filename from URL, fallback to "download.pdf"
      let name = decodeURIComponent(path.split('/').pop().split('?')[0]) || "download.pdf";
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
    dialog(`Error opening url <i>${escapeHtml(path)}</i><br>${error}`);
  } finally {
    window._shade_.hide();
    window._shade_.onCancel = null;
  }
}
