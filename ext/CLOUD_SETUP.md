# Cloud Provider Setup for Podium Extension

This guide shows how to get API credentials for OneDrive and Dropbox.

## OneDrive Setup

### 1. Go to Azure Portal
https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade

(Or: https://portal.azure.com > "Azure Active Directory" > "App registrations")

### 2. Register a New Application
- Click "New registration"
- Name: "Podium PDF Viewer"
- Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
- Redirect URI:
  - Platform: "Web"
  - URI: Get from extension - run this in console after loading extension:
    ```javascript
    chrome.identity.getRedirectURL('onedrive')
    ```
    Example result: `https://abcdefghijklmnop.chromiumapp.org/onedrive`
- Click "Register"

### 3. Get Application (client) ID
- After registration, you'll see the "Application (client) ID"
- Copy this - it's your `clientId`
- Example format: `12345678-1234-1234-1234-123456789012`

### 4. Configure Authentication
- In left sidebar, click "Authentication"
- Under "Implicit grant and hybrid flows", check:
  - ✅ Access tokens (used for implicit flows)
- Click "Save"

### 5. Set API Permissions
- In left sidebar, click "API permissions"
- Click "Add a permission"
- Choose "Microsoft Graph"
- Choose "Delegated permissions"
- Search for and add:
  - `Files.Read` - Read user files
  - `offline_access` - Maintain access to data
- Click "Add permissions"

### 6. Update cloud-identity.js
Replace `YOUR_ONEDRIVE_CLIENT_ID` with your Application (client) ID:
```javascript
this.clientId = '12345678-1234-1234-1234-123456789012';
```

---

## Dropbox Setup

### 1. Go to Dropbox App Console
https://www.dropbox.com/developers/apps

### 2. Create a New App
- Click "Create app"
- Choose API: "Scoped access"
- Choose access type: "Full Dropbox" (to access all user files)
- Name your app: "Podium PDF Viewer" (must be unique)
- Click "Create app"

### 3. Get App Key
- On the app settings page, find the "App key"
- Copy this - it's your `clientId`
- Example format: `abcdefghijklmno`

### 4. Set Redirect URI
- On the same settings page, scroll to "OAuth 2"
- Under "Redirect URIs", click "Add"
- Get redirect URI from extension - run this in console after loading extension:
  ```javascript
  chrome.identity.getRedirectURL('dropbox')
  ```
  Example result: `https://abcdefghijklmnop.chromiumapp.org/dropbox`
- Paste it and click "Add"

### 5. Set Permissions
- Click the "Permissions" tab
- Under "Files and folders", enable:
  - ✅ files.metadata.read
  - ✅ files.content.read
- Click "Submit" at the bottom

### 6. Update cloud-identity.js
Replace `YOUR_DROPBOX_APP_KEY` with your App key:
```javascript
this.clientId = 'abcdefghijklmno';
```

---

## Testing

1. Update the client IDs in `ext/src/cloud-identity.js`
2. Load the extension in Chrome (`chrome://extensions` > Load unpacked > select `ext/` folder)
3. Open `ext/test-cloud.html` in the extension (right-click extension icon > "Inspect popup" > Console > run `chrome.tabs.create({url: chrome.runtime.getURL('test-cloud.html')})`)
4. Try the login and list files buttons for each provider

## Redirect URI Format

Chrome extensions use a special redirect URI format:
```
https://<extension-id>.chromiumapp.org/<path>
```

Where:
- `<extension-id>` is your extension's ID from `chrome://extensions`
- `<path>` is any path you choose (we use `/onedrive` and `/dropbox`)

Get it programmatically:
```javascript
chrome.identity.getRedirectURL('onedrive')
chrome.identity.getRedirectURL('dropbox')
```

## Common Issues

### "redirect_uri_mismatch" error
- Make sure the redirect URI in Azure/Dropbox exactly matches `chrome.identity.getRedirectURL()`
- Include the protocol (`https://`) and the full path

### "invalid_client" error
- Check that the client ID is correct
- For OneDrive, make sure you enabled implicit flow in Azure Portal

### Extension ID changes
- Extension ID changes when you publish to Chrome Web Store vs load unpacked
- Update redirect URIs in Azure/Dropbox when publishing

## Scopes Used

### OneDrive
- `Files.Read` - Read-only access to user files
- `offline_access` - Maintain access between sessions

### Dropbox
- `files.metadata.read` - Read file names, sizes, dates
- `files.content.read` - Read file content

Both are minimal read-only scopes. Podium never writes to or modifies cloud files.
