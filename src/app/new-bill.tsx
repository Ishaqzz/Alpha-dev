import Header from '@/components/Header';
import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { InvoiceReceipt } from '../components/InvoiceReceipt';
import { db } from '../firebaseConfig';
import { useProducts } from '../hooks/useProducts';
import { shareInvoiceToWhatsApp } from '../utils/shareInvoiceWhatsApp';
import { generateWhatsAppReceiptText } from '../utils/whatsappHelper';

const { width } = Dimensions.get('window');

// ── Web Fallback Font for Symmetrical Browser Display ──
const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

// Helper: extract numeric portion from a BILL-XXXX string, returns 0 if invalid
const parseBillNumber = (val: string | undefined | null): number => {
  if (!val) return 0;
  const match = String(val).match(/^BILL-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
};

// Helper: format a numeric bill sequence into BILL-XXXX string
const formatBillNumber = (num: number): string => {
  return 'BILL-' + String(num).padStart(4, '0');
};

// Robust bill number generator — always continues from the latest bill in Firestore
const generateNextBillNumber = async (): Promise<string> => {
  let maxNum = 0;

  try {
    // Get all bills to find the true maximum
    // (In a very large production app, you might want to use a counter document,
    // but for now, fetching the collection or using a robust query works).
    const allSnap = await getDocs(collection(db, 'bills'));
    for (const docSnap of allSnap.docs) {
      const data = docSnap.data();
      // Check sequence, billNo, and doc ID
      const seq = data.billSequence;
      if (typeof seq === 'number' && seq > maxNum) {
        maxNum = seq;
      }
      const candidates = [data.billNo, data.bill_number, docSnap.id];
      for (const candidate of candidates) {
        const num = parseBillNumber(candidate);
        if (num > maxNum) maxNum = num;
      }
    }
  } catch (err: any) {
    console.error('[BillGen] Failed to fetch bills for number generation:', err);
  }

  if (maxNum > 0) {
    return formatBillNumber(maxNum + 1);
  }

  // Collection is truly empty — start from BILL-0001
  return 'BILL-0001';
};

// ── Types ────────────────────────────────────────────────────────────────────
type LineItem = {
  id: number;
  productId: string;
  itemCode: string;
  itemDesc: string;
  qty: number;
  actualRate: number;
  discountRate: number;
  availableStock: number;
  purchasePrice: number; // ← always persisted; was missing causing ₹0 on saved bills
};

export default function NewBillScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const swipeHandlers = useDrawerSwipeGesture();
  const router = useRouter();
  const { editBillId } = useLocalSearchParams();
  const [originalBill, setOriginalBill] = useState<any>(null);

  // ── Receipt Capture Refs ──
  const receiptRef = React.useRef<ViewShot>(null);
  const [showHiddenReceipt, setShowHiddenReceipt] = useState(false);

  // ── Company Header Placeholders ──────────────────────────────────────────
  const [companyName] = useState('ALPHA SPORTS WEAR');
  const [companySubtitle] = useState('Premium Sports & Activewear');
  const [companyAddress] = useState('47/9, Kariya Gounder St,\nSirupooluvapatti, Khaderpet,\nRayapuram, Tiruppur, Tamil Nadu\n641601');
  const [companyPhone] = useState('+91 7395980429');

  // ── Invoice Meta States ──────────────────────────────────────────────────
  const [billNo, setBillNo] = useState('BILL-0001'); // Mutable state
  const [billDate, setBillDate] = useState('');
  const [billTime, setBillTime] = useState('');

  // Automatically set current date and tick time every second (ONLY for new bills)
  React.useEffect(() => {
    if (editBillId) return; // Freeze date/time when editing

    const updateDateTime = () => {
      const now = new Date();
      
      // Format: d/m/yyyy (e.g. 2/7/2026)
      const formattedDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
      setBillDate(formattedDate);
      
      // Format: hh:mm:ss am/pm (e.g. 1:27:50 pm)
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'pm' : 'am';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      const formattedTime = `${hours}:${minutes}:${seconds} ${ampm}`;
      setBillTime(formattedTime);
    };

    // Run immediately
    updateDateTime();

    // Set interval to update time every second
    const timerId = setInterval(updateDateTime, 1000);

    // Clean up timer on unmount
    return () => clearInterval(timerId);
  }, [editBillId]);

  const [storeGstNumber, setStoreGstNumber] = useState<string>('');

  React.useEffect(() => {
    const fetchStoreGst = async () => {
      try {
        const storeSnap = await getDoc(doc(db, 'settings', 'store_config'));
        if (storeSnap.exists()) {
          setStoreGstNumber(storeSnap.data().gst_number || '');
        }
      } catch (err) {
        console.error('Error fetching store config:', err);
      }
    };
    fetchStoreGst();
  }, []);

  // ── Customer Details States ──────────────────────────────────────────────
  const [mobileNo, setMobileNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [transportService, setTransportService] = useState('');

  // ── Product Table States ─────────────────────────────────────────────────
  const emptyRow = (): LineItem => ({
    id: 1,
    productId: '',
    itemCode: '',
    itemDesc: '',
    qty: 1,
    actualRate: 0,
    discountRate: 0,
    availableStock: 0,
    purchasePrice: 0,
  });

  const [items, setItems] = useState<LineItem[]>([emptyRow()]);

  // Inline Product Search States
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  const [inlineSearch, setInlineSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [billNoLoading, setBillNoLoading] = useState(true);

  // Firestore standard hook
  const { products, fetchProducts } = useProducts();

  // Fetch products and next bill number on focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchProducts();
      fetchNextBillNo();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    fetchProducts();
    fetchNextBillNo();
  }, []);

  const fetchNextBillNo = async () => {
    if (editBillId) return; // Do not fetch new bill number if editing an existing bill
    
    setBillNoLoading(true);
    try {
      const nextBillNo = await generateNextBillNumber();
      setBillNo(nextBillNo);
    } catch (e: any) {
      console.error('[NewBill] Error fetching next bill number:', e);
      setBillNo(''); // Leave empty to prevent accidental use of wrong number
      Alert.alert(
        'Bill Number Error',
        e?.message || 'Could not generate the next bill number. Please check your internet connection and try again.',
        [
          { text: 'Retry', onPress: () => fetchNextBillNo() },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setBillNoLoading(false);
    }
  };

  // ── Edit Bill Initializer ──
  useEffect(() => {
    if (editBillId) {
      const fetchEditBill = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'bills', editBillId as string));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setOriginalBill(data);
            setBillNo(data.billNo || data.bill_number);
            setMobileNo(data.mobileNo || data.mobile || data.mobile_number || '');
            setCustomerName(data.customerName || data.name || data.customer_name || '');
            setShopName(data.shopName || data.shop_name || '');
            setTransportService(data.transportService || data.transport || '');
            if (data.date) setBillDate(data.date);
            if (data.time) setBillTime(data.time);
            setApplyGST(data.gstEnabled || data.applyGST || false);
            setPaymentMethod(data.paymentMethod || 'Cash');
            if (data.paymentMethod === 'Both') {
              setCashSplit(data.cashSplit ? String(data.cashSplit) : '');
              setUpiSplit(data.upiSplit ? String(data.upiSplit) : '');
            }
            
            // Re-construct items and fetch current stock for them
            if (data.items && data.items.length > 0) {
              const mappedItems = await Promise.all(data.items.map(async (i: any, index: number) => {
                // Fetch the product to get its current real stock
                let currentStock = 0;
                try {
                  const prodSnap = await getDoc(doc(db, 'products', i.productId));
                  if (prodSnap.exists()) {
                    currentStock = prodSnap.data().stock || 0;
                  }
                } catch (e) {}
                
                return {
                  id: index + 1,
                  productId: i.productId || '',
                  itemCode: i.itemCode || '',
                  itemDesc: i.itemDesc || '',
                  qty: i.qty || 0,
                  actualRate: i.actualRate || 0,
                  discountRate: i.discountRate || 0,
                  availableStock: currentStock + (i.qty || 0), // available stock is current + what was already deducted
                  purchasePrice: i.purchasePrice || 0,
                };
              }));
              setItems(mappedItems);
            }
          }
        } catch (error) {
          console.error('[NewBill] Error fetching bill for edit:', error);
          Alert.alert('Error', 'Could not load the bill for editing.');
        } finally {
          setBillNoLoading(false);
        }
      };
      fetchEditBill();
    }
  }, [editBillId]);

  // Customer autofill trigger
  useEffect(() => {
    const rawMobile = mobileNo.trim();
    const cleanMobile = rawMobile.replace(/\D/g, ''); 
    
    if (cleanMobile.length >= 10 || rawMobile.length >= 10) {
      const targetMobile = cleanMobile.length >= 10 ? cleanMobile.slice(-10) : rawMobile;

      const fetchCustomer = async () => {
        try {
          // 1. Check 'customers' collection
          const docSnap1 = await getDoc(doc(db, 'customers', targetMobile));
          if (docSnap1.exists()) {
            const data = docSnap1.data();
            setCustomerName(data.name || data.customerName || '');
            setShopName(data.shop_name || data.shopName || '');
            setTransportService(data.transport || data.transportService || '');
            return;
          }

          if (rawMobile !== targetMobile) {
            const docSnap2 = await getDoc(doc(db, 'customers', rawMobile));
            if (docSnap2.exists()) {
              const data = docSnap2.data();
              setCustomerName(data.name || data.customerName || '');
              setShopName(data.shop_name || data.shopName || '');
              setTransportService(data.transport || data.transportService || '');
              return;
            }
          }

          // 2. Ultimate Fallback: Search 'bills' using `in` queries across multiple fields and types
          const variations = [targetMobile];
          if (rawMobile !== targetMobile) variations.push(rawMobile);
          const numMobile = Number(targetMobile);
          if (!isNaN(numMobile)) variations.push(numMobile); // Support if old bills saved it as integer

          const queries = [
            query(collection(db, 'bills'), where('mobileNo', 'in', variations), limit(1)),
            query(collection(db, 'bills'), where('mobile', 'in', variations), limit(1)),
            query(collection(db, 'bills'), where('mobile_number', 'in', variations), limit(1))
          ];

          for (const q of queries) {
            const billSnap = await getDocs(q);
            if (!billSnap.empty) {
              const data = billSnap.docs[0].data();
              setCustomerName(data.customerName || data.customer_name || data.name || '');
              setShopName(data.shopName || data.shop_name || '');
              setTransportService(data.transportService || data.transport || '');
              return;
            }
          }
        } catch (e) {
          console.error('[NewBill] Error fetching customer details:', e);
        }
      };
      fetchCustomer();
    }
  }, [mobileNo]);

  // ── Billing Summary States ───────────────────────────────────────────────
  const [applyGST, setApplyGST] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Both'>('Cash');

  // Split payment states
  const [cashSplit, setCashSplit] = useState<string>('');
  const [upiSplit, setUpiSplit] = useState<string>('');


  // ── Form Reset — called after a successful bill save ─────────────────────
  const resetForm = useCallback(async () => {
    setMobileNo('');
    setCustomerName('');
    setShopName('');
    setTransportService('');
    setItems([emptyRow()]);
    setApplyGST(false);
    setPaymentMethod('Cash');
    setCashSplit('');
    setUpiSplit('');
    setActiveRowId(null);
    setInlineSearch('');
    // Pre-fetch the NEXT bill number so it is ready immediately
    await fetchNextBillNo();
  }, []);

  // Add a new row to the items table
  const handleAddRow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
    setItems([
      ...items,
      { id: nextId, productId: '', itemCode: '', itemDesc: '', qty: 1, actualRate: 0, discountRate: 0, availableStock: 0, purchasePrice: 0 },
    ]);
  };

  // Remove a row from the items table
  const handleRemoveRow = (id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (items.length === 1) {
      // Keep at least one row
      setItems([emptyRow()]);
    } else {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  // Update item field value
  const handleUpdateItem = (id: number, field: keyof LineItem, val: string) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          if (field === 'qty') {
            const parsed = parseInt(val, 10);
            return { ...item, qty: isNaN(parsed) ? 0 : parsed };
          } else if (field === 'actualRate' || field === 'discountRate') {
            const parsed = parseFloat(val);
            return { ...item, [field]: isNaN(parsed) ? 0 : parsed };
          } else {
            return { ...item, [field]: val };
          }
        }
        return item;
      })
    );
  };

  // ── Dynamic Billing Calculations ─────────────────────────────────────────
  
  // Total Savings = sum of ((actualRate - discountRate) * qty)
  const totalSavings = items.reduce((acc, curr) => {
    const diff = curr.actualRate - curr.discountRate;
    return acc + (diff > 0 ? diff * curr.qty : 0);
  }, 0);

  // Subtotal = sum of (discountRate * qty)
  const subtotal = items.reduce((acc, curr) => {
    return acc + curr.discountRate * curr.qty;
  }, 0);

  // Original total before discounts = sum of (actualRate * qty)
  const originalTotal = items.reduce((acc, curr) => acc + curr.actualRate * curr.qty, 0);

  // GST Amount (5%)
  const gstAmount = applyGST ? subtotal * 0.05 : 0;

  // Grand Total = Subtotal + GST
  const grandTotal = subtotal + gstAmount;

  // Automatically adjust splits when paymentMethod switches to 'Both' or grandTotal changes
  React.useEffect(() => {
    if (paymentMethod === 'Both') {
      const parsedCash = parseFloat(cashSplit) || 0;
      const parsedUpi = parseFloat(upiSplit) || 0;
      if (Math.abs(parsedCash + parsedUpi - grandTotal) > 0.01) {
        setCashSplit((grandTotal / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        setUpiSplit((grandTotal / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    } else {
      setCashSplit('');
      setUpiSplit('');
    }
  }, [paymentMethod, grandTotal]);

  // Dynamic split values & validation
  const parsedCash = parseFloat(cashSplit) || 0;
  const parsedUpi = parseFloat(upiSplit) || 0;
  const sumSplits = parsedCash + parsedUpi;
  const isSplitValid = Math.abs(sumSplits - grandTotal) < 0.01;

  const handleCashSplitChange = (val: string) => {
    setCashSplit(val);
    const parsedCashVal = parseFloat(val);
    if (!isNaN(parsedCashVal)) {
      const remaining = grandTotal - parsedCashVal;
      setUpiSplit(remaining >= 0 ? remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');
    } else {
      setUpiSplit('');
    }
  };

  const handleUpiSplitChange = (val: string) => {
    setUpiSplit(val);
    const parsedUpiVal = parseFloat(val);
    if (!isNaN(parsedUpiVal)) {
      const remaining = grandTotal - parsedUpiVal;
      setCashSplit(remaining >= 0 ? remaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');
    } else {
      setCashSplit('');
    }
  };

  const openProductSearch = (rowId: number) => {
    setActiveRowId(rowId);
    setInlineSearch('');
  };

  const handleSelectProduct = (rowId: number, product: any) => {
    setItems(
      items.map((item) => {
        if (item.id === rowId) {
          return {
            ...item,
            productId: product.id,
            itemCode: product.itemCode,
            itemDesc: product.name,
            actualRate: product.sellingPrice ?? 0,
            discountRate: product.sellingPrice ?? 0, // default to standard price
            availableStock: product.stock ?? 0,
            purchasePrice: product.purchasePrice ?? 0, // ← always captured
          };
        }
        return item;
      })
    );
    // Close inline search after selection
    setActiveRowId(null);
    setInlineSearch('');
  };

  // Handle Save Invoice Button — validates, deducts stock, writes logs, saves bill in Firestore transaction
  const handleSaveInvoice = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Validate bill number is ready
    if (!billNo || billNoLoading) {
      Alert.alert(
        'Bill Number Error',
        'Bill number has not been generated yet. Please wait for it to load or tap Retry.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Validate bill number format
    if (!billNo.match(/^BILL-\d{4,}$/)) {
      Alert.alert(
        'Invalid Bill Number',
        `The bill number "${billNo}" has an invalid format. Please reload the screen.`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Validate split payment
    if (paymentMethod === 'Both' && !isSplitValid) {
      Alert.alert(
        'Payment Split Error',
        `The sum of Cash (₹${parsedCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) and UPI (₹${parsedUpi.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) must equal the Grand Total (₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).\n\nCurrently, it sums to ₹${sumSplits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
        [{ text: 'OK' }]
      );
      return;
    }

    if (mobileNo.trim().length !== 10) {
      Alert.alert('Validation Error', 'Please enter a valid 10-digit Mobile Number.');
      return;
    }

    if (items.length === 0 || !items[0].productId) {
      Alert.alert('Validation Error', 'Please select at least one product.');
      return;
    }

    // Validate quantities and stock
    for (const item of items) {
      if (!item.productId) {
        Alert.alert('Validation Error', `Please select a product for row #${item.id}`);
        return;
      }
      if (item.qty <= 0) {
        Alert.alert('Validation Error', `Quantity for product "${item.itemDesc}" must be greater than zero.`);
        return;
      }
      if (item.qty > item.availableStock) {
        Alert.alert(
          'Insufficient Stock',
          `Insufficient stock for "${item.itemDesc}".\nRequested: ${item.qty}\nAvailable: ${item.availableStock}`
        );
        return;
      }
    }

    setIsSaving(true);
    let finalBillNo = billNo; // Start with the bill number displayed in UI
    let success = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    while (!success && attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        await runTransaction(db, async (transaction) => {
          // ══════════════════════════════════════════
          // PHASE 1 — ALL READS (no writes yet)
          // ══════════════════════════════════════════

          // 1a. Validate Bill Number uniqueness inside transaction
          const billRef = doc(db, 'bills', finalBillNo);
          const billSnap = await transaction.get(billRef);
          if (billSnap.exists() && !editBillId) {
            throw new Error('DUPLICATE_BILL_NUMBER');
          }

          // 1b. All products (old and new)
          const allProductIds = new Set<string>();
          items.forEach(i => allProductIds.add(i.productId));
          if (editBillId && originalBill && originalBill.items) {
             originalBill.items.forEach((i: any) => allProductIds.add(i.productId));
          }
          const productRefs = Array.from(allProductIds).map(id => doc(db, 'products', id));
          const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

          const stockMap = new Map<string, number>();
          productSnaps.forEach(snap => {
            if (snap.exists()) {
              stockMap.set(snap.id, snap.data().stock || 0);
            }
          });

          // 1c. Customer record(s)
          const currentMobile = mobileNo.trim();
          let oldMobile = '';
          if (editBillId && originalBill && originalBill.mobileNo) {
             oldMobile = originalBill.mobileNo.trim();
          }
          
          const customerRef = doc(db, 'customers', currentMobile);
          const customerSnap = await transaction.get(customerRef);
          
          let oldCustomerSnap = null;
          let oldCustomerRef = null;
          if (editBillId && oldMobile && oldMobile !== currentMobile) {
             oldCustomerRef = doc(db, 'customers', oldMobile);
             oldCustomerSnap = await transaction.get(oldCustomerRef);
          }

          // ══════════════════════════════════════════
          // PHASE 1 — VALIDATION (no Firestore calls)
          // ══════════════════════════════════════════

          // For an edit, calculate the "adjusted" stock before validating new items
          const adjustedStockMap = new Map<string, number>(stockMap);
          if (editBillId && originalBill && originalBill.items) {
            originalBill.items.forEach((i: any) => {
              const currentStock = adjustedStockMap.get(i.productId) || 0;
              adjustedStockMap.set(i.productId, currentStock + (i.qty || 0));
            });
          }

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const stock = adjustedStockMap.get(item.productId) ?? 0;
            if (item.qty > stock) {
              throw new Error(
                `Insufficient stock for "${item.itemDesc}".\nRequested: ${item.qty}, Available: ${stock}`
              );
            }
          }

          const nowStr = new Date().toISOString();

          // ══════════════════════════════════════════
          // PHASE 2 — ALL WRITES (no reads after this)
          // ══════════════════════════════════════════

          // 2a. Customer upsert
          const oldGrandTotal = editBillId && originalBill ? (originalBill.grandTotal || 0) : 0;
          
          if (editBillId && oldMobile && oldMobile !== currentMobile && oldCustomerRef && oldCustomerSnap?.exists()) {
             // Revert old customer stats
             const oldCustData = oldCustomerSnap.data();
             transaction.update(oldCustomerRef, {
               total_bills: Math.max(0, (oldCustData.total_bills || 0) - 1),
               lifetime_purchase: Math.max(0, (oldCustData.lifetime_purchase || 0) - oldGrandTotal),
             });
          }

          if (customerSnap.exists()) {
            const custData = customerSnap.data();
            let newTotalBills = custData.total_bills || 0;
            let newLifetime = custData.lifetime_purchase || 0;
            
            if (editBillId && (!oldMobile || oldMobile === currentMobile)) {
               // Same customer, just adjust the difference
               newLifetime = newLifetime - oldGrandTotal + grandTotal;
               // total_bills remains the same
            } else {
               // New customer (or new bill entirely)
               newTotalBills += 1;
               newLifetime += grandTotal;
            }
            
            transaction.update(customerRef, {
              name: customerName,
              shop_name: shopName,
              transport: transportService,
              last_visit: nowStr,
              total_bills: newTotalBills,
              lifetime_purchase: newLifetime,
            });
          } else {
            transaction.set(customerRef, {
              name: customerName,
              shop_name: shopName,
              transport: transportService,
              created_at: nowStr,
              last_visit: nowStr,
              total_bills: 1,
              lifetime_purchase: grandTotal,
            });
          }

          // 2b. Stock deductions + inventory logs
          // First, add back old stock if editing
          if (editBillId && originalBill && originalBill.items) {
             originalBill.items.forEach((i: any) => {
               const currentStock = stockMap.get(i.productId) || 0;
               stockMap.set(i.productId, currentStock + (i.qty || 0));
             });
          }

          // Then, deduct new stock
          items.forEach(item => {
             const currentStock = stockMap.get(item.productId) || 0;
             stockMap.set(item.productId, Math.max(0, currentStock - item.qty));
          });
          
          // Write updated stock to DB
          stockMap.forEach((newStock, productId) => {
             transaction.update(doc(db, 'products', productId), { stock: newStock });
          });
          
          // Add a single log for EDIT or NEW
          if (editBillId) {
             const logRef = doc(collection(db, 'inventory_logs'));
             transaction.set(logRef, {
               bill_number: finalBillNo,
               type: 'EDIT',
               created_at: serverTimestamp(),
               reason: 'Bill Edited',
             });
          } else {
             items.forEach(item => {
               const logRef = doc(collection(db, 'inventory_logs'));
               transaction.set(logRef, {
                 product_id: item.productId,
                 bill_number: finalBillNo,
                 quantity: item.qty,
                 type: 'OUT',
                 created_at: serverTimestamp(),
                 reason: 'Sale',
               });
             });
          }

          // 2c. Save bill document
          const billSeqNum = parseBillNumber(finalBillNo);
          const billData = {
            billNo: finalBillNo,
            billSequence: billSeqNum, // Numeric field for reliable Firestore ordering
            date: billDate,
            time: billTime,
            mobileNo: mobileNo.trim(),
            customerName: customerName,
            shopName: shopName,
            transportService: transportService,
            paymentMethod: paymentMethod,
            cashSplit: paymentMethod === 'Both' ? parsedCash : 0,
            upiSplit: paymentMethod === 'Both' ? parsedUpi : 0,
            gstEnabled: applyGST,
            gstAmount: gstAmount,
            subtotal: subtotal,
            originalTotal: originalTotal,
            savings: totalSavings,
            grandTotal: grandTotal,
            items: items.map(i => ({
              productId: i.productId,
              itemCode: i.itemCode,
              itemDesc: i.itemDesc,
              qty: i.qty,
              actualRate: i.actualRate,
              discountRate: i.discountRate,
              purchasePrice: i.purchasePrice || 0,
            })),
            created_at: editBillId && originalBill ? (originalBill.created_at || serverTimestamp()) : serverTimestamp(),
            updated_at: serverTimestamp() // Add updated_at
          };
          
          if (editBillId) {
             transaction.update(billRef, billData);
          } else {
             transaction.set(billRef, billData);
          }
          
          // Log transaction
          const logRef = doc(collection(db, 'sales_logs'));
          transaction.set(logRef, {
            type: 'SALE',
            billId: finalBillNo,
            totalAmount: grandTotal,
            timestamp: serverTimestamp(),
            method: paymentMethod,
            itemsCount: items.length
          });
          
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          success = true; // Transaction completed successfully
        });
      } catch (error: any) {
        if (error.message === 'DUPLICATE_BILL_NUMBER') {
          console.warn(`[NewBill] Bill number ${finalBillNo} already exists. Regenerating...`);
          finalBillNo = await generateNextBillNumber();
          setBillNo(finalBillNo); // Update UI so user sees the newly generated one
        } else {
          throw error; // Rethrow other errors (stock issues, etc.) to break the loop
        }
      }
    }

    if (!success) {
      setIsSaving(false);
      Alert.alert('Checkout Error', 'Failed to generate a unique Bill Number after multiple attempts. Please try again.');
      return;
    }

    try {
      // ── Generate and Share Invoice Image directly to WhatsApp ──
      setShowHiddenReceipt(true);
      
      // Let the hidden receipt render before capturing
      setTimeout(async () => {
        try {
          if (receiptRef.current && receiptRef.current.capture) {
            const uri = await receiptRef.current.capture();
            
            // Generate formatted caption text
            const msgText = generateWhatsAppReceiptText({
              customerName: customerName || 'Walk-in Customer',
              billId: finalBillNo,
              totalAmount: grandTotal,
              items: items
            });

            // Share both image and caption in a single step to WhatsApp
            await shareInvoiceToWhatsApp({
              imageUri: uri,
              customerPhone: mobileNo.trim(),
              messageText: msgText
            });
          }
        } catch (shareErr) {
          console.error("Auto-share error:", shareErr);
        }
        
        setShowHiddenReceipt(false);
        
        // Reset the form BEFORE navigating so that when the user
        // presses Back from the invoice preview, the bill page is fresh.
        await resetForm();

        // Navigate to invoice preview
        router.push({
          pathname: '/invoice-view',
          params: { billId: finalBillNo },
        });
      }, 500);

    } catch (error: any) {
      console.error('[NewBill] Error saving invoice transaction:', error);
      Alert.alert('Checkout Error', error.message || 'Transaction failed. Could not save invoice.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <View style={styles.root} {...swipeHandlers}>
        {/* ── Global Header Component ── */}
        <Header />

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        
        <View style={styles.actionHeaderRow}>
          <TouchableOpacity onPress={resetForm} style={styles.refreshBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="reload" size={16} color="#DEB841" style={{ marginRight: 4 }} />
            <Text style={styles.refreshBtnText}>Clear / New Bill</Text>
          </TouchableOpacity>
        </View>

        {/* ── 1. Company Header Section ── */}
        <View style={styles.companyHeaderContainer}>
          <View style={styles.logoSquare}>
            <Image
              source={require('../../assets/images/logo.jpeg')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.companyTitle}>{companyName}</Text>
          <Text style={styles.companySubtitle}>{companySubtitle}</Text>
          <Text style={styles.companyAddressText}>{companyAddress}</Text>
          <Text style={styles.companyPhoneText}>Ph: {companyPhone}</Text>
        </View>

        {/* ── 2. Invoice Meta Data Card ── */}
        <View style={styles.card}>
          <Text style={styles.taxInvoiceTitle}>TAX INVOICE</Text>
          <View style={styles.cardDivider} />
          
          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <View style={styles.metaTextRow}>
                <Text style={styles.metaLabel}>Bill No:</Text>
                {billNoLoading ? (
                  <ActivityIndicator size="small" color="#DEB841" />
                ) : (
                  <Text style={styles.metaValue}>{billNo}</Text>
                )}
              </View>
              <View style={[styles.metaTextRow, { marginTop: 6 }]}>
                <Text style={styles.metaLabel}>Time:</Text>
                <Text style={styles.metaValue}>{billTime}</Text>
              </View>
            </View>
            
            <View style={styles.metaCol}>
              <View style={styles.metaTextRow}>
                <Text style={styles.metaLabel}>Date:</Text>
                <Text style={styles.metaValue}>{billDate}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. Customer Details Form ── */}
        <View style={styles.formCard}>
          {/* Mobile input */}
          <Text style={styles.inputLabel}>MOBILE NUMBER</Text>
          <View style={styles.mobileInputRow}>
            <View style={styles.prefixContainer}>
              <Text style={styles.prefixText}>+91</Text>
            </View>
            <TextInput
              style={styles.mobileInput}
              placeholder="Enter 10-digit Mobile"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              // Removed native maxLength so pasted numbers with spaces aren't truncated natively
              value={mobileNo}
              onChangeText={(text) => {
                let digits = text.replace(/\D/g, '');
                // If the user pastes a 12-digit number starting with 91, remove the 91
                if (digits.length === 12 && digits.startsWith('91')) {
                  digits = digits.substring(2);
                }
                setMobileNo(digits.slice(0, 10));
              }}
            />
          </View>

          {/* Customer Name */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>CUSTOMER NAME</Text>
          <TextInput
            style={styles.formInput}
            placeholder="Walk-in Customer"
            placeholderTextColor="#9CA3AF"
            value={customerName}
            onChangeText={setCustomerName}
          />

          {/* Shop Name */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>SHOP NAME</Text>
          <TextInput
            style={styles.formInput}
            placeholder="Optional"
            placeholderTextColor="#9CA3AF"
            value={shopName}
            onChangeText={setShopName}
          />

          {/* Transport Service */}
          <Text style={[styles.inputLabel, { marginTop: 16 }]}>TRANSPORT SERVICE</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. VRL Logistics"
            placeholderTextColor="#9CA3AF"
            value={transportService}
            onChangeText={setTransportService}
          />
        </View>

        {/* ── 4. Product Entry Table ── */}
        <View style={styles.tableCard}>

          {/* ── Inline Product Search — appears inside the card when a row is activated ── */}
          {activeRowId !== null && (
            <View style={styles.inlineSearchContainer}>
              <View style={styles.inlineSearchRow}>
                <MaterialCommunityIcons name="magnify" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.inlineSearchInput}
                  placeholder="Search by Item Code or Product Name..."
                  placeholderTextColor="#9CA3AF"
                  value={inlineSearch}
                  onChangeText={setInlineSearch}
                  autoFocus={true}
                />
                <TouchableOpacity onPress={() => { setActiveRowId(null); setInlineSearch(''); }}>
                  <MaterialCommunityIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.inlineSearchResults} keyboardShouldPersistTaps="handled">
                {products
                  .filter(p =>
                    inlineSearch.trim() === '' ||
                    p.name.toLowerCase().includes(inlineSearch.toLowerCase()) ||
                    p.itemCode.toLowerCase().includes(inlineSearch.toLowerCase())
                  )
                  .map(product => (
                    <TouchableOpacity
                      key={product.id}
                      style={styles.inlineSearchItem}
                      onPress={() => {
                        if (activeRowId !== null) {
                          handleSelectProduct(activeRowId, product);
                        }
                      }}
                    >
                      <View style={styles.inlineSearchItemContent}>
                        <Text style={styles.modalItemCode}>{product.itemCode} — {product.name}</Text>
                        <View style={{ flexDirection: 'row', marginTop: 4, gap: 12 }}>
                          <Text style={styles.modalItemSize}>Size: {product.size || 'N/A'}</Text>
                          <Text style={styles.modalItemPrice}>₹{product.sellingPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                          <Text style={[
                            styles.modalItemStock,
                            product.stock <= 5 && { color: '#EF4444', fontWeight: '800' }
                          ]}>Stock: {product.stock}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}

          {/* Vertical Product Cards */}
          {items.map((item, index) => (
            <View key={item.id} style={styles.itemCard}>

              {/* Card Header: row number + delete */}
              <View style={styles.itemCardHeader}>
                <View style={styles.itemCardBadge}>
                  <Text style={styles.itemCardBadgeText}>#{index + 1}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveRow(item.id)} style={styles.itemCardDelete}>
                  <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>

              {/* Product Search Trigger */}
              <Text style={styles.itemFieldLabel}>PRODUCT</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => openProductSearch(item.id)}
                style={styles.itemProductBtn}
              >
                {item.itemCode ? (
                  <View>
                    <Text style={styles.itemProductBtnCode}>{item.itemCode}</Text>
                    <Text style={styles.itemProductBtnName}>{item.itemDesc}</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                    <Text style={styles.itemProductBtnPlaceholder}>Tap to search product...</Text>
                  </View>
                )}
                <MaterialCommunityIcons name="chevron-right" size={18} color="#DEB841" />
              </TouchableOpacity>

              {/* QTY / Actual Rate / Discount Rate in a row */}
              <View style={styles.itemFieldRow}>
                <View style={styles.itemFieldCol}>
                  <Text style={styles.itemFieldLabel}>QTY</Text>
                  <TextInput
                    style={styles.itemFieldInput}
                    placeholder="1"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    value={item.qty === 0 ? '' : item.qty.toString()}
                    onChangeText={(val) => handleUpdateItem(item.id, 'qty', val)}
                  />
                  {item.productId !== '' && item.availableStock > 0 && item.qty > item.availableStock && (
                    <Text style={styles.qtyErrorText}>Max {item.availableStock}</Text>
                  )}
                </View>
                <View style={styles.itemFieldCol}>
                  <Text style={styles.itemFieldLabel}>ACTUAL RATE (₹)</Text>
                  <TextInput
                    style={styles.itemFieldInput}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    value={item.actualRate === 0 ? '' : item.actualRate.toString()}
                    onChangeText={(val) => handleUpdateItem(item.id, 'actualRate', val)}
                  />
                </View>
                <View style={styles.itemFieldCol}>
                  <Text style={styles.itemFieldLabel}>DISC. RATE (₹)</Text>
                  <TextInput
                    style={styles.itemFieldInput}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    value={item.discountRate === 0 ? '' : item.discountRate.toString()}
                    onChangeText={(val) => handleUpdateItem(item.id, 'discountRate', val)}
                  />
                </View>
              </View>

              {/* Line total */}
              <View style={styles.itemLineTotalRow}>
                <Text style={styles.itemLineTotalLabel}>Line Total</Text>
                <Text style={styles.itemLineTotalValue}>
                  ₹{(item.discountRate * item.qty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>

            </View>
          ))}

          {/* Add Another Row Button */}
          <TouchableOpacity
            style={styles.addRowBtn}
            onPress={handleAddRow}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#DEB841" />
            <Text style={styles.addRowBtnText}>Add Another Row</Text>
          </TouchableOpacity>

        </View>

        {/* ── 5. Billing Summary & Payment Card ── */}
        <View style={styles.summaryCard}>
          {/* Subtotal Row */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryRowLabel}>Subtotal</Text>
            <Text style={styles.summaryRowValue}>₹{originalTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          {totalSavings > 0 && (
            <View style={[styles.summaryRow, { marginTop: 4 }]}>
              <Text style={styles.summaryRowLabel}>Total Savings</Text>
              <Text style={[styles.summaryRowValue, { color: '#059669' }]}>- ₹{totalSavings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          )}

          <View style={[styles.summaryDivider, { marginVertical: 8 }]} />

          {/* Apply GST Checkbox */}
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setApplyGST(!applyGST);
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, applyGST && styles.checkboxChecked]}>
              {applyGST && <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />}
            </View>
            <View style={styles.checkboxLabelContainer}>
              <Text style={styles.checkboxTitle}>Apply GST (5%)</Text>
              <Text style={styles.checkboxSubtitle}>CGST (2.5%) + SGST (2.5%)</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.summaryDivider} />

          {/* Payment Method section */}
          <View style={styles.paymentSection}>
            <View style={styles.paymentHeader}>
              <MaterialCommunityIcons name="credit-card-outline" size={18} color="#4B5563" />
              <Text style={styles.paymentTitle}>PAYMENT METHOD</Text>
            </View>
            
            <View style={styles.radioGroup}>
              {/* Cash Radio */}
              <TouchableOpacity
                style={styles.radioBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPaymentMethod('Cash');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.radioButton, paymentMethod === 'Cash' && styles.radioButtonSelected]}>
                  {paymentMethod === 'Cash' && <View style={styles.radioInnerDot} />}
                </View>
                <Text style={styles.radioLabel}>Cash</Text>
              </TouchableOpacity>

              {/* UPI Radio */}
              <TouchableOpacity
                style={styles.radioBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPaymentMethod('UPI');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.radioButton, paymentMethod === 'UPI' && styles.radioButtonSelected]}>
                  {paymentMethod === 'UPI' && <View style={styles.radioInnerDot} />}
                </View>
                <Text style={styles.radioLabel}>UPI</Text>
              </TouchableOpacity>

              {/* Both Radio */}
              <TouchableOpacity
                style={styles.radioBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPaymentMethod('Both');
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.radioButton, paymentMethod === 'Both' && styles.radioButtonSelected]}>
                  {paymentMethod === 'Both' && <View style={styles.radioInnerDot} />}
                </View>
                <Text style={styles.radioLabel}>Both</Text>
              </TouchableOpacity>
            </View>

            {/* If Both is selected, show split payment amount inputs */}
            {paymentMethod === 'Both' && (
              <View style={styles.splitPaymentContainer}>
                <View style={styles.splitRow}>
                  <View style={styles.splitCol}>
                    <Text style={styles.splitLabel}>CASH AMOUNT</Text>
                    <TextInput
                      style={styles.splitInput}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      value={cashSplit}
                      onChangeText={handleCashSplitChange}
                    />
                  </View>
                  <View style={styles.splitCol}>
                    <Text style={styles.splitLabel}>UPI AMOUNT</Text>
                    <TextInput
                      style={styles.splitInput}
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      value={upiSplit}
                      onChangeText={handleUpiSplitChange}
                    />
                  </View>
                </View>

                {/* Validation Status Indicator */}
                <View style={styles.validationRow}>
                  {isSplitValid ? (
                    <View style={styles.validStatus}>
                      <MaterialCommunityIcons name="check-circle" size={14} color="#10B981" />
                      <Text style={styles.validStatusText}>Amounts sum to Grand Total</Text>
                    </View>
                  ) : (
                    <View style={styles.invalidStatus}>
                      <MaterialCommunityIcons name="alert-circle" size={14} color="#EF4444" />
                      <Text style={styles.invalidStatusText}>
                        Sum (₹{sumSplits.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) must equal ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          <View style={styles.summaryDivider} />

          {/* Grand Total Row */}
          <View style={[styles.summaryRow, { marginTop: 4, marginBottom: 4 }]}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        </View>

        {/* ── 6. Floating Action Button / Footer ── */}
        <TouchableOpacity
          style={styles.saveInvoiceBtn}
          onPress={handleSaveInvoice}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="check-circle-outline" size={20} color="#000000" style={styles.saveBtnIcon} />
          <Text style={styles.saveInvoiceBtnText}>Save Final Invoice</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>



      {/* Loading Overlay */}
      {isSaving && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#DEB841" />
          <Text style={styles.loadingOverlayText}>Processing Checkout...</Text>
        </View>
      )}
        {/* ── Hidden Receipt for Screenshot ── */}
        {showHiddenReceipt && (
          <View style={styles.hiddenReceiptContainer}>
            <ViewShot ref={receiptRef} options={{ format: 'jpg', quality: 0.9 }}>
              <InvoiceReceipt
                billNo={billNo}
                date={billDate}
                time={billTime}
                customerName={customerName}
                shopName={shopName}
                mobileNo={mobileNo}
                shopGstNumber={storeGstNumber}
                transportService={transportService}
                paymentMethod={paymentMethod}
                subtotal={subtotal}
                savings={totalSavings}
                originalTotal={originalTotal}
                grandTotal={grandTotal}
                items={items}
              />
            </ViewShot>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hiddenReceiptContainer: {
    position: 'absolute',
    top: -10000,
    left: -10000,
    opacity: 0,
    pointerEvents: 'none',
  },
  root: {
    flex: 1,
    backgroundColor: '#FAF9F6', // Off-white global background
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  actionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  refreshBtnText: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#DEB841',
  },

  // ── 1. Company Header Styles ──
  companyHeaderContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  logoSquare: {
    width: 80,
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DEB841', // Gold outline border
    padding: 4,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  companyTitle: {
    fontFamily: systemFont,
    fontSize: 26, // Increased to match large gold title
    fontWeight: '900',
    color: '#DEB841', // Brand gold text
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  companySubtitle: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 8,
  },
  companyAddressText: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 12
    color: '#4B5563',
    lineHeight: 20, // Adjusted line height
    textAlign: 'center',
  },
  companyPhoneText: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 12
    fontWeight: '700',
    color: '#374151',
    marginTop: 6,
  },

  // ── 2. Invoice Meta Card Styles ──
  card: {
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
  taxInvoiceTitle: {
    fontFamily: systemFont,
    fontSize: 14, // Increased from 13
    fontWeight: '850',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaCol: {
    flex: 1,
  },
  metaTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '550',
    color: '#4B5563',
    width: 60,
  },
  metaValue: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 11
    fontWeight: '800',
    color: '#111827',
  },

  // ── 3. Customer Details Styles ──
  formCard: {
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
  inputLabel: {
    fontFamily: systemFont,
    fontSize: 11, // Increased from 10
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  mobileInputRow: {
    flexDirection: 'row',
    height: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#FAF9F6',
  },
  prefixContainer: {
    backgroundColor: '#E5E7EB',
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  prefixText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  mobileInput: {
    fontFamily: systemFont,
    flex: 1,
    paddingHorizontal: 12,
    fontSize: 14, // Increased from 13
    color: '#111827',
  },
  formInput: {
    fontFamily: systemFont,
    height: 44,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    paddingHorizontal: 12,
    backgroundColor: '#FAF9F6',
    fontSize: 14, // Increased from 13
    color: '#111827',
  },

  // ── 4. Product Entry Table Styles ──
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
  tableWrapper: {
    flexDirection: 'column',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEB841', // Gold background
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  thCell: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 11, // Increased from 10
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tdText: {
    fontFamily: systemFont,
    fontSize: 13, // Increased from 12
    color: '#374151',
    fontWeight: '600',
  },
  tdInput: {
    fontFamily: systemFont,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#FAF9F6',
    fontSize: 13, // Increased from 12
    color: '#111827',
    marginRight: 6,
    height: 32,
  },
  tdDeleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },

  // ── Vertical Item Card Styles ─────────────────────────────────────────────
  itemCard: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  itemCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  itemCardBadge: {
    backgroundColor: '#DEB841',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  itemCardBadgeText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  itemCardDelete: {
    padding: 4,
  },
  itemProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#DEB841',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  itemProductBtnCode: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  itemProductBtnName: {
    fontFamily: systemFont,
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  itemProductBtnPlaceholder: {
    fontFamily: systemFont,
    fontSize: 13,
    color: '#9CA3AF',
  },
  itemFieldRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  itemFieldCol: {
    flex: 1,
  },
  itemFieldLabel: {
    fontFamily: systemFont,
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  itemFieldInput: {
    fontFamily: systemFont,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    color: '#111827',
    height: 38,
  },
  itemLineTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  itemLineTotalLabel: {
    fontFamily: systemFont,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  itemLineTotalValue: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  qtyErrorText: {
    fontFamily: systemFont,
    fontSize: 9,
    fontWeight: '700',
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 2,
  },

  // ── Inline Product Search Styles ──────────────────────────────────────────
  inlineSearchContainer: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DEB841',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  inlineSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FAF9F6',
  },
  inlineSearchInput: {
    flex: 1,
    height: 36,
    fontSize: 13,
    color: '#111827',
    fontFamily: systemFont,
  },
  inlineSearchResults: {
    maxHeight: 220,
  },
  inlineSearchItem: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  inlineSearchItemContent: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    flex: 1,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DEB841',
    borderRadius: 6,
    paddingVertical: 10,
    marginTop: 16,
    borderStyle: 'dashed',
  },
  addRowBtnText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '700',
    color: '#DEB841',
    marginLeft: 4,
  },
  savingsBanner: {
    backgroundColor: '#DC2626', // Red savings banner
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  savingsBannerText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 14, // Increased from 13
    fontWeight: '800',
  },

  // ── 5. Summary Card Styles ──
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#DEB841', // Thick gold border
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRowLabel: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  summaryRowValue: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#DEB841',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#DEB841',
  },
  checkboxLabelContainer: {
    flexDirection: 'column',
  },
  checkboxTitle: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  checkboxSubtitle: {
    fontFamily: systemFont,
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  paymentSection: {
    flexDirection: 'column',
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentTitle: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.5,
    marginLeft: 6,
  },
  radioGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  radioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  radioButtonSelected: {
    borderColor: '#DEB841',
  },
  radioInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DEB841',
  },
  radioLabel: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  grandTotalLabel: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  grandTotalValue: {
    fontFamily: systemFont,
    fontSize: 22,
    fontWeight: '900',
    color: '#DEB841', // Gold grand total
  },

  // ── 6. Save Button Styles ──
  saveInvoiceBtn: {
    flexDirection: 'row',
    backgroundColor: '#DEB841', // Solid gold background
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  saveBtnIcon: {
    marginRight: 6,
  },
  saveInvoiceBtnText: {
    fontFamily: systemFont,
    fontSize: 15,
    fontWeight: '800',
    color: '#000000', // Black text
  },

  // ── Split Payment Styles ──
  splitPaymentContainer: {
    marginTop: 16,
    backgroundColor: '#FAF9F6',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  splitCol: {
    flex: 1,
  },
  splitLabel: {
    fontFamily: systemFont,
    fontSize: 10,
    fontWeight: '800',
    color: '#4B5563',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  splitInput: {
    fontFamily: systemFont,
    height: 38,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  validationRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  validStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  validStatusText: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
  },
  invalidStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  invalidStatusText: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxHeight: '80%',
    borderRadius: 12,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontFamily: systemFont,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  modalSearchInput: {
    fontFamily: systemFont,
    height: 40,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    fontSize: 14,
    color: '#111827',
    marginBottom: 12,
  },
  modalList: {
    flex: 1,
  },
  modalListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalItemLeft: {
    flex: 1,
  },
  modalItemCode: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#DEB841',
  },
  modalItemName: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  modalItemSize: {
    fontFamily: systemFont,
    fontSize: 10,
    color: '#6B7280',
    marginTop: 1,
  },
  modalItemRight: {
    alignItems: 'flex-end',
  },
  modalItemPrice: {
    fontFamily: systemFont,
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  modalItemStock: {
    fontFamily: systemFont,
    fontSize: 10,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingOverlayText: {
    fontFamily: systemFont,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginTop: 12,
  },
});

