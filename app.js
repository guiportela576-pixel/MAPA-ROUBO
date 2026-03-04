// Mapa colaborativo (opção B - mapa grátis) + armazenamento no Supabase (simples para começar).
// Você só precisa colar seu SUPABASE_URL e SUPABASE_ANON_KEY abaixo.
//
// Se preferir outro backend depois, dá para trocar só as funções fetchIncidents() e createIncident().

const SUPABASE_URL = "";      // <-- COLE AQUI
const SUPABASE_ANON_KEY = ""; // <-- COLE AQUI
const SUPABASE_TABLE = "incidents";

// Privacidade: desloca levemente o ponto na visualização pública para reduzir risco de expor casa/rotina.
// 0.00045 ~ 50m (varia com latitude). Ajuste se quiser.
const DISPLAY_JITTER_DEGREES = 0.00045;

// Config do heatmap
const HEAT_RADIUS = 28;
const HEAT_BLUR = 20;

let map, heatLayer, pointsLayer;
let userMarker = null;
let manualMarker = null;
let reportMode = "gps"; // "gps" | "manual"
let pendingLatLng = null;

const el = (id) => document.getElementById(id);

function setStatus(msg) { el("status").textContent = msg || ""; }

// ======== PWA (instalação) ========
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

// ======== Mapa ========
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([ -14.2350, -51.9253 ], 4); // Brasil (start)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  pointsLayer = L.layerGroup().addTo(map);
  heatLayer = L.heatLayer([], { radius: HEAT_RADIUS, blur: HEAT_BLUR, maxZoom: 17 }).addTo(map);

  map.on("click", (e) => {
    if (reportMode !== "manual") return;
    setManualPoint(e.latlng);
  });
}

function setManualPoint(latlng) {
  pendingLatLng = latlng;

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

function jitterLatLng(lat, lng) {
  if (!DISPLAY_JITTER_DEGREES) return [lat, lng];
  const j = DISPLAY_JITTER_DEGREES;
  const dx = (Math.random() * 2 - 1) * j;
  const dy = (Math.random() * 2 - 1) * j;
  return [lat + dx, lng + dy];
}

function addPointsToMap(items) {
  pointsLayer.clearLayers();
  const heatPoints = [];

  for (const it of items) {
    const [lat, lng] = jitterLatLng(it.lat, it.lng);

    const marker = L.circleMarker([lat, lng], {
      radius: 5,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.8
    });

    const occurred = it.occurred_at ? new Date(it.occurred_at).toLocaleString() : "";
    const note = (it.note || "").replaceAll("<","&lt;").replaceAll(">","&gt;");
    marker.bindPopup(
      `<b>${(it.type || "ocorrência").toUpperCase()}</b><br>` +
      (occurred ? `${occurred}<br>` : "") +
      (note ? `<div style="margin-top:6px;white-space:pre-wrap">${note}</div>` : "")
    );

    marker.addTo(pointsLayer);

    // peso do heatmap: 1 padrão
    heatPoints.push([lat, lng, 1]);
  }

  heatLayer.setLatLngs(heatPoints);
}

// ======== Localização (GPS) ========
function locateUser(center = true) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Seu navegador não suporta localização."));
      return;
    }

    setStatus("Solicitando localização… (permita o acesso no seu celular)");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng = L.latLng(latitude, longitude);

        pendingLatLng = latlng;

        if (!userMarker) {
          userMarker = L.marker(latlng).addTo(map);
        } else {
          userMarker.setLatLng(latlng);
        }

        setStatus(`Localização OK • precisão ~ ${Math.round(accuracy)}m`);

        if (center) map.setView(latlng, Math.max(map.getZoom(), 16));
        resolve({ latlng, accuracy });
      },
      (err) => {
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

// ======== Supabase (armazenamento compartilhado) ========
function supabaseHeaders() {
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };
}

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Falta configurar SUPABASE_URL e SUPABASE_ANON_KEY no app.js (veja README).");
  }
}

async function fetchIncidents(days, typeFilter) {
  requireSupabaseConfig();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=lat,lng,type,note,occurred_at,created_at&occurred_at=gte.${encodeURIComponent(since)}&order=occurred_at.desc`;

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

// ======== UI ========
function openPanel() { el("panel").style.display = "block"; }
function closePanel() {
  el("panel").style.display = "none";
  setStatus("");
  // Não apaga marker manual para permitir ajustar rapidamente, mas você pode mudar isso.
}

function setMode(mode) {
  reportMode = mode;
  el("modeGPS").classList.toggle("active", mode === "gps");
  el("modeManual").classList.toggle("active", mode === "manual");
  el("gpsHint").style.display = mode === "gps" ? "block" : "none";
  el("manualHint").style.display = mode === "manual" ? "block" : "none";

  if (mode === "manual") {
    setStatus("Toque no mapa para escolher o ponto.");
  } else {
    setStatus("Clique em “Enviar” para usar o GPS, ou toque em “Minha localização”.");
  }
}

async function refresh() {
  try {
    setStatus("Carregando mapa…");
    const days = Number(el("range").value);
    const type = el("filterType").value;
    const items = await fetchIncidents(days, type);
    addPointsToMap(items);
    setStatus(`${items.length} ocorrência(s) no período selecionado.`);
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

    // Pega o ponto
    if (reportMode === "gps") {
      const { latlng } = await locateUser(false);
      pendingLatLng = latlng;
    } else {
      if (!pendingLatLng) throw new Error("Escolha um ponto no mapa (toque no local).");
    }

    if (!pendingLatLng) throw new Error("Não foi possível obter o local.");

    // Pequena validação
    if (!["roubo","furto","tentativa","outro"].includes(type)) throw new Error("Tipo inválido.");

    // Salva
    setStatus("Enviando…");
    await createIncident({
      type,
      note,
      lat: Number(pendingLatLng.lat.toFixed(7)),
      lng: Number(pendingLatLng.lng.toFixed(7)),
      occurred_at
    });

    // Limpa campos (mantém modo)
    el("note").value = "";
    el("occurredAt").value = "";

    closePanel();
    await refresh();
  } catch (e) {
    setStatus(e.message || "Erro ao enviar.");
  }
}

function wireUI() {
  el("btnLocate").addEventListener("click", () => locateUser(true).catch((e) => setStatus(e.message || "Sem permissão de localização.")));
  el("btnReport").addEventListener("click", () => { openPanel(); setMode(reportMode); });
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

// Tenta localizar ao abrir (não força se o usuário negar)
locateUser(true).catch(() => {});

// Carrega ocorrências
refresh().catch(() => {});
