// app.js – attaches to the StoryMap's existing `map`

let receptorsLayer = "receptors-circles";
let impactMode = "Existing Noise Impact";

// -------------------------
// Helper functions (keep these)
// -------------------------
function yn(value) {
  if (value == null) return "NO";
  const s = String(value).trim().toUpperCase();
  return s === "Y" || s === "YES" || s === "TRUE" || s === "1" ? "YES" : "NO";
}

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

// -------------------------
// Attach to the existing StoryMap map
// -------------------------

map.on("load", () => {
  // Optional: if you later want to classify receptors on the fly,
  // you can fetch the source data here, add `cls`, and call setData().

  // Hover feature-state for receptors
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

  // Receptor popups
  map.on("click", "receptors-circles", (e) => {
    const props = e.features?.[0]?.properties || {};
    new maplibregl.Popup({ className: "ml-tooltip-own" })
      .setLngLat(e.lngLat)
      .setHTML(buildPopup(props))
      .addTo(map);
  });

  // Barrier popups
  map.on("click", "barrier-extrusion", (e) => {
    const p = e.features?.[0]?.properties || {};
    const ft = Number(p["Barrier Segment Height (ft)"]);
    const hText = Number.isFinite(ft) ? `${ft.toFixed(1)} ft` : "—";

    const headerRow = `
      <div class="kv-row">
        <span class="key">Barrier Height:</span>
        <span class="dots" aria-hidden="true"></span>
        <span class="value">${hText}</span>
      </div>`;

    new maplibregl.Popup({ className: "ml-tooltip-own" })
      .setLngLat(e.lngLat)
      .setHTML(
        `<div class="popup-content">${headerRow}${buildBarrierPopup(p)}</div>`
      )
      .addTo(map);
  });

  map.on("mouseenter", "barrier-extrusion", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "barrier-extrusion", () => {
    map.getCanvas().style.cursor = "";
  });
});
