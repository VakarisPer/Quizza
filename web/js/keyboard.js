'use strict';

/**
 * KeyboardController — attaches document-level keyboard listeners.
 *
 *  Enter   → submit the form on the home screen
 *  1-4     → pick an answer on the game screen
 */
class KeyboardController {
  /** Attach all listeners. Call once after the DOM is ready. */
  init() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')                        this._onEnter();
      if (['1','2','3','4'].includes(e.key))         this._onNumber(parseInt(e.key) - 1);
    });

    // Auto-uppercase and sanitise the room-code input field.
    Utils.q('#j-code').addEventListener('input', function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }

  // ── Private ───────────────────────────────────────────────

  _onEnter() {
    const active = Utils.q('.screen.active');
    if (active?.id !== 'screen-home') return;
    const isCreate = Utils.q('#tab-create').classList.contains('active');
    isCreate ? App.lobby.createRoom() : App.lobby.joinRoom();
  }

  _onNumber(idx) {
    if (!Utils.q('#screen-game').classList.contains('active')) return;
    const btn = Utils.q('#opt-' + idx);
    if (btn && !btn.disabled) App.game.pickAnswer(idx);
  }
}
