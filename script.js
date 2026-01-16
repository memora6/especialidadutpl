const SB_URL = 'https://hslshwdmcvgdjvhomght.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzbHNod2RtY3ZnZGp2aG9tZ2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTM3MTMsImV4cCI6MjA4MzkyOTcxM30.0xAy_3p9E3qQmlg2MsZxXgl19g9KRDkph0lEnXDL2TI';

// Inicializar Mapa
const map = L.map('map', { zoomControl: false }).setView([0.35, -78.12], 11);
L.control.zoom({ position: 'topright' }).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{y}/{x}/{z}');

let marcador = null, coordsActuales = null;

// --- TODAS LAS CAPAS INCLUIDAS ---
const capasConfig = [
    { tabla: 'cantones', nombre: '🗺️ Cantones', color: '#7f8c8d', campo: 'DPA_DESCAN', visible: true },
    { tabla: 'calles', nombre: '🚗 Red Vial', color: '#e67e22', campo: 'RED_VIAL', visible: true },
    { tabla: 'mina', nombre: '🏗️ Minas', color: '#2c3e50', campo: 'material', visible: false },
    { tabla: 'puentes', nombre: '🌉 Puentes', color: '#3498db', campo: 'nombre', visible: false },
    { tabla: 'sen_vertical', nombre: '🛑 Señal. Vertical', color: '#9b59b6', campo: 'tipo', visible: false },
    { tabla: 'sen_horizontal', nombre: '➖ Señal. Horizontal', color: '#f1c40f', campo: 'tipo', visible: false },
    { tabla: 'poblados', nombre: '🏠 Poblados', color: '#2ecc71', campo: 'nam', visible: false },
    { tabla: 'avance_obra', nombre: '👷 Avances Obra', color: '#27ae60', campo: 'tipo_trabajo', visible: true }
];

const controlLayers = L.control.layers({"Mapa base": osm, "Satélite": satelite}, null, { position: 'topright' }).addTo(map);

// --- GPS Y DETECCIÓN ---
async function detectarCanton(lat, lon) {
    try {
        const res = await fetch(`${SB_URL}/rest/v1/rpc/obtener_canton_por_coordenadas`, {
            method: 'POST',
            headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: parseFloat(lat), lon: parseFloat(lon) })
        });
        const canton = await res.json();
        document.getElementById('op_canton').value = canton || "Fuera de límites";
    } catch (e) { console.error("Error cantón"); }
}

function actualizarUbicacion(lat, lng) {
    coordsActuales = { lat, lng };
    document.getElementById('disp_lat').innerText = lat.toFixed(6);
    document.getElementById('disp_lng').innerText = lng.toFixed(6);

    if (marcador) marcador.setLatLng([lat, lng]);
    else marcador = L.marker([lat, lng], {draggable: true}).addTo(map);
    
    map.flyTo([lat, lng], 15);
    detectarCanton(lat, lng);
}

map.on('click', (e) => actualizarUbicacion(e.latlng.lat, e.latlng.lng));

function obtenerGPS() {
    navigator.geolocation.getCurrentPosition(
        (pos) => actualizarUbicacion(pos.coords.latitude, pos.coords.longitude),
        (err) => alert("Error GPS: " + err.message),
        { enableHighAccuracy: true }
    );
}

// --- CARGA DE CAPAS Y ANÁLISIS ---
async function cargarCapa(info) {
    try {
        const res = await fetch(`${SB_URL}/rest/v1/rpc/get_capa_geojson`, {
            method: 'POST',
            headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre_tabla: info.tabla })
        });
        const geojson = await res.json();
        const layer = L.geoJSON(geojson, {
            style: { color: info.color, weight: 3, opacity: 0.8 },
            pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, fillColor: info.color, color: "#fff", weight: 2, fillOpacity: 1 }),
            onEachFeature: (f, l) => {
                const nombre = f.properties[info.campo] || "S/N";
                l.bindPopup(`<b>${info.nombre}</b><br>${nombre}`);

                if (info.tabla === 'calles') {
                    l.on('click', async (e) => {
                        L.DomEvent.stopPropagation(e);
                        l.setPopupContent("<i>Analizando proximidad...</i>").openPopup();
                        const rAnalisis = await fetch(`${SB_URL}/rest/v1/rpc/analizar_entorno_via_resumen`, {
                            method: 'POST',
                            headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ via_id: f.properties.id })
                        });
                        const d = await rAnalisis.json();
                        
                        let h = `<div style="min-width:200px; font-size:12px;"><b>Vía: ${nombre}</b><hr style="margin:5px 0;">`;
                        h += `🏠 <b>Poblados:</b> ${d.total_poblados}<br><small>${d.nombres_poblados}</small><br>`;
                        h += `🌉 <b>Puentes:</b> ${d.total_puentes}<br>`;
                        h += `<br>🏗️ <b>Minas:</b>`;
                        if(Object.keys(d.resumen_minas).length > 0)
                            for (let [m, c] of Object.entries(d.resumen_minas)) h += `<div class="analisis-item">• ${m}: ${c}</div>`;
                        else h += `<br><i>Sin minas cercanas</i>`;

                        h += `<br><br>🛑 <b>Señalética:</b>`;
                        if(Object.keys(d.resumen_senales).length > 0)
                            for (let [s, c] of Object.entries(d.resumen_senales)) h += `<div class="analisis-item">• ${s}: ${c}</div>`;
                        else h += `<br><i>Sin señales registradas</i>`;
                        
                        l.setPopupContent(h + `</div>`);
                    });
                }
            }
        });
        controlLayers.addOverlay(layer, info.nombre);
        if (info.visible) layer.addTo(map);
    } catch (err) { console.error("Carga fallida: " + info.tabla); }
}

// --- ENVÍO A TELEGRAM Y SUPABASE ---
async function enviarAvance() {
    const nom = document.getElementById('op_nombre').value;
    if (!nom || !coordsActuales) return alert("Complete nombre y ubicación");

    const data = {
        operador_nombre: nom,
        tipo_trabajo: document.getElementById('op_trabajo').value,
        descripcion_avance: document.getElementById('op_desc').value,
        lat_inicio: coordsActuales.lat, long_inicio: coordsActuales.lng
    };

    const res = await fetch(`${SB_URL}/rest/v1/avance_obra`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (res.ok) {
        const msg = `🚜 *AVANCE VIAL* 🚧\n👷 *Op:* ${nom}\n🏗️ *Trabajo:* ${data.tipo_trabajo}\n🏢 *Cantón:* ${document.getElementById('op_canton').value}\n📍 *Coords:* \`${data.lat_inicio}, ${data.long_inicio}\`\n🔗 [Ver en Google Maps](https://www.google.com/maps?q=${data.lat_inicio},${data.long_inicio})`;
        
        await fetch(`https://api.telegram.org/bot8583030300:AAFAhNGvqEKol76zQBtqboP3rJbbxdCTNqE/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: '1787292879', text: msg, parse_mode: 'Markdown' })
        });

        alert("✅ Reporte guardado y enviado");
        location.reload();
    }
}

capasConfig.forEach(cargarCapa);