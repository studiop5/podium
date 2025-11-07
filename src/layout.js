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

import { animate, clamp, clearChildren, css, cssIndex, dataIndex, delay, dialog, getBox,   helm, listen, mvmt, pnToDiv, ptrMsg, rotatePoint, Schedule, unlisten,} from "./common.js";
import { panels } from "./panel.js";
import { Pg, Score } from "./score.js";
export { Layout, BookLayout, TableLayout, ScrollLayout };
// -skip

let randomColor;
{
  let hexDigits = "0123456789ABCDEF";
  randomColor = () => {
    // Generate random 3-hex color string with fixed alpha used for styling bookmarks.
    let color = "#";
    for (let i = 0; i < 2; i++) color += hexDigits[Math.floor(Math.random() * 16)];
    return color + "0";
  };
}

// The classes Pager and ScrollLayout are used with both horizontal
// and vertical orientations.  We save a lot of code duplication
// by referring to certain properties through constants that
// are defined differently for a given orientation: NORMAL_PROPS
// for horizontal, and ORTH_PROPS for vertical:
let NORMAL_PROPS = {
  WIDTH: "width",
  HEIGHT: "height",
  LEFT: "left",
  RIGHT: "right",
  TOP: "top",
  BOTTOM: "bottom",
  BORDERTOP: "borderTop",
  BORDERBOTTOM: "borderBottom",
  MINWIDTH: "minWidth",
  MINHEIGHT: "minHeight",
  MAXWIDTH: "maxWidth",
  MAXHEIGHT: "maxHeight",
  OFFSETLEFT: "offsetLeft",
  OFFSETTOP: "offsetTop",
  OFFSETWIDTH: "offsetWidth",
  OFFSETHEIGHT: "offsetHeight",
  CLIENTX: "clientX",
  CLIENTY: "clientY",
  INNERWIDTH: "innerWidth",
  INNERHEIGHT: "innerHeight",
  X: "x",
  Y: "y",
};

let ORTHO_PROPS = {
  WIDTH: "height",
  HEIGHT: "width",
  LEFT: "top",
  RIGHT: "bottom",
  TOP: "left",
  BOTTOM: "right",
  BORDERTOP: "borderLeft",
  BORDERBOTTOM: "borderRight",
  MINWIDTH: "minHeight",
  MINHEIGHT: "minWidth",
  MAXWIDTH: "maxHeight",
  MAXHEIGHT: "maxWidth",
  OFFSETLEFT: "offsetTop",
  OFFSETTOP: "offsetLeft",
  OFFSETWIDTH: "offsetHeight",
  OFFSETHEIGHT: "offsetWidth",
  CLIENTX: "clientY",
  CLIENTY: "clientX",
  INNERWIDTH: "innerHeight",
  INNERHEIGHT: "innerWidth",
  X: "y",
  Y: "x",
};

// Following is a simplified equivalent of common::pxToEm used for increased
// efficiency when we know that the object's style.fontSize is 1em:
let toEm = (px) => px / _pxPerEm_ + "em";

/**
class Layout
  Layouts manage the layout and display of Scores.

  Class Layout itself is the common superclass for all layouts,
  providing logic for page add, copy, paste, and merge, plus custom
  events fired whenever ui interaction on a layout subclass causes
  the pn to change.

  Podium only supports 1 layout at a time, and the current layout
  if accessed throught the static Layout.activeLayout.
**/

class Layout {
  static borderSize = 0.1; // in em's
  static borderColor =  "#8B4513";
  static margin = 20 / _dvPxRt_; // default margin between layout and viewport
  static activeLayout = null;

  // startElm and endElm are displayed Layout.pgAlert to show a div whenever the user
  // attempts to navigate to a page that's before the start or past the end of a score.
  static startElm = document.createElement("canvas");
  static endElm = document.createElement("canvas");
  static {
    document.fonts.load("30px Bravura").then(() => {
      for (let elm of [Layout.startElm, Layout.endElm]) {
        elm.width = elm.height = 45;
        elm.style = "position:absolute;z-index:1000;";
        let ctx = elm.getContext("2d");
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)"; // Shadow color
        ctx.shadowOffsetX = 2; // Horizontal offset
        ctx.shadowOffsetY = 2; // Vertical offset
        ctx.shadowBlur = 4; // Blur amount
        ctx.font = "30px Bravura";
        ctx.fillText("\ue01a", 0, 32);
        if (elm === Layout.startElm) ctx.fillText("\ue033", 0, 32);
        else {
          // assume Layout.endElm
          ctx.fillText("\ue032", 16, 32);
          ctx.font = "italic 12px Bravura";
          ctx.fillText("Fine", 2, 42);
        }
        // This seems like it should be bigger:
        elm.style.transform = "scale(2.5)";
      }
    });
  }

  // Display an alert when user tries to page past end or before
  // beginning of score using a pointer event.
  // @e is the pointer event
  // @elm is on of Layout.startElm or Layout.endElm
  static pgAlert(e, elm) {
    // no-op if div already onscreen:
    if (elm.isConnected) return;
    let setPos = (e) => {
      Object.assign(elm.style, {
        left: e.clientX + "px",
        top: (e.clientY > 100 ? e.clientY - 100 : e.clientY + 150) + "px",
      });
    };
    setPos(e);
    _body_.append(elm);
    let mv = listen(_body_, "pointermove", (emv) => setPos(emv));
    listen(_body_, "pointerup",() => {
      unlisten(mv); elm.remove();},
      { once: true });
   }

  static async open(cell) {
    if (!Score.activeScore) return;
    _shade_.show("Formatting");
    let score = Score.activeScore; // assumes there is an activeScore
    if (Layout.activeLayout) Layout.activeLayout.destructor();
    if (cell.key == "book") await new BookLayout(score, cell).build();
    else if (cell.key == "horizontal" || cell.key == "vertical") await new ScrollLayout(score, cell).build();
    else if (cell.key == "table") await new TableLayout(score, cell).build();
    _menu_.rings.layout.stash.active = cell.key;
    _shade_.hide();
  }

  pnStash = _menu_.rings.page.cells.numbers.stash;
  margin = 12; // in px: initial margin between layout and viewport

  constructor(score, cell) {
    Layout.activeLayout = this;
    this.score = score;
    this.cell = cell;
    this.pnListener = listen(_body_, ["PnChanged"], (e) => {
      if (e.detail instanceof Layout) return;
      // Ignore event if it comes from a Pager whose direction is "right" (or "bottom").  Pagers
      // come in pairs (left,right or top,bottom). Both will fire this event when either changes,
      // but we only want to react once.
      if (e.detail instanceof Pager && ["right", "bottom"].includes(e.detail.direction)) return;
      this.pgGoTo(this.pnStash.pn);
    });
    delay(1, () => (this.elm.dataset.tag = this.constructor.name)); // run after subclass constructor
  }

  destructor() {
    // Called when layout is about to be replaced by another. Subclasses should call super().
    // We need to remember user's pz changes, if any:
    if (this.elm.classList.contains("pz-set")) {
      let styles = getComputedStyle(this.elm);
      this.cell.pz = { left: styles.left, top: styles.top, fontSize: (parseFloat(styles.fontSize) / _pxPerEm_) + "em" };
    }
    for(let pg of this.score.pgs) pg.deflate() ; 
    unlisten(this.pnListener);
    this.elm.remove();
  }

  build() {
    // Subclasses override: (re) build the ui: called on initial
    // display, and any time the layout needs to be updated, due to screen size
    // change, re-orientation, or request to jump to specific page.
  }

  async onDown(e) {
    // Subclasses should call this at the beginning of their own onDown function:
    // the convention for the mouseDown || touchDown || pointerDown event handler.
    // If this method returns true, they should not continue processing the event:
    // instead, it will be processed by this method.
    // @param e event, the subclass event handler event argument
    // @return boolean, true if this method handles this event and the subclass
    //   should not process it further.
    if (e.ctrlKey || !e.isPrimary) return true;
    // When there is an active cell in the ink ring, then we're editing a page,
    // so don't allow the layout code to run:
    if (_menu_.activeRing?.key == "ink" && _menu_.activeRing?.activeCell) return true;

    if (_menu_.activeRing?.key == "page") { // Execute page ring's active cell action

      let pageCell = _menu_.activeRing.activeCell;
      if (!pageCell) return false;
      let pageKey = pageCell.key;
      let layoutKey = _menu_.rings.layout.activeCell.key;
      let pasteCell = _menu_.rings.page.cells.paste;
      let pg, pn;
      let score = this.score;
      if (score.pgs.length == 0) pn = 1;
      else {
        // The add/paste  ops insert before page when event is in left (or top) half of e.target,
        // and after page when clicked in right (or bottom) half. We use left/right for
        // for most layouts, but VerticalLayout uses top/bottom. 
        pg = e.target.pg || e.target.closest(".canvas-container")?.pg;
        if (!pg) return true;
        pn = score.pnOf(pg);
        if (pageKey == "add" || pageKey == "paste") {
          let box = getBox(e.target);
          if (layoutKey == "vertical" && e.clientY - box.top > box.height / 2) pn++;
          else if (e.clientX - box.x > box.width / 2) pn++;
        }
      }

      let animateToCell = async (pg0, cell) => {
        // animate the given delete/copy page by simulating moving the pasteCell.pg
        // to the given menu cell
        let elm ;
        if(layoutKey == "table") {
           elm = pg0.thumbElm ;
           elm.style.cssText = pg.thumbElm.style.cssText ;
           pg.thumbElm.parentElement.append(elm) ;
        }
        else {
          elm = pg0.elm ;
          elm.style.cssText = pg.elm.style.cssText ;
           // need to resize fabric's components to match 
           pg0.canvas.lowerCanvasEl.style.width = pg0.canvas.lowerCanvasEl.style.width ;
           pg0.canvas.upperCanvasEl.style.width = pg0.canvas.upperCanvasEl.style.width ;
           pg0.canvas.lowerCanvasEl.style.height = pg0.canvas.lowerCanvasEl.style.height ;
           pg0.canvas.upperCanvasEl.style.height = pg0.canvas.upperCanvasEl.style.height ;
           if(pg0.mozCanvas) {
             pg0.mozCanvas.style.height = elm.style.height ;
             pg0.mozCanvas.style.width = elm.style.width ;
           }
           pg.elm.parentElement.append(elm) ;
        }    
        let srcBox = getBox(elm);
        let dstBox = getBox(dataIndex("tag", cell.elm).cellIcon);
        let cssText = elm.style.cssText ;
        _body_.append(elm) ;
        animate(elm, 
         { left: srcBox.x + "px", top: srcBox.y + "px", zIndex:100 },
         { left: dstBox.x + dstBox.width / 2 + "px", top: dstBox.y +dstBox.height / 2 +  "px", fontSize: 0 },
          `all ${_gs_}s`,
           () => {
             elm.remove() ;
             elm.style.cssText = cssText ;
        });
      };

      _menu_.autoOff.run() ;

      switch (pageKey) {

        // copy and paste to/from _podPb_:

        case "copy": { 
          _menu_.activateCell(null) ; // copy can be slow, deactivate until done
          animateToCell(await pg.clone(true), _menu_.rings.page.cells.paste) ; // clone only used for animation
          await _podPb_.pgCopy(pn) ;
          _menu_.activateCell(_menu_.rings.page.cells.copy) ;
          break ;
        }

        case "paste": { 
          _shade_.show("Pasting...") ;
          _menu_.activateCell(null) ; // paste can be slow, deactivate until done
          await _podPb_.pgPaste(pn) ;
          _menu_.activateCell(_menu_.rings.page.cells.paste) ;
          _shade_.hide() ;
          break;
        }

        // add, delete to/from current score
        case "add": {
          // here we "fabric"ate a new pg and add it to the score
          let stash = _menu_.rings.page.cells.add.stash;
          let alpha = parseInt(stash.alpha * 255).toString(16);
          while (alpha.length < 2) alpha = "0" + alpha;
          let pg = new Pg(score, score.maxWidth, score.maxHeight, null, null, stash.fillRgb + alpha);
          pg.inflate();
          await score.pgAdd(pg, pn);
          this.pnStash.pn = 0; // No active pg for build:
          await this.build(false);
          await this.pgGoTo(pn);
          break;
        }

        case "delete": {
          animateToCell(pg, _menu_.rings.page.cells.delete) ;
          score.pgCut(pn) ;
          this.pnStash.pn = 0; // No active pg for build:
          await this.build(false);
          await this.pgGoTo(Math.max(1, pn-1));
          break ;
        }

        case "merge": {
          dialog(`Confirm: Merge all annotations on this page?<br>(cannot be undone)`, 
            { Merge: { svg: "Merge" }, Cancel: { svg: "Cancel" } },
            (e, prop, tag, args) => {
              if(tag == "Merge") pg.mergeObjects();
              args.close() ;
            });
          break;
        }
      }

      if (score.pgs.length == 1) {
        // Don't allow cut/delete when only 1 pg left
        _menu_.activateCell(null);
        _menu_.enableCells("page/delete", false);
      }

      return true;
    }
    return false;
  }

  async pgOpen(how, unused) {
    // Subclasses override with logic to open page, where @how is one
    // of "next","prev","first","last".  If pnStashbookMarks is true, then
    // subclass should just call super, because bookMarks processing
    // is identical for all layouts.
   let bookmarks = Object.keys(this.pnStash.bookmarks);
    if (bookmarks.length == 0) return;
    let pn = bookmarks[0];
    if (bookmarks.length > 1) {
      let current = this.pnStash.pn;
      switch (how) {
        case "next":
          bookmarks.sort((a, b) => a - b);
          pn = bookmarks.find((x) => x > current);
          if (!pn) pn = bookmarks[0]; // wrap
          break;
        case "prev":
          bookmarks.sort((b, a) => a - b);
          pn = bookmarks.find((x) => x < current);
          if (!pn) pn = bookmarks[0]; // wrap
          break;
        case "first":
          break;
        case "last":
          pn = bookmarks.pop();
          break;
      }
    }
    this.pnPost(await this.pgGoTo(pn));
  }

  pgPad(pg) {
    // Individual pages can be smaller than their scores largest page, but
    // layouts require all pages to be the same size. When a page as shorter and/or narrower
    // than the score's max height/width, add a border to pad it out.
    if(pg.deferred) // reschedule the padding...
      return delay(5, () => this.pgPad(pg)) ;
    if (!pg.inflated || (pg.width == this.score.maxWidth && pg.height == this.score.maxHeight)) return;
    let horz = ((this.score.maxHeight - pg.height * pg.stretch) * pg.zoom) / 2;
    let vert = ((this.score.maxWidth - pg.width * pg.stretch) * pg.zoom) / 2;
    Object.assign(pg.elm.style, {
      borderWidth: toEm(horz) + " " + toEm(vert),
      borderStyle: "solid",
      borderColor: Pg.paddingColor,
    });
  }

  pgGoTo(pn) {
    // Subclasses override with logic to display given page number
    return pn;
  }

  pnPost(pn, force = false) {
    // Subclasses call this whenever the layout changes the page number.
    // It will stash the pn and fire a PnChanged event.
    // @param pn 1-based
    // @param force post pn even if it hasn't changed
    if (this.pnStash.pn != pn || force) {
      this.pnStash.pn = pn;
      _body_.dispatchEvent(new CustomEvent("PnChanged", { detail: this }));
    }
  }

  centerLT(otherStyles = {}) {
    // Compute {left,top} style coords that, when applied to this.elm, will center this.elm's firstChild,
    // *but* enforce that it's top left is at least Layout.margin px from viewport's top left corner.
    // @param otherStyles object defining other styles to include in the return
    let box = getBox(this.elm.firstElementChild);
    let winMid = { x: innerWidth / 2, y: innerHeight / 2 };
    return Object.assign(
      { left: (winMid.x - box.width / 2 < Layout.margin ? box.width / 2 + Layout.margin : winMid.x) + "px",
        top: (winMid.y - box.height / 2 < Layout.margin ? box.height / 2 + Layout.margin : winMid.y) + "px" },
      otherStyles);
  }

  toCenter() {
    // Center the Layout, but ensure that its top left corner
    // is at least Layout.margin pixels away from the viewport's
    // top left corner
    let elm = this.elm;
    let layout = elm.firstElementChild;
    let icon = dataIndex("tag", this.cell.elm).cellIcon;
    let iconBox = getBox(icon);
    let layoutBox = getBox(layout);
    animate(elm, 
     { left: iconBox.x + "px",
       top: iconBox.y + "px",
       fontSize: 0,
     },
     { left: layoutBox.width > innerWidth + Layout.margin * 2 ? Layout.margin + "px" : innerWidth / 2 + "px",
       top: layoutBox.height > innerWidth + Layout.margin * 2 ? Layout.margin + "px" : innerHeight / 2 + "px",
       fontSize:elm.style.fontSize,
     },
     `left, stop, font-size ${_gs_}s`) ;
  }
}

/**
class BookLayout
    Imitate a physical book, with animated page flips.
**/

class BookLayout extends Layout {
  static borderColor =  "#8B4513";
  static bindingColor =  "#8B4513";
  static css = css(
    "BookLayout",
    `
          .BookLayout {
            touch-action:none;
            position:absolute;
            box-shadow: .25em .25em 1.5em #888;
            border-radius: var(--borderRadius);
            border: ${Layout.borderSize}em solid ${Layout.borderColor};
            background-image: var(--layoutTexture) ;
            box-sizing: border-box ;
            font-size: 1em ;
          }  
          .BookLayout__spine {
            position:absolute;
            left:50%;
            width: 0 ;
            height:0;
            z-index: 1 ;
           }
          .BookLayout__binding {
             height:100%; 
             width:1.8em;
             left:calc(50% - .9em);
             top:0%;
             background: ${BookLayout.bindingColor};
             position:absolute;
             pointer-events: none ;
          }
         .BookLayout__slot {
            position:absolute;
            overflow: hidden ;
          }
          .BookLayout__shadow {
            position:absolute ;
            height: 125% ; /* extra is clipped off */
            pointer-events: none ;
          }
       `
  );

  /*
     Ascii art of BookLayout's dom hierachy. Optional left/right pagers not shown.


                                          elm (pz)
                                            |
                                          book
                                          /  \
                                  binding   spine 
                                           /     \     
                                          /       shadow  
                              _________________________________
                           /     /      /      \      \      \ 
        page "slots":     A     B       C      D      E      F 
                          |     |       |      |      |      |   
    dynamically added:  pg.elm pg.elm pg.elm pg.elm pg.elm pg.elm

  */

  elm = helm(`
    <div class="pz">
      <div data-tag="book" class="BookLayout">
        <div data-tag="binding" class="BookLayout__binding"></div>
        <div data-tag="spine" class="BookLayout__spine">
          <div data-slot="A" class="BookLayout__slot"></div>
          <div data-slot="B" class="BookLayout__slot"></div>
          <div data-slot="C" class="BookLayout__slot"></div>
          <div data-slot="D" class="BookLayout__slot"></div>
          <div data-slot="E" class="BookLayout__slot"></div>
          <div data-slot="F" class="BookLayout__slot"></div>
          <div data-tag="shadow" class="BookLayout__shadow"></div>
        </div>
      </div>
     </div>
  `);

  // pn0 is the 1-based page number of Page elm to mount on slot[0] slot.
  // All page numbering is relative to this, so slot[1].elm's page number
  // is slot[0]'s + 1, etc.  pn0 can be 0 or negative: this just means
  // there is no physical page there.  For example,   when open at first
  // page (no page on left) or last page (no page on right).  When a
  // book is open at its first page, pn0 will be -2, and  the first
  // slot that has a child Page elm will be slot[3].
  pn0 = -2;
  inOp = false;
  pgFlipAnimator = new Schedule();

  constructor(score, cell) {
    super(score, cell);
    Object.assign(this, dataIndex("tag", this.elm));
    this.elm.cell = cell;
    _body_.append(this.elm);
    this.pointerListener = listen(this.elm, "pointerdown", this.onDown.bind(this));

    // The slot elements are referred to by array indexing:
    // slot 2 is always the facing page on the left, while
    // slot 3 is always the facing page on the right. When
    // a page flips, we circularly rotate the slot divs
    // by assigning this.slot to one of the this.slots members.
    let s = {};
    Object.assign(s, dataIndex("slot", this.book));
    this.slotArrays = [
      [s.A, s.B, s.C, s.D, s.E, s.F], // unshifted
      [s.C, s.D, s.E, s.F, s.A, s.B], // left shifted by 2
      [s.E, s.F, s.A, s.B, s.C, s.D], // right shifted by 2
    ];
    this.slotArraysIndex = 0;
    this.slots = this.slotArrays[this.slotArraysIndex];

    // Create left/right pager instances:
    this.pagerLeft = new Pager("left", (stash, adjusting, cursor) => {
      let pn = stash.pn;
      // left page number must always be even, except when adjusting
      if (!adjusting && pn == 1) return (cursor.textContent = "\u2219"); // no pg 1 on left side
      else if (!adjusting && pn & 1) pn--;
      return pnToDiv(pn, cursor);
    });
    this.book.append(this.pagerLeft.elm);
    this.pagerRight = new Pager("right", (stash, adjusting, cursor) => {
      let pn = stash.pn;
      let pgCount = this.score.pgs.length;
      // right page number must always be odd, except when adjusting
      pn = Math.min(pn, pgCount);
      if (!adjusting && !(pn & 1)) pn++;
      if (!adjusting && pn > pgCount) return (cursor.textContent = "\u2219"); // no pg on right side, so no pn either
      return pnToDiv(pn, cursor);
    });
    this.pagerLeft.elm.style.left = this.pagerRight.elm.style.right = 0 ;
  }

  destructor() {
    super.destructor();
    this.pagerLeft?.destructor();
    this.pagerRight?.destructor();
    unlisten(this.pointerListener);
  }

  async build(animated=true) {
    Object.assign(this, this.cell.stash);
    this.pn0 = -2;
    let { fit, score } = this;
    fit = fit.toLowerCase() ;

    // Layout scroll g((eo)metry) in units of css pixels
    let g = this.cell.geo = (this.cell.geo || {});
    // top/bottom gap and left/right gap, for a border-radius of .8em
    g.tbGap = g.lrGap = .8 * _pxPerEm_ ;
    g.pagerWidth = 0 ;

    if(this.pnShow == "On") {
       // Compensate for width of pager, and remove  gap on left and right
      g.pagerWidth = Pager.width ;
      g.lrGap = 0 ;
    }
    g.pgCount = this.score.pgs.length;

    if (fit == "none") {
      g.pgWidth = score.maxWidth;
      g.pgHeight = score.maxHeight;
      g.bookWidth = g.lrGap + g.pagerWidth + g.pgWidth + g.pgWidth + g.pagerWidth + g.lrGap;
      g.bookHeight = g.tbGap + g.pgHeight + g.tbGap;
    } 

    if (fit == "auto" || fit == "width") {
      g.bookWidth = innerWidth - Layout.margin - Layout.margin;
      g.pgWidth = (g.bookWidth - g.pagerWidth - g.lrGap - g.lrGap - g.pagerWidth) / 2;
      g.pgHeight = Math.floor(g.pgWidth * (score.maxHeight / score.maxWidth));
      g.bookHeight = g.tbGap + g.pgHeight + g.tbGap;

      if(fit == "auto") {
        // Check if layout will fit entirely within window. If not, recalculate with fit = HEIGHT ;
        fit = "width" ; // assume width
        // if either dimension doesn't fit window, change fit to HEIGHT ;
        let layoutWidth = Math.round(Layout.margin * 2 + (g.pgWidth + g.lrGap) * 2 + g.pagerWidth * 2) ;
        if(layoutWidth > innerWidth)
          fit = "height" ;
        else {
          let layoutHeight = Math.round(Layout.margin * 2 + g.pgHeight + g.tbGap * 2) ;
          if(layoutHeight > innerHeight) fit = "height" ;
        } 
      }
    }

    if (fit == "height") {
      g.bookHeight = innerHeight - Layout.margin - Layout.margin;
      g.pgHeight = g.bookHeight - g.tbGap - g.tbGap;
      g.pgWidth = Math.floor(g.pgHeight * (score.maxWidth / score.maxHeight));
      g.bookWidth = g.lrGap + g.pagerWidth + g.pgWidth + g.pgWidth + g.pagerWidth + g.lrGap ;
    }
    g.zoom = g.pgWidth / score.maxWidth;

    // this.elm must have its fontsize *style* set in em's, initially 1, but 
    // can be changed by user pan/zoom
    this.elm.style.fontSize = "1em" ;
       
    //
    // Use g(eo(metry)) to set size of all elements in em's
    //

    // book
    Object.assign(this.book.style, {
      height: toEm(g.bookHeight),
      // Note that book's width is set by adding pagerWidth in px, then subtracting pagerWidth in em's.
      // Initially, they are equal, so contribute nothing, but if/when the book is resized through em change,
      // their difference will account for delta between the pagers, which don't scale, and
      // the book itself, which does.
      width: `calc(${toEm(g.bookWidth)} + ${g.pagerWidth * 2}px - ${toEm(g.pagerWidth * 2)})`,
    });

    // spine...slots attach here.
    this.spine.style.top = toEm(g.tbGap);

    // shadow...creates shadow effect across the flipping page
    g.shadowWidth = g.pgWidth / _pxPerEm_;
    this.shadow.style.width = toEm(g.shadowWidth);
    this.shadow.remove(); // initially not visible

    // slots
    for (let slot of this.slots) {
      slot.style.width = toEm(g.pgWidth);
      slot.style.height = toEm(g.pgHeight);
    }
    this.layoutSlots();

    // pagers
    if(this.pnShow == "On") {
      this.book.append(this.pagerLeft.elm);
      this.book.append(this.pagerRight.elm);
    } else {
      this.pagerLeft.elm.remove();
      this.pagerRight.elm.remove();
    } ;

    if(!animated) return ;
    this.pgGoTo(this.pnStash.pn);

    // 
    // set layout's screen position 
    //

    let iconBox = getBox(dataIndex("tag", this.cell.elm).cellIcon) ;

    if(this.cell.pz)  // custom user-set size/position
      animate(this.elm, { left:iconBox.x + "px", top:iconBox.top + "px", fontSize: 0}, this.cell.pz, `left, top, font-size ${_gs_}s`) ;
    else animate(this.elm, 
       {left:iconBox.x + "px", top:iconBox.top + "px", fontSize: 0},
       this.centerLT({ fontSize: "1em"}),
      `left, top, font-size ${_gs_}s`) ;
  }

  async onDown(e) {
    if (this.inOp && this.closeFunc) {
      // This block runs when a pointer event is received while the pgFlipAnimator is
      // running from previous page flip, i.e. user is turning pages faster than they
      // are flipping closed.
      this.pgFlipAnimator.cancel();
      await this.closeFunc();
      this.closeFunc = null;
      return this.onDown({
        isPrimary: true,
        target: document.elementFromPoint(e.clientX, e.clientY),
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: e.pointerId,
      });
    }

    if (await super.onDown(e)) return;

    // if empty slot or pager, ignore
    if (e.target.dataset.slot) return; // empty slot
    if (e.target.closest(".Pager")) return;
    let { pgWidth, pgHeight } = this.cell.geo;
    let advancing;
    // When target is slot[3] (right side), we're advancing toward end of book
    // In this case, if slot[4] has no children, there's no page to advance  to,
    // so just return. Its as if last page was "glued" to the book.
    // When target is slot[2] (left side), we're flipping toward beginning.
    let slot = e.target.closest(".BookLayout__slot");
    if (slot === this.slots[3] && this.slots[4].children.length > 0) advancing = true;
    else if (slot === this.slots[2]) advancing = false;
    else return Layout.pgAlert(e, Layout.endElm);
    this.inOp = true;
    this.elm.setPointerCapture(e.pointerId);
    let spineBox = getBox(this.spine);
    this.pgFlip(advancing ? pgWidth : -pgWidth, pgHeight / 2, e.clientX - spineBox.x, e.clientY - spineBox.y, advancing, null);


    // following 3 vars are used to determine if page is "flung"
    let xTravel = 0;
    let prevClientX = e.clientX;
    let prevTimeStamp = e.timeStamp;
    let mv = listen(this.elm, "pointermove", (emv) => {
      this.pgFlipAnimator.cancel();
      this.pgMove(emv.clientX - spineBox.x, emv.clientY - spineBox.y, advancing);
      xTravel = emv.clientX - prevClientX;
      prevClientX = emv.clientX;
      prevTimeStamp = emv.timeStamp;
    });

    listen(
      this.elm,
      "pointerup",
      (eup) => {
        unlisten(mv);
        let x = eup.clientX - spineBox.x;
        let y = eup.clientY - spineBox.y;
        // Determine if we're actually flipping a page (fromX moved past spine)
        // or letting page flop back to its original position.
        let flipping = (advancing && x <= 0) || (!advancing && x > 0);
        // Determine if page was "flung": if so, force flipping
        if (advancing) xTravel = -xTravel;
        if (eup.timeStamp - prevTimeStamp < 250) flipping = xTravel > 0;
        // Determine x position of where to move page: flip fully to opposite side
        // of spine, or flop fully back to initial side.
        let toX = flipping ? (advancing ? -pgWidth : pgWidth) : advancing ? pgWidth : -pgWidth;
        // animate the flip (or flop)
        this.closeFunc = async () => {
          if (flipping) await this.pgShift(advancing);
          else this.layoutSlots();
        };
        this.pgFlip(x, y, toX, pgHeight / 2, advancing, this.closeFunc);
      },
      { once: true }
    );
  }

  pgFlip(x, y, toX, toY, advancing, func) {
    // Animate page flip from current x and y one step towards toX, toY, all in spineBox coords,
    // then call myself again for next step.
    // When x,y is reached, execute func.
    //    this.inOp = true;
    if (x == toX && y == toY) {
      if (func) func();
      this.inOp = false;
      return;
    }
    // If distance from x to toX <= 1em, go directly to toX. Otherwise
    // move towards toX by 1/2 of the distance...ditto for y.
    let minD =  _pxPerEm_;
    let dX = Math.abs((toX - x) / 2.5);
    let dY = Math.abs((toY - y) / 2.5);
    x = dX <= minD ? toX : toX > x ? x + dX : x - dX;
    y = dY <= minD ? toY : toY > y ? y + dY : y - dY;
    this.pgMove(x, y, advancing);
    this.pgFlipAnimator.run(60, () => this.pgFlip(x, y, toX, toY, advancing, func));
  }

  async pgMount(pn, slot, nonblocking=true) {
    // First, remove all children of this.slots[slot]. When
    // that child is a Page elm, return it to the score.
    for (let child of [...this.slots[slot].children]) {
      child.remove();
      if (child.pg) this.score.pgUnuse(child.pg);
    }
    // mount the given pg (1-based page number) on the given
    // slot (an index into this.slots)
    let pg = await this.score.pgUse(pn, nonblocking);
    if (pg) {
      pg.setZoom(this.cell.geo.zoom);
      this.pgPad(pg);
      this.slots[slot].append(pg.elm);
      // add a shadow (actually, a border) to right page where it joins the left, so fold between white pages is visible:
      let addShadow = () => {
        if(pg.deferred) return delay(1, () => addShadow()) ;
        if(pn & 1) pg.elm.firstChild.style.borderLeft = `.05em solid ${BookLayout.bindingColor}` ; 
        else pg.elm.firstChild.style.borderLeft = "unset" ;
      } ;
      addShadow() ;
    }
  }

  pgMove(x, y, advancing) {
    //  pgMove implements part of the page-changing animation:
    //  @x x offset of cursor from left side of page it touches...can be negative
    //  @y y offset of cursor from page top
    //  @advancing when true: the page in slot 3 is pulled to the left,
    //   so advancing toward end of book. This page is the "leader", while
    //   slot 4 is the "follower".
    let { shadow } = this;
    let { pgWidth, pgHeight, shadowWidth } = this.cell.geo;
    let zoom = parseFloat(this.elm.style.fontSize);
    pgWidth *= zoom;
    pgHeight *= zoom;
    shadowWidth *= zoom;
    x = clamp(x, -pgWidth, pgWidth);
    y = clamp(y, 0, pgHeight);

    if (advancing) {
      let leader = this.slots[3];
      let follower = this.slots[4];
      follower.style.zIndex = 2;
      shadow.style.background = "radial-gradient(ellipse at right, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 50%, transparent 70%)";
      let xFactor = (x + pgWidth) / (pgWidth + pgWidth); // x contrib to rotation, decreases right to left
      let yFactor = (y / pgHeight - 0.5) * 2; // [-1,1] ;  // y contrib to rotation, 0 at middle, max at top/bottom
      let pullingAngle = (Math.PI / 2) * xFactor * yFactor; // angle of pull relative to spine: positive means clockwise
      let pullingEdgeWidth = (pgWidth - x) / 2; // width of pulling edge at page top (when pullingAngle <= 0) or bottom (pullingAngle > 0).
      let pulledAngle; // angle of pulled (i.e. the "fold" in the page) relative to spine
      let pulledEdgeWidth; // width of pulled edge at page bottom (when pullingAngle <= 0) or top (pullingAngle > 0).
      if (pullingAngle <= 0) {
        // pulling right->left from top half of page
        let ll = rotatePoint(x, pgHeight, x + pullingEdgeWidth, 0, pullingAngle);
        pulledEdgeWidth = pullingAngle ? (pgHeight - ll.y) / Math.sin(pullingAngle) : pullingEdgeWidth;
        pulledAngle = -Math.atan((pullingEdgeWidth - pulledEdgeWidth) / pgHeight);
        if (leader.firstChild) leader.firstChild.style.clipPath = `path("M${pgWidth - pullingEdgeWidth} 0H0V${pgHeight}H${pgWidth - pulledEdgeWidth}Z")`;
        follower.style.transformOrigin = `${pullingEdgeWidth}px 0`;
        if (follower.firstChild) follower.firstChild.style.clipPath = `path("M${pullingEdgeWidth} 0H0V${pgHeight}H${pulledEdgeWidth}Z")`;
        shadow.style.bottom = "unset";
        shadow.style.top = "0";
        shadow.style.transformOrigin = "top right";
      } else {
        // pulling right->left from bottom half of page
        let ul = rotatePoint(x, 0, x + pullingEdgeWidth, pgHeight, pullingAngle);
        pulledEdgeWidth = -ul.y / Math.sin(pullingAngle);
        pulledAngle = Math.atan((pullingEdgeWidth - pulledEdgeWidth) / pgHeight);
        if (leader.firstChild) leader.firstChild.style.clipPath = `path("M${pgWidth - pulledEdgeWidth} 0H0V${pgHeight}H${pgWidth - pullingEdgeWidth}Z")`;
        follower.style.transformOrigin = `${pullingEdgeWidth}px ${pgHeight}px`;
        if (follower.firstChild) follower.firstChild.style.clipPath = `path("M${pulledEdgeWidth} 0H0V${pgHeight}H${pullingEdgeWidth}Z")`;
        shadow.style.top = "unset";
        shadow.style.bottom = "0";
        shadow.style.transformOrigin = "bottom right";
      }
      follower.style.left = x + "px";
      follower.style.transform = `rotate(${pullingAngle}rad)`;
      follower.append(shadow);
      shadow.style.left = "unset";

      let alpha = Math.min((x + pgWidth) / shadowWidth, 1);
      follower.style.filter = `drop-shadow(rgba(0, 0, 0, ${alpha * 0.3}) 2em 1em 1.5em)  drop-shadow(rgba(0, 0, 0, ${alpha * 0.15}) 0.5em 0.5em 0.5em) drop-shadow(rgba(0, 0, 0, ${alpha *  0.08}) 0px 0px 1em)`;
      shadow.style.opacity = alpha;
      shadow.style.right = pgWidth - pullingEdgeWidth + "px";
      shadow.style.transform = `rotate(${pulledAngle - pullingAngle}rad)`;
    } else {
      let leader = this.slots[2];
      let follower = this.slots[1];
      follower.style.zIndex = 1;
      shadow.style.background = "radial-gradient(ellipse at left, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.05) 50%, transparent 70%)";
      let xFactor = 1 - (x + pgWidth) / (pgWidth + pgWidth); // x contrib to rotation, decreases left to right
      let yFactor = (y / pgHeight - 0.5) * 2; // [-1,1] ;
      let pullingAngle = -(Math.PI / 2) * xFactor * yFactor;
      let pullingEdgeWidth = (pgWidth + x) / 2;
      let pulledEdgeWidth;
      let pulledAngle;
      if (pullingAngle >= 0) {
        // pulling left->right from top half of page
        let lr = rotatePoint(x, pgHeight, x - pullingEdgeWidth, 0, pullingAngle);
        pulledEdgeWidth = pullingAngle ? (lr.y - pgHeight) / Math.sin(pullingAngle) : pullingEdgeWidth;
        pulledAngle = Math.atan((pullingEdgeWidth - pulledEdgeWidth) / pgHeight);
        if (leader.firstChild) leader.firstChild.style.clipPath = `path("M${pullingEdgeWidth} 0H${pgWidth}V${pgHeight}H${pulledEdgeWidth}Z")`;
        follower.style.transformOrigin = `${pgWidth - pullingEdgeWidth}px 0`;
        if (follower.firstChild) follower.firstChild.style.clipPath = `path("M${pgWidth - pullingEdgeWidth} 0H${pgWidth + 1}V${pgHeight}h${-pulledEdgeWidth}Z")`;
        shadow.style.bottom = "unset";
        shadow.style.top = "0";
        shadow.style.transformOrigin = "top left";
      } else {
        // pulling left->right from top half of page
        follower.style.zIndex = 2;
        let ur = rotatePoint(x, 0, x - pullingEdgeWidth, pgHeight, pullingAngle);
        pulledEdgeWidth = ur.y / Math.sin(pullingAngle);
        pulledAngle = -Math.atan((pullingEdgeWidth - pulledEdgeWidth) / pgHeight);
        if (leader.firstChild) leader.firstChild.style.clipPath = `path("M${pulledEdgeWidth} 0H${pgWidth}V${pgHeight}H${pullingEdgeWidth}Z")`;
        follower.style.transformOrigin = `${pgWidth - pullingEdgeWidth}px ${pgHeight}px`;
        if (follower.firstChild) follower.firstChild.style.clipPath = `path("M${pgWidth - pulledEdgeWidth} 0H${pgWidth}V${pgHeight}h${-pullingEdgeWidth}Z")`;
        shadow.style.top = "unset";
        shadow.style.bottom = "0";
        shadow.style.transformOrigin = "bottom left";
      }
      follower.style.left = x - pgWidth + "px";
      follower.style.transform = `rotate(${pullingAngle}rad)`;
      follower.append(shadow);
      shadow.style.right = "unset";
      let alpha = Math.min((pgWidth - x) / shadowWidth, 1);
      follower.style.filter = `drop-shadow(rgba(0, 0, 0, ${alpha * 0.3}) 2em 1em 1.5em)  drop-shadow(rgba(0, 0, 0, ${alpha * 0.15}) 0.5em 0.5em 0.5em) drop-shadow(rgba(0, 0, 0, ${alpha *  0.08}) 0px 0px 1em)`;
      shadow.style.opacity = alpha;
      shadow.style.left = pgWidth - pullingEdgeWidth + "px";
      shadow.style.transform = `rotate(${pulledAngle - pullingAngle}rad)`;
    }
  }

  async pgOpen(how, bookMarks) {
    if (bookMarks) return super.pgOpen(how);
    // flip the page forward to next *pair* of pages
    let pn = parseInt(this.pnStash.pn);
    let inc = pn & 0x01 ? 1 : 2;
    switch (how) {
      case "next":
        pn += inc;
        break;
      case "prev":
        pn -= inc;
        break;
      case "first":
        pn = 1;
        break;
      case "last":
        pn = Number.MAX_SAFE_INTEGER;
        break;
    }
    let pgCount = this.score.pgs.length;
    if (pn <= 0) pn = pgCount;
    else if (pn > pgCount) pn = 1;
    this.pnPost(await this.pgGoTo(pn));
  }

  async pgShift(advancing, post = true) {
    // After a full pg flip, the pg's roles will no longer
    // be correct, i.e. the 2 visible pages will no longer
    // be pgC and pgD.  Re-assign the pg instance variables
    // and tags to correct their roles by circularly shifting
    // them left (advancing) or right (when not advancing) 2 positions.
    // This frees up 2 pages, and requires loading 2 pages.
    if (advancing) {
      this.pn0 += 2;
      // left circular shift slots
      this.slotArraysIndex = (this.slotArraysIndex + 1) % 3;
      this.slots = this.slotArrays[this.slotArraysIndex];
      // mount pgs in slots 4 and 5
      await this.pgMount(this.pn0 + 4, 4);
      await this.pgMount(this.pn0 + 5, 5);
    } else {
      this.pn0 -= 2;
      // right circular shift slots
      this.slotArraysIndex = (this.slotArraysIndex + 2) % 3;
      this.slots = this.slotArrays[this.slotArraysIndex];
      // mount pgs in slots 0 and 1
      await this.pgMount(this.pn0, 0);
      await this.pgMount(this.pn0 + 1, 1);
    }
    this.layoutSlots();
    if (post) this.pnPost(Math.min(this.pn0 + 3, this.score.pgs.length));
  }

  async pgGoTo(pn) {
    pn = clamp(pn, 1, this.score.pgs.length);
    let pn0 = pn - (pn & 0x01 ? 3 : 2);
    this.pgFlipAnimator.cancel();
    let advancing = pn > this.pn0;
    if(pn == 1) advancing = false ; // can't advance into 1st page

    if(advancing) { 
      await this.pgMount(pn0+2, 4, false) ;
      await this.pgMount(pn0+3, 5, false) ;
      await this.pgMount(pn0  , 2, true) ;
      await this.pgMount(pn0+1, 3, true) ;
      this.pn0 = pn0 - 2;
    }
    else {
      await this.pgMount(pn0+2, 0, false) ;
      await this.pgMount(pn0+3, 1, false) ;
      await this.pgMount(pn0+4, 2, true) ;
      await this.pgMount(pn0+5, 3, true) ;
      this.pn0 = pn0 + 2 ;
    }
    let {pgWidth, pgHeight} = this.cell.geo ;
    if (advancing) this.pgFlip(pgWidth, 0, -pgWidth, pgHeight / 2, true,
      async () => await this.pgShift(true, false));
    else this.pgFlip(-pgWidth, pgHeight, pgWidth, pgHeight /2, false,
      async() => await this.pgShift(false, false)) ;
    this.pnPost(pn, true) ;
    return pn;
  }

  layoutSlots() {
    // (Re) arrange slot layout with respect to the spine. Called by init,
    // called after a page is flipped, and called when current page changed by api.
    // Note the visit order is 0,1,2,5,4,3, so that slots 2,3 are on top of div stack:
    // like this:
    //        2 3
    //        1 4
    //        0 5
    for (let i of [0, 1, 2]) this.slots[i].style.left = "unset";
    for (let i of [0, 1, 2]) this.slots[i].style.right = "0" ;
    for (let i of [5, 4, 3]) this.slots[i].style.right = "unset";
    for (let i of [5, 4, 3]) this.slots[i].style.left = ".0";
    for (let i of [0, 1, 2, 5, 4, 3]) {
      let slot = this.slots[i];
      slot.style.transformOrigin = "unset";
      slot.style.transform = "unset";
      slot.style.zIndex = 0;
      slot.style.filter = "unset";
      if (slot.firstChild) slot.firstChild.style.clipPath = "unset";
      this.spine.append(slot);
    }
    this.shadow.remove();
  }

 show() {
  // for debugging only
  this.slots.forEach((slot, idx) => {
     console.log("slot " + idx + " " + slot.dataset.slot + 
         " pg " + (slot.firstElementChild? slot.firstElementChild.dataset.pg : "empty")) ;
    })
  }

}

/**
class ScrollLayout
  A ScrollLayout shows a Score's pages as a continuous sequence,
  either horizontally or vertically. User interaction allows
  scrolling to "snap" to page boundaries.
   
  Implentation note: to prevent code duplication between horizontal
  and vertical scrolllayout, the code is written to show horizontal
  scrolling only, but the values of variables shown in all caps will
  have "flipped" values during vertical scrolling. For example, the
  WIDTH variable contains the value "width" for horizontal
  scrolling, and the value "height" for vertical scrolling.
**/

class ScrollLayout extends Layout {
  static css = css(
    "ScrollLayout",
    `   .ScrollLayout {
            position:absolute;
            margin: ${Layout.margin}px ; 
         }
         .ScrollLayout__frame {
          position:absolute ;
          overflow: hidden ;
        }
        .ScrollLayout__holder {
          position:absolute;
         }

        .ScrollLayout__sash {
          position: relative;
          overflow: hidden; 
          border: ${Layout.borderSize}em solid ${Layout.borderColor};
          box-sizing: border-box ;
        }
        .ScrollLayout__roll {
          position:absolute;
          z-index:10;
          filter:drop-shadow(.1em .7em .5em #0008);
          overflow:hidden;
        }
        .ScrollLayout__roll-shadow {
          position:relative;
          height:100%;
        }
        .ScrollLayout__roll::after {
          content:"";
          position:absolute;
          background-image:linear-gradient(to right, #0000 35% , #ccc2 50%, #0000 65% );
        }
        .ScrollLayout-texture {
          position:absolute; 
          height:100%;
          background-image: var(--layoutTexture);
        }
   `
  );

  /**
     ascii art for the ScrollLayout's dom hierachy. left/right pagers
     are optional: when present, they are children of leftRoll/rightRoll.

                                      elm (pz)
                                       |
                                     scroll
                                    /  |   \
                 -----------leftRoll frame  rightRoll-----------
                /              /       |      \                 \
     leftRollShadow leftRollPattern    |     rightRollPattern rightRollShadow
                                     sash 
                                    / ... \  
     dynamically added:        g.elm ....  pg.elm
   **/

  elm = helm(`
    <div class="pz">
      <div data-tag="scroll" class="ScrollLayout">
        <div data-tag="leftRoll" class="ScrollLayout__roll">
          <div data-tag="leftRollPattern" class="ScrollLayout-texture"></div>
          <div data-tag="leftRollShadow" class="ScrollLayout__roll-shadow"></div>
        </div>
        <div data-tag="frame" class="ScrollLayout__frame">
           <div data-tag="sash" class="ScrollLayout__sash ScrollLayout-texture"></div>
        </div>
        <div data-tag="rightRoll" class="ScrollLayout__roll">
          <div data-tag="rightRollPattern" class="ScrollLayout-texture"></div>
          <div data-tag="rightRollShadow" class="ScrollLayout__roll-shadow"><div>
        </div>
      </div>
    </div>`);

  sashStart = 0;
  sashLimit = 0;
  frameWidth = 0;
  currentX = 0;
  currentY = 0;

  constructor(score, cell) {
    super(score, cell);
    Object.assign(this, dataIndex("tag", this.elm));
    this.elm.cell = cell ;
    _body_.append(this.elm);
    this.pointerListener = listen(this.elm, ["pointerdown"], this.onDown.bind(this));

    if(cell.key == "horizontal") {
      this.sash.style.borderRight = this.sash.style.borderLeft = "unset" ;
      this.props = NORMAL_PROPS ;
    }
    else {
      this.sash.style.borderBottom = this.sash.style.borderTop = "unset" ;
      this.props = ORTHO_PROPS ;
    }

    // Create left/right (top/bottom) pager instances:
    this.pagerLeft = new Pager(this.props.LEFT, (stash, adjusting, cursor) => 
       pnToDiv(this.pnStash.pn, cursor));
    Object.assign(this.pagerLeft.elm.style, {
      left: 0,
      zIndex: 20,
    });
    this.pagerRight = new Pager(this.props.RIGHT, (stash, adjusting, cursor) => 
       pnToDiv(Math.min(this.pnStash.pn + this.cell.geo.pgShow - 1, this.cell.geo.pgCount), cursor));
    Object.assign(this.pagerRight.elm.style, {
      right: 0,
      zIndex: 20,
    });
    this.leftRollShadow.style.background = this.rightRollShadow.style.background =
      `linear-gradient(to ${this.cell.key == "horizontal" ? "right" : "bottom"}, #666b 0, #0000 50%, #8888 100%)`;
  }

  destructor() {
    super.destructor();
    this.pagerLeft.destructor();
    this.pagerRight.destructor();
    unlisten(this.pointerListener);
  }

  async build(animated=true) {
    this.animated = animated ; 
    Object.assign(this, this.cell.stash);
    let { fit, gap, pgSnap, sash, score, pgShow } = this;
    let { LEFT, RIGHT, TOP, WIDTH, HEIGHT, MAXWIDTH, MAXHEIGHT, INNERWIDTH, INNERHEIGHT } = this.props;
    fit = fit.toLowerCase() ;
    clearChildren(sash);

    // Layout scroll g((eo)metry) in units of css pixels, and "as if"
    // this is a horizontal scroll, though the values assigned to
    // this.props can effectively make this vertical by swapping
    // property names.
    let g = (this.cell.geo = this.cell.geo || {scroll: {},sash: {},pg: {}});
    gap /= 100 ; // gap % as fraction


    g.rollGirth = this.pnShow == "On" ? Pager.width : Layout.margin ;
    g.pgCount = this.score.pgs.length ;
    g.pgShow = Math.min(pgShow, g.pgCount) ; // g.pgShow must be <= total page count
    g.pgSnap = Math.min(pgSnap, g.pgCount) ; // g.pgSnap must be <= total page count

    if (fit == "none") {
      g.pg[WIDTH] = score[MAXWIDTH] ;
      g.gap = gap * g.pg[WIDTH];
      g.pg[HEIGHT] = score[MAXHEIGHT] ;
      g.scroll[WIDTH] = g.rollGirth + g.gap + (g.pg[WIDTH] + g.gap) * g.pgShow + g.rollGirth;
      g.scroll[HEIGHT] = g.gap + g.pg[HEIGHT] + g.gap;
    } 

    if (fit == "auto" || fit == WIDTH) {
      g.scroll[WIDTH] = window[INNERWIDTH] - Layout.margin - Layout.margin ;
      g.pg[WIDTH] = ((g.scroll[WIDTH] - g.rollGirth - g.rollGirth) / g.pgShow) / (1 + gap + gap/g.pgShow) ;
      g.gap = gap * g.pg[WIDTH] ;
      g.pg[HEIGHT] = Math.floor(g.pg[WIDTH] * (score[MAXHEIGHT] / score[MAXWIDTH]));
      g.scroll[HEIGHT] = g.gap + g.pg[HEIGHT] + g.gap ;

      if(fit == "auto") {
        // Check if layout will fit entirely within window. If not, recalculate with fit = HEIGHT ;
        fit = WIDTH ; // assume width
        // if either dimension doesn't fit window, change fit to HEIGHT ;
        let layoutWidth = Math.round(Layout.margin * 2 + (g.pg[WIDTH] + g.gap) * g.pgShow + g.gap + g.rollGirth * 2) ;
        if(layoutWidth > window[INNERWIDTH])
          fit = HEIGHT ;
        else {
          let layoutHeight = Math.round(Layout.margin * 2 + g.pg[HEIGHT] + g.gap * 2) ;
          if(layoutHeight > window[INNERHEIGHT]) fit = HEIGHT ;          
        } 
      }
    }

    if (fit == HEIGHT) {
      g.scroll[HEIGHT] = window[INNERHEIGHT] - Layout.margin - Layout.margin ;
      g.pg[HEIGHT] = g.scroll[HEIGHT] / (1 + gap + gap) ;
      g.gap = gap * g.pg[HEIGHT] ;

      g.pg[WIDTH] = g.pg[HEIGHT] * score[MAXWIDTH] / score[MAXHEIGHT] ;
      g.scroll[WIDTH] = g.rollGirth + g.gap + (g.gap + g.pg[WIDTH]) * g.pgShow + g.rollGirth ;
    } 

    g.sash[WIDTH] = (g.pg[WIDTH] + g.gap) * g.pgCount + g.gap;
    // We round sashLimit because we want to compare it to event[CLIENTX], which is always int, see this.onDown()
    g.sashLimit = Math.round(-g.sash[WIDTH] + g.pgShow * (g.pg[WIDTH] + g.gap) + g.gap);
    g.zoom = g.pg[WIDTH] / score[MAXWIDTH];

    // this.elm must have its fontsize *style* set in em's: initially 1, but changeable by user pan/zoom
    this.elm.style.fontSize = "1em" ;
       
    //
    // Use g(eo(metry)) to set size of all elements in em's
    //

    // scroll
    Object.assign(this.scroll.style, {
      [HEIGHT]: toEm(g.scroll[HEIGHT]),
      // Not that scroll's WIDTH is set by adding rollGirth in px, then subtracting rollGirth in em's.
      // Initially, they are equal, so contribute nothing, but if/when the scroll is resized through em change,
      // their difference will account for delta between the pagers, which don't scale, and
      // the scroll, which does.
      [WIDTH]: `calc(${toEm(g.scroll[WIDTH])} + ${g.rollGirth * 2}px - ${toEm(g.rollGirth * 2)})`,
    });

    // frame
    Object.assign(this.frame.style, {
      [HEIGHT]: "100%",
      [WIDTH]: `calc(100% - ${g.rollGirth * 2}px`,
      [LEFT]: g.rollGirth + "px",
      [TOP]: 0,
    });

    // sash
    Object.assign(this.sash.style, {
      [HEIGHT]: "100%",
      [WIDTH]: toEm(g.sash[WIDTH]),
      [LEFT]: 0,
      [TOP]: 0,
    });

    // left/right roll position/size, plus drop shadow "caps" on top/bottom
    for (let roll of [this.leftRoll, this.rightRoll])
      Object.assign(roll.style, {
        [HEIGHT]: "100%",
        [WIDTH]: g.rollGirth + "px",
        [roll === this.leftRoll ? LEFT : RIGHT]: 0,
        [TOP]: 0,
        // box shadow adds caps on top & bottom or rolls
        boxShadow: LEFT == "left" ? "0 -3px 0 #000,0 3px 0 #000" : "-3px 0 0 #000,3px 0 0 #000",
      });

    // left/right roll pattern: simulated rolled-up portion of scroll
    for (let style of [this.leftRollPattern.style, this.rightRollPattern.style])
      Object.assign(style, {
        [HEIGHT]: "100%",
        [WIDTH]: "200%", 
      });

    if(this.pnShow == "On") {
      this.leftRoll.append(this.pagerLeft.elm);
      this.rightRoll.append(this.pagerRight.elm);
    } else {
      this.pagerLeft.elm.remove();
      this.pagerRight.elm.remove();
    } ;

    if(!animated) return await this.pgGoTo(this.pnStash.pn);

    // 
    // animate centering of layout's screen position
    //

    let iconBox = getBox(dataIndex("tag", this.cell.elm).cellIcon) ;

    animate(this.elm,
      { left:iconBox.x + "px", top:iconBox.top + "px", fontSize: 0},
      this.cell.pz ? this.cell.pz : this.centerLT({ fontSize: "1em"}),
      `left, top, font-size ${_gs_}s`) ;

    await this.pgGoTo(this.pnStash.pn);
  }

  async onDown(e) {
    if (await super.onDown(e)) return;
    let { LEFT, CLIENTX, WIDTH, X } = this.props;
    let sashLimit = this.cell.geo.sashLimit;

    this.sash.setPointerCapture(e.pointerId);
    let frameBox = getBox(this.frame);
    let dir = "none"; // drag direction, "none", "left", or "right"
    e.mv1 = e.mv0 = e;

    let mv = listen(
      this.frame,
      ["pointermove"],
      ((emv) => {
        e.mv1 = e.mv0;
        e.mv0 = emv;
        let clientX = emv[CLIENTX];
        let atStart = this.sashStart == 0; // at start of document
        let atEnd = sashLimit == Math.round(this.sashStart); // at end of document
        // disallow dragging sash when pointer outside of frame, as it can expose
        // sash locations where no Pg is mounted
        if (clientX < frameBox[X] || clientX > frameBox[X] + frameBox[WIDTH]) return;
        this.sashStart = clamp(this.sashStart + clientX - e.mv1[CLIENTX], sashLimit, 0);
        this.sash.style[LEFT] = toEm(this.sashStart);
        this.spinRollers();
        dir = clientX > e.mv1[CLIENTX] ? "right" : clientX < e.mv1[CLIENTX] ? "left" : "none";
        if (dir == "left" && atEnd) {
          Layout.pgAlert(emv, Layout.endElm);
          if (Layout.startElm.isConnected) Layout.startElm.remove();
        } else if (dir == "right" && atStart) {
          Layout.pgAlert(emv, Layout.startElm);
          if (Layout.endElm.isConnected) Layout.endElm.remove();
        } else {
          if (Layout.startElm.isConnected) Layout.startElm.remove();
          if (Layout.endElm.isConnected) Layout.endElm.remove();
        }


      }).bind(this)
    );

    listen(
      this.frame, 
      "pointerup",
      (async (eup) => {
        unlisten(mv);
        // When delay between pointerup and previous event < 200ms, compute "velocity" of last movement.
        let delay = eup.timeStamp - e.mv0.timeStamp;
        let vel = delay < 200 ? (e.mv0[CLIENTX] - e.mv1[CLIENTX]) / (e.mv0.timeStamp - e.mv1.timeStamp) : 0;
        vel = vel || 0 ; // When e.mv0 ==- e.mv1, vel will be NaN, so substitute 0.
        vel /= 5; // dampen the velocity
        this.pgSnapTo(eup.timeStamp - e.timeStamp > 200 ? "none" :
            e.mv0[CLIENTX] > e.mv1[CLIENTX] ? "right" :
                 e.mv0[CLIENTX] < e.mv1[CLIENTX] ? "left" : "none", vel);
      }).bind(this),
      { once: true }
    );
  }

  async pgGoTo(pn) {
    let { LEFT, WIDTH } = this.props;
    let { gap, pg, pgCount, sashLimit } = this.cell.geo;
    pn = clamp(pn, 1, pgCount);
    let sashOrigin = this.sashStart;
    this.sashStart = -(pg[WIDTH] + gap) * (pn - 1);
    this.sashStart = clamp(this.sashStart, sashLimit, 0);
    await this.pgMount(pn);
    animate(this.sash, { [LEFT]: toEm(sashOrigin) }, { [LEFT]: toEm(this.sashStart) }, `${LEFT} cubic-bezier( 0, 1.01, 0.04, 1 ) ${_gs_}s`);
    this.spinRollers(_gs_ * 1000);
    this.pnPost(pn, true);
    return pn;
  }

  async pgMount(pn) {
    // Mount pages to ensure that [pn-pgShow, pn+pgShow] pages are mounted, as well
    // as "pgShow" previous and succeeding pages are checked out and mounted on
    // the sash.  All other pages on the sash are marked as unused.
    let { LEFT, RIGHT, TOP, BOTTOM, WIDTH } = this.props;
    let { gap, pgShow } = this.cell.geo;
    let pgWidth = this.cell.geo.pg[WIDTH];
    for (let pgElm of Array.from(this.sash.children)) {
      let pg = pgElm.pg;
      let sashPn = this.score.pnOf(pg);
      if (sashPn < pn - pgShow || sashPn > pn + pgShow) {
        pgElm.remove();
        this.score.pgUnuse(pg);
      }
    }

    pgShow = Math.max(pgShow, 4); // ensure at least 4
    for (let sashPn = pn - pgShow; sashPn <= pn + pgShow + 1; sashPn++) {
      let pg = await this.score.pgUse(sashPn);
      if (!pg) continue;
      if (!pg || pg.elm.isConnected) continue; // possibly no page at i, or page already mounted
      pg.setZoom(this.cell.geo.zoom);
      this.pgPad(pg);

      Object.assign(pg.elm.style, {
        position: "absolute",
        [TOP]: toEm(gap),
        [LEFT]: toEm(gap + (pgWidth + gap) * (sashPn - 1)),
        [RIGHT]: "unset",
        [BOTTOM]: "unset",
      });
      this.sash.append(pg.elm);
    }
  }

  async pgOpen(how, bookMarks) {
    if (bookMarks) return super.pgOpen(how);
    // flip the page forward to next pair of pages
    let pn = parseInt(this.pnStash.pn);
    let inc = Math.max(this.pgSnap, 1); // at least 1 page
    switch (how) {
      case "next":
        pn += inc;
        break;
      case "prev":
        pn -= inc;
        break;
      case "nextBookmark":
        pn += pn & 0x01 ? 1 : 2;
        break;
      case "prevBookmark":
        pn -= pn & 0x01 ? 1 : 2;
        break;
      case "first":
        pn = 1;
        break;
      case "last":
        pn = Number.MAX_SAFE_INTEGER;
        break;
    }
    let pgCount = this.score.pgs.length;
    if (pn > pgCount) pn = 1;
    else if (pn == 0) pn = pgCount;
    this.pnPost(await this.pgGoTo(pn));
  }

  /**
   * After user action scrolls the sash, the code can snap to a specific
   * page boundary (or partial page).
   */
  async pgSnapTo(dir, vel) {
    // "snap" displayed pages so that they align with a page boundary.  @dir is "right" or "left" or none (i.e. nearest)
    // @vel is "velocity". If pgSnap == 0, and dir != none, then vel is used to fling the sash left or right.  
    let { LEFT, WIDTH } = this.props ;
    let { gap, pgCount, pgSnap, pgShow, sashLimit} = this.cell.geo ;
    let pgWidth = this.cell.geo.pg[WIDTH] ;
    let snapDur = Math.min(vel ? Math.abs(250 / vel) : 250, 750)  ; // how long the snap takes, in ms
    if (pgSnap > 0) {
      let snapWidth = (pgWidth + gap) * pgSnap ;
      let travel = this.sashStart / snapWidth;
      if (dir == "right") this.sashStart = Math.ceil(travel) * snapWidth;
      else if (dir == "left") this.sashStart = Math.floor(travel) * snapWidth;
      else {
        // dir = "nearest", i.e. snap to nearest page border that's a multiple of this.pgSnap
        let dX = (-this.sashStart % snapWidth) / snapWidth;
        this.sashStart = (dX < 0.5 ? Math.ceil(travel) : Math.floor(travel)) * snapWidth;
      }
    }
    else if(dir) this.sashStart += vel * pgShow * (pgWidth + gap) ;
    this.sashStart = clamp(this.sashStart, sashLimit, 0);
    // what will be the new page number?
    let pn = Math.round((-this.sashStart) / (pgWidth + gap) + 1);
    pn = clamp(pn, 1, pgCount);

    // after the snap, the page number is taken as the left[top]most visible page
    if (pgSnap > 0) pn = Math.floor((pn - 1) / pgSnap) * pgSnap + 1;
    this.pnPost(pn);
    this.pgMount(pn, dir);

    // animate the snap, updating on every animation frame
    animate(this.sash, null, { [LEFT]:this.sashStart / _pxPerEm_ + "em"}, `${LEFT} ${snapDur / 1000}s ease-out`) ;
    this.spinRollers(snapDur) ;
  }

  spinRollers(dur = 0) {
    // Simulate left/right roller spin  (tracking the motion of this.sash),
    // by translating the roll patterns modulus the roll's girth.
    // The spin will continue for dur msecs (defaults to 0).
    let until = performance.now() + dur;
    let { LEFT, RIGHT, OFFSETLEFT, OFFSETWIDTH } = this.props;
    let rollGirth = this.leftRoll[OFFSETWIDTH]; // width is same as height
    let leftStyle = this.leftRollPattern.style;
    let rightStyle = this.rightRollPattern.style;
    leftStyle[LEFT] = rightStyle[RIGHT] = "unset";
    let track = () => {
      // rollers and pagers dimensions are px, not ems
      //      let rollPos = this.sashStart % rollGirth;
      let rollPos = this.sash[OFFSETLEFT] % rollGirth;
      leftStyle[RIGHT] = rollPos + "px";
      rightStyle[LEFT] = -rollPos - rollGirth + "px";
      if (performance.now() < until) delay(3, () => track());
      else this.sash.style.transition = "unset";
    };
    track();
  }
}

/**
class TableLayout
  Lays out all pages in a 2-dimensional grid defined by specifying
  either a fixed number of pages per row.  The gap between rows and
  columns can be specified independently, and if negative, cause
  the pages to overlap, similar to a fanned-out deck of cards.
**/
class TableLayout extends Layout {
  /*  
     Ascii art of layout's dom hierarchy:

                    elm (pz)
                     |
                   table
                     |
                   grid
                   / | \
                  /  |  \
                 pg  pg pg ...

   */

  static gridMargin = `${1.25 / _dvPxRt_}em`;

  static css = css(
    "TableLayout",
    `
        .TableLayout__table {
          position: absolute;
          touch-action:none;
          box-shadow: .25em .25em 1.5em #888;
          border-radius: var(--borderRadius);
          background-image: var(--layoutTexture);
          overflow:hidden;
          border: ${Layout.borderSize}em solid ${Layout.borderColor};
        }
        .TableLayout__grid {
          margin: ${TableLayout.gridMargin};
          position:relative;
        }
        .TableLayout__pg {
          box-shadow: -.05em .05em 0.5em #8888, .25em .25em 1.5em #8888; 
          background-size: contain;
          z-index: 1;
          background-repeat: no-repeat;
          background-position: center center;
        }
        .TableLayout__pg-active {
         /* active page is larger than others, and on top in z-order */
          transform: scale(1.15) ;
          z-index: 3;
        }
        .TableLayout__pn {
          position:absolute;
          font-size:${1 / _dvPxRt_}em;    
          line-height:${1 / _dvPxRt_}em; 
          text-shadow: .075em 0 .2em #bbb, -.075em 0 .2em #bbb, 0 .075em .2em #bbb, 0 -.075em .2em #bbb;
          pointer-events: none;
          z-index: 2;
        }
   `
  );

  bMarkTimer = new Schedule();

  elm = helm(`
    <div class="pz">
      <div data-tag="table" class="TableLayout__table">
        <div data-tag="grid" class="TableLayout__grid">
        </div>
      <div>
    </div>
  `);

  constructor(score, cell) {
    super(score, cell);
    Object.assign(this, dataIndex("tag", this.elm));
    _body_.append(this.elm);
    this.pointerListener = listen(this.table, ["pointerdown"], this.onDown.bind(this));
  }

  destructor() {
    super.destructor();
    unlisten(this.pointerListener);
  }

  async build(animated=true) {
    // set animated to false to skip some of the animation effects during building...
    // When true, we build 1 page per animation frame, and move the layout as more
    // rows are added. This works fine for initial builds, but is too much if
    // we're rebuilding after a cut or paste.
    this.animated = animated ;
    Object.assign(this, this.cell.stash);
    Object.assign(this, this.pnStash);
    // pages is from cell.stash: it determines the number of pages per row
    let { grid, pages, score, table } = this ;

    clearChildren(grid);
    this.elm.style.fontSize = "1em" ;

    // Compute layout at a 1em fontSize
    clearChildren(grid);
    let pgCount = score.pgs.length;

    let gridMargin = parseFloat(TableLayout.gridMargin) * _pxPerEm_ ;
    let tableWidth = innerWidth - Layout.margin * 2  ;
    let gridWidth = tableWidth - gridMargin * 2 ;
    let hStep = this.horizontalGap * 0.01 + 1; // as fraction of pgWidth
    let vStep = this.verticalGap * 0.01 + 1; // as fraction of pgHeight
    let pgWidth = gridWidth / ((pages - 1) * hStep + 1);
    let pgHeight = (score.maxHeight / score.maxWidth) * pgWidth;

    let xStep = pgWidth * hStep;
    let yStep = pgHeight * vStep;
    table.style.width = toEm(tableWidth) ;
    grid.style.width = `calc(${toEm(tableWidth)} - ${gridMargin * 2}px)` ;
    this.pgWidth = pgWidth ;
    this.pgHeight = pgHeight ;

    // pre-compute position of pgs in the grid
    this.gridCoords = [] ;
    for (let pn = 1, top = 0 ; pn <= pgCount; top += yStep) {
      for (let col = 0, left = 0; col < pages && pn <= pgCount; pn++, col++, left += xStep) 
          this.gridCoords.push({pn, top,  left}) ;
    }

    // position layout for start of pg generation animation (a noop if this.animated == false)
    this.toXY(Layout.margin, Layout.margin + gridMargin + pgHeight / 2) ;

    // Now add all pages

    if(this.score.pgs.find((pg) => pg.thumbUrl == null)) {
      // ...then one or more thumbnails are not built: animate the (possibly lengthy) building process
      let cancelled = false ;
      let dialogElm = dialog("",{ Cancel: { svg: "Cancel" } }, (e,_x,_y,args) => {
        cancelled = true ;
        args.close() ;
      }) ;

      let gen = async(i) => {
        dialogElm.firstChild.innerHTML = `Building: ${Math.round((i/pgCount)* 100)}%<hr>` ;
        let {pn, top} = this.gridCoords[i] ;
        // Potentially expand the gridHeight to accomodate the next row:
        let gridHeight = top + pgHeight ;
        grid.style.height = toEm(gridHeight) ;
        let nextTop = innerHeight - gridHeight - Layout.margin ;
        if (nextTop < Layout.margin) this.toXY(Layout.margin, nextTop) ;
        grid.append(await this.buildPg(pn)) ;
        if(++i < this.gridCoords.length && !cancelled)  {
            this.animated ? delay(1, async () => await gen(i)): await(gen(i)) ;
        }
        else {
          dialogElm.buttonsElm.self.fire("Cancel");
          if(this.cell.pz) return (this.elm.style.cssText = this.cell.pz) ;// custom user-set pan/zoom
          if(this.fit == "Height") this.elm.style.fontSize = (innerHeight - Layout.margin * 2) / table.offsetHeight  + "em" ;
          animate(this.elm, null, this.centerLT(), `left, top ${_gs_}s`) ;
        }
      }
      await gen(0) ;
    }

    else {
      void _body.offsetWidth ;
      for(let {pn, top, left} of this.gridCoords) {
        let gridHeight = top + pgHeight + gridMargin * 2 ;
        grid.style.height = toEm(gridHeight) ;
        let nextTop = innerHeight - gridHeight - Layout.margin ;
        if (nextTop < Layout.margin) this.toXY(Layout.margin, nextTop) ;
        grid.append(await this.buildPg(pn, left, top));
      }
     let iconBox = getBox(dataIndex("tag", this.cell.elm).cellIcon) ;
     if(this.cell.pz) animate(this.elm, { left:iconBox.x + "px", top:iconBox.top + "px", fontSize: 0}, this.cell.pz, `left, top, font-size ${_gs_}s`) ;
     else { 
       if(this.fit == "Height") // reduce fontSize so layout fits window's height
         this.elm.style.fontSize = (innerHeight - Layout.margin * 2) / table.offsetHeight  + "em" ;
       animate(this.elm, { left:iconBox.x + "px", top:iconBox.top + "px", fontSize: 0},
         this.centerLT({ fontSize: this.elm.style.fontSize}), `left, top, font-size ${_gs_}s`) ;
      }
    }
  }

  async buildPg(pn, rebuild=false)
  {
    // build elm to hold thumbnail
    let {left, top} = this.gridCoords[pn-1] ;

    let pg = this.score.pgs[pn - 1];
    let elm = await pg.getThumbElm(rebuild) ;
    elm.setAttribute("name", pn) ;
    elm.pg = pg ;
    Object.assign(elm.style,{
       position:"absolute",
       height:toEm(this.pgHeight),
       width:toEm(this.pgWidth),
       left:toEm(left),
       top:toEm(top),
    }) ;  


    if(this.pnShow == "On") {
      // add a page number elm (or refresh, it elm already has a page number elm) to upper left corner of elm
      let pnElm = elm.getElementsByClassName("TableLayout__pn").item(0) || helm(`<div class="TableLayout__pn"></div>`);
      pnElm.pg = pg; // Pn div is clickable
      pnElm.pn = pn; 
console.log(pn, this.bookmarks) ;
      Object.assign(pnElm.style, {
         background: this.bookmarks[pn] || "unset",
         top: 0, 
         left: 0,
      }) ;
      elm.append(pnElm) ;
      pnToDiv(pn, pnElm, false);
    }
    else
      clearChildren(elm) ;

    if (pn == this.pnStash.pn) 
       await this.buildPgActive(pn, elm) 
    else this.score.pgUnuse(pg) ;
    return elm ;
  }

  async buildPgActive(pn, elm) {
    // Find the current active page...if there is one, uniquely, it'll have a canvas-container child element
    let active = this.grid.getElementsByClassName("canvas-container").item(0)?.parentElement;
    if (active) {
      // "unuse" pg, then force re-build of its thumbnail, as it could have been "inked"
      active.replaceWith(await this.buildPg(active.getAttribute("name"), true));
      this.score.pgUnuse(active.pg);
    }

    // now build the new active page
    let pg = await this.score.pgUse(pn, false);
    pg.elm.style.display = "block";
    pg.setZoom(this.pgHeight / pg.score.maxHeight);
    this.pgPad(pg) ;
    elm.append(pg.elm) ;
    elm.classList.add("TableLayout__pg-active");
  }


  Cursor = class {
    // This embedded class manages dragging to reorder pgs
    slots = [null, null, null, null]; 
    slotStyles = ['', '', '', ''];

    constructor(e, layout) {
      this.layout = layout;
      this.active = e.target.closest(".TableLayout__pg");
      this.ghost = this.active.cloneNode(false);
      this.ghost.style.opacity = 0 ;
      this.active.parentElement.insertBefore(this.ghost, this.active);
      this.activeStyles = this.active.style.cssText;
      Object.assign(this.active.style, { pointerEvents: "none", opacity: ".8", zIndex: 99}) ;
      let box = getBox(e.target);
      this.offset = e.clientX - box.x + box.width / 2;
      this.slotTrans = [-2, -4, 2, 4].map(d => `translateX(${box.width/d}px)`);
      this.active.style.transition = "top .25s ease-in-out";
    }

    mv(emv) {
      let {slots, slotStyles, slotTrans, transform, active} = this;
      this.active.style.left = emv.clientX - this.offset + "px";
      let target = document.elementFromPoint(emv.clientX, emv.clientY);

      if(target.classList.contains("TableLayout__pg")) {
        let box = getBox(target);
        let newSlots = emv.clientX < box.x + box.width / 2
          ? [target.previousSibling, target.previousSibling?.previousSibling,
             target, target?.nextSibling]
          : [target, target?.previousSibling,
             target.nextSibling, target.nextSibling?.nextSibling];
        if(newSlots[0] != slots[0] || newSlots[3] != slots[3]) {
          // restore old styles
          slots.forEach((elm, i) => elm && (elm.style.cssText = slotStyles[i]));
          // apply new styles
          newSlots.forEach((elm, i) => {
            if(elm) {
              slotStyles[i] = elm.style.cssText;
              elm.style.transform = slotTrans[i];
              elm.style.transition = "transform 0.25s ease-in-out";
            }
          });
          this.slots = newSlots;
        }
        this.active.style.top = target.style.top ;
      }
    }


    async up(eup) {
      this.ghost.remove() ;
      this.slots.forEach((elm, i) => elm && (elm.style.cssText = this.slotStyles[i]));
      let fromPn = parseInt(this.active.getAttribute("name"));
      let toPn = this.slots[0] ? parseInt(this.slots[0].getAttribute("name")) : 0;
      if(toPn < fromPn) toPn++ ;
      this.active.style.cssText = this.activeStyles;
      if(fromPn != toPn) {
        let marks = this.layout.bookmarks;
        let newMarks = {};
        for(let [pn, color] of Object.entries(marks)) {
          pn = parseInt(pn);
          if(pn == fromPn) newMarks[toPn] = color;  // moved page keeps its bookmark
          else if(fromPn < toPn && pn > fromPn && pn <= toPn) newMarks[pn - 1] = color;  // shift left
          else if(fromPn > toPn && pn >= toPn && pn < fromPn) newMarks[pn + 1] = color;  // shift right
          else newMarks[pn] = color;  // unchanged
        }
        this.layout.pnStash.bookmarks = newMarks;
console.log(1, this.layout.pnStash) ;
        this.layout.score.pgMv(fromPn, toPn);
        await this.layout.build(false);
        await this.layout.pgGoTo(toPn);
      }
    }

  }

  async onDown(e) {
    if (await super.onDown(e)) return;
    this.grid.setPointerCapture(e.pointerId) ;
    let pg = e.target.pg || e.target.parentElement.pg;
    if (!pg) return;
    let pn = this.score.pnOf(pg);
    await this.pgGoTo(pn);

    this.bMarkTimer.run(_longPressMs_, () => {
      let style = this.grid.children.namedItem(pn).firstChild.style;
      if (this.bookmarks[pn]) {
        delete this.bookmarks[pn];
        style.background = "unset";
      } else style.background = this.bookmarks[pn] = randomColor();
      _body_.dispatchEvent(new CustomEvent("BookmarkChanged"));
    });

    let cursor = null ;

    let mv = listen(this.grid, "pointermove", (emv) => {
     mvmt(e, emv) ;
     if(e.moved) {
       this.bMarkTimer.cancel() ;
       if(!cursor) cursor = new this.Cursor(e, this) ;
       cursor.mv(emv) ;
     }
    }) ;

    listen(window, "pointerup", (eup) => {
        if(e.moved) cursor.up(eup) ;
        unlisten(mv) ;
        this.bMarkTimer.cancel();
      },
     { once: true });
  }

  async pgGoTo(pn) {
    pn = clamp(pn, 1, this.score.pgs.length); // clamp out-of-range pn
    if (this.pnOffset != this.pnStash.pnOffset) {
      // Front Matter count has changed: re-number pages
      this.pnOffset = this.pnStash.pnOffset;
      for (let pnElm of [...document.getElementsByClassName("TableLayout__pn")]) pnToDiv(pnElm.pn, pnElm, false);
    }
    if (pn == this.pnStash.pn) return pn; // active page was reselected, noop
    this.pnPost(pn);
    // build "new" active pg
    let active = this.grid.children.item(pn - 1);
    this.buildPgActive(pn, active);
    return pn;
  }

  async pgOpen(how, bookMarks) {
    if (bookMarks) return super.pgOpen(how);
    let pn = this.pnStash.pn;
    switch (how) {
      case "next":
        ++pn;
        break;
      case "prev":
        --pn;
        break;
      case "first":
        pn = 1;
        break;
      case "last":
        pn = Number.MAX_SAFE_INTEGER;
        break;
    }
    let pgCount = this.score.pgs.length;
    if (pn > pgCount) pn = 1;
    else if (pn == 0) pn = pgCount;
    this.pnPost(await this.pgGoTo(pn));
  }

  // Set Layout's position s.t. this.elm's first child's left and/or top is at x and/or y.
  // Used when animating a build.
  toXY(x = null, y = null) {
    if (this.animated) {
      let box = getBox(this.elm.firstElementChild);
      if (x) this.elm.style.left = x + box.width / 2 + "px";
      if (y) this.elm.style.top = y + box.height / 2 + "px";
    }
  }
}

/**
Class Pager
 Implements Pagers used by Book and Scroll Layouts (but not Tablelayout)
 to quickly change pages through user interaction.
**/

class Pager {
  static css = css(
    "Pager", `
    .Pager {
      position:absolute ;
      top:0;
      font-size: ${50 / _dvPxRt_}px;
      line-height: ${50 / _dvPxRt_}px;
      text-align:center ;
      transition: opacity .35s ease-in-out ;
     }
     .Pager__cursor {
       position:absolute;
       text-shadow: var(--textShadow);
       z-Index:1 ;
       border-radius: .4em ;
       background-color: #0000 ;
       width:100% ;
     }
     .Pager__cursor-active {
       background: #8884 ;
     }
     .Pager__bookmark {
       position:absolute;
       opacity:.75;
       border-radius:.5em;
     }`);

  static id = 0;
  static width = 45 / _dvPxRt_; // px

  elm = helm(
    `<div data-tag="pager" class="Pager">
        <div data-tag="cursor" class="Pager__cursor"></div>
     </div>`
  );

  constructor(position, formatFunc) {
    // position is one of "left", "right", "top", "bottom"
    Object.assign(this, dataIndex("tag", this.elm));
    this.pnStash = _menu_.rings.page.cells.numbers.stash;
    this.formatFunc = formatFunc;
    this.position = position;
    this.props = ["left", "right"].includes(position) ? NORMAL_PROPS : ORTHO_PROPS;
    let { WIDTH, HEIGHT } = this.props;
    this.pager.style[WIDTH] = this.cursor.style[WIDTH] = this.cursor.style[HEIGHT] = Pager.width + "px";
    this.pager.style[HEIGHT] = "100%";
    if (position == "left") this.pager.style.left = 0;
    else if (position == "right") this.pager.style.right = 0;
    else if (position == "top") this.pager.style.top = 0;
    else if (position == "bottom") this.pager.style.bottom = 0;
    this.bMarkTimer = new Schedule();
    this.cursorBackground = cssIndex("Pager", ".Pager__cursor", "background-color");
    this.ptrMsgBackground = cssIndex("ptrMsg", ".ptrMsg", "background-color");
    this.pnListener = listen(_body_, "PnChanged", (e) => {
      if (e.detail === this) return;
      this.buildCursor();
    });

    this.bookmarkListener = listen(_body_, ["BookmarkChanged"], (e) => this.buildBookmarks());
    this.pointerListener = listen(this.elm, "pointerdown", (e) => this.onDown(e));

    this.buildBookmarks();
  }

  destructor() {
    // Called when containing layout is about to be removed from dom.
    unlisten(this.pnListener, this.bookmarkListener, this.pointerListener);
  }

  build() {
    this.buildCursor();
    this.buildBookmarks();
  }

  buildCursor() {
    let { HEIGHT, WIDTH, TOP } = this.props;
    let cursorBox = getBox(this.cursor) ;
    let pagerBox = getBox(this.pager);
    this.cursor.style[HEIGHT] = this.cursor.style.lineHeight = pagerBox[WIDTH] + "px";
    // The cursor is positioned s.t. pg 1 is always at the top of the pager, and the max page is always at the bottom
    // of the pager.  Its Position is expressed as a percentage so that when a layout is scaled by adjusting
    // the font size of its pz element, the pager position will automatically adjust.
    let topPx = (this.pnStash.pn -1) * (pagerBox[HEIGHT] - cursorBox[HEIGHT]) / (Score.activeScore.pgs.length - 1) ;
    this.cursor.style[TOP] = 100 * topPx / pagerBox[HEIGHT] + "%" ;
    this.formatFunc(this.pnStash, false, this.cursor);
  }

  buildBookmarks() {
    let { LEFT, HEIGHT, TOP, WIDTH } = this.props;
    for (let elm of [...this.elm.children]) if (elm.dataset.tag == "bookmark") elm.remove();
    let pgCount = Score.activeScore.pgs.length;
    let pgSpan = 100 / pgCount;
    // bookmarks for positions right and bottom are on opposite side of those for left and top
    let leftPercent = ["left", "top"].includes(this.position) ? 70 : -10;
    for (let [index, color] of Object.entries(this.pnStash.bookmarks))
      this.elm.append(
        helm(
          `<div data-tag="bookmark" class="Pager__bookmark"
         style='${TOP}:${(index - 1) * pgSpan}%;
           ${HEIGHT}:${pgSpan}%;${WIDTH}:40%;${LEFT}:${leftPercent}%;background:${color};'</div>`
        )
      );
  }

  onDown(e) {
    e.stopImmediatePropagation(); // don't let event propagate to the layout
    let { TOP, WIDTH, HEIGHT, CLIENTX, CLIENTY, X, Y } = this.props;
    let { cursor, pager, pnStash } = this;
    let pgCount = Score.activeScore.pgs.length ;
    let cursorBox = getBox(cursor);
    let pagerBox = getBox(pager);
    let bookmarks = pnStash.bookmarks ;
    pager.setPointerCapture(e.pointerId);
    cursor.classList.add("Pager__cursor-active");

    let ptrDiv = ptrMsg(e,(e,div) => this.formatFunc(pnStash, true, div) && false, `width: ${cursor.style.width};`) ;
    let origin = e[CLIENTY] ;
    let cursorOffset = pagerBox[Y] + cursorBox.height ;

    let setCursor = (clientPos, delta) => {
      // clientPos is vertical (horizontal) position of cursor
      // delta is horizontal (vertical) distance of pointer from middle of cursor...
      delta = Math.max(1, delta / pagerBox.width) ;
      if(delta == 1) origin = clientPos ; // reset origin when delta is 1
      let dY = (clientPos - origin) / delta  ;
      dY += cursorBox[HEIGHT] / 2 ; // middle of cursor
      let newPos = origin + dY - cursorOffset  ;
      cursor.style[TOP] = clamp(newPos, 0, pagerBox[HEIGHT] - cursorBox[HEIGHT]) + "px"; 
      newPos += cursorBox[HEIGHT] / 2 ; // compensate for cursor height
      pnStash.pn = clamp(1, Math.floor((newPos / pagerBox[HEIGHT]) * pgCount) + 1, pgCount) ;
      // are we at a bookmark? 
      let bkCl = bookmarks[pnStash.pn] ;
      if(bkCl) cursor.style.color = ptrDiv.style.color = bkCl ;
      else cursor.style.color = ptrDiv.style.color = "black" ;
      clearChildren(cursor);
      clearChildren(this.cursor);

      this.formatFunc(pnStash, true, this.cursor) ;
    };

    setCursor(e[CLIENTY], Math.abs(e[CLIENTX] - cursorBox[X] - cursorBox[WIDTH]/2));

    this.bMarkTimer.run(_longPressMs_, () => {
      let pn = pnStash.pn;
      if (bookmarks[pn]) {
         delete bookmarks[pn];
         cursor.style.color = "black" ;
         ptrDiv.style.color = "black" ;

      }
      else { let bkCl = bookmarks[pn] = randomColor();
         cursor.style.color = ptrDiv.style.color = bkCl ;
      }
      _body_.dispatchEvent(new CustomEvent("BookmarkChanged"));
    });

    let mv = listen(pager, "pointermove", (emv) => {
      let moved = mvmt(e, emv, 6, 6) ;
      if(moved) this.bMarkTimer.cancel();
      setCursor(emv[CLIENTY], Math.abs(emv[CLIENTX] - cursorBox[X] - cursorBox[WIDTH] / 2));
    });

    listen(pager, "pointerup", (e) => {
        unlisten(mv);
        this.cursor.classList.remove("Pager__cursor-active");
        this.bMarkTimer.cancel();
        this.buildCursor();
        _body_.dispatchEvent(new CustomEvent("PnChanged", { detail: this }));
      },
      { once: true }
    );
  }
}
