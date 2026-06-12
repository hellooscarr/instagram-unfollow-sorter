/*
 * Instagram Unfollow Sorter — app logic.
 * Everything runs client-side. USERNAMES is populated from the user's
 * own Instagram export (via parser.js) — nothing is hardcoded and
 * nothing is sent to a server.
 */

const STORAGE_KEY = 'ig_unfollow_sorter_v1';
const SYNC_CODE_KEY = 'ig_unfollow_sync_code';

let USERNAMES = [];
let state = { index: 0, decisions: {} };
let syncId = null;
let cloudSaveTimer = null;
let stagedFiles = null;
let pendingCloud = null;

// ---------------------------------------------------------------
// Screens
// ---------------------------------------------------------------
const startScreen = document.getElementById('start-screen');
const appScreen = document.getElementById('app-screen');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const selectedFileEl = document.getElementById('selected-file');
const loadSampleBtn = document.getElementById('load-sample-btn');
const syncCodeInput = document.getElementById('sync-code-input');
const startContinueBtn = document.getElementById('start-continue-btn');
const startStatusEl = document.getElementById('start-status');
const startErrorEl = document.getElementById('start-error');
const syncIndicator = document.getElementById('sync-indicator');
const changeSyncBtn = document.getElementById('change-sync-btn');
const conflictModal = document.getElementById('conflict-modal');
const conflictLoadBtn = document.getElementById('conflict-load-btn');
const conflictOverwriteBtn = document.getElementById('conflict-overwrite-btn');
const conflictCancelBtn = document.getElementById('conflict-cancel-btn');

function showStartScreen() {
  startScreen.style.display = '';
  appScreen.style.display = 'none';
}

function showAppScreen() {
  startScreen.style.display = 'none';
  appScreen.style.display = '';
  updateSyncIndicator();
}

function updateSyncIndicator(text) {
  if (!syncIndicator) return;
  if (!syncId) {
    syncIndicator.style.display = 'none';
    return;
  }
  syncIndicator.style.display = '';
  syncIndicator.textContent = text || '☁️ Synced across devices';
}

// ---------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.index === 'number' && parsed.decisions && Array.isArray(parsed.usernames)) {
        return parsed;
      }
    }
  } catch (e) {}
  return null;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      index: state.index,
      decisions: state.decisions,
      usernames: USERNAMES,
    }));
  } catch (e) {}
  scheduleCloudSave();
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

// ---------------------------------------------------------------
// Cloud sync (Firestore) — debounced save, keyed by sync code
// ---------------------------------------------------------------
function scheduleCloudSave() {
  if (!syncId) return;
  updateSyncIndicator('Saving…');
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(async () => {
    try {
      await Sync.save(syncId, {
        usernames: USERNAMES,
        decisions: state.decisions,
        index: state.index,
      });
      updateSyncIndicator('☁️ Synced just now');
    } catch (e) {
      updateSyncIndicator('⚠️ Sync failed — saved on this device only');
    }
  }, 800);
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function profileUrl(u) {
  return 'https://www.instagram.com/' + u + '/';
}

function initials(u) {
  const clean = u.replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 2) || u.slice(0, 2)).toUpperCase();
}

// ---------------------------------------------------------------
// DOM refs (sorter screen)
// ---------------------------------------------------------------
const card = document.getElementById('card');
const nextCard = document.getElementById('next-card');
const usernameEl = document.getElementById('username');
const nextUsernameEl = document.getElementById('next-username');
const avatarEl = document.getElementById('avatar');
const nextAvatarEl = document.getElementById('next-avatar');
const viewProfileEl = document.getElementById('view-profile');
const counterEl = document.getElementById('counter');
const overlayKeep = document.getElementById('overlay-keep');
const overlayUnfollow = document.getElementById('overlay-unfollow');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const keepCountEl = document.getElementById('keep-count');
const unfollowCountEl = document.getElementById('unfollow-count');
const swipeArea = document.getElementById('swipe-area');
const doneScreen = document.getElementById('done-screen');
const totalCountEl = document.getElementById('total-count');
const queueList = document.getElementById('unfollow-queue');
const queueCount = document.getElementById('queue-count');
const queueToggle = document.getElementById('queue-toggle');
const queueArrow = document.getElementById('queue-arrow');
const emptyNoteHTML = '<li class="empty-note" style="border-top:none;list-style:none;padding:8px 0;">Nothing here yet — accounts you swipe left (or tap ✕) will show up here with a link to unfollow on Instagram.</li>';

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------
function render() {
  totalCountEl.textContent = USERNAMES.length;

  if (USERNAMES.length === 0) {
    swipeArea.style.display = 'none';
    doneScreen.style.display = 'block';
    doneScreen.querySelector('h2').textContent = 'Nothing to review 🎉';
    doneScreen.querySelector('p').innerHTML = "Every account you follow follows you back. Nothing to do here!";
  } else if (state.index >= USERNAMES.length) {
    swipeArea.style.display = 'none';
    doneScreen.style.display = 'block';
    doneScreen.querySelector('h2').textContent = 'All done 🎉';
    doneScreen.querySelector('p').innerHTML = "You've reviewed all <span id=\"total-count\">" + USERNAMES.length + "</span> accounts.";
  } else {
    swipeArea.style.display = '';
    doneScreen.style.display = 'none';
    const u = USERNAMES[state.index];
    usernameEl.textContent = '@' + u;
    avatarEl.textContent = initials(u);
    viewProfileEl.href = profileUrl(u);
    counterEl.textContent = (state.index + 1) + ' / ' + USERNAMES.length;
    card.style.transition = 'none';
    card.style.transform = '';
    card.style.opacity = '1';
    overlayKeep.style.opacity = 0;
    overlayUnfollow.style.opacity = 0;

    if (state.index + 1 < USERNAMES.length) {
      const nu = USERNAMES[state.index + 1];
      nextUsernameEl.textContent = '@' + nu;
      nextAvatarEl.textContent = initials(nu);
      nextCard.style.visibility = 'visible';
    } else {
      nextCard.style.visibility = 'hidden';
    }
  }
  updateStats();
  renderQueue();
}

function updateStats() {
  const reviewed = Math.min(state.index, USERNAMES.length);
  const keepCount = Object.values(state.decisions).filter((d) => d === 'keep').length;
  const unfollowCount = Object.values(state.decisions).filter((d) => d === 'unfollow').length;
  const total = USERNAMES.length || 1;
  progressText.textContent = reviewed + ' / ' + USERNAMES.length + ' reviewed';
  progressBar.style.width = (reviewed / total * 100).toFixed(1) + '%';
  keepCountEl.textContent = keepCount;
  unfollowCountEl.textContent = unfollowCount;
}

function renderQueue() {
  const entries = Object.entries(state.decisions).filter(([u, d]) => d === 'unfollow');
  queueCount.textContent = entries.length;
  queueList.innerHTML = '';
  if (entries.length === 0) {
    queueList.innerHTML = emptyNoteHTML;
    return;
  }
  entries.forEach(([u]) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = profileUrl(u);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = '@' + u;
    li.appendChild(a);
    const btn = document.createElement('button');
    btn.className = 'small-btn';
    btn.textContent = 'Move to keep';
    btn.onclick = () => {
      state.decisions[u] = 'keep';
      saveState();
      render();
    };
    li.appendChild(btn);
    queueList.appendChild(li);
  });
}

// ---------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------
function decide(decision) {
  if (state.index >= USERNAMES.length) return;
  const u = USERNAMES[state.index];
  state.decisions[u] = decision;
  state.index++;
  saveState();
  animateOut(decision);
}

function undo() {
  if (state.index === 0) return;
  state.index--;
  const u = USERNAMES[state.index];
  delete state.decisions[u];
  saveState();
  render();
}

function animateOut(decision) {
  const x = decision === 'unfollow' ? -window.innerWidth : window.innerWidth;
  const rot = decision === 'unfollow' ? -25 : 25;
  card.style.transition = 'transform 0.35s ease, opacity 0.35s ease';
  card.style.transform = 'translate(' + x + 'px, -20px) rotate(' + rot + 'deg)';
  card.style.opacity = '0';
  setTimeout(render, 320);
}

// ---------------------------------------------------------------
// Drag (mouse + touch via Pointer Events)
// ---------------------------------------------------------------
let dragging = false;
let startX = 0, startY = 0, dx = 0, dy = 0;

card.addEventListener('pointerdown', (e) => {
  if (state.index >= USERNAMES.length) return;
  if (e.target.closest('a')) return; // let the "View profile" link handle its own click
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  card.style.transition = 'none';
  card.setPointerCapture(e.pointerId);
});

card.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dx = e.clientX - startX;
  dy = e.clientY - startY;
  const rot = dx / 18;
  card.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot + 'deg)';
  if (dx > 0) {
    overlayKeep.style.opacity = Math.min(dx / 90, 1);
    overlayUnfollow.style.opacity = 0;
  } else {
    overlayUnfollow.style.opacity = Math.min(-dx / 90, 1);
    overlayKeep.style.opacity = 0;
  }
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  card.style.transition = 'transform 0.25s ease';
  if (dx > 110) {
    decide('keep');
  } else if (dx < -110) {
    decide('unfollow');
  } else {
    card.style.transform = '';
    overlayKeep.style.opacity = 0;
    overlayUnfollow.style.opacity = 0;
  }
  dx = 0; dy = 0;
}

card.addEventListener('pointerup', endDrag);
card.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------
// Buttons + keyboard
// ---------------------------------------------------------------
document.getElementById('unfollow-btn').addEventListener('click', () => decide('unfollow'));
document.getElementById('keep-btn').addEventListener('click', () => decide('keep'));
document.getElementById('undo-btn').addEventListener('click', undo);

document.addEventListener('keydown', (e) => {
  if (appScreen.style.display === 'none') return;
  if (e.key === 'ArrowLeft') decide('unfollow');
  else if (e.key === 'ArrowRight') decide('keep');
  else if (e.key === 'ArrowUp') {
    if (state.index < USERNAMES.length) window.open(profileUrl(USERNAMES[state.index]), '_blank');
  } else if (e.key === 'z' || e.key === 'Z') undo();
});

// ---------------------------------------------------------------
// Queue collapse toggle
// ---------------------------------------------------------------
queueToggle.addEventListener('click', () => {
  queueList.classList.toggle('collapsed');
  queueArrow.textContent = queueList.classList.contains('collapsed') ? '▾' : '▴';
});

// ---------------------------------------------------------------
// Export to Excel
// ---------------------------------------------------------------
document.getElementById('export-excel-btn').addEventListener('click', () => {
  const allRows = [['username', 'profile_url', 'decision']];
  USERNAMES.forEach((u) => {
    allRows.push([u, profileUrl(u), state.decisions[u] || 'pending']);
  });
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);

  const unfollowRows = [['username', 'profile_url', 'unfollowed?']];
  USERNAMES.forEach((u) => {
    if (state.decisions[u] === 'unfollow') unfollowRows.push([u, profileUrl(u), '']);
  });
  const wsUnfollow = XLSX.utils.aoa_to_sheet(unfollowRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsUnfollow, 'To Unfollow');
  XLSX.utils.book_append_sheet(wb, wsAll, 'All');

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, 'instagram-unfollow-list-' + date + '.xlsx');
});

// ---------------------------------------------------------------
// Progress backup / restore
// ---------------------------------------------------------------
document.getElementById('export-progress-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ index: state.index, decisions: state.decisions, usernames: USERNAMES })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = 'ig-sorter-progress-' + date + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

document.getElementById('import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (parsed && typeof parsed.index === 'number' && parsed.decisions && Array.isArray(parsed.usernames)) {
        USERNAMES = parsed.usernames;
        state = { index: parsed.index, decisions: parsed.decisions };
        saveState();
        showAppScreen();
        render();
      } else {
        alert('That file does not look like a valid progress backup.');
      }
    } catch (err) {
      alert('Could not read that file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ---------------------------------------------------------------
// Reset / start over
// ---------------------------------------------------------------
document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('Start over with a new export? This clears your current progress (export a backup first if you want to keep it).')) {
    clearState();
    USERNAMES = [];
    state = { index: 0, decisions: {} };
    if (syncId) {
      Sync.clear(syncId).catch(() => {});
    }
    let savedCode = '';
    try { savedCode = localStorage.getItem(SYNC_CODE_KEY) || ''; } catch (e) {}
    syncCodeInput.value = savedCode;
    resetStartUI();
    showStartScreen();
  }
});

// ---------------------------------------------------------------
// Start screen — messages
// ---------------------------------------------------------------
function showStartError(message) {
  startStatusEl.style.display = 'none';
  startErrorEl.textContent = message;
  startErrorEl.style.display = '';
}

function showStartStatus(message) {
  startErrorEl.style.display = 'none';
  startStatusEl.textContent = message;
  startStatusEl.style.display = '';
}

function hideStartMessages() {
  startErrorEl.style.display = 'none';
  startStatusEl.style.display = 'none';
}

function resetStartUI() {
  hideStartMessages();
  stageFiles(null);
}

// ---------------------------------------------------------------
// File staging (parsed only once the user hits Continue)
// ---------------------------------------------------------------
function stageFiles(files) {
  fileInput.value = '';
  if (!files || files.length === 0) {
    stagedFiles = null;
    selectedFileEl.style.display = 'none';
    return;
  }
  stagedFiles = Array.from(files);
  selectedFileEl.textContent = 'Selected: ' + stagedFiles.map((f) => f.name).join(', ');
  selectedFileEl.style.display = '';
  hideStartMessages();
}

dropzone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => stageFiles(e.target.files));

['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  stageFiles(e.dataTransfer.files);
});

// Parse staged files into a final username list, regardless of format
// (ZIP export, individual JSON files, CSV, or Excel).
async function parseAccountFiles(files) {
  if (files.length === 1 && /\.csv$/i.test(files[0].name)) {
    // Already a "not following back" list — use it directly, no diffing.
    return await Parser.parseCSV(files[0]);
  }
  if (files.length === 1 && /\.xlsx$/i.test(files[0].name)) {
    return await Parser.parseXLSX(files[0]);
  }
  let result;
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    result = await Parser.parseZip(files[0]);
  } else {
    result = await Parser.parseJSONFiles(Array.from(files));
  }
  return Parser.computeNonReciprocal(result.followers, result.following);
}

async function loadFromStagedFiles() {
  showStartStatus('Reading your file…');
  try {
    const usernames = await parseAccountFiles(stagedFiles);
    USERNAMES = usernames;
    state = { index: 0, decisions: {} };
    saveState();
    hideStartMessages();
    showAppScreen();
    render();
  } catch (err) {
    showStartError(err.message || 'Something went wrong reading that file.');
  }
}

// ---------------------------------------------------------------
// Start screen — keyword + upload, with conflict handling
// ---------------------------------------------------------------
function showConflictModal() {
  conflictModal.style.display = '';
}

function hideConflictModal() {
  conflictModal.style.display = 'none';
}

startContinueBtn.addEventListener('click', async () => {
  const code = syncCodeInput.value.trim();
  if (!code) {
    showStartError('Enter a keyword (any word or phrase) to continue.');
    return;
  }

  hideStartMessages();
  startContinueBtn.disabled = true;
  showStartStatus('Checking for existing progress…');

  syncId = Sync.idFromCode(code);
  try { localStorage.setItem(SYNC_CODE_KEY, code); } catch (e) {}

  let cloud = null;
  try {
    cloud = await Sync.load(syncId);
  } catch (e) {
    showStartError('Could not reach the sync server. Check your connection and try again.');
    startContinueBtn.disabled = false;
    return;
  }

  const hasCloud = !!(cloud && Array.isArray(cloud.usernames) && cloud.usernames.length > 0);
  const hasFiles = !!(stagedFiles && stagedFiles.length > 0);

  if (hasCloud && hasFiles) {
    pendingCloud = cloud;
    hideStartMessages();
    startContinueBtn.disabled = false;
    showConflictModal();
    return;
  }

  if (hasCloud) {
    USERNAMES = cloud.usernames;
    state = { index: cloud.index || 0, decisions: cloud.decisions || {} };
    saveState();
    hideStartMessages();
    showAppScreen();
    render();
    return;
  }

  if (hasFiles) {
    await loadFromStagedFiles();
    startContinueBtn.disabled = false;
    return;
  }

  showStartError(`No saved progress found for "${code}" yet. Upload your export above to get started.`);
  startContinueBtn.disabled = false;
});

syncCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startContinueBtn.click();
});

conflictLoadBtn.addEventListener('click', () => {
  hideConflictModal();
  if (!pendingCloud) return;
  USERNAMES = pendingCloud.usernames;
  state = { index: pendingCloud.index || 0, decisions: pendingCloud.decisions || {} };
  pendingCloud = null;
  saveState();
  showAppScreen();
  render();
});

conflictOverwriteBtn.addEventListener('click', async () => {
  hideConflictModal();
  pendingCloud = null;
  await loadFromStagedFiles();
});

conflictCancelBtn.addEventListener('click', () => {
  hideConflictModal();
  pendingCloud = null;
});

changeSyncBtn.addEventListener('click', () => {
  let savedCode = '';
  try { savedCode = localStorage.getItem(SYNC_CODE_KEY) || ''; } catch (e) {}
  syncCodeInput.value = savedCode;
  resetStartUI();
  showStartScreen();
});

// ---------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------
const SAMPLE_USERNAMES = [
  'nasa', 'spacex', 'natgeo', 'cristiano', 'leomessi',
  'a_friend_who_follows_back', 'cooking_with_sam', 'travel.diaries',
  'indie_band_official', 'design_inspo_daily', 'old_coworker_99',
  'random_meme_page', 'local_coffee_shop', 'photographer_jane',
];

loadSampleBtn.addEventListener('click', () => {
  // A quick local-only preview — doesn't require a keyword and doesn't sync.
  syncId = null;
  USERNAMES = SAMPLE_USERNAMES.slice();
  state = { index: 0, decisions: {} };
  saveState();
  showAppScreen();
  render();
});

// ---------------------------------------------------------------
// Init — resume a previous session if one exists
// ---------------------------------------------------------------
(async function init() {
  const saved = loadState();
  let savedCode = null;
  try { savedCode = localStorage.getItem(SYNC_CODE_KEY); } catch (e) {}

  if (savedCode) {
    syncCodeInput.value = savedCode;
    syncId = Sync.idFromCode(savedCode);
    let cloud = null;
    try {
      cloud = await Sync.load(syncId);
    } catch (e) {
      // offline / unreachable — fall back to local cache below
    }

    if (cloud && Array.isArray(cloud.usernames) && cloud.usernames.length > 0) {
      USERNAMES = cloud.usernames;
      state = { index: cloud.index || 0, decisions: cloud.decisions || {} };
      saveState();
      showAppScreen();
      render();
      return;
    }

    if (saved && Array.isArray(saved.usernames) && saved.usernames.length > 0) {
      USERNAMES = saved.usernames;
      state = { index: saved.index, decisions: saved.decisions };
      showAppScreen();
      render();
      return;
    }

    showStartScreen();
    return;
  }

  if (saved && Array.isArray(saved.usernames) && saved.usernames.length > 0) {
    USERNAMES = saved.usernames;
    state = { index: saved.index, decisions: saved.decisions };
    showAppScreen();
    render();
    return;
  }

  showStartScreen();
})();
