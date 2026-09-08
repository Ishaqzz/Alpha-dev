import React, { useEffect, useState } from 'react';
// Firebase Auth imports removed

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Drawer } from 'expo-router/drawer';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme, LogBox, View, ActivityIndicator, Text, Image, Animated, Easing } from 'react-native';
import * as Updates from 'expo-updates';
import CustomSidebar from '@/components/CustomSidebar';

// Suppress third-party deprecation warnings that originate inside node_modules
// and cannot be fixed in our own code.
LogBox.ignoreLogs([
  'InteractionManager has been deprecated',
  'InteractionManager.runAfterInteractions',
]);

/**
 * Shared gesture options applied to EVERY Drawer.Screen.
 *
 * swipeEdgeWidth        – 100 px from the left edge triggers the open gesture.
 *                         Wide enough to be reliable even on screens that have
 *                         horizontal ScrollViews starting slightly in from the edge.
 * swipeMinDistance      – Minimum travel (10 px) before the drawer commits to
 *                         opening or closing. Prevents accidental triggers.
 * swipeVelocityThreshold– Fast flick (500 px/s) opens/closes the drawer even
 *                         when the absolute travel distance is short.
 * gestureEnabled        – Explicitly true so the drawer intercepts edge touches
 *                         before any child ScrollView or FlatList can consume them.
 */
const GESTURE_OPTIONS = {
  headerShown: false,
  drawerType: 'slide' as const,
  gestureEnabled: true,
  swipeEdgeWidth: 100,
  swipeMinDistance: 10,
  swipeVelocityThreshold: 500,
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [authReady, setAuthReady] = useState(true);
  const [scaleAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Breathing animation for the logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.08,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  // ── OTA Updates: silently check, download, and apply on next restart ──
  useEffect(() => {
    async function checkForOTAUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          console.log('📦 OTA update available, downloading...');
          await Updates.fetchUpdateAsync();
          console.log('✅ OTA update downloaded. It will be applied on next app restart.');
        } else {
          console.log('✅ App is up to date.');
        }
      } catch (e) {
        // Silently handle errors — updates are not critical for app operation.
        // Common case: this runs in dev mode where Updates API is unavailable.
        console.log('ℹ️ OTA update check skipped:', e instanceof Error ? e.message : e);
      }
    }

    if (authReady) {
      checkForOTAUpdate();
    }
  }, [authReady]);

  if (!authReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <Animated.Image 
          source={require('../../assets/images/logo.jpeg')} 
          style={{ width: 140, height: 140, marginBottom: 24, transform: [{ scale: scaleAnim }] }} 
          resizeMode="contain" 
        />
        <ActivityIndicator size="large" color="#DEB841" />
        <Text style={{ marginTop: 16, color: '#DEB841', fontWeight: '800', fontSize: 18, letterSpacing: 1 }}>ALPHA WEAR</Text>
        <Text style={{ marginTop: 6, color: '#6B7280', fontWeight: '600', fontSize: 13 }}>Securing Data...</Text>
      </View>
    );
  }

  return (
    // flex: 1 + width/height 100% ensures GestureHandlerRootView never clips
    // the touch-sensor area, which would silently swallow edge swipes.
    <GestureHandlerRootView style={{ flex: 1, width: '100%', height: '100%' }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Drawer
          drawerContent={(props) => <CustomSidebar {...props} />}
          screenOptions={GESTURE_OPTIONS}
          backBehavior="history"
        >
          {/* ── Visible drawer items ─────────────────────────────────────── */}
          <Drawer.Screen
            name="index"
            options={{ title: 'Dashboard' }}
          />
          <Drawer.Screen
            name="analytics"
            options={{ title: 'Analytics' }}
          />
          <Drawer.Screen
            name="new-bill"
            options={{ title: 'New Bill' }}
          />
          <Drawer.Screen
            name="customers"
            options={{ title: 'Customers' }}
          />
          {/* Screens below contain horizontal ScrollViews (data tables).
              gestureEnabled is already set globally via GESTURE_OPTIONS,
              ensuring the drawer retains priority over the 100 px left-edge
              zone even when those ScrollViews consume horizontal touches. */}
          <Drawer.Screen
            name="products"
            options={{ title: 'Products' }}
          />
          <Drawer.Screen
            name="stock-inventory"
            options={{ title: 'Stock Inventory' }}
          />
          <Drawer.Screen
            name="history"
            options={{ title: 'History' }}
          />
          <Drawer.Screen
            name="recycle-bin"
            options={{ title: 'Recycle Bin' }}
          />

          {/* ── Hidden drawer items (no sidebar link) ────────────────────── */}
          <Drawer.Screen
            name="invoice-view"
            options={{
              title: 'Invoice View',
              drawerItemStyle: { display: 'none' },
            }}
          />
          <Drawer.Screen
            name="bill-preview"
            options={{
              title: 'Bill Preview',
              drawerItemStyle: { display: 'none' },
            }}
          />
          <Drawer.Screen
            name="admin"
            options={{
              title: 'Admin Settings',
              drawerItemStyle: { display: 'none' },
            }}
          />
        </Drawer>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

