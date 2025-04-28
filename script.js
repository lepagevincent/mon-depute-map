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
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap & CartoDB',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Stockage
let deputeData = {};
let mairesData = {};
let regionsLayer, departementsLayer, circonscriptionsLayer, communesLayer;

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

// Charger les données des maires
fetch('data/maires_for_communes_layer.csv')
    .then(res => res.text())
    .then(text => {
        const rows = text.split('\n');
        const headers = rows[0].split(',');

        rows.slice(1).forEach(row => {
            const columns = row.split(',');
            const communeName = columns[0].trim();
            const codeCommune = columns[1].trim();
            const nomElu = columns[2].trim();
            const prenomElu = columns[3].trim();
            const debutMandat = columns[4].trim();

            mairesData[codeCommune] = {
                communeName,
                nomElu,
                prenomElu,
                debutMandat
            };
        });
    });

// Fonction pour afficher les informations des élus dans un popup lors du clic sur une commune
function onEachFeatureCommune(feature, layer) {
    
    storeOriginalStyle(layer);

    // Ajouter les événements de survol et de clic
    layer.on({
        click: (e) => {                 // Lorsque la commune est cliquée
            console.log(feature);
            const codeCommune = feature.properties.code;
            const maire = mairesData[codeCommune];
            console.log(maire);
            if (maire) {
                const popupContent = `
                    <b>Commune :</b> ${maire.communeName} <br>
                    <b>Nom de l'élu :</b> ${maire.nomElu} ${maire.prenomElu} <br>
                    <b>Date de début du mandat :</b> ${maire.debutMandat} <br>
                `;
                layer.bindPopup(popupContent).openPopup();
            } else {
                layer.bindPopup("Aucune information sur l'élu disponible.").openPopup();
            }
        },
        mouseover: highlightFeature,   // Lorsque la souris survole la commune
        mouseout: resetHighlight,      // Lorsque la souris quitte la commune
    });
}

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

// Charger toutes les couches (regions, departements, circonscriptions) et gérer les communes
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
                            map.flyToBounds(layer.getBounds(), { maxZoom: 9 });
                            hideLayer(departementsLayer);
                            showLayer(circonscriptionsLayer);
                            forceResetHover();
                        },
                        mouseover: highlightFeature,
                        mouseout: resetHighlight
                    });
                }
            })
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
                                let contactSection = '';
                                const popupContent = `
                                    <b>Député :</b> ${depute.prenom} ${depute.nom}<br>
                                    <b>Groupe :</b> ${depute.groupe}<br>
                                    <b>Mandats :</b> ${parseInt(depute.nombreMandats)}<br> 
                                    <b>Participation :</b> ${Math.round(depute.scoreParticipation * 100)}% <br>
                                    ${contactSection}
                                `;
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

    // Charger les données des communes et afficher seulement celles visibles
    fetch('data/communes-1000m.geojson')
        .then(res => res.json())
        .then(data => {
            communesLayer = L.geoJSON(data, {
                style: { 
                    color: "#FF6347",   
                    weight: 1,          
                    opacity: 0.7,
                    fillOpacity: 0.3    
                },
                onEachFeature: onEachFeatureCommune
            })
        })
        .catch(error => {
            console.error("Erreur lors du chargement du fichier GeoJSON des communes:", error);
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

// Hover sur une zone
function highlightFeature(e) {
    const layer = e.target;

    if (map._lastHighlighted && map._lastHighlighted !== layer) {
        resetHighlight({ target: map._lastHighlighted });
    }

    layer.setStyle({
        fillOpacity: 0.4,  
        weight: 3          
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

// Zoom dynamique
map.on('zoomend', function() {
    const currentZoom = map.getZoom();
    console.log(currentZoom);

    if (currentZoom <= 6.0) {
        showLayer(regionsLayer);
        hideLayer(departementsLayer);
        hideLayer(circonscriptionsLayer);
        hideLayer(communesLayer);
    } else if (currentZoom > 6.0 && currentZoom <= 8.0) {
        hideLayer(regionsLayer);
        showLayer(departementsLayer);
        hideLayer(circonscriptionsLayer);
        hideLayer(communesLayer);
    } else if (currentZoom >= 8.0 && currentZoom <= 9.0) {
        hideLayer(regionsLayer);
        hideLayer(departementsLayer);
        showLayer(circonscriptionsLayer);
        hideLayer(communesLayer);
    } else {
        hideLayer(regionsLayer);
        hideLayer(departementsLayer);
        hideLayer(circonscriptionsLayer);
        if (!map.hasLayer(communesLayer)) {
            showLayer(communesLayer); // Charger la couche des communes seulement si elle n'est pas déjà ajoutée
        }
    }
});
