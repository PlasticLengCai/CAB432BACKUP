// public/app.js — A2-safe S3 upload (Cognito), verbose errors

console.log('[debug] app.js loaded');

window.addEventListener('error', (e) => {
  console.error('[debug] window.error', e.error || e.message || e);
  try { alert('JS error: ' + (e.message || String(e.error || e))); } catch (_) {}
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[debug] unhandledrejection', e.reason);
  try { alert('Promise error: ' + String(e.reason)); } catch (_) {}
});

let tokenA1 = null;
window.tokenA2 = window.tokenA2 || null;

const API = location.origin + '/api';
const $ = (id) => document.getElementById(id);

function authHeadersA1() { return tokenA1 ? { 'Authorization': 'Bearer ' + tokenA1 } : {}; }
function authHeadersA2() { return window.tokenA2 ? { 'Authorization': 'Bearer ' + window.tokenA2 } : {}; }

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function mkBtn(label, onClick) { const btn = document.createElement('button'); btn.textContent = label; btn.addEventListener('click', onClick); return btn; }
function humanMB(size) { if (!size && size !== 0) return '?'; return Math.round(size / 1024 / 1024) + ' MB'; }

// === A2: Cognito ===
function pickCognitoToken(payload) {
  const a = payload || {};
  const ar = a.AuthenticationResult || a.authResult || {};
  return (
    a.idToken || a.IdToken || a.id_token ||
    ar.IdToken || ar.idToken || ar.id_token ||
    null
  );
}
async function cg_signup() {
  const username = $('cg_username')?.value;
  const email = $('cg_email')?.value;
  const password = $('cg_password')?.value;
  const displayName = $('cg_display') ? $('cg_display').value : username;
  const resp = await fetch(API + '/cognito/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, displayName })
  });
  const data = await resp.json().catch(()=>({}));
  alert(resp.ok ? 'Sign-up OK. Check your email for the code.' : (data.error || 'Sign-up failed'));
}
async function cg_confirm() {
  const username = $('cg_username')?.value;
  const code = $('cg_code')?.value;
  const resp = await fetch(API + '/cognito/confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, code })
  });
  const data = await resp.json().catch(()=>({}));
  alert(resp.ok ? 'Confirmation OK.' : (data.error || 'Confirmation failed'));
}
async function cg_login() {
  const username = $('cg_username_login')?.value;
  const password = $('cg_password_login')?.value;
  const resp = await fetch(API + '/cognito/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await resp.json().catch(()=>({}));
  if (resp.status === 409 && data.challenge) { alert(`Login requires challenge: ${data.challenge}.`); return; }
  if (!resp.ok) { alert(data.error || 'Login failed'); return; }
  window.tokenA2 = pickCognitoToken(data);
  console.log('[cg_login] tokenA2 =', window.tokenA2 ? (window.tokenA2.split('.')[0] + '.<payload>.<sig>') : null);
  if (!window.tokenA2 || !/\w+\.\w+\.\w+/.test(window.tokenA2)) { alert('Cognito login returned no valid JWT'); return; }
  const w = $('cg_whoami'); if (w) w.textContent = 'Cognito login OK';
}

// ---- Debug to root /_debug ----
async function debug_echo() {
  const headers = { ...authHeadersA2() };
  if (!headers.Authorization) { alert('No ID token. Please login via Cognito first.'); return; }
  console.log('[debug] echo -> with bearer');
  const resp = await fetch(location.origin + '/_debug/echo', { headers });
  const data = await resp.json().catch(()=>({}));
  alert('echo:\n' + JSON.stringify(data, null, 2));
}
async function debug_verify() {
  const headers = { ...authHeadersA2() };
  if (!headers.Authorization) { alert('No ID token. Please login via Cognito first.'); return; }
  console.log('[debug] verify -> with bearer');
  const resp = await fetch(location.origin + '/_debug/verify', { headers });
  const txt = await resp.text();
  alert('verify:\nHTTP ' + resp.status + '\n' + txt);
}

// === A2: S3 ===
async function s3_upload(fileInputId = 'file', evt) {
  if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();

  const input =
    document.getElementById(fileInputId) ||
    document.querySelector(`input[type="file"][name="${fileInputId}"]`);
  const file = input?.files?.[0];

  console.log('[choose]', {
    hasInput: !!input,
    filesLen: input?.files?.length || 0,
    name: file?.name,
    size: file?.size
  });

  if (!file) {
    alert('need file to upload');
    return;
  }

  const resp = await fetch(`${API}/cloud/s3/upload-url`, {
    method: 'POST',
    headers: (() => {
      const h = { 'Content-Type': 'application/json', ...authHeadersA2() };
      return h;
    })(),
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'application/octet-stream'
    }),
    credentials: 'include'
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.url) {
    console.error('[presign failed]', resp.status, data);
    alert(data?.error || `get presigned url failed (${resp.status})`);
    return;
  }

  const putHeaders = new Headers(data.headers || {});
  if (!putHeaders.has('Content-Type')) {
    putHeaders.set('Content-Type', file.type || 'application/octet-stream');
  }

  console.log('[S3 PUT] ->', { url: data.url, headers: Object.fromEntries(putHeaders.entries()) });

  const putRes = await fetch(data.url, {
    method: 'PUT',
    headers: putHeaders,
    body: file
  });

  const putText = await putRes.text().catch(()=> '');
  if (!putRes.ok) {
    const m = putText.match(/<Code>([^<]+)<\/Code>/i);
    const code = m ? m[1] : 'UnknownError';
    console.error('[S3 PUT failed]', putRes.status, code, putText);
    alert(`S3 upload fail: ${putRes.status}\nCode=${code}\n${putText.slice(0, 300)}`);
    return;
  }

  console.log('[S3 PUT OK]', putRes.status, putRes.headers.get('ETag'));
  input.value = '';
  alert(`upload ok! key = ${data.key}`);

  const keyInput = document.getElementById('s3_key');
  if (keyInput) keyInput.value = data.key;
}

// === A2: DDB ===
async function ddb_create() {
  if (!window.tokenA2) return alert('Please login with Cognito (A2) first.');
  const videoId = $('s3_key')?.value?.split('/')?.pop() || 'demo-001';
  const title = $('s3_title')?.value || 'Untitled';
  const s3Key = $('s3_key')?.value;
  const meta = { title, s3Key };
  const headers = { ...authHeadersA2(), 'Content-Type': 'application/json' };
  const resp = await fetch(API + '/cloud/ddb/items', { method: 'POST', headers, body: JSON.stringify({ videoId, meta }) });
  const data = await resp.json().catch(()=>({}));
  alert(resp.ok ? ('Saved: ' + data.videoId) : (data.error || 'DynamoDB save failed'));
}
async function ddb_list() {
  if (!window.tokenA2) return alert('Please login with Cognito (A2) first.');
  const headers = authHeadersA2();
  const resp = await fetch(API + '/cloud/ddb/items', { headers });
  const data = await resp.json().catch(()=>({}));
  const list = $('ddb_list'); if (!list) return; list.innerHTML = '';
  (data.items || []).forEach(it => {
    const card = document.createElement('div'); card.className = 'card';
    const title = document.createElement('div'); title.innerHTML = `<strong>${escapeHtml(it.title || it.meta?.title || it.videoId)}</strong>`; card.appendChild(title);
    const vId = document.createElement('div'); vId.innerHTML = `<small>videoId: ${escapeHtml(it.videoId)}</small>`; card.appendChild(vId);
    const s3 = document.createElement('div'); const s3Key = it.s3Key || it.meta?.s3Key || ''; s3.innerHTML = `<small>s3Key: ${escapeHtml(s3Key)}</small>`; card.appendChild(s3);
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(mkBtn('Download (presigned)', () => downloadS3(s3Key)));
    row.appendChild(mkBtn('Delete', () => ddb_delete(it.videoId)));
    card.appendChild(row);
    const out = document.createElement('div'); out.id = `out_ddb_${it.videoId}`; card.appendChild(out);
    list.appendChild(card);
  });
}
async function downloadS3(key) {
  if (!window.tokenA2) return alert('Please login with Cognito (A2) first.');
  if (!key) return alert('No s3Key.');
  const headers = authHeadersA2();
  const resp = await fetch(API + '/cloud/s3/download-url/' + encodeURIComponent(key), { headers });
  const data = await resp.json().catch(()=>({}));
  if (!resp.ok) return alert(data.error || 'Failed to get download URL');
  const a = document.createElement('a'); a.href = data.url; a.target = '_blank'; a.rel = 'noreferrer'; a.click();
}
async function ddb_delete(videoId) {
  if (!window.tokenA2) return alert('Please login with Cognito (A2) first.');
  const headers = authHeadersA2();
  const resp = await fetch(API + '/cloud/ddb/items/' + encodeURIComponent(videoId), { method: 'DELETE', headers });
  const data = await resp.json().catch(()=>({}));
  alert(resp.ok ? 'Deleted' : (data.error || 'Delete failed'));
  ddb_list();
}

// === A1 (local) ===
async function login() {
  const username = $('username')?.value;
  const password = $('password')?.value;
  const resp = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await resp.json().catch(()=>({}));
  if (!resp.ok) return alert(data.error || 'Login failed');
  tokenA1 = data.token;
  const w = $('whoami'); if (w) w.textContent = 'Logged in as ' + (data.user?.username || username);
  loadFiles(1);
}
async function upload() {
  if (!tokenA1) return alert('Please login (A1) first.');
  const f = $('file')?.files?.[0];
  if (!f) return alert('Choose a file.');
  const fd = new FormData(); fd.append('file', f); fd.append('title', $('title')?.value || '');
  const resp = await fetch(API + '/upload', { method: 'POST', headers: authHeadersA1(), body: fd });
  const data = await resp.json().catch(()=>({}));
  if (!resp.ok) return alert(data.error || 'Upload failed');
  loadFiles(1);
}
async function loadFiles(page = 1) {
  if (!tokenA1) return;
  const q = $('q')?.value || ''; const sort = $('sort')?.value || 'uploadedAt'; const order = $('order')?.value || 'desc';
  const resp = await fetch(API + `/files?page=${page}&q=${encodeURIComponent(q)}&sort=${sort}&order=${order}`, { headers: authHeadersA1() });
  const data = await resp.json().catch(()=>({}));
  const box = $('files'); if (!box) return; box.innerHTML = '';
  (data.items || []).forEach(v => {
    const card = document.createElement('div'); card.className = 'card';
    const t = document.createElement('div'); t.innerHTML = `<strong>${escapeHtml(v.title || '')}</strong>`; card.appendChild(t);
    const meta = document.createElement('div'); meta.innerHTML = `<small>${escapeHtml(v.originalFilename || '')} (${humanMB(v.size)})</small>`; card.appendChild(meta);
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(mkBtn('Download original', () => downloadLocal(v.id, 'original')));
    row.appendChild(mkBtn('Transcode 720p (sync)', () => transcodeSync(v.id)));
    row.appendChild(mkBtn('Transcode 720p (async)', () => transcodeAsync(v.id)));
    row.appendChild(mkBtn('Generate thumbnails', () => thumbs(v.id)));
    row.appendChild(mkBtn('Show thumbnails', () => showThumbs(v.id)));
    row.appendChild(mkBtn('YouTube', () => yt(v.title || '', v.id)));
    row.appendChild(mkBtn('TMDB', () => tmdb(v.title || '', v.id)));
    row.appendChild(mkBtn('Pixabay', () => pixabay(v.title || '', v.id)));
    card.appendChild(row);
    const out = document.createElement('div'); out.id = `out_${v.id}`; card.appendChild(out);
    box.appendChild(card);
  });
}
function downloadLocal(id, variant) {
  const url = API + `/files/${id}/download?variant=${variant}`;
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noreferrer'; a.click();
}
async function transcodeSync(id) {
  const resp = await fetch(API + '/transcode/sync', {
    method: 'POST', headers: { ...authHeadersA1(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, resolution: '1280x720', format: 'mp4' })
  });
  const data = await resp.json().catch(()=>({})); $(`out_${id}`).textContent = JSON.stringify(data);
}
async function transcodeAsync(id) {
  const resp = await fetch(API + '/transcode', {
    method: 'POST', headers: { ...authHeadersA1(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, resolution: '1280x720', format: 'mp4' })
  });
  const data = await resp.json().catch(()=>({})); $(`out_${id}`).textContent = 'Job ' + data.jobId + ' ' + data.status;
}
async function thumbs(id) {
  const resp = await fetch(API + '/thumbnails', {
    method: 'POST', headers: { ...authHeadersA1(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, everyN: 10 })
  });
  const data = await resp.json().catch(()=>({}));
  const out = $(`out_${id}`); if (!resp.ok) out.textContent = data.error || 'Failed to generate thumbnails'; else out.textContent = 'Generated in ' + data.dir;
}
async function yt(q, vid) {
  const resp = await fetch(API + '/external/youtube?q=' + encodeURIComponent(q), { headers: authHeadersA1() });
  const data = await resp.json().catch(()=>({})); if (!resp.ok) { alert(data.error || 'YouTube error'); return; }
  renderResults('out_' + vid, data.items, 'YouTube');
}
async function tmdb(q, vid) {
  const resp = await fetch(API + '/external/tmdb/search?q=' + encodeURIComponent(q), { headers: authHeadersA1() });
  const data = await resp.json().catch(()=>({})); if (!resp.ok) { alert(data.error || 'TMDB error'); return; }
  renderResults('out_' + vid, data.items, 'TMDB');
}
async function pixabay(q, vid) {
  const resp = await fetch(API + '/external/pixabay/search?q=' + encodeURIComponent(q), { headers: authHeadersA1() });
  const data = await resp.json().catch(()=>({})); if (!resp.ok) { alert(data.error || 'Pixabay error'); return; }
  renderResults('out_' + vid, data.items, 'Pixabay');
}
async function showThumbs(id) {
  const resp = await fetch(API + `/files/${id}/thumbnails`, { headers: authHeadersA1() });
  const data = await resp.json().catch(()=>({}));
  const out = $(`out_${id}`);
  if (!resp.ok) { out.innerHTML = `<em>Failed: ${data.error || 'unknown'}</em>`; return; }
  const items = data.items || [];
  if (!items.length) { out.innerHTML = '<em>No thumbnails</em>'; return; }
  const grid = document.createElement('div'); grid.className = 'ext-grid';
  items.forEach(i => {
    const card = document.createElement('div'); card.className = 'ext-item';
    const img = document.createElement('img'); img.src = i.url; img.alt = i.file; card.appendChild(img);
    const src = document.createElement('div'); src.className = 'ext-source'; src.textContent = i.file; card.appendChild(src);
    grid.appendChild(card);
  });
  out.innerHTML = ''; out.appendChild(grid);
}

function bindDebugButtons() {
  const btnEcho = $('btnDebugEcho');
  const btnVerify = $('btnDebugVerify');
  let bound = 0;
  if (btnEcho && !btnEcho.__bound) { btnEcho.addEventListener('click', (e)=>{ e.preventDefault(); debug_echo(); }); btnEcho.__bound = true; bound++; console.log('[debug] bound #btnDebugEcho'); }
  if (btnVerify && !btnVerify.__bound) { btnVerify.addEventListener('click', (e)=>{ e.preventDefault(); debug_verify(); }); btnVerify.__bound = true; bound++; console.log('[debug] bound #btnDebugVerify'); }
  return bound > 0;
}
document.addEventListener('DOMContentLoaded', () => {
  const ok = bindDebugButtons();
  console.log('[debug] DOMContentLoaded -> bind', ok ? 'ok' : 'pending');

  // A2
  $('btn_cg_signup')?.addEventListener('click', cg_signup);
  $('btn_cg_confirm')?.addEventListener('click', cg_confirm);
  $('btn_cg_login')?.addEventListener('click', cg_login);
  $('btn_s3_upload')?.addEventListener('click', (e) => s3_upload('s3_file', e));
  $('btn_ddb_create')?.addEventListener('click', ddb_create);
  $('btn_ddb_list')?.addEventListener('click', ddb_list);

  // A1
  $('btn_login')?.addEventListener('click', login);
  $('btn_upload')?.addEventListener('click', upload);
  $('q')?.addEventListener('input', () => loadFiles(1));
  $('sort')?.addEventListener('change', () => loadFiles(1));
  $('order')?.addEventListener('change', () => loadFiles(1));
});
(function retryBindLoop() {
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    const ok = bindDebugButtons();
    if (ok || tries >= 30) {
      clearInterval(t);
      console.log('[debug] retry bind ended ->', ok ? 'ok' : 'not found');
    }
  }, 100);
})();
