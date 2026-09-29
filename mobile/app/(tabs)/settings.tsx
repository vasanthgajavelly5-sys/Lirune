/**
 * Lirune Reader Mobile — Settings Screen
 * General, Appearance, Reading, Library, Storage & Data, and About.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettingsStore, AppThemeOption } from '@/state/settingsStore';
import { useLibraryStore } from '@/state/libraryStore';
import { useThemeContext } from '@/theme/ThemeContext';
import { fileStorage } from '@/services/storage/FileStorage';
import { getBookRepository } from '@/repositories';

export default function SettingsScreen() {
  const { colors, setScheme } = useThemeContext();
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
    if (theme === 'dark' || theme === 'light') {
      setScheme(theme);
    }
  };

  const handleExportData = async () => {
    try {
      const repo = getBookRepository();
      const exportedJson = await repo.exportData();
      Alert.alert(
        'Export Data',
        `Successfully generated export payload (${exportedJson.length} characters). Books and collections are safely saved locally on this device.`,
        [{ text: 'OK' }]
      );
    } catch {
      Alert.alert('Error', 'Failed to export library data.');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all books, collections, bookmarks, and notes from this device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            const repo = getBookRepository();
            await repo.clearAllData();
            await loadLibrary();
            const stats = await fileStorage.getStorageUsage();
            setStorageStats(stats);
            Alert.alert('Cleared', 'Library data has been reset.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* APPEARANCE */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          Appearance
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>App Theme</Text>
          <View style={styles.segmentedRow}>
            {(['dark', 'light'] as AppThemeOption[]).map((theme) => {
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
                        fontWeight: isSelected ? '600' : '500',
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
            <Text style={[styles.rowLabel, { color: colors.text }]}>Brand Accent</Text>
            <View style={styles.accentBadge}>
              <View style={[styles.accentDot, { backgroundColor: '#EEECF8' }]} />
              <Text style={[styles.accentCode, { color: colors.textSecondary }]}>#EEECF8</Text>
            </View>
          </View>
        </View>

        {/* READING PREFERENCES */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          Reading
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Font Size</Text>
            <View style={styles.stepperMini}>
              <TouchableOpacity
                onPress={() =>
                  updateReaderSettings({
                    fontSize: Math.max(12, readerSettings.fontSize - 2),
                  })
                }
                style={styles.miniBtn}
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
                style={styles.miniBtn}
              >
                <Ionicons name="add" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Default Typeface</Text>
            <Text style={[styles.rowValue, { color: colors.accent }]}>
              {readerSettings.fontFamily}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <TouchableOpacity style={styles.actionRow} onPress={resetReaderSettings}>
            <Text style={{ color: colors.textSecondary }}>Reset Reader Appearance Defaults</Text>
            <Ionicons name="refresh-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* LIBRARY PREFERENCES */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          Library
        </Text>
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
                          fontWeight: isSelected ? '600' : '500',
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
            <Text style={[styles.rowValue, { color: colors.accent }]}>
              {sortCriterion.charAt(0).toUpperCase() + sortCriterion.slice(1)}
            </Text>
          </View>
        </View>

        {/* STORAGE & DATA */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          Storage & Data
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Books in Storage</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
              {storageStats.bookCount} items
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

          <TouchableOpacity style={styles.actionRow} onPress={handleClearData}>
            <Text style={{ color: colors.error }}>Clear Local Library</Text>
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>

        {/* ABOUT & PRIVACY */}
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>
          About
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
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

          <View style={styles.privacyBox}>
            <View style={styles.privacyHeader}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
              <Text style={[styles.privacyTitle, { color: colors.text }]}>
                100% Private & Offline
              </Text>
            </View>
            <Text style={[styles.privacyDesc, { color: colors.textSecondary }]}>
              Lirune Reader does not collect telemetry, require accounts, or send book contents to the cloud. All reading progress, annotations, and files remain on your device.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
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
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
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
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    borderRadius: 8,
    padding: 2,
  },
  segmentOption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
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
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniValue: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 44,
    textAlign: 'center',
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