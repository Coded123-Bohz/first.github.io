/* Shared site behavior: navigation, theme preference, live status, sermon filtering, and local admin storage. */
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const goldTheme = document.createElement('link');
goldTheme.rel = 'stylesheet';
goldTheme.href = 'css/gold-theme.css';
document.head.appendChild(goldTheme);

const responsiveTheme = document.createElement('link');
responsiveTheme.rel = 'stylesheet';
responsiveTheme.href = 'css/responsive.css';
document.head.appendChild(responsiveTheme);

const flyerFavicon = document.createElement('link');
flyerFavicon.rel = 'icon';
flyerFavicon.type = 'image/jpeg';
flyerFavicon.href = 'js/IMG-20260912-WA0109.jpg';
document.head.appendChild(flyerFavicon);

const savedTheme = localStorage.getItem('church-theme');
if (savedTheme === 'dark') document.body.classList.add('dark');

$('.menu-toggle')?.addEventListener('click', () => {
  const nav = $('#site-nav');
  const isOpen = nav.classList.toggle('open');
  $('.menu-toggle').setAttribute('aria-expanded', String(isOpen));
});

$('.theme-toggle')?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('church-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
});

function getNigeriaTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}

function getLiveService() {
  const now = getNigeriaTime();
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const services = [{ day: 0, start: 8 * 60, end: 10 * 60 + 30, label: 'SUNDAY SERVICE' }, { day: 2, start: 17 * 60, end: 19 * 60, label: 'TUESDAY TEACHING' }, { day: 5, start: 22 * 60, end: 24 * 60, label: 'FRIDAY VIGIL' }];
  return services.find(service => service.day === day && minutes >= service.start && minutes <= service.end);
}

function updateLiveStatus() {
  const liveService = getLiveService();
  $$('.live-status').forEach(element => {
    element.hidden = !liveService;
    if (liveService) element.innerHTML = `<span class="live-badge">WE ARE LIVE NOW</span> ${liveService.label}`;
  });
  $$('.live-only').forEach(element => { element.hidden = !liveService; });
}
updateLiveStatus();

async function loadFacebookLive() {
  const playerContainer = $('#facebook-live-player');
  if (!playerContainer) return;
  try {
    const response = await fetch('/api/live', { cache: 'no-store' });
    const live = await response.json();
    $$('.live-status').forEach(element => {
      element.hidden = false;
      element.innerHTML = live.active ? '<span class="live-badge">WE ARE LIVE NOW</span> LIVE ON FACEBOOK' : 'LIVE BROADCASTS';
    });
    if (!live.active || !live.url) return;
    playerContainer.innerHTML = `<div class="fb-video" data-href="${live.url}" data-width="auto" data-allowfullscreen="true" data-autoplay="true"></div>`;
    const configResponse = await fetch('/api/meta-config', { cache: 'no-store' });
    const config = await configResponse.json();
    if (!config.appId) throw new Error('META_APP_ID is not configured');
    window.fbAsyncInit = () => {
      FB.init({ appId: config.appId, xfbml: true, version: 'v26.0' });
      FB.XFBML.parse(playerContainer);
    };
    if (!document.querySelector('script[data-meta-sdk]')) {
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.dataset.metaSdk = 'true';
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      document.body.appendChild(script);
    } else if (window.FB) {
      window.FB.XFBML.parse(playerContainer);
    }
  } catch (error) {
    console.warn('Facebook Live is unavailable:', error.message);
  }
}
loadFacebookLive();
setInterval(loadFacebookLive, 30000);

async function loadSermons() {
  const container = $('#sermon-list');
  if (!container) return;
  let sermons = [];
  try {
    const response = await fetch('data/sermons.json');
    sermons = await response.json();
  } catch (error) {
    sermons = [];
  }
  const localSermons = JSON.parse(localStorage.getItem('church-sermons') || '[]');
  const adminMessages = JSON.parse(localStorage.getItem('grace-truth-admin-content') || '[]')
    .filter(item => ['Message', 'Sermon'].includes(item.type))
    .map(item => ({ id: item.id, title: item.title, speaker: 'Grace & Truth Church', date: item.date || new Date(item.id).toISOString().slice(0, 10), category: item.type, duration: 'Read online', text: item.text || '', fileUrl: item.fileUrl || '', fileName: item.fileName || '', fileType: item.fileType || '' }));
  sermons = [...adminMessages, ...localSermons, ...sermons];
  const filters = { search: $('#sermon-search'), speaker: $('#speaker-filter'), topic: $('#topic-filter') };
  [...new Set(sermons.map(sermon => sermon.speaker))].forEach(speaker => filters.speaker?.insertAdjacentHTML('beforeend', `<option>${speaker}</option>`));
  [...new Set(sermons.map(sermon => sermon.category))].forEach(topic => filters.topic?.insertAdjacentHTML('beforeend', `<option>${topic}</option>`));
  const render = () => {
    const query = (filters.search?.value || '').toLowerCase();
    const result = sermons.filter(sermon => (!query || `${sermon.title} ${sermon.speaker}`.toLowerCase().includes(query)) && (!filters.speaker?.value || sermon.speaker === filters.speaker.value) && (!filters.topic?.value || sermon.category === filters.topic.value));
    container.innerHTML = result.length ? result.map(sermon => `<article class="sermon-card"><p class="eyebrow">${sermon.category}</p><h3>${sermon.title}</h3><div class="sermon-meta"><span>${sermon.speaker} · ${new Date(`${sermon.date}T12:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>${sermon.duration || 'Message'}</span></div>${sermon.text ? `<a class="text-link" href="message.html?id=${encodeURIComponent(sermon.id)}">Read message <span>→</span></a>` : sermon.audio ? `<audio class="audio-player" controls preload="none" src="${sermon.audio}"></audio>` : `<a class="text-link" target="_blank" rel="noreferrer" href="${sermon.video || '#'}">Watch message <span>↗</span></a>`}</article>`).join('') : '<p>No messages match those filters yet.</p>';
  };
  Object.values(filters).forEach(filter => filter?.addEventListener('input', render));
  render();
}
loadSermons();

$('#sermon-upload')?.addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const sermons = JSON.parse(localStorage.getItem('church-sermons') || '[]');
  sermons.unshift({ id: Date.now(), title: form.get('title'), speaker: form.get('speaker'), date: form.get('date'), category: form.get('category'), duration: 'New', audio: '', video: form.get('video'), transcript: '' });
  localStorage.setItem('church-sermons', JSON.stringify(sermons));
  $('#admin-message').textContent = 'Message saved in this browser. Connect a backend before production uploads.';
  event.currentTarget.reset();
});

$$('[data-payment]').forEach(button => button.addEventListener('click', () => {
  const provider = button.dataset.payment;
  alert(`${provider} checkout is ready to connect. Add your public key and checkout callback in main.js.`);
}));

$('#contact-form')?.addEventListener('submit', event => {
  event.preventDefault();
  $('#form-success').textContent = 'Thank you. Your message has been received, and the church will be in touch.';
  event.currentTarget.reset();
});
