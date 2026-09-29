/**
 * Lirune Reader Mobile — Book Card Component
 * Supports both Grid and List presentation modes with covers, progress, and favorites.
 */

import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Book, ViewMode } from '@/models/Book';
import { useThemeContext } from '@/theme/ThemeContext';

interface BookCardProps {
  book: Book;
  viewMode: ViewMode;
  onPress: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

export function BookCard({
  book,
  viewMode,
  onPress,
  onToggleFavorite,
  onDelete,
}: BookCardProps) {
  const { colors } = useThemeContext();

  const formatLabels: Record<string, string> = {
    epub: 'EPUB',
    pdf: 'PDF',
    txt: 'TXT',
    html: 'HTML',
    fb2: 'FB2',
    cbz: 'CBZ',
  };

  const badgeText = formatLabels[book.format] || book.format.toUpperCase();

  // ================= GRID MODE =================
  if (viewMode === 'grid') {
    return (
      <TouchableOpacity
        style={[styles.gridCard, { backgroundColor: colors.surface }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {/* Cover Container */}
        <View
          style={[
            styles.gridCoverWrapper,
            { backgroundColor: book.coverColor || '#2C2D35' },
          ]}
        >
          {book.coverUrl ? (
            <Image
              source={{ uri: book.coverUrl }}
              style={styles.gridCoverImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.fallbackCoverContent}>
              <Text style={styles.fallbackTitle} numberOfLines={3}>
                {book.title}
              </Text>
              <Text style={styles.fallbackAuthor} numberOfLines={1}>
                {book.author}
              </Text>
            </View>
          )}

          {/* Format Badge */}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>

          {/* Favorite Star Button */}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            <Ionicons
              name={book.isFavorite ? 'star' : 'star-outline'}
              size={18}
              color={book.isFavorite ? '#FFB86C' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>

        {/* Info & Progress */}
        <View style={styles.gridInfoContainer}>
          <Text
            style={[styles.gridTitle, { color: colors.text }]}
            numberOfLines={2}
          >
            {book.title}
          </Text>
          <Text
            style={[styles.gridAuthor, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {book.author}
          </Text>

          {book.progress > 0 && (
            <View style={styles.progressRow}>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${book.progress}%`,
                      backgroundColor: colors.accent,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
                {book.progress}%
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ================= LIST MODE =================
  return (
    <TouchableOpacity
      style={[
        styles.listCard,
        { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Small Cover Thumbnail */}
      <View
        style={[
          styles.listCoverWrapper,
          { backgroundColor: book.coverColor || '#2C2D35' },
        ]}
      >
        {book.coverUrl ? (
          <Image
            source={{ uri: book.coverUrl }}
            style={styles.listCoverImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.listFallbackTitle} numberOfLines={2}>
            {book.title}
          </Text>
        )}
      </View>

      {/* Details */}
      <View style={styles.listInfoContainer}>
        <View style={styles.listTitleRow}>
          <Text
            style={[styles.listTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {book.title}
          </Text>
          <View style={styles.listBadge}>
            <Text style={styles.listBadgeText}>{badgeText}</Text>
          </View>
        </View>

        <Text
          style={[styles.listAuthor, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {book.author}
        </Text>

        <View style={styles.listMetaRow}>
          {book.progress > 0 ? (
            <Text style={[styles.listProgressText, { color: colors.accent }]}>
              {book.progress}% completed
            </Text>
          ) : (
            <Text style={[styles.listProgressText, { color: colors.textMuted }]}>
              Unread
            </Text>
          )}

          <View style={styles.listActions}>
            <TouchableOpacity
              onPress={onToggleFavorite}
              style={styles.actionBtn}
            >
              <Ionicons
                name={book.isFavorite ? 'star' : 'star-outline'}
                size={18}
                color={book.isFavorite ? '#FFB86C' : colors.textMuted}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={onDelete} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const screenWidth = Dimensions.get('window').width;
const gridCardWidth = (screenWidth - 44) / 2;

const styles = StyleSheet.create({
  // Grid
  gridCard: {
    width: gridCardWidth,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gridCoverWrapper: {
    width: '100%',
    height: gridCardWidth * 1.42,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCoverImage: {
    width: '100%',
    height: '100%',
  },
  fallbackCoverContent: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  fallbackTitle: {
    color: '#F0F0EB',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  fallbackAuthor: {
    color: '#B8B8B0',
    fontSize: 11,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  favoriteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    padding: 6,
    borderRadius: 16,
  },
  gridInfoContainer: {
    padding: 10,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  gridAuthor: {
    fontSize: 11,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  progressBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(128, 128, 128, 0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '600',
  },

  // List
  listCard: {
    flexDirection: 'row',
    borderRadius: 10,
    marginBottom: 10,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  listCoverWrapper: {
    width: 48,
    height: 68,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listCoverImage: {
    width: '100%',
    height: '100%',
  },
  listFallbackTitle: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 4,
  },
  listInfoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  listBadge: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  listBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B8B8B0',
  },
  listAuthor: {
    fontSize: 12,
    marginTop: 2,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  listProgressText: {
    fontSize: 11,
    fontWeight: '500',
  },
  listActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 4,
  },
});
