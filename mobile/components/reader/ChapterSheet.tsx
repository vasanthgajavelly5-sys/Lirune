/**
 * Lirune Reader Mobile — Table of Contents Drawer/Sheet
 * Coherent with Lirune Reader design system and active reader theme.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TOCItem } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';

interface ChapterSheetProps {
  visible: boolean;
  onClose: () => void;
  toc: TOCItem[];
  currentCfi?: string | null;
  onSelectChapter: (item: TOCItem, index: number) => void;
  themeName?: string;
}

export function ChapterSheet({
  visible,
  onClose,
  toc,
  currentCfi,
  onSelectChapter,
  themeName = 'neutral',
}: ChapterSheetProps) {
  const insets = useSafeAreaInsets();
  const activeTheme = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isThemeDark = themeName === 'night' || themeName.startsWith('contrast');

  const sheetBg = activeTheme.bg;
  const surfaceBg = activeTheme.surface;
  const textColor = activeTheme.text;
  const mutedColor = activeTheme.muted;
  const borderColor = isThemeDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  const activeAccent = activeTheme.link || (isThemeDark ? '#C9B8FF' : '#4C4666');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: sheetBg,
              borderColor: borderColor,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: borderColor, backgroundColor: surfaceBg }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconOrb, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                <Ionicons name="list-outline" size={18} color={activeAccent} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: textColor }]}>Table of Contents</Text>
                <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
                  {toc.length} {toc.length === 1 ? 'chapter' : 'chapters'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              accessibilityLabel="Close Table of Contents"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Chapters List */}
          {toc.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={36} color={mutedColor} style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                No chapters or sections found in this publication.
              </Text>
            </View>
          ) : (
            <FlatList
              data={toc}
              keyExtractor={(item, index) => item.id || `toc_${index}`}
              contentContainerStyle={styles.listContent}
              renderItem={({ item, index }) => {
                const isCurrent = currentCfi && item.href && currentCfi.includes(item.href);
                return (
                  <TouchableOpacity
                    style={[
                      styles.itemRow,
                      {
                        paddingLeft: 16 + (item.depth || 0) * 16,
                        backgroundColor: isCurrent
                          ? (isThemeDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                          : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      onSelectChapter(item, index);
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    {isCurrent && (
                      <View style={[styles.currentIndicator, { backgroundColor: activeAccent }]} />
                    )}
                    <Text
                      style={[
                        styles.itemText,
                        {
                          color: isCurrent ? activeAccent : textColor,
                          fontWeight: isCurrent ? '700' : '400',
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: borderColor }]} />
              )}
            />
          )}
        </View>
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
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '82%',
    minHeight: '40%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconOrb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 20,
  },
  currentIndicator: {
    width: 4,
    height: 18,
    borderRadius: 2,
    marginRight: 8,
  },
  itemText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
