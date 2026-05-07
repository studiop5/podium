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

import {
  animate,
  ButtonGroup,
  dataIndex,
  clamp,
  clearChildren,
  ColorPicker,
  css,
  delay,
  delayMs,
  dialog,
  flung,
  fontMap,
  getBox,
  helm,
  hide,
  iconSvg,
  listen,
  mergeRecent,
  mvmt,
  pnToString,
  pxToEm,
  reflow,
  SliderGroup,
  schedule,
  Schedule,
  Surface,
  TabView,
  toast,
  unlisten,
} from "./common.js";
import { iconPaths } from "./icon.js";
import { escapeHtml, FileSrc, FileListView, FileSystemView, LocalFileView } from "./file.js";
import { Layout } from "./layout.js";
import { Pg, Score } from "./score.js";
import { smuflTable } from "./smufl.js";
import { Clock, Metronome, Piano, Review, Stopwatch, Volume } from "./tool.js";
export { Panel, panels, EditPanel, ScreenPanel, CurtainPanel };

// -skip

/**
 * class Select
 * 
 * Re-implementation of html select list for panels, featuring progressive selection
 * of an option by typing by typing a case-insensitive match string.
 * @param button   - Trigger button element
 * @param options  - list of strings, options to display
 * @param option   - string, initial option, if any
 * @param  panel   - panel using the Select object
 *
 * Dispatches "SELECTED" on the button if/when an option is
 * picked...picked option is value of event.detail.
 */
class Select {

  static css = css(
    "Select", `
    mark {
      background-color: #aaa;
    }
    .Select__toggle {
      border:2px solid black;
      border-radius:var(--borderRadius);
      font-family:Bravura;
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      padding-right:1.5em;
      height:3em;
      box-sizing: border-box;
    }
    .Select__toggle:after {
      content: "\ueb7c";
      position:absolute;
      right:.2em;
      font-size:3em;
      top: calc(50% - .2em);
      line-height:0;
     }
    .Select__list {
      border-radius:var(--borderRadius);
      color:black;
      position:absolute;
      text-align:left;
      background:white;
      font-family:Bravura;
      overflow-y:scroll;
      scrollbar-width:none;
      z-index: var(--z-modal);
    }
    /* for older Safri and Firefox */
    .Select__list::-webkit-scrollbar {
      display: none;                                                                                                                                } 
 `) ;

  elm = helm(`
    <div>
     <div data-tag="toggle" class="Select__toggle"></div>
     <div data-tag="list" class="Select__list" style="visibility:hidden"></div>
    </div>`) ;

  constructor(options, option=null, panel) {
    Object.assign(this, dataIndex("tag", this.elm));
    Object.assign(this, {options, option, panel}) ;
    delay(25, () => this.build()) ; // call build after we're confident panel is in the dom
  }

  build() {
    let keyBuf = '';
    let {options, option, panel, toggle, list} = this ;

    let toggleStyle = getComputedStyle(toggle);
    let emPerPx = parseFloat(toggleStyle.fontSize) ;
    toggle.style.width = list.style.width = parseFloat(toggleStyle.width) / emPerPx + "em";
    list.style.height = ((getBox(panel.body).bottom - getBox(toggle).bottom) / emPerPx) + "em" ;

    for(let option of options) list.append(helm(`<div style="padding:.25em">${option}</div>`)) ;

    // remember the initial list height (in style format, with "px")
    let listHeight = list.offsetHeight + "px";

    function gage(e, eup, client="clientY", jitter=6) {
      // Return velocity in px/msec of a user gesture on pointerup as part of (pointerdown(e), pointermove(emv), pointerup(eup) sequence
      // e.mvBuffer must exist, format: [ {p:...,t:...},...], where p is point (emv.clientX or emv.clientY) and t is emv.timestamp
      // client set to "clientX" to compute horizontally
      // jitter: movement < jitter px is not considered
      // @return vel (+/- shows direction, 0 means moved but stopped, null means never moved (except for jitter)
      // NOTE: we may eventually want to move this function to common.js and use it to measure user's velocity in layouts too.
      // That is why we have a "client" argument.
      let buf = e.mvBuffer;
      let moved = buf.length? Math.max(...buf.map(ev => Math.abs(ev.p - e[client]))) : Math.abs(eup[client] - e[client]); // max mvm
      if(moved <= jitter) return null ;  // no mvm
      if(!buf.length || eup.timeStamp - buf.at(-1).t > 100) return 0 ; // moved but stopped
      let recent = buf.filter(ev => eup.timeStamp - ev.t <= 150) ;
      let velBuf = recent.length >=2 ? recent : buf ;
      if(velBuf.length < 2) return 0 ; // moved but stopped
      let first = velBuf[0], last = velBuf.at(-1);
      let dt = last.t - first.t ;
      return dt > 0 ? (first.p - last.p) / dt : 0 ;
    }

    let selectOption = (option, matched=null) => {
      // called when an option is selected by user, either by clicking the option or by 
      // matching the option's text through typing. matched, if non-null, contains the
      // chars in option that were matched by keyBuf (user's typed chars)
      if(matched) {
        let re =  new RegExp(matched, "i");
        toggle.innerHTML = "<div>" + option.replace(re,`<mark>${option.match(re)[0]}</mark>`) + "</div>";
      }
      else toggle.textContent = option;
      toggle.dispatchEvent(new CustomEvent('SELECTED', { detail:option}));
    }

    list.tabIndex = 0;

    let closeList = () => {
      if(list.style.visibility == "hidden") return;
      animate(list, null, {height:0}, "height .35s", () => { list.style.visibility = "hidden"; list.style.height = listHeight; });
      keyBuf = "";
      list.blur();
    };

    let l1 = listen(this.toggle,"pointerdown", (e) => {
      if(list.style.visibility == "hidden") {
        list.style.visibility = "visible" ;
        animate(list, {height:0}, {height:listHeight}, "height .35s", () => list.focus());
      }
      else {
        closeList();
      }
    });

    let l2 = listen(list,"pointerdown", (e) => {
      list.setPointerCapture(e.pointerId);
      let top = list.scrollTop;
      e.mvBuffer = []; // buffer for fling velocity calculation
      let mv = listen(list, "pointermove", (emv) => {
        e.emv = emv ;
        e.mvBuffer.push({ p: emv.clientY, t: emv.timeStamp });
        if (e.mvBuffer.length > 5) e.mvBuffer.shift();
        list.scrollTop = top + e.clientY - emv.clientY;
      });
      listen(list, "pointerup", (eup) => {
        unlisten(mv);

      let vel = gage(e, eup) ;
      switch(vel) {
        case 0: return ; // moved but not flung
        case null: // not moved, i.e. jab or click
          if(this.target) this.target.style.background = "none" ;
          this.target = e.target ;
          this.target.style.background = "#aaa" ;
          closeList();
          return selectOption(e.target.textContent) ;
        default: // flung
          let abs= Math.abs(vel) ;
          let screens = abs > 1? 4: abs > .5 ? 2: .8;
          list.scrollTo({ top:  list.scrollTop + Math.sign(vel) * screens * list.offsetHeight,  behavior: 'smooth' }) ; }
      }, { once:true}) ;
    }); 

    let l3 = listen(list, "keydown", (e) => {
      if(e.key == "Home") return list.scrollTo({ top: 0, behavior: 'smooth'});
      if(e.key == "End") return list.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: 'smooth'});
      if(e.key == "ArrowDown" || e.key == "ArrowUp") {
        let optionHeight = list.scrollHeight / options.length;
        list.scrollTop += e.key == "ArrowDown" ? optionHeight : -optionHeight;
        e.stopPropagation();
        return;
      }
      if(e.key == "Backspace" || e.key == "Delete") keyBuf = keyBuf.slice(0,-1) ;
      else if(! /^[a-zA-Z0-9 .]$/.test(e.key)) return;
      else keyBuf += e.key;
      let lineNumber = 0 ;
      let opt = options.find((str) => { ++lineNumber ; return new RegExp(keyBuf, "i").test(str);}) ;
      if(opt) {
        selectOption(opt, keyBuf) ;
        list.scrollTo({
          top: (lineNumber / options.length) * list.scrollHeight - list.offsetHeight / 2,
          behavior: 'smooth'
        });
        if(this.target) this.target.style.background = "none" ;
        this.target = list.children[lineNumber-1] ;
        this.target.style.background = "#aaa" ;
      }
      else keyBuf = keyBuf.slice(0,-1) ;
    })

    panel.listeners.push(l1, l2, l3, listen(panel.elm, 'panelhide', closeList)) ;

    if(option) {
      let lineNumber = 0 ;
      let opt = options.find((str) => { ++lineNumber ; return option == str;}) ;
      if(opt) {
        selectOption(opt, keyBuf) ;
        list.scrollTop = (lineNumber / options.length) * list.scrollHeight - list.offsetHeight / 2 ;
        if(this.target) this.target.style.background = "none" ;
        this.target = list.children[lineNumber-1] ;
        this.target.style.background = "#aaa" ;
      }
    }
  }
}

/**
class Panel
  Panel's subclasses are ui elements invoked from the Menu to configure
  or extend each Menu cell's functionality.
 
  All Panel subclasses are singletons, created on demand (or simply returned,
  if already created), by calling  <<PanelClassName>>.get(@cell), with the
  correspoding menu cell as argument. This @cell is used to initialize the Panel
  subclass, and is simply ignored if singleton already exists.
**/

class Panel {
  static get(cell) {
    return panels[cell.key] || (panels[cell.key] = new this(cell));
  }

  static css = css(
    "Panel",
    `
    .Panel { /* marker only */
    }
    .Panel__elm {
      position: fixed;
      overflow: hidden;
      border-radius: var(--borderRadius);
      border: 0.05em solid rgba(100,115,148,0.22);
      filter: var(--panelShadow);
      box-shadow: var(--panel-inset-shadow);
      background: var(--panel-bg);
      z-index: 90;
    }
    .Panel__header {
      background: var(--panel-header-bg);
      background-image: var(--panTexture);
      height: 3em;
      width: 100%;
      color: var(--color-text);
    }
    .Panel__header-selected {
      background: var(--panel-header-selected-bg);
    }
    .Panel__icon {
      position: absolute;
      width: 2em;
      height: 2em;
      top: var(--spacing-sm);
      left: var(--spacing-sm);
      pointer-events: none;
    }
    .Panel__title {
      position: absolute;
      height: 3em;
      width: 100%;
      text-align: center;
      vertical-align: middle;
      line-height: 3em;
      font-weight: bold;
      color: var(--color-text);
      pointer-events: none;
    }
    .Panel__closer {
      position: absolute;
      width: 3em;
      height: 3em;
      top: 0;
      right: 0;
    }
    .Panel__body {
      font-size: var(--font-size-base); 
      margin: var(--spacing-sm);
      min-width: 13em;
      text-align: center;
      color: var(--color-text);
    }
    .Panel__fader {
      transition: opacity var(--transition-normal);
    }
    .Panel__item {
      /* used to seperate logical items in a panel body */
      margin-top: var(--spacing-sm);
    }
  `
  );

  elm = helm(`
    <div class="pz Panel" style="z-index:200">
      <div data-tag="panel" class="Panel__elm raisedEdge">
        <div data-tag="header" class="Panel__header">
          ${iconSvg("Close", { tag: "icon", class: "Panel__icon" })}
          <div class="Panel__title" data-tag="title">
          </div>
          ${iconSvg("Close Panel", {
            tag: "closer",
            class: "Panel__closer",
            viewBox: "-16 -12 48 48",
            style: "width:3em;height:3em;",
          })}
        </div>
        <div data-tag="body" class="Panel__body">
        </div>
      </div>
    </div>`);

  cell = null;
  listeners = [];

  constructor(cell) {
    Object.assign(this, dataIndex("tag", this.elm));
    this.elm.style.fontSize = _menu_.elm.style.fontSize; // open at same zoom level as menu
    this.cell = cell;
    this.elm.dataset.tag = this.constructor.name;
    this.elm.panel = this;
    this.setIcon(cell.svgPath);
    this.setTitle(cell.name);
    this.listeners.push(
      listen(this.closer, "pointerdown", (e) => {
        e.stopPropagation();
        this.close();
      })
    );
    this.listeners.push(
      listen(this.header, "pointerdown", (e) => {
        let { header, elm } = this;
        if(!(this instanceof CurtainPanel)) // CurtainPanel uniquely manages its own z-index
          elm.style.zIndex = ++_zTop_; // move to top of stacking order
        this.header.classList.add("Panel__header-selected");
        header.setPointerCapture(e.pointerId);
        let middleX = this.panel.offsetWidth / 2;
        let middleY = this.panel.offsetHeight / 2;
        let mv = listen(header, "pointermove", (emv) => {
          if (e.pointerId != emv.pointerId) return;
          flung(emv); // store event for fling detection
          elm.style.left = emv.clientX - e.offsetX + middleX + "px";
          elm.style.top = emv.clientY - e.offsetY + middleY + "px";
          this.constrain();
          e.emv = emv;
        });

        listen(header,"pointerup",
          (eup) => {
            header.classList.remove("Panel__header-selected");
            unlisten(mv);
            if (flung(null, eup)) { // fling detected
              this.hide();
              if(this.elm.dataset.tag != "ScreenPanel") ScreenPanel.update(null) ;
            }
          },
          { once: true }
        );
      })
    );
    this.listeners.push(
      listen(window, "resize", () => {
        if (this.elm.style.visibility == "visible") {
          this.constrain();
      }
    }));
  }

  hidden() { 
    // subclasses override to take action when they are about to
    // be hidden
  }

  close() {
    // When a panel is closed, its first hidden, then, removed from
    // the dom, and its singleton is deleted.
    this.hide();
    if (this.elm.dataset.tag != "ScreenPanel" && ScreenPanel.pzTarget == this.elm) ScreenPanel.update(null) ;
    schedule(510, () => {
      this.elm.remove();
      this.destructor();
      delete panels[this.cell.key];
    });
  }

  destructor() {
    // Called just before singleton is deleted: close/clean up any "resources"
    // the panel may be holding on to.
    unlisten(...this.listeners);
  }

 constrain() {
    // Ensure at least 50% of the panel header's width and 100% of its height stays onscreen
    delay(10, () => {  // must delay until after any screen.orientation change, see main.js
      let newLeft = clamp(this.elm.offsetLeft, 0, innerWidth);
      let newTop = clamp(this.elm.offsetTop, this.panel.offsetHeight/2,
        innerHeight - this.header.offsetHeight + this.panel.offsetHeight / 2);
      if (this.elm.offsetLeft != newLeft) this.elm.style.left = newLeft + "px";
      if (this.elm.offsetTop != newTop) this.elm.style.top = newTop + "px";
    });
  }

  setIcon(svgPath) {
    let newIcon = helm(
      `<svg data-tag="icon" class="Panel__icon" viewBox="0 0 24 24">${svgPath}</svg>`
    );
    this.icon.replaceWith(newIcon);
    this.icon = newIcon;
  }

  setTitle(title) {
    this.title.innerText = title;
  }

  show(onShown = null) {
    // Bring the panel on screen (if it is not) .
    // @onShown, if supplied, is a function that is called
    //   when the standard show animation is completed.
    ScreenPanel.update(this.elm) ;
    let elm = this.elm;
    this.setIcon(this.cell.svgPath);
    this.setTitle(this.cell.name);
    elm.style.visibility = "visible";
    let fontSize = elm.style.fontSize;
    elm.style.fontSize = 0;
    elm.style.transition = "font-size 0.35s";
    if (!elm.isConnected) _body_.append(elm);
    listen(elm,"transitionend", () => {
        elm.style.transition = "unset";
        if(onShown) onShown();
      },
      { once:true});
    reflow();
    elm.style.fontSize = fontSize;
    _pzTarget_ = elm;
    let clazz = this.constructor.name ;
    if (this != _panels_.screen && clazz != "ScreenPanel") {
      _lastTarget_ = elm;
      _panels_.screen?.surface.update();
    }
    if(clazz != "CurtainPanel") elm.style.zIndex = ++_zTop_;
    return this;
  }

  hide() {
    this.elm.dispatchEvent(new CustomEvent('panelhide'));
    hide(this.elm, dataIndex("tag", this.cell.elm).cellIcon);
    this.hidden();
  }

  setPosition(otherElm) {
    // Position panel element's "closest corner" to corner relative
    // to center of another element that's closest to window's center,
    // usually _menu_.grip. Usually, Panel's are positioned as part
    // of the drag out gesture from the menu. However some Panels
    // can be opened by simply clicking on their cell. This method
    // is provided for such cases.
    let elm = this.elm;
    let box = getBox(otherElm);
    let mid = box.x + box.width / 2;
    mid > innerWidth / 2
      ? (elm.style.left = mid - elm.offsetWidth + "px")
      : (elm.style.left = mid + "px");
    mid = box.y - box.height / 2;
    mid > innerHeight / 2
      ? (elm.style.top = mid - elm.offsetHeight / 2 + "px")
      : (elm.style.top = mid + "px");
    box = getBox(elm);
    if (box.top < 0 || box.bottom > innerHeight)
      elm.style.top =
        Math.max(innerHeight / 2 - box.height / 2, 0) + "px";
    if (box.left < 0 || box.right > innerWidth)
      elm.style.left =
        Math.max(innerWidth / 2 - box.width / 2, 0) + "px";
    this.constrain();

  }

}

class AboutPanel extends Panel {
  static css = css(
    "AboutPanel",
    `.Credit {
        font-size: var(--font-size-xs);
        margin: var(--spacing-lg);
     }
     .AboutPanel__scroll {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        height: 100%;
        box-sizing: border-box;
        cursor: grab;
     }
     .AboutPanel__scroll::-webkit-scrollbar {
        display: none;
     }
     `
  );

  licenseFace = helm(`<p style="padding:2em;overflow:auto;text-align:center;">
  <br><b>PODIUM: Sheet Music Studio</b><br><br>
  Copyright 2026 Glendon Diener<br><br>

  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.<br><br>

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
      <a rel="noopener noreferrer" href="https://www.gnu.org/licenses/agpl-3.0-standalone.html">GNU Affero Public License</a>
for more details.</p>
      `);

  creditsFace = helm(`<div>
        <div class="Credit">
          <a href="https://github.com/steinbergmedia/bravura">Bravura</a> Version 1.1<br>
          © 2019, Steinberg Media Technologies GmbH<br>
          SIL OPEN FONT LICENSE Version 1.1
        </div><div class="Credit">
          <a href="https://codepen.io/zastrow/details/kxdYdk">CSS Piano</a><br>
          © 2026 Philip Zastrow
        </div><div class="Credit">
          <a href="https://github.com/fabricjs">fabric.js</a> Version 5.2.1<br>
          © 2008-2015 Printio (Juriy Zaytsev, Maxim Chernyak)<br>
          MIT LICENSE
        </div><div class="Credit">
          <a href="https://github.com/foliojs/fontkit">fontkit.js</a> Version 1.1.1<br>
          Author: Devon Govett<br>
          MIT LICENSE
        </div><div class="Credit">
          <a href="https://fonts.google.com/specimen/Patrick+Hand">Patrick Hand Regular</a> Version 1.1.1<br>
          © 2010-2012 Patrick Wagesreiter<br>
          SIL OPEN FONT LICENSE Version 1.1
        </div><div class="Credit">
          <a href="https://github.com/mozilla/pdf.js">pdf.js</a> Version 5.6.205<br>
          © 2023 Mozilla Foundation<br>
          APACHE LICENSE Version 2.0<br>
        </div><div class="Credit">
          <a href="https://github.com/Hopding/pdf-lib">pdf-lib.js</a> Version 1.17.1<br>
          © 2019 Andrew Dillon<br>
          MIT LICENSE
        </div><div class="Credit">
          <a href="https://github.com/sfzinstruments/SalamanderGrandPiano">Salamander Grand Piano</a>  V2 Yamaha C5<br>
          Author: Alexander Holm<br>
          Creative Commons 3.0
        </div><div class="Credit">
          <a href="https://filipposfragkogiannis.com/fonts/vercetti-regular">Vercetti Regular</a> Version 1.1<br>
          Designer: Filippos Fragkogiannis<br>
          LICENSE AMICALE V. 0.2
        </div></div>
         `);

  aboutFace = helm(
    `<div style="position:relative;width:100%;height:100%;box-sizing:border-box;">
        <div style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);text-align:center;font-size:1.5em;">
          <div>PODIUM: Sheet Music Studio</div>
          ${iconSvg("Podium", { style: "width:8em;" })}
          <div>Version ${_podiumVersion_}</div>
          <div style="font-size:.6em;color:#888;">${typeof chrome !== "undefined" && chrome.runtime?.id ? "Browser Extension" : window.matchMedia("(display-mode: standalone)").matches ? "Progressive Web App" : location.protocol + "//" + location.host}</div>
        </div>
        <div style="position:absolute;bottom:2em;left:50%;transform:translateX(-50%);font-size:1.2em;text-align:center;font-variant-emoji:text;">
           <a href="https://studiop5.org/privacy.html">\u{1F6E1} Privacy</a>&nbsp;
          <a href="https://studiop5.org/terms.html">\u00A7 Terms</a><br><br>
          <a href="https://github.com/studiop5/podium">&lt;&sol;&gt; Source</a>&nbsp;
          <a href="https://github.com/studiop5/podium/issues">\u2709\uFE0E Issues</a>
        </div>
     </div>`
  );


  releaseNotesFace = helm(
    `<div class="AboutPanel__scroll" style="padding:2em;text-align:left;font-size:.8em;">
      <h2>V2.0.2 April 2026</h2>
  <ul>
  <li>Updated SMuFL documentation link.</li>
  </ul>
      <h2>V2.0 March 2026</h2>
  <ul>
  <li><b>Browser Extension (Chrome, Edge)</b><br>
  Right-click any PDF link and open it directly in Podium. Includes IMSLP integration for seamless access to the world's largest public domain music library.
  </li><br>
  <li><b>Progressive Web App</b><br>
  Install Podium from your browser for app-like access and offline use.
  </li><br>
  <li><b>App Ring</b><br>
  New ring with About, Theme, Guide, Storage, and Screen cells for managing application settings, appearance, and documentation.
  </li><br>
  <li><b>Magnify (Page ring)</b><br>
  A dedicated magnification tool for zooming into score details. Drag to reposition, pinch or use the slider to adjust zoom level.
  </li><br>
  <li><b>Piano Tuner (More ring &rarr; Piano)</b><br>
  Built-in chromatic tuner integrated into the Piano panel, powered by YIN pitch detection. Use your device's microphone to tune instruments with real-time pitch and confidence display.
  </li><br>
  <li><b>Cell Locking</b><br>
  Long-press supported ink and page ring cells to lock them on, preventing auto-deactivation. Useful for extended annotation or page editing sessions.
  </li><br>
  <li><b>Edit Panel (Ink ring &rarr; Edit)</b><br>
  Precisely adjust the position, size, and rotation of selected annotations by entering exact values for X, Y, width, height, and rotation angle.
  </li><br>
  <li><b>Cut, Copy &amp; Paste (Page ring)</b><br>
  New local cut, copy, and paste cells for moving and duplicating pages within a score. The previous Copy and Paste cells, which share pages between Podium instances, are renamed Export and Import.
  </li><br>
  <li><b>Tap to Turn Pages</b><br>
  In Book, Horizontal, and Vertical layouts, a tap is equivalent to a quick fling.
  </li><br>
  <li><b>Guide (App ring)</b><br>
  Comprehensive new guidebook with 10 chapters, screenshots, embedded video demos, and a searchable keyword index.
  </li><br>
  </ul>
      <h2>V1.1 December 2025</h2>
  <ul>
  <li> <b>Shared Copy/Paste Buffer (Page ring)</b><br>
  Copy and paste pages between different Podium instances. Useful for combining pages from multiple scores,
  extracting individual movements, or assembling custom practice sets.
  </li><br>
  <li><b>Dark Mode (More ring)</b><br>
  Reduces eye strain during long practice sessions or low-light environments.
  </li><br>
  <li><b>Page Expansion (Score ring → Details)</b><br>
  Pages smaller than the maximum size in a score can now be expanded to fill the available space, providing a more
  consistent viewing experience.
  </li><br>
  <li><b>Page Management (Layout ring → Table)</b><br>
  Reorder pages by dragging them to a new position. Delete pages by dragging them off the layout.
  </li><br>
  <li><b>New Fonts (Ink ring → Text)</b><br>
  Two new font options: Vercetti and Patrick Hand (a handwritten-style font).
  </li><br>
  <li><b>Auto-off Safety Feature</b><br>
  Page and ink ring cells automatically deactivate after a few seconds of inactivity, preventing accidental deletions or other unintended actions.
  </li><br>
  </ul>
   <h2>V1.0 March 2025</h2>
   Initial release.
     </div>

   `);

  constructor(cell) {
    super(cell);
    let tabView = new TabView(this, "Version", "Release Notes", "Credits", "License");
    Object.assign(this.body.style, {
      margin: 0,
      width: "90vw",
      maxWidth: "50em",
      height: "90vh",
      maxHeight: "40em",
    });
    tabView.frame.style.height = "100%";
    tabView.faces.style.position = "relative";
    tabView.faces.style.top = "0";

    // Version tab
    tabView.tabs["Version"].face.append(this.aboutFace);

    // Release Notes tab — drag-to-scroll for mouse (touch uses native scrolling)
    tabView.tabs["Release Notes"].face.append(this.releaseNotesFace);
    let rnf = this.releaseNotesFace;
    listen(rnf, "pointerdown", (e) => {
      if (e.pointerType == "touch") return;
      let startY = e.clientY;
      let startScroll = rnf.scrollTop;
      rnf.setPointerCapture(e.pointerId);
      let mv = listen(rnf, "pointermove", (emv) => {
        rnf.scrollTop = startScroll - (emv.clientY - startY);
      });
      listen(rnf, "pointerup", () => unlisten(mv), { once: true });
    });

    // Credits and License tabs
    tabView.tabs["Credits"].face.append(this.creditsFace);
    tabView.tabs["License"].face.append(this.licenseFace);

    this.body.append(tabView.elm);
    tabView.tabs["Version"].select();
  }
}

class AddPanel extends Panel {

  options = {
    "Match Score":"score",
    "Custom":"custom",
    "A3":"mm/279/420",
    "A4":"mm/210/297",
    "B4":"mm/250/353",
    "Octavo":"in/6.5/10.5",
    "Letter":"in/8.5/11",
    "Folio":"in/9/12",
    "Hand Copy (Trad)":"in/9.5/12.5",
    "Orchestral Parts (MOLA)":"in/11/14",
    "Ledger":"in/17/11",
    "Legal":"in/8.5/14.0",
    "Tabloid":"in/11/17",
  }

  content = helm(`
    <div>
      <div data-tag="colorPickerProxy"></div>
      <div class="Panel__item">Size</div>
      <div data-tag="selectProxy"></div>
      <div data-tag="customProxy"></div>
    </div>
  `)

  constructor(cell) {
    super(cell);
    Object.assign(this, dataIndex("tag", this.content));
    this.body.append(this.content);
    let stash = cell.stash;
     // Color picker
    this.colorPicker = new ColorPicker(
      "Color", stash.rgb, stash.alpha,
      (rgb, alpha) => {
        stash.rgb = rgb;
        stash.alpha = alpha;
      }
    );
    this.colorPickerProxy.replaceWith(this.colorPicker.elm);
    this.select = new Select(Object.keys(this.options), stash.size, this) ;
    this.selectProxy.replaceWith(this.select.elm) ;
    this.setupSizeSelection(stash);
  }

  setupSizeSelection(stash) {
    // Extract the size selection logic into a method
    let sizeMsg = (tag, val) => {
      let pt = val.toFixed(0);
      let mm = (val * (1 / 2.8346456693)).toFixed(0);
      let inch = (val * (1 / 72)).toFixed(2);
      return `${tag}: ${pt}pt,... ${mm}mm, ${inch}in`;
    };
    let disable = stash.size != "Custom";

    this.customGroup = new SliderGroup(stash,
      { Width: { min: 100, max: 2000, msg: sizeMsg, step: 1, disabled: disable},
        Height: { min: 100, max: 2000, msg: sizeMsg, step: 1, disabled: disable},
      }, null);
    this.customProxy.replaceWith(this.customGroup.elm);

    listen(this.select.toggle, "SELECTED", (e) => {
      stash.size = e.detail;
      let detail = this.options[e.detail] ;
      if (detail == "score") { // Match current score dimensions
        let score = _score_;
        stash.Width = score.maxWidth;
        stash.Height = score.maxHeight;
        this.customGroup.defs.Height.disabled = true;
        this.customGroup.defs.Width.disabled = true;
      }
      else if (detail == "custom") {
        this.customGroup.defs.Height.disabled = false;
        this.customGroup.defs.Width.disabled = false;
      } else {
        let [unit, width, height] = detail.split("/");
        let toPts = unit == "in" ? 72 : unit == "mm" ? 2.8346456693 : 1;
        stash.Width = width * toPts;
        stash.Height = height * toPts;
        this.customGroup.defs.Height.disabled = true;
        this.customGroup.defs.Width.disabled = true;
      }
      this.customGroup.refresh();
    });

    this.customGroup.refresh();
  }
}

class NewPanel extends AddPanel {

  constructor(cell) {
    super(cell); 
    this.select.options.shift() ; // remove the "Math Score" option: not applicable toNewPanel
    this.pagesGroup = new SliderGroup( cell.stash,
      {  pages: { min: 1, max: 100, value: 5, 
         msg: (tag, val) => `${val.toFixed(0)} page${val > 1 ? "s":""}`, step: 1 }, }, null );
    this.body.prepend(this.pagesGroup.elm);    
    this.pagesGroup.refresh();
  }
}

class DetailsPanel extends Panel {
  content = helm(`<div style="margin:1em;width:20em;"></div>`);

  constructor(cell) {
    super(cell);
    Object.assign(this, dataIndex("tag", this.content));

    this.body.replaceWith(this.content);

    this.fitGroup = new ButtonGroup(
      this.cell.stash, {
        Expand: { svg: "Expand", radio: "pgFit" },
        Center: { svg: "Center", radio: "pgFit" }, 
      },
      async (e,tag,value) => {
         let score = _score_;
         score.details.pgFit = value;
         await Layout.open(_menu_.rings.layout.activeCell);
      }
    );
    
    this.qualityGroup = new SliderGroup(
      this.cell.stash,
      {
        quality: {
          min: 0.5,
          max: 6,
          step: 0.1,
          value: 2,
          throttle: 750,
          msg: () => {
            let q = cell.stash.quality;
            let desc =
              q < 1.1
                ? "Low"
                : q < 2.1
                ? "Medium"
                : q < 3.1
                ? "High"
                : q < 4.1
                ? "Very High"
                : "Extreme";
            return "Display Quality: " + desc + ` (${parseInt(q * 100)}%)`;
          },
        },
      },
      async (e, tag, value) => {
        this.cell.stash.tag = value;
        let score = _score_;
        if (score) {
          score.quality = value;
          for (let pg of score.pgs)
            // rerender un-rendered pg's iff they are backed by pdf:
            if (pg.inflated && pg.mozPn) await pg.renderPdf();
        }
      }
    );

    this.refresh();
  }

  parseTs(ts) {
    // Convert a pdf "internal" date string to a timestamp
    try {
      let l = ts.length;
      let j = "";
      if (l > 5) j += ts.substring(2, 6);
      if (l > 7) j += "-" + ts.substring(6, 8);
      if (l > 9) j += "-" + ts.substring(8, 10);
      if (l > 11) j += "T" + ts.substring(10, 12);
      if (l > 13) j += ":" + ts.substring(12, 14);
      if (l > 15) j += ":" + ts.substring(14, 16);
      if (l > 16) j += ".000" + ts.substring(16, 17);
      if (l > 18) j += ts.substring(17, 19);
      if (l > 21) j += ":" + ts.substring(20, 22);
      return Date.parse(j);
    } catch (error) {
      return null;
    }
  }

  refresh() {
    this.qualityGroup.refresh();
    clearChildren(this.content);
    if (_score_) {
      let score = _score_;

      let nameInput = helm(
        `<input type="text" style="font-size:1.5em;text-align:center;margin-bottom:.5em;width:100%;box-sizing:border-box;border:none;border-radius:var(--borderRadius);background:white;">`
      );
      nameInput.value = score.name.replace(/\.pdf$/i, "");
      nameInput.addEventListener("change", () => {
        let newName = nameInput.value.trim();
        if (!newName.toLowerCase().endsWith(".pdf")) newName += ".pdf";
        score.name = newName;
        let title = newName.replace(/\.pdf$/i, "");
        const maxLen = 30;
        if (title.length > maxLen) {
          let half = (maxLen - 1) >> 1;
          title = title.slice(0, half) + "\u2026" + title.slice(-half);
        }
        document.title = title;
      });
      this.content.append(nameInput);
      let source = score.source
        ? `<div style="text-align:right;">Source:&nbsp;</div><div>${score.source}</div>`
        : "";
      let path = score.path
        ? `<div style="text-align:right;">Path:&nbsp;</div><div>${score.path} </div>`
        : "";
      let size = score.size
        ? `<div style="text-align:right;">Size:&nbsp;</div><div>${Number(
            score.size
          ).toLocaleString()} B</div>`
        : "";
      this.content.append(
        helm(`<div style="display:grid;grid-template-columns:40% 60%;font-size:.8em;">
          ${source} ${path} ${size}
          <div style="text-align:right;">Pages:&nbsp;</div><div>${
            score.pgs.length
          }</div>
          <div style="text-align:right;">Created:&nbsp;</div><div>${
            score.created ? new Date(score.created).toLocaleString() : "?"
          }</div>
          <div style="text-align:right;">Modified:&nbsp;</div><div>${
            score.modified ? new Date(score.modified).toLocaleString() : "?"
          }</div>
          <div style="text-align:right;">Width:&nbsp;</div><div>${score.maxWidth.toFixed(0)} pt, ${(score.maxWidth / 2.8346456693).toFixed(0)} mm, ${(score.maxWidth / 72).toFixed(2)} in</div>
          <div style="text-align:right;">Height:&nbsp;</div><div>${score.maxHeight.toFixed(0)} pt, ${(score.maxHeight / 2.8346456693).toFixed(0)} mm, ${(score.maxHeight / 72).toFixed(2)} in</div>
          </div>`)
      );

      this.content.append(helm(`<div style="text-align:center;"><br>Page Fit</div>`));
      this.content.append(this.fitGroup.elm);
      this.content.append(this.qualityGroup.elm);

      if (score.pdfInfo) {
        this.content.append(
          helm(
            `<div style="font-size:1em;text-align:center;padding:.5em;">PDF Metadata:</div>`
          )
        );
        let detailsHtml = "";
        for (let [k, v] of Object.entries(score.pdfInfo)) {
          if (!k) continue;
          // Filter out technical fields
          if (k == "PDFFormatVersion" || k == "Language" || k == "EncryptFilterType" || k == "EncryptFilterName") continue;
          if (k.startsWith("Is") || k.startsWith("is")) continue; // Skip isLinearized, isPureXfa, etc.

          // For date fields, show only the decoded date
          if (typeof v == "string" && v.startsWith("D:")) {
            v = new Date(this.parseTs(v)).toLocaleString();
          }
          detailsHtml += `<div style="text-align:right">${escapeHtml(k)}:&nbsp;&nbsp;</div><div>${escapeHtml(String(v))}</div>`;
        }
        this.content.append(
          helm(
            `<div style="display:grid;grid-template-columns:40% 60%;font-size:.8em;">${detailsHtml}</div>`
          )
        );
      }
    }
  }

  show() {
    super.show();
    this.refresh();
    return this;
  }
}

class FilePanel extends Panel {
  // superclass of OpenPanel and SavePanel
  tabView = null;
  //  mode = "open"; // subclasses redefine: one of "save" or "open"

  constructor(cell) {
    super(cell);
    Object.assign(this.body.style, {
      margin: 0,
      width: "90vw",
      maxWidth: "30em",
      height: "90vh",
      maxHeight: "30em",
    });
  }

  show() {
    super.show();
    if (this.tabView.selectedTab) this.tabView.selectedTab.select();
    return this;
  }
}

class OpenPanel extends FilePanel {
  constructor(cell) {
    super(cell);
    this.mode = "open";
    // Filter out WWW - it's a source type but not a file browser tab
    const fileSources = Object.entries(Score.sources).filter(([key]) => key !== "url").map(([, value]) => value);
    this.tabView = new TabView(this, "Recent", ...fileSources);
    this.body.append(this.tabView.elm);
    for (let title in this.tabView.tabs) {
      let tab = this.tabView.tabs[title];
      tab.onSelect = async (tab) => {
        if (!tab.view) {
          try {
            if (title == "Recent") tab.view = new FileListView(this);
            else if (title == "Local") tab.view = new LocalFileView(this);
            else
              tab.view = new FileSystemView(
                title,
                await FileSrc.get(title),
                this
              );
            tab.face.append(tab.view.elm);
          } catch (err) {
            tab.view = null;
            return;
          }
        }
        tab.view.select(this.tabView, tab);
      };
    }
  }
}

class CopyPanel extends OpenPanel {
  constructor(cell) {
    super(cell);
    this.mode = "copy";
  }
}


class MergePanel extends OpenPanel {
  mode = "merge";
}


class SavePanel extends FilePanel {
  mode = "save";

  constructor(cell) {
    // code identical to OpenPanel constructor except that a SavePanel
    // doesn't have a "Recent" tab
    super(cell);
    this.mode = "save";
    // Filter out WWW (url source)
    const fileSources = Object.entries(Score.sources)
      .filter(([key]) => key !== "url")
      .map(([, value]) => value);
    this.tabView = new TabView(this, ...fileSources);
    this.body.append(this.tabView.elm);
    // Source tabs
    for (let title in this.tabView.tabs) {
      let tab = this.tabView.tabs[title];
      tab.onSelect = async (tab) => {
        if (!tab.view) {
          try {
            if (title == "Local") tab.view = new LocalFileView(this);
            else
              tab.view = new FileSystemView(
                title,
                await FileSrc.get(title),
                this
              );
            tab.face.append(tab.view.elm);
          } catch (err) {
            tab.view = null;
            return;
          }
        }
        tab.view.select(this.tabView, tab);
      };
    }
  }
}

class GridPanel extends Panel {
  content = helm(`
    <div class="Panel__body">
      <div data-tag="options"></div>
      <div data-tag="sliders"></div>
      Numbers<br>
      <div data-tag="numbers"></div>
    </div>`);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    let setUnits = (units) => {
      let currentSliders = this.sliders;
      this.sliders = {
        Inch: this.inchSliders.elm,
        Metric: this.metricSliders.elm,
      }[units];
      currentSliders.replaceWith(this.sliders);
    };

    let options = new ButtonGroup(
      this.cell.stash,
      {
        Inch: { svg: "Inch", radio: "units" },
        Metric: { svg: "Metric", radio: "units" },
      },
      (e, tag, value) => (tag == "units" ? setUnits(value) : null)
    );
    this.options.replaceWith(options.elm);

    {
      // inches
      let steps = ["1", "1/2", "1/4", "1/8", "1/16"];
      let xStepMsg = (tag, value) => "X Step: " + steps[value] + " inch";
      let yStepMsg = (tab, value) => "Y Step: " + steps[value] + " inch";
      this.inchSliders = new SliderGroup(
        this.cell.stash,
        {
          xStep: { min: 0, max: 4, step: 1, value: 0, msg: xStepMsg, row:1, col:1 },
          yStep: { min: 0, max: 4, step: 1, value: 0, msg: yStepMsg, row:1, col:2 },
        },
        () => {}
      );
      this.inchSliders.elm.classList.add("GridPanel__sliders");
    }

    {
      // metric
      let steps = [4, 2, 1, 0.5, 0.25];
      let xStepMsg = (tag, value) => "X Step: " + steps[value] + " cm";
      let yStepMsg = (tab, value) => "Y Step: " + steps[value] + " cm";

      this.metricSliders = new SliderGroup(
        this.cell.stash,
        {
          xStep: { min: 0, max: 4, step: 1, value: 0, msg: xStepMsg },
          yStep: { min: 0, max: 4, step: 1, value: 0, msg: yStepMsg },
        },
        () => {}
      );
      this.metricSliders.elm.classList.add("GridPanel__sliders");
    }

    let numbers = new ButtonGroup(this.cell.stash, {
      On: { svg: "Numbers", radio: "numbers" },
      Off: { svg: "Close", radio: "numbers" },
    });
    this.numbers.replaceWith(numbers.elm);

    setUnits(this.cell.stash.units); // current units from prefs
  }
}

class GuidePanel extends Panel {
  static guidebookUrl = typeof chrome !== "undefined" && chrome.runtime?.id
    ? "https://studiop5.org/Guidebook.html"
    : "Guidebook.html";

  content = helm(
    `<div style="padding:0;width:100%;height:100%;box-sizing:border-box;overflow:hidden;position:relative;">
       <iframe style="width:100%;height:100%;border:none;display:none;"></iframe>
       <div class="guide-msg" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#888;font-size:1.2em;"></div>
     </div>`
  );

  constructor(cell) {
    super(cell);
    Object.assign(this.body.style, {
      margin: 0,
      padding: 0,
      width: "90vw",
      maxWidth: "60em",
      height: "90vh",
      maxHeight: "50em",
    });

    this.body.append(this.content);
    this.iframe = this.content.querySelector("iframe");
    this.msg = this.content.querySelector(".guide-msg");
    this.fetched = false;
  }

  show() {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      // Extension: open in new tab (cross-origin iframe restrictions prevent embedding)
      if (this.guideWin && !this.guideWin.closed) this.guideWin.focus();
      else  this.guideWin = window.open(GuidePanel.guidebookUrl, "podium-guidebook");
      return this;
    }
    super.show();
    if (this.fetched) return this;
    this.fetched = true;
    this.msg.textContent = "Fetching Guidebook...";
    this.iframe.src = GuidePanel.guidebookUrl;
    this.iframe.addEventListener("load", () => {
      this.iframe.style.display = "block";
      this.msg.style.display = "none";
    }, { once: true });
    if (!navigator.onLine) {
      this.msg.textContent = "Guidebook is not available.";
    }
    return this;
  }
}

class ImportPanel extends Panel {

  static css = css(
    "ImportPanel", 
     `.ImportPanel__frame {
        background-image: var(--panTexture);
        height: 6em;
        width: 100%;
        padding:.8em 0;
        box-sizing: border-box;
        margin-bottom: 0.2em;
        overflow: hidden;
        border-radius: var(--borderRadius);
      }
      
      .ImportPanel__sash {
        position: relative;
        height:100%;
        width: max-content;
        min-width: 100%;
        padding: 0 0.8em;
        box-sizing: border-box;
        display: flex;
        gap: 0.8em;
        align-items: flex-start;
      }
   `);

  content = helm(`
     <div data-tag="body" class="Panel__body">
       <div class="ImportPanel__frame" data-tag="frame">
         <div class="ImportPanel__sash" data-tag="sash"></div>
       </div>
       <div data-tag="buttons" style="border-top: 1px solid var(--color-border);"></div>
     </div>
   `);

  constructor(cell) {
    super(cell);

    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    listen(this.sash, "pointerdown", (e) => { 
      this.sash.setPointerCapture(e.pointerId);
      let fs = parseFloat(getComputedStyle(this.sash).fontSize);
      let offsetX = e.clientX - this.sash.offsetLeft;
      let limit = this.sash.offsetWidth - this.frame.offsetWidth;
      let mv = listen(this.sash, "pointermove", (emv) => {
        let leftPx = clamp(emv.clientX - offsetX, -limit, 0);
        this.sash.style.left = leftPx / fs + "em";
      });
      listen(this.sash, "pointerup", (eup) => {
        unlisten(mv);
      }, { once: true });
    });

    let buttons = new ButtonGroup({}, {
        Clear: { svg: "Cancel" },
        Undo: { svg: "Undo" },
      },
      async (e, tag, value) => {
        if(value == "Clear") await _podPb_.pgClear();
        else if(value == "Undo") await _podPb_.pgPop();
        delay(10, () => {
          // We don't have a button type for "one shot" (button causes
          // handler to run, but immediately goes back to initial state),
          // can easily simulate it:
          delete buttons.props[value]; 
          buttons.refresh();
        });
      }
    );
    buttons.elm.style.borderTop = ".02em solid var(--color-border)";   
    this.buttons.replaceWith(buttons.elm);

    listen(_body_, "SHAREDBUFFER", async (e) => {
      _shade_.show("Building...");
      let score = await _podPb_.getScore();
      let thumbs = [];
      for(let pg of score.pgs) thumbs.push(await pg.getThumbElm(true));
      _shade_.hide();
      clearChildren(this.sash);
      if(thumbs.length > 0) { 
        _menu_.enableCells("page/import",true) ;
        this.sash.style.fontSize = "1em"; // reset to known "baseline"
        reflow();
        thumbs.forEach((thumb) => this.sash.append(thumb));
        this.sash.style.fontSize = this.sash.offsetHeight / thumbs[0].offsetHeight   + "em";
        let frameWidth = pxToEm(this.frame.offsetWidth, this.sash);
        let sashWidth = pxToEm(this.sash.offsetWidth, this.sash);
        this.sash.style.left = frameWidth;
        reflow();
        this.sash.style.transition = `left ${_gs_}ms`;
        this.sash.style.left = parseFloat(frameWidth) - parseFloat(sashWidth) - .8 + "em";
        delayMs(_gs_, () => this.sash.style.transition = "unset");
        buttons.defs.Undo.disabled = false;
        buttons.defs.Clear.disabled = false;
      }
      else {
        _menu_.enableCells("page/import", false);
        if (_menu_.activeRing?.activeCell === _menu_.rings.page.cells.paste)
          _menu_.activateCell(null);
        buttons.defs.Undo.disabled = true;
        buttons.defs.Clear.disabled = true;
      }
      buttons.refresh() ;
    })
  }

  show() {
    super.show(() => _podPb_.announce());
    return this;
  }

}


class LayoutPanel extends Panel {
  // Superclass for all Layout panels.

  content = helm(`
    <div>
      <div data-tag="bookFace" class="Panel__body">
        Page Fit<br>
        <div data-tag="fitBook"></div>
        <div data-tag="bookSliders"></div>
        Numbers<br>
        <div data-tag="pnBook"></div>
       </div>

      <div data-tag="horizontalFace" class="Panel__body">
        Page Fit<br>
        <div data-tag="fitHorizontal"></div>
        <div data-tag="fitHorizontalSliders"></div>
        Numbers<br>
        <div data-tag="pnHorizontal"></div>
      </div>

      <div data-tag="verticalFace" class="Panel__body">
        Page Fit<br>
        <div data-tag="fitVertical"></div>
        <div data-tag="fitVerticalSliders"></div>
        Numbers<br>
        <div data-tag="pnVertical"></div>
      </div>

      <div data-tag="tableFace" class="Panel__body">
        Page Fit<br>
        <div data-tag="fitTable"></div>
        <div data-tag="tableFlowSliders"></div>
        Numbers<br>
        <div data-tag="pnTable"></div>
      </div>
    </div>
   `);

  constructor(cell) {
    super(cell);
    Object.assign(this, dataIndex("tag", this.content));
    this.body.replaceWith(this.content);
    this.schedule = new Schedule();
    let tags = dataIndex("tag", this.content);
    this.faces = {
      book: tags.bookFace,
      horizontal: tags.horizontalFace,
      vertical: tags.verticalFace,
      table: tags.tableFace,
    };

    let handler = (e, tag, value, props) => {
      if (tag == "fit") this.cell.pz = null; // reset pz-set marker so layout will use fit setting
      if (tag == "pace") return;
      if (_score_ && this.cell == Layout.activeLayout.cell) {
        Layout.activeLayout.build();
      }
    };

    let msgCallback = (tag, value) => {
      if(tag == "pgShow") {
         // don't allow pgSnap to be > pgShow
         if(cell.stash.pgSnap > value) cell.stash.pgSnap = value;
         return "Show: " + value + (value == 1 ? " page" : " pages");
      } else if(tag == "pgSnap") {
        if (value == -4) return "Snap: none";
        if (value == -3) return "Snap: visible";
        if (value == -2) return "Snap: 1/4 page";
        if (value == -1) return "Snap: 1/3 page";
        if (value == 0) return "Snap: 1/2 page";
        return "Snap: " + value + (value == 1 ? " page." : " pages");
      } else if(tag == "gap") return `Gap: ${value}%`;
      else if(tag == "pace") return `Pace: ${(value/1000).toFixed(1)} sec/snap`
    };

    // defs for scroll/slider groups
    let fitGroupDef = {
      Auto:   { svg: "Fit Auto",   radio: "fit", redo: true},
      None:   { svg: "Fit None",   radio: "fit", redo: true},
      Width:  { svg: "Fit Width",  radio: "fit", redo: true},
      Height: { svg: "Fit Height", radio: "fit", redo: true},
    };
    let bookSlidersGroupDef = {
      pace: { min: 0, max: 1500, step: 100, throttle: 750,
              msg: (tag,value) => `Pace: ${(value/1000).toFixed(1)} sec/flip`},
    }
    let horzSlidersGroupDef = {
      pgShow: { min: 1, max: 8, step: 1, throttle: 750, row:1, col:1, msg: msgCallback},
      // values <= 0  are reinterpreted: see msgCallback
      pgSnap: { min: -4, max: 8,     step: 1,   throttle: 750, row:1, col:2, msg: msgCallback},
      gap:    { min: 0,  max: 100,   step: 0.5, throttle: 750, row:2, col:1, msg: msgCallback},
      pace:   { min: 0,  max: 10000, step: 100, throttle: 750, row:2, col: 2, msg: msgCallback},
    };
    // Horizontal layout uses a 2-column grid: pgShow/pgSnap on row 1, gap/pace on row 2
    let vertSlidersGroupDef = {
      pgShow: { min: 1,  max: 8,     step: 1,   throttle: 750, col: 1, row: 1, msg: msgCallback},
      pgSnap: { min: -4, max: 8,     step: 1,   throttle: 750, col: 2, row: 1, msg: msgCallback},
      gap:    { min: 0,  max: 100,   step: 0.5, throttle: 750, col: 1, row: 2, msg: msgCallback},
      pace:   { min: 0,  max: 10000, step: 100, throttle: 750, col: 2, row: 2, msg: msgCallback},
    };

    let pnGroupDef = {
      On:  { svg: "Numbers", radio: "pnShow" },
      Off: { svg: "Close",   radio: "pnShow" },
    };

    let tableSlidersGroupDef = {
      pages:         { min: 1,    max: 50,  step: 1, throttle: 750, msg: "Pages per row: {value}"},
      horizontalGap: { min: -100, max: 100, step: 1, throttle: 750, msg: "Horizontal Gap: {value} %"},
      verticalGap:   { min: -100, max: 100, step: 1, throttle: 750, msg: "Vertical Gap: {value} %"},
    };

    // build faces. Note: both BottonGroup and SliderGroup modify their defs element, so we
    // must pass shallow copies...deep copies are not required, as the only non-reference
    // value is msgCallback, and it doesn't need to be unique.

    // build book face
    let stash = _menu_.rings.layout.cells.book.stash;
    tags.fitBook.replaceWith(new ButtonGroup(stash, fitGroupDef, handler).elm);
    tags.bookSliders.replaceWith(
      new SliderGroup(stash, bookSlidersGroupDef, handler).elm,
    );
    tags.pnBook.replaceWith(new ButtonGroup(stash, pnGroupDef, handler).elm);

    // build horizontal face
    stash = _menu_.rings.layout.cells.horizontal.stash;
    tags.fitHorizontal.replaceWith(
      new ButtonGroup(stash, fitGroupDef, handler).elm
    );
    tags.fitHorizontalSliders.replaceWith(
      new SliderGroup(stash, horzSlidersGroupDef, handler).elm,
    );
    tags.pnHorizontal.replaceWith(
      new ButtonGroup(stash, pnGroupDef, handler).elm
    );

    // build vertical face
    stash = _menu_.rings.layout.cells.vertical.stash;
    tags.fitVertical.replaceWith(
      new ButtonGroup(stash, fitGroupDef, handler).elm
    );
    tags.fitVerticalSliders.replaceWith(
      new SliderGroup(stash, vertSlidersGroupDef, handler).elm
    );
    tags.pnVertical.replaceWith(
      new ButtonGroup(stash, pnGroupDef, handler).elm
    );

    // build table face
    stash = _menu_.rings.layout.cells.table.stash;
    let def = { Width: fitGroupDef.Width, Height: fitGroupDef.Height };
    tags.fitTable.replaceWith(new ButtonGroup(stash, def, handler).elm);
    tags.tableFlowSliders.replaceWith(
      new SliderGroup(stash, tableSlidersGroupDef, handler).elm
    );
    tags.pnTable.replaceWith(new ButtonGroup(stash, pnGroupDef, handler).elm);
  }

  show() {
    super.show();
    Object.values(this.faces).forEach((face) => face.remove());
    this.content.append(this.faces[this.cell.key]);
    return this;
  }
}

class BookPanel extends LayoutPanel {}

class HorizontalPanel extends LayoutPanel {}

class VerticalPanel extends LayoutPanel {}

class TablePanel extends LayoutPanel {}

class StoragePanel extends Panel {
  constructor(cell) {
    super(cell);
    Object.assign(this.body.style, {
      margin: 0,
      padding: "1em",
      minWidth: "20em",
    });

    let content = helm(`
      <div style="text-align:center;">
        <div style="margin-bottom:1.5em;">
          <div style="font-size:1.2em;margin-bottom:0.5em;">Factory Reset</div>
          <div data-tag="buttons"></div>
        </div>
        <div>
          <div style="font-size:1.2em;margin-bottom:0.5em;">Storage</div>
          <div data-tag="stats" style="display:grid;grid-template-columns:auto auto;font-size:.8em;text-align:left;width:fit-content;margin:0 auto;"></div>
          <div data-tag="refresh" style="margin-top:0.5em;"></div>
        </div>
      </div>
    `);

    let { buttons, stats, refresh } = dataIndex("tag", content);

    // Factory reset buttons
    buttons.replaceWith(
      new ButtonGroup(
        cell,
        { Menu: { svg: "Menu" }, Recent: { svg: "Score" }, Import: { svg: "Import Page" } },
        (e, prop, tag) => {
          if (tag == "Menu") {
            dialog("Reset all menu settings to defaults? Open panels will be closed.",
              { Reset: { svg: "Menu" }, Cancel: { svg: "Cancel" } },
              (e, prop, tag, args) => {
                args.close();
                if (tag == "Reset") {
                  _menu_.closePanels();
                  _menu_.factoryReset();
                  toast("Menu reset");
                }
              });
          } else if (tag == "Recent") {
            localStorage.setItem("recent", []);
            for (let src of Object.values(Score.sources))
              localStorage.setItem(src, "");
            toast("Recent list cleared");
          } else if (tag == "Import") {
            _podPb_.clear();
            toast("Import buffer cleared");
          }
          this.updateStats(); // refresh after reset
        }
      ).elm
    );

    // Refresh button
    refresh.replaceWith(
      new ButtonGroup(
        cell,
        { Refresh: { svg: "Refresh" } },
        () => this.updateStats()
      ).elm
    );

    // Refresh on score open/close
    this.listeners.push(listen(document, "scoreOpened", () => this.updateStats()));
    this.listeners.push(listen(document, "scoreClosed", () => this.updateStats()));

    this.statsElm = stats;
    this.body.append(content);
  }

  show() {
    super.show();
    this.updateStats(); // refresh on show
    return this;
  }

  async updateStats() {
    let statsElm = this.statsElm;
    let rows = [];

    // localStorage size
    let localStorageSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        localStorageSize += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
      }
    }
    rows.push(`<div style="text-align:right;">localStorage:&nbsp;</div><div>${this.formatBytes(localStorageSize)}</div>`);

    // IndexedDB size (estimate via Storage API if available)
    if (navigator.storage && navigator.storage.estimate) {
      try {
        let estimate = await navigator.storage.estimate();
        rows.push(`<div style="text-align:right;">IndexedDB:&nbsp;</div><div>${this.formatBytes(estimate.usage || 0)}</div>`);
        rows.push(`<div style="text-align:right;">Quota:&nbsp;</div><div>${this.formatBytes(estimate.quota || 0)}</div>`);
      } catch (e) {
        rows.push(`<div style="text-align:right;">IndexedDB:&nbsp;</div><div>unavailable</div>`);
      }
    }

    // Memory usage (Chrome only)
    if (performance.memory) {
      rows.push(`<div style="text-align:right;">JS Heap:&nbsp;</div><div>${this.formatBytes(performance.memory.usedJSHeapSize)}</div>`);
      rows.push(`<div style="text-align:right;">Heap Limit:&nbsp;</div><div>${this.formatBytes(performance.memory.jsHeapSizeLimit)}</div>`);
    }

    statsElm.innerHTML = rows.join("");
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    let k = 1024;
    let sizes = ["B", "KB", "MB", "GB"];
    let i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
  }
}

class MetronomePanel extends Panel {
  static css = css(
    "MetronomePanel",
    `.Metronome
      { flex-flow:column;
      }
      .Metronome__patterns
      { border-radius: calc(var(--borderRadius) / 2);
        font-size: var(--font-size-base);
        text-align: center;
        margin: var(--spacing-md) 0;
      }
    }
    `
  );

  content = helm(
    `<div data-tag="body" class="Panel__body Metronome centerChild">
      <select data-tag="patterns" class="Metronome__patterns">
        <option value="metronome" selected>Metronome</option>
        <option value="one"  >One</option>
        <option value="two"  >Two</option>
        <option value="three">Three</option>
        <option value="four" >Four</option>
        <option value="five" >Five (3+2)</option>
        <option value="six"  >Six (3+3)</option>
      </select>
     </div>`
  );

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));
    cell.stash.state = "Pause";
    this.patterns.value = cell.stash.pattern;
    let metronome = (this.metronome = new Metronome(this));
    Object.assign(metronome, this.cell.stash);
    delay(2, () => (metronome.bpm.textContent = this.cell.stash.tempo));

    listen(this.patterns, ["input", "change"], (e) => {
      cell.stash.pattern = e.target.value;
      metronome.setPattern(e.target.value);
    });

    this.mediaGroup = new ButtonGroup(
      this.cell.stash,
      {
        Play: { svg: "Play", redo: true, radio: "state" },
        Pause: { svg: "Pause", redo: true, radio: "state" },
      },
      (e, prop, tag) => {
        cell.stash.state = tag;
        tag == "Play" ? metronome.play(true) : metronome.play(false);
      }
    );
    this.content.append(this.mediaGroup.elm);
    this.mediaGroup.refresh();

    this.tempoGroup = new SliderGroup(
      this.cell.stash,
      {
        tempo: {
          min: 1,
          max: 220,
          step: 1,
          msg: "Tempo: {value} bpm",
          value: 60,
          throttle: 200,
        },
      },
      (e, prop, tag) => {
        cell.stash.prop = tag;
        metronome.bpm.textContent = Math.round(tag);
        Object.assign(metronome, this.cell.stash);
        metronome.play(cell.stash.state == "Play");
      }
    );
    this.tempoGroup.elm.style.width = "14em";
    this.content.append(this.tempoGroup.elm);
    this.tempoGroup.refresh();

    this.offsetGroup = new SliderGroup(
      this.cell.stash,
      {
        tickOffset: {
          min: -300,
          max: 300,
          step: 10,
          msg: "Tick offset: {value}ms",
          value: 0,
          throttle: 50,
        },
      },
      (e, prop, tag) => {
        metronome.tickOffset = tag;
      }
    );
    this.offsetGroup.elm.style.width = "14em";
    this.content.append(this.offsetGroup.elm);
    this.offsetGroup.refresh();

    this.metronome.setPattern(cell.stash.pattern);
  }

  destructor() {
    super.destructor();
    this.metronome.destructor();
  }

  show() {
    super.show();
    this.metronome.show();
    return this;
  }
}


class NumbersPanel extends Panel {
  content = helm(`
     <div data-tag="body" class="Panel__body">
       <div data-tag="sliders"></div>
       <div style="font-size: var(--font-size-sm); margin-top: calc(var(--spacing-md) + 1em); margin-bottom: 0.1em">Footpedal Keys</div>
       <div style="margin: 0 var(--spacing-md)">
         <div style="display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em">
           <div style="min-width: 4em; text-align: left; font-size: 0.9em">Next (\u21e7/\u21e8):</div>
           <div data-tag="forward" style="flex: 1"></div>
         </div>
         <div style="display: flex; align-items: center; gap: 0.5em">
           <div style="min-width: 4em; text-align: left; font-size: 0.9em">Prev (\u21e6/\u21e9):</div>
           <div data-tag="reverse" style="flex: 1"></div>
         </div>
       </div>
     </div>
   `);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    this.schedule = new Schedule();
    let score = _score_;

    let formatPn = () => {
      return `Page: ${pnToString(_score_.numbers.pn)} 
      (${~~_score_.numbers.pn} / ${score.pgs.length})`;
    };

    let defs = {
      pn: { min: 1, max: score.pgs.length, value: score.numbers.pn, step: 1,
        msg: formatPn, throttle: 500, fullWidth:true},
      prelim: {min: 0, max: 100,value: _score_.numbers.prelim,step: 1,
        msg: () => `Roman: ${_score_.numbers.prelim}`,throttle: 500, row:2, col:1 },
      first: { min: 1, max: 1000, value: _score_.numbers.first, step: 1,
        msg: () => `First: ${_score_.numbers.first}`,throttle: 500, row:2, col:2},
    };
    this.pnSliderGroup = new SliderGroup(
       _score_.numbers,
      defs,
      (e, tag, value) =>
        _body_.dispatchEvent(new CustomEvent("NUMBERS", { detail: { sender:this, tag: tag, value: value} }))
    );

    this.sliders.replaceWith(this.pnSliderGroup.elm);

    this.forwardGroup = new ButtonGroup(
      score.numbers,
      { Pages: { svg: "Page", radio: "forward" },
        Marks: { svg: "Mark", radio: "forward" },
      },
      (e, tag, value) => score.numbers.tag  = value,
    );
    this.forward.replaceWith(this.forwardGroup.elm);

    this.reverseGroup = new ButtonGroup(
      score.numbers,
      { Pages: { svg: "Page", radio: "reverse" },
        Marks: { svg: "Mark", radio: "reverse" },
      },
      (e, tag, value) => score.numbers.tag = value,
    );
    this.reverse.replaceWith(this.reverseGroup.elm);



    listen(_body_, "NUMBERS", (e) => {
      if (e.detail.sender === this) return;
      this.refresh(); 
    });
  }

  refresh() {
    // call this to update the panel when the score changes, has pages added, etc.
    let defs = this.pnSliderGroup.defs;
    defs.pn.max = _score_.pgs.length;
    this.pnSliderGroup.refresh();
  }
}

class PencilPanel extends Panel {
  static css = css(
    "PencilPanel",
    `.PencilPanel__preview {
       overflow: hidden;
       height: 6em;
       border: 1px solid var(--color-border);
       border-radius: var(--borderRadius);
       background-color: #fff;
       background-image:
         linear-gradient(45deg, #e8e8e8 25%, transparent 25%),
         linear-gradient(-45deg, #e8e8e8 25%, transparent 25%),
         linear-gradient(45deg, transparent 75%, #e8e8e8 75%),
         linear-gradient(-45deg, transparent 75%, #e8e8e8 75%);
       background-size: 0.5em 0.5em;
       background-position: 0 0, 0 0.25em, 0.25em -0.25em, -0.25em 0;
      }
    `
  );

  slidersDef = {
    width: { min: 0.2, max: 60, step: 0.1, value: 1, throttle: 250,
      msg: "Line Width: {value} px",
    },
  };

  buttonsDef = {
    Free: { svg: "Free", radio: "style" },
    "L-R": { svg: "L-R", radio: "style" },
    "T-B": { svg: "T-B", radio: "style" },
    Slope: { svg: "Slope", radio: "style" },
  };

  content = helm(`
    <div data-tag="body" class="Panel__body">
      <div data-tag="preview" class="PencilPanel__preview"></div>
      <div data-tag="picker"></div>
      <div data-tag="sliders"></div>
      <div data-tag="buttons"></div>
    </div>`);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    let stash = cell.stash;

    // This code block is delayed so that it runs after any subclass constructor:
    delay(1, () => {
      if (this.buttonsDef)
        this.sliders.after(helm(`<div>Style</div>`));

      let picker = new ColorPicker(
        "Color",
        stash.rgb,
        stash.alpha,
        (rgb, alpha) => {
          stash.rgb = rgb;
          stash.alpha = alpha;
          this.update();
        }
      );
      this.picker.replaceWith(picker.elm);
      this.picker = picker.elm;

      if (this.slidersDef) {
        let sliders = new SliderGroup(
          this.cell.stash,
          this.slidersDef,
          (e, tag, value) => {
            this.cell.stash.tag = value;
            this.update();
          }
        );
        this.sliders.replaceWith(sliders.elm);
        this.sliders = sliders;
      }

      if (this.buttonsDef) {
        let buttons = new ButtonGroup(
          this.cell.stash,
          this.buttonsDef,
          (e, tag, value) => {
            this.cell.stash.tag = value;
            this.update();
          }
        );
        this.buttons.replaceWith(buttons.elm);
        this.buttons = buttons;
      }

      this.update();
    });
  }

  update() {
    let { alpha, rgb, style, width } = this.cell.stash;
    clearChildren(this.preview);
    let path =
      // svg paths...
      style == "Free"
        ? "M10 50C66 -50 132 150 190 50"
        : style == "L-R"
        ? "M10 50h180"
        : style == "T-B"
        ? "M100 10v80"
        : "M10 10L180 90";
    this.preview.append(
      helm(
        `<svg viewBox="0 0 200 100">
         <path style="fill:none;stroke:${rgb};stroke-width:${width}px;stroke-linecap:round;opacity:${alpha}" d="${path}"/></svg>`
      )
    );

    let active = _score_.getActiveObject();

    if (!active || active.type != "path") return;
    let color = fabric.Color.fromHex(rgb);
    color.setAlpha(alpha);

    let brush = active.canvas.freeDrawingBrush;
    if (brush.type == "LineBrush") {
      brush.color = color.toRgba();
      brush.width = width;
      brush.draw();
      Object.assign(active, active._calcDimensions());
      active.dirty = true;
      brush.canvas.requestRenderAll();
    } else {
      // this is the built-in fabric free drawing pencil brush
      active.stroke = color.toRgba();
      active.strokeWidth = width;
      Object.assign(active, active._calcDimensions());
      active.dirty = true;
      active.canvas.requestRenderAll();
    }
  }

  show() {
    super.show();
    this.update();
    return this;
  }
}

class PenPanel extends PencilPanel {}

class RastrumPanel extends PencilPanel {
  slidersDef = {
    gap: {
      throttle: 250, min: 5, max: 40, step: 1, value: 8, fullWidth:true, msg: "Staff Space: {value}px" },
    lines: {
      throttle: 250, min: 1, max: 60, step: 1, value: 5, row:2, col:1, msg: "Lines: {value}"},
    width: {
      throttle: 250, min: 0, max: 20, step: 0.1, value: 1, row:2, col:2, msg: (tag, value) =>
        `Width: ${value == 0 ? "Auto":value + "px"}` },
    bars: {
      throttle: 250, min: 0, max: 60, step: 1, value: 4, row:3, col:1, msg: "Bars: {value}" },
    barWidth: {
      throttle: 250, min: 0, max: 30, step: 0.1, value: 4, row:3, col:2, msg: (tag, value) => 
        `Width: ${value == 0 ? "Auto":value + "px"}` },

  };

  buttonsDef = {
    "L-R": { svg: "L-R", radio: "style" },
    "T-B": { svg: "T-B", radio: "style" },
  };

  constructor(cell) {
    super(cell);
    }


  update() {
    let { alpha, rgb, style, lines, width, gap, bars, barWidth} =
      this.cell.stash;
    clearChildren(this.preview);
    let linePath = "";
    let barPath = "";
    // interpret "Auto"  (encoded as 0) to refer to Bravura engravingDefault values (in staff space, i.e. gap)
    if (width == 0) width = .13 * gap ; 
    if (barWidth == 0) barWidth = .16 * gap ; 
    let staffHeight = (lines - 1) * gap + width;
    let offset = (50 - staffHeight) / 2;
    for (let i = 0, y = offset; ++i <= lines; y += gap)
      if (style == "L-R") linePath += `M5 ${y}h90v${width}h-90Z`;
      else linePath += `M${y} 5v90h${width}v-90Z`;

    if(bars > 0) { // add bar lines
      let barSpan = (90 - barWidth) / bars;
      if (style == "L-R") 
        for (let i = 0, x = 5; i++ <= bars; x += barSpan)
          barPath += `M${x} ${offset}5v${staffHeight}h${barWidth}v${-staffHeight}Z`; 
      else
        for (let i = 0, y = 5; i <= bars; i++, y += barSpan)
          barPath += `M${offset} ${y}v${barWidth}h${staffHeight}v${-barWidth}Z`;
    }
    this.preview.append(
      helm(
        `<svg viewBox="0 0 100 100">
           <path style="fill:${rgb};opacity:${alpha}" d="${linePath}"/>
           <path style="fill:${rgb};opacity:${alpha}" d="${barPath}"/>
         </svg>`
      )
    );

    let active = _score_.getActiveObject();

    if (!active || active.type != "path") return;
    let brush = active.canvas.freeDrawingBrush;
    if (brush.type != "RastrumBrush") return;
    let color = fabric.Color.fromHex(rgb);
    color.setAlpha(alpha);
    Object.assign(brush, {
      color: color.toRgba(),
      lines: lines,
      width: width,
      gap: gap,
      bars: bars,
    });
    brush.draw();
    Object.assign(active, active._calcDimensions());
    active.dirty = true;
    brush.canvas.requestRenderAll();
  }
}

class TextPanel extends PencilPanel {
  slidersDef = {
    size: { min: 1, max: 100, step: 1, value: 1, msg: "Size: {value} px"},
    height: { min: 1, max: 100, step: 1, value: 1, msg: "Spacing: {value} px"},
  };

  buttonsDef = null;

  fonts = [
    "Courier",
    "Courier-Bold",
    "Courier-Oblique",
    "Courier-BoldOblique",
    "Helvetica",
    "Helvetica-Bold",
    "Helvetica-Oblique",
    "Helvetica-BoldOblique",
    "Times-Roman",
    "Times-Bold",
    "Times-Italic",
    "Times-BoldItalic",
    "Bravura",
    "Vercetti",
    "Patrick Hand",
    ] ;
 
  text = helm(`<div>Abc<br>123<br></div>`);

  constructor(cell) {
    super(cell);
    let fontLabel = helm(`<div class="Panel__item">Font</div>`);
    this.picker.after(fontLabel);
    let select = new Select(this.fonts, cell.stash.font, this) ;
    fontLabel.after(select.elm) ;
    this.preview.append(this.text);
    this.listeners.push(listen(select.toggle, "SELECTED", (e) => this.update(e.detail)));
    this.preview.append(this.text);
    this.fonts.value = cell.stash.font ;
    this.update();
  }

  update(fontName) {
    this.cell.stash.font = fontName;
    let { font, size, height, rgb, alpha } = this.cell.stash;
    this.text.style.fontSize = size / _pxPerEm_ + "em";
    this.text.style.lineHeight = height / _pxPerEm_ + "em";
    this.text.style.color = rgb + Math.round(alpha * 255).toString(16);
    Object.assign(this.preview.style, fontMap[font]);
    let active = _score_.getActiveObject();
    if (active && active.type == "textbox") {
      let color = fabric.Color.fromHex(rgb);
      color.setAlpha(alpha);
      active.canvas.requestRenderAll();
      active.fill = color.toRgba();
      active.fontSize = size - 1;
      active.lineHeight = height / size;
      Object.assign(active, fontMap[font]);
      active.canvas.requestRenderAll();
      delay(1, () => {
        // work around as fabricjs bug...fill doesn't change
        // unless/until fontsize changes, (or some such breakage)
        active.fontSize = size;
        active.canvas.requestRenderAll();
      });
    }
  }
}

class ReviewPanel extends Panel {
  constructor(cell) {
    super(cell);
    this.review = new Review(this);
    this.body.replaceWith(this.review.elm);
    delay(2, () => this.review.build());
  }

  destructor() {
    super.destructor();
    this.review.destructor();
  }

}

class VolumePanel extends Panel {
  constructor(cell) {
    super(cell);
    this.volume = new Volume(this);
  }

  destructor() {
    super.destructor();
    this.volume.destructor();
  }

  show() {
    super.show();
    this.volume.show();
    return this;
  }

  hide() {
    super.hide();
    this.volume.hide();
  }
}


/**
class Pzr
  This is the detachable body of the EditPanel.
  Implements a detachable widget that allows fine-tuning the location, size, and rotation
  of fabridjs objects.  Essentially an alternative to using fabric's "controls" on the
  the active selection.
*/
class Pzr extends Surface {
  static css = css(
    "Pz",
    `
     .Pz {
       display:grid;
       grid-template-columns:repeat(5, 1.6em);
       grid-template-rows:repeat(5, 1.6em);
       justify-items:center;
       align-items:center;
      }
     .Pz__noTarget {
        stroke: #aaa;
    }
    .Pz__control {
      fill: none;
      stroke: #444;
      stroke-width: 8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    [data-theme="Dark"] .Pz__control {
      stroke: #ccc;
    }
    .Pz__control-active {
       color: #6c6;
       transform: scale(1.2);
    }
  `) ;

  // Positions in the 5x5 ui grid that have svg elements:
  // (positions are0-based index starting in upper left, l-r t-b).
  // The last 2 positions are only used in class Pzr

  grid = helm(`
        <div class="Pz Surface__outline Pz__control">
          <svg style="grid-row:1;grid-column:3;" viewBox="0 0 100 100"><path d="M10 60L50 10L90 60Q50 40 10 60"/></svg>
          <svg style="grid-row:2;grid-column:3;" data-tag="cw"  viewBox="0 0 100 100">
            <path  d="M50 22 A28 28 0 1 1 30.2 70 M50 14 L50 30 L34 22 Z" transform="translate(100,0) scale(-1, 1)"/>
          </svg>
          <svg style="grid-row:3;grid-column:1;" viewBox="0 0 100 100"><path d="M60 10L10 50L60 90Q 40 50 60 10"/></svg>
          <svg style="overflow:visible;grid-row:3;grid-column:2;" viewBox="0 0 100 100"><path d="M90 20L-20 50L90 80"/></svg>
          ${iconSvg("Void", {style:"grid-row:3;grid-column:3;pointer-events:none;opacity:0.5;"})}
          <svg style="overflow:visible;grid-row:3;grid-column:4;" viewBox="0 0 100 100"><path d="M10 20L120 50L10 80"/></svg>
          <svg style="grid-row:3;grid-column:5;" viewBox="0 0 100 100"><path d="M40 10L90 50L40 90Q 60 40 40 10"/></svg>
          <svg style="grid-row:4;grid-column:3;"data-tag="ccw"  viewBox="0 0 100 100">
            <path d="M50 22 A28 28 0 1 1 30.2 70 M50 14 L50 30 L34 22 Z"/>
          </svg>
          <svg style="grid-row:5;grid-column:3;" viewBox="0 0 100 100"><path d="M10 40L50 90L90 40Q 50 60 10 40"/></svg> 
        </div>
    `);

  slots = [2,7,10,11,13,14,17,22] ; 
  targets = [] ;

  constructor(panel) {
    super(panel, ScreenPanel);
    Object.assign(this, dataIndex("tag", this.grid)) ;
    this.surface.append(this.grid) ;
    panel.body.style.minWidth = panel.body.style.padding = "unset"; // defeat default body styles
    this.surface.style.width = this.surface.style.height = "10em" ;
    this.grid.style.width = this.grid.style.height = "10em" ;
    this.surfaceDragElm = this.grid ;
    this.repeater = new Schedule();
    this.update();

    // When selecting icons in this.grid, we don't use listeners for every control...
    // instead, we'll listen on the grid itself, and compute the grid "slot" as a
    // 0-based index (L-R,T-B). Not all slots have controls, but these do:
    this.panel.listeners.push(listen(this.grid, "pointerdown", (e) => {
      let box  = getBox(this.surface) ;
      let row = parseInt((e.clientY - box.y) / box.height * 5) ;
      let col = parseInt((e.clientX - box.x) / box.width * 5) ;
      let pos = row * 5 + col ;
      if(!this.slots.includes(pos)) return ; // no control at this location
      _menu_.busy = true ;
      // add active marker. Note: can't add style to <path.../>, must be parent <svg.../>
      let target = e.target.tagName == "path" ? e.target.parentElement : e.target;
      if (target.tagName != "svg") return;
      if(this.getTargets()) {
        target.classList.add("Pz__control-active") ;
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);
        
        this.opStartTime = performance.now();
        this.opStartValues = this.targets.map(item => item[1]);
  
        this.doStep(pos);
        this.repeater.run(250, () => {
          let loop = () => {
            this.doStep(pos);
            this.repeater.run(50, loop);
          };
          loop();
        });
      }
      listen(this.grid, "pointerup", () => {
        this.grid.classList.remove("Pz__noTarget") ;
        target.classList.remove("Pz__control-active") ;
        this.repeater.cancel();
        _menu_.busy = false;
        _menu_.autoOff.run();
      }, { once: true });
    }));
  }
 
  update() {
    let getIconPath = () => {
      let type = EditPanel.pzrTarget?.podiumType || EditPanel.pzrTarget?.type ;
      this.grid.classList.remove("Pz__noTarget") ;
      switch(type) {
        case undefined: 
          this.grid.classList.add("Pz__noTarget") ;
          return iconPaths["Void"];
        case "pencil": return iconPaths["Pencil"] ;
        case "pen": return iconPaths["Pen"] ;
        case "rastrum": return iconPaths["Rastrum"] ;
        case "textbox": return iconPaths["Text"] ;
        case "text": return iconPaths["Symbols"] ;
        default: return iconPaths["Edit"] ; // assume activeSelection
      }
    }
    let tmp = helm(`<svg viewBox="0 0 24 24" 
      style="grid-column:3;grid-row:3;pointer-events:none;stroke:none;fill:currentColor;">
      ${getIconPath()}</svg>`) ;
    this.iconSvg.replaceWith(tmp) ;
    this.iconSvg = tmp ;
  }

  doStep(pos) {
    let elapsed = performance.now() - this.opStartTime;
    let obj = EditPanel.pzrTarget ;
    if(!obj) return ;

    // Progressive step/acceleration
    let step = 1 / (obj.canvas.getZoom() * window.devicePixelRatio); // initial theoretical minimum
    let zoomFactor = 0.01;
    let rotStep = 0.2;
    if (elapsed > 2000) { step = 50; zoomFactor = 0.10; rotStep = 20; }
    else if (elapsed > 1200) { step = 20; zoomFactor = 0.05; rotStep = 5; }
    else if (elapsed > 600) { step = 5; zoomFactor = 0.02; rotStep = 1; }

    if (pos == 11 || pos == 13) { // scale
      let multiplier = (pos == 11) ? (1 + zoomFactor) : (1 - zoomFactor);
      let center = obj.getCenterPoint();
      obj.set({
        originX: "center", originY: "center",
        left: center.x, top: center.y,
        scaleX: Math.max(0.01, obj.scaleX * multiplier),
        scaleY: Math.max(0.01, obj.scaleY * multiplier)
      });
    } else if (pos == 7 || pos == 17) { // rotate
      let delta = pos == 7 ? rotStep : -rotStep;
      let center = obj.getCenterPoint();
      obj.set({
        originX: "center", originY: "center",
        left: center.x, top: center.y,
        angle: (obj.angle + delta) % 360
      });
    } else { // translate
      let dx = 0, dy = 0;
      if (pos == 2) dy = -step; // up
      if (pos == 10) dx = -step; // left
      if (pos == 14) dx = step; // right
      if (pos == 22) dy = step; // down
      let newLeft = obj.left + dx;
      let newTop = obj.top + dy;

      if (obj.canvas) {
        // Keep obj's center in the canvas
        let center = obj.getCenterPoint();
        let centerDx = center.x - obj.left;
        let centerDy = center.y - obj.top;
        newLeft = clamp(newLeft + centerDx, 0, obj.canvas.width) - centerDx;
        newTop = clamp(newTop + centerDy, 0, obj.canvas.height) - centerDy;
      }

      obj.set({
        left: newLeft,
        top: newTop
      });
    }
    obj.setCoords();
    obj.canvas?.requestRenderAll();
    _menu_.magnifier?.panel?.updateMagnifier() ;
  }

  getTargets() 
  { // For class Pzr, always 0 or 1 targets, but for subclass Pz there can be
    // many, so for "regularity", this.targets is always an array.
    let obj = EditPanel.pzrTarget ;
    if (obj) {
      this.targets[0] = [obj, {
        left: obj.left,
        top: obj.top,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        angle: obj.angle,
        originX: obj.originX,
        originY: obj.originY
      }];
      return true ;
    }
    this.grid.classList.add("Pz__noTarget") ;
    return false ;
  }
}

/**
class Pz
  This is the detachable body of the ScreenPanel...
  a subclass of Pzr that removes rotation controls and is specialized for editing
  Fabric.js objects with locked aspect ratio.
*/
class Pz extends Pzr {

  slots = [2,10,11,13,14,22] ;

  constructor(panel) {
    super(panel, ScreenPanel);
    // modify the grid, replacing the central icon and removing clockwise and counter-clockwise svg's
    this.cw.remove() ;
    this.ccw.remove() ;
    this.update();
  }

  update() {
    let getIconPath = () => {
      let tag = ScreenPanel.pzTarget?.dataset.tag ;
      this.grid.classList.remove("Pz__noTarget") ;
      switch(tag) {
        case undefined: 
          this.grid.classList.add("Pz__noTarget") ;
          return iconPaths["Void"];
        case "BookLayout":
        case "ScrollLayout":
        case "TableLayout": return iconPaths["Layout"] ;
        case "Menu": return iconPaths["Menu"] ;
        case "body": return iconPaths["Full Screen"] ;
        default: {
          let key = tag[0].toLowerCase() + tag.slice(1).replace("Panel", "");
          return _panels_[key]?.cell?.svgPath ?? null ;
        }
      }
    }
    let tmp = helm(`<svg viewBox="0 0 24 24"
      style="grid-column:3;grid-row:3;pointer-events:none;stroke:none;fill:currentColor;">
      ${getIconPath()}</svg>`) ;
    this.iconSvg.replaceWith(tmp) ;
    this.iconSvg = tmp ;
  }

  doStep(pos) {
    let elapsed = performance.now() - this.opStartTime;
    if (pos == 11 || pos == 13) { // scale
      let zoomFactor = 0.01;
      if (elapsed > 2000) zoomFactor = 0.10;
      else if (elapsed > 1200) zoomFactor = 0.05;
      else if (elapsed > 400) zoomFactor = 0.02;

      let multiplier = (pos == 11) ? (1 + zoomFactor) : (1 - zoomFactor);
      this.targets.forEach((item) => { 
        let [target] = item;
        let currentSize = parseFloat(target.style.fontSize) || 1;
        let newSize = Math.max(0.1, currentSize * multiplier);
        target.style.fontSize = newSize + "em";
        item[1] = newSize; 
      });
    } else { // translate
      let dx = 0, dy = 0;
      let step = 1;
      if (elapsed > 2000) step = 50;
      else if (elapsed > 1200) step = 20;
      else if (elapsed > 400) step = 5;

      if (pos == 2) dy = -step; // up
      if (pos == 10) dx = -step; // left
      if (pos == 14) dx = step; //right
      if (pos == 22) dy = step; // down
      for (let [target, size, box] of this.targets) {
        if (target && target != this.panel.elm && target != this.surface) {
          target.style.left = clamp(target.offsetLeft + dx, 0, window.innerWidth - box.width) + "px";
          target.style.top = clamp(target.offsetTop + dy, 0, window.innerHeight - box.height) + "px";
        }
      }
    }
  }

  getTargets() {
    let target = ScreenPanel.pzTarget ;
    let pzTargets ;
    if (!target) pzTargets = [] ;
    else if (target == _body_)
      pzTargets = [...document.getElementsByClassName("pz")].filter((elm) =>
       elm != this.surface && elm != this.panel.body && elm.isConnected && elm.style.visibility != "hidden") ;
    else {
      if (target.isConnected || target.style.visibility != "hidden") pzTargets = [target] ;
      else pzTargets = [] ;
    }
    if(pzTargets.length == 0) {
      this.grid.classList.add("Pz__noTarget") ;
      return false ;
    }
    this.targets.length = 0 ;
    for(let target of pzTargets) {
      let fs = target.style.fontSize;
      let emSize = (fs && fs.includes("em")) ? parseFloat(fs) : parseFloat(getComputedStyle(target).fontSize) / _pxPerEm_;
      this.targets.push([target, emSize, getBox(target)]) ;
    }
    return true ;
  }

}


class SurfacePanel extends Panel {

  constructor(cell) {
    super(cell);
    this.body.classList.add("centerChild");
    this.body.style.padding = "1em";
  }

  destructor() {
    super.destructor();
    this.surface?.destructor();
  }
 
  show() {
    super.show();
    this.surface?.show();
    return this;
  }

  hide() {
    super.hide();
    this.surface?.hide();
    return this;
  }
}

class ClockPanel extends SurfacePanel {
  surface = new Clock(this);
}

class EditPanel extends SurfacePanel {
  static pzrTarget = null ;

  static update(target) {
    // This sets the (static) fabricjs target obj for EditPanel pan/zoom/rotate operations.
    EditPanel.pzrTarget = target;
    _panels_.edit?.surface.update();
  }

  surface = new Pzr(this);
}


class Keyboard extends Surface {

  static css = css(
  "Keyboard", `
    /* Light/Glass (default) */
    .Keyboard__key        { fill:#fffa; stroke:#444; }
    .Keyboard__key.mod    { fill:#aaaa; }
    .Keyboard__label      { text-anchor:middle; font-size:26px; font-family:system-ui,sans-serif;
                            pointer-events:none }

    /* Dark */
    [data-theme="Dark"] .Keyboard__key        { fill:#444a; stroke:#aaa;}
    [data-theme="Dark"] .Keyboard__key.mod    { fill:#555a; }
    [data-theme="Dark"] .Keyboard__label      { fill:white; }
  `) ;

  mods = new Set(['⇧','⌫','↵','⋯','Aa','←','↑','↓','→','Home','End']);

  layers = {
    lower:  [['`','1','2','3','4','5','6','7','8','9','0','-','='],
              ['q','w','e','r','t','y','u','i','o','p','[',']','\\'],
              ['a','s','d','f','g','h','j','k','l',';',"'"],
              ['⇧','z','x','c','v','b','n','m',',','.','/','⌫'],
              ['⋯','       ','↵']],
    upper:   [['~','!','@','#','$','%','^','&','*','(',')','_','+'],
              ['Q','W','E','R','T','Y','U','I','O','P','{','}','|'],
              ['A','S','D','F','G','H','J','K','L',':','"'],
              ['⇧','Z','X','C','V','B','N','M','<','>','?','⌫'],
              ['⋯','       ','↵']],
    sym:     [['á','é','í','ó','ú','à','è','ù','â','ê','î'],
              ['ô','û','ä','ö','↑','ñ','ç','ß','Home'],
              ['ã','õ','ü','←','↓','→','å','ø','End'],
              ['æ','œ','ð','¿','¡','«','»','⌫'],
              ['Aa','       ','↵']],
  };

  navKeys = {'↑':'ArrowUp','↓':'ArrowDown','←':'ArrowLeft','→':'ArrowRight','Home':'Home','End':'End'};
  repeats = new Set(['←','→','↑','↓','⌫']);

  content = helm(`<div class="Surface__outline"><svg data-tag="svg" style="height:12em;display:block;overflow:visible" xmlns="http://www.w3.org/2000/svg"/></div>`) ;

  constructor(cell) {
    super(cell, ScreenPanel) ;
    this.layer = 'lower';
    this.keys  = [];  // [{label, x, y, w, h}]
    this.surface.style.width = this.surface.style.height = "unset" ;
    Object.assign(this, dataIndex("tag", this.content)) ;
    this.surface.append(this.content) ;
    this.surfaceDragElm = this.content ;
    this.rgen = 0;
    listen(this.svg, "pointerdown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      let pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      let {x: px, y: py} = pt.matrixTransform(this.svg.getScreenCTM().inverse());
      let key = this.keys.find((k) => px>=k.x && px<k.x+k.w && py>=k.y && py<k.y+k.h);
      if (!key) return;
      this.handle(key.label, e.clientX, e.clientY);
      if (this.repeats.has(key.label)) {
        let gen = ++this.rgen;
        let fire = () => { if (this.rgen != gen) return; this.handle(key.label, e.clientX, e.clientY); schedule(80, fire); };
        schedule(500, fire);
      }
    });
    listen(document, ["pointerup","pointercancel"], () => this.rgen++);

    this.build();
  }

  build() {
    let width = 600;
    let keyHeight = 42, gap = 4;
    let rows = this.layers[this.layer];
    let totalH = rows.length * (keyHeight + gap);
    this.svg.setAttribute('viewBox', `0 0 ${width} ${totalH}`);
    this.svg.style.width  = `${width / _pxPerEm_}em`;
    this.svg.style.height = `${totalH / _pxPerEm_}em`;
    this.keys = [];
    let html = "";

    rows.forEach((row, ri) => {
      let y = ri * (keyHeight + gap);
      let totalFlex = row.reduce((s, k) => s + this.flex(k), 0);
      let unitW = (width - (row.length + 1) * gap) / totalFlex;
      let x = gap;
      row.forEach(label => {
        let w = unitW * this.flex(label);
        if(label !== '') {
          let mod = this.mods.has(label);
          this.keys.push({ label, x, y, w, h: keyHeight, mod });
          html += `<rect class="Keyboard__key${mod?' mod':''}" x="${x}" y="${y}" width="${w}" height="${keyHeight}" rx="${keyHeight/2}"/>`;
          html += `<text class="Keyboard__label" x="${x+w/2}" y="${y+keyHeight*.7}">${label.trim()}</text>`;
        }
        x += w + gap;
      });
    });
    this.svg.innerHTML = html;
  }

  flex(label) {
    return { '⇧':1.5,'⌫':1.5,'↵':1.5,'⋯':1.5,'Aa':1.5,'↑':1.5,'↓':1.5,'←':1.5,'→':1.5,'Home':1.5,'End':1.5 }[label]
      ?? (label.trim() == '' ? 3 : 1);
  }

  handle(label, x, y) {
    switch (label) {
      case '⇧':  this.layer = this.layer == 'upper' ? 'lower' : 'upper'; this.build(); return;
      case '⋯': this.layer = 'sym';    this.build(); return;
      case 'Aa': this.layer = 'lower'; this.build(); return;
    }
    let ch = label.trim() == '' ? ' ' : label;
    this.emitKey(ch);
    if (this.layer == 'upper') { this.layer = 'lower'; this.build(); }
  }

  emitKey(ch) {
    let elm = this.target || document.activeElement;
    if (!elm) return;
    let isText = elm.tagName == 'INPUT' || elm.tagName == 'TEXTAREA';
    let dispatch = (event,key) => elm.dispatchEvent(new KeyboardEvent(event,{key:key,code:key,bubbles:true})) ;
    switch (ch) {
      case '↑': case '↓': case '←': case '→': {
        let k = this.navKeys[ch];
        dispatch('keydown', k);
        if (isText && (ch == '←' || ch == '→')) {
          let s = elm.selectionStart, e = elm.selectionEnd;
          let pos = (s == e) ? (ch == '←' ? Math.max(0, s-1) : Math.min(elm.value.length, s+1))
                             : (ch == '←' ? s : e);
          elm.selectionStart = elm.selectionEnd = pos;
        }
        dispatch('keyup', k);
        break;
      }
      case 'Home': case 'End': {
        let k = this.navKeys[ch];
        dispatch('keydown', k);
        if (isText) elm.selectionStart = elm.selectionEnd = (ch == 'Home') ? 0 : elm.value.length;
        dispatch('keyup', k);
        break;
      }
      case '⌫':
        dispatch('keydown','Backspace') ;
        if (isText) {
          let s = elm.selectionStart, e = elm.selectionEnd;
          if (s == e && s > 0) { elm.value = elm.value.slice(0,s-1) + elm.value.slice(s); elm.selectionStart = elm.selectionEnd = s-1; }
          else if (s != e)     { elm.value = elm.value.slice(0,s)   + elm.value.slice(e); elm.selectionStart = elm.selectionEnd = s; }
          elm.dispatchEvent(new InputEvent('input', {bubbles:true}));
        }
        dispatch('keyup','Backspace') ;
        break;
      case '↵':
        dispatch('keydown','Enter') ;
        dispatch('keyup','Enter');
        break;
      default:
        dispatch('keydown', ch);
        if (isText) {
          let s = elm.selectionStart, e = elm.selectionEnd;
          elm.value = elm.value.slice(0,s) + ch + elm.value.slice(e);
          elm.selectionStart = elm.selectionEnd = s + ch.length;
          elm.dispatchEvent(new InputEvent('input', {inputType:'insertText', data:ch, bubbles:true}));
        }
        dispatch('keyup', ch) ;
    }
  }
}

class KeyboardPanel extends SurfacePanel {

  constructor(cell) {
    super(cell);
    // defeat this.body's stylings: we want the this.surface to add padding/margin so
    // that it has something to grab for detaching/moving
    this.body.style.padding = "unset" ;
    this.surface = new Keyboard(this);
    this.kbFocusListener = null;
  }

  suppressBrowserKb(el) {
    if(!el?.matches('input,textarea')) return;
    if(elm.dataset.kbSaved != undefined) return;
    elm.dataset.kbSaved = elm.getAttribute('inputmode') ?? '';
    elm.setAttribute('inputmode', 'none');
    if(document.activeElement === el) { elm.blur(); elm.focus(); }
  }

  show(onShown) {
    this.suppressBrowserKb(document.activeElement);
    this.kbFocusListener = listen(document, 'focus', (e) => this.suppressBrowserKb(e.target), {capture:true});
    return super.show(onShown);
  }

  hidden() {
    unlisten(this.kbFocusListener);
    this.kbFocusListener = null;
    document.querySelectorAll('[data-kb-saved]').forEach(elm => {
      let saved = elm.dataset.kbSaved;
      if(saved) elm.setAttribute('inputmode', saved);
      else elm.removeAttribute('inputmode');
      delete elm.dataset.kbSaved;
    });
  }
}


class ScreenPanel extends SurfacePanel {

  static pzTarget = null;

  static update(target) {
    // This sets the (static) target for ScreenPanel pan/zoom operations.
    if(target && target.dataset.tag == "ScreenPanel") return ; // don't let ScreenPanel pan/zoom itself!
    ScreenPanel.pzTarget = target;
    _panels_.screen?.surface.update();
  }

  surface = new Pz(this);
}


class SymbolsPanel extends Panel {

  static css = css(
    "SymbolsPanel",
    `
    .SymbolsPanel__frame {
      background-color: #fff;
      background-image:
        linear-gradient(45deg, #e8e8e8 25%, transparent 25%),
        linear-gradient(-45deg, #e8e8e8 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e8e8e8 75%),
        linear-gradient(-45deg, transparent 75%, #e8e8e8 75%);
      background-size: 0.5em 0.5em;
      background-position: 0 0, 0 0.25em, 0.25em -0.25em, -0.25em 0;
      width: fit-content;
      padding: 0.25em;
      box-sizing: border-box;
      margin-bottom: 0.2em;
      height: 16em;
      overflow-y: auto;
      scrollbar-width: none;
      border-radius: var(--borderRadius);
      touch-action: none;
    }
    .SymbolsPanel__frame::-webkit-scrollbar {
      display: none;
    }
    .SymbolsPanel__grid {
      font-family: Bravura;
      font-size: 2em;
      display: grid;
      color: black;
      grid-template-columns: repeat(6, 1.55em);
      gap: 2px;
    }
    .SymbolsPanel__symbol {
      width: 1.55em;
      height: 2em;
      line-height: 0;
      padding-top: 1em;
      box-sizing: border-box;
      text-align: center;
      border-radius: calc(var(--borderRadius) / 4);
      border: 0.02em solid #d0d0d0;
      overflow: hidden;
   }
   .SymbolsPanel__symbol-active {
     background-color: #e0e8fff0;
   }
   `);

  content = helm(`
     <div data-tag="body" class="Panel__body">
       <div class="SymbolsPanel__frame" data-tag="frame">
         <div class="SymbolsPanel__grid" data-tag="grid"></div>
       </div>
      <div style="padding-top: var(--spacing-sm)">Group<div>
      <div data-tag="select"></div>
      <div data-tag="picker"></div>
      <div data-tag="staffSpace"></div>
      <div style="margin: var(--spacing-md); height: 2.5em; display: flex; align-items: center; justify-content: center;"><a href="https://www.w3.org/2021/03/smufl14/" rel="noopener noreferrer">SMuFL</a></div>
     </div>
   `);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));
    let stash = cell.stash;

    // Create a Select (similar to an html <select>)
    let select = new Select(Object.keys(smuflTable), stash.group, this) ;
    this.select.replaceWith(select.elm) ;

    listen(select.toggle, "SELECTED", (e) => {
       let key = stash.group = e.detail;
       let glyphs = (key == "Recent")
         ? Object.entries(stash.recent).sort((a, b) => b[1] - a[1]).map(([glyph]) => glyph)
         : smuflTable[key]; 
       clearChildren(this.grid) ;
       for (let codePoint of glyphs) {
         this.grid.append(helm(
           `<div class="SymbolsPanel__symbol ${codePoint == stash?.codePoint ? "SymbolsPanel__symbol-active" : ""}">${codePoint}</div>`
         ));
       }

    }) ;

    let l1 = listen(this.frame, "pointerdown", (e) => {
      this.frame.setPointerCapture(e.pointerId);
      let startY = e.clientY;
      let startScrollTop = this.frame.scrollTop;
      let moved = false;

      let mv = listen(this.frame, "pointermove", (emv) => {
        let dy = emv.clientY - startY;
        if (!moved && Math.abs(dy) > 4) moved = true;
        if (moved) this.frame.scrollTop = startScrollTop - dy;
      });

      let l2 = listen(this.frame, "pointerup", (eup) => {
        unlisten(mv);
        if (!moved) {
          let target = document.elementFromPoint(eup.clientX, eup.clientY)
            ?.closest(".SymbolsPanel__symbol");
          if (target) {
            if (target.classList.contains("SymbolsPanel__symbol-active")) {
              target.classList.remove("SymbolsPanel__symbol-active");
              target.style.transform = '';
              target.style.color = '';
              target.style.opacity = '';
              stash.codePoint = null;
            } else {
              Array.from(this.grid.children).forEach(c => { c.classList.remove("SymbolsPanel__symbol-active"); c.style.transform = ''; c.style.color = ''; c.style.opacity = ''; });
              target.classList.add("SymbolsPanel__symbol-active");
              stash.codePoint = target.textContent;
              stash.recent = mergeRecent(stash.recent || {}, { [stash.codePoint]: _recentSelectPts_ });
              _menu_.activateCell(cell);
              this.update();
            }
          }
        }
      }, {once: true});
    });

    this.listeners.push(l1);

    let picker = new ColorPicker(
        "Color",
        stash.rgb,
        stash.alpha,
        (rgb, alpha) => {
          stash.rgb = rgb;
          stash.alpha = alpha;
          this.update();
        }
    );
    this.picker.replaceWith(picker.elm);

    let staffSpace = new SliderGroup(
      stash,  { size: { min: 5, max: 40, step: 1, value: 8, msg: "Staff Space: {value}px" }},
      (e, tag, value) => {
        stash[tag] = value;
        this.update();
    });

    this.staffSpace.replaceWith(staffSpace.elm);
    this.staffSpace = staffSpace;
    this.update();
  }

  update() {
    let {alpha = 1, rgb = '#000000', size = 8 } = this.cell.stash;
    let activeCell = this.grid.querySelector('.SymbolsPanel__symbol-active');
    if (activeCell) {
      activeCell.style.transform = `scale(${size / 8})`;
      activeCell.style.color = rgb;
      activeCell.style.opacity = parseFloat(alpha);
    }
    let active = _score_.getActiveObject();
    if (active && active.podiumType == "symbols") {
      let color = fabric.Color.fromHex(rgb);
      color.setAlpha(parseFloat(alpha));
      active.set({ fill: color.toRgba(), fontSize: size * 4 });
      active.setCoords();
      active.canvas.requestRenderAll();
    }
  }
}

class PianoPanel extends Panel {
  constructor(cell) {
    super(cell);
    this.piano = new Piano(this, cell);
    this.body.replaceWith(this.piano.elm);
    this.panel.style.width =
      innerWidth / _pxPerEm_ / parseFloat(this.elm.style.fontSize) -
      4 +
      "em";
  }

  destructor() {
    super.destructor();
    this.piano.destructor();
  }

  show() {
    super.show();
    this.piano.show();
    this.piano.options.style.visibility = this.optionsVisibility ;
    return this;
  }

  hidden() {
    this.optionsVisibility = this.piano.options.style.visibility ;
    this.piano.options.style.visibility = "hidden" ;
  }
}

class PrintPanel extends Panel {

  content = helm(`
    <div data-tag="body" class="Panel__body">
      <div data-tag="buttons"></div>
      <b>Note:</b><br>Print larger scores<br>in small sections
      <div data-tag="first"></div>
      <div data-tag="last"></div>
    </div>`);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));
    // PrintPanel settings are not permanent, and are reset everytime the
    // PrintPanel is constructed, which should be the first time
    // its opened on a new score.  BUG, todo: should also reset when
    // pg's are added or removed
    let scoreLength = _score_.pgs.length;
    let props = { first: 1, last: scoreLength };

    cell = _menu_.rings.page.cells.numbers; // for pnToString
    let buttons = new ButtonGroup(
      props,
      {
        Ink: { svg: "Ink" },
        "No Ink": { svg: "No Ink" },
      },
      async (e, prop, tag) => {
        let printWin = null;
        let dataUrl = null;
        try {
          _shade_.show("Preparing to print");
          let pns = [];
          for (let i = props.first; i <= props.last; i++)
            pns.push(i);

          let data = await _score_.toPdf(tag == "Ink" ? "pdf" : "none", false, pns);
          if (!data || data.byteLength == 0) throw new Error("PDF data empty");

          dataUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));

          // Try to open the print window automatically. This usually works on 
          // desktop if the PDF generation was fast enough.
          try {
            printWin = window.open(dataUrl, "_blank");
          } catch (e) {
            console.warn("window.open blocked/failed:", e);
          }

          if (!printWin || printWin.closed || typeof printWin.closed == 'undefined') {
            // Popup blocked (especially possible on iOS Safari after await).
            // Show a dialog to provide a fresh user gesture.
            _shade_.hide();
            dialog("Your PDF is ready to print.", { "Open PDF": { svg: "Ink" } }, (e, prop, tag, args) => {
              window.open(dataUrl, "_blank");
              args.close();
            });
          } else {
            // Success! PDF opened in new tab, attempt to trigger print.
            // Note: iOS Safari ignores window.print(); users must print via the share button.
            delayMs(1000, () => { if (!printWin.closed) printWin.print(); });
          }
        }
        catch (error) {
          printWin?.close();
          if (window.cancelPdf) toast("Print cancelled");
          else {
            console.error("Print failed:", error);
            dialog(`<em>Print Failed</em><br><br><strong>${error.message}</strong>`);
          }
        }
        finally {
          _shade_.onCancel = null;
          _shade_.hide();
          this.close();
        }
      }
    );
    buttons.elm.style = "margin:.5em;width:12em";
    this.buttons.replaceWith(buttons.elm);
  
    let msgCallback = (tag, value) => {
      // don't allow first to be > last, or last to be < first
      if(tag == "first") {
        if(value > props.last) value = props.last;
        props.first = value;
        return "First page: " + pnToString(value);
      } else if(tag == "last") {
        if(value < props.first) value = props.first;
        props.last = value;
        return "Last page: " +  pnToString(value);
      }
    }

    // Can't combine these two sliders because of the way msgCallback works, sigh.
    this.firstSlider = new SliderGroup(props, {
      first: {min:1, max:props.last, step:1, value:1, msg: msgCallback},
    });
    this.first.replaceWith(this.firstSlider.elm);
    this.lastSlider = new SliderGroup(props, {
      last: {min:1, max:props.last, step:1, value:props.last,  msg: msgCallback},
    });
    this.last.replaceWith(this.lastSlider.elm);
    listen(_body_, "NUMBERS", (e) => {
      this.firstSlider.defs.first.max = this.lastSlider.defs.last.max = _score_.pgs.length;
      props.last  = Math.min(_score_.pgs.length, props.last);
      props.first  = Math.min(_score_.pgs.length, props.first);
      this.firstSlider.refresh();
      this.lastSlider.refresh();
    });
  }

}


class StopwatchPanel extends Panel {
  static css = css(
    "StopwatchPanel",
    `.Stopwatch__splits {
      width: 100%;
      overflow: hidden;
      font-family: 'Courier New', Courier, monospace;
      font-size: 0.9em;
      border-radius: var(--borderRadius);
      padding: 0.5em;
      box-sizing: border-box;
      border: 0.1em solid #aaa;
      background: #fff;
     }
    `
  );

  content = helm(
    `<div data-tag="body" style="display:flex;flex-flow:column;align-items:center;margin:1em;text-align:center;">
       <div data-tag="options"></div>
       Splits:
       <textarea data-tag="splits" class="Stopwatch__splits"></textarea>
     </div>`
  );

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    this.cell.stash.state == "Start";
    let stopWatch = (this.stopWatch = new Stopwatch(this));
    this.optionsGroup = new ButtonGroup(
      this.cell.stash,
      {
        Reset: { svg: "Reset" },
        Start: { svg: "Start", toggle: "state" },
        Stop: { svg: "Stop", toggle: "state" },
        Split: { svg: "Split" },
      },
      (e, prop, tag) => {
        if (tag == "Start") stopWatch.start();
        else if (tag == "Stop") stopWatch.stop();
        else if (tag == "Split") stopWatch.split();
        else if (tag == "Reset") stopWatch.reset();
      }
    );
    this.options.replaceWith(this.optionsGroup.elm);
    this.optionsGroup.refresh();
    return this;
  }

  destructor() {
    super.destructor();
    this.stopWatch.destructor();
  }

  show() {
    super.show();
    this.stopWatch.show();
    return this;
  }
}

class MagnifyPanel extends Panel {
  content = helm(`
    <div data-tag="body" class="Panel__body" style="min-width: 18em;">
      <div class="PencilPanel__preview" style="height:18em; margin:0; padding:0;">
        <canvas data-tag="magCanvas" width="300" height="300"
          style="width:100%; height:100%; display:block;"></canvas>
      </div>
      <div data-tag="slidersContainer" style="margin-top:0.5em;"></div>
    </div>`);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    this.sliderGroup = new SliderGroup(
      cell.stash,
      { zoom: { throttle: 100, min: 0.25, max: 5, step: 0.05, value: 1, msg: "Zoom: {value}x" },
      },
      (e, tag, value) => {
        _menu_.magnifier.zoom = Number(value);
        this.updateMagnifier();
      }
    );
    this.slidersContainer.append(this.sliderGroup.elm);

    // Store reference for magnifier updates
    _menu_.magnifier.panel = this;
  }

  show() {
    super.show();
    this.cell.stash.zoom = _menu_.magnifier.zoom;
    this.sliderGroup.refresh();
    return this;
  }

  updateMagnifier(fracX, fracY, pg) {
    // @fracX, @fracY are fractional coordinates (0 to 1) relative to displayed page
    // Store coordinates if provided
    if (fracX !== undefined) {
      this.lastFracX = fracX;
      this.lastFracY = fracY;
      // Manage magnifier hold to prevent deflation
      if (pg !== this.lastPg) {
        if (this.lastPg) this.lastPg.magnifierHold = false;
        if (pg) pg.magnifierHold = true;
      }
      this.lastPg = pg;
    }

    // Use stored coordinates
    fracX = this.lastFracX;
    fracY = this.lastFracY;
    pg = this.lastPg;

    if (!pg?.canvas) return;

    let canvas = pg.canvas;
    let zoom = _menu_.magnifier.zoom;
    let destW = 300, destH = 300;

    let ctx = this.magCanvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, destW, destH);

    // Draw from mozCanvas (PDF rendering) first as background
    if (pg.mozCanvas) {
      let srcW = pg.mozCanvas.width;
      let srcH = pg.mozCanvas.height;
      let srcX = fracX * srcW;
      let srcY = fracY * srcH;
      let sourceW = destW / zoom;
      let sourceH = destH / zoom;
      ctx.drawImage(
        pg.mozCanvas,
        srcX - sourceW/2, srcY - sourceH/2,
        sourceW, sourceH,
        0, 0, destW, destH
      );
    }

    // Draw from Fabric lower canvas (rendered objects/annotations)
    let fabW = canvas.lowerCanvasEl.width;
    let fabH = canvas.lowerCanvasEl.height;
    let fabX = fracX * fabW;
    let fabY = fracY * fabH;
    let fabSourceW = destW / zoom;
    let fabSourceH = destH / zoom;
    ctx.drawImage(
      canvas.lowerCanvasEl,
      fabX - fabSourceW/2, fabY - fabSourceH/2,
      fabSourceW, fabSourceH,
      0, 0, destW, destH
    );

    // Draw from upper canvas (selections, active drawing)
    ctx.drawImage(
      canvas.upperCanvasEl,
      fabX - fabSourceW/2, fabY - fabSourceH/2,
      fabSourceW, fabSourceH,
      0, 0, destW, destH
    );
  }

  destructor() {
    super.destructor();
    // Release magnifier hold on the page
    if (this.lastPg) this.lastPg.magnifierHold = false;
    _menu_.magnifier.panel = null;
  }
}

class CurtainSurface extends Surface {

  content = helm(`
    <div data-tag="surfaceContent" class="Surface__outline">
      <div data-tag="sliderProxy"></div>
      <div data-tag="buttonProxy"></div>
    </div>`) ;

  constructor(panel) {
    super(panel, ScreenPanel);
    Object.assign(this, dataIndex("tag", this.content)) ;
    let stash = panel.cell.stash;

    this.colorGroup = new ButtonGroup(stash, {
      Black: { svg: "Curtain Black", radio: "color" },
      Red:   { svg: "Curtain Red",   radio: "color" },
      },
      (e, prop, val) => {
        if(!_curtain_.on) _curtain_.toggle();
        _curtain_.update();
      }
    );
    this.colorGroup.elm.addEventListener('pointerdown', e => e.stopPropagation());
    this.buttonProxy.replaceWith(this.colorGroup.elm) ;

    this.slider = new SliderGroup(stash,
      { alpha: { min: 0, max: 100, step: 1, throttle: 50, value: 60, msg: (tag, value) =>
          `Curtain: ${Math.trunc(value)}%`
      }},
      (e, tag, value) => {
        if(!_curtain_.on) _curtain_.toggle();
        _curtain_.update();
      }
    );
    this.sliderProxy.replaceWith(this.slider.elm) ;
    panel.body.style.minWidth = panel.body.style.padding = "unset"; // defeat default body styles
    this.surface.style.width = this.content.style.width = "10em";
    this.surface.style.height = this.content.style.height = "10em";
    this.surface.append(this.content) ;
    this.surfaceDragElm = this.content ;
    panel.elm.style.zIndex = this.surface.style.zIndex = getComputedStyle(_curtain_.curtain).zIndex ;
    delay(2, () => this.slider.refresh());
  }

}

class CurtainPanel extends Panel {

  constructor(cell) {
    super(cell);
    this.surface = new CurtainSurface(this) ;
  }

  destructor() {
    super.destructor();
    this.surface.destructor();
  }

  show() {
    super.show();
    this.surface.show();
    return this;
  }

  hide() {
    super.hide();
    this.surface.hide();
  }
}

let panels = window._panels_ = {
  // This structure maps every Panel to its class.
  // Panels are instantiated on demand, and the
  // singletons are stored here as well, keyed by
  // their cell's key: its the name of the class,
  // minus the "Panel" portion, and starting with
  // lowercase. ex: GridPanel -> grid: instance
  Panel,
  AboutPanel,
  AddPanel,
  BookPanel,
  ClockPanel,
  CopyPanel,
  GuidePanel,
  DetailsPanel,
  GridPanel,
  HorizontalPanel,
  MagnifyPanel,
  MergePanel,
  MetronomePanel,
  NewPanel,
  NumbersPanel,
  OpenPanel,
  ImportPanel,
  KeyboardPanel,
  PencilPanel,
  PenPanel,
  PianoPanel,
  PrintPanel,
  RastrumPanel,
  ReviewPanel,
  SavePanel,
  ScreenPanel,
  StoragePanel,
  StopwatchPanel,
  TextPanel,
  EditPanel,
  SymbolsPanel,
  TablePanel,
  VerticalPanel,
  CurtainPanel,
  VolumePanel,
};
