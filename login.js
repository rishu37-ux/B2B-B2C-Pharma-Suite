/* Sign-in page for the dashboard (admin) and the chemist portal. */
(async () => {
  'use strict';
  const $ = s => document.querySelector(s);
  const go = role => { location.href = role === 'chemist' ? 'portal.html' : './'; };
  let setup = false;

  try {
    const me = await (await fetch('api/me', { cache: 'no-store' })).json();
    if (me.role) return go(me.role);
    setup = !!me.setupNeeded;
  } catch {
    $('#error').textContent = 'The server is not running. Start it with: node server.js';
    $('#submit').disabled = true;
    return;
  }
  if (setup) {
    $('#title').textContent = 'Create the admin login';
    $('#lead').textContent = 'First time here. Choose the username and password you will use to open the dashboard. Keep them safe.';
    $('#confirmWrap').classList.remove('hidden');
    $('#password').autocomplete = 'new-password';
    $('#submit').textContent = 'Create login';
  }

  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = $('#username').value.trim(), password = $('#password').value;
    const err = $('#error'); err.textContent = '';
    if (!username || !password) { err.textContent = 'Enter your username and password.'; return; }
    if (setup && password !== $('#confirm').value) { err.textContent = 'The two passwords do not match.'; return; }
    $('#submit').disabled = true;
    try {
      const r = await fetch(setup ? 'api/setup' : 'api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = body.error || 'Could not sign in.'; return; }
      go(body.role);
    } catch {
      err.textContent = 'Could not reach the server. Check your connection.';
    } finally {
      $('#submit').disabled = false;
    }
  });
})();
