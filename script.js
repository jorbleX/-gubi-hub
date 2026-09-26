/* GUBI Community Hub — existing API, new icy interface. */
const tg = window.Telegram?.WebApp;
const API_URL = 'https://gubi-hub.onrender.com';
const BOT_USERNAME = 'GubiCommunityBot';
let currentUser = null, activePage = 'home';
let leaderboard = [], myRank = null, leaderboardLoaded = false;
let missions = [], missionsLoaded = false;
let missionsError = '', leaderboardError = '';
let missionsRequest = null, leaderboardRequest = null;
let initializing = false, checkinPending = false;
const pendingClaims = new Set(), openedMissions = new Set();
const $ = selector => document.querySelector(selector);
const number = value => Math.max(0, Number(value) || 0);
const fmt = value => number(value).toLocaleString('en-US');
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10H14v-6h-4v6H3z"/>',
  missions: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2M9 11h6M9 16h6"/>',
  raids: '<path d="m4 3 16 16M3 4l3 5 3-3zM15 18l3-3M17 21l4-4M20 3 4 19M21 4l-3 5-3-3zM9 18l-3-3M7 21l-4-4"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 5 4M17 5h4v3a4 4 0 0 1-5 4M12 14v6M7 21h10"/>',
  profile: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/>',
  check: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4m-9 8 3 3 5-6"/>',
  send: '<path d="m3 10 18-7-6 18-4-7zM11 14 21 3"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3"/>'
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.missions}</svg>`; }
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
if (tg) { tg.ready(); tg.expand(); }
function escapeHtml(value = '') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function todayUTC() { return new Date().toISOString().slice(0,10); }
function displayName(user) { return user?.username ? `@${user.username}` : user?.first_name || 'GUBI Member'; }
function showMessage(message) { tg?.showAlert ? tg.showAlert(String(message)) : alert(message); }
function openLink(raw) {
  let url;
  try { url = new URL(raw); if (!['https:','http:'].includes(url.protocol)) throw new Error(); }
  catch { showMessage('This link is unavailable.'); return false; }
  if (url.hostname === 't.me' && tg?.openTelegramLink) tg.openTelegramLink(url.href);
  else if (tg?.openLink) tg.openLink(url.href);
  else window.open(url.href,'_blank','noopener,noreferrer');
  return true;
}
async function apiRequest(path, options = {}) {
  if (!tg?.initData) throw new Error('Open GUBI Hub from Telegram.');
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ ...(options.body || {}), initData: tg.initData })
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Invalid server response. Please try again.'); }
  if (!response.ok || !data.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function getReferralLink() { return currentUser?.telegram_id ? `https://t.me/${BOT_USERNAME}?start=ref_${currentUser.telegram_id}` : null; }
function shareReferral() {
  const link = getReferralLink();
  if (!link) return showMessage('Referral link unavailable.');
  openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me in the GUBI Community Hub. ❄️👀')}`);
}
async function copyReferralLink() {
  const link = getReferralLink();
  if (!link) return showMessage('Referral link unavailable.');
  let copied = false;
  try { await navigator.clipboard.writeText(link); copied = true; }
  catch {
    const field = document.createElement('textarea');
    field.value = link; field.style.cssText = 'position:fixed;top:0;left:-9999px';
    document.body.appendChild(field); field.select();
    try { copied = document.execCommand('copy'); } catch {} finally { field.remove(); }
  }
  if (copied) { tg?.HapticFeedback?.notificationOccurred('success'); showMessage('Invite link copied. ❄️'); }
  else showMessage('Could not copy. Select the invite link in your profile, or use Invite friend.');
}
function updateHeader() {
  if (!currentUser) return;
  const level = Math.max(1, number(currentUser.level));
  const progress = Math.min(100, number(currentUser.level_xp));
  $('#hello').textContent = `Welcome, ${currentUser.first_name || currentUser.username || 'GUBI'}.`;
  $('#level').textContent = level; $('#levelBadge').textContent = level;
  $('#xp').textContent = fmt(currentUser.xp);
  $('#streak').textContent = `${fmt(currentUser.streak)} ${number(currentUser.streak) === 1 ? 'day' : 'days'}`;
  const rank = currentUser.rank || myRank?.rank;
  $('#rank').textContent = rank ? `#${fmt(rank)}` : '—';
  $('#levelProgressText').textContent = `${progress} / 100 XP`;
  $('#levelProgress').value = progress;
}
function missionOpenedKey(id) { return `gubi_mission_opened_${currentUser?.telegram_id || 'user'}_${id}`; }
function missionWasOpened(id) { try { return openedMissions.has(missionOpenedKey(id)) || localStorage.getItem(missionOpenedKey(id)) === '1'; } catch { return openedMissions.has(missionOpenedKey(id)); } }
function markMissionOpened(id) { openedMissions.add(missionOpenedKey(id)); try { localStorage.setItem(missionOpenedKey(id),'1'); } catch {} }
function claimedToday() { return currentUser?.last_checkin === todayUTC(); }
function missionButton(mission) {
  const id = escapeHtml(mission.id);
  if (mission.status === 'completed' || mission.claimed || (mission.id === 'daily_checkin' && claimedToday())) return '<button class="completed" disabled>Completed</button>';
  if (mission.id === 'daily_checkin') return `<button class="primary" data-action="checkin" ${checkinPending ? 'disabled' : ''}>${checkinPending ? 'Claiming…' : 'CLAIM'}</button>`;
  if (mission.id === 'invite_friend') return '<button class="primary" data-action="invite">INVITE</button>';
  if (missionWasOpened(mission.id)) return `<button class="primary claimMissionBtn" data-action="claim" data-mission-id="${id}" ${pendingClaims.has(mission.id) ? 'disabled' : ''}>${pendingClaims.has(mission.id) ? 'Claiming…' : 'CLAIM'}</button>`;
  return `<button class="goMissionBtn" data-action="open-mission" data-mission-id="${id}" data-url="${escapeHtml(mission.action_url || '')}">GO →</button>`;
}
function missionRow(mission) {
  const symbol = mission.id === 'daily_checkin' ? 'check' : mission.id === 'invite_friend' ? 'people' : 'send';
  return `<div class="mission ${mission.id === 'daily_checkin' ? 'featured' : ''}"><span class="mission-icon">${icon(symbol)}</span><div class="mission-copy">${escapeHtml(mission.title)}<small>${escapeHtml(mission.description || '')}</small><small class="reward">+${fmt(mission.xp_reward)} XP</small></div>${missionButton(mission)}</div>`;
}
function errorBox(message, action) { return `<div class="notice">${escapeHtml(message)}<button class="secondary full" data-action="${action}">Try again</button></div>`; }
function homePage() {
  const daily = {id:'daily_checkin',title:'Daily check-in',description:claimedToday() ? 'Completed. See you tomorrow!' : 'Come back every day!',xp_reward:10};
  const social = missions.filter(m => !['daily_checkin','invite_friend'].includes(m.id)).slice(0,2);
  return `<div class="section-heading"><h2>${icon('missions')} Missions</h2><button class="text-button" data-action="navigate" data-target="missions">View all ›</button></div>
    ${missionRow(daily)}${social.map(missionRow).join('')}
    ${missionsError ? errorBox(missionsError,'retry-missions') : !missionsLoaded ? '<p class="subtle">Loading more missions…</p>' : ''}
    <div class="invite-banner"><div><b>Bring a friend.</b><p>${fmt(currentUser.referral_count)} friends invited</p></div><button class="secondary" data-action="invite">Invite</button></div>`;
}
function missionsPage() {
  return `<div class="section-heading"><h2>${icon('missions')} Missions</h2></div><p>Complete missions. Earn XP. Climb the ranks.</p>${missionsError ? errorBox(missionsError,'retry-missions') : !missionsLoaded ? '<p>Loading missions…</p>' : missions.length ? missions.map(missionRow).join('') + '<div class="notice">Open each social mission, complete the action, then return here to claim your XP.</div>' : '<div class="notice">No active missions right now.</div>'}`;
}
function raidsPage() { return `<div class="section-heading"><h2>${icon('raids')} Raids</h2></div><p>Find the latest from GUBI.</p><div class="mission"><span class="mission-icon">${icon('send')}</span><div class="mission-copy">Official GUBI on X<small>Check the latest posts.</small></div><button class="missionAction" data-action="link" data-url="https://x.com/ItsGubi">OPEN →</button></div><div class="notice">Community raids are coming. Active raids will appear here.</div>`; }
function getMedal(rank) { return ['🥇','🥈','🥉'][Number(rank)-1] || `#${fmt(rank)}`; }
function leadersPage() {
  const heading = `<div class="section-heading"><h2>${icon('trophy')} Leaderboard</h2><button class="text-button" data-action="refresh-ranks">Refresh</button></div>`;
  if (leaderboardError) return heading + errorBox(leaderboardError,'refresh-ranks');
  if (!leaderboardLoaded) return heading + '<p>Loading ranks…</p>';
  return heading + `<div class="mission rank-position"><div class="mission-copy">Your position</div><b>${myRank?.rank ? `#${fmt(myRank.rank)}` : '—'}</b></div>` + (leaderboard.length ? leaderboard.map(user => `<div class="mission ${String(user.telegram_id) === String(currentUser.telegram_id) ? 'rank-position' : ''}"><span class="rank-badge">${getMedal(user.rank)}</span><div class="mission-copy">${escapeHtml(displayName(user))}<small>${fmt(user.streak)} day streak</small></div><b class="xp">${fmt(user.xp)} XP</b></div>`).join('') : '<div class="notice">No members yet.</div>');
}
function profilePage() {
  const link = getReferralLink(), rank = currentUser.rank || myRank?.rank;
  const rows = [['Level',fmt(currentUser.level || 1)],['Total XP',fmt(currentUser.xp)],['Streak',`${fmt(currentUser.streak)} days`],['Rank',rank ? `#${fmt(rank)}` : '—'],['Friends invited',fmt(currentUser.referral_count)]];
  return `<div class="section-heading"><h2>${icon('profile')} Profile</h2></div><p class="profile-name"><b>${escapeHtml(displayName(currentUser))}</b></p>${rows.map(([label,value]) => `<div class="mission"><div class="mission-copy">${label}${label === 'Friends invited' ? '<small>+50 XP each</small>' : ''}</div><b class="xp">${value}</b></div>`).join('')}${link ? `<div class="notice referral-link">${escapeHtml(link)}</div><button class="primary full" data-action="invite">INVITE FRIEND</button><button class="secondary full" id="copyReferralBtn" data-action="copy">COPY INVITE LINK</button>` : ''}`;
}
function renderPage(page = activePage) {
  const pages = {home:homePage,missions:missionsPage,raids:raidsPage,leaders:leadersPage,profile:profilePage};
  activePage = pages[page] ? page : 'home';
  document.querySelectorAll('nav button').forEach(button => {
    const active = button.dataset.page === activePage;
    button.classList.toggle('active',active);
    if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
  });
  if (!currentUser) return;
  $('#screen').setAttribute('aria-busy', 'false');
  $('#screen').innerHTML = pages[activePage]();
}
async function navigate(page) {
  renderPage(page);
  if (!currentUser) return;
  if (page === 'missions' || page === 'home') await loadMissions();
  if (page === 'leaders') await loadLeaderboard();
}
async function loadMissions(force = false) {
  if (missionsRequest) return missionsRequest;
  if (missionsLoaded && !force) return;
  missionsError = '';
  // Retain the current user: a background missions response must not roll back newer XP.
  missionsRequest = (async () => {
    try { const data = await apiRequest('/api/missions'); missions = Array.isArray(data.missions) ? data.missions : []; missionsLoaded = true; }
    catch (error) { missionsError = error.message; }
    finally { missionsRequest = null; if (['home','missions'].includes(activePage)) renderPage(); }
  })();
  return missionsRequest;
}
async function loadLeaderboard(force = false) {
  if (leaderboardRequest) return leaderboardRequest;
  if (leaderboardLoaded && !force) return;
  leaderboardError = '';
  leaderboardRequest = (async () => {
    try {
      const data = await apiRequest('/api/leaderboard');
      leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
      myRank = data.me || null; leaderboardLoaded = true;
      if (currentUser) currentUser.rank = myRank?.rank || null;
      updateHeader();
    } catch (error) { leaderboardError = error.message; }
    finally { leaderboardRequest = null; if (activePage === 'leaders') renderPage(); }
  })();
  return leaderboardRequest;
}
async function refreshAfterReward() {
  // Finish any older requests before requesting post-reward snapshots.
  await Promise.allSettled([missionsRequest, leaderboardRequest].filter(Boolean));
  missionsLoaded = false; leaderboardLoaded = false;
  await Promise.all([loadMissions(true),loadLeaderboard(true)]);
}
async function claimCheckin() {
  if (checkinPending || claimedToday()) return;
  checkinPending = true; renderPage();
  try {
    const data = await apiRequest('/api/checkin');
    if (data.user) currentUser = data.user;
    updateHeader();
    tg?.HapticFeedback?.notificationOccurred('success');
    showMessage(data.already_claimed ? 'Already claimed today. ❄️' : `+${fmt(data.reward)} XP! 🔥`);
    await refreshAfterReward();
  } catch (error) { showMessage(error.message); }
  finally { checkinPending = false; renderPage(); }
}
function openMission(id, url) {
  if (!openLink(url)) return;
  markMissionOpened(id); renderPage();
}
async function claimMission(id) {
  if (!id || pendingClaims.has(id)) return;
  pendingClaims.add(id); renderPage();
  try {
    const data = await apiRequest('/api/claim-mission',{body:{missionId:id}});
    if (data.user) currentUser = data.user;
    updateHeader();
    tg?.HapticFeedback?.notificationOccurred('success');
    showMessage(data.already_claimed ? 'Mission already completed. ❄️' : `Mission complete! +${fmt(data.reward)} XP 🔥`);
    await refreshAfterReward();
  } catch (error) { showMessage(error.message); }
  finally { pendingClaims.delete(id); renderPage(); }
}
$('#screen').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const actions = {
    checkin:claimCheckin, invite:shareReferral, copy:copyReferralLink,
    claim:() => claimMission(button.dataset.missionId),
    'open-mission':() => openMission(button.dataset.missionId,button.dataset.url),
    link:() => openLink(button.dataset.url),
    navigate:() => navigate(button.dataset.target),
    'retry-missions':() => loadMissions(true),
    'refresh-ranks':() => loadLeaderboard(true),
    initialize:initializeGubi
  };
  actions[button.dataset.action]?.();
});
document.querySelectorAll('nav button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
async function initializeGubi() {
  if (initializing) return;
  initializing = true;
  $('#screen').setAttribute('aria-busy','true');
  $('#screen').innerHTML = '<h2>Entering the snow...</h2><p>Loading your GUBI profile.</p>';
  try {
    const data = await apiRequest('/api/me');
    if (!data.user) throw new Error('Profile unavailable. Please try again.');
    currentUser = data.user; updateHeader(); renderPage();
    loadLeaderboard(); loadMissions();
  } catch (error) {
    $('#screen').setAttribute('aria-busy','false');
    $('#screen').innerHTML = `<h2>Welcome to GUBI</h2><p>${escapeHtml(error.message)}</p><div class="notice">Open this Mini App from @${BOT_USERNAME} to load your profile.</div><button class="primary full" data-action="initialize">TRY AGAIN</button>`;
  } finally { initializing = false; }
}
initializeGubi();
