import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import express from 'express';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const graphVersion = process.env.META_GRAPH_VERSION || 'v26.0';
const statePath = path.join(__dirname, 'data', 'live-state.json');
const usersPath = path.join(__dirname, 'data', 'users.json');
const scrypt = promisify(crypto.scrypt);
const sessionCookie = 'church_session';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.use((error, _request, response, next) => {
  if (error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  return next(error);
});

async function readLiveState() {
  try {
    return JSON.parse(await fs.readFile(statePath, 'utf8'));
  } catch {
    return { active: false, videoId: null, url: null, title: null, updatedAt: null };
  }
}

async function writeLiveState(state) {
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function readUsers() {
  try {
    return JSON.parse(await fs.readFile(usersPath, 'utf8'));
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  await fs.writeFile(usersPath, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash).split(':');
  if (!salt || !expected) return false;
  const actual = await scrypt(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'development-only-session-secret').update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readSession(request) {
  const cookies = Object.fromEntries((request.get('cookie') || '').split(';').filter(Boolean).map(cookie => {
    const [key, ...value] = cookie.trim().split('=');
    return [key, value.join('=')];
  }));
  const [encoded, signature] = String(cookies[sessionCookie] || '').split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET || 'development-only-session-secret').update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function setSession(response, user) {
  const value = signSession({ ...publicUser(user), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  response.setHeader('Set-Cookie', `${sessionCookie}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

function requireUser(request, response) {
  const session = readSession(request);
  if (!session) {
    response.status(401).json({ error: 'Sign in required.' });
    return null;
  }
  return session;
}

function isConfigured() {
  return Boolean(process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN && process.env.META_WEBHOOK_VERIFY_TOKEN);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getChangeValues(payload) {
  return (payload.entry || []).flatMap(entry => entry.changes || []).map(change => change.value || change);
}

function normaliseStatus(value) {
  return String(value || '').toLowerCase().replace(/[-_ ]/g, '');
}

function isStartStatus(status) {
  return ['live', 'live_now', 'started', 'broadcasting', 'published'].includes(status) || status.includes('live');
}

function isEndStatus(status) {
  return ['ended', 'complete', 'completed', 'finished', 'offline'].includes(status);
}

async function fetchLiveVideo(videoId) {
  const fields = 'id,permalink_url,status,title,description';
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${videoId}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('access_token', process.env.META_PAGE_ACCESS_TOKEN);
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error?.message || `Meta Graph API returned ${response.status}`);
  return result;
}

async function processLiveChange(value) {
  const status = normaliseStatus(value.status || value.event || value.action);
  const videoId = String(value.video_id || value.live_video_id || value.id || '');
  if (isEndStatus(status)) {
    await writeLiveState({ active: false, videoId: null, url: null, title: null, updatedAt: new Date().toISOString() });
    return;
  }
  if (!videoId || !isStartStatus(status)) return;

  let video = {};
  try {
    video = await fetchLiveVideo(videoId);
  } catch (error) {
    console.error('Could not resolve Meta live video:', error.message);
    return;
  }
  if (!video.permalink_url) {
    console.error('Meta returned no permalink for live video:', videoId);
    return;
  }
  await writeLiveState({
    active: true,
    videoId,
    url: video.permalink_url,
    title: video.title || 'Grace and Truth is live now',
    updatedAt: new Date().toISOString()
  });
}

app.get('/api/live', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.json(await readLiveState());
});

app.get('/api/meta-config', (_request, response) => {
  response.json({ appId: process.env.META_APP_ID || null });
});

app.post('/api/auth/signup', async (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = String(request.body.email || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  const adminCode = String(request.body.adminCode || '');
  if (!name || !isValidEmail(email) || password.length < 8) return response.status(400).json({ error: 'Enter a name, a valid email, and a password of at least 8 characters.' });
  const users = await readUsers();
  if (users.some(user => user.email === email)) return response.status(409).json({ error: 'An account with that email already exists.' });
  const user = { id: crypto.randomUUID(), name, email, role: adminCode === process.env.ADMIN_CODE ? 'admin' : 'user', passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
  users.push(user);
  await writeUsers(users);
  setSession(response, user);
  response.status(201).json({ user: publicUser(user), redirect: user.role === 'admin' ? '/admin.html' : '/user.html' });
});

app.post('/api/auth/login', async (request, response) => {
  const name = String(request.body.name || '').trim();
  const email = String(request.body.email || '').trim().toLowerCase();
  const password = String(request.body.password || '');
  const adminCode = String(request.body.adminCode || '');
  if (!name || !isValidEmail(email) || password.length < 8) return response.status(400).json({ error: 'Enter your name, a valid email, and a password of at least 8 characters.' });
  const users = await readUsers();
  let user = users.find(candidate => candidate.email === email);
  if (!user) {
    user = { id: crypto.randomUUID(), name, email, role: adminCode === process.env.ADMIN_CODE ? 'admin' : 'user', passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
    users.push(user);
    await writeUsers(users);
  } else if (!(await verifyPassword(password, user.passwordHash))) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const role = adminCode === process.env.ADMIN_CODE ? 'admin' : 'user';
  setSession(response, { ...user, role });
  response.json({ user: { ...publicUser(user), role }, redirect: role === 'admin' ? '/admin.html' : '/user.html' });
});

app.get('/api/auth/me', (request, response) => {
  const session = readSession(request);
  if (!session) return response.status(401).json({ error: 'Sign in required.' });
  response.json({ user: session });
});

app.post('/api/auth/logout', (_request, response) => {
  response.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  response.status(204).end();
});

app.get('/api/auth/admin', (request, response) => {
  const session = requireUser(request, response);
  if (!session) return;
  if (session.role !== 'admin') return response.status(403).json({ error: 'Admin access required.' });
  response.json({ user: session });
});

app.get('/webhooks/facebook', (request, response) => {
  const mode = request.query['hub.mode'];
  const token = request.query['hub.verify_token'];
  const challenge = request.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) return response.status(200).send(challenge);
  return response.sendStatus(403);
});

app.post('/webhooks/facebook', async (request, response) => {
  if (process.env.META_APP_SECRET) {
    const signature = request.get('x-hub-signature-256') || '';
    const expected = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(JSON.stringify(request.body)).digest('hex')}`;
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (!signature || signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return response.sendStatus(403);
  }
  response.sendStatus(200);
  try {
    if (request.body.object !== 'page') return;
    const changes = getChangeValues(request.body);
    for (const value of changes) await processLiveChange(value);
  } catch (error) {
    console.error('Facebook webhook processing failed:', error);
  }
});

app.get('/api/health', (_request, response) => response.json({ ok: true, metaConfigured: isConfigured() }));

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(port, () => {
  console.log(`Church website running at http://localhost:${port}`);
  if (!isConfigured()) console.warn('Meta Live is not configured. Copy .env.example to .env and add your values.');
});
