import { api } from '../core/api.js';
import { toast, setLoading } from '../core/ui.js';

export async function renderReports() {
  const root = document.getElementById('app-root');
  
  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Export Reports</h2>
    </div>

    <div class="card" style="max-width: 600px;">
      <form id="report-form">
        
        <div class="form-group">
          <label class="form-label">Date Range</label>
          <select id="r-range" class="form-select">
            <option value="7d">Last 7 Days</option>
            <option value="30d" selected>Last 30 Days</option>
            <option value="custom">Custom Range...</option>
          </select>
        </div>

        <div id="custom-dates" class="flex gap-4 hidden mb-5">
          <div class="form-group flex-1 mb-0">
            <label class="form-label">From</label>
            <input type="date" id="r-from" class="form-input">
          </div>
          <div class="form-group flex-1 mb-0">
            <label class="form-label">To</label>
            <input type="date" id="r-to" class="form-input">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Client Filter (Optional)</label>
          <select id="r-client" class="form-select">
            <option value="">All Clients</option>
          </select>
        </div>

        <div class="form-group mb-8">
          <label class="form-label">Format</label>
          <div class="flex gap-4 mt-2">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="format" value="pdf" checked>
              <span>PDF Document</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="format" value="excel">
              <span>Excel Spreadsheet</span>
            </label>
          </div>
        </div>

        <button type="submit" id="btn-export" class="btn btn-primary btn-lg btn-full">
          Generate & Download Report
        </button>
      </form>
    </div>
  `;

  // Handle custom date toggle
  document.getElementById('r-range').addEventListener('change', (e) => {
    const custom = document.getElementById('custom-dates');
    if (e.target.value === 'custom') {
      custom.classList.remove('hidden');
      document.getElementById('r-from').required = true;
      document.getElementById('r-to').required = true;
    } else {
      custom.classList.add('hidden');
      document.getElementById('r-from').required = false;
      document.getElementById('r-to').required = false;
    }
  });

  // Load clients for dropdown filter
  try {
    const res = await api.get('/api/employee/clients?per_page=100');
    const select = document.getElementById('r-client');
    res.clients.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.display_name} (${c.client_code})`;
      select.appendChild(opt);
    });
  } catch (e) { /* ignore */ }

  // Handle export
  document.getElementById('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const range = document.getElementById('r-range').value;
    const format = document.querySelector('input[name="format"]:checked').value;
    const clientId = document.getElementById('r-client').value;
    
    let url = `/api/employee/reports/export?format=${format}&range=${range}`;
    
    if (range === 'custom') {
      const from = document.getElementById('r-from').value;
      const to = document.getElementById('r-to').value;
      // append time to cover full day
      url += `&date_from=${from}T00:00:00&date_to=${to}T23:59:59`;
    }
    if (clientId) {
      url += `&client_id=${clientId}`;
    }

    setLoading('#btn-export', true);
    try {
      const blob = await api.get(url);
      
      // Trigger download
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = downloadUrl;
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      a.download = `cms-report-${range}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('Report downloaded successfully');
    } catch (err) {
      toast.error(err.message || 'Failed to generate report');
    } finally {
      setLoading('#btn-export', false);
    }
  });
}
