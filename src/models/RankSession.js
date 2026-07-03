import mongoose from 'mongoose';

const duelSchema = new mongoose.Schema(
  {
    round: Number,
    stage: { type: String, enum: ['grupos', 'mata-mata'], default: 'mata-mata' },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' },
    loser: { type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const rankSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rank: { type: mongoose.Schema.Types.ObjectId, ref: 'Rank', required: true, index: true },
    status: { type: String, enum: ['in_progress', 'finished'], default: 'in_progress', index: true },

    mode: { type: String, enum: ['elimination', 'tournament'], default: 'elimination' },
    // fase atual (só relevante no modo torneio)
    phase: { type: String, enum: ['groups', 'knockout'], default: 'knockout' },

    currentRound: { type: Number, default: 1 },
    totalItems: { type: Number, default: 0 },
    duelsTotal: { type: Number, default: 0 },

    // ---- fase de grupos (modo torneio) ----
    groups: [
      {
        _id: false,
        name: String, // "A", "B", ...
        items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' }],
      },
    ],
    // agenda fixa de confrontos da fase de grupos (todos contra todos, por grupo)
    groupSchedule: [
      {
        _id: false,
        group: Number,
        a: { type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' },
        b: { type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' },
        winner: { type: mongoose.Schema.Types.ObjectId, ref: 'RankItem', default: null },
      },
    ],
    groupDuelIndex: { type: Number, default: 0 },

    // fila embaralhada da rodada atual (confrontos: pool[0] vs pool[1])
    pool: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' }],
    // vencedores da rodada atual
    winners: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' }],
    // eliminados: ordem de eliminação + rodada (para o ranking final)
    eliminated: [
      {
        _id: false,
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' },
        round: Number,
        order: Number,
      },
    ],

    history: [duelSchema],
    finalRanking: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RankItem' }],
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('RankSession', rankSessionSchema);
