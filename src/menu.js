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

import { animate, clamp, css, dataIndex, delay, delayMs, Drag, fontMap, getBox, helm, hide, listen, mergeRecent,Schedule, schedule, toast, unlisten } from "./common.js";
import { checkUnsaved, FileSrc } from "./file.js";
import { iconPaths } from "./icon.js";
import { Layout } from "./layout.js";
import { panels, EditPanel } from "./panel.js";
import { Grid, Score } from "./score.js";

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
      position: absolute;
    }
    .Menu__holder {
      position: absolute;
      transition: opacity var(--transition-slow);
      z-index: 101;
      filter: drop-shadow(.3em .3em .3em #0001);
      transform: translateZ(0); /* fix for ipad compositing */
      will-change: transform; /* fix for ipad compositing */
      border-radius: 50%;
      overflow: hidden;
      /* clip-path (unlike border-radius/overflow) clips hit-testing too, so the
         corners — and the cell clip-path triangles, which extend to the bbox
         corners — are not hittable outside the circle. */
      clip-path: circle(50%);
      /* border-radius clips the corners visually but NOT for hit-testing, so a
         pointerdown in a rounded-off bbox corner would otherwise land on this
         rectangular container (which carries no data-key) and opDown's
         dataset.key-or-grip fallback would treat it as a grip. Make the
         containers non-hittable; the interactive cells/grip opt back in below. */
      pointer-events: none;
    }
    .Menu__ring {
      position: absolute;
      visibility: hidden;
      z-index: var(--z-menu);
    }
    .Menu__cell {
      text-align: center;
      position: absolute;
      background: var(--menu-cell-bg);
      color: var(--menu-icon-color);
      box-shadow: var(--menu-cell-box-shadow);
      pointer-events: auto; /* opt back in: the holder above is pointer-events:none */
    }
    .Menu__cell-contents {
      margin-top: var(--spacing-sm);
      pointer-events: none;
      transform-origin: center;
      position: relative;
      z-index: 1;
     }
    .Menu__cell-selected {
      background: var(--menu-cell-selected-bg);
    }
    .Menu__cell-active {
      background: var(--menu-cell-active-bg);
    }
    .Menu__cell-panel {
    }
    .Menu__cell-panel::after {
      content: "";
      width: 0.3em;
      height: 0.6em;
      background: var(--menu-panel-indicator);
      clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
      left: calc(50% - .075em );
      top: 0.13em;
      position: absolute;
      box-shadow: -0.02em -0.02em 0.04em var(--menu-panel-indicator-highlight) inset,
                  0.02em 0.02em 0.04em var(--menu-panel-indicator-shadow) inset;
    }
    .Menu__cellIcon {
      transform: translateY(5%);
    }
    .Menu__disk {
      position: relative;
      border-radius: 50%;
      z-index: 103;
      transition: opacity var(--transition-slow);
      overflow: hidden;
      filter: var(--menu-disk-shadow);
    }
    .Menu__diskCell {
      text-align: center;
      position: absolute;
      background: var(--menu-disk-bg);
      color: var(--menu-icon-color);
      pointer-events: auto; /* opt back in: the holder above is pointer-events:none */
    }
    .Menu__cell-disabled {
      color: var(--color-text-muted);
    }
    .Menu__cell-locked::before {
      content: "";
      width: 0.6em;
      height: 0.6em;
      background: transparent;
      border: 0.1em solid var(--menu-panel-indicator);
      border-radius: 50%;
      left: calc(50% - 0.3em);
      top: 0.055em;
      position: absolute;
    }
    .Menu__diskIcon {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }
    .Menu__diskCell-active {
      background: var(--menu-cell-active-bg);
    }
    .Menu__diskCell-selected {
        background: var(--menu-cell-selected-bg);
    }
    .Menu__grip {
      position: absolute;
      border-radius: 50%;
      z-index: 105;
      background: var(--menu-grip-bg);
      background-image: var(--panTexture);
      filter: var(--menu-grip-shadow);
      box-shadow: var(--menu-grip-box-shadow);
    }
    .Menu__grip-selected {
     background: var(--menu-grip-selected-bg);
    }
    `
  );

  activeRing = null;

  collapsed = false;
  listeners = {};
  rings = {};
  scale = 1;

  // The autoOff scheduler  (_menu_.autoOff.run()) will deactivate the
  // current cell in the ink or page rings 4000 msecs (or n msecs, if you call run(n).
  // If its already scheduled, then calling it again will delay the
  // activation further. 4000 is not magic: it just seems like a good.
  // value after emperical testing.
  busy = false;
  autoOff = new Schedule(4000, () => {
    if(this.busy) this.autoOff.run();
    else if (["ink","page"].includes(this.activeRing?.key) && !this.activeRing?.activeCell?.locked)
      this.activateCell(null);
  });

  toggleLock(cell) {
    cell.locked = !cell.locked;
    cell.elm.classList.toggle("Menu__cell-locked", cell.locked);
    if (cell.locked) {
      // Only activate if not already active
      if (cell.ring?.activeCell !== cell) this.activateCell(cell);
      this.autoOff.cancel();
    } else if (cell.ring?.activeCell === cell) {
      // Unlocking while active - restart autoOff
      this.autoOff.run();
    }
  }


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
             diskHolder                 onpg  ring*........ ring*     grip
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
             <div data-tag="grip" class="Menu__grip"></div>
             <datalist data-tag="recentColors" id="recentColors"></datalist>
           </div>`);

  getSizes() {
    // Define sizes of the menu's components. These are em units:
    return {
      ringRadius: 11,
      diskRadius: 6.5,
      gripRadius: 1.75,
      cellGap: 0.045,
      ringGap: 0.045, // i.e. inner ring cell gap
      cellIcon: 1.85,
      fontSize: 0.7,
    };
  }

  constructor() {
    Object.assign(this, dataIndex("tag", this.elm));
    let elm = this.elm;
    elm.owner = this ;
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
        cell["ring"] = ringCell;
        if (cell.stash) cell.stash["name"] = cell.name;
      }
    }

    // set initial cell state
    this.enableCells(["layout", "ink", "ink/paste", "page", "score/close", "score/save", "score/details", "score/print", "page/import"], false);

    this.stashDefaults = this.stashToJson();
    // load menu stash from localStorage, resetting immediately if version is
    // out of date so that localStorage is always at the current version.
    // This guarantees that when a score stash is rejected for version mismatch,
    // the existing localStorage state is always valid — mergeRecent is therefore
    // never called with a stale local side.
    try {
      let json = localStorage.getItem("menu") ?? this.stashDefaults;
      let parsed = JSON.parse(json);
      if (parsed.version !== _podiumVersion_) {
        this.stashFromJson(this.stashDefaults, "local");
        localStorage.setItem("menu", this.stashToJson("local"));
      } else {
        this.stashFromJson(json, "local");
      }
    } catch (Error) {
      toast("Clearing invalid local storage stash.");
      localStorage.clear();
    }
    finally {
      // activate last used layout or, if none, Book Layout
      this.activeRing = this.rings.layout;  // tmp to initialize
      let active = this.rings.layout.stash.active;
      if(active) this.activateCell(this.rings.layout.cells[active]);
      else this.activateCell(this.rings.layout.cells.book);
      // now activate Score ring
      this.activateRing(this.rings.score);
    }

    // Apply local-only cell states restored from stash
    {
      let themeCell = this.rings.app.cells.theme;
      let theme = themeCell.stash.theme || "Glass";
      document.documentElement.setAttribute("data-theme", theme);
      dataIndex("tag", themeCell.elm).cellIcon.innerHTML = iconPaths[theme];
      this.applyGaps(theme);

      let wakeLockCell = this.rings.app.cells.wakeLock;
      if (wakeLockCell.stash.on) {
        (async () => {
          try {
            wakeLockCell._wakeLock = await navigator.wakeLock.request("screen");
            dataIndex("tag", wakeLockCell.elm).cellIcon.innerHTML = iconPaths["Wakelock On"];
          } catch {
            // Silently ignore page-load failures. The wake lock will be requested
            // again on the first user interaction.
            dataIndex("tag", wakeLockCell.elm).cellIcon.innerHTML = iconPaths["Wakelock On"];
            let l = listen(document, "pointerup", async () => {
              if (wakeLockCell.stash.on && !wakeLockCell._wakeLock) {
                try {
                  wakeLockCell._wakeLock = await navigator.wakeLock.request("screen");
                } catch (err) {
                  // If it still fails on interaction, turn it off and alert the user.
                  wakeLockCell.stash.on = false;
                  dataIndex("tag", wakeLockCell.elm).cellIcon.innerHTML = iconPaths["Wakelock Off"];
                  toast("Wake lock unavailable.");
                }
              }
              unlisten(l);
            }, { capture: true });
          }
        })();
      }
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

    // ensure grip remains at least partially on-screen after any window resize
    listen(window, "resize", () => {
      delay(100, () => { // must delay until after any screen.orientation change, see main.js
        this.elm.style.left = clamp(parseFloat(this.elm.style.left), 0, innerWidth) + "px";
        this.elm.style.top = clamp(parseFloat(this.elm.style.top), 0, innerHeight) + "px";
      });
    });
  }

  async buildRings() {
    // Build the data structures (but not the dom elements)
    // that compose the menu's rings.
    let rings = this.rings;

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
          stash: { pages: 5, size: "A4", Width:595, Height:842, rgb: "#ffffff", alpha:1.0 },
          svgPath: iconPaths["New Score"],
        },
        close: { name: "Close", svgPath: iconPaths["Close"] },
        print: { name: "Print", svgPath: iconPaths["Print"] },
        details: { name: "Details", svgPath: iconPaths["Details"], stash: { quality: 2, pgFit: "Center", bkColorIdx: 0 }, storage: "score" },
      },
      svgPath: iconPaths["Score"],
    };

    // Magnifier - active when magnify cell is active
    this.magnifier = {
      zoom: 1,
      panel: null, // set by MagnifyPanel constructor
      get active() { return rings.page.activeCell?.key === 'magnify'; }
    };

    this.listen("score/up", () => this.activateRing(rings.score));

    this.listen("score/save/up", async (cell) => {
       this.activateCell(cell);
       await FileSrc.saveActiveScore(cell);
       this.activateCell(null);
    });

    this.listen("score/open/up", async (cell) => {
       this.activateCell(cell);
       await FileSrc.openActiveScore(cell);
       this.activateCell(null);
    });

    this.listen(["score/details/out", "score/open/out","score/save/out","score/new/out","score/print/out"], (cell) => this.openPanel(cell));

    this.listen("score/new/up", async (cell) => {
      if(!await checkUnsaved()) return;
      let alpha = parseInt(cell.stash.alpha * 255).toString(16);
      while (alpha.length < 2) alpha = "0" + alpha;
      await Score.newScore(
        cell.stash.pages,
        cell.stash.Width,
        cell.stash.Height,
        cell.stash.rgb + alpha,
      );
    });

    this.listen("score/close/up", async () => {
      if(!await(checkUnsaved("Warning: current score has unsaved changes. Close anyway?", true))) return;
      Layout.activeLayout.destructor();
      Layout.activeLayout.elm.remove();
      Layout.activeLayout = null;
      _score_ = null;
      _menu_.closePanels();
      _menu_.enableCells(["ink", "page", "layout", "score/save", "score/close", "score/details", "score/print"], false);
      document.dispatchEvent(new CustomEvent("scoreClosed"));
    });


    // Layout ring
    rings.layout = {
      cells: {
        book: {
          name: "Book",
          storage: "score", // layout settings (incl. pz pan-zoom) persist per-score, not as a global localStorage default
          stash: {
            fit: "Auto", // "Auto","Width","Height","None",
            pnShow: "On", // "On" or "Off"
            pace: 85, // pace: animation speed in %, 0 means no animation
            pz: null, // user pan-zoom saved with the score. When set: { left, top, fontSize, w, h }; applied only when w/h match the current viewport (see Layout.userPz)
          },
          svgPath: iconPaths["Book"],
        },
        horizontal: {
          name: "Horizontal",
          storage: "score",
          stash: {
            fit: "Auto", // "Auto", "Width","Height","None"
            gap: 0.2, // [0,10]% of fit dimension
            pnShow: "On",
            pgShow: 2,
            pgSnap: 2,
            pace: 500, // msec/snap
            pz: null, // see book cell
          },
          svgPath: iconPaths["Horizontal Scroll"],
        },
        vertical: {
          name: "Vertical",
          storage: "score",
          stash: {
            fit: "Auto", // "Auto", "Width","Height","None"
            gap: 0.2, // [0,10]% of fit dimension
            pnShow: "On",
            pgShow: 1, // [1,_score_.pages.length)
            pgSnap: 0, // 0 = disabled
            pace: 500, // msec/snap
            pz: null, // see book cell
          },
          svgPath: iconPaths["Vertical Scroll"],
        },
        table: {
          name: "Table",
          storage: "score",
          stash: {
            fit: "Auto", // "Auto", "Width","Height" (note: no "None")
            pages: 15, // [2,_score_.pages.length)
            horizontalGap: 0, // [-100,100]%
            verticalGap: 0, // [-100,100]%
            pnShow: "On",
            pz: null, // see book cell
          },
          svgPath: iconPaths["Table"],
        },
      },
      name: "Layout",
      stash: { active: "book"},
      svgPath: iconPaths["Layout"],
    };

    // actions:
    this.listen("layout/up", () => this.activateRing(rings.layout));
    let paths = Object.keys(rings.layout.cells).map((path) => `layout/${path}/`);
   
    this.listen(paths.map((path) => path + "up"), 
      async (cell) => {
        this.activateCell(cell);
        await Layout.open(cell);
      }
    );

    this.listen(paths.map((path) => path + "out"), (cell) => this.openPanel(cell));

    // Ink ring
    rings.ink = {
      cells: {
        edit: {
          name: "Edit",
          svgPath: iconPaths["Edit"] },
        pencil: {
          name: "Pencil",
          svgPath: iconPaths["Pencil"],
          stash: { alpha:"1",  rgb: "#000000", style:"Free", width: 1.5},
        },
        pen: {
          name: "Pen",
          svgPath: iconPaths["Pen"],
          stash: { alpha:".5",  rgb: "#FFFF00", style:"L-R", width: 10},
        },
        rastrum: {
          name: "Rastrum",
          svgPath: iconPaths["Rastrum"],
            // note: gap == staff space
            stash: { alpha:"1", gap:5,  lines: 5, width: 0, // when width or gap == 0, displays as "Auto"
                     rgb: "#000000", style:"L-R", bars:0, barWidth:0}, // style is "L-R" or "T-B"
        },
        text: {
          name: "Text",
          svgPath: iconPaths["Text"],
          stash: {alpha:"1", font: "Times-Roman", size: 20, height: 20, rgb: "#000000"},
        },
        symbols: {
          name: "Symbols",
          svgPath: iconPaths["Symbols"],
          stash: {alpha:"1", rgb:"#000000", font: "Bravura", size: 5, group: "Recent", codePoint: "\ue050", recent: {}},
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
        undo: {
          name: "Undo",
          svgPath: iconPaths["Undo"],
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
      },
      name: "Ink",
      stash: { active: "pencil", 
               recentColors:["#ff0000","#00ff00","#0000ff","#ffff8f","#ffa500","#000000","#333333","#666666","#999999","#cccccc"] },
      svgPath: iconPaths["Ink"],
    };

    this.listen("ink/up", () => this.activateRing(rings.ink));

    paths = Object.keys(rings.ink.cells).map((key) => `ink/${key}/`);
    this.listen(paths.map((path) => path + "up"),(cell) => this.activateCell(rings.ink.activeCell === cell ? null :cell));
    this.listen(paths.map((path) => path + "long"),(cell) => this.toggleLock(cell));
    // All but 4 cells in the ink ring have panels...remove those from paths...
    paths = paths.filter((key) => !["ink/undo/","ink/cut/","ink/paste/"].includes(key));
    // ..then listen for "out" on all remaining paths:
    this.listen(paths.map((path) => path + "out"),(cell) => this.openPanel(cell)); 

    // Page ring
    rings.page = {
      cells: {
        numbers: {
          name: "Numbers",
          svgPath: iconPaths["Numbers"],
          stash: { pn: 1, first: 1, prelim: 0, forward: "Pages", reverse: "Pages" },
          storage: "score",
        },
        add: {
          name: "Add",
          svgPath: iconPaths["New Page"],
          stash: { rgb: "#ffffff", alpha: 1.0, Width: 612, Height: 792, size: "Match Score" },
        },
        cut: { name: "Cut", svgPath: iconPaths["Cut Page"] },
        copy: { name: "Copy", svgPath: iconPaths["Copy Page"] },
        paste: { name: "Paste", svgPath: iconPaths["Paste Page"] },
        undo: { name: "Undo", svgPath: iconPaths["Undo"] },
        export: { name: "Export", svgPath: iconPaths["Export Page"] },
        import: { name: "Import", svgPath: iconPaths["Import Page"] },
        merge: { name: "Merge", svgPath: iconPaths["Merge"] },
        flatten: { name: "Flatten", svgPath: iconPaths["Flatten"] },
        magnify: { name: "Magnify", svgPath: iconPaths["Magnify"], stash: { zoom: 1 } },
      },
      name: "Page",
      stash: {},
      svgPath: iconPaths["Page"],
    };

    // actions:

    this.listen("page/up", () => this.activateRing(rings.page));
    paths = Object.keys(rings.page.cells).map((path) => `page/${path}/`);
    this.listen(paths.map((path) => path + "up"), (cell) => this.activateCell(rings.page.activeCell === cell ? null :cell));
    this.listen(paths.map((path) => path + "long"), (cell) => this.toggleLock(cell));
    this.listen(["page/numbers/","page/import/","page/add/","page/magnify/","page/merge/"].map((path) => path + "out"), (cell) =>  this.openPanel(cell));

    this.listen("page/merge/long", (cell) => {
      this.toggleLock(cell);
      if (cell.locked) this.openPanel(cell);
    });

    this.listen("page/merge/up", (cell) => {
      if (rings.page.activeCell === cell) { this.activateCell(null); return; }
      if (cell.pdfData) { this.activateCell(cell); return; }
      this.openPanel(cell);
    });

    this.listen("page/undo/up", async () => {
       _score_.pgUndo();
       await Layout.activeLayout.build(false);
    })

    
    rings.app = {
      name: "App",
      cells: {
        about: { name: "About", svgPath: iconPaths["About"], stash: {} },
        theme: { name: "Theme", svgPath: iconPaths["Glass"], stash: { theme: "Glass" }, storage: "local" },
        guide: { name: "Guide", svgPath: iconPaths["Guide"], stash: {} },
        storage: { name: "Storage", svgPath: iconPaths["Storage"], stash: {} },
        curtain: { name: "Curtain", svgPath: iconPaths["Curtain"], stash: { color:"Black", alpha: 60 }, storage: "local" },
        wakeLock: { name: "Wakelock", svgPath: iconPaths["Wakelock Off"], stash: { on: false }, storage: "local" },
        screen: { name: "Screen", stash: {}, svgPath: iconPaths["Full Screen"], storage: "local" },

      },
      svgPath: iconPaths["Podium"],

    }

    this.listen("app/up", () => this.activateRing(rings.app));

    this.listen("app/about/out", (cell) => this.openPanel(cell));
    this.listen("app/curtain/out", (cell) => this.openPanel(cell));
    this.listen("app/curtain/up", (cell) => _curtain_.toggle());
    this.listen("app/screen/out", (cell) => this.openPanel(cell));
    this.listen("app/storage/out", (cell) => this.openPanel(cell));
    this.listen("app/guide/out", (cell) => this.openPanel(cell));
    this.listen("app/volume/out", (cell) => this.openPanel(cell));

    this.listen("app/screen/up", (cell) => {
      let cellIcon = dataIndex("tag", rings.app.cells.screen.elm).cellIcon;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        cellIcon.innerHTML = iconPaths["Normal Screen"];
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
        cellIcon.innerHTML = iconPaths["Full Screen"];
      }
    });

    this.listen("app/theme/up", (cell) => {
      const themes = ["Warm", "Glass", "Dark"];
      let theme = cell.stash.theme || "Glass";
      theme = themes[(themes.indexOf(theme) + 1) % themes.length];
      document.documentElement.setAttribute("data-theme", theme);
      dataIndex("tag", cell.elm).cellIcon.innerHTML = iconPaths[theme];
      cell.stash.theme = theme;
      this.applyGaps(theme);
    });

    this.listen("app/wakeLock/up", async (cell) => {
      let cellIcon = dataIndex("tag", rings.app.cells.wakeLock.elm).cellIcon;
      if (cell.stash.on) {
        cell.stash.on = false;
        cell._wakeLock?.release();
        cell._wakeLock = null;
        cellIcon.innerHTML = iconPaths["Wakelock Off"];
      } else {
        try {
          cell._wakeLock = await navigator.wakeLock.request("screen");
          cell.stash.on = true;
          cellIcon.innerHTML = iconPaths["Wakelock On"];
        } catch {
          toast("Wake lock unavailable.");
        }
      }
    });

    listen(document, "visibilitychange", async () => {
      let cell = rings.app?.cells?.wakeLock;
      if (cell?.stash.on && document.visibilityState == "visible") {
        try {
          cell._wakeLock = await navigator.wakeLock.request("screen");
        } catch {
          // silently ignore — e.g. low power mode
        }
      }
    });

    // More ring
    rings.more = {
      cells: {
        metronome: {
          name: "Metronome",
          svgPath: iconPaths["Metronome"],
          stash: {
            tempo: 60,
            state: "Pause",
            trace: "Hide", 
            mute: "Mute",
            pattern: "metronome",
            latency: 0,
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
            mirror: "Mirror",
            replay: 15,  // mimimum replay time in seconds
          },
        },
        keyboard: {
          name: "Keyboard",
          svgPath: iconPaths["Keyboard"],
          stash: {},
        },
        volume: { name: "Volume", svgPath: iconPaths["Volume"], stash: { volume:1}, },
      },
      name: "More",
      stash: { active: null },
      svgPath: iconPaths["More"],
    };

    this.listen("more/up", () => this.activateRing(rings.more));

    paths = Object.keys(rings.more.cells).map((path) => `more/${path}/`);

    this.listen(paths.map((path) => path + "out"),  (cell) => this.openPanel(cell));

   // grip: no cells here, just handlers
   this.listen("up", () => this.collapse());
   this.listen("long", () => this.park());

   // For any cell that has a panel but no /up listener, auto-register one to open the panel
   for (let [ringKey, ring] of Object.entries(this.rings)) {
     for (let [cellKey, cell] of Object.entries(ring.cells)) {
       let path = `${ringKey}/${cellKey}/up`;
       let panelClass = panels[cell.name + "Panel"];
       if (panelClass && !this.listeners[path]) {
         this.listen(path, (cell) => panelClass.get(cell).show().setPosition(this.grip));
       }
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
          // iff the cell is associated with a panel, it will have an "out" listener: add the Menu__cell-panel 
          // class to visually distinguish it.
          if(this.listeners[`${diskKey}/${cellKey}/out`])
            cell.elm.classList.add("Menu__cell-panel");
        }); // forEach((cell)
      }
    }); // forEach(([key, ring
  }

  applyGaps(theme) {
    // Recompute and reapply cell clip-paths with theme-specific gaps.
    // Glass mode uses gap=0 (seamless cells); all other themes use the default getSizes() gaps.
    let gap = theme == "Glass" ? 0 : this.sizes.cellGap;
    let { diskDiameter, diskRadius, ringDiameter, ringRadius } = this.sizes;
    let diskEntries = Object.entries(this.rings);
    let ringKnt = diskEntries.length;

    let diskClipPath = "circle(50%)";
    if (ringKnt >= 2) {
      let c = diskRadius;
      let theta = (2 * Math.PI) / (ringKnt * 2);
      let x = Math.sin(theta) * diskDiameter;
      let y = Math.cos(theta) * diskDiameter;
      diskClipPath = `polygon(${c - gap}em ${c}em,${c + x - gap}em ${c - y}em,${c - x + gap}em ${c - y}em,${c + gap}em ${c}em)`;
    }

    diskEntries.forEach(([, ring]) => {
      ring.cellElm.style.clipPath = diskClipPath;
      let cellEntries = Object.entries(ring.cells);
      let cellKnt = cellEntries.length;
      let ringClipPath = "circle(50%)";
      if (cellKnt >= 2) {
        let c = ringRadius;
        let theta = (2 * Math.PI) / (cellKnt * 2);
        let x = Math.sin(theta) * ringDiameter;
        let y = Math.cos(theta) * ringDiameter;
        ringClipPath = `polygon(${c - gap}em ${c}em,${c + x - gap}em ${c - y}em,${c - x + gap}em ${c - y}em,${c + gap}em ${c}em)`;
      }
      cellEntries.forEach(([, cell]) => {
        cell.elm.style.clipPath = ringClipPath;
      });
    });
  }

  constrain() {
    if(this.elm.offsetTop < 0) this.elm.style.top = 0 ;
    else if(this.elm.offsetTop > window.innerHeight) this.elm.style.top = window.innerHeight + "px";
    if(this.elm.offsetLeft < 0) this.elm.style.left = 0 ;
    else if(this.elm.offsetLeft > window.innerWidth) this.elm.style.left = window.innerWidth + "px";
  }

  // event operation handles:

  opDown(e) {
    e.taken = true; 
    if (e.ctrlKey || e.shiftKey) return;
    this.elm.style.zIndex = ++_zTop_;
    this.clearSpinFling();
    // Cancel any active spin flings on touch
    Object.values(this.rings).forEach(r => {
      if (r._spinRaf) { cancelAnimationFrame(r._spinRaf); r._spinRaf = null; }
    });
    if (this.disk._spinRaf) { cancelAnimationFrame(this.disk._spinRaf); this.disk._spinRaf = null; }
    let op = this.op;
    op.schedule.cancel();
    let keys = e.target.dataset.key || "grip";
    if (!keys) return;
    let box = getBox(this.menuHolder);
    let dxdy = [e.clientX - box.x, e.clientY - box.y];

    let [ringKey, cellKey] = keys.split("/");
    // Allow user interaction to spin the disk or ring only when pointer is within 20% of edge of disk or ring

    Object.assign(op, {
      cellKey: cellKey,
      completed: false,
      e: e, // initial event
      emv: e, // latest mv event, or initial event if none
      drag: new Drag(e, { minVelocity:0.1}),
      moved: false,
      origin: { x: e.clientX, y: e.clientY },
      out: false,
      ringKey: ringKey,
      ring: this.activeRing,
      ringRadiusPx: this.activeRing.elm.offsetWidth / 2,
      spun: false, // set to true when ring or disk is spun a minimal amount
      state: ringKey == "grip" ? "grip" : cellKey ? "ring" : "disk",
      turn: null, // current turn, updates with rotation
      turn0: null, // initial turn on pointerDown
    });
    this.elm.setPointerCapture(e.pointerId);
    // op.turn will be in  "turns", with range (.75, 1.75),
    // and with 1 at the top.  This allows us to turn without
    // the value going negative.

    op.turn = op.turn0 = Math.atan2(dxdy[1] - op.ringRadiusPx, dxdy[0] - op.ringRadiusPx) / (Math.PI * 2) + 1.25;
    this.startAngle = op.turn;


    switch (op.state) {
      case "ring": {
        op.turnOffset = op.turn - op.ring.turn;
        op.cell = this.rings[ringKey].cells[cellKey];

        let ringTransform = op.ring.elm.style.transform || "rotate(0turn)"; 
        let ringAngle = parseFloat(ringTransform.substring(7,ringTransform.length - 5)) ;
        let cellTransform = op.cell.elm.style.transform;
        op.cellAngle = parseFloat(cellTransform.split('(')[1]) + ringAngle  ;

        if (op.cell.enabled == false) break;
        op.cell.elm.classList.add("Menu__cell-selected");
        this.notify(`${ringKey}/${cellKey}/down`);
        // Schedule long press detection for cells
        op.schedule.run(
          _gs_,
          () => {
            op.completed = true;
            this.notify(`${ringKey}/${cellKey}/long`);
            op.cell.elm.classList.remove("Menu__cell-selected");
          },
          this
        );
        break;
      }
      case "disk": {
        this.disk.turnOffset = op.turn - this.disk.turn;
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
          _gs_,
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

  opMove(emv) {
    let op = this.op;
    if (op.completed) return;
    op.emv = emv;
    op.drag.mv(emv);
    if (op.out)
      return this.notify(`${op.ringKey}/${op.cellKey}/out`); // if cell has panel, then this will pass move operation to it

    let elm = this.menuHolder;
    let box = getBox(elm);
    let dxdy = [emv.clientX - box.x, emv.clientY - box.y];
    // keep op.turn positive, with axis at the top, by adding on 1.25
    op.turn = Math.atan2(dxdy[1] - op.ringRadiusPx, dxdy[0] - op.ringRadiusPx) / (Math.PI * 2) + 1.25;

    // Was there significant pointer motion in either ring?
    if(op.drag.moved) op.schedule.cancel();
    if (op.drag.moved && !op.spun && !op.out) {
      if (op.state == "disk") {
        op.spun = true; // Significant movement in a disk cell is always interpreted as a spin
      } else if (op.state == "ring") {
        // Calculate tangent vs radial components of the gesture
        let centerX = this.elm.offsetLeft;
        let centerY = this.elm.offsetTop;
        // Total displacement from pointer down
        let dx = emv.clientX - op.e.clientX;
        let dy = emv.clientY - op.e.clientY;
        // Vector from menu center to current pointer position
        let rx = emv.clientX - centerX;
        let ry = emv.clientY - centerY;
        let r = Math.hypot(rx, ry);
        if (r > 0) {
          // Radial unit vector (pointing outward from center)
          let radialX = rx / r;
          let radialY = ry / r;
          // Tangential unit vector (perpendicular, for spin detection)
          let tangentX = -radialY;
          let tangentY = radialX;
          // Project movement onto radial and tangential directions
          let radialComponent = Math.abs(dx * radialX + dy * radialY);
          let tangentComponent = Math.abs(dx * tangentX + dy * tangentY);
          // Spin if tangential movement dominates
          if (tangentComponent > radialComponent * 1.5) {
            op.spun = true;
          }
          // Drag out/in if radial movement dominates
          else if (radialComponent > tangentComponent * 1.5) {
            op.out = true;
            return this.notify(`${op.ringKey}/${op.cellKey}/out`);
          }
          // Ambiguous - wait for more movement (do nothing yet)
        }
      }
    }

    switch (op.state) {
      case "ring": {
        if (op.spun) {
          op.ring.turn = op.turn - op.turnOffset;
          op.ring.elm.style.transform = `rotate(${op.ring.turn}turn)`;
          let rotation = 1 / op.ring.elm.childElementCount;
          [...op.ring.elm.children].forEach((elm, i) => (elm.firstElementChild.style.transform =
            `rotate(${-rotation * i - op.ring.turn}turn)`));
          this.notify(`${op.ringKey}/${op.cellKey}/spin`);
          op.cell.elm.classList.remove("Menu__cell-selected");
          emv.turn = op.turn;
        }
        break;
      }
      case "disk": {
        if (op.spun) {
          this.disk.turn = op.turn - this.disk.turnOffset;
          this.disk.style.transform = `rotate(${this.disk.turn}turn)`;
          let rotation = 1 / this.disk.childElementCount;
          [...this.disk.children].forEach((elm, i) => (elm.firstElementChild.style.transform =
            `rotate(${-rotation * i - this.disk.turn}turn)`));
          this.notify(`${op.ringKey}/spin`);
          op.ring.cellElm.classList.remove("Menu__diskCell-selected");
          emv.turn = op.turn;
        }
        break;
      }
      case "grip": {
        if (!op.drag.moved) return; // insufficient movement
        // Move the menu while ensuring that the grip cannot be dragged out of the viewport
        this.elm.style.left = clamp(emv.clientX, 0, innerWidth) + "px";
        this.elm.style.top = clamp(emv.clientY, 0, innerHeight) + "px";
        this.notify("move");
        break;
      }
      default:
        break;
    }
  }

  spinFling(op, eup) {
    let buf = op.drag.mvBuf.filter(e => e.turn != undefined);
    if (buf.length < 2) return;
    let recent = buf.filter(e => eup.timeStamp - e.timeStamp <= op.drag.terminalWindow);
    if (recent.length < 2) return;
    let dT = recent[recent.length - 1].timeStamp - recent[0].timeStamp;
    if (!dT) return;
    let vel = (recent[recent.length - 1].turn - recent[0].turn) / dT; // turns/ms
    if (Math.abs(vel) < 0.0005) return;
    let isRing = op.state == "ring";
    let obj = isRing ? op.ring : this.disk;
    let spinElm = isRing ? op.ring.elm : this.disk;
    let rotation = 1 / spinElm.childElementCount;
    let coast = clamp(Math.abs(vel) * 300, 0.5, 1) * Math.sign(vel); // turns to coast
    let dur   = clamp(Math.abs(coast / vel / 2), 0.3, 2).toFixed(2); // seconds
    obj.turn += coast;
    spinElm.style.transition = `transform ${dur}s ease-out`;
    spinElm.style.transform  = `rotate(${obj.turn}turn)`;
    [...spinElm.children].forEach((child, i) => {
      child.firstElementChild.style.transition = `transform ${dur}s ease-out`;
      child.firstElementChild.style.transform  = `rotate(${-rotation * i - obj.turn}turn)`;
    });
    this._spinElm = spinElm;
  }

  clearSpinFling() {
    if (!this._spinElm) return;
    this._spinElm.style.transition = "unset";
    [...this._spinElm.children].forEach(child => child.firstElementChild.style.transition = "unset");
    this._spinElm = null;
  }

  opUp(eup) {
    let op = this.op;
    op.drag.up(eup);
    op.schedule.cancel();
    unlisten(op.moveListener, op.upListener);
    op.cell && op.cell.elm.classList.remove("Menu__cell-selected");
    op.ring && op.ring.cellElm.classList.remove("Menu__diskCell-selected");
    this.grip.classList.remove("Menu__grip-selected");
    if (op.spun) { this.spinFling(op, eup); return; }
    if(op.out) {
      // hide with quick fling...but only after at least 500 msecs to a quick drag out
      // gesture won't immediately hide the panel
      if(op.drag.vXY && op.drag.vXY > 0.75 && eup.timeStamp - op.e.timeStamp > 500) {
        let panel = panels[op.cell.name + "Panel"]?.get(op.cell);
        if (panel) hide(panel.elm, dataIndex("tag", op.cell.elm).cellIcon);
      }
      return;
    }

    switch (op.state) {
      case "ring":
        if (!op.completed) this.notify(`${op.ringKey}/${op.cellKey}/up`);
        break;
      case "disk":
        this.notify(`${op.ringKey}/up`);
        break;
      case "grip":
        if (op.drag.dXY) {
          if (!this.collapsed) this.collapse();
          let dx = Math.cos(op.drag.dXY), dy = Math.sin(op.drag.dXY);
          let iW  = innerWidth,  iH  = innerHeight;
          let mx = this.elm.offsetLeft,  my = this.elm.offsetTop;
          let tx = dx > 0 ? (iW - mx) / dx : dx < 0 ? -mx / dx : Infinity;
          let ty = dy > 0 ? (iH - my) / dy : dy < 0 ? -my / dy : Infinity;
          let t  = Math.min(tx, ty);
          let corners = [
            [iW, 0, Math.PI/4 * 7],
            [0,  0, Math.PI/4 * 5],
            [0,  iH, Math.PI/4 * 3],
            [iW, iH, Math.PI/4 * 1],
          ];
          let pull = Math.PI / 8;
          let snapped = corners.find(([,, ca]) => {
            let diff = Math.abs(((op.drag.dXY - ca + 3*Math.PI) % (2*Math.PI)) - Math.PI);
            return diff < pull;
          });
          let ex = snapped ? snapped[0] : mx + t*dx;
          let ey = snapped ? snapped[1] : my + t*dy;
          let dist = Math.hypot(ex - mx, ey - my);
          op.drag.power(0.5);
          let dur = clamp(dist / (op.drag.vXY * 1000), 0.1, 3.0).toFixed(2);
          this.elm.style.transition = `left ${dur}s, top ${dur}s`;
          this.elm.style.left = ex + "px";
          this.elm.style.top  = ey + "px";
        }
       else if(eup.timeStamp - op.e.timeStamp < 200) this.notify("up");
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
    // special case: if currently editing a fabric text object, exit text editing
    this.checkEditing();
    if (this.activeRing) {
      // Deactivate current active ring
      this.activeRing.elm.style.visibility = "hidden";
      this.activeRing.cellElm.classList.remove("Menu__diskCell-active");
    }
    ring.elm.style.visibility = "visible";
    ring.cellElm.classList.add("Menu__diskCell-active");
    this.activeRing = ring;
    // Score is editable iff ink is activeRing, and it has an activeCell
    if(_score_) _score_.setEditable(ring.key == "ink" && ring.activeCell);
  }

  activateCell(cell) {
    // Overlay a div onto given cell of active ring visually mark it as active.
    // Call with cell = null to deactivate active cell (if any) on the active ring
    // Only 1 cell per ring can be active at a time, so if the ring
    // had an active cell before this call, it will be deactivated.
    // Special cases:
    //  -  if currently editing a fabric text object, exit text editing
    //  -  when the ink/edit cell activates/deactivates, must call Score's setSelectable method
    this.checkEditing();
    let ring = cell?.ring || this.activeRing;

    // Will this operation toggle the edit cell?
    let editCell = this.rings.ink.cells.edit;
    let editToggle = (ring.activeCell !== editCell && cell === editCell) ||
        (ring.activeCell === editCell && cell !== editCell);

    // now update state and appearance for activate/deactivate
    if (ring?.activeCell) {
      ring.activeCell.elm.classList.remove("Menu__cell-active");
      // Clear lock when deactivating
      if (ring.activeCell.locked) {
        ring.activeCell.locked = false;
        ring.activeCell.elm.classList.remove("Menu__cell-locked");
      }
      // Discard loaded merge data when merge cell deactivates; reset autoOff delta
      if (ring.activeCell.key == "merge") {
        ring.activeCell.pdfData = null;
        this.autoOff.delta = 4000;
      }
    }
    if (cell) {
      cell.elm.classList.add("Menu__cell-active");
      ring.activeCell = cell;
      ring.stash.active = cell.key;

      if((ring.key == "page" && cell.key != "numbers") || ring.key == "ink")
         this.autoOff.run();

    } else ring.activeCell = null;

    if(_score_ && ring.key == "ink") {
      // Score is editable iff ink is activeRing, and it has an activeCell
      _score_.setEditable(ring.activeCell);
      // Score is selectable iff ink is activeRing, and edit cell is active
    if(editToggle && cell && (cell.key == "cut" || cell.key == "copy"))
    { // check for active selection
      for(let pg of _score_.pgs) {
        if(!pg.inflated) continue;
          let obj = pg.canvas.getActiveObject();
          if(obj) {
            obj.type == "activeSelection" ? this.pgEvent({selected:obj._objects},pg) : this.pgEvent({target:obj},pg);
           return ;
          }
        } 
      }
      if(editToggle) _score_.setSelectable(cell === editCell);
    }
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

  closePanels(except = ["app", "more"]) {
    // Close all open panels except those belonging to rings in the except list
    for (let panel of Object.values(panels)) {
      if (panel.cell && !except.includes(panel.cell.ring?.key)) panel.close();
    }
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
      let [ringKey, cellKey] = parts;
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
    if (!panel.elm.isConnected) {
      panel.elm.style.visibility = "hidden"; // prevent flash at default top:0 before positioning
      _body_.append(panel.elm);
    }
    Object.assign(panel.elm.style, {
      left: this.op.emv.clientX - panel.elm.offsetWidth / 2 + "px",
      top: this.op.emv.clientY + panel.panel.offsetHeight / 2 - panel.header.offsetHeight / 2 + "px",
    });
    if (panel.elm.style.visibility != "visible") panel.show();
    cell.elm.classList.remove("Menu__panel");
    panel.constrain();
    _pzTarget_ = panel.elm ;
  }

  // stash serialization functions:

  stashFromJson(stashJson, source) {
    // Load all stashes from given data string, stashJson.
    this.stashFromJsonObj(JSON.parse(stashJson), source);
  }

  stashFromJsonObj(stashJsonObj, source) {
    // This merges stashJsonObj onto menu's stashes.
    // source: "local" (from localStorage) or "score" (from saved score) or
    // undefined (no filtering). Cells whose storage property doesn't match
    // source are skipped as a safeguard.
    let version = stashJsonObj.version;
    if (!version) return;
    if (version != _podiumVersion_) {
      console.warn("Podium version mismatch, ignoring stash");
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
          if (source && cell.storage && cell.storage != source) continue;
          cell.stash = cell.stash ?? {};
          if (source === 'score' &&
              cellStash.recent !== undefined && typeof cellStash.recent === 'object' &&
              cell.stash.recent !== undefined && typeof cell.stash.recent === 'object') {
            const { recent: incoming, ...rest } = cellStash;
            Object.assign(cell.stash, rest);
            cell.stash.recent = mergeRecent(cell.stash.recent, incoming);
          } else {
            Object.assign(cell.stash, cellStash);
          }
        }
      } catch {
        // ignore corrupt entry
      }
    }
  }

  stashToJson(source) {
    return JSON.stringify(this.stashToJsonObj(source));
  }

  stashToJsonObj(source) {
    try {
      let stash = {};
      for (let [ringKey, ring] of Object.entries(this.rings)) {
        stash[ringKey] = {};
        let cells = {};
        for (let [cellKey, cell] of Object.entries(ring.cells)) {
          if (cell.stash && (!source || !cell.storage || cell.storage == source))
            cells[cellKey] = cell.stash;
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

  factoryReset() {
    this.stashFromJson(this.stashDefaults, "local");
    localStorage.setItem("menu", this.stashToJson("local"));

    // Apply theme
    let themeCell = this.rings.app.cells.theme;
    let theme = themeCell.stash.theme || "Glass";
    document.documentElement.setAttribute("data-theme", theme);
    dataIndex("tag", themeCell.elm).cellIcon.innerHTML = iconPaths[theme];

    // Release wake lock
    let wakeLockCell = this.rings.app.cells.wakeLock;
    wakeLockCell._wakeLock?.release();
    wakeLockCell._wakeLock = null;
    dataIndex("tag", wakeLockCell.elm).cellIcon.innerHTML = iconPaths["Wakelock Off"];

    // Exit fullscreen
    if (document.fullscreenElement) document.exitFullscreen();

    // Close all open panels
    this.closePanels(["app"]);
  }

  stash() {
    localStorage.setItem("menu", this.stashToJson("local"));
  }

  // menu positioning functions:

  center(reset = false) {
    this.clearSpinFling();
    // move to the center of the current window
    animate(this.elm, null, {
      left: innerWidth / 2 + "px",
      top: innerHeight / 2 + "px",
    }, ` ${_gs_}ms`);
    if (this.collapsed) this.collapse();
    if (reset) {
      this.op.turnOffset = 0;
      this.disk.turn = 0;
      if (this.op.ring) this.op.ring.turn = 0;
      this.disk.turnOffset = 0;
      let diskEntries = Object.entries(this.rings);
      let ringKnt = diskEntries.length;
      animate(this.disk, null, { transform: "rotate(0turn)" }, `${_gs_}ms`);
      diskEntries.forEach(([diskKey, ring], index) => {
        let rotation = index / ringKnt;
        ring.cellElm.style.transform = `rotate(${rotation}turn`;
        ring.cellElm.firstElementChild.style.transform = `rotate(${1 - rotation}turn`;
        let cellEntries = Object.entries(ring.cells);
        let cellKnt = cellEntries.length;
        animate(ring.elm, null, { transform: "rotate(0turn)" }, `${_gs_}ms`);
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
    holder.style.transition = `all ${_gs_}ms ease-in`;
    if (this.collapsed) {
      this.collapsed = false;
      holder.style.transform = "scale(1)";
    } else {
      holder.style.transform = "scale(0)";
      this.collapsed = true;
    }
    schedule(_gs_, () => holder.style.transition = "unset");
  }

  park() {
    if(!this.collapsed) this.collapse() ;
    this.elm.style.transition = `all ${_gs_}ms ease-in`;
    this.elm.style.left = this.elm.style.top = 0 ;
    schedule(_gs_, () => this.elm.style.transition = "unset");
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

  async pgEvent(opts, pg) {

    let canvas = pg.canvas;

    let addObj = (obj) => {
      this.newlyCreated = obj;
      canvas.add(obj);
      obj.hasControls = false; 
      // makes obj draggable until subsequent pgUpEvent:
      canvas._target = obj; 
      return obj;
    };

    if (this.activeRing.key != "ink") return;
    let activeCell = this.activeRing.activeCell;

    if (!activeCell) return;

    let target = opts.target;
    let key = activeCell.key ;

    // If the user taps on an already-editing textbox while in text mode,
    // let Fabric handle the cursor repositioning — don't create a new textbox.
    if (key == "text" && target?.type == "textbox" && target.isEditing) return target;

    if (key == "text" && target?.type == "textbox" && !target.isEditing) {
      this.checkEditing();
      this.newlyCreated = target;
      canvas.setActiveObject(target);
      target.enterEditing();
      target.hiddenTextarea?.focus();
      canvas.renderAll();
      return target;
    }

    if(this.checkEditing()) return;

    this.newlyCreated = null;

    switch (key) {

      case "edit":
        if(target && !target.flatten && !target.hasControls) target.hasControls = true;
        else if (!target && !canvas.getActiveObject()) {
          // select the most-recent *editable* object (skip frozen/flattened ones)
          let editable = canvas.getObjects().filter(o => !o.flatten);
          if (editable.length) delay(1, () => canvas.setActiveObject(editable.at(-1)));
        }
        canvas.requestRenderAll();
        return;

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
          // PencilBrush subclasses PencilBrush, adding a podiumType=pencil||pen  key to the created path.
          // This allows us to determine whether a path was created from the Pencil tool or the Pen tool.
          brush = new fabric.PodBrush(canvas, key); 
          brush.width = width;
          brush.color = rgba;
        } else brush = new fabric.LineBrush(canvas, activeCell.stash, rgba, key);
        canvas.freeDrawingBrush = brush;
        canvas.isDrawingMode = true;
        return;
      }

      case "grid": {
        // toggle grid on/off
        if (pg.grid) pg.grid = pg.grid.destructor();
        else pg.grid = new Grid(pg, activeCell.stash, opts);
        return;
      }

      case "rastrum": {
        let { alpha, rgb } = activeCell.stash;
        let color = fabric.Color.fromHex(rgb);
        color.setAlpha(alpha);
        let rgba = color.toRgba();
        this.newlyCreated = new fabric.RastrumBrush(canvas, activeCell.stash, rgba);
        canvas.freeDrawingBrush = this.newlyCreated;
        return (canvas.isDrawingMode = true);

      }

      case "text": { // actually, a fabric textbox obj
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
          left: opts.absolutePointer.x,
          top: opts.absolutePointer.y,
          objectCaching: false, ///
          hasControls: false,
        };
        Object.assign(config, fontMap[font]);
        let textbox = addObj(new fabric.Textbox("Abc", config));
        canvas.setActiveObject(textbox);
        textbox.enterEditing();
        textbox.hiddenTextarea?.focus();
        textbox.selectAll();
        canvas.renderAll();
        return textbox;
      }

      case "symbols": { // actually, a fabric text obj
        let { alpha, codePoint, height, rgb, size } = activeCell.stash;
        // No symbol selected (the panel deselects to null, see SymbolsPanel):
        // tell the user and insert nothing, rather than building a
        // fabric.Text(null), which throws in _splitTextIntoLines and takes down
        // the whole canvas.
        if (!codePoint) { toast("No symbol selected."); return; }
        let color = fabric.Color.fromHex(rgb);
        color.setAlpha(alpha);
        let rgba = color.toRgba();
        let config = {
          podiumType: "symbols",
          fill: rgba,
          fontSize: size * 4, // * 4 because size is in "pixels per staff space" and there's normally 4 spaces / staff
          editable: false,
          selectable: true,
          left: opts.absolutePointer.x,
          top: opts.absolutePointer.y,
          hasControls: false,
        };
        Object.assign(config, fontMap["Bravura"]);
        activeCell.stash.recent = mergeRecent(activeCell.stash.recent || {}, { [codePoint]: _recentInsertPts_ });
        return addObj(new fabric.Text(codePoint, config));
      }

      case "cut":
      case "copy": {
        let targets = opts.selected || (target ? [target] : []);
        if (targets.length == 0) return;
        let obj = targets.length == 1 ? targets[0] : new fabric.ActiveSelection(targets, { canvas });
        this.cutCopyObject(obj, canvas, activeCell.key == "cut");
        return;
      }

      case "paste": {
        if (this.pasteObj) {
          this.pasteObj.clone((clone) => {
            let {x,y} = opts.absolutePointer;
            if(clone.type == "activeSelection") {
              clone._objects.forEach(obj => {
              obj.set({ left: obj.left+x, top:obj.top+y});
              canvas.add(obj);
            });
            let actSel = new fabric.ActiveSelection(clone._objects, { canvas: canvas, hasControls: false});
            canvas.setActiveObject(actSel);
            canvas._target = this.newlyCreated = actSel;
            }
            else {
              clone.set({ left:x, top: y});
              addObj(clone);
              canvas.requestRenderAll();

              if(clone.type == "image") {
                // images need special race condition workaround:
                canvas.selection = false;
                let onMove = (opt) => {
                  clone.set({ left: opt.pointer.x, top: opt.pointer.y });
                  canvas.requestRenderAll();
                };
                let onUp = () => {
                  canvas.selection = true;
                  canvas.off('mouse:move', onMove);
                  canvas.off('mouse:up', onUp);
                  canvas.remove(clone);
                  delay(1, () => { 
                    canvas.add(clone);
                    clone.set({ hasControls: true});
                  }); 
                };
                canvas.on('mouse:move', onMove);
                canvas.on('mouse:up', onUp);
              }
            }
        });
      }
      return;
     }

    }
  }

  cutCopyObject(obj, canvas, isCut) {
    if (this.cutting) return;
    this.cutting = true;
    obj.clone((clone) => { this.pasteObj = this.newlyCreated = clone; });
    this.enableCells("ink/paste", true);
    // Animate: object image flies to paste cell icon
    let zoom = canvas.pg.zoom ; // account for "additional" pg zoom
    let emWidth = obj.getScaledWidth() * zoom / _pxPerEm_;
    let objBox = obj.getBoundingRect();
    let canvasBox = getBox(canvas.lowerCanvasEl) ;
    let left = canvasBox.left + objBox.left * zoom;
    let top  = canvasBox.top  + objBox.top * zoom;
    let elm = helm(`<img src=${obj.toDataURL()} style=
       "border:1px solid red;width:${emWidth}em;height:auto;z-index:1000;left:${left}px;top:${top}px;position:absolute;"></img>`);
    _body_.append(elm);
    hide(elm, dataIndex("tag", this.rings.ink.cells.paste.elm).cellIcon);
    delayMs(500, () => elm.remove());

    if (isCut) {
      // Remove object(s) and auto-select next
      let members = obj.type === 'activeSelection' ? [...obj._objects] : [obj];
      let objs = canvas.getObjects();
      let idxArr = members.map(o => objs.indexOf(o)).filter(i => i >= 0);
      let idx = idxArr.length > 0 ? Math.min(...idxArr) : 0;
      delay(1, () => {
        members.forEach(o => canvas.remove(o));
        let remaining = canvas.getObjects();
        if (remaining.length > 0)
          canvas.setActiveObject(remaining[Math.min(idx, remaining.length - 1)]);
        else
          canvas.discardActiveObject();
        this.cutting = false;
        canvas.requestRenderAll();
        _score_.setDirty(true);
      });
    } else {
      this.cutting = false;
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    }
  }

  pgUpEvent(opts, pg) {
    this.autoOff.run(); // extend activation of active cell

    _score_.setDirty(true);
    if (pg) {
      if (this.newlyCreated && this.newlyCreated.podiumType == "text") {
        // For text objects, immediately enter editing:
        this.newlyCreated.enterEditing();
        this.newlyCreated.selectAll();
      }
    }
    for (let pg of _score_.pgs) if (pg.inflated) pg.canvas.isDrawingMode = false;
  }

  checkEditing() {
    // When called, this method checks if we are currently editing a fabric text object. If so, it
    // deactivates editing.
    // @return true iff editing was deactivated
    if(this.newlyCreated?.isEditing) {
      this.newlyCreated.exitEditing();
      this.newlyCreated = null;
      return true;
    }
    return false;
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
            let { maxWidth, maxHeight } = _score_;
            if (img.width > img.height && img.width > maxWidth) img.scaleToWidth(maxWidth);
            else if (img.height > maxHeight) img.scaleToHeight(maxHeight);
            img.set({ minScaleLimit: 1 / Math.min(img.width, img.height) });
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
