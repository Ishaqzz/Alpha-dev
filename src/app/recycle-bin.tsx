import Header from '@/components/Header';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../firebaseConfig';

import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

// ── Web Fallback Font for Symmetrical Browser Display ──
const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

// ── Column Widths for Bills Table ──
const billColumnWidths = {
  billId: 110,
  amount: 100,
  deletedAt: 170,
  action: 100,
};

// ── Column Widths for Products Table ──
const productColumnWidths = {
  itemCode: 90,
  productName: 160,
  size: 60,
  purchasePrice: 110,
  sellingPrice: 110,
  stock: 60,
  deletedAt: 170,
  action: 100,
};

type DeletedBill = {
  id: string;
  billId: string;
  amount: number;
  deletedAt: string;
};

type DeletedProduct = {
  id: string;
  itemCode: string;
  name: string;
  size: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
  deletedAt: string;
};

export default function RecycleBinScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();

  const [deletedBills, setDeletedBills] = useState<DeletedBill[]>([]);
  const [deletedProducts, setDeletedProducts] = useState<DeletedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDeletedProducts = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'products'));
      const items: DeletedProduct[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.isActive === false) {
          let deletedDateStr = '';
          if (data.deleted_at) {
            let dateObj;
            if (typeof data.deleted_at.toDate === 'function') {
              dateObj = data.deleted_at.toDate();
            } else if (data.deleted_at.seconds !== undefined) {
              dateObj = new Date(data.deleted_at.seconds * 1000);
            } else {
              dateObj = new Date(data.deleted_at);
            }
            if (dateObj && !isNaN(dateObj.getTime())) {
              deletedDateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
          }
          items.push({
            id: docSnap.id,
            itemCode: data.item_code ?? '',
            name: data.name ?? '',
            size: data.size ?? '',
            purchasePrice: data.purchase_price ?? 0,
            sellingPrice: data.price ?? 0,
            stock: data.stock ?? 0,
            deletedAt: deletedDateStr || 'N/A',
          });
        }
      });
      setDeletedProducts(items);
    } catch (error) {
      console.error('Error fetching deleted products: ', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDeletedBills = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'deleted_bills'));
      const items: DeletedBill[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let deletedDateStr = '';
        if (data.deletedAt) {
          let dateObj;
          if (typeof data.deletedAt.toDate === 'function') {
            dateObj = data.deletedAt.toDate();
          } else if (data.deletedAt.seconds !== undefined) {
            dateObj = new Date(data.deletedAt.seconds * 1000);
          } else {
            dateObj = new Date(data.deletedAt);
          }
          if (dateObj && !isNaN(dateObj.getTime())) {
            deletedDateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        }
        items.push({
          id: docSnap.id,
          billId: data.billNo || docSnap.id,
          amount: data.grandTotal || 0,
          deletedAt: deletedDateStr || 'N/A',
        });
      });
      setDeletedBills(items);
    } catch (error) {
      console.error('Error fetching deleted bills: ', error);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDeletedProducts();
      fetchDeletedBills();
    });
    return unsubscribe;
  }, [navigation]);

  const handleRestoreBill = (id: string, billId: string) => {
    Alert.alert(
      'Restore Bill',
      `Are you sure you want to restore ${billId}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setLoading(true);
            try {
              const docRef = doc(db, 'deleted_bills', id);
              const snap = await getDoc(docRef);
              if (snap.exists()) {
                const data = snap.data();
                delete data.deletedAt;
                await setDoc(doc(db, 'bills', id), data);
                await deleteDoc(docRef);
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Success', `Bill ${billId} has been restored.`);
              fetchDeletedBills();
            } catch (error) {
              console.error('Error restoring bill: ', error);
              Alert.alert('Error', 'Could not restore bill.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreProduct = (id: string, name: string) => {
    Alert.alert(
      'Restore Product',
      `Are you sure you want to restore ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setLoading(true);
            try {
              const productRef = doc(db, 'products', id);
              await updateDoc(productRef, {
                isActive: true,
                deleted_at: deleteField()
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Success', `Product "${name}" has been restored.`);
              fetchDeletedProducts();
            } catch (error) {
              console.error('Error restoring product: ', error);
              Alert.alert('Error', 'Could not restore product.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDeletedProducts();
    await fetchDeletedBills();
    setRefreshing(false);
  }, [fetchDeletedProducts, fetchDeletedBills]);

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
        {/* ── Title & Red Subtitle ── */}
        <Text style={styles.mainTitle}>Recycle Bin</Text>
        <Text style={styles.subTitle}>Recently deleted records. You can restore them if needed.</Text>

        {/* ── Grid Wrapper for Deleted Lists ── */}
        <View style={styles.gridContainer}>

          {/* ── Left Column: Deleted Bills ── */}
          <View style={styles.card}>
            {/* Header Strip */}
            <View style={styles.cardHeaderStrip}>
              <View style={styles.cardHeaderStripLeft}>
                <MaterialCommunityIcons name="file-document-outline" size={20} color="#FFFFFF" />
                <Text style={styles.cardHeaderStripTitle}>DELETED BILLS</Text>
              </View>
              <View style={styles.cardHeaderBadge}>
                <Text style={styles.cardHeaderBadgeText}>DISCOUNT MAINTAINED</Text>
              </View>
            </View>

            {/* Table Area */}
            {loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#DC2626" />
                <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading bills...</Text>
              </View>
            ) : (
              <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
                <View style={styles.tableWrapperBills}>
                  {/* Table Header Row */}
                  <View style={styles.tableHeaderRow}>
                    <View style={{ width: billColumnWidths.billId }}>
                      <Text style={styles.thCell}>BILL ID</Text>
                    </View>
                    <View style={{ width: billColumnWidths.amount }}>
                      <Text style={[styles.thCell, { textAlign: 'right' }]}>AMOUNT</Text>
                    </View>
                    <View style={{ width: billColumnWidths.deletedAt }}>
                      <Text style={[styles.thCell, { textAlign: 'center' }]}>DELETED AT</Text>
                    </View>
                    <View style={{ width: billColumnWidths.action }}>
                      <Text style={[styles.thCell, { textAlign: 'center' }]}>ACTION</Text>
                    </View>
                  </View>

                  {/* Table Data Rows */}
                  {deletedBills.length > 0 ? (
                    deletedBills.map(row => (
                      <View key={row.id} style={styles.tableDataRow}>
                        <View style={{ width: billColumnWidths.billId }}>
                          <Text style={styles.tdBillNo}>#{row.billId}</Text>
                        </View>
                        <View style={{ width: billColumnWidths.amount }}>
                          <Text style={[styles.tdAmountText, { textAlign: 'right' }]}>₹{Number(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                        </View>
                        <View style={{ width: billColumnWidths.deletedAt }}>
                          <Text style={[styles.tdTimeText, { textAlign: 'center' }]}>{row.deletedAt}</Text>
                        </View>
                        <View style={{ width: billColumnWidths.action, alignItems: 'center' }}>
                          <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={() => handleRestoreBill(row.id, row.billId)}
                          >
                            <MaterialCommunityIcons name="backup-restore" size={14} color="#10B981" />
                            <Text style={styles.restoreBtnText}>RESTORE</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyTableState}>
                      <Text style={styles.emptyTableText}>No deleted bills.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>

          {/* ── Right Column: Deleted Products ── */}
          <View style={styles.card}>
            {/* Header Strip */}
            <View style={styles.cardHeaderStrip}>
              <View style={styles.cardHeaderStripLeft}>
                <MaterialCommunityIcons name="package-variant" size={20} color="#FFFFFF" />
                <Text style={styles.cardHeaderStripTitle}>DELETED PRODUCTS</Text>
              </View>
            </View>

            {/* Table Area */}
            {loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#DC2626" />
                <Text style={{ marginTop: 10, color: '#6B7280' }}>Loading products...</Text>
              </View>
            ) : (
              <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
                <View style={styles.tableWrapperProducts}>
                  {/* Table Header Row */}
                  <View style={styles.tableHeaderRow}>
                    <View style={{ width: productColumnWidths.itemCode }}>
                      <Text style={styles.thCell}>ITEM CODE</Text>
                    </View>
                    <View style={{ width: productColumnWidths.productName }}>
                      <Text style={styles.thCell}>PRODUCT NAME</Text>
                    </View>
                    <View style={{ width: productColumnWidths.size }}>
                      <Text style={[styles.thCell, { textAlign: 'center' }]}>SIZE</Text>
                    </View>
                    <View style={{ width: productColumnWidths.purchasePrice }}>
                      <Text style={[styles.thCell, { textAlign: 'right' }]}>PURCHASE PRICE</Text>
                    </View>
                    <View style={{ width: productColumnWidths.sellingPrice }}>
                      <Text style={[styles.thCell, { textAlign: 'right' }]}>SELLING PRICE</Text>
                    </View>
                    <View style={{ width: productColumnWidths.stock }}>
                      <Text style={[styles.thCell, { textAlign: 'center' }]}>STOCK</Text>
                    </View>
                    <View style={{ width: productColumnWidths.deletedAt }}>
                      <Text style={[styles.thCell, { textAlign: 'center' }]}>DELETED AT</Text>
                    </View>
                    <View style={{ width: productColumnWidths.action }}>
                      <Text style={[styles.thCell, { textAlign: 'center' }]}>ACTION</Text>
                    </View>
                  </View>

                  {/* Table Data Rows */}
                  {deletedProducts.length > 0 ? (
                    deletedProducts.map(row => (
                      <View key={row.id} style={styles.tableDataRow}>
                        <View style={{ width: productColumnWidths.itemCode }}>
                          <Text style={styles.tdText}>{row.itemCode}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.productName }}>
                          <Text style={styles.tdNameText}>{row.name}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.size }}>
                          <Text style={[styles.tdText, { textAlign: 'center' }]}>{row.size}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.purchasePrice }}>
                          <Text style={[styles.tdText, { textAlign: 'right' }]}>₹{row.purchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.sellingPrice }}>
                          <Text style={[styles.tdText, { textAlign: 'right', fontWeight: '800' }]}>₹{row.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.stock }}>
                          <Text style={[styles.tdText, { textAlign: 'center', fontWeight: '800' }]}>{row.stock}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.deletedAt }}>
                          <Text style={[styles.tdTimeText, { textAlign: 'center' }]}>{row.deletedAt}</Text>
                        </View>
                        <View style={{ width: productColumnWidths.action, alignItems: 'center' }}>
                          <TouchableOpacity
                            style={styles.restoreBtn}
                            onPress={() => handleRestoreProduct(row.id, row.name)}
                          >
                            <MaterialCommunityIcons name="backup-restore" size={14} color="#10B981" />
                            <Text style={styles.restoreBtnText}>RESTORE</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyTableState}>
                      <Text style={styles.emptyTableText}>No deleted products.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
  mainTitle: {
    fontFamily: systemFont,
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
  },
  subTitle: {
    fontFamily: systemFont,
    fontSize: 14,
    color: '#EF4444', // Red color subtitle as shown in screenshot
    marginTop: 6,
    marginBottom: 24,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      web: {
        flexBasis: width > 1024 ? '48%' : '100%',
      },
      default: {
        flexBasis: '100%',
      },
    }),
    flexGrow: 1,
    marginBottom: 16,
  },
  cardHeaderStrip: {
    flexDirection: 'row',
    backgroundColor: '#DC2626', // Red Header strip
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderStripTitle: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardHeaderBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  cardHeaderBadgeText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  tableWrapperBills: {
    flexDirection: 'column',
    minWidth: Object.values(billColumnWidths).reduce((sum, val) => sum + val, 0) + (3 * 16) + 32,
  },
  tableWrapperProducts: {
    flexDirection: 'column',
    minWidth: Object.values(productColumnWidths).reduce((sum, val) => sum + val, 0) + (7 * 16) + 32,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFF5F5', // Soft red background for header row
    alignItems: 'center',
    gap: 16,
  },
  thCell: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '900',
    color: '#DC2626', // Red text color matching style
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
    gap: 16,
  },
  tdBillNo: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  tdNameText: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  tdAmountText: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  tdText: {
    fontFamily: systemFont,
    fontSize: 14,
    color: '#111827',
  },
  tdTimeText: {
    fontFamily: systemFont,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  restoreBtnText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '900',
    color: '#10B981', // Green restore text
  },
  emptyTableState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTableText: {
    fontFamily: systemFont,
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
});

