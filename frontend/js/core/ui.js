/**
 * core/ui.js — Toast notifications, loading spinners, modal helpers.
 *
 * Usage:
 *   import { toast, showModal, hideModal, setLoading } from './ui.js';
 *
 *   toast.success('Transaction approved!');
 *   toast.error('Something went wrong');
 *   toast.warning('Funds still on hold');
 *   toast.info('Report is being generated...');
 *
 *   setLoading('#submit-btn', true);
 *   showModal('confirm-modal');
 *   hideModal('confirm-modal');
 *   
 *   const ok = await confirmModal('Are you sure?', 'Delete Account');
 */

// ─── Toast Notifications ──────────────────────────────────────────────────────

const TOAST_ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

const TOAST_DURATION = 4000; // ms

function getOrCreateToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function createToast(message, type = 'info') {
  const container = getOrCreateToastContainer();
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ'}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toastEl);

  // Auto-dismiss
  setTimeout(() => {
    toastEl.classList.add('exiting');
    toastEl.addEventListener('animationend', () => toastEl.remove(), { once: true });
    // Fallback removal
    setTimeout(() => toastEl.remove(), 500);
  }, TOAST_DURATION);
}

export const toast = {
  success: (msg) => createToast(msg, 'success'),
  error:   (msg) => createToast(msg, 'error'),
  warning: (msg) => createToast(msg, 'warning'),
  info:    (msg) => createToast(msg, 'info'),
};


// ─── Button Loading State ─────────────────────────────────────────────────────

/**
 * Set a button to loading state (shows spinner, disables button).
 * @param {string|HTMLElement} btnOrSelector
 * @param {boolean} isLoading
 */
export function setLoading(btnOrSelector, isLoading) {
  const btn = typeof btnOrSelector === 'string'
    ? document.querySelector(btnOrSelector)
    : btnOrSelector;
  if (!btn) return;

  if (isLoading) {
    btn.classList.add('loading');
    btn.disabled = true;
    if (!btn.querySelector('.btn-text')) {
      btn.innerHTML = `<span class="btn-text">${btn.innerHTML}</span>`;
    }
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}


// ─── Modal Helpers ────────────────────────────────────────────────────────────

export function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideModal(modalId);
    }, { once: true });
  }
}

export function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/**
 * Replace native confirm() with a custom Promise-based modal.
 * @param {string} message - The text to display
 * @param {string} [title="Confirm Action"] - Modal title
 * @param {string} [confirmText="OK"] - Text for confirm button
 * @param {string} [cancelText="Cancel"] - Text for cancel button
 * @param {boolean} [isDanger=false] - If true, confirm button is red
 * @returns {Promise<boolean>}
 */
export function confirmModal(message, title = 'Confirm Action', confirmText = 'OK', cancelText = 'Cancel', isDanger = false) {
  return new Promise((resolve) => {
    // Check if the generic confirm modal already exists
    let modal = document.getElementById('generic-confirm-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.id = 'generic-confirm-modal';
      modal.innerHTML = `
        <div class="modal modal-sm" style="max-width: 400px;">
          <div class="modal-header">
            <h3 class="modal-title" id="confirm-modal-title"></h3>
            <button class="modal-close" id="confirm-modal-close">×</button>
          </div>
          <div class="modal-body" style="padding: 1rem 1.5rem; color: var(--color-text-sub);">
            <p id="confirm-modal-message"></p>
          </div>
          <div class="modal-actions" style="margin-top: 0.5rem;">
            <button class="btn btn-ghost" id="confirm-modal-cancel"></button>
            <button class="btn" id="confirm-modal-ok"></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const btnCancel = document.getElementById('confirm-modal-cancel');
    const btnOk = document.getElementById('confirm-modal-ok');
    const btnClose = document.getElementById('confirm-modal-close');

    titleEl.textContent = title;
    msgEl.textContent = message;
    btnCancel.textContent = cancelText;
    btnOk.textContent = confirmText;

    if (isDanger) {
      btnOk.className = 'btn btn-danger';
    } else {
      btnOk.className = 'btn btn-primary';
    }

    const cleanup = (result) => {
      hideModal('generic-confirm-modal');
      // Remove event listeners by cloning nodes (quick and clean for generic modal)
      const newCancel = btnCancel.cloneNode(true);
      btnCancel.parentNode.replaceChild(newCancel, btnCancel);
      const newOk = btnOk.cloneNode(true);
      btnOk.parentNode.replaceChild(newOk, btnOk);
      const newClose = btnClose.cloneNode(true);
      btnClose.parentNode.replaceChild(newClose, btnClose);
      resolve(result);
    };

    btnCancel.onclick = () => cleanup(false);
    btnClose.onclick = () => cleanup(false);
    btnOk.onclick = () => cleanup(true);

    showModal('generic-confirm-modal');
  });
}


// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Format a number as Indian Rupees.
 * @example formatINR(196000) → "₹1,96,000.00"
 */
export function formatINR(amount) {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format ISO timestamp to a readable date+time string in IST.
 * @example formatDateTime('2026-09-23T08:30:00Z') → "23 Sep 2026, 2:00 PM"
 */
export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

export function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * Format a "time until" countdown string.
 * @example timeUntil('2026-09-24T10:00:00Z') → "in 23h 45m"
 */
export function timeUntil(isoStr) {
  if (!isoStr) return null;
  const diff = new Date(isoStr) - Date.now();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}


// ─── Skeleton Loader ──────────────────────────────────────────────────────────

export function showSkeletons(container, count = 3) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton skeleton-card mb-4"></div>
  `).join('');
}

export function clearSkeletons(container) {
  container.innerHTML = '';
}
