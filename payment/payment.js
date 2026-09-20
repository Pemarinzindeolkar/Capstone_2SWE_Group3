/* =============================================
   LABZO PAYMENT SYSTEM — JavaScript
   Handles: copy-to-clipboard, drag-and-drop upload,
   file preview, form submission, expiry timer
   ============================================= */

/* ---- COPY TO CLIPBOARD ---- */
function copyText(elementId, btn) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const text = el.textContent.trim();
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    // Fallback for older browsers
    const range = document.createRange();
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

/* ---- FILE UPLOAD ---- */
const dropzone   = document.getElementById('dropzone');
const fileInput  = document.getElementById('file-input');
const preview    = document.getElementById('slip-preview');
const slipName   = document.getElementById('slip-name');
const slipMeta   = document.getElementById('slip-meta');
const slipThumb  = document.getElementById('slip-thumb');
const submitBtn  = document.getElementById('submit-btn');

let selectedFile = null;

function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function showPreview(file) {
  if (!file) return;
  selectedFile = file;

  slipName.textContent = file.name;
  slipMeta.textContent = file.type.split('/')[1]?.toUpperCase() + ' · ' + formatBytes(file.size);

  // Show image thumbnail if it's an image
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      slipThumb.innerHTML = `<img src="${e.target.result}" alt="slip preview" />`;
    };
    reader.readAsDataURL(file);
  } else {
    // PDF icon placeholder
    slipThumb.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:18px;color:#9C9690;background:#F4F2EE;border-radius:6px;">📄</div>`;
  }

  if (preview)   preview.style.display = 'flex';
  if (dropzone)  dropzone.style.display = 'none';
  if (submitBtn) submitBtn.disabled = false;
}

function removeFile() {
  selectedFile = null;
  if (fileInput)  fileInput.value = '';
  if (preview)    preview.style.display = 'none';
  if (dropzone)   dropzone.style.display = 'block';
  if (slipThumb)  slipThumb.innerHTML = '';
  if (submitBtn)  submitBtn.disabled = true;
}

// File input change
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) showPreview(e.target.files[0]);
  });
}

// Drag and drop
if (dropzone) {
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-over');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) validateAndShow(file);
  });
  // Click anywhere on dropzone to trigger file picker
  dropzone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'LABEL') fileInput && fileInput.click();
  });
}

function validateAndShow(file) {
  const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
  const maxSize = 5 * 1024 * 1024; // 5 MB

  if (!allowed.includes(file.type)) {
    showToast('Only JPG, PNG, or PDF files are accepted.', 'error');
    return;
  }
  if (file.size > maxSize) {
    showToast('File is too large. Maximum size is 5 MB.', 'error');
    return;
  }
  showPreview(file);
}

/* ---- SUBMIT PAYMENT ---- */
function submitPayment() {
  if (!selectedFile) {
    showToast('Please upload your payment slip before submitting.', 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Submitting…';
  btn.disabled = true;

  // Simulate API call — replace with your actual fetch() call
  setTimeout(() => {
    // In production:
    // const formData = new FormData();
    // formData.append('slip', selectedFile);
    // formData.append('orderId', 'LBZ-20240892');
    // fetch('/api/orders/LBZ-20240892/submit-payment', { method: 'POST', body: formData })
    //   .then(r => r.json())
    //   .then(d => { if (d.success) window.location.href = 'pending.html'; })

    window.location.href = 'pending.html';
  }, 1200);
}

/* ---- TOAST NOTIFICATION ---- */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.getElementById('labzo-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'labzo-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '28px',
    left:         '50%',
    transform:    'translateX(-50%)',
    background:   type === 'error' ? '#C0392B' : '#2D5A3D',
    color:        '#fff',
    fontSize:     '14px',
    fontWeight:   '500',
    fontFamily:   'DM Sans, sans-serif',
    padding:      '12px 24px',
    borderRadius: '10px',
    boxShadow:    '0 4px 20px rgba(0,0,0,.18)',
    zIndex:       '9999',
    opacity:      '0',
    transition:   'opacity .2s',
    pointerEvents:'none',
    maxWidth:     '380px',
    textAlign:    'center',
    lineHeight:   '1.5',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ---- ORDER EXPIRY COUNTDOWN (pending page) ---- */
function initCountdown() {
  const countdownEl = document.getElementById('expiry-countdown');
  if (!countdownEl) return;

  // 24 hours from now
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  function update() {
    const now  = Date.now();
    const diff = expiry - now;
    if (diff <= 0) {
      countdownEl.textContent = 'Expired';
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    countdownEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    setTimeout(update, 1000);
  }
  update();
}

/* ---- INIT ---- */
document.addEventListener('DOMContentLoaded', () => {
  // Disable submit button by default until file is uploaded
  if (submitBtn) submitBtn.disabled = true;
  initCountdown();
});
