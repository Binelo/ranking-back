import { Router } from 'express';
import Comment from '../models/Comment.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/comments?rank=:rankId
router.get('/', async (req, res, next) => {
  try {
    if (!req.query.rank) return res.status(400).json({ error: 'Parâmetro rank é obrigatório' });
    const comments = await Comment.find({ rank: req.query.rank })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('author', 'username');
    res.json({ comments });
  } catch (err) {
    next(err);
  }
});

// POST /api/comments  { rank, text }
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const comment = await Comment.create({ rank: req.body.rank, text: req.body.text, author: req.userId });
    await comment.populate('author', 'username');
    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/comments/:id (apenas autor)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });
    if (String(comment.author) !== req.userId) return res.status(403).json({ error: 'Sem permissão' });
    await comment.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
