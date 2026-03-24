'use strict';

class ScreenResults {
  static get html() {
    return `
      <div class="screen wide" id="screen-results">
        <div class="topbar">
          <div class="logo">Quiz<em style="color:var(--accent)">za</em></div>
        </div>

        <div class="card">
          <div class="card-title" style="text-align:center;">Game Over</div>
          <div class="winner-section">
            <div class="winner-crown-icon">&#9733;</div>
            <div class="winner-lbl">Winner</div>
            <div class="winner-nm" id="res-winner">—</div>
            <div class="winner-pts" id="res-winner-pts"></div>
          </div>
        </div>

        <!-- Banner ad (results screen) -->
        <div class="ad-banner-strip"></div>

        <div class="card">
          <div class="card-title">Final Scores</div>
          <div id="res-lb"></div>
        </div>

        <div class="btn-group" id="res-actions"></div>
      </div>`;
  }
}
