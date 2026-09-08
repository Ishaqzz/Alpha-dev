import { useDrawerSwipeGesture } from '@/hooks/useDrawerSwipeGesture';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Native module imports deferred to avoid crash if not linked
// import * as Sharing from 'expo-sharing';
// import * as MediaLibrary from 'expo-media-library';
import { DynamicUpiQr } from '@/components/DynamicUpiQr';
import SecureDeleteModal from '@/components/SecureDeleteModal';
import { Bill, mapFirestoreBill } from '@/utils/billMapper';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { captureRef } from 'react-native-view-shot';
import { db } from '../firebaseConfig';
import { shareInvoiceToWhatsApp } from '../utils/shareInvoiceWhatsApp';
import { generateWhatsAppReceiptText } from '../utils/whatsappHelper';

const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

// ── HTML / PDF Template ──
function buildPdfHtml(params: {
  billNo: string;
  date: string;
  time: string;
  paymentMethod: string;
  customerName: string;
  shopName: string;
  mobileNo: string;
  transportService: string;
  subtotal: number;
  savings: number;
  grandTotal: number;
  gstAmount: number;
  originalTotal?: number;
  items: any[];
  upiId: string;
}): string {
  const itemRows = params.items
    .map(
      (item, index) => `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #374151;">${index + 1}</td>
        <td style="padding: 8px 6px; font-size: 11px; color: #4B5563;">${item.itemCode || item.code || '-'}</td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #111827;">${item.itemName || item.desc || '-'}</td>
        <td style="padding: 8px 6px; font-size: 11px; text-align: center; font-weight: 800; color: #111827;">${item.quantity || item.qty}</td>
        <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #4B5563;">&#8377;${Number(item.rate || item.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding: 8px 6px; font-size: 11px; text-align: right; font-weight: 800; color: #111827;">&#8377;${Number(item.amount || item.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>`
    )
    .join('');

  const gstRow =
    params.gstAmount > 0
      ? `<tr>
          <td colspan="5" style="padding: 6px 8px; font-size: 11px; font-weight: 700; color: #4B5563; text-align: right;">GST (5%)</td>
          <td style="padding: 6px 8px; font-size: 11px; font-weight: 800; color: #111827; text-align: right;">&#8377;${params.gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice ${params.billNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      background: #FAF9F6;
      padding: 24px;
      color: #111827;
    }
    .page {
      max-width: 680px;
      margin: 0 auto;
      background: #FFFFFF;
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }
    .header { text-align: center; margin-bottom: 8px; }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #111827;
      letter-spacing: 1px;
      margin-top: 12px;
    }
    .brand-subtitle {
      font-size: 10px;
      font-weight: 700;
      color: #DEB841;
      letter-spacing: 3px;
      margin-top: 4px;
      margin-bottom: 16px;
    }
    .invoice-banner {
      background: #1E293B;
      border-radius: 4px;
      padding: 8px 0;
      text-align: center;
      margin-bottom: 12px;
    }
    .invoice-banner-text {
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 3px;
    }
    .address-text {
      font-size: 11px;
      color: #4B5563;
      text-align: center;
      line-height: 1.6;
    }
    .phone-text {
      font-size: 12px;
      font-weight: 700;
      color: #111827;
      text-align: center;
      margin-top: 6px;
    }
    .gold-divider {
      height: 2px;
      background: #DEB841;
      margin: 16px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .meta-col { flex: 1; }
    .meta-header {
      font-size: 9px;
      font-weight: 800;
      color: #9CA3AF;
      letter-spacing: 1.5px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .meta-name {
      font-size: 16px;
      font-weight: 900;
      color: #111827;
      margin-bottom: 3px;
    }
    .meta-sub {
      font-size: 12px;
      font-weight: 700;
      color: #4B5563;
      margin-bottom: 3px;
    }
    .meta-contact {
      font-size: 11px;
      color: #6B7280;
      margin-bottom: 2px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
    }
    .info-label { font-size: 11px; color: #6B7280; }
    .info-value { font-size: 11px; font-weight: 700; color: #111827; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
    }
    th {
      font-size: 10px;
      font-weight: 800;
      color: #6B7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 6px;
      border-bottom: 2px solid #E5E7EB;
    }
    td {
      padding: 8px 6px;
      vertical-align: middle;
    }
    .totals-section {
      margin-top: 16px;
      border-top: 1px solid #E5E7EB;
      padding-top: 12px;
    }
    .subtotal-row {
      display: flex;
      justify-content: space-between;
      padding: 8px;
    }
    .subtotal-label {
      font-size: 11px;
      font-weight: 800;
      color: #4B5563;
      letter-spacing: 0.5px;
    }
    .subtotal-value {
      font-size: 12px;
      font-weight: 800;
      color: #111827;
    }
    .savings-banner {
      display: flex;
      justify-content: space-between;
      background: #DC2626;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 8px;
    }
    .savings-label {
      font-size: 11px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 0.5px;
    }
    .savings-value { font-size: 11px; font-weight: 800; color: #FFFFFF; }
    .original-row { display:flex; justify-content:space-between; padding:8px; }
    .original-label { font-size:11px; font-weight:700; color:#4B5563; }
    .original-value { font-size:12px; font-weight:700; color:#111827; }
    .grand-total-block {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #1E293B;
      border-radius: 4px;
      padding: 10px 12px;
    }
    .grand-total-label {
      font-size: 14px;
      font-weight: 900;
      color: #FFFFFF;
      letter-spacing: 1px;
    }
    .grand-total-value {
      font-size: 20px;
      font-weight: 900;
      color: #DEB841;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      border-top: 1px dashed #E5E7EB;
      padding-top: 24px;
    }
    .payment-badge {
      display: inline-block;
      background: #D1FAE5;
      color: #10B981;
      font-size: 9px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .disclaimer {
      font-size: 9px;
      font-style: italic;
      color: #9CA3AF;
      margin-top: 16px;
    }
    .thanks {
      font-size: 12px;
      font-weight: 900;
      color: #111827;
      margin-top: 12px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="brand-title">ALPHA SPORTS WEAR</div>
    <div class="brand-subtitle">Premium Sports & Activewear</div>
    <div class="invoice-banner">
      <div class="invoice-banner-text">TAX INVOICE</div>
    </div>
    <div class="address-text">
      47/9, Kariya Gounder St, Sirupooluvapatti, Khaderpet, Rayapuram, Tiruppur, Tamil Nadu 641601
    </div>
    <div class="phone-text">Ph: +91 7395980429</div>
  </div>

  <div class="gold-divider"></div>

  <!-- Meta Info -->
  <div class="meta-row">
    <div class="meta-col">
      <div class="meta-header">Bill To</div>
      <div class="meta-name">${params.customerName || 'N/A'}</div>
      <div class="meta-sub">${params.shopName || ''}</div>
      <div class="meta-contact">Mobile: ${params.mobileNo || 'N/A'}</div>
      <div class="meta-contact">Transport: ${params.transportService || 'HAND'}</div>
    </div>
    <div class="meta-col" style="padding-left: 24px;">
      <div class="meta-header">Invoice Info</div>
      <div class="info-row">
        <span class="info-label">Bill Number:</span>
        <span class="info-value">#${params.billNo}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span class="info-value">${params.date}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Time:</span>
        <span class="info-value">${params.time}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Payment:</span>
        <span class="info-value">${params.paymentMethod}</span>
      </div>
    </div>
  </div>

  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th style="width:30px; text-align:left;">#</th>
        <th style="width:80px; text-align:left;">Item Code</th>
        <th style="text-align:left;">Description</th>
        <th style="width:40px; text-align:center;">Qty</th>
        <th style="width:80px; text-align:right;">Rate (&#8377;)</th>
        <th style="width:90px; text-align:right;">Amount (&#8377;)</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="6" style="text-align:center;padding:16px;color:#9CA3AF;font-size:12px;">No items</td></tr>'}
      ${gstRow}
    </tbody>
  </table>

  <!-- Totals -->
  <div class="totals-section">
    <div class="original-row">
      <span class="original-label">ORIGINAL TOTAL</span>
      <span class="original-value">&#8377;${(params.originalTotal ?? (params.subtotal + params.savings)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
    <div class="subtotal-row">
      <span class="subtotal-label">SUBTOTAL</span>
      <span class="subtotal-value">&#8377;${(Number(params.subtotal || 0) + Number(params.savings || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
    <div class="savings-banner">
      <span class="savings-label">TOTAL SAVING</span>
      <span class="savings-value">- &#8377;${params.savings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
    <div class="grand-total-block">
      <span class="grand-total-label">GRAND TOTAL</span>
      <span class="grand-total-value">&#8377;${params.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div style="margin-bottom: 16px;">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi%3A%2F%2Fpay%3Fpa%3D${params.upiId}%26pn%3DAlpha%2520Sports%2520Wear" alt="UPI QR Code" style="width: 120px; height: 120px; border-radius: 8px;"/>
    </div>
    <div class="payment-badge">READY TO PAY</div>
    <div style="font-size:11px;font-weight:800;color:#111827;margin-bottom:4px;">UPI: ${params.upiId}</div>
    <div style="font-size:9px;color:#9CA3AF;margin-bottom:12px;">PhonePe &bull; GPay &bull; Paytm &bull; Any UPI App</div>
    <div class="disclaimer">* All disputes are subject to Tiruppur Jurisdiction.</div>
    <div class="thanks">THANKS FOR SHOPPING WITH ALPHA SPORTS WEAR</div>
  </div>
</div>
</body>
</html>`;
}

const { width } = Dimensions.get('window');

export default function InvoiceViewScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const router = useRouter();
  const swipeHandlers = useDrawerSwipeGesture();
  const params = useLocalSearchParams();
  
  const billId = (params.billId as string) || (params.billNo as string) || '';

  const [bill, setBill] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [storeGstNumber, setStoreGstNumber] = useState<string>('');

  // Ref attached to the invoice body — used by react-native-view-shot
  const invoiceRef = useRef<any>(null);


  React.useEffect(() => {
    const fetchBill = async () => {
      if (!billId) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const billRef = doc(db, 'bills', billId);
        const snap = await getDoc(billRef);
        
        if (snap.exists()) {
          const rawData = snap.data();
          const mappedBill = mapFirestoreBill(snap.id, rawData);
          
          // Debugging (Temporary, as requested)
          console.log('--- FIRESTORE DOCUMENT FIX DEBUG ---');
          console.log('Raw Document:', rawData);
          console.log('Mapped Bill:', mappedBill);
          console.log('Mapped Items:', mappedBill.items);
          console.log('------------------------------------');
          
          setBill(mappedBill);
        } else {
          Alert.alert('Error', 'Invoice not found in the database.');
        }

        // Fetch store_config for GST
        const storeSnap = await getDoc(doc(db, 'settings', 'store_config'));
        if (storeSnap.exists()) {
          setStoreGstNumber(storeSnap.data().gst_number || '');
        }
      } catch (err) {
        console.error('[InvoiceView] Error fetching bill:', err);
        Alert.alert('Error', 'Failed to load invoice details.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBill();
  }, [billId]);



  // ── Save Invoice as JPG to Gallery ─────────────────────────────────────
  const handleSaveJpg = async () => {
    if (!bill || isProcessing) return;
    try {
      setIsProcessing(true);

      let MediaLibrary;
      try {
        MediaLibrary = require('expo-media-library');
      } catch (e) {
        Alert.alert('Feature Unavailable', 'Saving directly to the gallery requires a custom development build. Please use the Share button instead.');
        return;
      }
      
      // 1. Request media library permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save to your gallery.');
        return;
      }

      // 2. Capture the invoice view as a JPEG
      if (!invoiceRef.current) throw new Error('Invoice view not ready.');
      const uri = await captureRef(invoiceRef, { format: 'jpg', quality: 0.95 });

      // 3. Save to gallery using the new class-based API
      if (MediaLibrary.Asset && MediaLibrary.Asset.create) {
        await MediaLibrary.Asset.create(uri);
      } else {
        // Fallback for older versions if Asset.create is not available
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      Alert.alert('Saved!', `Invoice ${bill.bill_number} saved to your gallery as a JPG image.`);
    } catch (err: any) {
      console.error('[InvoiceView] Error saving JPG:', err);
      Alert.alert('Save Error', err.message || 'Could not save invoice image.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Share Invoice as JPG (with WhatsApp quick option) ─────────────────
  const handleShareJpg = async () => {
    if (!bill || isProcessing) return;

    if (bill.mobile_number && bill.mobile_number.trim()) {
      Alert.alert(
        `Share Invoice #${bill.bill_number}`,
        'Choose how you would like to share this invoice:',
        [
          {
            text: 'Send to WhatsApp',
            onPress: () => handleShareWhatsApp(),
          },
          {
            text: 'Other Apps...',
            onPress: () => executeShareJpgSystem(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    await executeShareJpgSystem();
  };

  const executeShareJpgSystem = async () => {
    if (!bill || isProcessing) return;
    try {
      setIsProcessing(true);
      if (!invoiceRef.current) throw new Error('Invoice view not ready.');
      // Adding a small delay to ensure rendering is complete before capture
      await new Promise(resolve => setTimeout(resolve, 300));
      const uri = await captureRef(invoiceRef, { format: 'jpg', quality: 0.95 });
      
      let Sharing;
      try {
        Sharing = require('expo-sharing');
      } catch (e) {
        Alert.alert('Feature Unavailable', 'Sharing requires a custom development build.');
        return;
      }
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          dialogTitle: `Share Invoice ${bill.bill_number}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      }
    } catch (err: any) {
      console.error('[InvoiceView] Error sharing JPG:', err);
      Alert.alert('Share Error', err.message || 'Could not share invoice.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Share Invoice directly to Customer WhatsApp ────────────────────────
  const handleShareWhatsApp = async () => {
    if (!bill || isProcessing) return;
    
    if (!bill.mobile_number || !bill.mobile_number.trim()) {
      Alert.alert('No Mobile Number', 'This invoice does not have a customer mobile number. Cannot send to WhatsApp.');
      return;
    }

    try {
      setIsProcessing(true);
      if (!invoiceRef.current) throw new Error('Invoice view not ready.');

      // Wait for layout to fully render
      await new Promise(resolve => setTimeout(resolve, 300));
      const uri = await captureRef(invoiceRef, { format: 'jpg', quality: 0.95 });

      // Generate formatted WhatsApp receipt text
      const msgText = generateWhatsAppReceiptText({
        customerName: bill.customer_name || 'Walk-in Customer',
        billId: bill.bill_number,
        totalAmount: bill.grand_total,
        items: (bill.items || []).map((item: any) => ({
          name: item.name || item.item_desc || item.itemDesc || item.desc || 'Item',
          quantity: item.quantity || item.qty || 0,
          price: item.actual_price || item.actualRate || item.rate || item.price || 0,
          total_price: item.total_price || item.total || item.amount || 0,
        })),
      });

      // Share image + text directly to the customer's WhatsApp
      await shareInvoiceToWhatsApp({
        imageUri: uri,
        customerPhone: bill.mobile_number.trim(),
        messageText: msgText,
      });
    } catch (err: any) {
      console.error('[InvoiceView] Error sharing to WhatsApp:', err);
      Alert.alert('WhatsApp Error', err.message || 'Could not share invoice to WhatsApp.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Delete Bill (called after PIN/biometric verified) ────────────────
  const executeDeleteBill = async () => {
    if (!bill) return;
    try {
      // 1. Fetch raw document to copy it
      const docRef = doc(db, 'bills', bill.bill_number);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const rawData = snap.data();
        // 2. Write it to 'deleted_bills' (Recycle Bin)
        await setDoc(doc(db, 'deleted_bills', bill.bill_number), {
          ...rawData,
          deletedAt: serverTimestamp()
        });
      }
      // 3. Delete from original collection
      await deleteDoc(docRef);

      Alert.alert('Deleted', `Bill ${bill.bill_number} has been moved to the recycle bin.`, [
        { text: 'OK', onPress: () => router.push('/history') },
      ]);
    } catch (err: any) {
      console.error('[InvoiceView] Delete bill error:', err);
      Alert.alert('Error', err.message || 'Could not delete this bill.');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontFamily: systemFont, fontSize: 16, color: '#6B7280' }}>Loading Invoice...</Text>
      </View>
    );
  }

  if (!bill) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontFamily: systemFont, fontSize: 16, color: '#EF4444' }}>Invoice could not be loaded.</Text>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Text style={styles.btnSecondaryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root} {...swipeHandlers}>
      {/* ── 1. Sticky Action Top Bar ── */}
      <SafeAreaView style={styles.safeHeader} edges={['top']}>
        {/* Row 1: Brand & Title */}
        <View style={[styles.appBar, { justifyContent: 'center' }]}>
          <View style={[styles.appBarLeft, { justifyContent: 'center' }]}>
            <Text style={styles.appBarBrandText} numberOfLines={1} ellipsizeMode="tail">ALPHA SPORTS WEAR</Text>
            <View style={styles.verticalDivider} />
            <Text style={styles.appBarTitle} numberOfLines={1} ellipsizeMode="tail">Invoice View</Text>
          </View>
        </View>
        
        {/* Row 2: Scrollable Action Buttons */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.actionButtonsScrollContainer}
          style={styles.actionButtonsScroll}
        >
          {/* Save JPG Button */}
          <TouchableOpacity 
            style={styles.actionBtnBlue} 
            activeOpacity={0.8}
            onPress={handleSaveJpg}
            disabled={isProcessing}
          >
            <MaterialCommunityIcons name="image-outline" size={16} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>Save JPG</Text>
          </TouchableOpacity>

          {/* Share JPG Button */}
          <TouchableOpacity 
            style={styles.actionBtnGold} 
            activeOpacity={0.8}
            onPress={handleShareJpg}
            disabled={isProcessing}
          >
            <MaterialCommunityIcons name="share-variant" size={16} color="#000000" />
            <Text style={[styles.actionBtnText, { color: '#000000', marginLeft: 4 }]}>Share JPG</Text>
          </TouchableOpacity>

          {/* WhatsApp Share Button */}
          <TouchableOpacity 
            style={styles.actionBtnWhatsApp} 
            activeOpacity={0.8}
            onPress={handleShareWhatsApp}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size={14} color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="whatsapp" size={16} color="#FFFFFF" />
            )}
            <Text style={[styles.actionBtnText, { marginLeft: 4 }]}>
              {isProcessing ? 'Sending…' : 'WhatsApp'}
            </Text>
          </TouchableOpacity>

          {/* Edit Bill Button */}
          <TouchableOpacity
            style={[styles.actionBtnBlue, { backgroundColor: '#3B82F6', paddingHorizontal: 16 }]}
            activeOpacity={0.8}
            onPress={() => router.push({ pathname: '/new-bill', params: { editBillId: bill.bill_number } })}
            disabled={isProcessing}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { marginLeft: 4 }]}>Edit</Text>
          </TouchableOpacity>

          {/* Delete Bill Button */}
          <TouchableOpacity
            style={[styles.actionBtnBlue, { backgroundColor: '#EF4444', paddingHorizontal: 16 }]}
            activeOpacity={0.8}
            onPress={() => setShowDeleteModal(true)}
            disabled={isProcessing}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { marginLeft: 4 }]}>Delete</Text>
          </TouchableOpacity>

          {/* Close Button */}
          <TouchableOpacity
            style={styles.actionBtnClose}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('index')}
            disabled={isProcessing}
          >
            <MaterialCommunityIcons name="close" size={16} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { marginLeft: 4 }]}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      {/* ── Invoice Document Body ── */}
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View ref={invoiceRef} collapsable={false} style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
        
        {/* ── 2. Invoice Document Header ── */}
        <View style={styles.docHeaderContainer}>
          <View style={styles.logoWrapper}>
            <Image
              source={require('../../assets/images/logo.jpeg')}
              style={styles.docLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.docBrandTitle}>ALPHA SPORTSWEAR</Text>
          <Text style={styles.docBrandSubtitle}>PREMIUM SPORTS & ACTIVEWEAR</Text>
          
          <View style={styles.invoiceLabelContainer}>
            <Text style={styles.invoiceLabelText}>INVOICE</Text>
          </View>

          <Text style={styles.docAddressText}>
            47/9, Kariya Gounder St, Sirupooluvapatti, Khaderpet, Rayapuram, Tiruppur, Tamil Nadu 641601
          </Text>
          <Text style={styles.docPhoneText}>Ph: +91 7395980429</Text>
          {storeGstNumber ? (
            <Text style={[styles.docPhoneText, { marginTop: 2, fontSize: 11 }]}>GSTIN: {storeGstNumber}</Text>
          ) : null}
          <View style={styles.goldHorizontalDivider} />
        </View>

        {/* ── 3. Customer & Invoice Metadata ── */}
        <View style={styles.metaContainer}>
          {/* Left Column (BILL TO) */}
          <View style={styles.metaColumn}>
            <Text style={styles.metaHeader}>BILL TO</Text>
            <Text style={styles.metaName}>{bill.customer_name || 'N/A'}</Text>
            <Text style={styles.metaSubtext}>{bill.shop_name || 'N/A'}</Text>
            <Text style={styles.metaContact}>Mobile: {bill.mobile_number || 'N/A'}</Text>
            <Text style={styles.metaContact}>TRANSPORT: {bill.transport || 'HAND'}</Text>
          </View>

          {/* Right Column (INVOICE INFO) */}
          <View style={[styles.metaColumn, { paddingLeft: 16 }]}>
            <Text style={styles.metaHeader}>INVOICE INFO</Text>
            
            <View style={styles.metaInfoRow}>
              <Text style={styles.metaInfoLabel}>Bill Number:</Text>
              <Text style={styles.metaInfoValue}>#{bill.bill_number || 'N/A'}</Text>
            </View>
            <View style={styles.metaInfoRow}>
              <Text style={styles.metaInfoLabel}>Date:</Text>
              <Text style={styles.metaInfoValue}>{bill.date || 'N/A'}</Text>
            </View>
            <View style={styles.metaInfoRow}>
              <Text style={styles.metaInfoLabel}>Time:</Text>
              <Text style={styles.metaInfoValue}>{bill.time || 'N/A'}</Text>
            </View>
            <View style={styles.metaInfoRow}>
              <Text style={styles.metaInfoLabel}>Payment:</Text>
              <Text style={styles.metaInfoValue}>{bill.payment_method || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* ── 4. Itemized Table ── */}

        <View style={styles.tableContainer}>
          <View style={{ flex: 1 }}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1 }]}>ITEM</Text>
              <Text style={[styles.th, { width: 50, textAlign: 'center' }]}>QTY</Text>
              <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>RATE</Text>
              <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>TOTAL</Text>
            </View>

            {bill.items.length > 0 ? (
              bill.items.map((item, index) => (
                  <View key={item.product_id || index} style={styles.tableRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.td, { fontWeight: '700', color: '#1F2937' }]}>
                        {item.name || item.item_desc || item.desc || '-'}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                        Code: {item.item_code || '-'}
                      </Text>
                    </View>
                    <Text style={[styles.td, { width: 50, textAlign: 'center', fontWeight: '800' }]}>
                      {item.quantity || item.qty || 0}
                    </Text>
                    <Text style={[styles.td, { width: 70, textAlign: 'right', color: '#4B5563' }]}>
                      ₹{Number(item.actual_price || item.price || item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.td, { width: 80, textAlign: 'right', fontWeight: '800', color: '#111827' }]}>
                      ₹{Number(item.total_price || item.total || item.amount || ((item.quantity || item.qty || 0) * (item.actual_price || item.price || item.rate || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
              ))
            ) : (
              <View style={styles.emptyTableState}>
                <Text style={styles.emptyTableText}>No bill items added.</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.totalsContainer}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>SUBTOTAL</Text>
            <Text style={styles.subtotalValue}>₹{(Number(bill.subtotal || 0) + Number(bill.savings || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          <View style={styles.savingsBanner}>
            <Text style={styles.savingsBannerLabel}>TOTAL SAVING</Text>
            <Text style={styles.savingsBannerValue}>- ₹{Number(bill.total_savings || bill.savings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          <View style={styles.grandTotalBlock}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
            <Text style={styles.grandTotalValue}>₹{Number(bill.grand_total || bill.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          {/* Dynamic UPI QR Component */}
          <DynamicUpiQr 
            amount={Number(bill.grand_total || bill.amount || 0)} 
            billId={bill.bill_number || ''} 
          />

          {/* Disputes disclaimer */}
          <Text style={styles.disclaimerText}>* All disputes are subject to Tiruppur Jurisdiction.</Text>
          
          {/* Thanks message */}
          <Text style={styles.thanksText}>
            THANKS FOR SHOPPING WITH ALPHA SPORTS WEAR
          </Text>
        </View>

        </View>

        {/* Invoice Action Buttons (New Bill, Go Home) */}
        <View style={styles.bottomActionsContainer}>
          <TouchableOpacity
            style={styles.newBillBtn}
            onPress={() => navigation.navigate('new-bill')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="plus" size={18} color="#000000" />
            <Text style={styles.newBillBtnText}>New Bill</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.goHomeBtn}
            onPress={() => navigation.navigate('index')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="home-outline" size={18} color="#FFFFFF" />
            <Text style={styles.goHomeBtnText}>Go Home</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SecureDeleteModal
        visible={showDeleteModal}
        actionLabel={`Delete Invoice ${bill.bill_number}`}
        onVerified={() => {
          setShowDeleteModal(false);
          executeDeleteBill();
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F4F6', // Sleek light gray background
  },
  safeHeader: {
    backgroundColor: '#0A0A0A', // Ultra dark premium header
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appBarBrandText: {
    color: '#DEB841', // Gold brand text
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
  },
  verticalDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#404040',
    marginHorizontal: 10,
  },
  appBarTitle: {
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  actionButtonsScroll: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  actionButtonsScrollContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionBtnBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB', // Vibrant blue
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20, // Pill shape
    gap: 4,
  },
  actionBtnGold: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEB841', // Gold
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20, // Pill shape
    gap: 4,
  },
  actionBtnWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366', // WhatsApp brand green
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20, // Pill shape
    gap: 4,
  },
  actionBtnClose: {
    backgroundColor: '#3F3F46', // Sleek gray
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20, // Pill shape
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16, // Softer, more modern corners
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },

  // ── 2. Invoice Document Header Styles ──
  docHeaderContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  logoWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  docLogo: {
    width: 48,
    height: 48,
  },
  docBrandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 1,
  },
  docBrandSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DEB841',
    letterSpacing: 3,
    marginTop: 6,
    marginBottom: 20,
  },
  invoiceLabelContainer: {
    backgroundColor: '#111827', // Premium dark block
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginBottom: 16,
  },
  invoiceLabelText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
  },
  docAddressText: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  docPhoneText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  goldHorizontalDivider: {
    height: 1,
    width: '100%',
    backgroundColor: '#E5E7EB',
    marginTop: 24,
    marginBottom: 24,
  },

  // ── 3. Customer & Metadata Styles ──
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 12,
  },
  metaColumn: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  metaHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DEB841', // Gold accent header
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  metaName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  metaSubtext: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  metaContact: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
    fontWeight: '500',
  },
  metaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  metaInfoLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  metaInfoValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
  },

  // ── 4. Itemized Table Styles ──
  tableContainer: {
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  th: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    alignItems: 'center',
  },
  td: {
    fontSize: 12,
    color: '#374151',
  },

  // ── 5. Totals Section Styles ──
  totalsContainer: {
    alignItems: 'flex-end',
    marginBottom: 32,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    paddingRight: 12,
    paddingVertical: 6,
  },
  subtotalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginRight: 24,
  },
  subtotalValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    width: 90,
    textAlign: 'right',
  },
  savingsBanner: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 6,
    paddingRight: 12,
    marginBottom: 12,
  },
  savingsBannerLabel: {
    color: '#EF4444', // Red highlights
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginRight: 24,
  },
  savingsBannerValue: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
    width: 90,
    textAlign: 'right',
  },
  grandTotalBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#111827', // Deep dark block
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  grandTotalLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  grandTotalValue: {
    color: '#DEB841', // Gold amount
    fontSize: 22,
    fontWeight: '900',
  },

  // ── 6. Footer & QR Code Styles ──
  footerPaymentContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  qrCodeBox: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#FAFAFA',
  },
  qrIconWrapper: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentInfoWrapper: {
    flex: 1,
    marginLeft: 20,
  },
  readyBadge: {
    backgroundColor: '#ECFCCB', // Lime light
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  readyBadgeText: {
    color: '#65A30D', // Lime dark
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  scanPayTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  },
  upiIdText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DEB841',
    marginTop: 4,
  },
  paymentAppsText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  disclaimerText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  thanksText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 24,
  },
  emptyTableState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTableText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  newBillBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#DEB841',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newBillBtnText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  goHomeBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  goHomeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

