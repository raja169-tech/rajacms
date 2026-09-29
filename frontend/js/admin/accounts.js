import { api } from '../core/api.js';
import { toast, showModal, hideModal, setLoading, formatINR, confirmModal } from '../core/ui.js';

export async function renderAccounts() {
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <div class="topbar">
      <h2 class="large-text topbar-title">Bank Accounts</h2>
      <div class="topbar-actions">
        <button class="btn btn-danger btn-ghost" onclick="confirmDisableAll()">Disable All</button>
        <button class="btn btn-primary" onclick="openAccountModal()">+ Add Account</button>
      </div>
    </div>

<br>

    <!--
    <div class="alert-banner info mb-6">
      <div class="alert-icon">ℹ</div>
      <div class="alert-text">These are the collection accounts your clients see when submitting a Pay-In. You can set lifetime deposit limits per account.</div>
    </div>
    -->

    <div id="accounts-grid" class="stat-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">
      <!-- Cards injected here -->
      <div class="skeleton skeleton-card" style="height:200px"></div>
    </div>

    <!-- Create/Edit Modal -->
    <div class="modal-backdrop" id="acc-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="acc-modal-title">Add Bank Account</h3>
          <button class="modal-close" onclick="closeAccountModal()">×</button>
        </div>
        <form id="acc-form">
          <input type="hidden" id="acc-id">
          
          <div class="form-group">
            <label class="form-label">Account Label <span class="required">*</span></label>
            <input type="text" id="a-label" class="form-input" required placeholder="e.g. Primary HDFC - UPI">
          </div>
          
          <div class="form-group">
            <label class="form-label">UPI ID</label>
            <input type="text" id="a-upi" class="form-input" placeholder="e.g. company@bank">
          </div>
          
          <div class="flex gap-4">
            <div class="form-group flex-1">
              <label class="form-label">Account Number</label>
              <input type="text" id="a-num" class="form-input">
            </div>
            <div class="form-group flex-1">
              <label class="form-label">IFSC Code</label>
              <input type="text" id="a-ifsc" class="form-input">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Lifetime Limit (INR)</label>
            <input type="number" id="a-limit" class="form-input" min="0" step="0.01" placeholder="Leave empty for unlimited">
            <div class="form-hint mt-1">Account will be hidden from clients once this cumulative deposit limit is reached.</div>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeAccountModal()">Cancel</button>
            <button type="submit" id="btn-save-acc" class="btn btn-primary">Save Account</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Globals
  window.openAccountModal = () => {
    document.getElementById('acc-modal-title').textContent = 'Add Bank Account';
    document.getElementById('acc-form').reset();
    document.getElementById('acc-id').value = '';
    showModal('acc-modal');
  };
  window.closeAccountModal = () => hideModal('acc-modal');

  window.editAccount = (id, label, upi, num, ifsc, limit) => {
    document.getElementById('acc-modal-title').textContent = 'Edit Bank Account';
    document.getElementById('acc-id').value = id;
    document.getElementById('a-label').value = label;
    document.getElementById('a-upi').value = upi === 'null' ? '' : upi;
    document.getElementById('a-num').value = num === 'null' ? '' : num;
    document.getElementById('a-ifsc').value = ifsc === 'null' ? '' : ifsc;
    document.getElementById('a-limit').value = limit === 'null' ? '' : limit;
    showModal('acc-modal');
  };

  window.toggleAccountStatus = async (id) => {
    try {
      await api.post(`/api/admin/bank-accounts/${id}/toggle`);
      toast.success('Account status updated');
      loadAccounts();
    } catch (e) {
      toast.error('Failed to toggle status');
    }
  };

  window.confirmDisableAll = async () => {
    const isConfirmed = await confirmModal(
      'Are you sure you want to disable ALL bank accounts? Clients will not be able to submit Pay-Ins.',
      'Disable All Accounts',
      'Disable All',
      'Cancel',
      true
    );
    if (isConfirmed) {
      try {
        const res = await api.post('/api/admin/bank-accounts/disable-all');
        toast.success(res.detail);
        loadAccounts();
      } catch (e) {
        toast.error('Failed to disable accounts');
      }
    }
  };

  window.deleteAccount = async (id, label) => {
    const isConfirmed = await confirmModal(
      `Are you sure you want to permanently delete the bank account: ${label}? This cannot be undone.`,
      'Delete Bank Account',
      'Delete',
      'Cancel',
      true
    );

    if (!isConfirmed) return;

    try {
      await api.delete(`/api/admin/bank-accounts/${id}/delete`);
      toast.success('Account deleted successfully');
      loadAccounts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete account');
    }
  };

  document.getElementById('acc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('acc-id').value;
    const limitVal = document.getElementById('a-limit').value;

    const body = {
      label: document.getElementById('a-label').value,
      upi_id: document.getElementById('a-upi').value || null,
      account_number: document.getElementById('a-num').value || null,
      ifsc: document.getElementById('a-ifsc').value || null,
      limit_amount: limitVal ? parseFloat(limitVal) : null,
    };

    setLoading('#btn-save-acc', true);
    try {
      if (id) {
        await api.patch(`/api/admin/bank-accounts/${id}`, body);
        toast.success('Account updated');
      } else {
        await api.post('/api/admin/bank-accounts', body);
        toast.success('Account created');
      }
      hideModal('acc-modal');
      loadAccounts();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading('#btn-save-acc', false);
    }
  });

  await loadAccounts();
}

async function loadAccounts() {
  const grid = document.getElementById('accounts-grid');
  try {
    const accounts = await api.get('/api/admin/bank-accounts');

    if (accounts.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1">No bank accounts configured.</div>`;
      return;
    }

    grid.innerHTML = accounts.map(a => {
      let limitHtml = `<div class="text-xs text-muted mb-4">Unlimited capacity</div>`;
      if (a.limit_amount !== null) {
        const pct = Math.min(100, (a.used_amount / a.limit_amount) * 100);
        let colorClass = '';
        if (pct > 95) colorClass = 'danger';
        else if (pct > 80) colorClass = 'warning';

        limitHtml = `
          <div class="flex justify-between text-xs mb-1">
            <span class="text-muted">Used: ${formatINR(a.used_amount)}</span>
            <span class="font-mono">Limit: ${formatINR(a.limit_amount)}</span>
          </div>
          <div class="progress-bar mb-4">
            <div class="progress-fill ${colorClass}" style="width: ${pct}%"></div>
          </div>
        `;
      }

      const isChecked = a.is_active ? 'checked' : '';
      const activeBadge = `
        <div class="toggle-wrapper">
          <label class="toggle-switch">
            <input type="checkbox" ${isChecked} onchange="toggleAccountStatus('${a.id}')">
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;

      return `
        <div class="card flex-col flex" style="${!a.is_active ? 'opacity: 0.6;' : ''}">
          <div class="flex justify-between items-start mb-3">
            <div class="font-bold text-lg">${a.label}</div>
            ${activeBadge}
          </div>
          
          <div class="text-sm mb-4 flex-1">
            ${a.upi_id ? `<div><span class="text-muted">UPI:</span> ${a.upi_id}</div>` : ''}
            ${a.account_number ? `<div><span class="text-muted">A/C:</span> ${a.account_number}</div>` : ''}
            ${a.ifsc ? `<div><span class="text-muted">IFSC:</span> ${a.ifsc}</div>` : ''}
          </div>
          
          ${limitHtml}
          
          <div class="pt-3 border-t flex gap-2" style="border-color: var(--color-border);">
            <button class="btn btn-sm btn-ghost flex-1" onclick="editAccount('${a.id}', '${a.label.replace(/'/g, "\\'")}', '${a.upi_id}', '${a.account_number}', '${a.ifsc}', ${a.limit_amount})">
              Edit
            </button>
            <button class="btn btn-sm btn-danger flex-1" onclick="deleteAccount('${a.id}', '${a.label.replace(/'/g, "\\'")}')">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="text-danger">Failed to load accounts.</div>`;
  }
}
