#!/bin/env python3
import argparse
import base64
import gzip
import shutil
import zlib
from io import StringIO
from io import BytesIO
import os
import pdb
import sys
import subprocess

if len(sys.argv) == 1:
   args = argparse.Namespace(verbose=True, font=True, sample=True, podium=True, yin=True, ext=False, cert=False, clean=False) ;
else:
  parser = argparse.ArgumentParser()
  parser.add_argument('-s','--sample', action='store_true', help='(re)build build/sample.js')
  parser.add_argument('-f','--font', action='store_true', help='(re)build build/font.js')
  parser.add_argument('-p','--podium', action='store_true', help='(re)build build/podium.html')
  parser.add_argument('-y','--yin', action='store_true', help='(re)build build/yin.js')
  parser.add_argument('-e','--ext', action='store_true', help='(re)build browser extension in ext/')
  parser.add_argument('--certificate', action='store_true', dest='cert', help='(re)build certificate')
  parser.add_argument('-c','--clean', action='store_true', help='clean build artifacts from build/ and ext/')
  parser.add_argument('-v','--verbose', action='store_true')
  args = parser.parse_args()

if args.clean:
    #################################
    #      Clean build artifacts    #
    #################################
    import shutil

    if args.verbose: print('Cleaning build artifacts...')

    # Remove build directory contents
    if os.path.exists('build'):
        shutil.rmtree('build')
        if args.verbose: print('Removed build/')

    # Remove extension build artifacts (keep static files)
    if os.path.exists('ext'):
        # Remove directories (but preserve ext/src/ext.js which is checked into git)
        for dirname in ['build', 'lib', 'icons']:
            dirpath = os.path.join('ext', dirname)
            if os.path.exists(dirpath):
                shutil.rmtree(dirpath)
                if args.verbose: print(f'Removed ext/{dirname}/')

        # Clean ext/src but preserve ext.js
        if os.path.exists('ext/src'):
            for f in os.listdir('ext/src'):
                if f != 'ext.js':
                    fpath = os.path.join('ext/src', f)
                    os.remove(fpath)
                    if args.verbose: print(f'Removed ext/src/{f}')
            if args.verbose: print('Cleaned ext/src/ (preserved ext.js)')

        # Remove generated podium.html if it exists (we now keep it as static)
        # Actually, podium.html is now static, so don't remove it

    if args.verbose: print('Clean complete.')
    sys.exit(0)

os.system('mkdir build 2> /dev/null') ;

def build_yin(args):
    print("Building YIN class...")

    # Define paths
    src_dir = 'src'
    build_dir = 'build'
    yin_c_path = os.path.join(src_dir, 'yin-wasm.c')
    yin_wasm_path = os.path.join(build_dir, 'yin.wasm')
    worklet_template_path = os.path.join(src_dir, 'yin-worklet.js')
    yin_class_path = os.path.join(src_dir, 'yin.js')
    output_path = os.path.join(build_dir, 'yin.js')

    # Step 1: Compile WASM using emcc
    if args.verbose: print("  1. Compiling yin-wasm.c to yin.wasm with emcc...")
    emcc_command = [
        'emcc', yin_c_path,
        '-o', yin_wasm_path,
        '-s', 'WASM=1',
        '-s', 'STANDALONE_WASM',
        '-s', 'EXPORTED_FUNCTIONS=["_yinf0"]',
        '-Wl,--no-entry',
        '-O3'
    ]
    result = subprocess.run(emcc_command, capture_output=True, text=True)
    if result.returncode != 0:
        print("     emcc compilation failed!", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    if args.verbose: print("     emcc compilation successful.")

    # Step 2: Read and Base64-encode WASM
    if args.verbose: print("  2. Reading and encoding yin.wasm...")
    with open(yin_wasm_path, 'rb') as f:
        wasm_bytes = f.read()
    wasm_b64 = base64.b64encode(wasm_bytes).decode('ascii')

    # Step 3: Read worklet template
    if args.verbose: print("  3. Reading worklet template...")
    with open(worklet_template_path, 'r') as f:
        worklet_template = f.read()
    
    # Step 4: Embed WASM into worklet code
    if args.verbose: print("  4. Embedding WASM into worklet...")
    worklet_code = worklet_template.replace("__WASM_BASE64_PLACEHOLDER__", wasm_b64)

    # Step 5: Read Yin class source
    if args.verbose: print("  5. Reading Yin class source from yin.js...")
    with open(yin_class_path, 'r') as f:
        yin_class_code = f.read()

    # Step 6: Embed worklet into Yin class
    if args.verbose: print("  6. Embedding worklet into Yin class...")
    worklet_escaped = worklet_code.replace('\\', '\\\\').replace('`', '\\`').replace('$', '\\$')

    # Replace __WORKLET_CODE__ placeholder with escaped worklet code
    built_class_code = yin_class_code.replace("__WORKLET_CODE__", worklet_escaped)
    
    load_wasm_method = """    async _loadWasmBytes() {
        const response = await fetch('yin.wasm');
        const bytes = await response.arrayBuffer();
        return bytes;
    }"""
    built_class_code = built_class_code.replace(load_wasm_method, "")

    # Step 7: Write output
    if args.verbose: print(f"  7. Writing final output to {output_path}...")
    with open(output_path, 'w') as f:
        f.write(built_class_code)

    if args.verbose: print(f"-- {output_path} (re)built")


if args.font:
    #################################
    #      (re)build font.js        #
    #################################

    fontFileName = 'lib/Bravura.otf'
    outFileName = 'build/font.js'

    with open(outFileName, 'wb') as outFile:
        outFile.write(b"""
  { window.fontData = {} ;
    
    // Store base64 font data once
    const bravuraBase64 = \"""")

        with open(fontFileName,'rb') as inFile:
            outFile.write(base64.b64encode(inFile.read()))

        outFile.write(b"""\";
    
    // Load CSS font from the same data
    let fontFile = new FontFace("Bravura", "url(data:font/otf;charset=utf-8;base64," + bravuraBase64 + ")");
    document.fonts.add(fontFile);
    await fontFile.load();
    
    // Lazy loading: convert base64 to Uint8Array only when PDF-lib needs it
    window.fontData["Bravura"] = function() {
      if (!this._bytes) {
        const binary = atob(bravuraBase64);
        this._bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          this._bytes[i] = binary.charCodeAt(i);
        }
      }
      return this._bytes;
    }.bind({});

    // Vercetti font
    const vercettiBase64 = \"""")

        with open('lib/Vercetti-Regular.otf','rb') as inFile:
            outFile.write(base64.b64encode(inFile.read()))

        outFile.write(b"""\";

    let vercettiFont = new FontFace("Vercetti", "url(data:font/otf;charset=utf-8;base64," + vercettiBase64 + ")");
    document.fonts.add(vercettiFont);
    await vercettiFont.load();

    // Store Vercetti data for PDF-lib
    window.fontData["Vercetti"] = function() {
      if (!this._bytes) {
        const binary = atob(vercettiBase64);
        this._bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          this._bytes[i] = binary.charCodeAt(i);
        }
      }
      return this._bytes;
    }.bind({});

    // Patrick Hand font
    const patrickHandBase64 = \"""")

        with open('lib/PatrickHand-Regular.ttf','rb') as inFile:
            outFile.write(base64.b64encode(inFile.read()))

        outFile.write(b"""\";

    let patrickHandFont = new FontFace("Patrick Hand", "url(data:font/ttf;charset=utf-8;base64," + patrickHandBase64 + ")");
    document.fonts.add(patrickHandFont);
    await patrickHandFont.load();

    // Store Patrick Hand data for PDF-lib
    window.fontData["Patrick Hand"] = function() {
      if (!this._bytes) {
        const binary = atob(patrickHandBase64);
        this._bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          this._bytes[i] = binary.charCodeAt(i);
        }
      }
      return this._bytes;
    }.bind({});
  }
  """)

    if args.verbose: print(f'-- {outFileName} (re)built')

if args.sample:
    #################################
    #        (re)build sample.js    #
    #################################

    if shutil.which('ffmpeg') == None:
         sys.exit("Fatal error: building samples requires ffmpeg executable in your path.") ;

    import glob

    # define the path to where SalamanderGrandPianoV3 wav files are located:
    root = 'lib/Salamander' ;
    # initial cleanup
    # Define the samples we will package as 
    # ASPN:midi number items.
    # The standard 88-key piano range is A0-C8, but
    # we currentlty only use typical harpsichord/fortepiano
    # range of f1-f6.  The Salamander samples include
    # A,C,Ds, and Fs within each octave: intervening pitches
    # must be generated programmatically.
    notes = {
     'F#1':'30',
     'A1' :'33',
     'C2' :'36',
     'D#2':'39',
     'F#2':'42',
     'A2' :'45',
     'C3' :'48',
     'D#3':'51',
     'F#3':'54',
     'A3' :'57',
     'C4' :'60',
     'D#4':'63',
     'F#4':'66',
     'A4' :'69',
     'C5' :'72',
     'D#5':'75',
     'F#5':'78',
     'A5' :'81',
     'C6' :'84',
     'D#6':'87',
    }

    # covert .wav sample files to mp3.
    # Duration will be 2.25s.
    for note in notes:
        ifname = root + '/' + note + 'v8.wav'
        ofname = notes[note] + '.mp3'
        try:
            os.remove(ofname)
        except OSError:
            pass
        if args.verbose: print(f"Converting {ifname} to {ofname}")
        os.system('ffmpeg -i ' + ifname  + ' -acodec libmp3lame -t 2.25s -ac 2 -b:a 128k -ar 22050 ' + ofname + '> /dev/null 2>&1')

    #  package mp3 files in javascript module:
    outFileName = 'build/sample.js'
    with open(outFileName,'wb') as outFile:
        outFile.write(b"""/** Salamandar piano samples as base64 MP3 **/\n
// +skip
export {pianoSamples}
// -skip
""")
        outFile.write(b'let pianoSamples={\n') ;
        for fileName in sorted(glob.iglob('*.mp3')):
            varName = fileName.split('.')[0]
            with open(fileName,'rb') as inFile:
                if args.verbose: print(f'Converting {fileName} to base64 and adding to {outFileName}')
                data = base64.b64encode(inFile.read())
                outFile.write(bytes(varName,'utf-8'))
                outFile.write(b':atob("') ;
                outFile.write(data)
                outFile.write(b'"),\n')
        outFile.write(b'}\n');

    # clean up
    for note in notes:
      ofname = notes[note] + '.mp3'
      try:
        os.remove(ofname)
      except OSError:
        pass

if args.yin:
    build_yin(args)

# Define Packager class (used by both --podium and --ext builds)
import shutil

class Packager(object):

    inSkip = False
    inComment = False
    inString = False
    inTemplateLiteral = False

    def __init__(self, inFileName, inFileObj, outFileObj):
        if args.verbose: print(f'packaging {inFileName}') ;
        lineNumber = 0
        for line in inFileObj:
            lineNumber += 1
            # process skip directive
            if "// +skip" in line:
                self.inSkip = True
            elif "// -skip" in line:
                self.inSkip = False
            if self.inSkip:
                continue
            # process "<!--[" and "]-->": xml comments
            # surrounding square brackets. These lines
            # are simply stripped from the output..this
            # allows commenting out html for "unprocessed"
            # files, while uncommenting them in the
            # "processed" file.
            if "<!--[" in line:
              continue ;
            if "]-->" in line:
              continue ;
            # process "// #write directive:
            # Look for line like this: // #write blah blah blah
            # When found, write "blah blah blah" (or whatever) to
            # the output
            if "// #write " in line:
               outFileObj.write(line.replace("// #write ","")) ;
               continue ;
            # Process included file directive:
            # Look for lines like this: // #include build/score.js 
            #   or // #include build.score.js deflateAs
            # When found, include the given file in the output.
            if "// #include " in line: 
                includedFilePath = line.split()[2] ;
                if args.verbose: print("including ", includedFilePath) ;
                outFileObj.write(line.replace("#include","#inclusion", 1)) ;
                with open(includedFilePath) as includedFileObj:
                    if "minified" in line:
                        Packager(includedFilePath, includedFileObj, outFileObj)
                    elif "deflateAs" in line:
                        stringName = line.split()[-1] ;
                        self.deflateAs(stringName, includedFilePath, outFileObj) ;
                    elif "b64gzip" in line:
                        self.b64gzip(includedFilePath, outFileObj) 
                    elif "urlBlob" in line:
                        urlName = line.split()[-1] ;
                        outFileObj.write(f"\n\nfunction {urlName}_func() {{\n") ;
                        shutil.copyfileobj(includedFileObj, outFileObj)
                        outFileObj.write("}\n") ;
                        outFileObj.write(f'let {urlName} = window.URL.createObjectURL(new Blob(["(" + {urlName}_func.toString() + ")"], {{type: "text/javascript"}}));\n');
                    else:
                        shutil.copyfileobj(includedFileObj, outFileObj)
                continue 
            # The source code uses only double-quoted strings, "":
            # (single quoted strings, '', are only used within double-quoted strings)
            # In javascript, double-quoted strings must not span multiple lines.
            # Template literals (backticks) CAN span multiple lines and can contain
            # double-quoted strings (like SVG attributes), so we track them separately.
            if self.inString and not self.inTemplateLiteral:
                print(f"Error at {inFileName}:{lineNumber}, unterminated string |{line}|")
            charCount = len(line)
            i = 0
            outLine = ''
            while i < charCount:
                char = line[i]

                # Not in a comment - check for strings and template literals
                if not self.inComment:
                    # Check if we're entering/exiting a template literal
                    if char == '`' and (i == 0 or line[i-1] != '\\'):
                        self.inTemplateLiteral = not self.inTemplateLiteral
                        outLine += char
                        i += 1
                        continue

                    # If we're in a template literal, just copy characters
                    # (don't track double quotes inside template literals)
                    if self.inTemplateLiteral:
                        outLine += char
                        i += 1
                        continue

                    # Check if we're entering/exiting a double-quoted string
                    if char == '"' and (i == 0 or line[i-1] != '\\'):  # Check for escaped quotes
                        self.inString = not self.inString
                        outLine += char
                        i += 1
                        continue

                    # If we're in a string, just copy the character
                    if self.inString:
                        outLine += char
                        i += 1
                        continue

                # Check for comments
                if i < charCount - 1:
                    nextChar = line[i+1]
                    if char == '/':
                        if nextChar == '/':
                            # Found a comment - emit everything up to here
                            outLine = outLine.strip()
                            if len(outLine) > 0:
                                outFileObj.write(outLine)
                                outFileObj.write('\n')
                            outLine = ''  # Clear outLine so it doesn't get written again after the loop
                            # Skip rest of line
                            break
                        if nextChar == '*':
                            self.inComment = True
                            i += 2
                            continue
                    if self.inComment and char == '*' and nextChar == '/':
                        self.inComment = False
                        i += 2
                        continue

                if not self.inComment:
                    outLine += char
                i += 1
            outLine = outLine.strip() ;
            if len(outLine) > 0:
                outFileObj.write(outLine)
                outFileObj.write('\n')
 
    def deflateAs(self, stringName, includedFilePath, outFileObj):
        # constents of includedFilePath:
        # gzip-compressed > base64 encoded > written to outFileObj
        # as contents of string variable with given name
        outFileObj.write(f'let {stringName} = "') ;
        with open(includedFilePath, 'rb') as inFile:
            fileContents = inFile.read()
            fileContentsCompressed = gzip.compress(fileContents) # bytes object
            fileContentsB64 = base64.b64encode(fileContentsCompressed) # encoded bytes
            fileContentsUtf8 = fileContentsB64.decode('utf-8') 
            outFileObj.write(fileContentsUtf8) ;
        outFileObj.write('" ;\n') ;

# Helper function to build using Packager (used by both --podium and --ext builds)
def build(inFileName, outFileName):
    with open(inFileName) as inFileObj:
        with open(outFileName,"w") as outFileObj:
            Packager(inFileName, inFileObj, outFileObj)

if args.podium:
    # Build 1-file, all-included version of podium as "build/podium.html":
    build("src/podium.html", "build/podium.html")
    if args.verbose: print('-- podium.html (re)built.')

if(args.cert):
    if shutil.which('openssl') == None:
         sys.exit("Fatal error: creating certificate requires openssl executable in your path.") ;
    os.system('openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout key.pem -out cert.pem') ;

if args.ext:
    #####################################################
    #                                                   #
    #  Build browser extension in ext/                  #
    #                                                   #
    #####################################################

    import json

    # Create extension directory and clean up old files from previous builds
    os.makedirs('ext', exist_ok=True)
    os.makedirs('ext/icons', exist_ok=True)

    # Create subdirectories for multi-file approach (like ext.old)
    import shutil
    os.makedirs('ext/build', exist_ok=True)
    os.makedirs('ext/src', exist_ok=True)
    os.makedirs('ext/lib', exist_ok=True)

    # Copy library files
    if args.verbose: print('Copying library files...')
    shutil.copy('lib/fabric.min.js', 'ext/lib/fabric.min.js')
    shutil.copy('lib/pdf.min.js', 'ext/lib/pdf.min.js')
    shutil.copy('lib/pdf.worker.min.js', 'ext/lib/pdf.worker.min.js')
    shutil.copy('lib/pdf-lib.min.js', 'ext/lib/pdf-lib.min.js')
    shutil.copy('lib/fontkit.umd.min.js', 'ext/lib/fontkit.umd.min.js')

    # Copy source files (excluding ext.js which has its own version in ext/)
    if args.verbose: print('Copying source files...')
    for src_file in ['common.js', 'file.js', 'layout.js', 'menu.js',
                     'panel.js', 'score.js', 'smufl.js', 'tool.js', 'canvas.js', 'pasteBuffer.js', 'icon.js']:
        shutil.copy(f'src/{src_file}', f'ext/src/{src_file}')

    # Copy and patch main.js to fix pdf.worker path for extension
    with open('src/main.js', 'r') as f:
        main_js = f.read()
    main_js = main_js.replace(
        'pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";',
        'pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";'
    )
    with open('ext/src/main.js', 'w') as f:
        f.write(main_js)

    # Note: ext/src/ext.js is checked into git and not copied from src/
    # src/ext.js is a stub, ext/src/ext.js has the real extension implementation

    # Copy build artifacts (font.js, sample.js)
    if args.verbose: print('Copying build artifacts...')
    shutil.copy('build/font.js', 'ext/build/font.js')
    shutil.copy('build/sample.js', 'ext/build/sample.js')
    # Also copy to src/ so they can be imported as modules
    shutil.copy('build/font.js', 'ext/src/font.js')
    shutil.copy('build/sample.js', 'ext/src/sample.js')

    # Note: podium.html, manifest.json, background.js, and README.md are static files
    # checked into git under ext/ and not generated by the build process
    # ext/src/ext.js is also checked in (see comment above)

    # Generate icons from SVG
    # The piano glyph (U+E520) path is extracted from Bravura.otf using fonttools
    piano_glyph_path = "M274 274C243 274 221 264 203 248C189 236 186 228 182 228C177 228 180 235 171 252C164 264 149 273 123 273C64 273 32 231 1 174C-4 165 -6 160 -6 155C-6 148 -1 144 5 144C12 144 16 150 21 159C50 209 70 235 88 235C96 235 99 230 99 223C99 215 96 205 93 198L-30 -107C-33 -115 -35 -117 -45 -117H-76C-85 -117 -89 -121 -89 -130C-89 -138 -85 -142 -77 -142H116C125 -142 129 -138 129 -129C129 -121 125 -117 117 -117H77C71 -117 68 -117 68 -114C68 -113 69 -110 70 -107L115 5C117 10 119 17 124 17C129 17 132 7 148 -1C162 -8 175 -10 192 -10C288 -10 366 90 366 185C366 243 330 274 274 274ZM247 237C264 237 270 222 270 200C270 151 217 24 169 24C152 24 144 35 144 56C144 77 152 97 163 125L183 174C197 208 223 237 247 237Z"
    podium_icon_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="{size}" height="{size}">
  <path fill="#aaaaaa" stroke="#000" stroke-width=".6" stroke-linejoin="round"
    d="M4 23v-3h16v3h1.5h-19Z M7 20v-14h10v14 M7 12h-2l-3 -10 h20l-3 10h-2"/>
  <path fill="#000" transform="translate(9.8, 13.5) scale(0.015, -0.015)" d="''' + piano_glyph_path + '''"/>
</svg>'''

    # Try to generate icons using cairosvg (preferred) or ImageMagick
    icons_generated = False

    try:
        import cairosvg
        for size in [16, 48, 128, 512]:
            svg_content = podium_icon_svg.format(size=size)
            cairosvg.svg2png(bytestring=svg_content.encode('utf-8'),
                           write_to=f'ext/icons/icon{size}.png',
                           output_width=size,
                           output_height=size)
        icons_generated = True
        if args.verbose: print('Generated icons using cairosvg')
    except ImportError:
        # Try ImageMagick as fallback
        if shutil.which('convert'):
            for size in [16, 48, 128, 512]:
                svg_content = podium_icon_svg.format(size=size)
                svg_file = f'ext/icons/icon{size}.svg'
                with open(svg_file, 'w') as f:
                    f.write(svg_content)
                os.system(f'convert -background none {svg_file} -resize {size}x{size} ext/icons/icon{size}.png 2>/dev/null')
                os.remove(svg_file)
            icons_generated = True
            if args.verbose: print('Generated icons using ImageMagick')
        else:
            if args.verbose: print('Warning: Could not generate icons (install cairosvg or ImageMagick)')

    # Create a simple README for the extension
    readme = '''# Podium Browser Extension

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

Right-click on any PDF link and select "Open with Podium" to view the PDF in Podium.

## Icons

You need to add icon files (icon16.png, icon48.png, icon128.png) to the ext/icons/ directory.
These should be PNG images at 16x16, 48x48, and 128x128 pixels respectively.
'''

    with open('ext/README.md', 'w') as f:
        f.write(readme)
    if args.verbose: print('Created ext/README.md')

    # Create ZIP file for store submission
    import zipfile
    zip_path = 'build/podium-ext.zip'
    os.makedirs('build', exist_ok=True)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk('ext'):
            for file in files:
                file_path = os.path.join(root, file)
                # Archive path should be relative to ext/ (no containing folder)
                arc_path = os.path.relpath(file_path, 'ext')
                zf.write(file_path, arc_path)

    print('-- Browser extension built in ext/')
    if not icons_generated:
        print('   NOTE: Icons not generated. Install cairosvg (pip install cairosvg)')
        print('         or ImageMagick, then rebuild, or manually add icons to ext/icons/:')
        print('         - icon16.png (16x16)')
        print('         - icon48.png (48x48)')
        print('         - icon128.png (128x128)')
        print('         - icon512.png (512x512) - for store listing')
    else:
        print('   Icons generated successfully in ext/icons/')
    print(f'   Extension ZIP created: {zip_path}')
