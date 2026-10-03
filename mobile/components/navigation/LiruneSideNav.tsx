/**
 * Lirune Reader Mobile — Lirune Side Navigation System
 * Replaces generic bottom tabs with Lirune's authentic side navigation.
 * Slide-out drawer on phones; persistent side rail on larger screens / tablets.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  useWindowDimensions,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useThemeContext } from '@/theme/ThemeContext';

interface NavigationContextType {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  isWideScreen: boolean;
}

const NavigationContext = createContext<NavigationContextType>({
  isDrawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  toggleDrawer: () => {},
  isWideScreen: false,
});

export const useLiruneNavigation = () => useContext(NavigationContext);

interface NavItem {
  id: string;
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}

export function isNavRouteActive(route: string, pathname: string): boolean {
  const cleanPath = (pathname || '').replace(/\/$/, '') || '/';

  if (route === '/' || route === '/index') {
    return cleanPath === '/' || cleanPath === '/(tabs)' || cleanPath === '/(tabs)/index';
  }

  const segment = route.replace(/^\//, '');
  return (
    cleanPath === `/${segment}` ||
    cleanPath === `/(tabs)/${segment}` ||
    cleanPath.startsWith(`/${segment}/`) ||
    cleanPath.startsWith(`/(tabs)/${segment}/`)
  );
}

const NAV_ITEMS: NavItem[] = [
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
  {
    id: 'about',
    label: 'About',
    route: '/about',
    icon: 'sparkles-outline',
    activeIcon: 'sparkles',
  },
];

const WIDE_SCREEN_OFF_DP = 640;
const WIDE_SCREEN_ON_DP = 680;

export function LiruneNavigationProvider({ children }: { children: React.ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { width } = useWindowDimensions();
  const [isWideScreen, setIsWideScreen] = useState(width >= WIDE_SCREEN_ON_DP);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [width]);

  // Hysteresis: a window sitting between the two thresholds must not flip the
  // navigation between rail and drawer while a rotation animation reports a
  // stream of intermediate widths.
  useEffect(() => {
    setIsWideScreen((previous) =>
      previous ? width >= WIDE_SCREEN_OFF_DP : width >= WIDE_SCREEN_ON_DP
    );
  }, [width]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  // Hardware Android Back button closes drawer first
  useEffect(() => {
    if (!isDrawerOpen) return;

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsDrawerOpen(false);
      return true;
    });

    return () => backHandler.remove();
  }, [isDrawerOpen]);

  return (
    <NavigationContext.Provider
      value={{ isDrawerOpen, openDrawer, closeDrawer, toggleDrawer, isWideScreen }}
    >
      <View style={styles.providerContainer}>
        {isWideScreen && <LiruneSideRail />}
        <View style={styles.mainContentArea}>{children}</View>
        {!isWideScreen && (
          <LiruneSlideDrawer
            isOpen={isDrawerOpen}
            onClose={closeDrawer}
          />
        )}
      </View>
    </NavigationContext.Provider>
  );
}

/**
 * Top bar burger button for opening the Lirune drawer on mobile
 */
export function LiruneNavButton({ style }: { style?: any }) {
  const { toggleDrawer } = useLiruneNavigation();
  const { colors } = useThemeContext();

  return (
    <TouchableOpacity
      style={[styles.menuButton, { backgroundColor: colors.surfaceElevated }, style]}
      onPress={toggleDrawer}
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
    >
      <Ionicons name="menu" size={22} color={colors.text} />
    </TouchableOpacity>
  );
}

/**
 * Slide-out drawer for phones
 */
function LiruneSlideDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { colors, scheme, toggleScheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();

  const [isRendered, setIsRendered] = useState(isOpen);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
    }
    Animated.timing(anim, {
      toValue: isOpen ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !isOpen) {
        setIsRendered(false);
      }
    });
  }, [isOpen, anim]);

  if (!isRendered && !isOpen) return null;

  const drawerWidth = Math.min(320, windowWidth * 0.82);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-drawerWidth, 0],
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.65],
  });

  const handleNavigate = (route: string) => {
    onClose();
    if (route === '/') {
      router.replace('/(tabs)');
    } else {
      router.replace(`/(tabs)${route}` as any);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer Container */}
      <Animated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            backgroundColor: isDark ? '#18181D' : '#FFFFFF',
            borderRightColor: colors.borderSubtle,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={[styles.brandIconOrb, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="bookmark" size={22} color={colors.accent} />
          </View>
          <View style={styles.brandInfo}>
            <Text style={[styles.brandTitle, { color: colors.text }]}>Lirune Reader</Text>
            <Text style={[styles.brandTagline, { color: colors.textMuted }]}>
              A calm home for your books
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

        {/* Separate Rounded Navigation Tiles */}
        <View style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const isActive = isNavRouteActive(item.route, pathname);

            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.navItem,
                  {
                    backgroundColor: isActive
                      ? isDark
                        ? 'rgba(238, 236, 248, 0.12)'
                        : 'rgba(76, 70, 102, 0.1)'
                      : 'transparent',
                    borderColor: isActive ? colors.accent : 'transparent',
                  },
                ]}
                onPress={() => handleNavigate(item.route)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.navItemIcon,
                    {
                      backgroundColor: isActive
                        ? colors.accentSoft
                        : isDark
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(0,0,0,0.03)',
                    },
                  ]}
                >
                  <Ionicons
                    name={isActive ? item.activeIcon : item.icon}
                    size={20}
                    color={isActive ? colors.accent : colors.textSecondary}
                  />
                </View>
                <Text
                  style={[
                    styles.navItemLabel,
                    {
                      color: isActive ? colors.text : colors.textSecondary,
                      fontWeight: isActive ? '700' : '500',
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {isActive && (
                  <View style={[styles.activePill, { backgroundColor: colors.accent }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer Area */}
        <View style={styles.footerArea}>
          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          {/* Theme Mode Toggle Button */}
          <TouchableOpacity
            style={[styles.footerActionBtn, { backgroundColor: colors.surfaceElevated }]}
            onPress={toggleScheme}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isDark ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={colors.text}
            />
            <Text style={[styles.footerActionText, { color: colors.text }]}>
              {isDark ? 'Light Theme' : 'Dark Theme'}
            </Text>
          </TouchableOpacity>


          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            Lirune Reader · v{Constants.expoConfig?.version ?? 'Unknown'}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Persistent Side Rail for wide screens / tablets
 */
function LiruneSideRail() {
  const { colors, scheme, toggleScheme } = useThemeContext();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const handleNavigate = (route: string) => {
    if (route === '/') {
      router.replace('/(tabs)');
    } else {
      router.replace(`/(tabs)${route}` as any);
    }
  };

  return (
    <View
      style={[
        styles.sideRail,
        {
          backgroundColor: isDark ? '#18181D' : '#FFFFFF',
          borderRightColor: colors.borderSubtle,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* Top Brand Logo */}
      <View style={[styles.railLogoOrb, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="bookmark" size={20} color={colors.accent} />
      </View>

      {/* Nav Buttons */}
      <View style={styles.railNavList}>
        {NAV_ITEMS.map((item) => {
          const isActive = isNavRouteActive(item.route, pathname);

          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.railNavItem,
                {
                  backgroundColor: isActive
                    ? isDark
                      ? 'rgba(238, 236, 248, 0.12)'
                      : 'rgba(76, 70, 102, 0.1)'
                    : 'transparent',
                  borderColor: isActive ? colors.accent : 'transparent',
                },
              ]}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.7}
              accessibilityLabel={item.label}
            >
              <Ionicons
                name={isActive ? item.activeIcon : item.icon}
                size={22}
                color={isActive ? colors.accent : colors.textSecondary}
              />
              <Text
                style={[
                  styles.railNavText,
                  {
                    color: isActive ? colors.text : colors.textMuted,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom Rail Actions */}
      <View style={styles.railBottom}>
        <TouchableOpacity
          style={[styles.railIconBtn, { backgroundColor: colors.surfaceElevated }]}
          onPress={toggleScheme}
          accessibilityLabel="Toggle light/dark theme"
        >
          <Ionicons
            name={isDark ? 'sunny-outline' : 'moon-outline'}
            size={18}
            color={colors.text}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  providerContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  mainContentArea: {
    flex: 1,
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 900,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRightWidth: 1,
    zIndex: 950,
    paddingHorizontal: 16,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  brandIconOrb: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandInfo: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  brandTagline: {
    fontSize: 11,
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  navList: {
    flex: 1,
    gap: 8,
    paddingTop: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  navItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItemLabel: {
    fontSize: 15,
    flex: 1,
  },
  activePill: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  footerArea: {
    gap: 10,
    paddingHorizontal: 4,
  },
  footerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
  },
  footerActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  coffeeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  coffeeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  versionText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },

  // Side Rail (Tablets)
  sideRail: {
    width: 84,
    borderRightWidth: 1,
    alignItems: 'center',
    zIndex: 100,
  },
  railLogoOrb: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  railNavList: {
    flex: 1,
    gap: 12,
    width: '100%',
    alignItems: 'center',
  },
  railNavItem: {
    width: 64,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  railNavText: {
    fontSize: 10,
    textAlign: 'center',
  },
  railBottom: {
    gap: 12,
    alignItems: 'center',
  },
  railIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
