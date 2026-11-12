import React from 'react';
import { Pressable, ViewStyle, AccessibilityRole } from 'react-native';
import { useTheme } from '@/theme';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
}

const paddingStylesMap = {
  none: {},
  sm: { padding: 8 },
  md: { padding: 16 },
  lg: { padding: 24 },
} as const;

export const Card = React.forwardRef<React.ElementRef<typeof Pressable>, CardProps>(
  (
    { children, style, variant = 'default', padding = 'md', onPress, onLongPress, accessibilityLabel, accessibilityRole, ...props },
    ref
  ) => {
    const theme = useTheme();

    const variantStyles = {
      default: {
        backgroundColor: theme.colors.card,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      elevated: {
        backgroundColor: theme.colors.card,
        ...theme.shadows.md,
      },
      outlined: {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
    };

    return (
      <Pressable
        ref={ref}
        style={[
          { borderRadius: 16, overflow: 'hidden' },
          variantStyles[variant],
          paddingStylesMap[padding],
          style,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole ?? (onPress ? 'button' : undefined)}
        onPress={onPress}
        onLongPress={onLongPress}
        {...props}
      >
        {children}
      </Pressable>
    );
  }
);

Card.displayName = 'Card';