import { Router } from 'express';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const s3Enabled = () => !!(process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID);

let s3;
function client() {
  if (!s3) s3 = new S3Client({ region: process.env.AWS_REGION });
  return s3;
}

// GET /api/upload/status
router.get('/status', (_req, res) => res.json({ s3Enabled: s3Enabled() }));

// POST /api/upload/presign  { fileName, contentType }
// Retorna URL pré-assinada para o client fazer PUT direto no S3
router.post('/presign', requireAuth, async (req, res, next) => {
  try {
    if (!s3Enabled()) return res.status(400).json({ error: 'Upload S3 não configurado. Use uma URL de imagem.' });

    const { fileName = 'image', contentType = 'image/jpeg' } = req.body;
    if (!/^image\//.test(contentType)) return res.status(400).json({ error: 'Apenas imagens são permitidas' });

    const ext = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `items/${req.userId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(client(), command, { expiresIn: 300 });

    const base = process.env.S3_PUBLIC_URL || `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    res.json({ uploadUrl, publicUrl: `${base}/${key}` });
  } catch (err) {
    next(err);
  }
});

export default router;
