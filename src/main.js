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




// Podium uses in own build system that can package the entire application
// into a single file, build/podium.html. This file is built by running
// python3 build.py --podium.  All text  between +/- skip fill be stripped out,
// and all the following // #include files will be  textually included.

import { animate, clamp, delay, delayMs, helm, listen, schedule, Schedule, unlisten } from "./common.js";
import "./font.js";
import { Menu } from "./menu.js";
import { Layout } from "./layout.js";
import "./score.js";
import { ScreenPanel } from "./panel.js";
import { initFabric } from "./canvas.js";
import { SharedBuffer } from "./sharedBuffer.js";

window.pdfjsLib.GlobalWorkerOptions.workerPort = new Worker("pdf.worker.min.mjs", { type: "module" });
// -skip

// #include build/font.js
// #include build/sample.js
// #write let exports = {};
// #include lib/fabric.min.js
// #include lib/pdf-lib.min.js
// #include lib/fontkit.umd.min.js
// #include lib/pdf.min.mjs deflateAs mozSrc
// #include lib/pdf.worker.min.mjs deflateAs mozWorkerSrc
// #include src/canvas.js minified
// #include src/common.js minified
// #include src/menu.js minified
// #include src/icon.js minified
// #include src/score.js minified
// #include src/layout.js minified
// #include src/smufl.js minified
// #include src/panel.js minified
// #include src/file.js minified
// #include src/yin.js minified
// #include src/tool.js minified
// #include src/sharedBuffer.js minified

/**
    class Gestures implements global pan/zoom (pz) operations:

    - Mouse: ctrl-drag to move, ctrl-wheel to zoom (shift for fine mode)
    - Touch: 2-finger pinch to zoom, 1-finger drag to pan

    ...and background swipe/long-press gestures:

    - bottom->top swipe (up):   toggle menu (center/expand <-> park)
    - top->bottom swipe (down): toggle fullscreen (the app/fullscreen cell does the same;
                                it's the only way in on iOS, which refuses fullscreen-by-swipe)
    - long press:               move menu to pointer location and expand
**/

class Gestures {
  tr1 = null;
  tr2 = null;
  timer = new Schedule();
  minEmSize = 0.1;

  constructor() {
    window._pzTarget_ = _body_;
    listen(_body_, "wheel", e => this.onWheel(e), { passive: false });
    listen(_body_, "pointerdown", e => this.onDown(e), { capture: true });
  }

  pzTargets() {
    return _pzTarget_ === _body_
      ? [..._body_.getElementsByClassName("pz")]
      : [_pzTarget_];
  }

  toggleFullscreen() {
    document.fullscreenElement
      ? document.exitFullscreen()
      // iOS refuses requestFullscreen outside a direct tap (no transient
      // activation from a swipe handler); swallow the rejection so it stays a
      // clean no-op there. Entry on iOS is via the app/fullscreen menu cell.
      : document.documentElement.requestFullscreen().catch(() => {});
  }

  onWheel(e) {
    e.preventDefault();
    if (!e.ctrlKey) return;
    let dXY = -Math.sign(e.deltaY) / 100;
    if (e.shiftKey) dXY /= 10;
    for (let target of this.pzTargets()) {
      target.style.fontSize = Math.max((parseFloat(target.style.fontSize) || 1) + dXY, this.minEmSize) + "em";
      target.classList.add("pz-set");
    }
  }

  onDown(e) {
    if (e.target.dataset.midi) return; // piano keys are polyphonic
    if (e.button != 0) return;        // ignore right-click / middle-click

    if (e.isPrimary) {
      this.tr2 = null;
      this.tr1 = { e, pz: e.target.closest(".pz") || _body_ };
      this.tr1.dX = e.clientX - this.tr1.pz.offsetLeft;
      this.tr1.dY = e.clientY - this.tr1.pz.offsetTop;
      window._pzTarget_ = this.tr1.pz;
      if (!(e.target.closest(".Panel__closer") || e.target.closest(".Pz__control")))
        ScreenPanel.update(this.tr1.pz);
      if (e.ctrlKey) { this.startCtrlPan(e); return; }
      if (e.target === _body_) _body_.setPointerCapture(e.pointerId);
      this.watch(e);
      return;
    }
    if (this.tr2) return;                // ignore 3rd+ pointers
    if (!this.tr1) return;               // primary pointer not tracked
    _menu_.op.schedule.cancel();
    this.timer.cancel();
    e.stopImmediatePropagation();
    Layout.activeLayout?.cancelNav();
    this.startPinch(e);
  }

  watch(e) {
    let onBody = e.target === _body_;
    let gestureDelta = Math.min(innerWidth, innerHeight) * 0.15;
    let cancelDelta = 16;
    this.timer.run(_gs_, () => {
      // to defeat the long-press timer, set e.taken = true
      if(e.taken) return;
      e.timedOut = true;
      if (!onBody) Layout.activeLayout?.cancelNav();
      animate(_menu_.elm, null, { left: e.clientX + "px", top: e.clientY + "px" }, `${_gsgs_}ms`);
      if (_menu_.collapsed) _menu_.collapse();
      _menu_.opDown(e);
      _menu_.op.schedule.cancel();
      _menu_.op.moved = true;
    });

    // capture:true so these fire even when a layout element has pointer capture
    let mv = listen(_body_, "pointermove", emv => {
      if (Math.hypot(emv.clientX - e.clientX, emv.clientY - e.clientY) > cancelDelta)
        this.timer.cancel();
    }, { capture: true });

    listen(_body_, "pointerup", eup => {
      unlisten(mv);
      this.timer.cancel();
      if (e.timedOut) return;
      if (!onBody) return;   // swipe gestures only from background
      let dY = eup.clientY - e.clientY;
      if (Math.abs(dY) > gestureDelta) {
        if (dY < 0) // bottom->top (swipe up): toggle the menu (center/expand <-> park)
          delay(1, () => _menu_.collapsed ? _menu_.center(true) : _menu_.park());
        else        // top->bottom (swipe down): toggle fullscreen
          this.toggleFullscreen();
      }
      // horizontal swipes are unused (iPad reserves them to dismiss fullscreen)
    }, { once: true, capture: true });
  }

  startCtrlPan(e) {
    _menu_.op.schedule.cancel();
    this.timer.cancel();
    e.stopImmediatePropagation();
    // Pan the grabbed element, or ALL pz elements when the drag starts on the
    // background (mirrors the two-finger background pan). pzTargets() already
    // returns [grabbed] or all-pz based on _pzTarget_. Snapshot start positions,
    // then translate by the pointer delta, clamping each 0x0 anchor on-screen.
    let startX = e.clientX, startY = e.clientY;
    let starts = new Map();
    for (let target of this.pzTargets())
      if (target !== _body_)
        starts.set(target, { left: parseFloat(target.style.left) || 0, top: parseFloat(target.style.top) || 0 });
    let mv = listen(_body_, "pointermove", emv => {
      emv.stopImmediatePropagation();
      let dx = emv.clientX - startX, dy = emv.clientY - startY;
      for (let [target, { left, top }] of starts) {
        target.style.left = left + dx + "px";
        target.style.top = top + dy + "px";
        target.owner.constrain() ;
        target.classList.add("pz-set");
      }
    }, { capture: true });
    listen(_body_, "pointerup", eup => {
      eup.captured = true;
      unlisten(mv);
    }, { capture: true, once: true });
  }

  startPinch(e) {
    this.pinchEnd?.();   // clear any pinch left dangling (e.g. torn down by a tab-blur synthetic up)
    this.tr2 = { e, pz: e.target.closest(".pz") || _body_ };
    let mid0X = (this.tr1.e.clientX + this.tr2.e.clientX) / 2;
    let mid0Y = (this.tr1.e.clientY + this.tr2.e.clientY) / 2;
    let hypot = Math.hypot(this.tr1.e.clientX - this.tr2.e.clientX, this.tr1.e.clientY - this.tr2.e.clientY);
    let targets = new Map();
    for (let target of this.pzTargets())
      targets.set(target, {
        fontSize: parseFloat(target.style.fontSize) || 1,
        left: parseFloat(target.style.left) || 0,
        top:  parseFloat(target.style.top)  || 0,
      });
    let mv = listen(_body_, "pointermove", emv => {
      if (!this.tr1 || !this.tr2) return;   // pinch already ended
      emv.stopImmediatePropagation();
      if (emv.pointerId === this.tr1.e.pointerId) this.tr1.e = emv;
      else this.tr2.e = emv;
      let ratio = Math.hypot(this.tr1.e.clientX - this.tr2.e.clientX, this.tr1.e.clientY - this.tr2.e.clientY) / hypot;
      ratio = 1 + (ratio - 1) / 3;  // dampen zoom ratio
      let midX = (this.tr1.e.clientX + this.tr2.e.clientX) / 2;
      let midY = (this.tr1.e.clientY + this.tr2.e.clientY) / 2;
      for (let [target, { fontSize, left, top }] of targets) {
        target.style.fontSize = Math.max(fontSize * ratio, this.minEmSize) + "em";
        if (target !== _body_) {
          // Clamp the 0x0 anchor into the viewport so a zoom/translate can't shove
          // the element off-screen. Every .pz is a 0x0 div with its content flex-
          // centered on it, so keeping the anchor on-screen keeps the content's
          // center visible (same rule the menu/panel one-finger drag use).
          target.style.left = clamp(midX - (mid0X - left) * ratio, 0, innerWidth) + "px";
          target.style.top  = clamp(midY - (mid0Y - top)  * ratio, 0, innerHeight) + "px";
        }
        target.classList.add("pz-set");
      }
    }, { capture: true });
    // End the pinch ONLY on a real finger lift. When both fingers land on the
    // same surface, iOS/Android WebKit/Blink fire a spurious `pointercancel` for
    // the captured first pointer as the second finger joins; the pointer-watchdog
    // turns that into a SYNTHETIC `pointerup` — which would abort the pinch even
    // though both fingers are still physically down (the reported "doesn't work
    // unless the fingers straddle layout+background" bug). Synthetic events have
    // isTrusted=false, so ignore them; the pinch survives and the still-moving
    // finger keeps driving the zoom. (Not `once`, so an ignored up doesn't consume it.)
    let up = listen(_body_, "pointerup", eup => {
      if (!eup.isTrusted) return;
      eup.stopImmediatePropagation();
      this.pinchEnd();
    }, { capture: true });
    this.pinchEnd = () => {
      unlisten(mv);
      unlisten(up);
      this.pinchEnd = null;
      this.tr1 = this.tr2 = null;
    };
  }
}

async function main() {

  initFabric();
  // Create the menu. It's fontSize is set s.t. it's outer ring
  // will cover _gsgs_ (_gs_ for mobile) * narrowest screen dimension.
  // Its initial appearance is animated for a little glitz.
  // Apparently Safari doesn't always report window size correctly at
  // startup, so we delay for 500 msecs after page load before creation.

  schedule(500, async () => {
    window._menu_ = new Menu();
    // on mobile, the menu opens bigger to fill more of the screen
    let dim = (Math.min(innerWidth, innerHeight) / _menu_.menuHolder.offsetWidth) *
         (_mobile_ ? _gs_/1000 : _gsgs_/1000) ;
    animate(_menu_.elm, { left: innerWidth/2+"px", top: innerHeight/2+"px", fontSize: 0 },
       { fontSize: dim + "em" }, `font-size ${1000000 / _gs_}ms`);
    animate(_menu_.menuHolder, { transform: "rotate(-1turn)" },
      { transform: "rotate(0)" }, `transform ${1000000 / _gs_}ms`);
    animate(_menu_.disk, { transform: "rotate(2turn)" }, { transform: "rotate(0)" }, `transform ${1000000 / _gs_}ms`);
    await new SharedBuffer().init() ;
    // Extension-specific code: load PDF from URL parameter if present
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      let { loadPdfFromUrl } = await import("./ext.js");
      await loadPdfFromUrl();
    }
  }) ;

  new Gestures();

  {
    /**
        This block implements keyboard events. They are primarily used to implement external page-turning 
        devices, but of course they work from regular keyboards as well.
     **/
    let pedalKeys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
    let lastPedalTime = 0;

    listen(document, "keydown", (e) => {
      if (e.target.nodeName === 'TEXTAREA' || e.target.nodeName === 'INPUT') {
        // we don't want to process inputs to fabricjs text boxes or other text input sources
        _menu_.autoOff.run() ; // keep cell from de-activating 
        return ;
      }
      // if there is a focused element, let it process the event:
      if(document.activeElement != _body_) return ;
      // cut selected annotation (recoverable via paste):
      if ((e.key == "Delete" || e.key == "Backspace") && _score_) {
        let active = _score_.getActiveObject();
        if (active) {
          e.preventDefault();
          _menu_.cutCopyObject(active, active.canvas, true);
          return;
        }
      }
      // otherwise let active layout process navigation keys:
      if (Layout.activeLayout && pedalKeys.includes(e.key)) {
        if (e.repeat) return;
        let now = performance.now();
        if (now - lastPedalTime < 200) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lastPedalTime = now;
        e.preventDefault();
        e.stopPropagation();
        let layout = Layout.activeLayout;
        if (!layout || !_score_) return;
        let forward = _score_.numbers.forward ;
        let reverse = _score_?.numbers?.reverse
        let forwardBookMarks = e.ctrlKey || forward == "Marks";
        let reverseBookMarks = e.ctrlKey || reverse == "Marks";
        switch (e.code) {
          case "ArrowLeft":
          case "ArrowUp":
          case "PageUp":
            layout.pgOpen("prev", reverseBookMarks);
            break;
          case "ArrowRight":
          case "ArrowDown":
          case "PageDown":
            layout.pgOpen("next", forwardBookMarks);
            break;
          case "Home":
            layout.pgOpen("first", e.ctrlKey);
            break;
          case "End":
            layout.pgOpen("last", e.ctrlKey);
            break;
          default:
            return;
        }
      }
    },
    { capture:true});
  }

  let rebuildThrottle = new Schedule();

  delay(8, () => { // Set initial coordinates: 8 cycles ensures window coords "settled"
      window.iW = innerWidth ;
      window.iH = innerHeight ;
  }) ;


  listen(screen.orientation, "change", (e) => {
    delay(8, () => { // 8 cycles ensure window coords "settled"
      let iW = innerWidth ;
      let iH = innerHeight ;
      for(let child of _body_.children) {
        if(child.classList.contains("pz")) {
          child.style.left = (parseFloat(child.style.left) / window.iW) * iW + "px" ;
          child.style.top = (parseFloat(child.style.top) / window.iH) * iH + "px" ;
        }
      }
      window.iW = iW ;
      window.iH = iH ;         
    }) ;
  }) ;


  listen(window, ["resize", "fullscreenchange"], (e) => {
    delay(10, () => { // must run *after*  screen orientation change
      let layout = Layout.activeLayout;
      if (layout) {
        rebuildThrottle.cancel();
        rebuildThrottle.run(500, () => {
          layout.cell.pz = null;
          layout.build();
        });
      }
    }) ;
  });

  {
    /**
       Implement automatic "stashing" of Menu's settings:
        - stash after every pointerup event (throttled to 6.18 seconds)
      Implement automatic extension of menu's autooff timer
    **/
    let stasher = new Schedule();
    let busyGuard = new Schedule();

    listen(window, "pointerdown", (e) => {
      _menu_.busy = true;
      busyGuard.run(20000, () => _menu_.busy = false);  // 20 second safety timeout
    }) ;

    listen(window, ["pointerup","keydown"], (e) => {
      _menu_.busy = false;
      busyGuard.cancel();  
      if(_menu_.activeRing?.activeCell) _menu_.autoOff.run() ; // extend activation
      // run the stasher
      stasher.cancel();
      stasher.run(3500, () => localStorage.setItem("menu", _menu_.stashToJson("local"))) ;;
    })
  }

  {
    /**
       dbg(...)
       for debugging only, sometimes useful to display a message directly
       on the screen rather than relying on console.log
    */
    let msgs = [];
    let x = helm(`<div data-tag="dbg"></div>`);
    _body_.append(x);
    window.dbg = (...args) => {
      if (args.length == 0) msgs = [];
      let msg = args.join(" ");
      msgs.push(`${msg}`);
      while (msgs.length > 5) msgs.shift();
      x.innerHTML = msgs.join("<br>");
    };
  }
}

{ // pointer-event watchdog — prevents stuck pointers from freezing UI
  let period = 7000; // watchdog interval: nothing magic here: just a heuristic
  // pointerId -> { target, lastMove, clientX, clientY, pointerType, isPrimary }.
  // lastMove is per-pointer so a stuck pointer is reclaimed even while another
  // keeps moving (multi-touch); the coords are remembered so the synthetic
  // pointerup carries the pointer's last known position rather than (0,0).
  let activePointers = new Map();

  let upEvent = (id, p) => new PointerEvent("pointerup", {
    pointerId: id,
    pointerType: p.pointerType,
    isPrimary: p.isPrimary,
    clientX: p.clientX,
    clientY: p.clientY,
    bubbles: true,
    cancelable: true
  });

  let cancel = (id, p) => {
    p.target.dispatchEvent(upEvent(id, p));
    // A detached target can't bubble to document/window, so up listeners
    // registered there (rather than on the element itself) would be missed.
    if (!p.target.isConnected) document.dispatchEvent(upEvent(id, p));
  };

  let cancelAll = () => {
    for (let [id, p] of activePointers) cancel(id, p);
    activePointers.clear();
  };

  // Surgically release a single pointer (by id) — used for events that name the
  // pointer that was lost, so other simultaneous pointers (e.g. a piano chord)
  // are left untouched.
  let cancelOne = (e) => {
    let p = activePointers.get(e.pointerId);
    if (p) { cancel(e.pointerId, p); activePointers.delete(e.pointerId); }
  };

  let track = (e) => {
    let p = activePointers.get(e.pointerId);
    if (p) { p.lastMove = performance.now(); p.clientX = e.clientX; p.clientY = e.clientY; }
  };

  listen(document, "pointerdown", (e) => activePointers.set(e.pointerId, {
    target: e.target, lastMove: performance.now(),
    clientX: e.clientX, clientY: e.clientY,
    pointerType: e.pointerType, isPrimary: e.isPrimary
  }), { capture: true });
  listen(document, "pointermove", track, { capture: true });
  listen(document, "pointerup",   (e) => activePointers.delete(e.pointerId), { capture: true });
  // pointercancel (system gesture, scroll, native drag) and lostpointercapture both
  // name the lost pointer, so release just that one with a synthetic pointerup — this
  // runs the app's own cleanup (opUp, unlisten(mv), etc.) without a bare delete that
  // would orphan those listeners, and without disturbing other live pointers.
  listen(document, "pointercancel",      cancelOne, { capture: true });
  listen(document, "lostpointercapture", cancelOne, { capture: true });

  // These give no pointerId and mean every pointer is gone, so clear them all.
  listen(document, "visibilitychange",   cancelAll, { capture: true });
  listen(window,   "blur", cancelAll);

  let watchdogLoop = () => {
    let now = performance.now();
    for (let [id, p] of [...activePointers])
      if (now - p.lastMove > period) { cancel(id, p); activePointers.delete(id); }
    delayMs(period, watchdogLoop);
  };
  delayMs(period, watchdogLoop);
}

main();
