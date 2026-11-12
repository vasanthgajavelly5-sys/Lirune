/**
 * Lirune Reader Mobile — Custom Font Management Service ("My Fonts")
 * Imports local .ttf and .otf font files, persists them in app storage,
 * and makes them available for reflowable reader styling.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { getDatabase } from '@/services/database/Database';
import { logger } from '@/utils/logger';

const TAG = 'FontService';
const FONTS_DIR = `${FileSystem.documentDirectory || ''}fonts/`;

export interface CustomFont {
  id: string;
  name: string;
  fontUri: string;
  dateAdded: number;
}

export class FontService {
  private static instance: FontService;
  private fonts: CustomFont[] = [];
  private initialized = false;

  private constructor() {}

  static getInstance(): FontService {
    if (!FontService.instance) {
      FontService.instance = new FontService();
    }
    return FontService.instance;
  }

  async ensureDirectory(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(FONTS_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(FONTS_DIR, { intermediates: true });
      }
    } catch (err) {
      logger.error(TAG, 'Error ensuring fonts directory', err);
    }
  }

  /**
   * Loads all custom fonts from the local SQLite database.
   */
  async getCustomFonts(): Promise<CustomFont[]> {
    if (this.initialized) return this.fonts;

    await this.ensureDirectory();
    const db = await getDatabase();
    if (!db) return [];

    try {
      const rows = await db.getAllAsync<{
        id: string;
        name: string;
        fontUri: string;
        dateAdded: number;
      }>('SELECT * FROM custom_fonts ORDER BY dateAdded DESC');

      this.fonts = rows.map((r) => ({
        id: r.id,
        name: r.name,
        fontUri: r.fontUri,
        dateAdded: r.dateAdded,
      }));
      this.initialized = true;
      return this.fonts;
    } catch (err) {
      logger.error(TAG, 'Error querying custom fonts', err);
      return [];
    }
  }

  /**
   * Prompts user to pick a .ttf or .otf file and copies it to local fonts storage.
   */
  async importFont(): Promise<CustomFont | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['font/ttf', 'font/otf', 'application/x-font-ttf', 'application/x-font-opentype', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const lowerName = asset.name.toLowerCase();
      if (!lowerName.endsWith('.ttf') && !lowerName.endsWith('.otf')) {
        throw new Error('Please select a valid .ttf or .otf font file.');
      }

      await this.ensureDirectory();

      const cleanName = asset.name.replace(/\.[^/.]+$/, '').trim();
      const ext = lowerName.endsWith('.otf') ? '.otf' : '.ttf';
      const fontId = `font_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const destPath = `${FONTS_DIR}${fontId}${ext}`;

      await FileSystem.copyAsync({
        from: asset.uri,
        to: destPath,
      });

      const customFont: CustomFont = {
        id: fontId,
        name: cleanName,
        fontUri: destPath,
        dateAdded: Date.now(),
      };

      const db = await getDatabase();
      if (db) {
        await db.runAsync(
          'INSERT OR REPLACE INTO custom_fonts (id, name, fontUri, dateAdded) VALUES (?, ?, ?, ?)',
          [customFont.id, customFont.name, customFont.fontUri, customFont.dateAdded]
        );
      }

      this.fonts = [customFont, ...this.fonts];
      logger.info(TAG, `Successfully imported font "${cleanName}"`);
      return customFont;
    } catch (err) {
      logger.error(TAG, 'Failed importing custom font', err);
      throw err;
    }
  }

  /**
   * Removes a custom font and deletes its file.
   */
  async removeFont(id: string): Promise<void> {
    const font = this.fonts.find((f) => f.id === id);
    if (!font) return;

    try {
      const info = await FileSystem.getInfoAsync(font.fontUri);
      if (info.exists) {
        await FileSystem.deleteAsync(font.fontUri, { idempotent: true });
      }

      const db = await getDatabase();
      if (db) {
        await db.runAsync('DELETE FROM custom_fonts WHERE id = ?', [id]);
      }

      this.fonts = this.fonts.filter((f) => f.id !== id);
    } catch (err) {
      logger.error(TAG, `Error removing font ${id}`, err);
    }
  }
}

export const fontService = FontService.getInstance();
