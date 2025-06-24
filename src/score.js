// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https://www.gnu.org/licenses/>.
**/

export { Grid, Pg, Score };
import { Spot, getBox, clamp, clearChildren, delay, fontUnmap, helm, inflate, listen, rotatePoint, saveLocal, Schedule, schedule, Timer } from "./common.js";
import { Layout } from "./layout.js";
import { panels } from "./panel.js";
import { Grid } from "./canvas.js";

// -skip

/**
class Pg
  Represents a page in a score.  Named Pg, not Pg, and its instances
  generally referred to as pg's, not pages: this is to clearly
  distinguish the class and its instances from more informal uses of
  the term page.
**/

class Pg {
  // Default color used to pad pages < maxWidth and/or maxHeight:
  static paddingColor = "#ffffff";

  constructor(score, width, height, json, mozPn = null, background = null) {
    //  @score: reference to Score instance this Pg is part of
    //  @width: page width in css px's
    //  @height: page height in css px's
    //  @json: json object representaton of fabric canvas
    //  @mozPn Iff page loaded from a pdf file, this is the pdf file's page number
    //  (1-based). When this value is 0, it means the page was newly
    //  created, and does not have a "backing" file in the pdf.
    //  @background: optional, rgb color to set as pg's background color.
    //   Visible only if this page is backed by a pdf file.

    this.background = background;
    this.canvas = null; // fabricjs canvas
    this.domCanvas = null; // html dom canvas
    this.editable = false;
    this.elm = null; // shortcut for this.canvas.wrapperEl: the base element of the fabric canvas dom
    this.grid = null; // Grid instance, if any
    this.inflated = false; // true iff a fabricjs canvas is currently available
    this.inUse = false; // marker for class Score's caching algorithm
    this.score = score;
    this.height = height;
    this.json = json;
    this.mozPn = mozPn;
    this.thumbUrl = null;
    this.width = width;
    this.paddingColor = null;
    this.undoStack = [];
    return this;
  }

  async renderPdf() {
    // If this page is used to display pdf content (the usual case),
    // then this function renders that pdf to a dom canvas instance
    // referenced as this.mozCanvas (short for mozilla pdf library
    // canvas). The code could have rendered the pdf directly into
    // the fabricjs as a fabric "background image", but that route
    // was found to have poorer resolution that using a decicated
    // dom canvas.
    let mozPg = await this.score.mozDoc.getPage(this.mozPn);
    let viewport = mozPg.getViewport({ scale: this.score.quality });
    let w = viewport.width / this.score.quality;
    let h = viewport.height / this.score.quality;

    let mozCanvas = helm(`<canvas width="${viewport.width}" height="${viewport.height}" 
      style="width:${w / _pxPerEm_}em;height:${h / _pxPerEm_}em;font-size:1em"></canvas>`);
    if (this.mozCanvas) this.mozCanvas.replaceWith(mozCanvas);
    else this.canvas.wrapperEl.append(mozCanvas);
    this.mozCanvas = mozCanvas;
    this.setZoom(this.zoom);
    let ctx = mozCanvas.getContext("2d");
    await mozPg.render({
      // render *without* annotations
      annotationMode: pdfjsLib.AnnotationMode.DISABLE,
      canvasContext: ctx,
      viewport: viewport,
    }).promise;
    if (!this.paddingColor) {
      // In case the page needs padding, i.e. when it is narrower and/or shorter
      // than it's score's maxWidth/maxHeight, layouts will center the page using
      //  the color of the pixel in the page's upper left corner's color as padding.
      // ...getImageData is expensive, so only call this when Pg is first rendered
      let p = ctx.getImageData(50, 50, 1, 1).data;
      let toHex = (c) => {
        let h = c.toString(16);
        return h.length == 1 ? "0" + h : h;
      };
      this.paddingColor = "#" + toHex(p[0]) + toHex(p[1]) + toHex(p[2]);
    }
  }

  async inflate(render = true) {
    // To conserve memory, Pg instances are stored "deflated", and only
    // "inflated" when they are to be actively displayed on screen in
    // a layout.
    // @render when false, the pg is fully inflated, but the pdf is not
    // actually rendered.  This is used when a Pg that is currenly  not
    // on-screen needs to be inflated for serialization of for printing:
    // in this case, there is no need to actually render the Pg.
    if (this.inflated) return this;
    let score = this.score;
    this.domCanvas = document.createElement("canvas");
    let canvas = new fabric.Canvas(this.domCanvas, {
        enablePointerEvents: true,
        allowTouchScrolling: true,
        imageSmoothingEnabled: false,
    });
    this.domCanvas = null ;
    this.canvas = canvas;
    // Setting both *without* cssOnly (in implicit px's), then *with* cssOnly
    // (in explicit em's) creates a canvas that can be resized by simply changing
    // its font size. Not sure why, seems to be a fabricjs oddity.
    canvas.setDimensions({
        width: this.width,
        height: this.height,
    });

    canvas.setDimensions( {
        width: this.width / _pxPerEm_ + "em",
        height: this.height / _pxPerEm_ + "em",
    },  { cssOnly: true }   );

    if (this.json) await new Promise((resolve, reject) => 
        this.canvas.loadFromJSON(this.json, () => resolve()));
    if (render && this.mozPn) await this.renderPdf();
    else if (this.background) canvas.setBackgroundColor(this.background);

    canvas.requestRenderAll();
    this.json = null; // allow quick garbage collection
    this.elm = canvas.wrapperEl; // convenience shortcut
    this.elm.pg = this; // convenience for accesing pg from dom
    this.style = this.elm.style; // convenient shorthand

    // handlers that, together with login in _menu_, help to add, delete,
    // select, etc. fabricjs objects used to annotate pages:

    canvas.on("mouse:down:before", (opts) => {
        // If opts.e.disarm  true, a no-op: prevents recursion for some algorithms in _menu_.pgDownEvent
        if (_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell) {
            if (opts.e.disarm) return;
            if (_menu_.activeRing.activeCell.key != "transform") _menu_.pgDownEvent(opts, this);
        }
    });

    canvas.on("mouse:up", (opts) => {
        if (_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell) {
            this.score.setDirty() ;
            if (_menu_.activeRing.activeCell.key != "transform") _menu_.pgUpEvent(opts, this);
            if (!_menu_.activeRing?.activeCell?.elm.classList.contains("Menu__cell-locked")) _menu_.activateCell(null);
        }
    });

    canvas.on("selection:created", (opts) => {
        // Podium only allows one active object (or group), even across multiple pg's, so discard from all other pg's:
        Pg.clear = false; // disable recursive calls to selection:cleared handler from running
        for (let pg of score.pgs) if (pg.inflated && pg != this) pg.canvas.discardActiveObject().requestRenderAll();
        Pg.clear = true;
    });

    canvas.on("selection:cleared", (opts) => {
        if (Pg.clear) for (let pg of score.pgs) if (pg.inflated && pg != this) pg.canvas.discardActiveObject().requestRenderAll();
    });

    // each pg instances has its own undo stack:
    let pushState = (obj) => {
        let stack = this.undoStack;
        if (this.undoing) return;
        stack.push(this.canvas.toDatalessObject());
        while (stack.length > 20) stack.shift(); // prune
        _menu_.enableCells(["ink/undo"], true);
    };

    canvas.on("object:added", ((obj) => pushState(obj)).bind(this));
    canvas.on("object:removed", ((obj) => pushState(obj)).bind(this));
    canvas.on("object:modified", ((obj) => pushState(obj)).bind(this));
    if (this.undoStack.length == 0) // initialize undo stack on first inflate
       this.undoStack.push(this.canvas.toDatalessObject());

    this.inflated = true;
    this.setEditable(this.editable); // indicate pg is editable. note: called AFTER setting this.inflated
  }

  deflate(full = false) {
    // Deflate's a Pg, releasing its resources for garbage collection.
    // @full boolean: iff true, any thumbElm is not deleted during
    //   deflation.
    if (this.inflated) {
      if (full) {
        this.thumbElm?.remove();
        this.thumbElm = null;
        this.json = null;
      } else this.json = this.toJson();
      this.canvas.clear() ;
      this.canvas.dispose();
      this.canvas = null;
      this.mozCanvas?.remove();
      this.mozCanvas = null;
      this.elm = null;
      this.grid = null;
      this.inflated = false;
    }
    return this;
  }

  async getThumbElm(force) {
    // @return thumbnail elm for this pg. It is created on first call,
    // then stored: subsequent calls returned the stored value, unless
    // @force is true: in this case, the thumbnail is always (re) calculated.
    //
    // There are many many ways to generate the thumbnail. This implementation,
    // though a little complex, seems to be the fastest and consumes the
    // the least memory: 
    // - this.mozCanvas is first compacted by drawing it into a new tmp canvas
    // - tmp canvas blob-ized, then wrapped as an object URL
    // - the fabric canvas is compacted into a tmp canvas through fabric's toCanvasElement(scale)
    // -  this result is blob-ized, then wrapped into an object URL.
    // -  the 2 object URLs are set as the background image of this.thumbElm
    // -  the two object URLs are revoked on after a delay of 10 animation frames
    if (!this.thumbElm || force) {
      let deflated = !this.inflated;
      if (deflated) await this.inflate();
      let scale = 192 / Math.max(this.width, this.height);
      let w = this.width * scale, h = this.height * scale;
      this.thumbElm = helm(`<div class="TableLayout__pg" style="width:${w / _pxPerEm_}em;height:${h / _pxPerEm_}em;"></div>`);
      // create object URL for fabric canvas
      let fabCanvas = this.canvas.toCanvasElement(scale);
      let fabUrl = URL.createObjectURL(await new Promise((res) => fabCanvas.toBlob((b) => res(b))));
      if(this.mozCanvas) {
        // create obj URL for mozCanvas (from mozilla pdf src) ;
        let pdfCanvas = helm(`<canvas width="${w}" height="${h}"></canvas>`);
        pdfCanvas.getContext("2d").drawImage(this.mozCanvas, 0, 0, w, h);
        let pdfUrl = URL.createObjectURL(await new Promise((res) => pdfCanvas.toBlob((b) => res(b))));
        this.thumbElm.style.backgroundImage = "url('" + fabUrl + "'), url('" + pdfUrl + "')";
        delay(10, () => { URL.revokeObjectURL(pdfUrl); URL.revokeObjectURL(fabUrl);  }); // delay is needed!
      }
      else {
        this.thumbElm.style.backgroundImage = "url('" + fabUrl + "')";
        delay(10, () => URL.revokeObjectURL(fabUrl)) ;
      }
      if (deflated) this.deflate();
    }
    return this.thumbElm;
  }

  async clone(inflate = false) {
    // @return a clone of this page.
    // @inflate when true, the clone is inflated, otherwise not.
    let theClone = new Pg(this.score, this.width, this.height, this.toJson() || this.json, this.mozPn, null);
    if (this.thumbElm) theClone.thumbElm = this.thumbElm.cloneNode();
    if (inflate) await theClone.inflate();
    return theClone;
  }

  setEditable(bool) {
    // @bool when false, pg is not editable: user interaction on the pg is
    // processed by the score's layout to navigate between pg's.
    // When true, user interaction directly affects the pg, i.e. it is
    // used to add,delete, modify fabricjs objects used as annotations.
    this.editable = bool;
    if (this.inflated) {
      this.canvas.upperCanvasEl.style.pointerEvents = bool ? "auto" : "none";
    }
  }

  setZoom(zoom) {
    // Pg dom element is initially sized to this.width/this.height. Setting
    // @zoom to a value other than 1 will scale the element uniformally
    //  in width/height.
    this.zoom = zoom;
    if (!this.inflated) return;
    this.canvas.setDimensions({ width: (this.width * zoom) / _pxPerEm_ + "em", height: (this.height * zoom) / _pxPerEm_ + "em" }, { cssOnly: true });
    if (this.grid) this.grid.setZoom(zoom);
    if (this.mozCanvas) {
      this.mozCanvas.style.width = (this.width / _pxPerEm_) * zoom + "em";
      this.mozCanvas.style.height = (this.height / _pxPerEm_) * zoom + "em";
    }
    return this.canvas.requestRenderAll();
  }

  toJson() {
    // @return string, the JSON representation of the fabricjs canvas encapsulation.
    if (!this.inflated) return null; // only call this on inflated pg's
    return this.canvas.toJSON();
  }

  async undo() {
    // pop an entry from the undo stack, resetting pg's state
    this.setDirty(true) ;
    let stack = this.undoStack;
    if (stack.length > 1) {
      this.undoing = true;
      stack.pop();
      await new Promise((resolve, reject) => this.canvas.loadFromJSON(stack[stack.length - 1], () => resolve()));
      if (this.image) await new Promise((resolve, reject) => this.canvas.setBackgroundImage(this.image, () => resolve()));
      this.canvas.requestRenderAll();
      this.undoing = false;
    } else {
      _menu_.enableCells("ink/undo", false);
      _menu_.activateCell(null);
    }
  }

  mergeObjects() {
    // This function will effect how a subsequent call of this.toPdf
    // behaves: it marks all objects on the page with a merge=true
    // property, and set them un-selectable and un-evented.
    // When a page is subsequently saved to pdf, objects with this
    //  merge property are added to the pdf as normal pdf items, i.e.
    // "merged" into the pdf. Object without this property will be
    // added as pdf stamp annotations that could, in theory, be further edited
    // by other pdf tools.
    for (let obj of this.canvas.getObjects()) {
      obj.merge = true;
      obj.selectable = false;
      obj.evented = false;
    }
    this.canvas.requestRenderAll();
  }

  async toPdf(ink, pLibPg) {
    // Incorporate all fabricjs objects on this pg's fabricjs canvas into the given PDFLib page.
    // @ink determines "how" the objects will be incorprated, see objToPdf below for details.
    // @pLibPg the PDFLib page that will be modified.
    // @return the json-serializion of the fabricjs canvas.

    let toPDFColor = (fabricColor) => {
      // PDFLib doesn't have rgba: instead, it uses rgb  and a
      // separate var vor opacity. Here, we convert "rgba(0,127.5,255,xxx)" -> "rgb(0,.5,1)"
      let c = fabricColor.split("(")[1].split(")")[0].split(",");
      return PDFLib.rgb(c[0] / 255, c[1] / 255, c[2] / 255);
    };

    let toPDFOpacity = (fabricColor) => {
      // return alpha component from "rgba(0,127.5,255,.612), or 1 if not available
      if (fabricColor.startsWith("rgb(")) return 1;
      let c = fabricColor.split("(")[1].split(")")[0].split(",");
      return parseFloat(c[3]);
    };

    let wasInflated = this.inflated;
    if (!wasInflated) await this.inflate(false); // temporarily re-inflate, but skip  unnecessary rendering
    // delete all existing annotations
    let annots = pLibPg.node.Annots();
    if (annots) annots.array.splice(0, annots.array.length);
    let pageHeight = pLibPg.getHeight();

    // Now convert each fabric object to PDFLib object:
    for (let obj of this.canvas.getObjects()) {
      switch (obj.type) {
        case "textbox": {
          // find the pdf font name from object's fontFamily, fontStyle, and fontWeight values
          let pdfFontName = fontUnmap[`${obj.fontFamily}/${obj.fontStyle}/${obj.fontWeight}`];
          if (!pdfFontName) pdfFontName = "Times-Roman";
          let pdfFont = this.score.embeddedFonts[pdfFontName];
          if (!pdfFont) {
            pdfFont = await pLibPg.doc.embedFont(window.fontData[pdfFontName] ?? pdfFontName);
            this.score.embeddedFonts[pdfFontName] = pdfFont;
          }
          // For PDFLib, y: locates baseline of first (or only) line of text, but fabric's y
          // is position of the bounding box.  We don't have metrics to know where the baseline
          // is in relation to this bounding box, but emperically, it is about 0.9 * the fontSize.
          let scale = obj.scaleX;
          let fontSizeToPx = 0.666;
          let drop = obj.fontSize * 0.9 * scale;
          let angle = (obj.angle / 360) * (Math.PI * 2);
          let pp = rotatePoint(obj.left, obj.top + drop, obj.left, obj.top, angle);
          await this.objToPdf(obj, ink, pLibPg, pLibPg.drawText, [
            obj.text,
            {
              x: pp.x,
              y: pageHeight - pp.y,
              font: pdfFont,
              rotate: PDFLib.degrees(360 - obj.angle),
              height: obj.height * scale,
              width: obj.width * scale,
              maxHeight: obj.height * scale,
              maxWidth: obj.width * scale,
              size: obj.fontSize * scale,
              color: toPDFColor(obj.fill),
              opacity: toPDFOpacity(obj.fill),
              lineHeight: obj.lineHeight * obj.fontSize * fontSizeToPx * scale,
            },
          ]);
          break;
        }
        case "path": {
          let pathStr = "";
          // Create an svg-style path string, where every point is scaled and
          // rotated by (obj.scaleX, obj.scaleY), and obj.angle
          let offsetX = obj.path[0][1];
          let offsetY = obj.path[0][2];
          let minX = obj.path[0][1];
          let minY = obj.path[0][2];
          // ...first find the minimum x and y in the path so that we can initially
          // translate entire path to upper left corner for convenient scale/rotate
          obj.path.forEach((pathlet) => {
            for (let i = 1; i < pathlet.length; i++) {
              if (i & 1) minX = Math.min(pathlet[i], minX);
              else minY = Math.min(pathlet[i], minY);
            }
          });
          // ...now scale and rotate, then translate to obj.left/obj.top
          let xTrans = obj.left;
          let yTrans = obj.top;
          let angle = (obj.angle / 360) * (Math.PI * 2);
          obj.path.forEach((pathlet) => {
            pathStr += pathlet[0];
            // each "pathlet" will have an operator (M or Q) followed by pairs of x,y
            // coordinates
            for (let i = 1; i < pathlet.length; ) {
              let x = (pathlet[i++] - minX) * obj.scaleX;
              let y = (pathlet[i++] - minY) * obj.scaleY;
              let sin = Math.sin(angle);
              let cos = Math.cos(angle);
              let xx = x * cos - y * sin + xTrans;
              let yy = x * sin + y * cos + yTrans;
              pathStr += xx + " " + yy + " ";
            }
          });

          await this.objToPdf(obj, ink, pLibPg, pLibPg.drawSvgPath, [
            pathStr,
            {
              // PDFLib flips the y axis, but doesn't do a translation,
              // hence y must be set to pageHeight, otherwise drawing
              // is below visible portion of page
              y: pageHeight,
              borderWidth: obj.strokeWidth * obj.scaleX, // assume obj.scaleX == obj.scaleY
              borderColor: toPDFColor(obj.stroke),
              borderOpacity: toPDFOpacity(obj.stroke),
              borderLineCap: PDFLib.LineCapStyle.Round,
            },
          ]);
          break;
        }

        case "image": {
          // obm, the fabricjs image, is assumed to have a src property that
          // must be a dataURL starting with "data:image/jpeg; or "data:image/png;"
          let res = await fetch(obj.src) ;
          let bytes = new Uint8Array(await res.arrayBuffer()) ;
          let image = obj.src.startsWith("data:image/jpeg;") ? await pLibPg.doc.embedJpg(bytes) : 
              obj.src.startsWith("data:image/png;") ? await pLibPg.doc.embedPng(bytes): null ;
          if(!image) throw new Error("Unknown image type in data url:" + obj.src.substring(20) + "...") ;
          let scale = obj.scaleX;
          let angle = (obj.angle / 360) * (Math.PI * 2);
          // "un"rotate bl.x and bl.y
          let pp = rotatePoint(obj.aCoords.bl.x, obj.aCoords.bl.y, obj.aCoords.bl.x, obj.aCoords.bl.y, -angle);
          await this.objToPdf(obj, ink, pLibPg, pLibPg.drawImage, [
              image,
              { x: pp.x,
                y: pageHeight - pp.y,
                rotate: PDFLib.degrees(360 - obj.angle),
                height: obj.height * scale,
                width: obj.width * scale,
              },
          ]);
          break ;
        }
        default: {
          console.log("Unsupported fabric obj:", obj.type);
        }
      }
    }
    let json = this.toJson();
    if (!wasInflated) this.deflate();
    // The returned json will not contain any fabricjs objects with the "merge" property:
    // these will have been encorporated directly into the pdf.
    json.objects = json.objects.filter((obj) => !obj.merge);
    return json;
  }

  async objToPdf(obj, ink, pLibPg, func, funcArgs) {
    // Helper function for creates and adds a pdf object to pLibPg,
    // where that  object is fabricated from the given fabricjs obj.
    //
    // @obj  fabricjs object
    // @ink  "none", "pdf", or "stamp"
    //   when ink == "none", the object is added to pLibPg whenever obj.mergePdf is true
    //   when ink == "pdf", the object is added into pLibPg
    //   when ink == "stamp", the object is added to a "temporary" pLibPg, then copied
    //     into pLibPg as a stamp annotation
    // @pLibPg pdf-lib page to add annotation to
    // @func pdf-lib member function to draw the annotation (drawCircle, drawRect, etc...
    // @funcArgs ... array of arguments to func
    let pLibDoc = pLibPg.doc;
    let context = pLibDoc.context;
    let { width, height } = pLibPg.getSize();
    if ((ink == "none" && obj.merge) || ink == "pdf") {
      // apply func to current page
      func.apply(pLibPg, funcArgs);
      return;
    }
    // Add object as a Stamp annotation:
    // - first, create a tmpPage and apply func to it.
    // - "re-forge" tmpPage's content into a stamp annotation
    //   whose appearance stream is an XObject Form made from
    //   tmpPage's content.
    // - Add the XObject pLibPg
    // - remove tmpPage from the document
    let tmpPage = pLibDoc.addPage([width, height]);
    func.apply(tmpPage, funcArgs);
    let content = tmpPage.contentStream.clone();
    let stamp = new PDFLib.PDFAnnotation(
      context.obj({
        Type: "Annot",
        Subtype: "Stamp",
        Rect: [0, 0, width, height],
      })
    );
    let PDFName = PDFLib.PDFName;
    content.dict.context = context;
    content.dict.set(PDFName.of("Type"), PDFName.of("XObject"));
    content.dict.set(PDFName.of("SubType"), PDFName.of("Form"));
    content.dict.set(PDFName.of("BBox"), context.obj([0, 0, pLibPg.getWidth(), pLibPg.getHeight()]));
    content.dict.set(PDFName.of("Resources"), tmpPage.node.dict.get(PDFName.of("Resources")));
    stamp.setNormalAppearance(context.register(content));
    if (pLibPg.node.has(PDFName.Annots)) pLibPg.node.Annots().push(stamp.dict);
    else pLibPg.node.set(PDFName.Annots, context.obj([stamp.dict]));
    pLibDoc.removePage(pLibDoc.getPageCount() - 1);
  }
}

/**
class Score
  Class that represents a pdf file, with functionality to load/save
  pdf from binary data.

  It maintains an array of Pg instances, and manages when they are
  inflated/deflated in order to keep memory usage to a minimum.  Pgs
  are inflated and marked as inUse == true when they are displayed
  on-screen, and marked inUse == false when not.  Up to MAX_INFLATED
  most-recently-inflated unused pgs are left inflated, under the
  assumption that they they are likely to be need inflation soon.
   
  It manages serializing/deserializing binary pdf data of each pg,
  including a pdf attachment containing json serialization of each
  pg's fabricjs objects, if any, together with other metadata
  describing the score.

  It provides static methods for creating new "empty" scores, and for
  manages a most-recently-used list of score file references that is
  stored in browser-local storage.

  Because Scores can consume a lot of memory, only one Score, referenced
  as Score.activeScore, is supported.
**/

class Score {
  static activeScore = null;
  static MAX_INFLATED = 6; // maximum number of unused inflated pgs: see Score.pgUnuse()

  // Define constants to identify the various sources that Scores
  // can be created from.  These will be strings that are shown to
  // users, so they should be meaningful.
  // Note: internally created Scores will have a null source until
  // they are saved, then reopened.
  static sources = Object.freeze({
    local: "Local",
    gdrive: "Drive",
    dbx: "Dropbox",
    odrive: "OneDrive",
  });

  static async newScore(pgKnt, width, height) {
    // Create a new score that consists entirely of empty pages,
    // not backed by and pdf.
    // @pgKnt number of pages in the new score
    // @width in px
    // @height in px
    let score = new Score();
    for (let i = 1; i <= pgKnt; i++) {
      let pg = new Pg(score, width, height, null, null, "#fff");
      /*
        // for testing only, add a page number to each page:
        pg.inflate();
        pg.canvas.add(new fabric.Textbox("pg " + i));
        pg.deflate();
      */

      /*
        // For testing, onall add a small and large pages to test the
        // Pg padding mechanism provided by layouts:
      if (i == 1) pg = new Pg(score, width / 10, height / 10, null, null, "#f00");
      if (i == 3) pg = new Pg(score, width * 2, height * 2, null, null, "#f00");
      if (i == 5) pg = new Pg(score, width * 2, height * 2, null, null, "#0f0"); */
      await score.pgAdd(pg, i);
    }
    // don't init score until after pgs are added, or layouts will fail
    await score.init(null, null, `anon${Math.round(Math.random() * 100)}.pdf`);
    return score;
  }

  static visit(score, updates = null, path = null) {
    // This method maintains/updates the "recently visited" list displayed
    // in the OpenPanel and SavePanel.
    //
    // @score object that defines at least { source,name, path }. Usually, but not
    // necessarily, a Score instance.  The recent list is searched for
    // an entry with exactly matching source,name, and path, and that
    // entry is removed.  Then:
    // @updates if non null, an object containing fields that are assigned
    // to the matched score object.  The resulting object is assigned to
    // the head of the recent stack. If null, this is all skipped, so the
    // operation effectively deletes the matched score entry.
    // @path if non-null, then invokes unique path processing:
    //    If score is non-null, then any score with a matching
    //    path entry has it's path updated.  If score is null,
    //    then the entry is removed.
    // examples:
    // visit({source:"xxx"}, <<ignored>>, "/usr/bin") Removes every entry with
    //   a path element of "/usr/bin"
    // visit(score, <<ignored>>, "/usr/bin") Changes the path element
    //   for every list entry that matches score.path to "/usr/bin"
    // visit(score)  // delete score entry, if it exists
    // visit(score, {}) // deletes score entry, if it exists,
    // then inserts new entry for score at list head
    //  visit(score, { name:newName} deletes if exists, then updates
    //         name field of score, then reinserts at list head
    //  visit(score, {name:newName, size:newSize, modified: <<timestamp>>}
    //        deletes entry if exists, updates score, then reinserts at list head

    let recent = JSON.parse(window.localStorage.getItem("recent") || "[]");
    // a path change (i.e. a folder rename) affects potentially many recent list entries
    if (path) {
      for (let i = 0; i < recent.length; i++) {
        let entry = recent[i];
        if (entry.source == score.source && entry.path == score.path) entry.path = path;
      }
      localStorage.setItem("recent", JSON.stringify(recent));
      return;
    }
    // non-path change...at most 1 entry
    let prev;
    for (let i = 0; i < recent.length; i++) {
      let entry = recent[i];
      if (entry.source == score.source && entry.name == score.name && entry.path == score.path) {
        prev = recent.splice(i, 1)[0];
        break;
      }
    }
    if (updates) {
      recent.unshift({
        name: score.name,
        source: score.source,
        path: score.path,
        size: updates.size || prev?.size || "?",
        created: "created" in updates ? updates.created : prev?.size || "?",
        modified: "modified" in updates ? updates.modified : prev?.modified || "?",
      });
    }
    recent.slice(0, 20); // limit to 20 most recent
    localStorage.setItem("recent", JSON.stringify(recent));
  }

  // meta-info about the score
  name = null; // score's named: from constructor
  path = null; // score's path, excluding name, if available: from constructor
  source = null; // score's source (where did score come from?), if available: from constructor
  size = null; // score's size in bytes
  now = Date.now();
  created = this.now;
  modified = this.now;
  pdfInfo = null; // meta-info extracted from pdf src

  embeddedFonts = null; // Used by this.toPDF() to prevent fonts from being embedded more than once
  maxHeight = -1; // maxHeight among all pg's in score
  maxWidth = -1; // maxWidth among all pg's in score
  pgs = []; // array of Pg instances for all pages in a score
  mozDoc = null; // reference to mozilla pdflib document, if available
  quality = 2; // pdf rendering quality: see Pg.renderPdf()
  dirty = false ; // true iff score has been modified (i.e. requires saving) 

  constructor() {
    // Since constructing a score calls async functions, and since a constructor
    // can't be marked async, the constructor must be invoked as:
    //      await new Score().init(....) ;
  }

  async init(source, path, name, pdfData) {
    // Initialize a new Score, always called as part of the constructor, ex. await new Score().init(...)
    // @source one of Score.sources, identifies the data source that provides the score's data.
    //  For new scores (no external data sources), this is just null.
    // @path identifies the file path in the data source (not including name), or null for new scores.
    // @name identifies the file name of the data source (not including path)
    // @pdfData bytearray containing pdf file, or null for new scores.
    document.getElementById("title").innerText = name ? name.replace(/\.pdf/i, ""):"Podium" ;
    // Note: new, locally created files won't have any pdfData: it will be null or undefined
    Object.assign(this, { source, path, name });
    Score.activeScore = this;
    this.quality = _menu_.rings.score.cells.details.stash.quality ?? this.quality;

    // Reset _menu_ numbers cell...it caches values from previous score (possibly read from localStorage)
    Object.assign(_menu_.rings.page.cells.numbers.stash, { pn: 1, pnOffset: 0, bookmarks: {} });

    if (pdfData) {
      this.size = pdfData.byteLength ;
      if (!window.pdfjsLib) {
        // mozilla pdfjsLib is loaded from mozSrc and mozWorkerSrc (strings
        // (base64-encoded-gzipped strings defined globally) on demand
        let pdfUrl = window.URL.createObjectURL(await inflate(mozSrc));
        mozSrc = null; // allow gc
        await import(pdfUrl);
        window.URL.revokeObjectURL(pdfUrl);
        let mozWorkerUrl = window.URL.createObjectURL(await inflate(mozWorkerSrc));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = mozWorkerUrl;
        mozWorkerSrc = null; // allow gc
      }

      let loadingTask = window.pdfjsLib.getDocument(pdfData);

      // is this an encrypted pdf?
      loadingTask.onPassword = (callback) => {
        let password = prompt("Enter Document Password:", "");
        if (password) callback(password);
        else throw new Error("pdf password failure");
      };

      this.mozDoc = await loadingTask.promise;
      // Grab pdf metadata's info, if available
      let meta = await this.mozDoc.getMetadata() ;
      this.pdfInfo = meta ? meta.info : null ;

      // Grab podium attachment, if available
      let scoreJson = null ;
      let podiumAttachment = (await this.mozDoc.getAttachments())?.podium;
      if (podiumAttachment) {
        // scoreJson, if it exists
        scoreJson = JSON.parse(new TextDecoder().decode(podiumAttachment.content));
        this.created = scoreJson.created || this.created ;
        this.modified = scoreJson.modified || this.modified ;
        this.quality = scoreJson.quality ?? this.quality;
        _menu_.stashFromJsonObj(scoreJson.menu);
      }

      // create a Pg instance for every pdf page, and calculate the
      // max {width/height} over all pgs. 
      for (let i = 1; i <= this.mozDoc.numPages; i++) {
        let mozPage = await this.mozDoc.getPage(i);
        let [left, top, width, height] = mozPage.view ;
        this.pgs.push(new Pg(this, width, height, scoreJson?.pages ? scoreJson.pages[i] : null, i));
        this.maxWidth = Math.max(width, this.maxWidth);
        this.maxHeight = Math.max(height, this.maxHeight);
      } 
    }

    // update the _menu_ state for newly created Score instance:
    _menu_.enableCells(["ink", "page", "layout", "score/save", "score/close", "score/details", "score/print", "score/bind"]);
    _menu_.enableCells("ink/undo", false); // nothing to undo yet
    this.pgRefresh();

    panels.DetailsPanel.get(_menu_.rings.score.cells.details).refresh();

    // layout the score using current active layout, defaulting to book layout
    _menu_.reset() ;
    let cell = _menu_.rings.layout.activeCell || _menu_.rings.layout.cells.book ;
    await Layout.open(cell) ;
    return this;
  }

  async toPdf(ink = "stamp", doc = false) {
    // Use PDFLib to create PDF representation of this score.
    // @ink === none, skip fabric objects entirely (even as attachment??)
    //      === "stamp" add fabric object as stamp annotation
    //      === "pdf" add fabric object as pdf object
    // @doc if true, the PDF-LIB doc object is returned, otherwise the
    //    pdf bytes that is produces is returned.
    let srcPLibDoc = this.mozDoc ? await PDFLib.PDFDocument.load(await this.mozDoc.getData()) : null;
    let dstPLibDoc = await PDFLib.PDFDocument.create();
    dstPLibDoc.registerFontkit(window.fontkit);
    // Reset te embeddedFonts array: it prevents Pg instances from embedding same font twice.
    this.embeddedFonts = [];
    let now = new Date();

    let attachment = {
      created: this.created,
      modified: now,
      maxWidth: this.maxWidth,
      maxHeight: this.maxHeight,
      quality: this.quality,
      pages: {},
      menu: _menu_.stashToJsonObj(),
    };
    let pLibPg;
    for (let i = 0; i < this.pgs.length; i++) {
      let pg = this.pgs[i];
      // if pg is "backed" by a page in mozDoc (1-based), copy page to dstDoc, otherwise add a new "empty" page
      if (pg.mozPn) pLibPg = dstPLibDoc.addPage((await dstPLibDoc.copyPages(srcPLibDoc, [pg.mozPn-1]))[0]);
      else pLibPg = dstPLibDoc.addPage([this.maxWidth, this.maxHeight]);
      // add fabric objects to the page
      let pgJson = await pg.toPdf(ink, pLibPg);
      attachment.pages[i + 1] = pgJson;
    }

    // Add the pdf attachment
    let jsonString = JSON.stringify(attachment);
    await dstPLibDoc.attach(new TextEncoder().encode(jsonString), "podium", {
      mimeType: "application/json",
      description: "podium json metadata",
      creationDate: now,
      modificationDate: now,
    });

    // set pdf doc metadata
    dstPLibDoc.setModificationDate(now);
    dstPLibDoc.setCreationDate(now);
    dstPLibDoc.setCreator("Podium vers." + _podiumVersion_);
    if (doc) return dstPLibDoc;
    return dstPLibDoc.save();
  }

  async bindScore(pdfData) {
    // bind all pages from a given score to this score: i.e. given some score's
    // @pdfData, append all of its pages to this score.
    let { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } = PDFLib;
    let pgCount = this.pgs.length;
    let docA = await this.toPdf("stamp", true);
    let docB = await PDFDocument.load(pdfData);
    let copiedPages = await docA.copyPages(docB, docB.getPageIndices());
    copiedPages.forEach((page) => docA.addPage(page));
    let mergedPdfData = await docA.save();

    let mergedScore = await new Score().init(this.source, this.path, this.name, mergedPdfData);
    // Get podium attachment from docB, if any. Note that PDFLib has no "high level" api for this, so
    // its a bit involved. Code adapted from //github.com/Hopding/pdf-lib/issues/534.
    let json = null;

    do { // doesn't loop: just a break context
      if (!docB.catalog.has(PDFName.of("Names"))) break ;
      let Names = docB.catalog.lookup(PDFName.of("Names"), PDFDict);
      if (!Names.has(PDFName.of("EmbeddedFiles"))) break ;
      let EmbeddedFiles = Names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);
      if (!EmbeddedFiles.has(PDFName.of("Names"))) break ;
      let EFNames = EmbeddedFiles.lookup(PDFName.of("Names"), PDFArray);
      for (let idx = 0, len = EFNames.size(); idx < len; idx += 2) {
        let fileName = EFNames.lookup(idx);
        if (fileName.decodeText() == "podium") {
          let fileSpec = EFNames.lookup(idx + 1, PDFDict);
          let stream = fileSpec.lookup(PDFName.of("EF"), PDFDict).lookup(PDFName.of("F"), PDFStream);
          json = new TextDecoder().decode(PDFLib.decodePDFRawStream(stream).decode());
          break;
        }
      }
    } while(false) ;

    if (json) {
      // add docB's json to mergedScore
      let pages = JSON.parse(json).pages;
      let newPgCount = mergedScore.pgs.length;
      for (let i = pgCount; i < newPgCount; i++) {
        let pn = i - pgCount + 1;
        mergedScore.pages[i].json = pages[pn];
    } }
    return;
  }

  getActiveObject() {
    // class Pg has logic to ensure that there is at most 1 pg with
    // an active fabric Object: this functions returns it, or none.
    for (let pg of this.pgs) if (pg.inflated && pg.inUse && pg.canvas.getActiveObject())
       return pg.canvas.getActiveObject();
    return null;
  }

  pgAdd(pg, pn) {
    // Add a new page as page pn (1-based), possibly numbered
    this.pgs.splice(pn - 1, 0, pg);
    this.pgRefresh();
    this.setDirty() ;
    return pg;
  }

  pgCut(pn) {
    // cut page at
    // @pn (1-based)
    // @return the cut page for possible pasting as part of cut/paste operation
    let cutPage = this.pgs.splice(pn - 1, 1)[0];
    this.pgRefresh(false);
    this.setDirty() ;
    return cutPage;
  }

  pnOf(pg) {
    // @return the 1-based page number of the give pg instance, or 0 if not found
    return this.pgs.findIndex((pgN) => pgN === pg) + 1;
  }

  pgRefresh(resetMax = true) {
    // Used to (re)calculate the maxWidth and maxHeight of all pgs
    // in the score.
    // @resetMax, (re) calculate maximum width and height of pgs.
    // If there are no pgs, the current maxWidth,maxHeight
    // are unchanged.
    if (resetMax && this.pgs.length) {
      this.maxWidth = this.maxHeight = -1;
      this.pgs.forEach((pg, index) => {
        this.maxWidth = Math.max(pg.width, this.maxWidth);
        this.maxHeight = Math.max(pg.height, this.maxHeight);
      });
    }
    _menu_.enableCells(["page/cut", "page/copy", "page/merge"], this.pgs.length > 0);
  }

  async pgUse(pn) {
    // Layouts "use" a Pg when they want to actively display it,
    // and "unuse" when they are done actively displaying it.
    // A Pg is inflated (if not inflated) when it is
    // marked inUse, and has its lastUsed timestamp updated.
    // @pn  1-based pg number to be used. Can also be a Pg
    //    instance: if so, its pn is determined.
    // @return that Pg.
    pn = parseInt(pn);
    if (pn > this.pgs.length || pn < 1) return null;
    let pg = this.pgs[pn - 1]; // this.pgs is 0-based
    await pg.inflate();
    pg.inUse = true;
    pg.lastUsed = performance.now();
    return pg;
  }

  pgUnuse(pg) {
    // "unuse" the given @pg, making it a candidate for deflation
    if (pg.inUse) return;
    pg.inUse = false;
    // We don't immediately deflate an unused pg: instead, deflate least recently
    // used unused pg's, allowing at most Score.MAX_INFLATED inflated but unused pg's.
    let deflatable = this.pgs.filter((pg) => pg.inflated && !pg.inUse);
    deflatable.sort((a, b) => a.lastUsed - b.lastUsed);
    while (deflatable.length > Score.MAX_INFLATED) {
      deflatable.pop().deflate();
    }
  }

  setDirty(dirty=true) {
    this.dirty = dirty ;
  }

  setEditable(bool) {
    for (let pg of this.pgs) pg.setEditable(bool);
  }

  update(props) {
    // Used to update any or all off this.source, this.name, this.path
    // from given object's properties
    Object.assign(this, props);
  }
}
