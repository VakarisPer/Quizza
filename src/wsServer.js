'use strict';

const WebSocket      = require('ws');
const log            = require('./logger');
const Utils          = require('./utils');
const RoomHelpers    = require('./roomHelpers');
const MessageHandler = require('./messageHandler');
const RoomStore      = require('./roomStore');

const sanitize = s => String(s).replace(/[<>"'&]/g, '').trim().slice(0, 20);

// Module-level wss reference so broadcastRoomsUpdate can be called from anywhere
let _wss = null;

function broadcastRoomsUpdate() {
  if (!_wss) return;
  const payload = JSON.stringify({
    type: 'rooms_update',
    rooms: RoomHelpers.getRoomsSummary(RoomStore.rooms),
  });
  _wss.clients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

/**
 * WsServer — wraps `ws.Server`, assigns player IDs on connect,
 * and forwards every incoming message to MessageHandler.
 */
class WsServer {
  /**
   * @param {import('http').Server} httpServer  The existing HTTP server to upgrade.
   */
  constructor(httpServer) {
    this._wss = new WebSocket.Server({ server: httpServer });
    _wss = this._wss;
    this._wss.on('connection', (ws, req) => this._onConnection(ws, req));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _onConnection(ws, req) {
    const pid = Utils.makePid();
    const ip  = req.socket.remoteAddress;
    log.info('WS', `New connection: ${pid} from ${ip}`);

    // Per-socket rate limiting state
    ws._msgCount  = 0;
    ws._msgWindow = Date.now();

    // Send the current live room list to the new client
    try {
      ws.send(JSON.stringify({
        type: 'rooms_update',
        rooms: RoomHelpers.getRoomsSummary(RoomStore.rooms),
      }));
    } catch { /* dead socket */ }

    // Let the client know its assigned ID
    ws.send(JSON.stringify({ type: 'connected', pid, version: 'node-2.0' }));

    ws.on('message', raw => this._onMessage(ws, pid, raw));
    ws.on('close',  (code) => this._onClose(pid, code));
    ws.on('error',  err   => log.error('WS', `Socket error for ${pid}:`, err.message));
  }

  _onMessage(ws, pid, raw) {
    // ── Rate limiting: max 30 messages per 5-second window ──────────────────
    const now = Date.now();
    if (now - ws._msgWindow > 5000) {
      ws._msgCount  = 0;
      ws._msgWindow = now;
    }
    ws._msgCount += 1;
    if (ws._msgCount > 30) {
      log.warn('WS', `Rate limit exceeded for ${pid}, closing`);
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    // ── Parse ────────────────────────────────────────────────────────────────
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      log.warn('WS', `${pid} sent invalid JSON: ${String(raw).slice(0, 80)}`);
      try { ws.send(JSON.stringify({ type: 'error', msg: 'Invalid JSON received.' })); } catch { /**/ }
      return;
    }

    // ── Input validation ─────────────────────────────────────────────────────
    if (msg.name !== undefined) {
      if (typeof msg.name !== 'string' || msg.name.length > 20) {
        log.warn('WS', `${pid} sent invalid name`);
        try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid input' })); } catch { /**/ }
        return;
      }
      // Strip HTML from name before forwarding
      msg.name = sanitize(msg.name);
    }

    if (msg.type === 'join_room') {
      const code = String(msg.code || '').toUpperCase().trim();
      if (!/^[A-Z0-9]{5}$/.test(code)) {
        log.warn('WS', `${pid} sent invalid room code: ${msg.code}`);
        try { ws.send(JSON.stringify({ type: 'error', message: 'Invalid input' })); } catch { /**/ }
        return;
      }
      msg.code = code; // normalise to uppercase
    }

    MessageHandler.handle(ws, pid, msg);
  }

  _onClose(pid, code) {
    log.info('WS', `Disconnected: ${pid} (code ${code})`);
    RoomHelpers.removePlayer(pid);
    broadcastRoomsUpdate();
  }
}

module.exports = WsServer;
module.exports.broadcastRoomsUpdate = broadcastRoomsUpdate;
