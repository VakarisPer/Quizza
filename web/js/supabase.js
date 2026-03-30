'use strict';

const supabaseClient = window.supabase.createClient(
  'https://pqysqriwkflcsinyxcyl.supabase.co',
  'sb_publishable_cYcSfUUlvSOxqxmRH2O4rQ_QOCexbRo'
);
setTimeout(() => {
  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) {
      const username = data.session.user.user_metadata.username;
      const btn = document.getElementById('auth-toggle');
      btn.textContent = username;
      btn.onclick = async () => {
        await supabaseClient.auth.signOut();
        btn.textContent = 'Log In';
        btn.onclick = () => App.screens.show('screen-reglog');
        document.getElementById('c-name').value = '';
        document.getElementById('j-name').value = '';
      };
      document.getElementById('c-name').value = username;
      document.getElementById('j-name').value = username;
    }
  });
}, 500);