/**
 * Lirune Reader Mobile — Lirune Themed Dialog & Confirmation Component
 * Replaces generic Android/Material Alert.alert with calm, elegant Lirune surfaces.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

export interface LiruneDialogAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
}

export interface LiruneDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  actions?: LiruneDialogAction[];
  children?: React.ReactNode;
}

export function LiruneDialog({
  visible,
  title,
  message,
  icon,
  iconColor,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
  actions,
  children,
}: LiruneDialogProps) {
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';

  if (!visible) return null;

  const defaultActions: LiruneDialogAction[] = [];
  if (onCancel) {
    defaultActions.push({
      label: cancelText,
      onPress: onCancel,
      variant: 'secondary',
    });
  }
  if (onConfirm) {
    defaultActions.push({
      label: confirmText,
      onPress: onConfirm,
      variant: isDestructive ? 'destructive' : 'primary',
    });
  }

  const dialogActions = actions || defaultActions;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[
            styles.dialogContainer,
            {
              backgroundColor: isDark ? '#1C1C22' : '#FFFFFF',
              borderColor: colors.borderSubtle,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Icon */}
          {icon && (
            <View
              style={[
                styles.iconCircle,
                {
                  backgroundColor: isDestructive
                    ? 'rgba(255, 107, 107, 0.12)'
                    : colors.accentSoft,
                },
              ]}
            >
              <Ionicons
                name={icon}
                size={28}
                color={
                  iconColor || (isDestructive ? colors.error : colors.accent)
                }
              />
            </View>
          )}

          {/* Title & Message */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {message ? (
            <Text style={[styles.message, { color: colors.textSecondary }]}>
              {message}
            </Text>
          ) : null}

          {/* Custom Body Content */}
          {children ? <View style={styles.body}>{children}</View> : null}

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {dialogActions.map((action, index) => {
              const isPrimary = action.variant === 'primary';
              const isDestruct = action.variant === 'destructive';
              const isGhost = action.variant === 'ghost';

              let btnBg: string = 'transparent';
              let btnBorder: string = colors.borderSubtle;
              let textColor: string = colors.text;

              if (isPrimary) {
                btnBg = colors.accent;
                btnBorder = colors.accent;
                textColor = colors.accentForeground;
              } else if (isDestruct) {
                btnBg = colors.error;
                btnBorder = colors.error;
                textColor = '#FFFFFF';
              } else if (isGhost) {
                btnBg = 'transparent';
                btnBorder = 'transparent';
                textColor = colors.textSecondary;
              } else {
                // Secondary / Cancel
                btnBg = colors.surfaceElevated;
                btnBorder = colors.borderSubtle;
                textColor = colors.text;
              }

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.actionButton,
                    {
                      backgroundColor: btnBg,
                      borderColor: btnBorder,
                    },
                    dialogActions.length > 2 && { marginBottom: 8, flex: undefined, width: '100%' },
                  ]}
                  onPress={action.onPress}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.actionText,
                      { color: textColor, fontWeight: isPrimary || isDestruct ? '700' : '600' },
                    ]}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    borderWidth: 1,
    padding: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  body: {
    marginBottom: 18,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionText: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
});
