# Google Drive Setup for Podium Extension

The Podium extension uses Chrome's Identity API to access Google Drive. This requires a Google OAuth 2.0 Client ID.

## Steps to Get OAuth Client ID:

### 1. Go to Google Cloud Console
https://console.cloud.google.com/

### 2. Create a New Project (or select existing)
- Click "Select a project" at the top
- Click "NEW PROJECT"
- Name it "Podium Extension" or similar
- Click "CREATE"

### 3. Enable Google Drive API
- In the left sidebar, go to "APIs & Services" > "Library"
- Search for "Google Drive API"
- Click on it and click "ENABLE"

### 4. Configure OAuth Consent Screen
- Go to "APIs & Services" > "OAuth consent screen"
- Select "External" user type (unless you have a Google Workspace)
- Click "CREATE"
- Fill in:
  - App name: "Podium PDF Viewer"
  - User support email: your email
  - Developer contact: your email
- Click "SAVE AND CONTINUE"
- On Scopes page, click "ADD OR REMOVE SCOPES"
  - Search for ".../auth/drive.readonly"
  - Check the box for "https://www.googleapis.com/auth/drive.readonly"
  - Click "UPDATE" then "SAVE AND CONTINUE"
- On Test users page, add your Google account email
- Click "SAVE AND CONTINUE"

### 5. Create OAuth 2.0 Client ID
- Go to "APIs & Services" > "Credentials"
- Click "CREATE CREDENTIALS" > "OAuth client ID"
- Application type: "Chrome extension"
- Name: "Podium Extension"
- Item ID: Leave blank for now (we'll add it after first upload)
- Click "CREATE"
- Copy the Client ID (format: `xxxxx.apps.googleusercontent.com`)

### 6. Update manifest.json
- Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID
- Example:
  ```json
  "oauth2": {
    "client_id": "123456789-abcdefg.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.readonly"
    ]
  }
  ```

### 7. After Publishing Extension (if publishing to Chrome Web Store)
- Go back to Google Cloud Console > Credentials
- Edit your OAuth Client ID
- Add your extension's ID to "Item ID" field
- Extension ID can be found at `chrome://extensions` after loading unpacked

## Testing Locally

You can test the extension without publishing:
1. Load unpacked extension in Chrome (`chrome://extensions` > Developer mode > Load unpacked)
2. The OAuth flow will work for any Google account you add as a "Test user" in the OAuth consent screen
3. No need to add extension ID to OAuth client until you publish

## Scopes Used

- `https://www.googleapis.com/auth/drive.readonly` - Read-only access to Google Drive files

This is a minimal scope that allows Podium to:
- List PDF files in your Drive
- Download PDF content for viewing
- Read file metadata (name, size, dates)

Podium never writes to or modifies your Google Drive files.
