import { Router } from 'express';
import { db } from '../firebaseAdmin.js';
import { verifyToken, verifyAdmin } from '../middleware/auth.js';

const router = Router();

router.use(verifyToken, verifyAdmin);

router.get('/products', async (_req, res) => {
  try {
    const [productsSnap, privateSnap] = await Promise.all([
      db.collection('products').get(),
      db.collection('productPrivate').get(),
    ]);

    const privateMap = {};
    privateSnap.docs.forEach((d) => {
      privateMap[d.id] = d.data();
    });

    const products = productsSnap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
        driveFileId: privateMap[d.id]?.driveFileId || '',
      }))
      .sort((a, b) => {
        const at = a.createdAt?.seconds || 0;
        const bt = b.createdAt?.seconds || 0;
        return bt - at;
      });

    res.json(products);
  } catch (err) {
    console.error('GET /api/admin/products error:', err.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

router.post('/products', async (req, res) => {
  try {
    const {
      title,
      description,
      price,
      category,
      imageUrl,
      sampleUrl,
      driveFileId,
      published,
    } = req.body;

    if (!title || !price || !category || !driveFileId) {
      return res.status(400).json({
        error: 'title, price, category and driveFileId are required',
      });
    }

    const productRef = db.collection('products').doc();
    const productId = productRef.id;

    const batch = db.batch();

    batch.set(productRef, {
      title: String(title).trim(),
      description: String(description || '').trim(),
      price: Number(price),
      category: String(category).trim(),
      imageUrl: String(imageUrl || '').trim(),
      sampleUrl: String(sampleUrl || '').trim(),
      published: published === true || published === 'true',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    batch.set(db.collection('productPrivate').doc(productId), {
      driveFileId: String(driveFileId).trim(),
      createdAt: new Date(),
    });

    await batch.commit();

    res.status(201).json({ id: productId, success: true });
  } catch (err) {
    console.error('POST /api/admin/products error:', err.message);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      price,
      category,
      imageUrl,
      sampleUrl,
      driveFileId,
      published,
    } = req.body;

    const productRef = db.collection('products').doc(id);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });

    const updateData = {
      title: String(title || '').trim(),
      description: String(description || '').trim(),
      price: Number(price),
      category: String(category || '').trim(),
      imageUrl: String(imageUrl || '').trim(),
      sampleUrl: String(sampleUrl || '').trim(),
      published: published === true || published === 'true',
      updatedAt: new Date(),
    };

    if (!updateData.title || !updateData.price || !updateData.category) {
      return res.status(400).json({ error: 'title, price, category required' });
    }

    const batch = db.batch();
    batch.update(productRef, updateData);

    if (driveFileId && String(driveFileId).trim()) {
      batch.set(
        db.collection('productPrivate').doc(id),
        {
          driveFileId: String(driveFileId).trim(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    res.json({ id, success: true });
  } catch (err) {
    console.error('PUT /api/admin/products/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mode = req.query.mode || 'hard';

    const productRef = db.collection('products').doc(id);
    const snap = await productRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Product not found' });

    if (mode === 'unpublish') {
      await productRef.update({ published: false, updatedAt: new Date() });
      return res.json({ id, mode: 'unpublish', success: true });
    }

    const batch = db.batch();
    batch.delete(productRef);
    batch.delete(db.collection('productPrivate').doc(id));
    await batch.commit();

    res.json({ id, mode: 'hard', success: true });
  } catch (err) {
    console.error('DELETE /api/admin/products/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

router.get('/orders', async (_req, res) => {
  try {
    const snap = await db
      .collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    const orders = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        uid: data.uid,
        email: data.email || null,
        productId: data.productId,
        productTitle: data.productTitle || null,
        amount: data.amount,
        status: data.status,
        paymentReference: data.paymentReference || null,
        createdAt: data.createdAt,
        paidAt: data.paidAt || null,
      };
    });

    res.json(orders);
  } catch (err) {
    console.error('GET /api/admin/orders error:', err.message);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

router.get('/stats', async (_req, res) => {
  try {
    const ordersSnap = await db.collection('orders').get();
    const productsSnap = await db.collection('products').get();

    let totalRevenue = 0;
    let paidOrders = 0;
    let pendingOrders = 0;
    let failedOrders = 0;

    ordersSnap.forEach((d) => {
      const o = d.data();
      if (o.status === 'paid') {
        paidOrders++;
        totalRevenue += Number(o.amount) || 0;
      } else if (o.status === 'pending') {
        pendingOrders++;
      } else if (o.status === 'failed') {
        failedOrders++;
      }
    });

    res.json({
      totalRevenue,
      paidOrders,
      pendingOrders,
      failedOrders,
      totalOrders: ordersSnap.size,
      totalProducts: productsSnap.size,
    });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export default router;
