'use strict';

class ScreenGame {
  static get html() {
    return `
      <div class="screen wide" id="screen-game">
        <div class="q-topbar">
          <div class="q-chip">Q&thinsp;<span class="q-chip-num" id="g-qnum">1</span><span class="q-chip-sep">of</span><span id="g-qtotal">10</span></div>

          <div class="timer-wrap">
            <svg width="62" height="62" viewBox="0 0 62 62">
              <circle cx="31" cy="31" r="26" fill="none" stroke="#e0e0e0" stroke-width="4" />
              <circle id="timer-arc" cx="31" cy="31" r="26" fill="none" stroke="var(--accent)" stroke-width="4"
                stroke-dasharray="163.4" stroke-dashoffset="0" stroke-linecap="round" />
            </svg>
            <div class="timer-num" id="timer-num">35</div>
          </div>

          <div class="q-topic-pill" id="g-topic">General</div>
        </div>

        <div class="card">
          <div class="q-text" id="g-question">Loading question…</div>
          <div class="options-grid" id="g-options"></div>
        </div>

        <div class="answered-status" id="g-answered"></div>

        <div class="card mt12" id="game-lb-card" style="display:none;">
          <div class="card-title">Standings</div>
          <div id="game-lb"></div>
        </div>
      </div>`;
  }
}
