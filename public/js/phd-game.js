/* ================================================================
   PHD Solution Game — Frontend Logic
   ================================================================ */

// ── State ─────────────────────────────────────────────────────────
let state = {
  sessionId: null,
  userId: null,
  userName: '',
  questions: [],
  currentIdx: 0,
  score: 0,
  maxPossible: 0,
  answered: false
};

// ── DOM helpers ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  welcome: $('screen-welcome'),
  game:    $('screen-game'),
  result:  $('screen-result')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

function setError(msg) {
  const el = $('form-error');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

// ── API ───────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api/game' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Welcome Screen ────────────────────────────────────────────────
$('form-start').addEventListener('submit', async e => {
  e.preventDefault();
  setError('');
  const name  = $('player-name').value.trim();
  const email = $('player-email').value.trim();
  if (!name || !email) return setError('Please fill in both fields.');

  const btnText    = document.querySelector('#btn-start .btn-text');
  const btnSpinner = document.querySelector('#btn-start .btn-spinner');
  btnText.classList.add('hidden');
  btnSpinner.classList.remove('hidden');
  $('btn-start').disabled = true;

  try {
    const data = await api('/start', 'POST', { name, email });
    state.sessionId   = data.sessionId;
    state.userId      = data.userId;
    state.userName    = data.userName;
    state.questions   = data.questions;
    state.currentIdx  = 0;
    state.score       = 0;
    state.maxPossible = data.maxPossible;
    state.answered    = false;
    startGame();
  } catch (err) {
    setError(err.message);
  } finally {
    btnText.classList.remove('hidden');
    btnSpinner.classList.add('hidden');
    $('btn-start').disabled = false;
  }
});

$('btn-show-history').addEventListener('click', () => {
  const email = $('player-email').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError('Enter your email address above to view history.');
    return;
  }
  setError('');
  showHistoryModal(email);
});

$('btn-show-leaderboard-welcome').addEventListener('click', showLeaderboardModal);

// ── Game Setup ────────────────────────────────────────────────────
function startGame() {
  $('header-player-name').textContent = state.userName;
  $('header-score').textContent = '0';
  showScreen('game');
  renderQuestion();
}

// ── Question Render ───────────────────────────────────────────────
function renderQuestion() {
  const q = state.questions[state.currentIdx];
  state.answered = false;

  // Progress
  const qNum = state.currentIdx + 1;
  const total = state.questions.length;
  $('progress-label').textContent = `Question ${qNum} / ${total}`;
  $('progress-bar').style.width = `${((qNum - 1) / total) * 100}%`;

  // Meta badges
  $('q-category').textContent = q.category;
  const diffEl = $('q-difficulty');
  diffEl.textContent = q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1);
  diffEl.className = `difficulty-badge difficulty-${q.difficulty}`;
  $('q-points').textContent = `+${q.points} pts`;

  $('q-title').textContent    = q.title;
  $('q-scenario').textContent = q.scenario;

  // Scenario diagram
  const imgEl  = $('q-image');
  const diagEl = $('scenario-diagram');
  if (q.image) {
    imgEl.src = q.image;
    imgEl.alt = q.title + ' diagram';
    diagEl.classList.remove('hidden');
  } else {
    diagEl.classList.add('hidden');
  }

  // Choices
  const grid = $('choices-grid');
  grid.innerHTML = '';
  q.choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className   = 'choice-btn';
    btn.dataset.id  = choice.id;
    btn.innerHTML   = `<span class="choice-letter">${choice.id}</span><span>${choice.text}</span>`;
    btn.addEventListener('click', () => handleAnswer(choice.id));
    grid.appendChild(btn);
  });

  // Hide feedback
  $('feedback-panel').classList.add('hidden');

  // Re-animate card
  const card = $('question-card');
  card.style.animation = 'none';
  card.offsetHeight; // reflow
  card.style.animation = '';
}

// ── Answer Handling ───────────────────────────────────────────────
async function handleAnswer(choiceId) {
  if (state.answered) return;
  state.answered = true;

  const q = state.questions[state.currentIdx];

  // Disable all buttons
  document.querySelectorAll('.choice-btn').forEach(b => (b.disabled = true));

  // Show loading feedback
  const feedbackPanel = $('feedback-panel');
  const aiText        = $('ai-text');
  const resultDiv     = $('feedback-result');

  aiText.innerHTML = `<div class="ai-loading"><div class="spinner"></div> Analyzing your answer…</div>`;
  feedbackPanel.classList.remove('hidden');

  let data;
  try {
    data = await api('/answer', 'POST', {
      sessionId:      state.sessionId,
      questionId:     q.id,
      selectedChoice: choiceId
    });
  } catch (err) {
    aiText.textContent = 'Could not get AI feedback. ' + err.message;
    styleChoices(choiceId, choiceId === q.correct, q.correct);
    setupNextButton();
    return;
  }

  // Style choices
  styleChoices(choiceId, data.isCorrect, data.correctChoice);

  // Feedback result row
  resultDiv.className = `feedback-result ${data.isCorrect ? 'correct-result' : 'wrong-result'}`;
  $('result-icon').textContent = data.isCorrect ? '✅' : '❌';
  $('result-text').textContent = data.isCorrect
    ? `Correct! Great decision.`
    : `Incorrect. The best answer was ${data.correctChoice}: "${data.correctChoiceText}"`;
  const ptEl = $('result-points');
  ptEl.textContent = data.isCorrect ? `+${data.scoreEarned}` : '0';
  ptEl.className   = `result-points ${data.isCorrect ? 'earned' : 'zero'}`;

  // Update score
  state.score += data.scoreEarned;
  $('header-score').textContent = state.score;

  // AI feedback
  aiText.textContent = data.aiFeedback;

  setupNextButton();
}

function styleChoices(selected, isCorrect, correctId) {
  document.querySelectorAll('.choice-btn').forEach(btn => {
    const id = btn.dataset.id;
    if (id === correctId) {
      btn.classList.add('correct');
    } else if (id === selected && !isCorrect) {
      btn.classList.add('wrong');
    } else {
      btn.classList.add('dimmed');
    }
  });
}

function setupNextButton() {
  const isLast  = state.currentIdx >= state.questions.length - 1;
  $('next-label').textContent = isLast ? 'See Results 🏆' : 'Next Question →';
  $('btn-next').onclick = isLast ? finishGame : nextQuestion;
}

function nextQuestion() {
  state.currentIdx++;
  $('progress-bar').style.width = `${(state.currentIdx / state.questions.length) * 100}%`;
  renderQuestion();
}

// ── Finish Game ───────────────────────────────────────────────────
async function finishGame() {
  // Complete progress bar
  $('progress-bar').style.width = '100%';

  let resultData;
  try {
    resultData = await api('/complete', 'POST', { sessionId: state.sessionId });
  } catch (err) {
    resultData = {
      score: state.score,
      maxPossible: state.maxPossible,
      percentage: Math.round((state.score / state.maxPossible) * 100),
      isNewBest: false,
      previousBest: 0,
      yourRank: '?',
      questionsAnswered: state.questions.length,
      correctAnswers: 0
    };
  }

  renderResult(resultData);
  showScreen('result');
}

function renderResult(data) {
  const pct = data.percentage;

  // Emoji + headline
  let emoji, headline;
  if (pct >= 90) { emoji = '🏆'; headline = 'Outstanding! You\'re a PHD-level problem solver!'; }
  else if (pct >= 70) { emoji = '🎯'; headline = 'Well done! Solid professional judgment!'; }
  else if (pct >= 50) { emoji = '📚'; headline = 'Good effort! Keep learning and improving.'; }
  else { emoji = '💡'; headline = 'Every expert started somewhere — keep practicing!'; }

  $('result-emoji').textContent = emoji;
  $('result-headline').textContent = headline;

  $('final-score').textContent = data.score;
  $('final-max').textContent   = data.maxPossible;

  // Percent bar
  const barFill = $('score-pct-bar');
  barFill.className = `score-pct-bar-fill ${pct >= 70 ? 'pct-high' : pct >= 40 ? 'pct-mid' : 'pct-low'}`;
  setTimeout(() => { barFill.style.width = pct + '%'; }, 50);
  $('score-pct-label').textContent = `${pct}% scored`;

  // New best badge
  const badge = $('new-best-badge');
  if (data.isNewBest && data.score > 0) badge.classList.remove('hidden');
  else badge.classList.add('hidden');

  // Stats
  $('stat-correct').textContent = `${data.correctAnswers} / ${data.questionsAnswered}`;
  $('stat-rank').textContent    = `#${data.yourRank}`;
  $('stat-pct').textContent     = `${pct}%`;

  // Leaderboard
  loadLeaderboardIntoTable('leaderboard-body', data.score);
}

async function loadLeaderboardIntoTable(tbodyId, myScore) {
  const tbody = $(tbodyId);
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem">Loading…</td></tr>';

  try {
    const { leaderboard } = await api('/leaderboard');
    if (!leaderboard.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem">No scores yet — you\'re the first!</td></tr>';
      return;
    }

    tbody.innerHTML = leaderboard.map((row, i) => {
      const rank   = i + 1;
      const medal  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      const isYou  = myScore != null && row.best_score === myScore && i === 0;
      return `<tr class="${isYou ? 'you' : ''}">
        <td><span class="rank-medal">${medal}</span></td>
        <td>${escapeHtml(row.name)}${isYou ? ' 👈' : ''}</td>
        <td>${row.best_score}</td>
        <td>${row.percentage}%</td>
        <td>${row.games_played}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem">${err.message}</td></tr>`;
  }
}

// ── Result Screen Actions ─────────────────────────────────────────
$('btn-play-again').addEventListener('click', () => {
  showScreen('welcome');
});

$('btn-home').addEventListener('click', () => {
  showScreen('welcome');
});

// ── History Modal ─────────────────────────────────────────────────
async function showHistoryModal(email) {
  $('modal-history').classList.remove('hidden');
  $('history-content').innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Loading…</div>';

  try {
    const data = await api(`/history/${encodeURIComponent(email)}`);

    if (!data.user) {
      $('history-content').innerHTML = `<div class="history-empty">No history found for <strong>${escapeHtml(email)}</strong>.<br>Play your first game to start tracking!</div>`;
      return;
    }

    const { stats, history } = data;
    let html = '';

    if (stats && stats.total_games > 0) {
      html += `<div class="history-stats">
        <div class="stat-item"><span class="stat-value">${stats.total_games}</span><span class="stat-label">Games</span></div>
        <div class="stat-item"><span class="stat-value">${stats.best_score}</span><span class="stat-label">Best</span></div>
        <div class="stat-item"><span class="stat-value">${stats.avg_score}</span><span class="stat-label">Avg</span></div>
      </div>`;
    }

    if (history.length) {
      html += '<div class="history-list">';
      history.forEach(g => {
        const date = g.completed_at ? new Date(g.completed_at).toLocaleDateString() : 'N/A';
        html += `<div class="history-row">
          <div>
            <div class="history-row-score">${g.score} / ${g.max_possible}</div>
            <div class="history-row-meta">${date}</div>
          </div>
          <div class="history-row-pct" style="color:${g.percentage >= 70 ? 'var(--success)' : g.percentage >= 40 ? 'var(--warn)' : 'var(--danger)'}">${g.percentage}%</div>
        </div>`;
      });
      html += '</div>';
    } else {
      html += '<div class="history-empty">No completed games yet.</div>';
    }

    $('history-content').innerHTML = html;
  } catch (err) {
    $('history-content').innerHTML = `<div class="history-empty">Error: ${escapeHtml(err.message)}</div>`;
  }
}

$('btn-close-history').addEventListener('click', () => {
  $('modal-history').classList.add('hidden');
});
$('modal-history').addEventListener('click', e => {
  if (e.target === $('modal-history')) $('modal-history').classList.add('hidden');
});

// ── Leaderboard Modal ─────────────────────────────────────────────
async function showLeaderboardModal() {
  $('modal-leaderboard').classList.remove('hidden');
  $('leaderboard-modal-content').innerHTML = `
    <table class="leaderboard-table" style="margin:0 1.5rem 1.5rem;width:calc(100% - 3rem)">
      <thead><tr><th>#</th><th>Name</th><th>Best Score</th><th>%</th><th>Games</th></tr></thead>
      <tbody><tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem">Loading…</td></tr></tbody>
    </table>`;

  try {
    const { leaderboard } = await api('/leaderboard');
    const tbody = $('leaderboard-modal-content').querySelector('tbody');

    if (!leaderboard.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">No scores yet — be the first!</td></tr>';
      return;
    }

    tbody.innerHTML = leaderboard.map((row, i) => {
      const rank  = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      return `<tr>
        <td><span class="rank-medal">${medal}</span></td>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.best_score}</td>
        <td>${row.percentage}%</td>
        <td>${row.games_played}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    $('leaderboard-modal-content').querySelector('tbody').innerHTML =
      `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1rem">${escapeHtml(err.message)}</td></tr>`;
  }
}

$('btn-close-leaderboard').addEventListener('click', () => {
  $('modal-leaderboard').classList.add('hidden');
});
$('modal-leaderboard').addEventListener('click', e => {
  if (e.target === $('modal-leaderboard')) $('modal-leaderboard').classList.add('hidden');
});

// ── Utility ───────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
