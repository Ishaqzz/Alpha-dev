import { Linking, Alert } from 'react-native';

export const generateWhatsAppReceiptText = (bill: any): string => {
  const { customerName, billId, totalAmount, items } = bill;
  
  let message = `*Alpha Sports Wear*\n\n`;
  message += `*Invoice:* #${billId}\n`;
  message += `*Customer:* ${customerName || 'Walk-in Customer'}\n\n`;
  message += `*Items:*\n`;
  
  items.forEach((item: any) => {
    const qty = item.quantity || item.qty || 0;
    const price = item.price || item.rate || item.actualRate || item.actual_price || 0;
    const total = item.total_price || item.total || item.amount || (qty * price);
    message += `- ${item.name || item.itemDesc} (Qty: ${qty}) - ₹${Number(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
  });

  message += `\n*Grand Total:* ₹${Number(totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
  message += `_Thank you for shopping with us!_`;
  
  return message;
};

export const sendWhatsAppReceipt = async (bill: any) => {
  const { customerPhone, customerName, billId, totalAmount, items } = bill;
  
  if (!customerPhone) {
    Alert.alert('No Mobile Number', 'Please provide a mobile number to send the WhatsApp receipt.');
    return;
  }

  // Clean phone number: remove non-digits
  let cleanedPhone = customerPhone.replace(/\D/g, '');
  // If it's a 10 digit Indian number, prefix with '91'
  if (cleanedPhone.length === 10) {
    cleanedPhone = '91' + cleanedPhone;
  }

  const message = generateWhatsAppReceiptText(bill);
  const url = `whatsapp://send?phone=${cleanedPhone}&text=${encodeURIComponent(message)}`;

  try {
    // We directly open the URL instead of using canOpenURL.
    // This bypasses the need to rebuild the native app for intent filters!
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert('WhatsApp Error', 'Could not open WhatsApp. Please ensure it is installed on your device.');
    console.error('WhatsApp Error:', error);
  }
};
