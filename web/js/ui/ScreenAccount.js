'use strict';

class ScreenAccount {
  static get html() {
    return `
      <div class="screen" id="screen-account">
        <div style="text-align:center; padding-top:36px; margin-bottom:20px;">
          <div class="logo">QUIZ<em>ZA</em></div>
        </div>

        <div class="card">
          <h2 style="margin-bottom:1.5rem;">My Account</h2>

          <div class="field">
            <label>Username</label>
            <p id="account-username" style="font-weight:600;"></p>
          </div>

          <div class="field mt12">
            <label>Email</label>
            <p id="account-email" style="color: var(--text-secondary);"></p>
          </div>

          <div class="field mt12">
            <label>Member since</label>
            <p id="account-created" style="color: var(--text-secondary);"></p>
          </div>

          <button type="button" class="btn btn-danger btn-full mt8"
            onclick="ScreenAccount.logout()">
            Log Out
          </button>

          <button type="button" class="btn btn-ghost btn-full mt8"
            onclick="App.screens.show('screen-home')">
            ← Back
          </button>
        </div>
      </div>`;
  }

  static show() {
    const user = App.state.user;
    if (!user) return;
    document.getElementById('account-username').textContent = user.user_metadata.username;
    document.getElementById('account-email').textContent = user.email;
    document.getElementById('account-created').textContent = new Date(user.created_at).toLocaleDateString();
    App.screens.show('screen-account');
  }

  static async logout() {
    await supabaseClient.auth.signOut();
    App.state.user = null;
    const btn = document.getElementById('auth-toggle');
    btn.textContent = 'Log In';
    btn.onclick = () => App.screens.show('screen-reglog');
    document.getElementById('c-name').value = '';
    document.getElementById('j-name').value = '';
    App.screens.show('screen-home');
    App.toast.show('Logged out', 'ok');
  }
}