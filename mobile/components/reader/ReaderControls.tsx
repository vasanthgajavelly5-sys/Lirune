/**
 * Lirune Reader Mobile — Reader Navigation Bars & Controls
 * Minimal, quiet, touch-first mobile controls.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '@/models/Book';
import { READER_THEMES } from '@/theme/Colors';

interface ReaderControlsProps {
  book: Book;
  themeName: string;
  progressPercent: number;
  currentChapter: string;
  isBookmarked: boolean;
  onBack: () => void;
  onToggleBookmark: () => void;
  onOpenTOC: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onOpenAnnotations: () => void;
}

export function ReaderControls({
  book,
  themeName,
  progressPercent,
  currentChapter,
  isBookmarked,
  onBack,
  onToggleBookmark,
  onOpenTOC,
  onOpenSearch,
  onOpenSettings,
  onOpenAnnotations,
}: ReaderControlsProps) {
  const activeTheme = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isDark = themeName === 'night' || themeName.startsWith('contrast');

  const insets = useSafeAreaInsets();
  const barBg = activeTheme.surface;
  const textColor = activeTheme.text;
  const mutedColor = activeTheme.muted;
  const iconColor = activeTheme.text;
  const accentColor = activeTheme.link || (isDark ? '#C9B8FF' : '#4C4666');

  return (
    <>
      {/* Top Navigation Bar */}
      <View style={[styles.topBarWrapper, { backgroundColor: barBg, paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.iconButton}
            accessibilityLabel="Back to library"
          >
            <Ionicons name="arrow-back" size={24} color={iconColor} />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={[styles.bookTitle, { color: textColor }]} numberOfLines={1}>
              {book.title}
            </Text>
            <Text style={[styles.chapterSubtitle, { color: mutedColor }]} numberOfLines={1}>
              {currentChapter || book.author}
            </Text>
          </View>

          <View style={styles.rightActions}>
            <TouchableOpacity
              onPress={onToggleBookmark}
              style={styles.iconButton}
              accessibilityLabel="Bookmark this page"
            >
              <Ionicons
                name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={22}
                color={isBookmarked ? accentColor : iconColor}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onOpenSearch}
              style={styles.iconButton}
              accessibilityLabel="Search in book"
            >
              <Ionicons name="search-outline" size={22} color={iconColor} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onOpenSettings}
              style={styles.iconButton}
              accessibilityLabel="Reader settings"
            >
              <Ionicons name="text-outline" size={22} color={iconColor} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom Bar */}
      <View style={[styles.bottomBarWrapper, { backgroundColor: barBg, paddingBottom: insets.bottom }]}>
        <View style={styles.bottomBar}>
          <TouchableOpacity
            onPress={onOpenTOC}
            style={styles.iconButton}
            accessibilityLabel="Table of contents"
          >
            <Ionicons name="list-outline" size={24} color={iconColor} />
          </TouchableOpacity>

          <View style={styles.progressContainer}>
            {/* Progress Track */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: accentColor,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: mutedColor }]}>
              {progressPercent}%
            </Text>
          </View>

          <TouchableOpacity
            onPress={onOpenAnnotations}
            style={styles.iconButton}
            accessibilityLabel="Annotations and notes"
          >
            <Ionicons name="create-outline" size={22} color={iconColor} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bottomBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  topBar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  bottomBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  bookTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  chapterSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  progressBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 12,
    minWidth: 36,
    textAlign: 'right',
  },
});
