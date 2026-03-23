// web/js/liveRooms.js
function renderLiveRooms(rooms) {
  const list  = document.getElementById('live-list');
  const count = document.getElementById('live-count');
  if (!list) return;

  const totalPlayers = rooms.reduce((s, r) => s + r.players, 0);
  count.textContent = rooms.length + ' room' + (rooms.length !== 1 ? 's' : '')
    + (totalPlayers ? ' · ' + totalPlayers + ' playing' : '');

  if (!rooms.length) {
    list.innerHTML = '<div class="live-empty">No active rooms yet\u2026</div>';
    return;
  }

  list.innerHTML = rooms.map(r => `
    <div class="live-room">
      <span class="live-code">${sanitizeDisplay(r.code)}</span>
      <div class="live-meta">
        <div class="live-topic">${sanitizeDisplay(r.topic)}</div>
        <div class="live-sub">Q${r.q} of ${r.total}</div>
      </div>
      <div class="live-players"><strong>${r.players}</strong><br>players</div>
    </div>
  `).join('');
}

// Prevent XSS in server-sent display strings
function sanitizeDisplay(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .slice(0, 60);
}
