import { Router } from 'express';
import Rank from '../models/Rank.js';
import RankItem from '../models/RankItem.js';
import RankSession from '../models/RankSession.js';
import { requireAuth } from '../middleware/auth.js';
import { shuffle } from '../utils/shuffle.js';

const router = Router();

const ITEM_FIELDS = 'name image type metadata';
const GROUP_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Modos:
 * - elimination: mata-mata direto. pool embaralhado, duelo = pool[0] vs pool[1],
 *   vencedor -> winners, perdedor eliminado. Rodadas até sobrar 1.
 * - tournament: fase de grupos (pontos corridos, todos contra todos dentro do
 *   grupo) + mata-mata com os 2 melhores de cada grupo. Resultado mais confiável:
 *   cada item duela várias vezes antes de poder ser eliminado.
 */

// ---------- mata-mata (comum aos dois modos) ----------

// Avança byes e rodadas até haver um duelo válido ou a sessão terminar
function normalize(session) {
  for (;;) {
    if (session.pool.length === 1) {
      session.winners.push(session.pool[0]);
      session.pool = [];
    }
    if (session.pool.length === 0) {
      if (session.winners.length === 1) {
        finish(session);
        return;
      }
      if (session.winners.length === 0) return;
      session.pool = shuffle(session.winners.map(String));
      session.winners = [];
      session.currentRound += 1;
      continue;
    }
    return;
  }
}

function finish(session) {
  session.status = 'finished';
  session.finishedAt = new Date();
  const champion = session.winners[0];
  // campeão, depois eliminados do último para o primeiro
  const eliminatedSorted = [...session.eliminated].sort((a, b) => b.order - a.order);
  session.finalRanking = [champion, ...eliminatedSorted.map((e) => e.item)];
  session.winners = [];
}

// ---------- fase de grupos (modo torneio) ----------

function makeGroups(itemIds) {
  const shuffled = shuffle(itemIds);
  const n = shuffled.length;
  let numGroups = Math.max(1, Math.round(n / 4));
  while (numGroups > 1 && n / numGroups < 3) numGroups -= 1; // grupos de no mínimo 3
  const buckets = Array.from({ length: numGroups }, () => []);
  shuffled.forEach((id, i) => buckets[i % numGroups].push(id));
  return buckets.map((items, i) => ({ name: GROUP_NAMES[i] || String(i + 1), items }));
}

function makeSchedule(groups) {
  const schedule = [];
  groups.forEach((group, gi) => {
    const pairs = [];
    for (let i = 0; i < group.items.length; i++) {
      for (let j = i + 1; j < group.items.length; j++) {
        pairs.push({ group: gi, a: group.items[i], b: group.items[j], winner: null });
      }
    }
    schedule.push(...shuffle(pairs)); // grupos jogados em sequência (A, depois B…)
  });
  return schedule;
}

// Id como string, mesmo se o campo estiver populado (String(doc) não retorna o id)
const idOf = (v) => String(v?._id ?? v);

// Classificação de um grupo: vitórias; empate a dois decidido pelo confronto direto
function standingsOf(session, gi) {
  const group = session.groups[gi];
  const wins = new Map(group.items.map((id) => [idOf(id), 0]));
  const beat = new Map(); // vencedor -> Set(perdedores)
  for (const d of session.groupSchedule) {
    if (d.group !== gi || !d.winner) continue;
    const w = idOf(d.winner);
    const l = w === idOf(d.a) ? idOf(d.b) : idOf(d.a);
    wins.set(w, (wins.get(w) || 0) + 1);
    if (!beat.has(w)) beat.set(w, new Set());
    beat.get(w).add(l);
  }
  const ids = group.items.map(idOf);
  ids.sort((x, y) => {
    const dw = (wins.get(y) || 0) - (wins.get(x) || 0);
    if (dw) return dw;
    if (beat.get(x)?.has(y)) return -1; // confronto direto
    if (beat.get(y)?.has(x)) return 1;
    return 0;
  });
  return ids.map((id) => ({ item: id, wins: wins.get(id) || 0 }));
}

const QUALIFIED_PER_GROUP = 2;

// Fim da fase de grupos: monta o mata-mata e ranqueia os não classificados
function buildKnockout(session) {
  const numGroups = session.groups.length;
  const firsts = [];
  const seconds = [];
  const restByPosition = []; // restByPosition[0] = terceiros, [1] = quartos…

  for (let gi = 0; gi < numGroups; gi++) {
    const st = standingsOf(session, gi);
    firsts.push(st[0].item);
    if (st[1]) seconds.push(st[1].item);
    st.slice(QUALIFIED_PER_GROUP).forEach((row, pi) => {
      if (!restByPosition[pi]) restByPosition[pi] = [];
      restByPosition[pi].push(row);
    });
  }

  // não classificados entram em `eliminated` do pior para o melhor
  // (round 0 = fase de grupos; order menor = posição final pior)
  for (let pi = restByPosition.length - 1; pi >= 0; pi--) {
    const sorted = [...restByPosition[pi]].sort((a, b) => a.wins - b.wins);
    for (const row of sorted) {
      session.eliminated.push({ item: row.item, round: 0, order: session.eliminated.length + 1 });
    }
  }

  // chaveamento: 1º do grupo i vs 2º do grupo i+1 (evita reencontro imediato)
  const pool = [];
  if (numGroups === 1) {
    pool.push(firsts[0], seconds[0]);
  } else {
    for (let i = 0; i < numGroups; i++) {
      pool.push(firsts[i]);
      if (seconds.length) pool.push(seconds[(i + 1) % numGroups]);
    }
  }

  session.pool = pool;
  session.phase = 'knockout';
  session.currentRound = 1;
  normalize(session);
}

// ---------- helpers ----------

// Estado mutável de um pick — tudo que precisa ser restaurado num undo.
// (groups e groupSchedule não entram: só o campo winner do duelo muda,
// e ele é limpo diretamente no undo.)
function snapshotOf(session) {
  return {
    status: session.status,
    phase: session.phase,
    currentRound: session.currentRound,
    groupDuelIndex: session.groupDuelIndex,
    pool: session.pool.map(String),
    winners: session.winners.map(String),
    eliminated: session.eliminated.map((e) => ({ item: String(e.item), round: e.round, order: e.order })),
    finalRanking: session.finalRanking.map(String),
    finishedAt: session.finishedAt,
  };
}

function restoreSnapshot(session, snap) {
  session.status = snap.status;
  session.phase = snap.phase;
  session.currentRound = snap.currentRound;
  session.groupDuelIndex = snap.groupDuelIndex;
  session.pool = snap.pool;
  session.winners = snap.winners;
  session.eliminated = snap.eliminated;
  session.finalRanking = snap.finalRanking;
  session.finishedAt = snap.finishedAt;
}

function progressOf(session) {
  const total = session.duelsTotal || Math.max(session.totalItems - 1, 0);
  return { duelsDone: session.history.length, duelsTotal: total };
}

function currentGroupDuel(session) {
  return session.mode === 'tournament' && session.phase === 'groups'
    ? session.groupSchedule[session.groupDuelIndex] || null
    : null;
}

async function sessionPayload(session) {
  await session.populate([
    { path: 'rank', select: 'title description creator' },
    { path: 'pool', select: ITEM_FIELDS },
    { path: 'finalRanking', select: ITEM_FIELDS },
    { path: 'history.winner', select: 'name image' },
    { path: 'history.loser', select: 'name image' },
    { path: 'groups.items', select: 'name image' },
    { path: 'groupSchedule.a', select: ITEM_FIELDS },
    { path: 'groupSchedule.b', select: ITEM_FIELDS },
  ]);

  const json = session.toJSON();

  // duelo atual
  if (session.status !== 'in_progress') {
    json.currentDuel = null;
  } else if (session.mode === 'tournament' && session.phase === 'groups') {
    const duel = json.groupSchedule[json.groupDuelIndex];
    json.currentDuel = duel ? [duel.a, duel.b] : null;
    json.currentGroupName = duel ? json.groups[duel.group]?.name : null;
  } else {
    json.currentDuel = json.pool?.length >= 2 ? [json.pool[0], json.pool[1]] : null;
  }

  // classificação dos grupos (modo torneio)
  if (session.mode === 'tournament' && session.groups.length) {
    const itemById = new Map();
    for (const g of json.groups) for (const item of g.items) itemById.set(String(item._id), item);
    json.groupTables = session.groups.map((g, gi) => ({
      name: json.groups[gi].name,
      standings: standingsOf(session, gi).map((row, idx) => ({
        item: itemById.get(row.item) || { _id: row.item },
        wins: row.wins,
        qualifies: idx < QUALIFIED_PER_GROUP,
      })),
      duelsDone: session.groupSchedule.filter((d) => d.group === gi && d.winner).length,
      duelsTotal: session.groupSchedule.filter((d) => d.group === gi).length,
    }));
  }

  json.progress = progressOf(session);
  json.canUndo = session.history.length > 0 && !!session.undoState;
  delete json.undoState;
  delete json.pool; // não expõe a ordem futura (evita spoiler)
  delete json.groupSchedule;
  delete json.groups;
  return json;
}

// ---------- rotas ----------

// POST /api/sessions  { rankId, mode? }  mode: 'elimination' (padrão) | 'tournament'
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const mode = req.body.mode === 'tournament' ? 'tournament' : 'elimination';
    const rank = await Rank.findById(req.body.rankId).select('items');
    if (!rank) return res.status(404).json({ error: 'Rank não encontrado' });
    if (rank.items.length < 2) return res.status(400).json({ error: 'O rank precisa de pelo menos 2 itens' });
    if (mode === 'tournament' && rank.items.length < 4) {
      return res.status(400).json({ error: 'O modo torneio precisa de pelo menos 4 itens' });
    }

    const session = new RankSession({
      user: req.userId,
      rank: rank._id,
      mode,
      totalItems: rank.items.length,
    });

    if (mode === 'tournament') {
      session.phase = 'groups';
      session.groups = makeGroups(rank.items.map(String));
      session.groupSchedule = makeSchedule(session.groups);
      const qualifiers = session.groups.length === 1 ? 2 : session.groups.length * QUALIFIED_PER_GROUP;
      session.duelsTotal = session.groupSchedule.length + (qualifiers - 1);
    } else {
      session.pool = shuffle(rank.items.map(String));
      session.duelsTotal = rank.items.length - 1;
      normalize(session);
    }

    await session.save();
    res.status(201).json({ session: await sessionPayload(session) });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions/mine?status=&rank=
router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const filter = { user: req.userId };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.rank) filter.rank = req.query.rank;
    const sessions = await RankSession.find(filter)
      .sort({ updatedAt: -1 })
      .limit(50)
      .select('rank status mode phase currentRound totalItems duelsTotal finishedAt createdAt updatedAt history finalRanking')
      .populate('rank', 'title')
      .populate('finalRanking', 'name image');
    res.json({
      sessions: sessions.map((s) => {
        const j = s.toJSON();
        j.progress = progressOf(s);
        j.champion = s.status === 'finished' ? j.finalRanking?.[0] : null;
        j.finalRanking = undefined;
        j.history = undefined;
        return j;
      }),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/sessions/:id — retomar sessão (dono apenas)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await RankSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (String(session.user) !== req.userId) return res.status(403).json({ error: 'Sem permissão' });
    res.json({ session: await sessionPayload(session) });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/pick  { winnerId }
router.post('/:id/pick', requireAuth, async (req, res, next) => {
  try {
    const session = await RankSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (String(session.user) !== req.userId) return res.status(403).json({ error: 'Sem permissão' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Sessão já finalizada' });

    const winnerId = String(req.body.winnerId);
    let loserId;

    // snapshot para poder desfazer (o pick pode virar rodada/fase ou encerrar)
    session.undoState = snapshotOf(session);
    session.markModified('undoState');

    if (session.mode === 'tournament' && session.phase === 'groups') {
      // ----- duelo de fase de grupos -----
      const duel = currentGroupDuel(session);
      if (!duel) return res.status(400).json({ error: 'Nenhum duelo disponível' });
      const [a, b] = [String(duel.a), String(duel.b)];
      if (winnerId !== a && winnerId !== b) {
        return res.status(400).json({ error: 'winnerId não corresponde ao duelo atual' });
      }
      loserId = winnerId === a ? b : a;

      duel.winner = winnerId;
      session.markModified('groupSchedule');
      session.groupDuelIndex += 1;
      session.history.push({ round: 0, stage: 'grupos', winner: winnerId, loser: loserId });

      if (session.groupDuelIndex >= session.groupSchedule.length) buildKnockout(session);
    } else {
      // ----- duelo de mata-mata -----
      if (session.pool.length < 2) return res.status(400).json({ error: 'Nenhum duelo disponível' });
      const [a, b] = [String(session.pool[0]), String(session.pool[1])];
      if (winnerId !== a && winnerId !== b) {
        return res.status(400).json({ error: 'winnerId não corresponde ao duelo atual' });
      }
      loserId = winnerId === a ? b : a;

      session.pool = session.pool.slice(2);
      session.winners.push(winnerId);
      session.eliminated.push({ item: loserId, round: session.currentRound, order: session.eliminated.length + 1 });
      session.history.push({ round: session.currentRound, stage: 'mata-mata', winner: winnerId, loser: loserId });

      normalize(session);
    }

    // estatísticas de duelo + ELO (imediatas)
    // itens criados antes do campo elo existir: inicializa em 1000 antes do $inc
    await RankItem.updateMany(
      { _id: { $in: [winnerId, loserId] }, 'stats.elo': { $exists: false } },
      { $set: { 'stats.elo': 1000 } }
    );
    const K = 32;
    const [wDoc, lDoc] = await Promise.all([
      RankItem.findById(winnerId).select('stats.elo'),
      RankItem.findById(loserId).select('stats.elo'),
    ]);
    const wElo = wDoc?.stats?.elo ?? 1000;
    const lElo = lDoc?.stats?.elo ?? 1000;
    const expectedWin = 1 / (1 + 10 ** ((lElo - wElo) / 400));
    const eloDelta = Math.max(1, Math.round(K * (1 - expectedWin)));
    session.history[session.history.length - 1].eloDelta = eloDelta;

    await RankItem.bulkWrite([
      { updateOne: { filter: { _id: winnerId }, update: { $inc: { 'stats.duelsPlayed': 1, 'stats.duelWins': 1, 'stats.elo': eloDelta } } } },
      { updateOne: { filter: { _id: loserId }, update: { $inc: { 'stats.duelsPlayed': 1, 'stats.elo': -eloDelta } } } },
    ]);

    const justFinished = session.status === 'finished';
    await session.save();
    if (justFinished) await applyFinalStats(session);

    res.json({ session: await sessionPayload(session) });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessions/:id/undo — desfaz o último duelo (1 passo)
router.post('/:id/undo', requireAuth, async (req, res, next) => {
  try {
    const session = await RankSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (String(session.user) !== req.userId) return res.status(403).json({ error: 'Sem permissão' });
    if (!session.history.length || !session.undoState) {
      return res.status(400).json({ error: 'Nada para desfazer' });
    }

    const last = session.history[session.history.length - 1];
    const winnerId = String(last.winner);
    const loserId = String(last.loser);
    const eloDelta = last.eloDelta || 0;

    // se a sessão tinha acabado de terminar, reverte as estatísticas finais
    if (session.status === 'finished') await revertFinalStats(session);

    // reverte ELO e contadores de duelo
    await RankItem.bulkWrite([
      { updateOne: { filter: { _id: winnerId }, update: { $inc: { 'stats.duelsPlayed': -1, 'stats.duelWins': -1, 'stats.elo': -eloDelta } } } },
      { updateOne: { filter: { _id: loserId }, update: { $inc: { 'stats.duelsPlayed': -1, 'stats.elo': eloDelta } } } },
    ]);

    restoreSnapshot(session, session.undoState);
    if (last.stage === 'grupos' && session.groupSchedule[session.groupDuelIndex]) {
      session.groupSchedule[session.groupDuelIndex].winner = null;
      session.markModified('groupSchedule');
    }
    session.history.pop();
    session.undoState = null; // apenas 1 passo de undo
    session.markModified('undoState');

    await session.save();
    res.json({ session: await sessionPayload(session) });
  } catch (err) {
    next(err);
  }
});

async function revertFinalStats(session) {
  const ops = session.finalRanking.map((itemId, idx) => ({
    updateOne: {
      filter: { _id: itemId },
      update: {
        $inc: {
          'stats.timesRanked': -1,
          'stats.sumPositions': -(idx + 1),
          ...(idx === 0 ? { 'stats.winCount': -1 } : {}),
        },
      },
    },
  }));
  if (ops.length) await RankItem.bulkWrite(ops);
  await Rank.updateOne({ _id: session.rank }, { $inc: { 'stats.sessionsCount': -1 } });
}

async function applyFinalStats(session) {
  const ops = session.finalRanking.map((itemId, idx) => ({
    updateOne: {
      filter: { _id: itemId },
      update: {
        $inc: {
          'stats.timesRanked': 1,
          'stats.sumPositions': idx + 1,
          ...(idx === 0 ? { 'stats.winCount': 1 } : {}),
        },
      },
    },
  }));
  if (ops.length) await RankItem.bulkWrite(ops);
  await Rank.updateOne(
    { _id: session.rank },
    { $inc: { 'stats.sessionsCount': 1 }, $set: { 'stats.lastSessionAt': new Date() } }
  );
}

// DELETE /api/sessions/:id — abandonar sessão
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await RankSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    if (String(session.user) !== req.userId) return res.status(403).json({ error: 'Sem permissão' });
    await session.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
