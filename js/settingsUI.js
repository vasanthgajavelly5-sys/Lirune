/**
 * Lirune Reader — Contextual Settings
 *
 * One presentation layer over the existing settings stores. It never keeps
 * settings of its own: every control reads from and writes to the module that
 * owns that setting.
 *
 *   Library appearance  -> Library
 *   Typography, layout  -> ReaderSettings
 *   App theme, accent,
 *   reader theme        -> ThemeManager
 *   Motion              -> AppPrefs
 *   Persistence         -> NoveraDB (through the owners above)
 *
 * Two views share the existing settings panel:
 *
 *   Quick settings  a compact presentation of what matters for the view the
 *                   user is in right now.
 *   Full settings   every real setting, arranged into sections.
 *
 * The panel itself, its width, placement and animation are unchanged; the
 * expanded view only widens the panel while it is open.
 */

const SettingsUI = (() => {
  const SECTIONS = [
    { id: 'general', label: 'General' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'reading', label: 'Reading' },
    { id: 'library', label: 'Library' },
    { id: 'accessibility', label: 'Accessibility' },
    { id: 'shortcuts', label: 'Shortcuts' },
    { id: 'storage', label: 'Storage & Data' },
    { id: 'about', label: 'About' }
  ];

  const FONT_OPTIONS = [
    { value: 'Cormorant Garamond', label: 'Cormorant', note: 'Refined book serif' },
    { value: 'Lora', label: 'Lora', note: 'Editorial serif' },
    { value: 'Playfair Display', label: 'Playfair', note: 'Classic display' },
    { value: 'Inter', label: 'Inter', note: 'Modern sans' },
    { value: 'Georgia', label: 'Georgia', note: 'Literary serif' },
    { value: 'JetBrains Mono', label: 'Mono', note: 'Technical code' },
    { value: 'Original', label: 'Publisher', note: 'Original EPUB' }
  ];

  const SORT_OPTIONS = [
    { value: 'recent', label: 'Recently read' },
    { value: 'added', label: 'Recently added' },
    { value: 'title', label: 'Title' },
    { value: 'author', label: 'Author' },
    { value: 'progress', label: 'Reading progress' }
  ];

  const READER_THEME_LABELS = {
    neutral: 'Neutral',
    sepia: 'Sepia',
    night: 'Night',
    paper: 'Paper',
    contrast1: 'Contrast 1',
    contrast2: 'Contrast 2',
    contrast3: 'Contrast 3',
    contrast4: 'Contrast 4',
    custom: 'Custom'
  };

  let activeSection = 'general';
  let expanded = false;
  let currentContext = 'library';

  /**
   * Every switch in the panel, keyed by the id its control is rendered with.
   * Each entry flips one stored setting; nothing here owns state, it only
   * decides which owner to ask.
   */
  const SWITCH_ACTIONS = {
    'qs-metadata': () => Library.setView({ showMetadata: !Library.getViewState().showMetadata }),
    'fs-metadata': () => Library.setView({ showMetadata: !Library.getViewState().showMetadata }),
    'fs-reduce-motion': () => AppPrefs.set({ reduceMotion: !AppPrefs.getAll().reduceMotion })
  };

  // ---------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------

  function init() {
    buildSectionNav();
    buildStaticControls();
    bindEvents();
  }

  /**
   * Called whenever the settings panel is about to be shown. The context comes
   * from the application rather than from anything in the document, so the
   * panel always matches the view the user is actually looking at.
   */
  function refresh() {
    const context = typeof App !== 'undefined' ? App.getSettingsContext() : 'library';
    currentContext = context;
    renderQuick();
    syncFullControls();
    if (expanded) showSection(activeSection);
  }

  function getContext() {
    return currentContext;
  }

  function isExpanded() {
    return expanded;
  }

  // ---------------------------------------------------------------
  // Quick settings
  // ---------------------------------------------------------------

  function renderQuick() {
    const host = document.getElementById('quick-settings');
    if (!host) return;
    host.innerHTML = currentContext === 'reader' ? readerQuickMarkup() : libraryQuickMarkup();
    host.dataset.context = currentContext;
  }

  function libraryQuickMarkup() {
    const view = Library.getViewState();
    return `
      <div class="quick-settings-heading">
        <span class="quick-settings-context">Library</span>
        <span class="quick-settings-hint">Settings for your shelf</span>
      </div>
      ${segmentRow('qs-view', 'View', [
        { value: 'grid', label: 'Grid' },
        { value: 'list', label: 'List' }
      ], view.view)}
      ${selectRow('qs-sort', 'Sort by', SORT_OPTIONS.map(o => ({ value: o.value, label: o.label })), view.sortBy)}
      ${segmentRow('qs-order', 'Order', [
        { value: 'desc', label: 'Descending' },
        { value: 'asc', label: 'Ascending' }
      ], view.sortOrder)}
      ${segmentRow('qs-density', 'Density', [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' }
      ], view.density)}
      ${switchRow('qs-metadata', 'Show book metadata', 'Author and file format on every cover', view.showMetadata)}
      ${expandButton()}
    `;
  }

  function readerQuickMarkup() {
    const reader = ReaderSettings.getSettings();
    const theme = ThemeManager.getReaderTheme();
    return `
      <div class="quick-settings-heading">
        <span class="quick-settings-context">Reader</span>
        <span class="quick-settings-hint">Settings for the book you are reading</span>
      </div>
      ${selectRow('qs-theme', 'Theme', Object.entries(READER_THEME_LABELS).map(([value, label]) => ({ value, label })), theme)}
      ${selectRow('qs-font', 'Font', FONT_OPTIONS.map(f => ({ value: f.value, label: f.label })), reader.fontFamily)}
      ${sliderRow('qs-font-size', 'Size', reader.fontSize, 12, 36, 1, `${reader.fontSize}px`, 'px')}
      ${sliderRow('qs-line-height', 'Line height', reader.lineHeight, 1.2, 2.4, 0.1, reader.lineHeight.toFixed(1), '')}
      ${sliderRow('qs-margin', 'Margins', reader.margin, 2, 24, 2, `${reader.margin}%`, '%')}
      ${segmentRow('qs-alignment', 'Alignment', [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
        { value: 'justify', label: 'Justify' }
      ], reader.alignment, 'wrap')}
      ${segmentRow('qs-flow', 'Flow', [
        { value: 'paginated', label: 'Pages' },
        { value: 'scrolled', label: 'Scroll' }
      ], reader.flow)}
      ${segmentRow('qs-spread', 'Columns', [
        { value: 'auto', label: 'Auto' },
        { value: 'none', label: 'Single' }
      ], reader.spread)}
      <div class="quick-settings-zoom">
        <span class="quick-row-label">Zoom</span>
        <span class="quick-zoom-value" id="qs-zoom-value">${Reader.getZoom()}%</span>
      </div>
      <p class="quick-settings-note">Zoom applies to this book only and is never saved.</p>
      <button class="btn btn-ghost quick-reset-btn" id="qs-reset-reader" type="button">Reset reading preferences</button>
      ${expandButton()}
    `;
  }

  // ---------------------------------------------------------------
  // Row builders — shared by the quick view and the full sections
  // ---------------------------------------------------------------

  function segmentRow(id, label, options, value, modifier = '') {
    return `
      <div class="quick-row">
        <span class="quick-row-label" id="${id}-label">${Utils.escapeHTML(label)}</span>
        <div class="segmented ${modifier ? `segmented-${modifier}` : ''}" role="group" aria-labelledby="${id}-label" data-quick-segment="${id}">
          ${options.map(option => `
            <button type="button" class="segment-opt${option.value === value ? ' active' : ''}"
              data-value="${Utils.escapeHTML(option.value)}"
              aria-pressed="${option.value === value ? 'true' : 'false'}">${Utils.escapeHTML(option.label)}</button>
          `).join('')}
        </div>
      </div>`;
  }

  function selectRow(id, label, options, value) {
    return `
      <div class="quick-row">
        <label class="quick-row-label" for="${id}-select">${Utils.escapeHTML(label)}</label>
        <select class="glass-select quick-select" id="${id}-select" data-quick-select="${id}">
          ${options.map(option => `
            <option value="${Utils.escapeHTML(option.value)}"${option.value === value ? ' selected' : ''}>${Utils.escapeHTML(option.label)}</option>
          `).join('')}
        </select>
      </div>`;
  }

  function switchRow(id, label, note, checked) {
    return `
      <div class="quick-row quick-row-switch">
        <div>
          <span class="quick-row-label">${Utils.escapeHTML(label)}</span>
          <span class="quick-row-note">${Utils.escapeHTML(note)}</span>
        </div>
        <button type="button" role="switch" class="setting-switch" id="${id}"
          aria-checked="${checked ? 'true' : 'false'}" aria-label="${Utils.escapeHTML(label)}"><span class="setting-switch-thumb"></span></button>
      </div>`;
  }

  function sliderRow(id, label, value, min, max, step, display, unit) {
    return `
      <div class="quick-row quick-row-slider">
        <div class="quick-slider-head">
          <label class="quick-row-label" for="${id}-range">${Utils.escapeHTML(label)}</label>
          <span class="quick-slider-value" id="${id}-value">${display}</span>
        </div>
        <input type="range" class="glass-slider" id="${id}-range"
          data-quick-slider="${id}" data-unit="${unit}"
          min="${min}" max="${max}" step="${step}" value="${value}"
          aria-label="${Utils.escapeHTML(label)}">
      </div>`;
  }

  function expandButton() {
    return `
      <button class="btn btn-glow quick-expand-btn" id="expand-settings-btn" type="button">
        Expand Settings
      </button>`;
  }

  // ---------------------------------------------------------------
  // Full settings
  // ---------------------------------------------------------------

  function buildSectionNav() {
    const nav = document.getElementById('full-settings-nav');
    if (!nav) return;
    nav.innerHTML = SECTIONS.map(section => `
      <button type="button" class="full-settings-nav-item" data-section-target="${section.id}">
        ${Utils.escapeHTML(section.label)}
      </button>
    `).join('');
  }

  function showSection(id) {
    const found = SECTIONS.some(section => section.id === id) ? id : SECTIONS[0].id;
    activeSection = found;

    document.querySelectorAll('#full-settings-panes > .full-settings-pane').forEach(pane => {
      pane.hidden = pane.dataset.section !== found;
    });
    document.querySelectorAll('#full-settings-nav .full-settings-nav-item').forEach(item => {
      const isActive = item.dataset.sectionTarget === found;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    document.getElementById('settings-panel-title').textContent = 'Settings';
    if (found === 'storage') {
      resetStorageState();
      renderStorageStats();
    }
    if (found === 'about') renderAbout();
  }

  function buildStaticControls() {
    buildAppThemeControls();
    buildLibraryControls();
    buildAccessibilityControls();
    renderShortcuts();
  }

  function buildAppThemeControls() {
    const grid = document.getElementById('app-theme-grid');
    if (!grid) return;
    grid.innerHTML = ThemeManager.APP_THEMES.map(theme => `
      <button type="button" class="layout-opt" data-app-theme="${theme}" aria-pressed="false">
        <span class="app-theme-swatch" data-swatch="${theme}" aria-hidden="true"></span>
        <span>${Utils.escapeHTML(theme === 'dark' ? 'Dark' : 'Light')}</span>
      </button>
    `).join('');
  }

  function buildLibraryControls() {
    const host = document.getElementById('library-view-controls');
    if (!host) return;
    host.innerHTML = `
      ${segmentRow('fs-view', 'Default view', [
        { value: 'grid', label: 'Grid' },
        { value: 'list', label: 'List' }
      ], Library.getViewState().view)}
      ${selectRow('fs-sort', 'Sort by', SORT_OPTIONS, Library.getViewState().sortBy)}
      ${segmentRow('fs-order', 'Sort order', [
        { value: 'desc', label: 'Descending' },
        { value: 'asc', label: 'Ascending' }
      ], Library.getViewState().sortOrder)}
      ${segmentRow('fs-density', 'Display density', [
        { value: 'comfortable', label: 'Comfortable' },
        { value: 'compact', label: 'Compact' }
      ], Library.getViewState().density)}
      ${switchRow('fs-metadata', 'Show book metadata', 'Author and file format on every cover', Library.getViewState().showMetadata)}
    `;
  }

  function buildAccessibilityControls() {
    const host = document.getElementById('accessibility-controls');
    if (!host) return;
    host.innerHTML = switchRow(
      'fs-reduce-motion',
      'Reduce motion',
      'Turns off interface animations and transitions',
      AppPrefs.getAll().reduceMotion
    );
  }

  function renderShortcuts() {
    const host = document.getElementById('shortcuts-list');
    if (!host) return;
    const context = typeof App !== 'undefined' ? App.getSettingsContext() : 'library';
    const shortcuts = App.getShortcuts().filter(s => s.contexts.includes(context));

    host.innerHTML = shortcuts.length
      ? shortcuts.map(shortcut => `
          <div class="shortcut-row">
            <span class="shortcut-desc">${Utils.escapeHTML(shortcut.description)}</span>
            <span class="shortcut-keys">${shortcut.keys.map(key => `<kbd class="kbd">${Utils.escapeHTML(key)}</kbd>`).join('')}</span>
          </div>
        `).join('')
      : '<p class="setting-hint">No shortcuts are available in this view.</p>';
  }

  let integrityReport = null;
  let restoreInspection = null;

  /**
   * Storage & Data is the only section that can remove things, so it keeps its
   * own state and never reuses a decision from a previous visit.
   */
  function resetStorageState() {
    integrityReport = null;
    restoreInspection = null;
    document.getElementById('integrity-repair-btn')?.setAttribute('disabled', '');
    const progress = document.getElementById('integrity-progress');
    if (progress) progress.hidden = true;
    setContainerHTML('integrity-results', '');
    setContainerHTML('restore-preview', '');
    const orphans = document.getElementById('storage-orphans');
    if (orphans) orphans.hidden = true;
  }

  function setContainerHTML(id, html) {
    const host = document.getElementById(id);
    if (host) host.innerHTML = html;
  }

  /**
   * Asks before anything is removed. The caller supplies the wording so the
   * confirmation always describes the specific action, including how many items
   * it affects, rather than a generic warning.
   */
  function confirmAction({ title, subtitle = '', message, confirmLabel = 'Continue' }) {
    const modal = document.getElementById('confirm-action-modal');
    if (!modal) return Promise.resolve(false);

    const titleEl = document.getElementById('confirm-action-title');
    const subtitleEl = document.getElementById('confirm-action-subtitle');
    const messageEl = document.getElementById('confirm-action-message');
    const confirmButton = document.getElementById('confirm-confirm-action-btn');
    const cancelButton = document.getElementById('cancel-confirm-action-btn');

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    messageEl.textContent = message;
    confirmButton.textContent = confirmLabel;

    return new Promise(resolve => {
      const finish = confirmed => {
        modal.classList.add('hidden');
        cancelButton?.removeEventListener('click', onCancel);
        confirmButton?.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        resolve(confirmed);
      };
      const onCancel = () => finish(false);
      const onConfirm = () => finish(true);
      const onBackdrop = event => { if (event.target === modal) finish(false); };

      cancelButton?.addEventListener('click', onCancel);
      confirmButton?.addEventListener('click', onConfirm);
      modal.addEventListener('click', onBackdrop);
      modal.classList.remove('hidden');
      confirmButton.focus();
    });
  }

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || !Number.isFinite(Number(bytes))) return 'Unknown';
    const value = Number(bytes);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Storage figures. Every value shown here was measured during this render;
   * anything that could not be measured is written as "Unknown" rather than
   * being replaced with a plausible-looking number.
   */
  async function renderStorageStats() {
    const host = document.getElementById('storage-stats');
    if (!host) return;
    host.innerHTML = '<p class="setting-hint">Measuring storage…</p>';

    const stats = await Library.getBookStats();
    const formats = Object.entries(stats.byFormat)
      .map(([id, count]) => `${count} ${BookFormat.describe(id).label}`)
      .join(' · ');

    // Recorded size is what the library believes it stored; actual size is what
    // the files measure now. Showing both makes a discrepancy visible instead of
    // hiding it behind whichever number looks tidier.
    const usageRows = [
      ['Books', String(stats.books)],
      ['Collections', String(stats.collections)],
      ['Highlights & notes', String(stats.annotations)],
      ['On disk now', formatBytes(stats.actualBytes)],
      ['Recorded total', formatBytes(stats.recordedBytes)],
      ['Files in storage', stats.managedFiles === null ? 'Unknown' : String(stats.managedFiles)]
    ];

    host.innerHTML = `
      <div class="storage-grid">
        ${usageRows.map(([label, value]) => `
          <div class="storage-stat">
            <span class="storage-value">${Utils.escapeHTML(value)}</span>
            <span class="storage-label">${Utils.escapeHTML(label)}</span>
          </div>`).join('')}
      </div>
      <p class="setting-hint">${formats || 'No books stored yet.'}</p>
      ${stats.pendingAvailability > 0
        ? `<p class="setting-hint storage-warning">${stats.pendingAvailability} book${stats.pendingAvailability === 1 ? '' : 's'} marked as unavailable. Run a check below for the details.</p>`
        : ''}
      ${stats.storageLocation
        ? `<div class="storage-location">
             <span class="storage-path-label">Library files</span>
             <code class="storage-path" id="storage-path-text">${Utils.escapeHTML(stats.storageLocation)}</code>
             <button class="btn btn-ghost" id="reveal-storage-btn" type="button">Show in folder</button>
           </div>`
        : ''}
    `;

    document.getElementById('reveal-storage-btn')?.addEventListener('click', async () => {
      if (!stats.storageLocation) return;
      try {
        await window.noveraDesktop?.showInExplorer?.(stats.storageLocation);
      } catch {
        Utils.toast('Could not open that folder', 'error');
      }
    });
  }

  async function startIntegrityCheck() {
    const button = document.getElementById('integrity-check-btn');
    const progress = document.getElementById('integrity-progress');
    const barFill = document.getElementById('integrity-bar-fill');
    const progressText = document.getElementById('integrity-progress-text');
    const repairButton = document.getElementById('integrity-repair-btn');

    if (button) button.disabled = true;
    repairButton?.setAttribute('disabled', '');
    setContainerHTML('integrity-results', '');
    if (progress) progress.hidden = false;
    if (barFill) barFill.style.width = '0%';

    const report = await Library.runIntegrityCheck(({ done, total, title }) => {
      const percent = total ? Math.round((done / total) * 100) : 100;
      if (barFill) barFill.style.width = `${percent}%`;
      if (progressText) progressText.textContent = total
        ? `Checking ${done + 1} of ${total} — ${title}`
        : 'Checking…';
    });

    if (button) button.disabled = false;
    if (progress) progress.hidden = true;

    if (!report.supported) {
      setContainerHTML('integrity-results', '<p class="setting-hint">Integrity checks need the desktop app\'s file access.</p>');
      return;
    }

    integrityReport = report;
    renderIntegrityResults(report);
    renderOrphans(report.orphans);
  }

  function renderIntegrityResults(report) {
    const groups = [
      { label: 'Healthy', count: report.healthy.length, tone: 'ok' },
      { label: 'File missing', count: report.missingFile.length, tone: report.missingFile.length ? 'bad' : 'ok', entries: report.missingFile, note: 'The stored file is not on this computer. Re-import the book to read it again.' },
      { label: 'Damaged', count: report.damaged.length, tone: report.damaged.length ? 'bad' : 'ok', entries: report.damaged, note: 'The stored file no longer matches the book. Re-import the book to replace it.' },
      { label: 'Unreadable', count: report.unreadable.length, tone: report.unreadable.length ? 'bad' : 'ok', entries: report.unreadable, note: 'The file exists but could not be read.' },
      { label: 'Details only', count: report.noFile.length, tone: report.noFile.length ? 'warn' : 'ok', entries: report.noFile, note: 'Restored from a backup, so there is a record but no book file. Re-import the book to read it.' },
      { label: 'Needs migration', count: report.needsMigration.length, tone: report.needsMigration.length ? 'warn' : 'ok', entries: report.needsMigration, note: 'Stored from an older version, before files were managed separately.' }
    ];

    const problem = report.issues > 0 || report.orphans.length > 0;
    const summary = report.issues === 0 && report.orphans.length === 0
      ? `<p class="integrity-verdict ok">Everything checks out. All ${report.total} book${report.total === 1 ? '' : 's'} match the files stored on this computer.</p>`
      : `<p class="integrity-verdict ${report.issues ? 'bad' : 'warn'}">
           ${report.issues
             ? `${report.issues} of ${report.total} book${report.total === 1 ? '' : 's'} need attention.`
             : `All ${report.total} book${report.total === 1 ? '' : 's'} are readable.`}
           ${report.orphans.length ? ` ${report.orphans.length} unused file${report.orphans.length === 1 ? '' : 's'} found.` : ''}
         </p>`;

    setContainerHTML('integrity-results', `
      <p class="setting-hint">Checked ${report.total} book${report.total === 1 ? '' : 's'} just now.</p>
      ${summary}
      <div class="integrity-groups">
        ${groups.map(group => `
          <div class="integrity-group ${group.tone}">
            <div class="integrity-group-head">
              <span class="integrity-group-label">${Utils.escapeHTML(group.label)}</span>
              <span class="integrity-group-count">${group.count}</span>
            </div>
            ${group.count && group.note ? `<p class="setting-hint">${Utils.escapeHTML(group.note)}</p>` : ''}
            ${group.entries?.length ? `
              <ul class="integrity-list">
                ${group.entries.slice(0, 12).map(entry => `
                  <li>
                    <span class="integrity-book">${Utils.escapeHTML(entry.title)}</span>
                    ${entry.detail ? `<span class="integrity-detail">${Utils.escapeHTML(entry.detail)}</span>` : ''}
                  </li>`).join('')}
              </ul>
              ${group.entries.length > 12 ? `<p class="setting-hint">and ${group.entries.length - 12} more</p>` : ''}` : ''}
          </div>`).join('')}
      </div>
    `);

    // Repair only has something real to offer when a book is marked unavailable
    // but its file turns out to be intact. It is never offered as a way to
    // recover a file that is genuinely gone.
    const repairable = report.healthy.some(entry => entry.availability === 'unavailable');
    const repairButton = document.getElementById('integrity-repair-btn');
    if (repairButton) {
      if (repairable) repairButton.removeAttribute('disabled');
      else repairButton.setAttribute('disabled', '');
    }

    const markButton = document.getElementById('integrity-mark-btn');
    if (markButton) markButton.hidden = report.issues === 0;
  }

  function renderOrphans(orphans) {
    const section = document.getElementById('storage-orphans');
    if (!section) return;
    if (!orphans || orphans.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    document.getElementById('orphan-summary').textContent =
      `${orphans.length} file${orphans.length === 1 ? '' : 's'} in the library folder ${orphans.length === 1 ? 'is' : 'are'} not connected to any book in your library. They can be removed safely.`;

    setContainerHTML('orphan-list', `
      <ul class="integrity-list">
        ${orphans.slice(0, 10).map(storageId => `<li><code class="integrity-book">${Utils.escapeHTML(`${storageId.slice(0, 12)}…${storageId.slice(-6)}`)}</code></li>`).join('')}
      </ul>
      ${orphans.length > 10 ? `<p class="setting-hint">and ${orphans.length - 10} more</p>` : ''}
    `);
  }

  async function runRepair() {
    if (!integrityReport) return;
    const result = await Library.repairLibrary(integrityReport);
    if (result.notRepairable > 0) {
      Utils.toast(
        `${result.repaired} restored. ${result.notRepairable} need the original file re-imported.`,
        'info', 6000
      );
    } else {
      Utils.toast(result.repaired ? `${result.repaired} book${result.repaired === 1 ? '' : 's'} restored` : 'Nothing needed repairing', 'success');
    }
    // Re-check rather than patching the old report, so what is shown afterwards
    // is always the true current state of the library.
    await startIntegrityCheck();
  }

  async function runOrphanCleanup() {
    const orphans = integrityReport?.orphans || [];
    if (orphans.length === 0) return;

    const confirmed = await confirmAction({
      title: 'Remove unused files?',
      subtitle: `${orphans.length} file${orphans.length === 1 ? '' : 's'}`,
      message: `These ${orphans.length} file${orphans.length === 1 ? '' : 's'} are not used by any book in your library and will be permanently deleted. Books in your library are never removed by this action.`,
      confirmLabel: `Remove ${orphans.length} file${orphans.length === 1 ? '' : 's'}`
    });
    if (!confirmed) return;

    const result = await Library.cleanupOrphans(orphans);
    Utils.toast(`Removed ${result.removed.length} unused file${result.removed.length === 1 ? '' : 's'}`, 'success');
    await startIntegrityCheck();
    await renderStorageStats();
  }

  async function handleRestoreFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setContainerHTML('restore-preview', '<p class="setting-hint">Reading backup…</p>');
    const inspection = await Library.inspectBackupFile(file);

    if (!inspection.ok) {
      restoreInspection = null;
      setContainerHTML('restore-preview', `<p class="integrity-verdict bad">${Utils.escapeHTML(inspection.error)}</p>`);
      return;
    }

    restoreInspection = inspection;
    const s = inspection.summary;
    setContainerHTML('restore-preview', `
      <div class="restore-summary">
        <div class="setting-section-title">This backup contains</div>
        <ul class="integrity-list">
          <li><span class="integrity-book">${s.books} book${s.books === 1 ? '' : 's'}</span>
            <span class="integrity-detail">${s.newBooks} new, ${s.alreadyPresent} already in your library</span></li>
          <li><span class="integrity-book">${s.newAnnotations} new highlight${s.newAnnotations === 1 ? '' : 's'} or note${s.newAnnotations === 1 ? '' : 's'}</span></li>
          <li><span class="integrity-book">${s.newCollections} new collection${s.newCollections === 1 ? '' : 's'}</span></li>
          <li><span class="integrity-book">${s.preferences} setting${s.preferences === 1 ? '' : 's'}</span></li>
        </ul>
        <p class="setting-hint">
          Restoring only adds things. Books already in your library, and everything currently in it, are left exactly as they are.
          Restored books arrive as details only, because a backup does not contain book files — re-import a book to read it again.
        </p>
        <div class="storage-actions">
          <button class="btn btn-glow" id="restore-confirm-btn" type="button">Restore backup</button>
          <button class="btn btn-ghost" id="restore-cancel-btn" type="button">Cancel</button>
        </div>
      </div>
    `);

    document.getElementById('restore-cancel-btn')?.addEventListener('click', () => {
      restoreInspection = null;
      setContainerHTML('restore-preview', '');
    });
    document.getElementById('restore-confirm-btn')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const result = await Library.applyBackup(restoreInspection, { includePreferences: true });
      button.disabled = false;
      restoreInspection = null;
      if (result?.ok) {
        Utils.toast(`Restored ${result.booksAdded} books, ${result.annotationsAdded} annotations, ${result.collectionsAdded} collections`, 'success', 6000);
        setContainerHTML('restore-preview', '');
        await renderStorageStats();
      } else {
        setContainerHTML('restore-preview', `<p class="integrity-verdict bad">${Utils.escapeHTML(result?.error || 'The backup could not be restored.')}</p>`);
      }
    });
  }

  function renderAbout() {
    const host = document.getElementById('about-extra');
    if (!host) return;
    host.innerHTML = `
      <div class="about-list">
        <div class="about-list-row"><span>Application</span><strong>Lirune Reader</strong></div>
        <div class="about-list-row"><span>Version</span><strong id="about-version-full">…</strong></div>
        <div class="about-list-row"><span>Author</span><strong>Vasanth Gajavelly</strong></div>
        <div class="about-list-row"><span>Licence</span><strong>GNU GPL v3.0</strong></div>
      </div>
      <div class="setting-section-title">Third-party notices</div>
      <p class="setting-hint">Lirune Reader bundles epub.js (BSD-2-Clause), PDF.js (Apache-2.0) and JSZip (MIT or GPL-3.0). Fonts are used under the SIL Open Font License.</p>
      <div class="setting-section-title">Privacy</div>
      <p class="setting-hint">Lirune Reader works entirely offline. Your books, reading positions and annotations stay on this computer and are never uploaded.</p>
    `;
    syncVersion();
  }

  function syncVersion() {
    window.noveraDesktop?.getVersion?.().then(version => {
      for (const id of ['about-version', 'about-version-full']) {
        const el = document.getElementById(id);
        if (el) el.textContent = version;
      }
    }).catch(() => {});
  }

  /** Keeps the full settings controls showing the current values. */
  function syncFullControls() {
    const view = Library.getViewState();
    setSegment('fs-view', view.view);
    setSelect('fs-sort', view.sortBy);
    setSegment('fs-order', view.sortOrder);
    setSegment('fs-density', view.density);
    setSwitch('fs-metadata', view.showMetadata);

    const motionSwitch = document.getElementById('fs-reduce-motion');
    if (motionSwitch) motionSwitch.setAttribute('aria-checked', AppPrefs.getAll().reduceMotion ? 'true' : 'false');

    document.querySelectorAll('#app-theme-grid [data-app-theme]').forEach(button => {
      const isActive = button.dataset.appTheme === ThemeManager.getAppTheme();
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setSegment(id, value) {
    document.querySelectorAll(`[data-quick-segment="${id}"] .segment-opt`).forEach(button => {
      const isActive = button.dataset.value === value;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function setSelect(id, value) {
    const select = document.getElementById(`${id}-select`);
    if (select && select.value !== value) select.value = value;
  }

  function setSwitch(id, checked) {
    const control = document.getElementById(id);
    if (control) control.setAttribute('aria-checked', checked ? 'true' : 'false');
  }

  // ---------------------------------------------------------------
  // Expand / collapse
  // ---------------------------------------------------------------

  function expand() {
    expanded = true;
    document.getElementById('full-settings')?.classList.remove('hidden');
    document.getElementById('quick-settings')?.classList.add('hidden');
    document.getElementById('settings-panel')?.classList.add('panel-expanded');
    document.getElementById('settings-back-btn')?.classList.remove('hidden');
    renderShortcuts();
    syncFullControls();
    showSection(currentContext === 'reader' ? 'reading' : 'library');
  }

  function collapse() {
    // Panels are closed on every view change and overlay click, so this runs
    // far more often than the user pressed back. Returning early when the
    // panel is already collapsed avoids rebuilding the quick settings for no
    // reason.
    if (!expanded) return;
    expanded = false;
    document.getElementById('full-settings')?.classList.add('hidden');
    document.getElementById('quick-settings')?.classList.remove('hidden');
    document.getElementById('settings-panel')?.classList.remove('panel-expanded');
    document.getElementById('settings-back-btn')?.classList.add('hidden');
    renderQuick();
  }

  // ---------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------

  function bindEvents() {
    const panel = document.getElementById('settings-panel');
    if (!panel) return;

    panel.addEventListener('click', event => {
      const segment = event.target.closest('.segment-opt');
      if (segment) {
        applySegment(segment.closest('[data-quick-segment]')?.dataset.quickSegment, segment.dataset.value);
        return;
      }

      if (event.target.closest('#expand-settings-btn')) {
        expand();
        return;
      }
      if (event.target.closest('#settings-back-btn')) {
        collapse();
        return;
      }
      if (event.target.closest('#qs-reset-reader') || event.target.closest('#reset-reader-settings-btn')) {
        resetReader();
        return;
      }
      if (event.target.closest('#reset-library-view-btn')) {
        Library.resetView();
        refresh();
        return;
      }

      const navItem = event.target.closest('[data-section-target]');
      if (navItem) {
        showSection(navItem.dataset.sectionTarget);
        return;
      }

      const appTheme = event.target.closest('[data-app-theme]');
      if (appTheme) {
        ThemeManager.setAppTheme(appTheme.dataset.appTheme);
        syncFullControls();
        return;
      }

      const toggle = event.target.closest('.setting-switch');
      if (toggle && SWITCH_ACTIONS[toggle.id]) {
        SWITCH_ACTIONS[toggle.id]();
        refresh();
        return;
      }

      const deleteAll = event.target.closest('#delete-all-data-btn');
      if (deleteAll) {
        requestDeleteAll();
        return;
      }

      if (event.target.closest('#integrity-check-btn')) {
        startIntegrityCheck();
        return;
      }
      if (event.target.closest('#integrity-repair-btn')) {
        runRepair();
        return;
      }
      if (event.target.closest('#orphan-cleanup-btn')) {
        runOrphanCleanup();
        return;
      }
      if (event.target.closest('#backup-library-btn')) {
        Library.backupMetadata();
        return;
      }
      if (event.target.closest('#export-annotations-btn')) {
        Library.exportAnnotations();
        return;
      }
    });

    // The restore control is a file input, so it is handled on change rather
    // than on click, and only after the user has picked a file.
    document.getElementById('restore-library-input')?.addEventListener('change', handleRestoreFile);

    panel.addEventListener('change', event => {
      const select = event.target.closest('[data-quick-select]');
      if (!select) return;
      const id = select.dataset.quickSelect;
      if (id === 'qs-sort' || id === 'fs-sort') {
        Library.setView({ sortBy: select.value });
        refresh();
        return;
      }
      if (id === 'qs-theme') {
        ThemeManager.setReaderTheme(select.value);
        refresh();
        return;
      }
      if (id === 'qs-font') {
        ReaderSettings.setSetting('fontFamily', select.value);
        refresh();
      }
    });

    panel.addEventListener('input', event => {
      const slider = event.target.closest('[data-quick-slider]');
      if (!slider) return;
      const id = slider.dataset.quickSlider;
      const value = Number(slider.value);
      const unit = slider.dataset.unit || '';

      const readout = document.getElementById(`${id}-value`);
      if (readout) readout.textContent = `${id === 'qs-line-height' ? value.toFixed(1) : value}${unit}`;

      if (id === 'qs-font-size') ReaderSettings.setSetting('fontSize', value);
      if (id === 'qs-line-height') ReaderSettings.setSetting('lineHeight', value);
      if (id === 'qs-margin') ReaderSettings.setSetting('margin', value);
    });

    const appThemeSwitch = document.getElementById('app-theme-switch');
    if (appThemeSwitch) {
      appThemeSwitch.addEventListener('click', () => {
        if (expanded) syncFullControls();
      });
    }
  }

  function applySegment(id, value) {
    if (!id) return;

    const readerKeys = {
      'qs-alignment': 'alignment',
      'qs-flow': 'flow',
      'qs-spread': 'spread'
    };
    if (readerKeys[id]) {
      ReaderSettings.setSetting(readerKeys[id], value);
      // Flow and column changes need a re-render, which the existing settings
      // controls already do.
      if (readerKeys[id] === 'flow' || readerKeys[id] === 'spread') Reader.reRender();
      refresh();
      return;
    }

    const viewKeys = {
      'qs-view': 'view',
      'fs-view': 'view',
      'qs-order': 'sortOrder',
      'fs-order': 'sortOrder',
      'qs-density': 'density',
      'fs-density': 'density'
    };
    if (viewKeys[id]) {
      Library.setView({ [viewKeys[id]]: value });
      refresh();
    }
  }

  function resetReader() {
    ReaderSettings.reset();
    refresh();
    Utils.toast('Reading preferences reset', 'success');
  }

  async function requestDeleteAll() {
    if (!await confirmDeleteAll()) return;
    const result = await Library.deleteAllBooks();
    Utils.toast(
      result.failed
        ? `Removed ${result.removed} books, ${result.failed} could not be removed`
        : `Removed ${result.removed} ${result.removed === 1 ? 'book' : 'books'}`,
      result.failed ? 'error' : 'success'
    );
    renderStorageStats();
  }

  /**
   * Deleting every book is the one action here that cannot be undone, so it
   * uses the application's own confirmation dialog rather than a silent click.
   */
  function confirmDeleteAll() {
    const modal = document.getElementById('delete-all-modal');
    if (!modal) return Promise.resolve(false);

    return new Promise(resolve => {
      const finish = confirmed => {
        modal.classList.add('hidden');
        cancelButton?.removeEventListener('click', onCancel);
        confirmButton?.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        resolve(confirmed);
      };
      const onCancel = () => finish(false);
      const onConfirm = () => finish(true);
      const onBackdrop = event => { if (event.target === modal) finish(false); };

      const cancelButton = document.getElementById('cancel-delete-all-btn');
      const confirmButton = document.getElementById('confirm-delete-all-btn');
      cancelButton?.addEventListener('click', onCancel);
      confirmButton?.addEventListener('click', onConfirm);
      modal.addEventListener('click', onBackdrop);
      modal.classList.remove('hidden');
    });
  }

  return { init, refresh, expand, collapse, isExpanded, getContext };
})();
