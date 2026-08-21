import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { DrawerContentComponentProps } from 'expo-router/drawer';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '../firebaseConfig';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});
type MenuItem = {
  name: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
};

export default function CustomSidebar(props: DrawerContentComponentProps) {
  const { state, navigation } = props;
  const activeRouteName = state.routeNames[state.index];

  const [managerName, setManagerName] = useState('Rahmathulla R');

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'store_config');
    const unsubscribe = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.manager_name) {
            setManagerName(data.manager_name);
          }
        }
      },
      (error) => {
        console.error('Sidebar settings listener error:', error);
      }
    );
    return () => unsubscribe();
  }, []);

  const menuItems: MenuItem[] = [
    { name: 'index', icon: 'gauge', label: 'Dashboard' },
    { name: 'analytics', icon: 'chart-line', label: 'Analytics' },
    { name: 'new-bill', icon: 'receipt', label: 'New Bill' },
    { name: 'customers', icon: 'account-group', label: 'Customers' },
    { name: 'products', icon: 'package-variant-closed', label: 'Products' },
    { name: 'stock-inventory', icon: 'warehouse', label: 'Stock Inventory' },
    { name: 'history', icon: 'history', label: 'History' },
    { name: 'recycle-bin', icon: 'trash-can-outline', label: 'Recycle Bin' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerPattern} />

        {/* Logo Container */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/images/logo.jpeg')}
            style={styles.logo}
            defaultSource={require('../../assets/images/favicon.png')}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.brandTitle}>ALPHA SPORTS WEAR</Text>
        <Text style={styles.brandSubtitle}>EST. 2026</Text>
      </View>

      {/* Navigation List - Scrollable */}
      <ScrollView contentContainerStyle={styles.listContainer} showsVerticalScrollIndicator={false}>
        {menuItems.map((item) => {
          // Compare route names correctly. 
          // For expo-router, index maps to 'index', but could have different structures depending on routing.
          const isActive = activeRouteName === item.name || (activeRouteName === 'index' && item.name === 'index');
          return (
            <TouchableOpacity
              key={item.name}
              style={[
                styles.navItem,
                isActive ? styles.navItemActive : styles.navItemInactive
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate(item.name);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={item.icon}
                size={22}
                color={isActive ? '#000000' : '#4B5563'}
                style={styles.navIcon}
              />
              <Text
                style={[
                  styles.navLabel,
                  isActive ? styles.navLabelActive : styles.navLabelInactive
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer Section */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.profileContainer}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            props.navigation.closeDrawer();
            router.push('/admin');
          }}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            <Image
              source={require('../../assets/images/logo.jpeg')}
              style={styles.avatar}
              defaultSource={require('../../assets/images/favicon.png')}
              resizeMode="contain"
            />
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.profileName} numberOfLines={1}>{managerName}</Text>
            <Text style={styles.profileRole}>Store Manager</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAF9F6', // Off-white clean background for logo
    position: 'relative',
    overflow: 'hidden',
  },
  headerPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.05,
    backgroundColor: '#DEB841', // Brand Gold tint
  },
  logoContainer: {
    width: 100,
    height: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    padding: 8,
    marginBottom: 16,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontFamily: systemFont,
    fontSize: 22, // Increased from 18
    fontWeight: 'bold',
    color: '#DEB841', // Brand Gold
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    color: '#9CA3AF',
    letterSpacing: 3,
    fontWeight: '600',
  },
  listContainer: {
    paddingTop: 16,
    paddingHorizontal: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  navItemActive: {
    backgroundColor: '#DEB841', // Brand Gold
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  navItemInactive: {
    backgroundColor: 'transparent',
  },
  navIcon: {
    marginRight: 16,
  },
  navLabel: {
    fontFamily: systemFont,
    fontSize: 18, // Increased from 16
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#000000', // Black text on Gold background for contrast
  },
  navLabelInactive: {
    color: '#4B5563', // Dark grey
  },
  footer: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#DEB841', // Brand Gold border for avatar
    padding: 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  profileDetails: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  profileName: {
    fontFamily: systemFont,
    fontSize: 17, // Increased from 15
    fontWeight: 'bold',
    color: '#1F2937',
  },
  profileRole: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    color: '#6B7280',
    marginTop: 2,
  },
});

