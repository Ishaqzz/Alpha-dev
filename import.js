const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// 1. Make sure you downloaded your Test project's private key and named it this:
const serviceAccount = require('./serviceAccountKey.json'); 

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const customers = JSON.parse(fs.readFileSync('customer.json', 'utf8'));

async function uploadCustomers() {
  console.log(`Starting import of ${customers.length} customers...`);
  
  for (const customer of customers) {
    try {
      // Sets the Firestore Document ID to the 10-digit mobile number
      await db.collection('customers').doc(customer.mobile).set(customer);
      console.log(`✅ Uploaded: ${customer.name} (${customer.mobile})`);
    } catch (error) {
      console.error(`❌ Failed: ${customer.mobile}`, error);
    }
  }
  console.log('🎉 All done! Your test database is populated.');
}

uploadCustomers();