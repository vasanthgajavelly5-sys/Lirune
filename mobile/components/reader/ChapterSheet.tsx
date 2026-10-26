/**
 * Lirune Reader Mobile — Table of Contents Drawer/Sheet
 * Coherent with Lirune Reader design system and active reader theme.
 * High-performance virtualized list with fixed item height, search/filter,
 * and collapsible nested nodes for 5,000+ chapter publications.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TOCItem } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { useThemeContext } from '@/theme/ThemeContext';

const ITEM_HEIGHT = 48;

interface ChapterSheetProps {
  visible: boolean;
  onClose: () => void;
  toc: TOCItem[];
  currentCfi?: string | null;
  onSelectChapter: (item: TOCItem, index: number) => void;
  themeName?: string;
}

interface VisibleTOCItem {
  item: TOCItem;
  originalIndex: number;
  hasChildren: boolean;
  isCollapsed: boolean;
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
  const { colors } = useThemeContext();
  const activeTheme = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isThemeDark = themeName === 'night' || themeName.startsWith('contrast');

  const sheetBg = activeTheme.bg;
  const surfaceBg = activeTheme.surface;
  const textColor = activeTheme.text;
  const mutedColor = activeTheme.muted;
  const borderColor = isThemeDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  const activeAccent = activeTheme.link || colors.accent;

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  // Determine parent-child relations and filter by search or collapse
  const visibleItems = useMemo<VisibleTOCItem[]>(() => {
    if (!toc.length) return [];

    const isSearching = searchQuery.trim().length > 0;
    const q = searchQuery.toLowerCase().trim();

    // Map children count / presence
    const hasChildrenMap = new Map<number, boolean>();
    for (let i = 0; i < toc.length; i++) {
      const currentDepth = toc[i].depth || 0;
      const nextDepth = i + 1 < toc.length ? toc[i + 1].depth || 0 : 0;
      hasChildrenMap.set(i, nextDepth > currentDepth);
    }

    if (isSearching) {
      const results: VisibleTOCItem[] = [];
      for (let i = 0; i < toc.length; i++) {
        const item = toc[i];
        if (item.label.toLowerCase().includes(q)) {
          results.push({
            item,
            originalIndex: i,
            hasChildren: false,
            isCollapsed: false,
          });
        }
      }
      return results;
    }

    const list: VisibleTOCItem[] = [];
    let skippingDepthAtOrBelow = -1;

    for (let i = 0; i < toc.length; i++) {
      const item = toc[i];
      const depth = item.depth || 0;
      const id = item.id || `toc_${i}`;

      if (skippingDepthAtOrBelow !== -1) {
        if (depth > skippingDepthAtOrBelow) {
          continue; // Child of a collapsed ancestor
        } else {
          skippingDepthAtOrBelow = -1; // Exited collapsed subtree
        }
      }

      const hasChildren = hasChildrenMap.get(i) || false;
      const isCollapsed = collapsedIds.has(id);

      list.push({
        item,
        originalIndex: i,
        hasChildren,
        isCollapsed,
      });

      if (hasChildren && isCollapsed) {
        skippingDepthAtOrBelow = depth;
      }
    }

    return list;
  }, [toc, searchQuery, collapsedIds]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const getItemLayout = useCallback(
    (_data: any, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const renderItem = useCallback(
    ({ item: visibleItem }: { item: VisibleTOCItem }) => {
      const { item, originalIndex, hasChildren, isCollapsed } = visibleItem;
      const isCurrent = Boolean(currentCfi && item.href && currentCfi.includes(item.href));
      const depth = item.depth || 0;
      const id = item.id || `toc_${originalIndex}`;

      return (
        <View
          style={[
            styles.itemRow,
            {
              height: ITEM_HEIGHT,
              paddingLeft: 12 + depth * 14,
              backgroundColor: isCurrent
                ? isThemeDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.05)'
                : 'transparent',
              borderBottomColor: borderColor,
            },
          ]}
        >
          {hasChildren ? (
            <TouchableOpacity
              style={styles.collapseToggle}
              onPress={() => toggleCollapse(id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={isCollapsed ? 'Expand section' : 'Collapse section'}
            >
              <Ionicons
                name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                size={14}
                color={mutedColor}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.collapsePlaceholder} />
          )}

          <TouchableOpacity
            style={styles.itemTouchArea}
            onPress={() => {
              onSelectChapter(item, originalIndex);
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
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [currentCfi, isThemeDark, borderColor, mutedColor, activeAccent, textColor, toggleCollapse, onSelectChapter, onClose]
  );

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
              <View
                style={[
                  styles.iconOrb,
                  { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                ]}
              >
                <Ionicons name="list-outline" size={18} color={activeAccent} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: textColor }]}>Table of Contents</Text>
                <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
                  {toc.length} {toc.length === 1 ? 'entry' : 'entries'}
                  {visibleItems.length !== toc.length && ` (${visibleItems.length} shown)`}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
              ]}
              accessibilityLabel="Close Table of Contents"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Search Bar for 2,000+ entries */}
          {toc.length > 8 && (
            <View style={[styles.searchBar, { borderBottomColor: borderColor, backgroundColor: surfaceBg }]}>
              <Ionicons name="search" size={16} color={mutedColor} style={styles.searchIcon} />
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="Search chapters & sections…"
                placeholderTextColor={mutedColor}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color={mutedColor} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Chapters List */}
          {visibleItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={36} color={mutedColor} style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyText, { color: mutedColor }]}>
                {searchQuery ? 'No chapters match your search.' : 'No chapters found in this publication.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={visibleItems}
              keyExtractor={(item) => item.item.id || `toc_${item.originalIndex}`}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              initialNumToRender={25}
              maxToRenderPerBatch={30}
              windowSize={11}
              removeClippedSubviews={true}
              contentContainerStyle={styles.listContent}
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
    maxHeight: '84%',
    minHeight: '44%',
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  listContent: {
    paddingVertical: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapseToggle: {
    width: 22,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  collapsePlaceholder: {
    width: 14,
  },
  itemTouchArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  currentIndicator: {
    width: 3,
    height: 18,
    borderRadius: 2,
    marginRight: 8,
  },
  itemText: {
    fontSize: 14,
    flex: 1,
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
