/**
 * Lirune Reader Mobile — Book Details Modal
 * Matching the desktop Lirune Book Details experience.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '@/models/Book';
import { useThemeContext } from '@/theme/ThemeContext';

export interface BookDetailsModalProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onRead: (book: Book) => void;
  onToggleFavorite: (book: Book) => void;
  onDelete: (book: Book) => void;
}

export function BookDetailsModal({
  visible,
  book,
  onClose,
  onRead,
  onToggleFavorite,
  onDelete,
}: BookDetailsModalProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  if (!visible || !book) return null;

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ms?: number): string => {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Book Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Top Info */}
            <View style={styles.topInfo}>
              <View
                style={[
                  styles.coverWrapper,
                  { backgroundColor: book.coverColor || '#2E2B38' },
                ]}
              >
                {book.coverUrl ? (
                  <Image
                    source={{
                      uri:
                        book.coverUrl.startsWith('file://') ||
                        book.coverUrl.startsWith('http') ||
                        book.coverUrl.startsWith('data:')
                          ? book.coverUrl
                          : `file://${book.coverUrl}`,
                    }}
                    style={styles.coverImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="book" size={36} color="#FFFFFF" />
                )}
              </View>

              <View style={styles.mainInfo}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                  {book.title}
                </Text>
                <Text style={[styles.author, { color: colors.textSecondary }]} numberOfLines={1}>
                  {book.author}
                </Text>

                <View style={styles.badgeRow}>
                  <View style={[styles.formatBadge, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.formatBadgeText, { color: colors.accent }]}>
                      {book.format.toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.favoriteBadge,
                      {
                        backgroundColor: book.isFavorite
                          ? 'rgba(255, 101, 132, 0.15)'
                          : isDark
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'rgba(0, 0, 0, 0.04)',
                      },
                    ]}
                    onPress={() => onToggleFavorite(book)}
                  >
                    <Ionicons
                      name={book.isFavorite ? 'heart' : 'heart-outline'}
                      size={14}
                      color={book.isFavorite ? '#FF6584' : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.favoriteText,
                        { color: book.isFavorite ? '#FF6584' : colors.textMuted },
                      ]}
                    >
                      {book.isFavorite ? 'Favorited' : 'Favorite'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Description */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                Description
              </Text>
              <Text style={[styles.description, { color: colors.text }]}>
                {book.description || 'No description available for this book.'}
              </Text>
            </View>

            {/* Metadata Stats */}
            {(() => {
              const isPageBased = ['pdf', 'djvu', 'cbz', 'cbr'].includes(book.format);
              const countLabel = isPageBased ? 'Pages' : 'Chapters';
              const countValue = book.chapterCount && book.chapterCount > 0 ? String(book.chapterCount) : '—';
              return (
                <View style={[styles.metaGrid, { backgroundColor: colors.surfaceElevated }]}>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Progress</Text>
                    <Text style={[styles.metaValue, { color: colors.text }]}>{book.progress}%</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{countLabel}</Text>
                    <Text style={[styles.metaValue, { color: colors.text }]}>{countValue}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.textMuted }]}>File Size</Text>
                    <Text style={[styles.metaValue, { color: colors.text }]}>
                      {formatFileSize(book.fileSize)}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={[styles.metaLabel, { color: colors.textMuted }]}>Added</Text>
                    <Text style={[styles.metaValue, { color: colors.text }]}>
                      {formatDate(book.dateAdded)}
                    </Text>
                  </View>
                </View>
              );
            })()}
          </ScrollView>

          {/* Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.borderSubtle }]}>
            <TouchableOpacity
              style={[styles.deleteButton, { borderColor: colors.error }]}
              onPress={() => {
                onClose();
                onDelete(book);
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.deleteText, { color: colors.error }]}>Remove</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.readButton, { backgroundColor: colors.accent }]}
              onPress={() => {
                onClose();
                onRead(book);
              }}
            >
              <Ionicons name="book-outline" size={18} color={colors.accentForeground} />
              <Text style={[styles.readText, { color: colors.accentForeground }]}>
                Read Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  topInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  coverWrapper: {
    width: 80,
    height: 112,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  mainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  author: {
    fontSize: 14,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  formatBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  favoriteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  favoriteText: {
    fontSize: 11,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '600',
  },
  readButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 6,
  },
  readText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
