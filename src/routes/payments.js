import { Router } from 'express';
import { db } from '../firebaseAdmin.js';
import { verifyToken } from '../middleware/auth.js';
import { createTranzUPIOrder, extractPaymentFields } from '../tranzupi.js';

const router = Router();

router.post('/create', verifyToken, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });

    const productSnap = await db.collection('products').doc(productId).get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });

    const product = productSnap.data();
    if (!product.published) return res.status(400).json({ error: 'Product not for sale' });

    const amount = Number(product.price);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid product price' });
    }

    const purchaseId = `${req.user.uid}_${productId}`;
    const existingPurchase = await db.collection('purchases').doc(purchaseId).get();
    if (existingPurchase.exists && existingPurchase.data().status === 'paid') {
      return res.status(400).json({
        error: 'You already own this product',
        alreadyPurchased: true,
      });
    }

    const orderRef = db.collection('orders').doc();
    const orderId = orderRef.id;

    await orderRef.set({
      uid: req.user.uid,
      email: req.user.email || null,
      productId,
      productTitle: product.title,
      amount,
      status: 'pending',
      paymentReference: null,
      createdAt: new Date(),
    });

    const baseFrontend = (process.env.FRONTEND_URL || '').split(',')[0].trim();
    const redirectUrl = baseFrontend ? `${baseFrontend}/#/my-downloads?order=${orderId}` : `https://localhost/#/my-downloads?order=${orderId}`;

    let upiResponse;
    try {
      upiResponse = await createTranzUPIOrder({
        amount,
        orderId,
        redirectUrl,
        customerMobile: req.user.phone_number || undefined,
        remark1: productId,
        remark2: req.user.uid,
      });
    } catch (gatewayErr) {
      console.error('TranzUPI create-order failed:', gatewayErr.message);
      await orderRef.update({ status: 'failed' });
      return res.status(502).json({ error: 'Payment gateway unavailable. Please retry.' });
    }

    const { paymentUrl, qrString } = extractPaymentFields(upiResponse);

    if (!paymentUrl && !qrString) {
      console.error('TranzUPI returned no usable fields:', JSON.stringify(upiResponse));
      await orderRef.update({ status: 'failed' });
      return res.status(502).json({ error: 'Payment gateway did not return payment details' });
    }

    await orderRef.update({
      paymentUrl: paymentUrl || null,
      qrString: qrString || null,
      gatewayResponse: {
        paymentUrl: paymentUrl || null,
        hasQr: !!qrString,
        gatewayRaw: JSON.stringify(upiResponse).slice(0, 500),
      },
      updatedAt: new Date(),
    });

    res.json({
      orderId,
      amount,
      qrString: qrString || null,
      paymentUrl: paymentUrl || null,
    });
  } catch (err) {
    console.error('POST /api/payments/create error:', err.message);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

export default router;
