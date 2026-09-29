import { api } from '../core/api.js';
import { toast, setLoading } from '../core/ui.js';
import { getCurrentUser, saveTokens } from '../core/auth.js';

export async function renderChangePassword() {
  const root = document.getElementById('app-root');
  const user = getCurrentUser();

  root.innerHTML = `
    <div style="margin-top:2rem;">
      <h2 class="font-bold text-2xl mb-2">Change Password</h2>
      <p class="text-muted text-sm">
        ${user?.force_pw_change ? 
          'You must change your password before accessing the application.' : 
          'Update your account password.'}
      </p>
    </div>

    <form id="pw-form" class="card">
      <div class="form-group">
        <label class="form-label">New Password <span class="required">*</span></label>
        <input type="password" id="pw1" class="form-input" required minlength="8" placeholder="At least 8 characters">
      </div>

      <div class="form-group mb-6">
        <label class="form-label">Confirm New Password <span class="required">*</span></label>
        <input type="password" id="pw2" class="form-input" required minlength="8" placeholder="Retype password">
      </div>

      <button type="submit" id="submit-btn" class="btn btn-primary btn-lg btn-full">
        Update Password
      </button>
    </form>
  `;

  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const pw1 = document.getElementById('pw1').value;
    const pw2 = document.getElementById('pw2').value;

    if (pw1 !== pw2) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading('#submit-btn', true);
    try {
      const res = await api.post('/api/auth/change-password', { new_password: pw1 });
      
      // Backend now issues fresh tokens automatically
      saveTokens(res.access_token, res.refresh_token);
      
      toast.success('Password updated successfully!');
      
      // Instantly remove the form and redirect to dashboard
      window.location.hash = '#/dashboard';

    } catch (err) {
      toast.error(err.message || 'Failed to update password');
      setLoading('#submit-btn', false);
    }
  });
}
