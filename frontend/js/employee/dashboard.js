import { api } from '../core/api.js';
import { formatINR, showSkeletons, clearSkeletons } from '../core/ui.js';

export async function renderDashboard() {
  const root = document.getElementById('app-root');
  
  root.innerHTML = `
    <div class="topbar">
      <h2 class="topbar-title">Overview</h2>
    </div>

    <div class="stat-grid mb-8" id="stats-container">
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>
    
    <div class="card mb-8">
      <h3 class="font-bold mb-4">Volume Over Last 7 Days</h3>
      <div style="position: relative; height:300px; width:100%">
        <canvas id="volumeChart"></canvas>
      </div>
    </div>
  `;

  try {
    const data = await api.get('/api/employee/dashboard/summary');
    const m = data.this_month;
    
    document.getElementById('stats-container').innerHTML = `
      <div class="stat-card ${data.pending_transactions > 0 ? 'warning' : ''}">
        <div class="stat-icon">⏳</div>
        <div class="stat-label">Pending Verification</div>
        <div class="stat-value">${data.pending_transactions}</div>
        <div class="stat-sub">Transactions in queue</div>
      </div>
      
      <div class="stat-card success">
        <div class="stat-icon">📥</div>
        <div class="stat-label">Pay-In Volume (This Month)</div>
        <div class="stat-value">${formatINR(m.pay_in_gross)}</div>
        <div class="stat-sub">Total gross deposits</div>
      </div>
      
      <div class="stat-card danger">
        <div class="stat-icon">📤</div>
        <div class="stat-label">Pay-Out Volume (This Month)</div>
        <div class="stat-value">${formatINR(m.pay_out)}</div>
        <div class="stat-sub">Total withdrawals processed</div>
      </div>
      
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-label">Total Clients</div>
        <div class="stat-value">${data.total_clients}</div>
        <div class="stat-sub">Active platform users</div>
      </div>
    `;

    // Render Chart
    if (data.chart_data && window.Chart) {
      const ctx = document.getElementById('volumeChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.chart_data.dates,
          datasets: [
            {
              label: 'Pay-In Volume (₹)',
              data: data.chart_data.pay_in,
              borderColor: '#16a34a',
              backgroundColor: 'rgba(22, 163, 74, 0.1)',
              tension: 0.3,
              fill: true
            },
            {
              label: 'Pay-Out Volume (₹)',
              data: data.chart_data.pay_out,
              borderColor: '#F62440',
              backgroundColor: 'rgba(246, 36, 64, 0.1)',
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' }
          },
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    }

  } catch (err) {
    document.getElementById('stats-container').innerHTML = `<div class="text-danger">Failed to load summary stats.</div>`;
  }
}
