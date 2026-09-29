/**
 * Lirune Reader Mobile — Subtle Floating Status Banner / Toast
 * Quiet, calm feedback following the desktop Lirune status notification pattern.
 */

import React, { useEffect, useState } from 'react';
import {
  Animated,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

export interface LiruneToastProps {
  visible: boolean;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'info' | 'success' | 'warning' | 'error';
  onDismiss?: () => void;
  duration?: number;
}

export function LiruneToast({
  visible,
  message,
  icon = 'checkmark-circle-outline',
  variant = 'info',
  onDismiss,
  duration = 3000,
}: LiruneToastProps) {
  const { colors, scheme } = useThemeContext();
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(20));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onDismiss?.();
        });
      }, duration);

      return () => clearTimeout(timer);
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }
  }, [visible, duration, onDismiss, opacity, translateY]);

  if (!visible) return null;

  const isDark = scheme === 'dark';
  let accentColor: string = colors.accent;
  if (variant === 'success') accentColor = colors.success;
  if (variant === 'error') accentColor = colors.error;
  if (variant === 'warning') accentColor = colors.warning;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          backgroundColor: isDark ? '#23242B' : '#FFFFFF',
          borderColor: colors.borderSubtle,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={accentColor} />
      </View>
      <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    zIndex: 9999,
    maxWidth: '88%',
    gap: 10,
  },
  iconWrap: {
    flexShrink: 0,
  },
  text: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
