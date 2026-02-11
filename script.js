// ======================
// Proceskosten Calculator
// - Rechtbank civiel (bodem + kort geding)
// - Kanton (bodem + kort geding aanbeveling)
// - Hof (bodem; incidenteel appel)
// - Waarde-type (geld / onbepaalde waarde) voor rechtbank/hof
// - Nakosten + betekening
//
// Kort geding (salaris) volgens Rechtspraak aanbeveling per 1 feb 2026:
// Kanton-KG: verstek €577; contradictoir: eenvoudig €577, gemiddeld €865, complex €1154
// Handel-KG: verstek €760; contradictoir: eenvoudig €760, gemiddeld €1177, complex €1766
// Nakosten handel-KG: €189 (of €296 conv+reconv) + €98 bij betekening; algemeen max nakosten €144 (kanton) :contentReference[oaicite:1]{index=1}
//
// Verwachte keys in data/tarieven-YYYY.json o.a.:
// - griffierecht_civiel_rechtbank
// - liquidatietarief_rechtbank
// - griffierecht_kanton
// - liquidatie_kanton
// - griffierecht_hof_civiel
// - liquidatietarief_hof_principaal
// - defaults (exploot_schatting, nakosten_schatting) [optioneel]
// ======================

// --------- Elementen & state ---------
const btn = document.getElementById("btnBereken");
const tariefSelect = document.getElementById("tariefset");
const gerechtSelect = document.getElementById("gerecht");

const kantonExtra = document.getElementById("kantonExtra");
const hofExtra = document.getElementById("hofExtra");

// Nieuw (optioneel in HTML):
// procedure: "bodem" | "kg"
const procedureEl = document.getElementById("procedure"); // <select id="procedure">

// KG extra UI (optioneel):
const kgExtra = document.getElementById("kgExtra"); // wrapper div
const kgTypeEl = document.getElementById("kgType"); // <select id="kgType"> verstek|contradictoir
const kgComplexEl = document.getElementById("kgComplex"); // <select id="kgComplex"> eenvoudig|gemiddeld|complex
const kgExtraZittingEl = document.getElementById("kgExtraZitting"); // checkbox
const kgReconventieEl = document.getElementById("kgReconventie"); // checkbox (conventie+reconv voor nakosten)
const kgReconventieHalveerEl = document.getElementById("kgReconventieHalveer"); // checkbox NB3

const waardeTypeEl = document.getElementById("waardeType"); // geld | onbepaald (rechtbank/hof)
const vorderingEl = document.getElementById("vordering");

const incidenteelEl = document.getElementById("incidenteel");
const incidenteelNoodzakelijkEl = document.getElementById("incidenteelNoodzakelijk");

const betekeningEl = document.getElementById("betekening");

let TARIEVEN = null;

// ======================
// Helpers
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

function getPartijKey() {
  const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";
  if (partijType === "onvermogend") return "onvermogend";
  if (partijType === "natuurlijk") return "natuurlijk";
  return "niet_natuurlijk";
}

// ======================
// Rechtbank civiel (bodem) helpers
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

// Rechtbank civiel – onbepaalde waarde (2026) (hardcoded; later naar JSON)
function getGriffierechtRechtbankOnbepaald(partijType) {
  if (partijType === "onvermogend") return { bedrag: 93, bandLabel: "Onbepaalde waarde", note: "" };
  if (partijType === "natuurlijk") return { bedrag: 341, bandLabel: "Onbepaalde waarde", note: "" };
  return { bedrag: 735, bandLabel: "Onbepaalde waarde", note: "" };
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
      return { type: "vast", salaris: r.salaris, maxPunten: r.maxPunten, bandMax: r.max };
    }
  }

  const last = L.money_bands[L.money_bands.length - 1];
  return { type: "vast", salaris: last.salaris, maxPunten: last.maxPunten, bandMax: last.max };
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
    return { bedrag: b0[key], bandLabel: b0.label || "Onbepaalde waarde", note: b0.note || "" };
  }

  for (const b of bands) {
    if (b.max === null || vordering <= b.max) {
      if (b.max === null && key === "natuurlijk") {
        const prev = bands.find(x => x.max === 1000000) || b;
        return { bedrag: prev[key], bandLabel: prev.label || "€ 100.000 – € 1.000.000", note: b.note || "" };
      }
      return { bedrag: b[key], bandLabel: b.label || "—", note: b.note || "" };
    }
  }

  const last = bands[bands.length - 1];
  return { bedrag: last[key], bandLabel: last.label || "—", note: last.note || "" };
}

function getTariefInfoHofPrincipaal(vordering) {
  const rows = TARIEVEN.liquidatietarief_hof_principaal;
  for (const r of rows) {
    if (r.max === null || vordering <= r.max) return r;
  }
  return rows[rows.length - 1];
}

// ======================
// Kort geding helpers (vaste salarissen, niet puntsysteem)
// ======================
function getKgDefaults() {
  const type = kgTypeEl?.value || "contradictoir"; // verstek|contradictoir
  const complex = kgComplexEl?.value || "gemiddeld"; // eenvoudig|gemiddeld|complex
  const extraZitting = kgExtraZittingEl?.checked ?? false;
  const reconv = kgReconventieEl?.checked ?? false;
  const reconvHalveer = kgReconventieHalveerEl?.checked ?? false;
  return { type, complex, extraZitting, reconv, reconvHalveer };
}

function calcSalarisKortGeding({ gerecht, type, complex, extraZitting, reconvHalveer }) {
  // Bron: Rechtspraak aanbeveling per 1 feb 2026 :contentReference[oaicite:2]{index=2}
  let basis = 0;

  if (gerecht === "kanton") {
    if (type === "verstek") basis = 577;
    else {
      if (complex === "eenvoudig") basis = 577;
      else if (complex === "complex") basis = 1154;
      else basis = 865; // gemiddeld
    }
  } else if (gerecht === "rechtbank_civiel") {
    // Handel-KG (incl. KG die tot bevoegdheid kanton behoren)
    if (type === "verstek") basis = 760;
    else {
      if (complex === "eenvoudig") basis = 760;
      else if (complex === "complex") basis = 1766;
      else basis = 1177; // gemiddeld
    }
  } else {
    // Hof kort geding modelleren we nu niet (zeldzaam/afwijkend): fallback bodem
    basis = 0;
  }

  // NB2: extra zitting -> + helft tarief (als inhoudelijk) (we maken het een checkbox) :contentReference[oaicite:3]{index=3}
  if (extraZitting) basis += 0.5 * basis;

  // NB3: reconventie voortvloeiend uit verweer -> halveer salaris (checkbox) :contentReference[oaicite:4]{index=4}
  if (reconvHalveer) basis *= 0.5;

  return Math.round(basis);
}

function calcNakostenKortGeding({ gerecht, betekening, reconv }) {
  // Bron: Rechtspraak aanbeveling per 1 feb 2026 :contentReference[oaicite:5]{index=5}
  if (gerecht === "rechtbank_civiel") {
    // Handel-KG: 189 (296 conv+reconv) + 98 bij betekening
    let n = reconv ? 296 : 189;
    if (betekening) n += 98;
    return n;
  }
  // Kanton-KG: op de pagina staat "Nakosten max 144" algemeen; we hanteren dat. :contentReference[oaicite:6]{index=6}
  return 144;
}

// ======================
// UI sync
// ======================
function syncUI() {
  const gerecht = gerechtSelect?.value || "rechtbank_civiel";
  const procedure = procedureEl?.value || "bodem";

  if (kantonExtra) kantonExtra.style.display = gerecht === "kanton" ? "block" : "none";
  if (hofExtra) hofExtra.style.display = gerecht === "hof" ? "block" : "none";

  // KG extra: alleen zichtbaar als procedure=kg en gerecht is rechtbank of kanton
  if (kgExtra) {
    const showKg = procedure === "kg" && (gerecht === "rechtbank_civiel" || gerecht === "kanton");
    kgExtra.style.display = showKg ? "block" : "none";
  }

  // vordering disabled bij onbepaald (rechtbank/hof)
  const isOnbepaald = waardeTypeEl?.value === "onbepaald";
  if (vorderingEl) vorderingEl.disabled = (gerecht !== "kanton" && procedure !== "kg" && isOnbepaald);
}

// ======================
// Main click
// ======================
btn.addEventListener("click", () => {
  showMelding("");

  if (!TARIEVEN) {
    showMelding("Tarieven zijn nog niet geladen (JSON ontbreekt of heeft een fout).");
    return;
  }

  const gerecht = gerechtSelect?.value || "rechtbank_civiel";
  const procedure = procedureEl?.value || "bodem";

  const waardeType = waardeTypeEl?.value || "geld";
  const isOnbepaald = waardeType === "onbepaald";

  const vorderingRaw = vorderingEl?.value ?? "";
  const vorderingNum = vorderingRaw === "" ? 0 : Number(vorderingRaw);
  const vorderingSafe = vorderingRaw === "" ? 0 : vorderingNum;

  const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";

  const explootAan = document.getElementById("exploot")?.checked ?? false;
  const nakostenAan = document.getElementById("nakosten")?.checked ?? false;
  const betekeningAan = betekeningEl?.checked ?? false;

  const explootKosten = explootAan ? (TARIEVEN.defaults?.exploot_schatting ?? 115) : 0;

  // Validatie bedrag: bij bodem geldvordering verplicht; bij KG laten we leeg toe (maar als gevuld moet het kloppen)
  if (procedure === "bodem") {
    if (!isOnbepaald && vorderingRaw === "") {
      showMelding("Vul de hoogte van de vordering in.");
      return;
    }
  }
  if (vorderingRaw !== "" && (!Number.isFinite(vorderingNum) || vorderingNum < 0)) {
    showMelding("Vul een geldig bedrag in (0 of hoger).");
    return;
  }

  let griffierecht = 0;
  let salaris = 0;
  let salarisIncidenteel = 0;
  let nakosten = 0;

  // ======================
  // KORT GEDING
  // ======================
  if (procedure === "kg" && (gerecht === "rechtbank_civiel" || gerecht === "kanton")) {
    // Griffierecht: we laten het reguliere griffierecht staan (griffierecht wordt niet “KG-tarief” gemaakt)
    // (Rechtspraak NB5 geeft aan dat aanpassing griffierecht beperkt is). :contentReference[oaicite:7]{index=7}
    if (gerecht === "kanton") {
      // kanton: griffierecht via kantonstaffel (op basis van waardeType in kantonSoort)
      const valueType = document.getElementById("kantonSoort")?.value || "geld";
      const g = getGriffierechtKanton(vorderingSafe, valueType);
      griffierecht = g.bedrag;
    } else {
      // rechtbank (handel): onbepaalde waarde mogelijk via waardeType
      const g = isOnbepaald
        ? getGriffierechtRechtbankOnbepaald(partijType)
        : getGriffierechtRechtbank(vorderingSafe, partijType);
      griffierecht = g.bedrag;
    }

    // Salaris KG (vast, geen punten)
    const kg = getKgDefaults();
    salaris = calcSalarisKortGeding({
      gerecht,
      type: kg.type,
      complex: kg.complex,
      extraZitting: kg.extraZitting,
      reconvHalveer: kg.reconvHalveer
    });

    // Nakosten KG (apart regime)
    if (nakostenAan) {
      nakosten = calcNakostenKortGeding({
        gerecht,
        betekening: betekeningAan,
        reconv: kg.reconv
      });
    }

    const totaal = griffierecht + salaris + explootKosten + nakosten;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Kort geding)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris (KG, vast): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten (KG): ${euro(nakosten)}<br><br>

      <strong>Transparantie</strong><br>
      Tariefjaar: ${tariefSelect.value}<br>
      Gerecht: ${gerecht === "kanton" ? "Kanton" : "Rechtbank (handel/voorzieningenrechter)"}<br>
      Waarde: ${isOnbepaald ? "Onbepaalde waarde" : "Geldvordering"}<br>
      Vordering: ${vorderingRaw === "" ? "—" : euro(vorderingSafe)}<br>
      KG-type: ${(kgTypeEl?.value || "contradictoir")}<br>
      KG-complexiteit: ${(kgComplexEl?.value || "gemiddeld")}<br>
      Extra zitting: ${(kgExtraZittingEl?.checked ?? false) ? "ja" : "nee"}<br>
      Reconventie (voor nakosten): ${(kgReconventieEl?.checked ?? false) ? "ja" : "nee"}<br>
      Reconventie-halvering salaris: ${(kgReconventieHalveerEl?.checked ?? false) ? "ja" : "nee"}<br>
      Betekening (nakosten): ${betekeningAan ? "ja" : "nee"}<br><br>

      <em>Bron:</em> Aanbeveling tarieven kort gedingen per 1 feb 2026. :contentReference[oaicite:8]{index=8}
    `;
    return;
  }

  // ======================
  // BODEM: KANTON
  // ======================
  if (gerecht === "kanton") {
    const valueType = document.getElementById("kantonSoort")?.value || "geld";

    const g = getGriffierechtKanton(vorderingSafe, valueType);
    griffierecht = g.bedrag;

    const liq = getLiquidatieKanton(vorderingSafe, valueType);

    if (liq.type === "range") {
      salaris = pickRangeValue(liq.min, liq.max);
    } else {
      salaris = liq.salaris;
    }

    if (nakostenAan) {
      nakosten = TARIEVEN.liquidatie_kanton?.nakosten_max ?? 144;
    }

    const totaal = griffierecht + salaris + explootKosten + nakosten;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Kanton – bodem)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris gemachtigde (liquidatie): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakosten)}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `;
    return;
  }

  // ======================
  // BODEM: HOF
  // ======================
  if (gerecht === "hof") {
    // vordering verplicht bij geld (onbepaald mag leeg)
    if (!isOnbepaald && vorderingRaw === "") {
      showMelding("Vul de hoogte van de vordering in.");
      return;
    }

    const g = getGriffierechtHof(vorderingSafe, partijType, isOnbepaald);
    griffierecht = g.bedrag;

    const punten = getPunten();
    const tarief = getTariefInfoHofPrincipaal(vorderingSafe);
    const puntenGeliq = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
    const salarisPrincipaal = puntenGeliq * tarief.punt;

    // Incidenteel: ½ principaal mits noodzakelijk (jouw bestaande keuze)
    const incidenteelAan = incidenteelEl?.checked ?? false;
    const noodzakelijkAan = incidenteelNoodzakelijkEl?.checked ?? false;

    if (incidenteelAan && noodzakelijkAan) salarisIncidenteel = 0.5 * salarisPrincipaal;

    salaris = salarisPrincipaal;

    // Nakosten (bodem civiel): gebruik defaults of 135; betekening via checkbox (algemene aanpak)
    if (nakostenAan) {
      let base = TARIEVEN.defaults?.nakosten_schatting ?? 135;
      if (betekeningAan) base += 98;

      // praktische cap: max ½ geliquideerd salaris
      const cap = 0.5 * (salaris + salarisIncidenteel);
      nakosten = Math.min(base, cap);
    }

    const totaal = griffierecht + salaris + salarisIncidenteel + explootKosten + nakosten;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Hof – bodem)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris principaal: ${euro(salaris)}<br>
      Salaris incidenteel: ${euro(salarisIncidenteel)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakosten)}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `;
    return;
  }

  // ======================
  // BODEM: RECHTBANK CIVIEL
  // ======================
  // vordering verplicht bij geld (onbepaald mag leeg)
  if (!isOnbepaald && vorderingRaw === "") {
    showMelding("Vul de hoogte van de vordering in.");
    return;
  }

  const g = isOnbepaald
    ? getGriffierechtRechtbankOnbepaald(partijType)
    : getGriffierechtRechtbank(vorderingSafe, partijType);

  griffierecht = g.bedrag;

  const punten = getPunten();
  const tarief = getTariefInfoRechtbank(vorderingSafe);
  const puntenGeliq = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
  salaris = puntenGeliq * tarief.punt;

  if (nakostenAan) {
    let base = TARIEVEN.defaults?.nakosten_schatting ?? 135;
    if (betekeningAan) base += 98;
    const cap = 0.5 * salaris;
    nakosten = Math.min(base, cap);
  }

  const totaal = griffierecht + salaris + explootKosten + nakosten;

  document.getElementById("resultaat").innerHTML = `
    <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

    <strong>Specificatie (Rechtbank – bodem)</strong><br>
    Griffierecht: ${euro(griffierecht)}<br>
    Salaris advocaat (liquidatie): ${euro(salaris)}<br>
    Explootkosten: ${euro(explootKosten)}<br>
    Nakosten: ${euro(nakosten)}<br><br>

    <em>Disclaimer:</em> indicatie; rechter kan afwijken.
  `;
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

  // UX: als incidenteel uit staat, zet noodzakelijk ook uit
  if (incidenteelEl && incidenteelNoodzakelijkEl) {
    incidenteelEl.addEventListener("change", () => {
      if (!incidenteelEl.checked) incidenteelNoodzakelijkEl.checked = false;
    });
  }
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
});

init();
