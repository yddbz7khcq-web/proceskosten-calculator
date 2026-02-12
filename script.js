// ======================
// Proceskosten Calculator (refactor + nieuwe flow)
// - KG tarieven uit JSON (TARIEVEN.kortgeding)
// - Rechtbank onbepaalde waarde griffierecht uit JSON
// - UI flow: waarde/vordering conditioneel, punten hard verbergen bij KG/kanton
// - Hof: incidenteel via dropdown (ja/nee)
// ======================

// --------- Elementen ---------
const btn = document.getElementById("btnBereken");
const tariefSelect = document.getElementById("tariefset");
const gerechtSelect = document.getElementById("gerecht");

const procedureEl = document.getElementById("procedure"); // bodem | kg (UI: Nee/Ja)
const procedureWrap = document.getElementById("procedureWrap");

const kgExtra = document.getElementById("kgExtra");
const kgTypeEl = document.getElementById("kgType");
const kgComplexEl = document.getElementById("kgComplex");
const kgExtraZittingEl = document.getElementById("kgExtraZitting");
const kgReconventieEl = document.getElementById("kgReconventie");
const kgReconventieHalveerEl = document.getElementById("kgReconventieHalveer");

const kantonExtra = document.getElementById("kantonExtra");
const hofExtra = document.getElementById("hofExtra");

const waardeTypeEl = document.getElementById("waardeType"); // geld | onbepaald
const vorderingEl = document.getElementById("vordering");

const waardeSection = document.getElementById("waardeSection");
const vorderingRow = document.getElementById("vorderingRow");
const waardeTypeLabel = document.getElementById("waardeTypeLabel");

const puntenSection = document.getElementById("puntenSection");

const incidenteelEl = document.getElementById("incidenteel"); // <select> ja/nee bij hof

const betekeningEl = document.getElementById("betekening");

let TARIEVEN = null;

// ======================
// UI helpers
// ======================
function euro(n) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function showMelding(text) {
  const el = document.getElementById("melding");
  if (!el) return;

  if (!text) {
    el.classList.add("hidden");
    el.innerText = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerText = text;
}

function setTarievenInfo() {
  const el = document.getElementById("tarievenInfo");
  if (!el) return;

  if (!TARIEVEN) {
    el.innerText = "—";
    return;
  }
  el.innerText = `${TARIEVEN.label}. Laatst bijgewerkt: ${TARIEVEN.updated}.`;
}

async function loadTarieven(jaar) {
  const res = await fetch(`data/tarieven-${jaar}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kan tarieven-${jaar}.json niet laden (HTTP ${res.status}).`);
  return await res.json();
}

function getPunten() {
  const handmatig = document.getElementById("puntenHandmatig")?.value ?? "";
  if (handmatig !== "" && !Number.isNaN(Number(handmatig))) return Number(handmatig);

  return Array.from(document.querySelectorAll(".step"))
    .filter(cb => cb.checked)
    .reduce((sum, cb) => sum + Number(cb.dataset.points), 0);
}

function getPartijType() {
  return document.getElementById("partijType")?.value || "niet_natuurlijk";
}

function getPartijKey() {
  const partijType = getPartijType();
  if (partijType === "onvermogend") return "onvermogend";
  if (partijType === "natuurlijk") return "natuurlijk";
  return "niet_natuurlijk";
}

function parseVordering() {
  const raw = vorderingEl?.value ?? "";
  if (raw === "") return { raw, value: 0, isEmpty: true, isValid: true };

  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return { raw, value: 0, isEmpty: false, isValid: false };
  return { raw, value: num, isEmpty: false, isValid: true };
}

function getExplootKosten() {
  const explootAan = document.getElementById("exploot")?.checked ?? false;
  return explootAan ? (TARIEVEN?.defaults?.exploot_schatting ?? 115) : 0;
}

function wantsNakosten() {
  return document.getElementById("nakosten")?.checked ?? false;
}

function wantsBetekening() {
  return betekeningEl?.checked ?? false;
}

// ======================
// Rechtbank civiel helpers
// ======================
function getTariefInfoRechtbank(vordering) {
  const rows = TARIEVEN.liquidatietarief_rechtbank;
  for (const r of rows) {
    if (r.max === null || vordering <= r.max) return r;
  }
  return rows[rows.length - 1];
}

function getGriffierechtRechtbank(vordering, partijType) {
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

  const last = g.bands[g.bands.length - 1];
  return { bedrag: last[key], bandLabel: "—", note: last.note || "" };
}

function getGriffierechtRechtbankOnbepaald(partijType) {
  const ob = TARIEVEN.griffierecht_civiel_rechtbank?.onbepaald;

  // Fallback als JSON-key ontbreekt (zou niet moeten)
  if (!ob) {
    if (partijType === "onvermogend") return { bedrag: 93 };
    if (partijType === "natuurlijk") return { bedrag: 341 };
    return { bedrag: 735 };
  }

  if (partijType === "onvermogend") return { bedrag: ob.onvermogend };
  if (partijType === "natuurlijk") return { bedrag: ob.natuurlijk };
  return { bedrag: ob.niet_natuurlijk };
}

// ======================
// Kanton helpers (bodem)
// ======================
function getGriffierechtKanton(vordering, valueType) {
  const key = getPartijKey();
  const bands = TARIEVEN.griffierecht_kanton.bands;

  if (valueType === "onbepaald") {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: "Onbepaalde waarde / laagste schijf" };
  }

  if (valueType === "ontruiming" || valueType === "overig") {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: "Kanton (default): laagste schijf" };
  }

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

  for (const r of L.money_bands) {
    if (r.max === null || vordering <= r.max) {
      return { type: "vast", salaris: r.salaris, maxPunten: r.maxPunten };
    }
  }

  const last = L.money_bands[L.money_bands.length - 1];
  return { type: "vast", salaris: last.salaris, maxPunten: last.maxPunten };
}

function pickRangeValue(min, max) {
  const niveau = document.getElementById("onbepaaldNiveau")?.value || "gemiddeld";
  if (niveau === "laag") return min;
  if (niveau === "hoog") return max;
  return Math.round((min + max) / 2);
}

// ======================
// Hof helpers
// ======================
function getGriffierechtHof(vordering, partijType, isOnbepaald = false) {
  const bands = TARIEVEN.griffierecht_hof_civiel.bands;
  const key =
    partijType === "onvermogend" ? "onvermogend" :
    partijType === "natuurlijk" ? "natuurlijk" :
    "niet_natuurlijk";

  if (isOnbepaald) {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: b0.label || "Onbepaalde waarde" };
  }

  for (const b of bands) {
    if (b.max === null || vordering <= b.max) {
      if (b.max === null && key === "natuurlijk") {
        const prev = bands.find(x => x.max === 1000000) || b;
        return { bedrag: prev[key], bandLabel: prev.label || "€ 100.000 – € 1.000.000" };
      }
      return { bedrag: b[key], bandLabel: b.label || "—" };
    }
  }

  const last = bands[bands.length - 1];
  return { bedrag: last[key], bandLabel: last.label || "—" };
}

function getTariefInfoHofPrincipaal(vordering) {
  const rows = TARIEVEN.liquidatietarief_hof_principaal;
  for (const r of rows) {
    if (r.max === null || vordering <= r.max) return r;
  }
  return rows[rows.length - 1];
}

// ======================
// Kort geding helpers (JSON-gedreven)
// ======================
function getKgDefaults() {
  const type = kgTypeEl?.value || "contradictoir";
  const complex = kgComplexEl?.value || "gemiddeld";
  const extraZitting = kgExtraZittingEl?.checked ?? false;
  const reconv = kgReconventieEl?.checked ?? false;
  const reconvHalveer = kgReconventieHalveerEl?.checked ?? false;
  return { type, complex, extraZitting, reconv, reconvHalveer };
}

function calcSalarisKortGeding({ gerecht, type, complex, extraZitting, reconvHalveer }) {
  const cfg = TARIEVEN.kortgeding?.salaris?.[gerecht];
  if (!cfg) return 0;

  let basis = 0;

  if (type === "verstek") {
    basis = Number(cfg.verstek || 0);
  } else {
    const c = cfg.contradictoir || {};
    basis =
      complex === "eenvoudig" ? Number(c.eenvoudig || 0) :
      complex === "complex" ? Number(c.complex || 0) :
      Number(c.gemiddeld || 0);
  }

  if (extraZitting) {
    const factor = Number(cfg.extra_zitting_factor ?? 0.5);
    basis += factor * basis;
  }

  if (reconvHalveer) {
    const factor = Number(cfg.reconv_halveer_factor ?? 0.5);
    basis *= factor;
  }

  return Math.round(basis);
}

function calcNakostenKortGeding({ gerecht, betekening, reconv }) {
  const cfg = TARIEVEN.kortgeding?.nakosten?.[gerecht];
  if (!cfg) return 0;

  if (gerecht === "rechtbank_civiel") {
    let n = reconv ? Number(cfg.conventie_reconventie || 0) : Number(cfg.basis || 0);
    if (betekening) n += Number(cfg.betekening || 0);
    return n;
  }

  // kanton
  return Number(cfg.max || 0);
}

// ======================
// Berekenmodules
// ======================
function renderResult(html) {
  const el = document.getElementById("resultaat");
  if (el) el.innerHTML = html;
}

function calcNakostenBodem({ salarisTotaal, betekening }) {
  let base = TARIEVEN.defaults?.nakosten_schatting ?? 135;
  if (betekening) base += 98;
  const cap = 0.5 * salarisTotaal;
  return Math.min(base, cap);
}

function berekenKortGeding({ gerecht, isOnbepaald, vordering, partijType }) {
  const explootKosten = getExplootKosten();
  const nakostenAan = wantsNakosten();
  const betekeningAan = wantsBetekening();

  let griffierecht = 0;
  if (gerecht === "kanton") {
    const valueType = document.getElementById("kantonSoort")?.value || "geld";
    griffierecht = getGriffierechtKanton(vordering, valueType).bedrag;
  } else {
    griffierecht = (isOnbepaald ? getGriffierechtRechtbankOnbepaald(partijType) : getGriffierechtRechtbank(vordering, partijType)).bedrag;
  }

  const kg = getKgDefaults();
  const salaris = calcSalarisKortGeding({
    gerecht,
    type: kg.type,
    complex: kg.complex,
    extraZitting: kg.extraZitting,
    reconvHalveer: kg.reconvHalveer
  });

  const nakosten = nakostenAan
    ? calcNakostenKortGeding({ gerecht, betekening: betekeningAan, reconv: kg.reconv })
    : 0;

  const totaal = griffierecht + salaris + explootKosten + nakosten;

  return {
    totaal,
    html: `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Kort geding)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris (KG, vast): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten (KG): ${euro(nakosten)}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `
  };
}

function berekenKantonBodem({ vordering }) {
  const explootKosten = getExplootKosten();
  const nakostenAan = wantsNakosten();

  const valueType = document.getElementById("kantonSoort")?.value || "geld";
  const griffierecht = getGriffierechtKanton(vordering, valueType).bedrag;

  const liq = getLiquidatieKanton(vordering, valueType);
  const salaris = liq.type === "range" ? pickRangeValue(liq.min, liq.max) : liq.salaris;

  const nakosten = nakostenAan ? (TARIEVEN.liquidatie_kanton?.nakosten_max ?? 144) : 0;
  const totaal = griffierecht + salaris + explootKosten + nakosten;

  return {
    totaal,
    html: `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Kanton – bodem)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris gemachtigde (liquidatie): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakosten)}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `
  };
}

function berekenHofBodem({ isOnbepaald, vordering, partijType }) {
  const explootKosten = getExplootKosten();
  const nakostenAan = wantsNakosten();
  const betekeningAan = wantsBetekening();

  const griffierecht = getGriffierechtHof(vordering, partijType, isOnbepaald).bedrag;

  const punten = getPunten();
  const tarief = getTariefInfoHofPrincipaal(vordering);
  const puntenGeliq = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
  const salarisPrincipaal = puntenGeliq * tarief.punt;

  let salarisIncidenteel = 0;
  const incidenteelAan = (incidenteelEl?.value || "nee") === "ja";
  if (incidenteelAan) salarisIncidenteel = 0.5 * salarisPrincipaal;

  const salarisTotaal = salarisPrincipaal + salarisIncidenteel;
  const nakosten = nakostenAan ? calcNakostenBodem({ salarisTotaal, betekening: betekeningAan }) : 0;

  const totaal = griffierecht + salarisPrincipaal + salarisIncidenteel + explootKosten + nakosten;

  return {
    totaal,
    html: `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Hof – bodem)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris principaal: ${euro(salarisPrincipaal)}<br>
      Salaris incidenteel: ${euro(salarisIncidenteel)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakosten)}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `
  };
}

function berekenRechtbankBodem({ isOnbepaald, vordering, partijType }) {
  const explootKosten = getExplootKosten();
  const nakostenAan = wantsNakosten();
  const betekeningAan = wantsBetekening();

  const griffierecht = (isOnbepaald ? getGriffierechtRechtbankOnbepaald(partijType) : getGriffierechtRechtbank(vordering, partijType)).bedrag;

  const punten = getPunten();
  const tarief = getTariefInfoRechtbank(vordering);
  const puntenGeliq = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
  const salaris = puntenGeliq * tarief.punt;

  const nakosten = nakostenAan ? calcNakostenBodem({ salarisTotaal: salaris, betekening: betekeningAan }) : 0;
  const totaal = griffierecht + salaris + explootKosten + nakosten;

  return {
    totaal,
    html: `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Rechtbank – bodem)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris advocaat (liquidatie): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakosten)}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `
  };
}

// ======================
// UI sync
// ======================
function syncUI() {
  const gerecht = gerechtSelect?.value || "rechtbank_civiel";
  const procedure = procedureEl?.value || "bodem";

  // Extra blokken
  if (kantonExtra) kantonExtra.style.display = gerecht === "kanton" ? "block" : "none";
  if (hofExtra) hofExtra.style.display = gerecht === "hof" ? "block" : "none";

  // Vraag "Is sprake van een kort geding?" alleen bij eerste aanleg
  if (procedureWrap) {
    const showProcedureQuestion = (gerecht === "rechtbank_civiel" || gerecht === "kanton");
    procedureWrap.style.display = showProcedureQuestion ? "block" : "none";

    // Als hoger beroep: forceer bodem
    if (!showProcedureQuestion && procedureEl) {
      procedureEl.value = "bodem";
    }
  }

  // KG instellingen alleen als KG + eerste aanleg
  if (kgExtra) {
    const showKg = (procedureEl?.value === "kg") && (gerecht === "rechtbank_civiel" || gerecht === "kanton");
    kgExtra.style.display = showKg ? "block" : "none";
  }

  // Waarde-sectie:
  // - zichtbaar bij rechtbank én hof
  // - verborgen bij kanton
  if (waardeSection) {
    const showWaardeSection = (gerecht === "rechtbank_civiel" || gerecht === "hof");
    waardeSection.style.display = showWaardeSection ? "block" : "none";
  }

  // Labeltekst: bij hof "Waarde vordering"
  if (waardeTypeLabel) {
    waardeTypeLabel.innerText = (gerecht === "hof") ? "Waarde vordering" : "Waarde";
  }

  // Hoogte vordering verbergen als waardeType = onbepaald (rechtbank/hof)
  const isOnbepaald = (waardeTypeEl?.value || "geld") === "onbepaald";
  if (vorderingRow) {
    const showVordering = !isOnbepaald && (gerecht === "rechtbank_civiel" || gerecht === "hof");
    vorderingRow.style.display = showVordering ? "block" : "none";
  }

  // Punten hard verbergen:
  // - bij hof altijd tonen (bodem)
  // - bij rechtbank alleen tonen bij bodem
  // - bij kanton verbergen
  if (puntenSection) {
    const showPunten =
      (gerecht === "hof") ||
      (gerecht === "rechtbank_civiel" && (procedureEl?.value === "bodem"));
    puntenSection.style.display = showPunten ? "block" : "none";
  }
}

// ======================
// Main click
// ======================
btn?.addEventListener("click", () => {
  showMelding("");

  if (!TARIEVEN) {
    showMelding("Tarieven zijn nog niet geladen (JSON ontbreekt of heeft een fout).");
    return;
  }

  const gerecht = gerechtSelect?.value || "rechtbank_civiel";
  const procedure = procedureEl?.value || "bodem";

  const waardeType = waardeTypeEl?.value || "geld";
  const isOnbepaald = (waardeType === "onbepaald");

  const partijType = getPartijType();
  const v = parseVordering();

  // Validatie: hoogte vordering alleen verplicht bij geldvordering en als die vraag relevant is
  const vorderingIsRelevant = (gerecht === "rechtbank_civiel" || gerecht === "hof") && !isOnbepaald;
  if (vorderingIsRelevant && v.isEmpty) {
    showMelding("Vul de hoogte van de vordering in.");
    return;
  }
  if (!v.isValid) {
    showMelding("Vul een geldig bedrag in (0 of hoger).");
    return;
  }

  let out = null;

  if (procedure === "kg" && (gerecht === "rechtbank_civiel" || gerecht === "kanton")) {
    out = berekenKortGeding({ gerecht, isOnbepaald, vordering: v.value, partijType });
  } else if (gerecht === "kanton") {
    out = berekenKantonBodem({ vordering: v.value });
  } else if (gerecht === "hof") {
    out = berekenHofBodem({ isOnbepaald, vordering: v.value, partijType });
  } else {
    out = berekenRechtbankBodem({ isOnbepaald, vordering: v.value, partijType });
  }

  renderResult(out?.html || "Er ging iets mis bij het berekenen.");
});

// ======================
// Init + listeners
// ======================
async function init() {
  try {
    TARIEVEN = await loadTarieven(tariefSelect.value);
    setTarievenInfo();
  } catch (e) {
    TARIEVEN = null;
    setTarievenInfo();
    showMelding(`Ik kan de tarieven niet laden: ${e?.message || e}`);
    console.error(e);
  }

  syncUI();
}

gerechtSelect?.addEventListener("change", syncUI);
waardeTypeEl?.addEventListener("change", syncUI);
procedureEl?.addEventListener("change", syncUI);

tariefSelect?.addEventListener("change", async () => {
  showMelding("");
  try {
    TARIEVEN = await loadTarieven(tariefSelect.value);
    setTarievenInfo();
  } catch (e) {
    TARIEVEN = null;
    setTarievenInfo();
    showMelding(`Tarieven wisselen lukt niet: ${e?.message || e}`);
    console.error(e);
  }
  syncUI();
});

init();
