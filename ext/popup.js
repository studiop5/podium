document.getElementById('launch').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('podium.html') });
  window.close();
});

// Check if current tab has a PDF we can import
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  let url = tab.url;
  // Chrome's PDF viewer (and Adobe Acrobat extension) wraps URLs like:
  // chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj/https://example.com/file.pdf
  const extPrefix = url.match(/^chrome-extension:\/\/[a-z]+\/(https?:\/\/.+)/i);
  if (extPrefix) url = extPrefix[1];

  // Match direct PDF URLs, IMSLP PDF servers, and Chrome's built-in PDF viewer
  const isPdf = /\.pdf(\?|#|$)/i.test(url)
    || /\/(vmirror|ks\d+|s\d+)\.imslp\.org\/files\//i.test(url)
    || /petruccimusiclibrary\.ca\/files\//i.test(url)
    || /imslp\.(eu|tw)\/files\//i.test(url);

  if (!isPdf) return;

  // Extract a display name from the URL
  let name = decodeURIComponent(url.split('/').pop().split('?')[0].split('#')[0]);
  if (name.length > 50) {
    name = name.slice(0, 30) + '...' + name.slice(-17);
  }

  const btn = document.getElementById('import');
  btn.innerHTML = '<span class="tab-name">Open in Podium: ' + name + '</span>';
  btn.style.display = 'flex';
  btn.addEventListener('click', async () => {
    // Ensure we have broad host permission so Podium can fetch the PDF
    const has = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    if (!has) {
      const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
      if (!granted) return;
    }
    const podiumUrl = chrome.runtime.getURL('podium.html') + '?url=' + encodeURIComponent(url);
    chrome.tabs.create({ url: podiumUrl });
    window.close();
  });
})();

// Truncate name showing beginning and end
function truncateName(name, maxLen = 50) {
  if (name.length <= maxLen) return name;
  const keepStart = Math.floor(maxLen * 0.6);
  const keepEnd = maxLen - keepStart - 3;
  return name.slice(0, keepStart) + '...' + name.slice(-keepEnd);
}

// Load and display recent files
const recentDiv = document.getElementById('recent');
const allRecent = JSON.parse(localStorage.getItem('recent') || '[]');
const recent = allRecent.slice(0, 5);

if (recent.length > 0) {
  recentDiv.innerHTML = '<div class="recent-header">Recent:</div>';
  recent.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'recent-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = truncateName(item.name);
    nameSpan.title = item.name;

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '\u270E';
    editBtn.title = 'Rename';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.className = 'name-input';
      input.value = item.name.replace(/\.pdf$/i, '');
      nameSpan.replaceWith(input);
      editBtn.style.display = 'none';
      input.focus();
      input.select();

      const commit = () => {
        let newName = input.value.trim();
        if (!newName) newName = item.name;
        else if (!newName.toLowerCase().endsWith('.pdf')) newName += '.pdf';
        allRecent[index].name = newName;
        localStorage.setItem('recent', JSON.stringify(allRecent));
        nameSpan.textContent = truncateName(newName);
        nameSpan.title = newName;
        input.replaceWith(nameSpan);
        editBtn.style.display = '';
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
          input.value = item.name.replace(/\.pdf$/i, '');
          input.blur();
        }
      });
    });

    div.addEventListener('click', () => {
      let url = chrome.runtime.getURL('podium.html');
      if (item.source === 'WWW' && item.path) {
        url += '?url=' + encodeURIComponent(item.path);
      } else {
        url += '?open=' + encodeURIComponent(item.name);
      }
      chrome.tabs.create({ url });
      window.close();
    });

    div.appendChild(nameSpan);
    div.appendChild(editBtn);
    recentDiv.appendChild(div);
  });
} else {
  recentDiv.innerHTML = '<div class="recent-header">Recent:</div><div class="no-recent">No recent files</div>';
}