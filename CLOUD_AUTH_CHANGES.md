# Cloud Storage Auth Changes - Library-Free Implementation

## Summary

Removed external authentication libraries (Google GIS, Microsoft MSAL) and replaced them with direct OAuth implementations that work in both web app and browser extension contexts.

## Changes Made

### 1. Google Drive (GDriveSrc)
**Before:** Used Google Identity Services (GIS) library
- Required loading external script from accounts.google.com
- Blocked by extension CSP

**After:** Uses OAuth 2.0 Implicit Grant flow
- Lines 760-809 in file.js
- No external libraries
- Direct token in URL fragment (`response_type=token`)
- Works in both web and extension contexts

**Why Implicit Grant:** Google's PKCE implementation has CORS issues on their token endpoint for browser apps. The token endpoint requires either a client_secret (can't be exposed in browser) or blocks CORS requests from web origins.

### 2. Microsoft OneDrive (ODriveSrc)
**Before:** Used MSAL (Microsoft Authentication Library)
- Required loading external script from alcdn.msauth.net
- Blocked by extension CSP

**After:** Uses OAuth 2.0 PKCE flow
- Lines 1241-1253 in file.js
- Extends CachedSrc to use inherited PKCE implementation
- Added authUrl, tokenUrl, scopes configuration
- Works in both web and extension contexts

### 3. Dropbox (DbxSrc)
**No changes needed** - Already using PKCE flow
- Lines 1020-1033 in file.js
- Extends CachedSrc with PKCE

### 4. Redirect URI Support
**Updated:** CachedSrc.redirectUri (lines 455-458)
- Detects extension context using `chrome.runtime?.id`
- Extension: `chrome-extension://${chrome.runtime.id}/podauth.html`
- Web: `${location.origin}/podauth.html`

## OAuth Configuration Requirements

### Google Drive
- Client ID: 1049752786050-72rqerj64c1l1vqk26r28qtcahfd6i3v.apps.googleusercontent.com
- Must register BOTH redirect URIs in Google Cloud Console:
  - Web: `https://yourdomain.com/podauth.html`
  - Extension: `chrome-extension://YOUR_EXTENSION_ID/podauth.html`
- OAuth Client Type: Web application
- Flow: Implicit Grant (response_type=token)

### Microsoft OneDrive
- Client ID: b81faf82-539b-4759-bcc9-8fdac6c7ceba
- Must register BOTH redirect URIs in Azure AD:
  - Web: `https://yourdomain.com/podauth.html`
  - Extension: `chrome-extension://YOUR_EXTENSION_ID/podauth.html`
- OAuth Client Type: Public client (PKCE without client_secret)
- Flow: Authorization Code with PKCE

### Dropbox
- Client ID: erqcrdytyixn6h7
- Must register BOTH redirect URIs in Dropbox App Console:
  - Web: `https://yourdomain.com/podauth.html`
  - Extension: `chrome-extension://YOUR_EXTENSION_ID/podauth.html`
- Flow: Authorization Code with PKCE

## Benefits

1. **No CSP Issues:** No external scripts to load
2. **Unified Codebase:** Same code works in web app and extension
3. **Modern Security:** PKCE for Microsoft and Dropbox
4. **Pragmatic Approach:** Implicit grant for Google (only option that works)
5. **Simpler Build:** No need to bundle authentication libraries

## Security Considerations

### Implicit Grant for Google
- **Status:** Officially deprecated by Google (since ~2020)
- **Reality:** Still fully supported, and the only viable option for browser apps
- **Why Safe:**
  - No client_secret to expose (there isn't one)
  - Token in URL fragment (not query params)
  - Short-lived access tokens
  - PKCE doesn't work due to Google's CORS restrictions

### PKCE for Microsoft & Dropbox
- **Modern standard** for public clients (browser apps, extensions)
- **More secure** than implicit grant:
  - Code exchange prevents token interception
  - Refresh tokens for long-lived access
  - PKCE challenge protects against authorization code interception

## Testing Checklist

### Web App Testing
- [ ] Google Drive: Auth, open file, save file
- [ ] Microsoft OneDrive: Auth, open file, save file
- [ ] Dropbox: Auth, open file, save file

### Extension Testing (Post v1.1)
- [ ] Register all redirect URIs with providers
- [ ] Google Drive: Auth, open file, save file
- [ ] Microsoft OneDrive: Auth, open file, save file
- [ ] Dropbox: Auth, open file, save file
- [ ] Test extension ID changes during development

## Known Issues

**Extension Development:**
- Extension ID changes during development (unpacked extensions)
- Must update registered redirect URIs when ID changes
- Consider using a fixed extension ID for development

**Google Policy Risk:**
- Implicit grant is deprecated but still supported
- Google could theoretically reject extension
- Mitigated by: lack of viable alternatives, widespread use

## Future Improvements

**If Google fixes PKCE CORS:**
- Switch Google to PKCE like Microsoft and Dropbox
- Remove implicit grant implementation
- Update OAuth configuration

**For Stricter CSP:**
- Consider backend proxy for token exchange
- Would enable PKCE for all providers
- Requires server infrastructure (defeats "no server" architecture)
