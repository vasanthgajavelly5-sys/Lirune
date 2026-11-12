/**
 * Lirune Reader Mobile — Import Queue Pill
 * Floating pill that shows import progress for all active/recently finished imports.
 * Tapping opens a modal sheet with per-file status rows.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useImportQueueStore, QueueItem } from '@/state/importQueueStore';
import { useThemeContext } from '@/theme/ThemeContext';

const AUTO_DISMISS_MS = 3000;

export function ImportQueuePill() {
  const { colors } = useThemeContext();
  const items = useImportQueueStore((s) => s.items);
  const clearCompleted = useImportQueueStore((s) => s.clearCompleted);

  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleAnim = useRef(new Animated.Value(0)).current;

  // Derived state
  const activeItems = items.filter(
    (i) => i.state === 'queued' || i.state === 'importing'
  );
  const readyItems = items.filter((i) => i.state === 'ready');
  const failedItems = items.filter((i) => i.state === 'failed');
  const totalItems = items.length;
  const doneCount = readyItems.length + failedItems.length;

  const isActive = activeItems.length > 0;
  const hasFinished = activeItems.length === 0 && totalItems > 0;
  const allSucceeded = hasFinished && failedItems.length === 0;
  const hasFailed = hasFinished && failedItems.length > 0;

  // Only show pill when there are items in the queue
  const shouldShow = totalItems > 0;

  // Pop-in / pop-out animation
  useEffect(() => {
    if (shouldShow) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 160,
        friction: 10,
      }).start();
    } else {
      Animated.spring(scaleAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 160,
        friction: 10,
      }).start();
    }
  }, [shouldShow, scaleAnim]);

  // Auto-dismiss 3s after all items finish and all are "ready"
  useEffect(() => {
    if (allSucceeded && !isSheetVisible) {
      dismissTimerRef.current = setTimeout(() => {
        clearCompleted();
        setIsSheetVisible(false);
      }, AUTO_DISMISS_MS);
    } else {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [allSucceeded, isSheetVisible, clearCompleted]);

  if (!shouldShow) return null;

  // Pill background color
  let pillBg = colors.accent;
  if (hasFailed) pillBg = colors.error;
  else if (allSucceeded) pillBg = colors.success;

  return (
    <>
      {/* Floating Pill */}
      <Animated.View
        style={[
          styles.pillWrapper,
          { transform: [{ scale: scaleAnim }] },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: pillBg }]}
          onPress={() => setIsSheetVisible(true)}
          activeOpacity={0.85}
          accessibilityLabel={
            isActive
              ? `Importing ${activeItems.length} files`
              : allSucceeded
              ? 'All imports complete'
              : `Import finished with ${failedItems.length} errors`
          }
        >
          {isActive ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.pillText}>
                {doneCount}/{totalItems}
              </Text>
            </>
          ) : allSucceeded ? (
            <Ionicons name="checkmark" size={18} color="#FFFFFF" />
          ) : (
            <Ionicons name="close" size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* Detail Sheet Modal */}
      <Modal
        visible={isSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsSheetVisible(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setIsSheetVisible(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                Import Queue
              </Text>
              <TouchableOpacity
                onPress={() => setIsSheetVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
            >
              {items.map((item) => (
                <ImportQueueRow key={item.id} item={item} colors={colors} />
              ))}
            </ScrollView>

            {/* Footer Actions */}
            {hasFinished && (
              <TouchableOpacity
                style={[styles.dismissBtn, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => {
                  clearCompleted();
                  setIsSheetVisible(false);
                }}
              >
                <Text style={[styles.dismissBtnText, { color: colors.textSecondary }]}>
                  Clear Finished
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Individual Row ───────────────────────────────────────────────────────────

interface RowProps {
  item: QueueItem;
  colors: ReturnType<typeof useThemeContext>['colors'];
}

function ImportQueueRow({ item, colors }: RowProps) {
  const stateIcon = (): React.ReactNode => {
    switch (item.state) {
      case 'queued':
        return <Ionicons name="time-outline" size={18} color={colors.textMuted} />;
      case 'importing':
        return <ActivityIndicator size="small" color={colors.accent} />;
      case 'ready':
        return <Ionicons name="checkmark-circle" size={18} color={colors.success} />;
      case 'failed':
        return <Ionicons name="close-circle" size={18} color={colors.error} />;
    }
  };

  const stateLabel = (): string => {
    switch (item.state) {
      case 'queued': return 'Queued';
      case 'importing': return `Importing${item.progress > 0 ? ` ${item.progress}%` : '…'}`;
      case 'ready': return 'Done';
      case 'failed': return item.error ? `Failed: ${item.error}` : 'Failed';
    }
  };

  const stateColor = (): string => {
    switch (item.state) {
      case 'ready': return colors.success;
      case 'failed': return colors.error;
      default: return colors.textSecondary;
    }
  };

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.borderSubtle },
      ]}
    >
      <View style={styles.rowIcon}>{stateIcon()}</View>
      <View style={styles.rowBody}>
        <Text
          style={[styles.rowName, { color: colors.text }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {item.name}
        </Text>
        <Text style={[styles.rowState, { color: stateColor() }]} numberOfLines={1}>
          {stateLabel()}
        </Text>
        {item.state === 'importing' && item.progress > 0 && (
          <View style={[styles.progressTrack, { backgroundColor: colors.borderSubtle }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.min(100, item.progress)}%`,
                },
              ]}
            />
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pillWrapper: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 28,
    minWidth: 52,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '75%',
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sheetScroll: {
    paddingHorizontal: 20,
  },
  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
    marginTop: 1,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowState: {
    fontSize: 12,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Footer
  dismissBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
