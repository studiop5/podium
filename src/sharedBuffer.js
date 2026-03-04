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
  <https:/\/www.gnu.org/licenses/>.
**/


import { delay, dialog, listen, sleep, toast } from "./common.js";
import { Layout } from "./layout.js";
import { Score } from "./score.js";
export { SharedBuffer }

// -skip

class SharedBuffer {

  // List of podium tab ids, assigned starting from the end (popped off as tabs open).
  // Tab titles use these ids to distinguish multiple open tabs: "Podium (do)", "Podium (re)", etc.
  // Web/PWA tabs use parentheses: Podium (do). Extension tabs use square brackets: Podium [do].
  podIds = ["sf","pp","mp","mf","ff","ti","la","so","fa","mi","re","do"];

  constructor() {
    this.db = null;
    this.dbName = 'Podium';
    this.storeName = 'podium';
    this.dbKey = "pod-pb-pdf";
    this.version = 1;
    this.score = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      let request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = (event) => {
        let db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = async () => { 
        this.db = request.result;
        window._podPb_ = this;
        // generate a unique id. We first look in the this.db for "pod-ids"...
        // If there and non-empty, it will be a truncated copy this.podIds:
        // we pop the last element and use it as our _podId_. If not there
        // or empty, then "roll over the pod-ids: use last element of this.podIds
        // as our ids, and store the rest in the db.
        let ids = [...this.podIds];
        window._podId_ = ids.pop();
        // Extension tabs use [brackets], web/PWA tabs use (parens), to distinguish them in the tab bar.
        let podTitle = (window.chrome && chrome.runtime?.id) ? id => `Podium [${id}]` : id => `Podium (${id})`;
        // set up storage listener now that _podId_ exists
        listen(window, 'storage', async (e) => {
          if (!e.newValue) return;
          let data = JSON.parse(e.newValue);
          switch(e.key) { // interpret incoming signals
    
            case "pod-id-taken": // Chosen id in use, try another one.
              // When pod-id-taken is signalled, there must be 2 tabs for which data.podId == _podId_:
              // 1. tab that sent the signal: it won't get the signal, tabs can't signal themself.
              // 2. the tab trying to get an id.
              // All other tabs besides these 2 will get the signal, but only the tab trying to get an
              // id should process it...
              if(data.podId != _podId_) break; // then this is not the tab trying to get an id...
              if(ids.length == 0) // No return from this dialog...need to enforce this.
                dialog(`<em>Error: only ${this.podIds.length} Podium tabs can be open at the same time.<em><br>`, {});
              else {
                window._podId_ = ids.pop();
                this.signal("pod-id-check");
                document.title = podTitle(_podId_);
              }
              break;

            case "pod-pgs-changed": // Another tab has modified the shared buffer
              this.score = null;
              this.announce();
              break;
    
            case "pod-pgs-clear": 
              this.pgClear();
              break;
    
            case "pod-pgs-pop": 
              this.pgPop();
              break;
    
            case "pod-id-check": // Check if the given podId is ours...if so, tell signaller to exit...
               if(data.podId == _podId_)
                 this.signal("pod-id-taken");
               break;
          }
        });

        // check for _podId_ in use
        this.signal("pod-id-check");
        document.title = podTitle(_podId_);
        _menu_.enableCells("page/import", (await this.getScore()).pgs.length > 0);
        resolve(_podId_);
      }
    });
  }

  announce() {
   // Create and send a SHAREDBUFFER event
   _body_.dispatchEvent(new CustomEvent("SHAREDBUFFER"));
  }

  signal(msg, data={}) {
    // Send given message to all other existing podium tabs through localStorage
    let payload = Object.assign({podId: _podId_, score: _score_?.name || '?', ts: Date.now()}, data);
    localStorage.setItem(msg, JSON.stringify(payload));
  }

  async getScore() { 
    // @return Score constructed from shared buffer pdf (if available, else new, empty Score)
    if(this.score) return this.score; // cached
    let pdfData = (await this.get(this.dbKey))?.data;
    if(pdfData) this.score = await new Score().init("podPb",_podId_,_podId_,pdfData, false);
    else this.score = new Score();
    return this.score;
  }

  async pgClear() {
    await this.clear(this.dbKey);    
    this.score = null;
    this.signal("pod-pgs-changed");
    this.announce();
  }
 
  async pgCopy(pn) {
    try {
      let pgPdf = await _score_.toPdf("stamp", false, [pn]);
      let pbScore = await this.getScore();
      this.score = await pbScore.bindScore(pgPdf, pbScore.pgs.length + 1);
      await this.put(this.dbKey, await this.score.toPdf());
      this.signal("pod-pgs-changed");
      this.announce();
      _menu_.enableCells("page/import", true);
    } catch (err) {
      if (err.cause === 'fileSrc' || err.message?.includes('catalog') || err.message?.includes('Invalid object')) {
        dialog("Unable to copy page:<br>" + err.message);
      } else throw err; 
    }
  }

  async pgPop() {
    this.score = await this.getScore();
    let len = this.score.pgs.length;
    if(len == 0) return;
    this.score.pgCut(len, false);
    await this.put(this.dbKey, await this.score.toPdf());
    this.signal("pod-pgs-changed");
    this.announce();
  }

  async pgPaste(pn) {
    let pbScore = await this.getScore();
    let pbPdf = await pbScore.toPdf();
    let mergedScore = await _score_.bindScore(pbPdf, pn);
    await mergedScore.activate();
  }

  // indexed database operations:

  async clear(id = 'pages') {
    return new Promise((resolve, reject) => {
      let tx = this.db.transaction([this.storeName], 'readwrite');
      let store = tx.objectStore(this.storeName);
      let request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete() { 
    await indexedDB.deleteDatabase(this.dbName);
  }

  async get(id) {
    return new Promise((resolve, reject) => {
      let tx = this.db.transaction([this.storeName], 'readonly');
      let store = tx.objectStore(this.storeName);
      let request = store.get(id);
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error);
    });
  }

  async put(id, data) {
    return new Promise((resolve, reject) => {
      let tx = this.db.transaction([this.storeName], 'readwrite');
      let store = tx.objectStore(this.storeName);
      let request = store.put({ id:id, data:data});
      request.onsuccess = () => resolve();
      request.onerror = () => {
        if (request.error.name === 'QuotaExceededError') 
          dialog("Paste buffer full. Clear some pages first.");
        reject(request.error);
      };
    });
  }

}


