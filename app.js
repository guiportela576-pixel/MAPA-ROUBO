
// Versão melhorada do app.js
// Detecta cidade automaticamente e centraliza mapa

const SUPABASE_URL = "";      
const SUPABASE_ANON_KEY = ""; 
const SUPABASE_TABLE = "incidents";

let map, pointsLayer, heatLayer;
let userMarker=null;
let pendingLatLng=null;

function status(t){
 const s=document.getElementById("status");
 if(s) s.textContent=t;
}

function setCity(name){
 let c=document.getElementById("cityName");
 if(!c){
  c=document.createElement("div");
  c.id="cityName";
  c.style.position="fixed";
  c.style.top="60px";
  c.style.left="10px";
  c.style.background="rgba(0,0,0,.6)";
  c.style.padding="6px 10px";
  c.style.borderRadius="8px";
  c.style.fontSize="12px";
  c.style.color="white";
  document.body.appendChild(c);
 }
 c.textContent="Cidade: "+name;
}

async function detectCity(lat,lng){
 try{
  const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
  const d=await r.json();
  const city=d.address.city||d.address.town||d.address.village||d.address.state;
  if(city) setCity(city);
 }catch(e){}
}

function initMap(){

 map=L.map("map").setView([-14.23,-51.92],4);

 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
  maxZoom:19
 }).addTo(map);

 pointsLayer=L.layerGroup().addTo(map);
 heatLayer=L.heatLayer([], {radius:25}).addTo(map);

 map.on("click",e=>{
  pendingLatLng=e.latlng;
  L.marker(e.latlng).addTo(map);
 });
}

function locate(){

 navigator.geolocation.getCurrentPosition(p=>{

  const lat=p.coords.latitude;
  const lng=p.coords.longitude;

  pendingLatLng={lat,lng};

  if(!userMarker){
   userMarker=L.marker([lat,lng]).addTo(map);
  }else{
   userMarker.setLatLng([lat,lng]);
  }

  map.setView([lat,lng],16);
  detectCity(lat,lng);

 },()=>status("GPS não permitido"),{enableHighAccuracy:true});

}

function headers(){
 return{
  "apikey":SUPABASE_ANON_KEY,
  "Authorization":"Bearer "+SUPABASE_ANON_KEY,
  "Content-Type":"application/json"
 }
}

async function load(){

 const r=await fetch(SUPABASE_URL+"/rest/v1/"+SUPABASE_TABLE+"?select=*",{headers:headers()});
 const data=await r.json();

 const heat=[];
 pointsLayer.clearLayers();

 data.forEach(i=>{
  const m=L.circleMarker([i.lat,i.lng],{radius:5}).addTo(pointsLayer);
  heat.push([i.lat,i.lng,1]);
 });

 heatLayer.setLatLngs(heat);

}

async function save(){

 if(!pendingLatLng){
  status("Escolha um ponto no mapa");
  return;
 }

 const type=document.getElementById("type").value;
 const note=document.getElementById("note").value;

 await fetch(SUPABASE_URL+"/rest/v1/"+SUPABASE_TABLE,{
  method:"POST",
  headers:headers(),
  body:JSON.stringify({
   type:type,
   note:note,
   lat:pendingLatLng.lat,
   lng:pendingLatLng.lng,
   occurred_at:new Date().toISOString()
  })
 });

 status("Ocorrência registrada");
 load();
}

function ui(){

 document.getElementById("btnLocate").onclick=locate;
 document.getElementById("btnSubmit").onclick=save;

}

initMap();
ui();
locate();
load();
