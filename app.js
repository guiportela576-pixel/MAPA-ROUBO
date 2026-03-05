// app.js (V3) - Mantém o painel "Registrar ocorrência" funcionando + heatmap por tipo + 1 marcador manual
// 1) Clique em "Registrar ocorrência" abre o painel (igual antes)
// 2) No modo manual, clicar várias vezes NÃO cria vários ícones; só move 1 marcador
// 3) Heatmap por tipo:
//    - roubo: vermelho
//    - furto: laranja
//    - tentativa: amarelo
//    - outro: azul
//
// Configure aqui:
const SUPABASE_URL = "";      // cole seu Project URL (https://xxxx.supabase.co)
const SUPABASE_ANON_KEY = ""; // cole sua Publishable key (sb_publishable_...)
const SUPABASE_TABLE = "incidents";

// Privacidade: desloca levemente o ponto na VISUALIZAÇÃO pública (não altera o dado salvo).
// 0.00045 ≈ ~50m. Coloque 0 para desativar.
const DISPLAY_JITTER_DEGREES = 0.00045;

// Heatmap
const HEAT_RADIUS = 28;
const HEAT_BLUR = 20;

let map;
let pointsLayer;
let heatRoubo, heatFurto, heatTentativa, heatOutro;

let userMarker = null;
let manualMarker = null;
let pendingLatLng = null;
let reportMode = "gps"; // "gps" | "manual"

const el = (id) => document.getElementById(id);
function setStatus(msg) { const s = el("status"); if (s) s.textContent = msg || ""; }

// ======== PWA ========
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

// ======== Mapa ========
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([-14.2350, -51.9253], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  pointsLayer = L.layerGroup().addTo(map);

  // Um heatmap por tipo (cada um com gradiente da sua cor)
  heatRoubo = L.heatLayer([], {
    radius: HEAT_RADIUS, blur: HEAT_BLUR, maxZoom: 17,
    gradient: { 0.2: "#ffb3b3", 0.6: "#ff3333", 1.0: "#cc0000" }
  }).addTo(map);

  heatFurto = L.heatLayer([], {
    radius: HEAT_RADIUS, blur: HEAT_BLUR, maxZoom: 17,
    gradient: { 0.2: "#ffd7a8", 0.6: "#ff8c1a", 1.0: "#cc6600" }
  }).addTo(map);

  heatTentativa = L.heatLayer([], {
    radius: HEAT_RADIUS, blur: HEAT_BLUR, maxZoom: 17,
    gradient: { 0.2: "#fff3b0", 0.6: "#ffd000", 1.0: "#ccaa00" }
  }).addTo(map);

  heatOutro = L.heatLayer([], {
    radius: HEAT_RADIUS, blur: HEAT_BLUR, maxZoom: 17,
    gradient: { 0.2: "#bfe3ff", 0.6: "#3399ff", 1.0: "#0066cc" }
  }).addTo(map);

  map.on("click", (e) => {
    if (reportMode !== "manual") return;
    setManualPoint(e.latlng);
  });
}

function jitterLatLng(lat, lng) {
  const j = DISPLAY_JITTER_DEGREES;
  if (!j) return [lat, lng];
  const dx = (Math.random() * 2 - 1) * j;
  const dy = (Math.random() * 2 - 1) * j;
  return [lat + dx, lng + dy];
}

function setManualPoint(latlng) {
  pendingLatLng = latlng;

  // CRÍTICO: só 1 marcador (movemos o existente)
  if (!manualMarker) {
    manualMarker = L.marker(latlng, { draggable: true }).addTo(map);
    manualMarker.on("dragend", () => {
      pendingLatLng = manualMarker.getLatLng();
      setStatus(`Ponto selecionado: ${pendingLatLng.lat.toFixed(6)}, ${pendingLatLng.lng.toFixed(6)}`);
    });
  } else {
    manualMarker.setLatLng(latlng);
  }

  setStatus(`Ponto selecionado: ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
}

// ======== GPS ========
function locateUser(center = true) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Seu navegador não suporta localização."));

    setStatus("Solicitando localização… (permita o acesso)");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng = L.latLng(latitude, longitude);
        pendingLatLng = latlng;

        if (!userMarker) userMarker = L.marker(latlng).addTo(map);
        else userMarker.setLatLng(latlng);

        setStatus(`Localização OK • precisão ~ ${Math.round(accuracy)}m`);
        if (center) map.setView(latlng, Math.max(map.getZoom(), 16));

        resolve({ latlng, accuracy });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

// ======== Supabase ========
function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Falta configurar SUPABASE_URL e SUPABASE_ANON_KEY no app.js");
  }
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };
}

async function fetchIncidents(days, typeFilter) {
  requireSupabaseConfig();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=lat,lng,type,note,occurred_at&occurred_at=gte.${encodeURIComponent(since)}&order=occurred_at.desc`;

  if (typeFilter && typeFilter !== "all") {
    url += `&type=eq.${encodeURIComponent(typeFilter)}`;
  }

  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) throw new Error("Erro ao carregar ocorrências.");
  return await res.json();
}

async function createIncident(payload) {
  requireSupabaseConfig();

  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`;
  const res = await fetch(url, { method: "POST", headers: supabaseHeaders(), body: JSON.stringify(payload) });
  if (!res.ok) throw new Error("Erro ao salvar ocorrência.");
  return await res.json();
}

// ======== Render ========
function typeColor(type) {
  if (type === "roubo") return "#ff3333";
  if (type === "furto") return "#ff8c1a";
  if (type === "tentativa") return "#ffd000";
  return "#3399ff";
}

function clearHeat() {
  heatRoubo.setLatLngs([]);
  heatFurto.setLatLngs([]);
  heatTentativa.setLatLngs([]);
  heatOutro.setLatLngs([]);
}

function addToHeat(type, lat, lng, weight = 1) {
  const pt = [lat, lng, weight];
  if (type === "roubo") heatRoubo.addLatLng(pt);
  else if (type === "furto") heatFurto.addLatLng(pt);
  else if (type === "tentativa") heatTentativa.addLatLng(pt);
  else heatOutro.addLatLng(pt);
}

function render(items) {
  pointsLayer.clearLayers();
  clearHeat();

  for (const it of items) {
    const [lat, lng] = jitterLatLng(it.lat, it.lng);
    const color = typeColor(it.type);

    const marker = L.circleMarker([lat, lng], {
      radius: 6,
      weight: 2,
      color,
      fillColor: color,
      fillOpacity: 0.55
    });

    const occurred = it.occurred_at ? new Date(it.occurred_at).toLocaleString() : "";
    const note = (it.note || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

    marker.bindPopup(
      `<b>${(it.type || "ocorrência").toUpperCase()}</b><br>` +
      (occurred ? `${occurred}<br>` : "") +
      (note ? `<div style="margin-top:6px;white-space:pre-wrap">${note}</div>` : "")
    );

    marker.addTo(pointsLayer);

    // heat por tipo
    addToHeat(it.type, lat, lng, 1);
  }
}

// ======== Painel ========
function openPanel() { el("panel").style.display = "block"; }
function closePanel() { el("panel").style.display = "none"; setStatus(""); }

function setMode(mode) {
  reportMode = mode;
  el("modeGPS").classList.toggle("active", mode === "gps");
  el("modeManual").classList.toggle("active", mode === "manual");
  el("gpsHint").style.display = mode === "gps" ? "block" : "none";
  el("manualHint").style.display = mode === "manual" ? "block" : "none";

  if (mode === "manual") setStatus("Toque no mapa para escolher o ponto (um marcador será movido).");
  else setStatus("Use GPS: clique em “Enviar” (ou “Minha localização”).");
}

// ======== Ações ========
async function refresh() {
  try {
    setStatus("Carregando…");
    const days = Number(el("range").value);
    const type = el("filterType").value;
    const items = await fetchIncidents(days, type);
    render(items);
    setStatus(`${items.length} ocorrência(s) no período.`);
  } catch (e) {
    setStatus(e.message || "Erro ao atualizar.");
  }
}

async function submitReport() {
  try {
    const type = el("type").value;
    const note = (el("note").value || "").trim().slice(0, 700);
    const occurredAtInput = el("occurredAt").value;
    const occurred_at = occurredAtInput ? new Date(occurredAtInput).toISOString() : new Date().toISOString();

    if (reportMode === "gps") {
      const { latlng } = await locateUser(false);
      pendingLatLng = latlng;
    } else {
      if (!pendingLatLng) throw new Error("Escolha um ponto no mapa (toque no local).");
    }

    if (!pendingLatLng) throw new Error("Não foi possível obter o local.");

    setStatus("Enviando…");
    await createIncident({
      type,
      note,
      lat: Number(pendingLatLng.lat.toFixed(7)),
      lng: Number(pendingLatLng.lng.toFixed(7)),
      occurred_at
    });

    // Limpa campos
    el("note").value = "";
    el("occurredAt").value = "";

    // mantém marcador manual (pra facilitar próximas vezes) — se quiser remover, descomente:
    // if (manualMarker) { map.removeLayer(manualMarker); manualMarker = null; }

    closePanel();
    await refresh();
  } catch (e) {
    setStatus(e.message || "Erro ao enviar.");
  }
}

function wireUI() {
  el("btnLocate").addEventListener("click", () =>
    locateUser(true).catch((e) => setStatus(e.message || "Sem permissão de localização."))
  );

  // IMPORTANTE: este é o botão que abre o painel
  el("btnReport").addEventListener("click", () => {
    openPanel();
    setMode(reportMode);
  });

  el("btnClosePanel").addEventListener("click", closePanel);
  el("btnCancel").addEventListener("click", closePanel);
  el("btnSubmit").addEventListener("click", submitReport);

  el("modeGPS").addEventListener("click", () => setMode("gps"));
  el("modeManual").addEventListener("click", () => setMode("manual"));

  el("btnRefresh").addEventListener("click", refresh);
  el("range").addEventListener("change", refresh);
  el("filterType").addEventListener("change", refresh);
}

// ======== Start ========
initMap();
wireUI();

// tenta centralizar ao abrir (se o usuário permitir)
locateUser(false).catch(() => {});

// carrega dados
refresh().catch(() => {});
