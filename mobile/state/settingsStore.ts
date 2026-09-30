/**
 * Lirune Reader Mobile — Settings State Store (Zustand)
 * Single source of truth for: App Theme, Accent, Reader Defaults, Accessibility, and Storage SAF authorization.
 */

import { create } from 'zustand';
import {
  ReaderSettings,
  DEFAULT_READER_SETTINGS,
} from '@/models/Book';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';

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
  setHasCompletedWelcome: (completed: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appTheme: 'light',
  accentColor: '#EEECF8',
  readerSettings: DEFAULT_READER_SETTINGS,
  accessibility: DEFAULT_ACCESSIBILITY,
  lastAuthorizedFolderUri: null,
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
        savedWelcome,
      ] = await Promise.all([
        repo.getPreference?.('appTheme', 'light'),
        repo.getPreference?.('accentColor', '#EEECF8'),
        repo.getPreference?.('readerSettings', DEFAULT_READER_SETTINGS),
        repo.getPreference?.('accessibility', DEFAULT_ACCESSIBILITY),
        repo.getPreference?.('lastAuthorizedFolderUri', null),
        repo.getPreference?.('hasCompletedWelcome', false),
      ]);

      set({
        appTheme: savedAppTheme || 'light',
        accentColor: savedAccent || '#EEECF8',
        readerSettings: { ...DEFAULT_READER_SETTINGS, ...savedReaderSettings },
        accessibility: { ...DEFAULT_ACCESSIBILITY, ...savedAccessibility },
        lastAuthorizedFolderUri: savedFolderUri || null,
        hasCompletedWelcome: !!savedWelcome,
        isLoaded: true,
      });
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
    const updated = { ...get().readerSettings, ...partial };
    set({ readerSettings: updated });

    const repo = getBookRepository() as any;
    try {
      await repo.setPreference?.('readerSettings', updated);
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
