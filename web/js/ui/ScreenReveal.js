'use strict';

class ScreenReveal {
  static get html() {
    return `
      <div class="screen wide" id="screen-reveal">
        <div class="q-topbar">
          <div class="q-chip">Q&thinsp;<span class="q-chip-num" id="rv-qnum">1</span><span class="q-chip-sep">of</span><span id="rv-qtotal">10</span></div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="next-q-line">Next in <span id="rv-next">10</span>s</div>
            <button type="button" class="btn btn-ghost btn-sm" id="rv-skip-btn" onclick="App.game.voteSkip()">Skip (0/1)</button>
          </div>
        </div>

        <div class="card">
          <div class="result-hero">
            <div class="result-verdict" id="rv-verdict">Correct!</div>
            <div class="result-points-line mt8">Earned: <span id="rv-pts">+0</span></div>
            <div class="result-points-line mt8">Your score: <span id="rv-total">0</span></div>
            <div class="result-points-line mt8" id="rv-streak" style="color:#7c3aed;"></div>
          </div>
          <div class="explanation-box hidden" id="rv-explanation"></div>
        </div>

        <div class="card">
          <div class="card-title">Leaderboard</div>
          <div id="rv-lb"></div>
        </div>
      </div>`;
  }
}
