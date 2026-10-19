import { api } from '../core/api.js';
import { toast, showModal, hideModal, setLoading, formatINR, formatDateTime } from '../core/ui.js';

let currentPage = 1;
let currentFilter = 'pending';

export async function renderQueue() {
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Transaction Queue</h2>
      <div class="topbar-actions">
        <select id="status-filter" class="form-select" style="width: 150px;">
          <option value="pending">Pending</option>
          <option value="employee_approved">Employee Approved</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All Statuses</option>
        </select>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Client</th>
            <th>Type</th>
            <th class="text-right">Total Gross (₹)</th>
            <th class="text-right">Total Net (₹)</th>
            <th>Status</th>
            <th class="text-right">Action</th>
          </tr>
        </thead>
        <tbody id="queue-tbody">
          <tr><td colspan="7" class="text-center py-4">Loading...</td></tr>
        </tbody>
      </table>
    </div>
    
    <div class="pagination mt-4" id="pagination"></div>

    <!-- Review Modal -->
    <div class="modal-backdrop" id="review-modal">
      <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
          <h3 class="modal-title">Review Transaction</h3>
          <button class="modal-close" onclick="closeReviewModal()">×</button>
        </div>
        
        <div class="flex gap-6 mb-6">
          <div class="flex-1">
            <div class="text-xs text-muted mb-1">Client</div>
            <div class="font-bold mb-3" id="r-client"></div>
            
            <div class="text-xs text-muted mb-1">Type</div>
            <div class="mb-3"><span id="r-type" class="badge"></span></div>
            
            <div class="text-xs text-muted mb-1">Submitted Amount</div>
            <div class="font-mono text-sm text-muted mb-2" id="r-submitted-amount" style="text-decoration: line-through; color: #94a3b8;"></div>

            <div class="text-xs text-muted mb-1" id="r-gross-label">Gross Amount <span style="color:#f59e0b; font-size:0.7rem;">(editable)</span></div>
            <div style="display: flex; align-items: center; gap: 0.4rem; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 0.5rem; padding: 0.35rem 0.65rem; margin-bottom: 0.25rem;" id="r-amount-wrapper">
              <span style="color: #94a3b8; font-weight: 700; font-size: 1rem;">₹</span>
              <input type="number" id="r-override-amount" min="1" step="0.01"
                style="border: none; background: transparent; font-size: 1rem; font-weight: 700; font-family: monospace; color: #0f172a; flex: 1; outline: none; width: 100%;">
            </div>
            <div id="r-override-hint" class="text-xs mb-3" style="color: #94a3b8;">Clear to use original submitted amount</div>

            <div id="fee-breakdown" class="text-xs text-muted mb-3 hidden"></div>

            <div class="text-xs text-muted mb-1">Net Amount to Credit</div>
            <div class="font-mono font-bold text-xl text-accent mb-3" id="r-net"></div>
          </div>
          
          <div class="flex-1" id="proof-section">
            <div class="text-xs text-muted mb-2">Payment Proof</div>
            <div id="proof-container" class="bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border" style="height: 200px; border-color: var(--color-border);">
              <span class="text-muted text-sm" id="proof-loading">Loading image...</span>
              <img id="r-proof-img" class="hidden w-full h-full object-contain cursor-pointer" onclick="window.open(this.src, '_blank')">
            </div>
          </div>
        </div>

        <form id="review-form">
          <input type="hidden" id="r-id">
          <input type="hidden" id="r-action"> <!-- 'approve' or 'reject' -->
          
          <div class="form-group mb-6">
            <label class="form-label" id="notes-label">Notes (Optional)</label>
            <textarea id="r-notes" class="form-textarea" placeholder="Add a note..."></textarea>
          </div>

          <div class="modal-actions" id="review-actions">
            <button type="button" class="btn btn-ghost" onclick="closeReviewModal()">Cancel</button>
            <button type="button" class="btn btn-danger" onclick="submitReview('reject')">Reject</button>
            <button type="button" class="btn btn-primary" onclick="submitReview('approve')">Approve</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach globals
  window.closeReviewModal = () => hideModal('review-modal');

  window.openReviewModal = async (txn) => {
    const t = JSON.parse(decodeURIComponent(txn));
    document.getElementById('r-id').value = t.id;
    document.getElementById('r-client').textContent = `${t.users.display_name} (${t.users.client_code})`;

    const typeBadge = document.getElementById('r-type');
    typeBadge.className = `badge badge-${t.type}`;
    typeBadge.textContent = t.type === 'pay_in' ? 'Deposit' : 'Withdrawal';

    const grossAmt = parseFloat(t.gross_amount);
    const feePct = parseFloat(t.fee_percentage || 0);

    // Store original submitted amount for display
    document.getElementById('r-submitted-amount').textContent = formatINR(grossAmt) + ' (submitted)';
    document.getElementById('r-override-amount').value = grossAmt.toFixed(2);

    // Label adjustment for pay_out (no fee)
    const grossLabel = document.getElementById('r-gross-label');
    grossLabel.innerHTML = t.type === 'pay_in'
      ? 'Gross Amount <span style="color:#f59e0b; font-size:0.7rem;">(editable)</span>'
      : 'Withdrawal Amount <span style="color:#f59e0b; font-size:0.7rem;">(editable)</span>';

    // Helper: recalculate and display net given a gross
    function updateNetPreview(gross) {
      const feeDiv = document.getElementById('fee-breakdown');
      let net;
      if (t.type === 'pay_in') {
        const fee = Math.round(gross * feePct) / 100;
        net = gross - fee;
        feeDiv.textContent = `Fee: ${feePct}% (-${formatINR(fee)})`;
        feeDiv.classList.remove('hidden');
      } else {
        net = gross;
        feeDiv.classList.add('hidden');
      }
      document.getElementById('r-net').textContent = formatINR(net);
    }

    updateNetPreview(grossAmt);

    // Live update on input change
    document.getElementById('r-override-amount').oninput = (e) => {
      const val = parseFloat(e.target.value);
      if (val > 0) {
        updateNetPreview(val);
        const hint = document.getElementById('r-override-hint');
        if (val !== grossAmt) {
          hint.textContent = `⚠ Amount changed from original ${formatINR(grossAmt)}`;
          hint.style.color = '#f59e0b';
        } else {
          hint.textContent = 'Clear to use original submitted amount';
          hint.style.color = '#94a3b8';
        }
      }
    };

    const proofSec = document.getElementById('proof-section');
    const proofImg = document.getElementById('r-proof-img');
    const proofLoad = document.getElementById('proof-loading');

    if (t.type === 'pay_in') {
      proofSec.classList.remove('hidden');
      proofImg.classList.add('hidden');
      proofLoad.classList.remove('hidden');
      proofLoad.textContent = 'Loading image...';
      try {
        const res = await api.get(`/api/admin/transactions/${t.id}/proof-url`);
        proofImg.src = res.signed_url;
        proofImg.classList.remove('hidden');
        proofLoad.classList.add('hidden');
      } catch {
        proofLoad.textContent = 'Failed to load proof image';
      }
    } else {
      proofSec.classList.add('hidden');
    }

    document.getElementById('r-notes').value = '';

    // Hide action buttons if already processed
    // Hide action buttons if already fully processed
    const actions = document.getElementById('review-actions');
    const isEditable = t.status === 'pending' || t.status === 'employee_approved';
    if (!isEditable) {
      actions.classList.add('hidden');
      document.getElementById('r-notes').value = t.admin_notes || '';
      document.getElementById('r-notes').disabled = true;
      // Hide editable amount area for already-processed txns
      document.getElementById('r-amount-wrapper').style.display = 'none';
      document.getElementById('r-override-hint').style.display = 'none';
      document.getElementById('r-submitted-amount').style.display = 'none';
      document.getElementById('r-gross-label').innerHTML = 'Amount';
    } else {
      actions.classList.remove('hidden');
      document.getElementById('r-notes').disabled = false;
      document.getElementById('r-amount-wrapper').style.display = '';
      document.getElementById('r-override-hint').style.display = '';
      document.getElementById('r-submitted-amount').style.display = '';
    }

    showModal('review-modal');
  };

  window.submitReview = async (action) => {
    const id = document.getElementById('r-id').value;
    const notes = document.getElementById('r-notes').value.trim();

    if (action === 'reject' && !notes) {
      toast.error('Reason is required for rejection');
      document.getElementById('r-notes').focus();
      return;
    }

    let body;
    if (action === 'reject') {
      body = { reason: notes };
    } else {
      body = { admin_notes: notes || null };
      // Include override_amount only if the admin changed it
      const overrideInput = document.getElementById('r-override-amount');
      if (overrideInput) {
        const overrideVal = parseFloat(overrideInput.value);
        if (overrideVal > 0) {
          body.override_amount = overrideVal;
        }
      }
    }

    const btns = document.querySelectorAll('#review-actions button');
    btns.forEach(b => b.disabled = true);

    try {
      await api.post(`/api/admin/transactions/${id}/${action}`, body);
      toast.success(`Transaction ${action}d successfully`);
      hideModal('review-modal');
      loadQueue();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    } finally {
      btns.forEach(b => b.disabled = false);
    }
  };

  document.getElementById('status-filter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentPage = 1;
    loadQueue();
  });

  window.changeQueuePage = (page) => {
    currentPage = page;
    loadQueue();
  };

  await loadQueue();
}

async function loadQueue() {
  const tbody = document.getElementById('queue-tbody');
  try {
    const filterParams = currentFilter ? `&status=${currentFilter}` : '';
    const res = await api.get(`/api/admin/transactions?page=${currentPage}&per_page=15${filterParams}`);

    if (res.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No transactions found.</td></tr>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = res.transactions.map(t => {
      const encoded = encodeURIComponent(JSON.stringify(t));
      return `
        <tr>
          <td class="text-xs text-muted">${formatDateTime(t.created_at)}</td>
          <td class="font-medium">${t.users.display_name} <span class="text-xs text-muted">(${t.users.client_code})</span></td>
          <td><span class="badge badge-${t.type}">${t.type === 'pay_in' ? 'Deposit' : 'Withdrawal'}</span></td>
          <td class="amount">${formatINR(t.gross_amount)}</td>
          <td class="amount text-accent font-bold">${formatINR(t.net_amount)}</td>
          <td><span class="badge badge-${t.status}">${t.status === 'employee_approved' ? 'Emp. Approved' : t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" onclick="openReviewModal('${encoded}')">
              ${(t.status === 'pending' || t.status === 'employee_approved') ? 'Review' : 'View'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Pagination
    const totalPages = Math.ceil(res.total / 15);
    let pgHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      pgHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changeQueuePage(${i})">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pgHtml;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center py-4">Failed to load queue.</td></tr>`;
  }
}
