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
  console.log("Attempting to fetch PDF from:", path);
  // Set up abort controller for cancellation
  let abortController = new AbortController();
  let signal = abortController.signal;
  window._shade_.show("Downloading");
  window._shade_.onCancel = () => abortController.abort();
  // Handle IMSLP Special:ImagefromIndex URLs
  if (path.includes('imslp.org/wiki/Special:ImagefromIndex/')) {
    console.log("Detected IMSLP URL, fetching intermediate page...");
    try {
      let response = await fetch(path, {
        method: "GET",
        redirect: "follow",
        signal
      });
      console.log("IMSLP fetch response status:", response.status);
      console.log("IMSLP response URL:", response.url);
      console.log("IMSLP content-type:", response.headers.get("content-type"));
      // Check if redirected to a PDF
      if (response.url !== path && response.url.toLowerCase().endsWith('.pdf')) {
        console.log("IMSLP redirected to PDF:", response.url);
        path = response.url;
      } else if (response.headers.get("content-type")?.includes("application/pdf")) {
        console.log("IMSLP returned PDF directly");
        path = response.url;
      } else {
        // Got HTML - likely a disclaimer page. Parse to find PDF link or form.
        let html = await response.text();
        console.log("IMSLP HTML length:", html.length);
        // IMSLP shows a disclaimer page first. Look for various ways to get the actual PDF:
        // 1. Meta refresh tag
        // 2. JavaScript redirect
        // 3. Form action
        // 4. Direct link
        let pdfUrl = null;
        // Try meta refresh
        let metaMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'\s]+)['"]/i);
        if (metaMatch) {
          pdfUrl = metaMatch[1];
          console.log("Found PDF URL in meta refresh:", pdfUrl);
        }
        // Try window.location or document.location in JavaScript
        if (!pdfUrl) {
          let jsMatch = html.match(/(?:window\.location|document\.location)\s*=\s*["']([^"']+\.pdf[^"']*)["']/i);
          if (jsMatch) {
            pdfUrl = jsMatch[1];
            console.log("Found PDF URL in JavaScript:", pdfUrl);
          }
        }
        // Try href links to PDF
        if (!pdfUrl) {
          let hrefMatch = html.match(/href=["']([^"']+\.pdf[^"']*)['"]/i);
          if (hrefMatch) {
            pdfUrl = hrefMatch[1];
            console.log("Found PDF URL in href:", pdfUrl);
          }
        }
        // Try imslpcdn.org or other common IMSLP CDN patterns
        if (!pdfUrl) {
          let cdnMatch = html.match(/https?:\/\/[^"'\s<>]*(?:imslp|conquest).*?\.pdf/i);
          if (cdnMatch) {
            pdfUrl = cdnMatch[0];
            console.log("Found PDF URL (CDN pattern):", pdfUrl);
          }
        }
        // Look for form that submits to accept disclaimer
        if (!pdfUrl) {
          let formMatch = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/i);
          if (formMatch) {
            let formAction = formMatch[1];
            let formBody = formMatch[2];
            console.log("Found form action:", formAction);
            // Extract hidden input fields to submit with the form
            let formData = new URLSearchParams();
            let inputMatches = formBody.matchAll(/<input[^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["'][^>]*>/gi);
            for (let inputMatch of inputMatches) {
              formData.append(inputMatch[1], inputMatch[2]);
              console.log("Form field:", inputMatch[1], "=", inputMatch[2]);
            }
            // Also check for inputs with value before name (HTML allows either order)
            let inputMatches2 = formBody.matchAll(/<input[^>]+value=["']([^"']*)["'][^>]+name=["']([^"']+)["'][^>]*>/gi);
            for (let inputMatch of inputMatches2) {
              formData.append(inputMatch[2], inputMatch[1]);
              console.log("Form field:", inputMatch[2], "=", inputMatch[1]);
            }
            // Submit the form
            try {
              let formUrl = formAction.startsWith('/') ? 'https://imslp.org' + formAction : formAction;
              console.log("Submitting form to:", formUrl);
              let formResponse = await fetch(formUrl, {
                method: "POST",
                body: formData,
                redirect: "follow",
                signal,
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded"
                }
              });
              console.log("Form submission response:", formResponse.status, formResponse.url);
              // Check if form submission redirected to PDF
              if (formResponse.url.toLowerCase().endsWith('.pdf') ||
                  formResponse.headers.get("content-type")?.includes("application/pdf")) {
                pdfUrl = formResponse.url;
                console.log("Form submission led to PDF:", pdfUrl);
              }
            } catch (formError) {
              console.log("Error submitting form:", formError);
            }
          }
        }
        // Look for any URL in onclick or data attributes
        if (!pdfUrl) {
          let onclickMatch = html.match(/(?:onclick|data-url)=["']([^"']*\.pdf[^"']*)["']/i);
          if (onclickMatch) {
            pdfUrl = onclickMatch[1];
            console.log("Found PDF URL in onclick/data:", pdfUrl);
          }
        }
        // Last resort: look for any mention of imslp CDN domains
        if (!pdfUrl) {
          let anyPdfMatch = html.match(/(https?:)?\/\/[^"'\s<>()]*\.pdf/i);
          if (anyPdfMatch) {
            pdfUrl = anyPdfMatch[0];
            console.log("Found any PDF URL:", pdfUrl);
          }
        }
        if (pdfUrl) {
          // Handle protocol-relative URLs
          if (pdfUrl.startsWith('//')) {
            pdfUrl = 'https:' + pdfUrl;
          }
          // Handle relative URLs
          if (pdfUrl.startsWith('/')) {
            pdfUrl = 'https://imslp.org' + pdfUrl;
          }
          path = pdfUrl;
        } else {
          console.error("Could not find PDF URL in HTML");
          // Log more HTML to help debug - search for key elements
          console.log("Looking for form:", html.includes('<form'));
          console.log("Looking for .pdf:", html.includes('.pdf'));
          console.log("Full HTML:", html);
          window._shade_.hide();
          window._shade_.onCancel = null;
          // Check if this is a disclaimer page
          if (html.includes('Disclaimer') || html.includes('disclaimer')) {
            dialog("IMSLP requires you to accept their disclaimer first.<br><br>Please <a href='" + path + "' target='_blank'>accept the disclaimer on IMSLP</a>.<br><br>After accepting, use 'Open with Podium' on the score link again.");
          // Check if this is a non-member countdown page
          } else if (html.includes('seconds') && (html.includes('wait') || html.includes('countdown') || html.includes('timer')) ||
              html.includes('become a member') || html.includes('membership') ||
              html.match(/\d+\s*seconds?/i)) {
            dialog("Podium is only available for IMSLP members.<br><br><a href='https://imslp.org/wiki/IMSLP:Subscriptions' target='_blank'>Become an IMSLP member</a>");
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
    let response = await fetch(path, {
      method: "GET",
      credentials: "include",
      mode: "cors",
      signal
    });
    if (response.ok) {
      // Check if PDF or HTML
      let contentType = response.headers.get("content-type");
      console.log("Content-Type:", contentType);
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

      console.log("Fetched PDF data, size:", data.byteLength);

      // Check if it starts with PDF magic bytes (%PDF)
      let bytes = new Uint8Array(data.slice(0, 4));
      let isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

      if (!isPDF) {
        console.log("Response is not a PDF file. First bytes:", Array.from(bytes.slice(0, 20)));
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
      console.log("Fetch failed:", response.status, response.statusText);
      dialog(`Error opening url <i>${escapeHtml(path)}</i><br>HTTP ${response.status}: ${response.statusText}<br>`);
    }
  } catch (error) {
    if (error.name === "AbortError") return; // User cancelled
    console.log("Error loading PDF:", error);
    dialog(`Error opening url <i>${escapeHtml(path)}</i><br>${error}<br>${error.stack || ""}`);
  } finally {
    window._shade_.hide();
    window._shade_.onCancel = null;
  }
}
