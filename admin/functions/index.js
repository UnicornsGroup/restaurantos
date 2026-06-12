const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const crypto = require('crypto');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

// Helper: Calculate days between two dates
function getDaysBetween(d1, d2) {
  const diffTime = d1.getTime() - d2.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 1. checkPlan
 * HTTPS GET/POST endpoint to verify subscription plan status for a restaurant.
 * Responds with active status, plan type, and days remaining.
 * Enables CORS so that any client restaurant instance can call it.
 */
exports.checkPlan = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      const restaurantId = req.query.restaurantId || (req.body && req.body.restaurantId);
      if (!restaurantId) {
        return res.status(400).json({ error: "Missing restaurantId query or body parameter." });
      }

      const docRef = db.collection('restaurants').doc(restaurantId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        // Return a default mock/trial state if the restaurant is not registered in the master DB
        // to prevent bricking freshly set up demo instances immediately.
        return res.status(200).json({
          restaurantId,
          status: "active",
          plan: "trial",
          expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          daysLeft: 15,
          graceDaysLeft: 0,
          isMasterRegistered: false
        });
      }

      const data = docSnap.data();
      const status = data.status || 'suspended';
      const plan = data.plan || 'trial';
      const expiryDateStr = data.expiryDate;
      const graceStartDateStr = data.graceStartDate;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let daysLeft = 0;
      if (expiryDateStr) {
        const expiryDate = new Date(expiryDateStr);
        expiryDate.setHours(0, 0, 0, 0);
        daysLeft = getDaysBetween(expiryDate, today);
      }

      let graceDaysLeft = 0;
      if (status === 'grace') {
        const graceStart = graceStartDateStr ? new Date(graceStartDateStr) : (expiryDateStr ? new Date(expiryDateStr) : today);
        graceStart.setHours(0, 0, 0, 0);
        const graceElapsed = getDaysBetween(today, graceStart);
        graceDaysLeft = Math.max(0, 15 - graceElapsed); // 15-day grace period
      }

      return res.status(200).json({
        restaurantId,
        status,
        plan,
        expiryDate: expiryDateStr || "",
        daysLeft,
        graceDaysLeft,
        isMasterRegistered: true
      });
    } catch (error) {
      console.error("Error checking plan:", error);
      return res.status(500).json({ error: error.message });
    }
  });
});

/**
 * 2. dailyExpiryCheck
 * Scheduled PubSub function executing daily at 9:00 AM IST.
 * Evaluates subscription expirations, transitions status to "grace", and suspends after grace period.
 */
exports.dailyExpiryCheck = functions.pubsub.schedule('0 9 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async (context) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    console.log(`Starting daily subscription check for date: ${todayStr}`);
    const restaurantsRef = db.collection('restaurants');
    const snapshot = await restaurantsRef.get();

    const batch = db.batch();
    let updatesCount = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const id = doc.id;
      const status = data.status || 'active';
      const plan = data.plan || 'trial';
      const expiryDateStr = data.expiryDate;
      const graceStartDateStr = data.graceStartDate;

      // Skip lifetime/unlimited plans
      if (plan === 'lifetime') return;

      if (expiryDateStr) {
        const expiryDate = new Date(expiryDateStr);
        expiryDate.setHours(0, 0, 0, 0);

        if (expiryDate < today) {
          // Expiry date has passed
          if (status === 'active') {
            // Transition from Active to Grace period
            console.log(`Restaurant ${id} expired on ${expiryDateStr}. Moving to grace state.`);
            batch.update(restaurantsRef.doc(id), {
              status: 'grace',
              graceStartDate: todayStr
            });
            updatesCount++;
          } else if (status === 'grace') {
            // Check if grace period has exceeded 15 days
            const graceStart = graceStartDateStr ? new Date(graceStartDateStr) : expiryDate;
            graceStart.setHours(0, 0, 0, 0);
            const daysInGrace = getDaysBetween(today, graceStart);

            if (daysInGrace > 15) {
              console.log(`Restaurant ${id} grace period exceeded (${daysInGrace} days). Suspending account.`);
              batch.update(restaurantsRef.doc(id), {
                status: 'suspended'
              });
              updatesCount++;
            }
          }
        }
      }
    });

    if (updatesCount > 0) {
      await batch.commit();
      console.log(`Successfully completed daily subscriptions update. Committed changes for ${updatesCount} restaurants.`);
    } else {
      console.log("No subscription status updates needed today.");
    }
    return null;
  });

/**
 * 3. razorpayWebhook
 * Webhook endpoint for Razorpay payment triggers.
 * Verifies authenticity of request using header signature, handles captured payments,
 * and increments client subscription validity periods.
 */
exports.razorpayWebhook = functions.https.onRequest((req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'ros_webhook_secret_fallback';
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    console.warn("Razorpay signature header missing.");
    return res.status(400).send("Signature header missing.");
  }

  // Verify signature
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(req.body));
  const digest = hmac.digest('hex');

  if (digest !== signature) {
    console.error("Razorpay webhook signature verification failed.");
    return res.status(400).send("Invalid signature verification.");
  }

  console.log("Razorpay webhook signature verified successfully. Event: ", req.body.event);
  const event = req.body.event;

  // We are interested in orders or payments captured/paid
  if (event === 'order.paid' || event === 'payment.captured') {
    const payload = req.body.payload;
    const payment = payload.payment ? payload.payment.entity : null;
    const order = payload.order ? payload.order.entity : null;

    // Retrieve restaurantId & plan details from Razorpay notes
    const notes = (payment && payment.notes) || (order && order.notes) || {};
    const restaurantId = notes.restaurantId;
    const purchasedPlan = notes.plan; // 'monthly' or 'annual'

    if (!restaurantId || !purchasedPlan) {
      console.error("Missing restaurantId or plan in Razorpay notes payload.", notes);
      return res.status(200).send("Payment processed, but missing custom metadata notes.");
    }

    const docRef = db.collection('restaurants').doc(restaurantId);
    
    return db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists) {
        throw new Error(`Restaurant ${restaurantId} does not exist in Firestore.`);
      }

      const currentData = docSnap.data();
      const currentExpiryStr = currentData.expiryDate;
      let newExpiry = new Date();

      // If current expiry is in the future, extend from current expiry. Else, extend from today.
      if (currentExpiryStr) {
        const curExp = new Date(currentExpiryStr);
        if (curExp > newExpiry) {
          newExpiry = curExp;
        }
      }

      // Calculate new expiration date
      let daysToAdd = 30;
      if (purchasedPlan === 'annual') daysToAdd = 365;
      if (purchasedPlan === 'lifetime') daysToAdd = 36500;

      newExpiry.setDate(newExpiry.getDate() + daysToAdd);
      const newExpiryStr = newExpiry.toISOString().split('T')[0];

      transaction.update(docRef, {
        status: 'active',
        plan: purchasedPlan,
        expiryDate: newExpiryStr,
        graceStartDate: '',
        lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
        lastPaymentAmount: payment ? (payment.amount / 100) : 0 // Razorpay amounts are in paise
      });

      // Log payment history entry
      const historyRef = db.collection('restaurants').doc(restaurantId).collection('payments').doc();
      transaction.set(historyRef, {
        amount: payment ? (payment.amount / 100) : 0,
        currency: (payment && payment.currency) || 'INR',
        plan: purchasedPlan,
        status: 'success',
        gateway: 'razorpay',
        paymentId: (payment && payment.id) || '',
        orderId: (order && order.id) || '',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Successfully updated ${restaurantId} plan to ${purchasedPlan}. New Expiry: ${newExpiryStr}`);
    })
    .then(() => {
      return res.status(200).send("Webhook handled successfully.");
    })
    .catch((error) => {
      console.error("Transaction failed: ", error);
      return res.status(500).send("Internal transaction failure.");
    });
  }

  return res.status(200).send("Event not handled.");
});

/**
 * 4. sendManualReminder
 * HTTPS POST endpoint for administrators to trigger manual reminder emails.
 * Restricts access to authenticated master admin users.
 */
exports.sendManualReminder = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      // Simple custom auth header check or use Firebase ID Token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Unauthorized. Missing admin bearer token." });
      }

      const idToken = authHeader.split('Bearer ')[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        // Fallback: in local testing or missing configurations, we can mock it
        if (process.env.FUNCTIONS_EMULATOR === 'true' && idToken === 'mock-admin-token') {
          decodedToken = { email: 'admin@restaurantos.in' };
        } else {
          return res.status(401).json({ error: "Unauthorized. Invalid bearer token." });
        }
      }

      // Check admin email authorization
      if (decodedToken.email !== 'admin@restaurantos.in') {
        return res.status(403).json({ error: "Forbidden. Access restricted to master administrator email." });
      }

      const { restaurantId, templateType } = req.body || {};
      if (!restaurantId || !templateType) {
        return res.status(400).json({ error: "Missing restaurantId or templateType parameters." });
      }

      const restSnap = await db.collection('restaurants').doc(restaurantId).get();
      if (!restSnap.exists) {
        return res.status(404).json({ error: "Restaurant not found." });
      }

      const rest = restSnap.data();
      const ownerName = rest.ownerName || 'Valued Partner';
      const ownerEmail = rest.ownerEmail || 'support@restaurantos.in'; // Fallback
      const restName = rest.name || 'Your Restaurant';
      const expiryDate = rest.expiryDate || 'N/A';

      // Define email templates based on type
      let subject = '';
      let text = '';

      if (templateType === 'trial_expiry') {
        subject = `Action Required: Your RestaurantOS Trial is Expiring Soon`;
        text = `Hi ${ownerName},\n\nWe hope you are enjoying using RestaurantOS to manage ${restName}.\n\nThis is a friendly reminder that your free trial is scheduled to expire on ${expiryDate}. To continue processing digital orders and table bills seamlessly, please renew your subscription today.\n\nBest Regards,\nRestaurantOS Team`;
      } else if (templateType === 'grace_period') {
        subject = `Urgent: Action Required to Keep Your RestaurantOS Billing Active`;
        text = `Hi ${ownerName},\n\nYour RestaurantOS plan for ${restName} has expired, and your account is currently in the 15-day grace period. Please renew immediately to avoid disruption and account suspension.\n\nBest Regards,\nRestaurantOS Team`;
      } else if (templateType === 'suspended') {
        subject = `Important Notice: Your RestaurantOS Account Has Been Suspended`;
        text = `Hi ${ownerName},\n\nYour RestaurantOS account for ${restName} has been suspended due to non-payment. Your diners will not be able to scan QR codes and place orders. Please clear your dues or contact customer support to reactivate your dashboard access.\n\nBest Regards,\nRestaurantOS Team`;
      } else {
        subject = `Update from RestaurantOS`;
        text = `Hi ${ownerName},\n\nThis is a notification update regarding your RestaurantOS subscription for ${restName}.\n\nBest Regards,\nRestaurantOS Team`;
      }

      // Initialize nodemailer transporter using environment variables (e.g. SMTP config)
      const smtpUser = process.env.SMTP_USER || 'admin@restaurantos.in';
      const smtpPass = process.env.SMTP_PASS || 'masteradmin2026';
      
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      const mailOptions = {
        from: smtpUser,
        to: ownerEmail,
        subject: subject,
        text: text
      };

      // In real-world, dynamic EmailJS template variables can also be sent via fetch
      // Here, nodemailer handles standard SMTP transport, which is highly robust.
      await transporter.sendMail(mailOptions);
      console.log(`Alert email sent successfully to ${ownerEmail} for ${restaurantId}`);

      return res.status(200).json({ success: true, message: `Email alert sent successfully to ${ownerEmail}` });
    } catch (error) {
      console.error("Error sending reminder:", error);
      return res.status(500).json({ error: error.message });
    }
  });
});
