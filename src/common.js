// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https://www.gnu.org/licenses/>.
**/

export { animate, css, cssIndex, flung, saveLocal, Schedule, schedule, Spot, clamp, helm, dataIndex, clearChildren, delay, delayMs, pxToEm, fontMap, fontUnmap, getBox, hide, iconSvg, inflate, listen, dialog, mvmt, pnToDiv, pnToString, rotatePoint, ptrMsg, unlisten, strToHash, toast, ButtonGroup, SliderGroup, TabView, Timer, ColorPicker };
import { iconPaths } from "./icon.js";
// -skip

Element.prototype["replace"] = function (newElm) {
  this.replaceWith(newElm);
  if (this.dataset.tag) newElm.dataset.tag = this.dataset.tag;
  return newElm;
};

// properties defined on the window "global" namespace
// are distinguished using the convention of leading+trailing underscores:

window._podiumVersion_ = "0.9";
window._body_ = document.body;
window._dvPxRt_ = 1 + (window.devicePixelRatio - 1) * 0.3;
window._gs_ = 0.618; // golden section
window._gsgs_ = _gs_ * _gs_; // shorter golden section!
window._longPressMs_ = 750;
window._mobile_ = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
window._frMs_ = .06 ; // initial estimate of number of frames per millisecond (60fps)
window._pxPerEm_ = 25; // initial document.body's font size value: defines pixels in 1 em

//  svg textures used as background images:
let sandSvg =
  // Note: you must escape second / in a url, otherwise builder.py will parse
  // them as comments.
  "url('data:image/svg+xml;base64," +
    window.btoa(`
      <svg width='3em' height='3em' viewBox='0 0 175 175' xmlns='http:/\/www.w3.org/2000/svg'>
        <filter id='noiseFilter'>
          <feTurbulence type='turbulence' baseFrequency='0.5' numOctaves='5' stitchTiles='stitch'/>
        </filter>  
        <g><rect width='100%' height='100%' filter='url(#noiseFilter)'/></g>
      </svg>`) +
    "')";

let paperSvg =
  // Note: you must escape second / in a url, otherwise builder.py will parse
  // them as comments.
  "url('data:image/svg+xml;base64," +
    window.btoa(`
      <svg width='3em' height='3em' viewBox='0 0 100 100' xmlns='http:/\/www.w3.org/2000/svg'>
        <filter id='noiseFilter'>
           <feTurbulence type="fractalNoise" baseFrequency='0.05' result='noise' numOctaves="3" />
           <feDiffuseLighting in='noise' lighting-color='#F4D6AE' surfaceScale='3'>
              <feDistantLight azimuth='45' elevation='70' />
           </feDiffuseLighting>
        </filter>  
        <rect width='100%' height='100%' filter='url(#noiseFilter)'/>
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
    if (sheet.ownerNode.dataset.tag == name) {
      if (!selector) return sheet;
      for (let rule of sheet.rules) {
        if (rule.selectorText == selector) return new RegExp(`${key}: ([^;]*);`).exec(rule.cssText)[1];
      }
    }
  }
}

let css = (name, rules) => {
  // define a named css style sheet
  document.head.insertAdjacentHTML("beforeend", `<style data-tag="${name}">` + rules + "</style>");
  return cssIndex(name);
};

css(
  //  common css declarations:
  "common",
  `
  :root {
    --textShadow: .15em .15em .2em #2228; 
    --bodyShadow: drop-shadow(.1em .125em .2em #6668);
    --borderRadius: .8em;
    --border: .2em solid white;
    --bodyColor: #c9c9c9;
    --panTexture: ${sandSvg};
    --layoutTexture: ${paperSvg};
    --panelWidth: 12em;
  }
  body {
    font-family: Arial;
    overflow:hidden;
    margin: 0;
    padding: 0;
    background-color: var(--bodyColor);
    height: 100svh; /* small (min) viewport height */
    width: 100lvw;  /* large (max) viewport width */
    position:absolute;
    font-size: ${_pxPerEm_}px ;
    left:0;
    top:0 ;
    user-select: none ;
  }
  *:not(input):not(textarea) {
    -webkit-user-select: none;  /* disable selection/Copy of UIWebView */
    -webkit-touch-callout: none; /* disable the IOS popup when long-press on a link */
  }
  hr {
    border: .12em solid white;
    margin-top: 2em;      
  }
  select {
    border-radius: var(--borderRadius);
    background-color: #0000 ;
    height:2em;
    font-size: .6em;
    margin:0 1em 1em 0em;
    text-align: center ;
    width:90%;
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
    height:0 ;
    display:flex ;
    justify-content: space-around ;
    align-items:center ;
    font-size:1em ;
  }
  .pz-set
    /* marker for root-div of elements that *have been* pan-zoomed by user interaction */
    {}
    a:link,a:visited, a:active {
      color:blue;
      background:inherit;
  }
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
    outline: none ;
  }
  .fadeLeft {
    z-index: 10;
    position: absolute;
    left: 0px;
    display: inline;
    width: .5em;
    background-image: linear-gradient(to left, transparent, #bebebe 53%, #b4b4b4);
  }
  .fadeRight {
    z-index: 1;
    position: absolute;
    right: 0px;
    display: block;
    width: .5em;
    background-image: linear-gradient(to right, transparent, #bebebe 53%, #b4b4b4);
  }
  /* Create illusion of a raised edge */
  .raisedEdge {
    border-radius: var(--borderRadius) ;
    filter: var(--bodyShadow) ;
    box-shadow: 0.1em 0.1em 0.6em #888 inset, 0 0 19px #0000 ;
    background: var(--bodyColor);
  }
  /* Center child(ren) both vert/horz */
  .centerChild {
    display:flex ;
    align-items: center ;
    justify-content: center ;
  }
}`
);

/**
class ButtonGroup
   Gui widget displaying a group of buttons as a unit.
**/

class ButtonGroup {
  static toggleButtonSvg = `url('data:image/svg+xml;base64,window.btoa(<svg width="100%" height="100%" viewBox="0 0 24 24" xmlns="http:/\/www.w3.org/2000/svg"><path style="fill:none;stroke:black;stroke-width:0.5px" d="M5 15.5L4 16.5L5 17.5M19 15.4L20 16.5L19 17.5"/></svg>')`;

  static css = css(
    "ButtonGroup",
    `
    .ButtonGroup {
      display:flex;
      justify-content:space-around ;
      margin-top: .5em;
    }
    .ButtonGroup__button {
      text-align:center ;
      font-size:.8em;
      color: #444 ;
      width: 3.5em ;
      height: 3.5em ;
      padding-top:.2em;
      white-space: nowrap;        
    }
    .ButtonGroup__icon {
    }
    .ButtonGroup__button-active {
      box-shadow: 0.1em 0.1em 0.2em #aaa inset, -0.1em -0.2em 0.2em #bbb inset ;
      border-radius:0.2em;        
      background: #bbb8;
    }
    .ButtonGroup__button-toggle {
      background-image: ${ButtonGroup.toggleButtonSvg};
    }
    .ButtonGroup__button-disabled {
      color: #777;
      left: 0;
    }
    .ButtonGroup__button-selected {
      background: #7778;
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
      if (!toggle || !(property in dataIndex("property", this.elm))) this.elm.append(elm);
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
      if (onOff !== undefined) {
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
        elm.classList.add("ButtonGroup__disabled");
        iconElm.classList.add("ButtonGroup__disabled");
      } else {
        elm.classList.remove("ButtonGroup__disabled");
        iconElm.classList.remove("ButtonGroup__disabled");
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
          if (onOff !== undefined) {
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
    for (let hexColor of recentColors) elm.append(helm(`<option value="${hexColor}"></option>`));
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
       margin: 0 1.2em 0 2.2em;
       position:relative;
       text-align: center;
       font-size:.8em;
       display:flex ;
       align-items:center ;
      }
      .ColorPicker__color {
        border-color:#0000;
        background:#0000;
        width:100% ;
        height:3em;
     }
     .ColorPicker__alpha {
        flex-basis: 50%;
        margin-left: 1em ;
     }
     .ColorPicker__alphaSlider {
      z-index: 1000;
      background-color:white;
      border-radius: var{--borderRadius};
      padding:.5em 1em 1.25em 1em;
      filter: var(--bodyShadow);
      position:absolute;
      left:-2.7em;
      width:80%;
      border-radius:.8em;
     }
      `
  );

  elm = helm(`
   <div>
   <div style="font-size:.8em" data-tag="title"></div>
   <div class="ColorPicker">
      <input data-tag="color" class = "ColorPicker__color" type="color" colorpick-eyedropper-active="true" list="recentColors"></input>
      <svg data-tag="alpha" class="ColorPicker__alpha" viewBox="0 0 24 24">
          <circle style="fill:#fff;" cx="8" cy="12" r="8"/>
          <circle style="fill:#aaa;" cx="8" cy="12" r="2"/>
          <circle data-tag="alphaCircle" style="fill:#888;opacity:1;" cx="12" cy="12" r="8"/>
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
    this.alphaCircle.style.fill = rgb;
    this.alphaCircle.style.opacity = alpha;

    let alphaSlider = new SliderGroup(stash, { alpha: { min: 0, max: 1, step: 0.01, value: `${rgb}`, msg: (tag, value) => `Opacity: ${Math.round(value * 100)}%` } }, () => {
      this.alphaCircle.style.opacity = stash.alpha;
      if (handler) handler(stash.rgb, stash.alpha);
    });

    alphaSlider.elm.classList.add("ColorPicker__alphaSlider", "void");
    this.alphaSlider.replaceWith(alphaSlider.elm);

    listen(this.color, ["input", "change"], (e) => {
      this.alphaCircle.style.fill = stash.rgb = this.color.value;
      if (handler) handler(stash.rgb, stash.alpha);
      if (e.type == "change") ColorPicker.pushRecentColor(stash.rgb);
    });

    listen(this.alpha, "pointerup", () => {
      if (!alphaSlider.elm.classList.toggle("void"))
         delay(1, () => listen(_body_, "pointerup", () => alphaSlider.elm.classList.add("void"), { once: true }));
      alphaSlider.refresh() ; 
    });
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
    return ["min", "max", "value", "step", "dilate"];
  }

  static css = css(
    "PodiumSlider",
    `.Slider {
       position:absolute;
       width: calc(100% - 4em);
       height: 2em;
       left: 2em ;
     }
     .Slider__track {
       flex-box ;
       position:absolute;
       top: calc(50% - .2em);
       height:.5em ;
       width:100%;
       background: #aaa;
       border-radius:.8em;
     }
     .Slider__knob {
       position:absolute;
       width:3.5em ;
       height:2.6em ;
       top: calc(50% - 1.3em) ;
       background-image: var(--panTexture);
     }
     .Slider__knob__indicator {
        position:relative;
        pointer-events:none ;
        border-radius:100%;
        width:.6em ;
        height:.6em ;
        top:calc(50% - .3em);
        left:calc(50% - .3em);
        background: #888;
     }
     .Slider__knob__indicator-active {
        position: relative ;         
        background-color: lawngreen;
     }
     `
  );

  elm = helm(`
    <div data-tag="slider" class="Slider">
       <div data-tag="track" class="Slider__track"></div>
       <div data-tag="knob" class="Slider__knob raisedEdge">
          <div data-tag="indicator" class="Slider__knob__indicator"></div>
       </div>
     </div>`);

  adjusting = false;
  pos = 0; // in [0,1]
  sliderBox;
  knobBox;

  constructor() {
    super();
    // turn attributes into instance vars:
    let setAttr = (key) => (this[key] = this.hasAttribute(key) ? parseFloat(this.getAttribute(key)) : this[key]);
    ["min", "max", "value", "step"].forEach((attr) => setAttr(attr));
    this.disabled = this.hasAttribute("disabled") ? true : this.disabled;

    Object.assign(this, dataIndex("tag", this.elm));
    this.append(this.elm);

    listen([this.knob, this.track], "pointerdown", (e) => {
      e.stopImmediatePropagation();
      this.adjusting = true;
      this.indicator.classList.add("Slider__knob__indicator-active");
      this.updateGeometry();
      let {knobBox, sliderBox} = this ;
      this.knob.setPointerCapture(e.pointerId);

      let origin = e.clientX ;
      // This function converts pointer position into a value in 0,1
      // used in  call of this.setPos(pos). The also allows a user to gain
      // increased precision by moving the pointer further away,
      // vertically, from the sliderBox.  clientPos is clientX, and
      // delta is absulute value of pixel distance between clientY and
      // middle of sliderBox
      let set = (clientPos, delta) => {
        if(delta / knobBox.height <= 1) origin = clientPos ;
        let mvm = clientPos - origin ;
        // the "* 5" in following increases the "sensitivity" of the slider as
        // delta increases
        delta = Math.max(1, (delta / knobBox.height) * 5)  ;
        let posPx = origin + (mvm / delta);
        let posFrac = (posPx - sliderBox.x) / sliderBox.width ;
        this.setPos(clamp(posFrac, 0, 1)) ;
      }

      set(e.clientX, Math.abs(e.clientY - sliderBox.top - sliderBox.height/2));

      let mv = listen(this.knob, "pointermove", (emv) => {
        e.stopImmediatePropagation();

        mvmt(e,emv) ;
        if(e.moved) {
          set(emv.clientX, Math.abs(emv.clientY - sliderBox.top - sliderBox.height/2)); 
          let ein = new Event("input", {bubbles:true}) ;
          ein.clientX = emv.clientX ; ein.clientY = emv.clientY ;
          this.dispatchEvent(ein) ;
        }
      });

      listen(this.knob, "pointerup",(eup) => {
        e.stopImmediatePropagation();
        unlisten(mv);
        this.adjusting = false;
        this.indicator.classList.remove("Slider__knob__indicator-active");
        // notify listeners that slider is finished
        this.dispatchEvent(new Event("change", { bubbles: true }));
      },
      { once: true }
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
      this.updateGeometry();
    } else {
      this.updateGeometry();
      let pos = (is - this.min) / (this.max - this.min);
      this.setPos(pos);
    }
  }

  setPos(pos) {
    // set the pos, which represents slider position in [0,1]
    this.pos = pos;
    let value = pos * (this.max - this.min) + this.min;
    this.value = (Math.round(value / this.step) * this.step).toPrecision(6); // discrete-ize value in this.step
    //    let knobLeft = pos * this.sliderBox.width - this.knobBox.width / 2;
    let knobLeft = pos * this.sliderBox.width - this.knobBox.width / 2;
    //    this.knob.style.left = knobLeft + "px";
    //    this.knob.style.left = knobLeft / parseFloat(getComputedStyle(this.slider).fontSize) + "em";
    this.knob.style.left = pxToEm(knobLeft, this.slider);
    //    this.knob.style.left = toEm(knobLeft * parseFloat(getComputedStyle(this.slider).fontSize));
  }
}

window.customElements.define("pod-slider", PodiumSlider);

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

window.customElements.define("pod-input", PodiumInput, { extends: "input" });

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
      if (this.paused || performance.now() < this.runTime) this.af = requestAnimationFrame(loop);
      else this.callable();
    }).bind(this);
    loop();
    return this;
  }

  cancel() {
    // Cancel the next run. After this, call run(...) again to restart, if desired.
    this.cancelled = true;
  }
///
  elapsed() {
    // Return number of msecs this Schedule has been running. 
    return performance.now() - (this.runTime - this.delta) ;
  }

  pause() {
    this.paused = performance.now() ;
  }

  resume() {
    if(this.paused) this.runTime += performance.now() - this.paused ;
    this.paused = 0 ;
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
      backdrop-filter: blur(.3em) ;
      opacity: 0 ;
      transition: opacity 1s ease-in;
      background: radial-gradient(circle at center,#eee 0, #eee 10em, transparent 20em);
      width:100%;
      height:100%;
      display:flex;
      align-items:center ;
      justify-content:center;
      position:absolute;
      z-index:100000;
      }
      .Shade__body {
       font-family:Bravura;
       font-size: ${60 / _dvPxRt_}px;
       line-height: ${60 / _dvPxRt_}px;
       animation: colors 3s linear infinite;
       text-align: center ;
      }
      @keyframes colors {
      	0% { color: #88f; }
      	33% {color: #8f8; }
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
  constructor() {
    Object.assign(this, dataIndex("tag", this.elm));
    listen(this.cancel, "click", () => this.hide());
  }

  show(message = "Loading") {
    this.message = message;
    this.msgStack.push(message);
    this.msg.innerHTML = message;
    if (!this.elm.attached) {
      _body_.append(this.elm);
      this.elm.style.opacity = 0;
      this.elm.style.transition = "opacity 1s ease-in";
      this.scheduler.run(1500, () => (this.elm.style.opacity = 1));
    }
  }

  update(message) {
    this.msg.innerHTML = message;
  }

  hide() {
    this.msgStack = [];
    this.elm.style.transition = "opacity .5s ease-in";
    this.elm.style.opacity = 0;
    this.scheduler.run(500, () => this.elm.remove());
  }

  pop() {
    if (this.msgStack.length == 0) return;
    this.msgStack.pop();
    this.msgStack.length == 0 ? this.hide() : this.show(this.msgStack[this.msgStack.length - 1]);
  }
}

window._shade_ = new Shade();

/**
class SliderGroup
   Displaying one of more slider widgets
**/

class SliderGroup {
  static css = css(
    "SliderGroup",
    `.SliderGroup {
       font-size:.8em;
       color:#333;
       margin-top:.8em;
       text-align:center;
      }
    .SliderGroup__SliderBlock {
       margin-bottom: .5em;
     }
     .SliderGroup__SliderBlock__Slider {
        display:block ;
        width: 100% ;
        height: 2em;
        margin-top: .5em;
     }
     .SliderGroup__SliderBlock__Slider-disabled {
       opacity:  0.35;
       pointer-events: none;
     }
   `
  );

  elm = helm(`<div data-tag="sliderGroup" class="SliderGroup">`);

  dataIndex = null;
  handler = null;

  constructor(props, defs, handler) {
    // defs is an object thus: { tag:{min:,max:,msg:, <<disabled:trueOrFalse>>,},tag:{...}, ...}
    // props is an object that we can read/write (usually a menu cell's stash var or a Score's stash var,
    // but any object will do), to read/write the slider value from/to.
    // handler is a (possibly empty) callback invoked when slider value changes,
    //    throttle: <<msecs>>, throttle calling of any handler
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
          disabled: false,
          throttle: -1,
        },
        defs[tag]
      );
      defs[tag] = tagDef;
      let elm = helm(
        `<div class="SliderGroup__SliderBlock" data-tag="${tag}">${this.formatMsg(tag)}
             <pod-slider class="SliderGroup__SliderBlock__Slider" data-tag="${tag}_slider"
               min="${tagDef.min}" max="${tagDef.max}" step="${tagDef.step}" value="${tagDef.value}">
          </pod-slider></div>`
      );
      this.elm.append(elm);
    }
    this.dataIndex = dataIndex("tag", this.elm);
    listen(this.elm, ["input", "change"], this.handle.bind(this));

    this.refresh();
  }

  formatMsg(tag) {
    // Formats and returns string value of this.defs[tag].msg:
    // it  can be a callback that returns a string, or it can be a string
    // that will be formatted using {min},{max},{value},{step}
    // substitutions. If value is non-null, it's used instead of
    // the value in the tag def: see this.progress
    let tagDef = this.defs[tag];
    let value = this.props[tag];
    if (tagDef.msg instanceof Function) return tagDef.msg(tag, value);
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
      else def.throttler = new Schedule(def.throttle, () => this.handler(e, tag, sliderElm.value, this)).run();
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
      if (tagDef.disabled) elm.classList.add("SliderGroup__SliderBlock__Slider-disabled");
      else elm.classList.remove("SliderGroup__SliderBlock__Slider-disabled");
      elm.firstChild.data = this.formatMsg(tag);
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
      "pointer-events:none;position:absolute;width:.5em;height:.5em;background:${color};visibility:hidden;"
    ></div>`);
    this.parent.append(this.elm);
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
class TabView
  Class implementing a gui Tabbed Panel view for
  use by Panel subclasses
**/

class TabView {
  static css = css(
    "TabView",
    `.Tab__tag {
       display:inline-block;
       height:3em;
       line-height:3em;
       width:8em;
       text-align: center;
    }
    .Tab__tag-selected {
      border-radius: var(--borderRadius) ;
      background-color: #8888;
    }
    .TabView__frame {
       margin-top: .5em;
       width:100% ;
       height:3em ; 
    }
    .TabView__sash {
       position:relative;
       display:flex;
       width:max-content;
       min-width:100%;
       height:3em ; 
       background-image: ${sandSvg} ;
    }
    .TabView__sash-edge {
      top:3.5em ;
      height:8em ;
    }     
    .TabView__faces {
       height:calc(100% - 3em);
       width:100%;
       top:3em;
   }
   .TabView__face {
       position:absolute ;
       width:100%;
       height:100%;
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
      if (iconPaths[title]) this.tag.prepend(helm(
          `${iconSvg(title, { style: "pointer-events:none;height:1.5em;top:.5em;position:relative;padding-right:.3em;" })}`));
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
    this.panel = panel ;
    Object.assign(this, dataIndex("tag", this.elm));
    for (let name of tabNames) {
      let tab = new TabView.Tab(name);
      this.sash.append(tab.tag);
      this.faces.append(tab.face);
      this.tabs[name] = tab;
    }

    listen(this.sash, "pointerup", (e) => e.target.classList.contains("Tab__tag") ? this.selectTab(e.target) : null) ;

    if(this.draggable) delay(5, () => 
      this.panel.listeners.push(
        listen(this.sash, "pointerdown", (e) => {
          let offsetX = e.clientX - this.sash.offsetLeft ;
          let limit = this.sash.offsetWidth - this.frame.offsetWidth ;
          let mv = listen(this.sash, "pointermove", (emv) => {
             if(mvmt(e,emv,8,1000)) this.sash.setPointerCapture(e.pointerId);
              this.sash.style.left = clamp(emv.clientX - offsetX, -limit, 0) + "px";
              e.emv = emv ;
          }) ;
          listen(this.sash, "pointerup", (eup) => {
            unlisten(mv)},
         {once:true}) ;
      }))) ;
  }

  selectTab(tagOrName) {
    let select = (tab) => {
      tab.select();
      this.selectedTab = tab;
    };

    for (let [name, tab] of Object.entries(this.tabs)) {
      tagOrName === tab.tag || tagOrName == tab.tag.textContent ? select(tab) : tab.deselect();
    }
  }
}

/**
class Timer
   Used only for development performance testing.
**/
class Timer {
  constructor(title = "unnamed") {
    this.title = title;
    this.startTime = performance.now();
    this.prevTime = this.startTime;
    console.log(`Timer ${this.title} started.`);
  }

  lap(tag = "") {
    let now = performance.now();
    console.log(`Timer ${this.title}/${tag}  lap: ${now - this.prevTime} et: ${now - this.startTime}`);
    this.prevTime = now;
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
  if (from) for (let [k, v] of Object.entries(from)) elm.style[k] = v;
  delay(1, () => (elm.style.transition = transition));
  delay(2, () => {
    for (let [k, v] of Object.entries(to)) elm.style[k] = v;
  });
  listen(elm, "transitionend",() => {
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
//console.log(frameCount, func) ;
  if (frameCount <= 0) return func();
  requestAnimationFrame(() => delay(frameCount - 1, func));
}

function delayMs(msec=-1, func) {
  // delay execution of a function the given number of @msecs.
  // Initially, this runs assuming 60 frames/second. However,
  // to "recalibrate" this value, call this function with 
  // @msec < 0: in this case,  both @func and @args are ignored,
  // and the frame rate will be (re) calibrated by measuring the mean
  // time between frames over 60 frames.
  if(msec >= 0) return delay(Math.round(msec * _frMs_), func) ;
  let now = performance.now() ;
  delay(60, () => _frMs_ = 60 / (performance.now() - now)) ;
}

delayMs() ; // force initial calibration of _frMs_ (frames per millisecond)


function dialog(innerHtml, buttonsDef = { Cancel: { svg: "Cancel" } }, handler = (e, _x, _y, args) => args.close()) {
  // Create a dialog displaying a message plus a ButtonGroup.
  // example:
  //  let dialog = dialog("close me", { Close: { svg:"Split"}}, (e,prop,tag,args) => {
  //    dialog.close() ;
  //    dialog.remove() ; // if won't be opened again...allows garbage collection
  //  }
  // dialog.showModal() ;
  //
  // The most common usage is for a simple error message with a cancel button that
  // automatically dismisses the dialog...this is the default, if def and handler are
  // undefined in the call.
  let elm = helm(`<dialog class="dialog"><div>${innerHtml}</div></dialog>`);
  let buttonsElm = new ButtonGroup(
    { close: () => { elm.close() ; elm.remove() ;},
      elm:elm,
    },
    buttonsDef, handler).elm;
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

function flung(emv, eup) {
  // flung (past tense of fling!) is used to decide
  // when user has "flung" a div.
  // Its passed two events:
  //  @emv a pointermove event, assumed to be the last
  //    pointermove event before the passed eup event
  //  @eup a pointerup event
  //  Returns true iff emv and eup are less than 100 msec
  //    apart, and the movement of the last pointermove
  //    is neither to little (jitter), or too much.
  if (emv && eup?.timeStamp - emv.timeStamp < 100) {
    let delta = Math.hypot(emv.movementX, emv.movementY);
    return delta > _pxPerEm_ / 4 && delta < _pxPerEm_ * 3;
  }
  return false;
}

let fontMap =
  {
    // map pdf font names to html canvas font structures.
    "Courier":               { fontFamily: "Courier",     fontStyle: "normal",  fontWeight: "normal" },
    "Courier-Bold":          { fontFamily: "Courier",     fontStyle: "normal",  fontWeight: "bold"   },
    "Courier-Oblique":       { fontFamily: "Courier",     fontStyle: "oblique", fontWeight: "normal" },
    "Courier-BoldOblique":   { fontFamily: "Courier",     fontStyle: "oblique", fontWeight: "bold"   },
    "Helvetica":             { fontFamily: "Helvetica",   fontStyle: "normal",  fontWeight: "normal" },
    "Helvetica-Bold":        { fontFamily: "Helvetica",   fontStyle: "normal",  fontWeight: "bold"   },
    "Helvetica-Oblique":     { fontFamily: "Helvetica",   fontStyle: "oblique", fontWeight: "normal" },
    "Helvetica-BoldOblique": { fontFamily: "Helvetica",   fontStyle: "oblique", fontWeight: "bold"   },
    "Times-Roman":           { fontFamily: "Times Roman", fontStyle: "normal",  fontWeight: "normal" },
    "Times-Bold":            { fontFamily: "Times Roman", fontStyle: "normal",  fontWeight: "bold"   },
    "Times-Italic":          { fontFamily: "Times Roman", fontStyle: "italic",  fontWeight: "normal" },
    "Times-BoldItalic":      { fontFamily: "Times Roman", fontStyle: "italic",  fontWeight: "bold"   },
    "Bravura":               { fontFamily: "Bravura",     fontStyle: "normal",  fontWeight: "normal"   },
  };

let fontUnmap = // reverse dict to look up pdf font name given string of form "fontFamily/fontStyle/fontWeight"
  Object.fromEntries(Object.entries(fontMap).map(([k, v]) => [`${v.fontFamily}/${v.fontStyle}/${v.fontWeight}`, k]));

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
  // @onElm, and collapsed to size 0 during a 309ms annimation,
  // then elm's visibility will be set hidden, and its size restored.
  if (elm.hiding) return;
  else elm.hiding = true; // prevent hiding until schedule(350...) has run
  // ensure left/top are in pixels: transition is wacky with calc or % sizes
  let { left, top } = getComputedStyle(elm);
  let fontSize = elm.style.fontSize ; // this MUST come from style, NOT from getComputedStyle
  elm.style.left = left;
  elm.style.top = top;
  elm.style.transition = "top 0.309s, left 0.309s,font-size 0.309s";
  delay(2, () => {
    let elmBox = getBox(elm) ;
    let onElmBox = getBox(onElm) ;
    elm.style.left = (elm.offsetLeft - elmBox.x) + onElmBox.x + onElmBox.width / 2  +  "px" ;
    elm.style.top = (elm.offsetTop - elmBox.y) + onElmBox.y + onElmBox.height / 2  +  "px" ;
    elm.style.fontSize = 0 ;
  });
  schedule(400, () => {
    elm.style.left = left;
    elm.style.top = top;
    elm.style.visibility = "hidden";
    elm.style.transition = "unset";
    elm.style.fontSize = fontSize;
    elm.hiding = false;
  });
}

function iconSvg(iconName, props = {}) {
  // Returns a string that can be included in html to display an icon whose path is defined
  // in the icon.js iconPaths object.
  // @iconName key in the iconPaths object.
  // @props option object that contain overrides of the default properties defined here:
  props = Object.assign(
    {
      style: "width:2em;height:2em;",
      viewBox: "0 0 24 24",
      class: "",
      type: "",
      tag: "iconSvg",
    },
    props
  );
  // return svg tag do display named icon  (assumed to be square) at given size.
  return `<svg viewBox="${props.viewBox}" class="${props.class}" style="${props.style}" data-tag="${props.tag}" >
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
  if (Array.isArray(elms)) elms.forEach((elm) => listeners.push(...listen(elm, events, func, options)));
  else if (Array.isArray(events)) events.forEach((event) => listeners.push(...listen(elms, event, func, options)));
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
  //          ...) ;
  for (let listeners of listenerArgs) {
    //    if (listeners) listeners.forEach((listener) => listener[0].removeEventListener(listener[1], listener[2], listener[3]));
    if (listeners)
      listeners.forEach((listener) => {
        listener[0].removeEventListener(listener[1], listener[2], listener[3]);
      });
  }
}

function mvmt(e, emv, xLimit = 8, yLimit = 6) {
  // Helper function used when dragging div's: purpose is to ignore
  // jitter that occuring when a user uses as a  finger as a pointer.
  // It takes two events: a downevent
  // @e, and a moveevent:
  // @emv, and sets e.moved to true when the total of movement in either
  //   x or y exceeds the corresponding limit:
  // @xLimit in px,
  // @yLimit  in px
  if (!e.moved) {
    e.sumX = (e.sumX = e.sumX || 0) + Math.abs(emv.movementX);
    e.sumY = (e.sumY = e.sumY || 0) + Math.abs(emv.movementY);
    e.moved = e.sumX > xLimit || e.sumX < -xLimit || e.sumY > yLimit || e.sumY < -yLimit;
  }
  return e.moved;
}

function pnToDiv(pn, div, autoSize = true) {
  // Standard way to display a page number in a div using Bravura font,
  // or using Times Italic roman numerals for front matter. It pulls
  // data from the _menu_ page ring's numbers cell
  // @pn the page number: when number + pnOffset < 0 (front matter),
  // @div caller-supplied div to display the page number in
  // @autoSize whne true,the div's font size is adjusted down from 30px so that the
  //   page number will fit the div without overflow.
  let roman = pn - _menu_.rings.page.cells.numbers.stash.prelim <= 0;
  div.style.fontFamily = roman ? "Times" : "Bravura";
  div.style.fontStyle = roman ? "italic" : "normal";
  let str = pnToString(pn, true);

  if (autoSize) {
    // Determine font size is needed so str will fit within 90% of the div's width
    let elm = helm(`<div style="visibility:hidden;position:absolute">${str}</div>`);
    elm.style.fontFamily = div.style.fontFamily;
    elm.style.fontStyle = div.style.fontStyle;
    elm.style.fontSize = 30 / _dvPxRt_ + "px"; // max font size we allow
    _body_.append(elm);
    while (elm.offsetWidth > div.offsetWidth * 0.9) elm.style.fontSize = parseInt(elm.style.fontSize) - 0.5 + "px";
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
  // If pn is 0 or negative, flip its sign and add 1, then return the
  // resulting number's representation as a lower-case roman number.
  // Design purpose is to allow prelim "front matter" pages to be
  //  presented as is traditionally done in book publishing.
  //
  // @useSMuFL when true, resulting string is designed to be
  // displayed using a SMuFL compliant font using "time signature"
  // glyphs unavailable in other fonts.  Roman numeral algo adapted,
  // with thanks, from:
  // August@https:/\/stackoverflow.com/questions/9083037/convert-a-number-into-a-roman-numeral-in-javascript
  let { prelim, first } = _menu_.rings.page.cells.numbers.stash;

  pn = parseInt(pn);
  prelim = parseInt(prelim);
  first = parseInt(first);
  let roman = pn < prelim;
  let str = "";
  if (pn <= prelim) {
    let roman = {
      m: 1000, cm: 900, d: 500, cd: 400, c: 100,
      xc: 90, l: 50, xl: 40, x: 10, ix: 9,
      v: 5, iv: 4, i: 1,
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
      position:absolute ;
      width:12em;
      height:2em;
      line-height:2em;
      font-size: .8em;
      text-align:center ;
      text-shadow: var(--textShadow);
      transition: opacity ease-out .5s ;
      z-index:1000 ;
      border: var(--border) ;
      border-radius: var(--borderRadius) ;
      background-color: #eee ;
      transition: left .2s;
   }`
);

function ptrMsg(e, msgFunc, styles) {
  // This function creates a div that follows the pointer while
  // displaying a message. It displays the message s.t. it is not
  // obscured by the pointer: normally, above the pointer, but
  // to the left or right of the pointer as the pointer approaches
  // the top of the screen, etc.
  let div = helm(`<div class="ptrMsg" style="${styles}"></div>`);
  _body_.append(div);
  let wd = div.offsetWidth;
  let hg = div.offsetHeight * 2;
  // when pointer is not a mouse, double distance between it and the div,
  // so, for example, one's finger doesn't obscure ability to read div msg
  let expander = e.pointertype == "mouse" ? 1 : 2;
  let put = (ev) => {
    let [left, top] = [ev.clientX - wd / 2, ev.clientY - hg * expander];
    left = clamp(left, 0, window.innerWidth - wd);
    top = clamp(top, 0, window.innerHeight - hg);
    // prevent readout from going offscreen or under pointer
    if (top < hg) {
      if (ev.clientX < window.innerWidth / 2) left += ((1 - top / hg) * _pxPerEm_ * 10) / 2;
      else left -= ((1 - top / hg) * _pxPerEm_ * 10) / 2;
    }
    Object.assign(div.style, {
      left: left + "px",
      top: top + "px",
    });
    let result = msgFunc(ev, div);
    if (result) div.innerHTML = result;
  };

  put(e);

  let mv = listen(_body_, "pointermove", (emv) => put(emv));

  let up = listen(
    _body_,
    "pointerup",
    (eup) => {
      put(eup);
      div.style.opacity = 0;
      delay(20, () => div.remove());
      unlisten(mv);
    },
    { once: true }
  );
  return div;
}

function pxToEm(px, elm) {
  // convert px to em, deriving object's em size from given elm
  return parseFloat(px) / parseFloat(getComputedStyle(elm).fontSize) + "em";
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

function saveLocal(fileName, blob) {
  // Save a blob to a local fileName without using the file system access api, which
  // is not available on many platforms.
  // @fileName
  // @blob
  let url = window.URL.createObjectURL(blob);
  let link = helm(`<a download="${fileName}" href="${url}" style="visibility:none"></a>`);
  _body_.append(link);
  link.click();
  window.URL.revokeObjectURL(url);
  link.remove();
}

String.prototype.format = function () {
  // String formatter taken from stack overflow, see
  // https:/\/stackoverflow.com/questions/610406/javascript-equivalent-to-printf-string-format
  let str = this.toString();
  if (arguments.length) {
    let t = typeof arguments[0];
    var args = "string" === t || "number" === t ? Array.prototype.slice.call(arguments) : arguments[0];
    for (let key in args) {
      str = str.replace(new RegExp("\\{" + key + "\\}", "gi"), args[key]);
    }
  }
  return str;
};

function strToHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function toast(innerHtml) {
  // display a "toast", i.e. a brief modal that automatically dismisses
  // after _gs_ seconds.
  // @param innerHtml the html content of the toast.
  let elm = helm(`<dialog class="dialog" style="opacity:0;transition: opacity .25s";>${innerHtml}</dialog>`);
  _body_.append(elm);
  elm.showModal();
  animate(elm, null, { opacity: 1 }, `opacity ${_gs_}s`);
  schedule(1685, () => animate(elm, null, { opacity: 0 }, `opacity ${_gs_}s`, () => elm.remove()));
}
