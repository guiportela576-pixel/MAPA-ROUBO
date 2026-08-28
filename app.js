(() => {
  'use strict';

  const APP_VERSION = '1.0.0';
  const STORAGE = {
    position: 'dronepol.position', weather: 'dronepol.weather', weatherAt: 'dronepol.weatherAt',
    profiles: 'dronepol.profiles', activeProfile: 'dronepol.activeProfile', checklist: 'dronepol.checklist',
    icao: 'dronepol.icao', taf: 'dronepol.taf', metar: 'dronepol.metar'
  };

  const DEFAULT_PROFILES = [
    {
      id: 'm4t', name: 'DJI Matrice 4T', model: 'Matrice 4T',
      maxWind: 36, maxGust: 43.2, maxRain: 0, minVisibility: 5,
      note: 'Perfil operacional inicial conservador. DJI informa resistência máxima ao vento de 12 m/s (43,2 km/h) durante decolagem/pouso e informa que a Matrice 4 Series não é à prova d’água. Ajuste conforme manual, SOP e missão.'
    },
    { id: 'generic', name: 'UAS genérica', model: 'Perfil configurável', maxWind: 25, maxGust: 30, maxRain: 0, minVisibility: 5, note: 'Configure os limites conforme o manual da aeronave.' }
  ];

  const CHECKLIST = [
    { group: 'EQUIPE', items: [
      ['rpic', 'RPIC definido', 'Responsável pelo comando e decisão operacional.'],
      ['observer', 'Observador definido quando aplicável', 'Funções e setor de observação alinhados.'],
      ['briefing', 'Briefing da equipe realizado', 'Missão, riscos, comunicação, contingências e abortagem.'],
      ['comms', 'Comunicações verificadas', 'Meio primário e alternativa quando necessário.']
    ]},
    { group: 'AERONAVE', items: [
      ['airframe', 'Estrutura da aeronave inspecionada', 'Sem trincas, folgas, deformações ou danos aparentes.'],
      ['props', 'Hélices inspecionadas e instaladas', 'Sem danos, deformações ou fixação anormal.'],
      ['battery', 'Bateria em condição adequada', 'Carga, temperatura, encaixe e condição física verificadas.'],
      ['cells', 'Células da bateria verificadas', 'Sem desequilíbrio/anomalia indicada pelo sistema.'],
      ['storage', 'Armazenamento disponível', 'Cartão/armazenamento suficiente para a missão.'],
      ['firmware', 'Avisos/HMS verificados', 'Sem alerta impeditivo não tratado.']
    ]},
    { group: 'NAVEGAÇÃO E SEGURANÇA', items: [
      ['gnss', 'GNSS/posicionamento adequado', 'Home Point e qualidade de posicionamento confirmados no sistema da aeronave.'],
      ['home', 'Home Point confirmado', 'Ponto de retorno coerente com o local de operação.'],
      ['rth', 'RTH configurado', 'Altura e comportamento definidos para os obstáculos e cenário.'],
      ['sensors', 'Sensores/obstáculos avaliados', 'Limitações por luz, superfície, chuva, fios e obstáculos consideradas.']
    ]},
    { group: 'ÁREA E RISCO', items: [
      ['area', 'Área de decolagem/pouso segura', 'Livre de pessoas não envolvidas e obstáculos imediatos.'],
      ['obstacles', 'Fios, antenas e obstáculos identificados', 'Incluindo obstáculos finos/difíceis para sensores.'],
      ['emergency', 'Área/ação de emergência definida', 'Pouso alternativo e procedimento de perda de enlace/energia.'],
      ['people', 'Pessoas e circulação avaliadas', 'Fluxo previsto e medidas de proteção consideradas.'],
      ['weather', 'Meteorologia verificada', 'Vento, rajada, chuva, visibilidade e tendência.']
    ]},
    { group: 'OPERAÇÃO E DOCUMENTAÇÃO', items: [
      ['airspace', 'Espaço aéreo verificado', 'SARPAS/AISWEB/NOTAM e coordenações aplicáveis verificados.'],
      ['aro', 'ARO/avaliação de risco concluída quando aplicável', 'Riscos, controles e residual aceito pela autoridade competente.'],
      ['docs', 'Documentação aplicável conferida', 'Aeronave, operador, missão e demais requisitos pertinentes.'],
      ['mission', 'Plano da missão conferido', 'Objetivo, área, altura, rota, duração e contingências.']
    ]}
  ];

  const state = {
    coords: null,
    weather: null,
    liveWeather: null,
    weatherAt: null,
    kp: null,
    profile: null,
    profiles: [],
    testMode: false,
    testSnapshot: null,
    map: null,
    userMarker: null,
    airportLayer: null,
    windChart: null,
    rainChart: null,
    activeView: 'dashboard'
  };

  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const round = (n, d = 1) => Number.isFinite(+n) ? (+n).toFixed(d).replace('.', ',') : '—';
  const kmh = n => `${round(n)} km/h`;
  const mm = n => `${round(n)} mm`;
  const pct = n => `${Math.round(+n || 0)}%`;
  const km = n => `${round(n, 1)} km`;
  const now = () => Date.now();

  function safeJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function toast(msg, ms = 2600) {
    const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function weatherCode(code) {
    const map = {
      0: ['☀️','Céu limpo'], 1:['🌤️','Predominantemente limpo'], 2:['⛅','Parcialmente nublado'], 3:['☁️','Nublado'],
      45:['🌫️','Nevoeiro'], 48:['🌫️','Nevoeiro com geada'], 51:['🌦️','Garoa leve'], 53:['🌦️','Garoa'], 55:['🌧️','Garoa forte'],
      56:['🌧️','Garoa congelante'],57:['🌧️','Garoa congelante forte'],61:['🌦️','Chuva leve'],63:['🌧️','Chuva'],65:['🌧️','Chuva forte'],
      66:['🌧️','Chuva congelante'],67:['🌧️','Chuva congelante forte'],71:['🌨️','Neve leve'],73:['🌨️','Neve'],75:['🌨️','Neve forte'],
      77:['🌨️','Grãos de neve'],80:['🌦️','Pancadas leves'],81:['🌧️','Pancadas'],82:['⛈️','Pancadas fortes'],85:['🌨️','Pancadas de neve'],86:['🌨️','Pancadas fortes de neve'],
      95:['⛈️','Trovoada'],96:['⛈️','Trovoada com granizo'],99:['⛈️','Trovoada forte com granizo']
    };
    return map[code] || ['🌡️','Condição meteorológica'];
  }

  function directionName(deg) {
    if (!Number.isFinite(+deg)) return '—';
    const dirs = ['N','NE','L','SE','S','SO','O','NO'];
    return `${dirs[Math.round((+deg)/45)%8]} (${Math.round(+deg)}°)`;
  }

  function calcDewPoint(tempC, rh) {
    if (!Number.isFinite(tempC) || !Number.isFinite(rh) || rh <= 0) return NaN;
    const a=17.62,b=243.12,g=Math.log(rh/100)+(a*tempC)/(b+tempC);
    return (b*g)/(a-g);
  }

  function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  }
  function formatDay(iso) {
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'2-digit'}).replace('.', '');
  }

  function loadState() {
    state.profiles = safeJSON(STORAGE.profiles, DEFAULT_PROFILES);
    if (!Array.isArray(state.profiles) || !state.profiles.length) state.profiles = structuredClone(DEFAULT_PROFILES);
    const activeId = localStorage.getItem(STORAGE.activeProfile) || 'm4t';
    state.profile = state.profiles.find(p => p.id === activeId) || state.profiles[0];
    state.coords = safeJSON(STORAGE.position, null);
    state.weather = safeJSON(STORAGE.weather, null);
    state.liveWeather = state.weather ? structuredClone(state.weather) : null;
    state.weatherAt = +(localStorage.getItem(STORAGE.weatherAt) || 0) || null;
    $('icaoInput').value = localStorage.getItem(STORAGE.icao) || 'SBST';
    $('tafText').value = localStorage.getItem(STORAGE.taf) || '';
    $('metarText').value = localStorage.getItem(STORAGE.metar) || '';
    $('appVersion').textContent = `v${APP_VERSION}`;
  }

  function initNavigation() {
    $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
      const target = btn.dataset.viewTarget;
      if (target === 'settings' && btn.classList.contains('more-btn')) return openMoreSheet();
      showView(target);
    }));
    $$('[data-goto]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.goto)));
    $$('[data-sheet-view]').forEach(btn => btn.addEventListener('click', () => { closeMoreSheet(); showView(btn.dataset.sheetView); }));
    $$('[data-close-sheet]').forEach(el => el.addEventListener('click', closeMoreSheet));
  }
  function showView(name) {
    state.activeView = name;
    $$('.view').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.viewTarget === name));
    if (['metar','aircraft','settings'].includes(name)) $('.more-btn')?.classList.add('active');
    window.scrollTo({top:0, behavior:'smooth'});
    if (name === 'airspace') setTimeout(initMap, 100);
    if (name === 'forecast') setTimeout(renderCharts, 100);
  }
  function openMoreSheet(){ $('moreSheet').classList.remove('hidden'); $('moreSheet').setAttribute('aria-hidden','false'); }
  function closeMoreSheet(){ $('moreSheet').classList.add('hidden'); $('moreSheet').setAttribute('aria-hidden','true'); }

  function $(selectorOrId) {
    if (selectorOrId.startsWith?.('.') || selectorOrId.startsWith?.('#') || selectorOrId.includes?.(' ')) return document.querySelector(selectorOrId);
    return document.getElementById(selectorOrId);
  }

  function getLocation() {
    if (!navigator.geolocation) { toast('Este navegador não oferece geolocalização.'); return; }
    $('locationName').textContent = 'Obtendo localização…';
    navigator.geolocation.getCurrentPosition(async pos => {
      state.coords = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp };
      saveJSON(STORAGE.position, state.coords);
      renderLocation();
      await refreshAll();
      if (state.map) updateMapUser();
    }, err => {
      $('locationName').textContent = 'Localização indisponível';
      toast(err.code === 1 ? 'Permissão de localização negada.' : 'Não foi possível obter a localização.');
    }, { enableHighAccuracy:true, timeout:12000, maximumAge:15000 });
  }

  function renderLocation() {
    if (!state.coords) return;
    $('locationName').textContent = 'Posição do dispositivo';
    $('coordsText').textContent = `${state.coords.lat.toFixed(5)}, ${state.coords.lon.toFixed(5)} • ±${Math.round(state.coords.accuracy || 0)} m`;
    $('gpsLat').textContent = state.coords.lat.toFixed(6);
    $('gpsLon').textContent = state.coords.lon.toFixed(6);
    $('gpsAccuracy').textContent = state.coords.accuracy ? `±${Math.round(state.coords.accuracy)} m` : '—';
  }

  async function fetchWeather() {
    if (!state.coords) return;
    const {lat, lon} = state.coords;
    const params = new URLSearchParams({
      latitude: lat, longitude: lon,
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,precipitation_probability,precipitation,rain,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      daily: 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
      timezone: 'auto', forecast_days: '7', wind_speed_unit: 'kmh'
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error(`Weather HTTP ${r.status}`);
    const data = await r.json();
    data._source = 'Open-Meteo'; data._fetchedAt = now();
    state.weather = data; state.liveWeather = structuredClone(data); state.weatherAt = data._fetchedAt;
    saveJSON(STORAGE.weather, data); localStorage.setItem(STORAGE.weatherAt, String(state.weatherAt));
  }

  async function fetchKp() {
    try {
      const r = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', {cache:'no-store'});
      if (!r.ok) throw new Error('Kp unavailable');
      const rows = await r.json();
      const last = rows[rows.length - 1];
      const value = +(last?.[1]);
      if (Number.isFinite(value)) state.kp = { value, at: last[0] };
    } catch (e) {
      console.warn('Kp:', e);
    }
  }

  async function refreshAll() {
    if (!state.coords) { getLocation(); return; }
    $('refreshBtn').disabled = true;
    try {
      const [weatherResult] = await Promise.allSettled([fetchWeather(), fetchKp()]);
      if (state.testMode && state.testSnapshot) state.weather = structuredClone(state.testSnapshot);
      else state.weather = state.liveWeather ? structuredClone(state.liveWeather) : state.weather;
      renderAll();
      if (weatherResult.status === 'fulfilled') toast('Dados meteorológicos atualizados.');
      else toast(state.weather ? 'Não foi possível atualizar. Mantendo os últimos dados salvos.' : 'Não foi possível obter os dados meteorológicos.', 3400);
    } catch (e) {
      console.error(e); toast('Falha ao atualizar. Usando dados salvos, se disponíveis.'); renderAll();
    } finally { $('refreshBtn').disabled = false; }
  }

  function currentVisibilityKm(w) {
    if (!w?.hourly?.time?.length) return null;
    const i = nearestHourlyIndex(w);
    const m = w.hourly.visibility?.[i];
    return Number.isFinite(+m) ? +m / 1000 : null;
  }
  function currentRainProb(w) {
    if (!w?.hourly?.time?.length) return null;
    const i = nearestHourlyIndex(w); return w.hourly.precipitation_probability?.[i] ?? null;
  }
  function nearestHourlyIndex(w) {
    const times = w?.hourly?.time || [];
    if (!times.length) return 0;
    const target = Date.now(); let best=0, diff=Infinity;
    times.forEach((t,i)=>{ const d=Math.abs(new Date(t).getTime()-target); if(d<diff){diff=d;best=i;} });
    return best;
  }

  function evaluateCurrent() {
    const w = state.weather, p = state.profile;
    if (!w?.current || !p) return null;
    const c = w.current;
    const vis = currentVisibilityKm(w);
    const criteria = [
      criterion('Vento médio', +c.wind_speed_10m, p.maxWind, 'max', 'km/h'),
      criterion('Rajadas', +c.wind_gusts_10m, p.maxGust, 'max', 'km/h'),
      criterion('Precipitação', +(c.precipitation ?? c.rain ?? 0), p.maxRain, 'max', 'mm'),
      criterion('Visibilidade', vis, p.minVisibility, 'min', 'km')
    ];
    const bad = criteria.filter(x=>x.status==='bad');
    const caution = criteria.filter(x=>x.status==='caution');
    const status = bad.length ? 'bad' : caution.length ? 'caution' : 'good';
    return { status, criteria, vis, rainProb: currentRainProb(w) };
  }
  function criterion(label, value, limit, type, unit) {
    if (!Number.isFinite(+value) || !Number.isFinite(+limit)) return {label,value,limit,type,unit,status:'caution',message:'Dado indisponível'};
    const v=+value,l=+limit;
    let status='good';
    if (type==='max') {
      if (v > l) status='bad'; else if (l>0 && v >= l*.8) status='caution'; else if (l===0 && v>0) status='bad';
    } else {
      if (v < l) status='bad'; else if (v < l*1.25) status='caution';
    }
    const op = type==='max' ? `máx. ${round(l)} ${unit}` : `mín. ${round(l)} ${unit}`;
    return {label,value:v,limit:l,type,unit,status,message:op};
  }

  function hourEvaluation(i) {
    const w=state.weather,p=state.profile; if(!w?.hourly||!p) return null;
    const wind=+w.hourly.wind_speed_10m?.[i],gust=+w.hourly.wind_gusts_10m?.[i],rain=+w.hourly.precipitation?.[i],vis=(+w.hourly.visibility?.[i])/1000;
    const arr=[criterion('Vento',wind,p.maxWind,'max','km/h'),criterion('Rajada',gust,p.maxGust,'max','km/h'),criterion('Chuva',rain,p.maxRain,'max','mm'),criterion('Visibilidade',vis,p.minVisibility,'min','km')];
    return arr.some(x=>x.status==='bad')?'bad':arr.some(x=>x.status==='caution')?'caution':'good';
  }

  function renderAll() {
    renderLocation(); renderProfile(); renderWeather(); renderDashboard(); renderForecast(); renderAnalysis(); renderChecklist(); renderKp();
    if (state.map) updateMapUser();
  }

  function renderDashboard() {
    const ev=evaluateCurrent(),w=state.weather,c=w?.current;
    if (!ev || !c) {
      $('missionStatus').className='mission-status neutral'; $('missionStatusTitle').textContent='AGUARDANDO DADOS'; $('dashWeather').textContent='—'; return;
    }
    const meta = ev.status==='good' ? ['METEOROLOGIA FAVORÁVEL','Parâmetros meteorológicos dentro do perfil configurado.'] : ev.status==='caution' ? ['ATENÇÃO METEOROLÓGICA','Um ou mais parâmetros estão próximos do limite configurado.'] : ['METEOROLOGIA DESFAVORÁVEL','Um ou mais parâmetros excedem o perfil configurado.'];
    const stale = state.weatherAt && (Date.now() - state.weatherAt > 45 * 60000);
    $('missionStatus').className=`mission-status ${stale ? 'caution' : ev.status}`;
    $('missionStatusTitle').textContent=stale ? 'DADOS METEOROLÓGICOS DESATUALIZADOS' : meta[0];
    $('missionStatusSubtitle').textContent=stale ? 'Atualize os dados antes de usar o painel como apoio operacional.' : `${meta[1]} Espaço aéreo deve ser verificado separadamente.`;
    $('dashWeather').textContent = stale ? 'ATUALIZAR' : (ev.status==='good'?'FAVORÁVEL':ev.status==='caution'?'ATENÇÃO':'DESFAVORÁVEL');
    const worst = ev.criteria.find(x=>x.status==='bad') || ev.criteria.find(x=>x.status==='caution');
    $('dashWeatherReason').textContent = worst ? worst.label : 'Dentro do perfil';
    $('dashAircraft').textContent=state.profile?.model || '—'; $('dashAircraftLimits').textContent=`vento ${round(state.profile?.maxWind)} km/h`;
    $('quickWind').textContent=kmh(c.wind_speed_10m); $('quickWindDir').textContent=directionName(c.wind_direction_10m); $('quickGust').textContent=kmh(c.wind_gusts_10m); $('gustLimitQuick').textContent=`limite: ${round(state.profile.maxGust)} km/h`;
    $('quickRain').textContent=mm(c.precipitation ?? c.rain ?? 0); $('quickRainProb').textContent=ev.rainProb==null?'prob. —':`prob. ${pct(ev.rainProb)}`; $('quickVisibility').textContent=ev.vis==null?'—':km(ev.vis);
    renderFreshness(); renderHourlyStrip();
  }

  function renderFreshness() {
    const el=$('dataAge'); if (!state.weatherAt) { el.textContent='—'; return; }
    const mins=Math.max(0,Math.floor((Date.now()-state.weatherAt)/60000));
    el.textContent = mins<1?'Atualizado agora':`há ${mins} min`;
    el.style.color = mins<=15?'var(--green)':mins<=45?'var(--yellow)':'var(--red)';
  }

  function renderHourlyStrip() {
    const el=$('hourlyStrip'), w=state.weather; if(!w?.hourly?.time){el.textContent='Aguardando dados.';return;}
    const start=nearestHourlyIndex(w), count=Math.min(8,w.hourly.time.length-start); let goodRun=0;
    const html=[];
    for(let x=0;x<count;x++){const i=start+x,status=hourEvaluation(i); if(status==='good') goodRun++; const code=weatherCode(w.hourly.weather_code?.[i]); html.push(`<div class="hour-card ${status}"><strong>${formatTime(w.hourly.time[i])}</strong><span>${code[0]}</span><small>${round(w.hourly.wind_speed_10m?.[i],0)} / ${round(w.hourly.wind_gusts_10m?.[i],0)} km/h</small></div>`)}
    el.innerHTML=html.join(''); el.classList.remove('empty-state'); $('windowSummary').textContent=goodRun?`${goodRun}/${count} favoráveis`:'Sem janela favorável';
  }

  function renderWeather() {
    const w=state.weather,c=w?.current,ev=evaluateCurrent(); if(!c||!ev)return;
    const wc=weatherCode(c.weather_code); $('weatherEmoji').textContent=wc[0]; $('weatherDescription').textContent=wc[1]; $('temperature').textContent=`${round(c.temperature_2m)}°`; $('feelsLike').textContent=`${round(c.apparent_temperature)}°C`; $('humidity').textContent=pct(c.relative_humidity_2m); $('pressure').textContent=`${round(c.surface_pressure,0)} hPa`; $('cloudCover').textContent=pct(c.cloud_cover);
    $('windSpeed').textContent=kmh(c.wind_speed_10m); $('windDirection').textContent=directionName(c.wind_direction_10m); $('windGust').textContent=kmh(c.wind_gusts_10m); $('precipitation').textContent=mm(c.precipitation ?? c.rain ?? 0);
    $('weatherVisibility').textContent=ev.vis==null?'—':km(ev.vis);
    const dew = calcDewPoint(+c.temperature_2m, +c.relative_humidity_2m); $('dewPoint').textContent=Number.isFinite(dew)?`${round(dew)}°C`:'—';
    $('sunrise').textContent=formatTime(w.daily?.sunrise?.[0]); $('sunset').textContent=formatTime(w.daily?.sunset?.[0]);
    $('weatherSourceBadge').textContent=state.testMode&&state.testSnapshot?'SIMULAÇÃO':'Open-Meteo';
    const gustCrit=ev.criteria.find(x=>x.label==='Rajadas'); const rainCrit=ev.criteria.find(x=>x.label==='Precipitação');
    $('windEvaluation').textContent=labelStatus(gustCrit?.status); $('rainEvaluation').textContent=labelStatus(rainCrit?.status);
  }
  function labelStatus(s){return s==='good'?'Dentro do perfil':s==='caution'?'Próximo do limite':'Fora do perfil'}

  function renderKp() {
    if (!state.kp) { $('kpValue').textContent='—'; $('kpStatus').textContent='Indisponível'; return; }
    const v=state.kp.value; $('kpValue').textContent=round(v,1);
    let s='Baixo/normal',desc='Atividade geomagnética baixa a moderada.'; if(v>=7){s='Muito elevado';desc='Atividade geomagnética intensa. Trate como informação complementar e confirme o comportamento GNSS/RTK do sistema.'} else if(v>=5){s='Elevado';desc='Tempestade geomagnética. Redobre a atenção a posicionamento e serviços GNSS/RTK.'} else if(v>=4){s='Ativo';desc='Atividade geomagnética aumentada.'}
    $('kpStatus').textContent=s; $('kpDescription').textContent=desc; $('kpGauge').style.borderColor=v>=5?'var(--red)':v>=4?'var(--yellow)':'var(--green)';
  }

  function renderForecast() {
    const w=state.weather; if(!w?.daily?.time)return;
    const out=w.daily.time.map((t,i)=>{const wc=weatherCode(w.daily.weather_code?.[i]);return `<div class="daily-row"><span><strong>${formatDay(t)}</strong></span><span>${wc[0]} ${round(w.daily.temperature_2m_min?.[i],0)}°/${round(w.daily.temperature_2m_max?.[i],0)}°</span><small>🌧 ${pct(w.daily.precipitation_probability_max?.[i])}</small><small class="daily-extra">💨 ${round(w.daily.wind_speed_10m_max?.[i],0)} · ${round(w.daily.wind_gusts_10m_max?.[i],0)} km/h</small></div>`}).join('');
    $('dailyForecast').innerHTML=out; $('dailyForecast').classList.remove('empty-state');
    if(state.activeView==='forecast') renderCharts();
  }

  function renderCharts() {
    const w=state.weather;if(!w?.hourly?.time||!window.Chart)return;
    const s=nearestHourlyIndex(w),e=Math.min(s+24,w.hourly.time.length),labels=w.hourly.time.slice(s,e).map(formatTime);
    Chart.defaults.color='#8fa1b3'; Chart.defaults.borderColor='rgba(143,161,179,.12)'; Chart.defaults.font.family='-apple-system,BlinkMacSystemFont,Segoe UI,Arial';
    if(state.windChart)state.windChart.destroy();
    state.windChart=new Chart($('windChart'),{type:'line',data:{labels,datasets:[{label:'Vento km/h',data:w.hourly.wind_speed_10m.slice(s,e),borderWidth:2,tension:.3,pointRadius:0},{label:'Rajadas km/h',data:w.hourly.wind_gusts_10m.slice(s,e),borderWidth:2,tension:.3,pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{boxWidth:10,font:{size:10}}}},scales:{x:{ticks:{maxTicksLimit:8,font:{size:9}}},y:{beginAtZero:true,ticks:{font:{size:9}}}}}});
    if(state.rainChart)state.rainChart.destroy();
    state.rainChart=new Chart($('rainChart'),{type:'bar',data:{labels,datasets:[{label:'Probabilidade %',data:w.hourly.precipitation_probability.slice(s,e),borderWidth:0},{label:'Precipitação mm',data:w.hourly.precipitation.slice(s,e),type:'line',borderWidth:2,tension:.3,pointRadius:0,yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{boxWidth:10,font:{size:10}}}},scales:{x:{ticks:{maxTicksLimit:8,font:{size:9}}},y:{beginAtZero:true,max:100,ticks:{font:{size:9}}},y1:{position:'right',beginAtZero:true,grid:{display:false},ticks:{font:{size:9}}}}}});
  }

  function renderAnalysis() {
    const ev=evaluateCurrent(); if(!ev)return;
    const title=ev.status==='good'?'CONDIÇÕES METEOROLÓGICAS FAVORÁVEIS':ev.status==='caution'?'ATENÇÃO ÀS CONDIÇÕES METEOROLÓGICAS':'CONDIÇÕES METEOROLÓGICAS DESFAVORÁVEIS';
    $('analysisHero').className=`analysis-hero ${ev.status}`; $('analysisTitle').textContent=title; $('analysisBadge').textContent=ev.status==='good'?'FAVORÁVEL':ev.status==='caution'?'ATENÇÃO':'DESFAVORÁVEL';
    $('analysisSubtitle').textContent=`Avaliação conforme o perfil ${state.profile?.model}. Espaço aéreo e autorização são verificações independentes.`;
    $('analysisCriteria').innerHTML=ev.criteria.map(c=>`<div class="criterion ${c.status}"><div class="criterion-icon">${c.status==='good'?'✓':c.status==='caution'?'!':'×'}</div><div><strong>${c.label}</strong><small>${c.message}</small></div><div class="criterion-value">${round(c.value)} ${c.unit}</div></div>`).join(''); $('analysisCriteria').classList.remove('empty-state');
    renderBestWindow();
  }

  function renderBestWindow() {
    const w=state.weather;if(!w?.hourly?.time)return; const start=nearestHourlyIndex(w); const horizon=Math.min(start+12,w.hourly.time.length);
    let bestStart=null,bestLen=0,curStart=null,curLen=0;
    for(let i=start;i<horizon;i++){if(hourEvaluation(i)==='good'){if(curStart===null)curStart=i;curLen++;if(curLen>bestLen){bestLen=curLen;bestStart=curStart;}}else{curStart=null;curLen=0;}}
    if(bestStart===null){$('bestWindow').innerHTML='<strong>Sem janela totalmente favorável</strong><p>Nos próximos 12 horários avaliados, ao menos um parâmetro está em atenção ou fora do perfil. Veja a previsão detalhada.</p>';return;}
    const end=Math.min(bestStart+bestLen-1,w.hourly.time.length-1); $('bestWindow').innerHTML=`<strong>${formatTime(w.hourly.time[bestStart])} → ${formatTime(w.hourly.time[end])}</strong><p>${bestLen} hora(s) consecutiva(s) sem extrapolar os parâmetros meteorológicos configurados. Revalide próximo ao horário da operação.</p>`;
  }

  function renderProfile() {
    if(!state.profile)return;
    $('limitWind').textContent=kmh(state.profile.maxWind); $('limitGust').textContent=kmh(state.profile.maxGust); $('limitRain').textContent=`${round(state.profile.maxRain)} mm/h`; $('limitVis').textContent=km(state.profile.minVisibility);
    const sel=$('aircraftSelect'); sel.innerHTML=state.profiles.map(p=>`<option value="${escapeHtml(p.id)}" ${p.id===state.profile.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
    $('aircraftName').value=state.profile.name; $('aircraftModel').value=state.profile.model; $('aircraftWind').value=state.profile.maxWind; $('aircraftGust').value=state.profile.maxGust; $('aircraftRain').value=state.profile.maxRain; $('aircraftVis').value=state.profile.minVisibility;
  }
  function saveAircraft() {
    const p={...state.profile,name:$('aircraftName').value.trim()||'Aeronave',model:$('aircraftModel').value.trim()||'Modelo',maxWind:+$('aircraftWind').value,maxGust:+$('aircraftGust').value,maxRain:+$('aircraftRain').value,minVisibility:+$('aircraftVis').value};
    if([p.maxWind,p.maxGust,p.maxRain,p.minVisibility].some(v=>!Number.isFinite(v)||v<0)){toast('Revise os limites informados.');return;}
    const idx=state.profiles.findIndex(x=>x.id===p.id); state.profiles[idx]=p; state.profile=p; saveJSON(STORAGE.profiles,state.profiles); localStorage.setItem(STORAGE.activeProfile,p.id); renderAll(); toast('Perfil salvo.');
  }

  function renderChecklist() {
    const saved=safeJSON(STORAGE.checklist,{}), container=$('checklistGroups'); let html='';
    CHECKLIST.forEach(g=>{html+=`<div class="check-group"><div class="check-group-title">${g.group}</div><div class="card">`;g.items.forEach(([id,label,help])=>{html+=`<label class="check-item"><input type="checkbox" data-check-id="${id}" ${saved[id]?'checked':''}><span>${label}<small>${help}</small></span></label>`});html+='</div></div>'});
    container.innerHTML=html; container.querySelectorAll('[data-check-id]').forEach(cb=>cb.addEventListener('change',()=>{const s=safeJSON(STORAGE.checklist,{});s[cb.dataset.checkId]=cb.checked;saveJSON(STORAGE.checklist,s);updateChecklistProgress()})); updateChecklistProgress();
  }
  function updateChecklistProgress() {
    const s=safeJSON(STORAGE.checklist,{}), ids=CHECKLIST.flatMap(g=>g.items.map(i=>i[0])),done=ids.filter(id=>s[id]).length,total=ids.length,pctv=Math.round(done/total*100);
    $('checklistPercent').textContent=`${pctv}%`; $('checklistCount').textContent=`${done}/${total} itens`; $('checklistBar').style.width=`${pctv}%`; $('dashChecklist').textContent=`${pctv}%`; $('dashChecklistText').textContent=pctv===100?'Pré-voo concluído':`${total-done} pendente(s)`;
  }

  function initMap() {
    if(!window.L)return; if(!state.map){state.map=L.map('map',{zoomControl:true}).setView(state.coords?[state.coords.lat,state.coords.lon]:[-23.95,-46.33],state.coords?12:9);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(state.map);state.airportLayer=L.layerGroup().addTo(state.map);} setTimeout(()=>state.map.invalidateSize(),50); updateMapUser();
  }
  function updateMapUser() {
    if(!state.map||!state.coords)return; const ll=[state.coords.lat,state.coords.lon]; if(state.userMarker)state.userMarker.setLatLng(ll);else state.userMarker=L.circleMarker(ll,{radius:8,weight:3,fillOpacity:.9}).bindPopup('Sua posição aproximada').addTo(state.map); state.map.setView(ll,12);
  }

  async function scanAerodromes() {
    if(!state.coords){getLocation();return;} initMap(); $('aerodromeList').textContent='Buscando pontos cartográficos…';
    const q=`[out:json][timeout:20];(node[\"aeroway\"=\"aerodrome\"](around:50000,${state.coords.lat},${state.coords.lon});way[\"aeroway\"=\"aerodrome\"](around:50000,${state.coords.lat},${state.coords.lon});relation[\"aeroway\"=\"aerodrome\"](around:50000,${state.coords.lat},${state.coords.lon});node[\"aeroway\"=\"helipad\"](around:20000,${state.coords.lat},${state.coords.lon}););out center tags;`;
    try{
      const r=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`); if(!r.ok)throw new Error('Overpass'); const data=await r.json();
      const points=(data.elements||[]).map(e=>{const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const name=e.tags?.name||e.tags?.['name:pt']||e.tags?.icao||e.tags?.iata||'Aeródromo/heliponto sem nome';return{lat,lon,name,icao:e.tags?.icao||'',type:e.tags?.aeroway||'aerodrome',dist:haversine(state.coords.lat,state.coords.lon,lat,lon)}}).filter(Boolean).sort((a,b)=>a.dist-b.dist).slice(0,15);
      state.airportLayer.clearLayers(); points.forEach(p=>L.circleMarker([p.lat,p.lon],{radius:6,weight:2,fillOpacity:.65}).bindPopup(`<strong>${escapeHtml(p.name)}</strong><br>${round(p.dist)} km`).addTo(state.airportLayer));
      if(!points.length){$('aerodromeList').innerHTML='Nenhum ponto OSM encontrado no raio consultado. <strong>Isso não comprova ausência de aeródromos/helipontos.</strong>';return;}
      $('aerodromeList').innerHTML=points.map(p=>`<div class="aerodrome-item"><div><strong>${escapeHtml(p.name)}</strong><small>${p.icao?`ICAO ${escapeHtml(p.icao)} • `:''}${p.type==='helipad'?'Heliponto/ponto':'Aeródromo/ponto OSM'}</small></div><span class="distance-badge">${round(p.dist)} km</span></div>`).join(''); $('aerodromeList').classList.remove('empty-state');
    }catch(e){console.error(e);$('aerodromeList').innerHTML='Não foi possível consultar o OpenStreetMap/Overpass agora. Use as fontes oficiais para a verificação operacional.';}
  }
  function haversine(a,b,c,d){const R=6371,rad=x=>x*Math.PI/180,da=rad(c-a),db=rad(d-b),x=Math.sin(da/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(db/2)**2;return 2*R*Math.asin(Math.sqrt(x))}

  function decodeMetar() {
    const raw=$('metarText').value.trim().toUpperCase(); if(!raw){toast('Cole um METAR primeiro.');return;} localStorage.setItem(STORAGE.metar,raw);
    const station=(raw.match(/(?:METAR|SPECI)?\s*([A-Z]{4})\s/)||[])[1]||'—';
    const time=(raw.match(/\b(\d{2})(\d{2})(\d{2})Z\b/)||[]); const wind=(raw.match(/\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT\b/)||[]);
    const visM=(raw.match(/\b(\d{4})\b/)||[])[1]; const temp=(raw.match(/\b(M?\d{2})\/(M?\d{2})\b/)||[]); const qnh=(raw.match(/\bQ(\d{4})\b/)||[])[1];
    const clouds=[...raw.matchAll(/\b(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?\b/g)].map(m=>`${m[1]} ${+m[2]*100} ft${m[3]?` ${m[3]}`:''}`);
    const wx=[]; if(/\bRA\b|[-+]RA/.test(raw))wx.push('chuva'); if(/\bTS\b|TSRA/.test(raw))wx.push('trovoada'); if(/\bBR\b/.test(raw))wx.push('névoa'); if(/\bFG\b/.test(raw))wx.push('nevoeiro');
    const parseTemp=s=>s?`${s.startsWith('M')?'-':''}${parseInt(s.replace('M',''),10)}°C`:'—';
    const vis=visM ? (+visM>=9999?'10 km ou mais':`${(+visM/1000).toFixed(1).replace('.',',')} km`) : (/CAVOK/.test(raw)?'CAVOK':'—');
    const windText=wind.length?`${wind[1]==='VRB'?'Variável':wind[1]+'°'} • ${wind[2]} kt${wind[4]?` • rajada ${wind[4]} kt`:''}`:'—';
    $('metarDecoded').innerHTML=`<div class="decoded-grid"><div><span>Estação</span><strong>${station}</strong></div><div><span>Horário UTC</span><strong>${time.length?`${time[1]} ${time[2]}:${time[3]}Z`:'—'}</strong></div><div><span>Vento</span><strong>${windText}</strong></div><div><span>Visibilidade</span><strong>${vis}</strong></div><div><span>Temperatura</span><strong>${parseTemp(temp[1])}</strong></div><div><span>Ponto de orvalho</span><strong>${parseTemp(temp[2])}</strong></div><div><span>QNH</span><strong>${qnh?`${qnh} hPa`:'—'}</strong></div><div><span>Nuvens</span><strong>${clouds.length?clouds.join(', '):(/CAVOK|NSC|SKC/.test(raw)?'Sem nuvens significativas':'—')}</strong></div><div><span>Tempo significativo</span><strong>${wx.length?wx.join(', '):'—'}</strong></div><div><span>Observação</span><strong>${/CAVOK/.test(raw)?'CAVOK presente':'Decodificação básica local'}</strong></div></div><p class="note">Decodificação simplificada para apoio. Confirme o METAR original e produtos oficiais.</p>`; $('metarDecoded').classList.remove('empty-state');
  }

  function applyTest(type) {
    if(!state.testMode){toast('Ative o modo de teste primeiro.');return;} if(!state.liveWeather){toast('Atualize os dados reais antes de simular.');return;}
    if(type==='reset'){state.testSnapshot=null;state.weather=structuredClone(state.liveWeather);renderAll();toast('Dados reais restaurados.');return;}
    const w=structuredClone(state.liveWeather),i=nearestHourlyIndex(w); if(type==='wind'){w.current.wind_speed_10m=48;w.current.wind_gusts_10m=62;w.hourly.wind_speed_10m[i]=48;w.hourly.wind_gusts_10m[i]=62;} if(type==='rain'){w.current.precipitation=8;w.current.rain=8;w.hourly.precipitation[i]=8;w.hourly.precipitation_probability[i]=95;} if(type==='good'){w.current.wind_speed_10m=8;w.current.wind_gusts_10m=12;w.current.precipitation=0;w.current.rain=0;w.hourly.wind_speed_10m[i]=8;w.hourly.wind_gusts_10m[i]=12;w.hourly.precipitation[i]=0;w.hourly.precipitation_probability[i]=0;w.hourly.visibility[i]=20000;}
    state.testSnapshot=w;state.weather=w;renderAll();toast('SIMULAÇÃO ativa — não são dados reais.',3500);
  }

  function initEvents() {
    $('locateBtn').addEventListener('click',getLocation); $('settingsLocateBtn').addEventListener('click',getLocation); $('refreshBtn').addEventListener('click',refreshAll); $('scanAerodromesBtn').addEventListener('click',scanAerodromes);
    $('aircraftSelect').addEventListener('change',e=>{state.profile=state.profiles.find(p=>p.id===e.target.value)||state.profiles[0];localStorage.setItem(STORAGE.activeProfile,state.profile.id);renderAll()}); $('saveAircraftBtn').addEventListener('click',saveAircraft);
    $('resetChecklistBtn').addEventListener('click',()=>{if(confirm('Zerar todo o checklist?')){localStorage.removeItem(STORAGE.checklist);renderChecklist();toast('Checklist zerado.')}});
    $('saveIcaoBtn').addEventListener('click',()=>{const v=$('icaoInput').value.trim().toUpperCase();if(!/^[A-Z]{4}$/.test(v)){toast('Use um indicador ICAO de 4 letras.');return;}$('icaoInput').value=v;localStorage.setItem(STORAGE.icao,v);toast('ICAO salvo.');});
    $('decodeMetarBtn').addEventListener('click',decodeMetar); $('saveTafBtn').addEventListener('click',()=>{localStorage.setItem(STORAGE.taf,$('tafText').value.trim().toUpperCase());toast('TAF salvo no aparelho.');});
    $('testModeToggle').addEventListener('change',e=>{state.testMode=e.target.checked;$('testPanel').classList.toggle('hidden',!state.testMode);if(!state.testMode){state.testSnapshot=null;state.weather=state.liveWeather?structuredClone(state.liveWeather):state.weather;renderAll();toast('Modo operacional ativo.')}}); $$('[data-test]').forEach(b=>b.addEventListener('click',()=>applyTest(b.dataset.test)));
    $('clearLocalBtn').addEventListener('click',()=>{if(confirm('Apagar dados locais do DRONEPOL SP neste aparelho?')){Object.values(STORAGE).forEach(k=>localStorage.removeItem(k));location.reload();}});
    window.addEventListener('online',updateOnline);window.addEventListener('offline',updateOnline); updateOnline();
  }
  function updateOnline(){ $('offlineBanner').classList.toggle('hidden',navigator.onLine); }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}

  async function boot() {
    loadState(); initNavigation(); initEvents(); renderAll();
    if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('./service-worker.js'); } catch(e){ console.warn('SW',e); } }
    if(state.coords && navigator.onLine){ refreshAll(); } else if(!state.coords){ setTimeout(getLocation,350); }
    setInterval(()=>{renderFreshness(); if(state.weatherAt && Date.now()-state.weatherAt>45*60000) $('missionStatusSubtitle').textContent='Dados meteorológicos com mais de 45 minutos. Atualize antes de usar operacionalmente.';},60000);
  }

  document.addEventListener('DOMContentLoaded',boot);
})();
