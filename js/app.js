"use strict";

const API_BASE = "https://ebt-rmp-api-production.up.railway.app";
const PAGE_SIZE = 1000;

const statusEl = document.getElementById("status");

const map = L.map("map", { center: [37.5, -119], zoom: 5 });

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const cluster = L.markerClusterGroup({ chunkedLoading: true });
map.addLayer(cluster);

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function row(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function popupHtml(store) {
  const cityLine = [store.city, store.state].filter(Boolean).join(", ") +
    (store.zip_code ? ` ${store.zip_code}` : "");

  const detailRows = [
    row("Address", store.store_street_address),
    row("Suite", store.additional_address),
    row("City", cityLine.trim()),
    row("County", store.county),
    row("Incentive", store.incentive_program),
    row("Grantee", store.grantee_name),
    row("USDA ID", store.record_id),
  ].join("");

  const directions =
    `https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}`;

  return `
    <div class="store-popup">
      <div class="store-name">${escapeHtml(store.store_name) || "Unnamed store"}</div>
      ${store.store_type ? `<span class="store-type">${escapeHtml(store.store_type)}</span>` : ""}
      <dl>${detailRows}</dl>
      <a class="store-directions" href="${directions}" target="_blank" rel="noopener">
        Get directions &rarr;
      </a>
    </div>`;
}

function isValidCoord(store) {
  return (
    typeof store.latitude === "number" &&
    typeof store.longitude === "number" &&
    Number.isFinite(store.latitude) &&
    Number.isFinite(store.longitude) &&
    !(store.latitude === 0 && store.longitude === 0)
  );
}

async function loadStores() {
  let offset = 0;
  let total = Infinity;
  let plotted = 0;
  let skipped = 0;

  try {
    while (offset < total) {
      const url = `${API_BASE}/stores?limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API responded ${res.status}`);

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      total = Number.isFinite(data.total) ? data.total : offset + items.length;
      const pageLimit = data.limit > 0 ? data.limit : PAGE_SIZE;

      const markers = [];
      for (const store of items) {
        if (!isValidCoord(store)) {
          skipped++;
          continue;
        }
        const marker = L.marker([store.latitude, store.longitude]);
        marker.bindPopup(popupHtml(store), { maxWidth: 320 });
        markers.push(marker);
      }
      cluster.addLayers(markers);
      plotted += markers.length;

      statusEl.textContent =
        `Loading… ${plotted.toLocaleString()} of ${total.toLocaleString()} stores mapped`;

      if (items.length === 0 || items.length < pageLimit) break;
      offset += items.length;
    }

    const note = skipped > 0 ? ` (${skipped.toLocaleString()} without coordinates)` : "";
    statusEl.textContent = `${plotted.toLocaleString()} stores mapped${note}`;

    if (plotted > 0) {
      map.fitBounds(cluster.getBounds(), { padding: [40, 40] });
    }
  } catch (err) {
    statusEl.textContent = `Could not load stores: ${err.message}`;
    statusEl.classList.add("error");
    console.error(err);
  }
}

loadStores();
