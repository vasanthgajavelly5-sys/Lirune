import React from 'react';
import { Pressable, Text, View, StyleSheet, ViewStyle, AccessibilityProps, ColorValue } from 'react-native';
import { useTheme } from '@/theme';

export interface ButtonProps extends AccessibilityProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}

export const Button = React.forwardRef<React.ElementRef<typeof Pressable>, ButtonProps>(
  (
    {
      title,
      onPress,
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      disabled = false,
      loading = false,
      leftIcon,
      rightIcon,
      style,
      accessibilityLabel,
      accessibilityHint,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();
    const isDark = theme.isDark;

    const baseStyles = StyleSheet.create({
      base: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.borderRadius.lg,
        flex: fullWidth ? 1 : 0,
        minHeight: size === 'sm' ? 36 : size === 'lg' ? 52 : 44,
        paddingHorizontal: size === 'sm' ? 12 : size === 'lg' ? 24 : 16,
        gap: 8,
      },
      primary: {
        backgroundColor: theme.colors.accent,
      },
      secondary: {
        backgroundColor: theme.colors.accentSoft,
        borderWidth: 1,
        borderColor: theme.colors.accent,
      },
      outline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      ghost: {
        backgroundColor: 'transparent',
      },
      destructive: {
        backgroundColor: theme.colors.error,
      },
      disabled: {
        opacity: 0.5,
      },
      loading: {
        opacity: 0.7,
      },
    });

    const textStyles = StyleSheet.create({
      primary: { color: isDark ? '#1A1A1D' : '#FFFFFF' },
      secondary: { color: theme.colors.accent },
      outline: { color: theme.colors.text },
      ghost: { color: theme.colors.text },
      destructive: { color: '#FFFFFF' },
      disabled: { opacity: 0.6 },
    });

    const variantStyle = baseStyles[variant] || baseStyles.primary;
    const disabledStyle = disabled ? baseStyles.disabled : {};
    const loadingStyle = loading ? baseStyles.loading : {};

    const textColor = (textStyles[variant] || textStyles.primary).color as ColorValue;

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        disabled={disabled || loading}
        style={[
          baseStyles.base,
          variantStyle,
          disabledStyle,
          loadingStyle,
          style,
        ]}
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading }}
        {...props}
      >
        {loading && (
          <View
            style={[
              styles.spinner,
              { borderColor: textColor as ColorValue },
            ]}
            accessibilityHint="Loading"
          />
        )}
        {!loading && leftIcon && <View style={styles.iconWrapper}>{leftIcon}</View>}
        <Text
          style={[
            styles.buttonText,
            { color: textColor as ColorValue },
            size === 'sm' ? styles.textSm : size === 'lg' ? styles.textLg : styles.textMd,
          ]}
        >
          {title}
        </Text>
        {!loading && rightIcon && <View style={styles.iconWrapper}>{rightIcon}</View>}
      </Pressable>
    );
  }
);

const styles = StyleSheet.create({
  buttonText: {
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
  },
  textSm: { fontSize: 12, lineHeight: 16 },
  textMd: { fontSize: 14, lineHeight: 20 },
  textLg: { fontSize: 16, lineHeight: 24 },
  iconWrapper: { flexShrink: 0 },
  spinner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderTopColor: 'transparent',
  },
});

Button.displayName = 'Button';