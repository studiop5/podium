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

import { clamp, delay, fontUnmap, helm, inflate, rotatePoint } from "./common.js";
import { Grid } from "./canvas.js";
import { Layout } from "./layout.js";
import { panels } from "./panel.js";
export { Grid, Pg, Score };

// -skip

{ 
  // We monkey-patch setTimeout for use during PDFLib.save():
  // save() calls setTimeout periodically, so we monkey-patch
  // setTimeout to throw an exception when window.pdf == "cancel".
  // This allows us to interrupt the save, allowing users
  // to "cancel" a long-running save operation.
  let sto = window.setTimeout;
  window.cancelPdf = false;
  window.setTimeout = function(callback, delay, ...args) { 
    if(window.cancelPdf) {
      window.cancelPdf = false;
      throw new Error("PDF save cancelled by user");
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
    // was found to have poorer resolution that using a decicated
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
    let ctx = mozCanvas.getContext("2d");
    await mozPg.render({
      // render *without* annotations
      annotationMode: pdfjsLib.AnnotationMode.DISABLE,
      canvasContext: ctx,
      viewport: viewport,
    }).promise;
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
      this.elm.pg = this; // convenience for accesing pg from dom
      this.style = this.elm.style; // convenient shorthand
      this.inflatePromise = this.inflateAux(render).catch(err => {
        if(err.name == 'AbortError') return; // no error: expected
        console.warn(`Failed to background load/render page ${this.mozPn}:`, err)});
    } else await this.inflateAux(render);
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
      this.stretch = this.score.pgFit == "Expand" ? Math.min(
         this.score.maxWidth / this.width,this.score.maxHeight / this.height) : 1;
  
      let domCanvas = document.createElement("canvas");
      // allowTouchScrolling needs to be false, else certain browers (chrome mobile, at
      // least) will create an "Intervention event", trying to scroll, when we've
      // explicitly "preventDefault() touchmove on body in main.js.
      let canvas = new fabric.Canvas(domCanvas, {
          enablePointerEvents: true,
          allowTouchScrolling: false, // Required!
          imageSmoothingEnabled: false,
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
  
      if (this.json) await new Promise((resolve, reject) => 
        canvas.loadFromJSON(this.json, () => resolve()));
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
  
      let stateChanged = false; // flag to indicate canvas state has changed s.t. it needs to be pushed to the undoStack
  
      canvas.on("mouse:down:before", async (opts) => {
        if(_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell) 
          _menu_.pgDownEvent(opts, this);
      });
  
      canvas.on("mouse:up", opts => {
        if(stateChanged) pushState();
        stateChanged = false;
        if (_menu_.activeRing.key == "ink" && _menu_.activeRing.activeCell) _menu_.pgUpEvent(opts, this); 
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
      };
  
      canvas.on("object:added", ((obj) => { if(!this.suppressStateChange) stateChanged = true;}));
      canvas.on("object:removed", ((obj) => { if(!this.suppressStateChange) stateChanged = true;}));
      canvas.on("object:modified", ((obj) => { if(!this.suppressStateChange) stateChanged = true;}));
  
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
    // -  the two object URLs are revoked after a delay of 10 animation frames
    if (!this.thumbElm || force) {
      let deflated = !this.inflated;
      let score = this.score;
      if (deflated) await this.inflate(true, false);

      // create div that will display the thumbnail
      let scale = Pg.thumbSize / Math.max(score.maxWidth, score.maxHeight);
      let maxW = score.maxWidth * scale, maxH = score.maxHeight * scale;

      this.thumbElm = helm(
        `<div class="TableLayout__pg" style="width:${maxW / _pxPerEm_}em;height:${maxH / _pxPerEm_}em;"></div>`);
      this.thumbElm.style.backgroundColor = Pg.paddingColor;
      if(score.pgFit == "Center")
        this.thumbElm.style.backgroundSize = this.width * 100 / score.maxWidth + "%";

      // create object URL for fabric canvas
      let fabCanvas = this.canvas.toCanvasElement(scale * this.stretch);
      this.fabUrl = URL.createObjectURL(await new Promise((res) => fabCanvas.toBlob((b) => res(b))));

      if(this.mozCanvas) {
        // create obj URL for mozCanvas (from mozilla pdf src);
        let pdfCanvas = helm(`<canvas width="${maxW}" height="${maxH}"></canvas>`);
        pdfCanvas.getContext("2d").drawImage(this.mozCanvas, 0, 0, maxW, maxH);
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
    return this.canvas.toJSON();
  }

  async undo( ) {
    // pop an entry from the undo stack, resetting pg's state
    this.score.setDirty(true);
    let stack = this.undoStack;
    if (stack.length > 1) {
      this.suppressStateChange = true;
      stack.pop();
      await new Promise((resolve, reject) => this.canvas.loadFromJSON(stack[stack.length - 1], () => resolve()));
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
    if (!wasInflated) await this.inflate(false, false); // temporarily re-inflate, but skip  unnecessary rendering
    // delete all existing annotations
    let annots = pLibPg.node.Annots();
    if (annots) annots.array.splice(0, annots.array.length);
    let pageHeight = pLibPg.getHeight();

    // Nested function that converts a fabric object to a PDFLib object, with help of this.objToPdf(...)
    let processObj = async(obj, absoluteTransform = null) => {

      if(absoluteTransform) {
        obj = fabric.util.object.clone(obj);
        obj.set({
          left: absoluteTransform.left,
          top: absoluteTransform.top,
          scaleX : absoluteTransform.scaleX,
          scaleY: absoluteTransform.scaleY,
          angle: absoluteTransform.angle });
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
          // the fabricjs image is assumed to have a src property that
          // must be a dataURL starting with "data:image/jpeg; or "data:image/png;"
          let res = await fetch(obj.src);
          let bytes = new Uint8Array(await res.arrayBuffer());
          let image = obj.src.startsWith("data:image/jpeg;") ? await pLibPg.doc.embedJpg(bytes) : 
              obj.src.startsWith("data:image/png;") ? await pLibPg.doc.embedPng(bytes): null;
          if(!image) throw new Error("Unknown image type in data url:" + obj.src.substring(20) + "...");
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
          break;
        }
 
        case "group": {
          let groupMatrix = obj.calcOwnMatrix();

          for (let groupObj of obj._objects) {
            if (groupObj.type === 'group') {
              // Nested group: apply parent transformation, then recurse
                let clonedGroup = fabric.util.object.clone(groupObj);
                fabric.util.addTransformToObject(clonedGroup, groupMatrix);
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
    if (!wasInflated) this.deflate();
    // The returned json will not contain any fabricjs objects with the "merge" property:
    // these will have been encorporated directly into the pdf.
    json.objects = json.objects.filter((obj) => !obj.merge);
    json.bookmark = this.bookmark;
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
    else if(ink == "none") return; 
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
    if (pLibPg.node.has(PDFName.Annots) && pLibPg.node.Annots()) pLibPg.node.Annots().push(stamp.dict);
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
    await score.init(null, null, `anon${Math.round(Math.random() * 100)}.pdf`);
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

  embeddedFonts = null; // Used by this.toPDF() to prevent fonts from being embedded more than once
  maxHeight = -1; // maxHeight among all pg's in score
  maxWidth = -1; // maxWidth among all pg's in score
  pgs = []; // array of Pg instances for all pages in a score
  undoStack = []; // will contain pgs, tagged with undoPn whenever pgAdd(),or -undoPn whenever pgCut()
  mozDoc = null; // reference to mozilla pdflib document, if available
  quality = 2; // pdf rendering quality: see Pg.renderPdf()
  dirty = false; // true iff score has been modified (i.e. requires saving) 

  numbers = {
    pn: 1, // current pn
    first: 1, // first pn to display
    prelim: 0, // Number of preliminary (roman numberal) pages
    forward: "Pages", // Forward arrow behavior: "Pages or "Bookmarks"
    reverse: "Pages"  // Reverse...
   }

  pgFit = "Center";

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
    this.pgFit = _menu_.rings.score.cells.info.stash.pgFit ?? this.pgFit;


    if (pdfData) {
      this.size = pdfData.byteLength;
      if (!window.pdfjsLib) {
        // mozilla pdfjsLib is loaded from mozSrc and mozWorkerSrc (strings
        // (base64-encoded-gzipped strings defined globally) on demand
        let pdfUrl = URL.createObjectURL(await inflate(mozSrc));
        mozSrc = null; // allow gc
        await import(pdfUrl);
        URL.revokeObjectURL(pdfUrl);
        let mozWorkerUrl = URL.createObjectURL(await inflate(mozWorkerSrc));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = mozWorkerUrl;
        mozWorkerSrc = null; // allow gc
      }

      let loadingTask = window.pdfjsLib.getDocument(pdfData);

      // is this an encrypted pdf?
      loadingTask.onPassword = (callback, reason) => {
        let message = reason === 1 ?
          "Incorrect password. Please try again." :
          "This PDF is password-protected. You can view and annotate it, but cannot save changes or copy pages.\n\nEnter password:";
        let password = prompt(message, "");
        if (password) callback(password);
        else throw new Error("pdf password failure");
      };

      this.mozDoc = await loadingTask.promise;
      // Grab pdf metadata's info, if available
      let meta = await this.mozDoc.getMetadata();
      this.pdfInfo = meta ? meta.info : null;

      // Grab podium attachment, if available
      let scoreJson = null;
      let podiumAttachment = (await this.mozDoc.getAttachments())?.podium;
      if (podiumAttachment) {
        // scoreJson, if it exists
        scoreJson = JSON.parse(new TextDecoder().decode(podiumAttachment.content));
        this.created = scoreJson.created || this.created;
        this.modified = scoreJson.modified || this.modified;
        this.quality = scoreJson.quality ?? this.quality;
        this.numbers = scoreJson.numbers ?? this.numbers;
        this.pn = scoreJson.pn ?? 1;
        this.first = scoreJson.first ?? 1;
        this.prelim = scoreJson.prelin ??0;
        if(activate) // don't use stashed values if not activating!
          _menu_.stashFromJsonObj(scoreJson.menu);
      }

      // create a Pg instance for every pdf page, and calculate the
      // max {width/height} over all pgs.
      for (let i = 1; i <= this.mozDoc.numPages; i++) {
        let mozPage = await this.mozDoc.getPage(i);
        let [left, top, width, height] = mozPage.view;
        let pgJson = scoreJson?.pages ? scoreJson.pages[i]:null;
        this.pgs.push(new Pg(this, width, height, pgJson, i));
        if(pgJson?.bookmark) this.pgs[this.pgs.length -1].bookmark = pgJson.bookmark;
        this.maxWidth = Math.max(width, this.maxWidth);
        this.maxHeight = Math.max(height, this.maxHeight);
      }
    }
    if(activate) await this.activate();
    return this;
  }

  async activate() {
    // There can be only 1 "active" score at a time...call activate to make this
    // instance the active score
    Score.activeScore = this;
    _score_ = this;
    document.title = `Podium ${this.name ? this.name.replace(/\.pdf/i, ""):"*"} (${_podId_})`;
    // update the _menu_ state for this Score instance:
    _menu_.enableCells(["ink", "page", "layout", "score/save", "score/close", "score/info", "score/print"]);
    _menu_.enableCells("ink/undo", false); // nothing to undo yet
    _menu_.enableCells("page/undo", this.undoStack.length > 0);
    this.pgRefresh();
    // Sync quality to stash so InfoPanel slider shows correct value
    _menu_.rings.score.cells.info.stash.quality = this.quality;
    panels.InfoPanel.get(_menu_.rings.score.cells.info).refresh();
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
          // If load fails due to encryption
          if (err.message?.includes('encrypted') || err.message?.includes('Encrypt')) {
            // Can't copy or save encrypted PDFs
            let msg = pns ? "Due to copy protection, page can't be copied." : "Due to copy protection, score can't be saved.";
            throw new Error(msg, { cause: "fileSrc" });
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

      let attachment = {
        created: this.created,
        modified: now,
        maxWidth: this.maxWidth,
        maxHeight: this.maxHeight,
        quality: this.quality,
        numbers: this.numbers,
        pages: {},
        menu: _menu_.stashToJsonObj(),
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
      dstPLibDoc.setCreationDate(now);
      dstPLibDoc.setCreator("Podium vers." + _podiumVersion_);
      if (doc) return dstPLibDoc;
      _shade_.update("Generating Pdf document");
      let bytes = await dstPLibDoc.save({objectsPerTick: 1000});
      _shade_.update("PDF Generated!");
      return bytes;   
    } 
    finally {
      _shade_.onCancel = null;
    }
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

    if(json) {
      // insert new json from docB
      let pageJson = JSON.parse(json).pages;
      for (let i = pn, j = 1; j <= copyKnt; i++, j++) { // i is 0-based, j is 1-based
        mergedScore.pgs[i].json = pageJson[j]; 
      }
    }
    // Added merged pgs to mergedScore's undo stack
    for(let i = 0; i < copyKnt; i++) {
      let pg = mergedScore.pgs[pn + i];
      pg.undoPn = pn + i + 1;
      mergedScore.undoStack.push(pg);
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
      while(this.undoStack.length > Score.MAX_UNDO) this.undoStack.shift();
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
    /// looks like were calling this for score in pgbuffer....
    if(Score.activeScore === this) {
      _menu_.enableCells("page/undo", this.undoStack.length > 0);
      _menu_.enableCells("page/delete", this.pgs.length > 1); // forbid deleting last pg, otherwise allow
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
    let deflatable = this.pgs.filter((pg) => pg.inflated && !pg.inUse);
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

  setTransformable(bool) {
    // when a score is transformable, all objects on all pages
    // can be rotated, scaled, and translated...otherwise not
    for(let pg of this.pgs) {
      if(!pg.inflated) continue;
      if(!bool) pg.canvas.discardActiveObject();
        for (let obj of pg.canvas.getObjects()) {
          obj.hasControls = bool;
        pg.canvas.requestRenderAll();
    } } }

  update(props) {
    // Used to update any or all off this.source, this.name, this.path
    // from given object's properties
    Object.assign(this, props);
  }

}
