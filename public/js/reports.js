let mainChart, typeChart, statusChart;
let currentPeriod = 'day';

const COLORS = ['#1a3a5c', '#2d6a9f', '#c8a951', '#28a745', '#17a2b8', '#dc3545', '#6f42c1'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;
  showUserInfo();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  document.getElementById('rangeFrom').value = firstOfMonth.toISOString().split('T')[0];
  document.getElementById('rangeTo').value = today.toISOString().split('T')[0];

  await loadTypeOptions();
  loadAllCharts();
  loadTypeSummary();
});

async function loadTypeOptions() {
  const types = await API.get('/api/documents/types') || [];
  const sel = document.getElementById('rangeTypeFilter');
  if (sel) types.forEach(t => sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.name}</option>`));
}

async function loadAllCharts() {
  await Promise.all([loadMainChart(), loadStats()]);
}

function switchPeriod(period, el) {
  currentPeriod = period;
  document.querySelectorAll('.report-period-btn').forEach(b => {
    b.className = 'btn btn-sm btn-outline-secondary report-period-btn';
  });
  el.className = 'btn btn-sm report-period-btn active';
  loadMainChart();
}

async function loadMainChart() {
  const titleMap = {
    day: 'Documentos por Día (últimos 30 días)',
    week: 'Documentos por Semana (últimas 12 semanas)',
    month: 'Documentos por Mes (últimos 12 meses)',
    year: 'Documentos por Año'
  };

  document.getElementById('chartTitle').innerHTML = `<i class="bi bi-graph-up me-2"></i>${titleMap[currentPeriod]}`;

  const data = await API.get(`/api/reports/by-${currentPeriod}`);
  if (!data) return;

  let labels = data.map(d => {
    if (currentPeriod === 'month') {
      const [y, m] = d.month.split('-');
      return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
    }
    return d[currentPeriod] || d.date || d.week || d.month || d.year || '';
  });
  const counts = data.map(d => d.count);

  document.getElementById('chartPeriodLabel').textContent = `${data.length} períodos con datos`;

  if (mainChart) mainChart.destroy();
  mainChart = new Chart(document.getElementById('mainChart'), {
    type: currentPeriod === 'year' ? 'bar' : 'line',
    data: {
      labels,
      datasets: [{
        label: 'Documentos',
        data: counts,
        borderColor: '#2d6a9f',
        backgroundColor: currentPeriod === 'year' ? 'rgba(45,106,159,0.7)' : 'rgba(45,106,159,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} documento(s)`
          }
        }
      }
    }
  });

  // Update summary
  const total = counts.reduce((a, b) => a + b, 0);
  const days = currentPeriod === 'day' ? data.length : currentPeriod === 'week' ? data.length * 7 : currentPeriod === 'month' ? data.length * 30 : data.length * 365;
  document.getElementById('reportTotal').textContent = total;
  document.getElementById('reportAvgPerDay').textContent = days > 0 ? (total / Math.max(data.length, 1)).toFixed(1) : '0';
}

async function loadStats() {
  const data = await API.get('/api/reports/stats');
  if (!data) return;

  document.getElementById('reportCompleted').textContent = data.completed;
  document.getElementById('reportPending').textContent = data.pending;

  // Type chart
  if (typeChart) typeChart.destroy();
  typeChart = new Chart(document.getElementById('typeChartReport'), {
    type: 'doughnut',
    data: {
      labels: data.byType.map(t => t.name),
      datasets: [{ data: data.byType.map(t => t.count), backgroundColor: COLORS, borderWidth: 2 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }
    }
  });

  // Status chart
  const statusOrder = ['pendiente', 'en_proceso', 'completado', 'archivado'];
  const statusColors = { pendiente: '#ffc107', en_proceso: '#17a2b8', completado: '#28a745', archivado: '#6c757d' };
  const statusLabels = { pendiente: 'Pendiente', en_proceso: 'En Proceso', completado: 'Completado', archivado: 'Archivado' };

  const statusData = statusOrder.map(s => {
    const found = data.byStatus.find(b => b.status === s);
    return { status: s, count: found ? found.count : 0 };
  });

  if (statusChart) statusChart.destroy();
  statusChart = new Chart(document.getElementById('statusChartReport'), {
    type: 'bar',
    data: {
      labels: statusData.map(s => statusLabels[s.status]),
      datasets: [{
        data: statusData.map(s => s.count),
        backgroundColor: statusData.map(s => statusColors[s.status]),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
  });
}

async function loadTypeSummary() {
  const data = await API.get('/api/reports/stats');
  if (!data) return;

  const total = data.byType.reduce((a, t) => a + t.count, 0);
  const tbody = document.getElementById('typeSummaryBody');

  if (data.byType.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Sin datos</td></tr>';
    return;
  }

  tbody.innerHTML = data.byType.map(t => {
    const pct = total > 0 ? ((t.count / total) * 100).toFixed(1) : 0;
    return `
      <tr>
        <td><i class="${t.icon} me-2 text-primary"></i>${t.name}</td>
        <td class="text-end fw-bold">${t.count}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height:8px">
              <div class="progress-bar" style="width:${pct}%;background:#2d6a9f"></div>
            </div>
            <small class="text-muted" style="width:40px">${pct}%</small>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML += `<tr class="table-light fw-bold"><td>Total</td><td class="text-end">${total}</td><td>100%</td></tr>`;
}

async function loadRangeReport() {
  const from = document.getElementById('rangeFrom').value;
  const to = document.getElementById('rangeTo').value;
  const typeId = document.getElementById('rangeTypeFilter').value;

  if (!from || !to) { showToast('Seleccione el rango de fechas', 'error'); return; }
  if (from > to) { showToast('La fecha inicial debe ser menor a la final', 'error'); return; }

  let url = `/api/reports/range?from=${from}&to=${to}`;
  if (typeId) url += `&type_id=${typeId}`;

  const data = await API.get(url);
  if (!data) return;

  const card = document.getElementById('rangeReportCard');
  card.style.removeProperty('display');
  document.getElementById('rangeTotal').textContent = `${data.total} documentos`;

  const tbody = document.getElementById('rangeTableBody');
  if (data.documents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Sin documentos en este período</td></tr>';
  } else {
    tbody.innerHTML = data.documents.map(d => `
      <tr>
        <td class="fw-semibold">${d.title}</td>
        <td><small>${d.type_name}</small></td>
        <td>${statusBadge(d.status)}</td>
        <td><small>${d.created_by_name}</small></td>
        <td><small>${formatDateTime(d.created_at)}</small></td>
      </tr>
    `).join('');
  }

  // Update summary cards
  const completed = data.byStatus.find(s => s.status === 'completado');
  const pending = data.byStatus.find(s => s.status === 'pendiente');
  document.getElementById('reportTotal').textContent = data.total;
  document.getElementById('reportCompleted').textContent = completed ? completed.count : 0;
  document.getElementById('reportPending').textContent = pending ? pending.count : 0;

  // Scroll to table
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  showToast(`${data.total} documentos encontrados en el período`);
}
