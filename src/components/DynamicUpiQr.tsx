import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type DynamicUpiQrProps = {
  amount: number;
  billId: string;
};

export const DynamicUpiQr: React.FC<DynamicUpiQrProps> = ({ amount, billId }) => {
  const upiId = "nothullar93@oksbi";
  const storeName = "Alpha Sports Wear";
  
  const encodedName = encodeURIComponent(storeName);
  const encodedBillId = encodeURIComponent(`Bill #${billId}`);
  const amountStr = amount.toFixed(2);
  
  // Official NPCI UPI deep-link URL format
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodedName}&am=${amountStr}&cu=INR&tn=${encodedBillId}`;

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCode 
          value={upiUrl}
          size={160}
          backgroundColor="white"
          color="black"
        />
      </View>
      <Text style={styles.readoutText}>Scan to Pay: ₹{amountStr}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
    padding: 16,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignSelf: 'center',
  },
  qrWrapper: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  readoutText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  }
});
