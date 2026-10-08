/**
 * Lirune Reader Mobile — Settings Screen
 * Organized into: General, Appearance, Reading Defaults, Accessibility, Library, Storage & Data, About & Support.
 * Single source of truth backed by SQLite preferences & useSettingsStore.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import {
  useSettingsStore,
  AppThemeOption,
} from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { READER_THEMES } from '@/theme/Colors';
import { READER_FONTS, getNativeFontFamily } from '@/theme/Typography';
import { ReaderThemeName } from '@/models/Book';
import { fileStorage } from '@/services/storage/FileStorage';
import { getBookRepository } from '@/repositories';
import { logger } from '@/utils/logger';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { LiruneDialog } from '@/components/LiruneDialog';
import { LiruneToast } from '@/components/LiruneToast';
import { WelcomeGuideModal } from '@/components/WelcomeGuideModal';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  const {
    appTheme,
    readerSettings,
    accessibility,
    setAppTheme,
    updateReaderSettings,
    resetReaderSettings,
    updateAccessibility,
  } = useSettingsStore();

  const { viewMode, setViewMode, sortCriterion, setSortCriterion, loadLibrary } =
    useLibraryStore();

  const [storageStats, setStorageStats] = useState<{ totalBytes: number; bookCount: number }>({
    totalBytes: 0,
    bookCount: 0,
  });

  // Modal & Dialog States
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);
  const [dialogInfo, setDialogInfo] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStorage() {
      const stats = await fileStorage.getStorageUsage();
      setStorageStats(stats);
    }
    fetchStorage();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleExportData = async () => {
    try {
      const repo = getBookRepository();
      const exportedJson = await repo.exportData();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const path = await fileStorage.writeTextFile(
        `lirune-library-${stamp}.json`,
        exportedJson
      );
      const size = await fileStorage.getFileSize(path);
      setDialogInfo({
        visible: true,
        title: 'Library Exported',
        message: `Saved ${formatBytes(size)} of library data to:\n\n${path}`,
        confirmText: 'Done',
      });
    } catch {
      setToastMessage('Failed to export library data.');
    }
  };

  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        base64: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const json = await fileStorage.readAsString(result.assets[0].uri);
      const repo = getBookRepository();
      await repo.importData?.(json);
      await loadLibrary();
      setToastMessage('Library data restored successfully.');
    } catch (err) {
      logger.error('SettingsScreen', 'Import failed', err);
      setToastMessage('That file could not be restored as library data.');
    }
  };

  const handleClearDataConfirmed = async () => {
    setShowClearDialog(false);
    try {
      const repo = getBookRepository();
      const books = useLibraryStore.getState().books;
      for (const book of books) {
        await fileStorage.deleteBookFiles(book.filePath || book.uri || '', book.coverUrl);
      }
      await repo.clearAllData();
      useLibraryStore.setState({ books: [], collections: [], hasLoaded: true });
      const stats = await fileStorage.getStorageUsage();
      setStorageStats(stats);
      setToastMessage('Library data has been cleared.');
    } catch {
      setToastMessage('Could not clear library data.');
    }
  };

  const alignments: ('left' | 'center' | 'right' | 'justify')[] = [
    'left',
    'center',
    'right',
    'justify',
  ];

  const marginOptions = [
    { label: 'Compact', value: 12 },
    { label: 'Standard', value: 20 },
    { label: 'Wide', value: 28 },
  ];

  const sortOptions = [
    { id: 'recent', label: 'Recent' },
    { id: 'title', label: 'Title' },
    { id: 'author', label: 'Author' },
    { id: 'added', label: 'Date Added' },
    { id: 'progress', label: 'Progress' },
  ] as const;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top Header with Side Nav Button */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <LiruneNavButton />
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. GENERAL */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>General</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setShowWelcomeGuide(true)}
            activeOpacity={0.7}
          >
            <View style={styles.actionRowLeft}>
              <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
              <View>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Welcome to Lirune Guide</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                  Revisit key features, formats, and reading modes
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 2. APPEARANCE */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>App Theme</Text>
          <View style={styles.segmentedRow}>
            {(['dark', 'light', 'system'] as AppThemeOption[]).map((theme) => {
              const isSelected = appTheme === theme;
              return (
                <TouchableOpacity
                  key={theme}
                  style={[
                    styles.segmentOption,
                    isSelected && { backgroundColor: colors.accent },
                  ]}
                  onPress={() => setAppTheme(theme)}
                >
                  <Text
                    style={[
                      styles.segmentOptionText,
                      {
                        color: isSelected ? colors.accentForeground : colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {theme.charAt(0).toUpperCase() + theme.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 3. READING DEFAULTS */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Reader Defaults</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          {/* Default Flow Mode */}
          <View style={styles.infoRow}>
            <View>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Reading Flow</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                {readerSettings.flow === 'paginated' ? 'Discrete horizontal pages' : 'Continuous vertical scroll'}
              </Text>
            </View>
            <View style={styles.segmentedRowSmall}>
              {(['paginated', 'scrolled'] as const).map((flow) => {
                const isSelected = readerSettings.flow === flow;
                return (
                  <TouchableOpacity
                    key={flow}
                    style={[
                      styles.segmentOptionSmall,
                      isSelected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => updateReaderSettings({ flow })}
                  >
                    <Text
                      style={[
                        styles.segmentOptionText,
                        {
                          color: isSelected ? colors.accentForeground : colors.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {flow === 'paginated' ? 'Page' : 'Scroll'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Default Typeface Selection */}
          <Text style={[styles.rowLabel, { color: colors.text, marginBottom: 8 }]}>Default Typeface</Text>
          <View style={styles.fontGrid}>
            {READER_FONTS.map((font) => {
              const isSelected =
                readerSettings.fontFamily === font.name ||
                readerSettings.fontFamily.toLowerCase() === font.id.toLowerCase() ||
                (font.id === 'serif' && readerSettings.fontFamily.toLowerCase() === 'serif') ||
                (font.id === 'sans' && readerSettings.fontFamily.toLowerCase() === 'sans-serif') ||
                (font.id === 'mono' && readerSettings.fontFamily.toLowerCase() === 'monospace');

              const nativeFamily = getNativeFontFamily(font.name);

              return (
                <TouchableOpacity
                  key={font.id}
                  style={[
                    styles.fontChip,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(238, 236, 248, 0.14)'
                          : 'rgba(76, 70, 102, 0.1)'
                        : colors.surfaceElevated,
                      borderColor: isSelected ? colors.accent : colors.borderSubtle,
                      borderWidth: isSelected ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => updateReaderSettings({ fontFamily: font.name })}
                >
                  <Text
                    style={[
                      styles.fontChipText,
                      {
                        color: isSelected ? colors.accent : colors.text,
                        fontFamily: nativeFamily,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {font.name}
                  </Text>
                  <Text style={[styles.fontChipCat, { color: colors.textMuted }]}>
                    {font.preview}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Default Theme Palette */}
          <Text style={[styles.rowLabel, { color: colors.text, marginBottom: 8 }]}>Default Theme Palette</Text>
          <View style={styles.themePaletteRow}>
            {Object.values(READER_THEMES).slice(0, 5).map((theme) => {
              const isSelected = readerSettings.theme === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.miniSwatch,
                    {
                      backgroundColor: theme.bg,
                      borderColor: isSelected ? colors.accent : colors.borderSubtle,
                      borderWidth: isSelected ? 2.5 : 1,
                    },
                  ]}
                  onPress={() => updateReaderSettings({ theme: theme.id as ReaderThemeName })}
                >
                  <Text style={[styles.miniSwatchText, { color: theme.text }]}>Aa</Text>
                  <Text style={[styles.miniSwatchLabel, { color: theme.muted }]} numberOfLines={1}>
                    {theme.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Font Size */}
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Font Size</Text>
            <View style={styles.stepperMini}>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    fontSize: Math.max(12, readerSettings.fontSize - 2),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.miniValue, { color: colors.text }]}>
                {readerSettings.fontSize} px
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    fontSize: Math.min(36, readerSettings.fontSize + 2),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Line Spacing */}
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Line Spacing</Text>
            <View style={styles.stepperMini}>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    lineHeight: Number(Math.max(1.2, readerSettings.lineHeight - 0.2).toFixed(1)),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.miniValue, { color: colors.text }]}>
                {readerSettings.lineHeight}x
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    lineHeight: Number(Math.min(2.4, readerSettings.lineHeight + 0.2).toFixed(1)),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Paragraph Spacing */}
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Paragraph Gap</Text>
            <View style={styles.stepperMini}>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    paragraphSpacing: Math.max(0.5, Math.round((readerSettings.paragraphSpacing - 0.25) * 100) / 100),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.miniValue, { color: colors.text }]}>
                {readerSettings.paragraphSpacing} em
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    paragraphSpacing: Math.min(2.5, Math.round((readerSettings.paragraphSpacing + 0.25) * 100) / 100),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Margins */}
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Margins</Text>
            <View style={styles.segmentedRowSmall}>
              {marginOptions.map((opt) => {
                const isSelected = readerSettings.margin === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.segmentOptionSmall,
                      isSelected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => updateReaderSettings({ margin: opt.value })}
                  >
                    <Text
                      style={[
                        styles.segmentOptionText,
                        {
                          color: isSelected ? colors.accentForeground : colors.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Alignment */}
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Alignment</Text>
            <View style={styles.segmentedRowSmall}>
              {alignments.map((align) => {
                const isSelected = readerSettings.alignment === align;
                let iconName: any = 'reorder-three-outline';
                if (align === 'center') iconName = 'reorder-two-outline';
                if (align === 'justify') iconName = 'menu-outline';

                return (
                  <TouchableOpacity
                    key={align}
                    style={[
                      styles.segmentOptionSmall,
                      isSelected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => updateReaderSettings({ alignment: align })}
                  >
                    <Ionicons
                      name={iconName}
                      size={16}
                      color={isSelected ? colors.accentForeground : colors.textSecondary}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              resetReaderSettings();
              setToastMessage('Reader appearance reset to defaults');
            }}
          >
            <Text style={{ color: colors.textSecondary }}>Reset Reader Appearance Defaults</Text>
            <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* 4. ACCESSIBILITY */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Accessibility</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          {/* High Contrast */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>High Contrast Mode</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Increases contrast for reading palettes, borders, and controls
              </Text>
            </View>
            <Switch
              value={accessibility.highContrast}
              onValueChange={(val) => updateAccessibility({ highContrast: val })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={accessibility.highContrast ? colors.accentForeground : '#FFF'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Large Touch Targets */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Large Touch Targets</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Expands button sizes and hit areas for easier navigation
              </Text>
            </View>
            <Switch
              value={accessibility.largeTouchTargets}
              onValueChange={(val) => updateAccessibility({ largeTouchTargets: val })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={accessibility.largeTouchTargets ? colors.accentForeground : '#FFF'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Reduced Motion */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Reduced Motion</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Minimizes slide and drawer animations throughout the app
              </Text>
            </View>
            <Switch
              value={accessibility.reduceMotion}
              onValueChange={(val) => updateAccessibility({ reduceMotion: val })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={accessibility.reduceMotion ? colors.accentForeground : '#FFF'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Screen Reader Optimization */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Screen Reader / TalkBack Optimization</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Enhanced descriptive labels and reading announcements for TalkBack
              </Text>
            </View>
            <Switch
              value={accessibility.screenReaderOptimized}
              onValueChange={(val) => updateAccessibility({ screenReaderOptimized: val })}
              trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
              thumbColor={accessibility.screenReaderOptimized ? colors.accentForeground : '#FFF'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Reader Font Scaling */}
          <View style={styles.infoRow}>
            <View>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Reader Text Scaling</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Proportional text scale multiplier ({Math.round(accessibility.readerFontScaling * 100)}%)
              </Text>
            </View>
            <View style={styles.stepperMini}>
              <TouchableOpacity
                onPress={() =>
                  updateAccessibility({
                    readerFontScaling: Math.max(1.0, Math.round((accessibility.readerFontScaling - 0.1) * 10) / 10),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="remove" size={16} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.miniValue, { color: colors.text }]}>
                {Math.round(accessibility.readerFontScaling * 100)}%
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateAccessibility({
                    readerFontScaling: Math.min(1.5, Math.round((accessibility.readerFontScaling + 0.1) * 10) / 10),
                  })
                }
                style={[styles.miniBtn, { backgroundColor: colors.surfaceElevated }]}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 5. LIBRARY */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Library</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default View</Text>
            <View style={styles.segmentedRowSmall}>
              {(['grid', 'list'] as const).map((mode) => {
                const isSelected = viewMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.segmentOptionSmall,
                      isSelected && { backgroundColor: colors.accent },
                    ]}
                    onPress={() => setViewMode(mode)}
                  >
                    <Text
                      style={[
                        styles.segmentOptionText,
                        {
                          color: isSelected ? colors.accentForeground : colors.textSecondary,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Sort Selection */}
          <Text style={[styles.rowLabel, { color: colors.text, marginBottom: 8 }]}>Default Sort</Text>
          <View style={styles.sortRow}>
            {sortOptions.map((opt) => {
              const isSelected = sortCriterion === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.sortChip,
                    {
                      backgroundColor: isSelected ? colors.accent : colors.surfaceElevated,
                      borderColor: isSelected ? colors.accent : colors.borderSubtle,
                    },
                  ]}
                  onPress={() => setSortCriterion(opt.id as any)}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      {
                        color: isSelected ? colors.accentForeground : colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 6. STORAGE & DATA */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Storage &amp; Data</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Books in Storage</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {storageStats.bookCount} books
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Disk Space Used</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {formatBytes(storageStats.totalBytes)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <TouchableOpacity style={styles.actionRow} onPress={handleExportData}>
            <Text style={{ color: colors.text }}>Backup / Export Library Data</Text>
            <Ionicons name="download-outline" size={18} color={colors.accent} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <TouchableOpacity style={styles.actionRow} onPress={handleImportData}>
            <Text style={{ color: colors.text }}>Restore Library From Backup</Text>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => setShowClearDialog(true)}
          >
            <Text style={{ color: colors.error }}>Clear Local Library</Text>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        {/* 7. ABOUT */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>About</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Application</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>Lirune Reader</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Version</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {Constants.expoConfig?.version ?? '4.9.0'} (Android)
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => router.push('/about')}
          >
            <Text style={{ color: colors.text }}>About &amp; Acknowledgements</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.privacyBox}>
            <View style={styles.privacyHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
              <Text style={[styles.privacyTitle, { color: colors.text }]}>
                100% Private &amp; Offline
              </Text>
            </View>
            <Text style={[styles.privacyDesc, { color: colors.textSecondary }]}>
              Lirune Reader does not collect telemetry, require accounts, or send book contents to the cloud. All reading progress, annotations, and files remain on your device.
            </Text>
          </View>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Clear Library Dialog */}
      <LiruneDialog
        visible={showClearDialog}
        title="Clear Local Library?"
        message="This will remove all imported books, managed files, reading progress, and annotations from this device."
        confirmText="Clear Library"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={handleClearDataConfirmed}
        onCancel={() => setShowClearDialog(false)}
      />

      {/* Info Dialog */}
      <LiruneDialog
        visible={dialogInfo.visible}
        title={dialogInfo.title}
        message={dialogInfo.message}
        confirmText={dialogInfo.confirmText || 'OK'}
        onConfirm={() => setDialogInfo((d) => ({ ...d, visible: false }))}
      />

      {/* Welcome Guide Modal */}
      <WelcomeGuideModal
        visible={showWelcomeGuide}
        onClose={() => setShowWelcomeGuide(false)}
      />

      {/* Toast */}
      {toastMessage && (
        <LiruneToast
          visible={!!toastMessage}
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  rowValue: {
    fontSize: 13,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    backgroundColor: 'rgba(0,0,0,0.04)',
    marginTop: 4,
  },
  segmentOption: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentedRowSmall: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  segmentOptionSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptionText: {
    fontSize: 12,
  },
  fontGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  fontChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fontChipText: {
    fontSize: 12,
  },
  fontChipCat: {
    fontSize: 9,
    textTransform: 'uppercase',
  },
  themePaletteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniSwatch: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  miniSwatchText: {
    fontSize: 14,
    fontWeight: '700',
  },
  miniSwatchLabel: {
    fontSize: 8,
    marginTop: 1,
  },
  stepperMini: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    height: 32,
    paddingHorizontal: 2,
  },
  miniBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniValue: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 46,
    textAlign: 'center',
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  sortChipText: {
    fontSize: 11,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  supportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  supportTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  supportSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  privacyBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  privacyDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
});