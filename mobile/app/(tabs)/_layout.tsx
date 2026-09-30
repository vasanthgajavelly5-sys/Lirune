/**
 * Lirune Reader Mobile — Main Navigation Layout
 * Powered by Lirune's Side Navigation System (slide drawer on phone, persistent rail on tablet)
 */

import React from 'react';
import { Tabs } from 'expo-router';
import { LiruneNavigationProvider } from '@/components/navigation/LiruneSideNav';

export default function TabLayout() {
  return (
    <LiruneNavigationProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Generic bottom tab bar completely removed
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Library',
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="collections"
          options={{
            title: 'Collections',
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Files',
          }}
        />
        <Tabs.Screen
          name="annotations"
          options={{
            title: 'Annotations',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: 'About',
          }}
        />
      </Tabs>
    </LiruneNavigationProvider>
  );
}