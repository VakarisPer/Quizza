'use strict';

/**
 * LobbyController — handles everything on the Home and Lobby screens:
 * creating/joining rooms, settings, file upload, and the room code.
 */
class LobbyController {
  constructor() {
    this._roomCode = null;
  }

  /** The current room code (null before a room is created/joined). */
  get roomCode() { return this._roomCode; }

  // ── Tab switching ─────────────────────────────────────────

  /** Toggle between "Create Room" and "Join Room" panels. */
  setTab(t) {
    Utils.q('#panel-create').style.display = t === 'create' ? '' : 'none';
    Utils.q('#panel-join').style.display   = t === 'join'   ? '' : 'none';
    Utils.q('#tab-create').classList.toggle('active', t === 'create');
    Utils.q('#tab-join').classList.toggle('active',   t === 'join');
  }

  // ── Room actions ──────────────────────────────────────────

  /** Validate name and ask the server to create a new room. */
  createRoom() {
    const name = Utils.q('#c-name').value.trim();
    if (!name) { App.toast.show('Please enter your name', 'err'); return; }
    App.state.myName = name;
    App.state.isHost = true;
    App.conn.send({ type: 'create_room', name });
  }

  /** Validate name + code and ask the server to join. */
  joinRoom() {
    const name = Utils.q('#j-name').value.trim();
    const code = Utils.q('#j-code').value.trim().toUpperCase();
    if (!name) { App.toast.show('Please enter your name', 'err'); return; }
    if (code.length < 4) { App.toast.show('Enter the 5-letter room code', 'err'); return; }
    App.state.myName = name;
    App.state.isHost = false;
    App.conn.send({ type: 'join_room', name, code });
  }

  /** Copy the room code to the clipboard. */
  copyCode() {
    if (!this._roomCode) return;
    navigator.clipboard.writeText(this._roomCode)
      .then(() => App.toast.show('Room code copied!', 'ok'));
  }

  /** Store and display the room code received from the server. */
  setCode(code) {
    this._roomCode = code;
    Utils.q('#lobby-code').textContent = code;
  }

  /** Leave the room and return to the home screen. */
  leaveRoom() {
    App.conn.send({ type: 'leave_room' });
    this._roomCode   = null;
    App.state.isHost = false;
    App.state.myPid  = null;
    App.state.myName = '';
    App.screens.show('screen-home');
  }

  // ── AI source ─────────────────────────────────────────────

  /** Send the pasted/loaded context text to the server. */
  saveContext() {
    const text = Utils.q('#ctx-text').value.trim();
    if (!text) { App.toast.show('Please enter some text first', 'err'); return; }
    App.conn.send({ type: 'set_context', context: text });
    Utils.q('#ctx-saved-notice').classList.remove('hidden');
    App.toast.show('AI source saved!', 'ok');
  }

  /** Handle a drag-and-drop file onto the upload zone. */
  handleDrop(e) {
    e.preventDefault();
    Utils.q('#upload-zone').classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) this._loadFile(file);
  }

  /** Handle a file chosen through the file input element. */
  handleFileSelect(e) {
    const file = e.target?.files?.[0];
    if (file) this._loadFile(file);
  }

  // ── Game settings ─────────────────────────────────────────

  /** Ask the server to start the game with the configured settings. */
  startGame() {
    const questions = parseInt(Utils.q('#r-questions').value);
    const timer     = parseInt(Utils.q('#r-timer').value);
    App.conn.send({ type: 'start_game', questions, timer });
  }

  // ── Panel visibility ──────────────────────────────────────

  /** Show host controls (settings, start button). */
  showAsHost() {
    Utils.q('#host-panel').style.display  = '';
    Utils.q('#player-wait').style.display = 'none';
  }

  /** Show the "waiting for host" notice for non-host players. */
  showAsPlayer() {
    Utils.q('#host-panel').style.display  = 'none';
    Utils.q('#player-wait').style.display = '';
  }

  /** Reset lobby UI after a "play again" / lobby reset event. */
  reset() {
    Utils.q('#lobby-code').textContent = this._roomCode || '—';
    if (App.state.isHost) this.showAsHost();
    else                   this.showAsPlayer();
    Utils.setNotice('lobby-notice', '', '');
    App.screens.show('screen-lobby');
  }

  // ── Private ───────────────────────────────────────────────

  _loadFile(file) {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      App.toast.show('Only .txt files are supported', 'err');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      Utils.q('#ctx-text').value = text;
      const lbl = Utils.q('#file-label');
      lbl.textContent = `Loaded: ${file.name} (${Math.round(text.length / 1024 * 10) / 10} KB)`;
      lbl.classList.remove('hidden');
      App.toast.show('File loaded: ' + file.name, 'ok');
    };
    reader.readAsText(file);
  }
}
