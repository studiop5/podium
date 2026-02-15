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

// Background service worker for Podium extension

// Create context menu items when extension is installed
const targetUrlPatterns = [
  // Direct PDF links
  "*://*/*.pdf",
  "*://*/*.pdf?*",
  "*://*/*.PDF",
  "*://*/*.PDF?*",
  // IMSLP download links
  "*://imslp.org/wiki/Special:ImagefromIndex/*",
  "*://*.imslp.org/wiki/Special:ImagefromIndex/*"
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "openWithPodium",
    title: "Open with Podium",
    contexts: ["link"],
    targetUrlPatterns
  });
  chrome.contextMenus.create({
    id: "openWithPodiumNewTab",
    title: "Open with Podium (New Tab)",
    contexts: ["link"],
    targetUrlPatterns
  });
});

// Resolve an IMSLP Special:ImagefromIndex URL to the actual PDF URL.
// Works for:
//   Logged in:  ImagefromIndex → 302 redirect → PDF on ks*/s*.imslp.org (instant)
//   CA/EU:      ImagefromIndex → redirect to external domain → PDF URL is predictable
// Returns null for logged-out regular scores (blocked by bot protection).
async function resolveImslpUrl(linkUrl) {
  let resp = await fetch(linkUrl, { credentials: "include" });
  let contentType = resp.headers.get("content-type") || "";

  // Logged-in: fetch followed the 302 redirect straight to the PDF
  if (contentType.includes("application/pdf") || resp.url.match(/\.pdf(\?|$)/i)) {
    return resp.url;
  }

  // Bot-protection redirect — logged-out users hit friendlyredirect.html
  // which requires real JS execution. We can't bypass this from a service worker.
  if (resp.url.includes("friendlyredirect")) {
    return null;
  }

  let html = await resp.text();

  // CA/EU: fetch followed redirect to petruccimusiclibrary.ca or imslp.eu
  // The linkhandler.php URL has a predictable transformation to the PDF URL
  if (resp.url.includes("linkhandler.php")) {
    let u = new URL(resp.url);
    let path = u.searchParams.get("path");
    if (path) return u.origin + "/files" + path;
  }
  // Also check for the direct link in the HTML
  let extPdfMatch = html.match(/href="(https?:\/\/(?:petruccimusiclibrary\.ca|imslp\.eu|imslp\.tw)\/files\/[^"]+)"/i);
  if (extPdfMatch) return extPdfMatch[1];

  // Disclaimer page: look for "I understand" → IMSLPDisclaimerAccept link
  let acceptMatch = html.match(/href="([^"]*Special:IMSLPDisclaimerAccept[^"]*)"/i);
  if (acceptMatch) {
    let acceptUrl = new URL(acceptMatch[1], resp.url).href;
    let resp2 = await fetch(acceptUrl, { credentials: "include" });
    let ct2 = resp2.headers.get("content-type") || "";
    if (ct2.includes("application/pdf") || resp2.url.match(/\.pdf(\?|$)/i)) {
      return resp2.url;
    }
    html = await resp2.text();
  }

  // Wait/handler page: look for PDF URLs embedded in the page
  let pdfMatch = html.match(/(https?:\/\/(?:vmirror|ks\d+|s\d+)\.imslp\.org\/files\/[^"'\s<>]+\.pdf)/i);
  if (pdfMatch) return pdfMatch[0];

  return null;
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.linkUrl) return;

  let pdfUrl = info.linkUrl;
  let isImslp = info.linkUrl.includes("Special:ImagefromIndex");

  // Resolve IMSLP intermediate URLs to final PDF URLs
  if (isImslp) {
    try {
      let resolved = await resolveImslpUrl(info.linkUrl);
      if (resolved) {
        pdfUrl = resolved;
      } else {
        // Could not resolve — user is probably not logged in to IMSLP.
        // Open the IMSLP link in a regular tab so the browser handles
        // the disclaimer/wait flow natively. User can then use the
        // context menu on the actual PDF once it loads.
        await chrome.tabs.create({ url: info.linkUrl });
        return;
      }
    } catch (e) {
      // Network error or CORS — open IMSLP link directly as fallback
      await chrome.tabs.create({ url: info.linkUrl });
      return;
    }
  }

  const podiumUrl = chrome.runtime.getURL("podium.html") + "?url=" + encodeURIComponent(pdfUrl);

  if (info.menuItemId === "openWithPodiumNewTab") {
    await chrome.tabs.create({ url: podiumUrl });
  } else if (info.menuItemId === "openWithPodium") {
    // Try to find an existing Podium tab and reuse it
    const podiumBaseUrl = chrome.runtime.getURL("podium.html");
    const tabs = await chrome.tabs.query({});

    let podiumTab = null;
    for (let t of tabs) {
      if (t.url && t.url.startsWith(podiumBaseUrl)) {
        podiumTab = t;
        break;
      }
    }

    if (podiumTab) {
      await chrome.tabs.update(podiumTab.id, { url: podiumUrl, active: true });
    } else {
      await chrome.tabs.create({ url: podiumUrl });
    }
  }
});
