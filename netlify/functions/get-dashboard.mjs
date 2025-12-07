/**
 * Dashboard API - Securely fetches data from Firebase (Admin SDK).
 */
import admin from 'firebase-admin';

// SAME INITIALIZATION AS process-sale.mjs
if (!admin.apps.length) {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    universe_domain: "googleapis.com"
  };
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, 'dashboard-app');
  console.log('✅ Firebase Admin SDK (Dashboard) initialized.');
}
const db = admin.firestore();

export const handler = async (event) => {
  // SECURITY CHECK
  if (event.queryStringParameters?.key !== process.env.DASHBOARD_SECRET_KEY) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    console.log('📊 Dashboard data fetch requested');
    const salesSnap = await db.collection('sales').orderBy('timestamp', 'desc').limit(50).get();

    const recentSales = [];
    let totalRevenue = 0;
    let successfulDeliveries = 0;

    salesSnap.forEach(doc => {
      const sale = doc.data();
      recentSales.push({
        id: doc.id,
        orderId: sale.orderId || doc.id,
        customerEmail: sale.customerEmail || 'N/A',
        businessUrl: sale.businessUrl || 'N/A',
        amount: sale.amount || 0,
        timestamp: sale.timestamp?.toDate?.().toLocaleString('en-ZA') || 'N/A',
        auditGenerated: sale.auditGenerated || false,
        emailDelivered: sale.emailDelivered || false
      });
      if (sale.amount) totalRevenue += sale.amount;
      if (sale.emailDelivered === true) successfulDeliveries++;
    });

    const totalSales = recentSales.length;
    const successRate = totalSales > 0 ? ((successfulDeliveries / totalSales) * 100).toFixed(1) : 0;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: {
          totalRevenue: totalRevenue.toFixed(2),
          totalSales: totalSales,
          successRate: successRate,
          successfulDeliveries: successfulDeliveries
        },
        recentSales: recentSales
      })
    };

  } catch (error) {
    console.error('❌ Dashboard function error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch data', message: error.message }) };
  }
};
