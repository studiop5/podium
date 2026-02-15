# Chrome Web Store Submission

## Store Listing

### Name
Podium PDF Viewer

### Summary (132 char max)
Open PDF music scores with Podium — a specialized viewer with layouts, annotations, and tools designed for musicians.

### Description
Podium is a specialized PDF viewer built for musicians. It provides purpose-built layouts, annotation tools, and features that generic PDF viewers lack — making it easier to read, mark up, and perform from digital sheet music.

**Open scores from any website**
Right-click any PDF link and select "Open with Podium." Scores from IMSLP, Musopen, and other music libraries open directly — no downloading, no file management.

**Import from your current tab**
Already viewing a PDF? Click the Podium icon and import it into Podium with one click.

**IMSLP integration**
IMSLP members enjoy seamless one-click access — scores open instantly in Podium with no intermediate pages. Non-members can use IMSLP's standard download flow and then import via the popup.

**Key features**
- Multiple layout modes: Book, Scroll, and Table views
- Drawing and annotation tools
- Half-page turn mode for hands-free performing
- Metronome with audible click
- Cloud storage support (Google Drive, OneDrive, Dropbox)
- Works offline — ideal for performance situations
- Recent files list for quick access

Podium is free, open-source software (AGPL-3.0). Your scores never leave your browser — no data is collected, no analytics, no tracking.

### Category
Productivity

### Language
English

---

## Single Purpose Description
(Required by Chrome Web Store — explain the extension's single purpose)

Podium provides a specialized PDF viewer for music scores. The extension lets users open PDF links directly in Podium's music-optimized viewer via the right-click context menu or by importing the PDF displayed in the current browser tab.

---

## Permission Justifications
(Required by Chrome Web Store for each permission)

### contextMenus
Adds "Open with Podium" and "Open with Podium (New Tab)" entries to the browser's right-click context menu when the user right-clicks a PDF link. This is the primary way users open scores in Podium.

### activeTab
Reads the URL of the currently active tab when the user clicks the extension's toolbar icon. This allows the popup to detect whether the current tab is displaying a PDF and offer to import it into Podium.

### tabs
Queries open tabs to find an existing Podium tab. When the user selects "Open with Podium" (not "New Tab"), the extension reuses an existing Podium tab instead of opening a duplicate, keeping the user's tab bar clean.

### identity
Provides authentication for optional cloud storage integration (Google Drive, OneDrive, Dropbox). Uses Chrome's built-in identity APIs so users can browse and open scores stored in their cloud accounts without managing OAuth tokens manually. All cloud access is read-only.

### Host permissions: imslp.org, *.imslp.org, petruccimusiclibrary.ca, imslp.eu, imslp.tw
IMSLP (International Music Score Library Project) is the world's largest free music score library. IMSLP serves scores through intermediate disclaimer and redirect pages across multiple regional domains. These host permissions allow the extension to resolve IMSLP download links directly to the final PDF URL so scores can be opened in Podium with a single right-click — without requiring the user to navigate through intermediate pages. This only works when the user is logged in to their IMSLP account.

### Optional host permissions: all URLs
Requested at runtime only when the user clicks "Open in Podium" in the popup to import a PDF from the current browser tab. The extension needs to fetch the PDF from its source URL in order to load it into Podium's viewer. This permission is requested once (with a visible browser prompt) and retained. It is never requested silently or at install time.

---

## Privacy Policy

The privacy policy is hosted at: https://studiop5.org/privacy.html

Source file: ~/studiop5/www/privacy.html

---

## Notes for Submission

- The extension is open source (AGPL-3.0): https://github.com/glendonintendo/podium
- No remote code is loaded — all JavaScript is bundled in the extension
- Content Security Policy restricts scripts to 'self' and 'wasm-unsafe-eval' (needed for PDF.js)
- The `<all_urls>` permission is optional and runtime-requested, not granted at install
