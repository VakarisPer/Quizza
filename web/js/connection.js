'use strict';

/**
 * ConnectionManager — owns the WebSocket: connects, reconnects,
 * serialises outgoing messages, and dispatches incoming ones.
 */
class ConnectionManager {
  /**
   * @param {function(object): void} onMessage  Called with each parsed message object.
   */
  constructor(onMessage) {
    this._ws        = null;
    this._onMessage = onMessage;
    this._url       = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    this._hasConnectedBefore = false;
  }

  /** Open the WebSocket; automatically retries on close/error. */
  connect() {
    this._setStatus('pending', 'Connecting...');
    try {
      this._ws = new WebSocket(this._url);
    } catch {
      this._setStatus('err', 'Cannot reach server');
      setTimeout(() => this.connect(), 4000);
      return;
    }

    this._ws.onopen    = () => {
      this._setStatus('ok', 'Connected');
    };
    this._ws.onclose   = () => {
      this._setStatus('err', 'Disconnected — retrying...');
      setTimeout(() => this.connect(), 3000);
    };
    this._ws.onerror   = () => this._setStatus('err', 'Connection error');
    this._ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this._onMessage(m);
    };
  }

  /**
   * Serialise `obj` to JSON and send it over the socket.
   * @param {object} obj
   */
  send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    } else {
      App.toast.show('Not connected to server. Please wait...', 'err');
    }
  }

  // ── private ──────────────────────────────────────────────

  _setStatus(state, text) {
    const dot = Utils.q('#conn-dot');
    const lbl = Utils.q('#conn-text');
    if (!dot) return;
    dot.className  = 'conn-dot ' + state;
    lbl.textContent = text;
  }
}
