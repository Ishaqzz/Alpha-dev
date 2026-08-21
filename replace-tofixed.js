const fs = require('fs');
const path = require('path');

const files = [
  "src/utils/whatsappHelper.ts",
  "src/components/InvoiceReceipt.tsx",
  "src/components/DynamicUpiQr.tsx",
  "src/app/stock-inventory.tsx",
  "src/app/recycle-bin.tsx",
  "src/app/products.tsx",
  "src/app/new-bill.tsx",
  "src/app/invoice-view.tsx",
  "src/app/index.tsx",
  "src/app/history.tsx",
  "src/app/customers.tsx",
  "src/app/bill-preview.tsx",
  "src/app/analytics.tsx"
];

const basePath = 'd:/projects/Alphaandroid';

files.forEach(file => {
  const filePath = path.join(basePath, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    // Replace .toFixed(2) with .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const newContent = content.replace(/\.toFixed\(2\)/g, ".toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })");
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Updated ${file}`);
    }
  }
});
