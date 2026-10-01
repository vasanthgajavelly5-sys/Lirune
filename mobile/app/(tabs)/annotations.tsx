/**
 * Lirune Reader Mobile — Global Annotation Center
 * View, search, sort, and jump to all highlights, notes, and bookmarks across all books.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useThemeContext } from '@/theme/ThemeContext';
import { useLibraryStore } from '@/state/libraryStore';
import { useReaderStore } from '@/state/readerStore';
import { useAnnotationStore, UnifiedAnnotation } from '@/state/annotationStore';
import { LiruneNavButton } from '@/components/navigation/LiruneSideNav';
import { LiruneDialog } from '@/components/LiruneDialog';
import { logger } from '@/utils/logger';

const TAG = 'GlobalAnnotations';

type AnnotationType = 'all' | 'highlight' | 'note' | 'bookmark';
type SortOption = 'newest' | 'oldest' | 'book';

export default function GlobalAnnotationsScreen() {
  const router = useRouter();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  const { books } = useLibraryStore();
  const { openBook } = useReaderStore();
  const { annotations, isLoading, loadAnnotations, removeAnnotation } = useAnnotationStore();

  const [selectedType, setSelectedType] = useState<AnnotationType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [itemToDelete, setItemToDelete] = useState<UnifiedAnnotation | null>(null);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  useFocusEffect(
    useCallback(() => {
      // Background silent sync on screen focus - never flickers a loading spinner
      loadAnnotations({ silent: true });
    }, [loadAnnotations])
  );

  const handleDeleteAnnotation = async (item: UnifiedAnnotation) => {
    try {
      await removeAnnotation(item.id, item.type);
      setItemToDelete(null);
    } catch (err) {
      logger.error(TAG, 'Failed deleting annotation', err);
    }
  };

  const handleOpenAnnotation = async (item: UnifiedAnnotation) => {
    const targetBook = books.find((b) => b.id === item.bookId);
    if (!targetBook) {
      Alert.alert('Book Not Found', 'This book is no longer available in your library.');
      return;
    }

    await openBook(targetBook);
    router.push({
      pathname: '/reader',
      params: { bookId: targetBook.id, initialCfi: item.cfi },
    });
  };

  const filteredAnnotations = useMemo(() => {
    let result = [...annotations];

    // Filter by type
    if (selectedType !== 'all') {
      result = result.filter((a) => a.type === selectedType);
    }

    // Filter by search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (a) =>
          a.bookTitle.toLowerCase().includes(q) ||
          a.bookAuthor.toLowerCase().includes(q) ||
          (a.chapter && a.chapter.toLowerCase().includes(q)) ||
          (a.text && a.text.toLowerCase().includes(q)) ||
          (a.noteText && a.noteText.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortOption === 'newest') return b.dateCreated - a.dateCreated;
      if (sortOption === 'oldest') return a.dateCreated - b.dateCreated;
      if (sortOption === 'book') return a.bookTitle.localeCompare(b.bookTitle);
      return 0;
    });

    return result;
  }, [annotations, selectedType, searchQuery, sortOption]);

  const counts = useMemo(() => {
    const highlights = annotations.filter((a) => a.type === 'highlight').length;
    const notes = annotations.filter((a) => a.type === 'note').length;
    const bookmarks = annotations.filter((a) => a.type === 'bookmark').length;
    return { all: annotations.length, highlight: highlights, note: notes, bookmark: bookmarks };
  }, [annotations]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerLeft}>
          <LiruneNavButton />
          <View>
            <Text style={[styles.screenTitle, { color: colors.text }]}>Annotations</Text>
            <Text style={[styles.screenSubtitle, { color: colors.textSecondary }]}>
              {annotations.length} items across all books
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.sortButton, { backgroundColor: colors.surfaceElevated }]}
          onPress={() => {
            setSortOption((prev) => (prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'book' : 'newest'));
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-vertical-outline" size={16} color={colors.text} />
          <Text style={[styles.sortButtonText, { color: colors.text }]}>
            {sortOption === 'newest' ? 'Newest' : sortOption === 'oldest' ? 'Oldest' : 'By Book'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchBox}>
        <View style={[styles.searchInputWrapper, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search excerpt, note, or book..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        {(['all', 'highlight', 'note', 'bookmark'] as AnnotationType[]).map((tab) => {
          const isSelected = selectedType === tab;
          const label =
            tab === 'all'
              ? 'All'
              : tab === 'highlight'
              ? 'Highlights'
              : tab === 'note'
              ? 'Notes'
              : 'Bookmarks';
          const count = counts[tab];

          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabPill,
                {
                  backgroundColor: isSelected ? colors.accent : colors.surfaceElevated,
                  borderColor: isSelected ? colors.accent : colors.borderSubtle,
                },
              ]}
              onPress={() => setSelectedType(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabPillText,
                  { color: isSelected ? colors.accentForeground : colors.textSecondary },
                ]}
              >
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : filteredAnnotations.length === 0 ? (
        <View style={styles.emptyCentered}>
          <View style={[styles.emptyOrb, { backgroundColor: colors.surfaceElevated }]}>
            <Ionicons name="bookmarks-outline" size={38} color={colors.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Annotations Found</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {searchQuery
              ? 'No annotations match your search query.'
              : selectedType === 'all'
              ? 'Highlights, notes, and bookmarks created while reading will appear here.'
              : `No ${selectedType}s recorded yet.`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredAnnotations}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const typeIcon =
              item.type === 'highlight'
                ? 'brush-outline'
                : item.type === 'note'
                ? 'chatbubble-ellipses-outline'
                : 'bookmark-outline';

            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.borderSubtle,
                  },
                ]}
                onPress={() => handleOpenAnnotation(item)}
                activeOpacity={0.75}
              >
                {/* Accent strip on left for highlights */}
                {item.color && (
                  <View style={[styles.colorStrip, { backgroundColor: item.color }]} />
                )}

                <View style={styles.cardContent}>
                  {/* Book header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.bookTitleArea}>
                      <Text style={[styles.cardBookTitle, { color: colors.text }]} numberOfLines={1}>
                        {item.bookTitle}
                      </Text>
                      <Text style={[styles.cardChapter, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.chapter || item.bookAuthor}
                      </Text>
                    </View>

                    <View style={styles.headerRight}>
                      <View style={[styles.typeBadge, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name={typeIcon} size={12} color={colors.accent} style={{ marginRight: 4 }} />
                        <Text style={[styles.typeBadgeText, { color: colors.accent }]}>
                          {item.type.toUpperCase()}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setItemToDelete(item)}
                        style={styles.deleteBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Excerpt / Highlighted text */}
                  {item.text && (
                    <Text
                      style={[
                        styles.excerptText,
                        {
                          color: colors.text,
                          backgroundColor: item.color ? `${item.color}22` : 'transparent',
                        },
                      ]}
                      numberOfLines={4}
                    >
                      &ldquo;{item.text}&rdquo;
                    </Text>
                  )}

                  {/* User Note */}
                  {item.noteText && (
                    <View style={[styles.noteBox, { backgroundColor: colors.surfaceElevated }]}>
                      <Ionicons name="pencil" size={12} color={colors.accent} style={{ marginRight: 6, marginTop: 2 }} />
                      <Text style={[styles.noteText, { color: colors.text }]}>{item.noteText}</Text>
                    </View>
                  )}

                  {/* Footer */}
                  <View style={styles.cardFooter}>
                    <Text style={[styles.dateText, { color: colors.textMuted }]}>
                      {formatDate(item.dateCreated)}
                    </Text>
                    <View style={styles.jumpHint}>
                      <Text style={[styles.jumpHintText, { color: colors.accent }]}>Tap to open</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <LiruneDialog
        visible={!!itemToDelete}
        title="Delete Annotation"
        message="Are you sure you want to remove this annotation? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (itemToDelete) handleDeleteAnnotation(itemToDelete);
        }}
        onCancel={() => setItemToDelete(null)}
      />
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
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchBox: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  colorStrip: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  bookTitleArea: {
    flex: 1,
    marginRight: 8,
  },
  cardBookTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardChapter: {
    fontSize: 11,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  deleteBtn: {
    padding: 2,
  },
  excerptText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  noteBox: {
    flexDirection: 'row',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dateText: {
    fontSize: 11,
  },
  jumpHint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jumpHintText: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 2,
  },
});
