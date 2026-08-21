import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Image, 
  TouchableOpacity, 
  StyleSheet, 
  Platform, 
  Modal, 
  ScrollView, 
  Pressable 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation, useRouter } from 'expo-router';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

type ProductItem = {
  id: string;
  itemCode: string;
  name: string;
  stock: number;
};

export default function Header() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const router = useRouter();
  const [lowStockItems, setLowStockItems] = useState<ProductItem[]>([]);

  useEffect(() => {
    // Listen to real-time changes in products
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: ProductItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Ignore soft-deleted
        if (data.isActive !== false) {
          const stockValue = Number(data.stock ?? data.stockLevel ?? 0);
          if (stockValue <= 5) {
            items.push({
              id: doc.id,
              itemCode: data.item_code ?? '',
              name: data.name ?? '',
              stock: stockValue,
            });
          }
        }
      });
      setLowStockItems(items);
    });

    return () => unsubscribe();
  }, []);

  const handleNotificationPress = () => {
    router.push({ pathname: '/products', params: { lowStock: 'true' } });
  };

  return (
    <>
      <SafeAreaView style={styles.safeHeader} edges={['top']}>
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => navigation.openDrawer()} style={styles.iconBtn}>
            <MaterialCommunityIcons name="menu" size={26} color="#4B5563" />
          </TouchableOpacity>

          <View style={styles.appBarCenter}>
            <Image
              source={require('../../assets/images/logo.jpeg')}
              style={styles.appBarLogo}
              resizeMode="contain"
            />
            <Text style={styles.appBarText}>ALPHA SPORTS</Text>
          </View>

          <TouchableOpacity style={styles.iconBtn} onPress={handleNotificationPress}>
            <View style={styles.notificationWrapper}>
              <MaterialCommunityIcons name="bell-outline" size={24} color="#4B5563" />
              {lowStockItems.length > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>{lowStockItems.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    zIndex: 50,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: {
    padding: 6,
  },
  appBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appBarLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
  appBarText: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '800',
    color: '#CBA135',
    letterSpacing: 1.5,
  },
  notificationWrapper: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  // Modal & Dropdown Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'flex-end',
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    width: 320,
    maxHeight: 400,
    marginTop: Platform.OS === 'web' ? 70 : 100, // Approximate safe area + app bar height
    marginRight: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  dropdownHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  dropdownTitle: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  dropdownList: {
    maxHeight: 340,
  },
  dropdownItem: {
    padding: 16,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  itemName: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  itemStockText: {
    fontFamily: systemFont,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: systemFont,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});
