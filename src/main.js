// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https://www.gnu.org/licenses/>.
**/


// Podium usies in own build system that can package the entire application
// into a single file, build/podium.html. This file is built by running
// python3 build.py --podium.  All text  between +/- skip fill be stripped out,
// and all the following // #include files will be  textually included.

import { animate, dialog, delay,  helm, listen, Schedule, toast, unlisten } from "./common.js";
import "./font.js";
import { Score } from "./score.js";
import { Menu } from "./menu.js";
import { Layout } from "./layout.js";
import { initFabric } from "./canvas.js";
window.pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
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
// #include src/tool.js minified

async function main() {
  initFabric();
  //  Create the menu. It's fontSize is set s.t. that it's outer ring
  //  will cover _gsgs_ (_gs_ for mobile) * narrowest screen dimension.
  //  Its initial appearance is animated.
  window._menu_ = new Menu();
  let dim = (Math.min(window.innerWidth, window.innerHeight) / _menu_.menuHolder.offsetWidth) * (_mobile_ ? _gs_ : _gsgs_);
  animate(_menu_.disk, { transform: "rotate(1turn)" }, { transform: "rotate(0)" }, `transform ${1 / _gs_}s`);
  animate(_menu_.menuHolder, { transform: "rotate(-.5turn)" }, { transform: "rotate(0turn)" }, `transform ${1 / _gs_}s`);
  animate(_menu_.elm, { fontSize: 0 }, { fontSize: dim + "em" }, `font-size ${1 / _gs_}s`);
  _menu_.center();

  {
    /** 
        This block implements global pz operations:

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

    // defeat browser's built-in pinch-zoom
    listen(_body_, "touchmove", (e) => e.preventDefault(), { passive: false });

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
        let dXY = Math.sign(e.wheelDelta) / 100;
        if (e.shiftKey) dXY /= 10; // fine sizing mode
        for (let target of _pzTarget_ == _body_ ? document.getElementsByClassName("pz") : [_pzTarget_]) {
          let fontSize = target.style.fontSize  ;
          target.style.fontSize = Math.max(parseFloat(target.style.fontSize) + dXY, minEmSize) + "em";
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

            let [wnhg, wnwd] = [window.innerHeight, window.innerWidth] ;

            timer.run(_gsgs_*1000, () => {
              e.timedOut = true ;
              animate(_menu_.elm, null, { left: e.clientX + "px", top: e.clientY + "px" },`${_gsgs_}s`) ;
              if (_menu_.collapsed) _menu_.collapse(); // i.e. toggle open
              _menu_.opDown(e) ;
              _menu_.op.schedule.cancel() ;  // defeat menu's long-press park
              _menu_.op.moved = true ;  // defeat menu's pointerup collapse
            }) ;

            // pointer movement in px required to cancel long press (overcomes jitter)
            let cancelDelta = 16 ;

            // pointer movement in px required to invoke gestures:
            let gestureDelta = Math.min(window.innerWidth * _gsgs_, window.innerHeight * _gsgs_) ;

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
          tr2 = null;

          // ctrl-mouse-down initiates pan (via mouse move)/ zoom (via mouse wheel)
          if (e.pointerType == "mouse" && e.ctrlKey) {
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
              _body_,
              "pointerup",
              (eup) => {
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
        for (let target of tr1.pz == _body_ ? [..._body_.children] : [tr1.pz])
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
             unlisten(mv);
             tr1 = tr2 = null ;
             tr2 = null ; 
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
      let layout = Layout.activeLayout;
      let { forward, reverse } = _menu_.rings.page.cells.numbers.stash;
      if (!layout) return;
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
    });
  }

  let rebuildThrottle = new Schedule();
  listen([screen.orientation, window], ["change", "resize", "fullscreenchange"], (e) => {
    // html color picker can file change events on window...filter them out:
    if (e.currentTarget === window && e.type == "change") return;
    let layout = Layout.activeLayout;
    if (layout) {
      rebuildThrottle.cancel();
      rebuildThrottle.run(500, () => {
        layout.cell.pz = null;
        layout.build();
      });
    }
  });

  // don't allow context menu to appear
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  {
    /**
       Implement automatic "stashing" of Menu's settings:
        - stash after every pointerdown event (throttled to 6.18 seconds)
        - update window.random as a source of "true" randomness
    **/
    window.random = Math.random();
    let stasher = new Schedule();
    listen(window, "pointerdown", (e) => {
      window.random += e.timeStamp;
      stasher.cancel();

      stasher.run(5000, () => {
        let active = _menu_.rings.layout.stash.active;
        localStorage.setItem("menu", _menu_.stashToJson());
      });
    });
  }

  {
    /**
        If url query parameter "file" defined, open it. This is
        experimental code for running podium as a browser extension.
     **/
    if (window.location.search) {
      //    let file = new URLSearchParams(window.location.search).get("file");
      //    if (!file) return;
      //    let url = new URL(file);
      //    let path = `${url.protocol}//${url.host}${url.pathname}`;
      //    console.log("path:", path);
      let path = window.location.search.substring(6);

      try {
        let fetchPromise = await fetch(path, {
          method: "GET",
          //        credentials: "include",
          //        mode: "cors",
        });
        let response = await fetchPromise;
        if (response.ok) {
          let data = await response.arrayBuffer();
          let score = await new Score().init(null, "", "unknown", data);
          toast("File downloaded");
        }
      } catch (error) {
        dialog(`Error opening url <i>${path}</i><br>${error}<br>`);
      }
    }
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
      while (msgs.length > 10) msgs.shift();
      x.innerHTML = msgs.join("<br>");
    };
  }
}


main();
