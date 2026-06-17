const API = {
  token: () => localStorage.getItem('token'),

  headers() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token()}` };
  },

  async get(url) {
    const r = await fetch(url, { headers: this.headers() });
    if (r.status === 401 || r.status === 403) { logout(); return; }
    return r.json();
  },

  async post(url, data) {
    const r = await fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(data) });
    return r.json();
  },

  async put(url, data) {
    const r = await fetch(url, { method: 'PUT', headers: this.headers(), body: JSON.stringify(data) });
    return r.json();
  },

  async delete(url) {
    const r = await fetch(url, { method: 'DELETE', headers: this.headers() });
    return r.json();
  },

  async upload(url, formData) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token()}` },
      body: formData
    });
    return r.json();
  }
};

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}

function requireAuth() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/'; return null; }
  const user = getUser();
  if (!user) { window.location.href = '/'; return null; }
  return user;
}

function showUserInfo() {
  const user = getUser();
  if (!user) return;
  const el = document.getElementById('currentUser');
  if (el) el.textContent = user.full_name + ' (' + (user.role === 'admin' ? 'Administrador' : 'Notario') + ')';

  if (user.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('d-none'));
  }
}

function statusBadge(status) {
  const map = {
    pendiente: ['Pendiente', 'badge-pendiente'],
    en_proceso: ['En Proceso', 'badge-en_proceso'],
    completado: ['Completado', 'badge-completado'],
    archivado: ['Archivado', 'badge-archivado']
  };
  const [label, cls] = map[status] || [status, 'bg-secondary'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('toastContainer');
  if (!existing) {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:70px;right:20px;z-index:9999;min-width:280px;';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible shadow-sm`;
  toast.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} me-2"></i>${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function fileSizeLabel(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(mimeType) {
  if (!mimeType) return 'bi-file';
  if (mimeType === 'application/pdf') return 'bi-file-pdf text-danger';
  if (mimeType.startsWith('image/')) return 'bi-file-image text-primary';
  if (mimeType.includes('word')) return 'bi-file-word text-info';
  return 'bi-file-earmark';
}
