'use strict';

class ScreenRegLog {
  static get html() {
    return `
      <div class="screen" id="screen-reglog">
        <div style="text-align:center; padding-top:36px; margin-bottom:20px;">
          <div class="logo">QUIZ<em>ZA</em></div>
          <div class="tagline">Real-time multiplayer quiz game</div>
        </div>

        <div class="card">
          <div class="tabs">
            <button type="button" class="tab-btn active" id="tab-login"
              onclick="ScreenRegLog.setTab('login')">Log In</button>
            <button type="button" class="tab-btn" id="tab-register"
              onclick="ScreenRegLog.setTab('register')">Register</button>
          </div>

          <!-- Login panel -->
          <div id="panel-login">
            <div class="field">
              <label for="login-email">Email</label>
              <input type="email" id="login-email" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="field mt12">
              <label for="login-password">Password</label>
              <div class="password-wrap">
                <input type="password" id="login-password" placeholder="Enter your password" autocomplete="current-password">
                <button type="button" class="password-toggle" onclick="ScreenRegLog.togglePassword('login-password', this)" aria-label="Show password">
                  <svg class="eye-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg class="eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="2" y1="2" x2="22" y2="22"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="auth-error hidden" id="login-error" style="display: none;"></div>
            <button type="button" class="btn btn-primary btn-full btn-lg mt8" id="login-btn"
              onclick="ScreenRegLog.login()">
              Log In
            </button>
            <p class="auth-switch">
              Don't have an account?
              <a href="#" onclick="ScreenRegLog.setTab('register'); return false;">Register</a>
            </p>
          </div>

          <!-- Register panel -->
          <div id="panel-register" style="display:none;">
            <div class="field">
              <label for="reg-username">Username</label>
              <input type="text" id="reg-username" placeholder="Choose a username" maxlength="20" autocomplete="username" spellcheck="false">
            </div>
            <div class="field mt12">
              <label for="reg-email">Email</label>
              <input type="email" id="reg-email" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="field mt12">
              <label for="reg-password">Password</label>
              <div class="password-wrap">
                <input type="password" id="reg-password" placeholder="At least 6 characters" autocomplete="new-password">
                <button type="button" class="password-toggle" onclick="ScreenRegLog.togglePassword('login-password', this)" aria-label="Show password">
                  <svg class="eye-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg class="eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="2" y1="2" x2="22" y2="22"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="field mt12">
              <label for="reg-password2">Confirm Password</label>
              <div class="password-wrap">
                <input type="password" id="reg-password2" placeholder="Re-enter your password" autocomplete="new-password">
                <button type="button" class="password-toggle" onclick="ScreenRegLog.togglePassword('login-password', this)" aria-label="Show password">
                  <svg class="eye-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg class="eye-closed" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                    <line x1="2" y1="2" x2="22" y2="22"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="auth-error hidden" id="reg-error" style="display: none;"></div>
            <button type="button" class="btn btn-primary btn-full btn-lg mt8" id="reg-btn"
              onclick="ScreenRegLog.register()">
              Create Account
            </button>
            <p class="auth-switch">
              Already have an account?
              <a href="#" onclick="ScreenRegLog.setTab('login'); return false;">Log In</a>
            </p>
          </div>
        </div>

        <div class="auth-divider">
          <span>or continue without an account</span>
        </div>

        <button type="button" class="btn btn-ghost btn-full btn-lg"
          onclick="App.screens.show('screen-home')">
          Play as Guest
        </button>
      </div>`;
  }

  /* ── Tab switching ── */
  static setTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('panel-login').style.display = isLogin ? '' : 'none';
    document.getElementById('panel-register').style.display = isLogin ? 'none' : '';
  }

  /* ── Show / hide password ── */
  static togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    btn.querySelector('.eye-open').style.display = isHidden ? 'none' : '';
    btn.querySelector('.eye-closed').style.display = isHidden ? '' : 'none';
  }

  /* ── Login (stub — wire to Supabase later) ── */
  static async login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');

    if (!email || !password) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.classList.remove('hidden');
      return;
    }

    const { data: authData, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }

    const username = authData.user.user_metadata.username;
    App.state.user = authData.user;
    document.getElementById('auth-toggle').textContent = username;
    const cName = document.getElementById('c-name');
    const jName = document.getElementById('j-name');
    if (cName) cName.value = username;
    if (jName) jName.value = username;
    App.screens.show('screen-home');
  }

  /* ── Register (stub — wire to Supabase later) ── */
  static async register() {
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    const errEl = document.getElementById('reg-error');
    errEl.classList.add('hidden');

    if (!username || !email || !password || !password2) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errEl.textContent = 'Password must be at least 6 characters.';
      errEl.classList.remove('hidden');
      return;
    }
    if (password !== password2) {
      errEl.textContent = 'Passwords do not match.';
      errEl.classList.remove('hidden');
      return;
    }

    const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  App.toast.show('Account created! Check your email to confirm.', 'ok');
  ScreenRegLog.setTab('login');
  }
  
}
