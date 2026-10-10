/**
 * Employee Transaction Queue - with Denomination (DENO) feature.
 * Flow: Client submits -> Employee enters DENO -> Admin approves/rejects
 */

let currentPage = 1;
let currentFilter = 'pending';

export async function renderQueue(container) {
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Verification Queue</h2>
      <div class="topbar-actions">
        <select id="status-filter" class="form-select" style="width: 160px;">
          <option value="pending">Pending</option>
          <option value="employee_approved">Awaiting Admin</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All Statuses</option>
        </select>
      </div>
    </div>

    <div class="alert-banner info mb-6">
      <div class="alert-icon">i</div>
      <div class="alert-text">For <strong>Pending</strong> transactions, click <strong>DENO</strong> to enter denomination and send to admin for approval.</div>
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Client Code</th>
            <th>Type</th>
            <th class="text-right">Amount (INR)</th>
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

    <!-- ===== DENO Modal ===== -->
    <div class="modal-backdrop" id="deno-modal">
      <div class="modal" style="max-width: 700px;">
        <div class="modal-header">
          <h3 class="modal-title">Denomination Entry (DENO)</h3>
          <button class="modal-close" onclick="closeDenoModal()">x</button>
        </div>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Client</div>
            <div class="font-mono font-bold" id="deno-client" style="font-size:1rem;"></div>
          </div>
          <div>
            <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Type</div>
            <span id="deno-type" class="badge"></span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.7rem;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Transaction Amount</div>
            <div class="font-mono font-bold" id="deno-gross" style="font-size:1.25rem;color:#0f172a;"></div>
          </div>
        </div>

        <input type="hidden" id="deno-txn-id" data-gross="0">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.5rem;" id="deno-grid"></div>

        <div id="deno-total-bar" style="border-radius:0.75rem;padding:1rem 1.25rem;margin-bottom:1.25rem;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:0.85rem;color:#475569;">
            Denomination Total: <strong class="font-mono" id="deno-total-val">INR 0</strong>
          </div>
          <div id="deno-match-badge" style="font-size:0.8rem;font-weight:700;padding:0.25rem 0.75rem;border-radius:999px;background:#fee2e2;color:#b91c1c;">Mismatch</div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeDenoModal()">Cancel</button>
          <button type="button" class="btn btn-primary" id="deno-submit-btn" disabled onclick="submitDeno()">Submit DENO &rarr; Send to Admin</button>
        </div>
      </div>
    </div>

    <!-- ===== View Modal (read-only) ===== -->
    <div class="modal-backdrop" id="review-modal">
      <div class="modal" style="max-width: 600px;">
        <div class="modal-header">
          <h3 class="modal-title">Transaction Details</h3>
          <button class="modal-close" onclick="closeReviewModal()">x</button>
        </div>
        <div class="flex gap-6 mb-6">
          <div class="flex-1">
            <div class="text-xs text-muted mb-1">Client Code</div>
            <div class="font-bold mb-3 font-mono" id="r-client"></div>
            <div class="text-xs text-muted mb-1">Type</div>
            <div class="mb-3"><span id="r-type" class="badge"></span></div>
            <div class="text-xs text-muted mb-1">Amount</div>
            <div class="font-mono font-bold text-xl text-accent mb-3" id="r-gross"></div>
            <div class="text-xs text-muted mb-1">Status</div>
            <div class="mb-3"><span id="r-status" class="badge"></span></div>
          </div>
          <div class="flex-1" id="proof-section">
            <div class="text-xs text-muted mb-2">Payment Proof</div>
            <div id="proof-container" style="position:relative;height:220px;max-height:220px;border:1px solid var(--color-border);border-radius:0.5rem;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f1f5f9;">
              <span class="text-muted text-sm" id="proof-loading">Loading image...</span>
              <img id="r-proof-img" class="hidden" style="max-width:100%;max-height:220px;width:auto;height:auto;object-fit:contain;cursor:pointer;display:block;" onclick="window.open(this.src,'_blank')">
            </div>
          </div>
        </div>
        <div id="r-deno-section" class="hidden" style="margin-bottom:1rem;">
          <div class="text-xs text-muted mb-2">Denomination Entered</div>
          <div id="r-deno-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.4rem;font-size:0.75rem;"></div>
        </div>
        <div class="form-group mb-4">
          <label class="form-label">Admin Notes</label>
          <textarea id="r-notes" class="form-textarea" disabled placeholder="No notes yet."></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onclick="closeReviewModal()">Close</button>
        </div>
      </div>
    </div>
  `;

  // Build DENO grid dynamically (avoids encoding issues with template literals)
  const NOTE_VALUES = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
  const grid = document.getElementById('deno-grid');
  NOTE_VALUES.forEach(val => {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;align-items:center;gap:0.75rem;background:#fff;border:1px solid #e2e8f0;border-radius:0.6rem;padding:0.6rem 0.9rem;';
    cell.innerHTML =
      '<div style="background:#0f172a;color:#f8fafc;font-size:0.7rem;font-weight:800;border-radius:0.35rem;padding:0.2rem 0.5rem;min-width:52px;text-align:center;font-family:monospace;">INR ' + val + '</div>' +
      '<div style="flex:1;display:flex;align-items:center;gap:0.4rem;">' +
        '<input type="number" min="0" value="0" id="deno-note-' + val + '" class="form-input" style="width:70px;text-align:center;padding:0.3rem 0.5rem;font-family:monospace;" oninput="updateDenoTotal()">' +
        '<span style="font-size:0.7rem;color:#94a3b8;">x ' + val + '</span>' +
        '<span style="font-size:0.75rem;font-weight:600;color:#334155;margin-left:auto;font-family:monospace;min-width:64px;text-align:right;" id="deno-sub-' + val + '">=0</span>' +
      '</div>';
    grid.appendChild(cell);
  });

  // ===== DENO functions =====
  window.closeDenoModal = () => hideModal('deno-modal');

  window.openDenoModal = (txn) => {
    const t = JSON.parse(decodeURIComponent(txn));
    const hiddenInput = document.getElementById('deno-txn-id');
    hiddenInput.value = t.id;
    hiddenInput.dataset.gross = t.gross_amount;

    document.getElementById('deno-client').textContent = t.users.client_code;
    const tb = document.getElementById('deno-type');
    tb.className = 'badge badge-' + t.type;
    tb.textContent = t.type === 'pay_in' ? 'Deposit' : 'Withdrawal';
    document.getElementById('deno-gross').textContent = formatINR(t.gross_amount);

    NOTE_VALUES.forEach(v => {
      document.getElementById('deno-note-' + v).value = 0;
      document.getElementById('deno-sub-' + v).textContent = '=0';
    });
    updateDenoTotal();
    showModal('deno-modal');
  };

  window.updateDenoTotal = () => {
    let total = 0;
    NOTE_VALUES.forEach(v => {
      const qty = parseInt(document.getElementById('deno-note-' + v).value) || 0;
      const sub = qty * v;
      total += sub;
      document.getElementById('deno-sub-' + v).textContent = '=' + sub.toLocaleString('en-IN');
    });

    const gross = parseFloat(document.getElementById('deno-txn-id').dataset.gross) || 0;
    const matched = Math.round(total * 100) === Math.round(gross * 100);

    document.getElementById('deno-total-val').textContent = 'INR ' + total.toLocaleString('en-IN');

    const bar = document.getElementById('deno-total-bar');
    const badge = document.getElementById('deno-match-badge');
    const submitBtn = document.getElementById('deno-submit-btn');

    if (matched) {
      bar.style.background = '#f0fdf4'; bar.style.borderColor = '#86efac';
      badge.style.background = '#dcfce7'; badge.style.color = '#166534';
      badge.textContent = 'Matched!';
      submitBtn.disabled = false;
    } else {
      bar.style.background = '#fff7f7'; bar.style.borderColor = '#fecaca';
      badge.style.background = '#fee2e2'; badge.style.color = '#b91c1c';
      badge.textContent = 'Mismatch';
      submitBtn.disabled = true;
    }
  };

  window.submitDeno = async () => {
    const txnId = document.getElementById('deno-txn-id').value;
    const body = {};
    NOTE_VALUES.forEach(v => {
      body['note_' + v] = parseInt(document.getElementById('deno-note-' + v).value) || 0;
    });
    const btn = document.getElementById('deno-submit-btn');
    btn.disabled = true; btn.textContent = 'Submitting...';
    try {
      await api.post('/api/employee/transactions/' + txnId + '/denomination', body);
      toast.success('Denomination submitted! Transaction sent to admin.');
      hideModal('deno-modal');
      loadQueue();
    } catch (err) {
      toast.error(err.message || 'Failed to submit denomination');
    } finally {
      btn.disabled = false; btn.innerHTML = 'Submit DENO &rarr; Send to Admin';
    }
  };

  // ===== View Modal =====
  window.closeReviewModal = () => hideModal('review-modal');

  window.openReviewModal = async (txn) => {
    const t = JSON.parse(decodeURIComponent(txn));
    document.getElementById('r-client').textContent = t.users.client_code;
    const tb = document.getElementById('r-type');
    tb.className = 'badge badge-' + t.type;
    tb.textContent = t.type === 'pay_in' ? 'Deposit' : 'Withdrawal';
    const sb = document.getElementById('r-status');
    sb.className = 'badge badge-' + t.status;
    sb.textContent = t.status === 'employee_approved' ? 'Awaiting Admin' : t.status;
    document.getElementById('r-gross').textContent = formatINR(t.gross_amount);
    document.getElementById('r-notes').value = t.admin_notes || '';

    const proofSec = document.getElementById('proof-section');
    const proofImg = document.getElementById('r-proof-img');
    const proofLoad = document.getElementById('proof-loading');
    if (t.type === 'pay_in') {
      proofSec.classList.remove('hidden');
      proofImg.classList.add('hidden');
      proofLoad.classList.remove('hidden');
      proofLoad.textContent = 'Loading image...';
      try {
        const res = await api.get('/api/employee/transactions/' + t.id + '/proof-url');
        proofImg.src = res.signed_url;
        proofImg.classList.remove('hidden');
        proofLoad.classList.add('hidden');
      } catch { proofLoad.textContent = 'Failed to load proof'; }
    } else {
      proofSec.classList.add('hidden');
    }

    const denoSec = document.getElementById('r-deno-section');
    const denoGrid = document.getElementById('r-deno-grid');
    if (t.denomination) {
      denoSec.classList.remove('hidden');
      denoGrid.innerHTML = NOTE_VALUES
        .filter(v => (t.denomination['note_' + v] || 0) > 0)
        .map(v =>
          '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.4rem;padding:0.35rem 0.5rem;text-align:center;">' +
            '<div style="font-weight:700;font-family:monospace;">x' + t.denomination['note_' + v] + '</div>' +
            '<div style="color:#64748b;font-size:0.68rem;">INR ' + v + '</div>' +
          '</div>'
        ).join('');
    } else {
      denoSec.classList.add('hidden');
    }

    showModal('review-modal');
  };

  document.getElementById('status-filter').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    currentPage = 1;
    loadQueue();
  });

  window.changeQueuePage = (page) => { currentPage = page; loadQueue(); };

  await loadQueue();
}

async function loadQueue() {
  const tbody = document.getElementById('queue-tbody');
  try {
    const filterParams = currentFilter ? '&status=' + currentFilter : '';
    const res = await api.get('/api/employee/transactions?page=' + currentPage + '&per_page=15' + filterParams);

    if (res.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No transactions found.</td></tr>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = res.transactions.map(t => {
      const encoded = encodeURIComponent(JSON.stringify(t));
      const isPending = t.status === 'pending';
      const actionBtn = isPending
        ? '<button class="btn btn-sm btn-primary" onclick="openDenoModal(\'' + encoded + '\')" style="font-weight:700;letter-spacing:0.05em;">DENO</button>'
        : '<button class="btn btn-sm btn-secondary" onclick="openReviewModal(\'' + encoded + '\')">View</button>';
      const statusLabel = t.status === 'employee_approved' ? 'Awaiting Admin' : t.status;

      return '<tr>' +
        '<td class="text-xs text-muted">' + formatDateTime(t.created_at) + '</td>' +
        '<td class="font-mono font-medium">' + t.users.client_code + '</td>' +
        '<td><span class="badge badge-' + t.type + '">' + (t.type === 'pay_in' ? 'Deposit' : 'Withdrawal') + '</span></td>' +
        '<td class="amount font-bold">' + formatINR(t.gross_amount) + '</td>' +
        '<td><span class="badge badge-' + t.status + '">' + statusLabel + '</span></td>' +
        '<td class="text-right">' + actionBtn + '</td>' +
        '</tr>';
    }).join('');

    const totalPages = Math.ceil(res.total / 15);
    let pgHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      pgHtml += '<button class="page-btn ' + (i === currentPage ? 'active' : '') + '" onclick="changeQueuePage(' + i + ')">' + i + '</button>';
    }
    document.getElementById('pagination').innerHTML = pgHtml;

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-danger text-center py-4">Failed to load queue.</td></tr>';
  }
}
