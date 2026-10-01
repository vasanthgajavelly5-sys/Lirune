/**
 * Lirune Reader Mobile — Empty States Component
 * Authentic Lirune empty states for library, collections, search, and filters.
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

export interface EmptyStateProps {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
  secondaryAction?: {
    label: string;
    onPress: () => void;
  };
  hint?: string;
  style?: ViewStyle;
}

export function EmptyState({
  title,
  message,
  icon = 'book-outline',
  iconColor,
  action,
  secondaryAction,
  hint,
  style,
}: EmptyStateProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  return (
    <View style={[styles.container, style]} accessibilityLiveRegion="polite">
      {/* Icon Orb */}
      <View
        style={[
          styles.iconOrb,
          {
            backgroundColor: isDark ? 'rgba(238, 236, 248, 0.08)' : 'rgba(76, 70, 102, 0.08)',
            borderColor: colors.borderSubtle,
          },
        ]}
      >
        <Ionicons name={icon} size={36} color={iconColor || colors.accent} />
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        {action && (
          <TouchableOpacity
            style={[styles.primaryAction, { backgroundColor: colors.accent }]}
            onPress={action.onPress}
            activeOpacity={0.8}
            accessibilityLabel={action.label}
          >
            <Text style={[styles.primaryActionText, { color: colors.accentForeground }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        )}

        {secondaryAction && (
          <TouchableOpacity
            style={[
              styles.secondaryAction,
              {
                borderColor: colors.borderSubtle,
                backgroundColor: colors.surfaceElevated,
              },
            ]}
            onPress={secondaryAction.onPress}
            activeOpacity={0.7}
            accessibilityLabel={secondaryAction.label}
          >
            <Text style={[styles.secondaryActionText, { color: colors.text }]}>
              {secondaryAction.label}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {hint && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
      )}
    </View>
  );
}

export function EmptyLibraryState({
  onImport,
  onOpenGuide,
}: {
  onImport: () => void;
  onOpenGuide?: () => void;
}) {
  return (
    <EmptyState
      title="Your Library is Empty"
      message="A calm, private home for your books. Import any of our 18 supported formats including EPUB, PDF, MOBI, FB2, and CBZ to begin reading."
      icon="bookmark"
      action={{ label: 'Import Book', onPress: onImport }}
      secondaryAction={
        onOpenGuide
          ? { label: 'How Lirune Works', onPress: onOpenGuide }
          : undefined
      }
      hint="Stored locally and privately on your device"
    />
  );
}

export function EmptyCollectionsState({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      title="No Collections Yet"
      message="Create collections to organize your books by genre, mood, author, or reading goal."
      icon="folder-open-outline"
      action={{ label: 'Create Collection', onPress: onCreate }}
    />
  );
}

export function EmptySearchState({ query }: { query: string }) {
  return (
    <EmptyState
      title="No Books Found"
      message={
        query.trim()
          ? `No books in your library match "${query}". Try searching by a different title or author.`
          : 'Type in the search box to find books by title or author.'
      }
      icon="search-outline"
    />
  );
}

export function EmptyFavoritesState() {
  return (
    <EmptyState
      title="No Favorites Yet"
      message="Tap the heart symbol on any book to add it to your favorites."
      icon="heart-outline"
      iconColor="#FF6584"
    />
  );
}

export function EmptyCollectionsFilterState() {
  return (
    <EmptyState
      title="No Books in Collection"
      message="This collection doesn't have any books yet. Long press any book in your library to add it here."
      icon="folder-outline"
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 280,
  },
  iconOrb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 300,
  },
  actionContainer: {
    width: '100%',
    maxWidth: 260,
    gap: 10,
    marginBottom: 16,
  },
  primaryAction: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  secondaryAction: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});