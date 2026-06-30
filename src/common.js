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

export {
  animate,
  css,
  cssIndex,
  dialog,
  Drag,
  Schedule,
  schedule,
  clamp,
  helm,
  dataIndex,
  clearChildren,
  delay,
  delayMs,
  pxToEm,
  fontMap,
  fontUnmap,
  getBox,
  hide,
  iconSvg,
  inflate,
  listen,
  pnToDiv,
  pnToString,
  reflow,
  rotatePoint,
  ptrMsg,
  sleep,
  Spot,
  Surface,
  unlisten,
  strToHash,
  toast,
  ButtonGroup,
  SliderGroup,
  TabView,
  ColorPicker,
  mergeRecent,
};
import { iconPaths } from "./icon.js";
// -skip

// Replacement for replaceWith that propogates dataset.tag and
// returns the new element.
Element.prototype["replace"] = function(newElm) {
  this.replaceWith(newElm);
  if(this.dataset.tag) newElm.dataset.tag = this.dataset.tag;
  return newElm;
}

// properties defined on the window "global" namespace
// are distinguished using the convention of leading+trailing underscores:

// window._menu_  // defined in main.js
window._podiumVersion_ = "2.1.0";
window._body_ = document.body;
window._lastTarget_ = null; // last touched .pz element, excluding EditPanel
window._dvPxRt_ = 1 + (devicePixelRatio - 1) * 0.3;
window._gs_ = 618; // golden section (reciprocal) msec (.618 seconds)
window._gsgs_ = (_gs_ * _gs_) / 1000; // shorter golden section!
window._sliderPrecision_ = 4; // sensitivity multiplier for slider/pager precision mode
window._zTop_ = 300; // continuously incrementing z-index counter for panels, menu, surfaces
window._mobile_ = window.matchMedia('(pointer: coarse)').matches;
window._msPerObj_ = 1; // for pdf printing, see score.toPdf()
window._pxPerEm_ = 25; // initial document.body's font size value: defines pixels in 1 em
window._Score_ = null; // current active score class (assigned in score.js)
window._score_ = null; // current active score instance
window._FileSrc_ = null; // base file source class (assigned in file.js)
window._CachedSrc_ = null; // base cached source class (assigned in file.js)
window._maxRecent_ = 72;      // SymbolsPanel recent-list size (multiple of 6); see mergeRecent below
window._recentSelectPts_ = 1; // points awarded when a symbol is selected in the panel
window._recentInsertPts_ = 4; // points awarded when a symbol is inserted into the score (4:1 ratio
                               // ensures symbols you actually use dominate over ones merely browsed)
window._voidFunc_ = () => {};
window._curtain_ = null; // set in class Curtain below: used to dim the screen

// svg texture used for all draggable elements
let panSvgWarm =
  // Note: you must escape second / in a url, otherwise builder.py will parse
  // them as comments.
  "url('data:image/svg+xml;base64," + btoa(`
      <svg width='3em' height='3em' viewBox='0 0 175 175' xmlns='http:/\/www.w3.org/2000/svg'>
        <filter id='noiseFilterWarm'>
          <feTurbulence type='turbulence' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/>
          <feComponentTransfer>
            <feFuncA type='linear' slope='0.3'/>
          </feComponentTransfer>
        </filter>
        <g><rect width='100%' height='100%' filter='url(#noiseFilterWarm)'/></g>
      </svg>`) +
  "')";

let panSvgCool =
  "url('data:image/svg+xml;base64," + btoa(`
      <svg width='3em' height='3em' viewBox='0 0 175 175' xmlns='http:/\/www.w3.org/2000/svg'>
        <filter id='noiseFilter'>
          <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/>
          <feColorMatrix type='matrix' values='0.30 0.30 0.30 0 -0.07
                                               0.30 0.30 0.30 0 -0.03
                                               0.30 0.30 0.30 0  0.20
                                               0    0    0    0  0.27'/>
        </filter>
        <g><rect width='100%' height='100%' filter='url(#noiseFilter)'/></g>
      </svg>`) +
  "')";

let panSvgDark =
  "url('data:image/svg+xml;base64," + btoa(`
      <svg width='3em' height='3em' viewBox='0 0 175 175' xmlns='http:/\/www.w3.org/2000/svg'>
        <defs>
          <filter id='noiseFilterDark'>
            <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/>
            <feComponentTransfer>
              <feFuncA type='linear' slope='0.3'/>
            </feComponentTransfer>
          </filter>
          <filter id='glowFilter'>
            <feGaussianBlur stdDeviation='2' result='blur'/>
            <feComponentTransfer in='blur' result='glow'>
              <feFuncA type='linear' slope='1.5' intercept='0.2'/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in='glow'/>
              <feMergeNode in='SourceGraphic'/>
            </feMerge>
          </filter>
        </defs>
        <rect width='100%' height='100%' fill='rgba(255,255,255,0.02)' filter='url(#glowFilter)'/>
        <rect width='100%' height='100%' filter='url(#noiseFilterDark)'/>
      </svg>`) +
  "')";


// css helpers:
// Podium uses css extensively, but does not use css files: other than some common css definitions,
// css is defined within the javascript classes that use it by calling the css(...) function to
// inject a stylesheet into the dom.

function cssIndex(name = null, selector = null, key = null) {
  // return information about a named stylesheet defined with css() (defined below)
  // @name when none, return all styleSheets, otherwise if
  // @selector is none, return the named stylesheet, else return the value of
  // @key in the selector of the named stylesheet
  let sheets = document.styleSheets;
  if (!name) return sheets;
  for (let sheet of sheets) {
    if (sheet.ownerNode.dataset.style == name) {
      if (!selector) return sheet;
      for (let rule of sheet.rules) {
        if (rule.selectorText == selector)
          return new RegExp(`${key}: ([^;]*);`).exec(rule.cssText)[1];
      }
    }
  }
}

let css = (name, rules) => {
  // define a named css style sheet
  document.head.insertAdjacentHTML(
    "beforeend",
    `<style data-style="${name}">` + rules + "</style>"
  );
  return cssIndex(name);
};


css( // common css declarations.
  "common", `

  :root {
    /* Layout & Structure */
    --borderRadius: .4em;
    --border: .1em solid white;
    --panelWidth: 12em;

    /* Light theme colors */
    --bodyColor: #b8b8b8;
    --panTexture: ${panSvgCool};
    --bodyVignette: radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,0.13) 100%);

    /* Typography */
    --body-font-family: Vercetti, sans-serif;
    --body-font-weight: 400;
    --body-letter-spacing: .02em;
    --body-line-height: 1.2;
    --body-color: #1f2328;

    /* Shadows */
    --textShadow: .5px .5px #fff6,-1px -1px #fff6,.5px -1px #fff6,-1px .5px #fff6;
    --bodyShadow: drop-shadow(.1em .125em .2em #6668);
    --menuShadow: 0 0 0 transparent;
    --panelShadow: drop-shadow(.08em .1em .2em #0006);
    --layout-shadow: .25em .25em 1.5em #888;

    /* Menu colors */
    --menu-cell-bg: radial-gradient(rgba(210,215,225,0.88) 0%, rgba(195,205,220,0.80) 50%, rgba(170,178,195,0.78) 100%);
    --menu-cell-selected-bg: radial-gradient(rgba(235,238,245,0.92) 0%, rgba(210,218,232,0.88) 100%);
    --menu-cell-active-bg: radial-gradient(rgba(250,252,255,0.95) 0%, rgba(225,232,245,0.90) 100%);
    --menu-disk-bg: radial-gradient(rgba(205,212,225,0.85) 0%, rgba(190,200,218,0.78) 60%, rgba(165,175,195,0.75) 100%);
    --menu-grip-bg: #b8b8b8;
    --menu-grip-selected-bg: #b0b0b0;
    --menu-panel-indicator: #a8a8a8;
    --menu-panel-indicator-highlight: #fff2;
    --menu-panel-indicator-shadow: #0001;
    --menu-icon-color: #333;
    --menu-drawer-front: #e8e8e8;
    --menu-cell-box-shadow: none;
    --menu-grip-shadow: drop-shadow(-0.08em -0.1em 0.15em rgba(255,255,255,0.4))
                        drop-shadow(0.1em 0.12em 0.2em #8884);
    --menu-grip-box-shadow: -0.2em -0.2em 0.4em #888c inset,
                            0.2em 0.2em 0.4em #aaa4 inset;
    --menu-disk-shadow: none;

    /* Panel colors */
    --panel-bg: rgba(200, 208, 222, 0.93);
    --panel-header-bg: #b8b8b8;
    --panel-header-selected-bg: #b0b0b0;
    --panel-inset-shadow: 0.15em 0.15em 0.35em rgba(255,255,255,0.55) inset,
                          -0.15em -0.15em 0.35em rgba(0,0,0,0.14) inset;

    /* Slider colors */
    --slider-indicator: #666;
    --slider-indicator-active: #eef;
    --slider-knob-bg: #b8b8b8;
    --slider-knob-selected-bg: #b0b0b0;
    --slider-knob-shadow: 0.1em 0.1em 0.2em #fff2 inset,
                          -0.1em -0.1em 0.2em #0001 inset,
                          0.1em 0.125em 0.2em #6668;

    /* Select dropdown colors */
    --select-option-bg: #fff;
    --select-option-text: #333;

    /* Text shadow for contrast */
    --text-shadow-contrast: 0 0 0.2em rgba(255, 255, 255, 0.5), 1px 1px 1px rgba(255, 255, 255, 0.3);

    /* File list colors */
    --file-properties-color: #333;
    --file-text-shadow: 1px 1px 1px rgba(255, 255, 255, 0.5);

    /* Color palette */
    --color-primary: #4a90e2;
    --color-primary-active: #3a7bc8;
    --color-surface: #f5f5f5;
    --color-surface-selected: #e8e8e8;
    --color-accent: #aaa;
    --color-text: #333333;
    --color-text-secondary: #666666;
    --color-text-muted: #999999;
    --color-border: #dddddd;
    --color-border-light: #eeeeee;
    --color-shadow: rgba(0, 0, 0, 0.1);
    --color-shadow-strong: rgba(0, 0, 0, 0.2);
    --color-background-overlay: rgba(255, 255, 255, 0.9);

    /* Spacing system */
    --spacing-xs: 0.25em;
    --spacing-sm: 0.5em;
    --spacing-md: 1em;
    --spacing-lg: 1.5em;
    --spacing-xl: 2em;

    /* Typography */
    --font-size-xs: 0.75em;
    --font-size-sm: 0.875em;
    --font-size-base: 1em;
    --font-size-lg: 1.125em;
    --font-size-xl: 1.25em;
    --line-height-tight: 1.25;
    --line-height-base: 1.5;
    --line-height-loose: 1.75;

    /* Transitions */
    --transition-fast: 0.15s ease;
    --transition-normal: 0.3s ease;
    --transition-slow: 0.5s ease;

    /* Z-index layers */
    --z-base: 1;
    --z-dropdown: 10;
    --z-sticky: 20;
    --z-menu: 100;
    --z-modal: 1000;
    --z-toast: 9000;
    --z-shade: 9001;
    --z-curtain: 9002;
    --z-topmost: 9003;

    mark {
     background:black;
     color: white;
     border-radius: .12em;
}


  }

  /* Dark theme */
  [data-theme="Dark"] {
    --bodyColor: #242424;
    --panTexture: ${panSvgDark};
    --bodyVignette: radial-gradient(ellipse at 50% 45%, transparent 20%, rgba(0,0,0,0.45) 100%);

    /* File list colors */
    --file-properties-color: #ddd;
    --file-text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.9);

    /* Typography - dark theme */
    --body-font-family: Vercetti, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --body-font-weight: 400;
    --body-letter-spacing: .02em;
    --body-line-height: 1.2;
    --body-color: #e5e5e5;

    --color-surface: #2e2e2e;
    --color-surface-selected: #4a4a4a;
    --color-text: #e5e5e5;
    --color-text-secondary: #a8a090;
    --color-text-muted: #808080;
    --color-accent: #b8a890;
    --color-border: #404040;
    --color-border-light: #353535;
    --color-shadow: rgba(0, 0, 0, 0.3);
    --color-shadow-strong: rgba(0, 0, 0, 0.5);
    --color-background-overlay: rgba(0, 0, 0, 0.7);
    --textShadow: .5px .5px #0006,-1px -1px #0006,.5px -1px #0006,-1px .5px #0006;
    --bodyShadow: drop-shadow(.1em .125em .2em #000a);
    --panelShadow: drop-shadow(.08em .1em .2em #000c);
    --layout-shadow: .25em .25em 1.5em #000;

    /* Menu colors - dark theme */
    --menu-cell-bg: linear-gradient(135deg, #383838 0%, #2e2e2e 100%);
    --menu-cell-selected-bg: #404040;
    --menu-cell-active-bg: #484848;
    --menu-disk-bg: linear-gradient(135deg, #3a3a3a 0%, #303030 100%);
    --menu-grip-bg: #2e2e2e;
    --menu-grip-selected-bg: #404040;
    --menu-panel-indicator: #a0a0a0;
    --menu-panel-indicator-highlight: #fff3;
    --menu-panel-indicator-shadow: #0002;
    --menu-icon-color: #e5e5e5;
    --menu-drawer-front: #404040;
    --menu-cell-box-shadow: -0.15em -0.15em 0.3em #0004 inset,
                            0.15em 0.15em 0.3em #fff1 inset,
                            2px 2px 3px rgba(255,255,255,0.06),
                            -3px -3px 6px rgba(0,0,0,0.65);
    --menu-grip-shadow: drop-shadow(3px 3px 4px rgba(255,255,255,0.08))
                        drop-shadow(-4px -4px 8px rgba(0,0,0,0.7));
    --menu-grip-box-shadow: -0.2em -0.2em 0.4em #0005 inset,
                            0.2em 0.2em 0.4em #fff2 inset;
    --menu-disk-shadow: drop-shadow(2px 2px 3px rgba(255,255,255,0.06))
                        drop-shadow(-3px -3px 6px rgba(0,0,0,0.65));

    /* Panel colors - dark theme */
    --panel-bg: #2e2e2e;
    --panel-header-bg: #2c2c2c;
    --panel-header-selected-bg: #404040;
    --panel-inset-shadow: -0.15em -0.15em 0.3em #0004 inset,
                          0.15em 0.15em 0.3em #fff1 inset;

    /* Slider colors - dark theme */
    --slider-indicator: #444;
    --slider-indicator-active: #eef;
    --slider-knob-bg: #2c2c2c;
    --slider-knob-selected-bg: #404040;
    --slider-knob-shadow: 0.1em 0.1em 0.2em #fff1 inset,
                          -0.1em -0.1em 0.2em #0003 inset,
                          0.1em 0.125em 0.2em #000a;

    /* Select dropdown colors - dark theme */
    --select-option-bg: #1a1a1a;
    --select-option-text: #e5e5e5;

    /* Text shadow for contrast - dark theme */
    --text-shadow-contrast: 0 0 0.3em rgba(0, 0, 0, 0.8);
  }


  /* Light theme (original neutral grey/amber) */
  [data-theme="Light"] {
    --bodyColor: #efefef;
    --panTexture: ${panSvgWarm};

    /* Menu colors - warm theme */
    --menu-cell-bg: radial-gradient(#c9c9c9 45%, #ccc 66%, #b4b4b4 72%);
    --menu-cell-selected-bg: radial-gradient(#aaa 25%, #fff 100%);
    --menu-cell-active-bg: radial-gradient(#fff 64%, #ccc 73%);
    --menu-disk-bg: radial-gradient(#888, #c9c9c9 25%, #ccc 58%, #b4b4b4 75%);
    --menu-cell-box-shadow: none;
    --menu-grip-shadow: drop-shadow(-0.08em -0.1em 0.15em rgba(255,255,255,0.4))
                        drop-shadow(0.1em 0.12em 0.2em #8884);
    --menu-grip-box-shadow: -0.2em -0.2em 0.4em #888c inset,
                            0.2em 0.2em 0.4em #aaa4 inset;
    --menu-disk-shadow: none;

    /* Panel colors - warm theme */
    --panel-bg: #c8c8c8;
    --panel-inset-shadow: 0.15em 0.15em 0.3em #fff3 inset,
                          -0.15em -0.15em 0.3em #0002 inset;

    --slider-indicator: #888;
    --slider-indicator-active: #eef;
  }

  body {
    font-family: var(--body-font-family);
    font-weight: var(--body-font-weight);
    letter-spacing: var(--body-letter-spacing);
    line-height: var(--body-line-height);
    color: var(--body-color);
    margin: 0;
    padding: 0;
    background-color: var(--bodyColor);
    background-image: var(--bodyVignette);
    height: 100svh; /* small (min) viewport height */
    width: 100lvw;  /* large (max) viewport width */
    position:fixed;
    font-size: ${_pxPerEm_}px;
    left:0;
    top:0;
    user-select: none;
    touch-action: none;
  }

  a {
    text-decoration-skip-ink: none;
  }
  *:not(input):not(textarea) {
    -webkit-user-select: none;  /* disable selection/Copy of UIWebView */
    -webkit-touch-callout: none; /* disable the IOS popup when long-press on a link */
    -webkit-tap-highlight-color: transparent; /* iOS tap-flash; set on every element (not just keys) so delegated handlers on a container can't paint it */
  }
  hr {
    border: .12em solid white;
    margin-top: 2em;      
  }
  select {
    border-radius: var(--borderRadius);
    background-color: #0000;
    color: var(--color-text);
    height:2.5em;
    font-size: var(--font-size-sm);
    margin-left: var(--spacing-md);
    margin-right: var(--spacing-md);
    margin-bottom: var(--spacing-md);
    padding: 0;
    text-align: center;
    text-align-last: center;
    display: block;
    width: calc(100% - 2em);
    box-sizing: border-box;
  }
  select option {
    background-color: var(--select-option-bg);
    color: var(--select-option-text);
  }
  input[type=color] {
    border-color: #888;
    border-radius:var(--borderRadius);
  }
  .void {
    display: none !important;
  }
  .hidden {
    visibility:hidden !important;
  }
  .pz {
    /* class for root-div of elements that can be pan-zoomed by user interaction */
    position:absolute;
    width:0;
    height:0;
    display:flex;
    justify-content: space-around;
    align-items:center;
    font-size:1em;
  }
  .pz-set
    /* marker for root-div of elements that *have been* pan-zoomed by user interaction */
    {}
    a:link,a:visited, a:active {
      color:blue;
      background:inherit;
  }
  .taken
   /* marker for elements that should not be processed by main.py's Gesture class's long press action */
  {}
  .dialog {
    border: var(--border);
    border-radius:var(--borderRadius);
    background:#ccc;
    font-size:1.2em;
    text-align:center;
    outline:none;
  }
  /* text input fields in dialogs: */
  .dialog__textInput {
    height: 1.2em;
    position: relative;
    width:100%;
    font-size:1.2em;
    border:none;
    border-radius:var(--borderRadius);
    text-align: center;
    margin-top: 1em;
    outline: none;
  }
  .fadeLeft {
    z-index: 10;
    position: absolute;
    left: 0px;
    display: inline;
    width: .5em;
    background-image: linear-gradient(to left, transparent, var(--panel-header-bg) 53%, var(--panel-header-bg));
  }
  .fadeRight {
    z-index: 1;
    position: absolute;
    right: 0px;
    display: block;
    width: .5em;
    background-image: linear-gradient(to right, transparent, var(--panel-header-bg) 53%, var(--panel-header-bg));
  }
  /* Shared styling for floating messages (toast, ptrMsg) */
  .floatingMsg {
    border-radius: var(--borderRadius);
    filter: var(--panelShadow);
    background: var(--bodyColor);
    background-image: var(--panTexture);
    color: var(--color-text);
    font-size: var(--font-size-sm);
    padding: 0.5em 0.8em;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1.2;
  }
  /* Center child(ren) both vert/horz */
  .centerChild {
    display:flex;
    align-items: center;
    justify-content: center;
  }
}`
);

// Make all hyperlinks open in new tab (except download links)
document.addEventListener("click", (e) => {
  let anchor = e.target.closest("a");
  if (anchor && anchor.href && !anchor.download) {
    e.preventDefault();
    window.open(anchor.href, "_blank");
  }
});


/**
class ButtonGroup
   Gui widget displaying a group of buttons as a unit.
**/

class ButtonGroup {
  static toggleButtonSvg = `url("data:image/svg+xml;${encodeURIComponent('<svg width="100%" height="100%" viewBox="0 0 24 24" xmlns="http:/\/www.w3.org/2000/svg"><path style="fill:none;stroke:black;stroke-width:0.5px" d="M5 15.5L4 16.5L5 17.5M19 15.4L20 16.5L19 17.5"/></svg>')}")'`;


  static css = css(
    "ButtonGroup",
    `
    .ButtonGroup {
      display: flex;
      justify-content: space-around;
      margin-top: var(--spacing-sm);
    }
    .ButtonGroup__button {
      text-align: center;
      font-size: var(--font-size-sm);
      color: var(--color-text);
      width: 3.5em;
      height: 3.5em;
      padding-top: var(--spacing-xs);
      white-space: nowrap;
    }
    .ButtonGroup__icon {
    }
    .ButtonGroup__button-active {
      box-shadow: 0.1em 0.1em 0.2em var(--color-shadow-strong) inset, -0.1em -0.2em 0.2em var(--color-shadow-strong) inset;
      border-radius: calc(var(--borderRadius) / 4);
      background: var(--color-surface-selected);
    }
    .ButtonGroup__button-toggle {
      background-image: ${ButtonGroup.toggleButtonSvg};
    }
    .ButtonGroup__button-disabled {
      color: var(--color-text-muted);
      left: 0;
    }
    .ButtonGroup__button-selected {
      background: var(--color-surface-selected);
    }
   `
  );

  elm = helm(`<div  class="ButtonGroup"></div>`);
  dataIndex = null;
  handler = null;

  constructor(props, defs, handler) {
    // @props is an object that we can read and write. Usually, it will be
    // a menu cell's stash, but can contain arbitrary properties that are passed to the handler.
    // @defs is an object: { tag: { svg: iconSvgName, <<toggle:property || radio:property>>},...}
    //    note: "toggle" doesn't actually do anything...its up to the handler to change the props,
    //    then call refresh(). The handler should set the toggle value to the button's key, then
    //    call refresh.
    // @handler is called on every (well, almost every) pointerup event on a button

    this.props = props;
    this.defs = defs;
    this.elms = {};
    this.iconElms = {};
    this.handler = handler;
    for (const tag in defs) {
      let def = defs[tag];
      let { svg, radio, toggle, disabled } = def;
      let property = [radio, toggle].find((key) => key);
      let elm = helm(`
          <div data-button="${tag}" data-property="${property}" class="ButtonGroup__button">
            ${tag}<br>
            ${iconSvg(svg, { class: "ButtonGroup__icon" })}          
          </div>`);
      if (toggle) elm.classList.add("ButtonGroup__button-toggle");
      let iconElm = dataIndex("tag", elm)["iconSvg"];
      if (disabled) {
        elm.classList.add("ButtonGroup__button-disabled");
        iconElm.classList.add("ButtonGroup__button-disabled");
      }
      this.elms[tag] = elm;
      this.iconElms[tag] = iconElm;
      // Add buttonElm to this.elm, unless it is a toggle for a property
      // that we've already added a button for.
      if (!toggle || !(property in dataIndex("property", this.elm)))
        this.elm.append(elm);
    }
    this.dataIndex = dataIndex("button", this.elm);
    listen(this.elm, ["pointerdown", "pointerup"], this.handle.bind(this));
    this.refresh();
    this.elm.self = this;
  }

  refresh() {
    for (let tag of Object.keys(this.defs)) {
      let { onOff, radio, toggle, disabled } = this.defs[tag];
      let elm = this.elms[tag];
      let iconElm = this.iconElms[tag];
      if (onOff != undefined) {
        if (this.props[tag]) elm.classList.add("ButtonGroup__button-active");
        else elm.classList.remove("ButtonGroup__button-active");
        continue;
      }
      let property = [onOff, radio, toggle].find((key) => key);
      if (property) {
        let itemTag = this.props[property];
        if (radio) {
          if (tag == itemTag) {
            elm.classList.add("ButtonGroup__button-active");
          } else {
            elm.classList.remove("ButtonGroup__button-active");
          }
        } else if (toggle) {
          if (tag == itemTag) {
            let currentToggleElm = dataIndex("property", this.elm)[property];
            currentToggleElm.replaceWith(elm);
          }
        }
      }
      if (disabled) {
        elm.classList.add("ButtonGroup__button-disabled");
        iconElm.classList.add("ButtonGroup__button-disabled");
      } else {
        elm.classList.remove("ButtonGroup__button-disabled");
        iconElm.classList.remove("ButtonGroup__button-disabled");
      }
    }
  }

  handle(e) {
    // This method is called in response to a button press:
    //   to call the user-supplied handle() function with
    //   these args:
    //   @property: if button that was clicked is part
    //      of a radio group or a toggle group, then
    //      property is the name of that group, otherwise
    //      null
    //   @tag: identifies the button that was clicked
    //   @props: the props object passed in to the constructor.
    //      Normally, this is a menu cell's stash, but can
    //      be any object.
    //   @prevTag: iff property is non null, then the previous
    //      value (i.e. tag) of the property
    e.taken = true;
    let path = e.composedPath();
    for (let i = 0; i < path.length; i++) {
      let elm = path[i];
      if (elm.dataset && elm.dataset["button"]) {
        let tag = elm.dataset["button"];
        if (this.defs[tag]?.disabled) return;
        if (e.type == "pointerdown") {
          elm.classList.add("ButtonGroup__button-selected");
          return;
        } else if (e.type == "pointerup") {
          elm.classList.remove("ButtonGroup__button-selected");
          let { radio, onOff, toggle, redo } = this.defs[tag];
          let property = [radio, toggle].find((key) => key);
          let prevTag = property ? this.props[property] : null;
          if (onOff != undefined) {
            this.props[tag] = this.props[tag] ? false : true;
            this.refresh();
          } else if (radio) {
            if (!redo && tag == prevTag) return; // ignore click on active radio button
            this.props[property] = tag;
            this.refresh();
          }
          if (this.handler) this.handler(e, property, tag, this.props, prevTag);
          return;
        }
      }
    }
  }

  fire(tag, e) {
    let { radio, toggle, redo } = this.defs[tag];
    let property = [radio, toggle].find((key) => key);
    let prevTag = property ? this.props[property] : null;
    if (radio) {
      if (!redo && tag == prevTag) return; // ignore click on active radio button
      this.props[property] = tag;
      this.refresh();
    }
    if (this.handler) this.handler(e, property, tag, this.props, prevTag);
  }
}

/**
class ColorPicker
    Podium's ColorPicker widget. It wraps the HTML native color picker
    together with a slider for adjusting alpa.
**/
class ColorPicker {
  static updateRecentColors() {
    // All PodColorPickers show a color picker show a common list
    // of recently used colors. This function populates menu's
    // datalist (id=recentColors) element with those colors.
    let recentColors = _menu_.rings.ink.stash.recentColors;
    let elm = _menu_.recentColors;
    clearChildren(elm);
    for (let hexColor of recentColors)
      elm.append(helm(`<option value="${hexColor}"></option>`));
  }

  // Push given 7-digit hex color code onto the recentColors
  // list and stash it in menu's ink cell, then update
  // menu's recentColors  datalist element with those colors.
  // color: a 7-digit hex color code
  static pushRecentColor(color) {
    let recentColors = _menu_.rings.ink.stash.recentColors;
    let index = recentColors.indexOf(color);
    if (index > -1) recentColors.splice(index, 1);
    recentColors.unshift(color);
    while (recentColors.length > 10) recentColors.pop();
    _menu_.rings.ink.stash.colors = recentColors;
    ColorPicker.updateRecentColors();
  }

  static css = css(
    "ColorPicker",
    `.ColorPicker {
       position: relative;
       text-align: center;
       font-size: var(--font-size-base);
       display: flex;
       align-items: center;
       gap: var(--spacing-md);
       box-sizing: border-box;
      }
      .ColorPicker__colorWrapper {
        position: relative;
        flex: 1;
        height: 2.5em;
        border-radius: var(--borderRadius);
        border: 0.1em solid #aaa;
        background-image:
          linear-gradient(45deg, #ccc 25%, transparent 25%),
          linear-gradient(-45deg, #ccc 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #ccc 75%),
          linear-gradient(-45deg, transparent 75%, #ccc 75%);
        background-size: 0.5em 0.5em;
        background-position: 0 0, 0 0.25em, 0.25em -0.25em, -0.25em 0;
        box-sizing: border-box;
        cursor: pointer;
        overflow: hidden;
      }
      .ColorPicker__color {
        position: absolute;
        opacity: 0;
        width: 100%;
        height: 100%;
        left: 0;
     }
     .ColorPicker__colorDisplay {
        position: absolute;
        inset: 0;
        border-radius: var(--borderRadius);
        pointer-events: none;
     }
     .ColorPicker__alpha {
        width: 2.5em;
        height: 2.5em;
        flex-shrink: 0;
        cursor: pointer;
        border-radius: 50%;
        border: 0.1em solid #aaa;
        box-sizing: border-box;
     }
     .ColorPicker__alphaSlider {
      z-index: var(--z-modal);
      background: #999; 
      border-radius: var(--borderRadius);
      padding: var(--spacing-md);
      position: absolute;
      width:60%;
     }
      `
  );

  elm = helm(`
   <div class="Panel__item">
   <div data-tag="title"></div>
   <div class="ColorPicker">
      <div class="ColorPicker__colorWrapper">
        <input data-tag="color" class="ColorPicker__color" type="color" colorpick-eyedropper-active="true" list="recentColors"></input>
        <div data-tag="colorDisplay" class="ColorPicker__colorDisplay"></div>
      </div>
      <svg data-tag="alpha" class="ColorPicker__alpha" viewBox="0 0 24 24">
          <defs>
            <pattern id="checkerboard" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="2" height="2" fill="#ccc"/>
              <rect x="2" y="2" width="2" height="2" fill="#ccc"/>
              <rect x="2" y="0" width="2" height="2" fill="#fff"/>
              <rect x="0" y="2" width="2" height="2" fill="#fff"/>
            </pattern>
          </defs>
          <circle fill="url(#checkerboard)" cx="12" cy="12" r="11"/>
          <circle data-tag="alphaCircle" style="fill:#888;opacity:1;" cx="12" cy="12" r="9"/>
        </svg>
        <div data-tag="alphaSlider"></div>
     </div>
   <div>`);

  constructor(title, rgb = "#000", alpha = 1, handler = null) {
    Object.assign(this, dataIndex("tag", this.elm));
    ColorPicker.updateRecentColors();
    this.title.innerHTML = title;
    let stash = { rgb, alpha };
    this.color.value = rgb;
    this.colorDisplay.style.backgroundColor = rgb;
    this.alphaCircle.style.fill = rgb;
    this.alphaCircle.style.opacity = alpha;

    let alphaSlider = new SliderGroup(
      stash,
      {
        alpha: {
          min: 0,
          max: 1,
          step: 0.01,
          value: alpha, // numeric alpha (was mistakenly `${rgb}` — the hex colour — which made the slider value NaN)
          msg: (tag, value) => `Opacity: ${Math.round(value * 100)}%`,
        },
      },
      () => {
        this.alphaCircle.style.opacity = stash.alpha;
        if (handler) handler(stash.rgb, stash.alpha);
      }
    );

    alphaSlider.elm.classList.add("ColorPicker__alphaSlider", "void");
    this.alphaSlider.replaceWith(alphaSlider.elm);

    listen(this.color, ["input", "change"], (e) => {
      this.alphaCircle.style.fill = stash.rgb = this.color.value;
      this.colorDisplay.style.backgroundColor = this.color.value;
      if (handler) handler(stash.rgb, stash.alpha);
      if (e.type == "change") ColorPicker.pushRecentColor(stash.rgb);
    });

    listen(this.alpha, "pointerup", () => {
      if (!alphaSlider.elm.classList.toggle("void"))
        delay(1, () =>
          listen(
            _body_,
            "pointerup",
            () => alphaSlider.elm.classList.add("void"),
            { once: true }
          )
        );
      alphaSlider.refresh();
    });
  }
}


/**
class Curtain
  The Curtain is a div that overlays the entire window. It is used
  to dim the screen during performance situations where, for example,
  a tablet screen might be too bright for the a darkened stage. It can
  dim to black or to red. Red allows easier reading the score s.t. eyes stay
  "dark-adapged" for the rest of the room, as eyse are less sensitive to
  long-wavelength red light.

  If level is in 0-100, dim color is black, opacity = level / 100.
  otherwise level should be in 101 - 201: dim color is #A00000 (deep red), opacity = (201 - level) / 100

**/

class Curtain {

  on = false ;
  level = 60 ;

  curtain = helm(`<div data-tag="Curtain" style=
     "position:fixed;inset:0;pointer-events:none;opacity:0;transition: opacity 1.5s ease;z-index:var(--z-curtain)">
      </div>`) ; // singleton div

  constructor() {
    _body_.append(this.curtain);
    delay(1, () => {
      try {
        let json = localStorage.getItem("menu");
        if (json) {
          let parsed = JSON.parse(json);
          let stash = parsed?.app?.cells?.curtain?.stash;
          if (stash && stash.on) {
            this.on = true;
            let { color, alpha } = stash;
            let curtain = this.curtain;
            curtain.style.transition = "none";
            if (color == 'Black') {
              curtain.style.background = "#000" ;
              curtain.style.opacity = alpha / 100 * .7 ;
              curtain.style.mixBlendMode = "normal";
            }
            else { // color == 'Red'
              curtain.style.background = "#A00000";
              curtain.style.opacity = alpha / 100;
              curtain.style.mixBlendMode = "multiply";
            }
            curtain.style.visibility = "visible" ;
            curtain.offsetHeight;
            curtain.style.transition = "opacity 1.5s ease";
          }
        }
      } catch (err) {}
    });
  }

  toggle() {
    this.on = !this.on ;
    let cell = window._menu_.rings.app.cells.curtain;
    cell.stash.on = this.on;
    let cellIcon = dataIndex("tag", cell.elm).cellIcon;
    cellIcon.innerHTML = iconPaths[this.on ? "Curtain On" : "Curtain"];
    this.update() ;
    window._menu_.stash();
  }

  update (immediate = false) {
    let curtain = this.curtain ;
    let {color, alpha} = window._menu_.rings.app.cells.curtain.stash;
    if (immediate) {
      curtain.style.transition = "none" ;
    }
    if(this.on) {
      if(color == 'Black') {
        curtain.style.background = "#000" ;
        curtain.style.opacity = alpha / 100 * .7 ;
        curtain.style.mixBlendMode = "normal";
      }
      else { // color == 'Red'
        curtain.style.background = "#A00000";
        curtain.style.opacity = alpha / 100;
        curtain.style.mixBlendMode = "multiply";
      }
      curtain.style.visibility = "visible" ;
    }
    else curtain.style.opacity = 0 ;
    if (immediate) {
      curtain.offsetHeight ; // force reflow
      curtain.style.transition = "opacity 1.5s ease" ;
    }
  }

} 

window._curtain_ = new Curtain() ; // create the singleton

/**
  class Drag
**/


class Drag {
  jabMaxDuration     = 150;  // ms
  jabMaxDisplacement = 10;   // px
  jitterThreshold    = 8;    // px
  terminalWindow     = 100;  // ms
  minVelocity        = 0.3;  // px/ms
  mvBufMax           = 20;   // max pointermove events to retain

  constructor(edown, opts = {}) {
    Object.assign(this, opts);
    this.edown    = edown;
    this.mvBuf    = [edown];
    this.jab      = false;
    this.lift     = false;
    this.moved    = false;
    this.duration = 0;
  }

  mv(e) {
    this.mvBuf.push(e);
    if (this.mvBuf.length > this.mvBufMax) this.mvBuf.shift();
    if (!this.moved)
      this.moved = Math.hypot(e.clientX - this.edown.clientX, e.clientY - this.edown.clientY) > this.jitterThreshold;
  }

  up(e) {
    this.duration = e.timeStamp - this.edown.timeStamp;
    let displacement = Math.hypot(e.clientX - this.edown.clientX, e.clientY - this.edown.clientY);
    if (this.duration < this.jabMaxDuration && displacement < this.jabMaxDisplacement)
      { this.jab = true; return this; }
    if (displacement < this.jitterThreshold)
      { this.lift = true; return this; }
    let termBuf = this.mvBuf.filter(ev => e.timeStamp - ev.timeStamp <= this.terminalWindow);
    if (termBuf.length < 2) { this.lift = true; return this; }
    let first = termBuf[0], last = termBuf[termBuf.length - 1];
    if (Math.hypot(last.clientX - first.clientX, last.clientY - first.clientY) < this.jitterThreshold)
      { this.lift = true; return this; }
    let dt = last.timeStamp - first.timeStamp;
    if (dt == 0) { this.lift = true; return this; }
    this.vX = (last.clientX - first.clientX) / dt;
    this.vY = (last.clientY - first.clientY) / dt;
    this.vXY = Math.hypot(this.vX, this.vY);
    let d = Math.atan2(this.vY, this.vX);
    this.dXY = d < 0 ? d + 2 * Math.PI : d;
    if (this.vXY < this.minVelocity) {
      let scale = this.minVelocity / this.vXY;
      this.vX *= scale; this.vY *= scale;
      this.vXY = this.minVelocity;
    }
    return this;
  }

  power(exp = 1.5) {
    // experimental: currenly unused
    let apply = v => Math.sign(v) * Math.pow(Math.abs(v), exp);
    this.vX  = apply(this.vX);
    this.vY  = apply(this.vY);
    this.vXY = Math.hypot(this.vX, this.vY);
    return this;
  }

  boost(threshold = 0.5, exp = 1.5) {
    // apply a power curve to velocity calculation, but with a minimum threshold
    let apply = v => {
      let a = Math.abs(v);
      return a <= threshold ? v : Math.sign(v) * (threshold + Math.pow(a - threshold, exp));
    };
    this.vX  = apply(this.vX);
    this.vY  = apply(this.vY);
    this.vXY = Math.hypot(this.vX, this.vY);
    return this;
  }

  // Compute kinematic fling destination and duration using constant deceleration.
  // vel: drag velocity in px/msec. Usually drag.vX or drag.vY.
  // pos: current position in px; min/max: clamped bounds for the destination.
  // k: deceleration constant (px/ms²) — larger = shorter flings.
  // Returns { to: destination in px, dt: animation duration in ms }.
  static fling(pos, min, max, vel, k = 0.001) {
    let dT = clamp(Math.abs(vel) / k, 200, 3000);
    let d  = vel * dT / 2;
    let to = clamp(pos + d, min, max);
    let dt = Math.abs(to - pos) > 1 ? clamp(Math.abs(2 * (to - pos) / vel), 200, 3000) : 0;
    return { to, dt };
  }

   // Compute transition duration using an exponential curve.
  static scrollDur(distance) {
    return clamp( 80 * Math.pow(Math.abs(distance), 0.45), 60, 650) ;
  }


}


/**
class PodumSlider
  A custom html element that replaces <input type="range"> for use in
  the SliderGroup class defined later in this file.  Most widgets in
  Podium "wrap" html elements to provide additional functionality, but
  the PodiumSlider and PodiumInput defines a new, "custom" html elements.
**/


class PodiumSlider extends HTMLElement {
  static get observedAttributes() {
    return ["min", "max", "value", "step", "curve"];
  }

  static css = css(
    "PodiumSlider",
    `.Slider {
       position: absolute;
       width: calc(100% - 2.5em);
       height: 2em;
       left: 1.25em;
     }
     .Slider__track {
       position: absolute;
       top: calc(50% - .2em);
       height: .5em;
       width: 100%;
       background: var(--color-border);
       border-radius: var(--borderRadius);
     }
     .Slider__knob {
       position: absolute;
       width: 2.8em;
       height: 2.8em;
       top: calc(50% - 1.4em);
       border-radius: var(--borderRadius); /* was inherited from .raisedEdge */
       background: var(--slider-knob-bg);
       background-image: var(--panTexture);
       box-shadow: var(--slider-knob-shadow); /* drop-shadow is here, not a filter (iOS) */
     }
     .Slider__knob-selected {
       background: var(--slider-knob-selected-bg);
     }
     .Slider__knob__indicator {
        position: relative;
        pointer-events: none;
        border-radius: 100%;
        width: .6em;
        height: .6em;
        top: calc(50% - .3em);
        left: calc(50% - .3em);
        background: var(--slider-indicator);
     }
     .Slider__knob__indicator-active {
        position: relative;
        background-color: var(--slider-indicator-active);
     }
     `
  );

  elm = helm(`
    <div data-tag="slider" class="Slider">
       <div data-tag="track" class="Slider__track"></div>
       <div data-tag="knob" class="Slider__knob">
          <div data-tag="indicator" class="Slider__knob__indicator"></div>
       </div>
     </div>`);

  adjusting = false;
  pos = 0; // in [0,1]
  curve = 1; // 1 = linear; >1 = more resolution at low end
  sliderBox;
  knobBox;

  constructor() {
    super();
    // turn attributes into instance vars:
    let setAttr = (key) =>
      (this[key] = this.hasAttribute(key)
        ? parseFloat(this.getAttribute(key))
        : this[key]);
    ["min", "max", "value", "step", "curve"].forEach((attr) => setAttr(attr));
    this.disabled = this.hasAttribute("disabled") ? true : this.disabled;

    Object.assign(this, dataIndex("tag", this.elm));
    this.append(this.elm);

    listen([this.knob, this.track], "pointerdown", (e) => {
      e.taken = true;
      e.stopImmediatePropagation();
      this.adjusting = true;
      _menu_.busy = true;
      this.knob.classList.add("Slider__knob-selected");
      this.indicator.classList.add("Slider__knob__indicator-active");
      this.updateGeometry();
      let { knobBox, sliderBox } = this;
      this.knob.setPointerCapture(e.pointerId);

      let prevX = e.clientX;
      // frac accumulates continuously so sub-step progress isn't lost when
      // setPos snaps to the nearest step each frame.
      let frac = this.pos;
      let set = (clientX, delta) => {
        let dx = clientX - prevX;
        prevX = clientX;
        let t = Math.max(0, delta / knobBox.height - 0.5);
        let unitsPerPx = this.curve * (this.max - this.min) * Math.pow(Math.max(frac, 0.001), this.curve - 1) / sliderBox.width / this.step;
        let sensitivity = 1 + t * unitsPerPx * _sliderPrecision_;
        frac = clamp(frac + (dx / sliderBox.width) / sensitivity, 0, 1);
        this.setPos(frac);
      };

      set(
        e.clientX,
        Math.abs(e.clientY - sliderBox.top - sliderBox.height / 2)
      );

      let mv = listen(this.knob, "pointermove", (emv) => {
        e.stopImmediatePropagation();

        // For sliders, respond immediately without jitter filtering
        set(
          emv.clientX,
          Math.abs(emv.clientY - sliderBox.top - sliderBox.height / 2)
        );
        let ein = new Event("input", { bubbles: true });
        ein.clientX = emv.clientX;
        ein.clientY = emv.clientY;
        this.dispatchEvent(ein);
      });

      let done = listen(
        this.knob, "pointerup",
        (eup) => {
          unlisten(done);
          e.stopImmediatePropagation();
          unlisten(mv);
          this.adjusting = false;
          _menu_.busy = false;
          _menu_.autoOff.run();
          this.knob.classList.remove("Slider__knob-selected");
          this.indicator.classList.remove("Slider__knob__indicator-active");
          // notify listeners that slider is finished
          this.dispatchEvent(new Event("change", { bubbles: true })); 
        }
      );
    });
  }

  connectedCallback() {
    if (this.isConnected) this.setAttribute("value", this.value);
  }

  updateGeometry() {
    this.sliderBox = getBox(this.slider);
    this.knobBox = getBox(this.knob);
  }

  attributeChangedCallback(which, was, is) {
    if (this.adjusting) return;
    if (which != "value") {
      this[which] = parseFloat(is);
    } else {
      let v = parseFloat(is);
      if (!Number.isFinite(v)) return; // ignore a non-numeric "value" attribute
      let t = clamp((v - this.min) / (this.max - this.min), 0, 1);
      let pos = this.curve == 1 ? t : Math.pow(t, 1 / this.curve);
      this.setPos(pos);
    }
  }

  setPos(pos) {
    // set the pos, which represents slider position in [0,1].
    // NaN-safety: never emit a non-finite value. A degenerate drag (zero-width
    // geometry → div-by-zero) or a bad `value` attribute can produce a NaN pos;
    // bail rather than corrupt this.pos/this.value, which would otherwise poison
    // whatever stash the slider is bound to (e.g. numbers.pn → pgUse crash).
    if (!Number.isFinite(pos)) return;
    this.pos = pos;
    let value = (this.max - this.min) * Math.pow(pos, this.curve) + this.min;
    let snapped = Math.round(value / this.step) * this.step;
    this.value = Number.isInteger(snapped) ? snapped : parseFloat(snapped.toPrecision(6)); // discrete-ize value in this.step
    // Position knob as % of track width minus half the knob's fixed 2.8em width.
    // Using calc() avoids pxToEm, which breaks during font-size transitions.
    this.knob.style.left = `calc(${(pos * 100).toFixed(4)}% - 1.4em)`;
  }
}

customElements.define("pod-slider", PodiumSlider);

/**
class PodiumInput
   Class that defines a custom text widget dom element that selects
   all text and focuses when attached to the dom
 **/
class PodiumInput extends HTMLInputElement {
  // usage: <input is="pod-input" type="text" placeholder="spot input">
  static observedAttributes = ["value"];

  constructor(...args) {
    super(...args);
  }

  connectedCallback() {
    delay(10, () => this.focus());
    delay(10, () => this.select());
  }

  attributeChangedCallback(name, oldValue, newValue) {
    /*unused */ 
  }
}

customElements.define("pod-input", PodiumInput, { extends: "input" });

/**
class Schedule
  A replacment for setTimeout based on requestAnimationFrame
**/

function schedule(delta, func) {
  // convenience for running single instance of schedule
  return new Schedule().run(delta, func);
}

class Schedule {
  cancelled = false;
  callable = null;

  constructor(delta = null, callable = null) {
    // Defines a scheduler that will call the given @callable
    // after the schedule has run for @delta msecs.  The Schedule
    // does not start running automatically: you must call
    // this.run() to actually start it. @delta and @callable are both
    // optional: if not provided, then you'll have to provide it (them)
    // in the subsequent this.run(delta, callable) call.
    this.delta = delta;
    this.callable = callable;
  }

  run(delta = null, callable = null) {
    // Start the schedule running, or restart an already
    // running Schedule. @delta and @callable are optional:
    // if provided, either or both will replace the @delta
    // and @callable optionally provided by the constructor,
    // or by a previous call to run.
    cancelAnimationFrame(this.af);
    this.delta = delta || this.delta;
    this.callable = callable || this.callable;
    this.cancelled = false;
    this.runTime = performance.now() + this.delta;
    let loop = (() => {
      if (this.cancelled) return;
      if (this.paused || performance.now() < this.runTime)
        this.af = requestAnimationFrame(loop);
      else this.callable(this);
    }).bind(this);
    loop();
    return this;
  }

  cancel() {
    // Cancel the next run. After this, call run(...) again to restart, if desired.
    this.cancelled = true;
  }

  elapsed() {
    // Return number of msecs this Schedule has been running.
    return performance.now() - (this.runTime - this.delta);
  }

  pause() {
    this.paused = performance.now();
  }

  resume() {
    if (this.paused) this.runTime += performance.now() - this.paused;
    this.paused = 0;
  }
}

/**
class Shade
  darkens the screen and displays a modal message...
  used as a singleton by calling the global singleton _shade_.show(...)
 **/
class Shade {
  static css = css(
    "Shade",
    `.Shade {
      backdrop-filter: blur(.3em);
      opacity: 0;
      background: radial-gradient(circle at center, var(--color-surface) 0, var(--color-surface) 10em, transparent 20em);
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      z-index: var(--z-shade);
      }
      .Shade__body {
       font-family: Bravura;
       font-size: ${60 / _dvPxRt_}px;
       line-height: ${60 / _dvPxRt_}px;
       animation: colors 3s linear infinite;
       text-align: center;
      }
      @keyframes colors {
      	0% { color: #88f; }
      	33% { color: #8f8; }
      	66% { color: #f88; }
      }
   `
  );

  elm = helm(`
    <div class="Shade">
      <div data-tag="body" class="Shade__body">
        \ue4c0<br>
        <div data-tag="msg"></div>
        <button data-tag="cancel">DISMISS</button>
      </div>
     </div>`);

  scheduler = new Schedule();
  msgStack = [];
  onCancel = null;

  constructor() {
    Object.assign(this, dataIndex("tag", this.elm));
    listen(this.cancel, "click", () => {
      this.hide();
      if(this.onCancel) {
        let onCancel = this.onCancel;
        this.onCancel = null;
        onCancel();
      }
    })
  }

  show(message = "Loading", fadeIn=1500) {
    this.message = message;
    this.msgStack.push(message);
    this.msg.innerHTML = message;
    _body_.append(this.elm);
    this.elm.style.opacity = 0;
    reflow();
    this.elm.style.transition = `opacity ${fadeIn}ms ease-in`;
    this.scheduler.run(fadeIn, () => (this.elm.style.opacity = 1));
  }

  update(message) {
    this.msg.innerHTML = message;
  }

  hide() {
   this.msgStack = [];
    this.elm.style.transition = "opacity 5.5s ease-in";
    this.elm.style.opacity = 0;
    this.scheduler.run(500, () => this.elm.remove());
  }

  pop() {
    if (this.msgStack.length == 0) return;
    this.msgStack.pop();
    this.msgStack.length == 0
      ? this.hide()
      : this.show(this.msgStack[this.msgStack.length - 1]);
  }
}

window._shade_ = new Shade();

async function sleep(ms) {
  // sleep for (at least) ms
  let until = performance.now() + ms;
  return new Promise((resolve) => {
    let run = () => performance.now() >= until ? resolve() : requestAnimationFrame(run);
    requestAnimationFrame(run);
  })
}


/**
class SliderGroup
   Displaying one of more slider widgets
**/

class SliderGroup {
  static css = css(
    "SliderGroup",
    `.SliderGroup {
       font-size: var(--font-size-base);
       color: var(--color-text);
       text-align: center;
      }
    .SliderGroup__SliderBlock {
       margin-bottom: var(--spacing-md);
     }
     .SliderGroup__SliderBlock__Slider {
        display: block;
        position: relative;
        width: 100%;
        height: 2em;
        margin-top: var(--spacing-sm);
     }
     .SliderGroup__SliderBlock__Slider-disabled {
       opacity: 0.35;
       pointer-events: none;
     }
    .SliderGroup--grid {
       display: grid;
       grid-template-columns: 1fr 1fr;
       column-gap: var(--spacing-sm);
       font-size: 75%;
     }
   `
  );

  elm = helm(`<div data-tag="sliderGroup" class="Panel__item SliderGroup">`);

  dataIndex = null;
  handler = null;

  constructor(props, defs, handler) {
    // defs is an object thus: { tag:{min:,max:,msg:, <<disabled:trueOrFalse>>,},tag:{...}, ...}
    // props is an object that we can read/write (usually a menu cell's stash var or a Score's stash var,
    // but any object will do), to read/write the slider value from/to.
    // handler is a (possibly empty) callback invoked when slider value changes,
    //    throttle: <<msecs>>, throttle calling of any handler
    // Grid mode is activated automatically when any def has col, row, or fullWidth set.
    this.props = props;
    // Any keys not assigned in def are given default values:
    this.defs = defs;
    this.handler = handler;
    for (const tag in defs) {
      let tagDef = Object.assign(
        {
          min: 1,
          max: 1,
          step: 1,
          value: 1,
          curve: 1,
          disabled: false,
          throttle: -1,
        },
        defs[tag]
      );
      defs[tag] = tagDef;
      let elm = helm(
        `<div class="SliderGroup__SliderBlock" data-tag="${tag}">${this.formatMsg(
          tag
        )}
             <pod-slider class="SliderGroup__SliderBlock__Slider" data-tag="${tag}_slider"
               min="${tagDef.min}" max="${tagDef.max}" step="${tagDef.step}" value="${tagDef.value}" curve="${tagDef.curve}">
          </pod-slider></div>`
      );
      if (tagDef.fullWidth) elm.style.gridColumn = "1 / -1";
      else if (tagDef.col != null) elm.style.gridColumn = tagDef.col;
      if (tagDef.row != null) elm.style.gridRow = tagDef.row;
      this.elm.append(elm);
    }
    let useGrid = Object.values(defs).some(d => d.col != null || d.row != null || d.fullWidth);
    if (useGrid) this.elm.classList.add("SliderGroup--grid");
    this.dataIndex = dataIndex("tag", this.elm);
    listen(this.elm, ["input", "change"], this.handle.bind(this));

    this.refresh();
  }

  formatMsg(tag) {
    // Formats and returns string value of this.defs[tag].msg:
    // it  can be a callback that returns a string, or it can be a string
    // that will be formatted using {min},{max},{value},{step}
    // substitutions. If value is non-null, it's used instead of
    // the value in the tag def: see this.progress. If the msg
    // contains "...", everything after any "..." is removed.
    let tagDef = this.defs[tag];
    let value = this.props[tag];
    if (tagDef.msg instanceof Function) return tagDef.msg(tag, value) ;
    else if (typeof tagDef.msg == "string")
      return tagDef.msg.format({
        min: tagDef.min,
        max: tagDef.max,
        value: value,
      });
    else return "";
  }

  handle(e) {
    // Function called whenever a slider in the group generates an
    // input or change event.  It will update the slider's text, and call
    // the user-supplied handler callback, passing the event, the
    // slider's tag, and the slider's value. The slider's value
    // is written into this.props as the value of the slider's tag.
    let tag = e.target.parentElement.dataset.tag;
    let elm = this.dataIndex[tag];
    let sliderElm = elm.firstElementChild;
    this.props[tag] = Number(sliderElm.value);
    this.refresh();
    if (this.defs[tag].throttle > 0) {
      let def = this.defs[tag];
      if (def.throttler) def.throttler.run();
      else
        def.throttler = new Schedule(def.throttle, () =>
          this.handler(e, tag, sliderElm.value, this)
        ).run();
    } else if (this.handler) this.handler(e, tag, sliderElm.value, this);
    // Create a ptrMsg...but only once per pointerDown...pointerUp. We use this.ptrMsg to know if we've already
    // created one, and set it to null when we get the "sliderDone" msg sent when the slider gets a pointerup.
    if (!this.ptrMsg) this.ptrMsg = ptrMsg(e, () => this.formatMsg(tag));
    if (e.type == "change") this.ptrMsg = null;
  }

  refresh() {
    // call this whenever this.props is modified, or
    // this.defs is changed, to update all sliders
    // step, min, max, values, and text.  Note that the
    // slider's value is held in this.props, not
    // in this.defs.
    for (const tag in this.defs) {
      let tagDef = this.defs[tag];
      let elm = this.dataIndex[tag];
      let sliderElm = this.dataIndex[tag + "_slider"];
      sliderElm.min = tagDef.min;
      sliderElm.max = tagDef.max;
      sliderElm.step = tagDef.step;
      // Delay setAttribute because refresh is sometimes called before
      // slider(s) attached to dom, but PodiumSliders need to be attached
      // to work properly:
      delay(5, () => sliderElm.setAttribute("value", this.props[tag]));
      if (tagDef.disabled)
        elm.classList.add("SliderGroup__SliderBlock__Slider-disabled");
      else elm.classList.remove("SliderGroup__SliderBlock__Slider-disabled");
      elm.firstChild.data = this.formatMsg(tag).replace(/(.*?\.\.\.).*/, "$1");
    }
  }

  progress(tag, value, min = null, max = null) {
    // Treat a slider in a sliderGroup as if it was a progress bar:
    // update the single slider defined by tag, value, min, max,
    // and skip the usual call this.handler. min and max are optional
    let sliderElm = this.dataIndex[tag + "_slider"];
    if (min) this.defs[tag].min = sliderElm.min = min;
    if (max) this.defs[tag].max = sliderElm.max = max;
    sliderElm.setAttribute("value", value);
    this.props[tag] = value;
    this.dataIndex[tag].firstChild.data = this.formatMsg(tag);
  }
}

/**
class Spot
  Used for development only to help debug layout issues.     
  Spot instances draw a small colored rectangle at x,y when go(x,y) is called.
**/
class Spot {
  constructor(color, parent) {
    this.parent = parent;
    this.elm = helm(`<div style=
      "z-index:100000;pointer-events:none;position:absolute;width:.5em;height:.5em;background:${color};visibility:hidden;"
    ></div>`);
    if(parent) parent.append(this.elm);
  }

  go(x, y, parent) {
    if (parent) parent.append(this.elm);
    this.elm.style.visibility = "visible";
    this.elm.style.left = x + "px";
    this.elm.style.top = y + "px";
    return this;
  }
}

/**
class Surface
  Base class for widgets that are normally attached to a panel but
  can be detached and moved/zoomed independently.
**/

class Surface {
  static css = css(
    "Surface",
    `
    .Surface {
      font-size:1em;
      position:absolute;
      width:8em;
      height:8em;
      z-index:100;
    }
    /* Some Surface subclasses need an outline */
    .Surface__outline 
    { border: 1px solid #444;
      border-radius:var(--borderRadius);
      padding:1em;
      touch-action:none;
      box-sizing:border-box;
      background: #4444;
    }
    [data-theme="Dark"] .Keyboard__outline
    { border: 1px solid #aaa;
    }
  `);

  surface = helm(`<div data-tag="surface" class="Surface"></div>`);
  // When defined, cicular part of the surface that reacts to drag gestures
  // ...used by Clock and StopWatch to disallow dragging ouside of circle
  surfaceDragElm = null; 

  constructor(panel, ScreenPanel) {
    this.panel = panel;
    let surface = this.surface;
    // Give surface same tag as its panel:
    this.surface.dataset.tag = this.panel.elm.dataset.tag;
    let longPresser = new Schedule();

    panel.listeners.push(listen(surface, "pointerdown", (e) => {
      if(surface.style.parentElement === _body_) surface.style.zIndex = ++_zTop_; // move to top of stacking order
      e.taken = true;
      // set z-index to bring surface on top (note: Curtain class manages its own z-index)
      if(this.constructor.name != "Curtain" && surface.parentElement == _body_) surface.style.zIndex = ++_zTop_;

      let box = getBox(surface) ;
      let maxLeft = window.innerWidth - box.width;
      let maxTop = window.innerHeight - box.height;
      // When this.surfaceDragElm defined, we Ignore pointerdown outside of circular area enclosed by it.
      // This is used to diable dragging outside of Clock/Stopwatch's circular faces
      if(this.surfaceDragElm) {
        box = getBox(this.surfaceDragElm) ;
        if (Math.hypot(e.clientX - box.x - box.width / 2, e.clientY - box.y - box.height / 2) > box.width / 2) return;
      }
      _body_.setPointerCapture(e.pointerId);
      longPresser.run(_gs_, () => this.onSurfaceEvent("press")) ;
      let dX = e.offsetX, dY = e.offsetY; // warning: e can be gc'ed before mv references it.
      let fling = new Drag(e);
      let mv = listen(_body_, "pointermove", (emv) => {
        // subclasses can set e.frozeon=true to disable move processing
        // for this event (see, for example, class Keyboard in panel.js)
        if(e.frozen) return ; 
        fling.mv(emv) ;
        if (surface.parentElement == _body_ && !e.noMove) {
          surface.style.left = clamp(emv.clientX - dX, 0, maxLeft) + "px";
          surface.style.top = clamp(emv.clientY - dY, 0, maxTop) + "px";
        }
        else if (fling.moved) {
          // attach surface to document body
          longPresser.cancel();
          surface.style.fontSize = panel.elm.style.fontSize;
          surface.style.position = "absolute";
          surface.classList.add("pz"); // this makes it pan-zoomable
          surface.style.zIndex = panel.elm.style.zIndex;
          _body_.append(surface);
          _pzTarget_ = surface; // this allows pan-zooming without having to reselect
          ScreenPanel.pzTarget = surface ; /// rem grd
          hide(this.panel.elm, dataIndex("tag", this.panel.cell.elm).cellIcon);
          surface.style.left = emv.clientX - dX + "px";
          surface.style.top = emv.clientY - dY + "px";
        }
      });

      listen(_body_, "pointerup", (eup) => {
        fling.up(eup) ;
        longPresser.cancel();
        unlisten(mv);
        let downTime = eup.timeStamp - e.timeStamp;
        if (fling.dXY) { // fling detected
          hide(surface, dataIndex("tag", this.panel.cell.elm).cellIcon);
          if (this.panel.constructor != ScreenPanel) ScreenPanel.update(null);
        }
        else if (downTime < _gs_) this.onSurfaceEvent("click");
      }, { once: true });
    }));
    delay(2, () => this.build());
  }

  hide() {
    if (this.surface.parentElement == _body_)
      hide(this.surface, dataIndex("tag", this.panel.cell.elm).cellIcon);
  }

  destructor() {
    this.surface.remove();
  }

  build() {}

  onSurfaceEvent(e, eup, type) {}

  show() {
    let surface = this.surface;
    surface.style.position = "static";
    surface.style.fontSize = "1em";
    surface.classList.remove("pz");
    surface.style.visibility = "unset"; // *not* visible: want to inherit
    this.panel.body.prepend(surface);
  }
}

/**
class TabView
  Class implementing a gui Tabbed Panel view for
  use by Panel subclasses
**/

class TabView {
  static css = css(
    "TabView",
    `.Tab__tag {
       display: inline-block;
       height: 2.2em;
       line-height: 2.2em;
       width: 8em;
       text-align: center;
       margin: 0.4em;
    }
    .Tab__tag-selected {
      border-radius: var(--borderRadius);
      background-color: var(--panel-bg);
    }
    .TabView__frame {
       margin-top: var(--spacing-sm);
       width: 100%;
       height: 3em;
    }
    .TabView__sash {
       position: relative;
       display: flex;
       width: max-content;
       min-width: 100%;
       height: 3em;
       background: var(--panel-header-bg);
       background-image: var(--panTexture);
       -webkit-mask-image: linear-gradient(to right, transparent, black .8em, black calc(100% - .8em), transparent);
       mask-image: linear-gradient(to right, transparent, black .8em, black calc(100% - .8em), transparent);
    }
    .TabView__sash-edge {
      top: 3.5em;
      height: 8em;
    }
    .TabView__faces {
       height: calc(100% - 3em);
       width: 100%;
       top: 3em;
   }
   .TabView__face {
       position: absolute;
       width: 100%;
       height: 100%;
   }
  `
  );

  static Tab = class Tab {
    tag = helm(`<div class='Tab__tag'></div>`);
    face = helm(`<div data-tag="face" class="TabView__face void"></div>`);
    onSelect = null;
    onDeselect = null;

    constructor(title) {
      // Title is a string to diplay on the tag. If iconPaths[title] exists,
      // the tag will display that icon to the left of title.
      this.tag.textContent = title;
      if (iconPaths[title] && title != "Doc")
        this.tag.prepend(
          helm(
            `${iconSvg(title, {
              style:
                "pointer-events:none;height:1.5em;top:.5em;position:relative;padding-right:.3em;",
            })}`
          )
        );
      this.face.dataset.tag = title + "_face";
    }

    select() {
      this.tag.classList.add("Tab__tag-selected");
      this.face.classList.remove("void");
      if (this.onSelect) this.onSelect(this);
    }

    deselect() {
      this.tag.classList.remove("Tab__tag-selected");
      this.face.classList.add("void");
      if (this.onDeselect) this.ondelect();
    }
  };

  elm = helm(`
      <div data-tag="frame" class="TabView__frame">
        <div data-tag="sash" class="TabView__sash"></div>
        <div data-tag="faces" class="TabView__faces"></div>
    </div>`);

  tabs = {};
  selectedTab = null;
  // Horizontal dragging of sash can be disabled by settings draggable
  // to false directly after the constructor.
  draggable = true;

  // Pass a reference to the panel this tabView is attached to
  constructor(panel, ...tabNames) {
    this.panel = panel;
    Object.assign(this, dataIndex("tag", this.elm));
    for (let name of tabNames) {
      let tab = new TabView.Tab(name);
      this.sash.append(tab.tag);
      this.faces.append(tab.face);
      this.tabs[name] = tab;
    }

    listen(this.sash, "pointerup", (e) =>
      e.target.classList.contains("Tab__tag") ? this.selectTab(e.target) : null
    );

    if (this.draggable)
      delay(5, () =>
        this.panel.listeners.push(
          listen(this.sash, "pointerdown", (e) => {
            let fling = new Drag(e);
            let offsetX = e.clientX - this.sash.offsetLeft;
            let limit = this.sash.offsetWidth - this.frame.offsetWidth;
            let mv = listen(this.sash, "pointermove", (emv) => {
              fling.mv(emv) ;
              if (fling.moved)
                this.sash.setPointerCapture(e.pointerId);
              this.sash.style.left =
                clamp(emv.clientX - offsetX, -limit, 0) + "px";
              e.emv = emv;
            });
            listen(this.sash,"pointerup",
              (eup) => {
                unlisten(mv);
              },
              { once: true }
            );
          })
        )
      );
  }

  selectTab(tagOrName) {
    let select = (tab) => {
      tab.select();
      this.selectedTab = tab;
    };

    for (let [name, tab] of Object.entries(this.tabs)) {
      tagOrName == tab.tag || tagOrName == tab.tag.textContent
        ? select(tab)
        : tab.deselect();
    }
  }
}

/**
Stand-alone functions, arranged alphabetically (mostly!)
**/

function animate(elm, from, to, transition, finalize) {
  // use css transition to animate from one state to another. One or both
  // of @from and @to are assumed to be defined.
  // @elm element to transition
  // @from starting css styles. If null, current styles are used
  // @to ending css styles. If null, current styles are used.
  // @transition transition def...set to "unset"  after transition has completed
  // @finalize (optional)...function to run after transition has completed
  if(from) 
    for (let [k, v] of Object.entries(from)) elm.style[k] = v;
  reflow();
  elm.style.transition = transition;
  for (let [k, v] of Object.entries(to)) elm.style[k] = v;
  listen(elm, "transitionend", () => {
      elm.style.transition = "unset";
      if (finalize) finalize();
    },
    { once: true }
  );
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function clearChildren(elm) {
  while (elm.firstChild) elm.removeChild(elm.firstChild);
}

function dataIndex(key, elm) {
  // Finds all occurences of data-{key}:{value} in
  // elm and its children (recursively).  Returns a map
  // of all value:element. Assumes the key is only used once
  // in the elmTree.
  let index = {};
  (function buildIndex(key, elm) {
    // Note: recursive IIFE
    if (key in elm.dataset) index[elm.dataset[key]] = elm;
    Array.from(elm.children).forEach((childElm) => buildIndex(key, childElm));
  })(key, elm);
  return index;
}

function delay(frameCount, func) {
  // delay execution of a function a given number of animation frames
  if (frameCount <= 0) return func();
  requestAnimationFrame(() => delay(frameCount - 1, func));
}

function delayMs(msec, func) {
  // delay execution of @func until @msec real milliseconds have elapsed.
  // Deadline-based against the wall clock, so it needs no frame-rate
  // calibration and is immune to variable refresh rates: unlike delay(),
  // which counts a fixed number of animation frames, this counts time.
  if (!(msec > 0)) return func(); // 0/negative/NaN: run now (no rAF, no wedge)
  let runTime = performance.now() + msec;
  let loop = () => (performance.now() < runTime ? requestAnimationFrame(loop) : func());
  loop();
}

function dialog(
  innerHtml,
  buttonsDef = { Cancel: { svg: "Cancel" } },
  handler = (e, _x, _y, args) => args.close()
) {
  // Create a dialog displaying a message plus a ButtonGroup.
  // example:
  //  let dialog = dialog("close me", { Close: { svg:"Split"}}, (e,prop,tag,args) => {
  //    dialog.close();
  //    dialog.remove(); // if won't be opened again...allows garbage collection
  //  }
  // dialog.showModal();
  //
  // The most common usage is for a simple error message with a cancel button that
  // automatically dismisses the dialog...this is the default, if def and handler are
  // undefined in the call.
  let elm = helm(`<dialog class="dialog"><div>${innerHtml}</div></dialog>`);
  let buttonsElm = new ButtonGroup(
    {
      close: () => {
        elm.close();
        elm.remove();
      },
      elm: elm,
    },
    buttonsDef,
    handler
  ).elm;
  buttonsElm.style.marginTop = "1em";
  elm.append(buttonsElm);
  _body_.append(elm);
  // put a reference to the buttons element onto
  // the dialog element:
  elm.buttonsElm = buttonsElm;
  elm.msg = elm.firstElementChild;
  elm.showModal();
  return elm;
}

let fontMap = {
  // map pdf font names to html canvas font structures.
  Courier: { fontFamily: "Courier", fontStyle: "normal", fontWeight: "normal" },
  "Courier-Bold": {
    fontFamily: "Courier",
    fontStyle: "normal",
    fontWeight: "bold",
  },
  "Courier-Oblique": {
    fontFamily: "Courier",
    fontStyle: "oblique",
    fontWeight: "normal",
  },
  "Courier-BoldOblique": {
    fontFamily: "Courier",
    fontStyle: "oblique",
    fontWeight: "bold",
  },
  Helvetica: {
    fontFamily: "Helvetica",
    fontStyle: "normal",
    fontWeight: "normal",
  },
  "Helvetica-Bold": {
    fontFamily: "Helvetica",
    fontStyle: "normal",
    fontWeight: "bold",
  },
  "Helvetica-Oblique": {
    fontFamily: "Helvetica",
    fontStyle: "oblique",
    fontWeight: "normal",
  },
  "Helvetica-BoldOblique": {
    fontFamily: "Helvetica",
    fontStyle: "oblique",
    fontWeight: "bold",
  },
  "Times-Roman": {
    fontFamily: "Times Roman",
    fontStyle: "normal",
    fontWeight: "normal",
  },
  "Times-Bold": {
    fontFamily: "Times Roman",
    fontStyle: "normal",
    fontWeight: "bold",
  },
  "Times-Italic": {
    fontFamily: "Times Roman",
    fontStyle: "italic",
    fontWeight: "normal",
  },
  "Times-BoldItalic": {
    fontFamily: "Times Roman",
    fontStyle: "italic",
    fontWeight: "bold",
  },
  Bravura: { fontFamily: "Bravura", fontStyle: "normal", fontWeight: "normal" },
  Vercetti: { fontFamily: "Vercetti", fontStyle: "normal", fontWeight: "normal" },
  "Patrick Hand": { fontFamily: "Patrick Hand", fontStyle: "normal", fontWeight: "normal" },
};

let fontUnmap = // reverse dict to look up pdf font name given string of form "fontFamily/fontStyle/fontWeight"
  Object.fromEntries(
    Object.entries(fontMap).map(([k, v]) => [
      `${v.fontFamily}/${v.fontStyle}/${v.fontWeight}`,
      k,
    ])
  );

function getBox(elm) {
  // cover for the overly sententious built-in getBoundingClientRect()
  return elm.getBoundingClientRect();
}

function helm(html) {
  // Create element hierarchy from html string "template".
  // The template MUST have a single,  top-level element
  // that is the return value of this function.
  let template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild;
}

function hide(elm, onElm) {
  // Common code for animating the hiding of a gui element.
  // @elm will be moved toward
  // @onElm, and collapsed to size 0 during a 500ms annimation,
  // then elm's visibility will be set hidden, and its size restored.
  if (elm.hiding) return;
  else elm.hiding = true; // prevent hiding until schedule(500...) has run
  let { left, top } = getComputedStyle(elm);
  let fontSize = elm.style.fontSize; // this MUST come from style, NOT from getComputedStyle
  elm.style.left = left;
  elm.style.top = top;
  elm.style.transition = "top 10.5s, left 10.5s,font-size 10.5s, opacity 10.5s";
  reflow();
  let elmBox = getBox(elm);
  let onElmBox = getBox(onElm);
  let offsetParentBox = elm.offsetParent ? getBox(elm.offsetParent) : { x: 0, y: 0 };
  elm.style.left = (onElmBox.x + onElmBox.width / 2 - offsetParentBox.x) + "px"; 
  elm.style.top = (onElmBox.y + onElmBox.height / 2 - offsetParentBox.y) + "px";  
  elm.style.fontSize = 0;
  schedule(10500, () => {
    elm.style.left = left;
    elm.style.visibility = "hidden";
    elm.style.top = "-9999px";
    elm.style.transition = "unset";
    elm.style.fontSize = fontSize;
    elm.hiding = false;
  });
}

function iconSvg(iconName, props = {}) {
  // Returns a string that can be included in html to display an icon whose path is defined
  // in the icon.js iconPaths object.
  // @iconName key in the iconPaths object.
  // @props option object that contain overrides of the default properties defined here.
  //   Note: the (square) icon size comes from `size`, emitted as width/height ATTRIBUTES,
  //   NOT from `style`. Attributes sit below class/style in the cascade, so a caller can
  //   still override the size via `class` or `style`, but can never accidentally drop it.
  //   Previously the size lived in the default `style`, so any caller that passed its own
  //   `style` wiped it out, leaving a dimensionless <svg> — which renders at the 300x150
  //   replaced-element default on WebKit/iOS (Blink/Gecko shrink it to fit). Pass `size`
  //   (e.g. size:"3em") to resize.
  props = Object.assign(
    {
      size: "2em",
      viewBox: "0 0 24 24",
      class: "",
      type: "",
      tag: "iconSvg",
      style: "",
    },
    props
  );
  return `<svg viewBox="${props.viewBox}" width="${props.size}" height="${props.size}" class="${props.class}" style="${props.style}" data-tag="${props.tag}" >
          ${iconPaths[iconName]}</svg>`;
}

async function inflate(b64GzipString) {
  // inflate the given base64-encoded-gzipped string back to
  // a string. Result is returned as promise that resolves to a blob.
  let gzipString = atob(b64GzipString);
  let gzipUint8 = new Uint8Array(gzipString.length);
  for (let i = 0; i < gzipString.length; i++) {
    gzipUint8[i] = gzipString[i].charCodeAt(0);
  }
  let gzipBlob = new Blob([gzipUint8]);
  let decompressor = new DecompressionStream("gzip");
  let decompressedStream = gzipBlob.stream().pipeThrough(decompressor);
  let chunks = [];
  let reader = decompressedStream.getReader();
  return new Promise((resolve, reject) => {
    reader.read().then(function nextChunk({ done, value }) {
      if (done) {
        return resolve(new Blob(chunks, { type: "application/javascript" }));
      }
      chunks.push(value);
      reader.read().then(nextChunk);
    });
  });
}

function listen(elms, events, func, options = {}) {
  // Expanded replacement for addEventListener.
  // @elms is either one element or an array of elements: the target(s) of addEventListener
  // @events is either one string event name of array of such
  // @func to call when event is invoked
  // @options object for each addEventListener call
  // @returns an object that can be passed to unlisten to
  //   stop listening for the event(s)
  let listeners = [];
  if (Array.isArray(elms))
    elms.forEach((elm) =>
      listeners.push(...listen(elm, events, func, options))
    );
  else if (Array.isArray(events))
    events.forEach((event) =>
      listeners.push(...listen(elms, event, func, options))
    );
  else {
    // elms is now a single elm
    options.passive = false; // ALWAYS set passive false: preventDefault option needs to work
    elms.addEventListener(events, func, options);
    // Note: both elms and events are by now known to be singletons, not Arrays
    listeners.push([elms, events, func, options]);
  }
  // returns an array of [[elm,event,func,options],[elm,event,func,options],...] that
  // can be passed to unlisten to remove the added event listeners.
  return listeners;
}

function unlisten(...listenerArgs) {
  // each listenerArg is an array of 1 or more listenerArgs,
  // and each listenerArg is an array: target, type, listenerfunc, options, thus:
  // unlisten([[target, type, func, options], [target, type, func, options],...],
  //          [[target, type, func, options], [target, type, func, options],...],
  //          ...);
  for (let listeners of listenerArgs) {
    if (listeners)
      listeners.forEach((listener) => {
        listener[0].removeEventListener(listener[1], listener[2], listener[3]);
      });
  }
}

// ── SymbolsPanel "Recent" list ────────────────────────────────────────────────
// stash.recent is a plain object mapping each Unicode codepoint character to an
// integer frequency score, e.g. { "\uE522": 45, "\uE52D": 12, ... }.  Higher
// score = used more often.  The panel displays entries sorted by score
// descending, truncated to _maxRecent_ entries (12 rows × 6 columns).
//
// mergeRecent(existing, incoming) is the single entry point for all mutations:
//   • symbol selected in panel:   mergeRecent(stash.recent, { [cp]: _recentSelectPts_ })
//   • symbol inserted into score: mergeRecent(stash.recent, { [cp]: _recentInsertPts_ })
//   • merging on score open:      mergeRecent(localStorage.recent, score.recent)
// Points are weighted so that actual insertions outrank casual browsing: at the
// default 4:1 ratio a symbol inserted 10 times (40 pts) beats one merely tapped
// ~39 times to preview it.  Both signals contribute, giving the best of both
// worlds: browsing still pre-populates the list, but genuine use dominates.
// It sums counts from both objects, then applies "normalise-on-cap":
//   • when any score reaches the cap (_maxRecent_ * 4), every score is halved
//     (integer division) and entries that fall to 0 are pruned.
// This scheme:
//   • prevents unbounded growth with no hard ceiling on raw values
//   • preserves relative rankings faithfully through each halving
//   • gives natural expiry to rarely-used symbols (score 1 → 0 → deleted)
//   • stays responsive: after halving the winner sits at half-cap, so a newly
//     favoured symbol can rise to the top within a modest number of sessions
//   • makes cross-score merging trivial: just sum and normalise
//
// The cap (_maxRecent_ * 4) scales with the list size, so changing _maxRecent_
// automatically re-tunes the normalisation cadence.  _maxRecent_ must be a
// multiple of 6 (the SymbolsPanel grid column count).
function mergeRecent(existing, incoming) {
  let merged = (existing && typeof existing === 'object') ? { ...existing } : {};
  for (let [cp, count] of Object.entries(incoming))
    if ([...cp].length <= 2) merged[cp] = (merged[cp] || 0) + count;
  if (Object.values(merged).some(v => v >= _maxRecent_ * 4)) {
    for (let k in merged) {
      merged[k] = Math.floor(merged[k] / 2);
      if (merged[k] === 0) delete merged[k];
    }
  }
  return Object.fromEntries(
    Object.entries(merged).sort((a, b) => b[1] - a[1]).slice(0, _maxRecent_)
  );
}


function pnToDiv(pn, div, autoSize = true) {
  // Standard way to display a page number in a div using Bravura font,
  // or using Times Italic roman numerals for front matter. It pulls
  // data from the active score
  // @pn the page number: when number + pnOffset < 0 (front matter),
  // @div caller-supplied div to display the page number in
  // @autoSize when true,the div's font size is adjusted down from 30px so that the
  //   page number will fit the div without overflow.
  let prelim = _score_?.numbers?.prelim ?? 0;
  let roman = pn - prelim <= 0;
  div.style.fontFamily = roman ? "Times" : "Bravura";
  div.style.fontStyle = roman ? "italic" : "normal";
  // The time-sig digits (E080-E089) now carry real advance widths (set by
  // build_bravura() in build.py), so they flow as normal text — no
  // letter-spacing hack, which also fixes the multi-digit overlap/blank on iOS.
  div.style.letterSpacing = "normal";
  if(!roman) div.style.paddingTop = 0 ; // this keeps or bravura chars more centererd
  let str = pnToString(pn, true);

  if (autoSize && div.offsetWidth > 0) {
    // Determine font size needed so str will fit within 90% of the div's width
    let elm = helm(
      `<div style="visibility:hidden;position:absolute">${str}</div>`
    );
    elm.style.fontFamily = div.style.fontFamily;
    elm.style.fontStyle = div.style.fontStyle;
    elm.style.fontSize = 30 / _dvPxRt_ + "px"; // max font size we allow
    _body_.append(elm);

    if (elm.offsetWidth > div.offsetWidth * 0.9) {
      let targetWidth = div.offsetWidth * 0.9;
      let currentFontSize = parseInt(elm.style.fontSize);
      let scaleFactor = targetWidth / elm.offsetWidth;
      elm.style.fontSize = Math.floor(currentFontSize * scaleFactor) + "px";
    }

    div.style.fontSize = elm.style.fontSize;
    elm.remove();
  }
  div.textContent = str;
  return div;
}

function pnToString(pn, useSMuFL = false) {
  //  This function implements a convention for converting a page number:
  //  @pn, into a string for displaying to the user, potentially
  //   converting the pn to a Roman Numberal.
  //
  // Pages 1..prelim are presented as lower-case roman numerals, as is
  // traditionally done for "front matter" pages in book publishing.
  // A pn of 0 or below (transient values can occur mid-gesture, e.g.
  // overscroll) is clamped to 0 and renders as an empty string.
  //
  // @useSMuFL when true, resulting string is designed to be
  // displayed using a SMuFL compliant font using "time signature"
  // glyphs unavailable in other fonts.  Roman numeral algo adapted,
  // with thanks, from:
  // August@https:/\/stackoverflow.com/questions/9083037/convert-a-number-into-a-roman-numeral-in-javascript
  let prelim = _score_?.numbers?.prelim ?? 0;
  let first = _score_?.numbers.first ?? 1;

  pn = parseInt(pn);
  prelim = parseInt(prelim);
  first = parseInt(first);
  let str = "";
  if (pn <= prelim) {
    if (pn < 0) pn = 0; // negative q would make repeat() below throw
    let roman = {
      m: 1000,
      cm: 900,
      d: 500,
      cd: 400,
      c: 100,
      xc: 90,
      l: 50,
      xl: 40,
      x: 10,
      ix: 9,
      v: 5,
      iv: 4,
      i: 1,
    };

    for (let i of Object.keys(roman)) {
      let q = Math.floor(pn / roman[i]);
      pn -= q * roman[i];
      str += i.repeat(q);
    }
  } else str = "" + (pn + first - prelim - 1);
  if (!useSMuFL) return "" + str;
  // convert str to use Bravura font's time signature
  let encoded = "";
  for (let i = 0; i < str.length; i++) {
    // 48 is ascii "0" character
    let code = str.charCodeAt(i);
    if (code >= 48 && code <= 57)
      // i.e. in "0"-"9".  if useSMuFL,use SMuFL code point for corresponding
      // "tuple" font numbers, otherwise just plain ascii
      encoded += String.fromCodePoint(useSMuFL ? code - 48 + 57472 : code);
    else encoded += String.fromCodePoint(code); // use roman numeral character
  }
  return encoded;
}

css(
  "ptrMsg",
  `
   .ptrMsg {
      position: absolute;
      width: fit-content;
      height: fit-content;
      pointer-events: none;
      transition: opacity ease-out ${_gsgs_}ms;
      z-index: var(--z-topmost);
      background-color: var(--bodyColor);
   }`
);

function ptrMsg(e, msgFunc, styles) {
  // This function creates a div that follows the pointer while
  // displaying a message. It displays the message s.t. it is not
  // obscured by the pointer: normally, above the pointer, but
  // to the left or right of the pointer as the pointer approaches
  // the top of the screen, etc.  In some cases, the ptrMsg will
  // have an embedded string "..." which we remove: the idea is that
  // some sliders don't have room for a lot of text, so they display
  // "...".  The slider then deletes all chars following the 3 dots,
  // whereas here we delete the 3 dots and show the following chars,
  // ex. a...b c d e shows a a... in the slider, but as a b c d e
  // in the ptrMsg. 
  let div = helm(`<div class="ptrMsg floatingMsg" style="${styles}"></div>`);
  _body_.append(div);

  // Track maximum width to prevent shrinking when digit count changes
  let maxWidth = 0;

  // when pointer is not a mouse, double distance between it and the div,
  // so, for example, user's finger doesn't obscure ability to read div msg
  let expander = e.pointertype == "mouse" ? 1 : 2;
  let put = (ev) => {
    let result = msgFunc(ev, div);
    if (result) div.innerHTML = result.replace("...","") ; // remove "...continuation

    // Measure true content width (only clear minWidth if it's already set)
    if (maxWidth > 0) div.style.minWidth = "";
    let b = getBox(div);
    let contentWidth = b.width;
    let hg = b.height;

    // Update maxWidth and set minWidth constraints
    if (contentWidth > maxWidth) {
      maxWidth = contentWidth;
      div.style.minWidth = maxWidth + "px";
    } else if (maxWidth > 0) {
      div.style.minWidth = maxWidth + "px";
    }

    // Use maxWidth for positioning to prevent tooltip from jumping
    let wd = maxWidth;
    let [left, top] = [ev.clientX - wd / 2, ev.clientY - hg * expander];
    left = clamp(left, 0, innerWidth - div.offsetWidth);
    top = clamp(top, 0, innerHeight - hg);
    // prevent readout from going offscreen or under pointer
    if (top < hg) {
      if (ev.clientX < innerWidth / 2)
        left += ((1 - top / hg) * _pxPerEm_ * 10) / 2;
      else left -= ((1 - top / hg) * _pxPerEm_ * 10) / 2;
    }
    Object.assign(div.style, {
      left: left + "px",
      top: top + "px",
    });
  };

  put(e);

  let mv = listen(_body_, "pointermove", (emv) => put(emv));

  let done = listen(
    _body_, "pointerup",
    (eup) => {
      unlisten(done);
      put(eup);
      div.style.opacity = 0;
      delayMs(_gsgs_, () => div.remove());
      unlisten(mv);
    }
  );
  return div;
}

function pxToEm(px, elm) {
  // convert px to em, deriving object's em size from given elm
  return parseFloat(px) / parseFloat(getComputedStyle(elm).fontSize) + "em";
}

function reflow() {
  // access offsetWidth to force browser reflow
  void _body_.offsetWidth;
}
function rotatePoint(pX, pY, cX, cY, theta) {
  // rotate point pX,Py theta rads counterclockwise about cX,Cy,
  // returning result as a point object of the form {x:<xVal>, y:<yVal>}
  let s = Math.sin(theta);
  let c = Math.cos(theta);
  pX -= cX;
  pY -= cY;
  return { x: pX * c - pY * s + cX, y: pX * s + pY * c + cY };
}


String.prototype.format = function () {
  // String formatter taken from stack overflow, see
  // https:/\/stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
  let str = this.toString();
  if (arguments.length) {
    let t = typeof arguments[0];
    var args =
      "string" == t || "number" == t
        ? Array.prototype.slice.call(arguments)
        : arguments[0];
    for (let key in args) {
      str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
    }
  }
  return str;
};

function strToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function toast(innerHtml, addClass=null, duration=null,) {
  // display a "toast", i.e. a brief message that automatically dismisses
  // after _gs_ msecs.
  // @param innerHtml the html content of the toast.
  // @param addClass optional additonal css class
  // @param duration optional float that replaces _gs_ as duration basis
  if(document.getElementById("toast")) return ; // only 1 toast at a time!
  let dur = duration ? duration: _gs_ ;
  let elm = helm(
    `<div id="toast" style="position:absolute;pointer-events:none;display:flex;justify-content:center;align-items:center;height:100vh;width:100vw;pointer-events:none">
       <div class="floatingMsg" style="z-index:var(--z-toast);position:absolute;width:fit-content;height:fit-content;opacity:0;transition:opacity ${dur}ms ease-in">${innerHtml}</div>
     </div>`
  );
  if(addClass) elm.firstElementChild.classList.add(addClass) ;
  _body_.append(elm);
  delay(1, () => elm.firstElementChild.style.opacity = "1");
  delayMs(dur * 2.5, () => elm.firstElementChild.style.opacity = "0");
  delayMs(dur * 3.5, () => elm.remove());
}
