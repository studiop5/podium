// +skip

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

import { clamp, clearChildren, delay, dialog, fontUnmap, helm, inflate, rotatePoint, toast } from "./common.js";
import { Grid } from "./canvas.js";
import { Layout } from "./layout.js";
import { panels, EditPanel } from "./panel.js";
export { Grid, Pg, Score };

// -skip

{ 
  // We monkey-patch setTimeout for use during PDFLib.save():
  // save() calls setTimeout periodically, so we monkey-patch
  // setTimeout to throw an exception when window.pdf == "cancel".
  // This allows us to interrupt the save, allowing users
  // to "cancel" a long-running save operation.
  // NOTE: this is potentially dangerous because of other uses
  // of settimeout (rare in this codebase, and carefully reviewed).
  let sto = window.setTimeout;
  window.cancelPdf = false;
  window.setTimeout = function(callback, delay, ...args) { 
    if(window.cancelPdf) {
      window.cancelPdf = false;
      throw new Error("PDF save cancelled by user", { cause: "cancelled"});
    }
    return sto(callback, delay, ...args);
  }
}


/**
class Pg
  Represents a page in a score.  Named Pg, not Pg, and its instances
  generally referred to as pg's, not pages: this is to clearly
  distinguish the class and its instances from more informal uses of
  the term page.
**/

class Pg {
  // Default color used to pad pages < maxWidth and/or maxHeight:
  static paddingColor = "#fff";
  // Max size (width OR height) of Pg thumbnails, in px  
  static thumbSize = 192;

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
    this.isCut = false; // marker for pgs that are "cut" in the gui
    this.bookmark = null; // Color string if this pg is bookmarked, else null
    this.deferred = false; // true while pdf rendering deferred for non-blocking
    this.editable = false;
    this.elm = null; // shortcut for this.canvas.wrapperEl: the base element of the fabric canvas dom
    this.grid = null; // Grid instance, if any
    this.inflated = false; // true iff a fabricjs canvas is currently available
    this.inflatePromise = null;
    this.inflateCtrl = null;
    this.inUse = false; // marker for class Score's caching algorithm
    this.score = score;
    this.height = height;
    this.json = json;
    this.mozCanvas = null;
    this.mozPn = mozPn;
    this.stretch = 1; // iff score.pgFit == "Expand", will stretch pg to fit math.min(score.max,score.min)
    this.thumbUrl = null;
    this.suppressStateChange = false;
    this.width = width;
    this.undoStack = [];
    this.zoom = 1;
    return this;
  }

  async renderPdf(canvas) {
    // If this page is used to display pdf content (the usual case),
    // then this function renders that pdf to a dom canvas instance
    // referenced as this.mozCanvas (short for mozilla pdf library
    // canvas). The code could have rendered the pdf directly into
    // the fabricjs as a fabric "background image", but that route
    // was found to have poorer resolution than using a dedicated
    // dom canvas, sigh.
    if(!this.score.mozDoc) return;
    let mozPg = await this.score.mozDoc.getPage(this.mozPn);
    if(this.inflateCtrl?.signal?.aborted) return;
    let viewport = mozPg.getViewport({ scale: this.score.quality});
    let w = viewport.width / this.score.quality;
    let h = viewport.height / this.score.quality;
    let mozCanvas = helm(`<canvas width="${viewport.width}" height="${viewport.height}"
      style="width:${w / _pxPerEm_}em;height:${h / _pxPerEm_}em;font-size:1em"></canvas>`);
    if (this.mozCanvas) this.mozCanvas.replaceWith(mozCanvas);
    else canvas.wrapperEl.append(mozCanvas);
    this.mozCanvas = mozCanvas;
    let ctx = mozCanvas.getContext("2d", { willReadFrequently: true });
    await mozPg.render({
      annotationMode: pdfjsLib.AnnotationMode.DISABLE,
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // Detect silently-broken PDFs (e.g. non-standard compression or missing fonts).
    // These trigger the onUnsupportedFeature callback during loading or rendering.
    if (this.mozPn == 1 && !this.score._brokenPDFWarned && this.score._unsupportedFeatures?.size > 0) {
      let unsupported = window.pdfjsLib.UNSUPPORTED_FEATURES;
      let fatal = [unsupported?.font, unsupported?.jbig2, unsupported?.jpeg2000].filter(v => v !== undefined);
      if (Array.from(this.score._unsupportedFeatures).some(f => fatal.includes(f))) {
        this.score._brokenPDFWarned = true;
        dialog("Warning: This PDF uses advanced features (e.g. non-native compression or fonts) that may not be fully supported in a web browser and may not render correctly.", { OK: { svg: "OK" } });
      }
    }

    this.rendering = false;
    this.setZoom(this.zoom);
  }

  async inflate(render = true, nonblocking = true) {
    // To conserve memory, Pg instances are stored "deflated", and only
    // "inflated" when they are to be actively displayed on screen in
    // a layout.
    // @render when false, the pg is fully inflated, but the pdf is not
    // actually rendered.  This is used when a Pg that is currenly  not
    // on-screen needs to be inflated for serialization of for printing:
    // in this case, there is no need to actually render the Pg.
    // @nonblocking when true, this.canvas is immediately set to a div,
    //   and the inflation will be deferred. After
    //   the inflation finishes, the div is replaced by the fabric
    //   canvas's container div.
    if(this.inflatePromise != null) return this;
    if (this.inflated) return this;
    this.inflateCtrl = new AbortController();
    if(this.mozPn && nonblocking) {
      // Pages backed by mozilla pdf pages can take a long time to render, blocking the ui.
      // To improve the ui experience, if nonblocking is true (the default), pdf rendering
      // if done s.t. it doesn't block the ui. In this case, we immediately create a "fake" canvas (really,
      // a simple div-within-a-div  (so we can set the font-size without effecting the size of the outer div)) to show,
      // leaving the rendering of pdf to a true canvas until after inflatePromise resolves.
      this.deferred = true;
      this.canvas = helm(`<div style="text-align:center;color:#eee;background:white;font-family:Bravura"><div style="font-size:5em;">\uE4C4<div></div>`);
      this.elm = this.canvas;
      this.elm.pg = this; // backref on the placeholder too: it's mounted into layouts
        // immediately, while the real canvas (which also sets .pg) only replaces it
        // later in the background. Without this, a concurrent ScrollLayout.pgMount
        // iterating the sash finds a .pg-less child \u2192 pgUnuse(undefined) crash.
      this.style = this.elm.style; // convenient shorthand
      this.inflatePromise = this.inflateAux(render).catch(err => {
        if(err.name == 'AbortError') return; // no error: expected
        console.warn(`Failed to background load/render page ${this.mozPn}:`, err)});
    } else await this.inflateAux(render).catch(err => {
      if(err.name == 'AbortError') return; // no error: expected (nav/layout change cancelled the inflate)
      throw err;
    });
  }

  async inflateAux(render) {
    try {
      let signal = this.inflateCtrl?.signal;
      let checkAbort = () => { if(signal?.aborted)
        throw new DOMException("Inflation aborted","AbortError");}
      checkAbort();
      if(!this.inUse) { // yield to inUse pages
         await new Promise(resolve => delay(1, resolve));
         checkAbort();
      }
  
      // If indicated, determine scaling factor that will "stretch" score s.t. it
      // will expand pg to fit within score's maxWidth & maxHeight
      this.stretch = this.score.details?.pgFit == "Expand" ? Math.min(
         this.score.maxWidth / this.width,this.score.maxHeight / this.height) : 1;
  
      let domCanvas = document.createElement("canvas");
      // allowTouchScrolling needs to be false, else certain browers (chrome mobile, at
      // least) will create an "Intervention event", trying to scroll, when we've
      // explicitly "preventDefault() touchmove on body in main.js.
      let canvas = new fabric.Canvas(domCanvas, {
          enablePointerEvents: true,
          allowTouchScrolling: false, // Required!
          imageSmoothingEnabled: false,
          moveCursor: 'none', // Hide cursor when moving objects for better placement
          perPixelTargetFind: true, // More accurate selection based on actual pixels, not bounding box
      });
      checkAbort();
  
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
      }, { cssOnly: true } );
  
      if (this.json) {
        await new Promise((resolve, reject) =>
          canvas.loadFromJSON(this.json, () => resolve()));
        Pg.applyFlatten(canvas);
      }
      checkAbort();

      if (render && this.mozPn) {
         await this.renderPdf(canvas);
         if(signal?.aborted) {
           canvas.dispose();
           this.mozCanvas?.remove();
           throw new DOMException("Inflation aborted","AbortError");   
         }
      }
      else if (this.background) canvas.setBackgroundColor(this.background);
  
      canvas.requestRenderAll();
      this.json = null; // allow quick garbage collection
      this.elm = canvas.wrapperEl; // convenience shortcut
      this.elm.pg = this; // convenience for accesing pg from dom
      this.style = this.elm.style; // convenient shorthand
  
      if(this.deferred) {
        // We've deferred inflation, so the ui is using a
        // temporary elm. Copy relevant styles from that elm to the fabric
        // canvas elm, then replace the temporary elm.
        ["left","right", "top","bottom","position","clipPath"].forEach((style) => 
          this.elm.style[style] = this.canvas.style[style]);
        this.canvas.replaceWith(this.elm);
        this.deferred = false;
      }
      this.canvas = canvas;
      this.canvas.pg = this; // convenience for fetching Pg from it's canvas
      let stateChanged = false; // flag to indicate canvas state has changed s.t. it needs to be pushed to the undoStack
  
      canvas.on("mouse:down:before", async (opts) => {
        opts.e.taken = true ;
        if(_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell)
          _menu_.pgEvent(opts, this);
      });
  
      canvas.on("mouse:up", opts => {
        if(stateChanged) pushState();
        stateChanged = false;
        if (_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell) _menu_.pgUpEvent(opts, this); 
      });
  
      let onSelection = opts => {
        // Allow dragging selection by clicking anywhere in bounding box, not just pixels
        canvas.perPixelTargetFind = false;

        // Ensure only one active selection across all pages
        for (let pg of this.score.pgs) {
          if (pg !== this && pg.inflated && pg.canvas.getActiveObject()) {
            pg.canvas.discardActiveObject();
            pg.canvas.requestRenderAll();
          }
        }

        if (_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell && ["cut","copy","edit"].includes(_menu_.activeRing.activeCell.key))
         _menu_.pgEvent(opts, this);
        EditPanel.update(this.canvas.getActiveObject()) ;
      };

      canvas.on("selection:created", onSelection);
      canvas.on("selection:updated", onSelection);

      canvas.on('text:editing:entered', (e) => {
        // text box's cursor can be misaligned without this:
        if(e.target && e.target.type == 'textbox') {
          fabric.charWidthsCache = {} ; // clear this cache
          e.target.initDimensions() ;
          e.target.setCoords();
          e.target.selectionStart = e.target.selectionStart;
        }
      });

      canvas.on("selection:cleared", () => {
        canvas.perPixelTargetFind = true;
        EditPanel.update(null) ;
      });


      // Each pg instance has its own undo stack. Initially, the
      // stack has 1 entry: its state *before* anything has been
      // pushed on it.  We need this so that we'll have a state
      // to undo to.
      if(this.undoStack.length == 0) // initialize undo stack on first inflate
        this.undoStack.push(canvas.toDatalessObject());
  
      let pushState = () => {
        let stack = this.undoStack;
        stack.push(this.canvas.toDatalessObject());
        while (stack.length > 10) stack.shift(); // prune
        _menu_.enableCells("ink/undo");
        this.thumbDirty = true;
      };
  
      canvas.on("object:added", (opts) => { 
        if(!this.suppressStateChange) 
           stateChanged = true;
      });
      canvas.on("object:removed", (opts) => {
        if(!this.suppressStateChange) stateChanged = true;
      });

      canvas.on("object:modified", (opts) => { 
        if(!this.suppressStateChange)  stateChanged = true;
      });
  
      this.inflated = true;
      this.setEditable(this.editable); // indicate pg is editable. note: called AFTER setting this.inflated
      this.setZoom(this.zoom);
    }

    finally {
      this.inflatePromise = null ;
    }

  }

  deflate(full = false) {
    // Deflate's a Pg, releasing its resources for garbage collection.
    // @full boolean: iff true, any thumbElm is deleted during deflation.
   if(this.inflateCtrl) {
      this.inflateCtrl.abort();
      this.inflateCtrl = null;
    }
    this.inflatePromise = null ;

    if (this.inflated) {
      if (full) {
        if(this.fabUrl) URL.revokeObjectURL(this.fabUrl);
        if(this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
        this.thumbElm?.remove();
        this.thumbElm = null;
        this.json = null;
      } else this.json = this.toJson();
      this.canvas.clear();
      this.canvas.dispose();
      this.elm?.remove();
      this.canvas = null;
      this.mozCanvas?.remove();
      this.mozCanvas = null;
      this.elm = null;
      this.grid = null;
      this.inflated = false;
    }
    return this;
  }

  async getThumbElm(force = false) {
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
    // -  the two object URLs are revoked after a delay of 10 animation frames
    if (!this.thumbElm || force || this.thumbDirty) {
      this.thumbDirty = false;
      let deflated = !this.inflated;
      let score = this.score;
      if (deflated) await this.inflate(true, false);

      // create div that will display the thumbnail
      let scale = Pg.thumbSize / Math.max(score.maxWidth, score.maxHeight);
      let maxW = score.maxWidth * scale, maxH = score.maxHeight * scale;

      this.thumbElm = helm(
        `<div class="TableLayout__pg" style="width:${maxW / _pxPerEm_}em;height:${maxH / _pxPerEm_}em;"></div>`);
      this.thumbElm.style.backgroundColor = Pg.paddingColor;
      if(score.details?.pgFit == "Center")
        this.thumbElm.style.backgroundSize = this.width * 100 / score.maxWidth + "%";

      // create object URL for fabric canvas
      let fabCanvas = this.canvas.toCanvasElement(scale * this.stretch);
      if (this.fabUrl) URL.revokeObjectURL(this.fabUrl);
      this.fabUrl = URL.createObjectURL(await new Promise((res) => fabCanvas.toBlob((b) => res(b))));

      if(this.mozCanvas) {
        // create obj URL for mozCanvas (from mozilla pdf src);
        let pdfCanvas = helm(`<canvas width="${maxW}" height="${maxH}"></canvas>`);
        pdfCanvas.getContext("2d").drawImage(this.mozCanvas, 0, 0, maxW, maxH);
        if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
        this.pdfUrl = URL.createObjectURL(await new Promise((res) => pdfCanvas.toBlob((b) => res(b))));
        // set both fabricCanvas (annotations) and pdfCanvas (pdf image) as background to thumbElm
        this.thumbElm.style.backgroundImage = "url('" + this.fabUrl + "'), url('" + this.pdfUrl + "')";
      }
      else // no pdf src:  set fabricCanvas (annotations) as background to thumbElm
        this.thumbElm.style.backgroundImage = "url('" + this.fabUrl + "')";
      if (deflated) this.deflate();
    }
    return this.thumbElm;
  }

  async clone(inflate = false) {
    // @return a clone of this page.
    // @inflate when true, the clone is inflated, otherwise not.
    let theClone = new Pg(this.score, this.width, this.height, this.toJson() || this.json, this.mozPn, null);
    if (this.thumbElm) { 
      theClone.thumbElm = this.thumbElm.cloneNode();
    }
    if (inflate) await theClone.inflate(true, false);
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
    if(this.deferred) { 
      // When deferred, where actually resizing a temporary "fake" canvas which is actually a div
      this.canvas.style.width = this.width * zoom * this.stretch / _pxPerEm_ + "em";
      this.canvas.style.height = this.height * zoom * this.stretch / _pxPerEm_ + "em";
      this.canvas.style.lineHeight = this.canvas.style.height;
    }
    else if(this.inflated) {
      let emWidth = this.width * zoom  * this.stretch / _pxPerEm_ + "em";
      let emHeight = this.height * zoom * this.stretch / _pxPerEm_ + "em";
      this.canvas.setDimensions({ width: emWidth, height: emHeight}, { cssOnly: true });
      if (this.grid) this.grid.setZoom(zoom);
      if (this.mozCanvas) {
        this.mozCanvas.style.width = emWidth;
        this.mozCanvas.style.height = emHeight;
      }
      return this.canvas.requestRenderAll();
    }
  }

  toJson() {
    // @return string, the JSON representation of the fabricjs canvas encapsulation.
    if (!this.inflated) return null; // only call this on inflated pg's
    let oldPrecision = fabric.Object.NUM_FRACTION_DIGITS;
    fabric.Object.NUM_FRACTION_DIGITS = 2;
    // "flatten" and "podiumType" are custom properties (see flattenObjects /
    // PodBrush); fabric drops unknown properties on serialize unless they're
    // listed here. toPdf relies on "flatten"; "podiumType" must survive so a
    // stroke keeps its pencil/pen/rastrum tag across deflate/inflate and reload
    // (rastrum control rendering keys off it — see canvas.js).
    let json = this.canvas.toJSON(["flatten", "podiumType"]);
    fabric.Object.NUM_FRACTION_DIGITS = oldPrecision;
    return json;
  }

  async undo( ) {
    // pop an entry from the undo stack, resetting pg's state
    this.score.setDirty(true);
    let stack = this.undoStack;
    if (stack.length > 1) {
      this.suppressStateChange = true;
      stack.pop();
      await new Promise((resolve, reject) => this.canvas.loadFromJSON(stack[stack.length - 1], () => resolve()));
      Pg.applyFlatten(this.canvas);
      this.canvas.requestRenderAll();
      this.suppressStateChange = false; 
    } 
    // If there's nothing left to undo in any pg, disable ink/undo
    for(let pg of this.score.pgs) {
      if(pg.undoStack?.length > 1)
        return;
    }
    _menu_.enableCells("ink/undo", false);
    _menu_.activateCell(null);
  }

  flattenObjects() {
    // Mark every annotation on this page "flattened": read-only in the editor,
    // and — at save time — baked into the page as ordinary PDF content rather
    // than an editable stamp annotation (see toPdf / objToPdf). The objects stay
    // on the canvas, visually unchanged; they're just frozen. Cannot be undone.
    if (!this.canvas) return; // page not inflated (e.g. flatten fired during a layout transition)
    for (let obj of this.canvas.getObjects()) Pg.freeze(obj);
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.score.setDirty(true);
  }

  static freeze(obj) {
    // Make a fabric object genuinely non-interactive. evented:false keeps it out
    // of hit-testing, but Podium can still force-select via setActiveObject (e.g.
    // the edit tool's "select last object" fallback), so we also strip controls
    // and lock every transform — a frozen object can't be moved, scaled, rotated
    // or text-edited even if something makes it the active object.
    obj.flatten = true;
    obj.selectable = false;
    obj.evented = false;
    obj.hasControls = false;
    obj.hasBorders = false;
    obj.lockMovementX = true;
    obj.lockMovementY = true;
    obj.lockScalingX = true;
    obj.lockScalingY = true;
    obj.lockRotation = true;
    obj.lockSkewingX = true;
    obj.lockSkewingY = true;
    obj.editable = false; // textbox: block enterEditing
  }

  static applyFlatten(canvas) {
    // Re-freeze flattened objects after a loadFromJSON: only the "flatten" flag
    // is serialized, not the selectable/evented/lock* side effects.
    for (let obj of canvas.getObjects()) if (obj.flatten) Pg.freeze(obj);
  }

  async toPdf(ink, pLibPg) {
    // Incorporate all fabricjs objects on this pg's fabricjs canvas into the given PDFLib page.
    // @ink determines "how" the objects will be incorprated, see objToPdf below for details.
    // @pLibPg the PDFLib page that will be modified.
    // @return the json-serializion of the fabricjs canvas.
    let wasInflated = this.inflated;
    if (!wasInflated) await this.inflate(false, false); // temporarily re-inflate, but skip unnecessary rendering
    try {
      return await this.toPdfAux(ink, pLibPg);
    } finally {
      // deflate in a finally so a failed save can't leak an inflated pg
      if (!wasInflated) this.deflate();
    }
  }

  async toPdfAux(ink, pLibPg) {
    // toPdf's body: requires this pg to be inflated.

    let toPDFColor = (fabricColor) => {
      // PDFLib doesn't have rgba: instead, it uses rgb  and a
      // separate vor opacity. Here, we convert "rgba(0,127.5,255,xxx)" -> "rgb(0,.5,1)"
      let c = new fabric.Color(fabricColor).toRgba().split("(")[1].split(")")[0].split(",");
      return PDFLib.rgb(c[0] / 255, c[1] / 255, c[2] / 255);
    };

    let toPDFOpacity = (fabricColor) => {
      // return alpha component from "rgba(0,127.5,255,.612), or 1 if not available
      let rgba = new fabric.Color(fabricColor).toRgba();
      if (rgba.startsWith("rgb(")) return 1;
      let c = rgba.split("(")[1].split(")")[0].split(",");
      return parseFloat(c[3]);
    };

    let PDFName = PDFLib.PDFName;
    let context = pLibPg.doc.context;

    // The fabricjs canvas lives in "display space": the page as PDF.js
    // displays it, i.e. the cropBox with page /Rotate applied and the origin
    // at the displayed page's lower-left corner. PDFLib draws in raw,
    // unrotated page user space, so build the display-to-page mapping that
    // objToPdf will apply (an identity mapping for the typical unrotated,
    // zero-origin page).
    let rot = ((pLibPg.getRotation().angle % 360) + 360) % 360;
    let box = pLibPg.getCropBox();
    let xform = {
      width: rot % 180 == 90 ? box.height : box.width, // display-space dims
      height: rot % 180 == 90 ? box.width : box.height,
      rect: [box.x, box.y, box.x + box.width, box.y + box.height],
      matrix: rot == 90 ? [0, 1, -1, 0, box.x + box.width, box.y]
        : rot == 180 ? [-1, 0, 0, -1, box.x + box.width, box.y + box.height]
        : rot == 270 ? [0, -1, 1, 0, box.x, box.y + box.height]
        : [1, 0, 0, 1, box.x, box.y],
      identity: rot == 0 && box.x == 0 && box.y == 0,
    };
    let pageHeight = xform.height;

    // Delete stamp annotations from previous saves, together with their
    // appearance streams (which would otherwise linger as orphans), but
    // preserve other annotations (links, etc) that came with the original pdf.
    let annots = pLibPg.node.Annots();
    if (annots) {
      for (let i = annots.size() - 1; i >= 0; i--) {
        let ref = annots.get(i);
        let annot = context.lookup(ref);
        if (annot?.get?.(PDFName.of("Subtype")) === PDFName.of("Stamp")) {
          let apN = annot.lookup(PDFName.of("AP"))?.get?.(PDFName.of("N"));
          if (apN instanceof PDFLib.PDFRef) context.delete(apN);
          if (ref instanceof PDFLib.PDFRef) context.delete(ref);
          annots.remove(i);
        }
      }
    }

    // Nested function that converts a fabric object to a PDFLib object, with help of this.objToPdf(...)
    let processObj = async(obj, absoluteTransform = null) => {

      if(absoluteTransform) {
        obj = fabric.util.object.clone(obj);
        obj.group = null; // transform is absolute: calcTransformMatrix must not re-apply the group's
        obj.set({
          left: absoluteTransform.left,
          top: absoluteTransform.top,
          scaleX : absoluteTransform.scaleX,
          scaleY: absoluteTransform.scaleY,
          angle: absoluteTransform.angle,
          skewX: absoluteTransform.skewX ?? 0,
          skewY: absoluteTransform.skewY ?? 0,
          flatten: absoluteTransform.flatten });
      }

      switch (obj.type) {

        case "text":
        case "textbox": {
          // find the pdf font name from object's fontFamily, fontStyle, and fontWeight values
          let pdfFontName = fontUnmap[`${obj.fontFamily}/${obj.fontStyle}/${obj.fontWeight}`];
          if (!pdfFontName) pdfFontName = "Times-Roman";
          let pdfFont = this.score.embeddedFonts[pdfFontName];
          if (!pdfFont) {
            let fontData = window.fontData[pdfFontName];
            if (typeof fontData == 'function') fontData = fontData();
            pdfFont = await pLibPg.doc.embedFont(fontData ?? pdfFontName);
            this.score.embeddedFonts[pdfFontName] = pdfFont;
          }
          // For PDFLib, y: locates baseline of first (or only) line of text, but fabric's y
          // is position of the bounding box.  We don't have metrics to know where the baseline
          // is in relation to this bounding box, but emperically, it is about 0.9 * the fontSize.
          let drop = obj.fontSize * 0.9 * obj.scaleY;
          let angle = (obj.angle / 360) * (Math.PI * 2);
          let pp = rotatePoint(obj.left, obj.top + drop, obj.left, obj.top, angle);
          // Pass fabric's already-wrapped lines instead of letting pdf-lib wrap
          // via maxWidth: pdf-lib measures with the embedded font, which won't
          // match the canvas font, so its wrap points would differ from screen.
          let text = obj.textLines ? obj.textLines.join("\n") : obj.text;
          await this.objToPdf(obj, ink, pLibPg, pLibPg.drawText, [
            text,
            {
              x: pp.x,
              y: pageHeight - pp.y,
              font: pdfFont,
              rotate: PDFLib.degrees(360 - obj.angle),
              size: obj.fontSize * obj.scaleY,
              color: toPDFColor(obj.fill),
              opacity: toPDFOpacity(obj.fill),
              // fabric renders line spacing as lineHeight * fontSize * _fontSizeMult
              lineHeight: obj.lineHeight * obj.fontSize * (fabric.Text.prototype._fontSizeMult || 1.13) * obj.scaleY,
            },
          ], xform);
          break;
        }

        case "path": {
          if (!obj.path || obj.path.length == 0) {
            console.warn("Path object has empty path, skipping", obj);
            break;
          }
          // Create an svg-style path string. Path points are stored in path
          // space, offset from the object's center by pathOffset: mapping each
          // point through the object's full transform matrix accounts for
          // position, scale, rotation and skew, as well as the strokeWidth/2
          // bounding-box padding that fabric builds into obj.left/obj.top.
          let matrix = obj.calcTransformMatrix();
          let po = obj.pathOffset || { x: 0, y: 0 };
          let pathStr = "";
          obj.path.forEach((pathlet) => {
            pathStr += pathlet[0];
            // each "pathlet" will have an operator (M, L, or Q) followed by
            // pairs of x,y coordinates
            for (let i = 1; i < pathlet.length; ) {
              let p = fabric.util.transformPoint({ x: pathlet[i++] - po.x, y: pathlet[i++] - po.y }, matrix);
              // toFixed: tiny float artifacts would serialize in scientific
              // notation, which the svg path parser rejects
              pathStr += p.x.toFixed(2) + " " + p.y.toFixed(2) + " ";
            }
          });

          // we do fill or stroke, but not both
          if(obj.fill) {
          await this.objToPdf(obj, ink, pLibPg, pLibPg.drawSvgPath, [
            pathStr,
            { y: pageHeight,
              color: toPDFColor(obj.fill),
              opacity: toPDFOpacity(obj.fill),
            },
           ], xform);
          }
          else await this.objToPdf(obj, ink, pLibPg, pLibPg.drawSvgPath, [
            pathStr,
            { y: pageHeight,
              // pdf line width is isotropic: approximate non-uniform scale with the mean
              borderWidth: obj.strokeWidth * (Math.abs(obj.scaleX) + Math.abs(obj.scaleY)) / 2,
              borderColor: toPDFColor(obj.stroke),
              borderOpacity: toPDFOpacity(obj.stroke),
              borderLineCap: PDFLib.LineCapStyle.Round,
            },
          ], xform);
          break;
        }

        case "image": {
          // the fabricjs image's source must be a dataURL starting with
          // "data:image/jpeg;" or "data:image/png;". Objects restored from json
          // carry it as a src property; freshly-pasted images only have it on
          // their backing element, via getSrc().
          // Decode via atob rather than fetch(): iOS Safari has issues fetching large data URLs.
          let src = obj.src ?? (obj.getSrc && obj.getSrc());
          let binary = atob(src.split(",")[1]);
          let bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          let image = src.startsWith("data:image/jpeg;") ? await pLibPg.doc.embedJpg(bytes) :
              src.startsWith("data:image/png;") ? await pLibPg.doc.embedPng(bytes): null;
          if(!image) throw new Error("Unknown image type in data url:" + src.substring(20) + "...");
          // pdf-lib rotates the drawn image about its lower-left corner, so place
          // that corner where fabric puts it: the object-space bottom-left corner
          // mapped through the object's full transform.
          let bl = fabric.util.transformPoint({ x: -obj.width / 2, y: obj.height / 2 }, obj.calcTransformMatrix());
          await this.objToPdf(obj, ink, pLibPg, pLibPg.drawImage, [
            image,
            { x: bl.x,
              y: pageHeight - bl.y,
              rotate: PDFLib.degrees(360 - obj.angle),
              height: obj.height * obj.scaleY,
              width: obj.width * obj.scaleX,
            },
          ], xform);
          break;
        }
 
        case "group": {
          let groupMatrix = obj.calcOwnMatrix();

          for (let groupObj of obj._objects) {
            if (groupObj.type === 'group') {
              // Nested group: apply parent transformation, then recurse
                let clonedGroup = fabric.util.object.clone(groupObj);
                fabric.util.addTransformToObject(clonedGroup, groupMatrix);
                clonedGroup.flatten = obj.flatten;
                await processObj(clonedGroup, null);
            } else {
              // Not a group: get absolute coordinates and app get absolute coordinates
              let tmpObj = fabric.util.object.clone(groupObj);
              fabric.util.addTransformToObject(tmpObj, groupMatrix);
              await processObj(groupObj, {
                  left: tmpObj.left,
                  top: tmpObj.top,
                  scaleX: tmpObj.scaleX,
                  scaleY: tmpObj.scaleY,
                  angle: tmpObj.angle,
                  skewX: tmpObj.skewX,
                  skewY: tmpObj.skewY,
                  flatten: obj.flatten,
              });
            }
          }
          break;
        }

        default: {
          console.warn("Unsupported fabric obj:", obj.type);
        }

      } // switch
    }; // processObj

    // Discard active object, if any: they don't print correctly if rotated.
    // Note: groups do work, but there are unresolved bugs with rotated
    // nested groups.
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();

     // Process all top-level objects
    for (let obj of this.canvas.getObjects()) {
      await processObj(obj);
    }

    let json = this.toJson();
    // Objects baked into the page content must not also be saved as fabric json,
    // or they'd reappear as editable duplicates on reopen. With ink == "pdf"
    // every object was painted in; otherwise only the flattened ones were.
    json.objects = ink == "pdf" ? [] : json.objects.filter((obj) => !obj.flatten);
    json.bookmark = this.bookmark;
    return json;
  }

  async objToPdf(obj, ink, pLibPg, func, funcArgs, xform) {
    // Helper function for creates and adds a pdf object to pLibPg,
    // where that  object is fabricated from the given fabricjs obj.
    //
    // @obj  fabricjs object
    // @ink  "none", "pdf", or "stamp"
    //   when ink == "none", nothing is added (used to copy a page verbatim)
    //   when ink == "pdf", the object is painted into pLibPg as page content
    //   when ink == "stamp", a flattened object (see flattenObjects) is likewise
    //     baked into the page content; every other object is drawn on a
    //     "temporary" page and copied into pLibPg as an editable stamp annotation
    // @pLibPg pdf-lib page to add annotation to
    // @func pdf-lib member function to draw the annotation (drawCircle, drawRect, etc...
    // @funcArgs ... array of arguments to func
    // @xform display-space-to-page-space mapping, see toPdfAux
    let pLibDoc = pLibPg.doc;
    let context = pLibDoc.context;
    let PDFName = PDFLib.PDFName;
    if (ink == "none") return;
    if (ink == "pdf" || obj.flatten) {
      // bake directly onto the page content, mapping display space to page space
      if (xform.identity) func.apply(pLibPg, funcArgs);
      else {
        pLibPg.pushOperators(PDFLib.pushGraphicsState(), PDFLib.concatTransformationMatrix(...xform.matrix));
        func.apply(pLibPg, funcArgs);
        pLibPg.pushOperators(PDFLib.popGraphicsState());
      }
      return;
    }
    // Add object as a Stamp annotation:
    // - first, create a tmpPage (in display space) and apply func to it.
    // - "re-forge" tmpPage's content into a stamp annotation
    //   whose appearance stream is an XObject Form made from
    //   tmpPage's content.
    // - Add the XObject pLibPg
    // - remove tmpPage from the document
    let tmpPage = pLibDoc.addPage([xform.width, xform.height]);
    try {
      func.apply(tmpPage, funcArgs);
      let content = tmpPage.contentStream.clone();
      let stamp = new PDFLib.PDFAnnotation(
        context.obj({
          Type: "Annot",
          Subtype: "Stamp",
          Rect: xform.rect,
          F: 4, // print flag: without it most viewers display but won't print the annotation
        })
      );
      content.dict.context = context;
      content.dict.set(PDFName.of("Type"), PDFName.of("XObject"));
      content.dict.set(PDFName.of("Subtype"), PDFName.of("Form"));
      content.dict.set(PDFName.of("BBox"), context.obj([0, 0, xform.width, xform.height]));
      if (!xform.identity) content.dict.set(PDFName.of("Matrix"), context.obj(xform.matrix));
      content.dict.set(PDFName.of("Resources"), tmpPage.node.dict.get(PDFName.of("Resources")));
      stamp.setNormalAppearance(context.register(content));
      let stampRef = context.register(stamp.dict); // indirect, as the spec expects
      if (pLibPg.node.has(PDFName.Annots) && pLibPg.node.Annots()) pLibPg.node.Annots().push(stampRef);
      else pLibPg.node.set(PDFName.Annots, context.obj([stampRef]));
    } finally {
      // Drop tmpPage, then delete its now-orphaned page node and original
      // content stream from the context: pdf-lib serializes every registered
      // object, reachable or not, so leaving them in would bloat the file.
      pLibDoc.removePage(pLibDoc.getPageCount() - 1);
      if (tmpPage.contentStreamRef) context.delete(tmpPage.contentStreamRef);
      context.delete(tmpPage.ref);
    }
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
  as Score.activeScore, or by window._score_, can be loaded at a time.
**/


class Score {
  static activeScore = null;
  // maximum number of unused inflated pgs: see Score.pgUnuse()
  static MAX_INFLATED = (navigator.deviceMemory >= 8) ? 8 : 6;

  // maximum depth of undo stack
  static MAX_UNDO = (navigator.deviceMemory >= 8) ? 8 : 6;

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
    url: "WWW",
  });

  static async newScore(pgKnt, width, height, color) {
    // Create a new score that consists entirely of empty pages,
    // not backed by and pdf.
    // @pgKnt number of pages in the new score
    // @width in px
    // @height in px
    let score = new Score();
    for (let i = 1; i <= pgKnt; i++) {
      let pg = new Pg(score, width, height, null, null, color);

       /*
        // for testing only, add a page number to each page:
        await pg.inflate();
        pg.canvas.add(new fabric.Textbox("pg " + i, { left:80, top:80, fontSize:80}));
        pg.deflate();
      */
      /*
        // For testing only, add a small and large pages to test the
        // Pg padding mechanism provided by layouts:
        if (i == 1) pg = new Pg(score, width / 10, height / 2, null, null, "#f00");

        else if (i == 3) pg = new Pg(score, width / 2, height / 4, null, null, "#f00");
        else if (i == 5) pg = new Pg(score, width / 4, height /2, null, null, "#0f0"); 

        else if (i == 7) pg = new Pg(score, width * 4, height * 1, null, null, "#00f"); 
        else if (i == 9) pg = new Pg(score, width * 5, height * 1, null, null, "#888"); 
        else pg = new Pg(score, width, height, null, null, "#fff");
        // else pg = new Pg(score, width, height, null, null, "#000");
      */
      await score.pgAdd(pg, i, false);
    }
    // don't init score until after pgs are added, or layouts will fail
    await score.init(null, null, `Opus ${Math.floor(Math.random() * 100) + 1}.pdf`);
    score.setDirty(false);
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

    let recent = JSON.parse(localStorage.getItem("recent") || "[]");
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
    if(recent.length > 20) recent.length = 20; // limit to 20 most recent
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
  encrypted = false;    // true if PDF has an encryption dictionary
  permissions = null;   // array of allowed PermissionFlag values, or null if no encrypt dict

  embeddedFonts = null; // Used by this.toPDF() to prevent fonts from being embedded more than once
  maxHeight = -1; // maxHeight among all pg's in score
  maxWidth = -1; // maxWidth among all pg's in score
  pgs = []; // array of Pg instances for all pages in a score
  undoStack = []; // will contain pgs, tagged with undoPn whenever pgAdd(),or -undoPn whenever pgCut()
  mozDoc = null; // reference to mozilla pdflib document, if available
  quality = 2; // pdf rendering quality: see Pg.renderPdf()
  dirty = false; // true iff score has been modified (i.e. requires saving) 
  numbers = null ; // reference to numbers menu cell stash
  details = null ; // reference to details menu cell stash
  layout = null ; // reference to active layout's menu cell stash
  _unsupportedFeatures = null; // Set of feature IDs reported by PDF.js
  _brokenPDFWarned = false; // true if user has been notified about broken rendering

  constructor() {
    // Since constructing a score calls async functions, and since a constructor
    // can't be marked async, the constructor must be invoked as:
    //      await new Score().init(....)<<<.activate()>>>;
    // @clear if true (default), pasteBuffer is cleared.
  }

  async init(source, path, name, pdfData=null, activate=true) {
    // Initialize a new Score, always called as part of the constructor, ex. await new Score().init(...)
    // @source one of Score.sources, identifies the data source that provides the score's data.
    //  For new scores (no external data sources), this is just null.
    // @path identifies the file path in the data source (not including name), or null for new scores.
    // @name identifies the file name of the data source (not including path)
    // @pdfData bytearray containing pdf file, or null for new scores. 
    // @activate make this score the "active" score

    Object.assign(this, { source, path, name });
    // Reset quality to default; will be overridden by scoreJson if stored in the PDF
    this.quality = 2;
    // Initialize page undo stack
    this.undoStack = [];
    this.maxUndo = 10;

    // Each score starts with no saved pan-zoom; the score's own (if it saved one)
    // is restored below by stashFromJsonObj. Clearing here — before that restore,
    // and before the active layout's destructor runs (which is too late, since the
    // restore has already happened) — prevents a previous score's pz from carrying
    // over while letting this score's own restored pz survive.
    if (activate)
      for (let c of Object.values(_menu_.rings.layout.cells)) c.stash.pz = null;

    if (pdfData) {
      this.size = pdfData.byteLength;
      if (!window.pdfjsLib) {
        // mozilla pdfjsLib is loaded from mozSrc and mozWorkerSrc (strings
        // (base64-encoded-gzipped strings defined globally) on demand
        let pdfUrl = URL.createObjectURL(await inflate(mozSrc));
        mozSrc = null; // allow gc
        window.pdfjsLib = await import(pdfUrl);
        URL.revokeObjectURL(pdfUrl);
        let mozWorkerUrl = URL.createObjectURL(await inflate(mozWorkerSrc));
        window.pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(mozWorkerUrl, { type: "module" });
        URL.revokeObjectURL(mozWorkerUrl); // safe to revoke once Worker is constructed
        mozWorkerSrc = null; // allow gc
      }

      let loadingTask = window.pdfjsLib.getDocument(pdfData);

      // detect non-standard or missing features (fonts, non-standard compression, etc)
      loadingTask.onUnsupportedFeature = (featureId) => {
        if (!this._unsupportedFeatures) this._unsupportedFeatures = new Set();
        this._unsupportedFeatures.add(featureId);
      };

      // is this an encrypted pdf?
      loadingTask.onPassword = async (callback, reason) => {
        let password = await new Promise(resolve => {
          let msg = reason == 1
            ? "Incorrect password. Please try again.<br><br><input type='password' style='width:100%' placeholder='Password'>"
            : "This PDF is password-protected.<br><br><input type='password' style='width:100%' placeholder='Password'>";
          let dlg = dialog(msg, { Open: { svg: "Open" }, Cancel: { svg: "Cancel" } }, (e, prop, tag, args) => {
            let pw = args.elm.querySelector('input').value;
            args.close();
            resolve(tag == "Open" && pw ? pw : "");
          });
          dlg.addEventListener('cancel', () => resolve(""));
          setTimeout(() => dlg.querySelector('input')?.focus(), 50);
        });
        if (password) { callback(password); return; }
        loadingTask.destroy();
      };

      this.mozDoc = await loadingTask.promise;

      // A score must always have at least one page (see pgCut's last-page guard).
      // A zero-page PDF is non-conforming per the spec but can be produced (e.g.
      // pdf-lib's PDFDocument.create()+save()); PDF.js loads it with numPages 0.
      // Reject it at the door so the rest of the app never sees an empty score.
      if (this.mozDoc.numPages == 0) {
        toast("This PDF has no pages.");
        let err = new Error("PDF has no pages");
        err.handled = true; // tells open() callers we've already surfaced this to the user
        throw err;
      }

      // Grab pdf metadata's info, if available
      let meta = await this.mozDoc.getMetadata();
      this.pdfInfo = meta ? meta.info : null;

      // Check for encryption — permissions array means an Encrypt dict exists.
      let perms = await this.mozDoc.getPermissions();
      this.permissions = perms;
      if (perms) {
        this.encrypted = true;
        // Warn only when modification-relevant bits (Modify=8, Annotate=32) are denied.
        if (!perms.includes(8) || !perms.includes(32))
          dialog("This PDF restricts modifications — saving annotations or other changes may not be possible.", { OK: { svg: "OK" } });
      }

      // Grab podium attachment, if available
      let scoreJson = null;
      let podiumAttachment = (await this.mozDoc.getAttachments())?.podium;
      if (podiumAttachment) {
        // scoreJson, if it exists
        scoreJson = JSON.parse(new TextDecoder().decode(podiumAttachment.content));
        this.created = scoreJson.created || this.created;
        this.modified = scoreJson.modified || this.modified;
        this.quality = scoreJson.quality ?? this.quality;
        if(activate) // don't use stashed values if not activating!
          _menu_.stashFromJsonObj(scoreJson.menu, "score");
      } else if(activate) {
        let defaults = JSON.parse(_menu_.stashDefaults);
        let { page, score } = _menu_.rings;
        Object.assign(page.cells.numbers.stash, defaults.page?.cells?.numbers);
        Object.assign(score.cells.details.stash, defaults.score?.cells?.details);
        this.quality = score.cells.details.stash.quality ?? this.quality;
      }
      // create a Pg instance for every pdf page, and calculate the
      // max {width/height} over all pgs.
      for (let i = 1; i <= this.mozDoc.numPages; i++) {
        let mozPage = await this.mozDoc.getPage(i);
        // Use the viewport, not mozPage.view: the viewport applies the page's
        // /Rotate, so pg dimensions match what renderPdf will actually draw
        // (a 90/270-rotated page swaps width and height).
        let { width, height } = mozPage.getViewport({ scale: 1 });
        let pgJson = scoreJson?.pages ? scoreJson.pages[i]:null;
        this.pgs.push(new Pg(this, width, height, pgJson, i));
        if(pgJson?.bookmark) this.pgs[this.pgs.length -1].bookmark = pgJson.bookmark;
        this.maxWidth = Math.max(width, this.maxWidth);
        this.maxHeight = Math.max(height, this.maxHeight);
      }
    }

    else if(activate) {
      let defaults = JSON.parse(_menu_.stashDefaults);
      Object.assign(_menu_.rings.page.cells.numbers.stash, defaults.page?.cells?.numbers);
      Object.assign(_menu_.rings.score.cells.details.stash, defaults.score?.cells?.details);
      this.quality = _menu_.rings.score.cells.details.stash.quality ?? this.quality;
    }

    if(activate) await this.activate();
    return this;
  }

  async activate() {
    // There can be only 1 "active" score at a time...call activate to make this
    // instance the active score
    Score.activeScore = this;
    _score_ = this;
    this.numbers = _menu_.rings.page.cells.numbers.stash;
    this.details = _menu_.rings.score.cells.details.stash;
    this.setTitle();
    // update the _menu_ state for this Score instance:
    _menu_.enableCells(["ink", "page", "layout", "score/save", "score/close", "score/details", "score/print"]);
    _menu_.enableCells("ink/undo", false); // nothing to undo yet
    _menu_.closePanels();
    document.dispatchEvent(new CustomEvent("scoreOpened"));
    _menu_.enableCells("page/undo", this.undoStack.length > 0);
    // clear any pg from paste cell...could be left over from previous score, if any
    _menu_.rings.page.cells.paste.pg = null ;
    _menu_.enableCells("page/paste", false);
    this.pgRefresh();
    // Sync quality to stash so InfoPanel slider shows correct value
    _menu_.rings.score.cells.details.stash.quality = this.quality;
    panels.DetailsPanel.get(_menu_.rings.score.cells.details).refresh();
    // layout the score using current active layout, defaulting to book layout
    _menu_.reset();
    // temporarily activate the layout ring
    _menu_.activateRing(_menu_.rings.layout);
    let layoutKey = _menu_.rings.layout.stash.active || "book" ;
    let cell = _menu_.rings.layout.cells[layoutKey];
    _menu_.activateCell(cell);
    // restore the score ring
    _menu_.activateRing(_menu_.rings.score) ;
    await Layout.open(cell);
    return this;
  }

  async bindScore(pdfData, pn = null) {
    // bind all pages from a given score to this score: i.e. given some score's
    // @pdfData, append all of its pages to this score.
    // @pn one-based index of where to insert the pages from pdfData.
    //     ..when null or < 1, converted to 1 (i.e. first page).
    pn = clamp(pn, 1, this.pgs.length + 1) -1; // convert pn to 0-based in [0, this.pgs.length-1]
    let { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } = PDFLib;
    let pgCount = this.pgs.length;
    let docA = await this.toPdf("stamp", true); // this is the current document
    let docB = await PDFDocument.load(pdfData); // this document contains pages to merge
    let copiedPages = await docA.copyPages(docB, docB.getPageIndices());
    copiedPages.forEach((page,idx) => docA.insertPage(pn + idx, page));
    let mergedPdfData = await docA.save();
    let mergedScore = await new Score().init(this.source, this.path, this.name, mergedPdfData, false);
    // Get podium attachment from docB, if any. Note that PDFLib has no "high level" api for this, so
    // its a bit involved. Code adapted from //github.com/Hopding/pdf-lib/issues/534.
    let json = null;

    do { // doesn't loop: just a break context
      if (!docB.catalog.has(PDFName.of("Names"))) break;
      let Names = docB.catalog.lookup(PDFName.of("Names"), PDFDict);
      if (!Names.has(PDFName.of("EmbeddedFiles"))) break;
      let EmbeddedFiles = Names.lookup(PDFName.of("EmbeddedFiles"), PDFDict);
      if (!EmbeddedFiles.has(PDFName.of("Names"))) break;
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
    } while(false);

    // add docB's json to mergedScore
    let copyKnt = copiedPages.length;
    // existing json at pn needs to be shifted forward to its pg
    for (let i = pgCount - 1; i >= pn; i--) // need highest->lowest
      mergedScore.pgs[i + copyKnt].json = mergedScore.pgs[i].json;

    // clear stale docA json that Score.init assigned to docB's page slots
    for (let i = pn; i < pn + copyKnt; i++) mergedScore.pgs[i].json = null;
    if(json) {
      // insert new json from docB
      let pageJson = JSON.parse(json).pages;
      for (let i = pn, j = 1; j <= copyKnt; i++, j++) { // i is 0-based, j is 1-based
        mergedScore.pgs[i].json = pageJson[j];
      }
    }
    mergedScore.pgRefresh();
    mergedScore.setDirty();
    return mergedScore;
  }

  getActiveObject() {
    // class Pg has logic to ensure that there is at most 1 pg with
    // an active fabric Object: this functions returns it, or none.
    for (let pg of this.pgs) if (pg.inflated && pg.inUse && pg.canvas.getActiveObject())
       return pg.canvas.getActiveObject();
    return null;
  }

  pgAdd(pg, pn, push=true) {
    // Add a new page as page pn (1-based), possibly numbered
    this.pgs.splice(pn - 1, 0, pg);
    this.setDirty();
    pg.undoPn = pn;
    if(push) {
      this.undoStack.push(pg);
      while(this.undoStack.length > this.maxUndo) this.undoStack.shift();
    }
    this.pgRefresh();
    return pg;
  }

  pgCut(pn, push=true) {
    // cut page at
    // @pn (1-based)
    // @return the cut page for possible pasting as part of cut/paste operation
    let cutPg = this.pgs.splice(pn - 1, 1)[0];
    this.pgRefresh(false);
    this.setDirty();
    cutPg.undoPn = -pn;
    if(push) {
      this.undoStack.push(cutPg);
      while(this.undoStack.length > this.maxUndo) this.undoStack.shift();
      _menu_.enableCells("page/undo");
    }
    return cutPg;
  }

  pgMv(fromPn, toPn) {
    // move pg at fromPn to toPn (1-based)
    fromPn = clamp(fromPn, 1, this.pgs.length);
    toPn = clamp(toPn, 1, this.pgs.length);
    if(fromPn != toPn) {
      this.setDirty();
      let pg = this.pgs.splice(fromPn - 1, 1)[0];
      this.pgs.splice(toPn - 1, 0, pg);    
    }
  }

  pnOf(pg) {
    // @return the 1-based page number of the give pg instance, or 0 if not found
    return this.pgs.indexOf(pg) + 1;
  }

  pgRefresh(resetMax = true) {
    // Used to (re)calculate the maxWidth and maxHeight of all pgs
    // in the score, and to enable/disable cells according to current state.
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
    // looks like were calling this for score in pgbuffer....
    if(Score.activeScore === this) {
      _menu_.enableCells("page/undo", this.undoStack.length > 0);
      _menu_.enableCells("page/cut", this.pgs.length > 1); // forbid cutting last pg, otherwise allow
      let detailsCell = _menu_.rings.score?.cells.details;
      if (detailsCell && panels[detailsCell.key]) panels[detailsCell.key].refresh();
    }
  }

  pgUndo() {
    if(this.undoStack.length) {
      let pg = this.undoStack.pop();
      if(pg.undoPn > 0) this.pgCut(pg.undoPn, false);
      else this.pgAdd(pg, -pg.undoPn, false);
    }
    _menu_.enableCells("page/undo", this.undoStack.length);
  }

  async pgUse(pn, nonblocking=true) {
    // Layouts "use" a Pg when they want to actively display it,
    // and "unuse" when they are done actively displaying it.
    // A Pg is inflated (if not inflated) when it is
    // marked inUse, and has its lastUsed timestamp updated.
    // @pn  1-based pg number to be used. Can also be a Pg
    //    instance: if so, its pn is determined.
    // @nonblocking when true, if the pg is backed by a mozilla
    //    pdf page, the pg's elm will be a tmp div, and the pg's pdf rendering 
    //    will happen after this call returns, eventually replacing the tmp div
    // @return that Pg.
    pn = parseInt(pn);
    if (pn > this.pgs.length || pn < 1) return null;
    let pg = this.pgs[pn - 1]; // this.pgs is 0-based
    pg.inUse = true;
    await pg.inflate(true, nonblocking);
    pg.lastUsed = performance.now();
    return pg;
  }

  pgUnuse(pg) {
    // "unuse" the given @pg, making it a candidate for deflation
    if (!pg.inUse) return;
    pg.inUse = false;

    // We don't immediately deflate an unused pg: instead, deflate least recently
    // used unused pg's, allowing at most Score.MAX_INFLATED inflated but unused pg's.
    // Pages with magnifierHold are excluded (being viewed in magnifier panel).
    let deflatable = this.pgs.filter((pg) => pg.inflated && !pg.inUse && !pg.magnifierHold);
    deflatable.sort((a, b) => b.lastUsed - a.lastUsed);
    while (deflatable.length > Score.MAX_INFLATED) {
      deflatable.pop().deflate();
    }
  }

  setDirty(dirty=true) {
    this.dirty = dirty;
  }

  setEditable(bool) {
    for (let pg of this.pgs) pg.setEditable(bool);
  }

  setSelectable(bool) {
    // when selectable, all objects on all pages
    // can be selected, rotated, scaled, and translated...otherwise not.
    // Flattened objects are frozen (see Pg.freeze) and never get controls back.
    for(let pg of this.pgs) {
      if(!pg.inflated) continue;
      if(!bool) pg.canvas.discardActiveObject();
        for (let obj of pg.canvas.getObjects()) {
          obj.hasControls = bool && !obj.flatten;
        pg.canvas.requestRenderAll();
    }}
  }

  setTitle() {
    if (!this.name) { document.title = `Podium (${_podId_})`; return; }
    let name = this.name.replace(/\.pdf$/i, "");
    let maxLen = 30;
    if (name.length > maxLen) {
      let half = (maxLen - 1) >> 1;
      name = name.slice(0, half) + "…" + name.slice(-half);
    }
    document.title = name;
  }

  async toPdf(ink = "stamp", doc = false, pns = null) {
    // Use PDFLib to create PDF representation of this score.
    // @ink === none, skip fabric objects entirely (even as attachment??)
    //      === "stamp" add fabric object as stamp annotation
    //      === "pdf" add fabric object as pdf object
    // @doc if true, the PDF-LIB doc object is returned, otherwise the
    //    pdf bytes that it produces is returned.
    // @pns array of page numbers (1-based) to include, or null for all pgs
    try {
      // When shade is cancelled, set cancelPdf. This will interrupt lib-pdf when
      // it next calls waitForTick by calling our monkey-patched setTimeout
      _shade_.onCancel = () => { window.cancelPdf = true; };
      let srcPLibDoc = null;
      if (this.mozDoc) {
        try {
          // Try loading without ignoreEncryption - getData() should return decrypted data from PDF.js
          srcPLibDoc = await PDFLib.PDFDocument.load(await this.mozDoc.getData());
        } catch (err) {
          if (err.message?.includes('encrypted') || err.message?.includes('Encrypt')) {
            // Owner-password PDFs: content is viewable but pdf-lib rejects
            // the Encrypt dict. Retry ignoring encryption since PDF.js
            // already proved the content is accessible.
            try {
              srcPLibDoc = await PDFLib.PDFDocument.load(
                  await this.mozDoc.getData(), { ignoreEncryption: true }
              );
              // Verify pages are readable — AES-256 encrypted streams will
              // load but produce broken page objects.
              srcPLibDoc.getPages();
            } catch (err2) {
              let msg = pns ? "Due to copy protection, page can't be copied." : "Due to copy protection, score can't be saved.";
              let err = new Error(msg, { cause: "fileSrc" });
              // If full document, attach original data for potential fallback save
              if (pns == null) err.originalData = await this.mozDoc.getData();
              throw err;
            }
          } else {
            throw err; // Re-throw other errors
          }
        }
      }

      // Verify the catalog was parsed correctly
      if (srcPLibDoc && (!srcPLibDoc.catalog || typeof srcPLibDoc.catalog.Pages !== 'function'))
          throw new Error("PDF catalog corrupted.<br>File too large?<br>Try splitting into sections.", { cause: "fileSrc"})

      let dstPLibDoc = await PDFLib.PDFDocument.create();
      dstPLibDoc.registerFontkit(window.fontkit);
      // Reset the embeddedFonts array: it prevents Pg instances from embedding same font twice.
      this.embeddedFonts = [];
      let now = new Date();

      // Snapshot the active layout's current pan-zoom into its cell stash so the save
      // captures the on-screen view (pz is otherwise only written on layout teardown).
      if (this == _score_) Layout.activeLayout?.capturePz();
      let attachment = {
        created: this.created,
        modified: now,
        maxWidth: this.maxWidth,
        maxHeight: this.maxHeight,
        quality: this.quality,
        pages: {},
        menu: _menu_.stashToJsonObj("score"),
      };
      let pLibPg;
      pns = pns || Array.from({length: this.pgs.length}, (_, i) => i + 1);
      for(let j = 0; j < pns.length; j++) {
        let pn = pns[j]; // 1-based
        let percent = Math.trunc((j / pns.length) * 100);
        _shade_.update(`Building page ${j + 1} of ${pns.length} (${percent}%)`);
        let pg = this.pgs[pn-1];
        // if pg is "backed" by a page in mozDoc (1-based), copy page to dstDoc, otherwise add a new "empty" page
        if (pg.mozPn) {
          pLibPg = dstPLibDoc.addPage((await dstPLibDoc.copyPages(srcPLibDoc, [pg.mozPn-1]))[0]);
        } else {
          pLibPg = dstPLibDoc.addPage([pg.width, pg.height]);
          if (pg.background) {
            let hex = pg.background.replace("#", "");
            let r = parseInt(hex.slice(0, 2), 16) / 255;
            let g = parseInt(hex.slice(2, 4), 16) / 255;
            let b = parseInt(hex.slice(4, 6), 16) / 255;
            let a = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
            pLibPg.drawRectangle({
              x: 0, y: 0,
              width: pg.width, height: pg.height,
              color: PDFLib.rgb(r, g, b),
              opacity: a,
            });
          }
        }
        setTimeout(_voidFunc_, 0);
        // add fabric objects to the page
        let pgJson = await pg.toPdf(ink, pLibPg);
        attachment.pages[j+1] = pgJson;
        if(window.gc) window.gc();
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

      // If this is an original PDF with metadata, preserve it
      if (this.pdfInfo) {
        // Preserve original metadata
        if (this.pdfInfo.Title) dstPLibDoc.setTitle(this.pdfInfo.Title);
        if (this.pdfInfo.Author) dstPLibDoc.setAuthor(this.pdfInfo.Author);
        if (this.pdfInfo.Subject) dstPLibDoc.setSubject(this.pdfInfo.Subject);
        if (this.pdfInfo.Keywords) dstPLibDoc.setKeywords(
            Array.isArray(this.pdfInfo.Keywords) ? this.pdfInfo.Keywords : this.pdfInfo.Keywords.split(/[,;]\s*/));
        if (this.pdfInfo.Producer) dstPLibDoc.setProducer(this.pdfInfo.Producer);
        if (this.pdfInfo.Creator) dstPLibDoc.setCreator(this.pdfInfo.Creator);
        if (this.pdfInfo.CreationDate) dstPLibDoc.setCreationDate(new Date(this.pdfInfo.CreationDate));
      } else {
        // New score created from scratch - set Podium metadata
        dstPLibDoc.setCreationDate(now);
        dstPLibDoc.setCreator("Podium vers." + _podiumVersion_);
        dstPLibDoc.setProducer("pdf-lib v1.17.1");
      }
      if (doc) return dstPLibDoc;
      _shade_.update("Generating Pdf document");
      let bytes = await dstPLibDoc.save({objectsPerTick: 250});
      _shade_.update("PDF Generated");
      return bytes;   
    } 
    finally {
      _shade_.onCancel = null;
    }
  }

  update(props) {
    // Used to update any or all off this.source, this.name, this.path
    // from given object's properties
    Object.assign(this, props);
    if ('name' in props) this.setTitle();
  }

}
window._Score_ = Score;
