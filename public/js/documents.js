let docTypes = [];
let currentTypeId = null;
let currentPage = 0;
const PAGE_SIZE = 20;
let currentDocId = null;
let cameraStream = null;
let capturedImage = null;
let originalCapturedImage = null;
let captureRotation = 0;
let scanTargetDocId = null;
let cropping = false;
let cropDragMode = null;
let cropStart = { x: 0, y: 0 };
let cropRect = null;
let cropRectStart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth();
  if (!user) return;
  showUserInfo();
  await loadTypes();
  loadDocuments();

  document.getElementById('searchInput').addEventListener('input', debounce(loadDocuments, 400));
  document.getElementById('statusFilter').addEventListener('change', loadDocuments);
});

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadTypes() {
  docTypes = await API.get('/api/documents/types') || [];
  const tabs = document.getElementById('docTypeTabs');
  const select = document.getElementById('docType');
  const scanSelect = document.getElementById('scanDocType');
  const rangeSelect = document.getElementById('rangeTypeFilter');

  docTypes.forEach(t => {
    tabs.insertAdjacentHTML('beforeend', `
      <li class="nav-item">
        <a class="nav-link" href="#" data-type-id="${t.id}" onclick="selectType(${t.id}, this)">
          <i class="${t.icon} me-1"></i>${t.name}
        </a>
      </li>
    `);
    select.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.name}</option>`);
    if (scanSelect) scanSelect.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.name}</option>`);
    if (rangeSelect) rangeSelect.insertAdjacentHTML('beforeend', `<option value="${t.id}">${t.name}</option>`);
  });
}

function selectType(typeId, el) {
  currentTypeId = typeId;
  currentPage = 0;
  document.querySelectorAll('#docTypeTabs .nav-link').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
  loadDocuments();
}

async function loadDocuments() {
  const search = document.getElementById('searchInput').value;
  const status = document.getElementById('statusFilter').value;
  let url = `/api/documents?limit=${PAGE_SIZE}&offset=${currentPage * PAGE_SIZE}`;
  if (currentTypeId) url += `&type_id=${currentTypeId}`;
  if (status) url += `&status=${status}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  const tbody = document.getElementById('docsList');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><span class="spinner-border spinner-border-sm me-2"></span>Cargando...</td></tr>';

  const data = await API.get(url);
  if (!data) return;

  if (data.documents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-5"><i class="bi bi-inbox fs-1 d-block mb-2"></i>No se encontraron documentos</td></tr>';
  } else {
    tbody.innerHTML = data.documents.map((d, i) => `
      <tr>
        <td class="text-muted small">${currentPage * PAGE_SIZE + i + 1}</td>
        <td>
          <div class="fw-semibold">${d.title}</div>
          ${d.description ? `<small class="text-muted">${d.description.substring(0, 60)}${d.description.length > 60 ? '...' : ''}</small>` : ''}
        </td>
        <td class="d-none d-md-table-cell">
          <span class="badge bg-light text-dark border">
            <i class="${d.icon} me-1"></i>${d.type_name}
          </span>
        </td>
        <td>${statusBadge(d.status)}</td>
        <td class="d-none d-lg-table-cell"><small class="text-muted">${d.created_by_name}</small></td>
        <td class="d-none d-sm-table-cell"><small class="text-muted">${formatDate(d.created_at)}</small></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" onclick="viewDocument(${d.id})" title="Ver detalle"><i class="bi bi-eye"></i></button>
            <button class="btn btn-sm btn-outline-secondary" onclick="openEditModal(${d.id})" title="Editar"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete(${d.id})" title="Eliminar"><i class="bi bi-trash"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  document.getElementById('docCount').textContent = `${data.total} documento(s) en total`;
  renderPagination(data.total);
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el = document.getElementById('pagination');
  el.innerHTML = '';
  if (pages <= 1) return;

  for (let i = 0; i < pages; i++) {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline-secondary'}`;
    btn.textContent = i + 1;
    btn.onclick = () => { currentPage = i; loadDocuments(); };
    el.appendChild(btn);
  }
}

// New document modal
function openNewDocModal() {
  document.getElementById('docId').value = '';
  document.getElementById('docModalTitle').innerHTML = '<i class="bi bi-file-plus me-2"></i>Nuevo Documento';
  document.getElementById('docType').value = '';
  document.getElementById('docStatus').value = 'pendiente';
  document.getElementById('docTitle').value = '';
  document.getElementById('docDescription').value = '';
  document.getElementById('dynamicFields').innerHTML = '';
  if (currentTypeId) {
    document.getElementById('docType').value = currentTypeId;
    loadTypeFields();
  }
  new bootstrap.Modal(document.getElementById('docModal')).show();
}

async function openEditModal(id) {
  const doc = await API.get(`/api/documents/${id}`);
  if (!doc) return;

  document.getElementById('docId').value = doc.id;
  document.getElementById('docModalTitle').innerHTML = `<i class="bi bi-pencil me-2"></i>Editar Documento`;
  document.getElementById('docType').value = doc.type_id;
  document.getElementById('docStatus').value = doc.status;
  document.getElementById('docTitle').value = doc.title;
  document.getElementById('docDescription').value = doc.description || '';

  await loadTypeFields();

  // Fill in field values
  doc.fields_template.forEach(f => {
    const el = document.getElementById(`field_${f.name}`);
    if (el && doc.fields_data[f.name] !== undefined) el.value = doc.fields_data[f.name];
  });

  new bootstrap.Modal(document.getElementById('docModal')).show();
}

async function loadTypeFields() {
  const typeId = document.getElementById('docType').value;
  const container = document.getElementById('dynamicFields');
  if (!typeId) { container.innerHTML = ''; return; }

  const type = docTypes.find(t => t.id == typeId);
  if (!type || !type.fields_template.length) { container.innerHTML = ''; return; }

  container.innerHTML = `<hr><h6 class="fw-bold mb-3"><i class="${type.icon} me-2"></i>Datos del Documento</h6>`;
  const row = document.createElement('div');
  row.className = 'row g-3';

  type.fields_template.forEach(f => {
    const col = document.createElement('div');
    col.className = f.type === 'textarea' ? 'col-12' : 'col-md-6';

    let input = '';
    const req = f.required ? '<span class="text-danger">*</span>' : '';
    if (f.type === 'textarea') {
      input = `<textarea id="field_${f.name}" class="form-control" rows="3" placeholder="${f.label}" ${f.required ? 'required' : ''}></textarea>`;
    } else if (f.type === 'select' && f.options) {
      input = `<select id="field_${f.name}" class="form-select" ${f.required ? 'required' : ''}>
        <option value="">Seleccione...</option>
        ${f.options.map(o => `<option>${o}</option>`).join('')}
      </select>`;
    } else {
      input = `<input type="${f.type || 'text'}" id="field_${f.name}" class="form-control" placeholder="${f.label}" ${f.required ? 'required' : ''}>`;
    }

    col.innerHTML = `<div><label class="form-label fw-semibold">${f.label} ${req}</label>${input}</div>`;
    row.appendChild(col);
  });

  container.appendChild(row);
}

async function saveDocument() {
  const id = document.getElementById('docId').value;
  const type_id = document.getElementById('docType').value;
  const title = document.getElementById('docTitle').value.trim();
  const status = document.getElementById('docStatus').value;
  const description = document.getElementById('docDescription').value.trim();

  if (!type_id || !title) { showToast('Tipo y título son obligatorios', 'error'); return; }

  const type = docTypes.find(t => t.id == type_id);
  const fields_data = {};
  if (type) {
    for (const f of type.fields_template) {
      const el = document.getElementById(`field_${f.name}`);
      if (el) fields_data[f.name] = el.value;
    }
  }

  const payload = { type_id: parseInt(type_id), title, description, status, fields_data };
  let res;
  if (id) {
    res = await API.put(`/api/documents/${id}`, payload);
  } else {
    res = await API.post('/api/documents', payload);
  }

  if (res.id) {
    bootstrap.Modal.getInstance(document.getElementById('docModal')).hide();
    showToast(id ? 'Documento actualizado' : 'Documento creado exitosamente');
    loadDocuments();
  } else {
    showToast(res.error || 'Error al guardar', 'error');
  }
}

async function viewDocument(id) {
  currentDocId = id;
  scanTargetDocId = id;
  const doc = await API.get(`/api/documents/${id}`);
  if (!doc) return;

  document.getElementById('detailTitle').innerHTML = `<i class="${doc.icon} me-2"></i>${doc.title}`;
  document.getElementById('detailStatus').className = `badge ${doc.status === 'completado' ? 'bg-success' : doc.status === 'pendiente' ? 'bg-warning text-dark' : 'bg-info'}`;
  document.getElementById('detailStatus').textContent = doc.status.replace('_', ' ');

  // Fields
  const fieldsEl = document.getElementById('detailFields');
  let html = `
    <div class="mb-3">
      <small class="text-muted fw-semibold">TIPO</small>
      <div><i class="${doc.icon} me-1"></i>${doc.type_name}</div>
    </div>
    <div class="mb-3">
      <small class="text-muted fw-semibold">CREADO POR</small>
      <div>${doc.created_by_name} — ${formatDateTime(doc.created_at)}</div>
    </div>
  `;
  if (doc.description) {
    html += `<div class="mb-3"><small class="text-muted fw-semibold">DESCRIPCIÓN</small><div>${doc.description}</div></div>`;
  }

  doc.fields_template.forEach(f => {
    const val = doc.fields_data[f.name];
    if (val) {
      html += `<div class="mb-2"><small class="text-muted fw-semibold">${f.label.toUpperCase()}</small><div>${val}</div></div>`;
    }
  });

  fieldsEl.innerHTML = html;
  renderFilesList(doc.files);
  new bootstrap.Modal(document.getElementById('detailModal')).show();
}

function renderFilesList(files) {
  const el = document.getElementById('filesList');
  if (!files.length) {
    el.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-paperclip d-block mb-1 fs-4"></i>Sin archivos adjuntos</div>';
    return;
  }
  el.innerHTML = files.map(f => `
    <div class="file-item">
      <i class="${fileIcon(f.file_type)} file-icon fs-4"></i>
      <div class="file-name">
        <a href="#" onclick="openFile(${f.id}); return false;">${f.original_name}</a>
        ${f.is_scanned ? '<span class="badge badge-en_proceso file-badge ms-1">Escaneado</span>' : ''}
      </div>
      <small class="text-muted">${fileSizeLabel(f.file_size)}</small>
      <button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteFile(${f.id})"><i class="bi bi-trash"></i></button>
    </div>
  `).join('');
}

async function openFile(fileId) {
  const res = await fetch(`/api/documents/${currentDocId}/files/${fileId}/download`, {
    headers: { 'Authorization': `Bearer ${API.token()}` }
  });
  if (!res.ok) { showToast('No se pudo abrir el archivo', 'error'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

async function uploadFiles() {
  const input = document.getElementById('fileUploadInput');
  if (!input.files.length || !currentDocId) return;

  const formData = new FormData();
  for (const f of input.files) formData.append('files', f);

  const res = await API.upload(`/api/documents/${currentDocId}/files`, formData);
  if (res.files) {
    showToast(`${res.files.length} archivo(s) subido(s)`);
    const doc = await API.get(`/api/documents/${currentDocId}`);
    if (doc) renderFilesList(doc.files);
  } else {
    showToast(res.error || 'Error al subir archivos', 'error');
  }
  input.value = '';
}

async function deleteFile(fileId) {
  if (!confirm('¿Eliminar este archivo?')) return;
  const res = await API.delete(`/api/documents/${currentDocId}/files/${fileId}`);
  if (res.message) {
    showToast('Archivo eliminado');
    const doc = await API.get(`/api/documents/${currentDocId}`);
    if (doc) renderFilesList(doc.files);
  }
}

function editCurrentDoc() {
  bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
  setTimeout(() => openEditModal(currentDocId), 300);
}

function confirmDelete(id) {
  const btn = document.getElementById('confirmDeleteBtn');
  btn.onclick = async () => {
    const res = await API.delete(`/api/documents/${id}`);
    if (res.message) {
      bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide();
      showToast('Documento eliminado', 'warning');
      loadDocuments();
    }
  };
  new bootstrap.Modal(document.getElementById('deleteModal')).show();
}

// ===== SCANNER =====
function openScanModal(docId = null) {
  scanTargetDocId = docId;
  capturedImage = null;
  originalCapturedImage = null;
  cancelCropMode();
  document.getElementById('adjustPanel').classList.add('d-none');
  document.getElementById('capturedPreview').classList.add('d-none');
  document.getElementById('cameraPreview').classList.add('d-none');
  document.getElementById('cameraPlaceholder').classList.remove('d-none');
  document.getElementById('captureBtn').classList.add('d-none');
  document.getElementById('retakeBtn').classList.add('d-none');
  document.getElementById('stopCameraBtn').classList.add('d-none');
  document.getElementById('startCameraBtn').classList.remove('d-none');
  document.getElementById('scanFileInput').value = '';
  document.getElementById('selectedFilePreview').innerHTML = '';
  document.getElementById('scanDocTitle').value = '';
  document.getElementById('scanToPdf').checked = true;
  if (docId) {
    document.getElementById('scanDocTarget').value = docId;
    document.getElementById('scanNewDocFields').classList.add('d-none');
  }
  new bootstrap.Modal(document.getElementById('scanModal')).show();
}

function openScanToDoc() {
  bootstrap.Modal.getInstance(document.getElementById('detailModal')).hide();
  setTimeout(() => openScanModal(currentDocId), 300);
}

document.getElementById('scanDocTarget') && document.getElementById('scanDocTarget').addEventListener('change', function () {
  const newFields = document.getElementById('scanNewDocFields');
  newFields.classList.toggle('d-none', this.value !== 'new');
});

function switchScanTab(tab, el) {
  document.querySelectorAll('#scanTabs .nav-link').forEach(a => a.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cameraTab').classList.toggle('d-none', tab !== 'camera');
  document.getElementById('uploadTab').classList.toggle('d-none', tab !== 'upload');
  if (tab !== 'camera') stopCamera();
}

async function startCamera() {
  const highResConstraints = {
    video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1440 } },
    audio: false
  };
  try {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia(highResConstraints);
    } catch (e) {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    }
    const video = document.getElementById('cameraPreview');
    video.srcObject = cameraStream;
    video.classList.remove('d-none');
    document.getElementById('cameraPlaceholder').classList.add('d-none');
    document.getElementById('captureBtn').classList.remove('d-none');
    document.getElementById('stopCameraBtn').classList.remove('d-none');
    document.getElementById('startCameraBtn').classList.add('d-none');
  } catch (e) {
    showToast('No se pudo acceder a la cámara. Verifique los permisos.', 'error');
  }
}

function capturePhoto() {
  const video = document.getElementById('cameraPreview');
  const canvas = document.getElementById('captureCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  originalCapturedImage = canvas.toDataURL('image/jpeg', 0.93);
  captureRotation = 0;

  const preview = document.getElementById('capturedPreview');
  preview.classList.remove('d-none');
  video.classList.add('d-none');
  document.getElementById('captureBtn').classList.add('d-none');
  document.getElementById('retakeBtn').classList.remove('d-none');
  document.getElementById('adjustPanel').classList.remove('d-none');
  resetAdjustments();
}

function retakePhoto() {
  capturedImage = null;
  originalCapturedImage = null;
  cancelCropMode();
  document.getElementById('capturedPreview').classList.add('d-none');
  document.getElementById('cameraPreview').classList.remove('d-none');
  document.getElementById('captureBtn').classList.remove('d-none');
  document.getElementById('retakeBtn').classList.add('d-none');
  document.getElementById('adjustPanel').classList.add('d-none');
}

function rotateCapture(deg) {
  captureRotation = (captureRotation + deg + 360) % 360;
  applyImageAdjustments();
}

function resetAdjustments() {
  document.getElementById('adjBrightness').value = 100;
  document.getElementById('adjContrast').value = 100;
  captureRotation = 0;
  applyImageAdjustments();
}

function applyImageAdjustments() {
  if (!originalCapturedImage) return;
  const brightness = document.getElementById('adjBrightness').value;
  const contrast = document.getElementById('adjContrast').value;
  document.getElementById('brightnessVal').textContent = `${brightness}%`;
  document.getElementById('contrastVal').textContent = `${contrast}%`;

  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById('captureCanvas');
    const rotated90 = captureRotation === 90 || captureRotation === 270;
    canvas.width = rotated90 ? img.height : img.width;
    canvas.height = rotated90 ? img.width : img.height;

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((captureRotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    capturedImage = canvas.toDataURL('image/jpeg', 0.93);
    document.getElementById('capturedPreview').src = capturedImage;
  };
  img.src = originalCapturedImage;
}

// ===== CROP =====
function toggleCropMode() {
  if (cropping) { cancelCropMode(); return; }
  if (!capturedImage) return;
  cropping = true;
  document.getElementById('cropToggleBtn').classList.replace('btn-outline-primary', 'btn-primary');
  document.getElementById('cropActions').classList.remove('d-none');

  const rect = document.getElementById('previewWrap').getBoundingClientRect();
  cropRect = { x: rect.width * 0.1, y: rect.height * 0.1, w: rect.width * 0.8, h: rect.height * 0.8 };
  renderCropBox();

  const wrap = document.getElementById('previewWrap');
  wrap.addEventListener('pointerdown', onCropPointerDown);
  window.addEventListener('pointermove', onCropPointerMove);
  window.addEventListener('pointerup', onCropPointerUp);
}

function cancelCropMode() {
  cropping = false;
  cropDragMode = null;
  cropRect = null;
  const toggleBtn = document.getElementById('cropToggleBtn');
  if (toggleBtn) toggleBtn.classList.replace('btn-primary', 'btn-outline-primary');
  const cropActions = document.getElementById('cropActions');
  if (cropActions) cropActions.classList.add('d-none');
  const cropBox = document.getElementById('cropBox');
  if (cropBox) cropBox.classList.add('d-none');
  const wrap = document.getElementById('previewWrap');
  if (wrap) wrap.removeEventListener('pointerdown', onCropPointerDown);
  window.removeEventListener('pointermove', onCropPointerMove);
  window.removeEventListener('pointerup', onCropPointerUp);
}

function renderCropBox() {
  const box = document.getElementById('cropBox');
  if (!cropRect) { box.classList.add('d-none'); return; }
  box.classList.remove('d-none');
  box.style.left = `${cropRect.x}px`;
  box.style.top = `${cropRect.y}px`;
  box.style.width = `${cropRect.w}px`;
  box.style.height = `${cropRect.h}px`;
}

function onCropPointerDown(e) {
  if (!cropping) return;
  const wrap = document.getElementById('previewWrap');
  const rect = wrap.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const handle = e.target.closest && e.target.closest('.crop-handle');
  const insideBox = cropRect && px >= cropRect.x && px <= cropRect.x + cropRect.w && py >= cropRect.y && py <= cropRect.y + cropRect.h;

  cropStart = { x: px, y: py };

  if (handle) {
    cropDragMode = `resize-${handle.dataset.handle}`;
    cropRectStart = { ...cropRect };
  } else if (insideBox) {
    cropDragMode = 'move';
    cropRectStart = { ...cropRect };
  } else {
    cropDragMode = 'draw';
    const x = Math.min(Math.max(px, 0), rect.width);
    const y = Math.min(Math.max(py, 0), rect.height);
    cropRect = { x, y, w: 0, h: 0 };
  }
  e.preventDefault();
}

function onCropPointerMove(e) {
  if (!cropping || !cropDragMode) return;
  const rect = document.getElementById('previewWrap').getBoundingClientRect();
  const px = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
  const py = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
  const dx = px - cropStart.x;
  const dy = py - cropStart.y;
  const minSize = 20;

  if (cropDragMode === 'draw') {
    cropRect = { x: Math.min(cropStart.x, px), y: Math.min(cropStart.y, py), w: Math.abs(px - cropStart.x), h: Math.abs(py - cropStart.y) };
  } else if (cropDragMode === 'move') {
    let x = cropRectStart.x + dx;
    let y = cropRectStart.y + dy;
    x = Math.min(Math.max(x, 0), rect.width - cropRectStart.w);
    y = Math.min(Math.max(y, 0), rect.height - cropRectStart.h);
    cropRect = { ...cropRectStart, x, y };
  } else if (cropDragMode.startsWith('resize-')) {
    const handle = cropDragMode.replace('resize-', '');
    let { x, y, w, h } = cropRectStart;

    if (handle.includes('w')) {
      const newX = Math.max(0, Math.min(x + dx, x + w - minSize));
      w = (x + w) - newX;
      x = newX;
    }
    if (handle.includes('e')) {
      w = Math.min(Math.max(minSize, w + dx), rect.width - x);
    }
    if (handle.includes('n')) {
      const newY = Math.max(0, Math.min(y + dy, y + h - minSize));
      h = (y + h) - newY;
      y = newY;
    }
    if (handle.includes('s')) {
      h = Math.min(Math.max(minSize, h + dy), rect.height - y);
    }
    cropRect = { x, y, w, h };
  }
  renderCropBox();
}

function onCropPointerUp() {
  cropDragMode = null;
}

function applyCrop() {
  if (!cropRect || cropRect.w < 10 || cropRect.h < 10) { showToast('Marque un área más grande para recortar', 'error'); return; }

  const img = document.getElementById('capturedPreview');
  const scaleX = img.naturalWidth / img.clientWidth;
  const scaleY = img.naturalHeight / img.clientHeight;
  const sx = cropRect.x * scaleX;
  const sy = cropRect.y * scaleY;
  const sw = cropRect.w * scaleX;
  const sh = cropRect.h * scaleY;

  const canvas = document.getElementById('captureCanvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  originalCapturedImage = canvas.toDataURL('image/jpeg', 0.93);
  captureRotation = 0;
  cancelCropMode();
  resetAdjustments();
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('cameraPreview').classList.add('d-none');
  document.getElementById('cameraPlaceholder').classList.remove('d-none');
  document.getElementById('captureBtn').classList.add('d-none');
  document.getElementById('stopCameraBtn').classList.add('d-none');
  document.getElementById('startCameraBtn').classList.remove('d-none');
}

document.getElementById('scanFileInput') && document.getElementById('scanFileInput').addEventListener('change', function () {
  const preview = document.getElementById('selectedFilePreview');
  preview.innerHTML = Array.from(this.files).map(f =>
    `<div class="file-item"><i class="${fileIcon(f.type)} file-icon fs-4"></i><span class="file-name">${f.name}</span><small>${fileSizeLabel(f.size)}</small></div>`
  ).join('');
});

async function saveScan() {
  const typeId = document.getElementById('scanDocType').value;
  const targetVal = document.getElementById('scanDocTarget').value;
  const isNewDoc = targetVal === 'new' || !targetVal;

  let docId = isNewDoc ? null : parseInt(targetVal);

  if (!typeId && isNewDoc) { showToast('Seleccione el tipo de documento', 'error'); return; }

  // Create new doc if needed
  if (isNewDoc) {
    const title = document.getElementById('scanDocTitle').value.trim() || `Documento escaneado ${new Date().toLocaleDateString('es-ES')}`;
    const res = await API.post('/api/documents', { type_id: parseInt(typeId), title, status: 'pendiente' });
    if (!res.id) { showToast(res.error || 'Error al crear documento', 'error'); return; }
    docId = res.id;
  }

  // Determine if camera or file upload
  const isCameraTab = !document.getElementById('cameraTab').classList.contains('d-none');
  const toPdf = document.getElementById('scanToPdf').checked;

  if (isCameraTab) {
    if (!capturedImage) { showToast('Capture una imagen primero', 'error'); return; }
    const res = await API.post(`/api/documents/${docId}/scan`, { image_data: capturedImage, file_name: `scan-${Date.now()}.jpg`, to_pdf: toPdf });
    if (res.file_path) {
      stopCamera();
      bootstrap.Modal.getInstance(document.getElementById('scanModal')).hide();
      showToast(toPdf ? 'PDF generado exitosamente' : 'Imagen guardada exitosamente');
      loadDocuments();
    } else {
      showToast(res.error || 'Error al guardar imagen', 'error');
    }
  } else {
    const fileInput = document.getElementById('scanFileInput');
    if (!fileInput.files.length) { showToast('Seleccione al menos un archivo', 'error'); return; }
    const formData = new FormData();
    for (const f of fileInput.files) formData.append('files', f);
    formData.append('is_scanned', 'true');
    formData.append('to_pdf', toPdf ? 'true' : 'false');
    const res = await API.upload(`/api/documents/${docId}/files`, formData);
    if (res.files) {
      bootstrap.Modal.getInstance(document.getElementById('scanModal')).hide();
      showToast(`${res.files.length} archivo(s) guardado(s) exitosamente`);
      loadDocuments();
    } else {
      showToast(res.error || 'Error al subir archivos', 'error');
    }
  }
}
