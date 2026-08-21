import Header from '@/components/Header';
import SecureDeleteModal from '@/components/SecureDeleteModal';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl
} from 'react-native';
import { db } from '../firebaseConfig';
import { useProducts } from '../hooks/useProducts';

const { width } = Dimensions.get('window');

// ── Web Fallback Font for Symmetrical Browser Display ──
const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

// ── Strict widths for mathematical layout ──
const tableColumnWidths = {
  id: 100,
  name: 155,
  purchasePrice: 125,
  sellingPrice: 125,
  stockLevel: 75,
  status: 105,
  action: 75,
};

type StockItem = {
  id: string;
  itemCode: string;
  name: string;
  purchasePrice: number;
  sellingPrice: number;
  stockLevel: number;
  size: string;
};

export default function StockInventoryScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();
  const [searchQuery, setSearchQuery] = useState('');
  const [secureDeleteTarget, setSecureDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Dynamic Firestore State (using shared hook) ───────────────────────────
  const { products, loading, fetchProducts } = useProducts();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProducts();
    });
    return unsubscribe;
  }, [navigation, fetchProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Derived state to map standardized hook product schema to StockItem layout variables
  const stockItems: StockItem[] = products.map((item) => ({
    id: item.id,
    itemCode: item.itemCode,
    name: item.name,
    purchasePrice: item.purchasePrice,
    sellingPrice: item.sellingPrice,
    stockLevel: item.stock,
    size: item.size,
  }));

  const handleDeleteItem = (id: string) => {
    const item = stockItems.find(i => i.id === id);
    if (!item) {
      Alert.alert('Error', `Item not found locally: ${id}`);
      return;
    }
    setSecureDeleteTarget({ id, name: item.name });
  };

  const executeDelete = async (id: string) => {
    try {
      await updateDoc(doc(db, 'products', id), {
        isActive: false,
        deleted_at: serverTimestamp()
      });
      fetchProducts();
    } catch (error: any) {
      console.error('Error deleting stock item: ', error);
      Alert.alert('Error', `Could not delete item: ${error.message || error}`);
    }
  };

  const filteredItems = searchQuery
    ? stockItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : stockItems;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProducts();
    setRefreshing(false);
  }, [fetchProducts]);

  return (
    <View style={styles.root} {...swipeHandlers}>
      {/* ── Global Header Component ── */}
      <Header />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DEB841']} />
        }
      >

        {/* ── Title ── */}
        <Text style={styles.mainTitle}>Stock Inventory</Text>

        {/* ── Mobile Responsive Search Bar ── */}
        <View style={styles.searchCard}>
          <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchBarInput}
            placeholder="Search products..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* ── Horizontally Scrollable Table Card ── */}
        <View style={styles.tableCard}>
          <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>

              {/* Header Row */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.id }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>ITEM CODE</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.name }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>PRODUCT NAME</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.purchasePrice }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>PURCHASE PRICE</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.sellingPrice }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>SELLING PRICE</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.stockLevel }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>STOCK</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.status }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>STATUS</Text>
                </View>

                <View style={[styles.thCellContainer, styles.lastCell, styles.cellCenter, { width: tableColumnWidths.action }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>ACTION</Text>
                </View>
              </View>

              {/* Data Rows */}
              {loading ? (
                // ── Loading State ──────────────────────────────────────────
                <View style={styles.emptyTableState}>
                  <ActivityIndicator size="small" color="#DEB841" />
                  <Text style={[styles.emptyTableText, { marginTop: 8 }]}>Loading inventory...</Text>
                </View>
              ) : filteredItems.length > 0 ? (
                filteredItems.map((row, index) => (
                  <View 
                    key={row.id} 
                    style={[
                      styles.tableDataRow,
                      index % 2 === 1 && styles.tableDataRowEven
                    ]}
                  >

                    {/* ID */}
                    <View style={[styles.tdCellContainer, { width: tableColumnWidths.id }]}>
                      <Text style={styles.tdIdText}>{row.itemCode ?? row.id}</Text>
                    </View>

                    {/* Product Name */}
                    <View style={[styles.tdCellContainer, { width: tableColumnWidths.name }]}>
                      <Text style={styles.tdNameText} numberOfLines={2}>{row.name}</Text>
                    </View>

                    {/* Purchase Price */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.purchasePrice }]}>
                      <Text style={[styles.tdPriceText, { textAlign: 'center' }]}>
                        ₹{Number(row.purchasePrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {/* Selling Price */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.sellingPrice }]}>
                      <Text style={[styles.tdPriceText, styles.tdSellingPriceText, { textAlign: 'center' }]}>
                        ₹{Number(row.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {/* Stock Level */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.stockLevel }]}>
                      <Text style={[styles.tdStockText, Number(row.stockLevel) <= 5 && styles.tdStockTextLow]}>
                        {row.stockLevel}
                      </Text>
                    </View>

                    {/* Status Badge */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.status }]}>
                      {Number(row.stockLevel) <= 5 ? (
                        <View style={[styles.statusBadge, styles.badgeLowStock]}>
                          <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#DC2626" style={{ marginRight: 3 }} />
                          <Text style={[styles.badgeText, styles.textLowStock]}>Low Stock</Text>
                        </View>
                      ) : (
                        <View style={[styles.statusBadge, styles.badgeInStock]}>
                          <MaterialCommunityIcons name="check-circle-outline" size={12} color="#059669" style={{ marginRight: 3 }} />
                          <Text style={[styles.badgeText, styles.textInStock]}>In Stock</Text>
                        </View>
                      )}
                    </View>

                    {/* Action - Delete Button */}
                    <View style={[styles.tdCellContainer, styles.lastCell, styles.cellCenter, { width: tableColumnWidths.action }]}>
                      <TouchableOpacity 
                        onPress={() => handleDeleteItem(row.id)} 
                        activeOpacity={0.7} 
                        style={styles.actionIconBtn} 
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      >
                        <MaterialCommunityIcons name="trash-can-outline" size={17} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                // ── Empty / No-Results State ───────────────────────────────
                <View style={styles.emptyTableState}>
                  <Text style={styles.emptyTableText}>
                    {searchQuery ? 'No stock items match your search.' : 'No inventory items found.'}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Secure Delete Modal ── */}
      <SecureDeleteModal
        visible={secureDeleteTarget !== null}
        actionLabel={secureDeleteTarget ? `Delete "${secureDeleteTarget.name}"` : ''}
        onVerified={() => {
          if (secureDeleteTarget) executeDelete(secureDeleteTarget.id);
          setSecureDeleteTarget(null);
        }}
        onCancel={() => setSecureDeleteTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Clean white background
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchBarInput: {
    fontFamily: systemFont,
    flex: 1,
    fontSize: 15,
    color: '#111827',
    height: '100%',
    paddingVertical: 0,
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  mainTitle: {
    fontFamily: systemFont,
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#E8D898',
  },
  tableWrapper: {
    flexDirection: 'column',
    minWidth: Object.values(tableColumnWidths).reduce((sum, value) => sum + value, 0),
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#DEB841',
    borderBottomWidth: 2,
    borderBottomColor: '#C9A22F',
    alignItems: 'stretch',
  },
  thCellContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRightWidth: 1.5,
    borderRightColor: '#D4AB33',
    justifyContent: 'center',
  },
  thCell: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#EFE9DA',
    alignItems: 'stretch',
  },
  tableDataRowEven: {
    backgroundColor: '#FDFBF7',
  },
  tdCellContainer: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1.5,
    borderRightColor: '#EFE9DA',
    justifyContent: 'center',
  },
  cellRight: {
    alignItems: 'flex-end',
  },
  cellCenter: {
    alignItems: 'center',
  },
  lastCell: {
    borderRightWidth: 0,
  },
  tdIdText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#DEB841',
  },
  tdNameText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  tdPriceText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  tdSellingPriceText: {
    fontWeight: '800',
    color: '#111827',
  },
  tdStockText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#1F2937',
  },
  tdStockTextLow: {
    color: '#DC2626',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
  },
  badgeLowStock: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  textLowStock: {
    color: '#DC2626',
  },
  badgeInStock: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  textInStock: {
    color: '#059669',
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFE9DA',
  },
  emptyTableState: {
    alignItems: 'center',
    paddingVertical: 32,
    width: Object.values(tableColumnWidths).reduce((sum, value) => sum + value, 0),
  },
  emptyTableText: {
    fontFamily: systemFont,
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
});

