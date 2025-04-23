// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https:/\/www.gnu.org/licenses/>.
**/

import {
  clamp,
  css,
  dialog,
  delay,
  flung,
  fontMap,
  getBox,
  helm,
  hide,
  iconSvg,
  listen,
  pnToString,
  unlisten,
  dataIndex,
  clearChildren,
  ButtonGroup,
  ColorPicker,
  SliderGroup,
  saveLocal,
  schedule,
  Schedule,
  TabView,
  toast,
} from "./common.js";
import { Score } from "./score.js";
import { Layout } from "./layout.js";
import { iconPaths } from "./icon.js";
import {
  FileSrc,
  FileListView,
  FileSystemView,
  LocalFileView,
} from "./file.js";
import { Clock, Metronome, Piano, Review, Stopwatch, Volume } from "./tool.js";
import { smuflTable } from "./smufl.js";
export { panels };

// -skip

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
    .Panel__elm {
      position:fixed;
      overflow: hidden;
      border-radius: var(--borderRadius);
      filter: var(--bodyShadow);
      box-shadow: 0.3em 0.3em 1.6em #aaa inset, -0.3em -0.3em 1.6em #aaa inset;
      background: #ddd;
      z-index: 100;
    }
    .Panel__header {
      background-image: var(--panTexture);
      height:3em;
      width:100%;
    }
    .Panel__header-selected {
      background: #aaa;
    }
    .Panel__icon {
      position:absolute;
      width: 2em;
      height:2em;
      top: .5em;
      left: .5em;
      pointer-events: none;
    }
    .Panel__title
    { position:absolute;
      height:3em;
      width:100%;
      text-align: center;
      vertical-align: middle;
      line-height: 3em; 
      font-weight: bold;
      pointer-events: none;
    }
    .Panel__closer {
      position:absolute;
      width: 3em;
      height:3em;
      top: 0em;
      right: 0em;
     }
     .Panel__body {
       font-size: 1em;
       margin:.5em;
       width: 12em;
       text-align:center;
     }
     .Panel__fader {
       transition: opacity .25s linear;
     }
   `
  );

  elm = helm(`
    <div class="pz" style="z-index:200">
      <div data-tag="panel" class="Panel__elm raisedEdge">
        <div data-tag="header" class="Panel__header">
          ${iconSvg("Close", { tag: "icon", class: "Panel__icon" })}
          <div class="Panel__title" data-tag="title">
          </div>
          ${iconSvg("Close Panel", {
            tag: "closer",
            class: "Panel__closer",
            viewBox: "-16 -12 48 48",
            style: "width:3em;height:3em",
          })}
        </div>
        <div data-tag="body" class="Panel__body">
        </div>
        <datalist data-tag="colors" id="commonColors"></datalist>
      </div>
    </div>`);

  cell = null;
  listeners = [];

  constructor(cell) {
    Object.assign(this, dataIndex("tag", this.elm));
    this.elm.style.fontSize = _menu_.elm.style.fontSize; // open at same zoom level as menu
    this.cell = cell;
    this.elm.dataset.tag = this.constructor.name;
    this.setIcon(cell.svgPath);
    this.setTitle(cell.name);
    this.listeners.push(
      listen(this.closer, "pointerdown", (e) => this.close())
    );
    this.listeners.push(
      listen(this.header, "pointerdown", (e) => {
        let { header, elm } = this;
        _body_.append(elm); // move to top of stacking order
        this.header.classList.add("Panel__header-selected");
        header.setPointerCapture(e.pointerId);
        let middleX = this.panel.offsetWidth / 2;
        let middleY = this.panel.offsetHeight / 2;

        let mv = listen(header, "pointermove", (emv) => {
          if (e.pointerId != emv.pointerId) return;
          elm.style.left = emv.clientX - e.offsetX + middleX + "px";
          elm.style.top = emv.clientY - e.offsetY + middleY + "px";
          e.emv = emv;
        });

        listen(
          header,
          "pointerup",
          (eup) => {
            header.classList.remove("Panel__header-selected");
            unlisten(mv);
            if (flung(e.emv, eup))
              hide(this.elm, dataIndex("tag", this.cell.elm).cellIcon);
          },
          { once: true }
        );
      })
    );
  }

  close() {
    // When a panel is closed, its first hidden, then, removed from
    // the dom, and its singleton is deleted.
    hide(this.elm, this.elm);

    schedule(400, () => {
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

  show() {
    let elm = this.elm;
    this.setIcon(this.cell.svgPath);
    this.setTitle(this.cell.name);
    elm.style.visibility = "visible";
    let fontSize = elm.style.fontSize;
    elm.style.fontSize = 0;
    elm.style.transition = "font-size 0.35s";
    _body_.append(elm);
    delay(1, () => (elm.style.fontSize = fontSize));
    schedule(350, () => (elm.style.transition = "unset"));
    _pzTarget_ = elm;
    return this;
  }

  hide() {
    hide(this.elm, dataIndex("tag", this.cell.elm).cellIcon);
  }

  setPosition(otherElm) {
    // Position panel element's "closest corner"  to corner relative
    //  to center of another element that's closest to window's center.
    // Algorithm assumes refPanel is as tall as it is wide...designed for
    // _menu_.grip.
    let elm = this.elm;
    let box = getBox(otherElm);
    let mid = box.x + box.width / 2;
    mid > window.innerWidth / 2
      ? (elm.style.left = mid - elm.offsetWidth + "px")
      : (elm.style.left = mid + "px");
    mid = box.y - box.height / 2;
    mid > window.innerHeight / 2
      ? (elm.style.top = mid - elm.offsetHeight / 2 + "px")
      : (elm.style.top = mid + "px");
    box = getBox(elm);
    if (box.top < 0 || box.bottom > window.innerHeight)
      elm.style.top =
        Math.max(window.innerHeight / 2 - box.height / 2, 0) + "px";
    if (box.left < 0 || box.right > window.innerWidth)
      elm.style.left =
        Math.max(window.innerWidth / 2 - box.width / 2, 0) + "px";
  }
}

class AddPanel extends Panel {
  content = helm(`
     <div data-tag="body" class="Panel__body">
       Type:<br>
       <div data-tag="type"></div>
       <div data-tag="picker"></div>
     </div>
   `);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));
    let stash = cell.stash;

    this.pageTypeGroup = new ButtonGroup(
      stash,
      {
        Blank: { svg: "Blank Page", radio: "type" },
        Title: { svg: "Title Page", radio: "type" },
      },
      null
    );

    this.type.replaceWith(this.pageTypeGroup.elm);
    this.pageTypeGroup.refresh();

    let picker = new ColorPicker(
      "Color:",
      stash.fillRgb,
      stash.fillAlpha,
      (rgb, alpha) => {
        stash.fillRgb = rgb;
        stash.fillAlpha = alpha;
      }
    );
    this.picker.replaceWith(picker.elm);
  }
}

class ClockPanel extends Panel {
  constructor(cell) {
    super(cell);
    this.clock = new Clock(this);
    this.body.classList.add("centerChild");
  }

  destructor() {
    super.destructor();
    this.clock.destructor();
  }

  show() {
    super.show();
    this.clock.show();
    return this;
  }

  hide() {
    super.hide();
    this.clock.hide();
  }
}

class DetailsPanel extends Panel {
  content = helm(`<div style="margin:1em;width:20em;"></div>`);

  constructor(cell) {
    super(cell);
    Object.assign(this, dataIndex("tag", this.content));

    this.body.replaceWith(this.content);

    this.qualityGroup = new SliderGroup(
      this.cell.stash,
      {
        quality: {
          min: 0.5,
          max: 4,
          step: 0.1,
          value: 2,
          throttle: 750,
          msg: () => {
            let q = cell.stash.quality;
            let qualities = ["Low", "Medium", "High", "Extreme"];
            let desc =
              q < 1.1
                ? "Low"
                : q < 2.1
                ? "Medium"
                : q < 3.1
                ? "High"
                : "Extreme";
            return "Display Quality: " + desc + ` (${parseInt(q * 100)}%)`;
          },
        },
      },
      async (e, tag, value) => {
        this.cell.stash.tag = value;
        let score = Score.activeScore;
        if (score) {
          score.quality = value;
          for (let pg of score.pgs) if (pg.inflated) await pg.renderPdf();
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
    if (Score.activeScore) {
      let score = Score.activeScore;

      this.content.append(
        helm(
          `<div style="font-size:1.5em;text-align:center;margin-bottom:.5em;">${score.name.replace(
            /\.pdf/i,
            ""
          )}</div>`
        )
      );
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
          <div style="text-align:right;">Name:&nbsp;</div><div>${
            score.name
          }</div>
          ${source} ${path} ${size}
          <div style="text-align:right;">Pages:&nbsp;</div><div>${
            score.pgs.length
          }</div>
          <div style="text-align:right;">Created:&nbsp;</div><div>${new Date(
            score.created
          ).toLocaleString()}</div>
          <div style="text-align:right;">Modified:&nbsp;</div><div>${new Date(
            score.modified
          ).toLocaleString()}</div>
          </div>`)
      );

      this.content.append(this.qualityGroup.elm);

      if (score.pdfInfo) {
        this.content.append(
          helm(
            `<div style="font-size:1em;text-align:center;padding:.5em;">PDF Metadata:</div>`
          )
        );
        let infoHtml = "";
        for (let [k, v] of Object.entries(score.pdfInfo)) {
          if (!k) continue;
          infoHtml += `<div style="text-align:right">${k}:&nbsp;&nbsp;</div><div>${v}</div>`;
          if (typeof v === "string" && v.startsWith("D:"))
            infoHtml += `<div></div><div>\u27a1${new Date(
              this.parseTs(v)
            ).toLocaleString()}</div>`;
        }
        this.content.append(
          helm(
            `<div style="display:grid;grid-template-columns:40% 60%;font-size:.8em;">${infoHtml}</div>`
          )
        );
      }
    }
  }

  show() {
    super.show();
    this.refresh();
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
    this.tabView = new TabView(this, "Recent", ...Object.values(Score.sources));
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

class BindPanel extends OpenPanel {
  constructor(cell) {
    super(cell);
    this.mode = "bind";
  }
}

class CopyPanel extends OpenPanel {
  constructor(cell) {
    super(cell);
    this.mode = "copy";
  }
}

class SavePanel extends FilePanel {
  mode = "save";

  constructor(cell) {
    // code identical to OpenPanel constructor except that a SavePanel
    // doesn't have a "Recent" tab
    super(cell);
    this.mode = "save";
    this.tabView = new TabView(this, ...Object.values(Score.sources));
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
      let steps = ["1", "1/2", "1/4", "1/8"];
      let xStepMsg = (tag, value) => "X Step: " + steps[value] + " inch";
      let yStepMsg = (tab, value) => "Y Step: " + steps[value] + " inch";
      this.inchSliders = new SliderGroup(
        this.cell.stash,
        {
          xStep: { min: 0, max: 3, step: 1, value: 0, msg: xStepMsg },
          yStep: { min: 0, max: 3, step: 1, value: 0, msg: yStepMsg },
        },
        () => {}
      );
      this.inchSliders.elm.classList.add("GridPanel__sliders");
    }

    {
      // metric
      let steps = [4, 2, 1, 0.5];
      let xStepMsg = (tag, value) => "X Step: " + steps[value] + " cm";
      let yStepMsg = (tab, value) => "Y Step: " + steps[value] + " cm";

      this.metricSliders = new SliderGroup(
        this.cell.stash,
        {
          xStep: { min: 0, max: 3, step: 1, value: 0, msg: xStepMsg },
          yStep: { min: 0, max: 3, step: 1, value: 0, msg: yStepMsg },
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

class HelpPanel extends Panel {
  static css = css(
    "HelpPanel",
    `.Credit {
        font-size:1em ;
        margin:1.2em;
     }
     `
  );

  helpFace = helm(`
      <object type="application/pdf" data="https:/\/www.studiop5.org/Guidebook.pdf" 
       style="padding:1em;width:100%;height:100%;overflow:auto;"></object>
      `);

  licenseFace = helm(`<p style="padding:2em;overflow:auto;text-align:center;">
  <br><b>Podium</b><br><br>
  Copyright 2025 Glendon Diener<br><br>
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.<br><br>

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the 
      <a target="_blank" rel="noopener noreferrer" href="https:/\/www.gnu.org/licenses/agpl-3.0-standalone.html">GNU Affero Public License</a>
for more details.</p>
      `);

  creditsFace = helm(`<div>
        <div class="Credit">
          <a href="https:/\/github.com/steinbergmedia/bravura">Bravura</a> Version 1.1<br>
          Copyright © 2019, Steinberg Media Technologies GmbH<br>
          SIL Open Font License
        </div><div class="Credit">
          <a href="https:/\/github.com/fabricjs">fabricjs</a> Version 5.2.1<br>
          Copyright © 2008-2015 Printio (Juriy Zaytsev, Maxim Chernyak)<br>
        </div><div class="Credit">
          <a href="https:/\/github.com/mozilla/pdf.js">pdf</a> Version 2.0<br>
          Copyright  © 2023 Mozilla Foundation<br>
          Apache License<br>
        </div><div class="Credit">
          <a href="https:/\/github.com/Hopding/pdf-lib">pdf-lib</a> Version 1.17.1
          Copyright  © 2019 Andrew Dillon<br>
          MIT license
        </div><div class="Credit"> 
          <a href="https:/\/github.com/sfzinstruments/SalamanderGrandPiano">Salamander Grand Piano V2 Yamaha C5</a><br>
          Author: Alexander Holm<br>
          Creative Commons 3.0
        <a></a>
     </div>`);

  aboutFace = helm(
    `<div style="display:flex;align-items:center;flex-direction:column;justify-content:center;padding:1em;font-size:1.5em;">
        <div>Podium</div>        
        ${iconSvg("Podium", { style: "width:4em;" })}
        <div>Version ${_podiumVersion_}</div>
        <div style="margin-top:1em;">Factory Reset:</div>
        <div data-tag="buttons"></div><br>
        <a href="https://github.com/studiop5/podium">Github</a>
        <a href="mailto:glen@studiop5.org">Contact \u2709</a>
     <div>`
  );

  constructor(cell) {
    super(cell);
    let tabView = new TabView(this, "Help", "About", "Credits", "License");
    Object.assign(this.body.style, {
      margin: 0,
      width: "90vw",
      maxWidth: "30em",
      height: "90vh",
      maxHeight: "30em",
    });

    let about = tabView.tabs["About"];
    about.face.append(this.aboutFace);
    Object.assign(this, dataIndex("tag", this.aboutFace));
    let buttons = dataIndex("tag", this.aboutFace).buttons;
    buttons.replaceWith(
      new ButtonGroup(
        cell,
        { Menu: { svg: "Ink" }, Recent: { svg: "Recent" } },
        (e, prop, tag) => {
          if (tag == "Menu") {
            _menu_.stashFromJson(_menu_.stashDefaults);
            localStorage.setItem("menu", _menu_.stashToJson());
            toast("Menu reset");
          } else if (tag == "Recent") {
            localStorage.setItem("recent", []);
            toast("Recent list cleared");
          }
        }
      ).elm
    );
    tabView.tabs["Help"].face.append(this.helpFace);
    tabView.tabs["Credits"].face.append(this.creditsFace);
    tabView.tabs["License"].face.append(this.licenseFace);
    this.body.append(tabView.elm);
    tabView.tabs["Help"].select();
  }
}

class LayoutPanel extends Panel {
  // Superclass for all Layout panels.

  content = helm(`
    <div>
      <div data-tag="bookFace" class="Panel__body">
        Page Fit<br>
        <div data-tag="fitBook"></div>
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
      if (Score.activeScore && this.cell === Layout.activeLayout.cell) {
        Layout.activeLayout.build();
      }
    };

    let msgCallback = (tag, value) => {
      if (value == 0) return "Snap disabled";
      else return "Snap: " + value + (value == 1 ? " page." : " pages");
    };

    // defs for scroll/slider groups
    let fitGroupDef = {
      Auto: { svg: "Fit Auto", radio: "fit", redo: true },
      None: { svg: "Fit None", radio: "fit", redo: true },
      Width: { svg: "Fit Width", radio: "fit", redo: true },
      Height: { svg: "Fit Height", radio: "fit", redo: true },
    };

    let scrollSlidersGroupDef = {
      pgShow: {
        min: 1,
        max: 8,
        step: 1,
        msg: "Show: {value} pages",
        throttle: 750,
      },
      pgSnap: { min: 0, max: 8, step: 1, msg: msgCallback, throttle: 750 },
      gap: {
        min: 0,
        max: 100,
        step: 0.5,
        msg: "Gap: {value} %",
        throttle: 750,
      },
    };

    let pnGroupDef = {
      On: { svg: "Numbers", radio: "pnShow" },
      Off: { svg: "Close", radio: "pnShow" },
    };

    let tableSlidersGroupDef = {
      pages: {
        min: 1,
        max: 50,
        msg: "Pages per row: {value}",
        step: 1,
        throttle: 750,
      },
      horizontalGap: {
        min: -100,
        max: 100,
        msg: "Horizontal Gap: {value} %",
        step: 1,
        throttle: 750,
      },
      verticalGap: {
        min: -100,
        max: 100,
        msg: "Vertical Gap: {value} %",
        step: 1,
        throttle: 750,
      },
    };

    // build faces. Note: both BottonGroup and SliderGroup modify their defs element, so we
    // must pass shallow copies...deep copies are not required, as the only non-reference
    // value is msgCallback, and it doesn't need to be unique.

    // build book face
    let stash = _menu_.rings.layout.cells.book.stash;
    tags.fitBook.replaceWith(new ButtonGroup(stash, fitGroupDef, handler).elm);
    tags.pnBook.replaceWith(new ButtonGroup(stash, pnGroupDef, handler).elm);

    // build horizontal face
    stash = _menu_.rings.layout.cells.horizontal.stash;
    tags.fitHorizontal.replaceWith(
      new ButtonGroup(stash, fitGroupDef, handler).elm
    );
    tags.fitHorizontalSliders.replaceWith(
      new SliderGroup(stash, scrollSlidersGroupDef, handler).elm
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
      new SliderGroup(stash, scrollSlidersGroupDef, handler).elm
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

class MetronomePanel extends Panel {
  static css = css(
    "MetronomePanel",
    `.Metronome
      { flex-flow:column;
      }
      .Metronome__patterns
      { border-radius:.4em;
        border:1px solid #fff;
        font-size:1em;
        text-align:center;
        margin:1em 0 1em 0;
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

class NewPanel extends Panel {
  // Options list consisting of selection of common page sizes, plus
  // ability to enter custom size
  content = helm(`
      <div data-tag="options" class="Panel__body">
         <div data-tag="pages"></div>
        Size:<br>
        <select class="FontPanel__select" data-tag="presets">
          <option value="custom">Custom:</option>
          <option value="pt/100/100">Test1</option>
          <option value="pt/1000/1000">Test2</option>
          <option value="mm/279/420">A3</option>
          <option value="mm/210/297">A4</option>
          <option value="mm/250/353">B4</option>
          <option value="in/6.5/10.5">Octavo</option>
          <option value="in/8.5/11">Letter</option>
          <option value="in/9/12">Folio</option>
          <option value="in/9.5/12.5">Hand Copy (Trad)</option>
          <option value="in/11/14">Orchestral Parts (MOLA)</option>
          <option value="in/17/11">Ledger</option>
          <option value="in/8.5/14.0">Legal</option>
          <option value="in/11/17">Tabloid</option>
       </select>
       <div data-tag="custom"></div>
      </div>`);

  constructor(cell) {
    super(cell);
    Object.assign(this, dataIndex("tag", this.content));
    this.body.appendChild(this.content);

    this.pagesGroup = new SliderGroup(
      this.cell.stash,
      {
        pages: { min: 1, max: 100, msg: "{value} pages", step: 1 },
      },
      null
    );
    this.pages.replaceWith(this.pagesGroup.elm);

    let sizeMsg = (tag, val) => {
      let pt = val.toFixed(0);
      let mm = (val * (1 / 2.8346456693)).toFixed(0);
      let inch = (val * (1 / 72)).toFixed(2);
      return `${tag}: ${pt} pt, ${mm} mm, ${inch} in`;
    };

    let disable = this.cell.stash.size != "Custom:";

    this.customGroup = new SliderGroup(
      this.cell.stash,
      {
        Width: { min: 1, max: 2000, msg: sizeMsg, step: 1, disabled: disable },
        Height: { min: 1, max: 2000, msg: sizeMsg, step: 1, disabled: disable },
      },
      null
    );
    this.custom.replaceWith(this.customGroup.elm);

    listen(this.presets, ["input", "change"], (e) => {
      let width, height;
      cell.stash.size = e.target.selectedOptions[0].textContent;
      if (e.target.value == "custom") {
        // enable sliders:
        this.customGroup.defs.Height.disabled = false;
        this.customGroup.defs.Width.disabled = false;
      } else {
        let [unit, width, height] = e.target.value.split("/");
        // stash the page size in pdf pts
        let toPts =
          unit == "in"
            ? 72
            : unit == "mm"
            ? 2.8346456693
            : unit == "pt"
            ? 1
            : 1;
        cell.stash.Width = width * toPts;
        cell.stash.Height = height * toPts;
        // disable user interaction with sliders:
        this.customGroup.defs.Height.disabled = true;
        this.customGroup.defs.Width.disabled = true;
      }
      this.customGroup.refresh();
    });

    this.pagesGroup.refresh();
    this.customGroup.refresh();

    let size = [...this.presets.children].find(
      (option) => option.textContent == this.cell.stash.size
    );
    if (size) size.selected = true;
  }
}

class NumbersPanel extends Panel {
  content = helm(`
     <div data-tag="body" class="Panel__body">
       <div data-tag="sliders"></div>
       Key Map:<br><br>
       \u21e7 or  \u21e8
       <div data-tag="forward"></div>
       \u21e6 or \u21e9
       <div data-tag="reverse"></div>
     </div>
   `);

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

    this.schedule = new Schedule();
    let self = this;
    let score = Score.activeScore;

    let formatPn = () => {
      return `Page: ${pnToString(cell.stash.pn, -cell.stash.pnOffset)} 
      (${cell.stash.pn} / ${score.pgs.length})`;
    };

    let defs = {
      pn: {
        min: 1,
        max: score.pgs.length,
        value: cell.stash.pn,
        step: 1,
        msg: formatPn,
        throttle: 500,
      },
      first: {
        min: 1,
        max: 1000,
        value: cell.stash.pnOffset,
        step: 1,
        msg: () => `First Page Number: ${cell.stash.first}`,
        throttle: 500,
      },
      prelim: {
        min: 0,
        max: 100,
        value: cell.stash.pnOffset,
        step: 1,
        msg: () => `Prelim (Roman) Pages: ${cell.stash.prelim}`,
        throttle: 500,
      },
    };
    this.pnSliderGroup = new SliderGroup(
      this.cell.stash,
      defs,
      (e, tag, value) =>
        _body_.dispatchEvent(new CustomEvent("PnChanged", { detail: this }))
    );

    this.sliders.replaceWith(this.pnSliderGroup.elm);

    this.forwardGroup = new ButtonGroup(
      this.cell.stash,
      {
        Pages: { svg: "Next Page", radio: "forward" },
        Marks: { svg: "Next Mark", radio: "forward" },
      },
      (e, tag, value) => {
        this.cell.stash.tag = value;
      }
    );
    this.forward.replaceWith(this.forwardGroup.elm);

    this.reverseGroup = new ButtonGroup(
      this.cell.stash,
      {
        Pages: { svg: "Next Page", radio: "reverse" },
        Marks: { svg: "Next Mark", radio: "reverse" },
      },
      (e, tag, value) => {
        this.cell.stash.tag = value;
      }
    );
    this.reverse.replaceWith(this.reverseGroup.elm);

    listen(_body_, ["PnChanged"], (e) => {
      if (e.detail === this) return;
      let score = Score.activeScore;
      defs.pn.suffix = ` of ${score.pgs.length}`;
      defs.pn.value = cell.stash.pn;
      this.pnSliderGroup.refresh();
    });
  }

  refresh() {
    // call this to update the panel when the score changes, has pages added, etc.
    let defs = this.pnSliderGroup.defs;
    defs.pn.max = score.pgs.length;
    defs.pn.value = cell.stash.pn;
    this.pnSliderGroup.refresh();
  }
}

class PencilPanel extends Panel {
  static css = css(
    "PencilPanel",
    `.PencilPanel__preview {
       overflow:hidden;
       height:6em;
       border: 1px solid #ccc;
       border-radius:var(--borderRadius);
       margin:1em;
       background: repeating-linear-gradient(to top, transparent 0,transparent .2em,#ccc .2em,#ddd .4em),
           repeating-linear-gradient(to left, transparent 0,transparent .2em,#ccc .2em,#ddd .4em);
      }
    `
  );

  slidersDef = {
    width: {
      min: 0.2,
      max: 60,
      step: 0.1,
      value: 1,
      throttle: 250,
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
        this.sliders.after(helm(`<div style="font-size:.8em">Styles:</div>`));

      let picker = new ColorPicker(
        "Color:",
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

    let active = Score.activeScore.getActiveObject();

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

class TextPanel extends PencilPanel {
  slidersDef = {
    size: { min: 1, max: 100, step: 1, value: 1, msg: "Font Size: {value} px" },
    height: {
      min: 1,
      max: 100,
      step: 1,
      value: 1,
      msg: "Line Height: {value} px",
    },
  };

  buttonsDef = null;

  fonts = helm(`
      <select data-tag="font">
        <option selected>Courier</option>
        <option>Courier-Bold</option>
        <option>Courier-Oblique</option>
        <option>Courier-BoldOblique</option>
        <option>Helvetica</option>
        <option>Helvetica-Bold</option>
        <option>Helvetica-Oblique</option>
        <option>Helvetica-BoldOblique</option>
        <option>Times-Roman</option>
        <option>Times-Bold</option>
        <option>Times-Italic</option>
        <option>Times-BoldItalic</option>
        <option>Bravura</option>
      </select>`);

  text = helm(`<div>Abc<br>123<br></div>`);

  constructor(cell) {
    super(cell);
    this.preview.after(helm(`<div style="font-size:.8em;">Font:</div>`));
    this.picker.before(this.fonts);
    this.preview.append(this.text);
    this.listeners.push(listen(this.fonts, "change", () => this.update()));
    this.preview.append(this.text);
    this.update();
  }

  update() {
    this.cell.stash.font = this.fonts.value;
    let { font, size, height, rgb, alpha } = this.cell.stash;
    this.text.style.fontSize = size / _pxPerEm_ + "em";
    this.text.style.lineHeight = height / _pxPerEm_ + "em";
    this.text.style.color = rgb + Math.round(alpha * 255).toString(16);
    Object.assign(this.preview.style, fontMap[this.fonts.value]);
    let active = Score.activeScore.getActiveObject();
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

class RastrumPanel extends PencilPanel {
  slidersDef = {
    lines: {
      throttle: 250,
      min: 1,
      max: 30,
      step: 1,
      value: 5,
      msg: "Lines: {value}",
    },
    width: {
      throttle: 250,
      min: 0.1,
      max: 10,
      step: 0.1,
      value: 1,
      msg: "Line Width: {value} px",
    },
    gap: {
      throttle: 250,
      min: 1,
      max: 25,
      step: 1,
      value: 6,
      msg: "Line Spacing: {value} px",
    },
    bars: {
      throttle: 250,
      min: 0,
      max: 20,
      step: 1,
      value: 4,
      msg: "Bars: {value}",
    },
  };

  buttonsDef = {
    "L-R": { svg: "L-R", radio: "style" },
    "T-B": { svg: "T-B", radio: "style" },
  };

  constructor(cell) {
    super(cell);
  }

  update() {
    let { alpha, rgb, style, lines, width, gap, bars, barsWidth } =
      this.cell.stash;
    clearChildren(this.preview);
    let linePath = "";
    let barPath = "";
    let staffHeight = (lines - 1) * gap;
    if (style == "L-R") {
      let staffY = (100 - staffHeight) / 2;
      for (let i = 0, y = staffY; i < lines; i++, y += gap)
        linePath += `M10 ${y}h180 `;
      if (bars > 0) {
        let barWidth = 180 / bars;
        staffY -= width / 2;
        staffHeight += width;
        for (let i = 0, x = 10; i <= bars; i++, x += barWidth)
          barPath += `M${x} ${staffY}v${staffHeight} `;
      }
    } else {
      let staffX = (200 - staffHeight) / 2;
      for (let i = 0, x = staffX; i < lines; i++, x += gap)
        linePath += `M${x} ${10}v80 `;
      if (bars > 0) {
        let barWidth = 80 / bars;
        staffX -= barsWidth / 2;
        staffHeight += barsWidth;
        for (let i = 0, y = 10; i <= bars; i++, y += barWidth)
          barPath += `M${staffX} ${y}h${staffHeight} `;
      }
    }

    this.preview.append(
      helm(
        `<svg viewBox="0 0 200 100">
         <path style="fill:none;stroke:${rgb};stroke-width:${width}px;opacity:${alpha}" d="${linePath}"/>
         <path style="fill:none;stroke:${rgb};stroke-width:${width}px;opacity:${alpha}" d="${barPath}"/></svg>`
      )
    );

    let active = Score.activeScore.getActiveObject();

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
      // style: style, // style doesn't redraw correctly
    });
    brush.draw();
    Object.assign(active, active._calcDimensions());
    active.dirty = true;
    brush.canvas.requestRenderAll();
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

  async show() {
    super.show();
  }

  hide() {
    super.hide();
    this.av.hide();
  }
}

class SymbolsPanel extends PencilPanel {
  static css = css(
    "SymbolsPanel",
    `
    .SymbolsPanel__symbolsList {
      background-image: var(--panTexture);
      position:relative;
      font-family:Bravura;
      height:6em;
      width:max-content;
      min-width:100%;
      margin-bottom:.2em ;
      display:flex ;
      align-items: center ;
   }
   .SymbolsPanel__preview {
     background: unset ;
     font-size:2em ;
     height:6em ;
     margin: unset ;
   }
   .SymbolsPanel__symbol {
      display:inline-block;
      padding-left:.25em;
      padding-right:.25em;
      border: .02em solid #eee;
      border-radius: .2em ;
   }
   .SymbolsPanel__symbol-active {
      background: ghostwhite ;
   }
  `
  );

  groups = helm(`<select></select>`);

  slidersDef = {
    size: { min: 1, max: 100, step: 1, value: 1, msg: "Font Size: {value} px" },
  };

  buttonsDef = null;

  constructor(cell) {
    super(cell);
    this.preview.after(helm(`<div>Symbols Group:</div>`));
    for (let group of Object.keys(smuflTable)) {
      let len = group.length;
      this.groups.append(
        helm(
          `<option ${
            cell.stash.group == group ? "selected" : ""
          }>${group}</option>`
        )
      );
    }
    this.picker.before(this.groups);

    Object.assign(
      this,
      dataIndex(
        "tag",
        helm(`
       <div data-tag="symbolsFrame" class="PencilPanel__preview SymbolsPanel__preview">
          <div data-tag="symbolsList" class="SymbolsPanel__symbolsList"></div>
       </div>`)
      )
    );

    this.preview.replaceWith(this.symbolsFrame);
    let dragListener = null;

    listen(this.groups, "change", () => {
      clearChildren(this.symbolsList);

      for (let codePoint of smuflTable[this.groups.value]) {
        let symbol = helm(
          `<div class="SymbolsPanel__symbol ${codePoint == cell.stash.codePoint ? "SymbolsPanel__symbol-active": "" }">{codePoint}</div>`
        );
        symbol.textContent = `${codePoint}`;
        this.symbolsList.append(symbol);
        this.symbolsList.style.left = "0";
      }
      unlisten(dragListener);

      this.dragListener = listen(this.symbolsList, "pointerdown", (e) => {
        this.symbolsList.setPointerCapture(e.pointerId);
        let offsetX = e.clientX - this.symbolsList.offsetLeft;
        let limit = this.symbolsList.offsetWidth - this.panel.offsetWidth;
        let mv = listen(this.symbolsList, "pointermove", (emv) => {
          this.symbolsList.style.left =
            clamp(emv.clientX - offsetX, -limit, 0) + "px";
        });
        listen(
          this.symbolsList,
          "pointerup",
          (eup) => {
            unlisten(mv);
          },
          { once: true }
        );
      });
      this.cell.stash.group = this.groups.value;
    });

    listen(this.symbolsList, "pointerdown", (e) => {
      Array.from(this.symbolsList.children).forEach((child) =>
        child.classList.remove("SymbolsPanel__symbol-active")
      );
      e.target.classList.add("SymbolsPanel__symbol-active");
      this.cell.stash.codePoint = e.target.textContent;
      _menu_.activateCell(cell);
      listen(
        this.symbolsList,
        "pointerup",
        (eup) => {
          if (eup.timeStamp - e.timeStamp > _longPressMs_)
            _menu_.activateCell(cell, true);
        },
        { once: true }
      );
    });
    this.groups.dispatchEvent(new Event("change"));
  }

  update() {
    let { alpha, rgb, size, height } = this.cell.stash;
    for (let symbol of [...this.symbolsList.children])
      Object.assign(symbol.style, {
        color: rgb,
        transparency: alpha,
        fontSize: size + "px",
        fontHeight: height + "px",
      });
    let active = Score.activeScore.getActiveObject();
    if (active && active.type == "textbox") {
      let color = fabric.Color.fromHex(rgb);
      color.setAlpha(alpha);
      let config = {
        fill: color.toRgba(),
        fontSize: size,
        lineHeight: height / size,
      };
      active.setSelectionStyles(config, 0, active.text.length);
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
      window.innerWidth / _pxPerEm_ / parseFloat(this.elm.style.fontSize) -
      4 +
      "em";
    this.listeners.push(listen(window, "resize", () => this.show()));
  }

  destructor() {
    super.destructor();
    this.piano.destructor();
  }

  show() {
    super.show();
    // Following must happen in next animation frame, otherwise
    // panel.elm.fontSize will read as 0 (as it is being animated),
    // and piano.show() needs the correct value
    delay(1, () => this.piano.show());
    return this;
  }
}

class PrintPanel extends Panel {
  constructor(cell) {
    super(cell);
    let buttons = new ButtonGroup(
      this.cell.stash,
      {
        Ink: { svg: "Ink" },
        "No Ink": { svg: "No Ink" },
      },
      async (e, tag, value) => {
        let data = await Score.activeScore.toPdf(
          value == "Inked" ? "pdf" : "none"
        );
        let dataUrl = window.URL.createObjectURL(
          new Blob([data], { type: "application/pdf" })
        );
        window.open(dataUrl).print();
      }
    );
    buttons.elm.style = "margin:.5em;width:12em";
    this.body.replaceWith(buttons.elm);
  }
}

class StopwatchPanel extends Panel {
  content = helm(
    `<div data-tag="body" style="display:flex;flex-flow:column;align-items:center;margin:1em;text-align:center;">
       <div data-tag="options"></div>
       Splits:
       <textarea data-tag="splits" style="width:100%;overflow:hidden;font-size:1em;border-radius:.8em;"></textarea>
     </div>`
  );

  constructor(cell) {
    super(cell);
    this.body.replaceWith(this.content);
    Object.assign(this, dataIndex("tag", this.content));

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

let panels = {
  // This structure maps every Panel to its class.
  // Panels are instantiated on demand, and the
  // singletons are stored here as well, keyed by
  // their cell's key: its the name of the class,
  // minus the "Panel" portion, and starting with
  // lowercase. ex: GridPanel -> grid: instance
  Panel,
  AddPanel,
  BindPanel,
  BookPanel,
  ClockPanel,
  CopyPanel,
  DetailsPanel,
  GridPanel,
  HorizontalPanel,
  HelpPanel,
  MetronomePanel,
  NewPanel,
  NumbersPanel,
  OpenPanel,
  PencilPanel,
  PenPanel,
  PianoPanel,
  PrintPanel,
  RastrumPanel,
  ReviewPanel,
  SavePanel,
  StopwatchPanel,
  TextPanel,
  SymbolsPanel,
  TablePanel,
  VerticalPanel,
  VolumePanel,
};
