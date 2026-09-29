/**
 * Lirune Reader Mobile — Book Card Component
 * Supports both Grid and List presentation modes with covers, progress,
 * Lirune heart favorites, and unified long-press context interactions.
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

export interface BookCardProps {
  book: Book;
  viewMode: ViewMode;
  onPress: () => void;
  onLongPress?: () => void;
  onToggleFavorite: () => void;
  onDelete?: () => void;
}

export function BookCard({
  book,
  viewMode,
  onPress,
  onLongPress,
  onToggleFavorite,
}: BookCardProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

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
        style={[
          styles.gridCard,
          {
            backgroundColor: isDark ? '#202026' : '#FFFFFF',
            borderColor: colors.borderSubtle,
          },
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={280}
        activeOpacity={0.82}
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
              <Ionicons name="book" size={28} color="rgba(255,255,255,0.7)" style={{ marginBottom: 8 }} />
              <Text style={styles.fallbackTitle} numberOfLines={2}>
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

          {/* Favorite Heart Button */}
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            accessibilityLabel={book.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.favoriteIconBg}>
              <Ionicons
                name={book.isFavorite ? 'heart' : 'heart-outline'}
                size={16}
                color={book.isFavorite ? '#FF6584' : '#FFFFFF'}
              />
            </View>
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
              <View
                style={[
                  styles.progressBarBg,
                  { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)' },
                ]}
              >
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.max(0, book.progress))}%`,
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
        {
          backgroundColor: isDark ? '#202026' : '#FFFFFF',
          borderColor: colors.borderSubtle,
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      activeOpacity={0.82}
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
          <Ionicons name="book" size={20} color="rgba(255,255,255,0.7)" />
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
          <View style={[styles.listBadge, { backgroundColor: colors.accentSoft }]}>
            <Text style={[styles.listBadgeText, { color: colors.accent }]}>{badgeText}</Text>
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

          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            style={styles.listActionBtn}
            accessibilityLabel={book.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={book.isFavorite ? 'heart' : 'heart-outline'}
              size={18}
              color={book.isFavorite ? '#FF6584' : colors.textMuted}
            />
          </TouchableOpacity>
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
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  gridCoverWrapper: {
    width: '100%',
    height: gridCardWidth * 1.38,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCoverImage: {
    width: '100%',
    height: '100%',
  },
  fallbackCoverContent: {
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  fallbackTitle: {
    color: '#F0F0EB',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  fallbackAuthor: {
    color: '#C0C0BA',
    fontSize: 11,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(26, 26, 29, 0.85)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgeText: {
    color: '#EEECF8',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  favoriteIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 26, 29, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  gridInfoContainer: {
    padding: 12,
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 4,
  },
  gridAuthor: {
    fontSize: 12,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // List
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  listCoverWrapper: {
    width: 50,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCoverImage: {
    width: '100%',
    height: '100%',
  },
  listInfoContainer: {
    flex: 1,
    marginLeft: 14,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  listBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  listBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  listAuthor: {
    fontSize: 13,
    marginBottom: 8,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listProgressText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listActionBtn: {
    padding: 4,
  },
});
