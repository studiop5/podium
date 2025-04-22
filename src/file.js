// +skip

/**
  Copyright 2025 Glendon Diener
 
  This file is part of Podium.
 
  Podium is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

  Podium is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with Podium. If not, see <https://www.gnu.org/licenses/>.
**/

export { checkUnsaved, FileSrc, FileListView, FileSystemView, LocalFileView };
import { css, ButtonGroup, clamp, clearChildren, dataIndex, delay, getBox, helm, iconSvg, listen, mvmt, dialog, schedule, Schedule, strToHash, toast, unlisten } from "./common.js";
import { Score } from "./score.js";
import { panels } from "./panel.js";
import { Layout } from "./layout.js";
// -skip

let bytesToBase64DataUrl = async (bytes, type = "application/octet-stream") => {
  // This function is copied directly from
  // "https:\/\/developer.mozilla.org/en-US/docs/Web/API/Window/btoa"
  return await new Promise((resolve, reject) => {
    const reader = Object.assign(new FileReader(), {
      onload: () => resolve(reader.result),
      onerror: () => reject(reader.error),
    });
    reader.readAsDataURL(new File([bytes], "", { type }));
  });
};

let err = (call, msg) => {
  console.log(`**** Podium FileSrc error in call: ${call}`, msg);
  console.trace();
  throw new Error(msg, { cause: "fileSrc" });
};

let errDialog = (error, stack, msg) => {
  // Craft an error dialog, given an exception variable and a msg.
  if (error.name == "AbortError") return; // thrown when browser's open/save panels are cancelled
  else if (error.cause && error.cause == "cancelled") return;
  else if (error.cause == "timeout") dialog("Timed out waiting for authentication");
  else if (error.cause == "security") dialog(`<em>Security Error</em><br><br><strong>${error.message}</strong>`);
  else if (error.cause == "fileSrc") dialog(`<em>${msg}</em><br><br><strong>${error.message}</strong>`);
  else {
    console.log(`*** Unexpected Podium Error: ${stack}`);
    dialog(`<em>Unexpected Error</em><br><br><strong>${error}</strong><br><br>Details in console.`);
  }
};


let checkUnsaved = async (msg = "Warning: current score has unsaved changes. Open anyway?") => {
  // Display a confirm dialog if there is a dirty Score.activeScore that would be overriden
  // without saving by opening a new Score. Return promise that resolves to true iff user clicks "Open".
  return new Promise(async (accept, reject) => {
    if(Score.activeScore && Score.activeScore.dirty) {
      dialog(msg,
        { Open: { svg: "Open" }, Cancel: { svg: "Cancel" } },
        (e, prop, tag, args) => {
          args.close();
          accept(tag == "Open") ;
        }
      )}
    else accept(true) ;
  })
}


/**
class FileSrc
  The Scores panel allows scores to be opened/saved from either the
  local file system, or from one of several commercial cloud-based
  file systems implementing hierarchical (tree-structured) file
  storage systems. Data from each cloud-based system is manipulated
  through a corresponding "Src" class that makes calls on that
  system's native api. Currently, Google Drive, DropBox, and Microsoft
  OneDrive are implemented.

  Note: whenever the term "path" is used in this module, it refers to
  a *string* path with no leaf node, i.e. all nodes are directories
  (folders).  The root path is "", and path components are *separated*
  by '/'s.  When the term "name" is used, it refers to a file's name,
  *not including* its path.

  Ascii art inheritance hierarchy:

               FileSrc
               /      \
         LocalSrc    CachedSrc
                     /     |   \
               GDriveSrc DbxSrc ODriveSrc

  All FileSrc subclasses are singletons, created on demand, and accessed
  though FileSrc static methods.

  CachedSrc defines the following functions:

    auth(), getDir(), getFile(), renameDir(), renameFile(),
    trashDir(), trashFile, putFile(), putDir()

  It also provides a caching mechanism that serves to reduce the
  number of calls to the native cloud provider api's by storing (with
  timeouts) fetched filesystem data.

  CachedSrc subclasses implement the underpinnings of this api by
  defining the auth() function for authentication/authorization
  through OAUTH 2, and by defining a series of calls that
  corresponding to the CachedSrc api:

    getDirSrc(), getFileSrc(), ...

  ...that do the actually work of uploading/downloading data
  from the various cloud-based file systems. In all cases, these
  functions use the cloud-based systems REST interface rather than
  the cloud provider's libaries.  
*/

class FileSrc {
  static refs = null;

  // ref is string or singleton instance
  static get(ref) {
    // FileSrc.refs is a 2-way mapping between Score.sources (strings that
    // identify the "source" of a score) and FileSrc instances...classes
    // that implement the source's api for accessing files. The FileSrc
    // instances are created lazily on first access.
    // @ref is a string from Score.sources OR a (singleton) instances of
    // a FileSrc subclass.
      if (!FileSrc.refs) FileSrc.refs = new Map();
      let refs = FileSrc.refs;
      if (refs.has(ref)) return refs.get(ref);
      let src;
      if (ref == Score.sources.local) src = new LocalSrc() ;
      else if (ref == Score.sources.gdrive) src = new GDriveSrc() ;
      else if (ref == Score.sources.dbx) src = new DbxSrc() ;
      else if (ref == Score.sources.odrive) src = new ODriveSrc() ;
      FileSrc.refs.set(ref, src); // ref -> src
      FileSrc.refs.set(src, ref); // src -> ref
      return src;
  }

  static async openActiveScore(cell) {
    let score = Score.activeScore;
    let src = score ? FileSrc.get(score.source) : null;
    if (!src) {
      // menu's score/open/up called, but no active score:
      // in this case, bring panel onscreen
      let panel = panels[cell.name + "Panel"].get(cell);
      if (panel.elm.style.visibility != "visible") {
        let box = getBox(_menu_.grip);
        panel.elm.style.left = box.x + box.width / 2 + "px";
        panel.elm.style.top = box.y + box.height / 2 + "px";
        panel.show();
        delay(10, () => panel.setPosition(_menu_.grip));
      }
      return;
    }

    // This is effectively a "revert", hence we prompt user to confirm
    return new Promise(async (accept, reject) => {
      dialog("Confirm. Revert To Saved?", { Revert: { svg: "Open" }, Cancel: { svg: "Cancel" } }, async (e, prop, tag, args) => {
        try {
          args.close();
          if (tag == "Cancel") return;
          _shade_.show("Downloading file");
          let { data, size, created, modified } = await src.getFile(score.path, score.name);
          score = await new Score().init(score.source, score.path, score.name, data);
          Score.visit(score, { size, created, modified });
          toast("File reverted.");
        } catch (error) {
          errDialog(error, error.stack, "Error: failed to download file from cloud server.<br>Details in Console.");
        } finally {
          _shade_.hide();
          accept();
        }
      });
    });
  }

  static async saveActiveScore(cell) {
    let score = Score.activeScore;
    let src = FileSrc.get(score.source);
    if (!src) {
      let panel = panels[cell.name + "Panel"].get(cell);
      if (panel.elm.style.visibility != "visible") {
        panel.show();
        panel.setPosition(_menu_.grip);
      }
      return;
    }
    _shade_.show("Uploading file");
    // Unlike openActiveScore (i.e. revert), we do not prompt user
    // to save: this seems like a more natural ui experience.
    return new Promise(async (accept, reject) => {
      try {
        let data = await score.toPdf();
        await src.putFile(score.path, score.name, data);
        Score.visit(score, { size: data.length, modified: Date.now() });
        score.setDirty(false) ;
        toast("File uploaded.");
      } catch (error) {
        errDialog(error, error.stack, "Error: failed to upload file to cloud server.<br>Details in Console.");
      } finally {
        _shade_.hide();
        accept();
      }
    });
  }
}

class LocalSrc extends FileSrc {
  source = Score.sources.local;

  async getFile(path, name) {
    return new Promise((accept, reject) => {
      let input = helm('<input type="file" style="display:hidden;"></input>');
      _body_.append(input);
      listen(
        input,
        ["change", "cancel"],
        async (e) => {
          input.remove();
          if (e.type == "cancel") return reject(new Error("", { cause: "cancelled" }));
          let file = e.target.files[0];
          let data = await file.arrayBuffer();
          return accept({ path: null, name: file.name, data: data, created: null, modified: file.lastModified, size: data.byteLength });
        },
        { once: true }
      );
      input.click();
    });
  }

  async putFile(path, name, data) {
    if (window.showSaveFilePicker) {
      // Use "experimental" file system access api, if supported:
      const options = {
        suggestedName: name,
        types: [
          {
            description: "Podium Files",
            accept: {
              "application/pdf": [".pdf"],
            },
          },
        ],
      };
      const handle = await window.showSaveFilePicker(options);
      const writeable = await handle.createWritable();
      await writeable.write(data);
      await writeable.close();
      let file = await handle.getFile();
      return { name: file.name, modified: file.lastModified };
    } else {
      data = new Blob(data);
      let url = window.URL.createObjectURL(data);
      let link = helm(`<a download="${name}" href=${url}?</a>`);
      link.click();
      return { name: name, modified: Date.now() };
      // revoke url
    }
  }
}

class CachedSrc extends FileSrc {
  /* 
     This comment describes how data fetched from a provider subclass is cached.
     This data is fetched on demand, so most of the time, will have only a
     subset of the provider's data.  All fetched data is timestamped, and when
     a cache entry is accessed, data that was fetched more than "maxCacheAge"
     milliseconds will be refetched in an attempt to keep the cache as "fresh"
     as possible.
     
     The cache is implemented as a javascript object containing a property for
     every directory fetched from its provider. Property names are strings
     representing directory path components seperated by "/"'s. The corresponding
     values are objects containing information about that directory, including
     the files in that directory and the subdirectories in that directory.
     The root path's name is "", i.e. the empty string.

     pseudo-code example:
    
     cache = {

       path1: {id: dirId,
               ts: entryTimeStamp, // will be 0 if not fetched or invalidated
               dirs:  { path2: <<cache.path2>>  // note: self referencing
                        path3: <<cache.path3>>
                        ...
                      }
               files: { name1: { id,name,size,created,modified},
                        name2: { id,name,size,created,modified},                          
                        nameN: { id,name,size,created,modified},                          
                     },
               etc...
              },
  
       path2: { id: dirId,
                ts: entryTimeStamp
                dirs: { ...
                      }
                files: { ...
                       },
               etc...
             },

        path3: ...
       ...
     }

  */

  // The cache is initialized to root with no subdirs and no files,
  // but with a timestamp (ts) of 0, which will force it to be fetched
  // when first accessed.

  cache = {
    "": { id: "root", name: "", ts: 0, dirs: {}, files: {} },
  };

  maxCacheAge = 2 * 60 * 1000; // two minutes

  tokenExpiry = null;
  token = null;

  getQuery(url, key) {
    // Returns a query key's value from a url, or null if not found.
    // Always include the "=" in the key. Avoids more code complexity
    // by assuming the key is *not* part of the url's address.
    let i = url.indexOf(key);
    if (i == -1) return null;
    let value = url.substring(i + key.length);
    i = value.indexOf("&");
    return i == -1 ? value : value.substring(0, i);
  }

  /**
     authenticate using oauth2 PKCE currently. Dropbox nd OneDrive use this, but
     Google Drive doesn't support this flow, so GDriveSrc redefines auth.
   */

  cliendId = null; // subclass defined
  scopes = null; // subclass defined
  authUrl = null; // subclass defined
  tokenUrl = null; // subclass defined

  redirectUri = encodeURIComponent(`${window.location.origin}/podauth.html`);
  token = null;
  tokenExpiry = performance.now();
  authTimeout = 60000;

  popupSizes = {};

  authPopupOpen(url) {
    // create, open, and return a centered popup window for authentication
    let h = Math.min(window.screen.height, 1000);
    let w = Math.min(window.screen.width, 750);
    let x = window.top.outerWidth / 2 + window.top.screenX - w / 2;
    let y = window.top.outerHeight / 2 + window.top.screenY - h / 2;
    return window.open(`${url}`, "", `popup,height=${h},width=${w},top=${y},left=${x}`);
  }

  // This is called after oauth authentication has run
  authPopupClose(popup) {
    _shade_.pop();
    popup.close();
  }

  async auth() {
    // Run the oauth 2 PKCE flow to get an authentication toekn
    if (this.token && performance.now() < this.tokenExpiry) return Promise.resolve();
    this.token = null;

    // function to create a code challenge
    let base64UrlEncode = (str) =>
      btoa(String.fromCharCode.apply(null, new Uint8Array(str)))
        .replace(/\+/g, "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
    let plainChallenge = window.random.toPrecision(48) + Math.random().toPrecision(48);
    let challenge = base64UrlEncode(await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(plainChallenge)));
    let timeout = performance.now() + this.authTimeout; // 1 minute to authorize

    _shade_.show("Authorizing");
    let popup = this.authPopupOpen(`${this.authUrl}?client_id=${this.clientId}&scope=${this.scopes}&response_type=code&redirect_uri=${this.redirectUri}&code_challenge_method=S256&code_challenge=${challenge}`);

    // Return a promise...it runs the "oauth2 PKCE flow for single page web apps":
    // Repeatedly poll the popup window just opened, looking for a code on the url of
    // the popup.  Until that code is received, trying to read the url will raise
    // a security error.  That's OK...we just keep poll'ing until it doesn't, at
    // which time we know we have the code (or we know that the user has closed
    // the popup). Once we have the code, we'll call exchange to trade the code
    // for an auth token.
    return new Promise((resolve, reject) => {
      // exchange code for tokens
      let exchange = async (code) => {
        let response = await fetch(this.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `client_id=${this.clientId}&redirect_uri=${this.redirectUri}&code=${code}&code_verifier=${plainChallenge}&grant_type=authorization_code`,
        });
        if (response.ok) return await response.json(); // response has tokens
        else throw new Error(await response.text());
      };

      // poll for code
      let poll = async () => {
        try {
          if (popup.closed) throw "Authentication aborted";
          let code = this.getQuery(popup.location.href, "code=");
          if (code) {
            let tokens = await exchange(code);
            this.token = tokens.access_token;
            this.tokenExpiry = performance.now() + tokens.expires_in * 1000;
            this.authPopupClose(popup);
            return resolve();
          }
        } catch ({ name }) {
          if (name != "SecurityError") {
            this.authPopupClose(popup);
            return reject();
          }
        }
        if (performance.now() > timeout) {
          this.authPopupClose(popup);
          return reject(new Error("Timed out waiting for user's authorization.", { cause: "timeout" }));
        }
        setTimeout(() => poll(), 20); // try again
      };
      // start polling: can't use delay() here, as on mobile, the popup has focus, so
      // nextAnimationFrame doesn't run
      setTimeout(() => poll(), 50);
    });
  }

  putCache(path, data) {
    let cache = this.cache;
    try {
      // update entry for parentPath (which must be in cache), with data fetched from src
      // subclasses override and immediately call super()
      // Initially, recursively purge all children of path:
      let purgeCache = (path) => {
        let dirs = cache[path] || {};
        for (let [key, value] of Object.entries(dirs)) purgeCache(path + "/" + key);
        delete cache.path;
      };

      let current = cache[path]; // remember current entry
      purgeCache(path); // purge it from cache, then reinsert virgin copy
      cache[path] = {
        id: current.id,
        name: current.name,
        ts: Date.now(),
        dirs: {},
        files: {},
      };
    } catch (error) {
      err(`putCache(${path},...)`, error.message);
    }
    return cache[path];
  }

  async getDir(path, force = false) {
    await this.auth();
    let dir;
    if (this.cache.hasOwnProperty(path)) {
      dir = this.cache[path];
      if (!force && Date.now() - dir.ts <= this.maxCacheAge) return dir;
      if (dir.name == "") return this.putCache(path, await this.getDirSrc(path, dir));
    }
    // load path after recursively loading its parent dir.
    let lastSlashIndex = path.lastIndexOf("/");
    ///
    if (lastSlashIndex == -1) {
      Score.visit({ source: this.source, name: dir.name, path: path });
      err(`getDir(${path})`, "Path not found.");
    }
    let parentPath = path.substring(0, lastSlashIndex);
    await this.getDir(parentPath, force);
    return this.putCache(path, await this.getDirSrc(path, this.cache[path]));
  }

  async putDir(path, name) {
    await this.auth();
    let srcDir = await this.getDir(path);
    if (!srcDir) {
      err(`putDir(${path},${name}`, "Path not found.");
      Score.visit({ source: this.source, name: name, path: path });
    }
    let newDir = srcDir.dirs[name];
    let file = srcDir.files[name];
    if (newDir || file) err(`putDir(${path},${name})`, "Name in use.");
    await this.putDirSrc(path, name, srcDir);
  }

  async renameDir(path, name, newName) {
    await this.auth();
    let srcDir = await this.getDir(path);
    if (!srcDir) {
      Score.visit(null, null, path);
      err(`renameDir(${path},${name},${newName})`, "Path not found.");
    }
    let srcSubDir = srcDir?.dirs[name];
    if (!srcSubDir) {
      Score.visit(null, null, path + "/" + name);
      err(`renameDir(${path},${name},${newName})`, "Path not found.");
    }

    if (!srcDir || !srcSubDir) {
      err(`renameDir(${path},${name},${newName})`, "Path not found.");
      Score.visit(null, null, path);
    }
    let dstName = srcDir.files[newName] || srcDir.dirs[newName];
    if (dstName) err(`renameDir(${path},${name},${newName})`, "Name in use.");
    await this.renameDirSrc(path, name, newName, srcDir, srcSubDir);
  }

  async trashDir(path, name) {
    await this.auth();
    let parentDir = await this.getDir(path);
    let dir = parentDir.dirs[name];
    if (!dir) {
      Score.visit(null, null, path + "/" + name);
      err(`trashDir(${path},${name})`, "Path/Name not found.");
    }
    await this.trashDirSrc(path, name, parentDir, dir);
  }

  async getFile(path, name) {
    await this.auth();
    let dir = await this.getDir(path);
    let file = dir.files[name];
    if (!file) {
      Score.visit({ source: this.source, path, name });
      err(`getFile(${path},${name}`, "Path/Name not found.");
    }
    // the "name" and "path" vars are are here passed back intact. For a LocalSrc, however, the name may have changed, and the path is unknown.
    return { path: path, name: name, data: await this.getFileSrc(path, name, dir, file), size: file.size, created: file.created, modified: file.modified };
  }

  async putFile(path, name, data) {
    let dir = await this.getDir(path);
    if (dir.dirs[path]) return err(`putFile(${path},${name},...)`, "Path not found.");
    await this.putFileSrc(path, name, await data, dir, null);
  }

  async renameFile(path, name, newName) {
    await this.auth();
    _shade_.hide();
    let srcDir = await this.getDir(path);
    if (!srcDir) {
      Score.visit({ source: this.source }, null, path);
      err(`renameFile(${path},${name},${newName}`, "Path/Name not found.");
    }
    let srcFile = srcDir?.files[name];
    if (!srcFile) {
      Score.visit({ source: this.source, path, name });
      err(`renameFile(${path},${name},${newName}`, "Path/Name not found.");
    }
    let dstFile = srcDir.files[newName] || srcDir.dirs[newName];
    if (dstFile) err(`renameFile(${path},${name},${newName})`, "Name in use.");
    await this.renameFileSrc(path, name, newName, srcDir, srcFile);
  }

  async trashFile(path, name) {
    await this.auth();
    let dir = await this.getDir(path);
    let file = dir.files[name];
    if (!file) {
      Score.visit({ source: this.source, path, name });
      err(`trashFile(${path},${name})`, "Path/Name not found");
    }
    await this.trashFileSrc(path, name, dir, file);
  }
}

/**
class GDriveSrc (i.e. Google Drive) ;
**/
class GDriveSrc extends CachedSrc {
  source = Score.sources.gdrive;

  authUrl = "https:/\/accounts.google.com/o/oauth2/v2/";
  clientId = "1049752786050-72rqerj64c1l1vqk26r28qtcahfd6i3v.apps.googleusercontent.com";
  scopes = encodeURIComponent("https:/\/www.googleapis.com/auth/drive");
  tokenUrl = "https:/\/oauth2.googleapis.com/token";

  filesUrl = "https:/\/www.googleapis.com/drive/v3/files/";
  uploadUrl = "https:/\/www.googleapis.com/upload/drive/v3/files/";
  folderMimeType = "application/vnd.google-apps.folder";

  constructor() {
    super();
  }

  // NOTE: gdrive doesn't implement PKCE code flow for web apps, so redefine auth() to
  // use the older "token" flow 

  async auth() {
    if (this.token && performance.now() < this.tokenExpiry) return Promise.resolve(); 
    this.token = null ;
    let state = window.random.toPrecision(48) + Math.random().toPrecision(48);
    let timeout = performance.now() + this.authTimeout; 

    _shade_.show("Authorizing") ;
    let popup = this.authPopupOpen(this.authUrl + "auth?response_type=token&" + 
      `redirect_uri=${this.redirectUri}&scope=${this.scopes}&client_id=${this.clientId}&state=${state}`) ;

    return new Promise((resolve, reject) => {
      let poll = async () => {
        try {
          if (popup.closed) throw "Authentication aborted";
          let href = popup.location.href;
          this.token = this.getQuery(href, "access_token=") ;
          if(this.token) {
            if(this.getQuery(href, "state=") != state)
              throw new Error("Possible <i>Cross Site Request Forgery</i> attempt blocked.", {cause:"security"}) ;
            this.tokenExpiry = performance.now() + ((this.getQuery(href, "expires_in=") || 0) * 1000);
            this.authPopupClose(popup);
            return resolve();
          }
        } catch ({ name }) {
          if (name != "SecurityError") {
            this.authPopupClose(popup);
            return reject();
          }
        }
        if (performance.now() > timeout) {
          this.authPopupClose(popup);
          return reject(new Error("Timed out waiting for user's authorization.", {cause: "timeout"}));
        }
        setTimeout(() => poll(), 50);
      };
      // start polling, can't use delay() here: on mobile, nextAnimationFrame might
      // not be running
      setTimeout(() => poll(), 50);
    });
  }

  putCache(path, data) {
    super.putCache(path, data);
    let cache = this.cache;
    for(let obj of data) {
      if (obj.mimeType == this.folderMimeType) {
        let subPath = path + "/" + obj.name;
        cache[subPath] = {
          isDir: true,
          name: obj.name,
          id: obj.id,
          created: Date.parse(obj.createdTime),
          modified: Date.parse(obj.modifiedTime),
          ts: 0,
          dirs: {},
          files: {},
        };
        cache[path].dirs[obj.name] = cache[subPath];
      } else
        cache[path].files[obj.name] = {
          isDir: false,
          name: obj.name,
          id: obj.id,
          created: Date.parse(obj.createdTime),
          modified: Date.parse(obj.modifiedTime),
          size: obj.size,
        };
    };
    return cache[path];
  }

  async getDirSrc(path, dir) {
    // dir is the cache entry for path
   let query = "?pageSize=1000&spaces=drive&orderBy=folder desc, name&fields=nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size)&" + `q='${dir.id}' in parents and trashed=false`;

    let url = this.filesUrl + encodeURI(query);
    let entries = [];

    let loadPage = async (nextPageToken) => {
      let fullUrl = nextPageToken ? url + `&pageToken=${nextPageToken}` : url;
      let fetchPromise = await fetch(fullUrl, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + this.token,
        },
      });
      let response = await fetchPromise;
      if (response.ok) {
        let responseJson = await response.json();
        entries.push(...responseJson.files);
        if ("nextPageToken" in response) await loadPage(response.nextPageToken); // recurse
      } else err(`getDirSrc(${path},${dir}})`, await response.text());
    };
    await loadPage(null); // loads first page; succeeding pages loaded recursively
    return entries;
  }

  async putDirSrc(path, name, srcDir) {
    // create new subDir in path
    let url = this.filesUrl;
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mimeType: "application/vnd.google-apps.folder",
        name: name,
        parents: [srcDir.id],
      }),
    });
    let response = await fetchPromise;
    if (!response.ok) return err(`putDirSrc(${path},${name},${srcDir}) failed: ${await response.text()}`);
  }

  async renameDirSrc(path, name, newName, srcDir, srcSubDir) {
    let url = this.filesUrl + srcSubDir.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: `{ name: "${newName}" }`,
    });
    let response = await fetchPromise;
    if (response.ok) return true;
    err(`renameDirSrc("${path},${name},${newName},...") failed: ${await response.text()}`);
  }

  async trashDirSrc(path, name, parentDir, dir) {
    let url = this.filesUrl + dir.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: "{trashed: true}",
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashDirSrc(${path},${name},...)) failed: ${await response.text()}`);
  }

  async getFileSrc(path, name, dir, file) {
    let url = this.filesUrl + file.id + "?q=trashed=false&alt=media";
    let fetchPromise = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + this.token,
      },
    });
    let response = await fetchPromise;
    if (response.ok) return await response.arrayBuffer();
    throw Error(await response.text());
    if (!response.ok) err(`getFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async renameFileSrc(path, name, newName, srcDir, srcFile) {
    let url = this.filesUrl + srcFile.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: `{ name: "${newName}" }`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameFileSrc(${path},${name},${newName},...) failed: ${await response.text()}`);
  }

  async putFileSrc(path, name, data, dir, file) {
    if (!file) {
      // won't exist if creating...
      // create new empty file with metadata and get its id from the response.
      let url = this.filesUrl;
      let fetchPromise = fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name,
          mimeType: "application/octet-stream",
          parents: [`${dir.id}`],
        }),
      });
      let response = await fetchPromise;
      if (response.ok) {
        file = await response.json();
      } else err(`putFileSrc(${path},${name},...) failed: ${await response.text()}.`);
    }
    // now write to the (existing or newly created) file:
    let url = this.uploadUrl + file.id;
    let fetchPromise = fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/octet-stream",
        "Content-Length": data.length,
      },
      body: data,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async trashFileSrc(path, name, dir, file) {
    let url = this.filesUrl + file.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: "{ trashed: true}",
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }
}

/**
class DbxSrc (i.e. DropBox)
*/
class DbxSrc extends CachedSrc {
  source = Score.sources.dbx;
  authUrl = "https:/\/www.dropbox.com/oauth2/authorize";
  clientId = "erqcrdytyixn6h7";
  scopes = encodeURIComponent("files.content.write files.content.read");
  tokenUrl = "https:/\/api.dropbox.com/oauth2/token/";

  filesUrl = "https:/\/api.dropboxapi.com/2/files/";
  contentUrl = "https:/\/content.dropboxapi.com/2/files/"; // for upload and download

  constructor() {
    super();
  }

  putCache(path, data) {
    super.putCache(path, data);
    let cache = this.cache;
    for (let obj of data) {
      if (obj[".tag"] == "folder") {
        let subPath = path + "/" + obj.name;
        cache[subPath] = {
          isDir: true,
          name: obj.name,
          id: obj.id,
          created: 0,
          modified: 0,
          ts: 0,
          dirs: {},
          files: {},
        };
        cache[path].dirs[obj.name] = cache[subPath];
      } else
        cache[path].files[obj.name] = {
          isDir: false,
          name: obj.name,
          id: obj.id,
          created: Date.parse(obj.client_modified),
          modified: Date.parse(obj.server_modified),
          size: obj.size,
        };
    }
    return cache[path];
  }

  async getDirSrc(path, dir) {
    let uri = this.filesUrl + "list_folder";
    let entries = [];
    let cursor = null;
    for (;;) {
      let fetchPromise = await fetch(uri, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.token,
          "Content-Type": "application/json",
        },
        body: cursor ? `{"cursor":"${cursor}"}` : `{"path":"${path}"}`,
      });
      let response = await fetchPromise;
      if (!response.ok) err(`getDirSrc(${path},${dir}})`, await response.text());
      let responseJson = await response.json();
      entries.push(...responseJson.entries);
      if (!responseJson.has_more) return entries;
      if (!cursor) {
        cursor = responseJson.cursor;
        uri += "/continue";
      }
    }
  }

  async putDirSrc(path, name, srcDir) {
    let uri = this.filesUrl + "create_folder_v2";
    let fetchPromise = await fetch(uri, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: `{"path":"${path}/${name}"}`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putDirSrc(${path},${name},...})`, await response.text());
  }

  async renameDirSrc(path, name, newName, srcDir, srcSubDir) {
    let uri = this.filesUrl + "move_v2";
    let fetchPromise = await fetch(uri, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      // rm grd... use JSON.stringify
      body: `{"from_path":"${path}/${name}","to_path":"${path}/${newName}"`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameDirSrc(${path},${name},${newName})`, await response.text());
  }

  async trashDirSrc(path, name, parentDir, dir) {
    let url = this.filesUrl + "delete_v2";
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: `{"path":"${path}/${name}"}`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashDirSrc(${path},${name},...)`, await response.text());
  }

  async getFileSrc(path, name, dir, file) {
    let url = this.contentUrl + "download";

    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Dropbox-API-Arg": `{ "path": "${file.id}"}`,
      },
    });
    let response = await fetchPromise;
    if (!response.ok) err(`GetFileSrc(${path},${name},...)`, await response.text());
    return await response.arrayBuffer();
  }

  async putFileSrc(path, name, data, dir, file) {
    let url = this.contentUrl + "upload_session/start";
    // get session_id
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/octet-stream",
      },
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putFileSrc(${path},${name},...)`, await response.text());
    let session_id = (await response.json()).session_id;
    // upload file in slices
    let maxSliceLen = 5 * 1024 * 1024;
    let remaining = data.byteLength;
    let sliceLen = Math.min(remaining, maxSliceLen);
    url = this.contentUrl + "upload_session/append_v2";
    let cursor = 0;
    while (remaining > sliceLen) {
      let slice = (fetchPromise = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.token,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": `{"cursor":{"offset":${cursor},"session_id":"${session_id}"}\}`,
        },
        body: new DataView(data.buffer, cursor, sliceLen),
      }));
      response = await fetchPromise;
      if (!response.ok) err(`putFileSrc(${path},${name},...)`, await response.text());
      remaining -= sliceLen;
      cursor += sliceLen;
      sliceLen = Math.min(remaining, maxSliceLen);
    }
    // commit (includes last (or only) slice
    url = this.contentUrl + "upload_session/finish";
    fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({
          commit: {
            mode: "overwrite",
            path: path + "/" + name,
          },
          cursor: {
            offset: cursor,
            session_id: session_id,
          },
        }),
      },
      body: new DataView(data.buffer, cursor, sliceLen),
    });
    response = await fetchPromise;
    if (!response.ok) err(`putFileSrc(${path},${name},...)`, await response.text());
  }

  async renameFileSrc(path, name, newName, srcDir, srcFile) {
    let uri = this.filesUrl + "move_v2";
    let fetchPromise = await fetch(uri, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from_path: `${path}/${name}`, to_path: `${path}/${newName}` }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameFileSrc(${path},${name},${newName})`, await response.text());
  }

  async trashFileSrc(path, name, dir, file) {
    let url = this.filesUrl + "delete_v2";
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: `{"path":"${path}/${name}"}`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashFileSrc(${path},${name},...)`, await response.text());
  }
}

/**
class ODriveSrc (i.e. Microsoft OneDrive)
*/
class ODriveSrc extends CachedSrc {
  source = Score.sources.odrive;
  authUrl = "https:/\/login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
  clientId = "b81faf82-539b-4759-bcc9-8fdac6c7ceba";
  scopes = "files.readwrite.all";
  tokenUrl = "https:/\/login.microsoftonline.com/consumers/oauth2/v2.0/token";

  filesUrl = "https:/\/graph.microsoft.com/v1.0/me/drive/";

  constructor() {
    super();
  }

  putCache(path, data) {
    super.putCache(path, data);
    let cache = this.cache;
    for(let obj of data) {
      if (obj.folder) {
        let subPath = path + "/" + obj.name;
        cache[subPath] = {
          isDir: true,
          name: obj.name,
          id: obj.id,
          created: Date.parse(obj.createdDateTime),
          modified: Date.parse(obj.lastModifiedDateTime),
          ts: 0,
          dirs: {},
          files: {},
        };
        cache[path].dirs[obj.name] = cache[subPath];
      } else
        cache[path].files[obj.name] = {
          isDir: false,
          name: obj.name,
          id: obj.id,
          created: Date.parse(obj.createdDateTime),
          modified: Date.parse(obj.lastModifiedDateTime),
          size: obj.size,
        };
    };
    return cache[path];
  }

  async getDirSrc(path, dir) {
    await this.auth();
    let url = this.filesUrl + `${path == "" ? "root" : "items/" + dir.id}/children`;
    let fetchPromise = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "bearer " + this.token,
      },
    });
    let response = await fetchPromise;
    if (response.ok) return (await response.json()).value;
    err(`getDirSrc(${path},${dir}) failed: ${await response.text()}`);
  }

  async putDirSrc(path, name, srcDir) {
    await this.auth();
    let url = this.filesUrl + srcDir.id + "/children";
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putDirSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async renameDirSrc(path, name, newName, srcDir, srcSubDir) {
    let url = this.filesUrl + "items/" + srcSubDir.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: `{ name: "${newName}" }`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameDirSrc(${path},${name},${newName},...) failed: ${await response.text()}`);
  }

  async trashDirSrc(path, name, parentDir, dir) {
    let url = this.filesUrl + "items/" + dir.id;
    let fetchPromise = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + this.token,
      },
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashDirSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async getFileSrc(path, name, dir, file) {
    await this.auth();
    let url = this.filesUrl + "items/" + file.id + "/content";
    let fetchPromise = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + this.token,
      },
    });
    let response = await fetchPromise;
    if (response.ok) return await response.arrayBuffer();
    err(`getFileSrc(${path},${name},...) failed: ${await response.text}`);
  }

  async putFileSrc(path, name, data, dir, file) {
    await this.auth();
    let id = file?.id ? file.id : dir.id;
    let url = this.filesUrl + "items/" + id + ":/" + name + ":/createUploadSession";
    // get upload session url
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      // Doesn't seem to work if "item" is the only field defined. Onedrive API bug?
      body: JSON.stringify({"name": "${name}", "item":{"@microsoft.graph.conflictBehavior":"replace"}}),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putFileSrc(${path},${name},...)`, await response.text());
    let uploadUrl = (await response.json()).uploadUrl;
    let maxSliceLen = 5 * 1024 * 1024;
    let dataLen = data.byteLength;
    let remaining = dataLen;
    let sliceLen = Math.min(dataLen, maxSliceLen);

    for (let cursor = 0; remaining > 0; ) {
      let slice = new DataView(data.buffer, cursor, sliceLen);

      let fetchPromise = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Length": sliceLen,
          "Content-Range": `bytes ${cursor}-${cursor + sliceLen - 1}/${dataLen}`,
          "Content-Type": "application/pdf",
        },
        body: slice,
      });
      let response = await fetchPromise;
      if (!response.ok) err(`putFileSrc(${path},${name},...) failed: ${await response.text()}`);
      remaining -= sliceLen;
      cursor += sliceLen;
      sliceLen = Math.min(cursor + remaining, cursor + maxSliceLen);
    }
  }

  async renameFileSrc(path, name, newName, srcDir, srcFile) {
    await this.auth();
    let url = this.filesUrl + "items/" + srcFile.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.token,
        "Content-Type": "application/json",
      },
      body: `{ name: "${newName}" }`,
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameFileSrc(${path},${name},${newName},...) failed: ${await response.text()}`);
  }

  async trashFileSrc(path, name, dir, file) {
    let url = this.filesUrl + "items/" + file.id;
    let fetchPromise = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + this.token,
      },
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }
}

// The classes LocalFileView, FileListView, FileSystemView implement the gui elements displayed
// in the File panel's tabs:

/**
class LocalFileView:
   Since browser's give very limited access to the local file
   system, the LocalFileView is nothing more than a mechanism
   for involing the Browser's built in load/save file interface,
   including drag/drop.
**/
class LocalFileView {
  static css = css(
    "LocalFileView",
    `
    .Local {
      display:flex;
      flex-direction: column;
      align-items:center;
    }
    .Local__line {
      margin-top:2em ;
    }
  `
  );

  constructor(panel) {
    this.panel = panel;
    this.mode = panel.mode;
    this.source = Score.sources.local;
    this.src = FileSrc.get("Local");

    if (this.mode == "save") {
      this.elm = helm(`
        <div class="Local">
          <div class="Local__line"> ${iconSvg("Save", { style: "width:3em;height:3em;" })}</div>
          <div  class="Local__line"><b>Tap To Show Save File Picker</b></div>
        </div>`);
      listen(this.elm, "pointerup", async (e) => this.putFile());
      return;
    }

    // the input element's "accept" attribute is different for "copy" and "open" modes.
    let inputElm =  this.mode == "copy" ? 
       `<input type="file" data-tag="dialog" draggable="true" accept=".jpeg, .jpg, .JPG, image/jpeg, .png, image/png" style="visibility:hidden;"/>`:
       `<input type="file" data-tag="dialog" draggable="true" accept=".pdf, application/pdf" style="visibility:hidden;"/>` ;

    this.elm = helm(`
     <div data-tag="local" class="Local" >
        <input type="file" data-tag="dialog" draggable="true" accept=".pdf, application/pdf" style="visibility:hidden;"/>
        ${inputElm}
        <div class="Local__line"> ${iconSvg("Open", { style: "width:3em;height:3em;" })}</div>
        <div  class="Local__line"><b>Click to Show Open File Picker</b></div>
        <div class="Local__line">${_mobile_ ? "" : "<b>&mdash; or &mdash;<b>"}</div>
        <div class="Local__line">${_mobile_ ? "" : "<b>Drop Score File</b>"}</div>
     </div>`);

    Object.assign(this, dataIndex("tag", this.elm));

    listen(this.local, "dragover", (e) => e.preventDefault());

    listen(this.local, ["click", "drop", "change"], async (e) => {
      e.preventDefault();
      let file = null;
      switch (e.type) {
        case "click":
          this.dialog.showPicker();
          break;
        case "drop":
          file = e.dataTransfer.items[0].getAsFile();
          break;
        case "change":
          file = e.target.files[0];
          e.target.value = null; // required to be able to reload same file
          break;
      }
      if (file) {
        // visitUpdate is used as 2nd argument to Score.visit. In it, we set created: to 0,
        // because browser api doesn't give us a creation date on the file object
        let visitUpdate = { size: file.size, created: 0, modified: file.lastModified };
        if (this.mode == "bind") {
          await Score.activeScore.bindScore(await file.arrayBuffer());
          Score.visit(Score.activeScore, visitUpdate) ;
          toast("File opened");
        }
        else if (this.mode == "copy") {
          _menu_.setPasteObj(await bytesToBase64DataUrl(await file.arrayBuffer(), file.type), file.type) ;
          Score.visit({ source:Score.sources.local, name:file.name, path:"n/a"}, visitUpdate) ;
          toast("File opened");
        }
        else {
          if(await checkUnsaved()) {
            let score = await new Score().init(Score.sources.local, null, file.name, await file.arrayBuffer()) ;
            Score.visit(score, visitUpdate) ;
            toast("File opened");
          }
        }
        this.panel.hide();
      }
    });
  }

  async select() {}

  async putFile() {
    let score = Score.activeScore;
    _shade_.show("Saving file");
    try {
      score.source = Score.sources.local;
      let data = await score.toPdf();
      let { name, modified } = await this.src.putFile(score.path, score.name, data);
      score.update({ source: this.source, name: name, path: null });
      Score.visit(score, { size: data.length, modified: modified });
      score.setDirty(false) ;
      toast("File saved");
    } catch (error) {
      errDialog(error, error.stack, "Failed to save file to local storage");
    } finally {
      _shade_.hide();
      this.panel.hide();
    }
  }
}

/**
class FileListView
  A widget container that displays a scrolling list of subwidgets, where
  each subwidget corresponds to a single file in a filesystem.
  Each subwidget displays file metadata, plus buttons to manipulate
  that entry. It is used to display the "recently used" File panel's
  tab face, as well as the faces of the TabViews encapsulated by
  FileSystemView.
**/
class FileListView {
  static css = css(
    "FileListView",
    `
    Flv-fade-top {
      z-index: 1;
      position: absolute;
      top: 0px;
      display: block;
      width: 100%;
      height: .8em;
      background-image: linear-gradient(to top, transparent, #ddd);
    }
    Flv-fade-bottom {
      z-index: 1;
      position: absolute;
      bottom: 0;
      display: block;
      width: 100%;
      height: .8em;
      background-image: linear-gradient(to bottom, transparent, #bebebe 53%, #b4b4b4);
    }
    .Flv {
      position: absolute;
      height:100%;
      width:100%;
    }
    .Flv-list {
      position:relative;
      top:0px;
      display:flex;
      flex-flow:column;
    }
    .Flv-list__frame {
      position:relative;
      overflow:hidden;
      height: calc(100% - 6.5em) ;
    }
    .Fsv-list__frame {
      height: calc(100% - 10em) ;
    }
    .Flv-list__frame--save-mode {
      height: calc(100% - 16em) ; /* frame in save mode: allows room for FlvSave */
    }
    .Flv-list__item-selected {
      background: #eee !important ;
    }
    .Flv-list__file {
      width: calc(100% - 2em) ;
      font-size:1em;
      margin:.5em;
      padding:.5em;
      border-radius: var(--borderRadius);
    }
    .Flv-list__file-header {
      display:flex;
      align-items:center;
      column-gap:.5em;
    }
    .Flv-list__file-details {
      display:flex;
      justify-content: space-between;
      align-items:center;
    }
     .Flv-list__file-properties {
       font-size:.75em;
       color:grey;
       margin:.5em;
    }
    .Flv-path__sash {
      display: flex ;
      position:relative ;
      width: max-content;
      min-width: 100%;
      height: 3em;
      background-image: var(--panTexture);
      margin-top: .5em;
    }
    .Flv-path__sash-edge {
      top: .5em ;
      height: 10em ;
    }
    .Flv-path {
      position:relative ;
      width: max-content;
      left:0px ;
      display:flex;
      align-items:center;
      column-gap:.5em;
      font-size:1em;
      margin-left:1em;
    }
    .Flv-path__dir {
      display:flex;
      align-items:center;
      padding:.5em;
    }
    /* file name input element */
    .Flv-save__file
    { height: 2em;
      position: relative;
      width:100%;
      font-size:1.5em;
      border:none;
      border-radius:var(--borderRadius);
      text-align: center;
      padding: 0em 4em 0em 1em;
      margin:1em 2em 1em 2em;
      outline:none ;
    }
   }
  `
  );

  iconsByExtension = { ".pdf": "Pdf", ".png": "Png", ".jpg": "Jpg" };

  // list listener operation members:
  listOp = {
    deltaY: 0,
    didMove: false,
    elm: null, // i.e. currentTarget
    flingTimeout: null,
    lowerBounds: 0,
    moveListener: null,
    offsetY: null,
    schedule: new Schedule(),
    target: null,
    upListener: null,
  };

  elm = helm(`
      <div class="Flv">
        <div data-tag="flvList__frame" class="Flv-list__frame">
          <Flv-fade-top></Flv-fade-top>
          <div data-tag="flvList" class="Flv-list"></div>
          <Flv-fade-bottom></Flv-fade-bottom>
       </div>

    </div>`);

  constructor(panel) {
    this.panel = panel;
    this.mode = panel.mode;
    Object.assign(this, dataIndex("tag", this.elm));
    listen(this.flvList, "pointerdown", this.onListDown.bind(this));
  }

  // regex to parse off extension via extensionRegex.exec(fileName)[1]
  extensionRegex = /(?:\.([^.]+))?$/;

  // object that maps file extensions to mime types
  mimeTypes = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

  // This method determines if a given filename should be shown to the user
  // based on its extension.  The set of allowable extensions is determined
  // by this.mode: when this is "copy", image files ending in .jpeg,.jpg,.png
  // are accepted. Otherwise only files ending in .pdf are accepted. When
  // accepted, the extension (not including leading .) is returned, otherwise
  // null or undefined is returned.
  acceptExt(name) {
    let ext = this.extensionRegex.exec(name)[1];
    if (ext) {
      ext = ext.toLowerCase();
      let exts = this.mode == "copy" ? { jpeg: 1, jpg: 1, png: 1 } : { pdf: 1 };
      if (exts[ext]) return ext;
    }
    return null;
  }

  async checkExt(name, ext = ".pdf") {
    // ext should include the leading dot "."
    if (name.toLowerCase().endsWith(ext)) return name;
    return new Promise((accept, reject) => {
      dialog(`Add extension <i>.pdf</i> to <i>${name}<i> ?`, { Yes: { svg: "Pdf" }, No: { svg: "Not Pdf" }, Cancel: { svg: "Cancel" } }, async (e, prop, tag, args) => {
        args.close();
        if (tag == "Yes") accept(name + ext);
        if (tag == "No") accept(name);
        accept(null);
      });
    });
  }

  select() {
    clearChildren(this.flvList);
    JSON.parse(window.localStorage.getItem("recent") || "[]").forEach(async (obj, index) => {
      if (this.acceptExt(obj.name)) this.flvList.append(await this.makeFileElm(obj));
    });
  }

  refresh() {}

  enterDialog = (tag, dialog) => {
    // Takes a dialog assumed to contain a pod-input element with a data-tag set to "input".
    // Listens for an keypup on "Enter" and, if found, calls fire() on the buttonsElm associated
    // with the given tag.  Since there is no convenient way to unlisten the listener, we
    // just let garbage collection do its work.
    let input = dataIndex("tag", dialog).input;
    let listener = listen(input, "keyup", (e) => {
      if (e.key == "Enter") dialog.buttonsElm.self.fire(tag);
    });
  };

  async makeFileElm(properties) {
    let name = properties.name;
    let path = properties.path;
    let isDir = properties.isDir ?? false;
    let source = properties.source || FileSrc.get(this.src) || "?";
    let size = properties.size || null;
    let created = properties.created ? new Date(properties.created).toLocaleString() : null;
    let modified = properties.modified ? new Date(properties.modified).toLocaleString() : null;
    let iconName = isDir ? "Folder" : this.iconsByExtension[name.slice(name.lastIndexOf("."))];
    let color = this.colorFromText(name);
    let elm = helm(`
       <div ${isDir ? "data-dir='true'":""} data-name="${name}" data-path="${path}" data-source="${source}" class="Flv-list__file">
         <div class="Flv-list__file-header">
           ${iconSvg(iconName, {style: "width:3.5em;height:2.5em" })}
           ${name}
         </div>
         <div class="Flv-list__file-details">
           <div class="Flv-list__file-properties">
             Source: ${source}<br>
             ${source == "Local" ? "" : "Path: " + (path || "/") + "<br>"}
             ${size ? "Size: "+ Number(size).toLocaleString() + "<br>" : ""}
             ${created ? "Created: "+ created + "<br>" : ""}
             ${modified ? "Modified: "+ modified + "<br>" : ""}
           </div>
           <div>
             ${source == "Local" ? "" : iconSvg("Pencil", {tag: "rename", style: "width:2.75em;padding:.5em;"})}
             ${source == "Local" ? "" :iconSvg("Trash", {tag: "trash", style: "width:3em;padding:.5em;"})} </div>
           </div>
       </div>`);
    elm.style.background = color;
    return elm;
  }

  colorFromText(text) {
    // Return a css background from given text using
    // a hash, and using an alpha value of 2 so the color is subtle.
    let hex = strToHash(text).toString(16);
    return "#" + hex.substring(0, 3) + "2";
  }

  onListDown(e) {
    let elm = this.flvList;
    elm.style.transition = "unset";
    let origin = elm.offsetTop;
    let minTop = this.flvList__frame.offsetHeight - elm.offsetHeight;
    if (this.panel.mode == "save") minTop -= this.fsvSave.offsetHeight;
    elm.setPointerCapture(e.pointerId);
    e.mv1 = e.mv0 = e;

    let mv = listen(elm, "pointermove", (emv) => {
      if (mvmt(e, emv)) elm.style.top = clamp(origin + emv.clientY - e.clientY, minTop, 0) + "px";
      e.mv1 = e.mv0;
      e.mv0 = emv;
    });

    listen(
      elm,
      "pointerup",
      async (eup) => {
        unlisten(mv);
        if (mvmt(e, eup)) {
          elm.style.transition = "1s top ease-out";
          let speed = (e.mv0.clientY - e.mv1.clientY) / Math.max(eup.timeStamp - e.mv0.timeStamp, e.mv0.timeStamp - e.mv1.timeStamp);
          return (elm.style.top = clamp(elm.offsetTop + speed * 500, minTop, 0) + "px");
        }
        let fileElm = e.target.closest(".Flv-list__file");
        if (!fileElm) return;
        fileElm.classList.add("Flv-list__item-selected");
        let { source, name, path, dir } = fileElm.dataset;
        let tag = e.target.dataset.tag;
        if (tag == "trash") dir ? this.trashDir(path, name) : this.trashFile(source, path, name);
        else if (tag == "rename") dir ? await this.renameDir(path, name) : await this.renameFile(source, path, name);
        else if (dir) await this.getDir(path, name);
        else if (this.panel.mode == "save") this.fsvSave__file.value = name;
        else await this.getFile(source, path, name);
        fileElm.classList.remove("Flv-list__item-selected");
      },
      { once: true }
    );
  }

  async getFile(source, requestedPath, requestedName) {
    if(!await checkUnsaved())
      return ;
    _shade_.show("Downloading file");
    return new Promise(async (accept, reject) => {
      try {
        let src = FileSrc.get(source);
        let { path, name, data, size, created, modified } = await src.getFile(requestedPath, requestedName);
        let visitUpdate = { path, size, created, modified };
        ///
        if (this.mode == "bind") {
          await Score.activeScore.bindScore(data);
          Score.visit(Score.activeScore, visitUpdate);
        } else if (this.panel.mode == "copy") {
          /// rem grd copy
          let ext = this.acceptExt(requestedName);
          if (ext) {
            _menu_.setPasteObj(await bytesToBase64DataUrl(data, this.mimeTypes[ext]), this.mimeTypes[ext]);
            Score.visit({ source, name, path }, visitUpdate);
          }
        } else {
          let score = await new Score().init(source, path, name, data);
          Score.visit(score, visitUpdate);
        }
        toast("File downloaded");
      } catch (error) {
        errDialog(error, error.stack, "Error: failed to download file from cloud server.");
      } finally {
        _shade_.hide();
        this.panel.hide();
        accept();
      }
    });
  }

  async renameFile(source, path, name) {
    _shade_.show("Renaming file");
    return new Promise((accept, reject) => {
      let dialogElm = dialog(
        `Confirm. Rename File:<br><br>
            <i>${name}</i><br>
              <br>To:<br>
        <input is="pod-input" type=text class="dialog__textInput" data-tag="input" value="${name}"></input>
       <hr>`,
        { Rename: { svg: "Pencil" }, Cancel: { svg: "Cancel" } },
        async (e, prop, tag, args) => {
          try {
            if (tag == "Cancel") return args.close();
            let input = dataIndex("tag", args.elm).input;
            let newName = input.value;
            if (newName.length == 0) return dialog("Error: 0-length filename.");
            newName = await this.checkExt(newName);
            if (!newName) return;
            if (newName == name) return dialog("Name unchanged.");
            args.close();
            let src = FileSrc.get(source);
            await src.renameFile(path, name, newName);
            // If we're renaming from a FileSystemView, call setPath.  But if we're renaming from
            // the Recent tab, "this" is a fileListView, and there is no setPath function...in this
            // case, invalidate any entry for the path in  src's cache.
            let cached = null;
            if (this.setPath) {
              await this.setPath(path, true);
              cached = src.cache[path];
              Score.visit({ source, path, name, size: cached.size, created: cached.created, modified: cached.modified }, { name: newName });
            } else if (src.cache && src.cache[path]) {
              let cached = src.cache[path];
              Score.visit({ source, path, name, size: cached.size, created: cached.created, modified: cached.modified }, { name: newName });
              src.cache[path.ts] = 0; // invalidate path, forcing refresh on next fetch
              this.select();
            }
            toast("File renamed");
          } catch (error) {
            errDialog(error, error.stack, "Error: failed to rename file on cloud server.");
          } finally {
            _shade_.hide();
            accept();
          }
        }
      );
      let input = dataIndex("tag", dialogElm).input;
      listen(input, "keyup", (e) => {
        if (e.key == "Enter") dialogElm.buttonsElm.self.fire("Rename");
      });
    });
  }

  async trashFile(source, path, name) {
    _shade_.show("Trashing file");

    return new Promise((accept, reject) => {
      dialog(`Confirm. Trash File:<br><br><i>${name}</i><hr>`, { Trash: { svg: "Trash" }, Cancel: { svg: "Close" } }, async (e, prop, tag, args) => {
        try {
          args.close();
          if (tag == "Cancel") return;
          let src = FileSrc.get(source);
          await src.trashFile(path, name);
          Score.visit({ source, path, name });
          if (this.setPath) await this.setPath(path, true);
          else this.select();
          toast("File trashed");
        } catch (error) {
          errDialog(error, error.stack, "Error: failed to trash file on cloud server.");
        } finally {
          _shade_.hide();
          accept();
        }
      });
    });
  }
}

/**
class FileSystemView
  Subclass of FileListView that adds a widget and functionality
  for managing a hierarchial file system and, when functioning
  in "save mode", for editing the file's name.
**/

class FileSystemView extends FileListView {
  src = null;
  isSave = false;
  path = "";
  posForPath = {};
  // path listener operation members:
  pathOp = {
    elm: null, // i.e. currentTarget
    target: null,
    moveListener: null,
    upListener: null,
    offsetX: null,
    deltaX: 0,
    didMove: false,
    leftBounds: 0,
  };

  elm = helm(`
      <div data-tag="fsv" class="Flv">
         <![CDATA[currently selected file path, left-to-right]]>
         <div data-tag="fsvPath" class="Flv-path__sash"></div>
         <div class="Flv-path__sash-edge fadeLeft"></div>
         <div class="Flv-path__sash-edge fadeRight"></div>
  
         <![CDATA[text input for save filename (plus button), void for save panel]]>
         <div data-tag="fsvSave" class="void" style="display:flex;width:100%";justify-content:center>
           <input is="pod-input" type="text" data-tag="fsvSave__file" class="Flv-save__file"/>
           <div data-tag="uploadButton"></div>
         </div>

         <![CDATA[list of files, top-to-bottom]]>
         <div data-tag="flvList__frame" class="Flv-list__frame Fsv-list__frame">
           <Flv-fade-top></Flv-fade-top>
           <div data-tag="flvList" class="Flv-list"></div>
           <Flv-fade-bottom></Flv-fade-bottom>
         </div>
  
      </div>`);
  constructor(source, src, panel) {
    super(panel);
    this.source = source;
    this.src = src;
    Object.assign(this, dataIndex("tag", this.elm));
    listen(this.flvList, "pointerdown", this.onListDown.bind(this));
    listen(this.fsvPath, "pointerdown", this.onPathDown.bind(this));
    listen(this.fsvSave__file, "change", async () => await this.putFile(this.fsvSave__file.value));
  }

  select(tabView, tab) {
    if (this.panel.mode == "save") {
      if (!Score.activeScore) return;
      this.fsvSave.classList.remove("void");
      this.flvList__frame.classList.add("Flv-list__frame--save-mode");
      this.fsvSave__file.value = Score.activeScore.name;
      let uploadButton = new ButtonGroup({}, { Upload: { svg: "Upload" } }, async () => await this.putFile(this.fsvSave__file.value));
      uploadButton.elm.style = "position:absolute;right:4em;top:4.5em;";
      this.uploadButton.replaceWith(uploadButton.elm);
    } else {
      this.fsvSave.classList.add("void");
      this.flvList__frame.classList.remove("Flv-list__frame--save-mode");
    }
    this.setPath(this.path ||
       Score.activeScore?.source == this.source ?
         Score.activeScore?.path : "", true, true);
  }

  populateFsvPath() {
    let elm = this.fsvPath;
    clearChildren(elm);
    let dirs = this.path.split("/");
    let dirElm = null;
    let path = "";
    dirs.forEach((dir) => {
      let icon = "Folder";
      let background = this.colorFromText(dir);
      if (dir == "") {
        // The root directory is represented by a src icon and name:
        background = "#fff0";
        dir = icon = this.source;
      } else path = path + "/" + dir;

      dirElm = helm(
        `<div dir-source="${this.source}" data-path="${path}" style="background:${background}"{ class="Flv-path__dir">
         ${iconSvg(icon, { style: "width:1.5em;" })}&nbsp${dir}&nbsp/</div>`
      );
      elm.append(dirElm);
    });

    // We could restrict "add directory" botton to save mode via "if (this.panel.mode == "save")",
    // but currently leaving it available for all modes
    if (true)
      // Add an entry that serves as "add directory" button
      elm.append(
        helm(
          `<div data-tag="newDir" data-path="${path}" data-source="${this.source}" class="Flv-path__dir">
         ${iconSvg("New Folder", { style: "pointer-events:none;width:2em;padding-left:3em;" })}&nbspNew</div>`
        )
      );

    elm.style.left = Math.min(getBox(elm.parentElement).width - getBox(elm).width, 0) + "px";
  }

  onPathDown(e) {
    let elm = this.fsvPath ;
    let origin = elm.offsetLeft ;
    let minLeft = this.fsv.offsetWidth - elm.offsetWidth ;
    elm.setPointerCapture(e.pointerId);

    let mv = listen(elm, "pointermove", (emv) => {
      if(mvmt(e,emv)) elm.style.left = clamp(origin + emv.clientX - e.clientX, minLeft, 0) + "px" ;
    });

    listen(elm, "pointerup", async (eup) => {
      unlisten(mv) ;
      if (!mvmt(e,eup)) {
        if(e.target.dataset.tag == "newDir") return await this.putDir(this.path);
        let target = e.target.closest(".Flv-path__dir");
        if (target) this.setPath(target.dataset.path);
      }
    },
    { once: true });
  }

  async getDir(path, name) {
    this.posForPath[this.path] = this.flvList.style.top;
    this.path += "/" + name;
    await this.setPath(this.path, false, true);
  }

  async putDir(path) {
    _shade_.show("Creating folder");
    return new Promise((accept, reject) => {
      this.enterDialog(
        "Create",
        dialog(
          `Confirm. Create New Folder:<br><br>
        <input is="pod-input" type=text class="dialog__textInput" data-tag="input" value="unnamed"></input><hr>`,
          { Create: { svg: "New Folder" }, Cancel: { svg: "Close" } },
          (e, prop, tag, args) => {
            args.close();
            if (tag == "Cancel") return _shade_.hide();

            delay(1, async () => {
              try {
                let name = dataIndex("tag", args.elm).input.value;
                if (name.length == 0) return dialog("Error: 0-length folder name."); // ?? other syntax checks?
                await this.src.putDir(path, name);
                await this.setPath(path + "/" + name, true);
                toast("Folder created");
              } catch (error) {
                errDialog(error, error.stack, "Error: failed to create folder on cloud server.");
              } finally {
                _shade_.hide();
                accept();
              }
            });
          }
        )
      );
    });
  }

  async renameDir(path, name) {
    _shade_.show("Renaming folder");
    return new Promise((accept, reject) => {
      let dialogElm = dialog(
        `Confirm. Rename Folder:<br><br>
            <i>${name}</i><br>
              <br>To:<br>
        <input is="pod-input" type=text class="dialog__textInput" data-tag="input" value="${name}"></input>
       <hr>`,
        { Rename: { svg: "Pencil" }, Cancel: { svg: "Cancel" } },
        async (e, prop, tag, args) => {
          try {
            if (tag == "Cancel") return args.close();
            let input = dataIndex("tag", args.elm).input;
            _shade_.show();
            let newName = input.value;
            if (newName.length == 0) return dialog("Error: 0-length folder name."); // ?? other syntax checks?
            if (newName == name) return dialog("Folder name unchanged.");
            args.close();

            await this.src.renameDir(path, name, newName);
            await this.setPath(path, true);
            Score.visit({ source: this.source }, null, this.path);
            this.setPath(path, true);
          } catch (error) {
            errDialog(error, error.stack, "Error: failed to rename folder on cloud server.");
          } finally {
            _shade_.hide();
            return accept();
          }
        }
      );

      let input = dataIndex("tag", dialogElm).input;
      listen(input, "keyup", (e) => {
        if (e.key == "Enter") dialogElm.buttonsElm.self.fire("Rename");
      });
    });
  }

  async trashDir(path, name) {
    _shade_.show("Trashing folder");
    return new Promise((accept, reject) => {
      dialog(`Confirm. Trash Folder:<br><br><i>${name}</i><hr>`, { Trash: { svg: "Trash" }, Cancel: { svg: "Close" } }, async (e, prop, tag, args) => {
        try {
          args.close();
          if (tag == "Cancel") return;
          _shade_.show("Trashing folder");
          await this.src.trashDir(path, name);
          await this.setPath(path, true);
          toast("Folder trashed");
        } catch (error) {
          errDialog(error, error.stack, "Error: Failed to trash folder on cloud server.");
        } finally {
          _shade_.hide();
          accept();
        }
      });
    });
  }

  async putFile() {
    let name = this.fsvSave__file.value;
    name = await this.checkExt(name);
    if (!name) return;
    try {
      _shade_.show("Checking path");
      let listing = await this.src.getDir(this.path, true);
      if (listing.files[name])
        await new Promise((accept, reject) =>
          dialog(`Confirm. Replace <i>${name}</i> ?`, { Replace: { svg: "Replace" }, Cancel: { svg: "Cancel" } }, async (e, prop, tag, args) => {
            args.close();
            if (tag == "Cancel") reject(new Error("", { cause: "cancelled" }));
            accept();
          })
        );
      _shade_.show("Uploading file");
      let score = Score.activeScore;
      let data = await Score.activeScore.toPdf();
      await this.src.putFile(this.path, name, data);
      score.update({ source: this.source, name: name, path: this.path });
      Score.visit(score, { size: data.length, modified: Date.now() });
      score.setDirty(false) ;
      await this.setPath(this.path, true);

      toast("File uploaded");
    } catch (error) {
      errDialog(error, error.stack, "Error: failed to upload file to cloud server.<br>Details in Console.");
    } finally {
      _shade_.hide();
      this.panel.hide();
    }
  }

  async setPath(path, force = false, dismissAlert = false) {
    if (this.source == "Local") return; // no path for Local files.
    _shade_.show("Reading folder");
    return new Promise(async (accept, reject) => {
      try {
        this.path = path;
        let listing = await this.src.getDir(path, force);
        this.populateFsvPath();
        clearChildren(this.flvList);
        for (let properties of Object.values(listing.files)) {
          // create entry for filename iff its extension indicates
          // it is appropriate for the given "this.mode" for this panel
          if (this.acceptExt(properties.name)) {
            properties.path = path;
            this.flvList.append(await this.makeFileElm(properties));
          }
        }
        for (const properties of Object.values(listing.dirs)) {
          properties.path = path;
          this.flvList.append(await this.makeFileElm(properties));
        }
        if (path in this.posForPath) this.flvList.style.top = this.posForPath[path];
        else this.flvList.style.top = "0px";
      } catch (error) {
        errDialog(error, error.stack, "Error: Failed to read folder from cloud server.<br>Details in Console.");
      } finally {
        // Most, but not all, calls to setPath are embedded in another operation which will dismiss the alert...
        // if such a call is in progress, don't want to dismiss the alert.
        //        if (dismissAlert) _shade_.hide(); // rem grd: seems screwed up
        _shade_.hide();
        return accept();
      }
    });
  }
}
