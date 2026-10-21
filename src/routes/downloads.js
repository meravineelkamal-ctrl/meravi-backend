import { Router } from 'express';
import { db } from '../firebaseAdmin.js';
import { verifyToken } from '../middleware/auth.js';
import { streamDriveFile } from '../drive.js';

const router = Router();

router.get('/:productId', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const uid = req.user.uid;

    if (!productId) return res.status(400).json({ error: 'productId required' });

    const purchaseId = `${uid}_${productId}`;
    const purchaseSnap = await db.collection('purchases').doc(purchaseId).get();

    if (!purchaseSnap.exists) {
      return res.status(403).json({ error: 'Purchase required' });
    }

    const purchase = purchaseSnap.data();
    if (purchase.status !== 'paid') {
      return res.status(403).json({ error: 'Payment not confirmed' });
    }
    if (purchase.uid !== uid) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const privateSnap = await db.collection('productPrivate').doc(productId).get();
    if (!privateSnap.exists) {
      return res.status(404).json({ error: 'File not configured' });
    }

    const { driveFileId } = privateSnap.data();
    if (!driveFileId) {
      return res.status(500).json({ error: 'File ID missing' });
    }

    console.log(`Download granted: uid=${uid} product=${productId}`);
    await streamDriveFile(driveFileId, res);
  } catch (err) {
    console.error('Download error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

export default router;
