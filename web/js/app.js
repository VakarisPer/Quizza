'use strict';

/**
 * App — top-level namespace that owns every singleton instance.
 *
 * Load order in index.html must be:
 *   utils.js → state.js → toast.js → screens.js → connection.js
 *   → timer.js → countdown.js → renderer.js → lobby.js → game.js
 *   → messages.js → keyboard.js → app.js
 *
 * Any module can reference App.* once app.js has run.
 */
const App = (() => {
  // Instantiate all singletons.
  const state     = AppState;
  const toast     = new Toast();
  const screens   = new ScreenManager();
  const timer     = new TimerManager();
  const countdown = new CountdownOverlay();
  const renderer  = new GameRenderer();
  const lobby     = new LobbyController();
  const game      = new GameController();
  const handler   = new MessageHandler();
  const keyboard  = new KeyboardController();

  // ConnectionManager needs `handler` to be ready before messages arrive,
  // so it's created last and stored on the namespace before connect() is called.
  const conn = new ConnectionManager((msg) => handler.handle(msg));

  /** Boot: attach keyboard listeners and open the WebSocket. */
  function init() {
    keyboard.init();
    conn.connect();
  }

  // Expose everything so modules can call App.toast.show(), etc.
  return { state, toast, screens, timer, countdown, renderer, lobby, game, conn, init };
})();

// ── Boot ──────────────────────────────────────────────────────
App.init();
