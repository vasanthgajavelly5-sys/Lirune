import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeContext } from '@/theme/ThemeContext';

export default function NotFoundScreen() {
  const router = useRouter();
  const { colors } = useThemeContext();

  useEffect(() => {
    // Gracefully fallback to home tabs if an external file URI causes an unmatched route
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 150);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}
