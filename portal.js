/* Standalone portal access for static hosting. Codes are visible in browser code, so use a backend for real security. */
const ADMIN_CODE = 'selectedfew';
const USER_CODE = 'lifeinchrist';
const portalSessionKey = 'grace-truth-portal-session';
const contentKey = 'grace-truth-admin-content';
const knowledgeKey = 'grace-truth-bible-knowledge';
const portalQuery = selector => document.querySelector(selector);

const responsiveTheme = document.createElement('link');
responsiveTheme.rel = 'stylesheet';
responsiveTheme.href = 'css/responsive.css';
document.head.appendChild(responsiveTheme);

const starterKnowledge = [
  { id: 'starter-1', question: 'Who is the head of the church?', answer: 'Jesus Christ is the head of the church. The church is His body and belongs under His authority.', reference: 'Ephesians 1:22-23 KJV' },
  { id: 'starter-2', question: 'What is grace and truth?', answer: 'Grace and truth came through Jesus Christ. Grace reveals God\'s undeserved favor, and truth reveals what is right and eternal in Him.', reference: 'John 1:17 KJV' },
  { id: 'starter-3', question: 'What should believers do with the doctrine of Christ?', answer: 'Believers should continue in the doctrine of Christ and remain faithful to His teaching in love.', reference: '2 John 1:9-11 KJV' }
];

function readContent() {
  return JSON.parse(localStorage.getItem(contentKey) || '[]');
}

function saveContent(items) {
  localStorage.setItem(contentKey, JSON.stringify(items));
}

function readKnowledge() {
  return [...starterKnowledge, ...JSON.parse(localStorage.getItem(knowledgeKey) || '[]')];
}

function saveKnowledge(items) {
  localStorage.setItem(knowledgeKey, JSON.stringify(items));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function getSession() {
  return sessionStorage.getItem(portalSessionKey);
}

function goToPortal(role) {
  sessionStorage.setItem(portalSessionKey, role);
  alert(role === 'admin' ? 'This is admin portal' : 'This is users portal');
  window.location.href = role === 'admin' ? 'admin.html' : 'user.html';
}

portalQuery('#login-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const code = String(form.get('portalCode') || '').trim();
  const message = portalQuery('#auth-message');
  if (code === ADMIN_CODE) return goToPortal('admin');
  if (code === USER_CODE) return goToPortal('user');
  message.textContent = 'Enter a valid portal code.';
});

function protectPage() {
  const role = getSession();
  const isMessageReader = location.pathname.endsWith('message.html');
  const pageRole = location.pathname.endsWith('admin.html') ? 'admin' : location.pathname.endsWith('user.html') ? 'user' : isMessageReader ? 'member' : null;
  if (!pageRole) return;
  if (isMessageReader) {
    if (!['admin', 'user'].includes(role)) return window.location.href = 'login.html';
    return renderMessage();
  }
  if (role !== pageRole) return window.location.href = 'login.html';
  const name = portalQuery('#user-name');
  if (name) name.textContent = role === 'admin' ? 'Administrator' : 'Member';
  renderContent();
}

function renderMessage() {
  const id = new URLSearchParams(location.search).get('id');
  const item = readContent().find(entry => String(entry.id) === String(id));
  const title = portalQuery('#message-title');
  const meta = portalQuery('#message-meta');
  const body = portalQuery('#message-body');
  if (!item || !title || !meta || !body) return;
  title.textContent = item.title;
  meta.textContent = `${item.type} · Grace & Truth Church`;
  body.innerHTML = `<p>${escapeHtml(item.text).replace(/\n/g, '<br>')}</p>`;
  if (item.fileUrl?.startsWith('data:')) body.insertAdjacentHTML('beforeend', `<a class="text-link" href="${item.fileUrl}" target="_blank" rel="noopener" download="${escapeHtml(item.fileName)}">Open attached file <span>↗</span></a>`);
}

function renderContent() {
  const list = portalQuery('#portal-content-list');
  if (!list) return;
  const items = readContent();
  list.innerHTML = items.length ? items.map(item => {
    const title = escapeHtml(item.title);
    const type = escapeHtml(item.type);
    const text = escapeHtml(item.text).replace(/\n/g, '<br>');
    const fileName = escapeHtml(item.fileName);
    const fileUrl = item.fileUrl && item.fileUrl.startsWith('data:') ? item.fileUrl : '';
    let fileView = '';
    if (fileUrl && item.fileType?.startsWith('audio/')) fileView = `<audio class="portal-audio" controls preload="metadata" src="${fileUrl}"></audio>`;
    else if (fileUrl && item.fileType === 'application/pdf') fileView = `<iframe class="portal-pdf" title="${fileName}" src="${fileUrl}"></iframe>`;
    else if (fileUrl && item.fileType?.startsWith('image/')) fileView = `<img class="portal-image" src="${fileUrl}" alt="${fileName}">`;
    if (fileUrl && !fileView) fileView = `<a class="text-link" href="${fileUrl}" target="_blank" rel="noopener" download="${fileName}">Open ${fileName} <span>↗</span></a>`;
    else if (fileUrl) fileView += `<a class="text-link" href="${fileUrl}" target="_blank" rel="noopener" download="${fileName}">Open or download ${fileName} <span>↗</span></a>`;
    return `<article class="portal-post"><p class="eyebrow">${type}</p><h3>${title}</h3><p>${text}</p>${fileView}</article>`;
  }).join('') : '<p class="notice">New church updates will appear here.</p>';
}

function words(value) {
  return new Set(String(value).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(word => word.length > 2));
}

function answerBibleQuestion(question) {
  const queryWords = words(question);
  let best = null;
  let bestScore = 0;
  readKnowledge().forEach(entry => {
    const entryWords = words(`${entry.question} ${entry.answer}`);
    const score = [...queryWords].filter(word => entryWords.has(word)).length;
    if (score > bestScore) { best = entry; bestScore = score; }
  });
  if (!best || bestScore < 1) return { answer: 'I do not have an answer for that question in the church study knowledge yet. Please ask the admin to add a Bible study entry.', reference: '' };
  return best;
}

portalQuery('#bible-question-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const input = portalQuery('#bible-question');
  const answerBox = portalQuery('#bible-answer');
  const question = input.value.trim();
  const result = answerBibleQuestion(question);
  answerBox.innerHTML = `<p>${escapeHtml(result.answer)}</p>${result.reference ? `<cite>${escapeHtml(result.reference)}</cite>` : ''}`;
  answerBox.hidden = false;
  input.value = '';
});

portalQuery('#admin-content-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const file = data.get('file');
  const item = { id: Date.now(), type: data.get('type'), title: data.get('title'), text: data.get('text'), fileName: '', fileType: '', fileUrl: '' };
  const finish = () => {
    const items = readContent();
    items.unshift(item);
    try {
      saveContent(items);
    } catch {
      portalQuery('#admin-message').textContent = 'This file is too large for browser storage. Use a smaller file or connect a real file-storage service.';
      return;
    }
    portalQuery('#admin-message').textContent = 'Saved on this device.';
    form.reset();
    renderContent();
  };
  if (file?.size) {
    const reader = new FileReader();
    if (file.size > 4 * 1024 * 1024) {
      portalQuery('#admin-message').textContent = 'Please choose a file smaller than 4 MB for this standalone portal.';
      return;
    }
    reader.onload = () => { item.fileName = file.name; item.fileType = file.type || 'application/octet-stream'; item.fileUrl = reader.result; finish(); };
    reader.readAsDataURL(file);
  } else finish();
});

portalQuery('#admin-knowledge-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const entries = JSON.parse(localStorage.getItem(knowledgeKey) || '[]');
  entries.unshift({ id: Date.now(), question: data.get('question'), answer: data.get('answer'), reference: data.get('reference') });
  saveKnowledge(entries);
  portalQuery('#knowledge-message').textContent = 'Bible answer saved for the assistant on this device.';
  event.currentTarget.reset();
});

portalQuery('#clear-content')?.addEventListener('click', () => {
  saveContent([]);
  renderContent();
});

portalQuery('#logout-button')?.addEventListener('click', () => {
  sessionStorage.removeItem(portalSessionKey);
  window.location.href = 'login.html';
});

protectPage();
