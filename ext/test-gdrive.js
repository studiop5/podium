import { gdriveIdentity } from './src/gdrive-identity.js';

// Helper to display output
function showOutput(elementId, message, isError = false) {
  const output = document.getElementById(elementId);
  output.textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
  output.className = 'output ' + (isError ? 'error' : 'success');
}

// Show extension info
const extensionId = chrome.runtime.id;
const manifest = chrome.runtime.getManifest();
showOutput('info-output',
  `Extension ID: ${extensionId}\n` +
  `Version: ${manifest.version}\n` +
  `OAuth2 Client ID: ${manifest.oauth2?.client_id || 'Not configured'}\n` +
  `Scopes: ${manifest.oauth2?.scopes?.join(', ') || 'None'}`
);

// Google Drive tests
document.getElementById('gdrive-login').addEventListener('click', async () => {
  try {
    showOutput('gdrive-output', 'Authenticating with Google Drive...\nThis may open a login popup.');
    const token = await gdriveIdentity.getToken(true);
    showOutput('gdrive-output',
      `✓ Login successful!\n\n` +
      `Token (first 30 chars): ${token.substring(0, 30)}...\n\n` +
      `You can now list files or test other operations.`
    );
  } catch (error) {
    showOutput('gdrive-output', `✗ Login failed:\n\n${error.message}\n\nStack:\n${error.stack}`, true);
  }
});

document.getElementById('gdrive-list').addEventListener('click', async () => {
  try {
    showOutput('gdrive-output', 'Fetching PDF files from Google Drive...');
    const result = await gdriveIdentity.listFiles();

    const files = result.files || [];
    let output = `✓ Found ${files.length} PDF file(s):\n\n`;

    if (files.length > 0) {
      files.forEach((file, idx) => {
        output += `${idx + 1}. ${file.name}\n`;
        output += `   ID: ${file.id}\n`;
        output += `   Size: ${file.size ? (parseInt(file.size) / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}\n`;
        output += `   Modified: ${file.modifiedTime || 'Unknown'}\n\n`;
      });
    } else {
      output += '(No PDF files found in your Google Drive)\n';
    }

    output += '\nFull response:\n' + JSON.stringify(result, null, 2);

    showOutput('gdrive-output', output);
  } catch (error) {
    showOutput('gdrive-output', `✗ Error listing files:\n\n${error.message}\n\nStack:\n${error.stack}`, true);
  }
});

document.getElementById('gdrive-logout').addEventListener('click', async () => {
  try {
    showOutput('gdrive-output', 'Logging out...');
    await gdriveIdentity.removeToken();
    showOutput('gdrive-output', '✓ Logged out successfully.\n\nYou\'ll need to login again to access Google Drive.');
  } catch (error) {
    showOutput('gdrive-output', `✗ Logout failed:\n\n${error.message}`, true);
  }
});
