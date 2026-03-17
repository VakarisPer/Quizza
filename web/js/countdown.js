'use strict';

/**
 * CountdownOverlay — shows a full-screen animated 3 → 2 → 1 countdown
 * before the first question appears.
 */
class CountdownOverlay {
  constructor() {
    this._interval = null;
    this._el       = Utils.q('#overlay-countdown');
    this._numEl    = Utils.q('#cd-num');
  }

  /**
   * Display and animate the countdown from `from` down to 1.
   * @param {number} from  Starting number (usually 3).
   */
  show(from) {
    this._el.classList.add('show');
    this._numEl.textContent = from;
    this._restartAnim();
    clearInterval(this._interval);

    let n = from;
    this._interval = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(this._interval); return; }
      this._numEl.textContent = n;
      this._restartAnim();
    }, 1000);
  }

  /** Remove the overlay immediately. */
  hide() {
    this._el.classList.remove('show');
    clearInterval(this._interval);
  }

  // ── private ──────────────────────────────────────────────

  /** Force the CSS animation to replay on the number element. */
  _restartAnim() {
    this._numEl.style.animation = 'none';
    void this._numEl.offsetWidth; // trigger reflow
    this._numEl.style.animation  = 'cdPop 1s ease-out';
  }
}
