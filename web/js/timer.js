'use strict';

/**
 * TimerManager — drives the SVG ring countdown displayed during a question.
 * The ring shrinks from full to empty over `duration` seconds.
 */
class TimerManager {
  constructor() {
    this._interval = null;
    this._CIRC     = 163.4; // 2π × r (r = 26)
  }

  /**
   * Start the visual countdown.
   * @param {number} duration  Total seconds for this question.
   */
  start(duration) {
    this.stop();
    const arc = Utils.q('#timer-arc');
    const num = Utils.q('#timer-num');
    let rem = duration;

    const tick = () => {
      const pct = rem / duration;
      arc.style.strokeDashoffset = this._CIRC * (1 - pct);
      arc.style.stroke = rem <= 10 ? '#dc2626' : 'var(--accent)';
      num.textContent  = rem;
      num.className    = 'timer-num' + (rem <= 10 ? ' urgent' : '');
      if (rem <= 0) this.stop();
      rem--;
    };

    tick();
    this._interval = setInterval(tick, 1000);
  }

  /** Cancel the running countdown. */
  stop() {
    clearInterval(this._interval);
    this._interval = null;
  }
}
