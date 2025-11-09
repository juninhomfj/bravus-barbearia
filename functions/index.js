
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Stripe setup (uses functions config or environment variables). If not configured, stripe will be null.
let stripe = null;
const stripeSecret = functions.config()?.stripe?.secret ?? process.env.STRIPE_SECRET;
const stripeWebhookSecret = functions.config()?.stripe?.webhook_secret ?? process.env.STRIPE_WEBHOOK_SECRET;
if (stripeSecret) {
  const Stripe = require('stripe');
  stripe = Stripe(stripeSecret);
}

// Agendado: executa diariamente e encerra trials expirados
exports.expireTrials = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  const now = admin.firestore.Timestamp.now();
  const usersRef = db.collection('barbeiros');
  const q = usersRef.where('plan', '==', 'trial').where('trialEnd', '<=', now);
  const snaps = await q.get();
  if (snaps.empty) {
    console.log('No trials to expire.');
    return { expired: 0 };
  }
  const batch = db.batch();
  snaps.forEach(doc => {
    const ref = doc.ref;
    batch.update(ref, { plan: 'free', isPremium: false, trialStart: null, trialEnd: null });
  });
  await batch.commit();
  console.log(`Expired ${snaps.size} trials.`);
  return { expired: snaps.size };

});

// Helper: check platform config in Firestore to see if Stripe is enabled
const isStripeEnabled = async () => {
  try {
    const cfg = await db.doc('platform/config').get();
    return cfg.exists && cfg.data().stripeEnabled === true;
  } catch (err) {
    console.warn('Error reading platform/config:', err);
    return false;
  }
};

// HTTP endpoint para criar uma Checkout Session (ativa apenas se platform/config.stripeEnabled === true)
exports.createCheckoutSession = functions.https.onRequest(async (req, res) => {
  try {
    const enabled = await isStripeEnabled();
    if (!enabled) return res.status(403).json({ error: 'Stripe integration is disabled on this platform.' });

    if (!stripe) return res.status(503).json({ error: 'Stripe not configured on server.' });

    const { userId, priceId, successUrl, cancelUrl } = req.body || {};
    if (!userId || !priceId || !successUrl || !cancelUrl) return res.status(400).json({ error: 'Missing required fields: userId, priceId, successUrl, cancelUrl' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });

    return res.json({ ok: true, sessionId: session.id, checkoutUrl: session.url });
  } catch (err) {
    console.error('createCheckoutSession error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Webhook para receber eventos Stripe — valida assinatura se webhook secret configurado
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  let event = req.body;
  try {
    if (stripeWebhookSecret) {
      const sig = req.headers['stripe-signature'];
      try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret);
      } catch (err) {
        console.error('Webhook signature verification failed.', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session?.metadata?.userId;
      if (userId) {
        await db.collection('barbeiros').doc(userId).set({ plan: 'premium', isPremium: true }, { merge: true });
        console.log('Promoted user to premium via webhook:', userId);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
});

// Callable function: promote a user to premium (only admin callers allowed)
exports.promoteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Request has no auth context');
  const callerUid = context.auth.uid;
  const callerDoc = await db.collection('barbeiros').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) throw new functions.https.HttpsError('permission-denied', 'Caller is not admin');
  const targetUid = data?.targetUid;
  if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'Missing targetUid');
  await db.collection('barbeiros').doc(targetUid).set({ plan: 'premium', isPremium: true }, { merge: true });
  return { ok: true };
});

// Callable function: demote user to free (admin-only)
exports.demoteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Request has no auth context');
  const callerUid = context.auth.uid;
  const callerDoc = await db.collection('barbeiros').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) throw new functions.https.HttpsError('permission-denied', 'Caller is not admin');
  const targetUid = data?.targetUid;
  if (!targetUid) throw new functions.https.HttpsError('invalid-argument', 'Missing targetUid');
  await db.collection('barbeiros').doc(targetUid).set({ plan: 'free', isPremium: false, trialStart: null, trialEnd: null }, { merge: true });
  return { ok: true };
});

// Callable function: update platform config (admin-only)
exports.updatePlatformConfig = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Request has no auth context');
  const callerUid = context.auth.uid;
  const callerDoc = await db.collection('barbeiros').doc(callerUid).get();
  if (!callerDoc.exists || !callerDoc.data().isAdmin) throw new functions.https.HttpsError('permission-denied', 'Caller is not admin');
  const payload = data?.payload;
  if (!payload) throw new functions.https.HttpsError('invalid-argument', 'Missing payload');
  await db.doc('platform/config').set(payload, { merge: true });
  return { ok: true };
});
