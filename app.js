import { VERSION, STORAGE_KEY, complete, points, score, freshState, freshAttempt, validateState } from './engine.js';
const $ = selector => document.querySelector(selector);
const main = $('#main');
const modal = $('#modal');
const letters = 'ABCD';
const ratingLabels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
const typeNames = { agree: 'Agreement', triad: 'Personal ranking', scenario: 'Workplace judgment' };
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
let bank, state = freshState(), saveWorks = true, offlineReady = false, installEvent;
let reviewFilter = 'all';
let toastTimer;
function toast(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#notice').hidden = true; }, 4500);
}
function storageWarning(message) {
  saveWorks = false;
  $('#storage-warning').textContent = message;
  $('#storage-warning').hidden = false;
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveWorks = true;
    $('#storage-warning').hidden = true;
  } catch (error) {
    console.error('Progress could not be saved', error);
    storageWarning('Progress is only in memory: browser storage is unavailable or full. Export a backup before closing.');
  }
}
function attempt(set) { return state.sets[set.id] ??= freshAttempt(); }
function count(set) { const a = attempt(set); return set.questions.filter(q => complete(q, a.answers[q.id])).length; }
function route() {
  const match = location.hash.match(/^#set-(\d)(?:\/(results))?$/);
  const set = match && bank?.sets[Number(match[1]) - 1];
  return set ? { set, results: match[2] === 'results' } : {};
}
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
function focusMain() { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function render() {
  if (!bank) return;
  const { set, results } = route();
  if (!set) home();
  else if (attempt(set).submitted) resultsPage(set);
  else if (results) go(`#${set.id}`);
  else questionPage(set);
  focusMain();
}
function home() {
  document.title = 'Clearstep — Work-style practice';
  const done = bank.sets.reduce((sum, set) => sum + count(set), 0);
  const finished = bank.sets.filter(set => attempt(set).submitted).length;
  const resume = bank.sets.find(set => !attempt(set).submitted && count(set) > 0) || bank.sets.find(set => !attempt(set).submitted) || bank.sets[0];
  main.innerHTML = `
    <section class="hero"><div><p class="eyebrow">A little clarity. A lot of progress.</p>
    <h1>Good judgment.<br><span class="serif">Built with practice.</span></h1>
    <p class="hero-copy">Four focused sessions to think through how you work, decide, and collaborate. One question at a time.</p>
    <button class="button" data-open="${resume.id}">${done ? 'Continue your practice' : 'Start your first session'} <span aria-hidden="true">↗</span></button>
    <div><span class="mini-tag">No timer. No pressure. Your own pace.</span></div></div>
    <div class="hero-art" aria-hidden="true"><div class="art-ring"></div><div class="art-caption">THINK CLEARLY · TAKE THE NEXT STEP</div></div></section>
    <section class="stats-strip" aria-label="Your progress"><div class="stat"><strong>240</strong><span>original questions</span></div><div class="stat"><strong>${done}<span style="display:inline"> / 240</span></strong><span>answered</span></div><div class="stat"><strong>${finished}<span style="display:inline"> / 4</span></strong><span>sessions scored</span></div></section>
    <div class="section-title"><h2>Your practice sessions</h2><p>60 questions · 3 question styles</p></div>
    <section class="set-grid">${bank.sets.map((set, i) => {
      const a = attempt(set), n = count(set), result = a.submitted ? score(set, a) : null;
      return `<article class="set-card"><div class="card-top"><span class="set-number">SESSION 0${i + 1}</span><span class="badge">${a.submitted ? 'Completed' : n ? 'In progress' : 'Ready when you are'}</span></div>
      <h3>${escape(set.title)}</h3><p>${escape(set.subtitle)}</p><div class="bar" aria-hidden="true"><span style="width:${n / 60 * 100}%"></span></div>
      <div class="card-bottom"><span class="card-meta">${result ? `${result.percent}% practice-key match` : `${n} of 60 answered`}</span><button class="button ${i ? 'secondary' : ''}" data-open="${set.id}">${a.submitted ? 'View results' : n ? 'Resume' : 'Begin session'} <span aria-hidden="true">↗</span></button></div></article>`;
    }).join('')}</section>
    <p class="note">A learning tool, not a Google answer key. Scores measure agreement with this practice key, including illustrative personal rankings. They do not predict hiring outcomes.</p>`;
  main.querySelectorAll('[data-open]').forEach(button => button.onclick = () => go(`#${button.dataset.open}`));
}
function questionPage(set) {
  const a = attempt(set), q = set.questions[a.index], answer = a.answers[q.id];
  const n = count(set), flagged = a.flags.includes(q.id);
  const pair = q.type !== 'agree';
  document.title = `${a.index + 1}/60 · ${set.title} — Clearstep`;
  main.innerHTML = `<div class="quiz-wrap">
    <div class="quiz-top"><a class="text-button" href="#home">← All sessions</a><button class="quiet" id="question-map">Question map · ${a.flags.length} saved</button></div>
    <div class="progress-copy"><span>Session ${bank.sets.indexOf(set) + 1} · ${escape(set.title)}</span><span>${n}/60 answered</span></div>
    <div class="bar quiz-progress"><span style="width:${n / 60 * 100}%"></span></div>
    <article class="question-card"><div class="question-heading"><p class="eyebrow" style="margin:0">${typeNames[q.type]} · ${a.index + 1} / 60</p><button class="bookmark" id="bookmark" aria-label="${flagged ? 'Remove bookmark' : 'Bookmark question'}" aria-pressed="${flagged}">${flagged ? '★' : '☆'}</button></div>
    <h1>${escape(q.title)}</h1>${q.type === 'triad' ? '' : `<p class="prompt">${escape(q.prompt)}</p>`}
    <p class="instruction">${q.type === 'agree' ? 'Choose how much this describes your usual behavior.' : q.type === 'triad' ? 'Choose one <strong>MOST like you</strong> and one <strong>LEAST like you</strong>. Compare your habits, not which value is best.' : 'Choose one <strong>MOST effective</strong> and one <strong>LEAST effective</strong> action.'}</p>
    ${pair ? `<div class="pair-options">${q.options.map((option, i) => `<div class="option"><div class="option-copy" id="option-${i}"><span class="letter">${letters[i]}.</span><span>${escape(option)}</span></div><div class="picks">${['most', 'least'].map(kind => `<label><input type="radio" name="${kind}" value="${i}" aria-label="${kind.toUpperCase()} ${letters[i]}: ${escape(option)}" ${answer?.[kind] === i ? 'checked' : ''}>${kind.toUpperCase()}</label>`).join('')}</div></div>`).join('')}</div>` :
      `<fieldset class="agreement"><legend class="skip">Your agreement rating</legend>${ratingLabels.map((label, i) => `<label><input type="radio" name="rating" value="${i - 2}" ${answer === i - 2 ? 'checked' : ''}>${label}</label>`).join('')}</fieldset>`}
    ${q.type === 'triad' ? '<p class="instruction" style="margin:15px 0 0">LEAST means “less like me than the other two.” The practice ranking is illustrative, not a personality ideal.</p>' : ''}
    </article>
    <nav class="quiz-nav" aria-label="Question navigation"><button class="button secondary" id="previous" ${a.index === 0 ? 'disabled' : ''}>← Back</button><span class="save-copy">${saveWorks ? 'Saved on this device' : 'Not saved · Export backup'}</span><button class="button" id="next">${a.index === 59 ? 'Finish set ↗' : 'Next →'}</button></nav>
    <p class="instruction" style="text-align:center">Answers stay editable until you score this set.</p>
    </div>`;
  main.querySelectorAll('input[type=radio]').forEach(input => input.onchange = () => {
    if (q.type === 'agree') a.answers[q.id] = Number(input.value);
    else {
      const value = { ...(a.answers[q.id] || {}), [input.name]: Number(input.value) };
      const other = input.name === 'most' ? 'least' : 'most';
      if (value[other] === Number(input.value)) {
        delete value[other];
        toast('An option cannot be both MOST and LEAST. Choose a different option for the other.');
      }
      a.answers[q.id] = value;
    }
    save();
    const position = input.name, choice = input.value;
    questionPage(set);
    main.querySelector(`input[name="${position}"][value="${choice}"]`)?.focus({ preventScroll: true });
  });
  $('#previous').onclick = () => { a.index--; save(); questionPage(set); focusMain(); };
  $('#next').onclick = () => {
    if (a.index === 59) finishDialog(set);
    else { a.index++; save(); questionPage(set); focusMain(); }
  };
  $('#question-map').onclick = () => mapDialog(set);
  $('#bookmark').onclick = () => {
    a.flags = flagged ? a.flags.filter(id => id !== q.id) : [...a.flags, q.id];
    save(); questionPage(set); $('#bookmark').focus({ preventScroll: true });
  };
}
function openDialog(title, body, actions = '') {
  $('#modal-content').innerHTML = `<div class="modal-heading"><h2>${escape(title)}</h2><button class="icon-button" id="close-modal" aria-label="Close dialog">×</button></div><div class="modal-body">${body}</div>${actions}`;
  $('#close-modal').onclick = () => modal.close();
  if (!modal.open) modal.showModal();
}
function mapDialog(set) {
  const a = attempt(set);
  openDialog('Your question map', `<p>Green = answered · dot = bookmarked. Tap a number to jump.</p><div class="navigator">${set.questions.map((q, i) => `<button data-index="${i}" class="${complete(q, a.answers[q.id]) ? 'done' : ''} ${i === a.index ? 'current' : ''} ${a.flags.includes(q.id) ? 'flag' : ''}" aria-label="Question ${i + 1}, ${complete(q, a.answers[q.id]) ? 'answered' : 'unanswered'}${a.flags.includes(q.id) ? ', bookmarked' : ''}">${i + 1}</button>`).join('')}</div><button class="button" id="map-finish">Review completion</button>`);
  modal.querySelectorAll('[data-index]').forEach(button => button.onclick = () => { a.index = Number(button.dataset.index); save(); modal.close(); questionPage(set); focusMain(); });
  $('#map-finish').onclick = () => finishDialog(set);
}
function finishDialog(set) {
  const a = attempt(set), n = count(set);
  if (n < 60) {
    openDialog('A few questions to finish', `<p>You have answered <strong>${n} of 60</strong>. Choose both MOST and LEAST for each ranking and scenario.</p>`,
      '<div class="modal-actions"><button class="button" id="jump-missing">Go to first unanswered →</button><button class="button secondary" id="return-quiz">Keep reviewing</button></div>');
    $('#jump-missing').onclick = () => { a.index = set.questions.findIndex(q => !complete(q, a.answers[q.id])); save(); modal.close(); questionPage(set); focusMain(); };
    $('#return-quiz').onclick = () => modal.close();
  } else {
    openDialog('Ready for your results?', `<p>All 60 answered${a.flags.length ? ` · ${a.flags.length} bookmarked` : ''}. Submit to reveal your score and explanations.</p><p class="key-note">The score measures a fixed practice key, not Google's scoring. Personal rankings are illustrative; differences are not personality failures.</p>`,
      '<div class="modal-actions"><button class="button" id="submit-set">Score this set ↗</button><button class="button secondary" id="return-quiz">Keep reviewing</button></div>');
    $('#return-quiz').onclick = () => modal.close();
    $('#submit-set').onclick = () => { a.submitted = true; save(); modal.close(); reviewFilter = 'all'; go(`#${set.id}/results`); };
  }
}
function answerText(q, answer) {
  if (q.type === 'agree') return ratingLabels[answer + 2];
  return `MOST ${letters[answer.most]} · LEAST ${letters[answer.least]}`;
}
function keyText(q) {
  return q.type === 'agree' ? `${q.key > 0 ? 'Agree / Strongly agree' : 'Disagree / Strongly disagree'} (both receive full credit)` : `MOST ${letters[q.key[0]]} · LEAST ${letters[q.key[1]]}`;
}
function resultsPage(set) {
  const a = attempt(set), result = score(set, a);
  document.title = `${result.percent}% practice match — Clearstep`;
  const visible = set.questions.filter(q => reviewFilter === 'all' || (reviewFilter === 'gaps' ? points(q, a.answers[q.id]) < 1 : a.flags.includes(q.id)));
  main.innerHTML = `<div class="quiz-wrap"><a class="text-button" href="#home">← All sessions</a>
    <section class="result-hero"><p class="eyebrow">Session ${bank.sets.indexOf(set) + 1} complete</p><div class="result-score">${result.percent}%<small>Practice-key match</small></div><h1>A clearer next step.</h1><p class="muted">${result.earned} / 60 practice points. Review the reasoning, not just the number.</p>
    <div class="result-stats">${result.categories.map(c => `<div class="result-stat"><strong>${c.earned} / ${c.total}</strong><span>${typeNames[c.type]}</span></div>`).join('')}</div>
    <p class="key-note">Personal rankings are scored against illustrative examples only. A different honest ranking is not a red flag. No pass/fail or Google hiring prediction.</p>
    <div class="result-actions"><a class="button" href="#home">Choose another session ↗</a><button class="button secondary" id="retry">Retry this set</button></div></section>
    <div class="section-title"><h2>Your answer review</h2><button class="text-button" id="scoring-help">How scoring works</button></div>
    <div class="filters" aria-label="Review filters">${[['all','All 60'],['gaps','Key differences'],['flags','Bookmarked']].map(([value,label]) => `<button class="quiet" data-filter="${value}" aria-pressed="${value === reviewFilter}">${label}</button>`).join('')}</div>
    ${visible.length ? visible.map(q => {
      const p = points(q, a.answers[q.id]), index = set.questions.indexOf(q);
      return `<details class="review-item"><summary><span class="result-dot ${p === 0 ? 'miss' : p === .5 ? 'partial' : ''}"></span><span>${index + 1}. ${escape(q.title)}</span><span class="card-meta">${p}/1</span></summary>
      <div class="review-content"><p>${escape(q.prompt)}</p>${q.options ? `<ol type="A">${q.options.map(option => `<li>${escape(option)}</li>`).join('')}</ol>` : ''}
      <p><span class="review-label">Your answer</span><br>${escape(answerText(q, a.answers[q.id]))}</p>
      <p><span class="review-label">${q.type === 'triad' ? 'Illustrative practice key' : 'Practice key'}</span><br>${keyText(q)}</p>
      <p class="reason">${escape(q.reason)}</p></div></details>`;
    }).join('') : '<p class="muted">No questions in this filter.</p>'}</div>`;
  main.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { reviewFilter = button.dataset.filter; resultsPage(set); main.querySelector(`[data-filter="${reviewFilter}"]`).focus({ preventScroll: true }); });
  $('#scoring-help').onclick = scoringHelp;
  $('#retry').onclick = () => {
    openDialog('Start this set again?', '<p>This replaces answers, bookmarks, and the score for this set only. Export a backup first if you want to keep them.</p>',
      '<div class="modal-actions"><button class="button" id="confirm-retry">Reset this set</button><button class="button secondary" id="cancel-retry">Cancel</button></div>');
    $('#cancel-retry').onclick = () => modal.close();
    $('#confirm-retry').onclick = () => { state.sets[set.id] = freshAttempt(); save(); modal.close(); go(`#${set.id}`); };
  };
}
function scoringHelp() {
  openDialog('A practice score, not a verdict', `<p><strong>Every question is worth 1 point.</strong> Each set has 20 of each style, for 60 points total.</p>
    <p><strong>Agreement:</strong> Agree and Strongly agree earn 1 point for an agree-direction key; the reverse applies to disagree-direction keys. Neutral earns 0.5; the opposite direction earns 0. Stronger ratings get no bonus.</p>
    <p><strong>MOST / LEAST:</strong> Each match earns 0.5 points, so one correct selection earns half credit.</p>
    <p><strong>Personal rankings:</strong> The key is an illustrative ranking from the guide, not a preferred personality. Your honest answer can differ. This category is shown separately.</p>
    <p>The percentage is the total divided by 60, rounded to the nearest whole number. It is not a Google score or pass threshold.</p>`);
}
function exportBackup() {
  const blob = new Blob([JSON.stringify({ version: VERSION, sets: state.sets }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `clearstep-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Backup downloaded. Keep it somewhere safe.');
}
function settings() {
  openDialog('Your practice space', `<p><strong>Android installation</strong><br>Open this site in Chrome. Use “Install app” here, or Chrome's menu → Add to Home screen / Install app. Wait for “Offline ready” before leaving internet access.</p>
    <p><strong>Offline status:</strong> ${offlineReady ? 'All app files and 240 questions are cached on this device.' : 'Not yet confirmed. Stay online for the initial download.'}</p>
    <p><strong>Privacy</strong><br>Your answers stay in this browser. No account, analytics, or answer uploads. The hosting provider receives ordinary page requests. Clearing site data or changing browsers can remove progress. Export a backup to keep it.</p>
    <p><strong>Backups</strong><br>Import replaces all progress after confirmation. Backups work across devices using the same quiz version.</p>
    <div class="modal-actions"><button class="button" id="export">Export progress</button><button class="button secondary" id="import">Import backup</button><button class="quiet" id="rules">Scoring rules</button></div>
    <p><strong>Source context</strong><br>Original practice based on the supplied study guide, <a class="help-link" href="https://abc.xyz/investor/board-and-governance/google-code-of-conduct/" target="_blank" rel="noopener">Google's Code of Conduct</a>, <a class="help-link" href="https://rework.withgoogle.com/intl/en/guides/understand-team-effectiveness" target="_blank" rel="noopener">team research</a>, and <a class="help-link" href="https://about.google/company-info/philosophy/" target="_blank" rel="noopener">company philosophy</a>. None provides a GHA answer key. Use for preparation only.</p>`);
  $('#export').onclick = exportBackup;
  $('#import').onclick = () => $('#import-file').click();
  $('#rules').onclick = scoringHelp;
}
$('#settings').onclick = settings;
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Backup is too large. Choose a Clearstep JSON export under 2 MB.');
    const imported = validateState(JSON.parse(await file.text()), bank);
    openDialog('Replace saved progress?', '<p>This replaces progress for all four sets with the selected backup. Current progress will not be kept unless you export it first.</p>',
      '<div class="modal-actions"><button class="button" id="confirm-import">Replace progress</button><button class="button secondary" id="cancel-import">Cancel</button></div>');
    $('#cancel-import').onclick = () => modal.close();
    $('#confirm-import').onclick = () => { state = imported; save(); modal.close(); reviewFilter = 'all'; render(); if (!offlineReady) { connection(); setupOffline(); } toast(saveWorks ? 'Backup restored.' : 'Backup loaded in memory. Export before closing.'); };
  } catch (error) {
    console.error('Backup import failed', error);
    toast(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a Clearstep backup.' : error.message);
  }
};
window.addEventListener('hashchange', () => { reviewFilter = 'all'; render(); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event; $('#install').hidden = false; });
$('#install').onclick = async () => {
  if (!installEvent) return;
  await installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null; $('#install').hidden = true;
};
window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('Installed. Your practice is ready to go.'); });
function connection() { $('#connection').textContent = offlineReady ? (navigator.onLine ? 'Offline ready' : 'Offline mode') : navigator.onLine ? 'Online' : 'Offline'; }
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
async function setupOffline() {
  if (!('serviceWorker' in navigator)) { toast('Offline installation is not supported in this browser. Use current Chrome on Android.'); return; }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) throw new Error('No active offline worker.');
    const channel = new MessageChannel();
    const ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Offline verification timed out.')), 12000);
      channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data?.ready === true); };
    });
    worker.postMessage({ type: 'VERIFY_CACHE' }, [channel.port2]);
    offlineReady = await ready;
    if (!offlineReady) throw new Error('Some required files are not cached.');
    connection();
  } catch (error) {
    console.error('Offline setup failed', error);
    toast('Offline setup incomplete. Stay online and reload before traveling.');
  }
}
async function start() {
  try {
    const response = await fetch('./questions.json');
    if (!response.ok) throw new Error(`Question download returned ${response.status}.`);
    bank = await response.json();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) state = validateState(JSON.parse(stored), bank);
    } catch (error) {
      console.error('Saved progress could not be read', error);
      storageWarning('Saved progress could not be loaded. It has not been overwritten. Import a valid backup or export this session before closing.');
      // Do not silently overwrite an unreadable saved attempt.
      main.innerHTML = '<div class="quiz-wrap"><h1>Saved progress needs attention.</h1><p>Your existing browser data has not been overwritten. Restore a backup using the help button, or reload to choose a fresh start.</p><button class="button" id="retry-start">Choose how to continue</button></div>';
      $('#retry-start').onclick = () => location.reload();
      openDialog('Saved progress needs attention', '<p>The browser could not read saved progress. Restore a known backup, or choose Start fresh to replace the unreadable data.</p>',
        '<div class="modal-actions"><button class="button" id="start-fresh">Start fresh</button><button class="button secondary" id="restore-backup">Import backup</button></div>');
      $('#start-fresh').onclick = () => { state = freshState(); save(); modal.close(); render(); connection(); setupOffline(); };
      $('#restore-backup').onclick = () => $('#import-file').click();
      return;
    }
    render(); connection(); setupOffline();
  } catch (error) {
    console.error('App loading failed', error);
    main.innerHTML = '<div class="quiz-wrap"><h1>Could not load your questions.</h1><p>Check your connection and try again. Your saved answers have not been changed.</p><button class="button" id="reload">Try again</button></div>';
    $('#reload').onclick = () => location.reload();
  }
}
start();
