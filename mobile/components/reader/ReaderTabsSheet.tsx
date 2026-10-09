/**
 * Lirune Reader Mobile — Reading Tabs & Recent Books Drawer
 * Allows instant 1-tap switching between open/recent books directly
 * inside the reader, matching the active reading theme.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';
import { useLibraryStore } from '@/state/libraryStore';

interface ReaderTabsSheetProps {
  visible: boolean;
  onClose: () => void;
  currentBook: Book;
  onSelectBook: (book: Book) => void;
  onExitToLibrary: () => void;
  themeName?: string;
}

export function ReaderTabsSheet({
  visible,
  onClose,
  currentBook,
  onSelectBook,
  onExitToLibrary,
  themeName = 'neutral',
}: ReaderTabsSheetProps) {
  const insets = useSafeAreaInsets();
  const { books } = useLibraryStore();
  const activeTheme = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isThemeDark = themeName === 'night' || themeName.startsWith('contrast');

  const sheetBg = activeTheme.bg;
  const surfaceBg = activeTheme.surface;
  const textColor = activeTheme.text;
  const mutedColor = activeTheme.muted;
  const borderColor = isThemeDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';
  const activeAccent = activeTheme.link || (isThemeDark ? '#C9B8FF' : '#4C4666');

  // Sort books: current book first, then by lastReadDate descending
  const sortedBooks = React.useMemo(() => {
    return [...books].sort((a, b) => {
      if (a.id === currentBook.id) return -1;
      if (b.id === currentBook.id) return 1;
      return (b.lastReadDate || b.dateAdded) - (a.lastReadDate || a.dateAdded);
    });
  }, [books, currentBook.id]);

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
                <Ionicons name="albums-outline" size={18} color={activeAccent} />
              </View>
              <View>
                <Text style={[styles.headerTitle, { color: textColor }]}>Reading Tabs</Text>
                <Text style={[styles.headerSubtitle, { color: mutedColor }]}>
                  {books.length} {books.length === 1 ? 'publication' : 'publications'} in library
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: isThemeDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
              accessibilityRole="button"
              accessibilityLabel="Close reading tabs"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Book Tabs List */}
          <FlatList
            data={sortedBooks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isCurrent = item.id === currentBook.id;
              const progressPct = Math.round(item.progress || 0);

              return (
                <TouchableOpacity
                  style={[
                    styles.tabItemRow,
                    {
                      borderColor: isCurrent ? activeAccent : borderColor,
                      backgroundColor: isCurrent
                        ? (isThemeDark ? 'rgba(201, 184, 255, 0.10)' : 'rgba(76, 70, 102, 0.08)')
                        : surfaceBg,
                    },
                  ]}
                  onPress={() => {
                    onSelectBook(item);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${item.title}`}
                >
                  {/* Thumbnail / Cover */}
                  <View style={[styles.coverThumb, { backgroundColor: item.coverColor || '#2A2A30' }]}>
                    {item.coverUrl ? (
                      <Image
                        source={{ uri: item.coverUrl.startsWith('file://') ? item.coverUrl : `file://${item.coverUrl}` }}
                        style={styles.coverImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="book" size={18} color="rgba(255,255,255,0.6)" />
                    )}
                  </View>

                  {/* Details */}
                  <View style={styles.tabInfo}>
                    <View style={styles.titleRow}>
                      <Text
                        style={[
                          styles.tabBookTitle,
                          { color: textColor, fontWeight: isCurrent ? '700' : '600' },
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      {isCurrent && (
                        <View style={[styles.activeBadge, { backgroundColor: activeAccent }]}>
                          <Text style={styles.activeBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                    </View>

                    <Text style={[styles.tabBookAuthor, { color: mutedColor }]} numberOfLines={1}>
                      {item.author || 'Unknown Author'} · {item.format.toUpperCase()}
                    </Text>

                    {/* Progress indicator */}
                    <View style={styles.progressRow}>
                      <View style={[styles.progressBarBg, { backgroundColor: borderColor }]}>
                        <View
                          style={[
                            styles.progressBarFill,
                            {
                              width: `${Math.max(2, Math.min(100, progressPct))}%`,
                              backgroundColor: isCurrent ? activeAccent : mutedColor,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.progressPctText, { color: mutedColor }]}>
                        {progressPct}%
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          {/* Footer Action: Library */}
          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            <TouchableOpacity
              style={[styles.libraryBtn, { borderColor: borderColor, backgroundColor: surfaceBg }]}
              onPress={onExitToLibrary}
              activeOpacity={0.7}
            >
              <Ionicons name="grid-outline" size={16} color={textColor} style={{ marginRight: 6 }} />
              <Text style={[styles.libraryBtnText, { color: textColor }]}>View Library Grid</Text>
            </TouchableOpacity>
          </View>
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
    maxHeight: '80%',
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
    padding: 14,
    gap: 10,
  },
  tabItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 12,
  },
  coverThumb: {
    width: 42,
    height: 58,
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  tabInfo: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tabBookTitle: {
    fontSize: 14,
    flex: 1,
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tabBookAuthor: {
    fontSize: 11,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressPctText: {
    fontSize: 10,
    fontWeight: '600',
    minWidth: 28,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  libraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  libraryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
