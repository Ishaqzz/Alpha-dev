import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation, router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import Header from '@/components/Header';
import SecureDeleteModal from '@/components/SecureDeleteModal';
import { collection, getDocs, query, orderBy, doc, deleteDoc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

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
  RefreshControl,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

const { width } = Dimensions.get('window');

// ── FIXED: Strict widths with reduced sizes for a tighter layout ──
const tableColumnWidths = {
  bill: 110,
  name: 155,
  amount: 120,
  dateTime: 85,
  method: 90,
  action: 250,
};

// ── Customer Bill Type ──
type CustomerBill = {
  id: string;
  billNo: string;
  name: string;
  totalAmount: number;
  date: string;
  time: string;
  method: 'UPI' | 'CASH' | 'SPLIT';
  mobile: string;
};

export default function CustomersScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();

  // ── States ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [secureDeleteTarget, setSecureDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'bills'), orderBy('created_at', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetched: CustomerBill[] = [];
      querySnapshot.forEach((document) => {
        const data = document.data();

        // Derive date & time: prefer explicit string fields, fall back to created_at Timestamp
        let dateStr = data.date || '';
        let timeStr = data.time || '';
        if (!dateStr && data.created_at) {
          const ts: Date = data.created_at.toDate
            ? data.created_at.toDate()
            : new Date(data.created_at);
          dateStr = ts.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
          timeStr = ts.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
        }

        fetched.push({
          id: document.id,
          billNo: data.billNo || document.id,
          name: data.customerName || data.customer_name || 'Walk-in Customer',
          totalAmount: data.grandTotal || data.cash_portion || 0,
          date: dateStr,
          time: timeStr,
          method: (data.paymentMethod || data.payment_method || 'CASH').toUpperCase() as any,
          mobile: data.mobileNo || data.mobile || '',
        });
      });
      setCustomers(fetched);
    } catch (e) {
      console.error('[Customers] Error fetching customer bills:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCustomers();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleRefresh = () => {
    fetchCustomers();
    setSearchQuery('');
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  
  const handleView = (id: string) => {
    const customer = customers.find(c => c.id === id);
    if (customer) {
      router.push({
        pathname: '/invoice-view',
        params: { billId: customer.id }
      });
    }
  };

  const handleEdit = (id: string) => {
    router.push({ pathname: '/new-bill', params: { editBillId: id } });
  };

  const handleDelete = (id: string) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    setSecureDeleteTarget({ id, name: customer.name });
  };

  const executeDeleteCustomer = async (id: string) => {
    setLoading(true);
    try {
      const docRef = doc(db, 'bills', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await setDoc(doc(db, 'deleted_bills', id), {
          ...snap.data(),
          deletedAt: serverTimestamp()
        });
      }
      await deleteDoc(docRef);
      fetchCustomers();
    } catch (e) {
      console.error('[Customers] Error deleting customer bill:', e);
      Alert.alert('Error', 'Could not delete bill.');
      setLoading(false);
    }
  };


  const filteredCustomers = searchQuery
    ? customers.filter(c => c.mobile.includes(searchQuery))
    : customers;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCustomers();
    setRefreshing(false);
  }, [fetchCustomers]);

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
        
        {/* ── 2. Header Section ── */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Customer Management</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="reload" size={16} color="#DEB841" style={{ marginRight: 4 }} />
            <Text style={styles.refreshBtnText}>Refresh List</Text>
          </TouchableOpacity>
        </View>

        {/* ── 3. Search Card ── */}
        <View style={styles.searchCard}>
          <Text style={styles.searchLabel}>SEARCH PURCHASE HISTORY</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter Mobile Number..."
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <View style={styles.searchBtnContainer}>
            <TouchableOpacity 
              style={styles.reportBtn} 
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Keyboard.dismiss();
              }}
            >
              <Text style={styles.reportBtnText}>Search</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 4. Horizontally Scrollable Data Table ── */}
        <View style={styles.tableCard}>
          <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              
              {/* Header Row */}
              <View style={[styles.tableHeaderRow, { gap: 0, paddingHorizontal: 8 }]}>
                <View style={{ width: tableColumnWidths.bill }}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>BILL NUMBER</Text>
                </View>
                <View style={styles.vDividerLight} />
                
                <View style={{ width: tableColumnWidths.name }}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>CUSTOMER NAME</Text>
                </View>
                <View style={styles.vDividerLight} />
                
                <View style={{ width: tableColumnWidths.amount }}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>TOTAL AMOUNT</Text>
                </View>
                <View style={styles.vDividerLight} />
                
                <View style={{ width: tableColumnWidths.dateTime }}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>DATE & TIME</Text>
                </View>
                <View style={styles.vDividerLight} />
                
                <View style={{ width: tableColumnWidths.method }}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>METHOD</Text>
                </View>
                <View style={styles.vDividerLight} />
                
                <View style={{ width: tableColumnWidths.action, alignItems: 'center' }}>
                  <Text style={[styles.thCell, { textAlign: 'center' }]}>ACTION</Text>
                </View>
              </View>

              {/* Data Rows */}
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((row, index) => (
                  <View key={row.id} style={[styles.tableDataRow, index % 2 !== 0 && styles.tableDataRowEven, { gap: 0, paddingHorizontal: 8 }]}>
                    
                    {/* Bill Number */}
                    <View style={{ width: tableColumnWidths.bill }}>
                      <Text style={[styles.tdBillText, { textAlign: 'center' }]}>#{row.billNo}</Text>
                    </View>
                    <View style={styles.vDivider} />
                    
                    {/* Customer Name */}
                    <View style={{ width: tableColumnWidths.name }}>
                      <Text style={[styles.tdNameText, { textAlign: 'center' }]}>{row.name}</Text>
                    </View>
                    <View style={styles.vDivider} />
                    
                    {/* Total Amount */}
                    <View style={{ width: tableColumnWidths.amount }}>
                      <Text style={[styles.tdAmountText, { textAlign: 'center' }]}>
                        ₹{row.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.vDivider} />
                    
                    {/* Date & Time */}
                    <View style={{ width: tableColumnWidths.dateTime }}>
                      <Text style={[styles.tdDateText, { textAlign: 'center' }]}>{row.date}</Text>
                      <Text style={[styles.tdTimeText, { textAlign: 'center' }]}>{row.time}</Text>
                    </View>
                    <View style={styles.vDivider} />
                    
                    {/* Method */}
                    <View style={{ width: tableColumnWidths.method, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={[
                        styles.methodBadge,
                        row.method === 'UPI' && styles.badgeBlue,
                        row.method === 'CASH' && styles.badgeGreen,
                        row.method === 'SPLIT' && styles.badgeGold,
                      ]}>
                        <Text style={[
                          styles.badgeText,
                          row.method === 'UPI' && styles.textBlue,
                          row.method === 'CASH' && styles.textGreen,
                          row.method === 'SPLIT' && styles.textGold,
                        ]}>
                          {row.method}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.vDivider} />

                    {/* Actions */}
                    <View style={[styles.actionsWrapper, { width: tableColumnWidths.action, flexDirection: 'row', justifyContent: 'center', gap: 12 }]}>
                      <TouchableOpacity onPress={() => handleView(row.id)} style={styles.actionBtnView} activeOpacity={0.8}>
                        <Text style={styles.actionTextBlue}>View</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleEdit(row.id)} style={styles.actionBtnEdit} activeOpacity={0.8}>
                        <View style={styles.btnContentWithIcon}>
                          <MaterialCommunityIcons name="pencil" size={12} color="#D97706" style={{ marginRight: 2 }} />
                          <Text style={styles.actionTextEdit}>Edit</Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => handleDelete(row.id)} style={styles.actionBtnDelete} activeOpacity={0.8}>
                        <View style={styles.btnContentWithIcon}>
                          <MaterialCommunityIcons name="delete" size={12} color="#EF4444" style={{ marginRight: 2 }} />
                          <Text style={styles.actionTextDelete}>Delete</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyTableState}>
                  <Text style={styles.emptyTableText}>No customer billing history matched.</Text>
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
        actionLabel={secureDeleteTarget ? `Delete record for ${secureDeleteTarget.name}` : ''}
        onVerified={() => {
          if (secureDeleteTarget) executeDeleteCustomer(secureDeleteTarget.id);
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
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: systemFont,
    fontSize: 26, // Increased from 20
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
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  searchLabel: {
    fontFamily: systemFont,
    fontSize: 12, // Increased from 10
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  searchInput: {
    fontFamily: systemFont,
    height: 44, // Increased height slightly
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 15, // Increased from 13
    color: '#111827',
    fontWeight: '600',
    textAlign: 'center',
  },
  searchBtnContainer: {
    alignItems: 'flex-end',
    marginTop: 12,
  },
  reportBtn: {
    backgroundColor: '#DEB841',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  reportBtnText: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
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
    minWidth: 760, // Adjusted down for the tighter widths and smaller gap
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#DEB841',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#C9A22F',
    alignItems: 'center',
    gap: 16, // Enforced global gap between ALL cell columns mathematically
  },
  thCell: {
    fontFamily: systemFont,
    fontSize: 12, // Increased from 10
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E8D898',
    alignItems: 'center',
    gap: 16, // Must match exactly with header row for perfect symmetry
  },
  tableDataRowEven: {
    backgroundColor: '#FDFBF7',
  },
  vDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    alignSelf: 'stretch',
    marginHorizontal: 6,
  },
  vDividerLight: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'stretch',
    marginHorizontal: 6,
  },
  tdBillText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '800',
    color: '#CBA135',
  },
  tdNameText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '700',
    color: '#1F2937',
  },
  tdAmountText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '800',
    color: '#1F2937',
  },
  tdDateTimeContainer: {
    flexDirection: 'column',
  },
  tdDateText: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    color: '#6B7280',
    fontWeight: '600',
  },
  tdTimeText: {
    fontFamily: systemFont,
    fontSize: 12, // Increased from 10
    color: '#9CA3AF',
    marginTop: 1,
  },
  tdMethodContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: systemFont,
    fontSize: 11, // Increased from 9
    fontWeight: '900',
  },
  badgeBlue: {
    backgroundColor: '#EFF6FF',
  },
  textBlue: {
    color: '#2563EB',
  },
  badgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  textGreen: {
    color: '#059669',
  },
  badgeGold: {
    backgroundColor: '#FFFBEB',
  },
  textGold: {
    color: '#D97706',
  },
  actionsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnView: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  actionTextBlue: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '800',
    color: '#2563EB',
  },
  actionBtnEdit: {
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 10, // slightly tighter padding inside the buttons
    paddingVertical: 6,
    borderRadius: 4,
  },
  actionTextEdit: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '800',
    color: '#D97706',
  },
  actionBtnDelete: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  actionTextDelete: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '800',
    color: '#EF4444',
  },
  btnContentWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTableState: {
    alignItems: 'center',
    paddingVertical: 32,
    width: Object.values(tableColumnWidths).reduce((sum, value) => sum + value, 0) + (5 * 16) + 32, // Adjusted for columns
  },
  emptyTableText: {
    fontFamily: systemFont,
    color: '#9CA3AF',
    fontSize: 15, // Increased from 13
    fontWeight: '700',
  },
});
