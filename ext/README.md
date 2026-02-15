# Podium Browser Extension

## Installation

### Chrome/Edge:
1. Open chrome://extensions/ (or edge://extensions/)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `ext/` directory

### Firefox:
1. Open about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file in the `ext/` directory

## Usage

### Context Menu
Right-click on any PDF link and select "Open with Podium" to view the PDF in Podium. "Open with Podium (New Tab)" always opens a fresh tab.

For IMSLP score links, the extension resolves the download URL automatically if you are logged in to IMSLP. If you are not logged in, the link opens normally so you can complete IMSLP's disclaimer/wait process in the browser.

### Import Current Tab
When your browser is displaying a PDF, click the Podium extension icon. If a PDF is detected in the current tab, an "Open in Podium" button appears at the top of the popup. Click it to import the score into Podium.

### Recent Files
The popup also shows your five most recent scores. Click any entry to reopen it.

## Permissions

Podium requests only the permissions it needs and explains each one:

| Permission | Why |
|---|---|
| `contextMenus` | Adds "Open with Podium" to the right-click menu on PDF links. |
| `activeTab` | Reads the URL of the current tab when you click the extension icon, so the popup can detect if the tab contains a PDF. |
| `tabs` | Finds an existing Podium tab to reuse instead of opening duplicates. |
| `identity` | Authenticates with cloud storage providers (Google Drive, OneDrive, Dropbox) using Chrome's built-in identity system. |
| Host permissions for IMSLP domains | Allows the extension to resolve IMSLP download links directly to PDF files without intermediate disclaimer pages (requires IMSLP login). |
| Optional: access to all sites | Requested only when you use "Open in Podium" from the popup on a non-IMSLP PDF. Required so the extension can fetch the PDF from its source. Granted once and retained. |

### Data Handling

- Podium is 100% client-side. No score data is sent to any server.
- PDF files are fetched directly from their source and processed entirely in your browser.
- Cloud storage authentication uses read-only scopes. Podium cannot modify or delete your cloud files.
- No analytics, telemetry, or tracking of any kind.

## Icons

Icon files (icon16.png, icon48.png, icon128.png) are in the ext/icons/ directory.
