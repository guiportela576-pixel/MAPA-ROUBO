
const SUPABASE_URL = "https://dzqxjxjowffsycleaing.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_pTejfMN_InaVgdfxiyrdQQ_5ptGF_Yo";
const SUPABASE_TABLE = "incidents";

let map;
let userMarker=null;
let clickMarker=null;
let pendingLatLng=null;

let layerRoubo;
let layerFurto;
let layerTentativa;
let layerOutro;

function status(t){
 const s=document.getElementById("status");
 if(s) s.textContent=t;
}

function initMap(){

 map=L.map("map").setView([-14.23,-51.92],4);

 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

 layerRoubo=L.layerGroup().addTo(map);
 layerFurto=L.layerGroup().addTo(map);
 layerTentativa=L.layerGroup().addTo(map);
 layerOutro=L.layerGroup().addTo(map);

 map.on("click",e=>{

  pendingLatLng=e.latlng;

  if(!clickMarker){
   clickMarker=L.marker(e.latlng).addTo(map);
  }else{
   clickMarker.setLatLng(e.latlng);
  }

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

 },()=>status("GPS não permitido"),{enableHighAccuracy:true});

}

function headers(){
 return{
  "apikey":SUPABASE_ANON_KEY,
  "Authorization":"Bearer "+SUPABASE_ANON_KEY,
  "Content-Type":"application/json"
 }
}

function colorByType(type){

 if(type=="roubo") return "red";
 if(type=="furto") return "orange";
 if(type=="tentativa") return "yellow";

 return "blue";
}

function layerByType(type){

 if(type=="roubo") return layerRoubo;
 if(type=="furto") return layerFurto;
 if(type=="tentativa") return layerTentativa;

 return layerOutro;
}

async function load(){

 const r=await fetch(SUPABASE_URL+"/rest/v1/"+SUPABASE_TABLE+"?select=*",{headers:headers()});
 const data=await r.json();

 layerRoubo.clearLayers();
 layerFurto.clearLayers();
 layerTentativa.clearLayers();
 layerOutro.clearLayers();

 data.forEach(i=>{

  const color=colorByType(i.type);

  const marker=L.circleMarker(
   [i.lat,i.lng],
   {radius:8,color:color,fillColor:color,fillOpacity:0.6}
  );

  const layer=layerByType(i.type);

  marker.bindPopup("<b>"+i.type+"</b><br>"+(i.note||""));

  marker.addTo(layer);

 });

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

 if(clickMarker){
  map.removeLayer(clickMarker);
  clickMarker=null;
 }

 pendingLatLng=null;

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
