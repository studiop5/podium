// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https://www.gnu.org/licenses/>.
**/

import { animate, flung, Schedule, schedule, toast, clamp, css, delay, fontMap, getBox, helm, dataIndex, clearChildren, listen, unlisten } from "./common.js";
import { Grid, Score } from "./score.js";
import { iconPaths } from "./icon.js";
import { Layout } from "./layout.js";
import { checkUnsaved, FileSrc } from "./file.js";
import { panels } from "./panel.js";

export { Menu };

// -skip

/**
class Menu
  A circular menu that implements the entry point for all user
  interaction with Podium.  The single instance of this class is
  created in main.js and accessed through the global _menu_ var.
**/

class Menu {
  static css = css(
    "Menu",
    `
    .Menu {
    }
    .Menu__holder {
      position:absolute;
      clip-path: circle() ;
      transition: opacity .5s; 
      z-index:101 ;
      filter: drop-shadow(.01em .125em .2em #6668);
    } 
    .Menu__ring {
      position:absolute;
      visibility:hidden; 
      z-index:100;
    }
    .Menu__cell {
      text-align: center;
      position:absolute;
      background: radial-gradient(#c9c9c9 45%, #ccc 66%, #b9b9b9 70%);  
    }
    .Menu__cell-contents {
      margin-top:.4em;
      pointer-events:none;
      transform-origin:center;
     }
    .Menu__cell-selected {
      background: radial-gradient(#aaa 25%, #fff 100%);
    } 
    .Menu__cell-active {
      background: radial-gradient(#fff 64%, #ccc 73%) ;
    } 
    .Menu__cell-locked {
      background: radial-gradient(#fff 64%, #ccc 73%) ;
      text-decoration: underline;
      font-style: italic;
      font-weight: bold;
    } 
    .Menu__cell-panel {
    }
    .Menu__cell-panel::after {
      content: "";
      width:2em ;
      height:2em;
      border-radius: .8em;
      background-image: var(--panTexture);
      left:calc(50% - 1em);
      top:-1.25em;
      position:absolute;
    } 
    .Menu__cellIcon {
      transform: translateY(5%) ;
    }
    .Menu__disk {
      position:relative;
      border-radius:50%;
      z-index:103;
      transition: opacity .5s; 
      overflow: hidden;
    }
    .Menu__diskCell {
      text-align: center;
      position:absolute;
      background: radial-gradient(#c9c9c9 54%, #ccc 58%, #b9b9b9 70%);  
    }
    .Menu__cell-disabled {
      color: #888288;
    } 
    .Menu__diskIcon {
      position: absolute ;
      left:50%;
      top:50%;
      transform: translate(-50%,-50%) ;
    }
    .Menu__diskCell-active {
      background: radial-gradient(#fff, #fff 54%, #fff 60%, #ddd 70%);  
    } 
    .Menu__diskCell-selected {
        background: radial-gradient(#ddd, #aaa 100%) ;
    } 
    .Menu__grip {
      position:absolute;
      border-radius:50%;
      z-index:105;
      background-image: var(--panTexture);

    }
    .Menu__grip-selected {
     background: #aaa ;
    } 
     `
  );

  activeRing = null;
  collapsed = false;
  listeners = {};
  rings = {};
  scale = 1;

  /*
     Ascii art rendering of the Menu's dom hierarchy:

                                     elm === menu (pz)
                                          |
                                   ________________
                                  /               \
                            menuHolder       recentColors
                                |
                  _________________________________________________ 
                  /                          / ........ \         \
             diskHolder                   ring*........ ring*     grip
                 |                          |
               disk                      ______
                 |                       /....\
               ____               ringCell*....ringCell*
               /..\                        |
        diskCell*..diskCell*         cellContents*
              |                         /     \
          cellContents*            cellName*   iconSvg*
          /       \
       ringName*   iconSvg*

      *: element(s)    added dynamically     

  */

  elm = helm(`
           <div data-tag="Menu" class="pz Menu" style="z-index:100">
             <div data-tag="menuHolder" class="Menu__holder" >
               <div data-tag="diskHolder" class="Menu__holder">
                 <div data-tag="disk" class="Menu__disk"></div>
               </div>
             </div>
             <div data-tag="grip" class="Menu__grip raisedEdge"></div>
             <datalist data-tag="recentColors" id="recentColors"></datalist>
           </div>`);

  getSizes() {
    // Define sizes of the menu's components. These are em units:
    return {
      ringRadius: 11,
      diskRadius: 6.5,
      gripRadius: 1.75,
      cellGap: 0.05,
      ringGap: 0.05, // i.e. ring cell gap
      cellIcon: 1.85,
      fontSize: 0.8,
    };
  }

  constructor() {
    Object.assign(this, dataIndex("tag", this.elm));
    let elm = this.elm;
    _body_.append(elm);

    this.sizes = this.getSizes();

    this.sizes = {
      // use spread to augment this.sizes with self references
      ...this.sizes,
      ringDiameter: this.sizes.ringRadius * 2,
      diskDiameter: this.sizes.diskRadius * 2,
      gripDiameter: this.sizes.gripRadius * 2,
    };

    let { ringRadius, ringDiameter, diskRadius, diskDiameter,
          gripRadius, gripDiameter } = this.sizes;

    // set width,height, and relative position of elements
    elm.style.width = elm.style.height = 0;

    let menuHolder = this.menuHolder;
    menuHolder.style.width = menuHolder.style.height = ringDiameter + "em";
    menuHolder.style.left = -ringRadius + "em";
    menuHolder.style.top = menuHolder.style.left;

    let diskHolder = this.diskHolder;
    diskHolder.style.width = diskHolder.style.height = diskDiameter + "em";
    diskHolder.style.left = diskHolder.style.top = ringRadius - diskRadius + "em";

    let disk = this.disk;
    disk.style.width = disk.style.height = diskHolder.style.width;
    disk.style.left = disk.style.top = "0em";

    let grip = this.grip;
    grip.style.width = grip.style.height = gripDiameter + "em";
    grip.style.left = grip.style.top = -gripRadius + "em";

    // load initial ring(s) and enable first ring
    this.buildRings();

    this.buildMenu();

    // Add a "key" key to every cell so that, given a cell,
    // we know immediately what its key is
    for (let [ringKey, ringCell] of Object.entries(this.rings)) {
      ringCell["key"] = ringKey;
      for (let [cellKey, cell] of Object.entries(ringCell.cells)) {
        cell["key"] = cellKey;
        if (cell.stash) cell.stash["name"] = cell.name;
      }
    }

    // add class Menu__cell-panel to all cells that have a panels
    for(let ring of Object.values(this.rings))
       for(let cell of Object.values(ring.cells))
          if(panels[cell.name + "Panel"])
             cell.elm.classList.add("Menu__cell-panel") ;

    // set initial cell state
    this.enableCells(["layout", "ink", "ink/paste", "page", "score/close", "score/save", "score/bind", "score/details", "score/print", "page/paste"], false);

    this.stashDefaults = this.stashToJson();

    // load menu stash from localStorage
    try {
      let json = localStorage.getItem("menu") ?? this.stashDefaults;
      this.stashFromJson(json);
    } catch (Error) {
      toast("Clearing invalid local storage stash.");
      localStorage.clear();
    }
    finally {
      // activate last used layout or, if none, Book Layout
      this.activeRing = this.rings.layout ;  // tmp to initialize 
      let active = this.rings.layout.stash.active ;
      if(active) this.activateCell(this.rings.layout.cells[active]) ;
      else this.activateCell(this.rings.layout.cells.book) ;
      // now activate Score ring    
      this.activateRing(this.rings.score) ;
    }

    // initialize user interaction operation object
    this.op = {
      state: null,
      ring: this.rings[0],
      turn: 0,
      turnOffset: 0,
      schedule: new Schedule(),
    };
    this.disk.turn = 0;

    listen(elm, "pointerdown", this.opDown.bind(this));
  }

  async buildRings() {
    // Build the data structures (but not the dom elements)
    // that compose the menu's rings.

    let rings = this.rings ;

    // Score ring
    rings.score = {
      name: "Score",
      cells: {
        open: {
          name: "Open",
          stash: {},
          svgPath: iconPaths["Open"], 

        },
        save: {
          mode: "save",
          name: "Save",
          stash: {},
          svgPath: iconPaths["Save"],
        },
        new: {
          name: "New",
          // Note capitalization of Width, Height, as these tags
          // are shown in the NewScore panel. Values are always in
          // pdf pts
          stash: { pages: 5, size: "A4", Width:595, Height:842 },
          svgPath: iconPaths["New Score"],
        },
        close: { name: "Close", svgPath: iconPaths["Close"] },
        bind: { name: "Bind", svgPath: iconPaths["Bind"] },
        print: { name: "Print", svgPath: iconPaths["Print"] },
        details: { name: "Details", svgPath: iconPaths["Details"], stash: { quality: 2} },
      },
      svgPath: iconPaths["Score"],
      unredo: [], // undo/redo stack
    };

    this.listen("score/up", () => this.activateRing(rings.score));

    this.listen("score/save/up", async (cell) => {
       this.activateCell(cell) ;
       await FileSrc.saveActiveScore(cell) ;
       this.activateCell(null) ;
    }) ;

    this.listen("score/open/up", async (cell) => {
       this.activateCell(cell) ;
       await FileSrc.openActiveScore(cell) ;
       this.activateCell(null) ;
    }) ;

    this.listen(["score/details/out", "score/open/out","score/save/out","score/new/out","score/print/out", "score/bind/out"], (cell) => this.openPanel(cell)) ;

    // The print and bind cells have no /up functionality, so we let /up their cells also open their panel:
    this.listen("score/print/up", (cell) => panels.PrintPanel.get(cell).show().setPosition(this.grip)) ;
    this.listen("score/bind/up", (cell) => panels.PrintPanel.get(cell).show().setPosition(this.grip)) ;

    this.listen("score/new/up", async (cell) => {
      if(!await checkUnsaved()) return ;
      await Score.newScore(
        cell.stash.pages,
        cell.stash.Width,
        cell.stash.Height,
      );
    });

    this.listen("score/close/up", () => {
      Layout.activeLayout.destructor() ;
      Layout.activeLayout.elm.remove();
      Layout.activeLayout = null ;
      Score.activeScore = null;
      _menu_.enableCells(["ink", "page", "layout", "score/save", "score/close", "score/details", "score/print", "score/bind"], false);
    });


    // Layout ring
    rings.layout = {
      cells: {
        book: {
          name: "Book",
          pz: null, // when set, the pz (pan-zoom) structures format is always { left:"0px",top:"0px",fontSize:"2em"} 
          stash: {
            fit: "Auto", // "Auto","Width","Height","None",
            pnShow: "On", // "On" or "Off"
          },
          svgPath: iconPaths["Book"],
        },
        horizontal: {
          name: "Horizontal",
          pz: null,
          stash: {
            fit: "Auto", // "Auto", "Width","Height","None"
            gap: 0.2, // [0,10]% of fit dimension
            pnShow: "On",
            pgShow: 2,
            pgSnap: 2,
          },
          svgPath: iconPaths["Horizontal Scroll"],
        },
        vertical: {
          name: "Vertical",
          pz: null, 
          stash: {
            fit: "Auto", // "Auto", "Width","Height","None"
            gap: 0.2, // [0,10]% of fit dimension
            pnShow: "On",
            pgShow: 2, // [1,Score.activeScore.pages.length)
            pgSnap: 2,
          },
          svgPath: iconPaths["Vertical Scroll"],
        },
        table: {
          name: "Table",
          pz: null,
          stash: {
            fit: "Auto", // "Auto", "Width","Height" (note: no "None")
            pages: 4, // [2,Score.activeScore.pages.length)
            horizontalGap: 0, // [-100,100]%
            verticalGap: 0, // [-100,100]%
            pnShow: "On",
          },
          svgPath: iconPaths["Table"],
        },
        screen: {
          name: "Screen",
          stash: { },
          svgPath: iconPaths["Full Screen"],
        },

      },
      name: "Layout",
      stash: { active: "book", },
      svgPath: iconPaths["Layout"],
    } ;

    // actions:

    this.listen("layout/up", () => this.activateRing(rings.layout));
    let paths = Object.keys(rings.layout.cells).map((path) => `layout/${path}/`) ;
   
    this.listen(paths.map((path) => path + "up"), 
      async (cell) => {
        this.activateCell(cell);
        await Layout.open(cell);
      }
    );

    this.listen(paths.map((path) => path + "out"), (cell) => this.openPanel(cell));

    this.listen("layout/screen/up", (cell) => {
      let cellIcon = dataIndex("tag", rings.layout.cells.screen.elm).cellIcon ;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        cellIcon.innerHTML = iconPaths["Normal Screen"];
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
        cellIcon.innerHTML = iconPaths["Full Screen"];
      }
    });


    // Ink ring
    rings.ink = {
      cells: {
        transform: {
          name: "Transform",
          svgPath: iconPaths["Transform"] },
        pencil: {
          name: "Pencil",
          svgPath: iconPaths["Pencil"],
          stash: { alpha:"1",  rgb: "#000000", style:"Free", width: 1.5},
        },
        pen: {
          name: "Pen",
          svgPath: iconPaths["Pen"],
          stash: { alpha:"1",  rgb: "#000000", style:"L-R", width: 1.5},
        },
        rastrum: {
          name: "Rastrum",
          svgPath: iconPaths["Rastrum"],
            stash: {  alpha:"1", gap:5, bars:1, lines: 5, rgb: "#000000", style:"L-R", width: .75, bars:1,barsWidth:.75}, // "L-R" or "T-B"
        },
        text: {
          name: "Text",
          svgPath: iconPaths["Text"],
          stash: {alpha:"1", font: "Times-Roman", size: 12, height: 12, rgb: "#000000"},
        },
        symbols: {
          name: "Symbols",
          svgPath: iconPaths["Symbols"],
          stash: {alpha:"1", rgb:"000000", font: "Bravura", size: 12, height: 12,rgb: "#000000", group: "4.5. Clefs", codePoint: "\ue050"},
        },
        undo: {
          name: "Undo",
          svgPath: iconPaths["Undo"],
          stash: {},
        },
        grid: {
          name: "Grid",
          panel: "GridPanel",
          svgPath: iconPaths["Grid"],
          // units are Inch or Metric, while xStep and yStep are values in
          // [0-3] that are interpreted as 1",1/2",1/4",1/8" (units == Inch)
          // or 4em, 2cm, 1cm 1/2cm [units == Metric]
          stash: {units:"Inch", xStep: 2, yStep:2, snap:"Snap", numbers:"On"},
        },
        cut: {
          name: "Cut",
          svgPath: iconPaths["Cut"],
        },
        copy: {
          name: "Copy",
          svgPath: iconPaths["Copy"],
        },
        paste: {
          name: "Paste",
          svgPath: iconPaths["Paste"],
        },

      },
      name: "Ink",
      stash: { active: "pencil", 
               recentColors:["#ff0000","#00ff00","#0000ff","#ffff8f","#ffa500","#000000","#333333","#666666","#999999","#cccccc"] },
      svgPath: iconPaths["Ink"],
    };

    this.listen("ink/up", () => this.activateRing(rings.ink));

    paths = Object.keys(rings.ink.cells).map((key) => `ink/${key}/`) ;
    this.listen(paths.map((path) => path + "up"),(cell) => this.activateCell(rings.ink.activeCell === cell ? null :cell));
    this.listen(paths.map((path) => path + "long"),(cell) => this.activateCell(cell, true));
    this.listen(paths.map((path) => path + "out"),(cell) => this.openPanel(cell)) ; 

    // Page ring
    rings.page = {
      cells: {
        numbers: {
          name: "Numbers",
          svgPath: iconPaths["Numbers"],
          stash: { pn: 1, first: 1, prelim: 0, bookmarks: {}, forward: "Pages", reverse: "Pages" },
        },

        add: {
          name: "Add",
          svgPath: iconPaths["New Page"],
          stash: { rgb: "#ffffff", alpha: 1.0, type: "Blank" },
        },
        cut: { name: "Cut", svgPath: iconPaths["Cut Page"] },
        copy: { name: "Copy", svgPath: iconPaths["Copy Page"] },
        paste: { name: "Paste", svgPath: iconPaths["Paste Page"] },
        merge: { name: "Merge", svgPath: iconPaths["Merge"] },
      },
      name: "Page",
      stash: {},
      svgPath: iconPaths["Page"],
    };

    // actions:
    this.listen("page/up", () => this.activateRing(rings.page));
    paths = Object.keys(rings.page.cells).map((path) => `page/${path}/`) ;
    this.listen(paths.map((path) => path + "up"), (cell) => this.activateCell(rings.page.activeCell === cell ? null :cell)) ;
    this.listen(paths.map((path) => path + "long"), (cell) => this.activateCell(cell, true)) ;
    this.listen(paths.map((path) => path + "out"), (cell) =>  this.openPanel(cell)) ;


    // More ring
    rings.more = {
      cells: {
        metronome: {
          name: "Metronome",
          svgPath: iconPaths["Metronome"],
          stash: {
            tempo: 60,
            state: "Pause",
            pattern: "metronome",
          },
        },
        stopwatch: {
          name: "Stopwatch",
          svgPath: iconPaths["Stopwatch"],
          stash: {},
        },
        clock: { name: "Clock", svgPath: iconPaths["Clock"], stash: {} },
        piano: {
          name: "Piano",
          svgPath: iconPaths["Piano"],
          // a4 is cents offset from 440 Hz
          stash: { a4: 0, temperament: "Equal", timbre: "piano", voices: 4 },
        },
        review: {
          name: "Review",
          svgPath: iconPaths["Review"],
          stash: {
            audioSrc: "Audio 1",
            videoSrc: "Video 1",
            mode: "Mirror",
            mirror: "Reflect",
            replay: 15,  // mimimum replay time in seconds
          },
        },
        volume: {
          name: "Volume",
          svgPath: iconPaths["Volume"],
          stash: { volume:1},
        },
        help: { name: "Help", svgPath: iconPaths["Help"], stash: {} },
      },
      name: "More",
      stash: { active: null },
      svgPath: iconPaths["More"],
    };

    this.listen("more/up", () => this.activateRing(rings.more));

    paths = Object.keys(rings.more.cells).map((path) => `more/${path}/`) ;
    this.listen(paths.map((path) => path + "out"),  (cell) => this.openPanel(cell)) ;

    // grip: no cells here, just handlers
    this.listen("up", () => this.collapse());
    this.listen("long", () => this.park());

    // Add a "key" key to every cell so that, given a cell,
    // we know immediately what its key is. Add a "ring" entry
    // to every (non-ring) cell so that, given such a cell,
    // we know immediately what ring it is on.
    for (let [ringKey, ringCell] of Object.entries(this.rings)) {
      ringCell["key"] = ringKey;
      for (let [cellKey, cell] of Object.entries(ringCell.cells)) {
        cell["key"] = cellKey;
      }
    }

  }

  buildMenu() {
    // build the menu's dom representation according to definition in this.rings
    let { diskDiameter, diskRadius, ringDiameter, ringRadius, ringGap, fontSize, cellGap, cellIcon } = this.sizes;
    // Build clipPath for disk cells.
    let clipPath = "circle(50%)"; // with 0 or 1 rings, nothing to clip
    let diskEntries = Object.entries(this.rings);
    let ringKnt = diskEntries.length;
    if (ringKnt >= 2) {
      let c = diskRadius;
      let theta = (2 * Math.PI) / (ringKnt * 2);
      let x = Math.sin(theta) * diskDiameter;
      let y = Math.cos(theta) * diskDiameter;
      clipPath = `polygon(${c - ringGap}em ${c}em,` + `${c + x - ringGap}em ${c - y}em,` + `${c - x + ringGap}em ${c - y}em,` + `${c + ringGap}em ${c}em)`;
    }

    diskEntries.forEach(([diskKey, ring], index) => {
      ring.elm = helm(`<div data-tag="ring" style="width:${ringDiameter}em;height:${ringDiameter}em;" class="Menu__ring"></div>`);
      ring.turn = 0;
      this.menuHolder.append(ring.elm);
      let rotation = index / ringKnt;
      let diskCellElm = helm(
        `<div data-tag="diskCell" style="width:${diskDiameter}em;height:${diskDiameter}em;clip-path:${clipPath};transform:rotate(${rotation}turn);"
            class="Menu__diskCell" data-key="${diskKey}">
          <div data-tag="cellContents" class="Menu__cell-contents" style="transform:rotate(${-rotation}turn)">
            <div data-tag="cellName" style="font-size:${fontSize}em;pointer-events:none;"><br>${ring.name}</div>
            <svg data-tag="cellIcon"
              style="width:${cellIcon}em;height:${cellIcon}em;pointer-events:none" class="cellIcon" viewBox="0 0 24 24">
              ${ring.svgPath}
            </svg>
         </div>

       </div>`
      );
      this.disk.append(diskCellElm);
      ring.cellElm = diskCellElm;
      ring.iconSvg = dataIndex("cellIcon", diskCellElm)["iconSvg"];

      // add ringCells for this ring to ring.elm
      {
        let clipPath = "circle(50%)"; // with 0 or 1 cells, nothing to clip
        let cellEntries = Object.entries(ring.cells);
        let cellKnt = cellEntries.length;
        if (cellKnt >= 2) {
          // Build clipPath for cells..triangular centered on vertical axis
          let c = ringRadius;
          let theta = (2 * Math.PI) / (cellKnt * 2);
          let x = Math.sin(theta) * ringDiameter;
          let y = Math.cos(theta) * ringDiameter;
          clipPath = `polygon(${c - cellGap}em ${c}em,` + `${c + x - cellGap}em ${c - y}em,` + `${c - x + cellGap}em ${c - y}em,` + `${c + cellGap}em ${c}em)`;
        }

        cellEntries.forEach(([cellKey, cell], index) => {
          let rotation = ring.elm.childElementCount / cellKnt;
          cell.elm = helm(`<div data-tag="ringCell" style="width:${ringDiameter}em;height:${ringDiameter}em;clip-path:${clipPath};transform:rotate(${rotation}turn);" class="Menu__cell"
             data-key="${diskKey + "/" + cellKey}">
           <div data-tag="cellContents" class="Menu__cell-contents" style="transform:rotate(${-rotation}turn);">
             <div data-tag="cellName" style="font-size:${fontSize}em;"><br>${cell.name}</div>
             <svg data-tag="cellIcon" style="width:${cellIcon}em;height:${cellIcon}em;" class="cellIcon" viewBox="0 0 24 24">
               ${cell.svgPath}
             </svg>
          </div>
        </div>`);
          ring.elm.append(cell.elm);
          cell.ring = ring;
        }); // forEach((cell)
      }
    }); // forEach(([key, ring
  }

  // event operation handles:

  opDown(e) {
    if (e.ctrlKey || e.shiftKey) return;
    let op = this.op;
    op.schedule.cancel();
    let keys = e.target.dataset.key || "grip";
    if (!keys) return;
    let { ringRadius, diskRadius, gripRadius } = this.sizes;
    let box = getBox(this.menuHolder);
    let dxdy = [e.clientX - box.x, e.clientY - box.y];

    let [ringKey, cellKey] = keys.split("/");

    // Allow user interaction to spin the disk or ring only when pointer is within 20% of edge of disk or ring
    let ptrOffset = Math.hypot(e.clientX - this.elm.offsetLeft, e.clientY - this.elm.offsetTop) / (_pxPerEm_ * parseFloat(this.elm.style.fontSize));
    let canSpin = true;
    if (ringKey != "grip") {
      if (cellKey) canSpin = ptrOffset / this.sizes.ringRadius > 0.80;
      else canSpin = ptrOffset / this.sizes.diskRadius > 0.80;
    }

    Object.assign(op, {
      e: e,
      emv: null,
      ringKey: ringKey,
      cellKey: cellKey,
      completed: false,
      state: ringKey == "grip" ? "grip" : cellKey ? "ring" : "disk",
      moved: false,
      origin: { x: e.clientX, y: e.clientY },
      ring: this.activeRing,
      out: false,
      canSpin: canSpin,
      spun: false, // set to true when ring or disk is spun a minimal amount
      turn0: null, // initial turn on pointerDown
      turn: null, // current turn, updates with rotation
    });
    this.elm.setPointerCapture(e.pointerId);
    // op.turn will be in  "turns", with range (.75, 1.75),
    // and with 1 at the top.  This allows us to turn without
    // the value going negative.

    let ringRadiusPx = op.ring.elm.offsetWidth / 2;
    op.turn = op.turn0 = Math.atan2(dxdy[1] - ringRadiusPx, dxdy[0] - ringRadiusPx) / (Math.PI * 2) + 1.25;
    this.startAngle = op.turn;
    switch (op.state) {
      case "ring": {
        op.turnOffset = op.turn - op.ring.turn;
        op.cell = this.rings[ringKey].cells[cellKey];
        if (op.cell.enabled == false) break;
        op.cell.elm.classList.add("Menu__cell-selected");
        this.notify(`${ringKey}/${cellKey}/down`);
        op.schedule.run(_longPressMs_, () => {
          op.completed = true;
          this.notify(`${ringKey}/${cellKey}/long`);
          op.cell.elm.classList.remove("Menu__cell-selected");
        });
        break;
      }
      case "disk": {
        this.disk.turnOffset = op.turn - this.disk.turn;
        let cellTurn = 1 / this.rings.length;
        op.ring = this.rings[ringKey];
        if (op.ring.enabled == false) break;
        op.ring.cellElm.classList.add("Menu__diskCell-selected");
        this.notify(`${ringKey}/down`);
        break;
      }
      case "grip": {
        this.notify("down");
        this.grip.classList.add("Menu__grip-selected");
        op.schedule.run(
          _longPressMs_,
          () => {
            op.completed = true;
            this.notify("long");
            this.grip.classList.remove("Menu__grip-selected");
          },
          this
        );
      }
    }
    op.moveListener = listen(this.elm, "pointermove", this.opMove.bind(this));
    op.upListener = listen(this.elm, "pointerup", this.opUp.bind(this));
  }

  opMove(e) {
    let op = this.op;

    op.emv = e;
    if (op.completed) return;

    // Test if we have a move out operation
    if (!op.spun) {
      let hyp = Math.hypot(e.clientX - this.elm.offsetLeft, e.clientY - this.elm.offsetTop);
      if (op.state == "ring" && (op.out || hyp > this.menuHolder.offsetWidth / 2 || hyp < this.diskHolder.offsetWidth / 2)) {
        op.schedule.cancel();
        op.out = true;
        return this.notify(`${op.ringKey}/${op.cellKey}/out`);
      } else if (op.state == "disk" && (op.out || hyp > this.diskHolder.offsetWidth / 2 || hyp < this.grip.offsetWidth / 2)) {
        op.schedule.cancel();
        op.out = true;
        return this.notify(`${op.ringKey}/out`);
      }
    }

    if (op.out) return;
    let ringRadiusPx = this.sizes.ringRadius * parseFloat(this.elm.style.fontSize) * _pxPerEm_;
    let elm = this.menuHolder;
    let box = getBox(elm);
    let dxdy = [e.clientX - box.x, e.clientY - box.y];
    // we keep op.turn positive by adding on 1.25
    op.turn = Math.atan2(dxdy[1] - ringRadiusPx, dxdy[0] - ringRadiusPx) / (Math.PI * 2) + 1.25;
    // how much has either disk been spun? ... want to ignore jitter
    if (op.state != "grip" && Math.abs(op.turn - op.turn0) > 0.05) {
      op.schedule.cancel();
      op.spun = true;
    }
    // how much has the menu been dragged?
    if (!op.moved && (Math.abs(e.clientX - op.origin.x) > 25 || Math.abs(e.clientY - op.origin.y) > 25)) {
      op.schedule.cancel();
      op.moved = true;
    }

    switch (op.state) {
      case "ring": {
        if (op.canSpin) {
          ///
          op.ring.turn = op.turn - op.turnOffset;
          op.ring.elm.style.transform = `rotate(${op.ring.turn}turn)`;
          let rotation = 1 / op.ring.elm.childElementCount;
          [...op.ring.elm.children].forEach((elm, i) => (elm.firstElementChild.style.transform = `rotate(${-rotation * i - op.ring.turn}turn)`));
          if (!op.spun) return; // insufficient movement
          // issue spin notification, i.e. spin in progress
          this.notify(`${op.ringKey}/${op.cellKey}/spin`);
          op.cell.elm.classList.remove("Menu__cell-selected");
        }
        break;
      }
      case "disk": {
        if (op.canSpin) {
          this.disk.turn = op.turn - this.disk.turnOffset;
          this.disk.style.transform = `rotate(${this.disk.turn}turn)`;
          let rotation = 1 / this.disk.childElementCount;
          [...this.disk.children].forEach((elm, i) => (elm.firstElementChild.style.transform = `rotate(${-rotation * i - this.disk.turn}turn)`));
          if (!op.spun) return; // insufficient movement
          this.notify(`${op.ringKey}/spin`);
          op.ring.cellElm.classList.remove("Menu__diskCell-selected");
        }
        break;
      }
      case "grip": {
        if (!op.moved) return; // insufficient movement
        // Move the menu while ensuring that the grip cannot be dragged out of the viewport
        this.elm.style.left = clamp(e.clientX, 0, window.innerWidth) + "px";
        this.elm.style.top = clamp(e.clientY, 0, window.innerHeight) + "px";
        this.notify("move");
        op.schedule.cancel();
        break;
      }
      default:
        break;
    }
  }

  opUp(e) {
    let op = this.op;
    op.schedule.cancel();
    unlisten(op.moveListener, op.upListener);
    op.cell && op.cell.elm.classList.remove("Menu__cell-selected");
    op.ring && op.ring.cellElm.classList.remove("Menu__diskCell-selected");
    this.grip.classList.remove("Menu__grip-selected");
    if (op.spun) return;
    // if a long press handler has run, it will have issued an
    // appropriate notification and set op.completed to true.
    if (op.out || op.completed) return;
    switch (op.state) {
      case "ring":
        this.notify(`${op.ringKey}/${op.cellKey}/up`);
        break;
      case "disk":
        this.notify(`${op.ringKey}/up`);
        break;
      case "grip":
        if (flung(op.emv, e)) {
          // fling
          if (!this.collapsed) this.collapse();
          this.elm.style.transition = "left .5s, top .5s";
          this.elm.style.left = e.clientX > op.e.clientX ? "100vw" : "0vw";
          this.elm.style.top = e.clientY > op.e.clientY ? "100vh" : "0vh";
          schedule(500, () => (this.elm.style.transition = "none"));
        } else if (!op.moved) this.notify("up");
    }
  }

  // cell functionality

  activateRing(ring) {
    // Potentially, activate the given ring's ring cell by
    // visually to mark it and setting this.activeRing to ring.
    // But: - a disabled ring cell will not be activated.
    //      - only 1 ring cell can be active at a time, so
    //        any previous active ring cell will be deactivated.
    if (ring.cellElm.classList.contains("Menu__cell-disabled")) return; // ring cell disabled -> ignore
    if (this.activeRing == ring) return; // no change
    if (this.activeRing) {
      // Deactivate current active ring
      this.activeRing.elm.style.visibility = "hidden";
      this.activeRing.cellElm.classList.remove("Menu__diskCell-active");
    }
    ring.elm.style.visibility = "visible";
    ring.cellElm.classList.add("Menu__diskCell-active");
    this.activeRing = ring;
    // Score is editable iff ink is activeRing, and it has an activeCell
    if(Score.activeScore) Score.activeScore.setEditable(ring.key == "ink" && ring.activeCell) ;
  }

  activateCell(cell, lock = false) {
    // Overlay a div onto given cell of active ring visually mark it as active.
    // If lock is true, cell is marked as active and locked.
    // Call with cell = null to deactivate active cell (if any) on the active ring
    // Only 1 cell per ring can be active at a time, so if the ring
    // had an active cell before this call, it will be deactivated.
    let ring = this.activeRing;
    if (!lock && ring?.activeCell == cell) return;
    if (ring?.activeCell) ring.activeCell.elm.classList.remove("Menu__cell-active", "Menu__cell-locked");
    if (cell) {
      cell.elm.classList.add(lock ? "Menu__cell-locked" : "Menu__cell-active");
      ring.activeCell = cell;
      ring.stash.active = cell.key;
    } else ring.activeCell = null;
    // Score is editable iff ink is activeRing, and it has an activeCell
    if(Score.activeScore) Score.activeScore.setEditable(ring.key == "ink" && ring.activeCell) ;
  }

  enableCells(cellPath, enable = true) {
    // enable/disable a cell or ring cell, as determined by
    // cellPath string, ex. "score/close".  cellPath can be an array,
    // ex. ["ink", "score/close"], allowing multiple cells to be disabled/enabled.
    if (Array.isArray(cellPath)) return cellPath.forEach((path) => this.enableCells(path, enable));
    let [ringKey, cellKey] = cellPath.split("/");
    let cell = cellKey ? this.rings[ringKey].cells[cellKey] : this.rings[ringKey];
    let classList = cellKey ? cell.elm.classList : cell.cellElm.classList;
    enable ? classList.remove("Menu__cell-disabled") : classList.add("Menu__cell-disabled");
    cell.enabled = enable;
  }

  listen(path, func) {
    // path is a single path ("diskCell/<<action>>" or "diskCell/ringCell/<<actionkey>>"),
    // or a list of such paths.
    // Add a listener for each path, provided it isn't already defined.
    // Supply a  falsey value to func to delete an existing listener...
    // To redefine an already defined listener, first delete it.
    if (Array.isArray(path)) {
      path.forEach((key) => this.listen(key, func));
      return;
    }
    if (this.listeners[path] && !func) delete this.listeners[path];
    else this.listeners[path] = func;
  }

  notify(path) {
    if (path in this.listeners) {
      let parts = path.split("/");
      parts.pop();
      let [ringKey, cellKey, op] = parts;
      let cell = this.rings[ringKey];
      if (cellKey) cell = cell.cells[cellKey];
      let elm = cell?.elm || cell?.cellElm;
      // ignore if disabled
      if (elm?.classList.contains("Menu__cell-disabled")) return;
      this.listeners[path](cell);
    }
  }

  openPanel(cell) {
    // Called continuously from opMove when user is dragging out from a cell.
    // Opens (if not on-screen) the panel associated with @cell, iff it has one...,
    // then moves ths panel's header to pointer location (this.op.e)
    let panel = panels[cell.name + "Panel"]?.get(cell);
    if (!panel) return;

    if (panel.elm.style.visibility != "visible") panel.show();
    Object.assign(panel.elm.style, {
      left: this.op.emv.clientX - panel.elm.offsetWidth / 2 + "px",
      top: this.op.emv.clientY + panel.panel.offsetHeight / 2 - panel.header.offsetHeight / 2 + "px",
    });
    cell.elm.classList.remove("Menu__panel");
  }

  // stash serialization functions:

  stashFromJson(stashJson) {
    // Load all stashes from given data string, stashJson.
    this.stashFromJsonObj(JSON.parse(stashJson));
  }

  stashFromJsonObj(stashJsonObj) {
    // This merges stashJsonObj onto menu's stashes
    let version = stashJsonObj.version;
    if (!version) return;
    if (version != _podiumVersion_) {
      toast("Podium version mismatch, ignoring stash");
      return;
    }
    for (let [ringKey, ringValue] of Object.entries(stashJsonObj)) {
      let ring = this.rings[ringKey];
      if (!ring) continue;
      try {
        let { stash, cells } = ringValue;
        ring.stash = ring.stash ?? {};
        Object.assign(ring.stash, stash);
        for (let [cellKey, cellStash] of Object.entries(cells)) {
          let cell = ring.cells[cellKey];
          if (!cell) continue;
          cell.stash = cell.stash ?? {};
          Object.assign(cell.stash, cellStash);
        }
      } catch {
        // ignore corrupt entry
      }
    }
  }

  stashToJson() {
    return JSON.stringify(this.stashToJsonObj());
  }

  stashToJsonObj() {
    try {
      let stash = {};
      for (let [ringKey, ring] of Object.entries(this.rings)) {
        stash[ringKey] = {};
        let cells = {};
        for (let [cellKey, cell] of Object.entries(ring.cells)) {
          if (cell.stash) cells[cellKey] = cell.stash;
        }
        stash[ringKey].stash = ring.stash;
        stash[ringKey].cells = cells;
      }
      stash.version = _podiumVersion_;
      return stash;
    } catch (error) {
      toast("Stash creation failed, ignoring: " + error);
      return {};
    }
  }

  stash() {
    localStorage.setItem("menu", this.stashToJson());
  }

  // menu positioning functions:

  center(reset = false) {
    // move to the center of the current window
    animate(this.elm, null, { 
       left: window.innerWidth / 2 + "px",
       top: window.innerHeight / 2 + "px",
    }, ` ${_gs_}s`) ;
    if (this.collapsed) this.collapse();

    if (reset) {
      this.op.turnOffset = 0;
      this.disk.turn = 0;
      if (this.op.ring) this.op.ring.turn = 0;
      this.disk.turnOffset = 0;
      let diskEntries = Object.entries(this.rings);
      let ringKnt = diskEntries.length;
      animate(this.disk, null, { transform: "rotate(0turn)" }, `${_gs_}s`);
      diskEntries.forEach(([diskKey, ring], index) => {
        let rotation = index / ringKnt;
        ring.cellElm.style.transform = `rotate(${rotation}turn`;
        ring.cellElm.firstElementChild.style.transform = `rotate(${1 - rotation}turn`;
        let cellEntries = Object.entries(ring.cells);
        let cellKnt = cellEntries.length;
        animate(ring.elm, null, { transform: "rotate(0turn)" }, `${_gs_}s`);
        cellEntries.forEach(([cellKey, cell], index) => {
          let rotation = index / cellKnt;
          cell.elm.style.transform = `rotate(${rotation}turn)`;
          cell.elm.firstElementChild.style.transform = `rotate(${1 - rotation}turn)`;
        });
      });
    }
  }

  collapse() {
    this.op.completed = true;
    let holder = this.menuHolder;
    if (this.collapsed) {
      this.collapsed = false;
      holder.style.transition = "all .618s ease-in";
      holder.style.transform = "scale(1)";
      schedule(618, () => (holder.style.transition = "unset"));
    } else {
      holder.style.transition = "all .618s ease-in";
      holder.style.transform = "scale(0)";
      schedule(618, () => (holder.style.transition = "unset"));
      this.collapsed = true;
    }
  }

  park() {
    // collapse menu and move to upper left corner to be out of the way
    this.elm.style.transition = "left .618s, top 0.618s";
    this.elm.style.top = this.elm.style.left = -this.elm.offsetWidth / 2 + this.grip.offsetWidth * 0.22 + "px";
    schedule(618, () => (this.elm.style.transition = "none"));
    if (!this.collapsed) this.collapse();
  }

  reset() {
    // reset cells to state for new score:
    // i.e. deactivate active cell (if any) on ink and page rings
    // is deactivated
    let activeRing = this.activeRing;
    this.activeRing = this.rings.ink;
    this.activateCell(null);
    this.activeRing = this.rings.page;
    this.activateCell(null);
    this.activeRing = activeRing;
  }

  // Score Pg event handlers, called from Pg's to interpret
  // user page interaction according to current state of
  // the menu.

  async pgDownEvent(options, pg) {
    let addObj = (obj) => {
      pg.canvas.add(obj);
      this.added = obj;
      pg.canvas._target = obj;
      // Prevent canvas._onMouseDown from recursively calling this.pgDownEvent:
      options.e.disarm = true;
      delay(1, () => pg.canvas._onMouseDown(options.e));
    };

    if (this.activeRing.key != "ink") return;
    let activeCell = this.activeRing.activeCell;

    if (!activeCell) return;

    switch (activeCell.key) {
      case "undo":
        return await pg.undo();
      case "pencil":
      case "pen": {
        let { alpha, rgb, width, style } = activeCell.stash;
        let color = fabric.Color.fromHex(rgb);
        color.setAlpha(alpha);
        let rgba = color.toRgba();
        let brush;
        if (style == "Free") {
          brush = new fabric.PencilBrush(pg.canvas);
          brush.width = width;
          brush.color = rgba;
        } else brush = new fabric.LineBrush(pg.canvas, activeCell.stash, rgba);
        pg.canvas.freeDrawingBrush = brush;
        pg.canvas.isDrawingMode = true;
        return;
      }

      case "grid": {
        // toggle grid on/off
        if (pg.grid) pg.grid = pg.grid.destructor();
        else pg.grid = new Grid(pg, activeCell.stash, options);
        return;
      }

      case "rastrum": {
        let { alpha, rgb } = activeCell.stash;
        let color = fabric.Color.fromHex(rgb);
        color.setAlpha(alpha);
        let rgba = color.toRgba();
        this.added = new fabric.RastrumBrush(pg.canvas, activeCell.stash, rgba);
        pg.canvas.freeDrawingBrush = this.added;
        return (pg.canvas.isDrawingMode = true);
      }

      case "text": {
        let { font, size, height, rgb, alpha } = activeCell.stash;
        let color = fabric.Color.fromHex(rgb);
        color.setAlpha(alpha);
        let rgba = color.toRgba();
        let config = {
          fill: rgba,
          fontSize: size,
          lineHeight: height / size,
          editable: true,
          selectable: true,
          cursorColor: "black",
          left: options.absolutePointer.x,
          top: options.absolutePointer.y,
          hasControls: false,
        };
        Object.assign(config, fontMap[font]);
        return addObj(new fabric.Textbox("Abc", config));
      }

      case "symbols": {
        let { alpha, codePoint, height, rgb, size } = activeCell.stash;
        let color = fabric.Color.fromHex(rgb);
        color.setAlpha(alpha);
        let rgba = color.toRgba();
        let config = {
          fill: rgba,
          fontSize: size,
          lineHeight: height / size,
          editable: false,
          selectable: true,
          cursorColor: "black",
          left: options.absolutePointer.x,
          top: options.absolutePointer.y,
          hasControls: false,
        };
        Object.assign(config, fontMap["Bravura"]);
        return addObj(new fabric.Textbox(codePoint, config));
      }

      case "cut": {
        if (options.target) {
          this.pasteObj = options.target;
          pg.canvas.discardActiveObject();
          delay(1, () => {
            pg.canvas.remove(this.pasteObj);
            pg.canvas.requestRenderAll();
          });
          this.enableCells("ink/paste", true);
        }
        return;
      }

      case "copy": {
        if (options.target) {
          pg.canvas.discardActiveObject();
          options.target.clone((clone) => (this.pasteObj = this.added = clone));
          this.enableCells("ink/paste", true);
        }
        return;
      }

      case "paste": {
        if (this.pasteObj) {
          this.pasteObj.clone((clone) => {
            clone.set({
              left: options.absolutePointer.x,
              top: options.absolutePointer.y,
            });
            addObj(clone);
          });
        }
        return;
      }
    }
  }

  pgUpEvent(opts, pg) {
    Score.activeScore.setDirty(true) ;
    if (pg) {
      if (this.added) {
        pg.canvas.discardActiveObject(this.added).requestRenderAll();
        this.added.hasControls = true;
        if (this.added.type == "Text") this.added.selectAll();
      }
      this.added = null;
    }
    for (let pg of Score.activeScore.pgs) if (pg.inflated) pg.canvas.isDrawingMode = false;
    if (!this.activeRing?.activeCell?.elm.classList.contains("Menu__cell-locked")) this.activateCell(null);
  }

  setPasteObj(dataUrl, type) {
    // This is called from file.js after an image file has been
    // loaded from a source using src/file.js. It populates this.pasteObj with
    // fabric.Image object created from the given dataUrl.
    switch (type) {
      case "image/jpeg":
      case "image/png": {
        fabric.Image.fromURL(
          dataUrl,
          (img) => {
            // If necessary, scale image so that it will fit the Score
            let { maxWidth, maxHeight } = Score.activeScore;
            if (img.width > img.height && img.width > maxWidth) img.scaleToWidth(maxWidth);
            else if (img.height > maxHeight) img.scaleToHeight(maxHeight);
            this.pasteObj = img;
            this.enableCells("ink/paste", true);
          },
          { crossOrigin: "anonymous" }
        );
        break;
      }
      default:
        throw new Error(`menu.setPasteObj: unsupported media type: ${type}`);
    }
  }
}
