import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation, useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useProducts, ProductItem } from '../hooks/useProducts';
import Header from '@/components/Header';
import SecureDeleteModal from '@/components/SecureDeleteModal';

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

const { width } = Dimensions.get('window');

// ── Strict widths for mathematical layout ──
const tableColumnWidths = {
  itemCode: 105,
  name: 160,
  size: 70,
  purchasePrice: 125,
  sellingPrice: 125,
  stock: 80,
  action: 90, 
};

// Removed local ProductItem type as it is imported from the hook

export default function ProductsScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [size, setSize] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stock, setStock] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  // Secure delete state
  const [secureDeleteTarget, setSecureDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Products live from Firestore (using custom hook) ──────────────────
  const { products, loading, fetchProducts, setProducts, setLoading } = useProducts();
  const { lowStock } = useLocalSearchParams();
  const isLowStockFilter = lowStock === 'true';
  const displayedProducts = isLowStockFilter ? products.filter(p => p.stock <= 5) : products;

  // ── Data fetch placeholder (Firebase removed) ─────────────────────────
  const generateNextItemCode = (querySnapshot: any) => {
    let maxVal = 0;
    querySnapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      const code = data.item_code || docSnap.id;
      const numericVal = parseInt(code, 10);
      if (!isNaN(numericVal) && numericVal > maxVal) {
        maxVal = numericVal;
      }
    });
    const nextVal = maxVal + 1;
    return String(nextVal).padStart(3, '0');
  };

  const handleFetchProducts = useCallback(async () => {
    try {
      const querySnapshot = await fetchProducts();
      if (!editingProductId && querySnapshot) {
        const nextCode = generateNextItemCode(querySnapshot);
        setItemCode(nextCode);
      }
    } catch (e) {
      console.error('Error loading products:', e);
      Alert.alert('Error', 'Could not load products from database.');
    }
  }, [fetchProducts, editingProductId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      handleFetchProducts();
    });
    return unsubscribe;
  }, [navigation, handleFetchProducts]);

  useEffect(() => { 
    handleFetchProducts(); 
  }, [handleFetchProducts]);
  const handleSaveItem = async () => {
    if (!itemCode.trim()) {
      Alert.alert('Validation Error', 'Item Code is required.');
      return;
    }

    setLoading(true);
    try {
      const productData = {
        item_code: itemCode,
        name: itemName,
        size: size,
        purchase_price: Number(purchasePrice) || 0,
        price: Number(sellingPrice) || 0,
        stock: Number(stock) || 0,
      };

      if (editingProductId) {
        // Update existing product
        const productRef = doc(db, 'products', editingProductId);
        await updateDoc(productRef, productData);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Product has been updated.');
      } else {
        // Check if product with this item_code already exists
        const productRef = doc(db, 'products', itemCode);
        const docSnap = await getDoc(productRef);
        if (docSnap.exists()) {
          Alert.alert('Validation Error', 'Item Code already exists.');
          setLoading(false);
          return;
        }

        // Create new product using item_code as the Document ID
        await setDoc(productRef, {
          ...productData,
          isActive: true,
          created_at: serverTimestamp(),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Success', 'Product has been saved.');
      }

      // Clear form
      setItemCode('');
      setItemName('');
      setSize('');
      setPurchasePrice('');
      setSellingPrice('');
      setStock('');
      setEditingProductId(null);

      // Refresh list
      handleFetchProducts();
    } catch (error) {
      console.error('Error saving product: ', error);
      Alert.alert('Error', 'Could not save product.');
      setLoading(false);
    }
  };

  const handleRefresh = () => { handleFetchProducts(); };

  const handleView = (id: string) => {
    const item = products.find(i => i.id === id);
    if (item) {
      Alert.alert(
        'View Product',
        `Product: ${item.itemCode}\nName: ${item.name}\nStock: ${item.stock}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleEdit = (id: string) => {
    const item = products.find(i => i.id === id);
    if (item) {
      setItemCode(item.itemCode);
      setItemName(item.name);
      setSize(item.size);
      setPurchasePrice(item.purchasePrice.toString());
      setSellingPrice(item.sellingPrice.toString());
      setStock(item.stock.toString());
      setEditingProductId(id);
    }
  };

  // Open the secure delete modal instead of a plain Alert
  const handleDelete = (id: string) => {
    const item = products.find(i => i.id === id);
    if (!item) {
      Alert.alert('Error', `Product not found locally: ${id}`);
      return;
    }
    setSecureDeleteTarget({ id, name: item.name });
  };

  // Actual delete — called only after PIN/biometric verified
  const executeDelete = async (id: string) => {
    setLoading(true);
    try {
      const productRef = doc(db, 'products', id);
      await updateDoc(productRef, {
        isActive: false,
        deleted_at: serverTimestamp(),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      handleFetchProducts();
    } catch (error: any) {
      console.error('Error deleting product: ', error);
      Alert.alert('Error', `Could not delete product: ${error.message || error}`);
      setLoading(false);
    }
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await handleFetchProducts();
    setRefreshing(false);
  }, [handleFetchProducts]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
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
        
        {/* ── 2. Header Section ── */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>{isLowStockFilter ? 'Low Stock Products' : 'Products'}</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="reload" size={16} color="#DEB841" style={{ marginRight: 4 }} />
            <Text style={styles.refreshBtnText}>Refresh List</Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. Add New Item Form Card ── */}
        <View style={styles.formCard}>
          <Text style={styles.formHeaderTitle}>Add New Product</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Item Code *</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: '#E5E7EB', color: '#6B7280' }]}
              value={itemCode}
              editable={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Product Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Alpha Tracksuit"
              placeholderTextColor="#9CA3AF"
              value={itemName}
              onChangeText={setItemName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Size</Text>
            <TextInput
              style={styles.textInput}
              placeholder="M, L, XL"
              placeholderTextColor="#9CA3AF"
              value={size}
              onChangeText={setSize}
              autoCapitalize="characters"
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Purchase Price (₹)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={purchasePrice}
                onChangeText={setPurchasePrice}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.inputLabel}>Selling Price (₹)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                value={sellingPrice}
                onChangeText={setSellingPrice}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Stock</Text>
            <TextInput
              style={styles.textInput}
              placeholder="0"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={stock}
              onChangeText={setStock}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveItem} activeOpacity={0.8}>
            <Text style={styles.saveBtnText}>{editingProductId ? 'Update Product' : 'Save Product'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── 4. Horizontally Scrollable Products Table ── */}
        <View style={styles.tableCard}>
          <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              
              {/* Header Row */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.itemCode }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>ITEM CODE</Text>
                </View>
                
                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.name }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>NAME</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.size }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>SIZE</Text>
                </View>
                
                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.purchasePrice }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>PURCHASE PRICE</Text>
                </View>
                
                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.sellingPrice }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>SELLING PRICE</Text>
                </View>

                <View style={[styles.thCellContainer, styles.cellCenter, { width: tableColumnWidths.stock }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>STOCK</Text>
                </View>
                
                <View style={[styles.thCellContainer, styles.lastCell, styles.cellCenter, { width: tableColumnWidths.action }]}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>ACTION</Text>
                </View>
              </View>

              {/* Data Rows */}
              {loading ? (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#DEB841" />
                </View>
              ) : displayedProducts.length > 0 ? (
                displayedProducts.map((row, index) => (
                  <View 
                    key={row.id} 
                    style={[
                      styles.tableDataRow, 
                      index % 2 === 1 && styles.tableDataRowEven
                    ]}
                  >
                    
                    {/* Item Code */}
                    <View style={[styles.tdCellContainer, { width: tableColumnWidths.itemCode }]}>
                      <Text style={styles.tdItemCodeText}>{row.itemCode}</Text>
                    </View>
                    
                    {/* Name */}
                    <View style={[styles.tdCellContainer, { width: tableColumnWidths.name }]}>
                      <Text style={styles.tdNameText} numberOfLines={2}>{row.name}</Text>
                    </View>
                    
                    {/* Size */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.size }]}>
                      <View style={styles.sizeBadge}>
                        <Text style={styles.sizeBadgeText}>{row.size || '—'}</Text>
                      </View>
                    </View>

                    {/* Purchase Price */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.purchasePrice }]}>
                      <Text style={[styles.tdPriceText, { textAlign: 'center' }]}>
                        ₹{row.purchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {/* Selling Price */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.sellingPrice }]}>
                      <Text style={[styles.tdPriceText, styles.tdSellingPriceText, { textAlign: 'center' }]}>
                        ₹{row.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>

                    {/* Stock Badge */}
                    <View style={[styles.tdCellContainer, styles.cellCenter, { width: tableColumnWidths.stock }]}>
                      <View style={[styles.stockBadge, row.stock > 5 ? styles.badgeGreen : styles.badgeRed]}>
                        {row.stock <= 5 && (
                          <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#DC2626" style={{ marginRight: 3 }} />
                        )}
                        <Text style={[styles.stockBadgeText, row.stock > 5 ? styles.textGreen : styles.textRed]}>
                          {row.stock}
                        </Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={[styles.tdCellContainer, styles.lastCell, styles.actionsWrapper, { width: tableColumnWidths.action }]}>
                      <TouchableOpacity 
                        onPress={() => handleEdit(row.id)} 
                        activeOpacity={0.7} 
                        style={styles.actionIconBtn} 
                        hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      >
                        <MaterialCommunityIcons name="pencil" size={17} color="#DEB841" />
                      </TouchableOpacity>

                      <TouchableOpacity 
                        onPress={() => handleDelete(row.id)} 
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
                <View style={styles.emptyTableState}>
                  <Text style={styles.emptyTableText}>No products found.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: systemFont,
    fontSize: 26, // Increased from 22
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshBtnText: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    fontWeight: '700',
    color: '#DEB841',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  formHeaderTitle: {
    fontFamily: systemFont,
    fontSize: 19, // Increased from 16
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    fontFamily: systemFont,
    height: 44,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16, // Increased from 14
    color: '#111827',
  },
  saveBtn: {
    backgroundColor: '#DEB841',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    fontFamily: systemFont,
    fontSize: 16, // Increased from 14
    fontWeight: '800',
    color: '#000000',
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
  tdItemCodeText: {
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
  sizeBadge: {
    backgroundColor: '#F7F3E8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2D7BC',
    alignItems: 'center',
  },
  sizeBadgeText: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#8C6D1F',
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
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stockBadgeText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '800',
  },
  badgeGreen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  textGreen: {
    color: '#059669',
  },
  badgeRed: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  textRed: {
    color: '#DC2626',
  },
  actionsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
});

