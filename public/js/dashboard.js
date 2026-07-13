let dayChart, typeChart;
let selectedDashboardUser = '';

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;
  showUserInfo();

  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  if (user.role === 'admin') await loadDashboardUserOptions();

  loadStats();
  loadDayChart();
});

async function loadDashboardUserOptions() {
  const users = await API.get('/api/admin/users') || [];
  const notarios = users.filter(u => u.role === 'notario');
  const select = document.getElementById('dashboardUserSelect');
  select.innerHTML = '<option value="">Todos los notarios</option>' +
    notarios.map(u => `<option value="${u.id}">${u.full_name}</option>`).join('');
}

function changeDashboardUser(userId) {
  selectedDashboardUser = userId;
  loadStats();
  loadDayChart();
}

async function loadStats() {
  const qs = selectedDashboardUser ? `?user_id=${selectedDashboardUser}` : '';
  const data = await API.get(`/api/reports/stats${qs}`);
  if (!data) return;

  document.getElementById('totalDocs').textContent = data.total;
  document.getElementById('todayDocs').textContent = data.todayCount;
  document.getElementById('pendingDocs').textContent = data.pending;
  document.getElementById('completedDocs').textContent = data.completed;

  // Recent docs
  const tbody = document.getElementById('recentDocsList');
  if (data.recentDocs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No hay documentos aún</td></tr>';
  } else {
    tbody.innerHTML = data.recentDocs.map(d => `
      <tr style="cursor:pointer" onclick="window.location='/documents'">
        <td>
          <i class="${d.icon} me-2 text-primary"></i>
          <span class="fw-semibold">${d.title}</span>
        </td>
        <td class="d-none d-md-table-cell"><small class="text-muted">${d.type_name}</small></td>
        <td>${statusBadge(d.status)}</td>
        <td class="d-none d-sm-table-cell"><small class="text-muted">${formatDateTime(d.created_at)}</small></td>
      </tr>
    `).join('');
  }

  // Type distribution
  const typeDiv = document.getElementById('typeDistribution');
  typeDiv.innerHTML = data.byType.map(t => `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="small"><i class="${t.icon} me-1"></i>${t.name}</span>
      <span class="badge bg-primary">${t.count}</span>
    </div>
  `).join('');

  // Type pie chart
  if (typeChart) typeChart.destroy();
  const colors = ['#1a3a5c', '#2d6a9f', '#c8a951', '#28a745', '#17a2b8', '#dc3545'];
  typeChart = new Chart(document.getElementById('typeChart'), {
    type: 'doughnut',
    data: {
      labels: data.byType.map(t => t.name),
      datasets: [{ data: data.byType.map(t => t.count), backgroundColor: colors, borderWidth: 2 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }
    }
  });
}

async function loadDayChart() {
  const qs = selectedDashboardUser ? `&user_id=${selectedDashboardUser}` : '';
  const data = await API.get(`/api/reports/by-day?days=30${qs}`);
  if (!data) return;

  if (dayChart) dayChart.destroy();
  dayChart = new Chart(document.getElementById('dayChart'), {
    type: 'line',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        label: 'Documentos',
        data: data.map(d => d.count),
        borderColor: '#2d6a9f',
        backgroundColor: 'rgba(45,106,159,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      plugins: { legend: { display: false } }
    }
  });
}

async function changePassword() {
  const current = document.getElementById('currentPwd').value;
  const next = document.getElementById('newPwd').value;
  const confirm = document.getElementById('confirmPwd').value;
  const alertEl = document.getElementById('pwdAlert');

  if (!current || !next || !confirm) {
    alertEl.className = 'alert alert-warning';
    alertEl.textContent = 'Complete todos los campos';
    return;
  }
  if (next !== confirm) {
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = 'Las contraseñas no coinciden';
    return;
  }

  const res = await API.post('/api/auth/change-password', { current_password: current, new_password: next });
  if (res.message) {
    bootstrap.Modal.getInstance(document.getElementById('changePwdModal')).hide();
    showToast('Contraseña cambiada exitosamente');
    document.getElementById('currentPwd').value = '';
    document.getElementById('newPwd').value = '';
    document.getElementById('confirmPwd').value = '';
  } else {
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = res.error;
  }
}
