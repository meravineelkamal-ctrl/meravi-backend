import { Router } from 'express';
import { db } from '../firebaseAdmin.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.post('/create', verifyToken, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId required' });

    const productSnap = await db.collection('products').doc(productId).get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });

    const product = productSnap.data();
    if (!product.published) return res.status(400).json({ error: 'Product not available' });

    const orderRef = db.collection('orders').doc();
    await orderRef.set({
      uid: req.user.uid,
      email: req.user.email || null,
      productId,
      productTitle: product.title,
      amount: product.price,
      status: 'pending',
      paymentReference: null,
      createdAt: new Date(),
    });

    res.json({
      orderId: orderRef.id,
      amount: product.price,
    });
  } catch (err) {
    console.error('POST /api/orders/create error:', err.message);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.get('/:id/status', verifyToken, async (req, res) => {
  try {
    const snap = await db.collection('orders').doc(req.params.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Order not found' });

    const order = snap.data();
    if (order.uid !== req.user.uid) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      orderId: snap.id,
      status: order.status,
      amount: order.amount,
      productId: order.productId,
      createdAt: order.createdAt,
      paidAt: order.paidAt || null,
    });
  } catch (err) {
    console.error('GET /api/orders/:id/status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch order status' });
  }
});

export default router;
