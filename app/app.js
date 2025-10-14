
let receptorsLayer; 
let impactMode = "Existing Noise Impact";

function yn(value) {
  if (value == null) return "NO";
  const s = String(value).trim().toUpperCase();
  return s === "Y" || s === "YES" || s === "TRUE" || s === "1" ? "YES" : "NO";
}

const data = {
  layout: {
    title: "h1",
    modal: "#modal",
    button: "#button",
  },
  map: {
    options: {
      center: [42, -100],
      zoom: 1,
      maxZoom: 22,
      zoomSnap: 0.25, 
      zoomDelta: 0.25, 
      zoomControl: false,
    },
    tiles: {
      base: {
        url: [
          "https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
          "https://cartodb-basemaps-b.global.ssl.fastly.net/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
          "https://cartodb-basemaps-c.global.ssl.fastly.net/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
        ],
        options: {
          attribution:
            'Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          opacity: 1,
          maxNativeZoom: 19,
          maxZoom: 22,
        },
      },
      labels: {
        url: [
          "https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/dark_only_labels/{z}/{x}/{y}.png",
          "https://cartodb-basemaps-b.global.ssl.fastly.net/rastertiles/dark_only_labels/{z}/{x}/{y}.png",
          "https://cartodb-basemaps-c.global.ssl.fastly.net/rastertiles/dark_only_labels/{z}/{x}/{y}.png",
        ],
        options: {
          attribution:
            'Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxNativeZoom: 19,
          maxZoom: 22,
        },
      },
    },
    // Leaflet panes 
    panes: ["ROW", "studyArea", "receptors", "barrier", "top"],
  },
  sources: {
    existingRow: {
      geojson: "data/existing-row.geojson",
      styles: {
        color: "#ffd900ff",
        weight: 2,
        opacity: 0.9,
      },
      pane: "ROW",
      fields: [],
      interactive: false,
      raw: false,
    },
    noiseBuffer: {
      geojson: "data/noise-buffer.geojson",
      styles: {
        color: "#ffffffff",
        weight: 3,
        fillOpacity: 0.2,
        fillColor: "#e3dfa6ff",
      },
      pane: "studyArea",
      fields: [],
      interactive: false,
      raw: false,
    },
    receptors: {
      geojson: "data/receptors.geojson",
      styles: {
        radius: 4,
        fillColor: "#e31a1c",
        color: "#000",
        weight: 0.5,
        opacity: 1,
        fillOpacity: 0.9,
      },
      pane: "receptors",
      fields: ["ReceiverName"],
      interactive: true,
      raw: false,
    },
    barriers: {
      geojson: "data/proposed-barrier.geojson",
      styles: {
        radius: 4,
        color: "#00FFFF",
        weight: 4,
        opacity: 1,
      },
      pane: "barrier",
      fields: ["Name"],
      interactive: true,
      raw: false,
    },
  },
  popupOptions: {
    className: "ml-tooltip-own",
  },
  interactive: {
    color: "cyan",
    weight: 5,
  },
  error: {
    process: "Error processing data",
    overlay: "Error loading overlay",
  },
};

// =========================
//  Kickoff 
// =========================
setLayout();
buttonUI();
const map = createBaseMap();
addSources();

// =========================
//  MapLibre base map
// =========================
function createBaseMap() {
  
  const lat = data.map.options.center[0];
  const lng = data.map.options.center[1];

  const m = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {},
      layers: [],
    },
    center: [lng, lat],
    zoom: data.map.options.zoom,
    maxZoom: data.map.options.maxZoom,
    attributionControl: false,
  });

 
  m.addControl(new maplibregl.AttributionControl({ compact: true }));


 
  m.on("load", () => {
    // Base (raster)
    m.addSource("base-tiles", {
      type: "raster",
      tiles: data.map.tiles.base.url,
      tileSize: 256,
      maxzoom: data.map.tiles.base.options.maxNativeZoom ?? 19,
      attribution: data.map.tiles.base.options.attribution,
    });
    m.addLayer({
      id: "base-tiles",
      type: "raster",
      source: "base-tiles",
      paint: { "raster-opacity": data.map.tiles.base.options.opacity ?? 1 },
    });

    // Labels (raster) — 
    m.addSource("label-tiles", {
      type: "raster",
      tiles: data.map.tiles.labels.url,
      tileSize: 256,
      maxzoom: data.map.tiles.labels.options.maxNativeZoom ?? 19,
      attribution: data.map.tiles.labels.options.attribution,
    });
    m.addLayer({
      id: "label-tiles",
      type: "raster",
      source: "label-tiles",
      paint: { "raster-opacity": 1 },
    });
  });

  return m;
}

// =========================
//  Add data sources/layers
// =========================
function addSources() {
  const src = data.sources;
  const layersToPlace = [
    src.existingRow, 
    src.noiseBuffer,
    src.receptors,
    src.barriers,
  ];

  map.on("load", async () => {
    for (const l of layersToPlace) {
      try {
        const response = await fetch(l.geojson);
        const jsonData = await response.json();
        const geojson = l.raw ? createGeoJson(jsonData) : jsonData;

        // Assign feature ids and (for receptors) compute class & filter
        prepareFeatures(geojson, l);

        const sourceId = getSourceId(l);
        map.addSource(sourceId, {
          type: "geojson",
          data: geojson,
          promoteId: "fid", // use our assigned numeric id for feature-state
        });

        // Add layers per geometry
        addGeoJsonLayersFor(l, sourceId);

        // Zoom to receptors after they load
        if (l === data.sources.receptors) {
          const b = getGeoJSONBounds(geojson);
          if (b) map.fitBounds(b, { padding: 20 });
        }
      } catch (err) {
        console.error(data.error.process, err);
      }
    }
  });
}

// Create a stable source id for each config block
function getSourceId(l) {
  if (l === data.sources.existingRow) return "existingRow-src";
  if (l === data.sources.noiseBuffer) return "noiseBuffer-src";
  if (l === data.sources.receptors) return "receptors-src";
  if (l === data.sources.barriers) return "barriers-src";
  return `src-${Math.random().toString(36).slice(2)}`;
}

// Ensure features have ids; compute receptor class, filter out measurement sites
function prepareFeatures(fc, l) {
  if (!fc || fc.type !== "FeatureCollection") return;

  let i = 1;
  fc.features = (fc.features || []).filter((f) => {
    f.properties = f.properties || {};
    f.properties.fid = f.properties.fid ?? i;
    f.id = f.properties.fid;
    i++;

    // receptor-only derived props & filter
    if (l === data.sources.receptors) {
      // Filter measurement sites
      if (yn(f.properties?.MeasurementSite) === "YES") return false;

      // compute receptor class (red/green/yellow/orange)
      f.properties.cls = classifyReceptor(f.properties);
    }
    return true;
  });
}

function addGeoJsonLayersFor(l, sourceId) {
  if (l === data.sources.noiseBuffer) {
    map.addLayer({
      id: "noiseBuffer-fill",
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": l.styles.fillColor || "#e3dfa6",
        "fill-opacity": l.styles.fillOpacity ?? 0.2,
      },
    });
    map.addLayer({
      id: "noiseBuffer-line",
      type: "line",
      source: sourceId,
      paint: {
        "line-color": l.styles.color || "#ffffff",
        "line-width": l.styles.weight ?? 3,
        "line-opacity": 1,
      },
    });
    return;
  }

  if (l === data.sources.existingRow) {
    map.addLayer({
      id: "existingRow-line",
      type: "line",
      source: sourceId,
      paint: {
        "line-color": l.styles.color || "#ffd900",
        "line-width": l.styles.weight ?? 2,
        "line-opacity": l.styles.opacity ?? 0.9,
      },
    });
    return;
  }

  if (l === data.sources.barriers) {
    map.addLayer({
      id: "barriers-line",
      type: "line",
      source: sourceId,
      paint: {
        "line-color": l.styles.color || "#00FFFF",
        "line-width": l.styles.weight ?? 4,
        "line-opacity": l.styles.opacity ?? 1,
      },
    });

    // Popups on click
    map.on("click", "barriers-line", (e) => {
      const f = e.features?.[0]?.properties || {};
      new maplibregl.Popup({ className: data.popupOptions.className })
        .setLngLat(e.lngLat)
        .setHTML(buildBarrierPopup(deserializeProps(f)))
        .addTo(map);
    });

    // Hover highlight
    map.on("mouseenter", "barriers-line", () => {
      map.getCanvas().style.cursor = "pointer";
      map.setPaintProperty("barriers-line", "line-width", (l.styles.weight ?? 4) + 2);
      map.setPaintProperty("barriers-line", "line-color", "#FFFF00");
    });
    map.on("mouseleave", "barriers-line", () => {
      map.getCanvas().style.cursor = "";
      map.setPaintProperty("barriers-line", "line-width", l.styles.weight ?? 4);
      map.setPaintProperty("barriers-line", "line-color", l.styles.color || "#00FFFF");
    });
    return;
  }

  // circle layer with data-driven color + hover scale
  if (l === data.sources.receptors) {
    map.addLayer({
      id: "receptors-circles",
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          6, 
          l.styles.radius ?? 4,
        ],
        "circle-color": [
          "match",
          ["get", "cls"],
          "red", "#e61e1e",
          "green", "#00cc2c",
          "yellow", "#fffA3d",
          "orange", "#ff7d18",
         l.styles.fillColor || "#e31a1c",
        ],
        "circle-stroke-color": l.styles.color || "#000000",
        "circle-stroke-width": l.styles.weight ?? 0.5,
        "circle-opacity": l.styles.fillOpacity ?? 0.9,
      },
    });

    receptorsLayer = "receptors-circles"; 

    // Hover feature-state
    let hoveredId = null;
    map.on("mousemove", "receptors-circles", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features?.[0];
      if (!f || typeof f.id !== "number") return;
      if (hoveredId !== null) {
        map.setFeatureState({ source: "receptors-src", id: hoveredId }, { hover: false });
      }
      hoveredId = f.id;
      map.setFeatureState({ source: "receptors-src", id: hoveredId }, { hover: true });
    });
    map.on("mouseleave", "receptors-circles", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) {
        map.setFeatureState({ source: "receptors-src", id: hoveredId }, { hover: false });
      }
      hoveredId = null;
    });

    // Popups
    map.on("click", "receptors-circles", (e) => {
      const f = e.features?.[0]?.properties || {};
      new maplibregl.Popup({ className: data.popupOptions.className })
        .setLngLat(e.lngLat)
        .setHTML(buildPopup(deserializeProps(f)))
        .addTo(map);
    });
  }
}

function deserializeProps(p) {
  return p;
}

// =========================
//  Your original popup logic
// =========================
function buildPopup(properties) {
  const baseExclude = [
    "OBJECTID",
    "X",
    "Y",
    "Z",
    "AM_Levels",
    "PM_Levels",
    "AM_StartTime",
    "AM_EndTime",
    "PM_StartTime",
    "PM_EndTime",
    "AMValidation",
    "PMValidation",
    "Activity Criteria",
    "NAC Category",
    "MeasurementSite",
    "Receptor Height (ft)",
    "fid",
    "cls",
  ];

  const norm = (s) => String(s).normalize("NFKC").replace(/\s+/g, " ").trim();
  const isImpactKey = (k) => /\bimpact\b/i.test(norm(k));
  const isBenefitedKey = (k) => /\bbenefit/i.test(norm(k));

  const exclude = new Set(baseExclude);

  let html = "<div class='popup-content'>";

  for (const rawKey in properties) {
    if (!Object.prototype.hasOwnProperty.call(properties, rawKey)) continue;
    if (exclude.has(rawKey)) continue;

    const rawVal = properties[rawKey];
    if (rawVal == null || (typeof rawVal === "string" && rawVal.trim() === "")) continue;

    const key = rawKey;
    let value = rawVal;

    if (typeof value === "number") {
      value = Number.isInteger(value) ? value : value.toFixed(1);
    }

    let vClass = "";
    if (isImpactKey(key)) {
      const ynVal = yn(rawVal);
      vClass = ynVal === "YES" ? "red" : ynVal === "NO" ? "green" : "";
    } else if (isBenefitedKey(key)) {
      const ynVal = yn(rawVal);
      vClass = ynVal === "YES" ? "green" : "red";
    }

    html += `
      <div class="kv-row">
        <span class="key">${key}:</span>
        <span class="dots" aria-hidden="true"></span>
        <span class="value ${vClass}">${value}</span>
      </div>`;
  }

  html += "</div>";
  return html;
}

function buildBarrierPopup(p) {
  const exclude = new Set(["OBJECTID", "fid"]);
  const currencyKeys = new Set(["Segment Cost"]);

  const rows = Object.keys(p)
    .filter((k) => !exclude.has(k))
    .map((key) => {
      let val = p[key];

      if (val == null || (typeof val === "string" && val.trim() === "")) {
        val = "—";
      } else if (typeof val === "number") {
        val = Number.isInteger(val)
          ? val.toLocaleString()
          : val.toLocaleString(undefined, { maximumFractionDigits: 1 });
      }

      if (currencyKeys.has(key) && val !== "—") {
        const s = String(val).trim();
        val = s.startsWith("$") ? s : `$${s}`;
      }

      return `
        <div class="kv-row">
          <span class="key">${key}:</span>
          <span class="dots" aria-hidden="true"></span>
          <span class="value">${val}</span>
        </div>`;
    })
    .join("");

  return `<div class="popup-content">${rows}</div>`;
}

// =========================
//  Your original helpers
// =========================
function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getImpact(props) {
  return yn(props["Future Noise Design Build Impact"]);
}

function getBenefited(props) {
  if ("Benefited" in props) return yn(props.Benefited);

  const future = toNum(props["Future Noise Design Build"]);
  const barrier = toNum(props["Barrier Design 10ft ALL"]);
  if (future == null || barrier == null) return "NO";
  const reduction = Math.round((future - barrier) * 10) / 10;
  return reduction >= 5 ? "YES" : "NO";
}

function classifyReceptor(props) {
  const impactYes = getImpact(props) === "YES";
  const benefYes = getBenefited(props) === "YES";

  if (impactYes && !benefYes) return "red";
  if (impactYes && benefYes) return "green";
  if (!impactYes && benefYes) return "yellow";
  return "orange";
}

function createGeoJson(data) {
  const geoJson = { type: "FeatureCollection", features: [] };
  const properties = Object.keys(data[0]);
  for (const obj of data) {
    const { geometry, ...props } = obj;
    const feature = {
      type: "Feature",
      geometry: JSON.parse(geometry),
      properties: props,
    };
    geoJson.features.push(feature);
  }
  return geoJson;
}

function getGeoJSONBounds(fc) {
  if (!fc || !fc.features?.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const scan = (coords) => {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0], y = coords[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else {
      for (const c of coords) scan(c);
    }
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    scan(g.coordinates);
  }
  if (!Number.isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}

// =========================
//  Your minimal DOM utils
// =========================
function $(selector) {
  return document.querySelector(selector);
}

function buttonUI() {
  const titleEl = $(data.layout.title);
  const top = (titleEl ? titleEl.offsetHeight : 0) + 10 + "px";
  $(data.layout.button).style.top = top;
}

function setLayout() {
  const l = data.layout;
  $(l.button).addEventListener("click", function () {
    $(l.modal).style.display = "block";
  });
  $(l.modal).addEventListener("click", function () {
    $(l.modal).style.display = "none";
  });
  window.addEventListener("resize", buttonUI);
}
