/**
 * Lirune Reader — Main Application Coordinator
 * Boots app, manages view transitions, drawer panels, modals, and hotkeys.
 */

const App = (() => {
  let activeView = 'library'; // 'library' | 'reader'
  let currentBookId = null;
  let focusMode = false;
  let nativeFullscreen = false;
  let homeZoom = 100;
  let homeZoomControl = null;

  async function init() {
    // Initialize subsystem managers in parallel (they share a single cached DB
    // connection, so parallel init avoids sequential IndexedDB round-trips)
    showLibraryLoading(true);
    await Promise.all([
      ThemeManager.init(),
      ReaderSettings.init(),
      AppPrefs.init(),
      Library.init()
    ]);
    hideLibraryLoading();

    SettingsUI.init();

    homeZoomControl = ZoomControl.create('home-zoom-control', {
      min: 75,
      max: 150,
      step: 10,
      label: 'Home zoom',
      onChange: value => applyHomeZoom(value)
    });
    Reader.init();

    window.noveraDesktop?.getVersion?.().then(version => {
      const versionEl = document.getElementById('about-version');
      if (versionEl) versionEl.textContent = version;
    }).catch(() => {});

    bindNavigationEvents();
    bindDrawersAndModals();
    bindSelectionToolbar();
    bindKeyboardShortcuts();
    bindSearchOverlay();
    bindFullscreenState();
    bindWindowControls();
    bindViewportClamping();

    console.log('Lirune Reader successfully initialized');

    if (AppPrefs.getAll().restoreLastBook && activeView === 'library') {
      const hasPendingExternal = await window.noveraDesktop?.hasPendingOpenFile?.().catch(() => false);
      if (!hasPendingExternal && !window.__externalFileOpening && activeView === 'library') {
        const books = await NoveraDB.getAllBooks().catch(() => []);
        const recent = books
          ?.filter(b => b.lastReadDate && b.lastReadDate > 0)
          ?.sort((a, b) => (b.lastReadDate || 0) - (a.lastReadDate || 0));
        if (recent && recent.length > 0 && !window.__externalFileOpening && activeView === 'library') {
          openReader(recent[0].id);
        }
      }
    }
  }

  // View Switching
  function applyHomeZoom(value) {
    homeZoom = Number(value) || 100;
    const libView = document.getElementById('library-view');
    if (!libView) return;
    // CSS zoom on the view scales the existing DOM in place. The library is
    // never re-rendered, so filters, sorting, favourites and collections keep
    // their state and 300+ book libraries stay fast.
    libView.style.zoom = `${homeZoom}%`;
    if (libView.classList.contains('hidden')) libView.style.zoom = '';
  }

  function adjustHomeZoom(delta) {
    homeZoomControl?.adjust(delta);
  }

  function setHomeZoom(value) {
    homeZoomControl?.set(value);
  }

  function getHomeZoom() {
    return homeZoomControl?.get() ?? 100;
  }

  function bindViewportClamping() {
    const clamp = () => {
      homeZoomControl?.clampToViewport();
      Reader.showZoomControl?.();
    };
    window.addEventListener('resize', clamp);
    window.addEventListener('scroll', clamp, true);
  }

  async function openLibrary() {
    activeView = 'library';
    closeAllPanels();

    try {
      await Reader.close();
    } catch (e) {
      console.warn('Reader close warning:', e);
    }

    // Refresh library state completely BEFORE making it visible
    // so that the library renders only ONCE, preventing any visible flicker/blink
    await Library.loadAndRenderBooks();

    document.body.classList.remove('reader-open');

    const libView = document.getElementById('library-view');
    const readerView = document.getElementById('reader-view');

    if (readerView) {
      readerView.classList.remove('active');
      readerView.classList.add('hidden');
    }
    if (libView) {
      libView.classList.remove('hidden');
      libView.classList.add('active');
    }
  }

  async function openReader(bookId) {
    const book = await NoveraDB.getBook(bookId);
    if (!book) {
      Utils.toast('Could not find book in storage', 'error');
      return;
    }

    currentBookId = bookId;
    activeView = 'reader';
    closeAllPanels();
    document.body.classList.add('reader-open');

    const libView = document.getElementById('library-view');
    const readerView = document.getElementById('reader-view');

    if (libView) {
      libView.classList.remove('active');
      libView.classList.add('hidden');
    }
    if (readerView) {
      readerView.classList.remove('hidden');
      readerView.classList.add('active');
    }

    const success = await Reader.open(book);
    if (!success) {
      openLibrary();
    }
  }

  function bindNavigationEvents() {
    // Back to library button
    const backBtn = document.getElementById('back-to-library-btn');
    if (backBtn) {
      backBtn.addEventListener('click', openLibrary);
    }

    // Prev / Next page buttons
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => Reader.prev());
    if (nextBtn) nextBtn.addEventListener('click', () => Reader.next());

    // Bookmark button
    const bmBtn = document.getElementById('bookmark-btn');
    if (bmBtn) {
      bmBtn.addEventListener('click', () => EpubLoader.toggleBookmark());
    }

    // Fullscreen toggle button
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', toggleFullscreen);
    }

    // Page-fit controls (fixed-layout and image formats only)
    document.querySelectorAll('[data-fit]').forEach(button => {
      button.addEventListener('click', () => {
        Reader.setFit(button.dataset.fit);
        document.querySelectorAll('[data-fit]').forEach(other => {
          other.classList.toggle('active', other === button);
        });
      });
    });

    const focusSettingsBtn = document.getElementById('focus-settings-btn');
    if (focusSettingsBtn) {
      document.getElementById('reader-view')?.appendChild(focusSettingsBtn);
    }
  }

  async function toggleFullscreen() {
    const entering = !focusMode;
    setFocusMode(entering);

    if (window.noveraDesktop?.toggleNativeFullscreen) {
      const isNative = await window.noveraDesktop.isNativeFullscreen();
      if (isNative !== entering) await window.noveraDesktop.toggleNativeFullscreen();
      return;
    }

    if (entering && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => {
        setFocusMode(false);
        console.warn('Fullscreen request failed:', err);
      });
    } else if (!entering && document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }

  function setFocusMode(enabled) {
    focusMode = Boolean(enabled);
    document.body.classList.toggle('focus-mode', focusMode);
    const button = document.getElementById('fullscreen-btn');
    if (button) {
      button.classList.toggle('active', focusMode);
      button.setAttribute('aria-label', focusMode ? 'Exit focused fullscreen' : 'Enter focused fullscreen');
      button.title = focusMode ? 'Exit Fullscreen (F)' : 'Toggle Fullscreen (F)';
    }
  }

  function bindFullscreenState() {
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && !nativeFullscreen) setFocusMode(false);
    });

    window.noveraDesktop?.onNativeFullscreenChanged((isFullscreen) => {
      nativeFullscreen = isFullscreen;
      setFocusMode(isFullscreen);
    });
  }

  function bindWindowControls() {
    document.addEventListener('click', (event) => {
      const control = event.target.closest('[data-window-action]');
      if (!control) return;

      const action = control.dataset.windowAction;
      if (action === 'close-reader') {
        openLibrary();
        return;
      }
      if (!window.noveraDesktop) return;
      if (action === 'minimize') window.noveraDesktop.minimizeWindow();
      if (action === 'maximize') window.noveraDesktop.maximizeWindow();
      if (action === 'close') window.noveraDesktop.closeWindow();
    });
  }

  function bindDrawersAndModals() {
    const overlay = document.getElementById('panel-overlay');

    // Navigation drawer (TOC / outline / page list depending on format)
    const tocBtn = document.getElementById('toc-toggle-btn');
    const closeTocBtn = document.getElementById('close-toc-btn');
    const tocPanel = document.getElementById('toc-panel');

    if (tocBtn) {
      tocBtn.addEventListener('click', () => {
        Reader.renderNavigation();
        toggleDrawer(tocPanel);
      });
    }
    if (closeTocBtn) {
      closeTocBtn.addEventListener('click', () => closeDrawer(tocPanel));
    }

    // Settings drawer
    const settingsButtons = [
      document.getElementById('settings-btn'),
      document.getElementById('library-settings-btn'),
      document.getElementById('focus-settings-btn')
    ].filter(Boolean);
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const settingsPanel = document.getElementById('settings-panel');

    settingsButtons.forEach(button => {
      button.addEventListener('click', () => {
        toggleDrawer(settingsPanel);
        // The panel shows the settings for wherever the user already is, so
        // the content is rebuilt at the moment it opens rather than when the
        // view last changed.
        SettingsUI.refresh();
      });
    });
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        // Leaving settings always returns the panel to the normal sidebar
        // state, whatever was open when it was closed.
        SettingsUI.collapse();
        closeDrawer(settingsPanel);
      });
    }

    // Annotations drawer
    const annBtn = document.getElementById('annotations-toggle-btn');
    const closeAnnBtn = document.getElementById('close-annotations-btn');
    const annPanel = document.getElementById('annotations-panel');

    if (annBtn) {
      annBtn.addEventListener('click', () => {
        EpubLoader.refreshAnnotationsPanel();
        toggleDrawer(annPanel);
      });
    }
    if (closeAnnBtn) {
      closeAnnBtn.addEventListener('click', () => closeDrawer(annPanel));
    }

    // Annotations tab switcher
    document.querySelectorAll('.ann-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ann-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        EpubLoader.refreshAnnotationsPanel();
      });
    });

    // Clicking overlay closes all sliding panels
    if (overlay) {
      overlay.addEventListener('click', closeAllPanels);
    }

    // Shortcuts modal
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const closeShortcutsBtn = document.getElementById('close-shortcuts-btn');
    if (closeShortcutsBtn) {
      closeShortcutsBtn.addEventListener('click', () => {
        shortcutsModal?.classList.add('hidden');
      });
    }
    if (shortcutsModal) {
      shortcutsModal.addEventListener('click', (e) => {
        if (e.target === shortcutsModal) shortcutsModal.classList.add('hidden');
      });
    }

    // Note Modal
    const noteModal = document.getElementById('note-modal');
    const closeNoteBtn = document.getElementById('close-note-btn');
    const cancelNoteBtn = document.getElementById('note-cancel-btn');
    const saveNoteBtn = document.getElementById('note-save-btn');

    [closeNoteBtn, cancelNoteBtn].forEach(btn => {
      if (btn) btn.addEventListener('click', () => noteModal?.classList.add('hidden'));
    });

    if (noteModal) {
      noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) noteModal.classList.add('hidden');
      });
    }

    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', async () => {
        const textarea = document.getElementById('note-textarea');
        const note = textarea ? textarea.value.trim() : '';
        await EpubLoader.addHighlight('yellow', note);
        noteModal?.classList.add('hidden');
        if (textarea) textarea.value = '';
      });
    }
  }

  function resolvePanel(panel) {
    if (!panel) return null;
    if (typeof panel === 'string') return document.getElementById(panel);
    return panel;
  }

  function toggleDrawer(panel) {
    panel = resolvePanel(panel);
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    closeAllPanels();
    if (!isOpen) {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      document.getElementById('panel-overlay')?.classList.add('visible');
    }
  }

  function closeDrawer(panel) {
    panel = resolvePanel(panel);
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    document.getElementById('panel-overlay')?.classList.remove('visible');
  }

  function closeAllPanels() {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    // Closing the settings panel always returns it to the normal sidebar
    // state, whether it was closed with Escape, the overlay, or by switching
    // views.
    SettingsUI.collapse();
    document.getElementById('panel-overlay')?.classList.remove('visible');
    document.getElementById('search-overlay')?.classList.remove('visible');
    document.getElementById('shortcuts-modal')?.classList.add('hidden');
    document.getElementById('book-details-modal')?.classList.add('hidden');
    document.getElementById('note-modal')?.classList.add('hidden');
    document.getElementById('collection-modal')?.classList.add('hidden');
  }

  function bindSelectionToolbar() {
    // Highlight color clicks
    document.querySelectorAll('.sel-color').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color || 'yellow';
        EpubLoader.addHighlight(color);
      });
    });

    // Add note button
    const noteBtn = document.getElementById('sel-add-note');
    if (noteBtn) {
      noteBtn.addEventListener('click', () => {
        const sel = EpubLoader.getActiveSelection();
        if (!sel) return;

        const quoteEl = document.getElementById('note-selected-text');
        const textarea = document.getElementById('note-textarea');
        const noteModal = document.getElementById('note-modal');

        if (quoteEl) quoteEl.textContent = `"${sel.text}"`;
        if (textarea) textarea.value = '';
        if (noteModal) noteModal.classList.remove('hidden');
        if (textarea) textarea.focus();
      });
    }

    // Copy text button
    const copyBtn = document.getElementById('sel-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const sel = EpubLoader.getActiveSelection();
        if (sel && sel.text) {
          navigator.clipboard.writeText(sel.text).then(() => {
            Utils.toast('Copied to clipboard', 'info');
          });
        }
      });
    }
  }

  function bindSearchOverlay() {
    const searchBtn = document.getElementById('search-toggle-btn');
    const overlay = document.getElementById('search-overlay');
    const closeBtn = document.getElementById('search-close-btn');
    const input = document.getElementById('search-input');
    const prevBtn = document.getElementById('search-prev-btn');
    const nextBtn = document.getElementById('search-next-btn');

    const showSearch = () => {
      overlay?.classList.add('visible');
      input?.focus();
      input?.select();
    };

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        if (!overlay) return;
        if (overlay.classList.contains('visible')) overlay.classList.remove('visible');
        else showSearch();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => overlay?.classList.remove('visible'));
    }

    if (input) {
      input.addEventListener('input', Utils.debounce((e) => {
        Reader.search(e.target.value);
      }, 300));

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) Reader.prevSearchResult();
          else Reader.nextSearchResult();
        }
      });
    }

    if (prevBtn) prevBtn.addEventListener('click', () => Reader.prevSearchResult());
    if (nextBtn) nextBtn.addEventListener('click', () => Reader.nextSearchResult());
  }

  // ---------------------------------------------------------------
  // Keyboard: one authoritative shortcut table for the whole app.
  // The handler below dispatches from this same table, so the
  // Shortcuts list in Settings can never drift from what the app
  // actually does.
  // ---------------------------------------------------------------
  const ZOOM_IN_CODES = new Set(['Equal', 'NumpadAdd']);
  const ZOOM_OUT_CODES = new Set(['Minus', 'NumpadSubtract']);

  const SHORTCUTS = [
    { keys: ['Ctrl', '+'], description: 'Zoom in', contexts: ['library', 'reader'] },
    { keys: ['Ctrl', '-'], description: 'Zoom out', contexts: ['library', 'reader'] },
    { keys: ['Ctrl', 'F'], description: 'Search inside the book', contexts: ['reader'] },
    { keys: ['/'], description: 'Search inside the book', contexts: ['reader'] },
    { keys: ['Ctrl', 'K'], description: 'Search the library', contexts: ['library'] },
    { keys: ['S'], description: 'Open reading settings', contexts: ['reader'] },
    { keys: ['T'], description: 'Toggle table of contents', contexts: ['reader'] },
    { keys: ['N'], description: 'Toggle annotations', contexts: ['reader'] },
    { keys: ['B'], description: 'Toggle bookmark', contexts: ['reader'] },
    { keys: ['F'], description: 'Toggle fullscreen', contexts: ['reader'] },
    { keys: ['→', 'J', 'Space'], description: 'Next page', contexts: ['reader'] },
    { keys: ['←', 'K', 'Shift Space'], description: 'Previous page', contexts: ['reader'] },
    { keys: ['↓', '↑'], description: 'Scroll or turn the page', contexts: ['reader'] },
    { keys: ['PgDn', 'PgUp'], description: 'Next or previous page', contexts: ['reader'] },
    { keys: ['?'], description: 'Show this shortcut list', contexts: ['reader'] },
    { keys: ['Esc'], description: 'Close panels, leave fullscreen, or return to the library', contexts: ['library', 'reader'] }
  ];

  /** The shortcuts the app actually handles, in either context. */
  function getShortcuts() {
    return SHORTCUTS.map(shortcut => ({ ...shortcut, keys: [...shortcut.keys], contexts: [...shortcut.contexts] }));
  }

  function isZoomIn(event) {
    if (ZOOM_IN_CODES.has(event.code)) return true;
    return event.key === '+' || (event.key === '=' && event.shiftKey);
  }

  function isZoomOut(event) {
    if (ZOOM_OUT_CODES.has(event.code)) return true;
    return event.key === '-';
  }

  function bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const isInput = target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable;

      if (e.key === 'Escape') {
        const hasOpenPanels = document.querySelector('.panel.open')
          || document.querySelector('.modal-backdrop:not(.hidden)')
          || document.getElementById('search-overlay')?.classList.contains('visible');
        if (hasOpenPanels) {
          closeAllPanels();
          return;
        }

        if (focusMode || nativeFullscreen || document.fullscreenElement) {
          e.preventDefault();
          setFocusMode(false);
          if (nativeFullscreen && window.noveraDesktop?.toggleNativeFullscreen) {
            window.noveraDesktop.toggleNativeFullscreen();
          } else if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen();
          }
          return;
        }

        if (activeView === 'reader') {
          openLibrary();
          return;
        }
      }

      const mod = e.ctrlKey || e.metaKey;

      // Zoom is handled before the input guard so Ctrl +/- behaves like a
      // desktop zoom shortcut even while a text field has focus. The target
      // depends on which view is active, so the two never mix.
      if (mod && (isZoomIn(e) || isZoomOut(e))) {
        e.preventDefault();
        if (isZoomIn(e)) {
          if (activeView === 'reader') Reader.adjustZoom(10);
          else adjustHomeZoom(10);
        } else if (activeView === 'reader') {
          Reader.adjustZoom(-10);
        } else {
          adjustHomeZoom(-10);
        }
        return;
      }

      // Reader search must take precedence over the plain F fullscreen shortcut.
      if (activeView === 'reader' && mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const overlay = document.getElementById('search-overlay');
        overlay?.classList.add('visible');
        const input = document.getElementById('search-input');
        input?.focus();
        input?.select();
        return;
      }

      // Library search shortcut: Ctrl+K
      if (mod && e.key.toLowerCase() === 'k' && activeView === 'library') {
        e.preventDefault();
        const searchInput = document.getElementById('lib-search-input');
        searchInput?.focus();
        searchInput?.select();
        return;
      }

      if (isInput) return;

      if (activeView === 'reader') handleReaderKeys(e);
    });
  }

  function handleReaderKeys(e) {
    const flow = ReaderSettings.getSettings().flow;
    const inScrollMode = flow === 'scrolled';
    const pageDelta = Math.max(200, Math.round(window.innerHeight * 0.75));

    if (inScrollMode) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        Reader.scrollBy(0, 100);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        Reader.scrollBy(0, -100);
      } else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        Reader.scrollBy(0, pageDelta);
      } else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        Reader.scrollBy(0, -pageDelta);
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        Reader.scrollBy(0, 150);
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        Reader.scrollBy(0, -150);
      } else if (e.key === 'Home') {
        e.preventDefault();
        const scroller = document.querySelector('#epub-container .epub-container') || document.querySelector('.doc-viewport') || document.getElementById('epub-container');
        if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'End') {
        e.preventDefault();
        const scroller = document.querySelector('#epub-container .epub-container') || document.querySelector('.doc-viewport') || document.getElementById('epub-container');
        if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      }
    } else {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key.toLowerCase() === 'j' || (e.key === ' ' && !e.shiftKey)) {
        e.preventDefault();
        Reader.next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key.toLowerCase() === 'k' || (e.key === ' ' && e.shiftKey)) {
        e.preventDefault();
        Reader.prev();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        Reader.prev();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        Reader.next();
      }
    }

    if (e.key.toLowerCase() === 't') {
      e.preventDefault();
      Reader.renderNavigation();
      toggleDrawer(document.getElementById('toc-panel'));
    } else if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      SettingsUI.refresh();
      toggleDrawer(document.getElementById('settings-panel'));
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault();
      EpubLoader.refreshAnnotationsPanel();
      toggleDrawer(document.getElementById('annotations-panel'));
    } else if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      EpubLoader.toggleBookmark();
    } else if (e.key === '/') {
      e.preventDefault();
      const overlay = document.getElementById('search-overlay');
      overlay?.classList.add('visible');
      document.getElementById('search-input')?.focus();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === '?') {
      e.preventDefault();
      document.getElementById('shortcuts-modal')?.classList.remove('hidden');
    }
  }

  function showLibraryLoading(show) {
    const loader = document.getElementById('lib-loading');
    const content = document.getElementById('lib-content');
    const dropZone = document.getElementById('drop-zone');
    const libHeader = document.getElementById('lib-header');
    if (loader) loader.classList.toggle('hidden', !show);
    if (content) content.classList.toggle('is-loading', show);
    if (dropZone) dropZone.classList.toggle('loading-books', show);
    if (!show) {
      if (dropZone) dropZone.classList.remove('loading-books');
    }
    void libHeader;
  }

  function hideLibraryLoading() {
    showLibraryLoading(false);
  }

  // ---------------------------------------------------------------
  // Settings context: the application already knows which view is
  // active, so Settings asks the application rather than guessing from
  // the DOM. Both the quick settings panel and the expanded settings
  // view read this, which is what keeps them in step with the real
  // navigation state.
  // ---------------------------------------------------------------
  function getSettingsContext() {
    return activeView;
  }

  return {
    init,
    openLibrary,
    openReader,
    closeDrawer,
    toggleDrawer,
    closeAllPanels,
    adjustHomeZoom,
    setHomeZoom,
    getHomeZoom,
    toggleFullscreen,
    getSettingsContext,
    getShortcuts,
    isReaderView: () => activeView === 'reader'
  };
})();

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
