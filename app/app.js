// Define variables for sources, styles, and layers
// ##########################

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
        url: "https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/dark_nolabels/{z}/{x}/{y}.png",
        options: {
          attribution:
            'Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          opacity: 1,
          maxNativeZoom: 19,
          maxZoom: 22,
        },
      },
      labels: {
        url: "https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/dark_only_labels/{z}/{x}/{y}.png",
        options: {
          attribution:
            'Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          pane: "top",
          maxNativeZoom: 19,
          maxZoom: 22,
        },
      },
    },
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
    className: "leaflet-tooltip-own",
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

// set layout and create map
// ##########################
setLayout();
buttonUI();
const map = createBaseMap();
styleControl();
addSources();

// add base maps and map panes for layering data
// ##########################
function createBaseMap() {
  const map = L.map("map", data.map.options);
  data.map.panes.forEach((pane, i) => {
    map.createPane(pane);
    map.getPane(pane).style.zIndex = 401 + i;
  });

  L.tileLayer(data.map.tiles.base.url, data.map.tiles.base.options).addTo(map);

  L.tileLayer(data.map.tiles.labels.url, data.map.tiles.labels.options).addTo(
    map
  );

  return map;
}
// ##########################

// add sources of data
// ##########################
function addSources() {
  const src = data.sources;
  const layersToPlace = [
    src.existingRow,
    src.noiseBuffer,
    src.receptors,
    src.barriers,
  ];

  layersToPlace.forEach((l) => {
    fetch(l.geojson)
      .then((response) => response.json())
      .then((jsonData) => {
        // Check if the layer is flagged as needing raw conversion
        const geojson = l.raw ? createGeoJson(jsonData) : jsonData;
        drawGeoJson(geojson, l);

        // Zoom to receptors.geojson
        if (l === src.receptors) {
          const bounds = L.geoJSON(geojson).getBounds();
          map.fitBounds(bounds, { padding: [20, 20] });
        }
      })
      .catch((error) => {
        console.error(data.error.process, error);
      });
  });
}
// ##########################

// buildPopup Function
// ##########################
function buildPopup(properties) {
  // Fields to ignore in popup
  const exclude = [
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
    "Activity_Criteria",
    "NAC_Category",
    "MeasurementSite",
    "Reduction",
    "Benefited",
  ];

  // --- helpers ---
  const toNum = (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  // robust Impact-key detector (normalize + collapse spaces)
  const isImpactKey = (k) =>
    /\bimpact\b/i.test(String(k).normalize("NFKC").replace(/\s+/g, " ").trim());

  // --- derive Reduction & Benefited from your updated fields ---
  const future = toNum(properties["Future Noise Design Build"]);
  const barrier = toNum(properties["Future Noise Levels with Barrier"]);
  const reduction =
    future != null && barrier != null
      ? Math.round((future - barrier) * 10) / 10
      : null;

  const benefited = reduction == null ? "—" : reduction >= 5 ? "YES" : "NO";

  // --- build rows ---
  let html = "<div class='popup-content'>";

  for (const rawKey in properties) {
    if (!properties.hasOwnProperty(rawKey) || exclude.includes(rawKey))
      continue;

    const key = rawKey; // keep label
    let value = properties[key];

    // format numbers
    if (typeof value === "number") {
      value = Number.isInteger(value) ? value : value.toFixed(1);
    }
    if (value == null || value === "") value = "—";

    // Color ONLY Impact rows:
    //   YES => red, NO => green, else uncolored
    let vClass = "";
    if (isImpactKey(key)) {
      const ynVal = yn(properties[key]); // normalize on raw value
      vClass = ynVal === "YES" ? "red" : ynVal === "NO" ? "green" : "";
    }

    html += `
      <div class="kv-row">
        <span class="key">${key}:</span>
        <span class="dots" aria-hidden="true"></span>
        <span class="value ${vClass}">${value}</span>
      </div>`;
  }

  // Derived rows (Benefited YES => green)
  html += `
    <div class="kv-row">
      <span class="key">Reduction:</span>
      <span class="dots" aria-hidden="true"></span>
      <span class="value">${reduction == null ? "—" : reduction}</span>
    </div>
    <div class="kv-row">
      <span class="key">Benefited:</span>
      <span class="dots" aria-hidden="true"></span>
      <span class="value ${
        benefited === "YES" ? "green" : "red"
      }">${benefited}</span>
    </div>`;

  html += "</div>";
  return html;
}

// ##########################

// buildBarrierPopup Function
// ##########################
function buildBarrierPopup(p) {
  const exclude = new Set(["OBJECTID"]);
  const currencyKeys = new Set(["Cost", "CBR"]);

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

// ##########################

// --- helpers to read values safely ---
function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Normalize Impact (expects "Future Noise Design Build Impact")
function getImpact(props) {
  return yn(props["Future Noise Design Build Impact"]); // "YES" | "NO"
}

// Get Benefited: prefer existing field if present, otherwise derive via Reduction
function getBenefited(props) {
  if ("Benefited" in props) return yn(props.Benefited);

  const future = toNum(props["Future Noise Design Build"]);
  const barrier = toNum(props["Barrier Design 10ft ALL"]);
  if (future == null || barrier == null) return "NO"; // conservative default
  const reduction = Math.round((future - barrier) * 10) / 10; // 1 decimal
  return reduction >= 5 ? "YES" : "NO";
}

// buildBarrierPopup Function
// ##########################
// Combinations:
//  YES + NO  -> red
//  YES + YES -> green
//  NO  + YES -> yellow
//  NO  + NO  -> orange
function makeIcon(props) {
  const impactYes = getImpact(props) === "YES";
  const benefYes = getBenefited(props) === "YES";

  let cls;
  if (impactYes && !benefYes) cls = "red";
  else if (impactYes && benefYes) cls = "green";
  else if (!impactYes && benefYes) cls = "yellow";
  else cls = "orange";

  return L.divIcon({
    className: `leaflet-marker-icon ${cls}`,
    iconSize: [12, 12],
  });
}

// updateIconStyle Function
// ##########################
// function updateIconStyle() {
//   if (!receptorsLayer) return;
//   receptorsLayer.eachLayer((layer) => {
//     if (layer instanceof L.Marker) {
//       layer.setIcon(makeIcon(layer.feature.properties));
//     }
//   });
// }
// ##########################

// styleControl Function
// ##########################
function styleControl() {
  const sel = document.getElementById("impactModeSel");
  if (!sel) return;
  sel.value = impactMode;
  sel.addEventListener("change", () => {
    impactMode = sel.value; // exact field name with spaces
    // updateIconStyle();
  });
}
// ##########################

// drawGeoJson Function
// ##########################
function drawGeoJson(geojson, l) {
  const layer = L.geoJSON(geojson, {
    pane: l.pane,
    interactive: !!l.interactive,
    style: function () {
      return l.styles;
    },
    // remove measurement sites
    filter: function (feature) {
      if (l === data.sources.receptors) {
        return yn(feature.properties?.MeasurementSite) !== "YES";
      }
      return true; // keeps all other features from other geojson layers
    },
    pointToLayer: function (feature, latlng) {
      if (feature.geometry.type === "Point") {
        if (l === data.sources.receptors) {
          return L.marker(latlng, { icon: makeIcon(feature.properties) });
        }
        return L.circleMarker(latlng, l.styles);
      }
      return null;
    },
    onEachFeature: function (feature, layer) {
      const f = feature.properties;

      if (l === data.sources.receptors) {
        const popupHtml = buildPopup(f); // your existing receptor popup
        layer.bindPopup(popupHtml, data.popupOptions);

        // hover effect for receptors (divIcon)
        layer.on("mouseover", function () {
          const el = layer._icon || layer.getElement?.();
          if (el) el.classList.add("hovered");
        });
        layer.on("mouseout", function () {
          const el = layer._icon || layer.getElement?.();
          if (el) el.classList.remove("hovered");
        });
      }

      if (l === data.sources.barriers) {
        layer.bindPopup(buildBarrierPopup(f), data.popupOptions);

        // optional hover highlight for line barriers
        layer.on("mouseover", () =>
          layer.setStyle({ weight: 6, color: "#7ffeff" })
        );
        layer.on("mouseout", () => layer.setStyle(l.styles));
      }
    },
  }).addTo(map);

  if (!l.interactive) {
    map.getPane(l.pane).style.pointerEvents = "none";
  }

  // Save receptors layer and ensure current mode applies
  if (l === data.sources.receptors) {
    receptorsLayer = layer;
    // updateIconStyle(); // apply the current impactModeKey
  }
}

// ##########################

// process geojson
// ##########################
function createGeoJson(data) {
  const geoJson = {
    type: "FeatureCollection",
    features: [],
  };
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
// ##########################

// mimic jQuery select element Function
// ##########################
function $(selector) {
  return document.querySelector(selector);
}
// ##########################

// buttonUI Function
// ##########################
function buttonUI() {
  const titleEl = $(data.layout.title);
  const top = (titleEl ? titleEl.offsetHeight : 0) + 10 + "px";

  // Move the Info button under the title (you already had this)
  $(data.layout.button).style.top = top;

  // Move the dropdown to the same vertical position
  // const ui = $("#ui-controls");
  // if (ui) ui.style.top = top;
}
// ##########################

// setLayout Function
// ##########################
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
// ##########################
