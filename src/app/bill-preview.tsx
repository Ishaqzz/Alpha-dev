import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useLocalSearchParams } from 'expo-router';
import { DrawerNavigationProp } from 'expo-router/drawer';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { sendWhatsAppReceipt } from '../utils/whatsappHelper';

// ── Web fallback font ─────────────────────────────────────────────────────────
const systemFont = Platform.select({
  web: 'Montserrat, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

// ── Types ─────────────────────────────────────────────────────────────────────
type BillItem = {
  id: string;
  code: string;
  desc: string;
  qty: number;
  price: number;
  total: number;
};

// ── HTML / PDF Template ───────────────────────────────────────────────────────
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
  items: BillItem[];
  shopGstNumber?: string;
}): string {
  const itemRows = params.items
    .map(
      (item, index) => `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #374151;">${index + 1}</td>
        <td style="padding: 8px 6px; font-size: 11px; color: #4B5563;">${item.code || '-'}</td>
        <td style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #111827;">${item.desc || '-'}</td>
        <td style="padding: 8px 6px; font-size: 11px; text-align: center; font-weight: 800; color: #111827;">${item.qty}</td>
        <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #4B5563;">&#8377;${Number(item.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding: 8px 6px; font-size: 11px; text-align: right; font-weight: 800; color: #111827;">&#8377;${Number(item.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
      margin-bottom: 16px;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      overflow: hidden;
    }
    thead tr {
      background: #DEB841;
    }
    thead th {
      padding: 10px 6px;
      font-size: 10px;
      font-weight: 800;
      color: #FFFFFF;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .totals-section { margin-bottom: 20px; }
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
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #E5E7EB;
    }
    .disclaimer {
      font-size: 9px;
      font-style: italic;
      color: #9CA3AF;
      margin-bottom: 10px;
    }
    .thanks {
      font-size: 12px;
      font-weight: 900;
      color: #111827;
      letter-spacing: 0.5px;
    }
    .payment-badge {
      display: inline-block;
      background: #D1FAE5;
      color: #10B981;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 800;
      margin-bottom: 6px;
    }
    .upi-id {
      font-size: 13px;
      font-weight: 800;
      color: #DEB841;
    }
  </style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="brand-title">ALPHA SPORTSWEAR</div>
    <div class="brand-subtitle">PREMIUM SPORTS &amp; ACTIVEWEAR</div>
    <div class="invoice-banner"><span class="invoice-banner-text">INVOICE</span></div>
    <div class="address-text">
      47/9, Kariya Gounder St, Sirupooluvapatti, Khaderpet, Rayapuram, Tiruppur, Tamil Nadu 641601
    </div>
    <div class="phone-text">Ph: +91 7395980429</div>
    ${params.shopGstNumber ? `<div class="phone-text">GSTIN: ${params.shopGstNumber}</div>` : ''}
    <div class="gold-divider"></div>
  </div>

  <!-- Meta -->
  <div class="meta-row">
    <div class="meta-col">
      <div class="meta-header">BILL TO</div>
      <div class="meta-name">${params.customerName || 'Walk-in Customer'}</div>
      <div class="meta-sub">${params.shopName || ''}</div>
      <div class="meta-contact">Mobile: ${params.mobileNo || 'N/A'}</div>
      <div class="meta-contact">Transport: ${params.transportService || 'HAND'}</div>
    </div>
    <div class="meta-col" style="padding-left:24px;">
      <div class="meta-header">INVOICE INFO</div>
      <div class="info-row"><span class="info-label">Bill Number:</span><span class="info-value">#${params.billNo}</span></div>
      <div class="info-row"><span class="info-label">Date:</span><span class="info-value">${params.date}</span></div>
      <div class="info-row"><span class="info-label">Time:</span><span class="info-value">${params.time}</span></div>
      <div class="info-row"><span class="info-label">Payment:</span><span class="info-value">${params.paymentMethod}</span></div>
    </div>
  </div>

  <!-- Items Table -->
  <table>
    <thead>
      <tr>
        <th style="width:32px; text-align:left;">#</th>
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
    <div class="subtotal-row">
      <span class="subtotal-label">SUBTOTAL</span>
      <span class="subtotal-value">&#8377;${(params.subtotal + params.savings).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
    <div class="payment-badge">READY TO PAY</div>
    <div style="font-size:11px;font-weight:800;color:#111827;margin-bottom:4px;">UPI: nothullar93@oksbi</div>
    <div style="font-size:9px;color:#9CA3AF;margin-bottom:12px;">PhonePe &bull; GPay &bull; Paytm &bull; Any UPI App</div>
    <div class="disclaimer">* All disputes are subject to Tiruppur Jurisdiction.</div>
    <div class="thanks">THANKS FOR SHOPPING WITH ALPHA SPORTS WEAR</div>
  </div>
</div>
</body>
</html>`;
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function BillPreviewScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const params = useLocalSearchParams();
  const [isPrinting, setIsPrinting] = useState(false);
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

  // ── Safely parse all navigation params ───────────────────────────────────
  const billNo = (params.billNo as string) || 'N/A';
  const date = (params.date as string) || '';
  const time = (params.time as string) || '';
  const paymentMethod = (params.paymentMethod as string) || 'Cash';
  const customerName = (params.customerName as string) || 'Walk-in Customer';
  const shopName = (params.shopName as string) || '';
  const mobileNo = (params.mobileNo as string) || 'N/A';
  const transportService = (params.transportService as string) || 'HAND';

  const subtotal = parseFloat(params.subtotal as string) || 0;
  const savings = parseFloat(params.savings as string) || 0;
  const grandTotal = parseFloat(params.grandTotal as string) || 0;
  const gstAmount = parseFloat(params.gstAmount as string) || 0;

  let items: BillItem[] = [];
  try {
    if (params.items) {
      items = JSON.parse(params.items as string);
    }
  } catch {
    items = [];
  }

  const generatePdfUri = async () => {
    const html = buildPdfHtml({
      billNo,
      date,
      time,
      paymentMethod,
      customerName,
      shopName,
      mobileNo,
      transportService,
      subtotal,
      savings,
      grandTotal,
      gstAmount,
      items,
      shopGstNumber: storeGstNumber,
      upiId: 'nothullar93@oksbi',
    });
    
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
  };

  // ── Share Invoice via WhatsApp ───────────────────────────────────────────
  const handleShareWhatsApp = async () => {
    if (!mobileNo || !mobileNo.trim()) {
      Alert.alert('No Mobile Number', 'This invoice does not have a customer mobile number.');
      return;
    }
    await sendWhatsAppReceipt({
      customerPhone: mobileNo,
      customerName,
      billId: billNo,
      totalAmount: grandTotal,
      items: items.map(item => ({
        name: item.desc || item.code || 'Item',
        quantity: item.qty,
        price: item.price,
        total_price: item.total,
      })),
    });
  };

  // ── Share PDF (with WhatsApp quick option) ────────────────────────────────
  const handleSharePdf = async () => {
    if (mobileNo && mobileNo.trim()) {
      Alert.alert(
        `Share Invoice #${billNo}`,
        'Choose how you would like to share this invoice:',
        [
          {
            text: 'Send to WhatsApp',
            onPress: () => handleShareWhatsApp(),
          },
          {
            text: 'Share PDF (Other Apps)...',
            onPress: () => executeSharePdfSystem(),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    await executeSharePdfSystem();
  };

  const executeSharePdfSystem = async () => {
    try {
      setIsPrinting(true);

      // 1. Generate PDF as base64 — avoids temp file permission issues
      const html = buildPdfHtml({
        billNo, date, time, paymentMethod, customerName, shopName,
        mobileNo, transportService, subtotal, savings, grandTotal,
        gstAmount, items, shopGstNumber: storeGstNumber, upiId: 'nothullar93@oksbi',
      });
      const { base64 } = await Print.printToFileAsync({ html, base64: true });
      if (!base64) throw new Error('PDF generation returned no content.');

      // 2. Decode base64 → Uint8Array
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      // 3. Write to AlphaBill dir so expo-sharing can access a stable file path
      const alphaBillDir = new Directory(Paths.document, 'AlphaBill');
      if (!alphaBillDir.exists) alphaBillDir.create();
      const fileName = `${billNo.replace(/[^a-zA-Z0-9\-]/g, '_')}.pdf`;
      const destFile = new File(alphaBillDir, fileName);
      if (destFile.exists) destFile.delete();
      destFile.create();
      destFile.write(bytes);

      // 4. Share the file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(destFile.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Share Invoice ${billNo}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sharing Unavailable', 'Sharing is not supported on this device.');
      }
    } catch (err: any) {
      console.error('[BillPreview] Error sharing PDF:', err);
      Alert.alert('Share Error', err.message || 'Could not share PDF.');
    } finally {
      setIsPrinting(false);
    }
  };

  // ── PDF: Save to phone ─────────────────────────────────────────────
  const handleSavePdf = async () => {
    if (isPrinting) return;
    try {
      setIsPrinting(true);
      const html = buildPdfHtml({
        billNo, date, time, paymentMethod, customerName, shopName,
        mobileNo, transportService, subtotal, savings, grandTotal,
        gstAmount, items, shopGstNumber: storeGstNumber, upiId: 'nothullar93@oksbi',
      });
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Save Invoice ${billNo}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (err: any) {
      console.error('[BillPreview] Error saving PDF:', err);
      Alert.alert('Save Error', err.message || 'Could not save PDF.');
    } finally {
      setIsPrinting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Top Action Bar ── */}
      <SafeAreaView style={styles.safeHeader} edges={['top']}>
        <View style={styles.appBar}>
          {/* Left brand */}
          <View style={styles.appBarLeft}>
            <Text style={styles.appBarBrandText} numberOfLines={1} ellipsizeMode="tail">ALPHA SPORTS WEAR</Text>
            <View style={styles.verticalDivider} />
            <Text style={styles.appBarTitle} numberOfLines={1} ellipsizeMode="tail">Bill Preview</Text>
          </View>

          {/* Action buttons */}
          <View style={styles.appBarRight}>
            {/* Save Button */}
            <TouchableOpacity
              style={styles.actionBtnBlue}
              activeOpacity={0.8}
              onPress={handleSavePdf}
              disabled={isPrinting}
            >
              <MaterialCommunityIcons name="content-save-outline" size={15} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Save</Text>
            </TouchableOpacity>

            {/* Share PDF */}
            <TouchableOpacity
              style={styles.actionBtnGold}
              activeOpacity={0.8}
              onPress={handleSharePdf}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator size={14} color="#000000" />
              ) : (
                <MaterialCommunityIcons name="share-variant" size={15} color="#000000" />
              )}
              <Text style={[styles.actionBtnText, { color: '#000000', marginLeft: 4 }]}>
                {isPrinting ? 'Opening…' : 'Share'}
              </Text>
            </TouchableOpacity>

            {/* WhatsApp */}
            <TouchableOpacity
              style={styles.actionBtnWhatsApp}
              activeOpacity={0.8}
              onPress={handleShareWhatsApp}
              disabled={isPrinting}
            >
              <MaterialCommunityIcons name="whatsapp" size={15} color="#FFFFFF" />
              <Text style={[styles.actionBtnText, { marginLeft: 4 }]}>WhatsApp</Text>
            </TouchableOpacity>

            {/* Close */}
            <TouchableOpacity
              style={styles.actionBtnClose}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('index')}
            >
              <Text style={styles.actionBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Invoice Document Body ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Company Header ── */}
        <View style={styles.docHeaderContainer}>
          <View style={styles.logoWrapper}>
            <Image
              source={require('../../assets/images/logo.jpeg')}
              style={styles.docLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.docBrandTitle}>ALPHA SPORTSWEAR</Text>
          <Text style={styles.docBrandSubtitle}>PREMIUM SPORTS &amp; ACTIVEWEAR</Text>

          <View style={styles.invoiceLabelContainer}>
            <Text style={styles.invoiceLabelText}>INVOICE</Text>
          </View>

          <Text style={styles.docAddressText}>
            47/9, Kariya Gounder St, Sirupooluvapatti, Khaderpet,{'\n'}
            Rayapuram, Tiruppur, Tamil Nadu 641601
          </Text>
          <Text style={styles.docPhoneText}>Ph: +91 7395980429</Text>
          <View style={styles.goldDivider} />
        </View>

        {/* ── Customer & Invoice Metadata ── */}
        <View style={styles.metaContainer}>
          {/* Left: Bill To */}
          <View style={styles.metaColumn}>
            <Text style={styles.metaHeader}>BILL TO</Text>
            <Text style={styles.metaName}>{customerName}</Text>
            {!!shopName && <Text style={styles.metaSub}>{shopName}</Text>}
            <Text style={styles.metaContact}>Mobile: {mobileNo}</Text>
            <Text style={styles.metaContact}>Transport: {transportService}</Text>
          </View>

          {/* Right: Invoice Info */}
          <View style={styles.metaColumn}>
            <Text style={styles.metaHeader}>INVOICE INFO</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Bill Number:</Text>
              <Text style={styles.infoValue}>#{billNo}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date:</Text>
              <Text style={styles.infoValue}>{date}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Time:</Text>
              <Text style={styles.infoValue}>{time}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Payment:</Text>
              <Text style={styles.infoValue}>{paymentMethod}</Text>
            </View>
          </View>
        </View>

        {/* ── Items table ── */}
        <View style={styles.tableContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={{ minWidth: 600, flex: 1 }}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 40 }]}>#</Text>
                <Text style={[styles.th, { width: 100 }]}>ITEM CODE</Text>
                <Text style={[styles.th, { flex: 1, minWidth: 150 }]}>DESCRIPTION</Text>
                <Text style={[styles.th, { width: 60, textAlign: 'center' }]}>QTY</Text>
                <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>RATE</Text>
                <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>AMOUNT</Text>
              </View>

              {items.length > 0 ? (
                items.map((item, index) => (
                  <View
                    key={item.id || index}
                    style={[styles.tableRow, index % 2 !== 0 && styles.tableRowAlt]}
                  >
                    <Text style={[styles.td, { width: 40 }]}>{index + 1}</Text>
                    <Text style={[styles.td, { width: 100 }]}>{item.code || item.id || '-'}</Text>
                    <Text style={[styles.td, { flex: 1, minWidth: 150 }]}>{item.name || item.desc || item.itemDesc || '-'}</Text>
                    <Text style={[styles.td, { width: 60, textAlign: 'center', fontWeight: '800' }]}>
                      {item.qty || item.quantity || 0}
                    </Text>
                    <Text style={[styles.td, { width: 90, textAlign: 'right' }]}>
                      ₹{Number(item.price || item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                    <Text style={[styles.td, { width: 100, textAlign: 'right', fontWeight: '800' }]}>
                      ₹{Number(item.total || item.amount || item.total_price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No items added yet</Text>
                </View>
              )}

          {/* GST row */}
          {gstAmount > 0 && (
            <View style={[styles.tableRow, { backgroundColor: '#FFFBEB' }]}>
              <Text style={[styles.td, { flex: 1, textAlign: 'right', color: '#92400E', fontWeight: '700', paddingRight: 8 }]}>
                GST (5%)
              </Text>
              <Text style={[styles.td, { width: 100, textAlign: 'right', fontWeight: '800', color: '#92400E' }]}>
                ₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
          )}
            </View>
          </ScrollView>
        </View>

        {/* ── Totals ── */}
        <View style={styles.totalsContainer}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>SUBTOTAL</Text>
            <Text style={styles.subtotalValue}>₹{(subtotal + savings).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          <View style={styles.savingsBanner}>
            <Text style={styles.savingsBannerLabel}>TOTAL SAVING</Text>
            <Text style={styles.savingsBannerValue}>- ₹{savings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>

          <View style={styles.grandTotalBlock}>
            <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
            <Text style={styles.grandTotalValue}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </View>
        </View>

        {/* ── QR / Payment Footer ── */}
        <View style={styles.footerContainer}>
          <View style={styles.qrBox}>
            <View style={styles.qrIconWrapper}>
              <MaterialCommunityIcons name="qrcode" size={56} color="#111827" />
            </View>
            <View style={styles.paymentInfoWrapper}>
              <View style={styles.readyBadge}>
                <Text style={styles.readyBadgeText}>READY TO PAY</Text>
              </View>
              <Text style={styles.scanPayTitle}>SCAN &amp; PAY VIA UPI</Text>
              <Text style={styles.upiIdText}>nothullar93@oksbi</Text>
              <Text style={styles.paymentAppsText}>PhonePe • GPay • Paytm • Any UPI App</Text>
            </View>
          </View>

          <Text style={styles.disclaimerText}>
            * All disputes are subject to Tiruppur Jurisdiction.
          </Text>
          <Text style={styles.thanksText}>THANKS FOR SHOPPING WITH ALPHA SPORTS WEAR</Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Floating Print FAB ── */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={handlePrintShare}
          disabled={isPrinting}
        >
          {isPrinting ? (
            <ActivityIndicator size={22} color="#000000" />
          ) : (
            <MaterialCommunityIcons name="printer-outline" size={22} color="#000000" />
          )}
          <Text style={styles.fabText}>{isPrinting ? 'Opening…' : 'Print / Share PDF'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  safeHeader: {
    backgroundColor: '#0A0A0A',
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
    flex: 1,
    marginRight: 8,
  },
  appBarBrandText: {
    fontFamily: systemFont,
    color: '#DEB841',
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
    fontFamily: systemFont,
    color: '#A3A3A3',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  appBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actionBtnBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  actionBtnGold: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEB841',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  actionBtnWhatsApp: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#25D366',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 4,
  },
  actionBtnClose: {
    backgroundColor: '#3F3F46',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
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
    fontFamily: systemFont,
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 1,
  },
  docBrandSubtitle: {
    fontFamily: systemFont,
    fontSize: 10,
    fontWeight: '800',
    color: '#DEB841',
    letterSpacing: 3,
    marginTop: 6,
    marginBottom: 20,
  },
  invoiceLabelContainer: {
    backgroundColor: '#111827',
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginBottom: 16,
  },
  invoiceLabelText: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 4,
  },
  docAddressText: {
    fontFamily: systemFont,
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  docPhoneText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  goldDivider: {
    height: 1,
    width: '100%',
    backgroundColor: '#E5E7EB',
    marginTop: 24,
    marginBottom: 24,
  },
  metaContainer: {
    flexDirection: 'row',
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
    fontFamily: systemFont,
    fontSize: 10,
    fontWeight: '800',
    color: '#DEB841',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  metaName: {
    fontFamily: systemFont,
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  metaSub: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 3,
  },
  metaContact: {
    fontFamily: systemFont,
    fontSize: 11,
    color: '#6B7280',
    marginTop: 6,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontFamily: systemFont,
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  infoValue: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
  },
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
    fontFamily: systemFont,
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
  tableRowAlt: {
    backgroundColor: '#FFFFFF',
  },
  td: {
    fontFamily: systemFont,
    fontSize: 12,
    color: '#374151',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontFamily: systemFont,
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  totalsContainer: {
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
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginRight: 24,
  },
  subtotalValue: {
    fontFamily: systemFont,
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
    fontFamily: systemFont,
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginRight: 24,
  },
  savingsBannerValue: {
    fontFamily: systemFont,
    color: '#10B981',
    fontSize: 13,
    fontWeight: '800',
    width: 90,
    textAlign: 'right',
  },
  grandTotalBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  grandTotalLabel: {
    fontFamily: systemFont,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  grandTotalValue: {
    fontFamily: systemFont,
    color: '#DEB841',
    fontSize: 22,
    fontWeight: '900',
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  qrBox: {
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
    backgroundColor: '#ECFCCB',
    alignSelf: 'flex-start',
    borderRadius: 4,
    marginBottom: 4,
  },
  readyBadgeText: {
    fontFamily: systemFont,
    color: '#10B981',
    fontSize: 9,
    fontWeight: '800',
  },
  scanPayTitle: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
  },
  upiIdText: {
    fontFamily: systemFont,
    fontSize: 12,
    fontWeight: '800',
    color: '#DEB841',
    marginTop: 2,
  },
  paymentAppsText: {
    fontFamily: systemFont,
    fontSize: 9,
    color: '#9CA3AF',
    marginTop: 2,
  },
  disclaimerText: {
    fontFamily: systemFont,
    fontSize: 9,
    fontStyle: 'italic',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 10,
  },
  thanksText: {
    fontFamily: systemFont,
    fontSize: 11,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 16,
  },

  // ── Floating FAB ──
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DEB841',
    paddingVertical: 15,
    borderRadius: 50,
    gap: 10,
    shadowColor: '#DEB841',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    fontFamily: systemFont,
    fontSize: 15,
    fontWeight: '800',
    color: '#000000',
  },
});

