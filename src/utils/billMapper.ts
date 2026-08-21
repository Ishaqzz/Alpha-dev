export interface BillItem {
  item_code: string;
  product_id: string;
  name: string;
  size: string;
  quantity: number;
  actual_price: number;
  discount_price: number;
  total_price: number;
  [key: string]: any;
}

export interface Bill {
  id: string;
  bill_number: string;
  created_at: any; // Firebase Timestamp or ISO string
  date: string;
  time: string;
  customer_name: string;
  mobile_number: string;
  shop_name: string;
  transport: string;
  payment_method: string;
  is_gst_bill: boolean;
  gst_amount: number;
  subtotal: number;
  grand_total: number;
  total_savings: number;
  cash_portion: number;
  upi_portion: number;
  items: BillItem[];
  [key: string]: any;
}

/**
 * Maps a raw Firestore document to a robust Bill object.
 * Handles missing fields and schema evolution by providing sensible defaults
 * and preserving all raw fields natively.
 */
export const mapFirestoreBill = (id: string, data: any): Bill => {
  // Gracefully derive date and time if missing but created_at exists
  let derivedDate = data.date || '';
  let derivedTime = data.time || '';
  
  if (!derivedDate && data.created_at) {
    const ts: Date = data.created_at.toDate 
      ? data.created_at.toDate() 
      : new Date(data.created_at);
    
    if (!isNaN(ts.getTime())) {
      derivedDate = ts.toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
      derivedTime = ts.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    }
  }

  return {
    ...data, // Preserve all dynamic/future fields automatically
    id,
    bill_number: data.bill_number || data.billNo || id,
    created_at: data.created_at || null,
    date: derivedDate,
    time: derivedTime,
    customer_name: data.customer_name || data.customerName || 'Walk-in Customer',
    mobile_number: data.mobile_number || data.mobileNo || data.mobile || '',
    shop_name: data.shop_name || data.shopName || '',
    transport: data.transport || data.transportService || '',
    payment_method: (data.payment_method || data.paymentMethod || 'CASH').toUpperCase(),
    is_gst_bill: data.is_gst_bill ?? data.gstEnabled ?? false,
    gst_amount: Number(data.gst_amount ?? data.gstAmount ?? 0),
    subtotal: Number(data.subtotal ?? 0),
    grand_total: Number(data.grand_total ?? data.grandTotal ?? data.amount ?? 0),
    total_savings: Number(data.total_savings ?? data.savings ?? 0),
    original_total: Number(data.original_total ?? data.originalTotal ?? (data.subtotal ?? 0) + (data.savings ?? 0)),
    cash_portion: Number(data.cash_portion ?? data.cashSplit ?? 0),
    upi_portion: Number(data.upi_portion ?? data.upiSplit ?? 0),
    
    items: (data.items || []).map((item: any) => ({
      ...item, // Preserve item dynamic fields
      item_code: item.item_code || item.itemCode || item.code || '',
      product_id: item.product_id || item.productId || '',
      name: item.name || item.itemName || item.itemDesc || item.desc || '',
      size: item.size || '',
      quantity: Number(item.quantity ?? item.qty ?? 0),
      actual_price: Number(item.actual_price ?? item.actualRate ?? item.rate ?? item.price ?? 0),
      discount_price: Number(item.discount_price ?? item.discountRate ?? item.actualRate ?? item.rate ?? item.price ?? 0),
      total_price: Number(item.total_price ?? item.total ?? item.amount ?? 0),
    })),
  };
};
