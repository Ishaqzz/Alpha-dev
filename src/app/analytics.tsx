import MaterialDatePicker from '@/components/MaterialDatePicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { useNavigation, router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import Header from '@/components/Header';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';

import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

const { width } = Dimensions.get('window');

const tableColumnWidths = {
  period: 82, 
  revenue: 105,
  purchase: 105,
  profit: 85,
  loss: 85,
};

type DailyBreakdown = {
  date: string;
  revenue: number;
  purchase: number;
  profit: number;
  loss: number;
};

// ── Weekly Performance Row Data Type ──
type WeeklyBreakdown = {
  period: string;
  revenue: number;
  purchase: number;
  profit: number;
  loss: number;
  dailyData: DailyBreakdown[];
};

export default function AnalyticsScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();

  // ── States ───────────────────────────────────────────────────────────────
  
  // Date Range states
  // Default to today so the page opens with today's sales
  const todayStr = (() => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  })();
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  
  // Calendar picker control states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickingField, setPickingField] = useState<'From' | 'To' | 'Single'>('From');

  // Open calendar pop-up
  const openDatePicker = (field: 'From' | 'To' | 'Single') => {
    setPickingField(field);
    setShowDatePicker(true);
  };

  // Expandable Section
  const [annualSummaryExpanded, setAnnualSummaryExpanded] = useState(false);

  // Dynamic Metric values state
  const [revenue, setRevenue] = useState(0.00);
  const [investment, setInvestment] = useState(0.00);
  const [profit, setProfit] = useState(0.00);
  const [loss, setLoss] = useState(0.00);

  // Inventory Value State
  const [totalInventoryValue, setTotalInventoryValue] = useState<number | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);

  // Weekly breakdown data (starts empty for a fresh build)
  const [weeklyBreakdownData, setWeeklyBreakdownData] = useState<WeeklyBreakdown[]>([]);
  const [expandedWeeks, setExpandedWeeks] = useState<number[]>([]);

  // Yearly Metric values state
  const [yearlyRevenue, setYearlyRevenue] = useState(0.00);
  const [yearlyInvestment, setYearlyInvestment] = useState(0.00);
  const [yearlyProfit, setYearlyProfit] = useState(0.00);
  const [allTimeInvestment, setAllTimeInvestment] = useState(0.00);

  // ── Monthly Analytics state ───────────────────────────────────────────────
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [monthlyPurchase, setMonthlyPurchase] = useState(0);
  const [monthlyProfit, setMonthlyProfit] = useState(0);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // ── Yearly Analytics state ────────────────────────────────────────────────
  const [selectedYearlyYear, setSelectedYearlyYear] = useState(now.getFullYear());
  const [yearlyPickerVisible, setYearlyPickerVisible] = useState(false);
  const [yearlyLoading, setYearlyLoading] = useState(false);

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Helper to parse 'd/m/yyyy' into a Date object
  const parseDateStr = (dateStr: string) => {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    return new Date(0);
  };

  const fetchAnalytics = async () => {
    try {
      const q = query(collection(db, 'bills'), orderBy('created_at', 'asc'));
      const querySnapshot = await getDocs(q);
      
      let totalRevenue = 0;
      let totalInvestment = 0;
      let yRevenue = 0;
      let yInvestment = 0;
      let allTimeInv = 0;
      const currentYear = new Date().getFullYear();

      const dailySales: { [dateStr: string]: number } = {};
      const dailyPurchases: { [dateStr: string]: number } = {};

      const start = parseDateStr(fromDate);
      const end = parseDateStr(toDate);

      querySnapshot.forEach((document) => {
        const data = document.data();
        const billDateStr = data.date; // format 'd/m/yyyy'
        const billDateObj = parseDateStr(billDateStr);

        const grandTotal = data.grandTotal || 0;
        const itemsArr = data.items || [];
        let billInvestment = 0;
        itemsArr.forEach((item: any) => {
          const qty = item.qty || 0;
          const cost = item.purchasePrice || 0;
          billInvestment += qty * cost;
        });

        allTimeInv += billInvestment;

        if (billDateObj >= start && billDateObj <= end) {
          totalRevenue += grandTotal;
          dailySales[billDateStr] = (dailySales[billDateStr] || 0) + grandTotal;
          dailyPurchases[billDateStr] = (dailyPurchases[billDateStr] || 0) + billInvestment;
          totalInvestment += billInvestment;
        }
      });

      setRevenue(totalRevenue);
      setInvestment(totalInvestment);
      setAllTimeInvestment(allTimeInv);

      const netProfit = totalRevenue - totalInvestment;
      if (netProfit >= 0) {
        setProfit(netProfit);
        setLoss(0);
      } else {
        setProfit(0);
        setLoss(Math.abs(netProfit));
      }

      // Weekly breakdown is now handled by fetchMonthlyAnalytics
    } catch (e) {
      console.error('[Analytics] Error calculating analytics:', e);
    }
  };

  // ── Monthly fetch ─────────────────────────────────────────────────────────
  const fetchMonthlyAnalytics = async (month: number, year: number) => {
    try {
      setMonthlyLoading(true);
      const q = query(collection(db, 'bills'), orderBy('created_at', 'asc'));
      const querySnapshot = await getDocs(q);
      let mRevenue = 0;
      let mPurchase = 0;

      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      const weeklyData: WeeklyBreakdown[] = Array.from({ length: 5 }, (_, i) => ({
        period: `Week ${i + 1}`,
        revenue: 0,
        purchase: 0,
        profit: 0,
        loss: 0,
        dailyData: []
      }));

      // Pre-populate daily data
      for (let d = 1; d <= daysInMonth; d++) {
        let weekIndex = Math.floor((d - 1) / 7);
        if (weekIndex > 4) weekIndex = 4;
        weeklyData[weekIndex].dailyData.push({
          date: `${d}/${month + 1}/${year}`,
          revenue: 0,
          purchase: 0,
          profit: 0,
          loss: 0
        });
      }

      querySnapshot.forEach((document) => {
        const data = document.data();
        const billDateObj = parseDateStr(data.date);
        if (
          billDateObj.getMonth() === month &&
          billDateObj.getFullYear() === year
        ) {
          mRevenue += data.grandTotal || 0;
          let billPurchase = 0;
          const itemsArr = data.items || [];
          itemsArr.forEach((item: any) => {
            billPurchase += (item.qty || 0) * (item.purchasePrice || 0);
          });
          mPurchase += billPurchase;

          const date = billDateObj.getDate();
          let weekIndex = Math.floor((date - 1) / 7);
          if (weekIndex > 4) weekIndex = 4; // Group days 29, 30, 31 into Week 5

          weeklyData[weekIndex].revenue += (data.grandTotal || 0);
          weeklyData[weekIndex].purchase += billPurchase;
          
          const dailyIndex = date - 1 - (weekIndex * 7);
          if (weeklyData[weekIndex].dailyData[dailyIndex]) {
            weeklyData[weekIndex].dailyData[dailyIndex].revenue += (data.grandTotal || 0);
            weeklyData[weekIndex].dailyData[dailyIndex].purchase += billPurchase;
          }
        }
      });

      // Calculate profit and loss for each week and day
      weeklyData.forEach(w => {
        const wNet = w.revenue - w.purchase;
        w.profit = wNet >= 0 ? wNet : 0;
        w.loss = wNet < 0 ? Math.abs(wNet) : 0;
        
        w.dailyData.forEach(d => {
          const dNet = d.revenue - d.purchase;
          d.profit = dNet >= 0 ? dNet : 0;
          d.loss = dNet < 0 ? Math.abs(dNet) : 0;
        });
      });

      setWeeklyBreakdownData(weeklyData);
      setMonthlyRevenue(mRevenue);
      setMonthlyPurchase(mPurchase);
      setMonthlyProfit(mRevenue - mPurchase);
    } catch (e) {
      console.error('[Analytics] Monthly fetch error:', e);
    } finally {
      setMonthlyLoading(false);
    }
  };

  // ── Yearly fetch ──────────────────────────────────────────────────────────
  const fetchYearlyAnalytics = async (year: number) => {
    try {
      setYearlyLoading(true);
      const q = query(collection(db, 'bills'), orderBy('created_at', 'asc'));
      const querySnapshot = await getDocs(q);
      
      let yRev = 0;
      let yInv = 0;
      
      querySnapshot.forEach((document) => {
        const data = document.data();
        const billDateObj = parseDateStr(data.date);
        
        if (billDateObj.getFullYear() === year) {
          yRev += data.grandTotal || 0;
          let billInv = 0;
          const itemsArr = data.items || [];
          itemsArr.forEach((item: any) => {
             billInv += (item.qty || 0) * (item.purchasePrice || 0);
          });
          yInv += billInv;
        }
      });
      
      setYearlyRevenue(yRev);
      setYearlyInvestment(yInv);
      setYearlyProfit(yRev - yInv);
    } catch (e) {
      console.error('[Analytics] Yearly fetch error:', e);
    } finally {
      setYearlyLoading(false);
    }
  };

  const fetchInventoryValue = async () => {
    try {
      setInventoryLoading(true);
      const querySnapshot = await getDocs(collection(db, 'products'));
      let totalValue = 0;
      querySnapshot.forEach((document) => {
        const data = document.data();
        if (data.isActive !== false) {
          const stock = data.stock || 0;
          const cost = data.purchase_price || 0;
          totalValue += stock * cost;
        }
      });
      setTotalInventoryValue(totalValue);
    } catch (e) {
      console.error('[Analytics] Error calculating inventory value:', e);
      setTotalInventoryValue(0);
    } finally {
      setInventoryLoading(false);
    }
  };

  // Re-fetch when dates change or screen gains focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchAnalytics();
      fetchInventoryValue();
    });
    return unsubscribe;
  }, [navigation, fromDate, toDate]);

  useEffect(() => {
    fetchAnalytics();
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchInventoryValue();
    fetchMonthlyAnalytics(selectedMonth, selectedYear);
    fetchYearlyAnalytics(selectedYearlyYear);
  }, []);

  // Re-fetch monthly data when month/year selection changes
  useEffect(() => {
    fetchMonthlyAnalytics(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  // Re-fetch yearly data when year selection changes
  useEffect(() => {
    fetchYearlyAnalytics(selectedYearlyYear);
  }, [selectedYearlyYear]);

  const handleRefresh = () => {
    fetchAnalytics();
    fetchInventoryValue();
    fetchMonthlyAnalytics(selectedMonth, selectedYear);
    fetchYearlyAnalytics(selectedYearlyYear);
  };

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAnalytics();
    await fetchInventoryValue();
    await fetchMonthlyAnalytics(selectedMonth, selectedYear);
    await fetchYearlyAnalytics(selectedYearlyYear);
    setRefreshing(false);
  }, [selectedMonth, selectedYear, selectedYearlyYear]);



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
        
        {/* ── 1. Header & New Date Filter ── */}
        <View style={styles.headerSection}>
          <Text style={styles.mainTitle}>SALES ANALYTICS</Text>
          <Text style={styles.subTitle}>Detailed performance breakdown for the selected period.</Text>
          
          {/* Custom Date Range Selector Row */}
          <View style={styles.filterCard}>
            <View style={styles.dateInputsRow}>
              {/* From Date */}
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => openDatePicker('From')}
                activeOpacity={0.8}
              >
                <Text style={styles.dateLabel}>From Date</Text>
                <View style={styles.dateValueRow}>
                  <Text style={styles.dateValueText}>{fromDate}</Text>
                  <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#6B7280" />
                </View>
              </TouchableOpacity>

              {/* To Date */}
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => openDatePicker('To')}
                activeOpacity={0.8}
              >
                <Text style={styles.dateLabel}>To Date</Text>
                <View style={styles.dateValueRow}>
                  <Text style={styles.dateValueText}>{toDate}</Text>
                  <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#6B7280" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
              {/* Single Day Search button */}
              <TouchableOpacity
                style={[styles.refreshBtn, { backgroundColor: '#DBEAFE', flex: 1, marginRight: 8 }]}
                onPress={() => openDatePicker('Single')}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="calendar-search" size={16} color="#1D4ED8" style={styles.refreshIcon} />
                <Text style={[styles.refreshBtnText, { color: '#1D4ED8' }]}>Search Single Date</Text>
              </TouchableOpacity>

              {/* Refresh Data button */}
              <TouchableOpacity
                style={[styles.refreshBtn, { flex: 1, marginLeft: 8 }]}
                onPress={handleRefresh}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="reload" size={16} color="#4B5563" style={styles.refreshIcon} />
                <Text style={styles.refreshBtnText}>Refresh Data</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── 2. Summary Metrics Grid (2x2) ── */}
        <View style={styles.metricsGrid}>
          {/* Card 1: REVENUE */}
          <View style={[styles.metricCard, { borderLeftColor: '#3B82F6' }]}>
            <Text style={styles.cardTitle}>REVENUE (PERIOD)</Text>
            <Text style={styles.cardValue}>₹{revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          {/* Card 2: INVESTMENT */}
          <View style={[styles.metricCard, { borderLeftColor: '#EF4444' }]}>
            <Text style={styles.cardTitle}>INVESTMENT (PERIOD)</Text>
            <Text style={styles.cardValue}>₹{investment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          {/* Card 3: PROFIT */}
          <View style={[styles.metricCard, { borderLeftColor: '#10B981' }]}>
            <Text style={styles.cardTitle}>PROFIT (PERIOD)</Text>
            <Text style={[styles.cardValue, { color: '#10B981' }]}>₹{profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          {/* Card 4: LOSS */}
          <View style={[styles.metricCard, { borderLeftColor: '#F59E0B' }]}>
            <Text style={styles.cardTitle}>LOSS (PERIOD)</Text>
            <Text style={[styles.cardValue, { color: '#F59E0B' }]}>₹{loss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          {/* Card 5: LIVE INVENTORY VALUE */}
          <View style={[styles.metricCard, { borderLeftColor: '#8B5CF6', width: '100%' }]}>
            <Text style={styles.cardTitle}>LIVE INVENTORY VALUE</Text>
            {inventoryLoading ? (
              <Text style={[styles.cardValue, { fontSize: 16, color: '#6B7280' }]}>Loading...</Text>
            ) : (
              <Text style={[styles.cardValue, { color: '#8B5CF6' }]}>₹{(totalInventoryValue ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            )}
          </View>
        </View>

        {/* ── NEW: Monthly Purchase & Sales Card ── */}
        <View style={styles.monthlyCard}>
          {/* Gold top-accent line */}
          <View style={styles.monthlyCardAccent} />

          {/* Header row */}
          <View style={styles.monthlyHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.monthlyCardTitle}>MONTHLY PURCHASE SUMMARY</Text>
              <Text style={styles.monthlyCardSub}>Select a month to view aggregated totals</Text>
            </View>
            <TouchableOpacity
              style={styles.monthSelectorBtn}
              onPress={() => setMonthPickerVisible(!monthPickerVisible)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="calendar-month" size={16} color="#DEB841" />
              <Text style={styles.monthSelectorBtnText}>
                {MONTHS[selectedMonth].slice(0, 3)} {selectedYear}
              </Text>
              <MaterialCommunityIcons
                name={monthPickerVisible ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#DEB841"
              />
            </TouchableOpacity>
          </View>

          {/* Inline Month / Year picker panel */}
          {monthPickerVisible && (
            <View style={styles.monthPickerPanel}>
              {/* Year row */}
              <View style={styles.yearNavRow}>
                <TouchableOpacity
                  style={styles.yearNavBtn}
                  onPress={() => setSelectedYear(y => y - 1)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color="#9CA3AF" />
                </TouchableOpacity>
                <Text style={styles.yearNavLabel}>{selectedYear}</Text>
                <TouchableOpacity
                  style={styles.yearNavBtn}
                  onPress={() => setSelectedYear(y => Math.min(y + 1, new Date().getFullYear()))}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Month grid */}
              <View style={styles.monthGrid}>
                {MONTHS.map((m, idx) => {
                  const isActive = idx === selectedMonth;
                  const isFuture =
                    selectedYear === new Date().getFullYear() && idx > new Date().getMonth();
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.monthCell,
                        isActive && styles.monthCellActive,
                        isFuture && styles.monthCellDisabled,
                      ]}
                      disabled={isFuture}
                      onPress={() => {
                        setSelectedMonth(idx);
                        setMonthPickerVisible(false);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.monthCellText,
                          isActive && styles.monthCellTextActive,
                          isFuture && styles.monthCellTextDisabled,
                        ]}
                      >
                        {m.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Metric pills */}
          {monthlyLoading ? (
            <View style={styles.monthlyLoadingRow}>
              <MaterialCommunityIcons name="loading" size={20} color="#DEB841" />
              <Text style={styles.monthlyLoadingText}>Loading {MONTHS[selectedMonth]}…</Text>
            </View>
          ) : (
            <View style={styles.monthlyMetricsRow}>
              {/* Revenue */}
              <View style={[styles.monthlyMetricPill, { borderLeftColor: '#3B82F6' }]}>
                <Text style={styles.monthlyMetricLabel}>REVENUE</Text>
                <Text style={[styles.monthlyMetricValue, { color: '#3B82F6' }]}>
                  ₹{monthlyRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              {/* Purchase / Investment */}
              <View style={[styles.monthlyMetricPill, { borderLeftColor: '#EF4444' }]}>
                <Text style={styles.monthlyMetricLabel}>PURCHASE</Text>
                <Text style={[styles.monthlyMetricValue, { color: '#EF4444' }]}>
                  ₹{monthlyPurchase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              {/* Net Profit/Loss */}
              <View
                style={[
                  styles.monthlyMetricPill,
                  { borderLeftColor: monthlyProfit >= 0 ? '#10B981' : '#F59E0B' },
                ]}
              >
                <Text style={styles.monthlyMetricLabel}>
                  {monthlyProfit >= 0 ? 'PROFIT' : 'LOSS'}
                </Text>
                <Text style={[styles.monthlyMetricValue, { color: monthlyProfit >= 0 ? '#10B981' : '#F59E0B' }]}>
                  ₹{Math.abs(monthlyProfit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 3. YEARLY Performance Dashboard ── */}
        <View style={styles.monthlyCard}>
          <View style={styles.monthlyCardAccent} />

          <View style={styles.monthlyHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.monthlyCardTitle}>YEARLY PERFORMANCE SUMMARY</Text>
              <Text style={styles.monthlyCardSub}>Select a year to view aggregated totals</Text>
            </View>
            <TouchableOpacity
              style={styles.monthSelectorBtn}
              onPress={() => setYearlyPickerVisible(!yearlyPickerVisible)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="calendar-month" size={16} color="#DEB841" />
              <Text style={styles.monthSelectorBtnText}>{selectedYearlyYear}</Text>
              <MaterialCommunityIcons
                name={yearlyPickerVisible ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#DEB841"
              />
            </TouchableOpacity>
          </View>

          {/* Inline Year picker panel */}
          {yearlyPickerVisible && (
            <View style={styles.monthPickerPanel}>
              <View style={styles.yearNavRow}>
                <TouchableOpacity
                  style={styles.yearNavBtn}
                  onPress={() => setSelectedYearlyYear(y => y - 1)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.yearNavLabel}>{selectedYearlyYear}</Text>
                <TouchableOpacity
                  style={styles.yearNavBtn}
                  onPress={() => setSelectedYearlyYear(y => Math.min(y + 1, new Date().getFullYear()))}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#111827" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Metric pills */}
          {yearlyLoading ? (
            <View style={styles.monthlyLoadingRow}>
              <MaterialCommunityIcons name="loading" size={20} color="#DEB841" />
              <Text style={styles.monthlyLoadingText}>Loading {selectedYearlyYear}…</Text>
            </View>
          ) : (
            <View style={styles.monthlyMetricsRow}>
              {/* Revenue (Sales) */}
              <View style={[styles.monthlyMetricPill, { borderLeftColor: '#3B82F6' }]}>
                <Text style={styles.monthlyMetricLabel}>TOTAL REVENUE</Text>
                <Text style={[styles.monthlyMetricValue, { color: '#3B82F6' }]}>
                  ₹{yearlyRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              {/* Investment (Purchases) */}
              <View style={[styles.monthlyMetricPill, { borderLeftColor: '#EF4444' }]}>
                <Text style={styles.monthlyMetricLabel}>TOTAL INVESTED</Text>
                <Text style={[styles.monthlyMetricValue, { color: '#EF4444' }]}>
                  ₹{yearlyInvestment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              {/* Gross Profit/Loss */}
              <View
                style={[
                  styles.monthlyMetricPill,
                  { borderLeftColor: yearlyProfit >= 0 ? '#10B981' : '#F59E0B' },
                ]}
              >
                <Text style={styles.monthlyMetricLabel}>
                  {yearlyProfit >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS'}
                </Text>
                <Text style={[styles.monthlyMetricValue, { color: yearlyProfit >= 0 ? '#10B981' : '#F59E0B' }]}>
                  ₹{Math.abs(yearlyProfit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          )}
          
          {/* Total Shop Purchases Footer */}
          <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
             <View>
               <Text style={{ fontFamily: systemFont, fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 1 }}>TOTAL SHOP PURCHASES (ALL TIME)</Text>
               <Text style={{ fontFamily: systemFont, fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>Live Stock + All Historical COGS</Text>
             </View>
             <Text style={{ fontFamily: systemFont, fontSize: 18, fontWeight: '900', color: '#D97706' }}>
               ₹{((totalInventoryValue ?? 0) + allTimeInvestment).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </Text>
          </View>
        </View>

        {/* ── 4. Data Table Section ── */}
        <View style={styles.tableCard}>
          <Text style={styles.tableTitle}>WEEKLY PERFORMANCE BREAKDOWN</Text>
          
          <ScrollView horizontal={true} showsHorizontalScrollIndicator={true}>
            <View style={styles.tableWrapper}>
              
              {/* Header Row */}
              <View style={[styles.tableHeaderRow, { backgroundColor: '#DEB841', paddingHorizontal: 8, gap: 0 }]}>
                <Text style={[styles.thCell, { width: tableColumnWidths.period, color: '#FFFFFF', textAlign: 'center' }]}>TIME PERIOD</Text>
                <View style={styles.vDividerLight} />
                <Text style={[styles.thCell, { width: tableColumnWidths.revenue, textAlign: 'center', color: '#FFFFFF' }]}>REVENUE (SALES)</Text>
                <View style={styles.vDividerLight} />
                <Text style={[styles.thCell, { width: tableColumnWidths.purchase, textAlign: 'center', color: '#FFFFFF' }]}>PURCHASE (INV.)</Text>
                <View style={styles.vDividerLight} />
                <Text style={[styles.thCell, { width: tableColumnWidths.profit, textAlign: 'center', color: '#FFFFFF' }]}>PROFIT</Text>
                <View style={styles.vDividerLight} />
                <Text style={[styles.thCell, { width: tableColumnWidths.loss, textAlign: 'center', color: '#FFFFFF' }]}>LOSS</Text>
              </View>

              {/* Data Rows */}
              {weeklyBreakdownData.length > 0 ? (
                weeklyBreakdownData.map((row, index) => {
                  const isExpanded = expandedWeeks.includes(index);
                  const isEven = index % 2 === 0;
                  return (
                    <View key={index}>
                      <TouchableOpacity
                        style={[
                          styles.tableDataRow,
                          isEven ? styles.tableDataRowEven : styles.tableDataRowOdd,
                          { paddingHorizontal: 8, gap: 0 }
                        ]}
                        onPress={() => {
                          if (isExpanded) {
                            setExpandedWeeks(expandedWeeks.filter(i => i !== index));
                          } else {
                            setExpandedWeeks([...expandedWeeks, index]);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ width: tableColumnWidths.period, flexDirection: 'row', alignItems: 'center' }}>
                          <MaterialCommunityIcons name={isExpanded ? 'chevron-down' : 'chevron-right'} size={18} color="#6B7280" />
                          <Text style={[styles.tdText, { fontWeight: '700', marginLeft: 4 }]}>{row.period}</Text>
                        </View>
                        <View style={styles.vDivider} />
                        <Text style={[styles.tdText, { width: tableColumnWidths.revenue, textAlign: 'center', color: '#1F2937' }]}>
                          ₹{row.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <View style={styles.vDivider} />
                        <Text style={[styles.tdText, { width: tableColumnWidths.purchase, textAlign: 'center', color: '#4B5563' }]}>
                          ₹{row.purchase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <View style={styles.vDivider} />
                        <Text style={[styles.tdText, { width: tableColumnWidths.profit, textAlign: 'center', fontWeight: '800', color: '#10B981' }]}>
                          ₹{row.profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                        <View style={styles.vDivider} />
                        <Text style={[styles.tdText, { width: tableColumnWidths.loss, textAlign: 'center', fontWeight: '800', color: '#F59E0B' }]}>
                          ₹{row.loss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Text>
                      </TouchableOpacity>

                      {isExpanded && row.dailyData.map((day, dIdx) => (
                        <View key={`day-${index}-${dIdx}`} style={[styles.tableDataRow, { backgroundColor: '#F9FAFB', paddingHorizontal: 8, gap: 0 }]}>
                          <View style={{ width: tableColumnWidths.period, paddingLeft: 12 }}>
                            <Text style={[styles.tdText, { fontSize: 12, color: '#6B7280' }]}>{day.date}</Text>
                          </View>
                          <View style={styles.vDivider} />
                          <Text style={[styles.tdText, { width: tableColumnWidths.revenue, textAlign: 'center', color: '#1F2937', fontSize: 12 }]}>
                            ₹{day.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <View style={styles.vDivider} />
                          <Text style={[styles.tdText, { width: tableColumnWidths.purchase, textAlign: 'center', color: '#4B5563', fontSize: 12 }]}>
                            ₹{day.purchase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <View style={styles.vDivider} />
                          <Text style={[styles.tdText, { width: tableColumnWidths.profit, textAlign: 'center', fontWeight: '700', color: '#10B981', fontSize: 12 }]}>
                            ₹{day.profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                          <View style={styles.vDivider} />
                          <Text style={[styles.tdText, { width: tableColumnWidths.loss, textAlign: 'center', fontWeight: '700', color: '#F59E0B', fontSize: 12 }]}>
                            ₹{day.loss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })
              ) : (
                <View
                  style={[
                    styles.emptyTableState,
                    {
                      width:
                        tableColumnWidths.period +
                        tableColumnWidths.revenue +
                        tableColumnWidths.purchase +
                        tableColumnWidths.profit +
                        tableColumnWidths.loss,
                    },
                  ]}
                >
                  <Text style={styles.emptyTableText}>
                    No analytics breakdown data available for this range.
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Datepicker Calendar Modal Overlay (Android Dark Style) ── */}
      <MaterialDatePicker
        visible={showDatePicker}
        initialDate={pickingField === 'From' ? fromDate : toDate}
        onClose={() => setShowDatePicker(false)}
        onSetDate={(date) => {
          if (date) {
            if (pickingField === 'From') {
              setFromDate(date);
            } else if (pickingField === 'To') {
              setToDate(date);
            } else if (pickingField === 'Single') {
              setFromDate(date);
              setToDate(date);
              // Navigate to the Dashboard for this single date
              router.push({ pathname: '/', params: { date } });
            }
          }
          setShowDatePicker(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6', // Off-white
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // ── 1. Header & Date Picker Styles ──
  headerSection: {
    marginBottom: 20,
  },
  mainTitle: {
    fontFamily: systemFont,
    fontSize: 26, // Increased from 20
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
  },
  subTitle: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateInputsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  datePickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FAF9F6',
  },
  dateLabel: {
    fontFamily: systemFont,
    fontSize: 11, // Increased from 9
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateValueText: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    fontWeight: '700',
    color: '#111827',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  refreshIcon: {
    marginRight: 6,
  },
  refreshBtnText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '700',
    color: '#4B5563',
  },

  // ── 2. Metrics Grid Styles ──
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  metricCard: {
    width: (width - 32 - 12) / 2, // 2x2 grid
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4, // Colored left border
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cardTitle: {
    fontFamily: systemFont,
    fontSize: 11, // Increased from 9
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontFamily: systemFont,
    fontSize: 21, // Increased from 18
    fontWeight: '900',
    color: '#111827',
    marginTop: 8,
  },

  // ── 3. Annual Performance Styles ──
  annualSummaryContainer: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#DEB841', // Gold border to make it unique
  },
  annualHeader: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6', 
  },
  annualHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  annualHeaderTitle: {
    fontFamily: systemFont,
    fontSize: 13, 
    fontWeight: '900',
    color: '#111827', // Dark text
    letterSpacing: 0.5,
    marginLeft: 6,
    flexShrink: 1,
  },
  annualBody: {
    padding: 20,
    backgroundColor: '#FAF9F6', 
  },
  annualItem: {
    flexDirection: 'column',
  },
  annualLabel: {
    fontFamily: systemFont,
    fontSize: 11, 
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 1,
    marginBottom: 4,
  },
  annualVal: {
    fontFamily: systemFont,
    fontSize: 28, 
    fontWeight: '900',
  },

  // ── 4. Data Table Styles ──
  tableCard: {
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
    marginBottom: 16,
  },
  // ── Monthly Card Styles ──
  monthlyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  monthlyCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#DEB841',
  },
  monthlyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  monthlyCardTitle: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '900',
    color: '#DEB841',
    letterSpacing: 1,
  },
  monthlyCardSub: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 3,
  },
  monthSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FAF9F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#DEB841',
  },
  monthSelectorBtnText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#DEB841',
  },
  monthPickerPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  yearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  yearNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FAF9F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  yearNavLabel: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    minWidth: 50,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthCell: {
    width: '22%',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  monthCellActive: {
    backgroundColor: '#DEB841',
    borderColor: '#DEB841',
  },
  monthCellDisabled: {
    opacity: 0.35,
  },
  monthCellText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  monthCellTextActive: {
    color: '#FFFFFF',
  },
  monthCellTextDisabled: {
    color: '#9CA3AF',
  },
  monthlyLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  monthlyLoadingText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  monthlyMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  monthlyMetricPill: {
    flex: 1,
    minWidth: 90,
    backgroundColor: '#FAF9F6',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  monthlyMetricLabel: {
    fontFamily: systemFont,
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  monthlyMetricValue: {
    fontFamily: systemFont,
    fontSize: 17,
    fontWeight: '900',
  },

  tableTitle: {
    fontFamily: systemFont,
    fontSize: 15, // Increased from 13
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  tableWrapper: {
    flexDirection: 'column',
    minWidth: Object.values(tableColumnWidths).reduce((sum, value) => sum + value, 0) + (4 * 16) + 32,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FAF9F6',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
    gap: 8, 
  },
  thCell: {
    fontFamily: systemFont,
    fontSize: 12, // Increased from 10
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
    gap: 8, 
  },
  tableDataRowEven: {
    backgroundColor: '#FFFFFF',
  },
  tableDataRowOdd: {
    backgroundColor: '#FDFBF7',
  },
  vDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },
  vDividerLight: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },
  tdText: {
    fontFamily: systemFont,
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  emptyTableState: {
    alignItems: 'center',
    paddingVertical: 24,
    width:
      tableColumnWidths.period +
      tableColumnWidths.revenue +
      tableColumnWidths.purchase +
      tableColumnWidths.profit +
      tableColumnWidths.loss,
  },
  emptyTableText: {
    fontFamily: systemFont,
    color: '#9CA3AF',
    fontSize: 15, // Increased from 13
  },

  // ── Material Dark Calendar Styles ──
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
    backgroundColor: '#2D2D2D',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  dialogHeader: {
    backgroundColor: '#383838',
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
    borderRadius: 99,
    marginVertical: 2,
  },
  dayCellBtnSelected: {
    backgroundColor: '#D0E2FF',
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
    color: '#000000',
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
    fontSize: 13,
    fontWeight: '800',
    color: '#DEB841',
    letterSpacing: 0.5,
  },
});

