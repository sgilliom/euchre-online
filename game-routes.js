const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const questions = require('./game-data');

let db;
let anthropic;

function init(database) {
  db = database;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 8000 });
  }
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function staticFeedback(question, selectedChoice, isCorrect) {
  return isCorrect
    ? question.explanation.correct
    : (question.explanation.wrong?.[selectedChoice] || question.explanation.correct);
}

async function getAiFeedback(question, selectedChoice, isCorrect) {
  if (!anthropic) return staticFeedback(question, selectedChoice, isCorrect);

  const selectedText = question.choices.find(c => c.id === selectedChoice)?.text || selectedChoice;
  const correctText  = question.choices.find(c => c.id === question.correct)?.text || question.correct;

  const prompt = isCorrect
    ? `You are the host of a professional technology quiz. The player just answered correctly.

Scenario presented: "${question.scenario}"
Correct answer chosen: "${selectedText}"

Write 2–3 sentences that: (1) confirm this is the right call, (2) explain the single most important technical reason it excels here. Be specific, energetic, and educational. No generic praise.`
    : `You are the host of a professional technology quiz. The player answered incorrectly.

Scenario presented: "${question.scenario}"
Player chose: "${selectedText}"
Correct answer: "${correctText}"

Write 2–3 sentences that: (1) explain the key flaw in their choice, (2) explain what makes the correct answer superior for this specific context. Be constructive, specific, and educational — not discouraging.`;

  const aiCall = anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 350,
    messages: [{ role: 'user', content: prompt }]
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI feedback timeout')), 6000)
  );

  const message = await Promise.race([aiCall, timeoutPromise]);
  return message.content.find(b => b.type === 'text')?.text?.trim() || staticFeedback(question, selectedChoice, isCorrect);
}

// ── POST /api/game/start ──────────────────────────────────────────
router.post('/start', (req, res) => {
  const { name, email } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    const cleanName  = name.trim();

    // Upsert user
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      const r = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(cleanName, cleanEmail);
      user = { id: r.lastInsertRowid, name: cleanName, email: cleanEmail };
    } else {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(cleanName, user.id);
      user.name = cleanName;
    }

    // Pick one question per difficulty level (guaranteed variety)
    const easy   = shuffle(questions.filter(q => q.difficulty === 'easy'));
    const medium = shuffle(questions.filter(q => q.difficulty === 'medium'));
    const hard   = shuffle(questions.filter(q => q.difficulty === 'hard'));
    const picked = shuffle([easy[0], medium[0], hard[0]]);

    const maxPossible = picked.reduce((s, q) => s + q.points, 0);

    const sessionResult = db.prepare(
      'INSERT INTO game_sessions (user_id, question_ids, max_possible) VALUES (?, ?, ?)'
    ).run(user.id, JSON.stringify(picked.map(q => q.id)), maxPossible);

    // Strip correct answers before sending to client
    const gameQuestions = picked.map(({ id, difficulty, points, category, title, image, scenario, choices }) =>
      ({ id, difficulty, points, category, title, image, scenario, choices })
    );

    res.json({
      sessionId: sessionResult.lastInsertRowid,
      userId: user.id,
      userName: user.name,
      questions: gameQuestions,
      maxPossible
    });
  } catch (err) {
    console.error('[game/start]', err);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// ── POST /api/game/answer ─────────────────────────────────────────
router.post('/answer', async (req, res) => {
  const { sessionId, questionId, selectedChoice } = req.body;

  if (!sessionId || !questionId || !selectedChoice) {
    return res.status(400).json({ error: 'sessionId, questionId, and selectedChoice are required' });
  }

  try {
    const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
    if (!session)         return res.status(404).json({ error: 'Session not found' });
    if (session.completed) return res.status(400).json({ error: 'Session already completed' });

    const alreadyAnswered = db.prepare(
      'SELECT id FROM session_answers WHERE session_id = ? AND question_id = ?'
    ).get(sessionId, questionId);
    if (alreadyAnswered) return res.status(400).json({ error: 'Question already answered' });

    const question = questions.find(q => q.id === questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const isCorrect  = selectedChoice === question.correct;
    const scoreEarned = isCorrect ? question.points : 0;

    const aiFeedback = await getAiFeedback(question, selectedChoice, isCorrect).catch(err => {
      console.error('[game/answer AI]', err);
      return isCorrect
        ? question.explanation.correct
        : (question.explanation.wrong[selectedChoice] || question.explanation.correct);
    });

    db.prepare(
      'INSERT INTO session_answers (session_id, question_id, selected_choice, is_correct, score_earned, ai_feedback) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sessionId, questionId, selectedChoice, isCorrect ? 1 : 0, scoreEarned, aiFeedback);

    db.prepare(
      'UPDATE game_sessions SET score = score + ?, questions_answered = questions_answered + 1 WHERE id = ?'
    ).run(scoreEarned, sessionId);

    res.json({
      isCorrect,
      scoreEarned,
      correctChoice: question.correct,
      correctChoiceText: question.choices.find(c => c.id === question.correct)?.text,
      staticExplanation: question.explanation.correct,
      wrongExplanation: !isCorrect ? (question.explanation.wrong[selectedChoice] || null) : null,
      aiFeedback
    });
  } catch (err) {
    console.error('[game/answer]', err);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

// ── POST /api/game/complete ───────────────────────────────────────
router.post('/complete', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  try {
    const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    db.prepare(
      'UPDATE game_sessions SET completed = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(sessionId);

    const answers = db.prepare('SELECT * FROM session_answers WHERE session_id = ?').all(sessionId);

    const bestRow = db.prepare(
      'SELECT MAX(score) as best FROM game_sessions WHERE user_id = ? AND completed = 1'
    ).get(session.user_id);

    const previousBest = bestRow?.best ?? 0;
    const isNewBest    = session.score >= previousBest;

    // User rank on leaderboard
    const rankRow = db.prepare(`
      SELECT COUNT(*) + 1 as rank FROM (
        SELECT user_id, MAX(score) as best_score
        FROM game_sessions WHERE completed = 1
        GROUP BY user_id
      ) WHERE best_score > ?
    `).get(session.score);

    res.json({
      score: session.score,
      maxPossible: session.max_possible,
      percentage: Math.round((session.score / session.max_possible) * 100),
      isNewBest,
      previousBest,
      yourRank: rankRow?.rank ?? 1,
      questionsAnswered: answers.length,
      correctAnswers: answers.filter(a => a.is_correct).length
    });
  } catch (err) {
    console.error('[game/complete]', err);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// ── GET /api/game/leaderboard ─────────────────────────────────────
router.get('/leaderboard', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.name,
        MAX(gs.score)       AS best_score,
        gs.max_possible,
        COUNT(DISTINCT gs.id) AS games_played,
        ROUND(MAX(gs.score) * 100.0 / gs.max_possible) AS percentage,
        MAX(gs.completed_at) AS last_played
      FROM game_sessions gs
      JOIN users u ON gs.user_id = u.id
      WHERE gs.completed = 1
      GROUP BY u.id
      ORDER BY best_score DESC
      LIMIT 20
    `).all();

    res.json({ leaderboard: rows });
  } catch (err) {
    console.error('[game/leaderboard]', err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ── GET /api/game/history/:email ──────────────────────────────────
router.get('/history/:email', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(
      req.params.email.toLowerCase().trim()
    );
    if (!user) return res.json({ user: null, history: [], stats: null });

    const history = db.prepare(`
      SELECT id, score, max_possible,
             ROUND(score * 100.0 / max_possible) AS percentage,
             questions_answered, completed_at
      FROM game_sessions
      WHERE user_id = ? AND completed = 1
      ORDER BY completed_at DESC
      LIMIT 10
    `).all(user.id);

    const stats = db.prepare(`
      SELECT COUNT(*) AS total_games, MAX(score) AS best_score,
             ROUND(AVG(score)) AS avg_score
      FROM game_sessions
      WHERE user_id = ? AND completed = 1
    `).get(user.id);

    res.json({ user: { name: user.name, email: user.email }, history, stats });
  } catch (err) {
    console.error('[game/history]', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = { router, init };
