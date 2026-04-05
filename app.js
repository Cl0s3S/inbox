/* ============================================
   INBOX — app.js
   Life Dashboard module
   ============================================ */

'use strict';

/* ═══════════════════════════════════════════
   STORAGE
═══════════════════════════════════════════ */
const KEYS = {
  accounts: 'inbox_accounts_v1',
  rules:    'inbox_rules_v1',
  mails:    'inbox_mails_v1',
};

function load(key)       { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; } }
function save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

let accounts = load(KEYS.accounts);
let rules    = load(KEYS.rules);
let mails    = load(KEYS.mails);

/* ═══════════════════════════════════════════
   UTILS
═══════════════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  const h    = Math.floor(min / 60);
  const d    = Math.floor(h / 24);
  if (min < 1)   return "à l'instant";
  if (min < 60)  return `il y a ${min} min`;
  if (h < 24)    return `il y a ${h}h`;
  if (d < 7)     return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
}

function fullDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
}

function initials(label) {
  return label.trim().slice(0, 2).toUpperCase();
}

/* ═══════════════════════════════════════════
   MATCHING ENGINE
   — applique les règles sur un mail
═══════════════════════════════════════════ */
function matchRules(mail) {
  const matched = [];
  const hayFrom    = (mail.from    || '').toLowerCase();
  const haySub     = (mail.subject || '').toLowerCase();
  const hayNote    = (mail.note    || '').toLowerCase();
  const hayAll     = `${hayFrom} ${haySub} ${hayNote}`;

  for (const rule of rules) {
    let hit = false;

    if (rule.type === 'keyword' || rule.type === 'both') {
      const kws = (rule.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      if (kws.some(kw => hayAll.includes(kw))) hit = true;
    }

    if (rule.type === 'sender' || rule.type === 'both') {
      const senders = (rule.senders || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (senders.some(s => hayFrom.includes(s))) hit = true;
    }

    if (hit) matched.push(rule);
  }

  return matched;
}

/* ═══════════════════════════════════════════
   DATE HEADER
═══════════════════════════════════════════ */
document.getElementById('hdr-date').textContent =
  new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });

/* ═══════════════════════════════════════════
   STATS BAR
═══════════════════════════════════════════ */
function renderStats() {
  const el       = document.getElementById('stats-bar');
  const total    = mails.length;
  const unread   = mails.filter(m => !m.read).length;
  const today    = mails.filter(m => {
    const d = new Date(m.date);
    const n = new Date();
    return d.toDateString() === n.toDateString();
  }).length;
  const accounts_ = accounts.length;

  el.innerHTML = `
    <div class="sb-item"><div class="sb-lbl">total</div><div class="sb-val">${total}</div><div class="sb-sub">mails</div></div>
    <div class="sb-item"><div class="sb-lbl">non lus</div><div class="sb-val">${unread}</div><div class="sb-sub">en attente</div></div>
    <div class="sb-item"><div class="sb-lbl">aujourd'hui</div><div class="sb-val">${today}</div><div class="sb-sub">reçus</div></div>
    <div class="sb-item"><div class="sb-lbl">boîtes</div><div class="sb-val">${accounts_}</div><div class="sb-sub">Gmail</div></div>`;
}

/* ═══════════════════════════════════════════
   ACCOUNT FILTER PILLS
═══════════════════════════════════════════ */
let currentAccount = 'all';
let currentCat     = 'all';
let searchQuery    = '';
let sortMode       = 'date-desc';

function renderAccountPills() {
  const bar = document.getElementById('filter-accounts');
  bar.innerHTML = `<button class="filter-pill ${currentAccount === 'all' ? 'active' : ''}" data-account="all">toutes les boîtes</button>`;

  accounts.forEach(acc => {
    const btn = document.createElement('button');
    btn.className = `filter-pill ${currentAccount === acc.id ? 'active' : ''}`;
    btn.dataset.account = acc.id;
    btn.innerHTML = `<span class="pill-dot" style="background:${acc.color}"></span>${acc.label}`;
    bar.appendChild(btn);
  });

  bar.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      currentAccount = pill.dataset.account;
      renderAccountPills();
      renderMails();
    });
  });
}

/* ═══════════════════════════════════════════
   CAT TABS — dynamic (rules become tabs)
═══════════════════════════════════════════ */
function renderCatTabs() {
  const tabs = document.getElementById('cat-tabs');

  // Compute counts
  const filtered = getFilteredMails();
  const unreadCount = filtered.filter(m => !m.read).length;
  const allCount    = filtered.length;

  // Rule-based counts
  const ruleCounts = {};
  rules.forEach(r => {
    ruleCounts[r.id] = filtered.filter(m => (m.matchedRules || []).includes(r.id)).length;
  });

  tabs.innerHTML = `
    <button class="cat-tab ${currentCat === 'all' ? 'active' : ''}" data-cat="all">
      <span class="cat-tab-icon">📬</span> tous
      <span class="cat-tab-count">${allCount}</span>
    </button>
    <button class="cat-tab ${currentCat === 'unread' ? 'active' : ''}" data-cat="unread">
      <span class="cat-tab-icon">🔵</span> non lus
      <span class="cat-tab-count">${unreadCount}</span>
    </button>
    ${rules.map(r => `
      <button class="cat-tab ${currentCat === r.id ? 'active' : ''}" data-cat="${r.id}">
        <span class="cat-tab-icon" style="color:${r.color}">●</span> ${escHtml(r.name)}
        <span class="cat-tab-count">${ruleCounts[r.id] || 0}</span>
      </button>`).join('')}`;

  tabs.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentCat = tab.dataset.cat;
      renderCatTabs();
      renderMails();
    });
  });
}

/* ═══════════════════════════════════════════
   FILTERED MAILS
═══════════════════════════════════════════ */
function getFilteredMails() {
  let list = [...mails];

  // Account filter
  if (currentAccount !== 'all') {
    list = list.filter(m => m.accountId === currentAccount);
  }

  // Category / rule filter
  if (currentCat === 'unread') {
    list = list.filter(m => !m.read);
  } else if (currentCat !== 'all') {
    list = list.filter(m => (m.matchedRules || []).includes(currentCat));
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(m =>
      (m.subject || '').toLowerCase().includes(q) ||
      (m.from    || '').toLowerCase().includes(q) ||
      (m.note    || '').toLowerCase().includes(q)
    );
  }

  // Sort
  if (sortMode === 'date-desc') list.sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sortMode === 'date-asc')  list.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (sortMode === 'unread')    list.sort((a, b) => (a.read ? 1 : 0) - (b.read ? 1 : 0));

  return list;
}

/* ═══════════════════════════════════════════
   RENDER MAILS LIST
═══════════════════════════════════════════ */
function renderMails() {
  renderStats();
  renderCatTabs();

  const list  = document.getElementById('mails-list');
  const empty = document.getElementById('empty-state');
  const items = getFilteredMails();

  list.innerHTML = '';

  if (!items.length) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  items.forEach((mail, i) => {
    const acc       = accounts.find(a => a.id === mail.accountId);
    const matchedR  = rules.filter(r => (mail.matchedRules || []).includes(r.id));

    const tagsHtml = [
      acc ? `<span class="mail-account-chip" style="border-color:${acc.color}44;color:${acc.color}">${escHtml(acc.label)}</span>` : '',
      ...matchedR.map(r => `<span class="mail-tag" style="background:${r.color}18;color:${r.color};border:1px solid ${r.color}33">${escHtml(r.name)}</span>`),
    ].filter(Boolean).join('');

    const avatarInitials = acc ? initials(acc.label) : '?';
    const avatarColor    = acc ? acc.color : '#6b6a6f';

    const item = document.createElement('div');
    item.className = `mail-item ${!mail.read ? 'unread' : 'read-mail'}`;
    item.style.animationDelay = (i * 30) + 'ms';
    item.dataset.id = mail.id;

    item.innerHTML = `
      <div class="mail-unread-dot ${mail.read ? 'read' : ''}"></div>
      <div class="mail-avatar" style="background:${avatarColor}">${avatarInitials}</div>
      <div class="mail-content">
        <div class="mail-top">
          <div class="mail-from">${escHtml(mail.from)}</div>
          <div class="mail-date">${relativeDate(mail.date)}</div>
        </div>
        <div class="mail-subject">${escHtml(mail.subject)}</div>
        ${mail.note ? `<div class="mail-preview">${escHtml(mail.note)}</div>` : ''}
        ${tagsHtml ? `<div class="mail-tags">${tagsHtml}</div>` : ''}
      </div>
      <div class="mail-actions">
        <button class="mail-btn ${mail.read ? '' : 'mark-read'}" data-id="${mail.id}" title="${mail.read ? 'Marquer non lu' : 'Marquer lu'}">
          ${mail.read ? '○' : '✓'}
        </button>
        <button class="mail-btn del" data-id="${mail.id}" title="Supprimer">×</button>
      </div>`;

    // Click on mail body → open detail
    item.querySelector('.mail-content').addEventListener('click', () => openDetail(mail.id));
    item.querySelector('.mail-avatar').addEventListener('click', () => openDetail(mail.id));

    // Mark read/unread
    item.querySelector('.mail-btn:not(.del)').addEventListener('click', e => {
      e.stopPropagation();
      toggleRead(mail.id);
    });

    // Delete
    item.querySelector('.mail-btn.del').addEventListener('click', e => {
      e.stopPropagation();
      deleteMail(mail.id);
    });

    list.appendChild(item);
  });
}

/* ═══════════════════════════════════════════
   DETAIL MODAL
═══════════════════════════════════════════ */
function openDetail(mailId) {
  const mail = mails.find(m => m.id === mailId);
  if (!mail) return;

  // Auto-mark as read
  if (!mail.read) {
    mail.read = true;
    save(KEYS.mails, mails);
  }

  const acc      = accounts.find(a => a.id === mail.accountId);
  const matchedR = rules.filter(r => (mail.matchedRules || []).includes(r.id));

  document.getElementById('detail-subject').textContent = mail.subject;

  const accHtml = acc
    ? `<div class="detail-account-chip" style="background:${acc.color}18;border:1px solid ${acc.color}33">
        <div class="detail-dot" style="background:${acc.color}"></div>
        <span style="color:${acc.color};font-size:11px;font-family:var(--font-mono)">${escHtml(acc.label)}</span>
        <span style="color:var(--muted);font-size:10px">${escHtml(acc.email)}</span>
       </div>`
    : '—';

  const tagsHtml = matchedR.length
    ? matchedR.map(r => `<span class="mail-tag" style="background:${r.color}18;color:${r.color};border:1px solid ${r.color}33;font-size:11px;padding:3px 9px;border-radius:4px">${escHtml(r.name)}</span>`).join('')
    : '<span style="font-size:11px;color:var(--muted)">aucune règle</span>';

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-meta">
      <div class="detail-meta-row">
        <span class="detail-meta-lbl">boîte</span>
        ${accHtml}
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-lbl">de</span>
        <span class="detail-meta-val">${escHtml(mail.from)}</span>
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-lbl">date</span>
        <span class="detail-meta-val">${fullDate(mail.date)}</span>
      </div>
      <div class="detail-meta-row">
        <span class="detail-meta-lbl">règles</span>
        <div class="detail-tags">${tagsHtml}</div>
      </div>
    </div>
    ${mail.note ? `
      <div style="font-size:10px;color:var(--muted);letter-spacing:0.08em;margin-top:4px">note</div>
      <div class="detail-note">${escHtml(mail.note)}</div>` : ''}
    <div class="detail-actions-row">
      <button class="btn-detail" onclick="toggleRead('${mail.id}');document.getElementById('modal-detail').style.display='none';renderMails()">
        ${mail.read ? '○ marquer non lu' : '✓ marquer lu'}
      </button>
      <button class="btn-detail danger" onclick="deleteMail('${mail.id}');document.getElementById('modal-detail').style.display='none'">
        × supprimer
      </button>
    </div>`;

  document.getElementById('modal-detail').style.display = 'flex';
  renderMails();
}

document.getElementById('modal-detail-close').addEventListener('click', () => {
  document.getElementById('modal-detail').style.display = 'none';
});
document.getElementById('modal-detail').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

/* ═══════════════════════════════════════════
   ACTIONS
═══════════════════════════════════════════ */
function toggleRead(mailId) {
  const mail = mails.find(m => m.id === mailId);
  if (!mail) return;
  mail.read = !mail.read;
  save(KEYS.mails, mails);
  renderMails();
}

function deleteMail(mailId) {
  mails = mails.filter(m => m.id !== mailId);
  save(KEYS.mails, mails);
  renderMails();
  showToast('Mail supprimé');
}

window.toggleRead  = toggleRead;
window.deleteMail  = deleteMail;
window.openDetail  = openDetail;

/* ═══════════════════════════════════════════
   ADD MAIL MODAL
═══════════════════════════════════════════ */
let addIsRead = false;

function openAddModal() {
  addIsRead = false;
  document.getElementById('add-from').value    = '';
  document.getElementById('add-subject').value = '';
  document.getElementById('add-note').value    = '';
  document.getElementById('add-date').value    = new Date().toISOString().slice(0, 16);
  document.getElementById('detected-rules').style.display = 'none';
  document.querySelectorAll('.read-pill').forEach(p => p.classList.toggle('active', p.dataset.read === 'false'));

  // Populate account select
  const sel = document.getElementById('add-account');
  sel.innerHTML = '<option value="">-- choisir une boîte --</option>' +
    accounts.map(a => `<option value="${a.id}">${escHtml(a.label)} — ${escHtml(a.email)}</option>`).join('');

  document.getElementById('modal-add').style.display = 'flex';
  setTimeout(() => document.getElementById('add-from').focus(), 100);
}

document.getElementById('btn-open-add').addEventListener('click', openAddModal);
document.getElementById('btn-empty-add').addEventListener('click', openAddModal);
document.getElementById('modal-add-close').addEventListener('click', () => { document.getElementById('modal-add').style.display = 'none'; });
document.getElementById('modal-add').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'; });

// Read pills
document.querySelectorAll('.read-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    addIsRead = pill.dataset.read === 'true';
    document.querySelectorAll('.read-pill').forEach(p => p.classList.toggle('active', p === pill));
  });
});

// Auto-detect rules as user types
function detectRulesPreview() {
  const fakeMail = {
    from:    document.getElementById('add-from').value,
    subject: document.getElementById('add-subject').value,
    note:    document.getElementById('add-note').value,
  };
  const matched = matchRules(fakeMail);
  const detEl   = document.getElementById('detected-rules');
  const listEl  = document.getElementById('detected-rules-list');

  if (matched.length) {
    detEl.style.display = 'block';
    listEl.innerHTML = matched.map(r =>
      `<span class="detected-rule-badge" style="background:${r.color}18;color:${r.color};border:1px solid ${r.color}33">${escHtml(r.name)}</span>`
    ).join('');
  } else {
    detEl.style.display = 'none';
  }
}

['add-from','add-subject','add-note'].forEach(id => {
  document.getElementById(id).addEventListener('input', detectRulesPreview);
});

// Submit
document.getElementById('btn-add-submit').addEventListener('click', () => {
  const accountId = document.getElementById('add-account').value;
  const from      = document.getElementById('add-from').value.trim();
  const subject   = document.getElementById('add-subject').value.trim();
  const dateVal   = document.getElementById('add-date').value;
  const note      = document.getElementById('add-note').value.trim();

  if (!accountId) { showToast('Choisis une boîte mail'); return; }
  if (!from)      { showToast('Expéditeur obligatoire'); return; }
  if (!subject)   { showToast('Sujet obligatoire'); return; }

  const mail = {
    id: uid(),
    accountId,
    from,
    subject,
    note,
    date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    read: addIsRead,
    matchedRules: [],
  };

  // Apply rules
  const matched = matchRules(mail);
  mail.matchedRules = matched.map(r => r.id);

  mails.unshift(mail);
  save(KEYS.mails, mails);
  document.getElementById('modal-add').style.display = 'none';
  renderMails();

  const ruleNames = matched.map(r => r.name).join(', ');
  showToast(matched.length ? `Mail ajouté — règles: ${ruleNames}` : 'Mail ajouté ✓');
});

/* ═══════════════════════════════════════════
   SEARCH & SORT
═══════════════════════════════════════════ */
document.getElementById('search-mini').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderMails();
});

document.getElementById('sort-select').addEventListener('change', e => {
  sortMode = e.target.value;
  renderMails();
});

/* ═══════════════════════════════════════════
   SETTINGS PANEL
═══════════════════════════════════════════ */
document.getElementById('btn-settings').addEventListener('click', () => {
  renderSettingsPanel();
  document.getElementById('panel-settings').style.display = 'flex';
});
document.getElementById('panel-close').addEventListener('click', () => {
  document.getElementById('panel-settings').style.display = 'none';
});
document.getElementById('panel-settings').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

/* ── Accounts ── */
let newAccountColor = '#e2ff7c';

document.querySelectorAll('.acol').forEach(s => {
  s.addEventListener('click', () => {
    newAccountColor = s.dataset.color;
    document.querySelectorAll('.acol').forEach(x => x.classList.toggle('active', x === s));
  });
});

function renderAccountsList() {
  const el = document.getElementById('accounts-list');
  if (!accounts.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:8px 0">aucune boîte configurée</div>';
    return;
  }
  el.innerHTML = accounts.map(acc => `
    <div class="account-item">
      <div class="account-dot" style="background:${acc.color}"></div>
      <div style="flex:1;min-width:0">
        <div class="account-label">${escHtml(acc.label)}</div>
        <div class="account-email">${escHtml(acc.email)}</div>
      </div>
      <button class="account-del" data-id="${acc.id}">×</button>
    </div>`).join('');

  el.querySelectorAll('.account-del').forEach(btn => {
    btn.addEventListener('click', () => {
      accounts = accounts.filter(a => a.id !== btn.dataset.id);
      save(KEYS.accounts, accounts);
      renderAccountsList();
      renderAccountPills();
      renderMails();
      showToast('Boîte supprimée');
    });
  });
}

document.getElementById('btn-add-account').addEventListener('click', () => {
  const email = document.getElementById('new-account-email').value.trim();
  const label = document.getElementById('new-account-label').value.trim();

  if (!email) { showToast('Email obligatoire'); return; }
  if (!email.includes('@gmail.com')) { showToast('Doit être un @gmail.com'); return; }

  accounts.push({ id: uid(), email, label: label || email.split('@')[0], color: newAccountColor });
  save(KEYS.accounts, accounts);
  document.getElementById('new-account-email').value = '';
  document.getElementById('new-account-label').value = '';
  renderAccountsList();
  renderAccountPills();
  renderMails();
  showToast(`Boîte "${label || email}" ajoutée ✓`);
});

/* ── Rules ── */
let newRuleType  = 'keyword';
let newRuleColor = '#60a5fa';

document.querySelectorAll('.rule-type-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    newRuleType = pill.dataset.rtype;
    document.querySelectorAll('.rule-type-pill').forEach(p => p.classList.toggle('active', p === pill));
    document.getElementById('field-keywords').style.display = (newRuleType === 'sender') ? 'none' : 'flex';
    document.getElementById('field-senders').style.display  = (newRuleType === 'keyword') ? 'none' : 'flex';
  });
});

// Init field visibility
document.getElementById('field-senders').style.display = 'none';

document.querySelectorAll('.rcol').forEach(s => {
  s.addEventListener('click', () => {
    newRuleColor = s.dataset.color;
    document.querySelectorAll('.rcol').forEach(x => x.classList.toggle('active', x === s));
  });
});

function renderRulesList() {
  const el = document.getElementById('rules-list');
  if (!rules.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:8px 0">aucune règle configurée</div>';
    return;
  }
  el.innerHTML = rules.map(r => {
    const typeLbl = r.type === 'keyword' ? 'mot-clé' : r.type === 'sender' ? 'expéditeur' : 'les deux';
    const detail  = [
      r.keywords ? `🔑 ${r.keywords}` : '',
      r.senders  ? `📧 ${r.senders}` : '',
    ].filter(Boolean).join(' · ');
    return `
      <div class="rule-item">
        <div class="rule-color-dot" style="background:${r.color}"></div>
        <div class="rule-info">
          <div class="rule-name">${escHtml(r.name)}</div>
          <div class="rule-detail">${typeLbl} · ${detail}</div>
        </div>
        <button class="rule-del" data-id="${r.id}">×</button>
      </div>`;
  }).join('');

  el.querySelectorAll('.rule-del').forEach(btn => {
    btn.addEventListener('click', () => {
      rules = rules.filter(r => r.id !== btn.dataset.id);
      save(KEYS.rules, rules);
      // Re-apply rules to all mails
      reapplyAllRules();
      renderRulesList();
      renderCatTabs();
      renderMails();
      showToast('Règle supprimée');
    });
  });
}

document.getElementById('btn-add-rule').addEventListener('click', () => {
  const name     = document.getElementById('rule-name').value.trim();
  const keywords = document.getElementById('rule-keywords').value.trim();
  const senders  = document.getElementById('rule-senders').value.trim();

  if (!name) { showToast('Nom de la règle obligatoire'); return; }
  if (newRuleType === 'keyword' && !keywords) { showToast('Au moins un mot-clé'); return; }
  if (newRuleType === 'sender'  && !senders)  { showToast('Au moins un expéditeur'); return; }
  if (newRuleType === 'both' && !keywords && !senders) { showToast('Remplis mots-clés ou expéditeur'); return; }

  rules.push({
    id: uid(), name, type: newRuleType,
    keywords: keywords || '', senders: senders || '',
    color: newRuleColor,
  });
  save(KEYS.rules, rules);

  document.getElementById('rule-name').value     = '';
  document.getElementById('rule-keywords').value = '';
  document.getElementById('rule-senders').value  = '';

  // Re-apply rules to all existing mails
  reapplyAllRules();
  renderRulesList();
  renderCatTabs();
  renderMails();
  showToast(`Règle "${name}" ajoutée ✓`);
});

function reapplyAllRules() {
  mails.forEach(mail => {
    mail.matchedRules = matchRules(mail).map(r => r.id);
  });
  save(KEYS.mails, mails);
}

function renderSettingsPanel() {
  renderAccountsList();
  renderRulesList();
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
renderAccountPills();
renderMails();
