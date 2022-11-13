import TileGrid from "ol/tilegrid/TileGrid";
import {Map, View, Collection} from "ol";
import {defaults} from "ol/control";
import {Group, Vector, Tile} from "ol/layer";
import {TileImage, Vector as VectorSource} from "ol/source";
import {GeoJSON} from "ol/format";
import {Style, Stroke} from "ol/style";
import {addDefaultMapControls} from "./mapControls"
import Socket from "./webSocket";
const EditTools = require("./mapEditTools")

var map = new Map({
  controls: defaults(),
  target: 'map',
  layers: [
    new Group({
      // title: 'Map',
      // combine: true,
      layers: [
        new Tile({
          title: 'Map',
          type: 'base',
          // opacity: 0.7,
          source: new TileImage({
            attributions: '<a href="https://sentsu.itch.io/foxhole-better-map-mod" target="_blank">Sentsu</a> + <a href="https://www.foxholegame.com/" target="_blank">Siege Camp</a>',
            tileGrid: new TileGrid({
              extent: [0,-12432,11279,0],
              origin: [0,-12432],
              resolutions: [64,32,16,8,4,2,1],
              tileSize: [256, 256]
            }),
            tileUrlFunction: function(tileCoord) {
              return ('/map/{z}/{x}/{y}.webp'
                .replace('{z}', String(tileCoord[0]))
                .replace('{x}', String(tileCoord[1]))
                .replace('{y}', String(- 1 - tileCoord[2])));
            },
          })
        }),
      ]
    }),
  ],
  view: new View({
    center: [5625.500000, -6216.000000],
    resolution: 10.000000,
    resolutions: [64,32,16,8,4,2,1],
  })
});

addDefaultMapControls(map)
// Prevent context menu on map
document.getElementById('map').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
})

const tools = new EditTools(map);

//
// add lines
//

const geoJson = new GeoJSON();
const collection = new Collection();
const clanCollections = {}
const clanGroup = new Group({
  title: 'Train Lines',
});
map.addLayer(clanGroup);
const socket = new Socket();

socket.on('acl', (acl) => {
  tools.initAcl(acl)
})

tools.allTracksCollection = collection

socket.on('tracks', (tracks) => {
  collection.clear()
  for (const clan in clanCollections) {
    clanCollections[clan].clear()
  }
  const col = geoJson.readFeatures(tracks)
  collection.extend(col)
})

collection.on('add', (e) => {
  const feature = e.element
  const clan = feature.get('clan')
  if (!(clan in clanCollections)) {
    clanCollections[clan] = createClanCollection(clan)
  }
  clanCollections[clan].push(feature)
})

function createClanCollection(clan) {
  const collection = new Collection()
  const sourceLine = new VectorSource({
    features: collection,
  });

  const vectorLine = new Vector({
    source: sourceLine,
    title: clan,
    style: (feature, zoom) => {
      return new Style({
        stroke: new Stroke({
          color: feature.get('color'),
          width: 5,
        }),
        geometry: tools.track.geometryFunction
      })
    }
  });
  clanGroup.getLayers().push(vectorLine);
  return collection;
}

tools.on(tools.EVENT_TRACK_ADDED, (track) => {
  socket.send('trackAdd', geoJson.writeFeatureObject(track.feature))
})

tools.on(tools.EVENT_TRACK_UPDATED, (track) => {
  socket.send('trackUpdate', geoJson.writeFeatureObject(track))
})

tools.on(tools.EVENT_TRACK_DELETE, (track) => {
  if (track && track.get('id')) {
    socket.send('trackDelete', {id: track.get('id')})
  }
})

tools.on(tools.EVENT_ICON_ADDED, (icon) => {
  socket.send('iconAdd', geoJson.writeFeatureObject(icon))
})

tools.on(tools.EVENT_ICON_UPDATED, (icon) => {
  if (icon && icon.get('id')) {
    socket.send('iconUpdate', geoJson.writeFeatureObject(icon))
  }
})

tools.on(tools.EVENT_ICON_DELETED, (icon) => {
  if (icon && icon.get('id')) {
    socket.send('iconDelete', {id: icon.get('id')})
  }
})

socket.on('icons', (features) => {
  const col = geoJson.readFeatures(features)
  tools.information.clearFeatures()
  tools.sign.clearFeatures()
  tools.facility.clearFeatures()
  tools.customFacility.clearFeatures();
  col.forEach((feature) => {
    switch (feature.get('type')) {
      case 'information':
        tools.information.addFeature(feature)
        break;
      case 'sign':
        tools.sign.addFeature(feature)
        break;
      case 'facility':
        tools.facility.addFeature(feature)
        break;
      case 'custom-facility':
        tools.customFacility.addFeature(feature)
        break;
    }
  })
})

tools.on(tools.EVENT_DECAY_UPDATE, (data) => {
  socket.send('decayUpdate', data)
})

socket.on('decayUpdated', (data) => {
  tools.emit(tools.EVENT_DECAY_UPDATED, data)
  if (data.type === 'track') {
    collection.forEach((feat) => {
      if (feat.get('id') === data.id) {
        feat.set('time', data.time)
      }
    })
  }
})