import { api } from '../core/api.js';
import { toast, showModal, hideModal, setLoading, formatINR, formatDateTime } from '../core/ui.js';

let currentPage = 1;
let currentFilter = 'pending';

// The Employee queue is almost identical to Admin queue, but hits /api/employee endpoints.
export async function renderQueue() {
  const root = document.getElementById('app-root');
  
  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Verification Queue</h2>
      <div class="topbar-actions">
        <select id="status-filter" class="form-select" style="width: 150px;">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All Statuses</option>
        </select>
      </div>
    </div>

    <div class="alert-banner info mb-6">
      <div class="alert-icon">???</div>
      <div class="alert-text">You can view all transactions and download reports. Only Admins can approve or reject transactions.</div>
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Client Code</th>
            <th>Type</th>
            <th class="text-right">Amount (₹)</th>
            <th>Status</th>
            <th class="text-right">Action</th>
          </tr>
        </thead>
        <tbody id="queue-tbody">
          <tr><td colspan="6" class="text-center py-4">Loading...</td></tr>
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
            <div class="text-xs text-muted mb-1">Client Code</div>
            <div class="font-bold mb-3 font-mono" id="r-client"></div>
            
            <div class="text-xs text-muted mb-1">Type</div>
            <div class="mb-3"><span id="r-type" class="badge"></span></div>
            
            <div class="text-xs text-muted mb-1">Amount</div>
            <div class="font-mono font-bold text-xl text-accent mb-3" id="r-gross"></div>
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
          
          <div class="form-group mb-6">
            <label class="form-label">Notes</label>
            <textarea id="r-notes" class="form-textarea" placeholder="Add a note..."></textarea>
          </div>

          <div class="modal-actions" id="review-actions">
            <button type="button" class="btn btn-ghost" onclick="closeReviewModal()">Close</button>
          </div>
        </form>
      </div>
    </div>
  `;

  window.closeReviewModal = () => hideModal('review-modal');
  
  window.openReviewModal = async (txn) => {
    const t = JSON.parse(decodeURIComponent(txn));
    document.getElementById('r-id').value = t.id;
    document.getElementById('r-client').textContent = t.users.client_code;
    
    const typeBadge = document.getElementById('r-type');
    typeBadge.className = `badge badge-${t.type}`;
    typeBadge.textContent = t.type === 'pay_in' ? 'Deposit' : 'Withdrawal';
    
    document.getElementById('r-gross').textContent = formatINR(t.gross_amount);

    const proofSec = document.getElementById('proof-section');
    const proofImg = document.getElementById('r-proof-img');
    const proofLoad = document.getElementById('proof-loading');
    
    if (t.type === 'pay_in') {
      proofSec.classList.remove('hidden');
      proofImg.classList.add('hidden');
      proofLoad.classList.remove('hidden');
      proofLoad.textContent = 'Loading image...';
      try {
        const res = await api.get(`/api/employee/transactions/${t.id}/proof-url`);
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
    
    const actions = document.getElementById('review-actions');
    if (t.status !== 'pending') {
      actions.classList.add('hidden');
      document.getElementById('r-notes').value = t.admin_notes || '';
      document.getElementById('r-notes').disabled = true;
    } else {
      actions.classList.remove('hidden');
      document.getElementById('r-notes').disabled = false;
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

    const body = action === 'reject' ? { reason: notes } : { admin_notes: notes || null };
    const btns = document.querySelectorAll('#review-actions button');
    btns.forEach(b => b.disabled = true);
    
    try {
      await api.post(`/api/employee/transactions/${id}/${action}`, body);
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
    const res = await api.get(`/api/employee/transactions?page=${currentPage}&per_page=15${filterParams}`);
    
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
          <td class="font-mono font-medium">${t.users.client_code}</td>
          <td><span class="badge badge-${t.type}">${t.type === 'pay_in' ? 'Deposit' : 'Withdrawal'}</span></td>
          <td class="amount font-bold">${formatINR(t.gross_amount)}</td>
          <td><span class="badge badge-${t.status}">${t.status}</span></td>
          <td class="text-right">
            <button class="btn btn-sm btn-secondary" onclick="openReviewModal('${encoded}')">
              View
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const totalPages = Math.ceil(res.total / 15);
    let pgHtml = '';
    for(let i=1; i<=totalPages; i++) {
      pgHtml += `<button class="page-btn ${i===currentPage ? 'active' : ''}" onclick="changeQueuePage(${i})">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pgHtml;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-4">Failed to load queue.</td></tr>`;
  }
}

