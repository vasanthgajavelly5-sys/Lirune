/**
 * Lirune Reader Mobile — AppThemeSwitch
 * Sliding transition switch matching the Windows desktop library view (.app-theme-switch).
 */

import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemeColors } from '@/theme/Colors';

interface AppThemeSwitchProps {
  isDark: boolean;
  onToggle: () => void;
  colors: ThemeColors;
  compact?: boolean;
}

export function AppThemeSwitch({ isDark, onToggle, colors, compact }: AppThemeSwitchProps) {
  // 0 = Light mode (left), 44 = Dark mode (right)
  const travelDistance = compact ? 26 : 42;
  const thumbAnim = useRef(new Animated.Value(isDark ? travelDistance : 0)).current;

  useEffect(() => {
    Animated.spring(thumbAnim, {
      toValue: isDark ? travelDistance : 0,
      tension: 160,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [isDark, travelDistance, thumbAnim]);

  if (compact) {
    return (
      <TouchableOpacity
        style={[
          styles.compactTrack,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.borderSubtle,
          },
        ]}
        onPress={onToggle}
        activeOpacity={0.8}
        accessibilityRole="switch"
        accessibilityLabel="Toggle light and dark mode"
        accessibilityState={{ checked: isDark }}
      >
        <Animated.View
          style={[
            styles.compactThumb,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              transform: [{ translateX: thumbAnim }],
            },
          ]}
        >
          <Ionicons
            name={isDark ? 'moon' : 'sunny'}
            size={12}
            color={isDark ? colors.accent : colors.warning}
          />
        </Animated.View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.switchContainer,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.85}
      accessibilityRole="switch"
      accessibilityLabel="Switch light and dark mode"
      accessibilityState={{ checked: isDark }}
    >
      <View style={styles.track}>
        {/* Animated Sliding Thumb */}
        <Animated.View
          style={[
            styles.thumb,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              transform: [{ translateX: thumbAnim }],
            },
          ]}
        />

        {/* Sun Icon (Left) */}
        <View style={[styles.iconSlot, styles.sunSlot, { opacity: isDark ? 0.45 : 1 }]}>
          <Ionicons
            name="sunny"
            size={15}
            color={colors.warning}
            style={styles.iconGlyph}
          />
        </View>

        {/* Moon Icon (Right) */}
        <View style={[styles.iconSlot, styles.moonSlot, { opacity: isDark ? 1 : 0.45 }]}>
          <Ionicons
            name="moon"
            size={14}
            color={colors.accent}
            style={styles.iconGlyph}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  switchContainer: {
    width: 80,
    height: 38,
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  track: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  iconSlot: {
    position: 'absolute',
    top: 0,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  sunSlot: {
    left: 0,
  },
  moonSlot: {
    right: 0,
  },
  iconGlyph: {
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  compactTrack: {
    width: 54,
    height: 28,
    borderRadius: 14,
    padding: 2,
    borderWidth: 1,
    justifyContent: 'center',
  },
  compactThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

