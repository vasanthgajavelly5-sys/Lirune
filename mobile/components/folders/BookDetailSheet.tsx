/**
 * Lirune Reader Mobile — Book Detail Bottom Sheet
 * Displays metadata preview, library status, Open and Import actions on file selection.
 */

import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { NativeDirEntry } from '@/services/storage/NativeStorageBridge';

interface BookDetailSheetProps {
  visible: boolean;
  item: NativeDirEntry | null;
  isInLibrary: boolean;
  isDrm?: boolean;
  isContainer?: boolean;
  onClose: () => void;
  onOpen: () => void;
  onImport: () => void;
  onBrowseArchive?: () => void;
}

export function BookDetailSheet({
  visible,
  item,
  isInLibrary,
  isDrm,
  isContainer,
  onClose,
  onOpen,
  onImport,
  onBrowseArchive,
}: BookDetailSheetProps) {
  const { colors } = useThemeContext();

  if (!item) return null;

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
  };

  const formatDate = (ms: number) => {
    if (ms <= 0) return 'Unknown date';
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name="document-text-outline" size={32} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {item.name}
              </Text>
              <View style={styles.metaRow}>
                <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
                  <Text style={[styles.badgeText, { color: colors.accent }]}>
                    {(item.format || 'doc').toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.sizeText, { color: colors.textSecondary }]}>
                  {formatSize(item.size)} • {formatDate(item.mtime)}
                </Text>
              </View>
            </View>
          </View>

          {/* Status Chip */}
          <View style={styles.statusRow}>
            {isInLibrary ? (
              <View style={[styles.statusChip, { backgroundColor: colors.success + '22' }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[styles.statusChipText, { color: colors.success }]}>In Library</Text>
              </View>
            ) : isDrm ? (
              <View style={[styles.statusChip, { backgroundColor: colors.error + '22' }]}>
                <Ionicons name="lock-closed" size={14} color={colors.error} />
                <Text style={[styles.statusChipText, { color: colors.error }]}>DRM Protected</Text>
              </View>
            ) : (
              <View style={[styles.statusChip, { backgroundColor: colors.borderSubtle }]}>
                <Ionicons name="sparkles" size={14} color={colors.textSecondary} />
                <Text style={[styles.statusChipText, { color: colors.textSecondary }]}>Not in Library</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            {isContainer && onBrowseArchive ? (
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: colors.accent, flex: 1 }]}
                onPress={() => {
                  onClose();
                  onBrowseArchive();
                }}
                accessibilityRole="button"
                accessibilityLabel="Browse inside archive"
              >
                <Ionicons name="folder-open-outline" size={18} color={colors.accentForeground} />
                <Text style={[styles.btnText, { color: colors.accentForeground }]}>Browse Inside Archive</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.secondaryBtn, { borderColor: colors.borderSubtle }]}
                  onPress={() => {
                    onClose();
                    onImport();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Import book"
                >
                  <Ionicons name="download-outline" size={18} color={colors.text} />
                  <Text style={[styles.btnText, { color: colors.text }]}>
                    {isInLibrary ? 'Re-Import' : 'Import'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn, { backgroundColor: colors.accent }]}
                  onPress={() => {
                    onClose();
                    onOpen();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Open book"
                >
                  <Ionicons name="book-outline" size={18} color={colors.accentForeground} />
                  <Text style={[styles.btnText, { color: colors.accentForeground }]}>Open</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#88888844',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#8888881a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sizeText: {
    fontSize: 12,
  },
  statusRow: {
    marginVertical: 16,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 48,
  },
  primaryBtn: {},
  secondaryBtn: {
    borderWidth: 1,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
