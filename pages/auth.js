import { api } from '../js/api.js';
import { handleLoginSuccess } from '../app.js';

export function render(container) {
  let tab = 'login';

  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-logo">TaskBoard</div>
      <div class="auth-tagline">Compete. Complete. Repeat.</div>
      <div class="auth-form">
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Sign In</button>
          <button class="auth-tab" data-tab="register">Create Account</button>
        </div>
        <div id="auth-content"></div>
      </div>
    </div>
  `;

  function renderForm() {
    const el = container.querySelector('#auth-content');
    if (tab === 'login') {
      el.innerHTML = `
        <div class="form-group">
          <label class="form-label">Username</label>
          <input class="form-input" id="username" type="text" autocomplete="username" placeholder="your_username" autocapitalize="none">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" id="password" type="password" autocomplete="current-password" placeholder="••••••">
        </div>
        <div id="auth-error" class="form-error" style="margin-bottom:12px"></div>
        <button class="btn btn-primary btn-full" id="submit-btn">Sign In</button>
      `;
    } else {
      el.innerHTML = `
        <div class="form-group">
          <label class="form-label">Username</label>
          <input class="form-input" id="username" type="text" autocomplete="username" placeholder="choose_username" autocapitalize="none">
          <div class="form-error" id="username-error"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" id="password" type="password" autocomplete="new-password" placeholder="min 6 characters">
        </div>
        <div class="form-group">
          <label class="form-label">Verify Password</label>
          <input class="form-input" id="verify" type="password" autocomplete="new-password" placeholder="repeat password">
        </div>
        <div id="auth-error" class="form-error" style="margin-bottom:12px"></div>
        <button class="btn btn-primary btn-full" id="submit-btn">Create Account</button>
      `;
    }

    container.querySelector('#submit-btn').addEventListener('click', submit);
    container.querySelectorAll('.form-input').forEach(inp => {
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    });
  }

  async function submit() {
    const btn = container.querySelector('#submit-btn');
    const errEl = container.querySelector('#auth-error');
    const username = container.querySelector('#username')?.value.trim();
    const password = container.querySelector('#password')?.value;
    errEl.textContent = '';

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="border-color:#ffffff44;border-top-color:#fff;width:16px;height:16px"></div>';

    try {
      if (tab === 'login') {
        const data = await api.auth.login(username, password);
        handleLoginSuccess(data.token, data.user);
      } else {
        const verify = container.querySelector('#verify')?.value;
        if (password !== verify) { errEl.textContent = 'Passwords do not match'; btn.disabled = false; btn.textContent = 'Create Account'; return; }
        const data = await api.auth.register(username, password);
        handleLoginSuccess(data.token, data.user);
      }
    } catch (e) {
      errEl.textContent = e.message;
      btn.disabled = false;
      btn.textContent = tab === 'login' ? 'Sign In' : 'Create Account';
    }
  }

  container.addEventListener('click', e => {
    const tabBtn = e.target.closest('.auth-tab');
    if (!tabBtn) return;
    tab = tabBtn.dataset.tab;
    container.querySelectorAll('.auth-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderForm();
  });

  renderForm();
}
