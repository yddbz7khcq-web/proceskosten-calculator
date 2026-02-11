// ======================
// Proceskosten calculator (Rechtbank civiel + Kanton + Hof principaal)
// Verwacht in data/tarieven-YYYY.json o.a. deze keys:
// - griffierecht_civiel_rechtbank
// - liquidatietarief_rechtbank
// - griffierecht_kanton
// - liquidatie_kanton
// - griffierecht_hof_civiel
// - liquidatietarief_hof_principaal
// - defaults (exploot_schatting, nakosten_schatting)  [optioneel maar handig]
// ======================

// --------- Elementen & state ---------
const btn = document.getElementById("btnBereken");
const tariefSelect = document.getElementById("tariefset");
const gerechtSelect = document.getElementById("gerecht");      // rechtbank_civiel | kanton | hof
const kantonExtra = document.getElementById("kantonExtra");    // kanton-only block (kan ontbreken)

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

  // Onbepaalde waarde -> laagste band
  if (valueType === "onbepaald") {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: "Onbepaalde waarde / laagste schijf" };
  }

  // Ontruiming/overig -> hier ook laagste schijf (simpele default)
  if (valueType === "ontruiming" || valueType === "overig") {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: "Kanton (default): laagste schijf" };
  }

  // Geldvordering: schijven
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
  const niveau = document.getElementById("onbepaaldNiveau")?.value || "gemiddeld"; // laag/gemiddeld/hoog
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

  // onbepaalde waarde -> eerste band
  if (isOnbepaald) {
    const b0 = bands[0];
    return { bedrag: b0[key], bandLabel: b0.label || "Onbepaalde waarde", note: b0.note || "" };
  }

  for (const b of bands) {
    if (b.max === null || vordering <= b.max) {
      // speciale regel: natuurlijke persoon > 1.000.000 valt terug naar band tot 1.000.000
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
// Main click: bereken
// ======================
btn.addEventListener("click", () => {
  showMelding("");

  if (!TARIEVEN) {
    showMelding("Tarieven zijn nog niet geladen (JSON ontbreekt of heeft een fout).");
    return;
  }

  const gerecht = gerechtSelect?.value || "rechtbank_civiel";

  const vorderingRaw = document.getElementById("vordering")?.value ?? "";
  const vordering = Number(vorderingRaw);

  // Validatie: vordering
  if (vorderingRaw === "") {
    showMelding("Vul de hoogte van de vordering in.");
    return;
  }
  if (!Number.isFinite(vordering) || vordering < 0) {
    showMelding("Vul een geldig bedrag in (0 of hoger).");
    return;
  }
  if (vordering > 1_000_000_000) {
    showMelding("Dit bedrag is wel héél hoog. Controleer of je geen typefout hebt gemaakt.");
  }

  // Punten
  const punten = getPunten();
  if (!Number.isFinite(punten) || punten < 0) {
    showMelding("Punten moeten 0 of hoger zijn.");
    return;
  }

  // Overige posten (optioneel)
  const explootAan = document.getElementById("exploot")?.checked ?? false;
  const nakostenAan = document.getElementById("nakosten")?.checked ?? false;

  const explootKosten = explootAan ? (TARIEVEN.defaults?.exploot_schatting ?? 115) : 0;

  // ======================
  // KANTON
  // ======================
  if (gerecht === "kanton") {
    const valueType = document.getElementById("kantonSoort")?.value || "geld";

    const g = getGriffierechtKanton(vordering, valueType);
    const griffierecht = g.bedrag;

    const liq = getLiquidatieKanton(vordering, valueType);

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

    const nakostenBedrag = nakostenAan ? (TARIEVEN.liquidatie_kanton.nakosten_max ?? 0) : 0;
    const totaal = griffierecht + salaris + explootKosten + nakostenBedrag;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Kanton)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris gemachtigde (liquidatie): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakostenBedrag)}<br><br>

      <strong>Transparantie</strong><br>
      Tariefjaar: ${tariefSelect.value}<br>
      Vordering: ${euro(vordering)}<br>
      Griffierecht-band: ${g.bandLabel}<br>
      ${liqUitleg}<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `;
    return;
  }

  // ======================
  // HOF (principaal)
  // ======================
  if (gerecht === "hof") {
    const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";

    // (Later voegen we UI toe voor onbepaalde waarde; nu default: false)
    const g = getGriffierechtHof(vordering, partijType, false);
    const griffierecht = g.bedrag;

    const tarief = getTariefInfoHofPrincipaal(vordering);
    const puntenGeliquideerd = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
    const salaris = puntenGeliquideerd * tarief.punt;

    const nakostenBedrag = nakostenAan ? (TARIEVEN.defaults?.nakosten_schatting ?? 135) : 0;
    const totaal = griffierecht + salaris + explootKosten + nakostenBedrag;

    document.getElementById("resultaat").innerHTML = `
      <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

      <strong>Specificatie (Hof – principaal)</strong><br>
      Griffierecht: ${euro(griffierecht)}<br>
      Salaris advocaat (liquidatietarief): ${euro(salaris)}<br>
      Explootkosten: ${euro(explootKosten)}<br>
      Nakosten: ${euro(nakostenBedrag)}<br><br>

      <strong>Transparantie</strong><br>
      Tariefjaar: ${tariefSelect.value}<br>
      Vordering: ${euro(vordering)}<br>
      Griffierecht-band: ${g.bandLabel}${g.note ? `<br><em>Let op:</em> ${g.note}` : ""}<br>
      Liquidatietarief hof: tarief ${tarief.name}, ${euro(tarief.punt)}/punt${tarief.maxPunten ? `, max ${tarief.maxPunten}` : ""}<br>
      Punten: ${punten} (geliquideerd: ${puntenGeliquideerd})<br><br>

      <em>Disclaimer:</em> indicatie; rechter kan afwijken.
    `;
    return;
  }

  // ======================
  // RECHTBANK CIVIEL (default)
  // ======================
  const partijType = document.getElementById("partijType")?.value || "niet_natuurlijk";

  const g = getGriffierechtRechtbank(vordering, partijType);
  const griffierecht = g.bedrag;

  const tarief = getTariefInfoRechtbank(vordering);
  const puntenGeliquideerd = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
  const salaris = puntenGeliquideerd * tarief.punt;

  const nakostenBedrag = nakostenAan ? (TARIEVEN.defaults?.nakosten_schatting ?? 135) : 0;
  const totaal = griffierecht + salaris + explootKosten + nakostenBedrag;

  document.getElementById("resultaat").innerHTML = `
    <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

    <strong>Specificatie (Rechtbank civiel)</strong><br>
    Griffierecht: ${euro(griffierecht)}<br>
    Salaris advocaat (liquidatietarief): ${euro(salaris)}<br>
    Explootkosten: ${euro(explootKosten)}<br>
    Nakosten: ${euro(nakostenBedrag)}<br><br>

    <strong>Transparantie</strong><br>
    Tariefjaar: ${tariefSelect.value}<br>
    Vordering: ${euro(vordering)}<br>
    Griffierecht-band: ${g.bandLabel}<br>
    Liquidatietarief rechtbank: tarief ${tarief.name}, ${euro(tarief.punt)}/punt${tarief.maxPunten ? `, max ${tarief.maxPunten}` : ""}<br>
    Punten: ${punten} (geliquideerd: ${puntenGeliquideerd})<br><br>

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
    const sync = () => {
      kantonExtra.style.display = gerechtSelect.value === "kanton" ? "block" : "none";
    };
    gerechtSelect.addEventListener("change", sync);
    sync();
  }
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
