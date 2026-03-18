'use strict';

/**
 * CountdownOverlay — shows a full-screen animated 3 → 2 → 1 countdown,
 * then transitions to a loading screen while questions are generated.
 */
class CountdownOverlay {
  constructor() {
    this._interval       = null;
    this._loadingInterval = null;
    this._el             = Utils.q('#overlay-countdown');
    this._numEl          = Utils.q('#cd-num');
    this._labelEl        = Utils.q('#cd-label');
    this._loadingEl      = Utils.q('#cd-loading');
    this._estEl          = Utils.q('#cd-est');
  }

  /**
   * Display and animate the countdown from `from` down to 1,
   * then automatically switch to the loading screen.
   * @param {number} from  Starting number (usually 3).
   */
  show(from) {
    this._el.classList.add('show');
    this._showCountdownMode();
    this._numEl.textContent = from;
    this._restartAnim();
    clearInterval(this._interval);
    clearInterval(this._loadingInterval);

    let n = from;
    this._interval = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(this._interval);
        this._switchToLoading();
        return;
      }
      this._numEl.textContent = n;
      this._restartAnim();
    }, 1000);
  }

  /** Remove the overlay and reset to countdown mode. */
  hide() {
    this._el.classList.remove('show');
    clearInterval(this._interval);
    clearInterval(this._loadingInterval);
    this._showCountdownMode();
  }

  // ── private ──────────────────────────────────────────────

  _showCountdownMode() {
    this._numEl.style.display    = '';
    this._labelEl.style.display  = '';
    this._loadingEl.classList.add('hidden');
    clearInterval(this._loadingInterval);
  }

  _switchToLoading() {
    this._numEl.style.display   = 'none';
    this._labelEl.style.display = 'none';
    this._loadingEl.classList.remove('hidden');

    let elapsed = 0;
    this._estEl.textContent = '0s elapsed';
    this._loadingInterval = setInterval(() => {
      elapsed++;
      this._estEl.textContent = `${elapsed}s elapsed`;
    }, 1000);
  }

  /** Force the CSS animation to replay on the number element. */
  _restartAnim() {
    this._numEl.style.animation = 'none';
    void this._numEl.offsetWidth; // trigger reflow
    this._numEl.style.animation  = 'cdPop 1s ease-out';
  }
}
