import mongoose from 'mongoose';

export const ITEM_TYPES = ['musica', 'filme', 'serie', 'anime', 'jogo', 'personagem', 'carro', 'comida', 'livro', 'outro'];

const rankItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Nome é obrigatório'], trim: true, index: true },
    image: { type: String, default: '' }, // URL (externa ou S3)
    type: { type: String, enum: ITEM_TYPES, default: 'outro', index: true },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category', index: true }],
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // campos dinâmicos por tipo
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Estatísticas globais
    stats: {
      timesRanked: { type: Number, default: 0 }, // sessões concluídas em que participou
      winCount: { type: Number, default: 0 }, // vezes campeão
      duelsPlayed: { type: Number, default: 0 },
      duelWins: { type: Number, default: 0 },
      elo: { type: Number, default: 1000, index: true },
      sumPositions: { type: Number, default: 0 }, // para posição média
    },
  },
  { timestamps: true }
);

rankItemSchema.virtual('stats.averageRankPosition').get(function () {
  return this.stats.timesRanked ? +(this.stats.sumPositions / this.stats.timesRanked).toFixed(2) : null;
});
rankItemSchema.virtual('stats.winRate').get(function () {
  return this.stats.duelsPlayed ? +((this.stats.duelWins / this.stats.duelsPlayed) * 100).toFixed(2) : null;
});

rankItemSchema.set('toJSON', { virtuals: true });
rankItemSchema.index({ name: 'text' });

export default mongoose.model('RankItem', rankItemSchema);
