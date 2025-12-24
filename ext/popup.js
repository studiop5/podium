document.getElementById('launch').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('podium.html') });
  window.close();
});

// Truncate name showing beginning and end
function truncateName(name, maxLen = 50) {
  if (name.length <= maxLen) return name;
  const keepStart = Math.floor(maxLen * 0.6);
  const keepEnd = maxLen - keepStart - 3;
  return name.slice(0, keepStart) + '...' + name.slice(-keepEnd);
}

// Load and display recent files
const recentDiv = document.getElementById('recent');
const recent = JSON.parse(localStorage.getItem('recent') || '[]').slice(0, 5);

if (recent.length > 0) {
  recentDiv.innerHTML = '<div class="recent-header">Recent:</div>';
  recent.forEach(item => {
    const div = document.createElement('div');
    div.className = 'recent-item';
    div.textContent = truncateName(item.name);
    div.title = item.name; // Full name on hover
    div.addEventListener('click', () => {
      // For URL sources, pass the URL; for others, open Podium with Open panel hint
      let url = chrome.runtime.getURL('podium.html');
      if (item.source === 'WWW' && item.path) {
        url += '?url=' + encodeURIComponent(item.path);
      } else {
        // For local files, pass hint to show Open panel as memory jog
        url += '?open=' + encodeURIComponent(item.name);
      }
      chrome.tabs.create({ url });
      window.close();
    });
    recentDiv.appendChild(div);
  });
} else {
  recentDiv.innerHTML = '<div class="recent-header">Recent:</div><div class="no-recent">No recent files</div>';
}
