const btn = document.getElementById("btnBereken");
const gerechtSelect = document.getElementById("gerecht");
const kantonExtra = document.getElementById("kantonExtra");

if (gerechtSelect && kantonExtra) {
  gerechtSelect.addEventListener("change", () => {
    kantonExtra.style.display = gerechtSelect.value === "kanton" ? "block" : "none";
  });
}

const tariefSelect = document.getElementById("tariefset");
let TARIEVEN = null;

function euro(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function showMelding(text) {
  const el = document.getElementById("melding");
  if (!text) {
    el.classList.add("hidden");
    el.innerText = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerText = text;
}

async function loadTarieven(jaar) {
  // Let op: fetch werkt niet betrouwbaar met "file://" lokaal.
  // Open daarom via een (mini) webserver of gebruik GitHub Pages.
  const res = await fetch(`data/tarieven-${jaar}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kan tarieven-${jaar}.json niet laden.`);
  return await res.json();
}

function getPunten() {
  const handmatig = document.getElementById("puntenHandmatig").value;
  if (handmatig !== "" && !Number.isNaN(Number(handmatig))) return Number(handmatig);

  const steps = Array.from(document.querySelectorAll(".step"));
  return steps
    .filter(cb => cb.checked)
    .reduce((sum, cb) => sum + Number(cb.dataset.points), 0);
}

function getTariefInfoLiquidatie(vordering) {
  const rows = TARIEVEN.liquidatietarief_rechtbank;
  for (const r of rows) {
    if (r.max === null || vordering <= r.max) return r;
  }
  return rows[rows.length - 1];
}

function getGriffierechtBand(vordering, partijType) {
  const g = TARIEVEN.griffierecht_civiel_rechtbank;

  if (partijType === "onvermogend") {
    return { bedrag: g.onvermogend, bandLabel: "Onvermogend", note: "" };
  }

  const key = partijType === "natuurlijk" ? "natuurlijk" : "niet_natuurlijk";

  for (const band of g.bands) {
    const hit = band.max === null ? true : vordering <= band.max;
    if (hit) {
      return {
        bedrag: band[key],
        bandLabel: band.max === null ? "> 1.000.000" : `≤ ${euro(band.max)}`,
        note: band.note || ""
      };
    }
  }

  // fallback
  const last = g.bands[g.bands.length - 1];
  return { bedrag: last[key], bandLabel: "—", note: last.note || "" };
}

function getPartijKey() {
  const partijType = document.getElementById("partijType").value;
  if (partijType === "onvermogend") return "onvermogend";
  if (partijType === "natuurlijk") return "natuurlijk";
  return "niet_natuurlijk";
}

function getGriffierechtKanton(vordering, valueType /* "geld"|"onbepaald"|"ontruiming"|"overig" */) {
  const key = getPartijKey();
  const bands = TARIEVEN.griffierecht_kanton.bands;

  // Onbepaalde waarde valt in de eerste band (≤ 500) volgens Rechtspraak. :contentReference[oaicite:5]{index=5}
  if (valueType === "onbepaald") {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: "Onbepaalde waarde / ≤ €500" };
  }

  // Voor "ontruiming" en "overig" gebruiken we hier: behandelen als “onbepaalde waarde / laagste band”
  // (Je kunt dit later finetunen als je er aparte griffierechtregels voor wil modelleren.)
  if (valueType === "ontruiming" || valueType === "overig") {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: "Kanton (default): laagste schijf" };
  }

  // Geldvordering: echte schijven
  for (const b of bands) {
    if (b.max === null || vordering <= b.max) {
      return {
        bedrag: b[key],
        bandLabel: b.max === null ? "> €12.500" : `≤ €${b.max.toLocaleString("nl-NL")}`
      };
    }
  }

  const last = bands[bands.length - 1];
  return { bedrag: last[key], bandLabel: "> €12.500" };
}

function getLiquidatieKanton(vordering, valueType) {
  const L = TARIEVEN.liquidatie_kanton;

  if (valueType === "ontruiming") {
    return { type: "vast", salaris: L.specials.ontruiming.salaris, maxPunten: L.specials.ontruiming.maxPunten };
  }
  if (valueType === "overig") {
    return { type: "vast", salaris: L.specials.overige_verzoeken.salaris, maxPunten: L.specials.overige_verzoeken.maxPunten };
  }
  if (valueType === "onbepaald") {
    return { type: "range", min: L.specials.onbepaald_range.min, max: L.specials.onbepaald_range.max, maxPunten: null };
  }

  // Geldvordering staffel
  for (const r of L.money_bands) {
    if (r.max === null || vordering <= r.max) {
      return { type: "vast", salaris: r.salaris, maxPunten: r.maxPunten, bandMax: r.max };
    }
  }

  const last = L.money_bands[L.money_bands.length - 1];
  return { type: "vast", salaris: last.salaris, maxPunten: last.maxPunten, bandMax: last.max };
}

function pickRangeValue(min, max) {
  const niveau = document.getElementById("onbepaaldNiveau").value; // laag/gemiddeld/hoog
  if (niveau === "laag") return min;
  if (niveau === "hoog") return max;
  return Math.round((min + max) / 2);
}

function setTarievenInfo() {
  const el = document.getElementById("tarievenInfo");
  if (!TARIEVEN) {
    el.innerText = "—";
    return;
  }
  el.innerText = `${TARIEVEN.label}. Laatst bijgewerkt: ${TARIEVEN.updated}.`;
}



async function init() {
  try {
    TARIEVEN = await loadTarieven(tariefSelect.value);
    setTarievenInfo();
  } catch (e) {
    showMelding(
      "Ik kan de tarieven niet laden. Tip: open de site via GitHub Pages of een lokale webserver (niet via file://)."
    );
    console.error(e);
  }
}

tariefSelect.addEventListener("change", async () => {
  showMelding("");
  try {
    TARIEVEN = await loadTarieven(tariefSelect.value);
    setTarievenInfo();
  } catch (e) {
    showMelding("Tarieven wisselen lukt niet (JSON niet gevonden of niet bereikbaar).");
    console.error(e);
  }
});



init();

