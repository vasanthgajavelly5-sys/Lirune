/**
 * Lirune Reader Mobile — Modern Bottom Navigation Tab Bar
 * Displays 1-tap navigation tabs on mobile phones; hides on tablets
 * where persistent LiruneSideRail is active.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';
import { useLiruneNavigation, isNavRouteActive } from '@/components/navigation/LiruneSideNav';

export interface BottomTabItem {
  id: string;
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

export const BOTTOM_TAB_ITEMS: BottomTabItem[] = [
  {
    id: 'library',
    label: 'Library',
    route: '/',
    icon: 'book-outline',
    activeIcon: 'book',
  },
  {
    id: 'collections',
    label: 'Collections',
    route: '/collections',
    icon: 'folder-outline',
    activeIcon: 'folder',
  },
  {
    id: 'files',
    label: 'Files',
    route: '/search',
    icon: 'folder-open-outline',
    activeIcon: 'folder-open',
  },
  {
    id: 'annotations',
    label: 'Annotations',
    route: '/annotations',
    icon: 'create-outline',
    activeIcon: 'create',
  },
  {
    id: 'settings',
    label: 'Settings',
    route: '/settings',
    icon: 'settings-outline',
    activeIcon: 'settings',
  },
];

export function LiruneBottomTabBar() {
  const { isWideScreen } = useLiruneNavigation();
  const { colors, scheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  // On wide screens (tablets), the persistent side rail handles navigation.
  if (isWideScreen) {
    return null;
  }

  const handleNavigate = (route: string) => {
    if (route === '/') {
      router.replace('/(tabs)');
    } else {
      router.replace(`/(tabs)${route}` as any);
    }
  };

  const barBg = isDark ? '#19191E' : '#FFFFFF';
  const borderTop = colors.borderSubtle;
  const bottomPadding = Math.max(insets.bottom, 6);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: barBg,
          borderTopColor: borderTop,
          paddingBottom: bottomPadding,
        },
      ]}
    >
      <View style={styles.tabRow}>
        {BOTTOM_TAB_ITEMS.map((item) => {
          const isActive = isNavRouteActive(item.route, pathname);
          const iconColor = isActive ? colors.accent : colors.textMuted;
          const labelColor = isActive ? colors.accent : colors.textSecondary;

          return (
            <TouchableOpacity
              key={item.id}
              style={styles.tabButton}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${item.label} tab`}
            >
              <View
                style={[
                  styles.iconContainer,
                  isActive && {
                    backgroundColor: isDark
                      ? 'rgba(201, 184, 255, 0.12)'
                      : 'rgba(76, 70, 102, 0.08)',
                  },
                ]}
              >
                <Ionicons
                  name={isActive ? item.activeIcon : item.icon}
                  size={20}
                  color={iconColor}
                />
              </View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: labelColor,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 6,
    paddingHorizontal: 8,
    height: 56,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  iconContainer: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: -0.1,
  },
});
