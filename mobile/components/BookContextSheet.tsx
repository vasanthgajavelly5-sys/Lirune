/**
 * Lirune Reader Mobile — Book Long-Press Context Menu
 * Provides a unified, elegant action sheet for both Grid and List views.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Book } from '@/models/Book';
import { useThemeContext } from '@/theme/ThemeContext';

export interface BookContextSheetProps {
  visible: boolean;
  book: Book | null;
  onClose: () => void;
  onOpen: (book: Book) => void;
  onToggleFavorite: (book: Book) => void;
  onAddToCollection: (book: Book) => void;
  onViewDetails: (book: Book) => void;
  onDelete: (book: Book) => void;
}

export function BookContextSheet({
  visible,
  book,
  onClose,
  onOpen,
  onToggleFavorite,
  onAddToCollection,
  onViewDetails,
  onDelete,
}: BookContextSheetProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  const insets = useSafeAreaInsets();

  if (!visible || !book) return null;

  const actions = [
    {
      id: 'open',
      label: 'Read Book',
      icon: 'book-outline' as const,
      color: colors.text,
      onPress: () => {
        onClose();
        onOpen(book);
      },
    },
    {
      id: 'favorite',
      label: book.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: (book.isFavorite ? 'heart' : 'heart-outline') as keyof typeof Ionicons.glyphMap,
      color: book.isFavorite ? '#FF6584' : colors.text,
      onPress: () => {
        onClose();
        onToggleFavorite(book);
      },
    },
    {
      id: 'collection',
      label: 'Add to Collection',
      icon: 'folder-outline' as const,
      color: colors.text,
      onPress: () => {
        onClose();
        onAddToCollection(book);
      },
    },
    {
      id: 'details',
      label: 'Book Details',
      icon: 'information-circle-outline' as const,
      color: colors.text,
      onPress: () => {
        onClose();
        onViewDetails(book);
      },
    },
    {
      id: 'delete',
      label: 'Remove from Library',
      icon: 'trash-outline' as const,
      color: colors.error,
      isDestructive: true,
      onPress: () => {
        onClose();
        onDelete(book);
      },
    },
  ];

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
            styles.sheetContainer,
            {
              backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
              borderColor: colors.borderSubtle,
              paddingBottom: Math.max(36, insets.bottom + 20),
            },
          ]}
        >
          {/* Header Preview */}
          <View style={[styles.headerRow, { borderBottomColor: colors.borderSubtle }]}>
            <View
              style={[
                styles.thumbnail,
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
                  style={styles.thumbImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="book" size={20} color="#FFFFFF" />
              )}
            </View>

            <View style={styles.titleInfo}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {book.title}
              </Text>
              <Text
                style={[styles.author, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {book.author}
              </Text>
              <View style={styles.metaBadgeRow}>
                <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                  <Text style={[styles.badgeText, { color: colors.accent }]}>
                    {book.format.toUpperCase()}
                  </Text>
                </View>
                {book.progress > 0 && (
                  <Text style={[styles.progressText, { color: colors.textMuted }]}>
                    {book.progress}% completed
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Actions List */}
          <View style={styles.actionsList}>
            {actions.map((act) => (
              <TouchableOpacity
                key={act.id}
                style={[
                  styles.actionRow,
                  act.isDestructive && styles.destructiveRow,
                ]}
                onPress={act.onPress}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.actionIconCircle,
                    {
                      backgroundColor: act.isDestructive
                        ? 'rgba(255, 107, 107, 0.12)'
                        : isDark
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(0, 0, 0, 0.04)',
                    },
                  ]}
                >
                  <Ionicons name={act.icon} size={20} color={act.color} />
                </View>
                <Text
                  style={[
                    styles.actionLabel,
                    { color: act.color },
                    act.isDestructive && { fontWeight: '700' },
                  ]}
                >
                  {act.label}
                </Text>
              </TouchableOpacity>
            ))}
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
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 16,
    paddingBottom: 36,
    paddingHorizontal: 20,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 14,
  },
  thumbnail: {
    width: 48,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  titleInfo: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  author: {
    fontSize: 13,
    marginBottom: 6,
  },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressText: {
    fontSize: 11,
  },
  actionsList: {
    paddingTop: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 14,
  },
  destructiveRow: {
    marginTop: 4,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
});
