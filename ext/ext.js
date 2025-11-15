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
 * Extension-specific code for loading PDFs from URL parameters
 * This file is only loaded by the browser extension, not the bundled build
 */

import { dialog, toast, escapeHtml } from "./common.js";
import { Score } from "./score.js";

export async function loadPdfFromUrl() {
  /*
    If url query parameter "url" or "file" is defined, open it.
    This is used when running podium as a browser extension.
    Note: This must be called after _menu_ is initialized.
  */
  if (!location.search) return;

  // Try both "url" and "file" parameters for compatibility
  let params = new URLSearchParams(location.search);
  let path = params.get("url") || params.get("file");

  if (!path) return;

  console.log("Attempting to fetch PDF from:", path);

  // Handle IMSLP Special:ImagefromIndex URLs
  if (path.includes('imslp.org/wiki/Special:ImagefromIndex/')) {
    console.log("Detected IMSLP URL, fetching intermediate page...");
    try {
      let response = await fetch(path, {
        method: "GET",
        redirect: "follow"
      });

      console.log("IMSLP fetch response status:", response.status);
      console.log("IMSLP response URL:", response.url);
      console.log("IMSLP content-type:", response.headers.get("content-type"));

      // Check if we got redirected to a PDF
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
              console.error("Error submitting form:", formError);
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
          dialog("Could not find PDF download link on IMSLP page. The page may require accepting a disclaimer first.");
          return;
        }
      }
    } catch (error) {
      console.error("Error processing IMSLP URL:", error);
      dialog(`Error processing IMSLP URL: ${error}`);
      return;
    }
  }

  try {
    let fetchPromise = await fetch(path, {
      method: "GET",
      credentials: "include",
      mode: "cors",
    });
    let response = await fetchPromise;
    if (response.ok) {
      // Check if we got a PDF or HTML
      let contentType = response.headers.get("content-type");
      console.log("Content-Type:", contentType);

      let data = await response.arrayBuffer();
      console.log("Fetched PDF data, size:", data.byteLength);

      // Check if it starts with PDF magic bytes (%PDF)
      let bytes = new Uint8Array(data.slice(0, 4));
      let isPDF = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

      if (!isPDF) {
        console.error("Response is not a PDF file. First bytes:", Array.from(bytes.slice(0, 20)));
        dialog(`Error: The URL returned ${contentType || "non-PDF content"} instead of a PDF file.<br>The link may point to a webpage rather than a direct PDF download.`);
        return;
      }

      let score = await new Score().init(null, "", "unknown", data);
      toast("File downloaded");
    } else {
      console.error("Fetch failed:", response.status, response.statusText);
      dialog(`Error opening url <i>${escapeHtml(path)}</i><br>HTTP ${response.status}: ${response.statusText}<br>`);
    }
  } catch (error) {
    console.error("Error loading PDF:", error);
    dialog(`Error opening url <i>${escapeHtml(path)}</i><br>${error}<br>${error.stack || ""}`);
  }
}
