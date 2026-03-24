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

  list.innerHTML = rooms.map(r => {
    const code  = sanitizeDisplay(r.code);
    const topic = sanitizeDisplay(r.topic);
    return `
    <div class="live-room" onclick="joinFromLiveRoom('${code}')" title="Click to join">
      <span class="live-code">${code}</span>
      <div class="live-meta">
        <div class="live-topic">${topic}</div>
        <div class="live-sub">Q${r.q} of ${r.total}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <div class="live-players"><strong>${r.players}</strong> players</div>
        <div class="live-join-hint">Join &rarr;</div>
      </div>
    </div>`;
  }).join('');
}

/** Pre-fill the join form with the selected room code and switch to the join tab. */
function joinFromLiveRoom(code) {
  App.lobby.setTab('join');
  const el = document.getElementById('j-code');
  if (el) el.value = code;
  const home = document.getElementById('screen-home');
  if (home) home.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Prevent XSS in server-sent display strings
function sanitizeDisplay(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .slice(0, 60);
}
