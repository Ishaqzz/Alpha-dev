import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation, router } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import Header from '@/components/Header';
import { collection, getDocs, query, orderBy, deleteDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import SecureDeleteModal from '@/components/SecureDeleteModal';
import * as Haptics from 'expo-haptics';

import {
  ActivityIndicator,
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// ── Web Fallback Font for Symmetrical Browser Display ──
const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

type Transaction = {
  id: string;
  billNo: string;
  customerName: string;
  shopName: string;
  mobileNo: string;
  date: string;
  time: string;
  amount: number;
  paymentMethod: string;
  subtotal: number;
  savings: number;
  grandTotal: number;
  items: Array<{
    id: number;
    name: string;
    size: string;
    qty: number;
    rate: number;
    total: number;
  }>;
};

export default function HistoryScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();
  const [searchQuery, setSearchQuery] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [secureDeleteTarget, setSecureDeleteTarget] = useState<{ id: string; billNo: string } | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'bills'), orderBy('created_at', 'desc'));
      const querySnapshot = await getDocs(q);
      const fetched: Transaction[] = [];
      querySnapshot.forEach((document) => {
        const data = document.data();
        fetched.push({
          id: document.id,
          billNo: data.billNo || document.id,
          customerName: data.customerName || 'Walk-in Customer',
          shopName: data.shopName || '',
          mobileNo: data.mobileNo || '',
          date: data.date || (() => {
            if (data.created_at) {
              const ts: Date = data.created_at.toDate ? data.created_at.toDate() : new Date(data.created_at);
              return ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            }
            return '';
          })(),
          time: data.time || (() => {
            if (data.created_at) {
              const ts: Date = data.created_at.toDate ? data.created_at.toDate() : new Date(data.created_at);
              return ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            }
            return '';
          })(),
          amount: data.grandTotal || 0,
          paymentMethod: data.paymentMethod || 'Cash',
          subtotal: data.subtotal || 0,
          savings: data.savings || 0,
          grandTotal: data.grandTotal || 0,
          items: (data.items || []).map((i: any) => ({
            id: i.productId || i.itemCode || '',
            name: i.itemDesc || '',
            size: i.size || '',
            qty: i.qty || 0,
            rate: i.discountRate || i.actualRate || 0,
            total: (i.discountRate || i.actualRate || 0) * (i.qty || 0),
          })),
        });
      });
      setTransactions(fetched);
    } catch (e) {
      console.error('[History] Error fetching transaction records:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTransactions();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    fetchTransactions();
  }, []);


  const handleViewDetails = (item: Transaction) => {
    router.push({
      pathname: '/invoice-view',
      params: { billId: item.id }
    });
  };

  const executeDeleteBill = async (billId: string) => {
    try {
      setLoading(true);
      const docRef = doc(db, 'bills', billId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await setDoc(doc(db, 'deleted_bills', billId), {
          ...snap.data(),
          deletedAt: serverTimestamp()
        });
      }
      await deleteDoc(docRef);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      fetchTransactions();
    } catch (e) {
      console.error('[History] Error deleting bill:', e);
      setLoading(false);
    }
  };

  const filteredTransactions = searchQuery
    ? transactions.filter(
        t =>
          t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.billNo.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transactions;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }, [fetchTransactions]);

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
        {/* ── Title & Description ── */}
        <Text style={styles.mainTitle}>Transaction History</Text>
        <Text style={styles.subTitle}>Every purchase recorded in the system.</Text>

        {/* ── Mobile Responsive Search Bar ── */}
        <View style={styles.searchCard}>
          <MaterialCommunityIcons name="magnify" size={20} color="#9CA3AF" style={styles.searchIcon} />
          <TextInput
            style={styles.searchBarInput}
            placeholder="Search by name or bill #..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* ── Grid Container ── */}
        <View style={styles.gridContainer}>
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map(item => (
              <View key={item.id} style={styles.card}>
                {/* Top Row: Bill No & Amount */}
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={styles.cardLabel}>BILL NUMBER</Text>
                    <Text style={styles.cardBillNo}>#{item.billNo}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.cardLabel, { textAlign: 'right' }]}>AMOUNT</Text>
                    <Text style={styles.cardAmount}>₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>

                {/* Customer Name */}
                <View style={styles.cardDetailRow}>
                  <Text style={styles.cardLabel}>CUSTOMER</Text>
                  <Text style={styles.cardCustomerName}>{item.customerName}</Text>
                </View>

                {/* Date & Time Row */}
                <View style={styles.cardDateTimeRow}>
                  <View style={styles.dateTimeCol}>
                    <MaterialCommunityIcons name="calendar" size={14} color="#9CA3AF" />
                    <Text style={styles.dateTimeText}>{item.date}</Text>
                  </View>
                  <View style={styles.dateTimeCol}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#9CA3AF" />
                    <Text style={styles.dateTimeText}>{item.time}</Text>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                {/* Bottom Row: Payment badge & View Details action */}
                <View style={styles.cardFooterRow}>
                  <View
                    style={[
                      styles.paymentBadge,
                      item.paymentMethod === 'UPI' ? styles.badgeUPI : styles.badgeCASH,
                    ]}
                  >
                    <Text
                      style={[
                        styles.paymentBadgeText,
                        item.paymentMethod === 'UPI' ? styles.textUPI : styles.textCASH,
                      ]}
                    >
                      {item.paymentMethod}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => setSecureDeleteTarget({ id: item.id, billNo: item.billNo })}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => router.push({ pathname: '/new-bill', params: { editBillId: item.id } })}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={18} color="#3B82F6" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.viewDetailsBtn}
                      onPress={() => handleViewDetails(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewDetailsText}>View Details</Text>
                      <MaterialCommunityIcons name="arrow-right" size={14} color="#DEB841" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No transaction records found.</Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SecureDeleteModal
        visible={secureDeleteTarget !== null}
        actionLabel={secureDeleteTarget ? `Delete Bill #${secureDeleteTarget.billNo}` : ''}
        onVerified={() => {
          if (secureDeleteTarget) {
            executeDeleteBill(secureDeleteTarget.id);
          }
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
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 20,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
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
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#DEB841', // Gold left border
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...Platform.select({
      web: {
        flexBasis: width > 768 ? '31%' : '100%',
      },
      default: {
        flexBasis: '100%',
      },
    }),
    flexGrow: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardLabel: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  cardBillNo: {
    fontFamily: systemFont,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  cardAmount: {
    fontFamily: systemFont,
    fontSize: 18,
    fontWeight: '800',
    color: '#DEB841', // Gold amount text
  },
  cardDetailRow: {
    marginBottom: 12,
  },
  cardCustomerName: {
    fontFamily: systemFont,
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  cardDateTimeRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dateTimeCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateTimeText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  paymentBadgeText: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '900',
  },
  badgeUPI: {
    backgroundColor: '#EFF6FF',
  },
  textUPI: {
    color: '#2563EB',
  },
  badgeCASH: {
    backgroundColor: '#ECFDF5',
  },
  textCASH: {
    color: '#059669',
  },
  deleteBtn: {
    padding: 4,
  },
  editBtn: {
    padding: 4,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewDetailsText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#DEB841', // Gold action button
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontFamily: systemFont,
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '700',
  },
});

