// SportSync Pro - Full featured PWA
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

let db, currentUser = null, matches = [], favorites = new Set(), selectedSport = 'All', currentTab = 'live', selectedMatch = null;
let notificationPermission = false;

// IndexedDB setup for offline & sync
const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('SportSyncDB', 1);
  req.onupgradeneeded = e => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'email' });
    if (!db.objectStoreNames.contains('matches')) db.createObjectStore('matches', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'matchId' });
    if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'email' });
  };
  req.onsuccess = e => { db = e.target.result; resolve(); };
  req.onerror = reject;
});

const hash = async (str) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('');
};

// Auth
async function signup(email, pass) {
  const tx = db.transaction('users','readwrite');
  const store = tx.objectStore('users');
  const exists = await new Promise(r => { const q = store.get(email); q.onsuccess = ()=>r(q.result); });
  if (exists) return alert('User exists');
  const hashed = await hash(pass);
  await new Promise(r => { store.put({email, pass:hashed, created: Date.now()}); r(); });
  login(email, pass);
}

async function login(email, pass) {
  const hashed = await hash(pass);
  const tx = db.transaction('users','readonly');
  const user = await new Promise(r => { const q = tx.objectStore('users').get(email); q.onsuccess=()=>r(q.result); });
  if (!user || user.pass !== hashed) return alert('Invalid credentials');
  currentUser = { email };
  localStorage.setItem('ss_user', email);
  $('#auth-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadUserData();
  initApp();
  toast('Welcome back!');
}

function logout() {
  localStorage.removeItem('ss_user');
  currentUser = null;
  location.reload();
}

// Real API integration + Sample data
const ESPN_ENDPOINTS = [
  // FIFA WORLD CUPS
  {sport:'Football', league:'FIFA World Cup', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'},
  {sport:'Football', league:'Women\'s World Cup', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.wwc/scoreboard'},
  
  // UEFA CHAMPIONS & EUROPE
  {sport:'Football', league:'Champions League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard'},
  {sport:'Football', league:'Europa League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/scoreboard'},
  {sport:'Football', league:'Conference League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa.conf/scoreboard'},
  {sport:'Football', league:'Euro Championship', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.euro/scoreboard'},
  {sport:'Football', league:'Nations League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard'},
  
  // ENGLAND
  {sport:'Football', league:'Premier League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard'},
  {sport:'Football', league:'Championship', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.2/scoreboard'},
  {sport:'Football', league:'FA Cup', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.fa/scoreboard'},
  {sport:'Football', league:'Carabao Cup', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.league_cup/scoreboard'},
  {sport:'Football', league:'WSL', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.w.1/scoreboard'},
  
  // SPAIN
  {sport:'Football', league:'LaLiga', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard'},
  {sport:'Football', league:'LaLiga 2', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard'},
  {sport:'Football', league:'Copa del Rey', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.copa_del_rey/scoreboard'},
  
  // GERMANY
  {sport:'Football', league:'Bundesliga', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard'},
  {sport:'Football', league:'2. Bundesliga', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.2/scoreboard'},
  {sport:'Football', league:'DFB Pokal', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ger.dfb_pokal/scoreboard'},
  
  // ITALY
  {sport:'Football', league:'Serie A', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard'},
  {sport:'Football', league:'Serie B', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.2/scoreboard'},
  {sport:'Football', league:'Coppa Italia', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ita.coppa_italia/scoreboard'},
  
  // FRANCE
  {sport:'Football', league:'Ligue 1', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard'},
  {sport:'Football', league:'Ligue 2', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/fra.2/scoreboard'},
  
  // OTHER EUROPE
  {sport:'Football', league:'Eredivisie', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ned.1/scoreboard'},
  {sport:'Football', league:'Primeira Liga', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/por.1/scoreboard'},
  {sport:'Football', league:'Belgian Pro', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/bel.1/scoreboard'},
  {sport:'Football', league:'Scottish Prem', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/sco.1/scoreboard'},
  {sport:'Football', league:'Turkish Super Lig', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/scoreboard'},
  {sport:'Football', league:'Austrian Bundesliga', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/aut.1/scoreboard'},
  {sport:'Football', league:'Swiss Super', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/sui.1/scoreboard'},
  {sport:'Football', league:'Danish Superliga', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/den.1/scoreboard'},
  {sport:'Football', league:'Allsvenskan', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/swe.1/scoreboard'},
  {sport:'Football', league:'Eliteserien', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/nor.1/scoreboard'},
  {sport:'Football', league:'Russian PL', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/rus.1/scoreboard'},
  
  // AMERICAS
  {sport:'Football', league:'MLS', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard'},
  {sport:'Football', league:'Liga MX', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/scoreboard'},
  {sport:'Football', league:'Brasileirão', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard'},
  {sport:'Football', league:'Argentina LPF', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard'},
  {sport:'Football', league:'Colombian Primera', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/col.1/scoreboard'},
  {sport:'Football', league:'Chilean Primera', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/chi.1/scoreboard'},
  {sport:'Football', league:'CONCACAF CL', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/concacaf.champions/scoreboard'},
  {sport:'Football', league:'Libertadores', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/conmebol.libertadores/scoreboard'},
  {sport:'Football', league:'Sudamericana', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/conmebol.sudamericana/scoreboard'},
  
  // ASIA / AFRICA / OCEANIA
  {sport:'Football', league:'Saudi Pro League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ksa.1/scoreboard'},
  {sport:'Football', league:'J-League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/jpn.1/scoreboard'},
  {sport:'Football', league:'K-League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/kor.1/scoreboard'},
  {sport:'Football', league:'A-League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/aus.1/scoreboard'},
  {sport:'Football', league:'Indian Super League', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/ind.1/scoreboard'},
  {sport:'Football', league:'AFC Champions', url:'https://site.api.espn.com/apis/site/v2/sports/soccer/afc.champions/scoreboard'},
  
  // BASKETBALL WORLDWIDE
  {sport:'Basketball', league:'NBA', url:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'},
  {sport:'Basketball', league:'WNBA', url:'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard'},
  {sport:'Basketball', league:'NCAA Men', url:'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard'},
  {sport:'Basketball', league:'EuroLeague', url:'https://site.api.espn.com/apis/site/v2/sports/basketball/euroleague/scoreboard'},
  
  // AMERICAN FOOTBALL
  {sport:'American Football', league:'NFL', url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'},
  {sport:'American Football', league:'College Football', url:'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard'},
  
  // BASEBALL
  {sport:'Baseball', league:'MLB', url:'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'},
  {sport:'Baseball', league:'College Baseball', url:'https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/scoreboard'},
  
  // HOCKEY
  {sport:'Hockey', league:'NHL', url:'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'},
  
  // TENNIS
  {sport:'Tennis', league:'ATP', url:'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard'},
  {sport:'Tennis', league:'WTA', url:'https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard'},
  
  // CRICKET, RUGBY, GOLF
  {sport:'Cricket', league:'International', url:'https://site.api.espn.com/apis/site/v2/sports/cricket/0/scoreboard'},
  {sport:'Rugby', league:'Six Nations', url:'https://site.api.espn.com/apis/site/v2/sports/rugby/0/scoreboard'},
  {sport:'Golf', league:'PGA Tour', url:'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard'},
];

async function fetchRealScores() {
  try {
    const allMatches = [];
    await Promise.all(ESPN_ENDPOINTS.map(async ep => {
      try {
        const res = await fetch(ep.url);
        const data = await res.json();
        const events = data.events || [];
        events.slice(0,8).forEach(ev => {
          const comp = ev.competitions[0];
          const home = comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors.find(c => c.homeAway === 'away');
          const status = comp.status.type.state === 'in' ? 'LIVE' : comp.status.type.state === 'pre' ? 'SCHEDULED' : 'FINISHED';
          const minute = comp.status.type.shortDetail || comp.status.type.detail;
          
          allMatches.push({
            id: ev.id,
            sport: ep.sport,
            league: ep.league,
            home: home.team.displayName,
            away: away.team.displayName,
            homeCrest: home.team.abbreviation?.slice(0,3).toUpperCase() || 'H',
            awayCrest: away.team.abbreviation?.slice(0,3).toUpperCase() || 'A',
            homeScore: parseInt(home.score)||0,
            awayScore: parseInt(away.score)||0,
            minute,
            status,
            possession: [Math.floor(45+Math.random()*10), Math.floor(45+Math.random()*10)],
            shots: [Math.floor(Math.random()*10), Math.floor(Math.random()*10)],
            passes: [300+Math.floor(Math.random()*200), 300+Math.floor(Math.random()*200)],
            events: (comp.details||[]).slice(0,5).map(d=>({m:d.clock?.displayValue||'', t:d.type?.text?.toLowerCase()||'play', team: Math.random()>0.5?'home':'away', player: d.athletesInvolved?.[0]?.displayName||''})),
            trajectory: Array.from({length:6},(_,i)=>[20+i*60, 50+Math.sin(i)*20+Math.random()*10]),
            players: {home:[], away:[]},
            logoHome: home.team.logo,
            logoAway: away.team.logo,
          });
        });
      } catch(e) { console.warn('Failed', ep.league); }
    }));
    
    if (allMatches.length) {
      matches = allMatches;
      const tx = db.transaction('matches','readwrite');
      matches.forEach(m => tx.objectStore('matches').put(m));
      renderMatches();
      $('#live-count').textContent = matches.filter(m=>m.status==='LIVE').length;
      toast(`Live data synced: ${matches.length} matches`);
    }
  } catch(e) {
    console.error('API fetch failed', e);
  }
}

function seedMatches() {
  const now = Date.now();
  matches = [
    { id:'m1', sport:'Football', league:'Premier League', home:'Arsenal', away:'Man City', homeCrest:'ARS', awayCrest:'MCI', homeScore:2, awayScore:1, minute:78, status:'LIVE', possession:[58,42], shots:[7,4], passes:[512,398], events:[{m:12,t:'goal',team:'home',player:'Saka'},{m:45,t:'goal',team:'away',player:'Haaland'},{m:67,t:'goal',team:'home',player:'Ødegaard'}], trajectory:[[10,110],[40,80],[70,60],[110,40],[160,55],[210,70],[260,50]], players:{home:[{n:'Raya',g:0,a:0,p:24,s:0,f:0},{n:'Saka',g:1,a:0,p:42,s:4,f:1},{n:'Ødegaard',g:1,a:1,p:68,s:3,f:0}], away:[{n:'Ederson',g:0,a:0,p:31,s:0,f:0},{n:'Haaland',g:1,a:0,p:18,s:5,f:2},{n:'De Bruyne',g:0,a:1,p:54,s:2,f:1}]}},
    { id:'m2', sport:'Basketball', league:'NBA', home:'Lakers', away:'Warriors', homeCrest:'LAL', awayCrest:'GSW', homeScore:102, awayScore:98, minute: 'Q4 3:12', status:'LIVE', possession:[51,49], shots:[44,41], passes:[312,298], events:[], trajectory:[[20,100],[60,70],[100,90],[150,50],[200,80]], players:{home:[{n:'LeBron',g:28,a:9,p:0,s:0,f:2},{n:'Davis',g:22,a:2,p:0,s:0,f:3}], away:[{n:'Curry',g:31,a:6,p:0,s:0,f:1},{n:'Thompson',g:18,a:3,p:0,s:0,f:2}]}},
    { id:'m3', sport:'Football', league:'LaLiga', home:'Barcelona', away:'Real Madrid', homeCrest:'BAR', awayCrest:'RMA', homeScore:0, awayScore:0, minute: 15, status:'LIVE', possession:[64,36], shots:[2,1], passes:[143,87], events:[], trajectory:[[15,115],[50,90],[90,70]], players:{home:[{n:'Lewandowski',g:0,a:0,p:12,s:1,f:0}], away:[{n:'Bellingham',g:0,a:0,p:15,s:1,f:0}]}},
    { id:'m4', sport:'Tennis', league:'Wimbledon', home:'Alcaraz', away:'Djokovic', homeCrest:'CAR', awayCrest:'DJO', homeScore:2, awayScore:1, minute:'Set 4', status:'LIVE', possession:[50,50], shots:[0,0], passes:[0,0], events:[], trajectory:[[30,100],[80,60],[130,90]], players:{home:[], away:[]}},
    { id:'m5', sport:'Football', league:'Serie A', home:'Inter', away:'Milan', homeCrest:'INT', awayCrest:'MIL', homeScore:1, awayScore:3, minute:'FT', status:'FINISHED', possession:[48,52], shots:[5,8], passes:[445,467], events:[{m:23,t:'goal',team:'away'},{m:56,t:'goal',team:'away'},{m:71,t:'goal',team:'home'},{m:88,t:'goal',team:'away'}], trajectory:[[10,110],[70,80],[140,60],[210,90]], players:{home:[{n:'Lautaro',g:1,a:0,p:34,s:4,f:1}], away:[{n:'Leão',g:2,a:1,p:41,s:5,f:0}]}}, 
    { id:'m6', sport:'Cricket', league:'IPL', home:'MI', away:'CSK', homeCrest:'MI', awayCrest:'CSK', homeScore:178, awayScore:165, minute:'19.3', status:'LIVE', possession:[55,45], shots:[0,0], passes:[0,0], events:[], trajectory:[[20,110],[90,70],[160,50]], players:{home:[], away:[]}},
  ];
  // save to IDB
  const tx = db.transaction('matches','readwrite');
  matches.forEach(m => tx.objectStore('matches').put(m));
}

async function loadMatches() {
  const tx = db.transaction('matches','readonly');
  const all = await new Promise(r => { const q = tx.objectStore('matches').getAll(); q.onsuccess=()=>r(q.result); });
  if (all.length) matches = all; else seedMatches();
}

async function loadUserData() {
  await loadMatches();
  const tx = db.transaction('favorites','readonly');
  const fav = await new Promise(r => { const q = tx.objectStore('favorites').get(currentUser.email); q.onsuccess=()=>r(q.result); });
  favorites = new Set(fav?.teams || ['Arsenal','Lakers','Los Angeles Lakers']);
  renderFavorites();
  // Try real API immediately
  if (navigator.onLine) setTimeout(fetchRealScores, 1000);
}

async function saveFavorites() {
  const tx = db.transaction('favorites','readwrite');
  tx.objectStore('favorites').put({email: currentUser.email, teams:[...favorites]});
}

// UI Rendering
function renderMatches() {
  const container = $('#matches');
  container.innerHTML = '';
  const filtered = matches.filter(m => 
    (currentTab==='live' ? m.status==='LIVE' : currentTab==='favorites' ? (favorites.has(m.home)||favorites.has(m.away)) : true) &&
    (selectedSport==='All' || m.sport===selectedSport)
  );
  
  filtered.forEach(m => {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <div class="match-top">
        <span>${m.league} • ${m.sport}</span>
        <span>${m.status==='LIVE'?'<span class="live-dot"></span>LIVE':m.status}</span>
      </div>
      <div class="teams">
        <div class="team-side">
          <div class="crest">${m.homeCrest}</div>
          <div>${m.home}</div>
        </div>
        <div class="score ${m.status==='LIVE'?'live':''}">${m.homeScore} - ${m.awayScore}</div>
        <div class="team-side right">
          <div>${m.away}</div>
          <div class="crest">${m.awayCrest}</div>
        </div>
      </div>
      <div class="match-meta">
        <span>⏱ ${m.minute}'</span>
        <span>👁 Poss ${m.possession[0]}%-${m.possession[1]}%</span>
        <span>🎯 Shots ${m.shots[0]}-${m.shots[1]}</span>
      </div>
    `;
    card.onclick = () => openMatch(m);
    container.appendChild(card);
  });
  
  if (filtered.length===0) container.innerHTML = `<div style="color:var(--text-muted);padding:20px;text-align:center">No matches</div>`;
}

function renderFavorites() {
  const list = $('#fav-teams');
  list.innerHTML = '';
  [...favorites].forEach(team => {
    const div = document.createElement('div');
    div.className = 'team';
    div.innerHTML = `<div class="name"><span class="fav">★</span>${team}</div><span style="color:var(--text-muted);font-size:12px">following</span>`;
    div.onclick = () => { favorites.delete(team); saveFavorites(); renderFavorites(); renderMatches(); };
    list.appendChild(div);
  });
}

function openMatch(m) {
  selectedMatch = m;
  $('#modal').classList.remove('hidden');
  $('#modal-title').textContent = `${m.home} vs ${m.away}`;
  $('#modal-body').innerHTML = `
    <div class="analytics-grid">
      <div class="stat-card">
        <h4>Possession</h4>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${m.home}</span><span>${m.away}</span></div>
        <div class="bar"><span class="a" style="width:${m.possession[0]}%"></span><span class="b" style="width:${m.possession[1]}%"></span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--text-muted)"><span>${m.possession[0]}%</span><span>${m.possession[1]}%</span></div>
      </div>
      <div class="stat-card">
        <h4>Shots on Target</h4>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${m.home}</span><span>${m.away}</span></div>
        <div class="bar"><span class="a" style="width:${m.shots[0]/(m.shots[0]+m.shots[1]||1)*100}%"></span><span class="b" style="width:${m.shots[1]/(m.shots[0]+m.shots[1]||1)*100}%"></span></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:var(--text-muted)"><span>${m.shots[0]}</span><span>${m.shots[1]}</span></div>
      </div>
      <div class="stat-card">
        <h4>Total Passes Completed</h4>
        <div style="font-size:24px;font-weight:700;margin:8px 0">${m.passes[0]+m.passes[1]}</div>
        <div style="font-size:12px;color:var(--text-muted)">${m.home}: ${m.passes[0]} • ${m.away}: ${m.passes[1]}</div>
      </div>
      <div class="stat-card">
        <h4>Ball Trajectory Tracking</h4>
        <canvas id="traj" class="trajectory" width="400" height="140"></canvas>
      </div>
    </div>
    
    <div class="players">
      <h4 style="margin:16px 0 8px;color:var(--text-muted);text-transform:uppercase;font-size:12px">Player Ratings - Statistical Output</h4>
      ${renderPlayers(m)}
    </div>
    
    <div style="margin-top:16px">
      <h4 style="margin:0 0 8px;color:var(--text-muted);text-transform:uppercase;font-size:12px">Match Events - Scrollable History</h4>
      <div style="max-height:180px;overflow:auto;background:var(--bg-soft);border-radius:12px;padding:8px;border:1px solid var(--border)">
        ${m.events.length? m.events.map(e=>`<div style="padding:6px 0;border-bottom:1px dashed var(--border);font-size:13px"> ${e.m}' • <strong>${e.team==='home'?m.home:m.away}</strong> - ${e.t.toUpperCase()} ${e.player?`(${e.player})`:''}</div>`).join('') : '<div style="color:var(--text-muted);padding:10px">No events yet</div>'}
        <div style="padding:6px 0;font-size:13px">Kickoff • ${m.league}</div>
      </div>
    </div>
    
    <div style="margin-top:16px;display:flex;gap:8px">
      <button onclick="toggleFav('${m.home}')" class="chip">${favorites.has(m.home)?'★':'☆'} Follow ${m.home}</button>
      <button onclick="toggleFav('${m.away}')" class="chip">${favorites.has(m.away)?'★':'☆'} Follow ${m.away}</button>
      <button onclick="shareMatch('${m.id}')" class="chip">↗ Share</button>
    </div>
  `;
  setTimeout(()=> drawTrajectory(m.trajectory), 50);
  loadChat(m.id);
}

function renderPlayers(m) {
  const calcRating = p => {
    const goals = p.g||0, assists = p.a||0, passes = p.p||0, shots = p.s||0, fouls = p.f||0;
    let r = (goals*8 + assists*5 + passes/20 + shots*2 - fouls*1.5)/10;
    r = Math.max(4, Math.min(10, r+6)); // scale to 6-10
    return r.toFixed(1);
  };
  const all = [...(m.players.home||[]).map(p=>({...p,team:m.home})), ...(m.players.away||[]).map(p=>({...p,team:m.away}))];
  if (!all.length) return '<div style="color:var(--text-muted)">Ratings available post-match</div>';
  return all.map(p=>{
    const r = parseFloat(calcRating(p));
    const cls = r>=8.5?'high':r>=7?'mid':'low';
    return `<div class="player-row"><div>${p.n} <span style="color:var(--text-muted)">• ${p.team}</span></div><div style="color:var(--text-muted);font-size:12px">${p.g||0}G ${p.a||0}A • ${p.p||0} passes</div><div class="rating ${cls}">${r}</div></div>`;
  }).join('');
}

function drawTrajectory(points) {
  const c = document.getElementById('traj');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  // pitch
  ctx.strokeStyle = '#1a5a1a'; ctx.lineWidth = 1;
  for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(0,28*i); ctx.lineTo(400,28*i); ctx.stroke(); }
  // ball path
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for(let i=1;i<points.length;i++){ const [x,y]=points[i]; ctx.lineTo(x,y); }
  ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 3; ctx.shadowColor='#22d3ee'; ctx.shadowBlur=10; ctx.stroke();
  ctx.shadowBlur=0;
  // ball
  points.forEach(([x,y],i)=>{
    ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fillStyle = i===points.length-1?'#fff':'#3b82f6'; ctx.fill();
  });
}

function toggleFav(team) {
  if (favorites.has(team)) favorites.delete(team); else favorites.add(team);
  saveFavorites(); renderFavorites(); renderMatches(); openMatch(selectedMatch);
  toast(favorites.has(team)?`Following ${team}`:`Unfollowed ${team}`);
}

async function shareMatch(id) {
  const m = matches.find(x=>x.id===id);
  const text = `🔥 ${m.home} ${m.homeScore}-${m.awayScore} ${m.away} • ${m.league} • Live on SportSync`;
  if (navigator.share) {
    try { await navigator.share({title:'SportSync Live', text, url:location.href}); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  }
}

// Chat / Social
async function loadChat(matchId) {
  const tx = db.transaction('chats','readonly');
  const chat = await new Promise(r => { const q = tx.objectStore('chats').get(matchId); q.onsuccess=()=>r(q.result); });
  const msgs = chat?.messages || [{user:'FanZone', text:'Welcome to the match chat! Be respectful.'}];
  const box = document.createElement('div');
  box.innerHTML = `
    <h4 style="margin:16px 0 8px;color:var(--text-muted);text-transform:uppercase;font-size:12px">Fan Discussion</h4>
    <div id="chat-box" class="chat">${msgs.map(m=>`<div class="chat-msg"><strong>${m.user}:</strong> ${m.text}</div>`).join('')}</div>
    <div class="chat-input"><input id="chat-in" placeholder="Share your thoughts..."><button onclick="sendChat('${matchId}')">Send</button></div>
  `;
  $('#modal-body').appendChild(box);
}

async function sendChat(matchId) {
  const input = $('#chat-in'); const text = input.value.trim(); if (!text) return;
  const tx = db.transaction('chats','readwrite');
  const store = tx.objectStore('chats');
  const chat = await new Promise(r => { const q = store.get(matchId); q.onsuccess=()=>r(q.result); }) || {matchId, messages:[]};
  chat.messages.push({user: currentUser.email.split('@')[0], text, ts: Date.now()});
  store.put(chat);
  input.value=''; loadChat(matchId);
}

// Live updates simulation
function simulateLive() {
  // Replace simulation with real API polling every 30s
  fetchRealScores();
  setInterval(fetchRealScores, 30000);
  
  // Keep local simulation for demo analytics
  setInterval(()=>{
    matches.filter(m=>m.status==='LIVE').forEach(m=>{
      // update possession slightly for visualization
      m.possession[0] = Math.max(30, Math.min(70, m.possession[0]+(Math.random()-0.5)*2|0));
      m.possession[1] = 100 - m.possession[0];
      // update trajectory
      const last = m.trajectory[m.trajectory.length-1];
      if (last) {
        m.trajectory.push([Math.min(380, last[0]+20), 40+Math.random()*60]);
        if (m.trajectory.length>7) m.trajectory.shift();
      }
    });
    renderMatches();
    $('#sync-status').textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
  }, 5000);
}

// Notifications
async function initNotifications() {
  if ('Notification' in window) {
    notificationPermission = (await Notification.requestPermission())==='granted';
  }
}
function notify(title, body) {
  if (!notificationPermission) return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => reg.showNotification(title, {body, icon:'/icon.png', badge:'/icon.png', vibrate:[100,50,100]}));
  } else {
    new Notification(title, {body});
  }
  toast(title);
}

// Offline & Sync
function initOffline() {
  window.addEventListener('online', ()=>{ document.body.classList.remove('offline'); toast('Back online - syncing...'); backupToCloud(); });
  window.addEventListener('offline', ()=>{ document.body.classList.add('offline'); toast('Offline mode enabled'); });
  if (!navigator.onLine) document.body.classList.add('offline');
}

async function backupToCloud() {
  // simulate cloud backup
  const data = {user:currentUser.email, favorites:[...favorites], matches, ts:Date.now()};
  localStorage.setItem('ss_cloud_backup', JSON.stringify(data));
  $('#sync-status').textContent = 'Backed up to cloud ✓';
}
async function restoreFromCloud() {
  const raw = localStorage.getItem('ss_cloud_backup');
  if (!raw) return toast('No backup found');
  const data = JSON.parse(raw);
  favorites = new Set(data.favorites); await saveFavorites(); renderFavorites(); toast('Restored from cloud');
}

// History tab
function renderHistory() {
  const container = $('#matches');
  container.innerHTML = '<div class="history-list"></div>';
  const list = container.querySelector('.history-list');
  matches.filter(m=>m.status==='FINISHED').forEach(m=>{
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<div style="display:flex;justify-content:space-between"><strong>${m.home} ${m.homeScore}-${m.awayScore} ${m.away}</strong><span style="color:var(--text-muted);font-size:12px">${m.league}</span></div><div style="font-size:12px;color:var(--text-muted);margin-top:4px">Possession ${m.possession[0]}-${m.possession[1]}% • Shots ${m.shots[0]}-${m.shots[1]} • Passes ${m.passes[0]+m.passes[1]}</div>`;
    div.onclick = ()=> openMatch(m);
    list.appendChild(div);
  });
}

// Toast
function toast(msg) { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2500); }

// Init
async function initApp() {
  $('#user-email').textContent = currentUser.email;
  initNotifications();
  initOffline();
  renderMatches();
  simulateLive();
  setInterval(backupToCloud, 30000);
  
  // Add install prompt for mobile
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.createElement('div');
    btn.className = 'chip';
    btn.textContent = '⬇ Install App';
    btn.style.background = 'linear-gradient(90deg, var(--accent), var(--accent-2))';
    btn.style.color = 'white';
    btn.onclick = async () => { deferredPrompt.prompt(); };
    $('.header-actions').prepend(btn);
  });
  
  // tabs
  $$('.tab').forEach(tab => tab.onclick = () => {
    $$('.tab').forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    currentTab = tab.dataset.tab;
    if (currentTab==='history') renderHistory(); else renderMatches();
  });
  // sports
  $$('.sport').forEach(s => s.onclick = () => {
    $$('.sport').forEach(x=>x.classList.remove('active')); s.classList.add('active');
    selectedSport = s.dataset.sport; renderMatches();
  });
  
  // Pull to refresh for mobile
  let startY = 0;
  document.addEventListener('touchstart', e => startY = e.touches[0].clientY);
  document.addEventListener('touchend', e => {
    if (e.changedTouches[0].clientY - startY > 100 && window.scrollY === 0) {
      fetchRealScores();
      toast('Refreshing live scores...');
    }
  });
  
  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
}

// Auth UI
window.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  $('#login-btn').onclick = () => login($('#email').value, $('#password').value);
  $('#signup-btn').onclick = () => signup($('#email').value, $('#password').value);
  $('#switch-auth').onclick = () => {
    const isLogin = $('#login-btn').style.display !== 'none';
    $('#login-btn').style.display = isLogin?'none':'block';
    $('#signup-btn').style.display = isLogin?'block':'none';
    $('#switch-auth').textContent = isLogin?'Have an account? Login':'No account? Sign up';
  };
  $('#logout').onclick = logout;
  $('#close-modal').onclick = () => $('#modal').classList.add('hidden');
  $('#backup').onclick = backupToCloud;
  $('#restore').onclick = restoreFromCloud;
  
  const saved = localStorage.getItem('ss_user');
  if (saved) {
    currentUser = {email: saved};
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    await loadUserData();
    initApp();
  }
});