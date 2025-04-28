// Initialiser la carte centrée sur la France
const map = L.map('map', {
    maxBounds: [
        [35.0, -12.0],
        [58.0, 20.0]
    ],
    maxBoundsViscosity: 1.0,
    minZoom: 6,
    maxZoom: 10,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    tap: true, // ➔ activation du support mobile
    zoomControl: true
}).setView([46.8, 2.5], 6);

// Fond minimaliste
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap & CartoDB',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Stockage
let deputeData = {};
let regionsLayer, departementsLayer, circonscriptionsLayer;
map._lastHighlighted = null;

// Charger les données députés
Papa.parse('data/deputes-active-corrected.csv', {
    download: true,
    header: true,
    delimiter: ';',
    complete: function(results) {
        results.data.forEach(dep => {
            const departement = dep['departement'].toString().trim();  // Pas de zero ajouté ici
            let numCirco = dep['numCirco'];

            if (typeof numCirco === 'string' && numCirco.includes('.'))
                numCirco = numCirco.split('.')[0]; // Supprimer le .0
            else if (typeof numCirco === 'number')
                numCirco = parseInt(numCirco, 10);

            const key = `${departement}-${numCirco}`; // Pas de zéro ajouté pour le département
            deputeData[key] = dep;
        });
        loadAllLayers();
    }
});

// Fonction pour définir la couleur selon le groupe
function getGroupColor(groupeAbrev) {
    if (!groupeAbrev) return '#B0BEC5';
    groupeAbrev = groupeAbrev.replace('-NFP', '').trim();

    switch (groupeAbrev) {
        case 'RN': return '#0055A4';
        case 'LFI': return '#D32F2F';
        case 'SOC': return '#F06292';
        case 'ECOS': return '#4CAF50';
        case 'HOR': return '#FF9800';
        case 'DEM': return '#FFEB3B';
        case 'DR': return '#1A237E';
        case 'EPR': return '#6D4C41';
        case 'GDR': return '#C62828';
        case 'LIOT': return '#8D6E63';
        case 'NI': return '#90A4AE';
        case 'UDR': return '#64B5F6';
        default: return '#B0BEC5';
    }
}

// Charger toutes les couches
function loadAllLayers() {
    fetch('data/regions.geojson')
        .then(res => res.json())
        .then(data => {
            regionsLayer = L.geoJSON(data, {
                style: { color: "#3388ff", weight: 2 },
                onEachFeature: (feature, layer) => {
                    storeOriginalStyle(layer);
                    layer.on({
                        click: () => {
                            resetAllStyles(regionsLayer);
                            map.flyToBounds(layer.getBounds(), { maxZoom: 8 });
                            hideLayer(regionsLayer);
                            showLayer(departementsLayer);
                            forceResetHover();
                        },
                        mouseover: highlightFeature,
                        mouseout: resetHighlight
                    });
                }
            }).addTo(map);
        });

    fetch('data/departements.geojson')
        .then(res => res.json())
        .then(data => {
            departementsLayer = L.geoJSON(data, {
                style: { color: "#34a853", weight: 2 },
                onEachFeature: (feature, layer) => {
                    storeOriginalStyle(layer);
                    layer.on({
                        click: () => {
                            resetAllStyles(departementsLayer);
                            map.flyToBounds(layer.getBounds(), { maxZoom: 10 });
                            hideLayer(departementsLayer);
                            showLayer(circonscriptionsLayer);
                            forceResetHover();
                        },
                        mouseover: highlightFeature,
                        mouseout: resetHighlight
                    });
                }
            });
        });

    fetch('data/france-circonscriptions-legislatives-2012.geojson')
        .then(res => res.json())
        .then(data => {
            circonscriptionsLayer = L.geoJSON(data, {
                style: feature => {
                    const dep = feature.properties.code_dpt || feature.properties.dep;
                    const numCirco = feature.properties.num_circ || feature.properties.circo;
                    
                    // Retirer le zéro devant les départements inférieurs à 10
                    const depFormatted = dep.startsWith('0') ? dep.substring(1) : dep; // Si le département commence par 0, on le supprime
    
                    const key = `${depFormatted}-${numCirco}`;

                    const depute = deputeData[key];
                    let fillColor = '#B0BEC5';

                    if (depute && depute.groupeAbrev) {
                        fillColor = getGroupColor(depute.groupeAbrev);
                    }

                    return {
                        color: '#333333',
                        weight: 1,
                        opacity: 0.7,
                        fillColor: fillColor,
                        fillOpacity: 0.7
                    };
                },
                onEachFeature: (feature, layer) => {
                    storeOriginalStyle(layer);
                    layer.on({
                        click: (e) => {
                            const dep = feature.properties.code_dpt || feature.properties.dep;
                            const numCirco = feature.properties.num_circ || feature.properties.circo;
                            
                            // Retirer le zéro devant les départements inférieurs à 10
                            const depFormatted = dep.startsWith('0') ? dep.substring(1) : dep; // Si le département commence par 0, on le supprime
            
                            const key = `${depFormatted}-${numCirco}`;
                            const depute = deputeData[key];

                            if (depute) {
                                // Créer un contactSection si les informations existent
                                let contactSection = '';
                            
                                // Vérifier si mail, site, facebook ou twitter existent et afficher
                                if (depute.mail || depute.siteInternet || depute.facebook || depute.twitter) {
                                    contactSection = `
                                        <div style="margin-top:10px; padding:8px; border:1px solid #ccc; border-radius:5px; background:#f9f9f9;">
                                            <b>Contact :</b><br>
                                            ${depute.mail ? `✉️ <a href="mailto:${depute.mail}">${depute.mail}</a><br>` : ''}
                                            ${depute.siteInternet ? `🌐 <a href="${depute.siteInternet}" target="_blank">Site Internet</a><br>` : ''}
                                            ${depute.facebook ? `📱 <a href="https://www.facebook.com/${depute.facebook}" target="_blank">Facebook</a><br>` : ''}
                                            ${depute.twitter ? `🐦 <a href="https://x.com/${depute.twitter}" target="_blank">Twitter</a><br>` : ''}
                                        </div>
                                    `;
                                }
                            
                                // Contenu principal de la popup
                                const popupContent = `
                                    <b>Député :</b> ${depute.prenom} ${depute.nom}<br>
                                    <b>Groupe :</b> ${depute.groupe}<br>
                                    <b>Mandats :</b> ${parseInt(depute.nombreMandats)}<br> <!-- Pas de décimale -->
                                    <b>Participation :</b> ${Math.round(depute.scoreParticipation * 100)}% <!-- Score arrondi et en pourcentage -->
                                    ${contactSection} <!-- Contact info ajoutée ici -->
                                `;
                                
                                // Afficher la popup
                                layer.bindPopup(popupContent).openPopup();
                            } else {
                                layer.bindPopup("Pas d'info pour cette circo.").openPopup();
                            }
                        },
                        mouseover: highlightFeature,
                        mouseout: resetHighlight
                    });
                }
            });
        });
}

// Gestion des styles
function storeOriginalStyle(layer) {
    layer.options.originalColor = layer.options.color;
    layer.options.originalFillColor = layer.options.fillColor || layer.options.color || '#cccccc';
    layer.options.originalFillOpacity = layer.options.fillOpacity !== undefined ? layer.options.fillOpacity : 0.5;
}

function showLayer(layer) {
    if (layer && !map.hasLayer(layer)) map.addLayer(layer);
}

function hideLayer(layer) {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
}

function resetAllStyles(layerGroup) {
    if (layerGroup) {
        layerGroup.eachLayer(function(layer) {
            layer.setStyle({
                weight: 2,
                color: layer.options.originalColor,
                fillColor: layer.options.originalFillColor,
                opacity: 0.7,
                fillOpacity: layer.options.originalFillOpacity
            });
        });
    }
}

function forceResetHover() {
    if (map._lastHighlighted) {
        resetHighlight({ target: map._lastHighlighted });
        map._lastHighlighted = null;
    }
}

// Hover sur une zone
function highlightFeature(e) {
    const layer = e.target;

    if (map._lastHighlighted && map._lastHighlighted !== layer) {
        resetHighlight({ target: map._lastHighlighted });
    }

    layer.setStyle({
        fillOpacity: 0.6
    });

    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
    }

    map._lastHighlighted = layer;
}

// Reset du hover
function resetHighlight(e) {
    const layer = e.target;

    layer.setStyle({
        weight: 2,
        color: layer.options.originalColor,
        fillColor: layer.options.originalFillColor,
        opacity: 0.7,
        fillOpacity: layer.options.originalFillOpacity
    });
}

// Bouton home
let homeButton = L.control({ position: 'topleft' });

homeButton.onAdd = function(map) {
    let div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
    div.innerHTML = '🔄';
    div.style.backgroundColor = 'white';
    div.style.width = '34px';
    div.style.height = '34px';
    div.style.lineHeight = '34px';
    div.style.textAlign = 'center';
    div.style.fontSize = '20px';
    div.style.cursor = 'pointer';
    
    div.onclick = function(){
        map.setView([46.8, 2.5], 6);
        showLayer(regionsLayer);
        hideLayer(departementsLayer);
        hideLayer(circonscriptionsLayer);
        forceResetHover();
    };
    return div;
};

homeButton.addTo(map);

// Zoom dynamique
map.on('zoomend', function() {
    const currentZoom = map.getZoom();

    if (currentZoom <= 6.5) {
        showLayer(regionsLayer);
        hideLayer(departementsLayer);
        hideLayer(circonscriptionsLayer);
    } else if (currentZoom > 6.5 && currentZoom <= 8.5) {
        hideLayer(regionsLayer);
        showLayer(departementsLayer);
        hideLayer(circonscriptionsLayer);
    } else {
        hideLayer(regionsLayer);
        hideLayer(departementsLayer);
        showLayer(circonscriptionsLayer);
    }
});
