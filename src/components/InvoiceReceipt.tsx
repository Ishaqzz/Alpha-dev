import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { DynamicUpiQr } from './DynamicUpiQr';

export type InvoiceReceiptProps = {
  billNo: string;
  date: string;
  time: string;
  customerName: string;
  shopName: string;
  mobileNo: string;
  shopGstNumber?: string;
  transportService: string;
  paymentMethod: string;
  subtotal: number;
  savings: number;
  originalTotal?: number;
  grandTotal: number;
  items: Array<{
    itemDesc: string;
    itemCode?: string;
    qty: number;
    actualRate: number;
    discountRate: number;
  }>;
};

export const InvoiceReceipt = React.forwardRef<View, InvoiceReceiptProps>((props, ref) => {
  return (
    <View ref={ref} collapsable={false} style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.logoWrapper}>
          <Image
            source={require('../../assets/images/logo.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.brandTitle}>ALPHA SPORTSWEAR</Text>
        <Text style={styles.brandSubtitle}>PREMIUM SPORTS & ACTIVEWEAR</Text>
        
        <View style={styles.invoiceLabel}>
          <Text style={styles.invoiceLabelText}>INVOICE</Text>
        </View>

        <Text style={styles.addressText}>
          47/9, Kariya Gounder St, Sirupooluvapatti, Khaderpet, Rayapuram, Tiruppur, Tamil Nadu 641601
        </Text>
        <Text style={styles.phoneText}>Ph: +91 7395980429</Text>
        {props.shopGstNumber ? (
          <Text style={[styles.phoneText, { marginTop: 2, fontSize: 11 }]}>GSTIN: {props.shopGstNumber}</Text>
        ) : null}
        <View style={styles.divider} />
      </View>

      {/* ── Metadata ── */}
      <View style={styles.metaContainer}>
        <View style={styles.metaColumn}>
          <Text style={styles.metaHeader}>BILL TO</Text>
          <Text style={styles.metaName}>{props.customerName || 'N/A'}</Text>
          <Text style={styles.metaSubtext}>{props.shopName || 'N/A'}</Text>
          <Text style={styles.metaContact}>Mobile: {props.mobileNo || 'N/A'}</Text>
          <Text style={styles.metaContact}>TRANSPORT: {props.transportService || 'HAND'}</Text>
        </View>

        <View style={[styles.metaColumn, { paddingLeft: 16 }]}>
          <Text style={styles.metaHeader}>INVOICE INFO</Text>
          <View style={styles.metaInfoRow}>
            <Text style={styles.metaInfoLabel}>Bill No:</Text>
            <Text style={styles.metaInfoValue}>#{props.billNo}</Text>
          </View>
          <View style={styles.metaInfoRow}>
            <Text style={styles.metaInfoLabel}>Date:</Text>
            <Text style={styles.metaInfoValue}>{props.date}</Text>
          </View>
          <View style={styles.metaInfoRow}>
            <Text style={styles.metaInfoLabel}>Time:</Text>
            <Text style={styles.metaInfoValue}>{props.time}</Text>
          </View>
          <View style={styles.metaInfoRow}>
            <Text style={styles.metaInfoLabel}>Payment:</Text>
            <Text style={styles.metaInfoValue}>{props.paymentMethod}</Text>
          </View>
        </View>
      </View>

      {/* ── Items Table ── */}
      <View style={styles.tableContainer}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.th, { flex: 1 }]}>ITEM</Text>
          <Text style={[styles.th, { width: 50, textAlign: 'center' }]}>QTY</Text>
          <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>RATE</Text>
          <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>TOTAL</Text>
        </View>

        {props.items.map((item, idx) => {
          const perItemDiscount = Math.max(0, (item.actualRate - item.discountRate) * item.qty);
          return (
          <View key={idx} style={styles.tableRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.tdBold}>{item.itemDesc || '-'}</Text>
              <Text style={styles.tdSub}>Code: {item.itemCode || '-'}</Text>
              {perItemDiscount > 0 && (
                <Text style={styles.itemDiscountText}>You saved ₹{perItemDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} on this line</Text>
              )}
            </View>
            <Text style={[styles.tdBold, { width: 50, textAlign: 'center' }]}>{item.qty}</Text>
            <Text style={[styles.td, { width: 70, textAlign: 'right' }]}>₹{item.actualRate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Text style={[styles.tdBold, { width: 80, textAlign: 'right', color: '#111827' }]}>
              ₹{(item.discountRate * item.qty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          );
        })}
      </View>

      {/* ── Totals ── */}
      <View style={styles.totalsContainer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabelLarge}>SUBTOTAL</Text>
          <Text style={styles.totalValueLarge}>₹{(props.originalTotal ?? (props.subtotal + props.savings)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabelRed}>TOTAL SAVING</Text>
          <Text style={styles.totalValueRed}>- ₹{props.savings.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
          <Text style={styles.grandTotalValue}>₹{props.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>

        <DynamicUpiQr amount={props.grandTotal} billId={props.billNo} />

        <Text style={styles.thanksText}>THANKS FOR SHOPPING WITH ALPHA SPORTS WEAR</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    width: 600, // Fixed width for consistent screenshot
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DEB841',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 16,
  },
  invoiceLabel: {
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 6,
    marginBottom: 16,
  },
  invoiceLabelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
  },
  addressText: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  phoneText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
    marginTop: 6,
  },
  divider: {
    height: 1,
    width: '100%',
    backgroundColor: '#E5E7EB',
    marginTop: 20,
  },
  metaContainer: {
    flexDirection: 'row',
    marginBottom: 24,
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
    color: '#DEB841',
    marginBottom: 8,
  },
  metaName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  metaSubtext: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
  },
  metaContact: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
  },
  metaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  metaInfoLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '500',
  },
  metaInfoValue: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111827',
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FAFAFA',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  th: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
    alignItems: 'center',
  },
  tdBold: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1F2937',
  },
  tdSub: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 2,
  },
  itemDiscountText: {
    fontSize: 9,
    color: '#10B981',
    marginTop: 4,
    fontWeight: '700',
  },
  td: {
    fontSize: 11,
    color: '#4B5563',
  },
  totalsContainer: {
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    paddingRight: 12,
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginRight: 24,
  },
  totalLabelLarge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    marginRight: 24,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    width: 80,
    textAlign: 'right',
  },
  totalValueLarge: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    width: 80,
    textAlign: 'right',
  },
  totalLabelRed: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    marginRight: 24,
  },
  totalValueRed: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
    width: 80,
    textAlign: 'right',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingRight: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    marginRight: 24,
  },
  grandTotalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DEB841',
    width: 90,
    textAlign: 'right',
  },
  thanksText: {
    width: '100%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    color: '#111827',
    marginTop: 32,
    letterSpacing: 0.5,
  },
});

