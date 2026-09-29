import { api } from '../core/api.js';
import { toast, showModal, hideModal, setLoading, formatINR, formatDate, confirmModal } from '../core/ui.js';

let currentPage = 1;

export async function renderClients() {
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Clients</h2>
      <div class="topbar-actions">
        <button class="btn btn-primary" onclick="openCreateClientModal()">+ Add Client</button>
      </div>
    </div>

    <div class="card mb-6">
      <input type="text" id="search-input" class="form-input" placeholder="Search by name or code..." style="max-width: 300px;">
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Client ID</th>
            <th>Name</th>
            <th>Percent %</th>
            <th>Status</th>
            <th>Created</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="clients-tbody">
          <tr><td colspan="6" class="text-center py-4">Loading...</td></tr>
        </tbody>
      </table>
    </div>
    
    <div class="pagination mt-4" id="pagination"></div>

    <!-- Create/Edit Modal -->
    <div class="modal-backdrop" id="client-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Add Client</h3>
          <button class="modal-close" onclick="closeClientModal()">×</button>
        </div>
        <form id="client-form">
          <input type="hidden" id="client-id">
          
          <div class="form-group">
            <label class="form-label">Company Name <span class="required">*</span></label>
            <input type="text" id="c-name" class="form-input" required>
          </div>
          
          <div id="password-group" class="form-group">
            <label class="form-label">Initial Password <span class="required">*</span></label>
            <input type="text" id="c-pass" class="form-input" minlength="8" placeholder="Will be forced to change on first login">
          </div>
          
          <div class="flex gap-4">
            <div class="form-group flex-1">
              <label class="form-label">Fee Percentage <span class="required">*</span></label>
              <div class="input-prefix-group">
                <input type="number" id="c-fee" class="form-input" required min="0" step="0.01" style="padding-left:12px; padding-right:24px;">
                <span class="input-prefix" style="left:auto; right:12px;">%</span>
              </div>
            </div>
          </div>
          
          <div class="form-group hidden" id="status-group">
            <label class="form-label">Status</label>
            <select id="c-active" class="form-select">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeClientModal()">Cancel</button>
            <button type="submit" id="btn-save-client" class="btn btn-primary">Save Client</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Attach global functions for HTML event handlers
  window.openCreateClientModal = () => {
    document.getElementById('modal-title').textContent = 'Add Client';
    document.getElementById('client-form').reset();
    document.getElementById('client-id').value = '';
    document.getElementById('password-group').classList.remove('hidden');
    document.getElementById('c-pass').required = true;
    document.getElementById('status-group').classList.add('hidden');
    showModal('client-modal');
  };

  window.closeClientModal = () => hideModal('client-modal');

  window.openEditClientModal = (id, name, fee, active) => {
    document.getElementById('modal-title').textContent = 'Edit Client';
    document.getElementById('client-id').value = id;
    document.getElementById('c-name').value = name;
    document.getElementById('c-fee').value = fee;

    document.getElementById('password-group').classList.add('hidden');
    document.getElementById('c-pass').required = false;

    const statusSelect = document.getElementById('c-active');
    statusSelect.value = active;
    document.getElementById('status-group').classList.remove('hidden');

    showModal('client-modal');
  };

  document.getElementById('client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('client-id').value;
    const isEdit = !!id;

    const body = {
      display_name: document.getElementById('c-name').value,
      fee_percentage: parseFloat(document.getElementById('c-fee').value),
      account_limit: null,
    };

    if (isEdit) {
      body.is_active = document.getElementById('c-active').value === 'true';
    } else {
      body.password = document.getElementById('c-pass').value;
    }

    setLoading('#btn-save-client', true);
    try {
      if (isEdit) {
        await api.patch(`/api/admin/clients/${id}`, body);
        toast.success('Client updated');
      } else {
        const res = await api.post('/api/admin/clients', body);
        toast.success(`Client created! Code: ${res.client_code}`);
      }
      hideModal('client-modal');
      loadClients();
    } catch (err) {
      toast.error(err.message || 'Failed to save client');
    } finally {
      setLoading('#btn-save-client', false);
    }
  });

  // Search debounce
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadClients(e.target.value);
    }, 400);
  });

  window.changeClientPage = (page) => {
    currentPage = page;
    loadClients(document.getElementById('search-input').value);
  };

  window.deleteClient = async (id, name) => {
    const isConfirmed = await confirmModal(
      `Are you sure you want to completely delete client: ${name}? All their transactions and data will be permanently removed. This action cannot be undone.`,
      'Delete Client',
      'Delete',
      'Cancel',
      true // isDanger
    );

    if (!isConfirmed) return;

    try {
      await api.delete(`/api/admin/clients/${id}/delete`);
      toast.success('Client deleted successfully');
      loadClients(document.getElementById('search-input').value);
    } catch (err) {
      toast.error(err.message || 'Failed to delete client');
    }
  };

  await loadClients();
}

async function loadClients(search = '') {
  const tbody = document.getElementById('clients-tbody');
  try {
    const res = await api.get(`/api/admin/clients?page=${currentPage}&per_page=15&search=${encodeURIComponent(search)}`);

    if (res.clients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No clients found.</td></tr>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = res.clients.map(c => `
      <tr>
        <td class="font-mono font-bold">${c.client_code}</td>
        <td class="font-medium">${c.display_name}</td>
        <td>${c.fee_percentage}%</td>
        <td><span class="badge ${c.is_active ? 'badge-approved' : 'badge-rejected'}">${c.is_active ? 'Active' : 'Inactive'}</span></td>
        <td class="text-xs text-muted">${formatDate(c.created_at)}</td>
        <td class="text-right">
          <button class="btn btn-sm btn-secondary" onclick="openEditClientModal('${c.id}', '${c.display_name.replace(/'/g, "\\'")}', ${c.fee_percentage}, '${c.is_active}')">Edit</button>
          <button class="btn btn-sm btn-danger" style="margin-left:4px;" onclick="deleteClient('${c.id}', '${c.display_name.replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `).join('');

    // Pagination
    const totalPages = Math.ceil(res.total / 15);
    let pgHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      pgHtml += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changeClientPage(${i})">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pgHtml;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-4">Failed to load clients.</td></tr>`;
  }
}
