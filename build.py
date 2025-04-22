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

if len(sys.argv) == 1:
   args = argparse.Namespace(verbose=True, font=True, sample=True, podium=True) ;
else:
  parser = argparse.ArgumentParser()
  parser.add_argument('-s','--sample', action='store_true', help='(re)build build/sample.js')
  parser.add_argument('-f','--font', action='store_true', help='(re)build build/font.js')
  parser.add_argument('-p','--podium', action='store_true', help='(re)build build/podium.html')
  parser.add_argument('-c','--cert', action='store_true', help='(re)build certificate')
  parser.add_argument('-v','--verbose', action='store_true')
  args = parser.parse_args()


os.system('mkdir build 2> /dev/null') ;

if args.font:
    #################################
    #      (re)build font.js        #
    #################################

    fontFileName = 'lib/Bravura.otf'
    outFileName = 'build/font.js'
    with open(outFileName, 'wb') as outFile:
        outFile.write(b"""
{ let fontFile = new FontFace("Bravura", "url(data:font/otf;charset=utf-8;base64,""") ;

        with open(fontFileName,'rb') as inFile:
          outFile.write(base64.b64encode(inFile.read()))

        outFile.write(b"""");
  document.fonts.add(fontFile);
  await fontFile.load();
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

if args.podium: 
    #####################################################
    #                                                   #
    #  (re)build build/podium.html from src/podium.html #
    #    ...a 1-file, all-included build                #
    #                                                   #
    #####################################################

    import shutil
    import sys

    class Packager(object):
    
        inSkip = False
        inComment = False
        inString = False

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
                # The source code uses only double-coded strings, "":
                # (single quoted strings, '', are only used within double-quoted strings)
                # In javascript, double-quoted strings must not span multiple lines.
                # This can be a problem for prettier.js-processed code, as it
                # will freely split quoted strings that are within template
                # literals.  Perfectly legal, but our feeble parsing is not
                # smart enough to notice template literals, so we disallow
                # this splitting.  Where needed, source code can use the directive
                # // prettier-ignore
                # ...to stop prettier from splitting such code.
                if self.inString:
                    print(f"Error at {inFileName}:{lineNumber}, unterminated string |{line}|")
                charCount = len(line)
                i = 0
                outLine = ''
                while i < charCount:
                    char = line[i]
                    if char == '"':
                        self.inString = False if self.inString else True
                    if not self.inString and i < charCount - 1:
                        nextChar = line[i+1]
                        if char == '/':
                            if nextChar == '/':
                                # Urls not within a double-quote string can contain "//" that looks like a comment to us. In javascript, 
                                # they should be escaped "/\/" in order to not be thus interpreted.
                                # We print a warning if we see something that looks like an un-escaped url.
                                loweredLine = line.lower()
                                if "http://" in loweredLine or "https://" in loweredLine:
                                    print(f"Warning, at {inFileName}:{lineNumber}, un-escaped url |{line}|")
                                # emit everything up to the comment
                                outLine = outLine.strip()
                                if len(outLine) > 0:
                                    outFileObj.write(outLine)
                                # force breaking to next line:
                                outLine = "" 
                                i = charCount
                                break 
                            if not self.inComment and nextChar == '*':
                                self.inComment = True
                                i += 2
                                continue
                        if self.inComment and char == '*' and nextChar == '/':
                            self.inComment = False
                            i += 2
                            continue
                        if not self.inComment and char == '/' and nextChar == '*':
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


    """
function inflate(b64GzipString) { 
  // returns blob
  let gzipString = atob(b64GzipString) ;
  let gzipBlob = new Blob([gzipString]) ;
  let decompressor = new DecompressionStream("gzip");
  let decompressedStream = gzipBlob.stream().pipeThrough(decompressor);
  let reader = decompressedStream.getReader() ;
  let chunks = [] ;
  reader.read().then(function nextChunk({done,value}) {
    if(done) return new Blob(chunks, {type:"application/javascript"}) ;
    chunks.push(chunk) ;
    reader.read().then(nextChunk) ;
  });
}

    """

    def build(inFileName, outFileName):
        with open(inFileName) as inFileObj:
            with open(outFileName,"w") as outFileObj:
                Packager(inFileName, inFileObj, outFileObj)
    
    # Build 1-file, all-included version of podium as "build/podium.html":
    build("src/podium.html", "build/podium.html") 

    if args.verbose: print('-- podium.html (re)built.')

if(args.cert):
    if shutil.which('openssl') == None:
         sys.exit("Fatal error: creating certificate requires openssl executable in your path.") ;
    os.system('openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout key.pem -out cert.pem') ;
