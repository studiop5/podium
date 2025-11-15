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
import { getBox, helm, listen, unlisten } from "./common.js";
// -skip

/**
   This module defines extensions and customizations to fabricjs and its canvas
 **/


/**
Fabric.js customizations

  Note: Call initFabric() before using any fabric.js functionality
**/

function initFabric() {

  fabric.Object.NUM_FRACTION_DIGITS = 2;
  fabric.Object.prototype.transparentCorners = false;
  fabric.Object.prototype.cornerSize = 48; // Large touch target 
  fabric.Object.prototype.cornerStyle = "circle";
  fabric.Object.prototype.cornerColor = "#00f8";
  fabric.Object.prototype.controls.mtr.offsetY = -80;

  fabric.Text.prototype.lockScalingFlip = true;
  fabric.Textbox.prototype.lockScalingFlip = true;

  // Customize appearance/behavior of controls:

  fabric.ActiveSelection.prototype.controls.groupToggle = 
  fabric.Group.prototype.controls.groupToggle = new fabric.Control({
    x: 0.5,
    y: -0.5,
    offsetX: 40,
    offsetY: -70,
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
  }) ;

  let ctrls = fabric.Object.prototype.controls;
  for(let ctrl in ctrls) {
      // ctrl's are: ml mr mb mt tl tr bl br mtr. Here
      // we move controls away from the bounding box
      if(ctrl.length > 2) continue ;
      if(ctrl.includes('l')) ctrls[ctrl].offsetX = -20 ;
      else if(ctrl.includes('r')) ctrls[ctrl].offsetX = +20 ;
      if(ctrl.includes('t')) ctrls[ctrl].offsetY = -20 ;
      else if(ctrl.includes('b')) ctrls[ctrl].offsetY = +20 ;
   }


  for(let [key, ctrl] of Object.entries(fabric.Object.prototype.controls)) {
    ctrl.render = (ctx, left, top, styleOverride, fabricObject) => {

      if(key == "groupToggle") {
        // draw a lock icon with two states for converting multiple selections to/from groups
        let locked = true ;
        if (fabricObject.type == "activeSelection" && fabricObject.size() > 1)  locked = false ;
        else if(fabricObject.type != "group") return ;
        ctx.save();
        ctx.translate(left-24, top-24);
        ctx.lineWidth = 2 ;
        ctx.lineJoin ="round" ;
        ctx.strokeRect(0, 24, 26, 20) ;
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
        ctx.moveTo(13,36) ;
        ctx.lineTo(13,39) ;
        ctx.stroke() ;
        if(locked) ctx.fill() ;
        ctx.restore();
        return ;
      }
  
      let show = true ;
      if(["text", "textbox"].includes(fabricObject.type) && ["mt","mb"].includes(key)) show = false ;
      if( "text" == fabricObject.type && ["ml","mr"].includes(key)) show = false ;
      if(show) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(left, top, 8, 0, 2 * Math.PI);
        if(key == "mtr") ctx.stroke() ; else ctx.fill();
        ctx.restore();
      }
      else { 
        ctrl.actionHandler = null ;
        ctrl.cursorStyleHandler = _voidFunc_ ;
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
    render: (ctx, left, top) => ctx.fillRect(left - 8, top - 8, 16, 16),
  });

  fabric.Textbox.prototype.controls.mr = new fabric.Control({
    x: 0.5,
    y: 0,
    offsetX: 20,
    actionHandler: fabric.controlsUtils.changeWidth,
    cursorStyleHandler: () => 'ew-resize',
    render: (ctx, left, top) => ctx.fillRect(left - 8, top - 8, 16, 16),
  }) ;

  fabric.RastrumBrush = fabric.util.createClass(fabric.BaseBrush, {
    type: "RastrumBrush",
  
    initialize: function (canvas, options, color) {
      this.callSuper('initialize', options) ;
      this.canvas = canvas;
      Object.assign(this, options);
      this.color = color;
      this.zoom = canvas.getZoom(); // rem grd...tmp exp
    },
  
    onMouseDown: function (ptr) {
      this.origin = { x: ptr.x, y: ptr.y };
    },
  
    onMouseMove: function (ptr) {
      this.ptr = ptr ;
      let { canvas, color, gap, lines, origin, style, width, zoom } = this;
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
      this.draw() ;
    },
  
    draw: function () {
      // Normally, draw is invoked from onMouseUp, but can also be called from the RastrumPanel
      // to re-draw the rastrum.
      let { canvas, color, gap, lines, origin, ptr, style, width, bars } = this;
      if(this.path) this.canvas.remove(this.path) ; // might be "re" drawing...remove any prev path
      let d = "";
      let dX = ptr.x - origin.x;
      let dY = ptr.y - origin.y;
      for (let i = 0, n = gap * lines; i < n; i += gap)
        if (style == "L-R") d += `M0 ${i} L${dX} ${i}`;
        else d += `M${i} 0 L${i} ${dY} `;
      if (bars > 0) {
        let staffHeight = (lines - 1) * gap ;
        if (style == "L-R") {
          let barWidth = dX / bars;
          for (let i = 0, x = 0 ; i <= bars; i++, x += barWidth) d += `M${x} ${-width/2} v${staffHeight + width} `;
        } else {
          let barWidth = dY / bars;
          for (let i = 0, y = 0; i <= bars; i++, y += barWidth) d += `M0  ${y}h${staffHeight} `;
        }
      }
      // Note: need to subtract width/2 from left and top because
      // the fabric path interprets line width differently than
      // html canvas
      this.path = new fabric.Path(d, {
        height: dY,
        width: dX,
        left: Math.min(origin.x, ptr.x) - width / 2,
        top: Math.min(origin.y, ptr.y) - width / 2,
        fill: false,
        stroke: color,
        strokeLineCap: "butt",
        strokeWidth: width,
      });
      canvas.clearContext(canvas.contextTop);
      canvas.fire("before:path:created", { path: this.path });
      canvas.add(this.path);
    }
  });
  
  // LineBrush's lines are restricted to stright lines
  fabric.LineBrush = fabric.util.createClass(fabric.RastrumBrush, {
    type: "LineBrush",
  
    initialize: function (canvas, options, color) {
      this.callSuper("initialize", canvas, options, color);
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
      this.draw() ;
    },
  
    draw: function() {
      let { canvas, color, origin, ptr, style, width } = this;
      if(this.path) this.canvas.remove(this.path) ; // might be "re" drawing...remove any prev path
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
        podiumType: "podPath", // used by PencilPanel and PenPanel to identify 
      });
      canvas.clearContext(canvas.contextTop);
      canvas.fire("before:path:created", { path: this.path });
      canvas.add(this.path);
      this.canvas.setActiveObject(this.path) ;
    },
  });

//  addGroupControls() ;
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
      [1,.35,.5,.35,.75,.35,.5,.35]] ;


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
    this.maxStep = this.units == "Inch" ? 72 : (72 / 2.54) * 4 ;
    // grid lines are offset from each other by dx,dy pixels:
    let maxStep = this.maxStep ;

    this.dx = maxStep / Math.pow(2, this.xStep);
    this.dy = maxStep / Math.pow(2, this.yStep);

    // the cell.cache vars xStep and yStep determine the grid line patterns:
    this.patternX = this.patterns[this.xStep] ;
    this.patternY = this.patterns[this.yStep] ;

    // some grid lines are labelled: either every successive Inch,
    // or every successive 4 cm.
    this.stepsPerLabel = this.units == "Inch" ? 1 : 4 ;

    this.draw(options.e);

    if(this.numbers == "On") {
      // put a small circle at the origin (0,0) grid point
      this.origin = helm(`<div style="position:absolute;width:.5em;height:.5em;border:1px solid black;border-radius:100%;left:${this.originX/_pxPerEm_ - .3}em;top:${this.originY/_pxPerEm_ - .3}em;"></div>`);
      pg.canvas.wrapperEl.append(this.origin) ;
    }

    // update the grid as the pointer moves:
    let mv = listen(pg.canvas.upperCanvasEl, "pointermove", (e) => {
      e.stopPropagation();
      this.draw(e);
    });
    listen(pg.canvas.upperCanvasEl, "pointerup", () => unlisten(mv), { once: true });
  }

  destructor() {
    this.origin?.remove() ;
    this.gridCanvas.remove();
  }

  setZoom(zoom) {
    if(this.zoom == zoom) return ;
    let zoomChange = zoom / this.zoom ;
    this.zoom = zoom;
    let { width, height } = this.pg.canvas;
    // For each zoom, create a new, resized gridCanvas:
    width *= zoom;
    height *= zoom;
    this.gridCanvas.remove() ;
    this.gridCanvas = helm(`<canvas data-tag="grid" width="${width}" height="${height}" style="position:absolute;width:${width / _pxPerEm_}em;height:${height / _pxPerEm_}em;"></canvas>`);
    this.pg.canvas.wrapperEl.insertBefore(this.gridCanvas, this.pg.canvas.upperCanvasEl);
    this.x *= zoomChange ;
    this.y *= zoomChange ;
    this.drawGridLines() ;
  }

  draw(ptr) {
    // Compute drawing coordinates:
    //  this.x: leftmost vertical grid line
    //  this.labelX: label for this grid line (used only if numbers cache value is "On")
    //  ...same for y
    let box = getBox(this.gridCanvas) ;
    let xx = ptr.x - box.x ;
    let maxStep = this.maxStep * this.zoom ;
    this.x = xx - Math.ceil(xx / maxStep) * maxStep  ; // leftmost vertical grid line 
    this.labelX = -((xx - this.x) / maxStep) + 1 ; // label for leftmost vertical grid line
    let yy = ptr.y - box.y ;
    this.y = yy - Math.ceil(yy / maxStep) * maxStep ; 
    this.labelY = -((yy - this.y) / maxStep) + 1 ;
    this.drawGridLines() ;
  }


  drawGridLines() {
    let canvas = this.gridCanvas;
    let { width, height } = canvas;
    let ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    let dx = this.dx * this.zoom ;
   
    for (let i = 0, x = this.x, labelX = this.labelX ; x <= width; x += dx, i++) {
      let idx = i % this.patternX.length ;
      let value = this.patternX[idx] ;
      ctx.beginPath();
      ctx.lineWidth = value ;
      ctx.strokeStyle = `rgba(127,127,127,${value})`;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      if (this.numbers == "On" && idx == 0) {
        // label this line
        let label = Math.round(labelX++) * this.stepsPerLabel ;
        if(label == 0) this.originX = x ;
        ctx.strokeText(label, x, 10);
      }
    }

    let dy = this.dy * this.zoom ;

    for (let i = 0, y = this.y, labelY = this.labelY; y <= height; y += dy, i++) {
      let idx = i % this.patternY.length ;
      let value = this.patternY[idx] ;
      ctx.beginPath();
      ctx.lineWidth = value ;
      ctx.strokeStyle = `rgba(127,127,127,${value})`;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      if (this.numbers == "On" && idx == 0) {
        let label = Math.round(labelY++) * this.stepsPerLabel ;
        if(label == 0) this.originY = y ;
        ctx.strokeText(label, 10, y);
      }
    }
    if(this.origin) {
      this.origin.style.left = this.originX/_pxPerEm_ -.3 + "em" ;
      this.origin.style.top = this.originY/_pxPerEm_ - .3 + "em" ;
    }
  }
}



/*
function addGroupControls() {
  // Control control for ActiveSelection and Group

  function renderLockIcon(ctx, left, top, locked) {
    ctx.save();
    ctx.translate(left-24, top-24);
    ctx.lineWidth = 2 ;
    ctx.lineJoin ="round" ;
    ctx.strokeRect(0, 24, 26, 20) ;
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
    ctx.moveTo(13,36) ;
    ctx.lineTo(13,39) ;
    ctx.stroke() ;
    if(locked) ctx.fill() ;
    ctx.restore();
  }

*/

/*


  let groupToggleControl = new fabric.Control({
    x: 0.5,
    y: -0.5,
    offsetX: 40,
    offsetY: -40,
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

    render: function(ctx, left, top, styleOverride, fabricObject) {
      if (fabricObject.type == "group") renderLockIcon(ctx, left, top, true);
      else if (fabricObject.type == "activeSelection" && fabricObject.size() > 1) 
        renderLockIcon(ctx, left, top, false);
    }
  }) ;
  fabric.ActiveSelection.prototype.controls.groupToggle = groupToggleControl;
  fabric.Group.prototype.controls.groupToggle = groupToggleControl;
}
*/

/*
  function configureTextControls() {
    // For Textbox objects - allow width control for line breaks, prevent height warping
    fabric.Textbox.prototype.setControlsVisibility({
      tl: true,   // keep corner controls (uniform scaling)
      tr: true,
      bl: true,
      br: true,
      mt: false,  // remove top/bottom middle controls (prevent height warping)
      mb: false,
      ml: true,   // keep left/right middle controls (for text width/line breaks)
      mr: true,
      mtr: true   // keep rotation
    });

    // For Text objects (symbols) - make completely non-editable
    fabric.Text.prototype.setControlsVisibility({
      tl: false,  // remove all controls
      tr: false,
      bl: false,
      br: false,
      mt: false,
      mb: false,
      ml: false,
      mr: false,
      mtr: false  // no rotation either
    });

    // Additional restrictions for symbols
    fabric.Text.prototype.selectable = false;
    fabric.Text.prototype.evented = false;
    fabric.Text.prototype.editable = false;

    // Force uniform scaling for textboxes only
    fabric.Textbox.prototype.lockUniScaling = true;
  }
*/

