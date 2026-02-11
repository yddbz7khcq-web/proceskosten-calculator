// ======================
// Proceskosten calculator (Rechtbank civiel + Kanton + Hof principaal)
// + Waarde-type (geld / onbepaalde waarde) voor Rechtbank & Hof
// + Hof: incidenteel appel (1/2 principaal, mits noodzakelijk)
// + Nakosten: optie "met betekening" (+ €98) + max-nakosten (aanbevelingen)
//
// Bronnen (logica):
// - Incidenteel appel: helft principaal, mits noodzakelijk geoordeeld. (Rechtspraak)  :contentReference[oaicite:3]{index=3}
// - Nakosten: max civiel €135 (aanbeveling). (Rechtspraak)                          :contentReference[oaicite:4]{index=4}
// - Betekening-opslag: + €98 (in aanbeveling KG/handel; gebruikt als toggle).       :contentReference[oaicite:5]{index=5}
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
const gerechtSelect = document.getElementById("gerecht");      // rechtbank_civiel | kanton | hof
const kantonExtra = document.getElementById("kantonExtra");    // kanton-only block (kan ontbreken)

const waardeTypeEl = document.getElementById("waardeType");    // geld | onbepaald (rechtbank/hof)
const vorderingEl = document.getElementById("vordering");

// Nieuw (HTML toevoegen):
// - incidenteel (hof) + incidenteelNoodzakelijk (hof)
// - betekening (nakosten)
const incidenteelEl = document.getElementById("incidenteel");
const incidenteelNoodzakelijkEl = document.getElementById("incidenteelNoodzakelijk");
const betekeningEl = document.getElementById("betekening");

let TARIEVEN = null;

// --------- UI helpers ---------
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

// --------- Data laden ---------
async function loadTarieven(jaar) {
  const res = await fetch(`data/tarieven-${jaar}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kan tarieven-${jaar}.json niet laden (HTTP ${res.status}).`);
  return await res.json();
}

// --------- Punten ---------
function getPunten() {
  const handmatigEl = document.getElementById("puntenHandmatig");
  const handmatig = handmatigEl ? handmatigEl.value : "";

  if (handmatig !== "" && !Number.isNaN(Number(handmatig))) return Number(handmatig);

  const steps = Array.from(document.querySelectorAll(".step"));
  return steps
    .filter(cb => cb.checked)
    .reduce((sum, cb) => sum + Number(cb.dataset.points), 0);
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

// Rechtbank civiel – onbepaalde waarde (2026)
// (Later kunnen we dit ook in JSON zetten)
function getGriffierechtRechtbankOnbepaald(partijType) {
  if (partijType === "onvermogend") return { bedrag: 93, bandLabel: "Onbepaalde waarde", note: "" };
  if (partijType === "natuurlijk") return { bedrag: 341, bandLabel: "Onbepaalde waarde", note: "" };
  return { bedrag: 735, bandLabel: "Onbepaalde waarde", note: "" };
}

// ======================
// Kanton helpers
// ======================
function getPartijKey() {
  const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";
  if (partijType === "onvermogend") return "onvermogend";
  if (partijType === "natuurlijk") return "natuurlijk";
  return "niet_natuurlijk";
}

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
// Hof (principaal) helpers
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
// Nakosten helpers
// ======================

// Max nakosten civiel (aanbeveling) – bekend van Rechtspraak overzicht: max €135 (per 1 feb 2024). :contentReference[oaicite:6]{index=6}
function getNakostenMaxCiviel() {
  // Als je liever uit JSON haalt: TARIEVEN.defaults.nakosten_schatting
  return TARIEVEN?.defaults?.nakosten_schatting ?? 135;
}

// Betekening-opslag (zoals in aanbeveling kort geding/handel staat: + €98 bij betekening). :contentReference[oaicite:7]{index=7}
function getBetekeningOpslag() {
  return 98;
}

// Juridisch netter: nakosten mogen niet onredelijk worden t.o.v. salaris.
// We hanteren als praktische cap: max 1/2 geliquideerd salaris (gebruikelijk gedachte in liquidatiecontext).
function capNakostenToHalfSalaris(nakosten, salarisGeliquideerd) {
  const cap = 0.5 * salarisGeliquideerd;
  return Math.min(nakosten, cap);
}

// Context: "kanton" | "civiel" (rechtbank/hof)
function calcNakosten({ include, betekening, context, salarisGeliquideerd }) {
  if (!include) return { bedrag: 0, uitleg: "Nakosten: niet meegenomen" };

  if (context === "kanton") {
    // Kanton: gebruik max uit JSON (bij jou: 144 in liquidatie_kanton). (Je kunt later betekening apart modelleren)
    const base = TARIEVEN?.liquidatie_kanton?.nakosten_max ?? 144;
    const bedrag = base;
    return { bedrag, uitleg: `Nakosten (kanton, max): ${euro(bedrag)}` };
  }

  // Civiel (rechtbank/hof): max €135 (aanbeveling) + eventueel betekening-opslag
  let base = getNakostenMaxCiviel();
  let bedrag = base;

  if (betekening) {
    bedrag += getBetekeningOpslag();
  }

  // cap op 1/2 geliquideerd salaris (praktische safety)
  bedrag = capNakostenToHalfSalaris(bedrag, salarisGeliquideerd);

  return {
    bedrag,
    uitleg: `Nakosten (civiel, max ${euro(base)}${betekening ? ` + betekening ${euro(getBetekeningOpslag())}` : ""}, gemaximeerd op ½ salaris): ${euro(bedrag)}`
  };
}

// ======================
// Waarde UI sync (disable bedrag bij onbepaald voor rechtbank/hof)
// ======================
function syncWaardeUI() {
  const gerecht = gerechtSelect?.value || "rechtbank_civiel";
  const isKanton = gerecht === "kanton";
  const isOnbepaald = (waardeTypeEl?.value === "onbepaald");

  if (vorderingEl) {
    vorderingEl.disabled = (!isKanton && isOnbepaald);
  }
}

// ======================
// Main click: bereken
// ======================
btn.addEventListener("click", () => {
  showMelding("");

  if (!TARIEVEN) {
    showMelding("Tarieven zijn nog niet geladen (JSON ontbreekt of heeft een fout).");
    return;
  }

  const gerecht = gerechtSelect?.value || "rechtbank_civiel";

  // Waarde-type (alleen voor rechtbank/hof)
  const waardeType = waardeTypeEl?.value || "geld";
  const isOnbepaald = (waardeType === "onbepaald");

  const vorderingRaw = document.getElementById("vordering")?.value ?? "";
  const vorderingNum = Number(vorderingRaw);
  const vorderingSafe = vorderingRaw === "" ? 0 : vorderingNum;

  // Punten
  const punten = getPunten();
  if (!Number.isFinite(punten) || punten < 0) {
    showMelding("Punten moeten 0 of hoger zijn.");
    return;
  }

  // Overige posten (optioneel)
  const explootAan = document.getElementById("exploot")?.checked ?? false;
  const nakostenAan = document.getElementById("nakosten")?.checked ?? false;
  const betekeningAan = betekeningEl?.checked ?? false;

  const explootKosten = explootAan ? (TARIEVEN.defaults?.exploot_schatting ?? 115) : 0;

  // ======================
  // KANTON
  // ======================
  if (gerecht === "kanton") {
    const valueType = document.getElementById("kantonSoort")?.value || "geld";

    if (valueType === "geld") {
      if (vorderingRaw === "") {
        showMelding("Vul de hoogte van de vordering in (kanton: geldvordering).");
        return;
      }
      if (!Number.isFinite(vorderingNum) || vorderingNum < 0) {
        showMelding("Vul een geldig bedrag in (0 of hoger).");
        return;
      }
    } else {
      if (vorderingRaw !== "" && (!Number.isFinite(vorderingNum) || vorderingNum < 0)) {
        showMelding("Vul een geldig bedrag in (0 of hoger).");
        return;
      }
    }

    const g = getGriffierechtKanton(vorderingSafe, valueType);
    const griffierecht = g.bedrag;

    const liq = getLiquidatieKanton(vorderingSafe, valueType);

    let salaris = 0;
    let liqUitleg = "";

    if (liq.type === "range") {
      salaris = pickRangeValue(liq.min, liq.max);
      liqUitleg = `Liquidatie (onbepaalde waarde): range €${liq.min}–€${liq.max} (gekozen: €${salaris})`;
    } else {
      const puntenGeliq = liq.maxPunten == null ? punten : Math.min(punten, liq.maxPunten);
      salaris = liq.salaris;
      liqUitleg = `Liquidatie (kanton): staffel-salaris €${liq.salaris} (punten: ${punten}, geliquideerd: ${puntenGeliq}${liq.maxPunten ? `, max ${liq.maxPunten}` : ""})`;
    }

    const nak = calcNakosten({
      include: nakostenAan,
      betekening: betekeningAan,
      context: "kanton",
      salarisGeliquideerd: salaris
    });

    const totaal = griffierecht + salaris + explootKosten + nak.bedrag;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Kanton)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris gemachtigde (liquidatie): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      ${nakostenAan ? `Nakosten: ${euro(nak.bedrag)}<br>` : `Nakosten: ${euro(0)}<br>`}
      <br>

      <strong>Transparantie</strong><br>
      Tariefjaar: ${tariefSelect.value}<br>
      Vordering: ${vorderingRaw === "" ? "—" : euro(vorderingSafe)}<br>
      Griffierecht-band: ${g.bandLabel}<br>
      ${liqUitleg}<br>
      ${nak.uitleg}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `;
    return;
  }

  // ======================
  // Rechtbank/Hof validatie vordering
  // ======================
  if (!isOnbepaald && vorderingRaw === "") {
    showMelding("Vul de hoogte van de vordering in.");
    return;
  }
  if (vorderingRaw !== "" && (!Number.isFinite(vorderingNum) || vorderingNum < 0)) {
    showMelding("Vul een geldig bedrag in (0 of hoger).");
    return;
  }

  // ======================
  // HOF (principaal + optioneel incidenteel)
  // ======================
  if (gerecht === "hof") {
    const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";

    const g = getGriffierechtHof(vorderingSafe, partijType, isOnbepaald);
    const griffierecht = g.bedrag;

    // Principaal
    const tarief = getTariefInfoHofPrincipaal(vorderingSafe);
    const puntenGeliquideerd = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
    const salarisPrincipaal = puntenGeliquideerd * tarief.punt;

    // Incidenteel (½ principaal, mits noodzakelijk geoordeeld) :contentReference[oaicite:8]{index=8}
    const incidenteelAan = incidenteelEl?.checked ?? false;
    const noodzakelijkAan = incidenteelNoodzakelijkEl?.checked ?? false;

    let salarisIncidenteel = 0;
    let incidenteelUitleg = "Incidenteel appel: niet meegenomen";

    if (incidenteelAan) {
      if (noodzakelijkAan) {
        salarisIncidenteel = 0.5 * salarisPrincipaal;
        incidenteelUitleg = `Incidenteel appel: ½ van principaal = ${euro(salarisIncidenteel)} (mits noodzakelijk geoordeeld)`;
      } else {
        salarisIncidenteel = 0;
        incidenteelUitleg = "Incidenteel appel: aangevinkt, maar niet ‘noodzakelijk geoordeeld’ → €0 in indicatie";
      }
    }

    const salarisTotaal = salarisPrincipaal + salarisIncidenteel;

    const nak = calcNakosten({
      include: nakostenAan,
      betekening: betekeningAan,
      context: "civiel",
      salarisGeliquideerd: salarisTotaal
    });

    const totaal = griffierecht + salarisTotaal + explootKosten + nak.bedrag;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Hof)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris advocaat (principaal): ${euro(salarisPrincipaal)}<br>
      Salaris advocaat (incidenteel): ${euro(salarisIncidenteel)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nak.bedrag)}<br><br>

      <strong>Transparantie</strong><br>
      Tariefjaar: ${tariefSelect.value}<br>
      Waarde: ${isOnbepaald ? "Onbepaalde waarde" : "Geldvordering"}<br>
      Vordering: ${isOnbepaald ? "—" : euro(vorderingSafe)}<br>
      Griffierecht-band: ${g.bandLabel}${g.note ? `<br><em>Let op:</em> ${g.note}` : ""}<br>
      Liquidatietarief hof (principaal): tarief ${tarief.name}, ${euro(tarief.punt)}/punt${tarief.maxPunten ? `, max ${tarief.maxPunten}` : ""}<br>
      Punten: ${punten} (geliquideerd: ${puntenGeliquideerd})<br>
      ${incidenteelUitleg}<br>
      ${nak.uitleg}<br>
      ${isOnbepaald ? `<br><em>Let op:</em> bij onbepaalde waarde is de tariefgroep voor liquidatie indicatief.` : ""}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `;
    return;
  }

  // ======================
  // RECHTBANK CIVIEL (default)
  // ======================
  const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";

  const g = isOnbepaald
    ? getGriffierechtRechtbankOnbepaald(partijType)
    : getGriffierechtRechtbank(vorderingSafe, partijType);

  const griffierecht = g.bedrag;

  const tarief = getTariefInfoRechtbank(vorderingSafe);
  const puntenGeliquideerd = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
  const salaris = puntenGeliquideerd * tarief.punt;

  const nak = calcNakosten({
    include: nakostenAan,
    betekening: betekeningAan,
    context: "civiel",
    salarisGeliquideerd: salaris
  });

  const totaal = griffierecht + salaris + explootKosten + nak.bedrag;

  document.getElementById("resultaat").innerHTML = `
    <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

    <strong>Specificatie (Rechtbank civiel)</strong><br>
    Griffierecht: ${euro(griffierecht)}<br>
    Salaris advocaat (liquidatietarief): ${euro(salaris)}<br>
    Explootkosten: ${euro(explootKosten)}<br>
    Nakosten: ${euro(nak.bedrag)}<br><br>

    <strong>Transparantie</strong><br>
    Tariefjaar: ${tariefSelect.value}<br>
    Waarde: ${isOnbepaald ? "Onbepaalde waarde" : "Geldvordering"}<br>
    Vordering: ${isOnbepaald ? "—" : euro(vorderingSafe)}<br>
    Griffierecht-band: ${g.bandLabel}<br>
    Liquidatietarief rechtbank: tarief ${tarief.name}, ${euro(tarief.punt)}/punt${tarief.maxPunten ? `, max ${tarief.maxPunten}` : ""}<br>
    Punten: ${punten} (geliquideerd: ${puntenGeliquideerd})<br>
    ${nak.uitleg}<br>
    ${isOnbepaald ? `<br><em>Let op:</em> bij onbepaalde waarde is de tariefgroep voor liquidatie indicatief.` : ""}<br><br>

    <em>Disclaimer:</em> indicatie; rechter kan afwijken.
  `;
});

// --------- Init + listeners ---------
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

  // Kanton extra velden tonen/verbergen
  if (gerechtSelect && kantonExtra) {
    const syncGerechtUI = () => {
      kantonExtra.style.display = gerechtSelect.value === "kanton" ? "block" : "none";
      syncWaardeUI();
    };
    gerechtSelect.addEventListener("change", syncGerechtUI);
    syncGerechtUI();
  }

  // Waarde-type UI sync
  if (waardeTypeEl) {
    waardeTypeEl.addEventListener("change", syncWaardeUI);
  }
  syncWaardeUI();
}

// wisselen tariefjaar
if (tariefSelect) {
  tariefSelect.addEventListener("change", async () => {
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
}

init();
