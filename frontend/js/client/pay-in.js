import { api } from '../core/api.js';
import { toast, setLoading } from '../core/ui.js';

export async function renderPayIn() {
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <!-- Page Header -->
    <div style="padding: 0.5rem 0 1.25rem; color: white; margin-bottom: 0.5rem;">
      <div style="font-size: 0.85rem; opacity: 0.7;"></div>
      <div style="font-size: 1.5rem; margin-top:1rem; font-weight: 800; letter-spacing: -0.02em; color:black;">Deposit Funds</div>
    </div>

    <!-- Info Banner -->
    <div style="background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 0.75rem; padding: 0.85rem 1rem; margin-bottom: 1.25rem; display: flex; gap: 0.6rem; align-items: flex-start;">
      <span>ℹ️</span>
      <span style="font-size: 0.78rem; color: #065f46; font-weight: 500;">Transfer funds to the selected company account, then upload your payment screenshot for verification.</span>
    </div>

    <form id="pay-in-form">
      <!-- Amount -->
      <div class="client-card mb-4">
        <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Amount</div>
        <div style="display: flex; align-items: center; gap: 0.5rem; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 0.75rem; padding: 0.75rem 1rem;">
          <span style="font-size: 1.25rem; font-weight: 800; color: #94a3b8;">₹</span>
          <input type="number" id="amount" min="1" step="0.01" required placeholder="0.00"
            style="border: none; background: transparent; font-size: 1.5rem; font-weight: 800; font-family: monospace; color: #0f172a; flex: 1; outline: none; width: 100%;">
        </div>
      </div>

      <!-- Bank Account -->
      <div class="client-card mb-4">
        <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Send Money To</div>
        <select id="bank-account" required style="width: 100%; border: 1.5px solid #e2e8f0; border-radius: 0.75rem; padding: 0.75rem 1rem; font-size: 0.95rem; background: #f8fafc; color: #0f172a; outline: none;">
          <option value="">Loading accounts...</option>
        </select>
        <div id="bank-details" style="margin-top: 0.75rem;"></div>
      </div>

      <!-- Proof Upload -->
      <div class="client-card mb-5">
        <div style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">Payment Screenshot</div>
        <label id="drop-zone" style="
          display: block; border: 2px dashed #cbd5e1; border-radius: 0.75rem;
          padding: 2rem 1rem; text-align: center; cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        ">
          <input type="file" id="proof-img" accept="image/jpeg,image/png,image/webp" required style="display: none;">
          <div id="upload-placeholder">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📷</div>
            <div style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">Tap to upload screenshot</div>
            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.25rem;">JPEG, PNG, WebP • max 5MB</div>
          </div>
          <div id="preview-container" style="display: none;">
            <img id="preview-img" src="" alt="Preview" style="max-width: 100%; border-radius: 0.5rem; max-height: 200px; object-fit: cover;">
            <div style="font-size: 0.75rem; color: #10b981; margin-top: 0.5rem; font-weight: 600;">✓ Screenshot selected</div>
          </div>
        </label>
      </div>

      <button type="submit" id="submit-btn" style="
        width: 100%; padding: 1.1rem;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white; border: none; border-radius: 1rem;
        font-size: 1rem; font-weight: 700;
        cursor: pointer; transition: opacity 0.2s; margin-top:1.5rem;
        box-shadow: 0 4px 15px rgba(16,185,129,0.35);
      ">Submit for Verification</button>
    </form>
  `;

  const bankSelect = document.getElementById('bank-account');
  const bankDetails = document.getElementById('bank-details');
  const fileInput = document.getElementById('proof-img');
  const dropZone = document.getElementById('drop-zone');

  let accountsMap = {};

  // Load bank accounts
  try {
    const accounts = await api.get('/api/client/bank-accounts');
    if (!accounts || accounts.length === 0) {
      bankSelect.innerHTML = `<option value="">No active accounts available</option>`;
      bankSelect.disabled = true;
    } else {
      bankSelect.innerHTML = `<option value="">— Select Company Account —</option>` +
        accounts.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
      accounts.forEach(a => { accountsMap[a.id] = a; });
    }
  } catch {
    toast.error('Failed to load bank accounts');
  }

  // Show account details on selection
  bankSelect.addEventListener('change', () => {
    const acc = accountsMap[bankSelect.value];
    if (!acc) { bankDetails.innerHTML = ''; return; }

    let rows = [];
    if (acc.upi_id) rows.push(['UPI ID', acc.upi_id]);
    if (acc.account_number) rows.push(['Account No.', acc.account_number]);
    if (acc.ifsc) rows.push(['IFSC', acc.ifsc]);

    bankDetails.innerHTML = `
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 0.6rem; padding: 0.75rem; font-size: 0.8rem;">
        ${rows.map(([k, v]) => `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #065f46; font-weight: 600;">${k}</span>
            <span style="font-family: monospace; font-weight: 700; color: #0f172a;">${v}</span>
          </div>
        `).join('')}
        ${acc.remaining_capacity !== null ? `<div style="margin-top: 6px; color: #b45309; font-weight: 600;">Max deposit: ₹${Number(acc.remaining_capacity).toLocaleString('en-IN')}</div>` : ''}
      </div>
    `;
  });

  // File preview
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File exceeds 5MB limit');
      fileInput.value = '';
      return;
    }
    document.getElementById('upload-placeholder').style.display = 'none';
    const preview = document.getElementById('preview-container');
    const img = document.getElementById('preview-img');
    img.src = URL.createObjectURL(file);
    preview.style.display = 'block';
    dropZone.style.borderColor = '#10b981';
    dropZone.style.background = '#f0fdf4';
  });

  // Submit
  document.getElementById('pay-in-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const amount = document.getElementById('amount').value;
    const bankId = bankSelect.value;
    const file = fileInput.files[0];

    if (!amount || !bankId || !file) {
      toast.error('Please fill all required fields');
      return;
    }

    const formData = new FormData();
    formData.append('amount', amount);
    formData.append('bank_account_id', bankId);
    formData.append('idempotency_key', crypto.randomUUID());
    formData.append('proof_image', file);

    setLoading('#submit-btn', true);
    try {
      await api.upload('/api/client/pay-in', formData);
      toast.success('Deposit submitted! Awaiting verification.');
      window.location.hash = '#/dashboard';
    } catch (err) {
      toast.error(err.message || 'Failed to submit deposit');
      setLoading('#submit-btn', false);
    }
  });
}
