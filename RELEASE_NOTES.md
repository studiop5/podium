# Podium Release Notes

---

## v2.0 — February 2026

### New Features

**Browser Extension (Chrome/Edge)**
- Open PDF links directly in Podium via right-click context menu ("Open with Podium")
- Import the current tab's PDF into Podium from the extension popup
- IMSLP integration: automatic disclaimer handling and PDF resolution for logged-in users
- Recent files list in the extension popup with rename support

**Pitch Detection**
- Real-time pitch detection using the YIN algorithm (AudioWorklet-based)
- Displays detected note, frequency, and cents deviation on the piano keyboard

**Magnify Panel**
- Magnifier tool for close-up viewing and precision annotation
- Use with Ink ring tools for detailed work on small notation

**Cell Locking**
- Lock any menu cell to keep it active across multiple operations
- Visual indicator shows locked state

**Edit Panel (formerly Transform)**
- Unified panel for object transformation: move, scale, rotate, flip
- Group transformation support for multiple selected objects

**Instant Local Save (Chrome/Edge)**
- File handles remembered from open, enabling save-back without file picker
- Works for both save and revert operations

**Guidebook**
- Comprehensive HTML guidebook with screenshots and videos for every feature
- Keyword index for quick reference
- Available online at studiop5.org/Guidebook.html; accessible from the Guide cell in the app

**Progressive Web App**
- Install Podium as a standalone app on desktop, Android, and iOS
- Works offline with locally stored scores
- Service worker for caching and offline support

**Tap to Turn Page**
- Tap left/right edges of the score to turn pages (configurable in Numbers panel)

### Improvements

**Server and Networking**
- Development server: improved iOS/iPadOS compatibility (SSL, timeouts, connection handling)
- Auto-discovery of LAN IP addresses for SSL certificate generation
- TLS 1.2/1.3 enforcement

**Layout and Rendering**
- Improved grid origin positioning
- Better magnifier deflation handling
- Slider precision mode for fine-grained control

**File Handling**
- Device-aware file size limits
- Folder refresh from cloud providers
- Encrypted PDF handling with validation
- Fixed floating-point CSS bug (scientific notation in tiny negative values)

**UI Polish**
- Auto-off timer increased to 4 seconds
- ColorPicker fix
- About panel shows runtime environment (Extension, PWA, or URL)
- Improved IMSLP dialog styling

### Bug Fixes

- Fixed encrypted PDF handling (ignoreEncryption validation with getPages)
- Fixed CSS scientific notation bug from floating-point rounding
- Fixed TypeError in activateCell when activeRing is undefined
- Fixed About panel scroll behavior
- Fixed extension WASM loading for YIN pitch detection

### Security

- PDF metadata escaped before HTML rendering (XSS prevention)
- Extension popup XSS fix (URL-derived filenames)
- JSON body construction uses JSON.stringify instead of template literals

### Documentation

- Complete Guidebook with 10 chapters, screenshots, and demo videos
- Browser compatibility table with platform recommendations
- Legal disclaimers: warranty, score copyright, trademark attribution
- Updated README with all build commands and prerequisites

---

## v1.1 — November 2025

### Bug Fixes

**Fixed: Blank Pages Bug**
- Resolved critical issue where pages would sometimes render without their PDF content when scrolling rapidly through large scores
- Improved page inflation/deflation system to handle concurrent operations correctly

**Fixed: Cross-Browser Compatibility**
- File saving now works correctly in Firefox and Safari
- Added proper browser feature detection for File System Access API

**Fixed: Recent Files List**
- Recent files list now properly limits to 20 entries instead of growing unbounded

### Improvements

**Better Memory Management**
- Enhanced page deflation logic prevents race conditions
- Improved cleanup of blob URLs and resources
- More stable performance on mobile devices and large scores

---

## v1.0 — October 2025

Initial release.

---

*Podium is free and open source software licensed under the [GNU Affero General Public License v3](https://www.gnu.org/licenses/agpl-3.0-standalone.html).*
