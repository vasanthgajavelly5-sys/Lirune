/**
 * Lirune Reader Mobile — Page Thumbnails Navigation Sheet
 * Grid view of pages for PDF, DJVU, CBZ, and CBR documents.
 * Allows quick visual overview and instant jumping to any page.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { READER_THEMES } from '@/theme/Colors';

interface ThumbnailsSheetProps {
  visible: boolean;
  totalPages: number;
  currentPage: number;
  themeName: string;
  bookTitle: string;
  onSelectPage: (page: number) => void;
  onClose: () => void;
}

const screenWidth = Dimensions.get('window').width;
const itemWidth = (screenWidth - 48) / 3;

export function ThumbnailsSheet({
  visible,
  totalPages,
  currentPage,
  themeName,
  bookTitle,
  onSelectPage,
  onClose,
}: ThumbnailsSheetProps) {
  const insets = useSafeAreaInsets();
  const palette = READER_THEMES[themeName] || READER_THEMES.neutral;
  const isDark = themeName === 'night' || themeName.startsWith('contrast');

  if (!visible) return null;

  const pages = Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: palette.bg,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: palette.border || 'rgba(128,128,128,0.2)' }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color={palette.text} />
          </TouchableOpacity>

          <View style={styles.titleArea}>
            <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
              {bookTitle}
            </Text>
            <Text style={[styles.subtitle, { color: palette.muted }]}>
              {totalPages} Pages · Current: Page {currentPage}
            </Text>
          </View>
        </View>

        {/* Thumbnail Grid */}
        <FlatList
          data={pages}
          keyExtractor={(p) => `page-${p}`}
          numColumns={3}
          contentContainerStyle={styles.gridContent}
          initialScrollIndex={Math.max(0, Math.min(currentPage - 1, totalPages - 1))}
          getItemLayout={(_, index) => ({
            length: itemWidth * 1.45 + 16,
            offset: (itemWidth * 1.45 + 16) * Math.floor(index / 3),
            index,
          })}
          renderItem={({ item: pageNum }) => {
            const isCurrent = pageNum === currentPage;

            return (
              <TouchableOpacity
                style={[
                  styles.pageCard,
                  {
                    width: itemWidth,
                    height: itemWidth * 1.4,
                    backgroundColor: palette.surface,
                    borderColor: isCurrent
                      ? palette.link || (isDark ? '#C9B8FF' : '#4C4666')
                      : palette.border || 'rgba(128,128,128,0.2)',
                    borderWidth: isCurrent ? 2.5 : 1,
                  },
                ]}
                onPress={() => {
                  onSelectPage(pageNum);
                  onClose();
                }}
                activeOpacity={0.75}
              >
                {/* Simulated page content placeholder / page icon */}
                <View style={styles.pageBody}>
                  <Ionicons
                    name="document-text-outline"
                    size={28}
                    color={isCurrent ? palette.link : palette.muted}
                  />
                  <Text style={[styles.pageIndicator, { color: palette.text }]}>
                    Page {pageNum}
                  </Text>
                </View>

                {isCurrent && (
                  <View style={[styles.currentBadge, { backgroundColor: palette.link }]}>
                    <Text style={[styles.currentBadgeText, { color: isDark ? '#1A1A1D' : '#FFFFFF' }]}>
                      Current
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  gridContent: {
    padding: 12,
    gap: 12,
  },
  pageCard: {
    borderRadius: 8,
    marginHorizontal: 4,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    elevation: 2,
  },
  pageBody: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  pageIndicator: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
  },
  currentBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
});
