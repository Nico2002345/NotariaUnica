let currentTemplateId = null;
let templateFields = [];

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;
  if (user.role !== 'admin') { window.location.href = '/dashboard'; return; }
  showUserInfo();
  loadUsers();
});

function showAdminTab(tab, el) {
  document.querySelectorAll('#adminTabs .nav-link').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('usersPanel').classList.toggle('d-none', tab !== 'users');
  document.getElementById('templatesPanel').classList.toggle('d-none', tab !== 'templates');
  if (tab === 'templates') loadTemplates();
}

// ===== USERS =====
async function loadUsers() {
  const users = await API.get('/api/admin/users') || [];
  const tbody = document.getElementById('usersList');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="fw-semibold">${u.full_name}</td>
      <td><code>${u.username}</code></td>
      <td><span class="badge role-badge-${u.role} text-white">${u.role === 'admin' ? 'Administrador' : 'Notario'}</span></td>
      <td>
        <span class="badge ${u.is_active ? 'bg-success' : 'bg-secondary'}">
          ${u.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td><small class="text-muted">${formatDate(u.created_at)}</small></td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-primary" onclick="openEditUserModal(${u.id})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deactivateUser(${u.id})" ${!u.is_active ? 'disabled' : ''}><i class="bi bi-person-x"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openUserModal() {
  document.getElementById('editUserId').value = '';
  document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-person-plus me-2"></i>Nuevo Usuario';
  document.getElementById('userFullName').value = '';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = 'notario';
  document.getElementById('userIsActive').checked = true;
  document.getElementById('userAlert').className = 'alert d-none';
  document.getElementById('userUsername').disabled = false;
  document.getElementById('pwdRequired').classList.remove('d-none');
  document.getElementById('pwdHint').textContent = '';
  document.getElementById('userActiveRow').classList.add('d-none');
  new bootstrap.Modal(document.getElementById('userModal')).show();
}

async function openEditUserModal(id) {
  const users = await API.get('/api/admin/users') || [];
  const user = users.find(u => u.id === id);
  if (!user) return;

  document.getElementById('editUserId').value = user.id;
  document.getElementById('userModalTitle').innerHTML = '<i class="bi bi-pencil me-2"></i>Editar Usuario';
  document.getElementById('userFullName').value = user.full_name;
  document.getElementById('userUsername').value = user.username;
  document.getElementById('userUsername').disabled = true;
  document.getElementById('userPassword').value = '';
  document.getElementById('userRole').value = user.role;
  document.getElementById('userIsActive').checked = user.is_active === 1;
  document.getElementById('userAlert').className = 'alert d-none';
  document.getElementById('pwdRequired').classList.add('d-none');
  document.getElementById('pwdHint').textContent = 'Dejar en blanco para no cambiar la contraseña';
  document.getElementById('userActiveRow').classList.remove('d-none');
  new bootstrap.Modal(document.getElementById('userModal')).show();
}

async function saveUser() {
  const id = document.getElementById('editUserId').value;
  const full_name = document.getElementById('userFullName').value.trim();
  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;
  const role = document.getElementById('userRole').value;
  const is_active = document.getElementById('userIsActive').checked ? 1 : 0;
  const alertEl = document.getElementById('userAlert');

  if (!full_name || (!id && !username) || (!id && !password)) {
    alertEl.className = 'alert alert-warning';
    alertEl.textContent = 'Complete todos los campos requeridos';
    return;
  }

  let res;
  if (id) {
    const payload = { full_name, role, is_active };
    if (password) payload.password = password;
    res = await API.put(`/api/admin/users/${id}`, payload);
  } else {
    res = await API.post('/api/admin/users', { username, password, full_name, role });
  }

  if (res.id) {
    bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
    showToast(id ? 'Usuario actualizado' : 'Usuario creado exitosamente');
    loadUsers();
  } else {
    alertEl.className = 'alert alert-danger';
    alertEl.textContent = res.error || 'Error al guardar usuario';
  }
}

async function deactivateUser(id) {
  if (!confirm('¿Desactivar este usuario?')) return;
  const res = await API.delete(`/api/admin/users/${id}`);
  if (res.message) { showToast('Usuario desactivado', 'warning'); loadUsers(); }
  else showToast(res.error || 'Error', 'error');
}

// ===== TEMPLATES =====
async function loadTemplates() {
  const types = await API.get('/api/admin/templates') || [];
  const list = document.getElementById('typeList');
  list.innerHTML = types.map(t => `
    <a href="#" class="list-group-item list-group-item-action d-flex align-items-center gap-2" onclick="editTemplate(${t.id}, this)">
      <i class="${t.icon} text-primary"></i>
      <div>
        <div class="fw-semibold small">${t.name}</div>
        <div class="text-muted" style="font-size:0.75rem">${t.fields_template.length} campos</div>
      </div>
    </a>
  `).join('');
}

async function editTemplate(id, el) {
  document.querySelectorAll('#typeList .list-group-item').forEach(a => a.classList.remove('active'));
  el.classList.add('active');

  const types = await API.get('/api/admin/templates') || [];
  const type = types.find(t => t.id === id);
  if (!type) return;

  currentTemplateId = id;
  templateFields = JSON.parse(JSON.stringify(type.fields_template));

  document.getElementById('templateEditorTitle').textContent = `Campos: ${type.name}`;
  document.getElementById('templateEditor').style.removeProperty('display');
  document.getElementById('templatePlaceholder').classList.add('d-none');

  renderFields();
}

function renderFields() {
  const list = document.getElementById('fieldsList');
  if (templateFields.length === 0) {
    list.innerHTML = '<div class="text-muted text-center py-3">Sin campos. Haga clic en "Agregar Campo".</div>';
    return;
  }

  list.innerHTML = templateFields.map((f, i) => `
    <div class="field-row">
      <div class="row g-2 align-items-center">
        <div class="col-md-4">
          <label class="form-label small fw-semibold mb-1">Nombre interno</label>
          <input type="text" class="form-control form-control-sm" value="${f.name}" onchange="updateField(${i}, 'name', this.value)" placeholder="nombre_campo">
        </div>
        <div class="col-md-4">
          <label class="form-label small fw-semibold mb-1">Etiqueta visible</label>
          <input type="text" class="form-control form-control-sm" value="${f.label}" onchange="updateField(${i}, 'label', this.value)" placeholder="Nombre del Campo">
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-semibold mb-1">Tipo</label>
          <select class="form-select form-select-sm" onchange="updateField(${i}, 'type', this.value)">
            <option ${f.type === 'text' ? 'selected' : ''}>text</option>
            <option ${f.type === 'textarea' ? 'selected' : ''}>textarea</option>
            <option ${f.type === 'date' ? 'selected' : ''}>date</option>
            <option ${f.type === 'number' ? 'selected' : ''}>number</option>
            <option ${f.type === 'select' ? 'selected' : ''}>select</option>
          </select>
        </div>
        <div class="col-md-1">
          <label class="form-label small fw-semibold mb-1">Req.</label>
          <div class="form-check mt-1">
            <input type="checkbox" class="form-check-input" ${f.required ? 'checked' : ''} onchange="updateField(${i}, 'required', this.checked)">
          </div>
        </div>
        <div class="col-md-1 text-end">
          <label class="form-label small fw-semibold mb-1 d-block">&nbsp;</label>
          <button class="btn btn-sm btn-outline-danger" onclick="removeField(${i})"><i class="bi bi-trash"></i></button>
        </div>
        ${f.type === 'select' ? `
          <div class="col-12">
            <label class="form-label small fw-semibold mb-1">Opciones (separadas por coma)</label>
            <input type="text" class="form-control form-control-sm" value="${(f.options || []).join(', ')}"
              onchange="updateField(${i}, 'options', this.value.split(',').map(o => o.trim()).filter(Boolean))" placeholder="Opción 1, Opción 2, Opción 3">
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function addField() {
  templateFields.push({ name: `campo_${templateFields.length + 1}`, label: 'Nuevo Campo', type: 'text', required: false });
  renderFields();
}

function updateField(idx, key, value) {
  templateFields[idx][key] = value;
}

function removeField(idx) {
  templateFields.splice(idx, 1);
  renderFields();
}

async function saveTemplate() {
  if (!currentTemplateId) return;
  const res = await API.put(`/api/admin/templates/${currentTemplateId}`, { fields_template: templateFields });
  if (res.id) {
    showToast('Plantilla guardada exitosamente');
    loadTemplates();
  } else {
    showToast(res.error || 'Error al guardar', 'error');
  }
}
