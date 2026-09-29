/**
 * Lirune Reader Mobile — Settings State Store (Zustand)
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

interface SettingsState {
  appTheme: AppThemeOption;
  accentColor: string;
  readerSettings: ReaderSettings;
  hasCompletedWelcome: boolean;
  isLoaded: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  setAppTheme: (theme: AppThemeOption) => Promise<void>;
  setAccentColor: (color: string) => Promise<void>;
  updateReaderSettings: (partial: Partial<ReaderSettings>) => Promise<void>;
  resetReaderSettings: () => Promise<void>;
  setHasCompletedWelcome: (completed: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appTheme: 'dark',
  accentColor: '#EEECF8',
  readerSettings: DEFAULT_READER_SETTINGS,
  hasCompletedWelcome: false,
  isLoaded: false,

  loadSettings: async () => {
    const repo = getBookRepository() as any;
    try {
      const [savedAppTheme, savedAccent, savedReaderSettings, savedWelcome] = await Promise.all([
        repo.getPreference?.('appTheme', 'dark'),
        repo.getPreference?.('accentColor', '#EEECF8'),
        repo.getPreference?.('readerSettings', DEFAULT_READER_SETTINGS),
        repo.getPreference?.('hasCompletedWelcome', false),
      ]);

      set({
        appTheme: savedAppTheme || 'dark',
        accentColor: savedAccent || '#EEECF8',
        readerSettings: { ...DEFAULT_READER_SETTINGS, ...savedReaderSettings },
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
