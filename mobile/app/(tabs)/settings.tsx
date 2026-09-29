/**
 * Lirune Reader Mobile — Settings Screen
 * Organized into: General, Appearance, Reading, Library, Accessibility, Storage & Data, and About.
 * All alerts themed with LiruneDialog / LiruneToast.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useSettingsStore, AppThemeOption } from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useThemeContext } from '@/theme/ThemeContext';
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
    setAppTheme,
    updateReaderSettings,
    resetReaderSettings,
  } = useSettingsStore();

  const { viewMode, setViewMode, sortCriterion, loadLibrary } =
    useLibraryStore();

  const [storageStats, setStorageStats] = useState<{ totalBytes: number; bookCount: number }>({
    totalBytes: 0,
    bookCount: 0,
  });

  // Modal / Dialog States
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

  const handleThemeChange = async (theme: AppThemeOption) => {
    await setAppTheme(theme);
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
      await repo.clearAllData();
      await loadLibrary();
      const stats = await fileStorage.getStorageUsage();
      setStorageStats(stats);
      setToastMessage('Library data has been cleared.');
    } catch {
      setToastMessage('Could not clear library data.');
    }
  };

  const openSupportLink = () => {
    Linking.openURL('https://buymeacoffee.com/vasanthgajavelly').catch(() => {
      setToastMessage('Could not open support link.');
    });
  };

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
                  onPress={() => handleThemeChange(theme)}
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

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Lirune Signature Accent</Text>
            <View style={styles.accentBadge}>
              <View style={[styles.accentDot, { backgroundColor: '#EEECF8' }]} />
              <Text style={[styles.accentCode, { color: colors.textSecondary }]}>#EEECF8</Text>
            </View>
          </View>
        </View>

        {/* 3. READING */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Reading</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          {/* Default Flow Mode: Page vs Scroll */}
          <View style={styles.infoRow}>
            <View>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Default Reading Mode</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                {readerSettings.flow === 'paginated' ? 'Discrete horizontal pages' : 'Continuous vertical scroll'}
              </Text>
            </View>
            <View style={styles.segmentedRow}>
              {(['paginated', 'scrolled'] as const).map((flow) => {
                const isSelected = readerSettings.flow === flow;
                return (
                  <TouchableOpacity
                    key={flow}
                    style={[
                      styles.segmentOption,
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

          {/* Paragraph Spacing */}
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Paragraph Spacing</Text>
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

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Typeface</Text>
            <Text style={[styles.rowValue, { color: colors.accent, fontWeight: '600' }]}>
              {readerSettings.fontFamily}
            </Text>
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

        {/* 4. LIBRARY */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Library</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default View</Text>
            <View style={styles.segmentedRow}>
              {(['grid', 'list'] as const).map((mode) => {
                const isSelected = viewMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.segmentOption,
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

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Sort</Text>
            <Text style={[styles.rowValue, { color: colors.accent, fontWeight: '600' }]}>
              {sortCriterion.charAt(0).toUpperCase() + sortCriterion.slice(1)}
            </Text>
          </View>
        </View>

        {/* 5. ACCESSIBILITY */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Accessibility</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Screen Reader Support</Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                Semantic labels and touch targets tuned for TalkBack
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
          </View>
        </View>

        {/* 6. STORAGE & DATA */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Storage & Data</Text>
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

        {/* 7. ABOUT & SUPPORT */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>About & Support</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          {/* Buy Me a Coffee Support Action */}
          <TouchableOpacity
            style={[styles.supportBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}
            onPress={openSupportLink}
            activeOpacity={0.8}
          >
            <View style={styles.supportLeft}>
              <Ionicons name="cafe" size={20} color="#FFDD00" />
              <View>
                <Text style={[styles.supportTitle, { color: colors.text }]}>Support Lirune Reader</Text>
                <Text style={[styles.supportSubtitle, { color: colors.textSecondary }]}>
                  Buy Me a Coffee to support indie development
                </Text>
              </View>
            </View>
            <Ionicons name="open-outline" size={16} color={colors.accent} />
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Application</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>Lirune Reader</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Version</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>4.0.4 (Android)</Text>
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

      {/* Themed Clear Data Dialog */}
      <LiruneDialog
        visible={showClearDialog}
        title="Clear All Library Data?"
        message="This will delete all imported books, collections, bookmarks, and reading progress from this device. This action cannot be undone."
        confirmText="Clear Everything"
        cancelText="Cancel"
        isDestructive
        onConfirm={handleClearDataConfirmed}
        onCancel={() => setShowClearDialog(false)}
      />

      {/* Generic Themed Dialog for Export */}
      <LiruneDialog
        visible={dialogInfo.visible}
        title={dialogInfo.title}
        message={dialogInfo.message}
        confirmText={dialogInfo.confirmText || 'OK'}
        onConfirm={() => setDialogInfo((prev) => ({ ...prev, visible: false }))}
      />

      {/* Reopenable Welcome Guide */}
      <WelcomeGuideModal
        visible={showWelcomeGuide}
        onClose={() => setShowWelcomeGuide(false)}
      />

      {/* Toast Notification */}
      <LiruneToast
        visible={!!toastMessage}
        message={toastMessage || ''}
        onDismiss={() => setToastMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(128, 128, 128, 0.12)',
    borderRadius: 10,
    padding: 3,
    marginTop: 4,
  },
  segmentOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentOptionText: {
    fontSize: 12,
  },
  accentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accentDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#AAAAAA',
  },
  accentCode: {
    fontSize: 13,
  },
  stepperMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniValue: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'center',
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  supportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  supportTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  supportSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  privacyBox: {
    marginTop: 4,
  },
  privacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  privacyTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  privacyDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
});