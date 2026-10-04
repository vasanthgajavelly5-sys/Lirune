/**
 * Lirune Reader Mobile — Settings State Store (Zustand)
 * Single source of truth for: App Theme, Accent, Reader Defaults, Accessibility, and Storage SAF authorization.
 */

import { create } from 'zustand';
import {
  ReaderSettings,
  DEFAULT_READER_SETTINGS,
  clampReaderBrightness,
} from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';
import { ttsService } from '@/services/tts/TtsService';

const TAG = 'SettingsStore';

export type AppThemeOption = 'dark' | 'light' | 'system';

export interface AccessibilitySettings {
  highContrast: boolean;
  largeTouchTargets: boolean;
  reduceMotion: boolean;
  readerFontScaling: number;
  screenReaderOptimized: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  highContrast: false,
  largeTouchTargets: false,
  reduceMotion: false,
  readerFontScaling: 1.0,
  screenReaderOptimized: false,
};

interface SettingsState {
  appTheme: AppThemeOption;
  accentColor: string;
  readerSettings: ReaderSettings;
  accessibility: AccessibilitySettings;
  lastAuthorizedFolderUri: string | null;
  /** Every folder the user authorised with Scan Folder; all are re-scanned. */
  authorizedFolderUris: string[];
  /**
   * True once the user chose "Not now" on the All files access explanation, so
   * the dialog is not shown on every tap of Scan Phone. The Settings screen's
   * explicit "Enable full scan" row resets it.
   */
  scanAccessDismissed: boolean;
  hasCompletedWelcome: boolean;
  isLoaded: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  setAppTheme: (theme: AppThemeOption) => Promise<void>;
  setAccentColor: (color: string) => Promise<void>;
  updateReaderSettings: (partial: Partial<ReaderSettings>) => Promise<void>;
  resetReaderSettings: () => Promise<void>;
  updateAccessibility: (partial: Partial<AccessibilitySettings>) => Promise<void>;
  setLastAuthorizedFolderUri: (uri: string | null) => Promise<void>;
  addAuthorizedFolderUri: (uri: string) => Promise<void>;
  removeAuthorizedFolderUri: (uri: string) => Promise<void>;
  setScanAccessDismissed: (dismissed: boolean) => Promise<void>;
  setHasCompletedWelcome: (completed: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appTheme: 'light',
  accentColor: '#EEECF8',
  readerSettings: DEFAULT_READER_SETTINGS,
  accessibility: DEFAULT_ACCESSIBILITY,
  lastAuthorizedFolderUri: null,
  authorizedFolderUris: [],
  scanAccessDismissed: false,
  hasCompletedWelcome: false,
  isLoaded: false,

  loadSettings: async () => {
    const repo = getBookRepository() as any;
    try {
      const [
        savedAppTheme,
        savedAccent,
        savedReaderSettings,
        savedAccessibility,
        savedFolderUri,
        savedFolderUris,
        savedScanAccessDismissed,
        savedWelcome,
      ] = await Promise.all([
        repo.getPreference?.('appTheme', 'light'),
        repo.getPreference?.('accentColor', '#EEECF8'),
        repo.getPreference?.('readerSettings', DEFAULT_READER_SETTINGS),
        repo.getPreference?.('accessibility', DEFAULT_ACCESSIBILITY),
        repo.getPreference?.('lastAuthorizedFolderUri', null),
        repo.getPreference?.('authorizedFolderUris', [] as string[]),
        repo.getPreference?.('scanAccessDismissed', false),
        repo.getPreference?.('hasCompletedWelcome', false),
      ]);

      const folderUris: string[] = Array.isArray(savedFolderUris) ? savedFolderUris.filter(Boolean) : [];

      // A settings blob written before brightness/keep-awake existed has no such
      // keys, and one written by an older build can hold a value outside the
      // supported range; both are normalised rather than trusted.
      const mergedReaderSettings: ReaderSettings = {
        ...DEFAULT_READER_SETTINGS,
        ...savedReaderSettings,
      };
      mergedReaderSettings.brightness = clampReaderBrightness(mergedReaderSettings.brightness);
      if (typeof mergedReaderSettings.keepScreenAwake !== 'boolean') {
        mergedReaderSettings.keepScreenAwake = DEFAULT_READER_SETTINGS.keepScreenAwake === true;
      }

      set({
        appTheme: savedAppTheme || 'light',
        accentColor: savedAccent || '#EEECF8',
        readerSettings: mergedReaderSettings,
        accessibility: { ...DEFAULT_ACCESSIBILITY, ...savedAccessibility },
        lastAuthorizedFolderUri: savedFolderUri || folderUris[0] || null,
        authorizedFolderUris: folderUris,
        scanAccessDismissed: !!savedScanAccessDismissed,
        hasCompletedWelcome: !!savedWelcome,
        isLoaded: true,
      });
      await ttsService.hydrateVoiceSelection();
    } catch (err) {
      logger.error(TAG, 'Error loading settings', err);
      set({ isLoaded: true });
    }
  },

  setAppTheme: async (appTheme: AppThemeOption) => {
    set({ appTheme });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('appTheme', appTheme);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist appTheme', err);
    }
  },

  setAccentColor: async (accentColor: string) => {
    set({ accentColor });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('accentColor', accentColor);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist accentColor', err);
    }
  },

  updateReaderSettings: async (partial: Partial<ReaderSettings>) => {
    const merged: ReaderSettings = { ...get().readerSettings, ...partial };
    merged.brightness = clampReaderBrightness(merged.brightness);
    set({ readerSettings: merged });

    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('readerSettings', merged);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist readerSettings', err);
    }
  },

  resetReaderSettings: async () => {
    set({ readerSettings: DEFAULT_READER_SETTINGS });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('readerSettings', DEFAULT_READER_SETTINGS);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist reset readerSettings', err);
    }
  },

  updateAccessibility: async (partial: Partial<AccessibilitySettings>) => {
    const updated = { ...get().accessibility, ...partial };
    set({ accessibility: updated });

    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('accessibility', updated);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist accessibility settings', err);
    }
  },

  setLastAuthorizedFolderUri: async (uri: string | null) => {
    set({ lastAuthorizedFolderUri: uri });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('lastAuthorizedFolderUri', uri);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist lastAuthorizedFolderUri', err);
    }
  },

  addAuthorizedFolderUri: async (uri: string) => {
    if (!uri) return;
    const existing = get().authorizedFolderUris;
    // A user can pick the same folder twice; the re-scan would then list every
    // book in it twice.
    const next = existing.includes(uri) ? existing : [...existing, uri];
    set({ authorizedFolderUris: next, lastAuthorizedFolderUri: uri });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('authorizedFolderUris', next);
      await repo.setPreference?.('lastAuthorizedFolderUri', uri);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist authorizedFolderUris', err);
    }
  },

  removeAuthorizedFolderUri: async (uri: string) => {
    const next = get().authorizedFolderUris.filter((candidate) => candidate !== uri);
    set({
      authorizedFolderUris: next,
      lastAuthorizedFolderUri: next[next.length - 1] ?? null,
    });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('authorizedFolderUris', next);
      await repo.setPreference?.('lastAuthorizedFolderUri', next[next.length - 1] ?? null);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist authorizedFolderUris', err);
    }
  },

  setScanAccessDismissed: async (dismissed: boolean) => {
    set({ scanAccessDismissed: dismissed });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('scanAccessDismissed', dismissed);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist scanAccessDismissed', err);
    }
  },

  setHasCompletedWelcome: async (hasCompletedWelcome: boolean) => {
    set({ hasCompletedWelcome });
    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('hasCompletedWelcome', hasCompletedWelcome);
    } catch (err) {
      logger.warn(TAG, 'Failed to persist hasCompletedWelcome', err);
    }
  },
}));
