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

import { animate, delay, delayMs, dialog, helm, listen, reflow, schedule, Schedule, toast, unlisten } from "./common.js";
import "./font.js";
import { escapeHtml } from "./file.js";
import { Menu } from "./menu.js";
import { Layout } from "./layout.js";
import { Score } from "./score.js";
import { ScreenPanel } from "./panel.js";
import { initFabric } from "./canvas.js";
import { SharedBuffer } from "./sharedBuffer.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
// -skip

// #include build/font.js
// #include build/sample.js
// #write let exports = {};
// #include lib/fabric.min.js
// #include lib/pdf-lib.min.js
// #include lib/fontkit.umd.min.js
// #include lib/pdf.min.js deflateAs mozSrc
// #include lib/pdf.worker.min.js deflateAs mozWorkerSrc
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

  {
    /** 
        This block implements global pan/zoom (pz) operations:

        - With mouse: ctrl-drag to move, ctrl-wheel to zoom
          ...adding shift key increases accuracy
        - With pointers: 2 simultaneous touches to move, 
          2 successive touches (> 150 msec apart) to pinch zoom

        ..and gestures:

        - left->right: enter fullscreen
        - right->left: exit fullscreen
        - top->bottom: center and expand menu
        - bottom->top: park menu
        - long press (actually, quite short!...and without significant movement)->
          move menu to pointer location and expand
    **/

    // store element to pan/zoom globally
    window._pzTarget_ = _body_;

    // react to background long-press
    let timer = new Schedule() ;

    let tr1 = null, tr2 = null; // event tracks 1 (1st pointer) and 2 (2nd pointer)
    let minEmSize = 0.1;

    // this mouse-wheel listener is used as an alternative to pinch-to-zoom
    listen(_body_, "wheel", (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        let dXY = -Math.sign(e.deltaY) / 100;
        if (e.shiftKey) dXY /= 10; // fine sizing mode
        for (let target of _pzTarget_ == _body_ ? document.getElementsByClassName("pz") : [_pzTarget_]) {
          let fontSize = parseFloat(target.style.fontSize)  || 1 ;
          target.style.fontSize = Math.max(fontSize + dXY, minEmSize) + "em";
          target.classList.add("pz-set") ;
        }
      }
    },
    { passive: false }
    );


    listen(_body_, "pointerdown", (e) => {
        if (e.isPrimary) {
          if(e.target == _body_) {
            // Gestures are potentially initiated by pointerdown on body.
            //   left->right: enter fullscreen
            //   right->left: exit fullscreen
            //   top->bottom: center and expand menu
            //   bottom->top: park menu
            //   long press (actually, quite short!...and without significant movement)->
            //      move menu to pointer location and expand
            _body_.setPointerCapture(e.pointerId);

            timer.run(_gsgs_, () => {
              e.timedOut = true ;
              animate(_menu_.elm, null, { left: e.clientX + "px", top: e.clientY + "px" },`${_gsgs_}ms`) ;
              if (_menu_.collapsed) _menu_.collapse(); // i.e. toggle open
              _menu_.opDown(e) ;
              _menu_.op.schedule.cancel() ;  // defeat menu's long-press park
              _menu_.op.moved = true ;  // defeat menu's pointerup collapse
            }) ;

            // pointer movement in px required to cancel long press (overcomes jitter)
            let cancelDelta = 16 ;

            // pointer movement in px required to invoke gestures: 15% of narrower screen dimension
            let gestureDelta = Math.min(innerWidth, innerHeight) * 0.15 ;

            let mv = listen(_body_, "pointermove", (emv) => Math.hypot(emv.movementX, emv.movementY) > cancelDelta ? timer.cancel() : null) ;

            listen(_body_, "pointerup", (eup) => {
              unlisten(mv) ;
              timer.cancel() ;
              if(e.timedOut) return ; // timer ran, so don't do anything else
              let dX = eup.clientX - e.clientX ;
              let dY = eup.clientY - e.clientY ;
              if(dX > gestureDelta) document.documentElement.requestFullscreen() ;
              else if(-dX > gestureDelta && document.fullscreenElement) document.exitFullscreen() ;
              delay(1, () => { // this delay ensures any fullscreen change is executed *before* menu
                if(dY > gestureDelta) _menu_.center(true) ;
                else if(-dY > gestureDelta) _menu_.park() ;
              }) ;
            }, { once:true} ) ;
          }

          // Define track 1: state of first pointer down
          tr1 = { e: e, pz: e.target.closest(".pz") || _body_ };
          tr1.dX = e.clientX - tr1.pz.offsetLeft;
          tr1.dY = e.clientY - tr1.pz.offsetTop;
          _pzTarget_ = tr1.pz ?? _body_; // make target globally available
          // Unless target is a panel's close button, 
          // notify ScreenPanel: it implements an alternative to pan/zoom mechanism.
          if(!e.target.classList.contains("Panel__closer")) ScreenPanel.update(tr1.pz) ;
          tr2 = null;

          // ctrl-mouse-down initiates pan (via mouse move)/ zoom (via mouse wheel)
          if (e.ctrlKey) {
            _menu_.op.schedule.cancel();
            timer.cancel(); // cancel any pending long-press operation on background
            e.stopImmediatePropagation();

            let mv = listen(
              _body_,
              "pointermove",
              (emv) => {
                emv.stopImmediatePropagation();
                if(tr1.pz == _body_) return ;
                tr1.pz.style.left = emv.clientX - tr1.dX + "px";
                tr1.pz.style.top = emv.clientY - tr1.dY + "px";
                tr1.pz.classList.add("pz-set") ;
              },
              { capture: true }
            );

            listen(
              _body_,"pointerup", (eup) => {
                eup.captured = true;
                unlisten(mv);
              },
              { capture: true, once: true }
            );
          }
          return;
        }
        if (tr2) return; // ignore 3rd, 4th,...pointers
        // The Piano tool is polyphonic, so ignore the second (third, fourth...) touch
        // when it looks like a piano key:
        if(e.target.dataset.midi) return ;
        // If we reach here, this is the 2nd pointer: prepare for 2-pointer pan/zoom
        _menu_.op.schedule.cancel(); // cancel any pending long-press operation in menu
        timer.cancel(); // cancel any pending long-press operation in background
        e.stopImmediatePropagation();
        tr2 = { e: e, pz: e.target.closest(".pz") || _body_ };
        tr2.dX = e.clientX - tr2.pz.offsetLeft;
        tr2.dY = e.clientY - tr2.pz.offsetTop;
        let hypot = Math.hypot(tr1.e.clientX - tr2.e.clientX, tr1.e.clientY - tr2.e.clientY);
        let targets = new Map(); // map target -> current, original fontSize in em's
        for (let target of tr1.pz == _body_ ? _body_.getElementsByClassName("pz") : [tr1.pz])
           targets.set(target, parseFloat(target.style.fontSize) || 1);

        // For translations, we only consider one pointer track...tr1 by default unless tr1.pz is body, then tr2,
        // unless it also is on body: in this case, skip translation entirely.
        let transTr = tr1.pz != _body_ ? tr1 : tr2.pz != _body_ ? tr2 : null ;
        let mv = listen(_body_, "pointermove", (emv) => {
          emv.stopImmediatePropagation();

          // translate:
          if (emv.pointerId == transTr?.e?.pointerId) {
            transTr.pz.style.left = emv.clientX - transTr.dX + "px";
            transTr.pz.style.top = emv.clientY - transTr.dY + "px";
             transTr.pz.classList.add("pz-set") ;
          }

          // scale:
          if (emv.pointerId == tr1.e.pointerId) tr1.e = emv;
          else tr2.e = emv;
          let ratio = (Math.hypot(tr1.e.clientX - tr2.e.clientX, tr1.e.clientY - tr2.e.clientY) / hypot)  ;
          ratio = 1 + (ratio - 1) / 3 ; // dampen the zoom ratio 
          for (let [target, fontSize] of targets) {
            target.style.fontSize = Math.max(fontSize * ratio, minEmSize)  + "em";
            target.classList.add("pz-set") ;
          }
        },
        { capture: true }
        );

        listen(_body_, "pointerup", (eup) => {
          eup.stopImmediatePropagation();
             unlisten(mv);
             tr1 = tr2 = null ;
          },
          { capture: true, once: true }
        );
      },
      { capture: true }
    );
  }

  {
    /**
        This block implements keyboard events
        They are primarily used to implement external page-turning 
        devices, but of course they work from regular keyboards
        as well.
     **/
    listen(document, "keydown", (e) => {
      if(e.target.type == "text") return ;  // ignore keydown from a text input
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
          e.preventDefault(); // Prevent iOS from scrolling 
          layout.pgOpen("prev", reverseBookMarks);
          break;
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          e.preventDefault(); 
          layout.pgOpen("next", forwardBookMarks);
          break;
        case "Home":
          e.preventDefault(); 
          layout.pgOpen("first", e.ctrlKey);
          break;
        case "End":
          e.preventDefault(); 
          layout.pgOpen("last", e.ctrlKey);
          break;
        default:
          return;
      }
    });
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

  // don't allow context menu to appear
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
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
    let x = helm("<div></div>");
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
  let activePointers = new Map();

  let cancelAll = () => {
    for (let [id, target] of activePointers) {
      target.dispatchEvent(new PointerEvent("pointerup", {
        pointerId: id,
        bubbles: true,
        cancelable: true
      }));
    }
    activePointers.clear();
  };

  let lastMoveTime = 0;
  listen(document, ["pointermove", "pointerdown"], () => lastMoveTime = performance.now(), { capture: true });
  listen(document, "pointerdown",   (e) => activePointers.set(e.pointerId, e.target), { capture: true });
  listen(document, "pointerup",     (e) => activePointers.delete(e.pointerId), { capture: true });
  listen(document, "pointercancel", (e) => activePointers.delete(e.pointerId), { capture: true });

  listen(document, "visibilitychange",   cancelAll, { capture: true });
  listen(document, "lostpointercapture", cancelAll, { capture: true });
  listen(window,   "blur", cancelAll);

  let watchdogLoop = () => {
    if (activePointers.size > 0 && performance.now() - lastMoveTime > period)
      cancelAll();
    delayMs(period, watchdogLoop);
  };
  delayMs(-1);
  delayMs(period, watchdogLoop);
}

main();

