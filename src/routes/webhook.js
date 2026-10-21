import { Router } from 'express';
import { db } from '../firebaseAdmin.js';
import { checkTranzUPIStatus, extractStatusFields } from '../tranzupi.js';

const router = Router();

router.post('/', async (req, res) => {
  const requestId = Date.now().toString(36);

  try {
    const body = req.body || {};
    const orderId = body.order_id || body.orderId;

    if (!orderId) {
      console.warn(`[${requestId}] Webhook missing order_id`);
      return res.status(400).send('order_id missing');
    }

    console.log(`[${requestId}] Webhook received for order: ${orderId}`);

    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      console.warn(`[${requestId}] Order not found: ${orderId}`);
      return res.status(404).send('Order not found');
    }

    const order = orderSnap.data();

    if (order.status === 'paid') {
      console.log(`[${requestId}] Order already paid — idempotent response`);
      return res.status(200).send('Already processed');
    }

    let statusData;
    try {
      const raw = await checkTranzUPIStatus(orderId);
      statusData = extractStatusFields(raw);
    } catch (verifyErr) {
      console.error(`[${requestId}] TranzUPI verify failed:`, verifyErr.message);
      return res.status(502).send('Verification failed');
    }

    const { status, amount, utr } = statusData;
    const expectedAmount = Number(order.amount);

    console.log(`[${requestId}] Gateway status: ${status}, amount: ${amount}, expected: ${expectedAmount}`);

    const SUCCESS_STATUSES = ['SUCCESS', 'PAID', 'COMPLETED', '1', 'TRUE'];
    const statusOk = SUCCESS_STATUSES.includes(status);
    const amountOk = Math.abs(amount - expectedAmount) < 0.01;

    if (!statusOk || !amountOk) {
      console.warn(`[${requestId}] Payment verification failed (statusOk=${statusOk}, amountOk=${amountOk})`);
      await orderRef.update({
        status: 'failed',
        verifiedAt: new Date(),
        verificationError: `status=${status}, amount=${amount}`,
      });
      return res.status(200).send('Payment not successful');
    }

    const productSnap = await db.collection('products').doc(order.productId).get();
    const productTitle = productSnap.exists ? (productSnap.data().title || 'PDF') : 'PDF';

    const purchaseId = `${order.uid}_${order.productId}`;
    const batch = db.batch();

    batch.update(orderRef, {
      status: 'paid',
      paymentReference: utr || body.utr || null,
      paidAt: new Date(),
      verifiedAt: new Date(),
    });

    batch.set(
      db.collection('purchases').doc(purchaseId),
      {
        uid: order.uid,
        email: order.email || null,
        productId: order.productId,
        title: productTitle,
        amount: order.amount,
        status: 'paid',
        orderId,
        createdAt: new Date(),
      },
      { merge: true }
    );

    await batch.commit();

    console.log(`[${requestId}] ✅ Order ${orderId} marked paid. Purchase ${purchaseId} created.`);
    res.status(200).send('OK');
  } catch (err) {
    console.error(`[${requestId}] Webhook error:`, err.message);
    res.status(500).send('Webhook processing failed');
  }
});

export default router;
