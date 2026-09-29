import { api } from '../core/api.js';
import { toast, showModal, hideModal, setLoading, formatDate, confirmModal } from '../core/ui.js';

let currentPage = 1;

export async function renderEmployees() {
  const root = document.getElementById('app-root');
  
  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Employees</h2>
      <div class="topbar-actions">
        <button class="btn btn-primary" onclick="openCreateEmployeeModal()">+ Add Employee</button>
      </div>
    </div>

    <div class="card mb-6">
      <input type="text" id="search-input" class="form-input" placeholder="Search by name or username..." style="max-width: 300px;">
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Name</th>
            <th>Gender</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Created</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody id="employees-tbody">
          <tr><td colspan="7" class="text-center py-4">Loading...</td></tr>
        </tbody>
      </table>
    </div>
    
    <div class="pagination mt-4" id="pagination"></div>

    <!-- Create/Edit Modal -->
    <div class="modal-backdrop" id="employee-modal">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title" id="modal-title">Add Employee</h3>
          <button class="modal-close" onclick="closeEmployeeModal()">×</button>
        </div>
        <form id="employee-form">
          <input type="hidden" id="employee-id">
          
          <div class="form-group">
            <label class="form-label">Employee Name <span class="required">*</span></label>
            <input type="text" id="e-name" class="form-input" required>
          </div>
          
          <div id="password-group" class="form-group">
            <label class="form-label">Initial Password <span class="required">*</span></label>
            <input type="text" id="e-pass" class="form-input" minlength="8" placeholder="Will be forced to change on first login">
          </div>
          
          <div class="flex gap-4">
            <div class="form-group flex-1">
              <label class="form-label">Gender <span class="required">*</span></label>
              <select id="e-gender" class="form-select" required>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Phone No. <span class="required">*</span></label>
              <input type="tel" id="e-phone" class="form-input" required placeholder="e.g. 9876543210">
            </div>
          </div>
          
          <div class="form-group hidden" id="status-group">
            <label class="form-label">Status</label>
            <select id="e-active" class="form-select">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeEmployeeModal()">Cancel</button>
            <button type="submit" id="btn-save-employee" class="btn btn-primary">Save Employee</button>
          </div>
        </form>
      </div>
    </div>
  `;

  window.openCreateEmployeeModal = () => {
    document.getElementById('modal-title').textContent = 'Add Employee';
    document.getElementById('employee-form').reset();
    document.getElementById('employee-id').value = '';
    document.getElementById('password-group').classList.remove('hidden');
    document.getElementById('e-pass').required = true;
    document.getElementById('status-group').classList.add('hidden');
    showModal('employee-modal');
  };
  
  window.closeEmployeeModal = () => hideModal('employee-modal');
  
  window.openEditEmployeeModal = (id, name, gender, phone, active) => {
    document.getElementById('modal-title').textContent = 'Edit Employee';
    document.getElementById('employee-id').value = id;
    document.getElementById('e-name').value = name;
    document.getElementById('e-gender').value = gender;
    document.getElementById('e-phone').value = phone;
    
    document.getElementById('password-group').classList.add('hidden');
    document.getElementById('e-pass').required = false;
    
    document.getElementById('e-active').value = active;
    document.getElementById('status-group').classList.remove('hidden');
    
    showModal('employee-modal');
  };

  document.getElementById('employee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('employee-id').value;
    const isEdit = !!id;
    
    const body = {
      display_name: document.getElementById('e-name').value,
      gender: document.getElementById('e-gender').value,
      phone: document.getElementById('e-phone').value,
    };

    if (isEdit) {
      body.is_active = document.getElementById('e-active').value === 'true';
    } else {
      body.password = document.getElementById('e-pass').value;
    }

    setLoading('#btn-save-employee', true);
    try {
      if (isEdit) {
        await api.patch(`/api/admin/employees/${id}`, body);
        toast.success('Employee updated');
      } else {
        const res = await api.post('/api/admin/employees', body);
        toast.success(`Employee created! Username: ${res.login_identifier}`);
      }
      hideModal('employee-modal');
      loadEmployees();
    } catch (err) {
      toast.error(err.message || 'Failed to save employee');
    } finally {
      setLoading('#btn-save-employee', false);
    }
  });

  // Search debounce
  let searchTimeout;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadEmployees(e.target.value);
    }, 400);
  });

  window.changeEmployeePage = (page) => {
    currentPage = page;
    loadEmployees(document.getElementById('search-input').value);
  };

  window.deleteEmployee = async (id, name) => {
    const isConfirmed = await confirmModal(
      `Are you sure you want to completely delete employee: ${name}? This action cannot be undone.`,
      'Delete Employee',
      'Delete',
      'Cancel',
      true // isDanger
    );
    
    if (!isConfirmed) return;
    
    try {
      await api.delete(`/api/admin/employees/${id}`);
      toast.success('Employee deleted successfully');
      loadEmployees(document.getElementById('search-input').value);
    } catch (err) {
      toast.error(err.message || 'Failed to delete employee');
    }
  };

  await loadEmployees();
}

async function loadEmployees(search = '') {
  const tbody = document.getElementById('employees-tbody');
  try {
    const res = await api.get(`/api/admin/employees?page=${currentPage}&per_page=15&search=${encodeURIComponent(search)}`);
    
    if (res.employees.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No employees found.</td></tr>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = res.employees.map(e => `
      <tr>
        <td class="font-mono font-bold">${e.login_identifier}</td>
        <td class="font-medium">${e.display_name}</td>
        <td class="capitalize">${e.gender}</td>
        <td>${e.phone}</td>
        <td><span class="badge ${e.is_active ? 'badge-approved' : 'badge-rejected'}">${e.is_active ? 'Active' : 'Inactive'}</span></td>
        <td class="text-xs text-muted">${formatDate(e.created_at)}</td>
        <td class="text-right">
          <button class="btn btn-sm btn-secondary" onclick="openEditEmployeeModal('${e.id}', '${e.display_name.replace(/'/g, "\\'")}', '${e.gender}', '${e.phone}', '${e.is_active}')">Edit</button>
          <button class="btn btn-sm btn-danger" style="margin-left:4px;" onclick="deleteEmployee('${e.id}', '${e.display_name.replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `).join('');

    // Pagination
    const totalPages = Math.ceil(res.total / 15);
    let pgHtml = '';
    for(let i=1; i<=totalPages; i++) {
      pgHtml += `<button class="page-btn ${i===currentPage ? 'active' : ''}" onclick="changeEmployeePage(${i})">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pgHtml;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center py-4">Failed to load employees.</td></tr>`;
  }
}
