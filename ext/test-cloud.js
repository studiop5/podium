import { onedriveIdentity, dropboxIdentity } from './src/cloud-identity.js';

// Helper to display output
function showOutput(elementId, message, isError = false) {
  const output = document.getElementById(elementId);
  output.textContent = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
  output.className = 'output ' + (isError ? 'error' : 'success');
}

// OneDrive tests
document.getElementById('onedrive-login').addEventListener('click', async () => {
  try {
    showOutput('onedrive-output', 'Authenticating...');
    const token = await onedriveIdentity.getToken();
    showOutput('onedrive-output', `Login successful!\nToken: ${token.substring(0, 20)}...`);
  } catch (error) {
    showOutput('onedrive-output', `Error: ${error.message}`, true);
  }
});

document.getElementById('onedrive-list').addEventListener('click', async () => {
  try {
    showOutput('onedrive-output', 'Fetching files...');
    const result = await onedriveIdentity.listFiles();
    showOutput('onedrive-output', `Found ${result.value?.length || 0} PDF files:\n\n${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    showOutput('onedrive-output', `Error: ${error.message}`, true);
  }
});

document.getElementById('onedrive-logout').addEventListener('click', async () => {
  try {
    await onedriveIdentity.removeToken();
    showOutput('onedrive-output', 'Logged out successfully');
  } catch (error) {
    showOutput('onedrive-output', `Error: ${error.message}`, true);
  }
});

// Dropbox tests
document.getElementById('dropbox-login').addEventListener('click', async () => {
  try {
    showOutput('dropbox-output', 'Authenticating...');
    const token = await dropboxIdentity.getToken();
    showOutput('dropbox-output', `Login successful!\nToken: ${token.substring(0, 20)}...`);
  } catch (error) {
    showOutput('dropbox-output', `Error: ${error.message}`, true);
  }
});

document.getElementById('dropbox-list').addEventListener('click', async () => {
  try {
    showOutput('dropbox-output', 'Fetching files...');
    const result = await dropboxIdentity.listFiles();
    showOutput('dropbox-output', `Found ${result.matches?.length || 0} PDF files:\n\n${JSON.stringify(result, null, 2)}`);
  } catch (error) {
    showOutput('dropbox-output', `Error: ${error.message}`, true);
  }
});

document.getElementById('dropbox-logout').addEventListener('click', async () => {
  try {
    await dropboxIdentity.removeToken();
    showOutput('dropbox-output', 'Logged out successfully');
  } catch (error) {
    showOutput('dropbox-output', `Error: ${error.message}`, true);
  }
});
