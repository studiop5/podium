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

export { checkUnsaved, escapeHtml, FileSrc, FileListView, FileSystemView, LocalFileView };
import { css, ButtonGroup, clamp, clearChildren, dataIndex, delay, Drag, getBox, helm, iconSvg, listen, dialog, Schedule, strToHash, toast, unlisten } from "./common.js";
import { Score } from "./score.js";
import { panels } from "./panel.js";
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
  console.warn(`**** Podium FileSrc error in call: ${call}`, msg);
  console.trace();
  throw new Error(msg, { cause: "fileSrc" });
};

let errDialog = (error, msg) => {
  // Craft an error dialog, given an exception variable and a msg.
  if (error.name == "AbortError") return; // thrown when browser's open/save panels are cancelled
  else if (error.cause == "cancelled") return toast("Cancelled");
  else if (error.cause == "timeout") dialog("Timed out waiting for authentication");
  else if (error.cause == "security") dialog(`<em>Security Error</em><br><br><strong>${error.message}</strong>`);
  else if (error.cause == "fileSrc") dialog(`<em>${msg}</em><br><br><strong>${error.message}</strong>`);
  else {
    console.error(`*** Unexpected Podium Error:`, error);
    dialog(`<em>Unexpected Error</em><br><br><strong>${msg}</strong><br><br>Details in console.`);
  }
};


let checkUnsaved = async (msg = "Warning: current score has unsaved changes. Open anyway?", close = false) => {
  // Display a confirm dialog if there is a dirty _score_ that would be overriden
  // without saving by opening a new Score. Return promise that resolves to true iff user clicks "Open".
  // When close if true, "Open" is replaced with "Close".
  return new Promise(async (accept, reject) => {
    if(_score_ && _score_.dirty) {
      dialog(msg,
        close ?  { Close: { svg: "Close"}, Cancel: { svg: "Cancel" } }:
                 { Open: { svg: "Open" }, Cancel: { svg: "Cancel" } },
        (e, prop, tag, args) => {
          args.close();
          accept(tag == "Open" || tag == "Close");
        }
      )}
    else accept(true);
  })
}



let checkFileSize = async (name, size) => {
  let mem = navigator.deviceMemory; // GB, Chrome/Edge only
  let cores = navigator.hardwareConcurrency || 4;
  let MAX_FILE_SIZE = (mem >= 8 || (!mem && cores >= 8)) ? 120 : 40;
  MAX_FILE_SIZE *= 1024 * 1024;
  checkPath(name);
  if (size == 0)
    throw new Error('File is empty', { cause: "security" });
  if (size > MAX_FILE_SIZE) {
    return new Promise((resolve, reject) => {
        dialog(
          `Large File Warning<br><br>
           File: <i>${escapeHtml(name)}</i><br>
           Size: <strong>${(size / 1024 / 1024).toFixed(1)}MB</strong><br><br>
           This file exceeds the recommended size limit of ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB.<br>
           Loading will work, but saving may be slow or fail on large files.<br><br>
           Continue anyway?`,
          { Continue: { svg: "Open" }, Cancel: { svg: "Cancel" } },
          (e, prop, tag, args) => {
            args.close();
            if (tag == "Continue") {
              resolve();
            } else {
              reject(new Error("File loading cancelled by user", { cause: "cancelled" }));
            }
          }
        );
      });
  }
};


let checkPath = (...args) => {
  for(let arg of args)
    if(arg && (arg.includes('../') || arg.includes('..\\') || arg.includes('\0')))
      throw new Error('Invalid path', { cause: 'security' });
}


let escapeHtml = (str) => {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;') //" <- keep double quotes balanced for build.py
    .replace(/'/g, '&#x27;'); 
}

let getPlainChallenge = (bytes = 32) => {
  // generate cryptograpically secure array of random bytes for use in oauth2 PKCE flow
  let randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
};



/**
class FileSrc
  The Scores panel allows scores to be opened/saved from either the
  local file system, or from one of several commercial cloud-based
  file systems implementing hierarchical (tree-structured) file
  storage systems. Data from each cloud-based system is manipulated
  through a corresponding "Src" class that makes calls on that
  system's native api. Currently, Google Drive, Dropbox, and Microsoft
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
**/

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
      if (ref == Score.sources.local) src = new LocalSrc();
      else if (ref == Score.sources.gdrive) src = new GDriveSrc();
      else if (ref == Score.sources.dbx) src = new DbxSrc();
      else if (ref == Score.sources.odrive) src = new ODriveSrc();
      else if (ref == Score.sources.url) src = new UrlSrc();
      FileSrc.refs.set(ref, src); // ref -> src
      FileSrc.refs.set(src, ref); // src -> ref
      return src;
  }

  static async openActiveScore(cell) {
    let score = _score_;
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
          let data, size, created, modified;
          if (score.fileHandle) {
            let file = await score.fileHandle.getFile();
            data = await file.arrayBuffer();
            size = data.byteLength;
            modified = file.lastModified;
          } else {
            ({ data, size, created, modified } = await src.getFile(score.path, score.name));
          }
          let fileHandle = score.fileHandle;
          score = await new Score().init(score.source, score.path, score.name, data);
          if (fileHandle) score.fileHandle = fileHandle;
          Score.visit(score, { size, created, modified });
          toast("File reverted.");
        } catch (error) {
          if (!error.handled) errDialog(error, "Error: failed to download file from cloud server.<br>Details in Console.");
        } finally {
          _shade_.hide();
          accept();
        }
      });
    });
  }

  static async saveActiveScore(cell) {
    let score = _score_;
    let src = FileSrc.get(score.source);
    // If no source, or source doesn't support saving (like URL/WWW), show the save panel
    if (!src || typeof src.putFile != 'function') {
      let panel = panels[cell.name + "Panel"].get(cell);
      if (panel.elm.style.visibility != "visible") {
        panel.show();
        panel.setPosition(_menu_.grip);
      }
      return;
    }

    // For local files, reuse the file handle from open (if available) for instant save.
    // Otherwise, get a new handle via file picker while still in user gesture.
    let handle = score.fileHandle || null;
    if (!handle && src instanceof LocalSrc && src.getFileHandle) {
      try {
        handle = await src.getFileHandle(score.name);
        score.fileHandle = handle; // remember for next save
      } catch (error) {
        if (error.name == 'AbortError') return; // User cancelled
        throw error;
      }
    }

    _shade_.show("Saving file");
    // Unlike openActiveScore (i.e. revert), we do not prompt user
    // to save: this seems like a more natural ui experience.
    return new Promise(async (accept, reject) => {
      try {
        let data = await score.toPdf();
        await src.putFile(score.path, score.name, data, handle);
        Score.visit(score, { size: data.length, modified: Date.now() });
        score.setDirty(false);
        toast("File saved.");
      } catch (error) {
        if (error.name !== 'AbortError') {
          errDialog(error, "Error: failed to save file.<br>Details in Console.");
        }
      } finally {
        _shade_.hide();
        accept();
      }
    });
  }
}

class LocalSrc extends FileSrc {
  source = Score.sources.local;

  async getFile(path, name, mode) {
    if (window.showOpenFilePicker) {
      let types = mode == "copy"
        ? [{ description: "Image Files", accept: { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] } }]
        : [{ description: "PDF Files", accept: { "application/pdf": [".pdf"] } }];
      let [handle] = await showOpenFilePicker({ types });
      let file = await handle.getFile();
      await checkFileSize(file.name, file.size);
      let data = await file.arrayBuffer();
      return { path: null, name: file.name, data: data, created: null, modified: file.lastModified, size: data.byteLength, fileHandle: handle };
    }
    return new Promise((accept, reject) => {
      let input = helm('<input type="file" style="display:hidden;"></input>');
      input.accept = mode == "copy" ? "image/jpeg, image/png" : ".pdf, application/pdf";
      _body_.append(input);
      listen(
        input,
        ["change", "cancel"],
        async (e) => {
          input.remove();
          if (e.type == "cancel") return reject(new Error("", { cause: "cancelled" }));
          let file = e.target.files[0];
          try {
            await checkFileSize(file.name, file.size);
          }
          catch (error) {
            return reject(error);
          }
          let data = await file.arrayBuffer();
          return accept({ path: null, name: file.name, data: data, created: null, modified: file.lastModified, size: data.byteLength });
        },
        { once: true }
      );
      input.click();
    });
  }

  async putFile(path, name, data, handle = null) {
    if (window.showSaveFilePicker) {
      // Use "experimental" file system access api, if supported:
      if (!handle) {
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
        handle = await showSaveFilePicker(options);
      }
      const writeable = await handle.createWritable();
      await writeable.write(data);
      await writeable.close();
      let file = await handle.getFile();
      return { name: file.name, modified: file.lastModified };
    } else {
      // Try Web Share API first (works on iOS with "Save to Files" option)
      let file = new File([data], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return { name: name, modified: Date.now() };
        } catch (e) {
          if (e.name == 'AbortError') throw e; // User cancelled
          // Fall through to download approach
        }
      }
      // Fallback: download approach (Android Chrome, Firefox)
      let blob = new Blob([data], { type: 'application/pdf' });
      let url = URL.createObjectURL(blob);
      let link = document.createElement('a');
      link.download = name;
      link.href = url;
      link.target = '_self';
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      return { name: name, modified: Date.now() };
    }
  }

  async getFileHandle(name) {
    // Get a file handle immediately (during user gesture) for later writing
    if (!window.showSaveFilePicker) return null;
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
    return await showSaveFilePicker(options);
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
    extraAuthParams = ""; // sublcasses redefine

    getQuery(url, key) {
        // Returns a query key's value from a url, or null if not found.
        // Always include the "=" in the key. Avoids more code complexity
        // by assuming the key is *not* part of the url's address.
        let i = url.indexOf(key);
        if (i == -1) return null;
        let value = url.substring(i + key.length);
        i = value.indexOf("&");
        value = i == -1 ? value : value.substring(0, i);
        try { return decodeURIComponent(value); } catch(e) { return value; }
    }

    /**
       authenticate using oauth2 PKCE flow
    **/

    clientId = null; // subclass defined
    scopes = null; // subclass defined
    authUrl = null; // subclass defined
    tokenUrl = null; // subclass defined

    redirectUri = `${location.origin}/podauth.html`;
    tokens = null;
    refreshExpiry = 90 * 24 * 60 * 60; // default refresh token expiry in seconds
    authTimeout = 180; // max time in seconds for user to complete authorization

    authPopupOpen(url) {
        // create, open, and return a centered popup window for authentication
        let h = Math.min(screen.height, 1000);
        let w = Math.min(screen.width, 750);
        let x = top.outerWidth / 2 + top.screenX - w / 2;
        let y = top.outerHeight / 2 + top.screenY - h / 2;
        let popup = open(url, "", `popup,height=${h},width=${w},top=${y},left=${x}`);
        // The authPopup often gets hidden behind the main browser window..keep it focused and in front
        let focusInterval = setInterval(() => {
            if (popup && !popup.closed) popup.focus();
            else clearInterval(focusInterval);
        }, 500); 
        return popup;
    }

    // This is called after oauth authentication has run
    authPopupClose(popup) {
        _shade_.pop();
        popup.close();
    }

    async auth() {
        // Run the oauth 2 PKCE flow to get an authentication token

        let refreshAccessToken = async () => {
            const params = new URLSearchParams();
            params.append('client_id', this.clientId);
            params.append('refresh_token', this.tokens.refresh_token);
            params.append('grant_type', 'refresh_token');

            let response = await fetch(this.tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params.toString(),
            });

            if (response.ok) {
                let now = performance.now() / 1000;
                const newTokens = await response.json();

                if (!newTokens.refresh_token) {
                    newTokens.refresh_token = this.tokens.refresh_token;
                    newTokens.refresh_expiry = this.tokens.refresh_expiry;
                } else {
                    newTokens.refresh_expiry = now + (newTokens.refresh_token_expires_in || this.refreshExpiry);
                }
                this.tokens = newTokens;
                this.tokens.expiry = now + this.tokens.expires_in;
            } else {
                throw new Error(await response.text());
            }
        }

        // Sync check: if access token is still valid, nothing to do
        if(this.tokens) {
            let now = performance.now() / 1000;
            if(this.tokens.expiry > now) return Promise.resolve();
        }

        // Detect extension context (uses launchWebAuthFlow, not window.open)
        let isExtension = window.chrome && chrome.identity && chrome.runtime?.id;

        // Non-extension only: open popup NOW before any awaits.
        // iOS Safari requires window.open() to be called with transient activation
        // (synchronously from a user event); any await beforehand will block it.
        let popup = isExtension ? null : this.authPopupOpen('about:blank');

        // Try refresh token if available; close popup if it succeeds
        if(this.tokens?.refresh_token) {
            let now = performance.now() / 1000;
            if(this.tokens.refresh_expiry > now) {
                try {
                    await refreshAccessToken();
                    popup?.close();
                    return Promise.resolve();
                } catch(error) {
                    console.warn("Token refresh failed, using full auth.");
                }
            }
        }

        // function to create a code challenge
        let base64UrlEncode = (str) =>
            btoa(String.fromCharCode.apply(null, new Uint8Array(str)))
            .replace(/\+/g, "-")
            .replaceAll("/", "_")
            .replace(/=+$/, "");
        let plainChallenge = getPlainChallenge();
        let challenge = base64UrlEncode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plainChallenge)));
        let state = getPlainChallenge();
        let timeout = (performance.now() / 1000) + this.authTimeout;

        _shade_.show("Authorizing");
        let fullUrl = `${this.authUrl}?client_id=${this.clientId}&scope=${encodeURIComponent(this.scopes)}&response_type=code&redirect_uri=${encodeURIComponent(this.redirectUri)}&code_challenge_method=S256&code_challenge=${challenge}&state=${state}${this.extraAuthParams}`;
        if (popup) popup.location.href = fullUrl;

        // Return a promise...it runs the "oauth2 PKCE flow for single page web apps":
        return new Promise((resolve, reject) => {
            // exchange code for tokens
            let exchange = async (code, redirectUri) => {
                const params = new URLSearchParams();
                params.append('client_id', this.clientId);
                params.append('redirect_uri', redirectUri);
                params.append('code', code);
                params.append('code_verifier', plainChallenge);
                params.append('grant_type', 'authorization_code');

                let response = await fetch(this.tokenUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: params.toString(),
                });

                if (response.ok) return await response.json();
                else {
                    throw new Error(await response.text());
                }
            };

            // Extension-specific authentication using launchWebAuthFlow
            if (isExtension) {
                const extRedirectUri = chrome.identity.getRedirectURL();
                const extFullUrl = fullUrl.replace(encodeURIComponent(this.redirectUri), encodeURIComponent(extRedirectUri));

                chrome.identity.launchWebAuthFlow({ url: extFullUrl, interactive: true }, async (responseUrl) => {
                    _shade_.pop();
                    if (chrome.runtime.lastError || !responseUrl) {
                        return reject(new Error(chrome.runtime.lastError?.message || "Authentication failed or was cancelled.", { cause: "cancelled" }));
                    }
                    try {
                        const url = new URL(responseUrl);
                        const code = url.searchParams.get("code");
                        const respState = url.searchParams.get("state");
                        if (respState != state) throw new Error("CSRF attempt blocked.");

                        this.tokens = await exchange(code, extRedirectUri);

                        let now = performance.now() / 1000;
                        this.tokens.expiry = now + this.tokens.expires_in;
                        if(this.tokens.refresh_token)
                            this.tokens.refresh_expiry = now  + (this.tokens.refresh_token_expires_in || this.refreshExpiry);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
                return;
            }

            // poll for code
            let exchanging = false; // guard against concurrent exchange attempts
            let poll = async () => {
                try {
                    if (popup.closed) throw new Error("Authentication aborted", { cause: "cancelled" });
                    let href = popup.location.href;
                    let error = this.getQuery(href, "error=");
                    if (error) {
                        let errorMsg = this.getQuery(href, "error_description=") || error;
                        throw new Error(`Authentication failed: ${decodeURIComponent(errorMsg).replace(/\+/g, " ")}`);
                    }
                    let code = this.getQuery(href, "code=");
                    if (code) {
                        if (exchanging) return; // another poll already handling this code
                        exchanging = true;
                        if(this.getQuery(href, "state=") != state)
                            throw new Error("Possible <i>Cross Site Request Forgery</i> attempt blocked.", {cause:"security"});
                        this.tokens = await exchange(code, this.redirectUri);
                        let now = performance.now() / 1000;
                        this.tokens.expiry = now + this.tokens.expires_in;
                        if(this.tokens.refresh_token) 
                            this.tokens.refresh_expiry = now  + (this.tokens.refresh_token_expires_in || this.refreshExpiry);
                        this.authPopupClose(popup);
                        return resolve();
                    }
                } catch (e) {
                    if (e.name != "SecurityError") {
                        this.authPopupClose(popup);
                        return reject(e);
                    }
                }
                if ((performance.now() / 1000) > timeout) {
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
                let entry = cache[path] || {};
                for (let key of Object.keys(entry.dirs)) purgeCache(path + "/" + key);
                delete cache[path];
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
        checkPath(path);
        await this.auth();
        let dir;
        if (this.cache.hasOwnProperty(path)) {
            dir = this.cache[path];
            if (!force && Date.now() - dir.ts <= this.maxCacheAge) return dir;
            if (dir.name == "") return this.putCache(path, await this.getDirSrc(path, dir));
        }
        // load path after recursively loading its parent dir.
        let lastSlashIndex = path.lastIndexOf("/");
        if (lastSlashIndex == -1) {
            Score.visit({ source: this.source, name: dir.name, path: path });
            err(`getDir(${path})`, "Path not found.");
        }
        let parentPath = path.substring(0, lastSlashIndex);
        await this.getDir(parentPath, force);
        return this.putCache(path, await this.getDirSrc(path, this.cache[path]));
    }

    async putDir(path, name) {
        checkPath(path, name);
        await this.auth();
        let srcDir = await this.getDir(path);
        if (!srcDir) {
            err(`putDir(${path},${name})`, "Path not found.");
            Score.visit({ source: this.source, name: name, path: path });
        }
        let newDir = srcDir.dirs[name];
        let file = srcDir.files[name];
        if (newDir || file) err(`putDir(${path},${name})`, "Name in use.");
        await this.putDirSrc(path, name, srcDir);
    }

    async renameDir(path, name, newName) {
        checkPath(path, name, newName);
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
        checkPath(path, name);
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
        checkPath(path,name);
        await this.auth();
        let dir = await this.getDir(path);
        let file = dir.files[name];
        if (!file) {
            Score.visit({ source: this.source, path, name });
            err(`getFile(${path},${name})`, "Path/Name not found.");
        }
        await checkFileSize(name, file.size);

        // the "name" and "path" vars are are here passed back intact. For a LocalSrc, however, the name may have changed, and the path is unknown.
        return { path: path, name: name, data: await this.getFileSrc(path, name, dir, file), size: file.size, created: file.created, modified: file.modified };
    }

    async putFile(path, name, data) {
        checkPath(path, name);
        // Get directory metadata
        let dir = await this.getDir(path);
        if (dir.dirs[name]) return err(`putFile(${path},${name},...)`, "Path not found.");
        await this.putFileSrc(path, name, await data, dir, dir.files[name]);
        // Cache is updated inside putFileSrc with metadata from upload response
    }

    async renameFile(path, name, newName) {
        checkPath(path, name, newName);
        await this.auth();
        let srcDir = await this.getDir(path);
        if (!srcDir) {
            Score.visit({ source: this.source }, null, path);
            err(`renameFile(${path},${name},${newName})`, "Path/Name not found.");
        }
        let srcFile = srcDir?.files[name];
        if (!srcFile) {
            Score.visit({ source: this.source, path, name });
            err(`renameFile(${path},${name},${newName})`, "Path/Name not found.");
        }
        let dstFile = srcDir.files[newName] || srcDir.dirs[newName];
        if (dstFile) err(`renameFile(${path},${name},${newName})`, "Name in use.");
        await this.renameFileSrc(path, name, newName, srcDir, srcFile);
    }

    async trashFile(path, name) {
        checkPath(path, name);
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
class GDriveSrc (i.e. Google Drive);
**/


class GDriveSrc extends CachedSrc {
  source = Score.sources.gdrive;
  clientId = "1049752786050-72rqerj64c1l1vqk26r28qtcahfd6i3v.apps.googleusercontent.com";

  filesUrl = "https://www.googleapis.com/drive/v3/files/";
  uploadUrl = "https://www.googleapis.com/upload/drive/v3/files/";
  folderMimeType = "application/vnd.google-apps.folder";

  constructor() {
    super();
    this.tokens = null;
    this.gisClient = null;
  }

  async loadGIS () {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return window.google;
    return new Promise((resolve, reject) => {
      let  script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error("Failed to load Google Identity Services SDK"));
      document.head.append(script);
    });
  }

  async auth() {
    // If we already have a valid token, reuse it
    if (this.tokens && this.tokens.expiry > Date.now() / 1000) return;

    // Extension-specific authentication using launchWebAuthFlow
    if (window.chrome && chrome.identity && chrome.runtime?.id) {
      return new Promise((resolve, reject) => {
        const redirectUri = chrome.identity.getRedirectURL();
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${this.clientId}&` +
          `response_type=token&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent("https://www.googleapis.com/auth/drive")}`;

        _shade_.show("Authorizing");
        chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
          _shade_.pop();
          if (chrome.runtime.lastError || !responseUrl) {
            reject(new Error(chrome.runtime.lastError?.message || "Authentication failed or was cancelled.", {cause:"cancelled"}));
          } else {
            // Parse the access token from the redirect URL hash
            const url = new URL(responseUrl);
            const params = new URLSearchParams(url.hash.substring(1));
            const token = params.get("access_token");
            if (token) {
              this.tokens = {
                access_token: token,
                expiry: Date.now() / 1000 + parseInt(params.get("expires_in") || "3600"),
              };
              resolve();
            } else {
              reject(new Error("No access token returned from Google."));
            }
          }
        });
      });
    }

    let google = await this.loadGIS();

    if (!this.gisClient) {
      this.gisClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: "https://www.googleapis.com/auth/drive",
        prompt: '', // leave empty to avoid forcing re-consent every time
        callback: (response) => {
          _shade_.pop();
          if (response.error) {
            this._pendingReject?.(new Error(response.error, { cause: "auth" }));
          } else {
            const now = Date.now() / 1000;
            this.tokens = {
              access_token: response.access_token,
              expiry: now + (response.expires_in || 3600),
            };
            this._pendingResolve?.();
          }
          this._pendingResolve = null;
          this._pendingReject = null;
        },
        error_callback: (error) => {
          // Called when popup is closed or fails to open (error.type: popup_closed, popup_failed_to_open)
          _shade_.pop();
          this._pendingReject?.(new Error("Authentication cancelled by user.", { cause: "cancelled" }));
          this._pendingResolve = null;
          this._pendingReject = null;
        },
      });
    }

    // Wrap GIS callback in a Promise
    return new Promise((resolve, reject) => {
      this._pendingResolve = resolve;
      this._pendingReject = reject;
      _shade_.show("Authorizing");
      this.gisClient.requestAccessToken();
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
          Authorization: "Bearer " + this.tokens.access_token,
        },
      });
      let response = await fetchPromise;
      if (response.ok) {
        let responseJson = await response.json();
        entries.push(...responseJson.files);
        if ("nextPageToken" in responseJson) await loadPage(responseJson.nextPageToken); // recurse
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
        Authorization: "Bearer " + this.tokens.access_token,
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
        Authorization: "Bearer " + this.tokens.access_token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
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
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trashed: true }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashDirSrc(${path},${name},...)) failed: ${await response.text()}`);
  }

  async getFileSrc(path, name, dir, file) {
    let url = this.filesUrl + file.id + "?q=trashed=false&alt=media";
    let fetchPromise = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
      },
    });
    let response = await fetchPromise;
    if (response.ok) return await response.arrayBuffer();
    if (!response.ok) err(`getFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async renameFileSrc(path, name, newName, srcDir, srcFile) {
    let url = this.filesUrl + srcFile.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({name: newName}),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameFileSrc(${path},${name},${newName},...) failed: ${await response.text()}`);
  }


  async putFileSrc(path, name, data, dir, file) {
    const CHUNK_SIZE = 5 * 1024 * 1024;

    if (!file) {
      // Won't exist if creating, so create new empty file with metadata and get its id from the response.
      let response = await fetch(this.filesUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.tokens.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name,
          parents: [`${dir.id}`],
        }),
      });
      file = await response.json();
    }

    if (data.byteLength > CHUNK_SIZE) {
      let sessionResponse = await fetch(this.uploadUrl + file.id + "?uploadType=resumable", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + this.tokens.access_token,
          "Content-Length": "0",
        },
      });

      let uploadUrl = sessionResponse.headers.get("Location");

      for (let offset = 0; offset < data.byteLength; offset += CHUNK_SIZE) {
        let chunk = data.slice(offset, Math.min(offset + CHUNK_SIZE, data.byteLength));
        let endByte = offset + chunk.byteLength - 1;

        await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": chunk.byteLength,
            "Content-Range": `bytes ${offset}-${endByte}/${data.byteLength}`,
          },
          body: chunk,
        });
      }
    } else {
      let response = await fetch(this.uploadUrl + file.id + "?uploadType=media", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + this.tokens.access_token,
          "Content-Type": "application/octet-stream",
        },
        body: data,
      });
      if (!response.ok) {
        err(`GDrive putFileSrc(${path},${name},...)`, await response.text());
      } else {
        // Get updated file metadata from response and update cache
        let updatedFile = await response.json();
        if (dir && dir.files && dir.files[file.name]) {
          dir.files[file.name] = {
            id: updatedFile.id,
            name: updatedFile.name,
            size: updatedFile.size || data.byteLength,
            created: updatedFile.createdTime,
            modified: updatedFile.modifiedTime
          };
        }
      }
    }
  }

  async trashFileSrc(path, name, dir, file) {
    let url = this.filesUrl + file.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trashed: true}),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }
}

/**
class DbxSrc (i.e. Dropbox)
**/
class DbxSrc extends CachedSrc {
  source = Score.sources.dbx;
  authUrl = "https://www.dropbox.com/oauth2/authorize";
  extraAuthParams = "&token_access_type=offline";
  clientId = "erqcrdytyixn6h7";
  scopes = "files.content.write files.content.read";
  tokenUrl = "https://api.dropbox.com/oauth2/token/";

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
          Authorization: "Bearer " + this.tokens.access_token,
          "Content-Type": "application/json",
        },
        body: cursor ? JSON.stringify({cursor: cursor}) : JSON.stringify({path: path}),
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
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({path: path + "/" + name}),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putDirSrc(${path},${name},...})`, await response.text());
  }

  async renameDirSrc(path, name, newName, srcDir, srcSubDir) {
    let uri = this.filesUrl + "move_v2";
    let fetchPromise = await fetch(uri, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from_path: `${path}/${name}`,
        to_path: `${path}/${newName}`,
      }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameDirSrc(${path},${name},${newName})`, await response.text());
  }

  async trashDirSrc(path, name, parentDir, dir) {
    let url = this.filesUrl + "delete_v2";
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({path: path + "/" + name}),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashDirSrc(${path},${name},...)`, await response.text());
  }

  async getFileSrc(path, name, dir, file) {
    let url = this.contentUrl + "download";

    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        "Dropbox-API-Arg": JSON.stringify({ path: file.id }),
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
        Authorization: "Bearer " + this.tokens.access_token,
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
      fetchPromise = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.tokens.access_token,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({cursor: {offset:cursor, session_id:session_id}}),
        },
        body: new DataView(data.buffer, cursor, sliceLen),
      });
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
        Authorization: "Bearer " + this.tokens.access_token,
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
        Authorization: "Bearer " + this.tokens.access_token,
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
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: `${path}/${name}` }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashFileSrc(${path},${name},...)`, await response.text());
  }
}

/**
class ODriveSrc (i.e. Microsoft OneDrive)
**/
class ODriveSrc extends CachedSrc {
  source = Score.sources.odrive;
  clientId = "b81faf82-539b-4759-bcc9-8fdac6c7ceba";
  authUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
  tokenUrl = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
  scopes = "Files.ReadWrite.All offline_access";
  filesUrl = "https://graph.microsoft.com/v1.0/me/drive/";

  constructor() {
    super();
    this.tokens = null;
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
    let url = this.filesUrl + `${path == "" ? "root" : "items/" + dir.id}/children`;
    let fetchPromise = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
      },
    });
    let response = await fetchPromise;
    if (response.ok) return (await response.json()).value;
    err(`getDirSrc(${path},${dir}) failed: ${await response.text()}`);
  }

  async putDirSrc(path, name, srcDir) {
    let url = this.filesUrl + srcDir.id + "/children";
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
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
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameDirSrc(${path},${name},${newName},...) failed: ${await response.text()}`);
  }

  async trashDirSrc(path, name, parentDir, dir) {
    let url = this.filesUrl + "items/" + dir.id;
    let fetchPromise = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
      },
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashDirSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async getFileSrc(path, name, dir, file) {
    let url = this.filesUrl + "items/" + file.id + "/content";
    let fetchPromise = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
      },
    });
    let response = await fetchPromise;
    if (response.ok) return await response.arrayBuffer();
    err(`getFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }

  async putFileSrc(path, name, data, dir, file) {
    let url = file?.id
        ? this.filesUrl + "items/" + file.id + "/createUploadSession"
        : this.filesUrl + "items/" + dir.id + ":/" + name + ":/createUploadSession";
    // get upload session url
    let fetchPromise = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      // Doesn't seem to work if "item" is the only field defined. Onedrive API bug?
      body: JSON.stringify({"name": name, "item":{"@microsoft.graph.conflictBehavior":"replace"}}),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`putFileSrc(${path},${name},...)`, await response.text());
    let uploadUrl = (await response.json()).uploadUrl;
    let maxSliceLen = 5 * 1024 * 1024;
    let dataLen = data.byteLength;
    let remaining = dataLen;
    let sliceLen = Math.min(remaining, maxSliceLen);

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
      sliceLen = Math.min(remaining, maxSliceLen);
    }
  }

  async renameFileSrc(path, name, newName, srcDir, srcFile) {
    let url = this.filesUrl + "items/" + srcFile.id;
    let fetchPromise = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newName }),
    });
    let response = await fetchPromise;
    if (!response.ok) err(`renameFileSrc(${path},${name},${newName},...) failed: ${await response.text()}`);
  }

  async trashFileSrc(path, name, dir, file) {
    let url = this.filesUrl + "items/" + file.id;
    let fetchPromise = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + this.tokens.access_token,
      },
    });
    let response = await fetchPromise;
    if (!response.ok) err(`trashFileSrc(${path},${name},...) failed: ${await response.text()}`);
  }
}

/**
class UrlSrc (i.e. WWW/URL - extension only)
  Handles opening PDFs from URLs. Only available when running as extension.
  The actual fetch logic is in ext.js; this class just provides the FileSrc interface.
**/
class UrlSrc extends FileSrc {
  source = Score.sources.url;

  async getFile(path, name) {
    // For URL source, path is the full URL
    // Delegate to extension's fetchPdfFromUrl if available
    if (window.fetchPdfFromUrl) {
      await window.fetchPdfFromUrl(path);
      // fetchPdfFromUrl creates the score directly, so throw to abort the caller's flow
      throw { handled: true };
    } else {
      throw new Error("URL source is only available in the browser extension");
    }
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
      margin-top:2em;
    }
  `
  );

  constructor(panel) {
    this.panel = panel;
    this.mode = panel.mode;
    this.source = Score.sources.local;
    this.src = FileSrc.get("Local");

    // Check if we should auto-open picker (1-click mode)
    let tabMode = localStorage.getItem('podium-local-tab-mode') || '2-click'

    if (this.mode == "save") {
      this.elm = helm(`
        <div class="Local">
          <div class="Local__line"> ${iconSvg("Save", { style: "width:3em;height:3em;" })}</div>
          <div  class="Local__line"><b>Tap To Show Save File Picker</b></div>
        </div>`);
      listen(this.elm, "pointerup", async (e) => this.putFile());
      return;
    }

    this.elm = helm(`
     <div data-tag="local" class="Local" >
        <div class="Local__line"> ${iconSvg("Open", { style: "width:3em;height:3em;" })}</div>
        <div  class="Local__line"><b>Click to Show Open File Picker</b></div>
        <div class="Local__line">${_mobile_ ? "" : "<b>&mdash; or &mdash;<b>"}</div>
        <div class="Local__line">${_mobile_ ? "" : "<b>Drop Score File</b>"}</div>
     </div>`);

    // Add input elm after DOM creation
    let inputElm = document.createElement('input');
    inputElm.type = 'file';
    inputElm.setAttribute('data-tag', 'dialog');
    inputElm.draggable = true;
    inputElm.style.visibility = 'hidden';
    // the input element's "accept" attribute is different for "copy" and "open" modes.
    inputElm.accept = this.mode == "copy" ? "image/jpeg, image/png" : ".pdf, application/pdf";
    this.elm.appendChild(inputElm);


    Object.assign(this, dataIndex("tag", this.elm));

    listen(this.local, "dragover", (e) => e.preventDefault());

    listen(this.local, ["cancel", "click", "drop", "change"], async (e) => {
      e.preventDefault();
      let file = null;
      switch (e.type) {
        case "click":
          localStorage.setItem('podium-local-tab-mode', '1-click');
          this.dialog.showPicker();
          break;
        case "cancel":
          localStorage.setItem('podium-local-tab-mode', '2-click');
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
        if (this.mode == "copy") {
          await _menu_.setPasteObj(await bytesToBase64DataUrl(await file.arrayBuffer(), file.type), file.type);
          Score.visit({ source:Score.sources.local, name:file.name, path:"n/a"}, visitUpdate);
          toast("File opened");
        }
        else if (this.mode == "merge") {
          let mergeCell = _menu_.rings.page.cells.merge;
          mergeCell.pdfData = await file.arrayBuffer();
          _menu_.activateCell(mergeCell);
          toast("Tap score to merge");
        }
        else {
          if(await checkUnsaved()) {
            try {
              let score = await new Score().init(Score.sources.local, null, file.name, await file.arrayBuffer());
              Score.visit(score, visitUpdate);
              toast("File opened");
            } catch (error) {
              if (!error.handled) dialog(`Error opening file <i>${escapeHtml(file.name)}</i><br>${error.message || error}`);
            }
          }
        }
        this.panel.hide();
      }
    });
  }

  async select() {
    // The picker will "auto trigger" when tab is selected iff we're in
    // 1-click "mode". The mode is remembered based on user's previous action.
    let tabMode = localStorage.getItem('podium-local-tab-mode') || '2-click';

    if (tabMode == '1-click' && this.mode != 'save') {
      // Auto-trigger picker for open mode
      delay(5, () => this.dialog.showPicker());
    }
  }

  async putFile() {
    let score = _score_;
    try {
      // Get file handle immediately while still in user gesture
      let handle = await this.src.getFileHandle(score.name);

      _shade_.show("Saving file");
      _shade_.onCancel = () => { throw new Error() };

      score.source = Score.sources.local;
      let data = await score.toPdf();
      let { name, modified } = await this.src.putFile(score.path, score.name, data, handle);
      score.fileHandle = handle; // remember for future quick-saves
      score.update({ source: this.source, name: name, path: null });
      Score.visit(score, { size: data.length, modified: modified });
      score.setDirty(false);
      toast("File saved");
    } catch (error) {
      if (error.name !== 'AbortError') {
        errDialog(error, "Failed to save file to local storage");
      }
    } finally {
      _shade_.hide();
      this.panel.hide();
      _shade_.onCancel = null;
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
      background-image: linear-gradient(to top, transparent, var(--panel-bg));
    }
    Flv-fade-bottom {
      z-index: 1;
      position: absolute;
      bottom: 0;
      display: block;
      width: 100%;
      height: .8em;
      background-image: linear-gradient(to bottom, transparent, var(--panel-header-bg) 53%, var(--panel-header-bg));
    }
    .Flv {
      position: absolute;
      height:100%;
      width:100%;
      color: var(--color-text);
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
      height: calc(100% - 6.5em);
    }
    .Fsv-list__frame {
      height: calc(100% - 10em);
    }
    .Flv-list__frame--save-mode {
      height: calc(100% - 16em); /* frame in save mode: allows room for FlvSave */
    }
    .Flv-list__item-selected {
      background: var(--panel-header-selected-bg) !important;
    }
    .Flv-list__file {
      width: calc(100% - 2em);
      font-size:1em;
      margin:.5em;
      padding:.5em;
      border-radius: var(--borderRadius);
    }
    .Flv-list__file-header {
      display:flex;
      align-items:center;
      column-gap:.5em;
      color: var(--color-text);
      text-shadow: var(--file-text-shadow);
    }
    .Flv-list__file-details {
      display:flex;
      justify-content: space-between;
      align-items:center;
      color: var(--color-text);
      text-shadow: var(--file-text-shadow);
    }
     .Flv-list__file-properties {
       font-size:.75em;
       color: var(--file-properties-color);
       margin:.5em;
       text-shadow: var(--file-text-shadow);
    }
    .Flv-path__sash {
      display: flex;
      position:relative;
      width: max-content;
      min-width: 100%;
      height: 3em;
      background-image: var(--panTexture);
      margin-top: .5em;
    }
    .Flv-path__sash-edge {
      top: .5em;
      height: 10em;
    }
    .Flv-path {
      position:relative;
      width: max-content;
      left:0px;
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
      margin: 0 0.25em;
      border-radius: var(--borderRadius);
      color: var(--color-text);
      text-shadow: var(--file-text-shadow);
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
      outline:none;
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

  keyBuf = "" ;

  constructor(panel) {
    this.panel = panel;
    this.mode = panel.mode;
    Object.assign(this, dataIndex("tag", this.elm));
    listen(this.elm, "pointerdown", this.onListDown.bind(this));

    delay(1, () => { // delayed so subclass constructor, if any, can run...it might replace this.elm
      this.elm.tabIndex = 0 ; // required for list to be focused for keydown events
      this.elm.focus({preventScroll:true}) ;
      listen(this.elm, "keydown", this.onKeyDown.bind(this)) ;
    });
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
    checkPath(name);
    if (name.toLowerCase().endsWith(ext)) return name;
    return new Promise((accept, reject) => {
      dialog(`Add extension <i>.pdf</i> to <i>${escapeHtml(name)}<i> ?`, { Yes: { svg: "Pdf" }, No: { svg: "Not Pdf" }, Cancel: { svg: "Cancel" } }, async (e, prop, tag, args) => {
        args.close();
        if (tag == "Yes") accept(name + ext);
        else if (tag == "No") accept(name);
        else accept(null);
      });
    });
  }

  select() {
    clearChildren(this.flvList);
    JSON.parse(localStorage.getItem("recent") || "[]").forEach(async (obj, index) => {
      if (this.acceptExt(obj.name)) this.flvList.append(await this.makeFileElm(obj));
    });
  }

  refresh() {}

  enterDialog(tag, dialog) {
    // Takes a dialog assumed to contain a pod-input element with a data-tag set to "input".
    // Listens for an keypup on "Enter" and, if found, calls fire() on the buttonsElm associated
    // with the given tag. 
    let input = dataIndex("tag", dialog).input;
    listen(input, "keyup", (e) => {
      if (e.key == "Enter") dialog.buttonsElm.self.fire(tag);
    }, { once:true});
  }; 

  async makeFileElm(properties) {
    let name = properties.name;
    let path = properties.path;
    checkPath(name, path);
    let isDir = properties.isDir ?? false;
    let source = properties.source || FileSrc.get(this.src) || "?";
    let size = properties.size || null;
    let created = properties.created ? new Date(properties.created).toLocaleString() : null;
    let modified = properties.modified ? new Date(properties.modified).toLocaleString() : null;
    let iconName = isDir ? "Folder" : this.iconsByExtension[name.slice(name.lastIndexOf("."))];
    let color = this.colorFromText(name);
    let elm = helm(`
       <div ${isDir ? "data-dir='true'":""} data-name="${escapeHtml(name)}" data-path="${escapeHtml(path)}" data-source="${escapeHtml(source)}" class="Flv-list__file">
         <div class="Flv-list__file-header">
           ${iconSvg(iconName, {style: "width:3.5em;height:2.5em" })}
           ${escapeHtml(name)}
         </div>
         <div class="Flv-list__file-details">
           <div class="Flv-list__file-properties">
             Source: ${escapeHtml(source)}<br>
             ${source == "Local" ? "" : "Path: " + (escapeHtml(path) || "/") + "<br>"}
             ${size ? "Size: "+ Number(size).toLocaleString() + "<br>" : ""}
             ${created ? "Created: "+ created + "<br>" : ""}
             ${modified ? "Modified: "+ modified + "<br>" : ""}
           </div>
           <div>
             ${source == "Local" ? "" : this.mode == "copy" ? "" : iconSvg("Pencil", {tag: "rename", style: "width:2.75em;padding:.5em;"})}
             ${source == "Local" ? "" : this.mode == "copy" ? "" : iconSvg("Trash", {tag: "trash", style: "width:3em;padding:.5em;"})} </div>
           </div>
       </div>`);
    elm.style.background = color;
    return elm;
  }

  colorFromText(text) {
    // Return a css background from given text using
    // a hash, with no alpha so the color looks identical in both light and dark modes.
    // Mix with white to create pastel colors.
    let hex = strToHash(text).toString(16);

    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Mix 33% color with 67% white to create very light pastel
    r = Math.round(r / 3 + 170);
    g = Math.round(g / 3 + 170);
    b = Math.round(b / 3 + 170);
    return "#" + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }


  // keyState stores state ulsed by the progressive match algorithms implemented by onKeyDown and markSelected.
  keyState = { keys: "",
    fileElm: null, // currently target fileElm, if any
    span: null, // current title <span> node
    txt: null // previous title text node, if any
  } ;
  
  markSelected(fileElm) {
    // Helper for the progressive match algorithm implemented in onKeyDown below. It 
    // marks the "key state" of the given fileElm by replacing the title (file or directory name), which
    // is a simple text node, by a <span>marked-title</span>. The title itself will have any characters that
    // match keyState.keys enclosed in <mark>...</mark> tags so user knows how much of the title's
    // name has matched. 
    if(this.keyState.span) // then restore previous target's txt
      this.keyState.span.replaceWith(this.keyState.txt) ; // replace span node with original text node
    if(!fileElm) {
      this.keyState.keys = "" ;
      this.keyState.fileElm = this.keyState.span = this.keyState.txt = null ; 
      return ;
    }
    this.keyState.fileElm = fileElm ;
    let txt = fileElm.querySelector(".Flv-list__file-header")?.querySelector("svg")?.nextSibling ;
    if(txt) {
      this.keyState.txt = txt;
      let tc = txt.textContent ;
      let re = new RegExp(this.keyState.keys, "i");
      let marked = tc.replace(re,`<mark>${tc.match(re)[0]}</mark>`) ;
      this.keyState.span = helm(`<span>${marked}</span>`) ;
      txt.replaceWith(this.keyState.span) ;
    }
  }

  onKeyDown(e) {
    let frame = this.flvList.parentElement ;
    let sash = this.flvList ;
    let sashTop = null ;
    switch(e.key) {
      case "Home": sashTop = "0" ; break ;
      case "End": sashTop = frame.offsetHeight - sash.offsetHeight ; break;
      case "ArrowDown": // down 1 entry
        sashTop = sash.children[0].offsetHeight + sash.offsetTop ; break ;
      case "ArrowUp":  // up 1 entry
        sashTop = -sash.children[0].offsetHeight + sash.offsetTop ; break ;
      case "ArrowLeft": // up directory (FileSystemView only)
        if(this.constructor.name != "FileSystemView") return ;
        let pathLen = this.fsvPath.children.length ;
        if(pathLen > 2) { // path will always start with root and end with "New": we ignore them
          let target = this.fsvPath.children[pathLen - 3] ;
          this.setPath(target.dataset.path);
        }
        return ; 
      case "Enter": // open selection
        if(this.keyState.fileElm) {
          let { source, name, path, dir } = this.keyState.fileElm.dataset;
          if (dir && path && name) this.getDir(path, name);
          else if(source && path && name) this.getFile(source, path, name) ;
          this.markSelected(null) ; // clear selection
        }
        return ;
      case "Backspace":
      case "Delete": 
        this.keyState.keys = this.keyState.keys.slice(0,-1) ;
      default: 
        let isNormal = /^[a-zA-Z0-9 .]$/.test(e.key) ; // normal key, i.e. not a navigational key
        if(isNormal) this.keyState.keys += e.key;
        let names = {}; // maps each file/directory name to containing fileElm
        Array.from(sash.children).forEach((child) => names[child.dataset.name] = child) ;
        let firstMatch = Object.keys(names).find((str) => { return new RegExp(this.keyState.keys, "i").test(str);}) ;
        if(firstMatch) {
          let fileElm = names[firstMatch] ;
          sashTop =  frame.offsetHeight / 2 - fileElm.offsetTop - fileElm.offsetHeight / 2 ;
          this.markSelected(fileElm) ;
        }
        else {
          if(isNormal) this.keyState.keys = this.keyState.keys.slice(0,-1) ; // no match...remove last key
        }
    }
    if(sashTop) sash.style.top = clamp(sashTop, frame.offsetHeight - sash.offsetHeight, 0) + "px" ;
  }

  onListDown(e) {
    this.elm.focus({ preventScroll: true}) ; // need preventScroll!
    let elm = this.flvList;
    elm.style.transition = "unset";
    let origin = elm.offsetTop;
    let minTop = this.flvList__frame.offsetHeight - elm.offsetHeight;
    if (this.panel.mode == "save") minTop -= this.fsvSave.offsetHeight;
    elm.setPointerCapture(e.pointerId);
    let drag = new Drag(e);

    let mv = listen(elm, "pointermove", (emv) => {
      drag.mv(emv) ;      
      if (drag.moved) elm.style.top = clamp(origin + emv.clientY - e.clientY, minTop, 0) + "px";
    });

    listen(
      elm,
      "pointerup",
      async (eup) => {
        drag.up(eup);
        unlisten(mv);
        if (drag.moved) {
          elm.style.transition = "1s top ease-out";
          return (elm.style.top = clamp(elm.offsetTop + drag.vY * 1000, minTop, 0) + "px");
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
    if(this.mode != "copy" && this.mode != "merge" && !await checkUnsaved())
      return;
    _shade_.show("Downloading file");
    return new Promise(async (accept, reject) => {
      try {
        let src = FileSrc.get(source);
        let { path, name, data, size, created, modified, fileHandle } = await src.getFile(requestedPath, requestedName, this.panel.mode);
        let visitUpdate = { path, size, created, modified };
        if (this.panel.mode == "copy") {
          let ext = this.acceptExt(requestedName);
          if (ext) {
            _menu_.setPasteObj(await bytesToBase64DataUrl(data, this.mimeTypes[ext]), this.mimeTypes[ext]);
            Score.visit({ source, name, path }, visitUpdate);
          }
        } else if (this.panel.mode == "merge") {
          let mergeCell = _menu_.rings.page.cells.merge;
          mergeCell.pdfData = data;
          _menu_.activateCell(mergeCell);
          Score.visit({ source, name, path }, visitUpdate);
          toast("Tap score to merge");
        } else {
          let score = await new Score().init(source, path, name, data);
          if (fileHandle) score.fileHandle = fileHandle;
          Score.visit(score, visitUpdate);
        }
        toast("File downloaded");
      } catch (error) {
        if (!error.handled) errDialog(error, "Error: failed to download file from cloud server.");
      } finally {
        _shade_.hide();
        this.panel.hide();
        accept();
      }
    });
  }

  async renameFile(source, path, name) {
    checkPath(path, name);
    _shade_.show("Renaming file");
    return new Promise((accept, reject) => {
      let dialogElm = dialog(
        `Confirm. Rename File:<br><br>
            <i>${escapeHtml(name)}</i><br>
              <br>To:<br>
        <input is="pod-input" type=text class="dialog__textInput" data-tag="input" value="${escapeHtml(name)}"></input>
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
            if (this.setPath) {
              await this.setPath(path, true);
              let cached = src.cache[path];
              Score.visit({ source, path, name, size: cached.size, created: cached.created, modified: cached.modified }, { name: newName });
            } else if (src.cache && src.cache[path]) {
              let cached = src.cache[path];
              Score.visit({ source, path, name, size: cached.size, created: cached.created, modified: cached.modified }, { name: newName });
              src.cache[path.ts] = 0; // invalidate path, forcing refresh on next fetch
              this.select();
            }
            toast("File renamed");
          } catch (error) {
            errDialog(error, "Error: failed to rename file on cloud server.");
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
      dialog(`Confirm. Trash File:<br><br><i>${escapeHtml(name)}</i><hr>`, { Trash: { svg: "Trash" }, Cancel: { svg: "Close" } }, async (e, prop, tag, args) => {
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
          errDialog(error, "Error: failed to trash file on cloud server.");
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
      if (!_score_) return;
      this.fsvSave.classList.remove("void");
      this.flvList__frame.classList.add("Flv-list__frame--save-mode");
      this.fsvSave__file.value = _score_.name;
      let uploadButton = new ButtonGroup({}, { Upload: { svg: "Upload" } }, async () => await this.putFile(this.fsvSave__file.value));
      uploadButton.elm.style = "position:absolute;right:4em;top:4.5em;";
      this.uploadButton.replaceWith(uploadButton.elm);
    } else {
      this.fsvSave.classList.add("void");
      this.flvList__frame.classList.remove("Flv-list__frame--save-mode");
    }
    let storedPath = localStorage.getItem(this.source) || "";
    this.setPath(this.path ||
       (_score_?.source == this.source ?
         _score_?.path : null) || storedPath, true);
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
        `<div dir-source="${escapeHtml(this.source)}" data-path="${escapeHtml(path)}" style="background:${background}"{ class="Flv-path__dir">
         ${iconSvg(icon, { style: "width:1.5em;" })}&nbsp${escapeHtml(dir)}&nbsp/</div>`
      );
      elm.append(dirElm);
    });

    // We could restrict "add directory" botton to save mode via "if (this.panel.mode == "save")",
    // but currently leaving it available for all modes
    if (true)
      // Add an entry that serves as "add directory" button
      elm.append(
        helm(
          `<div data-tag="newDir" data-path="${escapeHtml(path)}" data-source="${escapeHtml(this.source)}" class="Flv-path__dir">
         ${iconSvg("New Folder", { style: "pointer-events:none;width:2em;padding-left:3em;" })}&nbspNew</div>`
        )
      );

    elm.style.left = Math.min(getBox(elm.parentElement).width - getBox(elm).width, 0) + "px";
  }

  onPathDown(e) {
    let drag = new Drag(e);
    let elm = this.fsvPath;
    let origin = elm.offsetLeft;
    let minLeft = this.fsv.offsetWidth - elm.offsetWidth;
    elm.setPointerCapture(e.pointerId);

    let mv = listen(elm, "pointermove", (emv) => {
      drag.mv(emv) ;
      if(drag.moved) elm.style.left = clamp(origin + emv.clientX - e.clientX, minLeft, 0) + "px";
    });

    listen(elm, "pointerup", async (eup) => {
      drag.up(eup) ;
      unlisten(mv);
      if (drag.jab) {
        if(e.target.dataset.tag == "newDir") return await this.putDir(this.path);
        let target = e.target.closest(".Flv-path__dir");
        if (target) {
          let refresh = target.dataset.path == this.path;
          await this.setPath(target.dataset.path, refresh);
          if (refresh) toast("Refreshed");
        }
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
                errDialog(error, "Error: failed to create folder on cloud server.");
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
    checkPath(path, name);
    _shade_.show("Renaming folder");
    return new Promise((accept, reject) => {
      let dialogElm = dialog(
        `Confirm. Rename Folder:<br><br>
            <i>${escapeHtml(name)}</i><br>
              <br>To:<br>
        <input is="pod-input" type=text class="dialog__textInput" data-tag="input" value="${escapeHtml(name)}"></input>
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
            errDialog(error, "Error: failed to rename folder on cloud server.");
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
      dialog(`Confirm. Trash Folder:<br><br><i>${escapeHtml(name)}</i><hr>`, { Trash: { svg: "Trash" }, Cancel: { svg: "Close" } }, async (e, prop, tag, args) => {
        try {
          args.close();
          if (tag == "Cancel") return;
          _shade_.show("Trashing folder");
          await this.src.trashDir(path, name);
          await this.setPath(path, true);
          toast("Folder trashed");
        } catch (error) {
          errDialog(error, "Error: Failed to trash folder on cloud server.");
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
          dialog(`Confirm. Replace <i>${escapeHtml(name)}</i> ?`,
            { Replace: { svg: "Replace" }, Cancel: { svg: "Cancel" } }, async (e, prop, tag, args) => {
              args.close();
              if (tag == "Cancel") reject(new Error("", { cause: "cancelled" }));
              accept();
          })
        );
      _shade_.show("Uploading file");
      let score = _score_;
      let data = await _score_.toPdf();
      await this.src.putFile(this.path, name, data);
      score.update({ source: this.source, name: name, path: this.path });
      Score.visit(score, { size: data.length, modified: Date.now() });
      score.setDirty(false);
      await this.setPath(this.path, true);

      toast("File uploaded");
    } catch (error) {
      errDialog(error, "Error: failed to upload file to cloud server.<br>Details in Console.");
    } finally {
      _shade_.hide();
      this.panel.hide();
    }
  }

  async setPath(path, force = false) {
    if (this.source == "Local") return; // no path for Local files.
    _shade_.show("Reading folder");
    return new Promise(async (accept, reject) => {
      try {
        this.path = path;
        let listing;
        try {
          listing = await this.src.getDir(path, force);
          localStorage.setItem(this.source, path); // remember last path opened
        }
        catch(error) {
          if(error.cause == "cancelled") throw error ;
          localStorage.setItem(this.source, ""); // reset if path doesn't exist
          listing = await this.src.getDir("", force);
        }        
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
        errDialog(error, "Error: Failed to read folder from cloud server.<br>Details in Console.");
      } finally {
        _shade_.hide();
        return accept();
      }
    });
  }
}
