let receptorsLayer;
let impactMode = "Existing Noise Impact";
let receptorsFC = null;
let barriersFC = null;

function fmtCurrency(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

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
    buildingFootprints: {
      geojson: "data/building-footprints.geojson",
      styles: {
        color: "#d4fdfdff",
        opacity: 0.9,
      },
      pane: "studyArea",
      fields: ["H"], // height (ft)
      interactive: true,
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
      geojson: "data/receptors-I64-barResults-US25drop.geojson",
      styles: {
        radius: 5,
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
      geojson: "data/proposed-split-barrier-us25-drop.geojson",
      styles: {
        color: "#00FFFF",
        opacity: 1,
      },
      pane: "barrier",
      fields: ["Name", "Barrier Segment Height (ft)"],
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
responsiveLegend();
createStatsPanel();
createLegendStackDock();
placePanels();

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
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      layers: [],
    },
    center: [lng, lat],
    zoom: data.map.options.zoom,
    maxZoom: data.map.options.maxZoom,
    attributionControl: false,
    antialias: true,
    maxPitch: 85,
  });

  m.addControl(new maplibregl.AttributionControl({ compact: true }));

  m.addControl(
    new maplibregl.NavigationControl({
      showCompass: true,
      showZoom: true,
    }),
    "top-right"
  );

  m.on("load", () => {
    m.setPitch(55);
    m.setBearing(20);
    m.dragRotate.enable();
    m.touchZoomRotate.enableRotation();

    m.addLayer({
      id: "background",
      type: "background",
      paint: {
        "background-color": "rgba(195, 175, 165, 1)",
        "background-opacity": 1,
      },
    });

    m.addSource("aerial", {
      type: "raster",
      tiles: [
        "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_Imagery_Phase3_3IN_WGS84WM/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution:
        'Imagery © <a href="https://kygisserver.ky.gov">KyFromAbove</a>',
    });
    m.addLayer({
      id: "aerial",
      type: "raster",
      source: "aerial",
      layout: { visibility: "visible" },
      paint: {
        "raster-brightness-min": 0.2,
        "raster-saturation": 0.5,
        "raster-hue-rotate": 20,
        "raster-opacity": 1,
      },
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
    src.buildingFootprints,
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

        prepareFeatures(geojson, l);

        // Cache FCs for stats after normalization
        if (l === data.sources.receptors) {
          receptorsFC = geojson;
        }
        if (l === data.sources.barriers) {
          barriersFC = geojson;
        }

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
    map.setLight({
      anchor: "viewport",
      color: "white",
      intensity: 0.6,
      position: [1.5, 150, 80], // [radial, azimuthal, polar] in degrees
    });
    updateStatsPanel(); // compute totals once both layers are in
  });
}

// Create a stable source id for each config block
function getSourceId(l) {
  if (l === data.sources.existingRow) return "existingRow-src";
  if (l === data.sources.buildingFootprints) return "buildingFootprints-src";
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
    // 🔒 drop barrier OBJECTID == 20
    if (l === data.sources.barriers && Number(f?.properties?.OBJECTID) === 20) {
      return false;
    }

    f.properties = f.properties || {};
    f.properties.fid = f.properties.fid ?? i;
    f.id = f.properties.fid;
    i++;

    if (l === data.sources.receptors) {
      normalizeReceptorProps(f.properties);
      if (yn(f.properties?.MeasurementSite) === "YES") return false;
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
        "fill-color": l.styles.fillColor || "#ffffffff",
        "fill-opacity": l.styles.fillOpacity ?? 0.0,
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

  if (l === data.sources.buildingFootprints) {
    // Extruded buildings
    map.addLayer(
      {
        id: "buildings-extrusion",
        type: "fill-extrusion",
        source: sourceId,
        paint: {
          "fill-extrusion-color": l.styles.color || "#a9b7c9",
          "fill-extrusion-height": [
            "*",
            ["coalesce", ["to-number", ["get", "H"]], 0],
            0.3048, // feet -> meters
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": l.styles.opacity ?? 0.9,
        },
      },
      "label-tiles"
    );
  }
  if (l === data.sources.barriers) {
    map.addLayer(
      {
        id: "barrier3D-extrusion",
        type: "fill-extrusion",
        filter: ["!=", ["get", "OBJECTID"], 20],
        source: sourceId,
        paint: {
          "fill-extrusion-color": l.styles.color || "#00ffff",
          "fill-extrusion-height": [
            "*",
            [
              "coalesce",
              ["to-number", ["get", "Barrier Segment Height (ft)"]],
              0,
            ],
            0.3048, // feet -> meters
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": l.styles.opacity ?? 0.95,
        },
      },
      "label-tiles"
    );

    // Text labels for barrier heights (on polygon centroids)
    map.addLayer(
      {
        id: "barrier3D-labels",
        type: "symbol",
        filter: ["!=", ["get", "OBJECTID"], 20],
        source: sourceId,
        minzoom: 15,
        layout: {
          "text-field": [
            "case",
            ["has", "Barrier Segment Height (ft)"],
            [
              "concat",
              [
                "to-string",
                [
                  "/",
                  [
                    "round",
                    [
                      "*",
                      ["to-number", ["get", "Barrier Segment Height (ft)"]],
                      10,
                    ],
                  ],
                  10,
                ],
              ],
              " ft",
            ],
            "",
          ],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 17, 16],
          "symbol-placement": "point",
          "text-offset": [0, -1],
          "text-allow-overlap": false,
          "text-optional": true,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.85)",
          "text-halo-width": 1.25,
        },
      },
      "label-tiles"
    );

    // Popup (show segment height)
    map.on("click", "barrier3D-extrusion", (e) => {
      const p = e.features?.[0]?.properties || {};
      // Height
      const heightFt = Number(p["Barrier Segment Height (ft)"]);
      const heightText = Number.isFinite(heightFt)
        ? `${heightFt.toFixed(1)} ft`
        : "—";
      // cost
      const rawCost = Number(p["Cost"]);
      const costText = Number.isFinite(rawCost)
        ? `$${Math.round(rawCost).toLocaleString()}`
        : "—";

      new maplibregl.Popup({ className: data.popupOptions.className })
        .setLngLat(e.lngLat)
        .setHTML(
          `
      <div class="popup-content">
        <div class="kv-row">
          <span class="key">Barrier Height:</span>
          <span class="dots" aria-hidden="true"></span>
          <span class="value">${heightText}</span>
        </div>
        <div class="kv-row">
          <span class="key">Segment Cost:</span>
          <span class="dots" aria-hidden="true"></span>
          <span class="value">${costText}</span>
        </div>
      </div>
    `
        )
        .addTo(map);
    });
    map.on(
      "mouseenter",
      "barrier3D-extrusion",
      () => (map.getCanvas().style.cursor = "pointer")
    );
    map.on(
      "mouseleave",
      "barrier3D-extrusion",
      () => (map.getCanvas().style.cursor = "")
    );
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
          8,
          l.styles.radius ?? 8,
        ],
        "circle-color": [
          "match",
          ["get", "cls"],
          "red",
          "#e61e1e",
          "green",
          "#00cc2c",
          "yellow",
          "#fffA3d",
          "neutral",
          "rgb(223, 223, 223)",
          l.styles.fillColor || "#e31a1c",
        ],
        "circle-stroke-color": l.styles.color || "#000000",
        "circle-stroke-width": l.styles.weight ?? 0.6,
        "circle-opacity": l.styles.fillOpacity ?? 0.9,
      },
    });

    map.addLayer({
      id: "receptors-labels",
      type: "symbol",
      source: sourceId,
      minzoom: 14,
      layout: {
        "text-field": [
          "coalesce",
          ["get", "Name"],
          ["get", "ReceiverName"],
          "",
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 12],
        "text-anchor": "left",
        "text-offset": [0.9, 0],
        "text-allow-overlap": false,
        "text-optional": true,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.85)",
        "text-halo-width": 1.25,
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
        map.setFeatureState(
          { source: "receptors-src", id: hoveredId },
          { hover: false }
        );
      }
      hoveredId = f.id;
      map.setFeatureState(
        { source: "receptors-src", id: hoveredId },
        { hover: true }
      );
    });
    map.on("mouseleave", "receptors-circles", () => {
      map.getCanvas().style.cursor = "";
      if (hoveredId !== null) {
        map.setFeatureState(
          { source: "receptors-src", id: hoveredId },
          { hover: false }
        );
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
//  buildPopup
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

  const exclude = new Set(baseExclude);
  const norm = (s) => String(s).normalize("NFKC").replace(/\s+/g, " ").trim();
  const isImpactKey = (k) => /\bimpact\b/i.test(norm(k));
  const isBenefitedKey = (k) => /\bbenefit/i.test(norm(k));

  // keys to force to the bottom (in this order)
  const tailOrder = ["Reduction", "Benefited"];

  let rowsMain = [];
  let rowsTail = [];

  for (const rawKey in properties) {
    if (!Object.prototype.hasOwnProperty.call(properties, rawKey)) continue;
    if (exclude.has(rawKey)) continue;

    const rawVal = properties[rawKey];
    if (rawVal == null || (typeof rawVal === "string" && rawVal.trim() === ""))
      continue;

    const key = rawKey;
    let value = rawVal;

    if (typeof value === "number") {
      value = Number.isInteger(value) ? value : value.toFixed(1);
    }

    let vClass = "";
    if (isImpactKey(key)) {
      const ynVal = yn(rawVal);
      vClass = ynVal === "YES" ? "red" : ynVal === "NO" ? "green" : "";
    } else if (isBenefitedKey(key) || key === "Benefited") {
      const ynVal = yn(rawVal);
      vClass = ynVal === "YES" ? "green" : "red";
    }

    const row = `
      <div class="kv-row">
        <span class="key">${key}:</span>
        <span class="dots" aria-hidden="true"></span>
        <span class="value ${vClass}">${value}</span>
      </div>`;

    // send Reduction/Benefited to the tail
    if (tailOrder.includes(key)) {
      rowsTail.push({ key, row });
    } else {
      rowsMain.push(row);
    }
  }

  // Sort the tail to honor the desired order (Reduction first, then Benefited)
  rowsTail.sort((a, b) => tailOrder.indexOf(a.key) - tailOrder.indexOf(b.key));

  return `<div class="popup-content">${rowsMain.join("")}${rowsTail
    .map((x) => x.row)
    .join("")}</div>`;
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
// Helper Functions
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
  return "neutral";
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
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const scan = (coords) => {
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const x = coords[0],
        y = coords[1];
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
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

// Canonical field names you WANT  ->  possible incoming names
const receptorFieldMap = {
  "Receptor Height (ft)": [
    "ReceiverHeight",
    "Receiver Height",
    "Receiver_Height",
  ],
  "Receptor Group": ["ReceiverGroup", "Receiver Group"],
  "NAC Category": ["NAC_Category", "NAC-Category"],
  "Activity Criteria": ["Activity_Criteria", "Activity-criteria", "Criteria"],
  "NAC / Activity Criteria": ["nacCat_ActCrit", "NAC_ActCrit", "NAC-Activity"],
  "Land Use Description": ["LandUse", "Land Use", "Land_Use"],
  "Design Goal": ["Design_Goal", "DesignGoal"],
  "Num. Dwelling Units": ["No_DU", "Num_DU", "DwellingUnits"],
  "Front Row": ["FrontRow", "Front_Row"],
  "Apartment Floor Analyzed": [
    "Apartment Floot Analyzed",
    "Apt_Floor_Analyzed",
    "ApartmentFloor",
  ],

  "Substantial Noise Increase": ["Substantial_Noise_Increase"],
  "Existing Noise": ["ExistingNoise", "Existing_Noise"],
  "Existing Noise Impact": ["ExistingImpact", "Existing_Impact"],
  "Future Noise No Build": [
    "Future-NoBuild",
    "Future_NoBuild",
    "FutureNoBuild",
  ],
  "Future Noise No Build Impact": [
    "Future_noBuild_Impact",
    "Future NoBuild Impact",
    "Future_NoBuild_Impact",
  ],
  "Future Noise Design Build": [
    "Future-Build",
    "Future_Build",
    "FutureDesignBuild",
  ],
  "Future Noise Design Build Impact": [
    "Future_Build_Impact",
    "Future Build Impact",
    "FutureBuildImpact",
  ],
  "Future Noise with Barrier": [
    "WithBarrier_Final",
    "Future_With_Barrier",
    "Barrier_Final",
  ],
  Benefited: ["Benefitted", "benefitted", "benefited"],
  Reduction: ["reduction", "reduc", "reduction_Final", "Reduction_Final"],
  // naming that already matches but sometimes varies:
  MeasurementSite: ["Measurement Site"],
  Name: ["ReceiverName"], // prefer "Name" for labels; fall back from ReceiverName
};

// Moves values from any known source key to the canonical key.
// If the canonical already exists, leaves it alone. Removes the old keys to avoid duplicates.
function normalizeReceptorProps(props) {
  if (!props) return props;

  // Coalesce Name from ReceiverName if needed (before generic pass)
  if (props.Name == null && props.ReceiverName != null) {
    props.Name = props.ReceiverName;
  }

  // Generic canonicalization pass
  for (const [canonical, candidates] of Object.entries(receptorFieldMap)) {
    if (props[canonical] != null) continue;
    for (const key of candidates) {
      if (key in props && props[key] != null) {
        props[canonical] = props[key];
        delete props[key];
        break;
      }
    }
  }

  // 3) Light cleanup / numeric coercion for known numeric fields
  const numericKeys = new Set([
    "Receptor Height (ft)",
    "Design Goal",
    "Num. Dwelling Units",
    "X",
    "Y",
    "Z",
    "Existing Noise",
    "Future Noise No Build",
    "Future Noise Design Build",
    "Future Noise with Barrier",
    "Reduction",
  ]);
  for (const k of numericKeys) {
    if (k in props && props[k] != null && props[k] !== "") {
      const n = Number(props[k]);
      if (Number.isFinite(n)) props[k] = n;
    }
  }

  // 4) Normalize YES/NO-ish fields to strings your popup logic expects
  const ynKeys = [
    "Existing Noise Impact",
    "Future Noise No Build Impact",
    "Future Noise Design Build Impact",
    "Substantial Noise Increase",
    "Benefited",
    "Front Row",
    "MeasurementSite",
  ];
  for (const k of ynKeys) {
    if (k in props) props[k] = yn(props[k]); // uses your existing yn()
  }

  return props;
}

// =========================
// DOM utils
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

function updateStatsPanel() {
  const stats = document.getElementById("cbr-stats");
  if (!stats) return;

  const { totalCost, benefitedDU } = calculateTotals();
  const cbr = benefitedDU > 0 ? totalCost / benefitedDU : NaN;

  const costEl = stats.querySelector('[data-k="cost"]');
  const duEl = stats.querySelector('[data-k="du"]');
  const cbrEl = stats.querySelector('[data-k="cbr"]');

  costEl.textContent = fmtCurrency(totalCost);
  duEl.textContent = Number.isFinite(benefitedDU)
    ? benefitedDU.toLocaleString()
    : "—";

  // badge coloring by KYTC reasonableness threshold ($40,000 / DU)
  cbrEl.textContent = Number.isFinite(cbr) ? fmtCurrency(cbr) : "—";
  cbrEl.classList.remove("ok", "warn");
  if (Number.isFinite(cbr)) {
    cbrEl.classList.add(cbr <= 40000 ? "ok" : "warn");
    cbrEl.classList.add("badge");
  } else {
    cbrEl.classList.remove("badge");
  }
}

function calculateTotals() {
  let totalCost = 0;
  let benefitedDU = 0;

  // ==== barriers total cost ====
  if (barriersFC?.features?.length) {
    for (const f of barriersFC.features) {
      const p = f.properties || {};

      // 🚫 skip excluded IDs
      if (Number(p.OBJECTID) === 20) continue;

      let segCost = toNum(p.Cost);
      if (!Number.isFinite(segCost)) {
        const heightFt = toNum(p["Barrier Segment Height (ft)"]);
        const lenFt =
          toNum(p["Segment Length (ft)"]) ??
          toNum(p["Length_ft"]) ??
          toNum(p["Length (ft)"]) ??
          toNum(p["Length"]);
        if (Number.isFinite(heightFt) && Number.isFinite(lenFt)) {
          segCost = lenFt * heightFt * 32;
        }
      }
      if (Number.isFinite(segCost)) totalCost += segCost;
    }

    // ==== benefited DU sum ====
    if (receptorsFC?.features?.length) {
      for (const f of receptorsFC.features) {
        const p = f.properties || {};
        // We normalized Benefited to YES/NO earlier; if not, coerce here
        const benef = "Benefited" in p ? yn(p.Benefited) : getBenefited(p);
        if (benef === "YES") {
          const du = toNum(p["Num. Dwelling Units"]);
          benefitedDU += Number.isFinite(du) ? du : 1; // default to 1 if missing
        }
      }
    }

    return { totalCost, benefitedDU };
  }
}

function responsiveLegend() {
  const mq = window.matchMedia("(max-width: 576px)");
  function onChange() {
    placePanels();
  }
  onChange();
  mq.addEventListener
    ? mq.addEventListener("change", onChange)
    : mq.addListener(onChange);
}

function createStatsPanel() {
  // if it already exists, bail
  if (document.getElementById("cbr-stats")) return;

  const el = document.createElement("div");
  el.id = "cbr-stats";
  el.className = "stats-card";
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <div class="stats-title">Cost / Benefit</div>
    <div class="stats-grid">
      <div class="stats-key">Total Barrier Cost</div>
      <div class="stats-value" data-k="cost">—</div>

      <div class="stats-key">Benefited Dwelling Units</div>
      <div class="stats-value" data-k="du">—</div>

      <div class="stats-key">Cost per Benefited DU</div>
      <div class="stats-value badge" data-k="cbr">—</div>
    </div>
  `;
  // place it next to the legend initially
  const legend = document.getElementById("legend");
  if (legend && legend.parentNode) {
    legend.parentNode.insertBefore(el, legend.nextSibling); // after legend
  } else {
    document.body.appendChild(el);
  }
  placePanels(); // ensure correct docking on load
}

function createLegendStackDock() {
  if (!document.getElementById("legend-stack")) {
    const dock = document.createElement("div");
    dock.id = "legend-stack";
    const mapEl = document.getElementById("map");
    (mapEl || document.body).appendChild(dock); // prefer inside #map
  }
}

function placePanels() {
  const legend = document.getElementById("legend");
  const stats = document.getElementById("cbr-stats");
  const dock = document.getElementById("legend-dock"); // modal dock
  const stack = document.getElementById("legend-stack"); // floating dock
  const mq = window.matchMedia("(max-width: 576px)");

  if (!legend || !stats) return;

  if (mq.matches && dock) {
    dock.appendChild(legend);
    dock.appendChild(stats);
    legend.classList.remove("legend-floating");
    stats.classList.remove("stats-floating");
  } else {
    // desktop/tablet --> stack both inside the map's dock (bottom-left)
    const host = stack || document.getElementById("map") || document.body;
    host.appendChild(legend);
    host.appendChild(stats);
    legend.classList.add("legend-floating");
    stats.classList.add("stats-floating");
  }
}
