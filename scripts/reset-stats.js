// Uso: node scripts/reset-stats.js
// Apaga todas as sessões e zera as estatísticas dos itens (mantém os itens).
import 'dotenv/config';
import mongoose from 'mongoose';
import RankItem from '../src/models/RankItem.js';
import RankSession from '../src/models/RankSession.js';
import Rank from '../src/models/Rank.js';

await mongoose.connect(process.env.MONGO_URI);

const sessions = await RankSession.deleteMany({});
const items = await RankItem.updateMany(
  {},
  {
    $set: {
      stats: {
        timesRanked: 0,
        winCount: 0,
        duelsPlayed: 0,
        duelWins: 0,
        elo: 1000,
        sumPositions: 0,
      },
    },
  }
);
const ranks = await Rank.updateMany(
  {},
  { $set: { 'stats.sessionsCount': 0, 'stats.lastSessionAt': null } }
);

console.log(`Sessões apagadas: ${sessions.deletedCount}`);
console.log(`Itens zerados (ELO=1000): ${items.modifiedCount}`);
console.log(`Ranks zerados: ${ranks.modifiedCount}`);

await mongoose.disconnect();
