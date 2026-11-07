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
  Drag,
  fontMap,
  fontUnmap,
  getBox,
  helm,
  hide,
  iconSvg,
  listen,
  mergeRecent,
  noTranslate,
  numb,
  pnToHtml,
  pxToEm,
  reflow,
  SliderGroup,
  schedule,
  Schedule,
  Surface,
  svgWrap,
  TabView,
  toast,
  unlisten,
} from "./common.js";
import { iconPaths } from "./icon.js";
import { escapeHtml, FileSrc, FileListView, FileSystemView, LocalFileView } from "./file.js";
import { Layout } from "./layout.js";
import { Score } from "./score.js";
import { smuflTable } from "./smufl.js";
import { Clock, Metronome, Piano, Review, Stopwatch, Volume } from "./tool.js";
export { Panel, panels, EditPanel, ScreenPanel, CurtainPanel, Select };

// -skip

class Select {

  static css = css(
    "Select", `
    mark {
      background-color: #aaa;
    }
    /* The toggle is a tile like a ButtonGroup button. Text is in the UI font, with
       Bravura behind it for any music glyphs in an option. */
    .Select__toggle {
      border-radius: .45em;
      background-image: var(--button-bg);
      box-shadow: var(--button-shadow);
      font-family: var(--body-font-family), Bravura;
      display:flex;
      align-items:center;
      justify-content:center;
      position:relative;
      padding: 0 1.8em 0 .6em;
      height:2.6em;
      box-sizing: border-box;
    }
    .Select__toggle:after {
      content: "\ueb7c";
      font-family: Bravura;
      color: var(--label-color);
      position:absolute;
      right:.2em;
      font-size:2.5em;
      top: calc(50% - .2em);
      line-height:0;
     }
    .Select__toggle:focus {
      background-image: var(--button-on-bg);
      box-shadow: var(--button-on-shadow);
      outline: none;
    }
    .Select__frame {
      border-radius:var(--borderRadius);
      position:absolute;
      overflow:hidden;
      z-index: var(--z-modal);
    }
    .Select__sash {
      color: var(--select-option-text);
      text-align:left;
      background: var(--select-option-bg);
      font-family: var(--body-font-family), Bravura;
      position:absolute;
    }
    .Select__option {
      position: relative;
      padding: .4em .6em .4em 1.5em;
    }
    /* the current option is checked (a tinted background read as unselected on a light list) */
    .Select__option-current::before {
      content: "\\2713";
      position: absolute;
      left: .45em;
    }

    /* for older Safari and Firefox */
    .Select__list::-webkit-scrollbar {
      display: none; 
    } 
 `) ;

  elm = helm(`
    <div>
     <div data-tag="toggle" class="Select__toggle"></div>
     <div data-tag="frame" class="Select__frame" style="visibility:hidden;">
       <div class="Select__sash" data-tag="sash"></div>
     </div>
    </div>`) ;

  focusOnBuild = true; // focus the toggle once built, for typing to search the options

  constructor(options, option=null, panel, translatable=() => true, optionStyle=null) {
    // @translatable(option) says whether the browser's translator may translate an option's
    // label; options are always identified by their original (untranslated) string.
    // @optionStyle(option), if given, returns style properties for showing an option's label,
    // in the list and in the toggle (e.g. each font name in its own typeface).
    Object.assign(this, dataIndex("tag", this.elm));
    Object.assign(this, {options, option, panel, translatable, optionStyle}) ;
    delayMs(_gs_ + 1, () => this.build()) ; // call build after we're confident panel has animated (duration _gs_) to its full size
  }

  build() {
    let {frame, options, option, panel, sash, toggle, translatable} = this ;
    toggle.tabIndex = 0 ; // required for toggle to be focused 
    let keyBuf = "" ;
    let toggleStyle = getComputedStyle(toggle);
    let emPerPx = parseFloat(toggleStyle.fontSize) ;
    toggle.style.width = frame.style.width = sash.style.width = parseFloat(toggleStyle.width) / emPerPx + "em";
    // the open list reaches down to the panel's bottom (measured on opening too: the panel's
    // size may have changed since)
    let fitFrame = () => ((getBox(panel.panel).bottom - getBox(frame).top) / parseFloat(getComputedStyle(toggle).fontSize)) - .5 + "em";
    frame.style.height = fitFrame();
    // Add in all the options:
    for(let option of options) {
      let elm = helm(`<div class="Select__option">${escapeHtml(option)}</div>`) ;
      elm.dataset.option = option ;
      elm.translate = translatable(option) ;
      if (this.optionStyle) Object.assign(elm.style, this.optionStyle(option)) ;
      sash.append(elm) ;
    }

    let selectOption = (option, matched=null) => {
      // called when an option is selected by user, either by clicking the option or by 
      // matching the option's text through keyboard input. @matched, if non-null, contains the
      // chars in option that were matched by keyBuf (user's typed chars)
      if(matched && matched.length > 0) {
        let re =  new RegExp(matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
        let m = option.match(re) ;
        let inner = m
          ? escapeHtml(option.slice(0, m.index)) + `<mark>${escapeHtml(m[0])}</mark>` + escapeHtml(option.slice(m.index + m[0].length))
          : escapeHtml(option) ;
        toggle.innerHTML = "<div>" + inner + "</div>";
      }
      else toggle.textContent = option;
      toggle.translate = translatable(option) ;
      if (this.optionStyle) Object.assign(toggle.style, this.optionStyle(option)) ;
      toggle.dispatchEvent(new CustomEvent('SELECTED', { detail:option}));
    }

    let closeFrame = () => {
      if(frame.style.visibility == "hidden") return;
      animate(frame, null, {height:0}, "height 350ms", () => frame.style.visibility = "hidden");
      keyBuf = "";
    };

    let l1 = listen(this.toggle,"pointerdown", (e) => {
      e.taken = true ;
      if(frame.style.visibility == "hidden") {
        frame.style.visibility = "visible" ;
        animate(frame, {height:0}, {height:fitFrame()}, "height 350ms");
      }
      else closeFrame() ;
    });

    let l2 = listen(sash,"pointerdown", (e) => {
      e.taken = true;
      let drag = new Drag(e) ;
      sash.setPointerCapture(e.pointerId);
      let top = sash.offsetTop;
      let sashLimit = frame.offsetHeight - sash.offsetHeight ;

      let mv = listen(sash, "pointermove", (emv) => {
        drag.mv(emv) ;
        sash.style.top = clamp(top + emv.clientY - e.clientY, sashLimit, 0) + "px" ;
      });

      listen(sash, "pointerup", (eup) => {
        unlisten(mv);
        drag.up(eup) ;
        if(!drag.moved) {
          // closest(): a browser translator may wrap an option's text in <font> elements, and
          // textContent would then be the translated label rather than the option itself
          let target = e.target.closest(".Select__option") ;
          if(!target) return closeFrame() ;
          this.markCurrent(target) ;
          closeFrame();
          return selectOption(target.dataset.option) ;
        }
        else if (drag.vY) {
          let { to, dt } = Drag.fling(sash.offsetTop, frame.offsetHeight - sash.offsetHeight, 0, drag.vY);
          animate(sash, null, { top: to + "px" }, `top ${dt}ms ease-out`);
        } 
      }, { once:true}) ;
    }); 

    let opt = null ; // currently selection option, if any
    let l3 = listen(toggle, "keydown", (e) => {
      e.stopPropagation();

      let sashTop = null;
      switch(e.key) {
        case "Home": sashTop = "0" ; break ;
        case "End": sashTop = frame.offsetHeight - sash.offsetHeight ; break;
        case "ArrowDown":
          if(this.frame.style.visibility == "hidden") return this.frame.style.visibility = "visible" ;
        case "ArrowUp": 
          let optionHeight = sash.scrollHeight / options.length;
          sashTop = sash.offsetTop + (e.key == "ArrowDown" ? optionHeight : -optionHeight);
          break;
        case "Backspace":
        case "Delete": 
          keyBuf = keyBuf.slice(0,-1) ;
          // fall through to search logic in default
        case "Enter": 
          if(e.key == "Enter") {
             keyBuf = "" ;
             selectOption(opt);
             return;
          }
        default: 
          if (e.key != "Backspace" && e.key != "Delete") {
            if(/^[a-zA-Z0-9 .]$/.test(e.key)) keyBuf += e.key;
            else return;
          }
          let lineNumber = 0 ;
          opt = options.find((str) => { ++lineNumber ; return new RegExp(keyBuf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i").test(str);}) ;
          if(opt) {
            selectOption(opt, keyBuf) ;
            sashTop = frame.offsetHeight/2 - sash.offsetHeight * (lineNumber / options.length) ;
            this.markCurrent(sash.children[lineNumber-1]) ;
          }
          else if (e.key != "Backspace" && e.key != "Delete") keyBuf = keyBuf.slice(0,-1) ;
      }
      if(sashTop != null) {
        sashTop = clamp(sashTop, frame.offsetHeight - sash.offsetHeight, 0) ;
        animate(sash, null, { top: sashTop + "px"}, `top ${Drag.scrollDur(sash.offsetTop -sashTop)}ms ease-out`) ;
      }
    })

    let l4 = listen(frame, "wheel", (e) => {
      if (frame.style.visibility != "hidden") 
        sash.style.top = clamp(sash.offsetTop - e.deltaY, frame.offsetHeight - sash.offsetHeight, 0) + "px";
    });

    panel.listeners.push(l1, l2, l3, l4) ;

    if(option) {
      let lineNumber = 0 ;
      let opt = options.find((str) => { ++lineNumber ; return option == str;}) ;
      if(opt) {
        selectOption(opt, keyBuf) ;
        sash.style.top = clamp(frame.offsetHeight/2 - sash.offsetHeight * (lineNumber / options.length), frame.offsetHeight - sash.offsetHeight, 0) + "px" ;
        this.markCurrent(sash.children[lineNumber-1]) ;
      }
    }

    if (this.focusOnBuild) this.toggle.focus();
  }

  set(option) {
    // Show @option as the selected one, from outside. No SELECTED event is dispatched.
    this.option = option; // (if not yet built, build() will use it)
    let elm = [...this.sash.children].find(elm => elm.dataset.option == option);
    if (!elm) return;
    this.toggle.textContent = option;
    this.toggle.translate = this.translatable(option);
    if (this.optionStyle) Object.assign(this.toggle.style, this.optionStyle(option));
    this.markCurrent(elm);
  }

  markCurrent(elm) {
    // Check @elm as the current option
    this.target?.classList.remove("Select__option-current");
    this.target = elm;
    elm.classList.add("Select__option-current");
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

  // The ink tools whose objects carry the settings they were made with, as
  // podiumStash (see Pg.customProps): their panels show the selected object's
  // settings, and changes made in the panel apply to that object.
  static stashKeys = ["pencil", "pen", "rastrum", "text", "symbols"];

  static load(target) {
    // Called when an object is selected. If it was made with one of the
    // stashKeys tools, load the settings it was made with into that cell's
    // stash, and into the cell's panel if it exists (it needn't, and needn't
    // be onscreen).
    if (!target || target.flatten) return;
    let key = target.type == "textbox" ? "text" : target.podiumType;
    if (!Panel.stashKeys.includes(key)) return;
    let stash = target.podiumStash ?? Panel.deriveStash(key, target);
    if (!stash) return;
    Object.assign(_menu_.rings.ink.cells[key].stash, stash);
    _panels_[key]?.sync();
  }

  static deriveStash(key, target) {
    // For an object saved before podiumStash existed: the settings that can be
    // had from the object itself (not a stroke's style, nor anything of a rastrum).
    // @return a (partial) stash, or null
    let paint = key == "pencil" || key == "pen" ? target.stroke : target.fill;
    if (key == "rastrum" || !paint) return null;
    let color = new fabric.Color(paint);
    let stash = { rgb: "#" + color.toHex(), alpha: color.getAlpha() };
    switch (key) {
      case "text": {
        let font = fontUnmap[`${target.fontFamily}/${target.fontStyle}/${target.fontWeight}`];
        if (font) stash.font = font;
        stash.size = target.fontSize;
        stash.height = Math.round(target.fontSize * target.lineHeight);
        break;
      }
      case "symbols": stash.size = target.fontSize / 5; break; // see SymbolsPanel.update
      default: stash.width = target.strokeWidth;
    }
    return stash;
  }

  changed(keys = Object.keys(this.cell.stash)) {
    // A panel's update() also runs when it is shown or loaded, not only when
    // one of its controls is used.
    // @keys the stash settings of interest (default: all)
    // @return true iff one of them has been changed since the last call
    let settings = JSON.stringify(keys.map(key => this.cell.stash[key]));
    let changed = this.settings !== undefined && this.settings != settings;
    this.settings = settings;
    return changed;
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
      /* No drop-shadow filter on panels: a filter promotes a GPU compositing
         layer whose blurred drop-shadow leaves trails when a panel is dragged on
         iOS/iPad (the compositor fails to invalidate the shadow overhang). Border
         + inset box-shadow read fine without it. Don't re-add a filter. */
      box-shadow: var(--panel-inset-shadow);
      background: var(--panel-bg);
      z-index: 90;
      /* Never let a panel exceed the viewport (dvh/dvw track the iOS URL bar).
         Oversized panels are capped here; ones that want their overflow to
         scroll (e.g. AboutPanel) cap their body to the viewport too. */
      max-width: calc(100vw - 1em);
      max-height: calc(100dvh - 1em);
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
      transform: translateZ(0); /* fix for iOS partial-path SVG rendering glitch */
      will-change: transform;
    }
    .Panel__title {
      position: absolute;
      height: 3em;
      width: 100%;
      text-align: center;
      vertical-align: middle;
      line-height: 3em;
      font-weight: 600;
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
    /* A section heading: small, muted and letter-spaced, s.t. it reads as a heading
       rather than as one more line of text, under a hairline that frames its section.
       (Panel__heading-first: a heading at the top of a panel, with no rule above it.) */
    .Panel__heading {
      margin-top: var(--spacing-md);
      padding-top: var(--spacing-md);
      border-top: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent);
      margin-bottom: var(--spacing-xs);
      font-size: var(--font-size-sm); /* as big as a slider's text */
      letter-spacing: .1em;
      font-weight: 500;
      text-transform: uppercase;
      color: var(--label-color);
      text-align: center;
      align-self: stretch; /* full width, even in a panel that centers its items */
    }
    .Panel__heading-first {
      margin-top: 0;
      padding-top: 0;
      border-top: 0;
    }
    /* the same rule, over a section that has no heading (e.g. a block of sliders) */
    .Panel__ruled {
      margin-top: var(--spacing-md);
      padding-top: var(--spacing-md);
      border-top: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent);
      align-self: stretch;
    }
  `
  );

  elm = helm(`
    <div class="pz Panel" style="z-index:200">
      <div data-tag="panel" class="Panel__elm">
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
  lastTapTime = 0;

  constructor(cell) {
    Object.assign(this, dataIndex("tag", this.elm));
    this.elm.style.fontSize = _menu_.elm.style.fontSize; // open at same zoom level as menu
    this.cell = cell;
    this.elm.dataset.tag = this.constructor.name;
    if (cell.gb) this.elm.dataset.gb = cell.gb; // its Guidebook section: see GuidePanel.follow
    this.elm.panel = this;
    this.setIcon(cell.svgPath);
    this.setTitle(cell.name);
    this.listeners.push(
      listen(this.closer, "pointerdown", (e) => {
        e.stopPropagation();
        e.taken = true ;
        this.close();
      })
    );
    this.listeners.push(
      listen(this.header, "pointerdown", (e) => {
        e.taken = true;
        let now = performance.now();
        if (now - this.lastTapTime < 300) {
          let path = this.cell.ring?.key + "/" + this.cell.key;
          _menu_.notify(path + "/up");
          let longPressTimer = setTimeout(() => _menu_.notify(path + "/long"), 500);
          listen(this.header, "pointerup", () => clearTimeout(longPressTimer), { once: true });
        }
        this.lastTapTime = now;
        let drag = new Drag(e) ;
        let { header, elm } = this;
        if(!(this instanceof CurtainPanel)) // CurtainPanel uniquely manages its own z-index
          elm.style.zIndex = ++_zTop_; // move to top of stacking order
        this.header.classList.add("Panel__header-selected");
        header.setPointerCapture(e.pointerId);
        let middleX = this.panel.offsetWidth / 2;
        let middleY = this.panel.offsetHeight / 2;

        let offsetX = e.offsetX, offsetY = e.offsetY;

        let mv = listen(header, "pointermove", (emv) => {
          if (e.pointerId != emv.pointerId) return; // rem grd...needed?
          drag.mv(emv) ;
          elm.style.left = emv.clientX - offsetX + middleX + "px";
          elm.style.top = emv.clientY - offsetY + middleY + "px";
          this.constrain();
        });

        listen(header,"pointerup",
          (eup) => {
            drag.up(eup) ;
            header.classList.remove("Panel__header-selected");
            unlisten(mv);
            if (drag.vXY) { // fling detected
              this.hide();
              if(this.elm.dataset.tag != "ScreenPanel") ScreenPanel.update(null) ;
            }
          },
          { once: true }
        );
      })
    );
    this.listeners.push(
      // (after main.js rescales panel positions for a rotation: constraining
      // first mixes the old window's coordinates with the new one's, and the
      // panel drifts)
      listen(window, "resize", () => delay(10, () => {
        if (this.elm.style.visibility == "visible") this.resized();
      })));
    delay(1, () => this.elm.owner = this) ;
  }

  hidden() { 
    // subclasses override to take action when they are about to
    // be hidden
  }

  resized() {
    // The window was resized or rotated while the panel is showing
    this.constrain();
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
   // Ensure panel's title and header's height stay onscreen
    let y = this.panel.offsetHeight / 2 ;
    if(this.elm.offsetTop < y) this.elm.style.top = y + "px" ;
    else {
       y += window.innerHeight - this.header.offsetHeight ;
       if(this.elm.offsetTop > y)
       this.elm.style.top = y + "px" ;
    }
    let range = document.createRange();
    range.selectNodeContents(this.title) ;
    let box = range.getBoundingClientRect();
    let x = this.elm.offsetLeft - box.x ;
    if(this.elm.offsetLeft < x) this.elm.style.left = x + "px" ;
    else {
       x = window.innerWidth - box.width / 2 ;
       if(this.elm.offsetLeft > x) this.elm.style.left = x + "px" ;
    }
   return ;
  }

  setIcon(svgPath) {
    let newIcon = helm(svgWrap(svgPath, { tag: "icon", class: "Panel__icon" }));
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
    //   Currently, only ImportPanel's show(....) method
    //   popuplates this.
    ScreenPanel.update(this.elm) ;
    let elm = this.elm;
    this.setIcon(this.cell.svgPath);
    this.setTitle(this.cell.name);
    elm.style.visibility = "visible";
    if (!elm.isConnected) _body_.append(elm);
    let dy = this.header.offsetHeight / 2 - this.panel.offsetHeight / 2;
    elm.style.transformOrigin = `0px ${dy}px`;
    elm.style.transform = "scale(0)";
    reflow();
    elm.style.transition = `transform ${_gs_}ms`;
    numb(elm, _gs_);
    if(onShown) delayMs(_gs_, () => onShown()) ;
    elm.style.transform = "scale(1)";
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
    `.AboutPanel__credits {
        padding: var(--spacing-sm) var(--spacing-lg) var(--spacing-lg);
        text-align: left;
     }
     .AboutPanel__credits > .Panel__heading:first-child { margin-top: 0; border-top: 0; }
     .AboutPanel__credit {
        margin-bottom: var(--spacing-md);
        font-size: .9em;
        color: var(--label-color);
     }
     /* the name (a link) and, at the right, its version */
     .AboutPanel__name {
        display: flex;
        justify-content: space-between;
        gap: var(--spacing-md);
        font-size: 1.1em;
        color: var(--color-text);
     }
     .AboutPanel__name a { font-weight: 600; }
     .AboutPanel__name span { font-variant-numeric: tabular-nums; white-space: nowrap; }
     /* the License face: its heading lines centered, the text left-aligned */
     .AboutPanel__license {
        padding: 2em;
        overflow: auto;
        text-align: left;
     }
     .AboutPanel__product {
        text-align: center;
        margin-top: 1em;
     }
     .AboutPanel__product:first-child { font-weight: 600; }
     .AboutPanel__license p { margin: 1em 0 0; }
     .AboutPanel__scroll {
        overflow-y: auto;
        scrollbar-width: none;
        touch-action: none; /* (a drag scrolls it, below: touch too, so it doesn't fight the browser's own pan) */
        height: 100%;
        box-sizing: border-box;
        cursor: grab;
     }
     .AboutPanel__scroll::-webkit-scrollbar {
        display: none;
     }
     `
  );

  licenseFace = helm(`<div class="AboutPanel__license">
  <div class="AboutPanel__product" translate="no">PODIUM: Sheet Music Studio</div>
  <div class="AboutPanel__product" translate="no">Copyright &copy; 2026 Glendon Diener</div>

  <p>Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.</p>

  <p>Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
      <a rel="noopener noreferrer" translate="no" href="https://www.gnu.org/licenses/agpl-3.0-standalone.html">GNU Affero Public License</a>
for more details.</p></div>
      `);

  creditsFace = helm(`<div class="AboutPanel__credits">
        <div class="Panel__heading">Fonts</div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://github.com/steinbergmedia/bravura">Bravura Text</a><span>1.392</span></div>
          <div>© 2021 Steinberg Media Technologies GmbH</div>
          <div>SIL Open Font License 1.1</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://rsms.me/inter/">Inter</a><span>4.001</span></div>
          <div>© 2016 The Inter Project Authors</div>
          <div>SIL Open Font License 1.1</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://fonts.google.com/specimen/Patrick+Hand">Patrick Hand</a><span>1.003</span></div>
          <div>© 2012 Patrick Wagesreiter</div>
          <div>SIL Open Font License 1.1</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://filipposfragkogiannis.com/fonts/vercetti-regular">Vercetti</a><span>1.001</span></div>
          <div>© 2022 Filippos Fragkogiannis and Richard Mandona</div>
          <div>Licence Amicale 0.2</div>
        </div>
        <div class="Panel__heading">Code</div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://codepen.io/zastrow/details/kxdYdk">CSS Piano</a><span></span></div>
          <div>© 2026 Philip Zastrow</div>
          <div>MIT</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://github.com/fabricjs">fabric.js</a><span>5.3.0</span></div>
          <div>© 2008–2015 Printio (Juriy Zaytsev, Maxim Chernyak)</div>
          <div>MIT</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://github.com/foliojs/fontkit">fontkit</a><span>1.1.1</span></div>
          <div>© Devon Govett</div>
          <div>MIT</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://github.com/mozilla/pdf.js">pdf.js</a><span>4.10.38</span></div>
          <div>© 2024 Mozilla Foundation</div>
          <div>Apache 2.0</div>
        </div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://github.com/Hopding/pdf-lib">pdf-lib</a><span>1.17.1</span></div>
          <div>© 2019 Andrew Dillon</div>
          <div>MIT</div>
        </div>
        <div class="Panel__heading">Sound</div>
        <div class="AboutPanel__credit" translate="no">
          <div class="AboutPanel__name"><a href="https://github.com/sfzinstruments/SalamanderGrandPiano">Salamander Grand Piano</a><span>V2 Yamaha C5</span></div>
          <div>© Alexander Holm</div>
          <div><a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a></div>
        </div>
      </div>`);

  versionFace = helm(
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:space-between;min-height:100%;width:100%;box-sizing:border-box;padding:2em 1em;text-align:center;">
        <div style="font-size:1.5em;display:flex;flex-direction:column;align-items:center;gap:0.2em;">
          <div style="white-space:nowrap;">PODIUM: Sheet Music Studio</div>
          ${iconSvg("Podium", { size: "8em" })}
          <div>Version ${_podiumVersion_}</div>
          <a style="font-size:.6em;" href="https://studiop5.org/releaseNotes.html#v${_podiumVersion_}">Release Notes</a>
          <div style="font-size:.6em;color:#888;margin-top:0.5em;">${typeof chrome !== "undefined" && chrome.runtime?.id ? "Browser Extension" : window.matchMedia("(display-mode: standalone)").matches ? "Progressive Web App" : location.protocol + "//" + location.host}</div>
        </div>
        <div style="font-size:1.2em;text-align:center;font-variant-emoji:text;margin-top:2em;line-height:1.6em;">
          <a href="https://studiop5.org/privacy.html">\u{1F6E1} Privacy</a>&nbsp;
          <a href="https://studiop5.org/terms.html">\u00A7 Terms</a><br>
          <a href="https://github.com/studiop5/podium">&lt;&sol;&gt; Source</a>&nbsp;
          <a href="https://github.com/studiop5/podium/issues">\u2709\uFE0E Issues</a>
        </div>
     </div>`
  );


  constructor(cell) {
    super(cell);
    let tabView = new TabView(this, "Version", "Credits", "License");
    Object.assign(this.body.style, {
      margin: 0,
      width: "32em",
      height: "38em",
      // Cap to the viewport (leaving room for the 3em header) so the panel
      // always fits on screen at full font size; the body keeps a definite
      // height, so the face cascade below can scroll the overflow.
      maxWidth: "calc(100vw - 2em)",
      maxHeight: "calc(100dvh - 4.5em)",
    });
    tabView.frame.style.height = "100%";
    tabView.faces.style.position = "relative";
    tabView.faces.style.top = "0";
    tabView.tabs["Version"].face.append(this.versionFace);
    tabView.tabs["Credits"].face.append(this.creditsFace);
    tabView.tabs["License"].face.append(this.licenseFace);
    // The credits don't fit: a drag anywhere in them scrolls them (no scrollbar is ever shown).
    let face = tabView.tabs["Credits"].face;
    face.classList.add("AboutPanel__scroll");
    this.listeners.push(listen(face, "pointerdown", (e) => {
      e.taken = true;
      e.preventDefault(); // no text selection, nor dragging a link away
      // (captured right away: capturing mid-drag ends the touch on Android, see TabView.
      // So a click lands on the face, not on a link: a tap is passed to its link below)
      face.setPointerCapture(e.pointerId);
      let startY = e.clientY;
      let startTop = face.scrollTop;
      let dragged = false;
      let mv = listen(face, "pointermove", (emv) => {
        let dy = emv.clientY - startY;
        if (Math.abs(dy) > 4) dragged = true;
        if (dragged) face.scrollTop = startTop - dy;
      });
      listen(face, "pointerup", () => {
        unlisten(mv);
        if (!dragged) e.target.closest("a")?.click();
      }, { once: true });
    }));
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
      <div class="Panel__heading">Size</div>
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
    this.colorPicker.title.classList.add("Panel__heading-first"); // (it tops the panel)
    // Preset paper names (A4, Octavo, Hand Copy (Trad), ...) are proper names and never
    // translated; only the app's own wording is.
    this.select = new Select(Object.keys(this.options), stash.size, this, (size) => size == "Custom" || size == "Match Score") ;
    this.selectProxy.replaceWith(this.select.elm) ;
    this.setupSizeSelection(stash);
  }

  setupSizeSelection(stash) {
    // Extract the size selection logic into a method
    let sizeMsg = (tag, val) => {
      let pt = val.toFixed(0);
      let mm = (val * (1 / 2.8346456693)).toFixed(0);
      let inch = (val * (1 / 72)).toFixed(2);
      return `${tag}: ${noTranslate(`${pt}pt,... ${mm}mm, ${inch}in`)}`;
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
    this.colorPicker.title.classList.remove("Panel__heading-first"); // (the pages slider is above it)
    this.pagesGroup.refresh();
  }
}

class DetailsPanel extends Panel {
  static css = css(
    "DetailsPanel", `
    .DetailsPanel { margin: 1em; width: 20em; display: flex; flex-direction: column; gap: var(--spacing-md); }
    .DetailsPanel__heading {
      font-size: .7em;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--label-color);
    }
    .DetailsPanel__name { position: relative; display: flex; flex-direction: column; gap: .25em; }
    .DetailsPanel__name input {
      font: inherit;
      font-size: 1.25em;
      color: var(--color-text);
      width: 100%;
      box-sizing: border-box;
      padding: .3em 2.2em .25em .4em;
      border: 0;
      border-bottom: .1em solid color-mix(in srgb, var(--color-text) 30%, transparent);
      border-radius: .3em .3em 0 0;
      background: color-mix(in srgb, var(--color-text) 7%, transparent);
    }
    .DetailsPanel__name input:focus { outline: none; border-bottom-color: var(--accent); }
    .DetailsPanel__ext { position: absolute; right: .6em; bottom: .45em; font-size: .8em; color: var(--label-color); pointer-events: none; }
    .DetailsPanel__info {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: .3em .8em;
      font-size: .8em;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }
    .DetailsPanel__info > :nth-child(odd) { color: var(--label-color); }
    .DetailsPanel__sub { color: var(--label-color); font-size: .9em; }
    .DetailsPanel__section {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
      padding-top: var(--spacing-md);
      border-top: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent);
    }
    /* the section draws its own rule and spacing, above its heading */
    .DetailsPanel__section > .Panel__heading { margin-top: 0; padding-top: 0; border-top: 0; }
  `);

  content = helm(`<div class="DetailsPanel"></div>`);

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
         if (!score) return; // (the panel can stay open after its score was closed)
         score.details.pgFit = value;
         // Re-open the current layout to apply the new fit. Use the canonical
         // stash.active key (always valid, kept current by Layout.open) — the
         // layout ring's activeCell object is not reliably maintained and can
         // be null/stale (cf. score.js score-load path).
         let layout = _menu_.rings.layout;
         await Layout.open(layout.cells[layout.stash.active || "book"]);
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
        let score = _score_;
        if (score) {
          score.quality = value;
          for (let pg of score.pgs)
            // rerender un-rendered pg's iff they are backed by pdf:
            if (pg.inflated && pg.mozPn) await pg.renderPdf().catch(err => {
              // AbortError: pg was deflated meanwhile (e.g. the layout was rebuilt)
              if (err.name != "AbortError") console.warn(`Failed to render page ${pg.mozPn}:`, err);
            });
        }
      }
    );

    this.refresh();
  }

  refresh() {
    this.qualityGroup.refresh();
    clearChildren(this.content);
    if (_score_) {
      let score = _score_;

      // file name, editable, without its extension (which stays .pdf)
      let name = helm(
        `<label class="DetailsPanel__name">
           <span class="DetailsPanel__heading">File name</span>
           <input type="text" spellcheck="false" enterkeyhint="done">
           <span class="DetailsPanel__ext" translate="no">.pdf</span>
         </label>`
      );
      let nameInput = name.querySelector("input");
      nameInput.value = score.name.replace(/\.pdf$/i, "");
      listen(nameInput, "change", () => {
        let newName = nameInput.value.trim();
        if (!newName.toLowerCase().endsWith(".pdf")) newName += ".pdf";
        score.name = newName;
        score.setTitle();
      });
      this.content.append(name);

      // label/value rows: muted labels, no colons
      let row = (label, value) => `<div>${label}</div><div>${value}</div>`;
      let when = (ts) => ts ? noTranslate(DetailsPanel.dateFormat.format(new Date(ts))) : "?";
      let PERM_FLAGS = [
        [4,    "Print"],
        [16,   "Copy"],
        [8,    "Modify"],
        [32,   "Annotate"],
        [1024, "Assemble"],
      ];
      let permVal;
      if (score.permissions === null) {
        permVal = "No restrictions";
      } else {
        let denied = PERM_FLAGS
          .filter(([f]) => !score.permissions.includes(f))
          .map(([, n]) => n);
        permVal = denied.length == 0
          ? "All allowed"
          : `<span style="color:#c44">Restricted: ${denied.join(", ")}</span>`;
      }
      this.content.append(
        helm(`<div class="DetailsPanel__info">
          ${score.source ? row("Source", noTranslate(escapeHtml(score.source))) : ""}
          ${score.path ? row("Path", noTranslate(escapeHtml(score.path))) : ""}
          ${score.size ? row("Size", noTranslate(DetailsPanel.fileSize(score.size))) : ""}
          ${row("Pages", score.pgs.length)}
          ${row("Permissions", permVal)}
          ${row("Created", when(score.created))}
          ${row("Modified", when(score.modified))}
          ${row("Page size", DetailsPanel.pageSize(score.maxWidth, score.maxHeight))}
          </div>`)
      );

      let fit = helm(`<div class="DetailsPanel__section"><div class="Panel__heading">Page fit</div></div>`);
      fit.append(this.fitGroup.elm);
      this.content.append(fit);
      let quality = helm(`<div class="DetailsPanel__section"></div>`);
      quality.append(this.qualityGroup.elm);
      this.content.append(quality);

      if (score.pdfInfo) {
        let detailsHtml = "";
        for (let [k, v] of Object.entries(score.pdfInfo)) {
          if (!k) continue;
          // Filter out technical fields
          if (k == "PDFFormatVersion" || k == "Language" || k == "EncryptFilterType" || k == "EncryptFilterName") continue;
          if (k.startsWith("Is") || k.startsWith("is")) continue; // Skip isLinearized, isPureXfa, etc.

          // For date fields, show only the decoded date
          if (typeof v == "string" && v.startsWith("D:")) {
            let date = Score.pdfDate(v);
            v = date ? DetailsPanel.dateFormat.format(date) : "?"; // (some writers store garbage)
          }
          detailsHtml += row(escapeHtml(k), noTranslate(escapeHtml(String(v))));
        }
        this.content.append(
          helm(
            `<div class="DetailsPanel__section">
               <div class="Panel__heading">Original PDF</div>
               <div class="DetailsPanel__info">${detailsHtml}</div>
             </div>`
          )
        );
      }
    }
  }

  static dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  static fileSize(bytes) {
    // e.g. "3.4 MB", "820 KB", "512 B" (1 KB = 1000 B, as storage makers and macOS count)
    let units = ["B", "KB", "MB", "GB"], i = 0, n = Number(bytes);
    while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return `${n.toLocaleString(undefined, { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
  }

  static pageSize(wPt, hPt) {
    // "210 × 297 mm (A4)", over the same size in points and inches
    let mm = (pt) => Math.round(pt / 2.8346456693);
    let [w, h] = [mm(wPt), mm(hPt)];
    let paper = [["A4", 210, 297], ["A3", 297, 420], ["B4", 250, 353], ["Letter", 216, 279],
      ["Legal", 216, 356], ["Tabloid", 279, 432], ["9 × 12 in", 229, 305]].find(([, pw, ph]) =>
      (Math.abs(w - pw) <= 2 && Math.abs(h - ph) <= 2) || (Math.abs(w - ph) <= 2 && Math.abs(h - pw) <= 2));
    return noTranslate(`${w} × ${h} mm${paper ? ` (${paper[0]})` : ""}`) +
      `<div class="DetailsPanel__sub">${noTranslate(`${wPt.toFixed(0)} × ${hPt.toFixed(0)} pt · ${(wPt / 72).toFixed(2)} × ${(hPt / 72).toFixed(2)} in`)}</div>`;
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
    // overflow:hidden doesn't prevent programmatic scrollTop changes — browser extensions
    // (e.g. password managers) can cause Panel__elm to scroll by injecting/removing elements
    // from body. Panel__elm should never scroll intentionally, so reset immediately.
    this.listeners.push(
      listen(this.panel, "scroll", () => this.panel.scrollTop = 0)
    );
    // Get a head start loading Google's Identity Services SDK now, well before the
    // user might tap the Google Drive tab — see GDriveSrc.preloadGIS for why.
    FileSrc.get(Score.sources.gdrive).preloadGIS();
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
    let fileSources = Object.entries(Score.sources).filter(([key]) => key !== "url").map(([, value]) => value);
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

  hidden() {
    // If the panel closes without a file being selected, deactivate (and unlock) the cell
    if (!this.cell.pdfData) _menu_.activateCell(null, _menu_.rings.page);
  }
}


class SavePanel extends FilePanel {
  mode = "save";

  constructor(cell) {
    // code identical to OpenPanel constructor except that a SavePanel
    // doesn't have a "Recent" tab
    super(cell);
    this.mode = "save";
    // Filter out WWW (url source)
    let fileSources = Object.entries(Score.sources)
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
      <div class="Panel__heading">Numbers</div>
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
    ? `https://studiop5.org/Guidebook.html`
    : `Guidebook.html`;

  content = helm(
    `<div style="padding:0;width:100%;height:100%;box-sizing:border-box;overflow:hidden;position:relative;">
       <iframe style="width:100%;height:100%;border:none;display:none;"></iframe>
       <div class="guide-msg" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#888;font-size:1.2em;"></div>
     </div>`
  );

  constructor(cell) {
    super(cell);
    // Opens at the size it was last left at or, at first, at most a quarter of the screen,
    // shrunk to fit beside the menu (but no narrower than the Guidebook needs to read
    // well); never larger than the screen. In em, so it scales like any panel: only the
    // Guidebook's text (in its iframe) doesn't.
    let em = (parseFloat(this.elm.style.fontSize) || 1) * _pxPerEm_;
    let { w, h } = cell.stash;
    if (!w) {
      w = Math.max(innerWidth / 2, 360);
      h = innerHeight / 2;
      let room = GuidePanel.menuRoom(), side = GuidePanel.bestSide(room, w, h);
      if (side == "left" || side == "right") w = Math.max(Math.min(w, room[side]), 360);
      else h = Math.max(Math.min(h, room[side] - 3 * em), 200); // (3em: about the header)
    }
    w = Math.min(w, innerWidth);
    h = Math.min(h, innerHeight);
    Object.assign(this.body.style, {
      margin: 0,
      padding: 0,
      width: w / em + "em",
      height: h / em + "em",
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
      this.follow(true);
      return this;
    }
    super.show();
    this.follow(true);
    if (this.fetched) return this;
    this.fetched = true;
    this.msg.textContent = "Fetching Guidebook...";
    this.iframe.src = GuidePanel.guidebookUrl;
    listen(this.iframe, "load", () => {
      this.iframe.style.display = "block";
      this.msg.style.display = "none";
    }, { once: true });
    listen(this.iframe, "load", () => this.hookFrame()); // (every load: each brings a new window)
    if (!navigator.onLine) {
      this.msg.textContent = "Guidebook is not available.";
    }
    return this;
  }

  // Open beside the menu rather than over it (when opened by a tap: a drag-out puts it
  // where it's dropped), on whichever side has the most room for it, kept on screen
  setPosition() {
    let w = this.panel.offsetWidth, h = this.panel.offsetHeight; // (offset*: unaffected by show's animation)
    let room = GuidePanel.menuRoom(), { x, y, r } = room, side = GuidePanel.bestSide(room, w, h);
    let left = side == "left" ? x - r - w : side == "right" ? x + r : x - w / 2;
    let top = side == "top" ? y - r - h : side == "bottom" ? y + r : y - h / 2;
    // (a panel's left, top place its center)
    this.elm.style.left = clamp(left, 0, Math.max(innerWidth - w, 0)) + w / 2 + "px";
    this.elm.style.top = clamp(top, 0, Math.max(innerHeight - h, 0)) + h / 2 + "px";
    this.constrain();
    return this;
  }

  // Podium's zoom over the Guidebook. Events inside its iframe never reach Podium, so a
  // ctrl+wheel or two-finger pinch there would zoom the whole browser page instead. The
  // Guidebook's window (same origin) hands them over: any touch there selects this panel
  // as the zoom target (as a tap on its header does), and a ctrl+wheel or pinch zooms it.
  // One-finger scrolling stays the Guidebook's own.
  hookFrame() {
    let win = this.iframe.contentWindow;
    let select = () => {
      _pzTarget_ = this.elm;
      ScreenPanel.update(this.elm);
    };
    listen(win, "pointerdown", select, { capture: true });
    listen(win, "wheel", (e) => {
      if (!e.ctrlKey) return; // (a plain wheel scrolls the Guidebook)
      e.preventDefault();
      select();
      this.elm.dispatchEvent(new WheelEvent("wheel", { deltaY: e.deltaY, ctrlKey: true, shiftKey: e.shiftKey, bubbles: true, cancelable: true }));
    }, { passive: false });
    let pinch = null;
    let spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    listen(win, "touchstart", (e) => {
      if (e.touches.length != 2) return;
      e.preventDefault(); // (no browser pinch-zoom)
      select();
      pinch = { spread: spread(e.touches), fontSize: parseFloat(this.elm.style.fontSize) || 1 };
    }, { passive: false });
    listen(win, "touchmove", (e) => {
      if (!pinch || e.touches.length != 2) return;
      e.preventDefault();
      let ratio = 1 + (spread(e.touches) / pinch.spread - 1) / 3; // (damped, as Podium's own pinch)
      this.elm.style.fontSize = Math.max(pinch.fontSize * ratio, 0.1) + "em";
      this.elm.classList.add("pz-set");
      this.constrain();
    }, { passive: false });
    listen(win, ["touchend", "touchcancel"], (e) => { if (e.touches.length < 2) pinch = null; });
    listen(win, "gesturestart", (e) => e.preventDefault()); // (Safari's own pinch-zoom)
  }

  // The menu's center x, y and radius r, and the free space (px) on each side of it
  static menuRoom() {
    let b = _menu_.grip.getBoundingClientRect();
    let x = b.left + b.width / 2, y = b.top + b.height / 2;
    let r = _menu_.collapsed ? b.width / 2 : _menu_.menuHolder.offsetWidth / 2;
    return { x, y, r, left: x - r, right: innerWidth - x - r, top: y - r, bottom: innerHeight - y - r };
  }

  // The side of the menu with the most room for a w x h panel
  static bestSide(room, w, h) {
    let fit = (k) => room[k] / (k == "left" || k == "right" ? w : h);
    return ["left", "right", "top", "bottom"].reduce((best, k) => fit(k) > fit(best) ? k : best);
  }

  hidden() {
    this.follow(false);
    if (this.body.offsetWidth) Object.assign(this.cell.stash, { w: this.body.offsetWidth, h: this.body.offsetHeight }); // (offset*: unaffected by the hide animation's transform)
  }

  // While the Guidebook is showing, it follows the user around the app: a pointerdown on
  // anything with a data-gb (or inside it) shows the Guidebook's section with that id.
  // It only watches (window, capture phase: ahead of any handler that might stop the
  // event); the app sees every event just as it always does.
  follower = null;
  follow(on) {
    if (on == !!this.follower) return;
    if (!on) {
      unlisten(this.follower);
      this.follower = null;
      return;
    }
    this.follower = listen(window, "pointerdown", (e) => {
      let id = e.target.closest?.("[data-gb]")?.dataset.gb;
      if (id && !this.elm.contains(e.target)) this.goTo(id);
    }, { capture: true });
  }

  // Show the Guidebook's section with id @id
  goTo(id) {
    let url = `${GuidePanel.guidebookUrl}#${id}`;
    if (this.guideWin) { // extension: re-target its tab, without bringing it to the front
      if (this.guideWin.closed) this.follow(false);
      else this.guideWin.location.replace(url);
    } else this.iframe.contentWindow.location.replace(url); // (scrolls even if already at #id; no history entry)
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

    let build = 0; // generation of the latest SHAREDBUFFER build
    this.listeners.push(listen(_body_, "SHAREDBUFFER", async (e) => {
      let myBuild = ++build;
      let superseded = () => myBuild != build;
      _shade_.show("Building...");
      let thumbs = [];
      try {
        let score = await _podPb_.getScore();
        for(let pg of score.pgs) {
          if(superseded()) break;
          // null when the buffer's score was disposed (another tab changed it) meanwhile
          let thumb = await pg.getThumbElm(true, superseded);
          if(thumb) thumbs.push(thumb);
        }
      } finally {
        _shade_.hide();
      }
      if(superseded()) return; // a newer build owns the sash
      clearChildren(this.sash);
      if(thumbs.length > 0) {
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
        if (_menu_.activeRing?.activeCell === _menu_.rings.page.cells.paste)
          _menu_.activateCell(null);
        buttons.defs.Undo.disabled = true;
        buttons.defs.Clear.disabled = true;
        this.close();
        if (_menu_.activeRing?.activeCell === this.cell)
          _menu_.activateCell(null);
      }
      buttons.refresh() ;
    }));
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
        <div class="Panel__heading Panel__heading-first">Page Fit</div>
        <div data-tag="fitBook"></div>
        <div data-tag="bookSliders"></div>
        <div class="Panel__heading">Numbers</div>
        <div data-tag="pnBook"></div>
       </div>

      <div data-tag="horizontalFace" class="Panel__body">
        <div class="Panel__heading Panel__heading-first">Page Fit</div>
        <div data-tag="fitHorizontal"></div>
        <div data-tag="fitHorizontalSliders"></div>
        <div class="Panel__heading">Numbers</div>
        <div data-tag="pnHorizontal"></div>
      </div>

      <div data-tag="verticalFace" class="Panel__body">
        <div class="Panel__heading Panel__heading-first">Page Fit</div>
        <div data-tag="fitVertical"></div>
        <div data-tag="fitVerticalSliders"></div>
        <div class="Panel__heading">Numbers</div>
        <div data-tag="pnVertical"></div>
      </div>

      <div data-tag="tableFace" class="Panel__body">
        <div class="Panel__heading Panel__heading-first">Page Fit</div>
        <div data-tag="fitTable"></div>
        <div data-tag="tableFlowSliders"></div>
        <div class="Panel__heading">Numbers</div>
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
    // A layout panel only ever shows its own cell's face. Drop the others now,
    // not at show(): the panel must already have its true height the first time
    // it is measured (openPanel positions it, and Panel.show() sets the point it
    // grows from, by that height). With all four faces in, a newly made panel
    // grew from a point far above its header.
    for (let [key, face] of Object.entries(this.faces)) if (key != cell.key) face.remove();

    let handler = (e, tag, value, props) => {
      if (tag == "fit") this.cell.stash.pz = null; // reset pz-set marker so layout will use fit setting
      if (tag == "pace") return; // no rebuild required
      if (_score_ && this.cell == Layout.activeLayout.cell) {
        if(tag == "pgSnap") // no rebuild, but must update
          Layout.activeLayout.cell.geo.pgSnap = value ;
        else
          Layout.activeLayout.build(); // rebuild
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
        return "Snap: " + value + (value == 1 ? " page" : " pages");
      } else if(tag == "gap") return `Gap: ${value}%`;
      else if(tag == "pace") return `Pace: ${(value/1000).toFixed(2)}... sec/snap` // (panel shows "Pace: 0.35...")
    };

    // defs for scroll/slider groups
    let fitGroupDef = {
      Auto:   { svg: "Fit Auto",   radio: "fit", redo: true},
      None:   { svg: "Fit None",   radio: "fit", redo: true},
      Width:  { svg: "Fit Width",  radio: "fit", redo: true},
      Height: { svg: "Fit Height", radio: "fit", redo: true},
    };

    let bookSlidersGroupDef = {
      pace: { min: 0, max: 1500, step: 10, curve:2, msg: (tag,value) =>
         `Pace: ${(value/1000).toFixed(2)}... sec/flip`}} // (panel shows "Pace: 0.35...")

    let horzSlidersGroupDef = {
      pgShow: { min: 1, max: 8, step: 1, throttle: 750, row:1, col:1, msg: msgCallback},
      // values <= 0  are reinterpreted: see msgCallback
      pgSnap: { min: -4, max: 8,     step: 1,                  row:1, col:2, msg: msgCallback},
      gap:    { min: 0,  max: 100,   step: 0.5, throttle: 750, row:2, col:1, msg: msgCallback},
      pace:   { min: 0,  max: 10000, step: 1,   curve: 2,      row:2, col:2, msg: msgCallback},
    };

    // Horizontal layout uses a 2-column grid: pgShow/pgSnap on row 1, gap/pace on row 2
    let vertSlidersGroupDef = {
      pgShow: { min: 1,  max: 8,     step: 1,   throttle: 750, col: 1, row: 1, msg: msgCallback},
      pgSnap: { min: -4, max: 8,     step: 1,                  col: 2, row: 1, msg: msgCallback},
      gap:    { min: 0,  max: 100,   step: 0.5, throttle: 750, col: 1, row: 2, msg: msgCallback},
      pace:   { min: 0,  max: 10000, step: 1,   curve: 2,      col: 2, row: 2, msg: msgCallback},
    };

    let pnGroupDef = {
      On:  { svg: "Numbers", radio: "pnShow" },
      Off: { svg: "Close",   radio: "pnShow" },
    };

    let tableSlidersGroupDef = {
      pages:         { min: 1,    max: 50,  step: 1, throttle: 750, fullWidth:true, msg: "Pages per row: {value}"},
      horizontalGap: { min: -100, max: 100, step: 1, throttle: 750, row:2, col:1, msg: "Horizontal Gap: {value} %"},
      verticalGap:   { min: -100, max: 100, step: 1, throttle: 750, row:2, col:2, msg: "Vertical Gap: {value} %"},
    };

    // build faces. Note: both BottonGroup and SliderGroup modify their defs element, so we
    // must pass shallow copies...deep copies are not required, as the only non-reference
    // value is msgCallback, and it doesn't need to be unique.

    // (each face's sliders get a rule of their own: they aren't part of Page Fit)
    let ruled = (elm) => (elm.classList.add("Panel__ruled"), elm);

    // build book face
    let stash = _menu_.rings.layout.cells.book.stash;
    tags.fitBook.replaceWith(new ButtonGroup(stash, fitGroupDef, handler).elm);
    tags.bookSliders.replaceWith(ruled(new SliderGroup(stash, bookSlidersGroupDef, handler).elm));
    tags.pnBook.replaceWith(new ButtonGroup(stash, pnGroupDef, handler).elm);

    // build horizontal face
    stash = _menu_.rings.layout.cells.horizontal.stash;
    tags.fitHorizontal.replaceWith(
      new ButtonGroup(stash, fitGroupDef, handler).elm
    );
    tags.fitHorizontalSliders.replaceWith(ruled(new SliderGroup(stash, horzSlidersGroupDef, handler).elm));
    tags.pnHorizontal.replaceWith(
      new ButtonGroup(stash, pnGroupDef, handler).elm
    );

    // build vertical face
    stash = _menu_.rings.layout.cells.vertical.stash;
    tags.fitVertical.replaceWith(
      new ButtonGroup(stash, fitGroupDef, handler).elm
    );
    tags.fitVerticalSliders.replaceWith(ruled(new SliderGroup(stash, vertSlidersGroupDef, handler).elm));
    tags.pnVertical.replaceWith(
      new ButtonGroup(stash, pnGroupDef, handler).elm
    );

    // build table face
    stash = _menu_.rings.layout.cells.table.stash;
    let def = { Width: fitGroupDef.Width, Height: fitGroupDef.Height };
    tags.fitTable.replaceWith(new ButtonGroup(stash, def, handler).elm);
    tags.tableFlowSliders.replaceWith(ruled(new SliderGroup(stash, tableSlidersGroupDef, handler).elm));
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
          <div class="Panel__heading Panel__heading-first">Factory Reset</div>
          <div data-tag="buttons"></div>
        </div>
        <div>
          <div class="Panel__heading">Storage</div>
          <div data-tag="stats" class="DetailsPanel__info" style="text-align:left;width:fit-content;margin:0 auto;"></div>
          <div data-tag="refresh" style="margin-top:0.5em;"></div>
        </div>
      </div>
    `);

    let { buttons, stats, refresh } = dataIndex("tag", content);

    // Factory reset buttons
    buttons.replaceWith(
      new ButtonGroup(
        cell,
        { Menu: { svg: "Menu" }, Recent: { svg: "Score" }, Import: { svg: "Import Page" }, Reload: { svg: "Reload" } },
        async (e, prop, tag) => {
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
            await _podPb_.pgClear();
            toast("Import buffer cleared");
          } else if (tag == "Reload") {
            let url = `${location.origin}${location.pathname}`;
            dialog(`Confirm: restart Podium?<br><span style="font-size:0.8em;color:#333">(${escapeHtml(url)})</span><br>Any unsaved changes will be lost`,
              { Restart: { svg: "Reload" }, Cancel: { svg: "Cancel" } },
              (e, prop, tag, args) => {
                args.close();
                if (tag == "Restart") {
                  let url = new URL(location.href);
                  url.searchParams.set("t", Date.now());
                  location.replace(url.href);
                }
              });
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
    let row = (label, value) => `<div>${label}</div><div>${value}</div>`; // (as the Details panel lists them)

    // localStorage size
    let localStorageSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        localStorageSize += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
      }
    }
    rows.push(row("LocalStorage", this.formatBytes(localStorageSize)));

    // IndexedDB size (estimate via Storage API if available)
    if (navigator.storage && navigator.storage.estimate) {
      try {
        let estimate = await navigator.storage.estimate();
        rows.push(row("IndexedDB", this.formatBytes(estimate.usage || 0)));
        rows.push(row("Quota", this.formatBytes(estimate.quota || 0)));
      } catch (e) {
        rows.push(row("IndexedDB", "unavailable"));
      }
    }

    // Memory usage (Chrome only)
    if (performance.memory) {
      rows.push(row("JS Heap", this.formatBytes(performance.memory.usedJSHeapSize)));
      rows.push(row("Heap Limit", this.formatBytes(performance.memory.jsHeapSizeLimit)));
    }

    statsElm.innerHTML = rows.join("");
  }

  formatBytes(bytes) {
    return DetailsPanel.fileSize(bytes); // (as the Details panel shows sizes: "3.4 MB")
  }
}

class MetronomePanel extends Panel {
  static css = css(
    "MetronomePanel",
    `.Metronome
      { flex-flow:column;
      }
      .Metronome__patterns
      { width: 12em;
        padding-top:1em;
      }
    }
    `
  );

  options = {
    "Metronome":"metronome",
    "One":"one",
    "Two":"two",
    "Three":"three",
    "Four":"four",
    "Five (3+2)":"five",
    "Six (3+3)":"six",
  } ;

  content = helm(
    `<div data-tag="body" class="Panel__body Metronome centerChild"></div>`
  );

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));
    let stash = cell.stash ;
    stash.state = "Play"; // i.e. always show "Play" on launch, metronome will be paused

    let metronome = (this.metronome = new Metronome(this));
    metronome.tempo = stash.tempo;
    metronome.latency = stash.latency;
    metronome.mute = (stash.mute == "Unmute");
    metronome.beatPattern = metronome.beatPatterns.find(p => p.name == stash.pattern);

    let stashed = Object.keys(this.options).find(key => this.options[key] == stash.pattern);
    let patterns = new Select(Object.keys(this.options), stashed, this, () => false) ; // pattern names are never translated
    this.content.append(patterns.elm) ;
    patterns.elm.classList.add("Metronome__patterns") ;
    listen(patterns.toggle, "SELECTED",
       (e) => metronome.setPattern(stash.pattern = this.options[e.detail]));

    this.mediaGroup = new ButtonGroup(
      stash,
      {
        Play: { svg: "Play", redo: true, toggle: "state" },
        Pause: { svg: "Pause", redo: true, toggle: "state" },
        Show: { svg: "ShowTrace", toggle: "trace" },
        Hide: { svg: "HideTrace", toggle: "trace" } ,
        Mute: { svg: "Mute", toggle: "mute" } ,
        Unmute: { svg: "Unmute", toggle: "mute" } ,
      },
      (e, prop, tag) => {
        if(prop == "trace") {
          stash.trace = (tag == "Show") ? "Hide":"Show" ;
          metronome.showTrace(tag == "Show") ;
        }
        else if(prop == "state") {
          stash.state = (tag == "Play") ? "Pause":"Play" ;
          metronome.play(tag == "Play") ;
        }
        else if(prop == "mute") {
          stash.mute = (tag == "Mute") ? "Unmute":"Mute" ;
          metronome.setMute(tag == "Mute") ;
        } 
        this.mediaGroup.refresh() ;
    });
    // the buttons and the sliders are each a section, under a rule as wide as the sliders
    this.mediaGroup.elm.classList.add("Panel__ruled");
    this.mediaGroup.elm.style.width = "14em";
    this.content.append(this.mediaGroup.elm);
    this.mediaGroup.refresh();


    this.adjuster = new Schedule(100, () => metronome.play(true)) ;
    this.tempoGroup = new SliderGroup(
      stash,
      {
        tempo: { min: 1, max: 220, step: 1, msg: `Tempo: {value} ${noTranslate("bpm")}`, value: 60, },
        latency: { min: -300, max: 300, step: 10, msg: "Latency: {value}ms", value: 0},
      },
      (e, prop, value) => {
        // Push only the numeric slider values onto the metronome. The old code
        // did Object.assign(metronome, stash), which also copied the stash's
        // `mute`/`state`/`trace` strings — and a truthy string landing in the
        // boolean metronome.mute silenced it on every slider move (see tock()).
        // (SliderGroup has already written Number(value) into stash[prop].)
        metronome.tempo = stash.tempo;
        metronome.latency = stash.latency;
        if (prop == "tempo" && metronome.bpm) // (not built yet in the moment after the panel opens)
          metronome.bpm.textContent = Math.round(stash.tempo);
        if (stash.state == "Pause") {
          metronome.play(false);
          this.adjuster.run(Math.max(500, metronome.tempo * 1.5)) ; // pause while slider is adjusting, then play
        }
      }
    );
    this.tempoGroup.elm.style.width = "14em";
    this.tempoGroup.elm.classList.add("Panel__ruled");
    this.content.append(this.tempoGroup.elm);
    this.tempoGroup.refresh();

    this.metronome.showTrace(stash.trace != "Show");
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
     <div data-tag="body" style="width:15em;" class="Panel__body">
       <div data-tag="sliders"></div>
       <div class="Panel__heading">Foot Pedal Keys</div>
       <div style="margin: 0 var(--spacing-md)">
         <div style="display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em">
           <div style="min-width: 4em; text-align: left; font-size: 0.9em">Next (\u21e8/\u21e9):</div>
           <div data-tag="forward" style="flex: 1"></div>
         </div>
         <div style="display: flex; align-items: center; gap: 0.5em">
           <div style="min-width: 4em; text-align: left; font-size: 0.9em">Prev (\u21e6/\u21e7):</div>
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
      return `Page: ${pnToHtml(_score_.numbers.pn)} 
      ${noTranslate(`(${~~_score_.numbers.pn} / ${score.pgs.length})`)}`;
    };

    let defs = {
      pn: { min: 1, max: score.pgs.length, value: score.numbers.pn, step: 1,
        msg: formatPn, throttle: 500, fullWidth:true},
      prelim: {min: 0, max: 100,value: _score_.numbers.prelim,step: 1,
        msg: () => `Roman: ${noTranslate(_score_.numbers.prelim)}`,throttle: 500, row:2, col:1 },
      first: { min: 1, max: 1000, value: _score_.numbers.first, step: 1,
        msg: () => `First: ${noTranslate(_score_.numbers.first)}`,throttle: 500, row:2, col:2},
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
      () => {},
    );
    this.forward.replaceWith(this.forwardGroup.elm);

    this.reverseGroup = new ButtonGroup(
      score.numbers,
      { Pages: { svg: "Page", radio: "reverse" },
        Marks: { svg: "Mark", radio: "reverse" },
      },
      () => {},
    );
    this.reverse.replaceWith(this.reverseGroup.elm);

    this.listeners.push(listen(_body_, "NUMBERS", (e) => {
      if (e.detail.sender === this) return;
      this.refresh();
    }));
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
    /* the drawing fits the box, centered (else it's as tall as the box is wide, and cropped) */
    .PencilPanel__preview svg {
       display: block;
       width: 100%;
       height: 100%;
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
        this.sliders.after(helm(`<div class="Panel__heading">Style</div>`));

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
      this.colorPicker = picker;

      if (this.slidersDef) {
        let sliders = new SliderGroup(
          this.cell.stash,
          this.slidersDef,
          (e, tag, value) => {
            this.update();
          }
        );
        sliders.elm.classList.add("Panel__ruled"); // (a section of its own, after Color)
        this.sliders.replaceWith(sliders.elm);
        this.sliders = sliders;
      }

      if (this.buttonsDef) {
        let buttons = new ButtonGroup(
          this.cell.stash,
          this.buttonsDef,
          (e, tag, value) => {
            this.update();
          }
        );
        this.buttons.replaceWith(buttons.elm);
        this.buttons = buttons;
      }

      this.update();
    });
  }

  sync() {
    // The stash has been changed from outside: bring the controls up to date.
    // (Before the controls exist, see the constructor, there's nothing to do:
    // they're built from the stash.)
    let { rgb, alpha } = this.cell.stash;
    this.colorPicker?.set(rgb, alpha);
    this.sliders.refresh?.();
    this.buttons.refresh?.();
    this.settings = undefined; // these aren't changes made in the panel
    this.update();
  }

  update() {
    let { alpha, rgb, style, width } = this.cell.stash;
    let changed = this.changed();
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

    let active = _score_?.getActiveObject(); // (the panel can outlive its score)

    // A change to color, opacity or width immediately applies to the currently
    // selected stroke, but only one drawn with this panel's tool (and never one
    // that has been flattened). Style is how a stroke gets drawn: it can't be
    // changed afterwards.
    if (!changed || active?.podiumType != this.cell.key || active.type != "path" || active.flatten) return;
    let color = fabric.Color.fromHex(rgb);
    color.setAlpha(alpha);
    let center = active.getCenterPoint(); // a width change grows the stroke about its center
    active.set({ stroke: color.toRgba(), strokeWidth: width, dirty: true });
    active.podiumStash = { ...active.podiumStash, alpha, rgb, width };
    active.setPositionByOrigin(center, "center", "center");
    active.setCoords();
    active.canvas.fire("object:modified", { target: active }); // so undo records it
    active.canvas.requestRenderAll();
    _score_.setDirty(true);
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
      throttle: 250, min: 1, max: 40, step: .5, value: 8, fullWidth:true, msg: "Staff Space: {value}px" },
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
    let changed = this.changed();
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
          barPath += `M${x} ${offset}v${staffHeight}h${barWidth}v${-staffHeight}Z`; 
      else
        for (let i = 0, y = 5; i <= bars; i++, y += barSpan)
          barPath += `M${offset} ${y}v${barWidth}h${staffHeight}v${-barWidth}Z`;
    }
    this.preview.append(
      helm(
        `<svg viewBox="${style == "L-R" ? "0 0 100 50" : "0 0 50 100"}">
           <path style="fill:${rgb};opacity:${alpha}" d="${linePath}"/>
           <path style="fill:${rgb};opacity:${alpha}" d="${barPath}"/>
         </svg>`
      )
    );

    let active = _score_?.getActiveObject(); // (the panel can outlive its score)

    // A change to any setting immediately redraws the rastrum, but only the
    // currently selected one (and never one that has been flattened).
    if (!changed || active?.podiumType != this.cell.key || active.flatten) return;
    fabric.RastrumBrush.redraw(active, this.cell.stash);
    active.canvas.fire("object:modified", { target: active }); // so undo records it
    _score_.setDirty(true);
  }
}

class TextPanel extends PencilPanel {

  slidersDef = {
    size: { min: 1, max: 100, step: 1, value: 1, row:1, col:1, msg: "Size: {value} px"},
    height: { min: 1, max: 100, step: 1, value: 1, row:1, col:2, msg: "Line: {value} px"},
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
    let fontLabel = helm(`<div class="Panel__heading">Font</div>`);
    this.picker.after(fontLabel);
    // font names are never translated, and each is shown in its own typeface
    let select = new Select(this.fonts, cell.stash.font, this, () => false, (font) => fontMap[font]) ;
    this.fontSelect = select;
    fontLabel.after(select.elm) ;
    this.preview.append(this.text);
    this.listeners.push(listen(select.toggle, "SELECTED", (e) => this.update(e.detail)));
    this.preview.append(this.text);
    this.fonts.value = cell.stash.font ;
    this.update();
  }

  sync() {
    this.fontSelect?.set(this.cell.stash.font);
    super.sync();
  }

  update(fontName) {
    // @fontName is given only when a font has been selected: the sliders, the
    // color picker, show() and sync() all call update() without it.
    if (fontName) this.cell.stash.font = fontName;
    let { font, size, height, rgb, alpha } = this.cell.stash;
    let changed = this.changed();
    this.text.style.fontSize = size / _pxPerEm_ + "em";
    this.text.style.lineHeight = height / _pxPerEm_ + "em";
    this.text.style.color = rgb + Math.round(alpha * 255).toString(16).padStart(2, "0");
    Object.assign(this.preview.style, fontMap[font]);
    let active = _score_?.getActiveObject(); // (the panel can outlive its score)
    // A change to any setting immediately applies to the currently selected
    // text (and never to one that has been flattened).
    if (!changed || active?.type != "textbox" || active.flatten) return;
    let color = fabric.Color.fromHex(rgb);
    color.setAlpha(alpha);
    active.fill = color.toRgba();
    active.fontSize = size - 1;
    active.lineHeight = height / size;
    Object.assign(active, fontMap[font]);
    active.podiumStash = { alpha, font, size, height, rgb };
    active.initDimensions();
    active.setCoords();
    active.canvas.requestRenderAll();
    delay(1, () => {
      // work around as fabricjs bug...fill doesn't change
      // unless/until fontsize changes, (or some such breakage)
      active.fontSize = size;
      active.initDimensions();
      active.setCoords();
      active.canvas?.fire("object:modified", { target: active }); // so undo records it
      active.canvas?.requestRenderAll();
    });
    _score_.setDirty(true);
  }

}

class ReviewPanel extends Panel {
  constructor(cell) {
    super(cell);
    this.review = new Review(this);
    this.body.replaceWith(this.review.elm);
    delay(2, () => this.review.build());
  }

  close() {
    // Mark closed immediately, before the panel's delayed destruction.
    this.review.closed = true;
    this.review.stopAnimations();
    super.close();
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
     .Pz__control {
       /* Explicit size: an inline <svg viewBox=...> with no width/height falls
          back to the 300x150 replaced-element default on WebKit/iOS (Blink and
          Gecko shrink it to the grid cell), which blew the controls up ~10x.
          Pin it to the 1.6em grid cell. */
       width: 1.6em;
       height: 1.6em;
       fill: none;
       stroke: #444;
       stroke-width: 8;
       stroke-linecap: round;
       stroke-linejoin: round;
     }
     [data-theme="Dark"] .Pz__control {
       stroke: #888 ;
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
        <div class="Pz Surface__outline">

          <!-- translate up, right, down, left: pos 2,14,22,10-->
          <svg class="Pz__control" style="grid-row:1;grid-column:3;" viewBox="0 0 100 100"><path d="M10 60L50 10L90 60Q50 40 10 60"/></svg>
          <svg class="Pz__control" style="grid-row:3;grid-column:5;" viewBox="0 0 100 100"><path d="M40 10L90 50L40 90Q 60 40 40 10"/></svg>
          <svg class="Pz__control" style="grid-row:5;grid-column:3;" viewBox="0 0 100 100"><path d="M10 40L50 90L90 40Q 50 60 10 40"/></svg> 
          <svg class="Pz__control" style="grid-row:3;grid-column:1;" viewBox="0 0 100 100"><path d="M60 10L10 50L60 90Q 40 50 60 10"/></svg>

          <!-- rotate conterclockwise, clockwise: pos 6,8-->
          <svg class="Pz__control" style="grid-row:2;grid-column:2;"data-tag="ccw"  viewBox="0 0 100 100">
            <path d="M50 22 A28 28 0 1 1 30.2 70 M50 14 L50 30 L34 22 Z"/></svg>
          <svg class="Pz__control" style="grid-row:2;grid-column:4;" data-tag="cw"  viewBox="0 0 100 100">
            <path  d="M50 22 A28 28 0 1 1 30.2 70 M50 14 L50 30 L34 22 Z" transform="translate(100,0) scale(-1, 1)"/></svg>


          <!-- edit prev, next: pos 16,18-->
          <svg class="Pz__control" style="grid-row:4;grid-column:2;", data-tag="left" viewBox="0 0 100 100">
            <path d="M25,18A8,8 0 1,0 25,17.9M32,26L58,60M40,33L25,48L8,48M40,33L55,20L72,33M58,60L38,75L50,94M58,60L76,67L92,64"/></svg>
          <svg class="Pz__control" style="grid-row:4;grid-column:4;", data-tag="right" viewBox="0 0 100 100">
            <path d="M75,18A8,8 0 1,1 75,17.9M68,26L42,60M60,33L75,48L92,48M60,33L45,20L28,33M42,60L62,75L50,94M42,60L24,67L8,64"/></svg>


          <!-- scale down, up: pos 11,13 -->
          <svg class="Pz__control" style="overflow:visible;grid-row:3;grid-column:4;" viewBox="0 0 100 100"><path d="M10 20L120 50L10 80"/></svg>
          <svg class="Pz__control" style="overflow:visible;grid-row:3;grid-column:2;" viewBox="0 0 100 100"><path d="M90 20L-20 50L90 80"/></svg>

          <!-- active object, pos 12 -->
          ${iconSvg("Void", {class:"Pz__control", style:"grid-row:3;grid-column:3;pointer-events:none;opacity:0.5;"})}

          <!-- cut, pos 4 -->
          ${iconSvg("Cut", {class:"Pz__control", style:"transform:translateY(-3px);grid-row:1;grid-column:5;fill:currentColor;stroke:none;", tag:"cutBtn"})}
        </div>
    `);

  slots = [2,4,6,8,10,11,12,13,14,16,18,22] ;
  targets = [] ;

  constructor(panel) {
    super(panel, ScreenPanel);
    Object.assign(this, dataIndex("tag", this.grid)) ;
    this.surface.append(this.grid) ;
    panel.body.style.minWidth = panel.body.style.padding = "unset"; // defeat default body styles
    this.surface.style.width = this.surface.style.height = "10em" ;
    this.grid.style.width = this.grid.style.height = "10em" ;
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
      e.taken = true;
      _menu_.busy = true ;
      // add active marker. Note: can't add style to <path.../>, must be parent <svg.../>
      let target = e.target.tagName == "path" ? e.target.parentElement : e.target;
      if(this.getTargets()) {
        target.classList.add("Pz__control-active") ;
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);
        
        this.opStartTime = performance.now();
        this.opStartValues = this.targets.map(item => item[1]);
  
        this.doStep(pos);
        let loopSpeed = (pos == 16 || pos == 18) ? 350 : 50 ; // back/forward autrepeat slowly
        this.repeater.run(250, () => {
          let loop = () => {
            this.doStep(pos);
            this.repeater.run(loopSpeed, loop);
          };
          loop();
        });
      }
      listen(this.grid, "pointerup", () => {
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
        case undefined: return iconPaths["Void"];
        case "pencil": return iconPaths["Pencil"] ;
        case "pen": return iconPaths["Pen"] ;
        case "rastrum": return iconPaths["Rastrum"] ;
        case "symbols": return iconPaths["Symbols"] ;
        case "textbox": return iconPaths["Text"] ;
        case "text": return iconPaths["Symbols"] ;
        default: return iconPaths["Edit"] ; // assume activeSelection
      }
    }
    let tmp = helm(`<svg viewBox="0 0 24 24" width="1.6em" height="1.6em"
      style="grid-column:3;grid-row:3;stroke:none;fill:currentColor;">
      ${getIconPath()}</svg>`) ;
    this.iconSvg.replaceWith(tmp) ;
    this.iconSvg = tmp ;
  }

  doStep(pos) {
    let obj = EditPanel.pzrTarget;
    if(!obj) return;
    let elapsed = performance.now() - this.opStartTime;

    if (pos == 4) {
      this.repeater.cancel();
      _menu_.cutCopyObject(obj, obj.canvas, true);
      return;
    }

    // Warning: unorthodox coding pattern follows: nested switch statements with intentional fallthrough.
    // Each level tests pos for the cases that diverge at that level; unmatched
    // cases fall into the default, which sets up shared state and dispatches
    // further. Each value of pos is tested at most once.            

    // prev/next obj:
    let step = 1;
    switch(pos) {
      case 16: step = -1;
      case 18: 
        let objs = obj.canvas.getObjects();
        let knt = objs.length;
        let i = (objs.indexOf(obj) + knt + step) % knt;
        obj.canvas.setActiveObject(objs[i]) ; 
        break;

    default: { // rotate:
      // Remaining pos's perform progressive acceleration
      let a = Object.assign({}, 
        (elapsed > 2000) ? { rotate:20.0, scale:0.10, translate:50} :
        (elapsed > 1200) ? { rotate: 5.0, scale:0.05, translate:20} :
        (elapsed >  600) ? { rotate: 1.0, scale:0.02, translate: 5} :
                           { rotate: 0.2, scale:0.01, translate: 1});
      let center = obj.getCenterPoint();
      let p = { originX: "center", originY: "center", left: center.x, top: center.y };
      let moved = false;
      switch(pos) {
        case 6: a.rotate = -a.rotate;
        case 8: p.angle = (obj.angle + a.rotate) % 360;
        break ;

    default: { // scale:
      let scale = 1 - a.scale;
      switch(pos) {
        case 11: scale = 1 + a.scale;
        case 13: p.scaleX = Math.max(0.01, obj.scaleX * scale);
                 p.scaleY = Math.max(0.01, obj.scaleY * scale);
        break ;

    default: { // translate:
      let dx = 0, dy = 0 ;
      switch(pos) {
        case 2:  dy = -a.translate; break; // up
        case 10: dx = -a.translate; break; // left
        case 14: dx =  a.translate; break; // right
        case 22: dy =  a.translate; break; // down
      }
      let minTrans = 1 / (obj.canvas.getZoom() * window.devicePixelRatio); // theoretical minimum translation factor
      p.left = center.x + dx * minTrans;
      p.top  = center.y + dy * minTrans;
      moved = true;

    }}}} /* close nested default / switch blocks */
    obj.set(p);
    if (moved) obj.clampToPage(20); // partly off the page, but never lost from it: see canvas.js
    }}
    obj.canvas?.requestRenderAll();
   _menu_.magnifier?.panel?.updateMagnifier();
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

class Pz extends Pzr {

  slots = [2,10,11,13,14,16,18,22] ;

  constructor(panel) {
    super(panel, ScreenPanel);
    // modify the grid, replacing the central icon and removing clockwise and counter-clockwise svg's
    this.cw.remove() ;
    this.ccw.remove() ;
    this.cutBtn.remove() ;
    this.update();
  }

  update() {
    let getIconPath = () => {
      let tag = ScreenPanel.pzTarget?.dataset?.tag ;
      switch(tag) {
        case "BookLayout":
        case "ScrollLayout":
        case "TableLayout": return iconPaths["Layout"] ;
        case "Menu": return iconPaths["Menu"] ;
        case "Body": return iconPaths["Void"] ;
        default: {
          let key = tag[0].toLowerCase() + tag.slice(1).replace("Panel", "");
          return _panels_[key]?.cell?.svgPath ?? null ;
        }
      }
    }
    let tmp = helm(`<svg viewBox="0 0 24 24" width="1.6em" height="1.6em"
      style="grid-column:3;grid-row:3;pointer-events:none;stroke:none;fill:currentColor;">
      ${getIconPath()}</svg>`) ;
    this.iconSvg.replaceWith(tmp) ;
    this.iconSvg = tmp ;
  }


  doStep(pos) {
    let elapsed = performance.now() - this.opStartTime;
    let targets = this.targets;


    // prev/next
    let step = 1 ;
    switch(pos) {
      case(16): step = -1 ;
      case(18):
        let target = targets.find(([elm, size, box]) => elm === ScreenPanel.pzTarget);
        let idx = targets.indexOf(target) + step;
        if(idx == -2) ScreenPanel.pzTarget = targets[targets.length - 1][0] ;
        else if(idx == -1 || idx == targets.length) ScreenPanel.pzTarget = _body_ ;
        else ScreenPanel.pzTarget = targets[idx][0]; 
        this.update() ;
        break ;

    default: { // scale
      let a = Object.assign({}, 
      (elapsed > 2000) ? { scale:0.10, translate:50} :
      (elapsed > 1200) ? { scale:0.05, translate:20} :
      (elapsed >  600) ? { scale:0.02, translate: 5} :
                         { scale:0.01, translate: 1});
    let scale = 1 - a.scale ;
    if(ScreenPanel.pzTarget != _body_) 
      targets = [targets.find(([pzElm, size, box]) => pzElm === ScreenPanel.pzTarget)] ;
    switch(pos) { // scale
      case(11): scale = 1 + a.scale ;
      case(13): targets.forEach((item) => { 
        let [target] = item;
        let currentSize = parseFloat(target.style.fontSize) || 1;
        let newSize = Math.max(0.1, currentSize * scale);
        target.style.fontSize = newSize + "em";
        item[1] = newSize; 
      });
      break ;

    default: { // translate
      if(ScreenPanel.pzTarget == _body_) return ; // disallow on body
      let dx = 0, dy = 0 ;
    switch(pos) {
      case 2:  dy = -a.translate; break; // up
      case 10: dx = -a.translate; break; // left
      case 14: dx =  a.translate; break; // right
      case 22: dy =  a.translate; break; // down
    }
    for (let [target, size, box] of targets) {
      target.style.top = target.offsetTop + dy + "px";
      target.style.left = target.offsetLeft + dx + "px";
      target.owner?.constrain();
    } }
  }}}} /* bracket hell, sigh: that's what happens with this coding pattern! */


  getTargets() {
    let pzTargets = [...document.getElementsByClassName("pz")].filter((elm) =>
       elm.isConnected && elm.style.visibility != "hidden") ;
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

  constructor(cell) {
    super(cell);
    this.body.style.minWidth = "unset" ;
    this.body.style.padding = "unset" ;
  }
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
    .Keyboard__rows {
      display:flex;
      flex-direction:column;
      gap:0.25em;
      padding:0.25em;
      touch-action:none;
      user-select:none;
      width:20em;
      -webkit-user-select:none;
     }
    .Keyboard__row {
      display:flex;
      gap:0.25em;
    }
    .Keyboard__key
    { flex:1 1 0;
      border-radius:100vmax;
      border:1px solid #444;
      background:#fffa;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:.8em;
      font-family:system-ui,sans-serif;
    }
    .Keyboard__key.mod {
      background:#aaaa;
    }
    .Keyboard__key.pressed {
      background:#8888;
    }
    [data-theme="Dark"] .Keyboard__key {
      background:#444a;
      border-color:#aaa;
    }
    [data-theme="Dark"] .Keyboard__key.mod {
      background:#555a;
    }
    [data-theme="Dark"] .Keyboard__key.pressed {
      background:#999a;
    }
  `) ;

  mods = new Set(['⇧','⌫','↵','⋯','Aa','←','↑','↓','→','Home','End']);
  spaceBar = '       ';

  layers = {
    lower:  [['`','1','2','3','4','5','6','7','8','9','0','-','='],
              ['q','w','e','r','t','y','u','i','o','p','[',']','\\'],
              ['a','s','d','f','g','h','j','k','l',';',"'"],
              ['⇧','z','x','c','v','b','n','m',',','.','/','⌫'],
              ['⋯',this.spaceBar,'↵']],
    upper:   [['~','!','@','#','$','%','^','&','*','(',')','_','+'],
              ['Q','W','E','R','T','Y','U','I','O','P','{','}','|'],
              ['A','S','D','F','G','H','J','K','L',':','"'],
              ['⇧','Z','X','C','V','B','N','M','<','>','?','⌫'],
              ['⋯',this.spaceBar,'↵']],
    sym:     [['á','é','í','ó','ú','à','è','ù','â','ê','î'],
              ['ô','û','ä','ö','↑','ñ','ç','ß','Home'],
              ['ã','õ','ü','←','↓','→','å','ø','End'],
              ['æ','œ','ð','¿','¡','«','»','⌫'],
              ['Aa',this.spaceBar,'↵']],
  };

  keyWidths = {'⇧':1.5,'⌫':1.5,'↵':1.5,'⋯':1.5,'Aa':1.5,'↑':1.5,'↓':1.5,'←':1.5,'→':1.5,'Home':2,'End':2.2,[this.spaceBar]:3};
  navKeys = {'↑':'ArrowUp','↓':'ArrowDown','←':'ArrowLeft','→':'ArrowRight','Home':'Home','End':'End'};
  repeater = new Schedule(); // implement auto-repeat on long press

  content = helm(`<div class="Surface__outline"><div data-tag="plate" class="Keyboard__rows" translate="no"></div></div>`) ;

  constructor(panel) {
    super(panel, ScreenPanel) ;
    Object.assign(this, dataIndex("tag", this.content));
    this.layer = 'lower';
    this.surface.style.width = this.surface.style.height = "unset" ;
    this.surface.append(this.content) ;
    this.panel.listeners.push(
      listen(this.surface, "pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        let key = e.target.closest('.Keyboard__key');
        if (!key) return;
        e.frozen = true ; // disallow dragging if a key is pressed
        // add a sentinel so that touch users will see the chosen key.
        // well use it's dom-connectedness to terminate a repeat
        let sentinel = key.cloneNode(true) ;
        let style = getComputedStyle(e.target);
        Object.assign(sentinel.style, {
          transform: "scale(1.5)",
          width: style.width,
          height: style.height,
          left: e.clientX + "px",
          top: e.clientY - 50 + "px",
          zIndex:_zTop_ + 1,
          fontSize: style.fontSize,
          position: "absolute",
          filter: "invert(1)",
        });
        _body_.append(sentinel);
        key.classList.add('pressed');

        this.handle(key.dataset.label, e.clientX, e.clientY);
        if (!['⇧','⋯','Aa'].includes(key.dataset.label)) {
          let repeat = () => {
            if (!sentinel.isConnected) return;
            this.handle(key.dataset.label, e.clientX, e.clientY);
            this.repeater.run(80);
          };
          this.repeater.run(500, repeat);
        }

        listen(document, "pointerup", () => { // must be on document, not surface
           sentinel.remove();
           key.classList.remove('pressed');
        }, {once:true});

      })
    );
    this.build();
  }

  build() {
    let esc = (s) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    let html = '';
    this.layers[this.layer].forEach(row => {
      html += '<div class="Keyboard__row">';
      row.forEach(label => {
        let grow = this.keyWidths[label] || 1;
        let mod  = this.mods.has(label) ? ' mod' : '';
        html += `<div class="Keyboard__key${mod}" data-label="${esc(label)}" style="flex:${grow} 1 0">${esc(label.trim())}</div>`;
      });
      html += '</div>';
    });
    this.plate.innerHTML = html;
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
        if (isText && elm.tagName == 'TEXTAREA') {
          let s = elm.selectionStart, e = elm.selectionEnd;
          elm.value = elm.value.slice(0,s) + '\n' + elm.value.slice(e);
          elm.selectionStart = elm.selectionEnd = s + 1;
          elm.dispatchEvent(new InputEvent('input', {inputType:'insertLineBreak', bubbles:true}));
        }
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
    this.panel.translate = false ; // the keyboard panel is never translated
    this.surface = new Keyboard(this);
    this.kbFocusListener = null;
  }

  suppressBrowserKb(elm) {
    if(!elm?.matches('input,textarea')) return;
    if(elm.dataset.kbSaved != undefined) return;
    elm.dataset.kbSaved = elm.getAttribute('inputmode') ?? '';
    elm.setAttribute('inputmode', 'none');
  }

  show() {
    document.querySelectorAll('input,textarea').forEach(elm => this.suppressBrowserKb(elm));
    this.kbFocusListener = listen(document, 'focus', (e) => this.suppressBrowserKb(e.target), {capture:true});
    return super.show();
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
    ScreenPanel.pzTarget = target || _body_;
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
      height: calc(4 * 4em + 3 * .08em + .5em); /* four whole rows (symbol 2em and gap .04em, at the grid's 2em), plus the padding */
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
      gap: .04em; /* (em, not px: a px gap doesn't grow with the panel, so the frame fell short of it) */
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
   .SymbolsPanel__credit {
     font-size: .7em;
     letter-spacing: .05em;
   }
   .SymbolsPanel__symbol-active {
     background-color: color-mix(in srgb, var(--accent) 15%, #fff);
     box-shadow: inset 0 0 0 .08em var(--accent);
   }
   `);

  content = helm(`
     <div data-tag="body" class="Panel__body">
       <div class="SymbolsPanel__frame" data-tag="gridFrame">
         <div class="SymbolsPanel__grid" data-tag="grid"></div>
       </div>
      <div class="Panel__heading">Group</div>
      <div data-tag="select"></div>
      <div data-tag="picker"></div>
      <div data-tag="staffSpace"></div>
      <div style="margin: var(--spacing-md); height: 2.5em; display: flex; align-items: center; justify-content: center;"><a class="SymbolsPanel__credit" href="https://www.w3.org/2021/03/smufl14/" rel="noopener noreferrer">SMuFL</a></div>
     </div>
   `);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));
    let stash = cell.stash;

    // Create a Select (similar to an html <select>)
    // Only Podium's own groups are translatable: the rest are SMuFL spec section titles,
    // which are English-only and stay that way so they can be looked up in the spec.
    let select = new Select(Object.keys(smuflTable), stash.group, this, (group) => group == "Recent" || group == "Basic") ;
    this.select.replaceWith(select.elm) ;
    this.select = select ;

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

    let l1 = listen(this.gridFrame, "pointerdown", (e) => {
      e.taken = true; 
      this.gridFrame.setPointerCapture(e.pointerId);
      let startY = e.clientY;
      let startScrollTop = this.gridFrame.scrollTop;
      let moved = false;

      let mv = listen(this.gridFrame, "pointermove", (emv) => {
        let dy = emv.clientY - startY;
        if (!moved && Math.abs(dy) > 4) moved = true;
        if (moved) this.gridFrame.scrollTop = startScrollTop - dy;
      });

      let l2 = listen(this.gridFrame, "pointerup", (eup) => {
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
    this.colorPicker = picker;

    let staffSpace = new SliderGroup(
      stash,  { size: { min: 1, max: 40, step: .5, value: 8, msg: "Staff Space: {value}px" }},
      (e, tag, value) => {
        stash[tag] = value;
        this.update();
    });

    staffSpace.elm.classList.add("Panel__ruled"); // (a section of its own, after Color)
    this.staffSpace.replaceWith(staffSpace.elm);
    this.staffSpace = staffSpace;
    this.update();
  }

  sync() {
    // The stash has been changed from outside: bring the controls up to date.
    let { rgb, alpha } = this.cell.stash;
    this.colorPicker.set(rgb, alpha);
    this.staffSpace.refresh();
    this.settings = undefined; // these aren't changes made in the panel
    this.update();
  }

  update() {
    let {alpha = 1, rgb = '#000000', size = 8 } = this.cell.stash;
    // (which symbol is chosen is not one of these: it's what gets inserted
    // next, and choosing one doesn't alter a symbol already on the page)
    let changed = this.changed(["alpha", "rgb", "size"]);
    let activeCell = this.grid.querySelector('.SymbolsPanel__symbol-active');
    if (activeCell) {
      activeCell.style.transform = `scale(${size / 8})`;
      activeCell.style.color = rgb;
      activeCell.style.opacity = parseFloat(alpha);
    }
    let active = _score_?.getActiveObject(); // (the panel can outlive its score)
    // A change to color, opacity or size immediately applies to the currently
    // selected symbol (and never to one that has been flattened).
    if (!changed || active?.podiumType != "symbols" || active.flatten) return;
    let color = fabric.Color.fromHex(rgb);
    color.setAlpha(parseFloat(alpha));
    // Bravura Text has five staff spaces per em, matching symbol insertion.
    active.set({ fill: color.toRgba(), fontSize: size * 5 });
    active.podiumStash = { alpha, rgb, size };
    active.setCoords();
    active.canvas.fire("object:modified", { target: active }); // so undo records it
    active.canvas.requestRenderAll();
    _score_.setDirty(true);
  }

  show() {
    super.show();
    this.select.toggle.focus();
  }

}

class PianoPanel extends Panel {
  constructor(cell) {
    super(cell);
    this.panel.style.maxWidth = "none";
    this.panel.style.maxHeight = "none";
    this.piano = new Piano(this, cell);
    this.body.replaceWith(this.piano.elm);
    this.panel.style.width = "95vw";
  }

  close() {
    this.piano.closed = true;
    this.piano.yin?.release();
    super.close();
  }

  destructor() {
    super.destructor();
    this.piano.destructor();
  }

  show() {
    super.show();
    this.piano.show();
    // Never reveal the options view while it is parked offscreen. A fling-hide
    // animates for 500ms and then parks the element at top:-9999px; the saved
    // visibility can be a stale "visible" captured mid-hide. Restoring it onto
    // the still-parked element strands it offscreen (the monkey's offscreen
    // invariant catches this). -9999px is exclusively the park sentinel, so an
    // element sitting there must stay hidden until something repositions it.
    let o = this.piano.options;
    o.style.visibility = o.style.top == "-9999px" ? "hidden" : this.optionsVisibility ;
    return this;
  }

  hidden() {
    this.optionsVisibility = this.piano.options.style.visibility ;
    this.piano.options.style.visibility = "hidden" ;
  }

  constrain() {
    super.constrain();
    if (this.piano?.keyboard.style.left) this.piano.placeKeyboard();
  }
}

let printFrame = null; // (see printInFrame)
let printInFrame = (url) => new Promise((resolve) => {
  // Print the pdf at @url from a hidden frame (only one: the last printed is kept until the next, since
  // there's no telling when the browser's done printing it). @return a promise of true iff it printed.
  if (printFrame) URL.revokeObjectURL(printFrame.src);
  printFrame?.remove();
  // (not display:none, which would keep the browser's pdf viewer from loading)
  printFrame = helm(`<iframe style="position:fixed;width:0;height:0;border:0;visibility:hidden"></iframe>`);
  let frame = printFrame, done = false;
  let fail = () => {
    if (done) return;
    done = true;
    frame.remove();
    if (printFrame === frame) printFrame = null;
    resolve(false);
  };
  listen(frame, "load", () => delayMs(500, () => {
    if (done) return;
    done = true; // (before print(), which may block until the browser's print dialog closes)
    try { frame.contentWindow.print(); resolve(true); }
    catch { done = false; fail(); }
  }), { once: true });
  delayMs(10000, fail); // (a browser that can't show a pdf in a frame may never load it)
  frame.src = url;
  _body_.append(frame);
});

class PrintPanel extends Panel {
  // Print the score, or a range of its pages, with or without its annotations (Ink): the range, then the
  // settings, then, below a line, the actions, as in Merge's dialog (see layout.js). The range is all of
  // the score's pages, at first: the panel's closed when another score is opened (see Score.activate).
  static css = css(
    "PrintPanel",
    `.PrintPanel { width: 18em; }
     .PrintPanel .dialog__sliders { width: 100%; }
     .PrintPanel__name {
       display: block;
       overflow: hidden;
       text-overflow: ellipsis;
       white-space: nowrap;
       padding-right: .15em;
       font-weight: 600;
     }
     .PrintPanel__note { font-size: var(--font-size-sm); color: var(--label-color); }
    `
  );

  static big = 100; // (pages: a larger range may fail to print on a device with little memory)

  constructor(cell) {
    super(cell);
    let stash = cell.stash, props = this.props = { first: 1, last: _score_.pgs.length };
    // A copy protected score (that permits printing: see Score.activate) is sent to the browser to print as is,
    // the original pdf, since PODIUM can't rebuild it with a page range or Ink
    this.asIs = _score_.encrypted;
    let content = helm(`<div class="Panel__body PrintPanel"><i translate="no" class="PrintPanel__name">${escapeHtml(_score_.name)}</i>` +
      (this.asIs ? `<div class="PrintPanel__note">Copy protected: prints the original, unedited file</div>`
        : `<div class="dialog__sliders"><div></div><div></div></div>
           <div class="PrintPanel__note">Large range: if printing fails,<br>print it in smaller sections</div>`) + `</div>`);
    this.body.replaceWith(content);
    let actions = new ButtonGroup({}, { Print: { svg: "Print" }, Cancel: { svg: "Cancel" } },
      (e, prop, tag) => tag == "Print" ? this.print() : this.close()).elm;
    if (this.asIs) return void content.append(actions);

    // Ink prints the annotations too
    let settings = new ButtonGroup({ Ink: stash.ink }, { Ink: { svg: "Ink", onOff: true } },
      (e, prop, tag, args) => stash.ink = args.Ink).elm;
    settings.classList.add("dialog__settings");
    content.append(settings, actions);

    let [row, warn] = [...content.children].slice(1), [first, last] = row.children;
    let msgCallback = (tag, value) => {
      // don't allow first to be > last, or last to be < first
      if(tag == "first") {
        if(value > props.last) value = props.last;
        props.first = value;
        return "From: " + pnToHtml(value);
      } else if(tag == "last") {
        if(value < props.first) value = props.first;
        props.last = value;
        return "To: " + pnToHtml(value);
      }
    };
    // (the warning shows while the range is large)
    let warnBig = () => warn.hidden = props.last - props.first + 1 <= PrintPanel.big;
    // Can't combine these two sliders because of the way msgCallback works, sigh. (So they're side by side in a row.)
    let sliders = [[first, "first", 1], [last, "last", props.last]].map(([elm, tag, value]) => {
      let group = new SliderGroup(props, { [tag]: {min:1, max:props.last, step:1, value, msg: msgCallback} }, warnBig);
      elm.replaceWith(group.elm);
      return group;
    });
    warnBig();
    // Pages added or cut while the panel's open: the sliders' range is the score's (and their numbers, its numbering)
    this.listeners.push(listen(_body_, "NUMBERS", () => {
      let pgKnt = _score_?.pgs.length;
      if (!pgKnt) return;
      if (props.last == sliders[1].defs.last.max) props.last = pgKnt; // (all of it stays all of it)
      sliders.forEach((group) => Object.values(group.defs)[0].max = pgKnt);
      props.last = Math.min(pgKnt, props.last);
      props.first = Math.min(props.last, props.first);
      sliders.forEach((group) => group.refresh());
      warnBig();
    }));
  }

  async print() {
    let stash = this.cell.stash, props = this.props, asIs = this.asIs;
    this.close();
    let printWin = null;
    let dataUrl = null;
    let closeWatcher = null;
    let releaseUrl = () => {
      if(dataUrl) URL.revokeObjectURL(dataUrl);
      dataUrl = null;
      clearInterval(closeWatcher);
      closeWatcher = null;
    };
    // The PDF tab outlives this panel. Keep its URL until that tab closes.
    let watchPrintWindow = () => {
      closeWatcher = setInterval(() => {
        if(printWin.closed) releaseUrl();
      }, 1000);
    };
    try {
      _shade_.show("Preparing to print");
      let pns = [];
      for (let i = props.first; i <= Math.min(props.last, _score_.pgs.length); i++)
        pns.push(i);

      let data = asIs ? await _score_.mozDoc.getData() : await _score_.toPdf(stash.ink ? "pdf" : "none", false, pns);
      if (!data || data.byteLength == 0) throw new Error("PDF data empty");

      dataUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));

      // The pdf is printed from a hidden frame in this tab, s.t. the browser's print dialog comes straight up,
      // with no tab to go through (e.g. one a pdf extension takes over, ignoring print()), and for a copy
      // protected score, print() on its tab, as below, seemed to hang PODIUM (in Chrome). Failing that (e.g. a
      // browser that can't show a pdf in a frame), or on iOS (where it prints the tab) or Android (where Chrome
      // opens the frame's pdf in a tab of its own), it's a tab after all.
      let iOS = /AppleWebKit/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
      let android = /Android/.test(navigator.userAgent);
      if (!iOS && !android && await printInFrame(dataUrl)) return void (dataUrl = null); // (the frame releases it)

      // Try to open the print window automatically. This usually works on 
      // desktop if the PDF generation was fast enough. (Not on a phone or tablet, where the tab's
      // printed by hand: the dialog below says how, before the user leaves for it)
      if (!iOS && !android) try {
        printWin = window.open(dataUrl, "_blank");
      } catch (e) {
        console.warn("window.open blocked/failed:", e);
      }

      if (!printWin || printWin.closed || typeof printWin.closed == 'undefined') {
        // Popup blocked (especially possible on iOS Safari after await), or a phone or tablet.
        // Show a dialog to provide a fresh user gesture.
        _shade_.hide();
        printWin = null;
        let readyDialog = dialog("Your PDF is ready to print." + (iOS || android ? "<br>Tap Open, then use your device's print controls." : ""), {
          Open: { svg: "Ink" }, Cancel: { svg: "Cancel" },
        }, (e, prop, tag, args) => {
          if(tag == "Cancel") {
            releaseUrl();
            args.close();
            return;
          }
          try { printWin = window.open(dataUrl, "_blank"); }
          catch(error) { console.warn("window.open blocked/failed:", error); }
          if(!printWin || printWin.closed || typeof printWin.closed == "undefined") {
            printWin = null;
            toast("Please allow popups to open the PDF.");
            return;
          }
          watchPrintWindow();
          args.close();
        });
        listen(readyDialog, "close", () => {
          if(!printWin) releaseUrl();
          readyDialog.remove();
        }, { once: true });
      } else {
        // Success! PDF opened in new tab, attempt to trigger print.
        // Note: iOS Safari ignores window.print(); users must print via the share button.
        watchPrintWindow();
        // (but not a copy protected one, printed from its tab: in Chrome, print() on it seemed to hang PODIUM's tab too)
        if (!asIs) delayMs(1000, () => { if (!printWin.closed) printWin.print(); });
      }
    }
    catch (error) {
      releaseUrl();
      printWin?.close();
      if (window.cancelPdf) toast("Print cancelled");
      else {
        console.error("Print failed:", error);
        dialog(`<em>Print Failed</em><br><br><strong>${escapeHtml(error.message)}</strong>`);
      }
    }
    finally {
      _shade_.onCancel = null;
      _shade_.hide();
    }
  }
}

class StopwatchPanel extends Panel {
  static css = css(
    "StopwatchPanel",
    `.Stopwatch__splits {
      width: 100%;
      overflow-y: auto; /* (the newest split is at the top; scroll for the oldest) */
      resize: none;
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
       <div class="Panel__heading">Splits</div>
       <textarea data-tag="splits" class="Stopwatch__splits" rows="4"></textarea>
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
    this.optionsGroup.elm.classList.add("Panel__ruled"); // (under the stopwatch face)
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
    let zoom = window._menu_.magnifier.zoom;
    let destW = 300, destH = 300;
    let destCSSW = this.magCanvas.clientWidth || 450;
    let destCSSH = this.magCanvas.clientHeight || 450;

    let ctx = this.magCanvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, destW, destH);

    // Draw from mozCanvas (PDF rendering) first as background
    if (pg.mozCanvas) {
      let srcW = pg.mozCanvas.width;
      let srcH = pg.mozCanvas.height;
      let srcX = fracX * srcW;
      let srcY = fracY * srcH;
      let sourceW = (destCSSW / zoom) * (srcW / pg.width);
      let sourceH = (destCSSH / zoom) * (srcH / pg.height);
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
    let fabSourceW = (destCSSW / zoom) * (fabW / pg.width);
    let fabSourceH = (destCSSH / zoom) * (fabH / pg.height);
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

    // Draw touch point indicator (crosshair at center of panel)
    ctx.strokeStyle = "rgba(255, 0, 0, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(destW / 2 - 10, destH / 2);
    ctx.lineTo(destW / 2 + 10, destH / 2);
    ctx.moveTo(destW / 2, destH / 2 - 10);
    ctx.lineTo(destW / 2, destH / 2 + 10);
    ctx.stroke();
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
    listen(this.colorGroup.elm, 'pointerdown', e => e.stopPropagation());
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
