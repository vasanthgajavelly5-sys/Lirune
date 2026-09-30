import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    // Gracefully fallback to home tabs if an external file URI causes an unmatched route
    const timer = setTimeout(() => {
      router.replace('/(tabs)');
    }, 150);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#1A1A1D', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#EEECF8" />
    </View>
  );
}
