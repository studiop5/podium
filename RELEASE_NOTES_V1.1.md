# Podium v1.1 Release Notes

## What is Podium?

Podium is a specialized PDF viewer designed specifically for musicians. Unlike generic PDF readers, Podium provides:

- **Multiple Layout Modes:** Book view (facing pages), Scroll view, and Table view (thumbnail grid)
- **Music-Specific Annotations:** Draw, highlight, and mark up your scores with tools designed for musical notation
- **Page Management:** Cut, copy, paste, and rearrange pages across multiple browser tabs
- **Cloud Integration:** Open and save scores from Google Drive, Dropbox, and Microsoft OneDrive
- **Performance Optimized:** Handles large scores (100+ pages) smoothly with intelligent memory management

**100% Free and Open Source** - Podium runs entirely in your browser with no server, no tracking, and no data collection. Your scores never leave your device.

---

## What's New in v1.1

### Major Bug Fixes

**Fixed: Blank Pages Bug**
- Resolved critical issue where pages would sometimes render without their PDF content when scrolling rapidly through large scores
- Improved page inflation/deflation system to handle concurrent operations correctly
- Pages now consistently display PDF content even during rapid navigation

**Fixed: Cross-Browser Compatibility**
- File saving now works correctly in Firefox and Safari (previously broken due to missing download trigger)
- Added proper browser feature detection for File System Access API
- Fixed Reference Errors when checking for unsupported browser features

**Fixed: Recent Files List**
- Recent files list now properly limits to 20 entries instead of growing unbounded
- Reduces localStorage usage and improves performance

### Improvements

**Better Memory Management**
- Enhanced page deflation logic prevents race conditions
- Improved cleanup of blob URLs and resources
- More stable performance on mobile devices and when working with large scores

**Code Quality**
- Comprehensive code review and cleanup
- Improved error handling throughout
- Better documentation of complex systems

### Browser Support

Podium v1.1 has been tested and works on:

- ✅ **Chrome/Edge** (Windows, macOS, Linux) - Full support including File System Access API
- ✅ **Firefox** (Windows, macOS, Linux) - Full support with fallback file picker
- ✅ **Safari** (macOS) - Full support with fallback file picker
- ✅ **Mobile browsers** (iOS Safari, Android Chrome) - Touch-optimized interface

---

## Known Issues

**Firefox (Linux):** Brief purple color flash may appear on menu cells during rapid state changes. This is a Firefox rendering bug with radial gradients and does not affect functionality.

**iOS Safari:** First-time users may need to accept the "Allow" prompt for file access.

---

## For Developers

**Technical Improvements:**
- Implemented proper page inflation semaphore to prevent concurrent inflation attempts
- Added `inflatePromise` guard in `Pg.inflate()` method
- Fixed array slice operation in recent files trimming
- Corrected blob URL handling in download fallback path
- Added proper browser feature detection using `window.` prefix

**Build System:**
- Custom Python build system creates single-file distribution
- All dependencies embedded (Fabric.js, PDF.js, fonts, samples)
- No npm/webpack required

---

## Installation

**Web App (Recommended):**
Visit https://studiop5.org/podium.html and bookmark it - Podium runs entirely in your browser.

**Local Copy:**
You can download `podium.html` from https://studiop5.org/podium.html and run it locally, but it requires HTTPS (due to crypto APIs for cloud authentication). Use the development server from the source repo (see below).

**Building from Source (Linux only):**

Requirements:
- Python 3
- ImageMagick (for font processing)
- ffmpeg (for audio sample conversion)
- openssl (for SSL certificates)

```bash
git clone https://github.com/studiop5/podium.git
cd podium
python3 build.py --podium        # Build single-file app
python3 build.py --cert          # Generate SSL certificate (if needed)
python3 serve.py                 # Start HTTPS dev server on port 9876
```

Output: `build/podium.html`

---

## What's Next?

**Future Plans:**
- Browser extension for opening PDF links directly with Podium
- Your suggestions! Open an issue on GitHub

---

## Credits

Podium is built with:
- [PDF.js](https://mozilla.github.io/pdf.js/) - Mozilla's PDF rendering engine
- [pdf-lib](https://pdf-lib.js.org/) - PDF document creation and modification
- [Fabric.js](http://fabricjs.com/) - Canvas manipulation and drawing
- [Bravura](https://github.com/steinbergmedia/bravura) - SMuFL music notation font
- [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) - Handwriting font
- [Vercetti](https://www.dafont.com/vercetti.font) - Display font
- [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) - Piano samples

---

## License

Podium is free and open source software licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.en.html).

---

## Support & Feedback

- **Bug Reports:** [GitHub Issues](https://github.com/studiop5/podium/issues)
- **Questions:** Open an issue on GitHub

---

**Thank you to everyone who reported bugs and provided feedback after the initial release!**

Your input helped make v1.1 significantly more stable and reliable. Special thanks to those who tested on various browsers and platforms.

---

*Podium v1.1 - November 2025*
