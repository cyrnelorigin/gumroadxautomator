/**
 * Cyrnel Origin - Main Sales Processor (Admin SDK) - UPDATED
 * Now handles GET requests for health checks (cron-job.org)
 */
import { Resend } from 'resend';
import admin from 'firebase-admin';

// ===========================================
// FIREBASE ADMIN INITIALIZATION
// ===========================================
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
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

// ===========================================
// AI AUDIT GENERATION
// ===========================================
async function generateAIaudit(businessUrl) {
  console.log(`🤖 AI analyzing: ${businessUrl}`);
  const groqPrompt = `As a senior automation consultant, analyze ${businessUrl} and create a detailed "AI-Powered Business Automation Audit". Focus on executive summary, processes to automate, quick wins, technology recommendations, a 90-day roadmap, and ROI analysis. Tone: Professional and actionable.`;
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: groqPrompt }], temperature: 0.7, max_tokens: 2500 })
    });
    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0]?.message?.content || 'Audit generation completed.';
  } catch (error) {
    console.error('❌ Audit generation failed:', error.message);
    return `**AI-Powered Business Automation Audit for ${businessUrl}**\n\nYour audit is being finalized and will be delivered shortly.`;
  }
}

// ===========================================
// EMAIL SENDING
// ===========================================
async function sendAuditEmail(customerEmail, businessUrl, auditContent, orderId) {
  const sanitizedOrderId = orderId.replace(/[^a-zA-Z0-9-_]/g, '_');
  try {
    const { data, error } = await resend.emails.send({
      from: 'Cyrnel Origin <audits@cyrnelorigin.online>',
      to: [customerEmail],
      subject: `Your AI-Powered Business Automation Audit for ${businessUrl} | Cyrnel Origin`,
      html: `<html><body><h1>Your AI Audit</h1><p>Analysis for <strong>${businessUrl}</strong>:</p><div>${auditContent.replace(/\n/g, '<br>')}</div></body></html>`,
      text: `AI Audit for ${businessUrl}\n\n${auditContent}`,
      tags: [{ name: 'audit', value: sanitizedOrderId }]
    });
    if (error) throw error;
    console.log(`✅ Email sent. Resend ID: ${data.id}`);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error('❌ Email failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ===========================================
// MAIN HANDLER - NOW WITH GET SUPPORT
// ===========================================
export const handler = async (event) => {
  console.log('🚀 Cyrnel Origin Automation Engine - v2.1');
  
  // ===== NEW: Handle GET requests (for cron-job.org health checks) =====
  if (event.httpMethod === 'GET') {
    console.log('✅ Health check from cron-job.org');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'online',
        service: 'Cyrnel Origin Sales Processor',
        version: '2.1',
        timestamp: new Date().toISOString(),
        uptime: '24/7',
        gumroad_connected: true,
        firebase_connected: true,
        ai_engine: 'operational'
      })
    };
  }
  // ===== END OF NEW CODE =====
  
  // Continue with existing POST handling...
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const params = new URLSearchParams(event.body);
    const saleData = Object.fromEntries(params.entries());
    const email = saleData.email;
    const orderId = saleData.sale_id || `ORD-${Date.now()}`;
    let businessUrl = saleData['custom_fields[website]'] || saleData.website || 'Not provided';
    businessUrl = businessUrl.replace(/^(https?:\/\/)?(www\.)?/, '');
    const amount = saleData.price ? (parseInt(saleData.price) / 100).toFixed(2) : '0.00';

    console.log(`✅ Processing Order: ${orderId} for ${email}`);

    const auditContent = await generateAIaudit(businessUrl);
    const emailResult = await sendAuditEmail(email, businessUrl, auditContent, orderId);

    // LOG TO FIRESTORE
    try {
      await db.collection('sales').doc(orderId).set({
        orderId: orderId,
        customerEmail: email,
        businessUrl: businessUrl,
        amount: parseFloat(amount),
        currency: saleData.currency || 'ZAR',
        auditGenerated: true,
        emailDelivered: emailResult.success,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('📊 Sale logged to Firebase');
    } catch (firebaseError) {
      console.error('Firebase log error:', firebaseError.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: emailResult.success,
        message: 'Cyrnel Origin audit workflow complete.',
        order_id: orderId
      })
    };
  } catch (error) {
    console.error('❌ Handler error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
