import React, { useState, useEffect, useCallback } from 'react';
import MaterialDatePicker from '@/components/MaterialDatePicker';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  Image,
  FlatList,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import Header from '@/components/Header';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useProducts } from '../hooks/useProducts';
import { collection, getDocs, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

const { width } = Dimensions.get('window');

// ── Types ────────────────────────────────────────────────────────────────────
type Invoice = {
  id: string;
  customer: string;
  date: string;
  amount: string;
};

type StatCardProps = {
  title: string;
  value: number | string;
  subtitle?: string;
  trend?: string;
  watermark: keyof typeof MaterialCommunityIcons.glyphMap;
  isAmount?: boolean;
  linkText?: string;
  amountValue?: string;
  onPress?: () => void;
};

// ── Metrics Card Component ───────────────────────────────────────────────────
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  watermark,
  isAmount = false,
  linkText,
  amountValue,
  onPress,
}: StatCardProps) {
  return (
    <TouchableOpacity 
      style={styles.metricCard} 
      onPress={onPress} 
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.cardGoldTop} />
      
      {/* Watermark Icon */}
      <View style={styles.watermarkContainer}>
        <MaterialCommunityIcons
          name={watermark}
          size={84}
          color="#B45309"
          style={styles.watermarkIcon}
        />
      </View>

      <Text style={styles.cardTitle}>{title}</Text>
      
      {/* Dynamic values rendering */}
      {isAmount ? (
        <Text style={styles.cardLargeValue}>₹{value}</Text>
      ) : (
        <Text style={styles.cardLargeValue}>{value}</Text>
      )}

      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      
      {trend && (
        <View style={styles.trendRow}>
          <MaterialCommunityIcons name="trending-up" size={16} color="#10B981" />
          <Text style={styles.trendText}>{trend}</Text>
        </View>
      )}

      {amountValue !== undefined && (
        <Text style={styles.cardAmountHighlight}>₹{amountValue}</Text>
      )}

      {linkText && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.cardLinkText}>{linkText}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function Dashboard() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const router = useRouter();
  const swipeHandlers = useDrawerSwipeGesture();

  // ── States for metrics and invoices (initialized to clean start values) ──
  const [salesValue, setSalesValue] = useState<string>('0.00');
  const [invoicesToday, setInvoicesToday] = useState<number>(0);
  
  const [cashBills, setCashBills] = useState<number>(0);
  const [cashAmount, setCashAmount] = useState<string>('0.00');

  const [upiBills, setUpiBills] = useState<number>(0);
  const [upiAmount, setUpiAmount] = useState<string>('0.00');

  const [splitBills, setSplitBills] = useState<number>(0);
  const [splitAmount, setSplitAmount] = useState<string>('0.00');

  const { products, fetchProducts } = useProducts();
  const lowStockCount = products.filter(p => p.stock <= 5).length;

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProducts();
    });
    return unsubscribe;
  }, [navigation, fetchProducts]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ── FIX CORRUPTED BILL DATES ──
  useEffect(() => {
    const fixCorruptedBillDates = async () => {
      try {
        const q = query(collection(db, 'bills'));
        const snap = await getDocs(q);
        snap.forEach(async (docSnap) => {
          const data = docSnap.data();
          if (data.created_at) {
            const dateObj = data.created_at.toDate ? data.created_at.toDate() : new Date(data.created_at);
            const originalDateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;
            // If the date string was overwritten, restore it to match the creation timestamp
            if (data.date && data.date !== originalDateStr) {
              console.log(`[Auto-Fix] Fixing corrupted bill ${docSnap.id}: ${data.date} -> ${originalDateStr}`);
              await updateDoc(doc(db, 'bills', docSnap.id), { date: originalDateStr });
            }
          }
        });
      } catch (err) {
        console.error('[Auto-Fix] Failed to fix corrupted dates:', err);
      }
    };
    fixCorruptedBillDates();
  }, []);
  
  const [selectedFilterDate, setSelectedFilterDate] = useState<string | null>(null);

  // Invoices list data state (starts empty for a fresh build)
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const { date } = useLocalSearchParams();

  // If we navigated here with a date param (from Analytics), set it as the filter
  useEffect(() => {
    if (date && typeof date === 'string') {
      setSelectedFilterDate(date);
    }
  }, [date]);

  // ── Data Fetching ───────────────────────────────────────────────
  const fetchDashboardMetrics = async () => {
    try {
      const q = query(collection(db, 'bills'), orderBy('created_at', 'desc'));
      const querySnapshot = await getDocs(q);
      
      let tSales = 0;
      let tInvoices = 0;
      
      let cBills = 0;
      let cAmount = 0;
      
      let uBills = 0;
      let uAmount = 0;
      
      let sBills = 0;
      let sAmount = 0;

      const fetchedInvoices: Invoice[] = [];
      
      // We will match dates based on selectedFilterDate, OR default to today's date formatted as dd/mm/yyyy
      let targetDateStr = selectedFilterDate;
      if (!targetDateStr) {
        // Fallback robust date matching using Javascript Date
        const today = new Date();
        // match today's date
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          let isToday = false;

          // Prefer created_at Timestamp for accurate daily matching
          if (data.created_at) {
            const billDate = data.created_at.toDate ? data.created_at.toDate() : new Date(data.created_at);
            if (
              billDate.getDate() === today.getDate() &&
              billDate.getMonth() === today.getMonth() &&
              billDate.getFullYear() === today.getFullYear()
            ) {
              isToday = true;
            }
          } else if (data.date) {
            // String fallback
            targetDateStr = today.toLocaleDateString('en-GB'); // dd/mm/yyyy
            if (data.date === targetDateStr) isToday = true;
          }

          if (isToday) {
            const gTotal = Number(data.grandTotal || data.grand_total) || 0;
            const pMethod = data.paymentMethod || data.payment_method || 'Cash';
            
            tSales += gTotal;
            tInvoices += 1;
            
            if (pMethod === 'Cash') {
              cBills += 1;
              cAmount += gTotal;
            } else if (pMethod === 'UPI') {
              uBills += 1;
              uAmount += gTotal;
            } else if (pMethod === 'Both' || pMethod === 'Split') {
              sBills += 1;
              sAmount += gTotal;
            }

            fetchedInvoices.push({
              id: docSnap.id,
              customer: data.customerName || data.customer_name || 'Walk-in',
              date: data.date || '',
              amount: gTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            });
          }
        });
      } else {
        // Match string date directly if selectedFilterDate is set (e.g. from Analytics)
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.date === targetDateStr) {
            const gTotal = Number(data.grandTotal || data.grand_total) || 0;
            const pMethod = data.paymentMethod || data.payment_method || 'Cash';
            
            tSales += gTotal;
            tInvoices += 1;
            
            if (pMethod === 'Cash') {
              cBills += 1;
              cAmount += gTotal;
            } else if (pMethod === 'UPI') {
              uBills += 1;
              uAmount += gTotal;
            } else if (pMethod === 'Both' || pMethod === 'Split') {
              sBills += 1;
              sAmount += gTotal;
            }

            fetchedInvoices.push({
              id: docSnap.id,
              customer: data.customerName || data.customer_name || 'Walk-in',
              date: data.date || '',
              amount: gTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            });
          }
        });
      }

      setSalesValue(tSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setInvoicesToday(tInvoices);
      setCashBills(cBills);
      setCashAmount(cAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setUpiBills(uBills);
      setUpiAmount(uAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setSplitBills(sBills);
      setSplitAmount(sAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setInvoices(fetchedInvoices);
      
    } catch (error) {
      console.error('[Dashboard] Error fetching metrics:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDashboardMetrics();
    });
    return unsubscribe;
  }, [navigation, selectedFilterDate]);

  useEffect(() => {
    fetchDashboardMetrics();
  }, [selectedFilterDate]);

  // Date filters & Calendar States
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // Clear Date Filter
  const handleClearFilter = () => {
    setSelectedFilterDate(null);
  };

  // Filtered invoices
  const filteredInvoices = selectedFilterDate
    ? invoices.filter((item) => item.date === selectedFilterDate)
    : invoices;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardMetrics();
    await fetchProducts();
    setRefreshing(false);
  }, [selectedFilterDate]);

  return (
    <View style={styles.root} {...swipeHandlers}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Decorative clean background layers for geometric feel */}
      <View style={styles.bgOverlay} />
      <View style={[styles.bgGeometricCircle, { top: -100, right: -100 }]} />
      <View style={[styles.bgGeometricCircle, { bottom: 100, left: -150, width: 400, height: 400 }]} />

      <Header />

      <View style={{ flex: 1 }}>

        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#DEB841']} />
          }
        >


          {/* ── 4. Action Header ── */}
          <View style={styles.actionHeaderRow}>
            <View style={styles.actionHeaderLeft}>
              <Text style={styles.actionHeaderTitle}>Daily Performance</Text>
              <Text style={styles.actionHeaderSubtitle}>Real-time summary of your store's activity.</Text>
            </View>

            <TouchableOpacity
              style={styles.newBillBtn}
              onPress={() => navigation.navigate('new-bill')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="plus" size={22} color="#000000" style={styles.newBillIcon} />
              <Text style={styles.newBillText}>New Bill</Text>
            </TouchableOpacity>
          </View>

          {/* ── 5. Metrics Grid (2-Column) ── */}
          <View style={styles.metricsGrid}>
            <MetricCard
              title="TODAY'S SALES 📊"
              value={salesValue}
              trend="0% vs yesterday"
              watermark="currency-inr"
              isAmount={true}
              linkText="Deep analytics →"
              onPress={() => router.push('/analytics')}
            />
            
            <MetricCard
              title="INVOICES TODAY"
              value={invoicesToday}
              subtitle="Completed"
              watermark="calculator"
            />

            <MetricCard
              title="💵 CASH TODAY"
              value={`${cashBills} bills`}
              amountValue={cashAmount}
              watermark="currency-inr"
            />

            <MetricCard
              title="📱 UPI TODAY"
              value={`${upiBills} bills`}
              amountValue={upiAmount}
              watermark="cellphone"
            />

            <MetricCard
              title="💳 SPLIT TODAY"
              value={`${splitBills} bills`}
              amountValue={splitAmount}
              watermark="swap-horizontal"
            />

            <MetricCard
              title="LOW STOCK ALERTS"
              value={lowStockCount}
              subtitle="Items need restock"
              watermark="package-variant"
              onPress={() => router.push({ pathname: '/products', params: { lowStock: 'true' } })}
            />
          </View>

          {/* ── 6. Data Table Section ── */}
          <View style={styles.tableSection}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.tableSectionTitle}>Today Invoice</Text>
              <TouchableOpacity onPress={() => navigation.navigate('products')}>
                <Text style={styles.viewAllBtnText}>View All Products</Text>
              </TouchableOpacity>
            </View>

            {/* Filters Row */}
            <View style={styles.filterRow}>
              <TouchableOpacity
                style={styles.dropdownBtn}
                onPress={() => setShowDatePicker(!showDatePicker)}
                activeOpacity={0.8}
              >
                <Text style={styles.dropdownBtnText}>
                  {selectedFilterDate ? selectedFilterDate : 'FILTER BY DATE'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#4B5563" />
              </TouchableOpacity>

              {selectedFilterDate && (
                <TouchableOpacity
                  style={styles.clearFilterBtn}
                  onPress={handleClearFilter}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearFilterBtnText}>Clear Filter</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Invoices List Table */}
            <View style={styles.tableContainer}>
              {/* Columns Header */}
              <View style={styles.tableColumnsHeader}>
                <Text style={[styles.colHeader, { flex: 1.2 }]}>INVOICE ID</Text>
                <Text style={[styles.colHeader, { flex: 1.5 }]}>CUSTOMER</Text>
                <Text style={[styles.colHeader, { flex: 1.3 }]}>DATE</Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
              </View>

              {/* Rows List */}
              {filteredInvoices.length > 0 ? (
                filteredInvoices.map((invoice, index) => (
                  <TouchableOpacity
                    key={invoice.id}
                    style={styles.tableRow}
                    activeOpacity={0.7}
                    onPress={() => router.push({ pathname: '/invoice-view', params: { billId: invoice.id } })}
                  >
                    <Text style={[styles.cellText, { flex: 1.2, fontWeight: '700' }]}>
                      {invoice.id}
                    </Text>
                    <Text style={[styles.cellText, { flex: 1.5, color: '#4B5563' }]}>
                      {invoice.customer}
                    </Text>
                    <Text style={[styles.cellText, { flex: 1.3, color: '#6B7280' }]}>
                      {invoice.date}
                    </Text>
                    <Text style={[styles.cellText, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: '#111827' }]}>
                      ₹{invoice.amount}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyTableState}>
                  <Text style={styles.emptyTableText}>
                    No invoices found for today. Create a new bill to get started!
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Datepicker Calendar Modal Overlay (Android Dark Style) */}
      <MaterialDatePicker
        visible={showDatePicker}
        initialDate={selectedFilterDate}
        onClose={() => setShowDatePicker(false)}
        onSetDate={(date) => {
          setSelectedFilterDate(date);
          setShowDatePicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({  root: {
    flex: 1,
    backgroundColor: '#FAF9F6', // Premium Off-white
  },
  bgOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FAF9F6',
    opacity: 0.98,
  },
  bgGeometricCircle: {
    position: 'absolute',
    borderRadius: 999,
    width: 300,
    height: 300,
    backgroundColor: '#DEB841',
    opacity: 0.02, // very subtle geometric background element
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // ── 3. Hero Section (Top Card) ──
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.1)',
  },
  heroLogoSquare: {
    width: 48,
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 4,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  heroLogo: {
    width: '100%',
    height: '100%',
  },
  heroBrandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  heroBrandSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#CBA135',
    letterSpacing: 3,
    marginTop: 4,
  },
  heroDivider: {
    height: 2,
    width: 40,
    backgroundColor: '#DEB841', // Gold divider line
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 1,
  },
  heroOverviewText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '300',
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '800',
    color: '#111827',
  },
  heroOverviewSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 3,
    textAlign: 'center',
  },

  // ── 4. Action Header ──
  actionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 16,
  },
  actionHeaderLeft: {
    flex: 1,
    paddingRight: 8,
  },
  actionHeaderTitle: {
    fontFamily: systemFont,
    fontSize: 22, // Increased from 19
    fontWeight: '800',
    color: '#111827',
  },
  actionHeaderSubtitle: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    color: '#6B7280',
    marginTop: 2,
  },
  newBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEB841', // Gold button
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  newBillIcon: {
    marginRight: 4,
  },
  newBillText: {
    fontFamily: systemFont,
    fontSize: 16, // Increased from 14
    fontWeight: '700',
    color: '#000000',
  },

  // ── 5. Metrics Grid ──
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metricCard: {
    width: (width - 32 - 12) / 2, // 2-Column layout
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardGoldTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#DEB841', // Thick gold top border
  },
  watermarkContainer: {
    position: 'absolute',
    bottom: -15,
    right: -15,
    opacity: 0.14, // Darker watermark
  },
  watermarkIcon: {
    transform: [{ rotate: '-10deg' }],
  },
  cardTitle: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  cardLargeValue: {
    fontFamily: systemFont,
    fontSize: 32, // Increased from 28
    fontWeight: '900',
    color: '#111827',
    marginTop: 10,
  },
  cardSubtitle: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    color: '#9CA3AF',
    marginTop: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  trendText: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 2,
  },
  cardAmountHighlight: {
    fontFamily: systemFont,
    fontSize: 18, // Increased from 16
    fontWeight: '800',
    color: '#CBA135', // Highlighted gold amount
    marginTop: 6,
  },
  cardLinkText: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '700',
    color: '#DEB841',
    marginTop: 12,
  },

  // ── 6. Data Table Section ──
  tableSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tableSectionTitle: {
    fontFamily: systemFont,
    fontSize: 21, // Increased from 18
    fontWeight: '800',
    color: '#111827',
  },
  viewAllBtnText: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    fontWeight: '700',
    color: '#DEB841',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 160,
    backgroundColor: '#FAF9F6',
  },
  dropdownBtnText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '700',
    color: '#4B5563',
    letterSpacing: 0.5,
  },
  clearFilterBtn: {
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearFilterBtnText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '700',
    color: '#4B5563',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
  },
  dialogContainer: {
    width: 328,
    backgroundColor: '#2D2D2D', // Material dark dialog color
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  dialogHeader: {
    backgroundColor: '#383838', // Header dark grey background
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#212121',
  },
  dialogHeaderYear: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  dialogHeaderDate: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 4,
  },
  dialogBody: {
    padding: 16,
    backgroundColor: '#2D2D2D',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  calNavBtn: {
    padding: 6,
    borderRadius: 20,
  },
  calendarMonthText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayCell: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellBtn: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 99, // Circle highlight
    marginVertical: 2,
  },
  dayCellBtnSelected: {
    backgroundColor: '#D0E2FF', // Light blue circle from screenshot
  },
  dayCellBtnEmpty: {
    backgroundColor: 'transparent',
  },
  dayCellText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dayCellTextSelected: {
    color: '#000000', // Black text inside light blue circle
    fontWeight: '900',
  },
  dayCellTextEmpty: {
    color: 'transparent',
  },
  dialogFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  footerRightBtns: {
    flexDirection: 'row',
    gap: 16,
  },
  footerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footerBtnText: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    fontWeight: '800',
    color: '#DEB841', // Gold footer buttons matching theme
    letterSpacing: 0.5,
  },
  tableContainer: {
    marginTop: 8,
  },
  tableColumnsHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 8,
  },
  colHeader: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
  },
  cellText: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    color: '#111827',
  },
  emptyTableState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTableText: {
    fontFamily: systemFont,
    color: '#9CA3AF',
    fontSize: 15, // Increased from 13
  },
});
