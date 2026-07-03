import { Router } from 'express';
import mongoose from 'mongoose';
import RankItem from '../models/RankItem.js';

const router = Router();

// GET /api/stats/items?by=champions|avgPosition|mostUsed|winRate&category=&limit=
router.get('/items', async (req, res, next) => {
  try {
    const { by = 'champions', category, limit = 25 } = req.query;

    const match = { 'stats.timesRanked': { $gte: 1 } };
    if (category) match.categories = new mongoose.Types.ObjectId(String(category));

    if (by === 'avgPosition' || by === 'winRate') {
      // calculados: usa agregação
      const pipeline = [
        { $match: match },
        {
          $addFields: {
            avgPosition: { $divide: ['$stats.sumPositions', '$stats.timesRanked'] },
            winRate: {
              $cond: [
                { $gt: ['$stats.duelsPlayed', 0] },
                { $multiply: [{ $divide: ['$stats.duelWins', '$stats.duelsPlayed'] }, 100] },
                0,
              ],
            },
          },
        },
        { $sort: by === 'avgPosition' ? { avgPosition: 1 } : { winRate: -1 } },
        { $limit: Number(limit) },
        { $project: { name: 1, image: 1, type: 1, stats: 1, avgPosition: 1, winRate: 1 } },
      ];
      const items = await RankItem.aggregate(pipeline);
      return res.json({ items });
    }

    const sortMap = {
      champions: { 'stats.winCount': -1 },
      mostUsed: { 'stats.timesRanked': -1 },
    };
    const items = await RankItem.find(match)
      .sort(sortMap[by] || sortMap.champions)
      .limit(Number(limit))
      .select('name image type stats');
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

export default router;
