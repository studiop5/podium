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


import { dialog, listen, sleep, toast } from "./common.js";
import { Layout } from "./layout.js";
import { Score } from "./score.js";
export { PasteBuffer }

// -skip

class PasteBuffer {

  // list of podium tab id's. Assigned in a cycle, starting from end.
  podIds = [
    'vib', 'mar', 'xyl', 'tgl', 'cym', 'gl', 'pf', 'ti', 'la', 'so', 'fa', 'mi',
    're', 'do', 'uke', 'bjo', 'gtr', 'hp', 'db', 'vc', 'va', 'vn', 'hpd', 'eu',
    'crt', 'tba', 'tbn', 'tpt', 'hn', 'hca', 'rec', 'eh', 'sax', 'pic', 'bn',
    'cl', 'ob', 'fl', 'mf', 'mp', 'ff', 'pp'] ;


  constructor() {
    this.db = null;
    this.dbName = 'Podium';
    this.storeName = 'podium';
    this.version = 1;
    this.pgs = [] ;
    this.pns = [] ;


    listen(window, "beforeunload", () => this.pns.length > 0 ? this.signal("pod-owner-closed") : null) ;

  }

  async init() {
    return new Promise((resolve, reject) => {
      let request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = async () => { 
        this.db = request.result ;
        window._podPb_ = this ;
        // generate a unique id. We first look in the this.db for "pod-ids"...
        // If there and non-empty, it will be a truncated copy this.podIds:
        // we pop the last element and use it as our _podId_. If not there
        // or empty, then "roll over the pod-ids: use last element of this.podIds
        // as our ids, and store the rest in the db.
        let ids ;
        let entry = await this.get("pod-ids") ;
        if(!entry || entry.data.length == 0) ids = [...this.podIds] ;
        else ids = entry.data ;
        window._podId_ = ids.pop() ;

        // set up storage listener now that _podId_ exists
        listen(window, 'storage', async (e) => {
          let data = JSON.parse(e.newValue);
          switch(e.key) { // interpret incoming signals
    
            case "pod-commit": // bring db up-to-date
              await this.commit();
              break ;
    
            case "pod-exit": // Too many tabs open: force user to close this one.
              if(data.podId == _podId_)
                dialog(`<em>Podium tab limit (${this.podIds.length}) exceeded.<em><br>Please close this tab.`, {}) ;
              break ;
    
            case "pod-has-pgs": 
              // Whenever a Podium instance launches, it signals "pod-has-pgs"
              // to find out if any other instance has any pastebuffer pages,
              // and therefore "owns" the pastebuffer.
              // If current instance has pgs, it will signal "pod-pgs-changed"
              // so that caller (and others) know what the current pastebuffer
              // "owner" tab is, and its state.
              if(this.pgs.length > 0) 
                this.signal("pod-pgs-changed", { pns: this.pns }) ;
              break ;
    
            case "pod-owner-closed": // owner tab closed: disable pastebuffer cell, clear panel
              _menu_.enableCells("page/paste", false) ;
              this.relay({pns: []}) ;
              break ;
             
            case "pod-pgs-changed": // Another tab has modified its pgs so now "owns" the paste buffer, clear local 
              this.pns = [] ;
              this.pgs = [] ;
              this.relay(data) ;
              _menu_.enableCells("page/paste") ;
              break ;
    
            case "pod-pgs-clear": 
              this.pgClear() ;
              break ;
    
            case "pod-pgs-pop": 
              this.pgPop() ;
              break ;
    
            case "pod-id-check": // Check if the given podId is ours...if so, tell signaller to exit...
               if(data.podId == _podId_)
                 this.signal("pod-exit") ;
               break ;
          }
        }) ;

        // heck for _podId_ in use
        this.signal("pod-id-check") ;
        await this.put("pod-ids", ids) ;
        document.title = `Podium (${_podId_})` ;
        resolve(_podId_) ;
      }
    });
  }

  async del() { // don't know if/when we would call this. likely from helpmenu's reset
    await indexedDB.deleteDatabase(this.dbName) ;
  }

  relay(data={}) {
   // Create and send a PasteBufferChanged event
   let payload = Object.assign({ podId: _podId_, pns: this.pns, score: Score.activeScore.name }, data) ;
   _body_.dispatchEvent(new CustomEvent("PasteBufferChanged", { detail: payload})) ;
  }

  signal(msg, data={}) {
    // Send given message to all other existing podium tabs through localStorage
    let payload = Object.assign({podId: _podId_, score: Score.activeScore?.name || '?', ts: Date.now()}, data) ;
    localStorage.setItem(msg, JSON.stringify(payload)) ;
  }

  async pgAdd(pg, pn) {
     // @pg the pg to add to the pasteBuffer
     // @origPg if pg is a clone, pass in the pg it was cloned from, otherwise null.
     // @return true if pg was added, or false (pg with same pn already added)
     // At the beginning of very cut/copy sequence, there will be no pns.
     // At this point, tell each of the score's pg's what their current
     // pn is...we call this pn0. 
     if(this.pns.length == 0) 
       await this.clear() ; // clear committed pgs from db
     if(this.pns.includes(pn)) return false ;
     this.pgs.push(pg) ;
     this.pns.push(pn) ;
     this.relay() ;
     this.signal("pod-pgs-changed", { pns: this.pns }) ; 
     _menu_.enableCells("page/paste", true) ;
     return true ;
  }


  async pgAdded(pn) {
    // Not to be confused with pgAdd! This is called when a pg has been
    // added to the score...we simply need to adjust all the pn's
    // >= pn by 1.
    for(let i = 0 ; i < this.pns.length ; i++) 
      if(this.pns[i] >= pn) this.pns[i]++ ;
    this.signal("pod-pgs-changed") ;
    this.relay() ;
  }

  async pgClear() {
    if(this.pns.length == 0) return this.signal("pod-pgs-clear") ;
    while(this.pns.length > 0) {
      this.pgPop() ;
      await sleep(100) ;
    }
  }

  async pgCopy(pg, pn) {
    if(pg.isCut) return toast("Page already cut") ;
/// rem grd...fix this...check for inclusion befor cloning.
    let clone = await pg.clone(true) ;
    if(!(await this.pgAdd(clone, pn))) return toast("Page already in clipboard") ;
    _menu_.enableCells("page/paste", true);
    return clone ;
  }


  async pgCut(pg, pn) {
    if(pg.isCut) return toast("Page already cut") ;
    if(this.pns.length == 0) await this.clear() ;
    let idx = this.pns.indexOf(pn); // If pg already in buffer (as a copy)
    if (idx >= 0) this.pgs[idx] = pg; // replace copied clone with cut original.
    else { // Add as new cut
      this.pgs.push(pg);
      this.pns.push(pn);
    }
    pg.setCut(true);
    this.relay();
    this.signal("pod-pgs-changed", { pns: this.pns });
    _menu_.enableCells("page/paste", true);
  }

  async pgDelete(pg, pn) {
    if(this.pns.length == 0) await this.clear();
    // Mark which score this page came from
    pg.srcScore = Score.activeScore;
    this.pgs.push(pg);
    this.pns.push(pn);
    Score.activeScore.pgCut(pn);
    Layout.activeLayout.build(false);
    this.relay();
    this.signal("pod-pgs-changed", { pns: this.pns });
    _menu_.enableCells("page/paste", true) ;
  }

  async pgPaste(pn) {
    // Signal all tabs (including self) to commit
    await this.commit() ;
    this.signal("pod-commit");
    // Poll IndexedDB until data appears (with shade + cancel)
    _shade_.update("Waiting for clipboard data...");
    _shade_.onCancel = () => toast("Paste cancelled") ;
    let timeout = 10000 ; // max time to wait for commit to appear: 10 secs
    for(let pdfData, deadline = performance.now() + timeout;;) {
      await sleep(100);
      if (_shade_.cancelled) return toast("Paste cancelled") ;
      if(pdfData = (await this.get("pages"))?.data?.pdfData) {
        await Score.activeScore.bindScore(pdfData, pn);
        return _body_.dispatchEvent(new CustomEvent("PgsChanged")); // rem grd...do we need this???
      }
      if(performance.now() > deadline) 
        return toast(`Paste failed - no clipboard data after ${timeout/1000}s`) ;
    }
  }

  pgPop() {
    if(this.pns.length == 0) return this.signal("pod-pgs-pop", { }) ; 
    let pn = this.pns.pop() ;
    let pg = this.pgs.pop() ;
    if(pg.isCut) pg.setCut(false) ;
    else if(pg.srcScore) {
      if(pg.srcScore === Score.activeScore) {
        pg.srcScore = null ;
        Score.activeScore.pgAdd(pg,pn) ;
        Layout.activeLayout.build(false) ;
      }
      else toast("Can't restore delete page - score has changed") ;
    }
    this.relay() ;
     this.signal("pod-pgs-changed", { pns: this.pns }) ; 
     if(this.pns.length == 0) {
       this.clear() ;
       _menu_.enableCells("page/paste", false) ;
     }
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

  async commit() {
    // Commit local pasteBuffer to IndexedDB
    if((await this.get("pages"))?.data?.pdfData) return ;
    if(this.pns.length == 0) return ;

    _shade_.show("Preparing pages...");

    let score = Score.activeScore ;

    try {
      // Create temporary score with pasteBuffer pages
      let tmpScore = new Score();
      tmpScore.mozDoc = score.mozDoc ;
      tmpScore.pgs = this.pgs ;
      tmpScore.maxWidth = Math.max(...this.pgs.map(p => p.width));
      tmpScore.maxHeight = Math.max(...this.pgs.map(p => p.height));
      // Convert to PDF
      let pageNumbers = this.pgs.map((pg, i) => i + 1); // [1, 2, 3, ...]
      let pdfData = await tmpScore.toPdf("stamp", false, pageNumbers);
      // Store in IndexedDB
      await this.put('pages', {
        pdfData: pdfData,
        pns: this.pns, 
        score: score.name,
        podId: _podId_
      });
      // Remove cut pgs
      let cutPns = [] ; // first gather all cut pns
      this.pgs.forEach((pg) => pg.isCut ? cutPns.push(score.pnOf(pg)) : null) ;
      cutPns.sort((a, b) => b - a) ; // cut the pgs starting from hightest pn
      cutPns.forEach((pn) => score.pgCut(pn)) ;
      if(cutPns.length) Layout.activeLayout.build(false) ; // Update layout
      _shade_.hide();
     } catch (error) {
      _shade_.hide();
      throw error;
    }
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
      request.onerror = () => reject(request.error);
    });
  }

}


// testing:

listen(document, "keydown", async (e) => {
  if(e.key == "d") {
    console.log("dirty: ", await _podPb_.get("pages")?.data?.pdfData) ;
  }
  
  if (e.key === 'p') {
    console.log("pgs:", _podPb_.pgs) ;
    console.log("pns:", _podPb_.pns) ;
    return ;
  }
  
  if (e.key === 'c') {
    _podPb_.clear() ;
    console.log("clear pgs") ;
    return ;
  }
  
  if (e.key === 'x') {
    _podPb_.del() ;
    return ;
  }
  
})
