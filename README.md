# Podium

**Podium is:**
- An e-reader for music scores.
- 100% browser-based: completely free, entirely open source, and totally unsupported!
- No installation, no registration, no login, no file import. Just use it!
- Built for Google Chrome, but runs (fingers crossed) in any modern desktop/tablet/smartphone browser.
- Unique UI featuring a circular menu and multiple layouts.
- Alternative to generic PDF viewers, customized for the layout and annotation of scores in PDF format.
- Not a music library: works with PDF files stored locally or in the cloud. 
- Uses PDF annotations and embedded document metadata to store user edits.

## Compatibility

**Runs on:** 
- Touch screens devices (laptops, Chromebooks, tablets, smartphones) plus conventional desktops.

**Input devices:**
- S-Pen, Apple Pencil, USI styli, fingers and thumbs.
- Mouse, track pad, computer keyboard, Bluetooth page turners.

## Practice Tools

- Metronome, with experimental animated conducting hand.
- On-screen piano keyboard, with functions for assisted tuning.
- Replay tool for instant replay of last 1 minute (configurable) of audio/video.
- Stopwatch and clock.

## Links

- **App**: https://studiop5.org/podium
- **Documentation**: https://studiop5.org/GuideBook.pdf

## Development

### Development Server

Start the HTTPS development server:

```bash
python3 serve.py
```

The server will start on port 9876. You can specify a custom port:

```bash
python3 serve.py --port 8080
```

Enable CORS headers if needed:

```bash
python3 serve.py --cross_origin
```

Navigate to `https://localhost:9876` to use the application.

### Build System

This project uses a custom Python-based build system instead of npm/yarn.

#### Build Commands

**Full build** (builds font.js, sample.js, and podium.html):
```bash
python3 build.py
```

**Build font assets** (embeds Bravura.otf as base64):
```bash
python3 build.py --font
```

**Build piano samples** (requires ffmpeg, converts Salamander piano samples to MP3):
```bash
python3 build.py --sample
```

**Build single-file application** (creates build/podium.html):
```bash
python3 build.py --podium
```

**Generate SSL certificate** (requires openssl):
```bash
python3 build.py --cert
```

The build system creates a single-file distribution at `build/podium.html` that includes all dependencies, assets, and source code inline.

### System Requirements

- Modern web browser with JavaScript modules support
- Python 3.x (for build system and development server)
- ffmpeg (for audio sample processing)
- openssl (for SSL certificate generation)


