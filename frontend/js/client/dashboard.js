import { api } from '../core/api.js';
import { formatINR, formatDateTime, timeUntil } from '../core/ui.js';
import { getCurrentUser } from '../core/auth.js';

export async function renderDashboard() {
  const root = document.getElementById('app-root');
  const user = getCurrentUser() || {};

  root.innerHTML = `
    <!-- Greeting -->
    <div style="padding: 0.5rem 0 1.25rem; color: white; margin-bottom: 0.5rem; margin-top:1.5rem">
      <div style="font-size: 0.85rem; opacity: 0.7; color:black;">Good day,</div>
      <div style="font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em;color:black;" id="greeting-name">...</div>
    </div>

    <!-- Balance Hero Card -->
    <div class="client-card mb-4" id="balance-card" style="background: linear-gradient(135deg, #0f172a, #1e3a5f); color: white; border: none;">
      <div style="font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; opacity: 0.6; text-transform: uppercase; margin-bottom: 0.5rem;">Total Balance</div>
      <div style="font-size: 2.8rem; font-weight: 800; letter-spacing: -2px; font-family: monospace; line-height: 1;" id="bal-total">...</div>
      
      <div style="height: 1px; background: rgba(255,255,255,0.1); margin: 1rem 0;"></div>

      <div style="display: flex; justify-content: space-between;">
        <div>
          <div style="font-size: 0.7rem; opacity: 0.6; margin-bottom: 3px;">Withdrawable</div>
          <div style="font-size: 1rem; font-weight: 700; font-family: monospace; color: #10b981;" id="bal-withdrawable">...</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 0.7rem; opacity: 0.6; margin-bottom: 3px;">Pay-In Fee</div>
          <div style="font-size: 1rem; font-weight: 700; font-family: monospace; color: #10b981;" id="bal-fee">...</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.7rem; opacity: 0.6; margin-bottom: 3px;">On Hold (24h)</div>
          <div style="font-size: 1rem; font-weight: 700; font-family: monospace; color: #fbbf24;" id="bal-hold">...</div>
        </div>
      </div>

      <!-- Pending withdrawal reservation notice -->
      <div id="pending-withdrawal-notice" style="display:none; margin-top: 0.75rem; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.72rem; color: #fbbf24;">
        <strong>Note:</strong> <span id="pending-withdrawal-text"></span> is reserved pending employee &amp; admin approval - your total balance is safe.
      </div>

      <div id="unlock-msg" style="font-size: 0.7rem; opacity: 0.5; margin-top: 0.75rem; text-align: center;"></div>
    </div>

    <!-- Stale Alert -->
    <div id="stale-alert-container"></div>

    <!-- Capacity Bar -->
    <div class="client-card mb-4 hidden" id="capacity-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <span style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Account Usage</span>
        <span style="font-size: 0.8rem; font-weight: 700; color: #0f172a;" id="cap-text">...</span>
      </div>
      <div style="height: 8px; background: #f1f5f9; border-radius: 999px; overflow: hidden;">
        <div id="cap-fill" style="height: 100%; border-radius: 999px; background: #10b981; width: 0%; transition: width 0.6s ease;"></div>
      </div>
      <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.4rem;" id="cap-limit-text"></div>
    </div>

    <!-- Quick Actions -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
      <a href="#/pay-in" style="
        background: linear-gradient(135deg, #10b981, #059669);
        color: white; text-decoration: none; border-radius: 1rem;
        padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;
        box-shadow: 0 4px 12px rgba(16,185,129,0.3);
        transition: transform 0.2s, box-shadow 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <span style="font-size: 1.75rem;">+</span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem;">Deposit</div>
          <div style="font-size: 0.7rem; opacity: 0.8;">Pay-In Request</div>
        </div>
      </a>
      <a href="#/pay-out" style="
        background: white; color: #0f172a; text-decoration: none;
        border-radius: 1rem; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;
        border: 1.5px solid #e2e8f0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        transition: transform 0.2s, box-shadow 0.2s;
      " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <span style="font-size: 1.75rem;">-</span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem;">Withdraw</div>
          <div style="font-size: 0.7rem; color: #64748b;">Pay-Out Request</div>
        </div>
      </a>
    </div>

    <!-- Recent Transactions -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div class="client-section-title" style="margin-bottom: 0;">Recent Transactions</div>
      <button onclick="downloadClientReport()" style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 0.4rem 0.8rem; border-radius: 0.5rem; font-size: 0.75rem; font-weight: 600; color: #334155; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: background 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
        <span style="font-size: 1rem;">&#x2B07;&#xFE0F;</span> Download PDF
      </button>
    </div>
    <div id="tx-list">
      <div class="client-card mb-3" style="height: 64px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9); background-size: 200%; animation: shimmer 1.5s infinite;"></div>
      <div class="client-card mb-3" style="height: 64px; background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9); background-size: 200%; animation: shimmer 1.5s infinite;"></div>
    </div>

    <style>
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    </style>

    <!-- Footer Credit -->
    <div style="text-align: center; padding: 1.5rem 0 0.5rem; font-size: 0.72rem; color: #94a3b8; letter-spacing: 0.01em;">
      Made by <span style="color: #e53e3e; font-weight: 700;">Elvrix TechSolutions</span> 2026
    </div>
  `;

  try {
    const data = await api.get('/api/client/dashboard');

    // Notification Alert Logic
    const notifiedTxns = JSON.parse(localStorage.getItem('notifiedTxns') || '[]');
    let newNotifications = false;
    
    data.recent_transactions.forEach(tx => {
      if ((tx.status === 'approved' || tx.status === 'rejected') && !notifiedTxns.includes(tx.id)) {
        if (tx.status === 'approved') {
            toast.success('Your ' + (tx.type === 'pay_in' ? 'Deposit' : 'Withdrawal') + ' of \u20B9' + tx.gross_amount + ' has been approved!');
        } else {
            toast.error('Your ' + (tx.type === 'pay_in' ? 'Deposit' : 'Withdrawal') + ' of \u20B9' + tx.gross_amount + ' was declined.');
        }
        notifiedTxns.push(tx.id);
        newNotifications = true;
      }
    });

    if (newNotifications) {
      localStorage.setItem('notifiedTxns', JSON.stringify(notifiedTxns));
    }

    // Greeting
    document.getElementById('greeting-name').textContent = user.display_name || 'Client';

    // Stale alert
    if (data.has_stale_pending) {
      document.getElementById('stale-alert-container').innerHTML = `
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 0.75rem; padding: 0.9rem 1rem; margin-bottom: 1rem; display: flex; gap: 0.75rem; align-items: flex-start;">
          <span style="font-size: 1.2rem;">&#x26A0;&#xFE0F;</span>
          <div style="font-size: 0.8rem; color: #92400e; font-weight: 500;">You have Pay-In requests pending for over 12 hours. Please contact support.</div>
        </div>
      `;
    }

    // Balances & Fee
    document.getElementById('bal-total').textContent = formatINR(data.total_balance);
    document.getElementById('bal-withdrawable').textContent = formatINR(data.withdrawable_now);
    document.getElementById('bal-hold').textContent = formatINR(data.on_hold_amount);
    document.getElementById('bal-fee').textContent = data.fee_percentage + '%';

    // Show pending withdrawal reservation notice if there's a difference
    const pendingWithdrawal = data.total_balance - data.withdrawable_now - data.on_hold_amount;
    if (pendingWithdrawal > 0.01) {
      const notice = document.getElementById('pending-withdrawal-notice');
      document.getElementById('pending-withdrawal-text').textContent = formatINR(pendingWithdrawal);
      notice.style.display = 'block';
    }

    if (data.next_unlock_at) {
      document.getElementById('unlock-msg').textContent = `Next unlock ${timeUntil(data.next_unlock_at)}`;
    }

    // Capacity
    if (data.account_limit !== null) {
      const card = document.getElementById('capacity-card');
      card.classList.remove('hidden');
      const used = data.total_balance;
      const pct = Math.min(100, (used / data.account_limit) * 100);
      document.getElementById('cap-text').textContent = `${formatINR(used)} / ${formatINR(data.account_limit)}`;
      document.getElementById('cap-limit-text').textContent = `${pct.toFixed(1)}% of limit used`;
      const fill = document.getElementById('cap-fill');
      fill.style.width = `${pct}%`;
      if (pct > 90) fill.style.background = '#ef4444';
      else if (pct > 75) fill.style.background = '#f59e0b';
    }

    // Transactions
    const txList = document.getElementById('tx-list');
    if (!data.recent_transactions || data.recent_transactions.length === 0) {
      txList.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: #94a3b8;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">---</div>
          <div style="font-weight: 600;">No transactions yet</div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">Your deposit and withdrawal history will appear here</div>
        </div>
      `;
      return;
    }

    const statusConfig = {
      pending:  { bg: '#fef3c7', color: '#92400e', label: 'Pending' },
      approved: { bg: '#d1fae5', color: '#065f46', label: 'Approved' },
      rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
    };

    txList.innerHTML = data.recent_transactions.map(tx => {
      const isIn = tx.type === 'pay_in';
      const st = statusConfig[tx.status] || statusConfig.pending;
      return `
        <div class="client-card mb-3" style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem;">
          <div style="display: flex; align-items: center; gap: 0.85rem; flex: 1; min-width: 0;">
            <div style="
              width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
              background: ${isIn ? '#d1fae5' : '#fee2e2'};
              display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
            ">${isIn ? '+' : '-'}</div>
            <div style="min-width: 0;">
              <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 2px;">${isIn ? 'Deposit' : 'Withdrawal'}</div>
              <div style="font-size: 0.7rem; color: #94a3b8;">${formatDateTime(tx.created_at)}</div>
              ${tx.status === 'rejected' && tx.admin_notes ? `<div style="font-size: 0.7rem; color: #ef4444; margin-top: 2px;">Reason: ${tx.admin_notes}</div>` : ''}
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div style="font-family: monospace; font-weight: 800; font-size: 1rem; color: ${isIn ? '#10b981' : '#ef4444'};">
              ${isIn ? '+' : '-'}${formatINR(tx.gross_amount)}
            </div>
            <span style="
              display: inline-block; margin-top: 4px;
              background: ${st.bg}; color: ${st.color};
              font-size: 0.65rem; font-weight: 700;
              padding: 2px 8px; border-radius: 999px;
            ">${st.label}</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    document.getElementById('tx-list').innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ef4444;">
        <div style="font-size: 2rem;">!</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">Failed to load dashboard data</div>
      </div>
    `;
  }
}

  window.downloadClientReport = async () => {
    try {
      toast.info('Generating PDF report...');
      const res = await fetch('/api/client/export?range=30d', {
        headers: { 'Authorization': 'Bearer ' + store.getToken() }
      });
      if (!res.ok) throw new Error('Failed to generate report');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-transactions-30d.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Download complete');
    } catch (err) {
      toast.error(err.message);
    }
  };

