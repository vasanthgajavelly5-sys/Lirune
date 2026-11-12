/**
 * Lirune Reader Mobile — Folders Breadcrumb Bar
 * Horizontally scrollable breadcrumb navigation with jump-to-segment and copy-path on long-press.
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

export interface BreadcrumbSegment {
  docId: string;
  name: string;
}

interface BreadcrumbBarProps {
  segments: BreadcrumbSegment[];
  onSelectSegment: (index: number) => void;
  onGoHome: () => void;
}

export function BreadcrumbBar({
  segments,
  onSelectSegment,
  onGoHome,
}: BreadcrumbBarProps) {
  const { colors } = useThemeContext();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Auto-scroll to end on navigation
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [segments.length]);

  const handleLongPress = async () => {
    const fullPath = segments.map((s) => s.name).join('/');
    try {
      await Share.share({
        title: 'Folder Path',
        message: fullPath,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
      <TouchableOpacity
        style={styles.homeBtn}
        onPress={onGoHome}
        accessibilityRole="button"
        accessibilityLabel="Locations root"
      >
        <Ionicons name="home-outline" size={18} color={colors.accent} />
      </TouchableOpacity>

      <Text style={[styles.separator, { color: colors.textMuted }]}>/</Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {segments.map((seg, idx) => {
          const isLast = idx === segments.length - 1;
          return (
            <React.Fragment key={`${seg.docId}-${idx}`}>
              <TouchableOpacity
                style={[styles.segmentBtn, isLast && styles.activeSegmentBtn]}
                onPress={() => onSelectSegment(idx)}
                onLongPress={handleLongPress}
                disabled={isLast}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${seg.name}`}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: isLast ? colors.text : colors.textSecondary },
                    isLast && styles.activeSegmentText,
                  ]}
                  numberOfLines={1}
                >
                  {seg.name}
                </Text>
              </TouchableOpacity>
              {!isLast && (
                <Text style={[styles.separator, { color: colors.textMuted }]}>/</Text>
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
  },
  homeBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 16,
  },
  segmentBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: 160,
  },
  activeSegmentBtn: {
    backgroundColor: 'transparent',
  },
  segmentText: {
    fontSize: 14,
  },
  activeSegmentText: {
    fontWeight: '600',
  },
  separator: {
    marginHorizontal: 4,
    fontSize: 14,
  },
});
