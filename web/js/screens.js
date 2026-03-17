'use strict';

/**
 * ScreenManager — activates one named screen at a time.
 * Every screen element must carry the CSS class "screen".
 */
class ScreenManager {
  /**
   * Show the screen whose id matches `id`, hide all others.
   * @param {string} id  Element id (e.g. 'screen-home')
   */
  show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = Utils.q('#' + id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }
}
