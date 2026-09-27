const BASE = window.BK_BASE || '';
const API = window.BK_API || '';

function appPath(path) {
  let p = String(path || '/');
  if (!p.startsWith('/')) p = `/${p}`;
  if (BASE) {
    const low = p.toLowerCase();
    const blow = BASE.toLowerCase();
    if (low === blow || low.startsWith(`${blow}/`)) p = p.slice(BASE.length) || '/';
  }
  return p || '/';
}

function url(path) {
  const p = appPath(path);
  if (!BASE) return p;
  return p === '/' ? `${BASE}/` : `${BASE}${p}`;
}

function publicHref(path) {
  return `${location.origin}${url(path)}`;
}

const DASH_TABS = [
  { id: 'meetings', label: 'Scheduled events', icon: '📅' },
  { id: 'events', label: 'Event types', icon: '🗓' },
  { id: 'availability', label: 'Availability', icon: '⏰' },
  { id: 'holidays', label: 'Holidays', icon: '🏖' },
  { id: 'integrations', label: 'Integrations', icon: '🔗' }
];

const state = {
  token: localStorage.getItem('bk_token') || '',
  user: null,
  route: '',
  dashTab: 'meetings',
  dashWeekly: null,
  eventMeta: null,
  availabilityDays: {},
  selectedYmd: '',
  selectedSlot: null,
  calMonth: null
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function toastErr(msg) {
  const el = $('#flash');
  if (!el) return;
  el.className = 'err';
  el.textContent = msg;
  el.classList.remove('hidden');
}
function toastOk(msg) {
  const el = $('#flash');
  if (!el) return;
  el.className = 'ok';
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearFlash() {
  const el = $('#flash');
  if (el) el.classList.add('hidden');
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function setAuth(token, user) {
  state.token = token || '';
  state.user = user || null;
  if (token) localStorage.setItem('bk_token', token);
  else localStorage.removeItem('bk_token');
  renderTop();
}

function parseRoute() {
  const path = appPath(location.pathname).replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (path === '/' || path === '') return { name: 'home' };
  if (parts[0] === 'dashboard') return { name: 'dashboard', tab: parts[1] || 'meetings' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'signup') return { name: 'signup' };
  if (parts[0] === 'cancel' && parts[1]) return { name: 'cancel', token: parts[1] };
  if (parts.length === 1) return { name: 'landing', slug: parts[0] };
  if (parts.length >= 2) return { name: 'book', slug: parts[0], eventSlug: parts[1] };
  return { name: 'home' };
}

function navigate(path, replace = false) {
  const next = url(path);
  if (replace) history.replaceState(null, '', next);
  else history.pushState(null, '', next);
  route();
}

function setMainMode(mode) {
  const main = $('.main');
  const footer = $('.footer-note');
  document.documentElement.classList.toggle('book-mode', mode === 'book');
  if (main) main.classList.toggle('dash-mode', mode === 'dashboard');
  if (footer) footer.classList.toggle('hidden', mode === 'dashboard' || mode === 'book');
}

function renderTop() {
  const actions = $('#top-actions');
  if (!actions) return;
  if (state.user) {
    actions.innerHTML = `
      <span class="muted">${escapeHtml(state.user.name)}</span>
      <a class="btn secondary" href="${url('/dashboard')}">Dashboard</a>
      <a class="btn secondary" href="${url('/settings')}">Settings</a>
      <button class="btn ghost" type="button" data-action="logout">Log out</button>
    `;
  } else {
    actions.innerHTML = `
      <a class="btn ghost" href="${url('/login')}">Log in</a>
      <a class="btn" href="${url('/signup')}">Get started</a>
    `;
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso, tz) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz || undefined,
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

function formatDateLong(iso, tz) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz || undefined,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(d) {
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function dashTitle(tab) {
  return DASH_TABS.find((t) => t.id === tab)?.label || 'Dashboard';
}

function sidebarHtml(tab) {
  return DASH_TABS.map(
    (t) => `
    <a href="${url(`/dashboard/${t.id}`)}" class="side-link ${tab === t.id ? 'active' : ''}" data-dash-tab="${t.id}">
      <span class="side-icon">${t.icon}</span>
      <span>${escapeHtml(t.label)}</span>
    </a>`
  ).join('');
}

async function ensureMe() {
  if (!state.token) return null;
  try {
    const data = await api('/api/me');
    state.user = data.user;
    return data.user;
  } catch {
    setAuth('', null);
    return null;
  }
}

function viewHome() {
  setMainMode('public');
  $('#app').innerHTML = `
    <section class="hero">
      <div class="brand" style="margin-bottom:0.5rem">
        <span class="brand-mark">B</span>
        <span>Book Karo</span>
      </div>
      <h1>Scheduling that feels effortless</h1>
      <p>Create your booking page, share the link, and let customers pick a time that works. Built for Easy Peeze.</p>
      <div class="hero-cta">
        <a class="btn" href="${url('/signup')}">Create your page</a>
        <a class="btn secondary" href="${url('/login')}">Log in</a>
      </div>
    </section>
    <div class="panel">
      <h2>How it works</h2>
      <div class="grid-2">
        <div>
          <h3>1. Set availability</h3>
          <p class="muted">Choose your weekly hours once. Book Karo only shows free slots.</p>
        </div>
        <div>
          <h3>2. Share your link</h3>
          <p class="muted">bookkaro.easypeeze.com/<strong>you</strong> - customers book without email ping-pong.</p>
        </div>
      </div>
    </div>
  `;
}

function viewAuth(mode) {
  setMainMode('public');
  const isSignup = mode === 'signup';
  $('#app').innerHTML = `
    <div class="panel" style="max-width:440px;margin-left:auto;margin-right:auto">
      <h2>${isSignup ? 'Create your Book Karo page' : 'Welcome back'}</h2>
      <p class="muted">${isSignup ? 'Pick a username for your public booking link.' : 'Log in to manage meetings.'}</p>
      <form id="auth-form">
        ${isSignup ? `
          <div class="field"><label>Your name</label><input name="name" required maxlength="80" /></div>
          <div class="field"><label>Business name</label><input name="businessName" required maxlength="80" placeholder="Book Karo" /></div>
          <div class="field"><label>Username (booking URL)</label><input name="slug" required pattern="[a-z0-9\\-]{2,48}" placeholder="acme-studio" /></div>
        ` : ''}
        <div class="field"><label>Email</label><input name="email" type="email" required /></div>
        <div class="field"><label>Password</label><input name="password" type="password" required minlength="8" /></div>
        ${isSignup ? `
          <div class="field"><label>Timezone</label>
            <select name="timezone">
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        ` : ''}
        <button class="btn" type="submit" style="width:100%">${isSignup ? 'Create account' : 'Log in'}</button>
      </form>
      <p class="muted" style="margin-top:1rem">${isSignup ? 'Already have an account?' : 'New here?'}
        <a href="${isSignup ? '/login' : '/signup'}">${isSignup ? 'Log in' : 'Sign up'}</a>
      </p>
    </div>
  `;
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFlash();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      const data = await api(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      setAuth(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      toastErr(err.message);
    }
  });
}

async function viewDashboard(tab) {
  if (!state.token) {
    navigate('/login');
    return;
  }
  await ensureMe();
  if (!state.user) {
    navigate('/login');
    return;
  }

  state.dashTab = tab || 'meetings';
  setMainMode('dashboard');
  const link = publicHref(`/${state.user.slug}`);

  $('#app').innerHTML = `
    <div class="dash-shell">
      <aside class="dash-sidebar">
        <div class="side-brand">
          <span class="brand-mark">B</span>
          <span>Book Karo</span>
        </div>
        <nav class="side-nav">${sidebarHtml(state.dashTab)}</nav>
        <div class="side-foot">
          <a class="side-link" href="${url(`/${state.user.slug}`)}" target="_blank">View booking page ↗</a>
        </div>
      </aside>
      <section class="dash-main">
        <header class="dash-header">
          <div>
            <h1>${escapeHtml(dashTitle(state.dashTab))}</h1>
            <p class="muted dash-linkline">
              ${escapeHtml(link)}
              <button type="button" class="linkish" data-action="copy-link">Copy</button>
            </p>
          </div>
        </header>
        <div class="panel dash-panel" id="dash-panel">Loading…</div>
      </section>
    </div>
  `;

  const panel = $('#dash-panel');
  if (state.dashTab === 'events') await renderEventsTab(panel);
  else if (state.dashTab === 'availability') await renderAvailabilityTab(panel);
  else if (state.dashTab === 'holidays') await renderHolidaysTab(panel);
  else if (state.dashTab === 'integrations') await renderIntegrationsTab(panel);
  else await renderMeetingsTab(panel);
}

async function renderMeetingsTab(panel) {
  try {
    const data = await api('/api/me/bookings');
    if (!data.bookings.length) {
      panel.innerHTML = `<p class="muted">No bookings yet. Share your booking page to get started.</p>`;
      return;
    }
    panel.innerHTML = `
      <table class="table">
        <thead><tr><th>When</th><th>Invitee</th><th>Event</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${data.bookings
            .map(
              (b) => `
            <tr>
              <td>${escapeHtml(formatDateLong(b.start, b.timezone))}<br><span class="muted">${escapeHtml(formatTime(b.start, b.timezone))}</span></td>
              <td>${escapeHtml(b.inviteeName)}<br><span class="muted">${escapeHtml(b.inviteeEmail)}</span></td>
              <td>${escapeHtml(b.eventName)}</td>
              <td>${escapeHtml(b.status)}</td>
              <td>${
                b.status === 'scheduled'
                  ? `<button type="button" class="btn secondary" data-action="cancel-booking" data-id="${escapeHtml(b.id)}">Cancel</button>`
                  : ''
              }</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    panel.innerHTML = `<div class="err">${escapeHtml(err.message)}</div>`;
  }
}

async function renderEventsTab(panel) {
  try {
    const data = await api('/api/me/event-types');
    panel.innerHTML = `
      <div class="dash-toolbar">
        <p class="muted" style="margin:0">Reusable meeting templates for your booking page.</p>
        <button type="button" class="btn" data-action="toggle-new-event">New event type</button>
      </div>
      <div class="event-list" style="margin-top:1rem">
        ${data.eventTypes
          .map(
            (e) => `
          <div class="event-card" style="cursor:default">
            <span class="event-dot" style="background:${escapeHtml(e.color)}"></span>
            <div style="flex:1">
              <h3>${escapeHtml(e.name)} ${e.active ? '' : '<span class="muted">(inactive)</span>'}</h3>
              <div class="event-meta">${e.durationMinutes} min · /${escapeHtml(state.user.slug)}/${escapeHtml(e.slug)}</div>
              <p class="muted">${escapeHtml(e.description || '')}</p>
              <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">
                <a class="btn secondary" href="${url(`/${state.user.slug}/${e.slug}`)}" target="_blank">Preview</a>
                <button type="button" class="btn ghost" data-action="toggle-event" data-id="${escapeHtml(e.id)}" data-active="${e.active}">${e.active ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          </div>`
          )
          .join('')}
      </div>
      <form id="new-event" class="hidden" style="margin-top:1rem;border-top:1px solid var(--line);padding-top:1rem">
        <h3>New event type</h3>
        <div class="field"><label>Name</label><input name="name" required placeholder="Discovery Call" /></div>
        <div class="field"><label>Duration (minutes)</label><input name="durationMinutes" type="number" min="5" max="480" value="30" /></div>
        <div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>
        <button class="btn" type="submit">Create</button>
      </form>
    `;
  } catch (err) {
    panel.innerHTML = `<div class="err">${escapeHtml(err.message)}</div>`;
  }
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function paintAvailabilityRows(rows, weekly) {
  rows.innerHTML = DAYS.map((d) => {
    const wins = weekly[d] || [];
    return `
      <div class="day-row" data-day="${d}">
        <strong>${d}</strong>
        <div class="windows">
          ${
            wins.length
              ? wins
                  .map(
                    (w, i) => `
            <span class="window-chip">
              <input data-i="${i}" data-k="start" value="${escapeHtml(w.start)}" />
              <span>-</span>
              <input data-i="${i}" data-k="end" value="${escapeHtml(w.end)}" />
              <button type="button" class="linkish" data-action="remove-window" data-i="${i}">×</button>
            </span>`
                  )
                  .join('')
              : '<span class="muted">Unavailable</span>'
          }
          <button type="button" class="linkish" data-action="add-window">Add hours</button>
        </div>
      </div>`;
  }).join('');
}

async function renderAvailabilityTab(panel) {
  try {
    const avail = await api('/api/me/availability');
    state.dashWeekly = JSON.parse(JSON.stringify(avail.weekly || {}));
    panel.innerHTML = `
      <p class="muted">Invitees only see times inside these windows (timezone: ${escapeHtml(avail.timezone)}).</p>
      <form id="avail-form">
        <div id="day-rows"></div>
        <div class="grid-2" style="margin-top:1rem">
          <div class="field"><label>Minimum notice (minutes)</label><input name="minNoticeMinutes" type="number" value="${avail.minNoticeMinutes || 60}" /></div>
          <div class="field"><label>How far ahead (days)</label><input name="maxDaysAhead" type="number" value="${avail.maxDaysAhead || 60}" /></div>
          <div class="field"><label>Buffer before (minutes)</label><input name="bufferBefore" type="number" value="${avail.bufferBefore || 0}" /></div>
          <div class="field"><label>Buffer after (minutes)</label><input name="bufferAfter" type="number" value="${avail.bufferAfter || 0}" /></div>
        </div>
        <button class="btn" type="submit">Save availability</button>
      </form>
    `;
    paintAvailabilityRows($('#day-rows'), state.dashWeekly);
  } catch (err) {
    panel.innerHTML = `<div class="err">${escapeHtml(err.message)}</div>`;
  }
}

async function renderHolidaysTab(panel) {
  try {
    const data = await api('/api/me/holidays');
    const holidays = data.holidays || [];
    panel.innerHTML = `
      <p class="muted">Block entire days or date ranges when you are unavailable (vacation, public holidays).</p>
      <form id="holiday-form" class="grid-2" style="align-items:end;margin-bottom:1rem">
        <div class="field"><label>Holiday name</label><input name="name" required placeholder="Diwali break" /></div>
        <div class="field"><label>Start date</label><input name="startDate" type="date" required /></div>
        <div class="field"><label>End date</label><input name="endDate" type="date" required /></div>
        <div><button class="btn" type="submit">Add holiday</button></div>
      </form>
      <div id="holiday-list">
        ${
          holidays.length
            ? `<table class="table"><thead><tr><th>Name</th><th>Dates</th><th></th></tr></thead><tbody>
              ${holidays
                .map(
                  (h) => `
                <tr>
                  <td>${escapeHtml(h.name)}</td>
                  <td>${escapeHtml(h.startDate)}${h.endDate !== h.startDate ? ` to ${escapeHtml(h.endDate)}` : ''}</td>
                  <td><button type="button" class="btn ghost" data-action="delete-holiday" data-id="${escapeHtml(h.id)}">Remove</button></td>
                </tr>`
                )
                .join('')}
              </tbody></table>`
            : '<p class="muted">No holidays added yet.</p>'
        }
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div class="err">${escapeHtml(err.message)}</div>`;
  }
}

async function renderIntegrationsTab(panel) {
  try {
    const params = new URLSearchParams(location.search);
    const connected = params.get('connected') === '1';
    const errCode = params.get('error');
    if (connected || errCode) {
      history.replaceState(null, '', '/dashboard/integrations');
    }

    const data = await api('/api/me/integrations');
    const g = data.googleCalendar || {};
    panel.innerHTML = `
      ${connected ? '<div class="ok">Google Calendar connected.</div>' : ''}
      ${errCode ? `<div class="err">Could not connect Google Calendar (${escapeHtml(errCode)}).</div>` : ''}
      <div class="integration-card">
        <div class="integration-head">
          <div class="integration-logo">G</div>
          <div>
            <h3 style="margin:0">Google Calendar</h3>
            <p class="muted" style="margin:0.25rem 0 0">Sync busy times so invitees never book over existing events.</p>
          </div>
        </div>
        <p class="muted"><strong>Scope:</strong> ${escapeHtml(g.scope || 'https://www.googleapis.com/auth/calendar')}</p>
        ${
          g.connected
            ? `<div class="ok">Connected as ${escapeHtml(g.email || 'Google account')}</div>
               <button type="button" class="btn secondary" data-action="disconnect-google">Disconnect</button>`
            : `<button type="button" class="btn" data-action="connect-google" ${g.configured ? '' : 'disabled'}>
                 ${g.configured ? 'Connect Google Calendar' : 'Server OAuth not configured yet'}
               </button>
               ${g.configured ? '' : '<p class="muted">Ask admin to set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Cloud Run.</p>'}`
        }
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `<div class="err">${escapeHtml(err.message)}</div>`;
  }
}

function companyFieldsHtml() {
  const u = state.user || {};
  return `
    <h3>Company info</h3>
    <form id="profile-form">
      <div class="field"><label>Business name</label><input name="businessName" value="${escapeHtml(u.businessName || '')}" required maxlength="80" placeholder="Book Karo" /></div>
      <div class="field"><label>Display name</label><input name="name" value="${escapeHtml(u.name || '')}" required /></div>
      <div class="field"><label>Email</label><input value="${escapeHtml(u.email || '')}" disabled /></div>
      <div class="field"><label>Username</label><input name="slug" value="${escapeHtml(u.slug || '')}" required /></div>
      <div class="field"><label>Bio</label><textarea name="bio" rows="3">${escapeHtml(u.bio || '')}</textarea></div>
      <div class="field"><label>Timezone</label><input name="timezone" value="${escapeHtml(u.timezone || 'Asia/Kolkata')}" /></div>
      <button class="btn" type="submit">Save company info</button>
    </form>
    <h3 style="margin-top:1.25rem">Password</h3>
    <form id="password-form">
      <div class="field"><label>Current password</label><input name="currentPassword" type="password" required /></div>
      <div class="field"><label>New password</label><input name="newPassword" type="password" required minlength="8" /></div>
      <div class="field"><label>Confirm new password</label><input name="confirmPassword" type="password" required minlength="8" /></div>
      <button class="btn" type="submit">Update password</button>
    </form>
  `;
}

async function viewLanding(slug) {
  setMainMode('public');
  try {
    const data = await api(`/api/public/${encodeURIComponent(slug)}`);
    $('#app').innerHTML = `
      <div class="panel" style="max-width:640px;margin:1rem auto">
        <div class="brand" style="margin-bottom:0.75rem">
          <span class="brand-mark" style="background:${escapeHtml(data.user.avatarColor)}">${escapeHtml(
            (data.user.name || '?').slice(0, 1).toUpperCase()
          )}</span>
          <span>${escapeHtml(data.user.name)}</span>
        </div>
        <p class="muted">${escapeHtml(data.user.bio || 'Select a meeting type')}</p>
        <div class="event-list" style="margin-top:1rem">
          ${
            data.eventTypes.length
              ? data.eventTypes
                  .map(
                    (e) => `
            <a class="event-card" href="${url(`/${slug}/${e.slug}`)}">
              <span class="event-dot" style="background:${escapeHtml(e.color)}"></span>
              <div>
                <h3>${escapeHtml(e.name)}</h3>
                <div class="event-meta">${e.durationMinutes} min</div>
                <p class="muted">${escapeHtml(e.description || '')}</p>
              </div>
            </a>`
                  )
                  .join('')
              : '<p class="muted">No active event types yet.</p>'
          }
        </div>
      </div>
    `;
  } catch (err) {
    $('#app').innerHTML = `<div class="panel"><div class="err">${escapeHtml(err.message)}</div></div>`;
  }
}

async function viewBook(slug, eventSlug) {
  setMainMode('book');
  try {
    const meta = await api(`/api/public/${encodeURIComponent(slug)}/${encodeURIComponent(eventSlug)}`);
    state.eventMeta = meta;
    state.selectedYmd = '';
    state.selectedSlot = null;
    state.calMonth = new Date();
    state.calMonth.setDate(1);

    $('#app').innerHTML = `
      <div class="panel booking-layout">
        <aside class="booking-side">
          <div class="host">${escapeHtml(meta.user.businessName || meta.user.name)}</div>
          <h2>${escapeHtml(meta.eventType.name)}</h2>
          <p>${meta.eventType.durationMinutes} min</p>
          <p style="opacity:0.85">${escapeHtml(meta.eventType.description || '')}</p>
          <div id="side-selection" class="muted" style="margin-top:1.5rem;color:#d7fffa"></div>
        </aside>
        <div class="booking-body" id="book-body"></div>
      </div>
    `;
    await loadAvailabilityMonth();
    renderBookStep();
  } catch (err) {
    $('#app').innerHTML = `<div class="panel"><div class="err">${escapeHtml(err.message)}</div></div>`;
  }
}

async function loadAvailabilityMonth() {
  const meta = state.eventMeta;
  const y = state.calMonth.getFullYear();
  const m = state.calMonth.getMonth();
  const from = ymdLocal(new Date(y, m, 1));
  const to = ymdLocal(new Date(y, m + 1, 0));
  const data = await api(
    `/api/public/${encodeURIComponent(meta.user.slug)}/${encodeURIComponent(meta.eventType.slug)}/availability?from=${from}&to=${to}`
  );
  state.availabilityDays = { ...state.availabilityDays, ...data.days };
}

function renderBookStep() {
  const body = $('#book-body');
  const side = $('#side-selection');
  const meta = state.eventMeta;
  if (!body) return;

  if (state.selectedSlot) {
    side.innerHTML = `<strong>${escapeHtml(formatDateLong(state.selectedSlot.start, meta.timezone))}</strong><br>${escapeHtml(
      formatTime(state.selectedSlot.start, meta.timezone)
    )}`;
    body.innerHTML = `
      <h3>Enter details</h3>
      <form id="book-form">
        <div class="field"><label>Name</label><input name="name" required /></div>
        <div class="field"><label>Email</label><input name="email" type="email" required /></div>
        <div class="field"><label>Notes (optional)</label><textarea name="notes" rows="3"></textarea></div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button type="button" class="btn secondary" data-action="back-slots">Back</button>
          <button type="submit" class="btn">Schedule event</button>
        </div>
      </form>
    `;
    return;
  }

  if (state.selectedYmd) {
    const slots = state.availabilityDays[state.selectedYmd] || [];
    side.innerHTML = `<strong>${escapeHtml(state.selectedYmd)}</strong>`;
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <h3 style="margin:0">Select a time</h3>
        <button type="button" class="btn secondary" data-action="back-cal">Back</button>
      </div>
      <p class="muted">Times shown in ${escapeHtml(meta.timezone)}</p>
      <div class="slots">
        ${
          slots.length
            ? slots
                .map(
                  (s) =>
                    `<button type="button" class="slot" data-action="pick-slot" data-start="${escapeHtml(s.start)}" data-end="${escapeHtml(s.end)}">${escapeHtml(
                      formatTime(s.start, meta.timezone)
                    )}</button>`
                )
                .join('')
            : '<p class="muted">No times this day.</p>'
        }
      </div>
    `;
    return;
  }

  side.innerHTML = '';
  const y = state.calMonth.getFullYear();
  const m = state.calMonth.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = ymdLocal(new Date());

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += `<button type="button" class="cal-day muted" disabled></button>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const available = !!(state.availabilityDays[ymd] && state.availabilityDays[ymd].length);
    const past = ymd < today;
    cells += `<button type="button" class="cal-day ${available ? 'available' : ''} ${
      state.selectedYmd === ymd ? 'selected' : ''
    }" data-action="pick-day" data-ymd="${ymd}" ${!available || past ? 'disabled' : ''}>${d}</button>`;
  }
  const filled = firstDow + daysInMonth;
  for (let i = filled; i < 42; i++) cells += `<button type="button" class="cal-day muted" disabled></button>`;

  body.innerHTML = `
    <div class="cal-nav">
      <button type="button" class="btn secondary" data-action="prev-month">‹</button>
      <strong>${escapeHtml(monthLabel(state.calMonth))}</strong>
      <button type="button" class="btn secondary" data-action="next-month">›</button>
    </div>
    <div class="cal-grid">
      ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  `;
}

async function viewCancel(token) {
  setMainMode('public');
  try {
    const data = await api(`/api/cancel/${encodeURIComponent(token)}`);
    const b = data.booking;
    $('#app').innerHTML = `
      <div class="panel" style="max-width:480px;margin:2rem auto">
        <h2>Cancel booking</h2>
        <p><strong>${escapeHtml(b.eventName)}</strong><br>
        ${escapeHtml(formatDateLong(b.start))} · ${escapeHtml(formatTime(b.start))}</p>
        <p class="muted">Status: ${escapeHtml(b.status)}</p>
        ${
          b.status === 'scheduled'
            ? `<button class="btn danger" type="button" data-action="do-cancel" data-token="${escapeHtml(token)}">Cancel event</button>`
            : `<div class="ok">This booking is already canceled.</div>`
        }
      </div>
    `;
  } catch (err) {
    $('#app').innerHTML = `<div class="panel"><div class="err">${escapeHtml(err.message)}</div></div>`;
  }
}

async function viewSettings() {
  if (!state.token) {
    navigate('/login');
    return;
  }
  await ensureMe();
  if (!state.user) {
    navigate('/login');
    return;
  }
  state.dashTab = '';
  setMainMode('dashboard');
  const link = publicHref(`/${state.user.slug}`);
  $('#app').innerHTML = `
    <div class="dash-shell">
      <aside class="dash-sidebar">
        <div class="side-brand">
          <span class="brand-mark">B</span>
          <span>Book Karo</span>
        </div>
        <nav class="side-nav">${sidebarHtml('')}</nav>
        <div class="side-foot">
          <a class="side-link" href="${url(`/${state.user.slug}`)}" target="_blank">View booking page ↗</a>
        </div>
      </aside>
      <section class="dash-main">
        <header class="dash-header">
          <div>
            <h1>Settings</h1>
            <p class="muted dash-linkline">
              ${escapeHtml(link)}
              <button type="button" class="linkish" data-action="copy-link">Copy</button>
            </p>
          </div>
        </header>
        <div class="panel dash-panel" id="dash-panel">${companyFieldsHtml()}</div>
      </section>
    </div>
  `;
}

async function route() {
  clearFlash();
  const r = parseRoute();
  state.route = r;
  renderTop();
  if (r.name === 'home') viewHome();
  else if (r.name === 'login') viewAuth('login');
  else if (r.name === 'signup') viewAuth('signup');
  else if (r.name === 'dashboard') {
    if (r.tab === 'profile' || r.tab === 'settings') {
      navigate('/settings', true);
      return;
    }
    await viewDashboard(r.tab || 'meetings');
  }
  else if (r.name === 'settings') await viewSettings();
  else if (r.name === 'landing') await viewLanding(r.slug);
  else if (r.name === 'book') await viewBook(r.slug, r.eventSlug);
  else if (r.name === 'cancel') await viewCancel(r.token);
  else viewHome();
}

document.addEventListener('click', async (e) => {
  const a = e.target.closest('a');
  if (a) {
    const href = a.getAttribute('href');
    if (href && href.startsWith('/') && !href.startsWith('http') && a.target !== '_blank') {
      e.preventDefault();
      navigate(href);
      return;
    }
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setAuth('', null);
    navigate('/');
    return;
  }

  if (action === 'copy-link' && state.user) {
    const link = publicHref(`/${state.user.slug}`);
    try {
      await navigator.clipboard.writeText(link);
      toastOk('Link copied');
    } catch {
      toastErr('Could not copy');
    }
    return;
  }

  if (action === 'cancel-booking') {
    if (!confirm('Cancel this meeting?')) return;
    try {
      await api(`/api/me/bookings/${btn.dataset.id}/cancel`, { method: 'POST', body: '{}' });
      toastOk('Meeting canceled');
      await renderMeetingsTab($('#dash-panel'));
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (action === 'toggle-new-event') {
    $('#new-event')?.classList.toggle('hidden');
    return;
  }

  if (action === 'toggle-event') {
    try {
      await api(`/api/me/event-types/${btn.dataset.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: btn.dataset.active !== 'true' })
      });
      await renderEventsTab($('#dash-panel'));
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (action === 'add-window') {
    const day = btn.closest('.day-row')?.dataset.day;
    if (!day) return;
    state.dashWeekly[day] = state.dashWeekly[day] || [];
    state.dashWeekly[day].push({ start: '09:00', end: '17:00' });
    paintAvailabilityRows($('#day-rows'), state.dashWeekly);
    return;
  }

  if (action === 'remove-window') {
    const day = btn.closest('.day-row')?.dataset.day;
    if (!day) return;
    state.dashWeekly[day].splice(Number(btn.dataset.i), 1);
    paintAvailabilityRows($('#day-rows'), state.dashWeekly);
    return;
  }

  if (action === 'delete-holiday') {
    try {
      const data = await api('/api/me/holidays');
      const holidays = (data.holidays || []).filter((h) => h.id !== btn.dataset.id);
      await api('/api/me/holidays', { method: 'PUT', body: JSON.stringify({ holidays }) });
      toastOk('Holiday removed');
      await renderHolidaysTab($('#dash-panel'));
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (action === 'connect-google') {
    try {
      const data = await api('/api/me/integrations/google/start');
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (action === 'disconnect-google') {
    if (!confirm('Disconnect Google Calendar?')) return;
    try {
      await api('/api/me/integrations/google', { method: 'DELETE' });
      toastOk('Disconnected');
      await renderIntegrationsTab($('#dash-panel'));
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (action === 'back-slots') {
    state.selectedSlot = null;
    renderBookStep();
    return;
  }

  if (action === 'back-cal') {
    state.selectedYmd = '';
    renderBookStep();
    return;
  }

  if (action === 'pick-slot') {
    state.selectedSlot = { start: btn.dataset.start, end: btn.dataset.end };
    renderBookStep();
    return;
  }

  if (action === 'pick-day') {
    state.selectedYmd = btn.dataset.ymd;
    renderBookStep();
    return;
  }

  if (action === 'prev-month') {
    state.calMonth.setMonth(state.calMonth.getMonth() - 1);
    await loadAvailabilityMonth();
    renderBookStep();
    return;
  }

  if (action === 'next-month') {
    state.calMonth.setMonth(state.calMonth.getMonth() + 1);
    await loadAvailabilityMonth();
    renderBookStep();
    return;
  }

  if (action === 'do-cancel') {
    try {
      await api(`/api/cancel/${encodeURIComponent(btn.dataset.token)}`, { method: 'POST', body: '{}' });
      toastOk('Booking canceled');
      await viewCancel(btn.dataset.token);
    } catch (err) {
      toastErr(err.message);
    }
  }
});

document.addEventListener('change', (e) => {
  const inp = e.target.closest('#day-rows input[data-i]');
  if (!inp || !state.dashWeekly) return;
  const day = inp.closest('.day-row')?.dataset.day;
  const i = Number(inp.dataset.i);
  if (!day || Number.isNaN(i)) return;
  state.dashWeekly[day][i][inp.dataset.k] = inp.value;
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === 'new-event') {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.durationMinutes = Number(body.durationMinutes);
    try {
      await api('/api/me/event-types', { method: 'POST', body: JSON.stringify(body) });
      toastOk('Event type created');
      await renderEventsTab($('#dash-panel'));
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (form.id === 'avail-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await api('/api/me/availability', {
        method: 'PUT',
        body: JSON.stringify({
          weekly: state.dashWeekly,
          minNoticeMinutes: Number(fd.get('minNoticeMinutes')),
          maxDaysAhead: Number(fd.get('maxDaysAhead')),
          bufferBefore: Number(fd.get('bufferBefore')),
          bufferAfter: Number(fd.get('bufferAfter'))
        })
      });
      toastOk('Availability saved');
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (form.id === 'holiday-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const startDate = String(fd.get('startDate'));
    const endDate = String(fd.get('endDate') || startDate);
    if (endDate < startDate) {
      toastErr('End date must be on or after start date');
      return;
    }
    try {
      const data = await api('/api/me/holidays');
      const holidays = [
        ...(data.holidays || []),
        {
          id: `h-${Date.now()}`,
          name: String(fd.get('name')),
          startDate,
          endDate
        }
      ];
      await api('/api/me/holidays', { method: 'PUT', body: JSON.stringify({ holidays }) });
      toastOk('Holiday added');
      await renderHolidaysTab($('#dash-panel'));
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (form.id === 'profile-form') {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      const data = await api('/api/me', {
        method: 'PATCH',
        body: JSON.stringify(Object.fromEntries(fd.entries()))
      });
      state.user = data.user;
      renderTop();
      toastOk('Company info saved');
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (form.id === 'password-form') {
    e.preventDefault();
    const fd = new FormData(form);
    const next = String(fd.get('newPassword') || '');
    if (next !== String(fd.get('confirmPassword') || '')) {
      toastErr('New passwords do not match');
      return;
    }
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: fd.get('currentPassword'),
          newPassword: next
        })
      });
      form.reset();
      toastOk('Password updated');
    } catch (err) {
      toastErr(err.message);
    }
    return;
  }

  if (form.id === 'book-form') {
    e.preventDefault();
    const meta = state.eventMeta;
    const fd = new FormData(form);
    try {
      const data = await api(
        `/api/public/${encodeURIComponent(meta.user.slug)}/${encodeURIComponent(meta.eventType.slug)}/book`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: fd.get('name'),
            email: fd.get('email'),
            notes: fd.get('notes'),
            start: state.selectedSlot.start
          })
        }
      );
      $('#book-body').innerHTML = `
        <h3>You are scheduled</h3>
        <div class="ok">
          <strong>${escapeHtml(data.booking.eventName)}</strong><br>
          ${escapeHtml(formatDateLong(data.booking.start, data.booking.timezone))}
          at ${escapeHtml(formatTime(data.booking.start, data.booking.timezone))}
        </div>
        <p class="muted">A confirmation was saved for ${escapeHtml(data.booking.inviteeEmail)}.</p>
        <p><a href="${escapeHtml(url(data.booking.cancelUrl || '/'))}">Cancel this booking</a></p>
      `;
    } catch (err) {
      toastErr(err.message);
    }
  }
});

window.addEventListener('popstate', route);

(async function init() {
  if (state.token) await ensureMe();
  renderTop();
  await route();
})();
