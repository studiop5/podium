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
  // IMSLP (requires login)
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

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.linkUrl) return;

  const podiumUrl = chrome.runtime.getURL("podium.html") + "?url=" + encodeURIComponent(info.linkUrl);

  if (info.menuItemId === "openWithPodiumNewTab") {
    // Always create a new tab
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
      // Reuse existing Podium tab
      await chrome.tabs.update(podiumTab.id, { url: podiumUrl, active: true });
    } else {
      // Create new Podium tab
      await chrome.tabs.create({ url: podiumUrl });
    }
  }
});
