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
  
      let show = true;
      if(["text", "textbox", "image"].includes(fabricObject.type) && ["mt","mb"].includes(key)) show = false;
      if( "text" == fabricObject.type && ["ml","mr"].includes(key)) show = false;
      if(show) {
        ctx.save();
        ctx.lineWidth = 6;
        ctx.beginPath();
        let r = fabricObject.cornerSize / 2;
        ctx.arc(left, top, r, 0, 2 * Math.PI);
        if(key == "mtr") ctx.stroke(); else ctx.fill();
        ctx.restore();
      }
      else { 
        ctrl.actionHandler = null;
        ctrl.cursorStyleHandler = _voidFunc_;
      }
    }
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

    initialize: function(canvas, podiumType) {
      this.callSuper('initialize', canvas);
      this.podiumType = podiumType; 
    },

    createPath: function(pathData) {
      let path = this.callSuper('createPath', pathData);
      path.podiumType = this.podiumType; // add PodiumType to path *after* its created                     
      return path;                      
    }      
  });

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
      for (let i = 0, n = gap * lines; i < n; i += gap) {
        ctx.beginPath();
        ctx.lineWidth = width * zoom;
        ctx.lineCap = "butt";
        ctx.strokeStyle = color;
        if (style == "L-R") {
          let y = (origin.y + i) * zoom;
          ctx.moveTo(origin.x * zoom, y);
          ctx.lineTo(ptr.x * zoom, y);
        } else {  // style == "T-B"
          let x = (origin.x + i) * zoom;
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
      // Normally, draw is invoked from onMouseUp, but can also be called from the RastrumPanel
      // to re-draw the rastrum.
      let { canvas, color, gap, lines, width, bars, barWidth, origin, ptr, style } = this;
      if(this.path) this.canvas.remove(this.path); // might be "re" drawing...remove any prev path
      // interpret "Auto"  (encoded as 0) to refer to Bravura engravingDefault values (in staff space, i.e. gap)
      if (width == 0) width = .13 * gap ; // .13 and .16 are from bravura docs
      if (barWidth == 0) barWidth = .16 * gap ; 
      // Draw the staff lines
      // Note: need to subtract width/2 from left and top because
      // the fabric path interprets line width differently than
      // html canvas
      let d = "";
      let dX = Math.abs(ptr.x - origin.x) ;
      let dY = Math.abs(ptr.y - origin.y) ;
      for (let y = 0, n = gap * lines; y < n; y += gap)
        if (style == "L-R") d += `M0 ${y}h${dX}v${width}h${-dX}Z`;
        else d += `M${y} 0v${dY}h${width}v${-dY} Z`;
      let staffPath = new fabric.Path(d, {
        height: dY,
        width: dX,
        left: Math.min(origin.x, ptr.x),
        top: Math.min(origin.y, ptr.y),
        fill: color,
      });
      d = "";
      if(bars > 0) { // add bar lines
        let staffHeight = (lines - 1) * gap + width;
        if (style == "L-R") {
          let barSpan = (dX - barWidth) / bars;
          for (let i = 0, x = 0; i <= bars; i++, x += barSpan)
            d += `M${x} 0v${staffHeight}h${barWidth}v${-staffHeight}Z`; 
        } else {
          let barSpan = (dY - barWidth) / bars;
          for (let i = 0, y = 0; i <= bars; i++, y += barSpan)
            d += `M0 ${y}v${barWidth}h${staffHeight}v${-barWidth}Z} `;
        }
      }

      let barPath = new fabric.Path(d, {
        height: dY,
        width: dX,
        left: Math.min(origin.x, ptr.x),
        top: Math.min(origin.y, ptr.y),
        fill: color,
      });

      canvas.clearContext(canvas.contextTop);
      canvas.add(new fabric.Group([staffPath,barPath], {
        hasControls: false,
        podiumType: "rastrum"
      }));
     }
  });
  
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
      this.ptr = e.pointer;
      this.draw();
    },
  
    draw: function() {
      let { canvas, color, origin, ptr, style, width } = this;
      if(this.path) this.canvas.remove(this.path); // might be "re" drawing...remove any prev path
      if (style == "L-R") ptr.y = origin.y;
      else if (style == "T-B") ptr.x = origin.x;
      // else (style == "Straight")
      let dX = ptr.x - origin.x;
      let dY = ptr.y - origin.y;
      // Note: need to subtract width/2 from left and top because
      // the fabric path interprets line width differently than
      // html canvas
      this.path = new fabric.Path(`M0 0 L ${dX} ${dY}`, {
        strokeWidth: this.width,
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
      });
      canvas.clearContext(canvas.contextTop);
      canvas.fire("before:path:created", { path: this.path });
      canvas.add(this.path);
      this.canvas.setActiveObject(this.path);
    },
  });

//  addGroupControls();
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
    listen(pg.canvas.upperCanvasEl, "pointerup", (e) => {
      pg.canvas.upperCanvasEl.releasePointerCapture(e.pointerId);
      unlisten(mv);
    }, { once: true });
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
        if (label == 0) this.originX = x;
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
        if (label == 0) this.originY = y;
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
