'use strict';

/**
 * Templates — assembles all screen classes into #app.
 *
 * Must be loaded AFTER all Screen*.js files and BEFORE app.js,
 * so the DOM elements exist when the app modules initialise.
 *
 * Load order in index.html:
 *   ScreenHome → ScreenLobby → ScreenGame → ScreenReveal → ScreenResults
 *   → templates.js (auto-renders) → utils.js … → app.js
 */
class Templates {
  /** Inject every screen + footer into #app. */
  static render() {
    const app = document.getElementById('app');

    app.innerHTML =
      ScreenRegLog.html +
      ScreenHome.html +
      ScreenLobby.html +
      ScreenGame.html +
      ScreenReveal.html +
      ScreenResults.html +
      ScreenAccount.html +
      Templates._footerHtml;

    // Scripts inside innerHTML don't auto-execute, so push ad slots manually.
    try {
      document.querySelectorAll('.ad-banner-strip').forEach(() => {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      });
    } catch (e) { /* AdSense not loaded */ }
  }

  static get _footerHtml() {
    return `
      <footer id="quizza-footer">
        <div class="footer-top">
          <div class="footer-logo">QUIZ<em>ZA</em></div>
          <span class="footer-version">v1.1.0</span>
        </div>
        <div class="footer-links">
          <a href="/privacy.html">Privacy Policy</a>
          <a href="/terms.html">Terms of Service</a>
          <a href="mailto:vakaris.tech@gmail.com">Contact</a>
          <a href="mailto:vakaris.tech@gmail.com">Report a Bug</a>
          <a href="/about_us.html">About us</a>
        </div>
        <div class="footer-legal">
          &copy; 2025 Quizza. Built by Vakaris Perliba &amp; Vitas Novickas.<br>
          Questions are AI-generated for entertainment purposes only.
          By playing you agree to our
          <a href="/privacy.html">Privacy Policy</a> and
          <a href="/terms.html">Terms of Service</a>.
        </div>
      </footer>`;
  }
}

// Auto-render: screens are in the DOM before any app module runs.
Templates.render();
