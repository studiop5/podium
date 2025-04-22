// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https://www.gnu.org/licenses/>.
**/

import { ButtonGroup, clamp, clearChildren, css, dataIndex, delay, delayMs, dialog, flung, getBox, helm, hide, iconSvg, listen, mvmt, unlisten, saveLocal, schedule, Schedule, SliderGroup, TabView, pxToEm } from "./common.js";
import { pianoSamples } from "./sample.js";
export { Review, Metronome, Clock, Stopwatch, Piano, Volume };

// -skip

/**
class Piano
   Implements a Panel that shows a playable, configurable keyboard.
*/


// Conversion functions for cents <-> hz, where 0 cents <-> 440 hz,
// -1200 cents <-> 220 hz, 1200 cents <-> 880hz, etc etc
let centsToHz = (cents) => Math.pow(2, cents / 1200) * 440;
let hzToCents = (hz) => 1200 * Math.log2(hz / 440);

class Piano {
  static css = css(
    "Piano",
    `
    .Piano__keyboard {
      display:flex;
      position:relative;
      width:fit-content; 
    }
    .Piano__key-white {
      flex-shrink:0;
      height:16em;
      width:4em;
      z-index:1;
      border-left:.06em solid #bbb;
      border-bottom:.06em solid #bbb;
      border-radius:0 0 .3em .3em;
      box-shadow:-.06em 0 0 rgba(255,255,255,0.8) inset,0 0 .3em #ccc inset,0 0 .18em rgba(0,0,0,0.2);
      background:linear-gradient(to bottom,#eee 0%,#fff 100%) ;
    }
    .Piano__key-white:active {
      border-top:.06em solid #777;
      border-left:.06em solid #999;
      border-bottom:.06em solid #999;
      box-shadow:.18em 0 .18em rgba(0,0,0,0.1) inset,-.3em .3em 1.2em rgba(0,0,0,0.2) inset,0 0 .18em rgba(0,0,0,0.2);
      background:linear-gradient(to bottom,#fff 0%,#e9e9e9 100%) ;
    }
    .Piano__key-black {
      flex-shrink:0;
      height:8em;
      width:2em;
      margin:0 0 0 -1em;
      z-index:2;
      border:.06em solid #000;
      border-radius:0 0 .18em .18em;
      box-shadow:-.06em -.06em .18em rgba(255,255,255,0.2) inset,0 -.3em .18em 3px rgba(0,0,0,0.6) inset,0 .18em .24em rgba(0,0,0,0.5);
      background:linear-gradient(45deg,#222 0%,#555 100%);
    }
    .Piano__key-black:active {
      box-shadow:-.06em -.06em .18em rgba(255,255,255,0.2) inset,0 -.18em .18em 3px rgba(0,0,0,0.6) inset,0 .06em .18em rgba(0,0,0,0.5);
      background:linear-gradient(to right,#444 0%,#222 100%)
    }
    .a,.b,.d,.e,.g {
      margin:0 0 0 -1.16em
    }
    .Piano__button { 
      position: absolute;
      font-family: Bravura;
      height: 2em;
      width: 2em;
      top: .5em;
      border-radius: 100% ;
      background: #eee6;
    }
    .Piano__button-active {
      background: #3336;
   }
    .Piano__options {
      position:absolute;
      width:27em;
      height:15.75em;
      top:3.125em;
      z-index:150;
      background:#ddd;
      border-radius: var(--borderRadius);
      overflow:hidden;
      left: calc(50% - 13.5em);
      filter: var(--bodyShadow);
      visibility:hidden ;
      text-align:center ;
      box-shadow: 0.3em 0.3em 1.6em #aaa inset, -0.3em -0.3em 1.6em #aaa inset ;
    }
    .Piano__options__options {
      margin: .5em 6.5em .5em 6.5em;
      padding: 1em;
      font-size: .65em;
      line-height: 1.45em ;
      text-align:left;
      background:#ccc;
      border-radius:var(--borderRadius);
    }
    .Piano__options__option {
       /* marker only */
    }
    .Piano__options__option-active { 
      background: #8888;
      border-radius: .2em;
     }
    `
  );

  // temperaments are encoded as a cents offset from first tone of a chromatic octave
  temperaments = {
    Equal: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200],
  };

  tunings = {
    // Definitions from github.com/djensenius/tune.ts/tree/main/src/tune
    Meanquar: { description: "1/4-comma meantone scale. Pietro Aaron's temp. (1523). 6/5 beats twice 3/2", frequencies: [261.6255653006, 273.37431312998, 292.50627485027, 312.977175335, 327.03195662575, 349.91912034749, 365.63284274659, 391.22147055517, 408.78994578219, 437.39890198442, 468.01003810189, 489.02683710225, 523.2511306012], name: "Meanquar" },
    Werck3: { description: "Andreas Werckmeister's temperament III (the most famous one, 1681 [sic])", frequencies: [261.6255653006, 275.62199471997, 292.34127285051, 310.07474405997, 327.77163799145, 348.83408706747, 367.49599295996, 391.11111150212, 413.43299207996, 437.02884834934, 465.11211608996, 491.65745674141, 523.2511306012], name: "Werck3" },
    Kirnberger: { description: "Kirnberger's well-temperament, also called Kirnberger III, letter to Forkel 1779", frequencies: [261.6255653006, 275.62199471997, 292.50627485027, 310.07474405997, 327.03195662575, 348.83408706747, 367.91095120397, 391.22147055517, 413.43299207996, 437.39890198442, 465.11211608996, 490.54793493862, 523.2511306012], name: "Kirnberger" },
    Young: { description: "Thomas Young well temperament (1807), also Luigi Malerbi nr.2 (1794)", frequencies: [261.6255653006, 275.62199471997, 293.00227310437, 310.07474405997, 328.14198392915, 348.83408706747, 367.49599295996, 391.5530240856, 413.43299207996, 438.51190905657, 465.11211608996, 491.10256480205, 523.2511306012], name: "Young" },
  };

  elm = helm(`<div style="justify-content:center;display:flex;" data-tag="body">
                <div data-tag="keyboard" class="Piano__keyboard">${this.buildKeyboard()}</div>
                <div data-tag="options" class="Piano__options"></div>
             </div>`);

  sustaining = false;
  tuning = false;
  repeater = new Schedule(); // repeats notes while tuning
  damper = new Schedule(); // damps repeated notes while tuning
  looper = new Schedule(); // stops looping of oboe sample while tuning

  horizontalDragConstraint = {
    min: 0,
    max: 0,
  };

  constructor(panel, cell) {
    this.panel = panel;
    this.cell = cell;
    Object.assign(this, dataIndex("tag", this.elm));
    this.c4Elm = dataIndex("midi", this.elm)["60/0"];

    // complete the temperaments table with several historical tunings
    // by converting frequency ratios to cents
    let toCents = (num, den) => 1200 * Math.log2(num / den);
    for (let [key, val] of Object.entries(this.tunings)) {
      let cents = [0];
      for (let i = 0; i < 12; i++) {
        cents.push(toCents(val.frequencies[i + 1], val.frequencies[i]) + cents[i]);
      }
      this.temperaments[key] = cents;
    }

    // pedal button...swaps Pedal and PedalUp icons
    let pedalDownButton = helm(
      `${iconSvg("Pedal", {
        tag: "pedal",
        class: "Piano__button",
        style: "right:calc(50% + 9em);",
      })}`
    );
    let pedalUpButton = (this.pedalUpButton = helm(
      `${iconSvg("Pedal Up", {
        tag: "pedalup",
        class: "Piano__button",
        style: "right:calc(50% + 9em);",
      })}`
    ));
    this.panel.header.append(pedalDownButton);

    this.panel.listeners.push(
      listen(pedalDownButton, ["pointerdown", "spacebar"], (e) => {
        e.stopPropagation();
        this.sustaining = true;
        pedalDownButton.replace(pedalUpButton);
      })
    );

    this.panel.listeners.push(
      listen(pedalUpButton, ["pointerdown", "spacebar"], (e) => {
        e.stopPropagation();
        this.sustaining = false;
        pedalUpButton.replace(pedalDownButton);
      })
    );
    Object.assign(this, { pedalDownButton, pedalUpButton });

    this.panel.listeners.push(
      listen(document, ["keydown", "keyup"], (e) => {
        if (e.code == "Space" && !e.repeat) {
          let e2 = new PointerEvent("spacebar");
          if (e.type == "keydown") pedalDownButton.dispatchEvent(e2);
          else pedalUpButton.dispatchEvent(e2); // keyup
        }
      })
    );

    // tuner: control that repeats key press every 2 seconds
    // as an tuning aid. Must be an ivar: used on keyboard noteOn.
    this.tunerButton = helm(
      `${iconSvg("TuningFork", {
        tag: "tune",
        class: "Piano__button",
        style: "left:calc(50% + 9em);",
      })}`
    );
    this.panel.header.append(this.tunerButton);
    this.panel.listeners.push(
      listen(this.tunerButton, "pointerdown", () => {
        this.tunerButton.classList.toggle("Piano__button-active");
        this.tuning = this.tunerButton.classList.contains("Piano__button-active");
        if (this.tuningScheduler) {
          this.tuningScheduler.cancel();
          this.tuningScheduler = null;
        }
      })
    );

    // Control to allow adjusting keyboard width
    let stretcherButton = helm(
      `${iconSvg("Stretch", {
        tag: "tune",
        class: "Piano__button",
        style: "right:calc(50% + 5em);",
      })}`
    );

    this.panel.header.append(stretcherButton);

    this.panel.listeners.push(
      listen(stretcherButton, "pointerdown", (e) => {
        e.stopPropagation();
        e.offWidth = this.panel.panel.offsetWidth;
        e.offLeft = this.panel.panel.offsetLeft;

        e.keyWidth = this.keyboard.offsetWidth;
        e.keyOffLeft = this.keyboard.offsetLeft;
        e.target.setPointerCapture(e.pointerId);
        stretcherButton.classList.add("Piano__button-active");
        this.panel.header.classList.add("Panel__header-selected");

        let mv = listen(e.target, "pointermove", (emv) => {
          let delta = emv.clientX - e.clientX;
          let minWidth = this.c4Elm.offsetWidth * 9.75; // minimum display E3-A4
          let newWidth = clamp(e.offWidth + delta + delta, minWidth, this.keyboard.offsetWidth);
          if (newWidth > minWidth && newWidth < this.keyboard.offsetWidth) {
            this.panel.panel.style.width = pxToEm(newWidth, this.panel.elm) ;
            let left = clamp(e.keyOffLeft + delta, e.offWidth - e.keyWidth, 0);
          }
        });

        listen(
          e.target,
          "pointerup",
          () => {
            unlisten(mv);
            stretcherButton.classList.remove("Piano__button-active");
            this.panel.header.classList.remove("Panel__header-selected");
          },
          { once: true }
        );
      })
    );

    // options button
    this.optionsButton = helm(
      `${iconSvg("Options", {
        tag: "options",
        class: "Piano__button",
        style: "left:calc(50% + 5em);transform:scale(.9) translate(0px,2px);",
      })}`
    );
    this.panel.header.append(this.optionsButton);

    this.panel.listeners.push(
      listen(this.optionsButton, "pointerdown", (e) => {
        e.stopPropagation();
        if (this.optionsButton.classList.contains("Piano__button-active")) {
          this.optionsButton.classList.remove("Piano__button-active");
          this.optionsView.elm.style.visibility = "hidden";
        } else {
          this.optionsButton.classList.add("Piano__button-active");
          this.optionsView.elm.style.left = "calc(50% - 13.5em);";
          this.optionsView.elm.style.visibility = "visible";
        }
      })
    );

    this.buildAudio();
    this.buildOptions();
  }

  destructor() {
    this.repeater.cancel();
    this.damper.cancel();
    this.looper.cancel();
    unlisten(this.volumeListener);
  }

  // Build the web audio pipeline for the keyboard
  async buildAudio() {
    let activeNotes = new Map() ;
    let actx = new AudioContext();

    let volume = new GainNode(actx) ;
    volume.gain.setValueAtTime(_menu_.rings.more.cells.volume.stash.volume, actx.currentTime);
    volume.connect(actx.destination) ;    
    this.panel.listeners.push(listen(_body_, "volumechanged", (e) => volume.gain.setValueAtTime(e.detail, actx.currentTime))) ;


    let compressor = new DynamicsCompressorNode(actx, {
      threshold: -50,
      knee: 40,
      ratio: 12,
      attack: 0,
      release: 0.25,
    }) ;
    compressor.connect(volume) ;


    // decode audio samples (if not already decoded: we check only middle C)
    if(!(pianoSamples[60] instanceof AudioBuffer)) Object.keys(pianoSamples).forEach(async (key) => {
      let noteSamples = pianoSamples[key];
      let len = noteSamples.length;
      let bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = noteSamples.charCodeAt(i);
      actx.decodeAudioData(bytes.buffer, (res) => (pianoSamples[key] = res));
    });

    let noteOff = (tag, force=false) => {
        let note = activeNotes.get(tag) ;
        if(note && (force || !(this.sustaining || this.tuning)))  {
          note.envelope.gain.setTargetAtTime(0, actx.currentTime, 0.015);
          activeNotes.delete(tag) ;
          schedule(15, () => note.source.stop());
       }
    }

    listen([this.pedalUpButton, this.tunerButton], ["pointerdown","spacebar"], (e)=> {
       activeNotes.forEach((note, tag) => noteOff(tag, true)) ;
       this.repeater.cancel() ;
       this.damper.cancel() ;
       this.looper.cancel() ;
    }) ;


    let noteOn = (midiOffset) => {
      let [midiNum, centsOffset] = midiOffset.split("/");
      let piano = this.cell.stash.timbre == "piano"  ;
      let now = actx.currentTime ;
      let a4 = this.cell.stash.a4; // offset, in cents, from 440hz
      let source;

      // Create an envelope using a GainNode to ramp up/down notes gracefully.
      let envelope = new GainNode(actx) ;

      // define the source node: oscillator or audio buffer:
      if (piano) {
       source = new AudioBufferSourceNode(actx) ;
       source.buffer = pianoSamples[midiNum]; 
      }   
      else
        source = new OscillatorNode(actx, {
          frequency: 440 * (2 ** ((midiNum - 69) / 12)),
          type: "sine",
        });

      // Adjust source frequency for value of a4 and temperament.
      // For our sampled piano, we use 4 samples per octave, not 12, so
      // one midiNumber is used for 3 piano keys. The centsOffset value indicates how
      // much extra to tune/detune the sample to get the correct pitch.
      let midi0 = midiNum % 12; // midiNum in lowest octave

      source.detune.value = parseInt(centsOffset) + this.cell.stash.a4 
          + this.temperaments[this.cell.stash.temperament][midi0] - midi0 * 100;
      source.connect(envelope);
      envelope.connect(compressor);

      if (this.tuning) {
        // when tuning, we "auto repeat" the note by recusive calls to noteOn
        let repeatMs = piano ? 2500:4000 ;
        this.repeater.run(repeatMs, () => noteOn(midiOffset));
        this.tunerButton.animate([{ color: "black" }, { color: "white" }], repeatMs);
        // dampen the note just before it repeats
        this.damper.run(piano ? 2200:7500, () => envelope.gain.setTargetAtTime(0.0, now, 0.015)); 
      }
      else envelope.gain.setTargetAtTime(1.0, now,  0.015); 

      // Don't allow same note to sound more than once
      if(activeNotes.has(midiOffset)) 
        noteOff(midiOffset, true) ;
      // Trim activeNotes to current "voices" setting
      while(activeNotes.size > this.cell.stash["voices"] - 1) noteOff(activeNotes.keys().next().value, true) ;
      // ...and now sound the new Note
      source.start(0);
      activeNotes.set(midiOffset, { midiOffset, envelope, source}) ;
    };

    // piano key press handler
    this.panel.listeners.push(listen(this.keyboard, "pointerdown", (e) => {
      e.target.setPointerCapture(e.pointerId); 
      let midiOffset = e.target.dataset.midi;
      noteOn(midiOffset) ;
      listen(e.target, "pointerup", (e) => {
        noteOff(midiOffset) ;
      }, {once:true});
    })) ;
  }

  buildKeyboard() {
    // Dynamically generate a div for each key
    let keyHtml = "";
    let noteNames = ["c", "cs", "d", "ds", "e", "f", "fs", "g", "gs", "a", "as", "b"];
    // we have "real" samples only for c,ds,fs, and a...intermediate pitches
    // are obtained by interpolating cents. This table maps midi numbers in
    // 0-12 to closest midi number we have a real sample for (in 0-12, does not
    // include octaves) plus its cents offset from that sample.
    let midiTable = {
      0: [0, 0],
      1: [0, 100],
      2: [3, -100],
      3: [3, 0],
      4: [3, 100],
      5: [6, -100],
      6: [6, 0],
      7: [6, 100],
      8: [9, -100],
      9: [9, 0],
      10: [9, 100],
      11: [12, -100],
    };

    let notesIndex = -1;
    // Show standard harpsichord/fortepiano range f1 - f6
    for (let midi = 29; midi < 89; midi++) {
      //for (let midi = 31; midi < 89; midi++) {
      let midi0 = midi % 12;
      let octave = Math.floor(midi / 12) * 12;
      let noteName = noteNames[midi0];
      let clazz = noteName.includes("s") ? "Piano__key-black" : "Piano__key-white" + " " + noteName;
      let realMidiNumber = midiTable[midi0][0] + octave;
      let midiOffset = realMidiNumber + "/" + midiTable[midi0][1];
      keyHtml += `<div data-midi="${midiOffset}" class="${clazz}"}></div>\n`;
    }
    // last high f taken from lower d2 + 200 cents
    keyHtml += `<div data-midi="87/200" class="Piano__key-white f"></div>`;
    return keyHtml;
  }

  buildOptions() {
    // build the options tabview
    let optionsView = new TabView(this.panel, "Pitch", "Temperament", "Timbre");
    let elm = optionsView.elm ;
    elm.classList.add("Piano__options");
    this.options.replace(elm) ;

    // options panel is draggable by its frame left/right, with fling to close.
    optionsView.frame.style.marginTop = 0;
    optionsView.draggable = false; // defeat default l-r sash dragging of tabs
    let minDx = this.panel.elm / _pxPerEm_ ;
    this.panel.listeners.push(
      listen(optionsView.sash, "pointerdown", (e) => {
        optionsView.sash.classList.add("Panel__header-selected");
        let offsetX = e.clientX - optionsView.frame.offsetLeft ;
        let limit = this.body.offsetWidth - optionsView.frame.offsetWidth ;
        let mv = listen(optionsView.frame, "pointermove", (emv) => {
           if(emv.movementX) optionsView.sash.setPointerCapture(e.pointerId);
            optionsView.frame.style.left = clamp(emv.clientX - offsetX, 0, limit) + "px";
            e.emv = emv ;
        }) ;
        listen(optionsView.sash, "pointerup", (eup) => {
          if(flung(e.emv, eup)) {
            hide(elm, this.optionsButton) ;
            delay(10, () => this.optionsButton.classList.remove("Piano__button-active"));
          }
          optionsView.sash.classList.remove("Panel__header-selected");
          unlisten(mv)},
        {once:true}) ;
    })) ;

    let option = (tag, optText, prefix=" ", url=null, urlText="") => {
      // Used to format a tab's options: a function avoids tedious repetition
      let txt1 =`<div ${tag} class="Piano__options__option">&nbsp;${optText}<span style="position:absolute;left:18em;">${prefix}` ;
      let txt2 = url ? `<a href="https:/\/${url}" target="_blank" rel="noopener noreferrer">${urlText}</a></span></div>`
      : "</div>" ;
      return txt1 + txt2
    };

    // Pitch tab
    {
      let tags = dataIndex("tag", helm(`      
        <div data-tag="pitch">
          <div data-tag="a4" style="width:50em;margin-top:.4em;"></div>
          <div data-tag="options" class="Piano__options__options">
            ${option("data-hz=\"415\"", "A = 412 Hz",  "",
             "en.wiktionary.org/wiki/baroque_pitch", "Baroque Pitch")}
            ${option("data-hz=\"430.54\"", "A = 430.54 Hz", "",
              "en.wikipedia.org/wiki/Scientific_pitch","Scientific Pitch")}
            ${option("data-hz=\"432\"", "A = 432 Hz", "",
              "www.youtube.com/watch?v=LjR0WpWwLrE","Verdi's A")}
            ${option("data-hz=\"440\"", "A = 440 Hz", "International Standard, ",
               "www.iso.org/standard/3601.html", "ISO 16:1975")}
            ${option("data-hz=\"442\"", "A = 442 Hz", "New York Philharmonic")}
            ${option("data-hz=\"443\"", "A = 443 Hz", "Berliner Philharmoniker")}
            ${option("data-hz=\"466\"", "A = 466 Hz", "",
              "boulderbachbeat.wordpress.com/tag/chorton/","Chorton")}
          </div>
        </div>`)
      );

      optionsView.tabs.Pitch.face.append(tags.pitch);

      let a4msg = (tag, cents) => {
        let hz = centsToHz(cents).toFixed(2) ;
        cents = Math.round(cents) ;
        hz = parseInt(hz * 100) / 100 ;
        let inHz = `A4 = ${hz} Hz ` ;
        let inCents = cents == 0 ? "" :
           cents > 0 ? `(440 Hz + ${cents} cents)`:
                       `(440 Hz - ${-cents} cents)`;
        return inHz + inCents ;
      };

      let optionElms = Object.values(dataIndex("hz", tags.options));

      let a4Group = new SliderGroup(this.cell.stash,
        { a4:
          { // + or - cents offset from 440
            slope: 0.2,
            min: -1200,
            max: 1200,
            msg: a4msg,
            step: 1,
          },
        },
        (e, tag, value) => {
           optionElms.forEach((elm) => elm.classList.remove("Piano__options__option-active")) ;
        }
      );

      tags.a4.replace(a4Group.elm);

      this.panel.listeners.push(listen(tags.options, "pointerup", (e) => {
        optionElms.forEach((elm) => elm.classList.remove("Piano__options__option-active"));
        let active = e.target.closest(".Piano__options__option") ;
        active.classList.add("Piano__options__option-active");
        this.cell.stash.a4 = hzToCents(active.dataset.hz) ;
        a4Group.refresh() ;
      }));

      // establish current pitch
      for(let elm of optionElms) 
        if (elm.dataset.hz == centsToHz(this.cell.stash.a4)) {
           elm.classList.add("Piano__options__option-active");
           break ;
      };

    }

    // Temperament tab
    {
      let tags = dataIndex("tag", helm(
        `<div data-tag="temperament" style="padding-top:2.5em">
           <div data-tag="options" class="Piano__options__options">
              ${option("data-temper=\"Equal\"", "Equal",  "<sup>12</sup>\u221A2, ",
                "en.wikipedia.org/wiki/12_equal_temperament", "12-ET")}
              ${option("data-temper=\"Meanquar\"", "\u00bc Comma Meantone", "1523, ",
                 "en.wikipedia.org/wiki/Pietro_Aron", "Pietro Aron")}
              ${option("data-temper=\"Werck3\"", "Werkmeister III", "1691, ",
               "www.hpschd.nu/index.html?nav/nav-4.html&t/welcome.html&https:/\/www.hpschd.nu/tech/tmp/werckmeister.html",
               "Werkmeister III")}
              ${option("data-temper=\"Kirnberger\"", "Kirnberger III", "1779, ",
                "en.wikipedia.org/wiki/Kirnberger_temperament", "Kirnberger Temperament")}
              ${option("data-temper=\"Young\"", "Valotti Young","1799, ","en.wikipedia.org/wiki/Young_temperament", "Young Temperament")}
        </div>
      </div>`)
      );


      optionsView.tabs.Temperament.face.append(tags.temperament);
      let optionElms = Object.values(dataIndex("temper", tags.options));

      this.panel.listeners.push(listen(tags.options, "pointerup", (e) => {
        optionElms.forEach((elm) => elm.classList.remove("Piano__options__option-active"));
        let active = e.target.closest(".Piano__options__option") ;
        active.classList.add("Piano__options__option-active");
        this.cell.stash.temperament = active.dataset.temper;
      }));

      // establish current temperament
      for(let elm of optionElms) 
        if (elm.dataset.temper == this.cell.stash.temperament) {
           elm.classList.add("Piano__options__option-active");
           break ;
      };
    }

    //  Timbre tab
    {
      let tags = dataIndex("tag", helm(
        `<div data-tag="timbre">
           <div data-tag="voices" style="width:50em;padding-bottom:1.5em;"></div>
           <div data-tag="options" class="Piano__options__options">
             ${option("data-timbre=piano","Piano","Yamaha C5, ", "archive.org/details/SalamanderGrandPianoV3","Salamander V3")}
             ${option("data-timbre=sine","Tuning Fork", "Pure Sine Wave, ", 
              "www.whipplemuseum.cam.ac.uk/explore-whipple-collections/acoustics/historical-notes-brief-chronicle-tuning-fork",
              "Brief Chronicle")}
          </div>
       </div>`));


      let voicesGroup = new SliderGroup(this.cell.stash,
      { voices:
        { slope: 0.5,
          min: 1,
          max: 16,
          msg: (tag, value) => value == 1 ? "Monophonic": value + " Voices",
          step: 1,
          value: 1,
        } }, (e, tag, value) => {}
      );

      voicesGroup.elm = tags.voices.replace(voicesGroup.elm);
      voicesGroup.elm.style.paddingBottom = "1em" ;

      optionsView.tabs.Timbre.face.append(tags.timbre);
      let optionElms = Object.values(dataIndex("timbre", tags.options));

      this.panel.listeners.push(listen(tags.options, "pointerup", (e) => {
        optionElms.forEach((elm) => elm.classList.remove("Piano__options__option-active"));
        let active = e.target.closest(".Piano__options__option") ;
        if(active) {
          active.classList.add("Piano__options__option-active");
          this.cell.stash.timbre = active.dataset.timbre;
        }
      }));

      // establish current timbre
      for(let elm of optionElms) 
        if (elm.dataset.timbre == this.cell.stash.timbre) {
           elm.classList.add("Piano__options__option-active");
           break ;
      };
    }

    optionsView.tabs.Pitch.select();
    this.optionsView = optionsView;
  }

  show() {
    // Move c4 (middle C) to center of keyboard.
    // note: this assumes middle C key's tag is
    // "60/0", i.e. midi 60 plus 0 cents adjustment.
    // Note: the -2  here subtracts half the width of a key
    this.keyboard.style.left = (this.elm.offsetWidth / 2 - this.c4Elm.offsetLeft) / _pxPerEm_ - 2 + "em";
  }
}

/**
class Surface

  Superclass of Volume, Clock, Stopwatch, and Metronome.  These panels
  all contain a "subwidget", their "surface", that can be dragged off
  the panel and attached directly to document.body. The surface can be
  flung (...hide()), long-pressed or clicked (this.onSurfaceEvent(...))
*/
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
      filter:var(--bodyShadow);
    }`
  );

  surface = helm(`<div data-tag="surface" class="Surface"></div>`);
  surfaceDragElm = null; // subclasses must define

  constructor(panel) {
    this.panel = panel;
    let surface = this.surface;
    let longPresser = new Schedule();

    panel.listeners.push(listen(surface, "pointerdown", (e) => {
      // Ignore pointerdown outside of circular area enclosed by this.surfaceDragElm
      let box = getBox(this.surfaceDragElm) ;
      if(Math.hypot(e.clientX - box.x - box.width / 2, e.clientY - box.y - box.height /2) > box.width / 2) return ;
      _body_.setPointerCapture(e.pointerId);
      longPresser.run(_longPressMs_,() => this.onSurfaceEvent("press")) ;
      let dX = e.offsetX, dY = e.offsetY ; // warning: e can be gc'ed before mv references it.
      let mv = listen(_body_, "pointermove", (emv) => {
        if(surface.parentElement == _body_) {
          surface.style.left = emv.clientX - dX + "px";
          surface.style.top = emv.clientY - dY + "px";
          mvmt(e,emv) ;
        }
        else if(mvmt(e,emv)) {
          // attach surface to document body
          longPresser.cancel() ;
          surface.style.fontSize = panel.elm.style.fontSize;
          surface.style.position = "absolute";
          surface.classList.add("pz"); // this makes it pan-zoomable 
          _body_.append(surface);
          _pzTarget_ = surface; // this allows pan-zooming without having to reselect
          hide(this.panel.elm, _menu_.elm);
          surface.style.left = emv.clientX - dX + "px";
          surface.style.top = emv.clientY - dY  + "px";

        }
      });

      listen(_body_, "pointerup",(eup) => { 
          longPresser.cancel() ;
          unlisten(mv) ;
          let downTime = eup.timeStamp - e.timeStamp ;
          if (e.moved && downTime < 250) hide(surface, _menu_.elm) ; // fling
          else if(downTime < _longPressMs_) this.onSurfaceEvent("click") ;
        },  { once: true }) ;
    }));
    delay(2, () => this.build());
  }

  destructor() {}

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
class Volume
*/
class Volume extends Surface {
  constructor(panel) {
    super(panel);
    this.surface.style.height = "4em";
    this.surface.style.width = "12em";
    this.volumeSlider = new SliderGroup(this.panel.cell.stash,
    { volume: { min: 0, max: 1, step: 0.1, value: 1, msg: "Volume: {value}" } },
    (e, tag, value) => {
      this.panel.cell.stash.tag = value;
      _body_.dispatchEvent(new CustomEvent("volumechanged", { detail: value }));
    });
    this.surface.prepend(this.volumeSlider.elm);
    this.surfaceDragElm = this.volumeSlider.elm;
    delay(2, () => this.volumeSlider.refresh());
  }
}

/**
class Clock
   Simple 12-hour analog clock face with date complication   
*/
class Clock extends Surface {
  clockSchedule = new Schedule(0, () => this.refreshClock());

  constructor(panel) {
    super(panel);
  }

  destructor() {
    super.destructor();
    this.clockSchedule.cancel();
  }

  build() {
    let clock = helm(`
      <svg data-tag="clock" transform="scale(1,1)"
        style="position:relative;pointer-events:none;"
        viewBox="0 0 1200 1200">
        <defs><path id="face" d="M 600,250 A 350,350 0 0 1 600 950 A 350,350 0 1 1 600,250"/></defs>
        // Circular outline of clock
        <circle data-tag="surfaceDragElm" cx="600" cy="600" r="480" fill="#eee"/>
        <circle cx="600" cy="600" r="450" fill="white"/>
        // Major ticks on outer face: every 5 seconds
        <circle pathLength="120" fill="none" stroke="currentColor" cx="600" cy="600" r="300"
          transform="rotate(-1.75,600,600) "stroke-width="20" stroke-dashArray="1 9"/>
        // clock face
        <text style="font-size:90px;font-family:Luminari">
          <textPath startOffset="0%" href="#face"><tspan  text-anchor="middle">XII</tspan></textPath>
          <textPath startOffset="8.33%" href="#face"><tspan  text-anchor="middle">I</tspan></textPath>
          <textPath startOffset="16.67%" href="#face"><tspan  text-anchor="middle">II</tspan></textPath>
          <textPath startOffset="25%" href="#face"><tspan  text-anchor="middle">III</tspan></textPath>
          <textPath startOffset="33.33%" href="#face"><tspan  text-anchor="middle">IIII</tspan></textPath>
          <textPath startOffset="41.67%" href="#face"><tspan  text-anchor="middle">V</tspan></textPath>
          <textPath startOffset="50%" href="#face"><tspan  text-anchor="middle">VI</tspan></textPath>
          <textPath startOffset="58.33%" href="#face"><tspan  text-anchor="middle">VII</tspan></textPath>
          <textPath startOffset="66.67%" href="#face"><tspan  text-anchor="middle">VIII</tspan></textPath>
          <textPath startOffset="75%" href="#face"><tspan  text-anchor="middle">IX</tspan></textPath>
          <textPath startOffset="83.33%" href="#face"><tspan  text-anchor="middle">X</tspan></textPath>
          <textPath startOffset="91.67%" href="#face"><tspan  text-anchor="middle">XI</tspan></textPath>
          <textPath startOffset="100%" href="#face"><tspan  text-anchor="middle">XII</tspan></textPath>
        </text>
        // clock logo
        <text x="510" y="500" style="font-size:45px;font-family:Liminari;font-style:italic;">PODIUM</text>
        // hands
        <path data-tag="hourHand" fill="black" id="hourHand" d="M585,640 L600,400 L615,640,Z"/>
        <path data-tag="minuteHand" fill="black" id="minuteHand" d="M590,640 L600,300 L610,640,Z"/>
        // hands axis
        <circle cx="600" cy="600" r="10" fill="white"/>      
        // date (dynamically assigned)
        <text x="380" y="730" data-tag="date" style="font-size:65px;font-family:Liminari;font-style:italic;">1/1/2024</text>
      </svg>`);

    Object.assign(this, dataIndex("tag", clock));
    this.surface.prepend(clock);
    this.refreshClock();
  }

  refreshClock() {
    if (this.clockSchedule.cancelled) return;
    let date = new Date();
    let minutes = date.getMinutes();
    let hours = (date.getHours() % 12) + minutes / 60;
    this.hourHand.setAttribute("transform", `rotate(${hours * 30} 600 600)`);
    this.minuteHand.setAttribute("transform", `rotate(${minutes * 6} 600 600)`);
    this.date.textContent = date.toDateString();
    this.clockSchedule.run((60 - date.getSeconds()) * 1000);
  }

  hide() {
    this.clockSchedule.cancel();
  }
}

/**
class Stopwatch
   Animated Stopwatch with start/stop/lap/reset functionality.
*/

class Stopwatch extends Surface {
  started = false;
  running = false;
  timeBasis = 0;
  stopTimeBasis = 0;
  splitCount = 0;

  constructor(panel) {
    super(panel);
  }

  destructor() {
    this.stop();
  }

  build() {
    let tspan = (text, turn) => {
      // For drawing text on clock face:
      // return string for tspan with given text placed in circle
      // of radius 300, centered at 600,600. Incldes an x offset
      // -55 and y offset 40, emperically determined.
      let x = 300 * Math.sin(2 * Math.PI * turn) + 600 - 55;
      let y = 300 * Math.cos(2 * Math.PI * turn) + 600 + 40;
      return `<tspan x="${x}" y="${y}" font-size="100px" fill="black">${text}</tspan>`;
    };

    let watch = helm(`
       <svg data-tag="watch" transform="scale(1,1)"
           style="position:relative;width:100%;"
           viewBox="0 0 1200 1200">
          <defs>
            <path id="hourPointer" d="M585,640 L600,210 L615,640,Z"/>
            <path id="minutePointer" d="M590,640 L600,210 L610,640,Z"/>
            <path id="secondPointer" d="M590,640 L600,390 L610,640,Z"/>
            <circle id="outerFace" pathLength="600" fill="none" stroke="currentColor" cx="600" cy="600" r="400"/>
            <circle id="innerFace"  pathLength="600" fill="none" stroke="currentColor" cx="600" cy="600" r="200"/>
            <radialGradient id="casingGradient">
              <stop offset="0%" stop-color="grey" />
              <stop offset="93%" stop-color="white" />
              <stop offset="100%" stop-color="grey" />
            </radialGradient>
            <linearGradient id="stemGradient" >
              <stop offset="0" stop-color="darkgrey" />
              <stop offset="1" stop-color="grey" />
            <linearGradient id="crownGradient" spreadMethod="repeat" x1="0" x2="0.05">
              <stop offset="0" stop-color="darkgrey" />
              <stop offset="1" stop-color="grey" />
              <stop offset="100%" stop-color="Grey" />
            </linearGradient>
          </defs>

          // Crown
          <rect x="550" y="80" width="100" height="100" rx="40" fill="url('#stemGradient')"/>
          <rect data-tag="crownPusher" x="475" y="0" rx="20" width="250" height="100" fill="url('#crownGradient')"/>
          // Split
          <rect data-tag="splitPusher" x="550" y="60" rx="20" width="100" height="140" transform="rotate(45,600,600)"
                fill="url('#stemGradient')"/>
          // Reset
          <rect data-tag="resetPusher" x="550" y="60" rx="20" width="100" height="140" transform="rotate(-45,600,600)"
                fill="url('#stemGradient')"/>
          // Circular outline of watch
          <circle data-tag = "surfaceDragElm" cx="600" cy="600" r="480" fill="url('#casingGradient')"/>
          <circle cx="600" cy="600" r="450" fill="white"/>
          // Major ticks on outer face: every 5 seconds
          <use href="#outerFace" stroke-width="20" stroke-dashArray="1 9"/>
          // Minor ticks on outer face: every second
          <use href="#outerFace" stroke-width="80" stroke-dashArray="1 49"/>
          // Ticks on inner face: every 1/10th of a second.
          <use href="#innerFace" stroke-width="20" stroke-dashArray="2 58"/>
          // Text for out face: every 15 seconds
          <text x="0" y="0" font-size=100px>
                ${tspan("60", 0.5)}
                ${tspan("15", 0.25)}
                ${tspan("30", 40)}
                ${tspan("45", 0.75)}
         </text>
         // hands
         <use href="#hourPointer" fill="black">
           <animateTransform data-tag="hourPointerRotation" begin="indefinite" attributeName="transform"
            from="0 600 600" to="360 600 600" repeatCount="indefinite" type="rotate" dur="3600s" /> 
         </use>
         <use href="#minutePointer" fill="#BA0021">
           <animateTransform data-tag="minutePointerRotation" attributeName="transform"
           from="0 600 600" to="360 600 600" begin="indefinite" repeatCount="indefinite" type="rotate" dur="60s" />
         </use>
         <use  href="#secondPointer" fill="#ccc" tag="hand">
           <animateTransform data-tag="secondPointerRotation" attributeName="transform" 
           from="0 600 600" to="360 600 600" begin="indefinite" repeatCount="indefinite" type="rotate" dur="1s" /> 
         </use> 
         // Pointer axis
         <circle cx="600" cy="600" r="10" fill="black"/>      
         // Invisible Paths for start/stop, split event handlers
         <rect data-tag="resetArea" x="100" y="75" width="300" height="300" fill="#0000"/>
         <rect data-tag="crownArea" x="450" y="0" width="300" height="300" fill="#0000"/>
         <rect data-tag="splitArea" x="800" y="75" width="300" height="300" fill="#0000"/>

       </svg>`);
    this.surface.prepend(watch);
    Object.assign(this, dataIndex("tag", watch));
    this.panel.listeners.push(
       listen(this.resetArea, ["pointerdown"], () => this.reset()),
       listen(this.crownArea, ["pointerdown"], () => (this.running ? this.stop() : this.start())),
       listen(this.splitArea, ["pointerdown"], () => this.split()));
  }

  animatePusher(pusher) {
    let y = pusher.getAttribute("y");
    pusher.setAttribute("y", `${parseInt(y) + 25}`);
    schedule(500, () => pusher.setAttribute("y", y));
  }

  reset() {
    clearChildren(this.surface);
    this.panel.splits.value = "";
    this.build();
    this.started = false;
    this.running = false;
    this.stopTimeBasis = 0;
    this.splitCount = 0;
    this.panel.cell.stash.state = "Pause";
    this.animatePusher(this.resetPusher);
  }

  split() {
    this.animatePusher(this.splitPusher);
    let split = this.started ? (performance.now() - this.timeBasis) / 1000 : 0;
    let formatNumber = (num) =>
      num.toLocaleString("en-US", {
        minimumIntegerDigits: 2,
        useGrouping: false,
      });

    let hours = formatNumber(Math.floor(split / (60 * 60)));
    let minutes = formatNumber(Math.floor(split / 60));
    let seconds = formatNumber(split % 60);
    this.panel.splits.value = `${++this.splitCount}. ${hours}:${minutes}:${seconds}\r\n` + this.panel.splits.value;
  }

  start() {
    this.animatePusher(this.crownPusher);
    let now = performance.now();
    if (this.started == false) {
      this.timeBasis = now;
      this.stopTimeBasis = now;
      this.hourPointerRotation.beginElement();
      this.minutePointerRotation.beginElement();
      this.secondPointerRotation.beginElement();
      this.started = true;
    }
    // Increase timeBasis by stopTimeBasis
    this.timeBasis += now - this.stopTimeBasis;
    this.watch.unpauseAnimations();
    this.running = true;
    this.panel.cell.stash.state = "Stop";
    this.panel.optionsGroup.refresh();
  }

  stop() {
    this.animatePusher(this.crownPusher);
    this.stopTimeBasis = performance.now();
    this.running = false;
    this.panel.cell.stash.state = "Start";
    this.panel.optionsGroup.refresh();
    this.watch.pauseAnimations();
  }
}

/**
class Metronome
  Implements a graphic metronome with options to display as a conductor's hand+baton showing a
  given beat pattern.
*/
class Metronome extends Surface {
  // svg definition of a baton held in a conductor's hand
  conductor = `<defs><g transform="scale(3.5 3.5) translate(-25 -25)" id="marker"><path fill="#eebb99" stroke="#000000" strokeWidth="0.264583px" strokeLinecap="butt" strokeLinejoin="miter" strokeOpacity="1"   d="M 25.5,20.36 c 0.26,1.14 0.95,2.13 1.71,2.99 m -0.31,-0.44 c -0.01,0.012 -0.007,-0.0115 0,0 z m -1.004,-2.39 c -0.00,0.012 -0.007,-0.0115 0,0 z m -0.95,-0.59 c 0.095,-0.01 1.16,0.34 0.64,0.1 m 2.09,2.92 c 0.87,0.36 1.68,-0.24 2.42,-0.594 m -1.38,2.38 c 1.05,-1.68 3.027,-3.045 5.087,-2.639 m -7.127,1.74 c -1.57,0.485 -3.148,0.971 -4.723,1.456 -1.776,-2.465 4.076,-3.67 4.6,-1.78 l 0.06,0.18 z m 7.09,-1.4 c -0.28,1.13 -0.56,2.26 -0.85,3.397 M 10.1,18.479 9.44,18.79 8.78,19.1 m 12.25,6.539 c -1.05,2.657 -3.37,3.397 -5.85,4.0 m 12.57,1.219 c -2.48,0.434 -3.875,2.805 -5.225,4.677 m 6.93,-5.28 c -1.68,-1.88 1.21,-6.0 -2.439,-6.328 m -6.239,-4.836 c 0.278,2.41 3.407,3.627 4.523,1.29 l -0.227,-0.52 m -4.75,0.69 c -1.079,3.217 -5.996,0.273 -6.008,0.2183 0.328,0.593 0.649,1.191 0.974,1.787 M 27.725,21.294 c 0.35,-0.53 1.238,-0.97 1.736,-0.34 m -7.41,-1.47 c 0.554,-0.136 1.109,-0.273 1.664,-0.41 m -2.173,0.06 c 0.542,-0.553 1.26,-0.99 2.05,-1.0 m -5.89,0.22 c -1.67,0.02 -0.61,2.54 0.29,0.667 l 0.348,0.0035 0.695,0.041 m 1.975,0.223 c -1.66,-2.678 -5.959,-5.164 -8.04,-1.686 -0.103,1.445 -0.484,5.746 -1.658,2.215 -1.158,-1.846 0.063,-7.422 -3.634,-5.42 -1.91,3.911 1.68,7.86 1.188,11.904 0.46,5.432 3.89,10.2 3.59,15.760 -0.458844,2.908405 2.189074,6.00493 4.542393,2.969325 3.20974,-1.930224 7.578167,-0.868896 10.08736,-4.049567 3.700552,-2.077991 7.831857,-4.873712 8.203995,-9.526807 0.845687,-3.582 -2.892,-5.964 -0.741,-9.497 m -16.321,-5.4 c 1.401,-3.342 6.217,-1.822 6.211,1.61 1.163,2.03 1.149,3.904 -1.61,3.48 -1.57,-1.596 -2.97,-3.49 -4.59,-5.095 z m 7.03,1.330 c 0.227,-4.66 6.585,-2.96 5.94,0.921 0.549,2.319 0.689,7.12 -3.013,5.24 -2.157,-1.246 -2.489,-3.77 -2.92,-5.984 M 93.24,5.7 C 69.413,11.724 45.5,17.748 21.752,23.772 c 0.044,2.554 2.97,0.48 4.442,0.375 C 48.608,18.212 71.021,12.276 93.435,6.341 93.37,6.127 93.307,5.913 93.244,5.7 Z" /></g></defs>`;

  // List of objects with svg path definitions that defines the Metronome graphic and the paths used to
  // animate the conductor according to several beat patterns.
  beatPatterns = [
    {
      name: "metronome",
      background: `
       <g transform="translate(0 -10)">
       <path  style="display:inline;fill:#966f33;stroke:#000000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
         d="m 360.52,814.24 31.96,-130.95 225.33,-0.08 34.69,130.76 z"/>
       <path style="display:inline;fill:#966f33;stroke:#000000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
         d="m 467.48,375.0 0.10,-7.47 38.85,-17.69 41.72,17.21 0.07,8.09 z"/>
       <path style="display:inline;fill:#000000;stroke:#000000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
         d="m 392.95,682.35 74.43,-306.33 80.94,0.15 68.93,305.88 z" />
       <path style="display:inline;fill:#c0c0c0;stroke:#000000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
         d="m 492.31,683.69 32.15,-0.42 -0.23,-275.76 -31.88,0.31 c 0,0 -0.79,275.87 -0.03,275.87 z"/>
       <path style="display:inline;fill:#000000;stroke:#000000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
         d="m 388.24,814.41 30.5,-0.11 -4.52,16.34 -21.20,0.005 z" />
       <path style="fill:none;stroke:#808080;stroke-width:20;stroke-linecap:round;stroke-dasharray:2,20;stroke-dashoffset:0;"
         d="M 509.56,659.32 507.29,425.61"/>
       <path  style="display:inline;fill:#000000;stroke:#000000;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
         d="m 591.87,814.24 3.45,15.41 22.26,-0.06 3.97,-14.87 z"/>
      </g>`,
      // The metronome pattern alone defines a markerCenter, used as the center of rotation of the marker (i.e. its pendulum).
      // The values are the center of the circle in the following marker.
      markerCenter: "507.92 674.26",
      marker: `<defs><g id="marker">
         <path style="display:inline;fill:#909090;stroke:#808080;stroke-width:15;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;"
            d="m 508.06,719.07 -0.009,-325.48"/>
         <path style="display:inline;fill:#808080;stroke:#404040;stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;"
           d="m 484.84,465.21 44.4,-0.37 -6.69,24.69 -30.9,0.24 z"/>
         <circle style="display:inline;fill:#966f33ff;" cx="507.92" cy="674.256" r="30.0" />
         <circle fill="#c0c0c0" cx="507.92" cy="674.256" r="14" />
         </g></defs>`,
      paths: [""],
      ticks: [600],
    },
    {
      name: "one",
      background: "",
      marker: this.conductor,
      paths: ["m 506.73987,600 c 6.61502,-38.23927 11.32736,-81.3433 0.14187,-119.35666 -10.87718,38.2011 -5.97916,82.76755 -0.52949,119.7081"],
      ticks: [600],
    },
    {
      name: "two",
      background: "",
      marker: this.conductor,
      paths: ["m 416.19116,601.33252 c 53.32433,-1.50986 91.37258,-125.82247 123.02771,-266.07837 7.01455,139.97771 68.02774,325.60495 -58.41431,324.64563", "m 480.66077,659.87543 c -64.55381,-7.10515 -82.91038,-41.96037 -111.87744,-80.65662 20.45255,28.45694 33.40312,22.89527 47.40783,22.11371"],
      ticks: [900, 600],
    },
    {
      name: "three",
      background: "",
      marker: this.conductor,
      paths: ["m 341.86386,581.55834 c 93.73074,5.44531 116.02278,-141.66317 163.9969,-233.92882 l 3.7363,350.63385", "m 509.59706,698.26337 c -37.3781,-65.22699 -155.15681,-30.9108 -176.69037,-81.1292", "m 332.90669,617.13417 c -12.6349,-17.28785 -21.71707,-34.35916 -31.06652,-51.44676 7.49126,10.66109 22.45935,15.51248 40.02369,15.87093"],
      ticks: [900, 600, 600],
    },
    {
      name: "four",
      background: "",
      marker: this.conductor,
      paths: ["m 376.10444,604.03666 c 83.82548,-4.33549 100.4673,-148.67456 130.70217,-264.68715 l -0.8127,354.01067", "m 505.99391,693.36018 c 5.54426,-104.50552 158.21364,32.74145 152.10007,-16.52096", "M 658.09398,676.83922 C 607.13391,486.65696 427.49525,749.70781 354.41215,643.21089", "m 354.41215,643.21089 c -14.99447,-12.02509 -24.94658,-36.43392 -36.45036,-57.03192 18.43908,10.39582 37.22045,19.17676 58.14265,17.85769"],
      ticks: [900, 600, 800, 600],
    },
    {
      name: "five",
      background: "",
      marker: this.conductor,
      paths: ["m 319.92518,588.07556 c 11.80525,18.61901 33.0238,17.89221 53.03571,16.41642 135.04318,-11.45713 97.41506,-212.3433 134.1337,-262.92175 l -0.39504,343.91851", "m 506.69955,685.48874 c 25.57708,-50.13643 68.82968,-17.79013 73.18297,-0.0919", "m 579.88252,685.39684 c 19.29798,-42.16075 54.40153,-30.27801 74.20525,-2.42061", "M 654.08777,682.97623 C 632.24026,494.87209 423.90302,742.50987 361.04223,640.13568", "M 361.04223,640.13568 C 332.12758,608.14594 349.77337,628.97772 319.92518,588.07556"],
      ticks: [900, 600, 600, 800, 600],
    },
    {
      name: "six",
      background: "",
      marker: this.conductor,
      paths: ["m 267.49902,581.87503 c 13.95648,6.41218 27.92331,13.92614 41.70899,2.14118 134.17928,-68.21655 194.07653,-206.22909 197.22543,-231.35532 l -3.17343,318.24762", "m 503.26001,670.90851 c 17.21164,-35.14343 53.30776,-45.01018 80.3864,-0.96755", "m 583.64641,669.94096 c 22.00066,-45.35491 37.25197,-44.97481 77.96339,4.9612", "M 661.6098,674.90216 C 737.13215,527.23351 482.78179,534.1961 441.99445,662.5065", "M 441.99445,662.5065 C 387.69865,618.6899 335.08632,626.46228 302.98419,665.112", "m 302.98419,665.112 c 14.56048,-29.52995 -0.94459,-38.12573 -35.48517,-83.23697"],
      ticks: [900, 600, 600, 800, 600, 600],
    },
  ];

  accent1 = 1; // accents;
  accent2 = 0;
  actx = new AudioContext();
  tempo = 90;
  delta = 0.5; // Schedule-ahead
  gain = 1;
  ticker = new Schedule();
  tickCount = 0;
  tickTime = 0;
  beatPattern = null;
  beatPatternIndex = 0;
  motionPaths = [];
  pathTransforms = [];
  animationDur = 0;
  secondsPerTick = 1;

  constructor(panel) {
    super(panel);
    this.beatPattern = this.beatPatterns[0];
    this.volumeStash = _menu_.rings.more.cells.volume.stash;
  }

  destructor() {
    this.ticker.cancel();
  }

  build() {
    this.motionPaths.forEach((motionPath) => motionPath.endElement());
    this.pathTransforms.forEach((pathTransform) => pathTransform.endElement());
    clearChildren(this.surface);
    let beatPattern = this.beatPattern || this.beatPatterns[0];
    let dur = 60 / this.tempo;
    // Outermost svg tag. Transforms at this level effect entire surface. Note: the svg transform tag doesn't
    // work on ios devices, so we use the css style version instead
    let svg = `<svg style="transform:scale(1.75, 1.75);position:relative;pointer-events:none;" viewBox="0 0 1024 1024">`;
    // Display the background
    svg += beatPattern.background;
    // pause indicator at top of metronome
    svg += `<text data-tag="pause" width="4em" style="font-family:Bravura;font-size:100px;" x="505" y="280" text-anchor="middle">\ue4c0</text>`;
    // bpm (beats/minute) readout on bottom of metronome
    svg += `<text data-tag="bpm" width="4em" style="font-family:Bravura;font-size:60px;" x="505" y="780" text-anchor="middle">60</text>`;
    // Define the "marker", i.e.  the object to animate along the conducting paths
    svg += beatPattern.marker;
    // Stroke the conducting paths
    beatPattern.paths.forEach((path) => (svg += `<path style="fill:none;stroke:#88f8;stroke-width:4" d="${path}"/>`));
    // Define each path within <svg><use>  ...</use></svg>
    svg += `<svg><use href="#marker">`;
    // The metronome pattern has a specific center of rotation:
    let cxy = beatPattern.markerCenter ? beatPattern.markerCenter : "";
    beatPattern.paths.forEach((path, index) => {
      svg += `
          <animateMotion
            data-path="${index}" 
            calcMode="paced"
            fill="freeze" 
            path="${path}" dur="0" /> 
          <animateTransform
            data-transform="${index}"
            calcMode="paced"
            fill="freeze"
            attributeName="transform"
            type="rotate" from="15 ${cxy}" to="-15 ${cxy}" dur=".1" />`;
    });
    svg += "</use></svg>";
    let svgElm = helm(svg);
    Object.assign(this, dataIndex("tag", svgElm));
    this.surfaceDragElm = svgElm;
    this.surface.prepend(svgElm);
    this.motionPaths = Object.values(dataIndex("path", svgElm));
    this.pathTransforms = Object.values(dataIndex("transform", svgElm));
  }

  play(bool) {
    this.ticker.cancel();
    this.pause.textContent = bool ? "" : "\ue4c0";
    if (bool) {
      this.tickTime = this.actx.currentTime + 0.05;
      this.secondsPerTick = 60 / this.tempo;
      this.tick();
      this.ticker.run(60000 / this.tempo, () => {
        this.tickTime = this.actx.currentTime + 0.05;
        this.tick();
        this.ticker.run(60000 / this.tempo);
        this.bpm.textContent = Math.floor(this.tempo);
      });
    }
  }

  setPattern(name) {
    // Switch to the named beatPattern.
    this.beatPattern = this.beatPatterns.find((pattern) => pattern.name == name) || this.beatPatterns[0];
    this.build();
    // Set the gui button to indicate the *next* available beat pattern
    this.panel.cell.stash.pattern = this.beatPattern.name;
    this.panel.mediaGroup.refresh();
    // Trigger tick to re-adjust for current tempo:
    this.animDur = 0;
  }

  tick() {
    let tickCount = this.tickCount++;
    if (this.gain == 0) return;
    let tickPattern = this.beatPattern.ticks;
    let actx = this.actx;
    let time = this.tickTime;
    time += 0.3; // adjust for skim
    let osc = new OscillatorNode(actx, { frequency: tickPattern[tickCount % tickPattern.length] });
    let gain = new GainNode(actx);
    // Note: gain value must not be 0
    gain.gain.exponentialRampToValueAtTime(Math.max(this.volumeStash.volume, 0.0000001), time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(time);
    osc.stop(time + 0.03);
    // Schedule next path animation to
    schedule((this.tickTime - actx.currentTime) * 1000, () => {
      if (this.secondsPerTick != this.animDur) {
        // tempo has changed, so adjust all
        this.animDur = this.secondsPerTick;
        this.motionPaths.forEach((path) => path.setAttribute("dur", this.animDur));
        this.tickCount = 0;
      }
      if (this.beatPattern.name == "metronome") {
        let left = this.tickCount & 0x01;
        let transform = this.pathTransforms[0];
        transform.setAttribute("dur", this.animDur);
        // The Metronome marker, i.e. the pendulum, has specific center of rotation:
        let cRot = this.beatPattern.markerCenter;
        transform.setAttribute("from", left ? `-45 ${cRot}` : `45 ${cRot}`);
        transform.setAttribute("to", left ? `45 ${cRot}` : `-45 ${cRot}`);
        transform.beginElement();
        return;
      }
      let beatNumber = this.tickCount % this.beatPattern.paths.length;
      this.motionPaths[beatNumber].beginElement();
      this.pathTransforms[beatNumber].beginElement();
    });
  }

  onSurfaceEvent(type) {
    if (type == "press") this.panel.mediaGroup.fire(this.panel.cell.stash.state == "Play" ? "Pause" : "Play");
    else if (type == "click") {
      let now = performance.now();
      let prevClick = this.prevClick || Number.MIN_SAFE_INTEGER;
      let tempo = 1 / ((now - prevClick) / 60000);
      if (tempo >= 10 && tempo <= 220) {
        this.panel.cell.stash.tempo = Math.round(tempo);
        this.bpm.textContent = Math.round(tempo);
        this.panel.tempoGroup.refresh();
        this.tempo = tempo;
      }
      this.prevClick = now;
    }
  }
}


/**
class Clip and class Recorder

  Class Recorder is used by class Review to provide the functionality
  of continuously recorded audio and video, up to a given duration
  (the "period"), in order to provide an "instant replay"
  functionality.  Whenever 2*period ms of data has been recorded, the
  data is effectively pruned down to "period" ms. Whenever Recorder.stop()
  is called, the recorded data is returned as a blob.

  This is accomplished with the help of class Clip, that functions to
  record a "clip" of media, with max length 2*period ms. When this
  limit is reached, the data is simply discarded, and recording starts
  again. However, if "stop" is called before that limit is reached,
  recording stops, and the data is returned (as the resolution of a
  promise).

  Class Recorder creates 2 Clips, then "cycles" every "period ms".
  The first Clip starts recording immediately, while the second one
  starts recording at the next cycle, "period ms" later.  This ensures
  that, after the first Clip has recorded "period ms", there will
  always be at least one Clip that has a full "period ms" of
  data. Class Recorder's stop() method will return that data.  Neither
  of the 2 Clip instances will ever have more that 2*period ms of
  data, regardless of how many cycles are recorded.

  To illustrate, if the period is, say, 4 seconds, then:

  cycle:  0     1     2     3     4     5     6    ...
  clip1:  0123  4567  0123  4567  0123  4567  0123  ...
  clip2:        0123  4567  0123  4567  0123  4567  ...

  at cycle 0, clip1.record()
  at cycle 1, clip2.record()
  at cycle 2, clip1.stop(), clip1.record()
  at cycle 3, clip2.stop(), clip2.record()
  at cycle 4, clip2.stop(), clip1.record()
   ...

  So at any time after the start of cycle 1, one of the 
  clips will always have the last 4 seconds of data.
**/

  class Clip {
    resolve = null ;    

    constructor() {}

    destructor() {
      unlisten(this.listener) ;
      if(this.recorder) this.recorder.stop() ;
    }
 
    record(mediaStream) {
      unlisten(this.listener) ;
      if(this.recorder) this.recorder.stop() ;
      this.recorder = new MediaRecorder(mediaStream) ; // let browser choose mimeType (i.e. webm vs mp4)
      this.recorder.start() ;
      this.listener = listen(this.recorder, "dataavailable", (e) => {
         if(this.resolve) 
           this.resolve(new Blob([e.data], { type: this.recorder.mimeType})), {once:true} ;
      }) ;
    }

    async stop() {
console.log("clip stop") ;
      delay(1, () => this.recorder.stop()) ;
      return new Promise((resolve) => this.resolve = resolve) ;
    }
  }


/**
class Recorder
  ...see class Clip above
**/

class Recorder {

  cycle = 0 ;
  clip1 = new Clip() ;
  clip2 = new Clip() ;

  constructor() {}

  record(mediaStream, period, scrubber) {
    this.cycle = 0 ;
    this.period = period ;
    this.start = performance.now() ;
    this.cycler = new Schedule(period, () => {
      if(++this.cycle & 1) this.clip2.record(mediaStream) ;
      else this.clip1.record(mediaStream) ;
      this.cycler.run() ;
    }) ;

    this.progress = new Schedule(1000, () => {
      let p = this.cycler.elapsed() + ((this.cycle == 0? 0: this.period)) ;
      scrubber.progress("time", p, 0, p) ;
      this.progress.run() ;
    }) ;

    this.clip1.record(mediaStream) ;
    this.cycler.run() ;
    this.progress.run() ;
  }

  destructor() {
    if(this.cycler) this.cycler.cancel() ;
    if(this.progress) this.progress.cancel() ;
    if(this.clip1) this.clip1.destructor() ;
    if(this.clip2) this.clip2.destructor() ;
  }  ;

  pause() { 
    this.clip1.recorder.pause() ;
    if(this.clip2.recorder && this.clip2.recorder.state != "inactive") this.clip2.recorder.pause() ;
    this.cycler.pause() ;
    this.progress.pause() ;
  }

  resume() {
    this.clip1.recorder.resume() ;
    if(this.clip2.recorder) this.clip2.recorder.resume() ;
    this.cycler.resume() ;
    this.progress.resume() ;
  }

  async stop() {
    this.cycler.cancel() ;   
    this.progress.cancel() ;   
    if(this.cycle == 0)
      return await this.clip1.stop() ;
    else if(this.cycle & 1) {
      await this.clip2.stop() ;
      return await this.clip1.stop() ;
    } else {
      await this.clip1.stop() ;
      return await this.clip2.stop() ;
    }
  }
}

/**
class Review

  Implements an Audio/Visual feedback tool. 

  It has functionality to display an attached camera's output as a "mirror"
  for use a as practice aid.

  It  continuously record the audio/video from the attached camera/microphone,
  and can play back the previous ~60 seconds (configurable) on demand. It
  does this by saving a configurable number of video clips, each of a
  configurablel duration, that it continually prunes. It intentionally
  does not offer functionality to save the recorded clips: it functions
  exculuively as an "instant replay" practice aid.

  If provides a waveform visualization over a waterfall spectrogram.
*/
class Review {

  static css = css(
    "Review",
    `
     .Review {
       width: 22em;
       height: 22em;
       text-align:center;
       padding: .5em;
     }
    .Review__viewer {
      width: calc(100% - 1em) ;
      position:absolute ;
    }
    .Review__video {
      top: 0 ;
      width: 100% ;
      border-radius: var(--borderRadius);
    }
    .Review__waveview {
       top: 0 ;
       width: 100% ;
       position:absolute ;
       background-color:#ccc;
       border-radius: var(--borderRadius);
    }
    .Review__spectrogram {
      position:absolute;
      width:100% ;
      height:100%;
    }
    .Review__waveform {
      position:absolute;
      width:100%;
      height:100%;
      top: 0;
      left:0 ;
    }
    .Review__video__reflect {
      transform: rotateY(180deg);
      -webkit-transform:rotateY(180deg); /* Safari and Chrome */
      -moz-transform:rotateY(180deg); /* Firefox */
    }
    .Review__mediaControls
    { width:30%;
      padding: 1em 0em 0em 1em;
      position:absolute ;
      left: 0 ;
      bottom: 0 ;      
    }
    .Review__scrubber
    { width:65% ;
      position: absolute ;
      bottom:0 ;
      right:0 ;
    }
    .Review__options {
      width: calc(100% - 1em) ;
       position:absolute; 
    }
    .Review__options__details { 
      margin-top:.2em;
      width:100%;
      display:grid;
      grid-template-columns:1fr 1fr;
      justify-items:center;
      font-size: .65em;
    }
   .Review__controls {
      position:absolute;
      width:calc(100% - 1em);
      bottom:0em;
      height:3em;
      padding: 1em 0em 1em 0em ;
      border-top: 1px solid #aaa ;
     }
    `
  );

  mediaDevicesSpec = {};
  mediaStream = null;
  recorder = new Recorder() ;

  // At any time, the Reviewer will be either in state "Live"
  // (live video is recorded and displayed), or in state "Replay"
  // (recorded video is displayed) 
  state = "Live" ; // one of "Live" or "Replay"
  listeners = [];
  audioBuf = new Uint8Array(2048); // power of 2
  actx = null;

  /*
      Ascii art dom hierarchy. 
              
                                          elm
                                           |
                         -------------------------------------------
                        /                    \                      \
                       /                      \                      \
                    viewer (1)               options (1)             controls
                     /
             ---------------------------------
            /       \                 /       \
        video (2)   waveview (2)     scrubber playpause
                   /    \
        spectrogram     waveform
                          \
                      waveformPath
                 
     Notes:
       (1) at any time, only one of viewer and options is visible
       (2) at any time, only one of video and waveview is visible

   */

  elm = helm(`
     <div class="Review">
       <div data-tag="viewer" class="Review__viewer">
         <video crossorigin="anonymous" data-tag="video" class="Review__video Review__video__reflect" autoplay ></video>
         <div data-tag="waveview" class="Review__waveview hidden">
           <div data-tag="spectrogram" class="Review__spectrogram"></div>
           <canvas height="256" width="${this.bufSize}" data-tag="waveform" class="Review__waveform"></canvas>
         </div>
         <div data-tag="scrubberElm"></div>
         <div data-tag="mediaControlsElm"></div>
       </div>

       <!--  Options Panel -->
       <div data-tag="options" class="Review__options hidden">
         <br>Video Direction:
         <div data-tag="videoMirrorGroupElm"></div>
         <br>Recording Length:
         <div data-tag="videoReplayGroupElm"></div>
         <br>Input Devices:
         <div data-tag="mediaDevicesGroupElm"></div>
         <div class="Review__options__details">
           <div data-tag="audioSrc"></div>
           <div data-tag="videoSrc"></div>
         </div> 
       </div>
       <!--  Controls Panel -->
       <div data-tag="controlsElm" class="Review__controls"></div>
     </div>
   </div>`);

  constructor(panel) {
    Object.assign(this, dataIndex("tag", this.elm));
    this.panel = panel;
    this.stash = panel.cell.stash;
    panel.body.style.width = "unset";
  }

  destructor() {
    this.recorder.destructor() ;
  }


  async build() {
    if(!await this.buildOptions()) return this.panel.close() ; // no media device(s)

    // build unchanging parts of the media graph (some of it is built dynamically)
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
       video: { deviceId: {exact: this.mediaDevicesSpec[this.stash.videoSrc].deviceId}},
       audio: { deviceId: {exact: this.mediaDevicesSpec[this.stash.audioSrc].deviceId}},
    });

    this.actx = new AudioContext();
    this.analyser = this.actx.createAnalyser();
    this.analyser.fftSize = this.audioBuf.length ;
    this.analyser.minDecibels = -90;
    this.analyser.minDecibels = -120;
    this.analyser.maxDecibels = -10;
    // this.liveSrc is preconnected to this.mediaStream, whereas this.recordedSrc
    // is preconnected to this.video. According to documentation, they could
    // both connect to this.video, and we'd have a single source for both
    // Live and Replay states. However, the MidiaElementSource did not seem
    // to feed data to the analyser (sigh...it does pass through correcty),
    // so a more complex algorithm had to be implemented where the src is 
    // switched in transitions between Live<->Replay states. The switching
    // is implemented in this.live() and this.replay(...).
    this.recordedSrc = this.actx.createMediaElementSource(this.video);
    this.liveSrc = this.actx.createMediaStreamSource(this.mediaStream) ;

    // build gui components
    this.buildControls() ;
    this.buildViewer();

    // go live!
    try {
       this.live() ;
    } catch(error) {
      dialog(`Can't record video because:<br>"${error}"<br>
            <br>Disabling this tool.`) ;
      _menu_.enableCells(["more/review"], false) ;
      return this.panel.close() ;
    }
  }

  buildControls() {
    this.controls = new ButtonGroup(Object.assign(this.stash, { mode: "Video"}),
      { Video: { svg: "Replay", radio: "mode" },
        Wave: { svg: "Wave", radio: "mode" },
        Options: { svg: "Options", radio: "mode" }
      }, (e, prop, tag) => { 
      if (tag == "Video") {
        this.viewer.classList.remove("hidden");
        this.video.classList.remove("hidden");
        this.waveview.classList.add("hidden");
        this.options.classList.add("hidden");
      }
      else if (tag == "Wave") {
        this.waveview.classList.remove("hidden");
        this.viewer.classList.remove("hidden");
        this.video.classList.add("hidden");
        this.options.classList.add("hidden");
        this.wave();
      }
      else { // (tag == "Options") 
        this.options.classList.remove("hidden");
        this.viewer.classList.add("hidden");
      }
    }) ;

    this.controlsElm.replaceWith(this.controls.elm);
    this.controls.elm.classList.add("Review__controls");
    this.controls.refresh();
  }

  async buildOptions() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (error) {
      dialog(`Error: no accessible audio/video device(s) found.<br>
        <div style="text-align:left">
        <ul><li>This device doesn't have any audio/video device(s) ?</li>
        <li>Device(s) in use by another app ?</li>
        <li>Wrong permissions ?</li></ul></div>Hint: To check browser permissions:<br>
        <a target="_blank" href="http://www.google.com/search?q=How+to+set+browser+permissions">How to set browser permissions</a>`);
      return false ;
    }
    this.devices = await navigator.mediaDevices.enumerateDevices();

    // Build widgets for Options Panel
    let mediaDevicesSpec = this.mediaDevicesSpec;

    // Build ButtonGroup to choose mirrored vs unmirrored video:
    this.videoMirrorGroup = new ButtonGroup(this.stash, 
      { Front: { svg: "Flute Flipped", radio: "mirror" },
        Mirror: { svg: "Flute Mirrored", radio: "mirror" },
      }, (e, prop, tag) => {
      if (tag == "Front") this.video.classList.remove("Review__video__reflect");
      else this.video.classList.add("Review__video__reflect");
    });
    this.videoMirrorGroupElm.replace(this.videoMirrorGroup.elm);

    this.videoMirrorGroup.elm.style.justifyContent = "space-evenly"; // really????

    // initialize mirror setting
    if (this.stash.mirror == "Front") this.video.classList.remove("Review__video__reflect");

    // Build slidergroup to set video replay time:
    this.videoReplayGroup = new SliderGroup(this.stash, {
      replay: { min: 5, max: 120, value: 15, msg: (tag, value) => `${value}s to ${value * 2}s` }
    }, async () => {
      await this.restart() ;
    });

    this.videoReplayGroupElm.replace(this.videoReplayGroup.elm);

    // Build ButtonGroup for selecting audio/video src/dst channels
    // ...these indexes facilitate cycling through available devices:
    let audioSrcIdx = 0;
    let videoSrcIdx = 0;

    this.devices.forEach((device) => {
      if (device.kind == "audioinput")
        mediaDevicesSpec[`Audio ${++audioSrcIdx}`] = Object.assign(device, {
          svg: "Mike",
          toggle: "audioSrc",
        });
      else if (device.kind == "videoinput")
        mediaDevicesSpec[`Video ${++videoSrcIdx}`] = Object.assign(device, {
          svg: "Video",
          toggle: "videoSrc",
        });
    });

    this.mediaDevicesGroup = new ButtonGroup(this.stash, mediaDevicesSpec, async (e, prop, tag) => {
      let { deviceId, kind, label } = mediaDevicesSpec[tag];
      let index = parseInt(tag.split(" ")[1]) + 1;
      if (prop == "audioSrc") {
        if (index > audioSrcIdx) index = 1;
        this.stash.audioSrc = "Audio " + index;
      } else if (prop == "videoSrc") {
        if (index > videoSrcIdx) index = 1;
        this.stash.videoSrc = "Video " + index;
      }
      this.audioSrc.textContent = this.mediaDevicesSpec[this.stash.audioSrc]?.label ?? "";
      this.videoSrc.textContent = this.mediaDevicesSpec[this.stash.videoSrc]?.label ?? "";
      this.mediaDevicesGroup.refresh();

      this.mediaStream.getTracks().forEach(track => track.stop()) ;
      await this.restart() ;
    });
    this.mediaDevicesGroupElm.replace(this.mediaDevicesGroup.elm);
    this.mediaDevicesGroup.elm.style.marginTop = "1em";
    this.audioSrc.textContent = this.mediaDevicesSpec[this.stash.audioSrc]?.label ?? "";
    this.videoSrc.textContent = this.mediaDevicesSpec[this.stash.videoSrc]?.label ?? "";
    return true ;
  }

  buildViewer() {
    // Add media controls (Live || Replay / Pause) buttons
    this.mediaControls = new ButtonGroup(
      { state: "Live" },
      { Replay: { svg: "Play", redo: true, radio: "state" },
        Pause: { svg: "Pause", redo: true, radio: "state" },
      }, (e, prop, tag) => {
      if(this.state == "Replay") {
        if(tag == "Replay") {
          if(this.scrubber.dataIndex["time_slider"].pos == 1) this.live() ;
          else this.video.play() ;
        }
        else this.video.pause() ;
      }
      else { // input == "live"
        if(tag == "Replay") {
          this.recorder.resume() ;
          this.video.play() ;
        }
        else { // tag == "Pause"
          this.recorder.pause() ;
          this.video.pause() ;
        }
      }
    });
    this.mediaControlsElm.replaceWith(this.mediaControls.elm) ;
    this.mediaControls.elm.classList.add("Review__mediaControls");

    // add video scrub bar
    this.scrubber = new SliderGroup({time:1}, {
      time: {min:0, max:0, step:1, value:0, 
      msg: (tag, value) => Math.floor(value / 60000) + ":" + 
           String(Math.floor((value % 60000) / 1000)).padStart(2,0) }},
      (e, tag, value, scrubber) => { 
        if (e.type == "change") {
          if(this.state == "Live") this.replay(value) ;
          else { // this.state == "Replay" 
           this.setPlayButton("Replay") ;
           this.video.currentTime = value / 1000;
          }       
        }
     }) ;
    this.scrubberElm.replaceWith(this.scrubber.elm) ;
    this.scrubber.elm.classList.add("Review__scrubber");

    // define video event handlers

    listen(this.video, ["loadedmetadata"],() => {
      // After video first loads, resize this.elm and its children to
      // accomodate the video's aspect 
      let controlsHeight = getBox(this.controls.elm).height;
      let mediaControlsHeight = getBox(this.mediaControls.elm).height;
      let videoHeight = getBox(this.video).height;
      this.waveview.style.height = pxToEm(videoHeight, this.panel.elm);
      this.viewer.style.height = this.options.style.height = pxToEm(mediaControlsHeight + videoHeight, this.panel.elm);
      this.elm.style.height = pxToEm(controlsHeight + mediaControlsHeight + videoHeight, this.panel.elm);
      this.buildWave(); },
      { once: true }
    );

    this.panel.listeners.push(
      listen(this.video, "timeupdate", () => {
        // update scrubber when playback's currentTime value changes
        if(this.state == "Replay")
           this.scrubber.progress("time", this.video.currentTime * 1000)  ;
        })
    ) ;

    this.panel.listeners.push(
      listen(this.video, "ended", () => {
        // Called when playback reaches the end of recorded media. Sets up 
        // logic s.t. a subsequent play button press will transition to live.
        this.setPlayButton("Live") ;
        this.mediaControls.props.state = "Pause" ;
        this.mediaControls.refresh() ;
        // We use scrubber's pos == 1 as a marker to know when to transition back to recording. It is
        // likely "not quite" 1 on "ended", so force it there:
        this.scrubber.dataIndex["time_slider"].setPos(1);
      })
    ) ;

  }

  buildWave() {
    // append 60 narrow div's to represent time-slice lines of the spectrogram
    let lineCount = 60;
    let lineHeight = parseFloat(this.waveview.style.height) / lineCount;
    for (let i = 0; i < lineCount; i++) this.spectrogram.append(helm(`<div style="height:${lineHeight}em;"></div>`));
    // set gradient steps to create a colorful waveform
    this.waveformCtx = this.waveform.getContext("2d");
    let gradient = this.waveformCtx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#f00");
    gradient.addColorStop(0.495, "#008");
    gradient.addColorStop(0.5, "#fff");
    gradient.addColorStop(0.505, "#008");
    gradient.addColorStop(0.5, "#f00");
    gradient.addColorStop(1, "red");
    this.waveformCtx.fillStyle = gradient;
  }

  async live() {
    this.setPlayButton("Live") ;
    this.state = "Live" ;
    this.video.muted = true ;
    this.video.srcObject = this.mediaStream;
    this.recorder.record(this.mediaStream, this.stash.replay * 1000, this.scrubber) ;
    this.recordedSrc.disconnect() ;
    this.liveSrc.connect(this.analyser) ;
    this.analyser.disconnect() ;
    this.blink(this.mediaControls.elms.Replay) ;
    this.scrubber.progress("time", 0, 0, this.stash.replay * 1000) ;
  }

  async replay(progress = 0) {
    this.video.muted = false ;
    this.setPlayButton("Replay") ;
    this.state = "Replay" ;
    let recordedData = await this.recorder.stop() ;
    this.video.srcObject = null ;
    this.video.src = this.createVideoUrl(recordedData) ;
    this.liveSrc.disconnect() ;
    this.recordedSrc.connect(this.analyser) ;
    this.analyser.connect(this.actx.destination) ;
    this.video.currentTime = progress / 1000;
  }

  async restart() {
    // Called when options have changed: restarts the Review with new parameters,
    // but video/recording will be paused
    this.mediaStream.getTracks().forEach(track => track.stop()) ;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: {exact: this.mediaDevicesSpec[this.stash.videoSrc].deviceId}},
      audio: { deviceId: {exact: this.mediaDevicesSpec[this.stash.audioSrc].deviceId}},
    });
    // now (re) start the recorder
    this.recorder.destructor() ;
    this.recorder = new Recorder() ;
    this.liveSrc = this.actx.createMediaStreamSource(this.mediaStream) ;
    this.state = "live" ;
    this.live() ;
  }


  wave() {
    // update spectrogram display and (re)generate wave display
    if(this.stash.mode == "Wave" && !this.video.paused) {
      let buf = this.audioBuf;
      let bufLen = buf.length ;
      let width = this.analyser.frequencyBinCount / 4;
      // Update waterfall spectrogram. The spectrogram consists of
      // a bunch of narrow divs arranged top-to-bottom. Every time runWave
      // is run, it:
      // 1. removes the bottommost div
      // 2. repaints it using frequency data, left-to-right, converting
      //    power to color through this.h2rgba.
      // 3. re-inserts div at top
      this.analyser.getByteFrequencyData(buf);
      let line = this.spectrogram.lastElementChild;
      line.remove();
      let grad = "linear-gradient(to right," + this.h2rgba(buf[0] * buf[0]) + " 0%";
      for (let i = 0; i < width; i++) grad += "," + this.h2rgba(buf[i + i] * buf[i + i]) + (i / width) * 100 + "%";
      line.style.background = grad;
      this.spectrogram.prepend(line);
      // update waveform
      this.analyser.getByteTimeDomainData(buf);
      let ctx = this.waveformCtx;
      ctx.clearRect(0, 0, bufLen, 256);
      ctx.beginPath();
      ctx.moveTo(0, buf[0]);
      for (let i = 1; i < bufLen; i++) ctx.lineTo(i, buf[i]);
      ctx.closePath();
      ctx.fill();
    }
    delay(2, () => this.wave()) ;
  }

  // Utility methods:

  createVideoUrl(media) {
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl); // clean up previous
    this.videoUrl = URL.createObjectURL(media);
    return this.videoUrl;
  }

  setPlayButton(text) {
    // set the @text of the mediaControls play button: this will be either "Live" or "Replay"
    this.mediaControls.elms.Replay.firstChild.replaceWith(document.createTextNode(text)) ;
  }

  h2rgba(h) {
    // Creates an "rgba(r,g,b,a)" string from a 16-bit
    // integer value h
    let r, b, g, a;
    r = b = g = a = 0;
    let step = 65536 / 3;
    if (h < step) {
      a = h / step;
      b = 256 * a;
    } else {
      a = 1;
      h -= step;
      if (h < step) {
        g = (h / step) * 256;
        b = 256 - g;
      } else {
        h -= step;
        r = (h / step) * 256;
        g = 256 - r;
      }
    }
    return `rgba(${r},${g},${b},${a})`;
  }

  show() {
    schedule(1, () => this.build());
  }

  blink(elm, color= null) {
    // Blink the given element by periodically changing its color red<->black 
    if(!color && this.blinking) return ;
    if (this.state == "Live") {
      elm.style.color = color;
      delayMs(_gs_ * 1000, () => this.blink(elm, color == "red" ? "black" : "red")) ;
     this.blinking = true ;
    }
    else {
      elm.style.color = "black" ;
      this.blinking = false ;
    }
  }
}

