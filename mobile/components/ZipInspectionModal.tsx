/**
 * Lirune Reader Mobile — ZIP Inspection Modal
 * Shows detected supported books inside a ZIP container and lets users select what to import.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { ZipBookEntry } from '@/services/import/ZipInspectionService';

interface ZipInspectionModalProps {
  visible: boolean;
  zipName: string;
  entries: ZipBookEntry[];
  isExtracting: boolean;
  extractProgress?: { current: number; total: number; fileName: string } | null;
  onClose: () => void;
  onImportSelected: (selected: ZipBookEntry[]) => void;
}

export function ZipInspectionModal({
  visible,
  zipName,
  entries: initialEntries,
  isExtracting,
  extractProgress,
  onClose,
  onImportSelected,
}: ZipInspectionModalProps) {
  const { colors } = useThemeContext();

  const [entries, setEntries] = useState<ZipBookEntry[]>(initialEntries);

  // Sync state when props change
  React.useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  const toggleSelect = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, selected: !e.selected } : e))
    );
  };

  const handleToggleAll = () => {
    const allSelected = entries.every((e) => e.selected);
    setEntries((prev) => prev.map((e) => ({ ...e, selected: !allSelected })));
  };

  const selectedCount = entries.filter((e) => e.selected).length;

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView
          style={[
            styles.modalContainer,
            { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconOrb, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="archive-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {zipName}
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  {entries.length} supported book{entries.length === 1 ? '' : 's'} inside archive
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isExtracting}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceElevated }]}
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Subheader / Batch select */}
          <View style={[styles.batchRow, { borderBottomColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={styles.toggleAllBtn}
              onPress={handleToggleAll}
              disabled={isExtracting}
            >
              <Ionicons
                name={
                  entries.length > 0 && entries.every((e) => e.selected)
                    ? 'checkbox'
                    : 'square-outline'
                }
                size={18}
                color={colors.accent}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.toggleAllText, { color: colors.text }]}>
                {entries.every((e) => e.selected) ? 'Deselect All' : 'Select All Supported'}
              </Text>
            </TouchableOpacity>
            <Text style={[styles.selectedCountText, { color: colors.textMuted }]}>
              {selectedCount} of {entries.length} selected
            </Text>
          </View>

          {/* Progress Banner if extracting */}
          {isExtracting && extractProgress && (
            <View style={[styles.progressBanner, { backgroundColor: colors.accentSoft }]}>
              <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.progressTitle, { color: colors.accent }]}>
                  Extracting &amp; Importing ({extractProgress.current} of {extractProgress.total})
                </Text>
                <Text style={[styles.progressSub, { color: colors.text }]} numberOfLines={1}>
                  {extractProgress.fileName}
                </Text>
              </View>
            </View>
          )}

          {/* Entry list */}
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.entryCard,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: item.selected ? colors.accent : colors.borderSubtle,
                    borderWidth: item.selected ? 1.5 : 1,
                  },
                ]}
                onPress={() => toggleSelect(item.id)}
                disabled={isExtracting}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.selected ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={item.selected ? colors.accent : colors.textMuted}
                  style={styles.checkboxIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryName, { color: colors.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.entryMeta}>
                    <View style={[styles.formatBadge, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.formatBadgeText, { color: colors.accent }]}>
                        {item.format.toUpperCase()}
                      </Text>
                    </View>
                    {item.size > 0 && (
                      <Text style={[styles.entrySize, { color: colors.textMuted }]}>
                        {formatBytes(item.size)}
                      </Text>
                    )}
                    <Text style={[styles.internalPath, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.internalPath}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="alert-circle-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  No supported book files found inside this ZIP.
                </Text>
              </View>
            }
          />

          {/* Footer Action */}
          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={[
                styles.importBtn,
                {
                  backgroundColor: selectedCount > 0 && !isExtracting ? colors.accent : colors.surfaceElevated,
                  opacity: selectedCount > 0 && !isExtracting ? 1 : 0.6,
                },
              ]}
              onPress={() => onImportSelected(entries.filter((e) => e.selected))}
              disabled={selectedCount === 0 || isExtracting}
              activeOpacity={0.8}
            >
              {isExtracting ? (
                <ActivityIndicator size="small" color={colors.accentForeground} style={{ marginRight: 8 }} />
              ) : (
                <Ionicons name="download-outline" size={18} color={selectedCount > 0 ? colors.accentForeground : colors.textMuted} style={{ marginRight: 6 }} />
              )}
              <Text
                style={[
                  styles.importBtnText,
                  { color: selectedCount > 0 ? colors.accentForeground : colors.textMuted },
                ]}
              >
                {isExtracting
                  ? 'Importing Books...'
                  : `Import Selected (${selectedCount})`}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '88%',
    minHeight: '50%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  iconOrb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectedCountText: {
    fontSize: 12,
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressSub: {
    fontSize: 11,
    marginTop: 1,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  checkboxIcon: {
    marginTop: 2,
  },
  entryName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginBottom: 4,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  entrySize: {
    fontSize: 11,
  },
  internalPath: {
    fontSize: 11,
    flex: 1,
  },
  emptyContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
  },
  importBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
