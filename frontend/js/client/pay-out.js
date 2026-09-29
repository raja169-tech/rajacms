import { api } from '../core/api.js';
import { toast, setLoading, formatINR } from '../core/ui.js';

export async function renderPayOut() {
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <!-- Page Header -->
    <div style="padding: 0.5rem 0 1.25rem; color: white; margin-bottom: 0.5rem;">
      <div style="font-size: 0.85rem; opacity: 0.7 color:black;;">New Request</div>
      <div style="font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; color:black;">Withdraw Funds</div>
    </div>

    <!-- Balance Card -->
    <div class="client-card mb-4" style="background: linear-gradient(135deg, #0f172a, #1e3a5f); color: white; border: none;">
      <div style="font-size: 0.7rem; letter-spacing: 0.08em; opacity: 0.5; text-transform: uppercase; font-weight: 600; margin-bottom: 0.4rem;">Available to Withdraw</div>
      <div style="font-size: 2.2rem; font-weight: 800; font-family: monospace; letter-spacing: -1px;" id="avail-balance">₹ —</div>
      <div style="font-size: 0.7rem; opacity: 0.5; margin-top: 0.35rem;">No withdrawal fees apply</div>
    </div>

    <!-- Warning Banner -->
    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 0.75rem; padding: 0.85rem 1rem; margin-bottom: 1.25rem; display: flex; gap: 0.6rem; align-items: flex-start;">
      <span>ℹ️</span>
      <span style="font-size: 0.78rem; color: #92400e; font-weight: 500;">Only your matured balance (held &gt;24h after admin approval) is available for withdrawal.</span>
    </div>

    <form id="pay-out-form">
      <div class="client-card mb-5">
        <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Withdrawal Amount</div>
        <div id="amount-wrapper" style="display: flex; align-items: center; gap: 0.5rem; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 0.75rem; padding: 0.75rem 1rem;">
          <span style="font-size: 1.25rem; font-weight: 800; color: #94a3b8;">₹</span>
          <input type="number" id="amount" min="1" step="0.01" required placeholder="0.00" disabled
            style="border: none; background: transparent; font-size: 1.5rem; font-weight: 800; font-family: monospace; color: #0f172a; flex: 1; outline: none; width: 100%;">
        </div>
        <div id="amount-hint" style="margin-top: 0.5rem; font-size: 0.78rem;"></div>
      </div>

      <button type="submit" id="submit-btn" disabled style="
        width: 100%; padding: 1.1rem;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white; border: none; border-radius: 1rem;
        font-size: 1rem; font-weight: 700;
        cursor: pointer; transition: opacity 0.2s;
        box-shadow: 0 4px 15px rgba(245,158,11,0.3);
        opacity: 0.5; margin-top:1rem;
      ">Submit Withdrawal Request</button>
    </form>
  `;

  let withdrawable = 0;
  const amountInput = document.getElementById('amount');
  const hint = document.getElementById('amount-hint');
  const submitBtn = document.getElementById('submit-btn');
  const wrapper = document.getElementById('amount-wrapper');

  try {
    const data = await api.get('/api/client/dashboard');
    withdrawable = data.withdrawable_now;
    document.getElementById('avail-balance').textContent = formatINR(withdrawable);

    if (withdrawable <= 0) {
      hint.innerHTML = `<span style="color: #ef4444; font-weight: 600;">⚠ No matured balance available to withdraw</span>`;
      amountInput.disabled = true;
    } else {
      amountInput.disabled = false;
      amountInput.max = withdrawable;
      hint.innerHTML = `<span style="color: #10b981; font-weight: 600;">✓ Up to ${formatINR(withdrawable)} available</span>`;
    }
  } catch {
    toast.error('Failed to load balance');
  }

  amountInput.addEventListener('input', () => {
    const val = parseFloat(amountInput.value) || 0;
    if (val > withdrawable) {
      wrapper.style.borderColor = '#ef4444';
      hint.innerHTML = `<span style="color: #ef4444; font-weight: 600;">⚠ Exceeds available balance of ${formatINR(withdrawable)}</span>`;
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
    } else if (val > 0) {
      wrapper.style.borderColor = '#10b981';
      hint.innerHTML = `<span style="color: #64748b;">No fees on withdrawals ✓</span>`;
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
    } else {
      wrapper.style.borderColor = '#e2e8f0';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
    }
  });

  document.getElementById('pay-out-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = parseFloat(amountInput.value);

    if (!val || val <= 0 || val > withdrawable) {
      toast.error('Invalid withdrawal amount');
      return;
    }

    setLoading('#submit-btn', true);
    try {
      await api.post('/api/client/pay-out', { amount: val });
      toast.success('Withdrawal request submitted successfully!');
      window.location.hash = '#/dashboard';
    } catch (err) {
      toast.error(err.message || 'Failed to submit request');
      setLoading('#submit-btn', false);
    }
  });
}
