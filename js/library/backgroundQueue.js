/**
 * Lirune Reader — Background Import Queue Controller
 * Extracted from Library to keep batch queue UI and state modular.
 */

const LibraryBackgroundQueue = (() => {
  let queue = [];
  let autoHideTimer = null;

  function renderQueueModal() {
    const listEl = document.getElementById('import-queue-list');
    if (!listEl) return;
    if (queue.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-tertiary);">No files in import queue.</div>';
      return;
    }
    listEl.innerHTML = queue.map(item => {
      let badgeHtml = '';
      if (item.status === 'pending') {
        badgeHtml = '<span class="import-queue-badge pending">Pending</span>';
      } else if (item.status === 'importing') {
        badgeHtml = '<span class="import-queue-badge importing"><span class="import-queue-spinner" style="width:10px;height:10px;"></span> Importing</span>';
      } else if (item.status === 'completed') {
        badgeHtml = '<span class="import-queue-badge completed">✓ Completed</span>';
      } else {
        badgeHtml = `<span class="import-queue-badge error" title="${Utils.escapeAttr(item.error || 'Failed')}">✗ Error</span>`;
      }
      return `
        <div class="import-queue-item">
          <div class="import-queue-item-info">
            <span class="import-queue-item-name" title="${Utils.escapeAttr(item.name)}">${Utils.escapeHTML(item.name)}</span>
            <span class="import-queue-item-meta">${item.size ? Utils.formatBytes(item.size) : ''}${item.error ? ` • ${Utils.escapeHTML(item.error)}` : ''}</span>
          </div>
          ${badgeHtml}
        </div>
      `;
    }).join('');
  }

  function updatePill() {
    const pill = document.getElementById('import-queue-pill');
    const textEl = document.getElementById('import-queue-text');
    if (!pill || !textEl) return;
    const activeOrPending = queue.filter(i => i.status === 'pending' || i.status === 'importing');
    const completed = queue.filter(i => i.status === 'completed').length;
    const total = queue.length;

    if (activeOrPending.length > 0) {
      clearTimeout(autoHideTimer);
      pill.classList.remove('hidden');
      textEl.textContent = `Importing ${completed + 1}/${total}`;
    } else if (total > 0) {
      textEl.textContent = `Imported ${completed}/${total}`;
      clearTimeout(autoHideTimer);
      autoHideTimer = setTimeout(() => {
        pill.classList.add('hidden');
        queue = [];
      }, 5000);
    } else {
      pill.classList.add('hidden');
    }
    renderQueueModal();
  }

  function enqueue(files) {
    clearTimeout(autoHideTimer);
    const newItems = Array.from(files).map((f, i) => ({
      id: `q_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      name: f.name || 'Book',
      size: f.size || 0,
      status: 'pending'
    }));
    queue.push(...newItems);
    updatePill();
    return newItems;
  }

  function setStatus(id, status, error) {
    const item = queue.find(i => i.id === id);
    if (item) {
      item.status = status;
      if (error) item.error = error;
    }
    updatePill();
  }

  function openModal() {
    const modal = document.getElementById('import-queue-modal');
    if (!modal) return;
    renderQueueModal();
    modal.classList.remove('hidden');
  }

  function closeModal() {
    const modal = document.getElementById('import-queue-modal');
    if (!modal) return;
    modal.classList.add('hidden');
  }

  function clear() {
    queue = queue.filter(i => i.status === 'pending' || i.status === 'importing');
    updatePill();
    closeModal();
  }

  function init() {
    const pill = document.getElementById('import-queue-pill');
    pill?.addEventListener('click', openModal);
    document.getElementById('close-import-queue-btn')?.addEventListener('click', closeModal);
    document.getElementById('dismiss-import-queue-btn')?.addEventListener('click', clear);
    document.getElementById('import-queue-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'import-queue-modal') closeModal();
    });
  }

  return { enqueue, setStatus, updatePill, openModal, closeModal, init };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LibraryBackgroundQueue;
}
