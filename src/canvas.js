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

export { initFabric, Grid };
import { clamp, getBox, helm, listen, unlisten } from "./common.js";
// -skip

/**
   This module defines extensions and customizations to fabricjs and its canvas
 **/


/**
Fabric.js customizations

  Note: Call initFabric() before using any fabric.js functionality
**/

function initFabric() {
  // Suppress "willReadFrequently" warning: Fabric's hit-test cache canvas calls
  // getImageData frequently, so opt in to the GPU-bypass hint.
  fabric.Canvas.prototype._createCacheCanvas = function() {
    this.cacheCanvasEl = this._createCanvasElement();
    this.cacheCanvasEl.setAttribute("width", this.width);
    this.cacheCanvasEl.setAttribute("height", this.height);
    this.contextCache = this.cacheCanvasEl.getContext("2d", { willReadFrequently: true });
  };

  // Text cursor drift: fabric measures every glyph ONCE at a fixed
  // CACHE_FONT_SIZE (400px) and scales the result by fontSize/400. Glyph
  // advances are not linear in size — hinting rounds them at reading sizes — so
  // each character comes out ~0.5px narrower than it is actually painted at
  // 20px. The caret is positioned by SUMMING those measurements while the line
  // itself is painted in one fillText using the browser's real metrics (see
  // _renderChars' "shortCut"), so the two drift apart by a constant amount per
  // character: half a glyph by the ninth, a whole glyph by the eighteenth.
  //
  // Measuring at the real font size removes the scaling entirely. The cache is
  // keyed by the full font declaration rather than by family alone, since
  // widths are no longer size-independent; it stays nested under the family so
  // fabric's own clearFabricFontCache(family) still empties it when a font
  // finishes loading.
  fabric.Text.prototype._measureChar = function (_char, charStyle, previousChar, prevCharStyle) {
    let decl = this._getFontDeclaration(charStyle); // NOT forMeasuring: real size
    let ctx = this.getMeasuringContext();
    let family = (charStyle?.fontFamily ?? this.fontFamily ?? "").toLowerCase();
    let byFamily = (fabric.charWidthsCache[family] ??= {});
    let cache = (byFamily[decl] ??= {});
    let measure = (str) => {
      if (cache[str] === undefined) {
        ctx.font = decl;
        cache[str] = ctx.measureText(str).width;
      }
      return cache[str];
    };
    let width = measure(_char);
    // Kerning is the pair's width less the previous glyph's, exactly as fabric
    // does it — but only when both glyphs are in the same font.
    let kernedWidth = width;
    if (previousChar && prevCharStyle && decl === this._getFontDeclaration(prevCharStyle))
      kernedWidth = measure(previousChar + _char) - measure(previousChar);
    return { width, kernedWidth };
  };

  // ...and measure on a canvas that is IN the document. A detached one resolves
  // font families against no style context, so it can pick a different face
  // than the canvas being painted on — same declaration, ~5% wider text.
  // Created lazily: initFabric can run before <body> exists.
  fabric.Text.prototype.getMeasuringContext = function () {
    if (!fabric._measuringContext) {
      let elm = helm(`<canvas width="8" height="8" aria-hidden="true"
        style="position:absolute;left:-9999px;top:-9999px;pointer-events:none"></canvas>`);
      (document.body ?? document.documentElement).append(elm);
      fabric._measuringContext = elm.getContext("2d", { willReadFrequently: true });
    }
    return fabric._measuringContext;
  };

  // Drag dead zone: fabric counts ANY pointer movement between down and up as
  // a move (dragHandler returns true on a 1px change), and IText's
  // mouseUpHandler refuses to enter editing once transform.actionPerformed is
  // set. A finger nearly always jitters a pixel or two, so on touch a tap on a
  // selected text nudged it instead of opening it for editing. Ignore drag
  // moves until the pointer has travelled past a threshold from where it went
  // down. Measured in client (screen) pixels so it doesn't vary with zoom.
  //
  // The threshold depends on what is actually pointing, per gesture: a finger's
  // contact patch shifts as it presses, a pen tip skids a little on glass, a
  // mouse sits still. _mobile_ only describes the device's PRIMARY pointer, so
  // it is wrong for a finger on a touchscreen laptop or a mouse on an iPad;
  // it is the fallback when the event carries no pointerType.
  let dragThresholds = { touch: 10, pen: 6, mouse: 4 };
  let dragThreshold = (e) => {
    let type = e.pointerType || (e.touches ? "touch" : _mobile_ ? "touch" : "mouse");
    return dragThresholds[type] ?? dragThresholds.mouse;
  };
  let clientPt = (e) => e.touches?.[0] ?? e.changedTouches?.[0] ?? e;

  let setupCurrentTransform = fabric.Canvas.prototype._setupCurrentTransform;
  fabric.Canvas.prototype._setupCurrentTransform = function (e, target, alreadySelected) {
    setupCurrentTransform.call(this, e, target, alreadySelected);
    let transform = this._currentTransform;
    if (transform && target) {
      let pt = clientPt(e);
      transform.downX = pt.clientX;
      transform.downY = pt.clientY;
      transform.dragThreshold = dragThreshold(e);
    }
  };

  let performTransformAction = fabric.Canvas.prototype._performTransformAction;
  fabric.Canvas.prototype._performTransformAction = function (e, transform, pointer) {
    if (transform.action == "drag" && !transform.pastThreshold && transform.downX !== undefined) {
      let pt = clientPt(e);
      if (Math.hypot(pt.clientX - transform.downX, pt.clientY - transform.downY) < transform.dragThreshold) return;
      transform.pastThreshold = true;
    }
    performTransformAction.call(this, e, transform, pointer);
    if (transform.action == "drag") transform.target.clampToPage();
  };

  // Keep an object (or selection) within its page: move it, if need be, so
  // that its bounding box, rotation included, lies inside the canvas. Along an
  // axis where it's larger than the page, it's centered instead. This is THE
  // rule for where an object may be placed: dragging (above), the EditPanel's
  // arrows and pasted-image placement all use it, so they behave identically.
  // Only position is constrained: scaling or rotating can still push part of
  // an object past an edge, until it is next moved.
  fabric.Object.prototype.clampToPage = function () {
    if (!this.canvas) return;
    let { tl, br } = this.canvas.calcViewportBoundaries(); // the page, in object coordinates
    let box = this.getBoundingRect(true, true);
    let shift = (pos, size, min, max) =>
      (size > max - min ? (min + max - size) / 2 : clamp(pos, min, max - size)) - pos;
    let dx = shift(box.left, box.width, tl.x, br.x);
    let dy = shift(box.top, box.height, tl.y, br.y);
    if (dx == 0 && dy == 0) return;
    this.set({ left: this.left + dx, top: this.top + dy });
    this.setCoords();
  };

  fabric.Object.NUM_FRACTION_DIGITS = 8;
  fabric.Object.prototype.transparentCorners = false;
  fabric.Object.prototype.cornerSize = _mobile_ ? 32:16; // Large touch target
  fabric.Object.prototype.cornerStyle = "circle";
  fabric.Object.prototype.lockScalingFlip = true; // Prevent flipping/inverting
  fabric.Object.prototype.cornerColor = "#00f8";
  fabric.Object.prototype.controls.mtr.offsetY = -80;
  fabric.Object.prototype.objectCaching = false;
  fabric.Object.prototype.strokeWidth = 0;

  // Customize appearance/behavior of controls:
  fabric.ActiveSelection.prototype.controls.groupToggle = 
  fabric.Group.prototype.controls.groupToggle = new fabric.Control({
    x: 0.5,
    y: -0.5,
    offsetX: 40,
    offsetY: -70,
    sizeX: 64,
    sizeY: 64,
    cursorStyle: 'pointer',
    mouseDownHandler: function(eventData, transform) {
      let target = transform.target;
      let canvas = target.canvas;
      if (target.type == 'activeSelection') {
        let group = target.toGroup();
        canvas.requestRenderAll();
        canvas.setActiveObject(group);
      } else if (target.type == 'group') {
        let activeSelection = target.toActiveSelection();
        canvas.requestRenderAll();
        canvas.setActiveObject(activeSelection);
      }
      return true;
    },
  });

  let ctrls = fabric.Object.prototype.controls;
  for(let ctrl in ctrls) {
      // ctrl's are: ml mr mb mt tl tr bl br mtr. Here
      // we move controls away from the bounding box
      if(ctrl.length > 2) continue;
      if(ctrl.includes('l')) ctrls[ctrl].offsetX = -20;
      else if(ctrl.includes('r')) ctrls[ctrl].offsetX = +20;
      if(ctrl.includes('t')) ctrls[ctrl].offsetY = -20;
      else if(ctrl.includes('b')) ctrls[ctrl].offsetY = +20;
   }


  for(let [key, ctrl] of Object.entries(fabric.Object.prototype.controls)) {
    ctrl.render = (ctx, left, top, styleOverride, fabricObject) => {

      if(key == "groupToggle") {
        // draw a lock icon with two states for converting multiple selections to/from groups
        let locked = true;
        if (fabricObject.type == "activeSelection" && fabricObject.size() > 1)  locked = false;
        else if(fabricObject.type != "group" || fabricObject.podiumType == "rastrum") return;
        ctx.save();
        ctx.translate(left-24, top-24);
        ctx.lineWidth = 2;
        ctx.lineJoin ="round";
        ctx.strokeRect(0, 24, 26, 20);
        ctx.beginPath();
        if (locked) {
          ctx.moveTo(5.5, 24);
          ctx.lineTo(5.5, 20);
          ctx.arc(13.5, 18, 8, Math.PI, 0);
          ctx.moveTo(21.5, 24);
          ctx.lineTo(21.5, 17);
        } else {
          ctx.moveTo(5.5, 24);
          ctx.lineTo(5.5, 10);
          ctx.arc(13.5, 12, 8, Math.PI, 0);
          ctx.lineTo(21.5, 17);
        }
        ctx.stroke();
        ctx.beginPath(); // keyhole
        ctx.arc(13, 32, 3, 0, 2 * Math.PI);
        ctx.moveTo(13,36);
        ctx.lineTo(13,39);
        ctx.stroke();
        if(locked) ctx.fill();
        ctx.restore();
        return;
      }
  
      ctx.save();
      ctx.lineWidth = 6;
      ctx.beginPath();
      let r = fabricObject.cornerSize / 2;
      ctx.arc(left, top, r, 0, 2 * Math.PI);
      if(key == "mtr") ctx.stroke(); else ctx.fill();
      ctx.restore();
    }

    // Hide controls that make no sense for a type. These Control instances are
    // SHARED by every object type (fabric's Textbox reuses Object's mt/mb too),
    // so hiding must be decided per object here, never by mutating the control:
    // fabric consults getVisibility for both drawing and hit-testing.
    let getVisibility = ctrl.getVisibility;
    ctrl.getVisibility = function(fabricObject, controlKey) {
      // groupToggle lives on the shared controls too, so every object has it:
      // only (un)groupable objects may show it or be hit on it. A rastrum is a
      // group, but must never be ungrouped.
      if(key == "groupToggle") {
        let { type } = fabricObject;
        if(!(type == "activeSelection" && fabricObject.size() > 1) &&
           !(type == "group" && fabricObject.podiumType != "rastrum")) return false;
      }
      if(["text", "textbox", "image"].includes(fabricObject.type) && ["mt","mb"].includes(key)) return false;
      if("text" == fabricObject.type && ["ml","mr"].includes(key)) return false;
      return getVisibility.call(this, fabricObject, controlKey);
    };
  }

  // ...textBox ml and mr controls: they control textbox width:
  fabric.Textbox.prototype.controls.ml = new fabric.Control({
    x: -0.5,
    y: 0,
    offsetX: -20,
    actionHandler: fabric.controlsUtils.changeWidth,
    cursorStyleHandler: () => 'ew-resize',
    render: (ctx, left, top, styleOverride, fabricObject) => {
      let s = fabricObject.cornerSize;
      ctx.fillRect(left - s/2, top - s/2, s, s);
    },
  });

  fabric.Textbox.prototype.controls.mr = new fabric.Control({
    x: 0.5,
    y: 0,
    offsetX: 20,
    actionHandler: fabric.controlsUtils.changeWidth,
    cursorStyleHandler: () => 'ew-resize',
    render: (ctx, left, top, styleOverride, fabricObject) => {
      let s = fabricObject.cornerSize;
      ctx.fillRect(left - s/2, top - s/2, s, s);
    },
  });

  // Podium implements 2 Ink cells: Pencil and Pen. They are both
  // PencilBrushes (or LineBrushes, see below). Idea is that user
  // will have 2 differently-configured LineBrushes available at
  // all times. But our EditPanel, when it selects a path, wants
  // to know which cell was used to create the path. For this reason,
  // we add a podiumType variable (value: ink || pencil) to the created path.
  fabric.PodBrush = fabric.util.createClass(fabric.PencilBrush, {
    type: "PodBrush",
    podiumType: 'ink',

    initialize: function(canvas, podiumType, stash) {
      this.callSuper('initialize', canvas);
      this.podiumType = podiumType; 
      this.podiumStash = fabric.PodBrush.settings(stash);
    },

    createPath: function(pathData) {
      let path = this.callSuper('createPath', pathData);
      path.podiumType = this.podiumType; // add PodiumType to path *after* its created                     
      path.podiumStash = this.podiumStash;
      return path;                      
    }      
  });

  // A pencil or pen stroke carries a copy of its cell's stash settings it was
  // drawn with, as podiumStash: its panel loads them when the stroke is selected.
  fabric.PodBrush.settings = ({ alpha, rgb, style, width }) => ({ alpha, rgb, style, width });

  fabric.RastrumBrush = fabric.util.createClass(fabric.BaseBrush, {
    type: "RastrumBrush",
  
    initialize: function (canvas, options, color) {
      this.callSuper('initialize', options);
      this.canvas = canvas;
      Object.assign(this, options);
      this.color = color;
      this.zoom = canvas.getZoom(); // rem grd...tmp exp
    },
  
    onMouseDown: function (ptr) {
      this.origin = { x: ptr.x, y: ptr.y };
    },
  
    onMouseMove: function (ptr) {
      this.ptr = ptr;
      let { canvas, color, gap, lines, width, origin, style, zoom } = this;
      let ctx = canvas.contextTop;
      canvas.clearContext(ctx);
      if (style == "L-R") origin.y = ptr.y;
      else origin.x = ptr.x;
      // Preview what paths() will build: same "Auto" width, and each line
      // extends from its position by its width (a stroke would straddle it).
      if (width == 0) width = .13 * gap;
      for (let i = 0, n = gap * lines; i < n; i += gap) {
        ctx.beginPath();
        ctx.lineWidth = width * zoom;
        ctx.lineCap = "butt";
        ctx.strokeStyle = color;
        if (style == "L-R") {
          let y = (origin.y + i + width / 2) * zoom;
          ctx.moveTo(origin.x * zoom, y);
          ctx.lineTo(ptr.x * zoom, y);
        } else {  // style == "T-B"
          let x = (origin.x + i + width / 2) * zoom;
          ctx.moveTo(x, origin.y * zoom);
          ctx.lineTo(x, ptr.y * zoom);
        }
        ctx.stroke();
      }
    },
  
    onMouseUp: function (e) {
      this.ptr = e.pointer;
      this.draw();
    },
  
    draw: function () {
      let { canvas, gap, origin, ptr, style } = this;
      let length = style == "L-R" ? Math.abs(ptr.x - origin.x) : Math.abs(ptr.y - origin.y);
      canvas.clearContext(canvas.contextTop);
      // A tap, or a drag shorter than one staff space, makes no rastrum: it
      // would be an invisible (zero-length) or accidental object on the page.
      if (length < gap) return;
      let paths = fabric.RastrumBrush.paths({ ...this, length },
        Math.min(origin.x, ptr.x), Math.min(origin.y, ptr.y));
      canvas.add(new fabric.Group(paths, {
        hasControls: false,
        podiumType: "rastrum",
        podiumStash: fabric.RastrumBrush.settings(this),
      }));
     }
  });

  // A rastrum carries a copy of the rastrum cell's stash settings it was drawn
  // with, as podiumStash: the RastrumPanel loads them when the rastrum is
  // selected, and redraw() needs its style ("L-R" or "T-B").
  fabric.RastrumBrush.settings = ({ alpha, rgb, style, gap, lines, width, bars, barWidth }) =>
    ({ alpha, rgb, style, gap, lines, width, bars, barWidth });

  // Build a rastrum's two paths, staff lines and bar lines, with their top-left
  // corner at left,top. length is the extent along the staff; the other
  // settings are those of the rastrum cell's stash, plus its color as rgba.
  fabric.RastrumBrush.paths = function ({ style, length, gap, lines, width, bars, barWidth, color }, left = 0, top = 0) {
    // interpret "Auto"  (encoded as 0) to refer to Bravura engravingDefault values (in staff space, i.e. gap)
    if (width == 0) width = .13 * gap ; // .13 and .16 are from bravura docs
    if (barWidth == 0) barWidth = .16 * gap ;
    let d = "";
    for (let y = 0, n = gap * lines; y < n; y += gap)
      if (style == "L-R") d += `M0 ${y}h${length}v${width}h${-length}Z`;
      else d += `M${y} 0v${length}h${width}v${-length} Z`;
    let staffPath = new fabric.Path(d, { left, top, fill: color });
    d = "";
    if(bars > 0) { // add bar lines
      let staffHeight = (lines - 1) * gap + width;
      let barSpan = (length - barWidth) / bars;
      for (let i = 0, at = 0; i <= bars; i++, at += barSpan)
        if (style == "L-R") d += `M${at} 0v${staffHeight}h${barWidth}v${-staffHeight}Z`;
        else d += `M0 ${at}v${barWidth}h${staffHeight}v${-barWidth}Z`;
    }
    let barPath = new fabric.Path(d, { left, top, fill: color });
    return [staffPath, barPath];
  };

  // Redraw an existing rastrum (the group made by draw(), above) in place from
  // new settings: called from the RastrumPanel. It keeps its position, scale,
  // rotation and length; its top-left corner stays put. The group itself is
  // kept, only its contents are swapped, so the selection is undisturbed.
  fabric.RastrumBrush.redraw = function (group, stash) {
    // rastrums saved before podiumStash existed: staves are longer than tall
    let style = group.podiumStash?.style ?? (group.width >= group.height ? "L-R" : "T-B");
    let length = style == "L-R" ? group.width : group.height;
    let color = fabric.Color.fromHex(stash.rgb);
    color.setAlpha(stash.alpha);
    let fresh = new fabric.Group(fabric.RastrumBrush.paths({ ...stash, color: color.toRgba(), length }));
    for (let obj of fresh._objects) obj.group = group;
    group._objects = fresh._objects;
    group.set({ width: fresh.width, height: fresh.height, podiumStash: fabric.RastrumBrush.settings(stash), dirty: true });
    group.setCoords();
    group.canvas?.requestRenderAll();
  };

  // LineBrush's lines are restricted to stright lines
  fabric.LineBrush = fabric.util.createClass(fabric.RastrumBrush, {
    type: "LineBrush",
    podiumType: "ink",
  
    initialize: function (canvas, options, color, podiumType) {
      this.callSuper("initialize", canvas, options, color);
      this.podiumType = podiumType ;
    },
  
    onMouseMove: function (ptr) {
      let { canvas, color, origin, style, width, zoom } = this;
      let ctx = canvas.contextTop;
      ptr = { x: ptr.x, y: ptr.y }; // a copy: ptr is fabric's own
      if (style == "L-R") ptr.y = origin.y;
      else if (style == "T-B") ptr.x = origin.x;
      // else (style == "Straight")
      canvas.clearContext(ctx);
      ctx.beginPath();
      ctx.lineWidth = width * zoom;
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.moveTo(origin.x * zoom, origin.y * zoom);
      ctx.lineTo(ptr.x * zoom, ptr.y * zoom);
      ctx.stroke();
    },
  
    onMouseUp: function (e) {
      this.ptr = { x: e.pointer.x, y: e.pointer.y }; // a copy: draw() constrains it
      this.draw();
    },
  
    draw: function() {
      let { canvas, color, origin, ptr, style, width } = this;
      if (style == "L-R") ptr.y = origin.y;
      else if (style == "T-B") ptr.x = origin.x;
      // else (style == "Straight")
      let dX = ptr.x - origin.x;
      let dY = ptr.y - origin.y;
      // Note: need to subtract width/2 from left and top because
      // the fabric path interprets line width differently than
      // html canvas
      this.path = new fabric.Path(`M0 0 L ${dX} ${dY}`, {
        height: dY,
        width: dX,
        left: Math.min(origin.x, ptr.x) - width / 2,
        top: Math.min(origin.y, ptr.y) - width / 2,
        fill: false,
        stroke: color,
        strokeLineCap: "round",
        strokeWidth: width,
        hasControls: false,
        podiumType: this.podiumType, 
        podiumStash: fabric.PodBrush.settings(this),
      });
      canvas.clearContext(canvas.contextTop);
      canvas.fire("before:path:created", { path: this.path });
      canvas.add(this.path);
      this.canvas.setActiveObject(this.path);
    },
  });
}


/**
class Grid

   Display a grid across the pg.  The grid is added from
   menu.pgDownEvent. Before subsequent pointerup, the grid can be
   moved to position it at will...its effectively infinitely large.

   To the user, it will appear like a fabricjs obj, but it is
   implemented completely independently from the fabricjs libary.
**/

class Grid {

  // Successive grid lines are drawn with a repeated pattern
  // of transparency and linewidth. The pattern is determined by
  // the value of the stash values for xStep and yStep, values
  // in 0-3], that determine which sequence to use:
  patterns = [
      [1],
      [1,.75],
      [1,.5,.75,.5],
      [1,.35,.5,.35,.75,.35,.5,.35],
      [1,.25,.35,.25,.5,.25,.35,.25,.75,.25,.35,.25,.5,.25,.35,.25]];


  constructor(pg, stash, options) {
    this.pg = pg;

    // assign units (Inch or Cm), and xStep and yStep: (see menu.js) from stash
    Object.assign(this, stash);
    let { width, height } = pg.canvas;
    this.zoom = pg.zoom;
    width *= this.zoom;
    height *= this.zoom;
    this.gridCanvas = helm(`<canvas data-tag="grid" width="${width}" height="${height}" style="position:absolute;width:${width / _pxPerEm_}em;height:${height / _pxPerEm_}em;"></canvas>`);
    pg.canvas.wrapperEl.insertBefore(this.gridCanvas, pg.canvas.upperCanvasEl);

    // Define maxStep: the largest step, *in pixels*, for the given unit:
    // when units == Inch, this will be 1 inch == 72px,
    // when units == Metric, this will be 4cm = (72 / 2.54) * 4 px
    this.maxStep = this.units == "Inch" ? 72 : (72 / 2.54) * 4;
    // grid lines are offset from each other by dx,dy pixels:
    let maxStep = this.maxStep;

    this.dx = maxStep / Math.pow(2, this.xStep);
    this.dy = maxStep / Math.pow(2, this.yStep);

    // the cell.cache vars xStep and yStep determine the grid line patterns:
    this.patternX = this.patterns[this.xStep];
    this.patternY = this.patterns[this.yStep];

    // some grid lines are labelled: either every successive Inch,
    // or every successive 4 cm.
    this.stepsPerLabel = this.units == "Inch" ? 1 : 4;

    // Capture pointer to prevent selection while grid is active
    pg.canvas.upperCanvasEl.setPointerCapture(options.e.pointerId);

    // Determine offset direction based on quadrant of pointerdown
    // Origin offset pushes toward the quadrant corner (away from center)
    let offset = 4 * _pxPerEm_;
    let box = getBox(this.gridCanvas);
    let startX = options.e.clientX - box.x;
    let startY = options.e.clientY - box.y;
    let inLeftHalf = startX < box.width / 2;
    let inTopHalf = startY < box.height / 2;
    // Upper left: up & left, Upper right: up & right, Lower left: down & left, Lower right: down & right
    this.offsetX = inLeftHalf ? -offset : offset;
    this.offsetY = inTopHalf ? -offset : offset;

    if(this.numbers == "On") {
      // put a small circle at the origin (0,0) grid point
      this.origin = helm(`<div style="position:absolute;width:.5em;height:.5em;border:1px solid rgb(100,150,255);border-radius:100%;pointer-events:none;"></div>`);
      pg.canvas.wrapperEl.append(this.origin);
    }

    this.draw(options.e);

    // update the grid as the pointer moves:
    let mv = listen(pg.canvas.upperCanvasEl, "pointermove", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.draw(e);
    });
    // ...until the gesture ends: pointerup, or pointercancel if the browser
    // takes the gesture over (touch), after which there'd be no pointerup.
    let end = listen(pg.canvas.upperCanvasEl, ["pointerup", "pointercancel"], (e) => {
      let elm = pg.canvas.upperCanvasEl;
      if (elm.hasPointerCapture(e.pointerId)) elm.releasePointerCapture(e.pointerId);
      unlisten(mv, end);
    });
  }

  destructor() {
    this.origin?.remove();
    this.gridCanvas.remove();
  }

  setZoom(zoom) {
    if(this.zoom == zoom) return;
    let zoomChange = zoom / this.zoom;
    this.zoom = zoom;
    let { width, height } = this.pg.canvas;
    // For each zoom, create a new, resized gridCanvas:
    width *= zoom;
    height *= zoom;
    this.gridCanvas.remove();
    this.gridCanvas = helm(`<canvas data-tag="grid" width="${width}" height="${height}" style="position:absolute;width:${width / _pxPerEm_}em;height:${height / _pxPerEm_}em;"></canvas>`);
    this.pg.canvas.wrapperEl.insertBefore(this.gridCanvas, this.pg.canvas.upperCanvasEl);
    this.x *= zoomChange;
    this.y *= zoomChange;
    // ...the labels and origin marker are placed from these:
    this.originPosX *= zoomChange;
    this.originPosY *= zoomChange;
    this.drawGridLines();
  }

  draw(ptr) {
    // Compute drawing coordinates:
    //  this.x: leftmost vertical grid line
    //  this.labelX: label for this grid line (used only if numbers cache value is "On")
    //  ...same for y
    let box = getBox(this.gridCanvas);
    let xx = ptr.x - box.x;
    let yy = ptr.y - box.y;

    // Use offset direction determined at pointerdown based on quadrant
    let originX = xx + this.offsetX;
    let originY = yy + this.offsetY;

    // Use origin position (not cursor) for grid calculations so 0,0 is at origin
    let maxStep = this.maxStep * this.zoom;
    this.x = originX - Math.ceil(originX / maxStep) * maxStep; // leftmost vertical grid line
    this.labelX = -((originX - this.x) / maxStep); // label for leftmost vertical grid line
    this.y = originY - Math.ceil(originY / maxStep) * maxStep;
    this.labelY = -((originY - this.y) / maxStep);

    // Track cursor position for label placement (use box dimensions for accurate comparison)
    this.cursorInBottomHalf = yy > box.height / 2;
    this.cursorInRightHalf = xx > box.width / 2;
    // Store origin position for marker placement
    this.originPosX = originX;
    this.originPosY = originY;
    this.drawGridLines();
  }


  drawGridLines() {
    let canvas = this.gridCanvas;
    let { width, height } = canvas;
    let ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    let dx = this.dx * this.zoom;
    let xLabels = []; // collect labels to draw after we know originY

    for (let i = 0, x = this.x, labelX = this.labelX; x <= width; x += dx, i++) {
      let idx = i % this.patternX.length;
      let value = this.patternX[idx];
      ctx.beginPath();
      ctx.lineWidth = value;
      ctx.strokeStyle = `rgba(100,150,255,${value})`;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      if (this.numbers == "On" && idx == 0) {
        let label = Math.round(labelX++) * this.stepsPerLabel;
        xLabels.push({ label, x });
      }
    }

    let dy = this.dy * this.zoom;
    let yLabels = []; // collect labels to draw after we know originX

    for (let i = 0, y = this.y, labelY = this.labelY; y <= height; y += dy, i++) {
      let idx = i % this.patternY.length;
      let value = this.patternY[idx];
      ctx.beginPath();
      ctx.lineWidth = value;
      ctx.strokeStyle = `rgba(100,150,255,${value})`;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (this.numbers == "On" && idx == 0) {
        let label = Math.round(labelY++) * this.stepsPerLabel;
        yLabels.push({ label, y });
      }
    }

    // Draw labels at origin axes now that we have both originX and originY
    // Position labels to stay visible based on cursor position:
    // - Horizontal numbers: above origin when cursor in bottom half, below otherwise
    // - Vertical numbers: before (left) when cursor in right half, after (right) otherwise
    // Labels are clamped to stay within canvas bounds when origin is off-page
    if (this.numbers == "On") {
      ctx.fillStyle = "rgb(100,150,255)";
      // Use originPosY/X for label positioning (always set), clamped to canvas bounds
      let xLabelY = clamp(this.cursorInBottomHalf ? this.originPosY - 2 : this.originPosY + 12, 12, height - 2);
      for (let { label, x } of xLabels) {
        if (label != 0) ctx.fillText(label, x + 2, xLabelY);
      }
      for (let { label, y } of yLabels) {
        if (label != 0) {
          let textWidth = ctx.measureText(label).width;
          let labelX = clamp(this.cursorInRightHalf ? this.originPosX - textWidth - 2 : this.originPosX + 2, 2, width - textWidth - 2);
          ctx.fillText(label, labelX, y - 2);
        }
      }
    }

    if (this.origin) {
      // Position origin marker at grid 0,0 (centered)
      this.origin.style.left = this.originPosX / _pxPerEm_ - .25 + "em";
      this.origin.style.top = this.originPosY / _pxPerEm_ - .25 + "em";
    }
  }
}
