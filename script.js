// ======================
// Elementen & state
// ======================
const btn = document.getElementById("btnBereken");
const tariefSelect = document.getElementById("tariefset");

const gerechtSelect = document.getElementById("gerecht");      // optioneel (als je dit al in index.html hebt gezet)
const kantonExtra = document.getElementById("kantonExtra");    // optioneel

let TARIEVEN = null;

// ======================
// Helpers (UI)
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

// ======================
// Laden tarieven
// ======================
async function loadTarieven(jaar) {
  const res = await fetch(`data/tarieven-${jaar}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Kan tarieven-${jaar}.json niet laden (HTTP ${res.status}).`);
  return await res.json();
}

async function init() {
  try {
    TARIEVEN = await loadTarieven(tariefSelect.value);
    setTarievenInfo();
  } catch (e) {
    showMelding(`Ik kan de tarieven niet laden: ${e?.message || e}`);
    console.error(e);
  }

  // UI toggle voor kanton extra's (als aanwezig)
  if (gerechtSelect && kantonExtra) {
    const sync = () => {
      kantonExtra.style.display = gerechtSelect.value === "kanton" ? "block" : "none";
    };
    gerechtSelect.addEventListener("change", sync);
    sync();
  }
}

// Wisselen tariefjaar
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

// ======================
// Punten
// ======================
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
// Rechtbank civiel (griffierecht + liquidatietarief)
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
// Kanton (griffierecht + liquidatie kanton)
// Vereist dat je JSON keys hebt:
// - TARIEVEN.griffierecht_kanton.bands[]
// - TARIEVEN.liquidatie_kanton.money_bands[]
// - TARIEVEN.liquidatie_kanton.specials.*
// - TARIEVEN.liquidatie_kanton.nakosten_max
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

  // Ontruiming/overig: hier ook laagste schijf (eenvoudige default)
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
  const niveau = document.getElementById("onbepaaldNiveau")?.value || "gemiddeld";
  if (niveau === "laag") return min;
  if (niveau === "hoog") return max;
  return Math.round((min + max) / 2);
}

// ======================
// Klik: bereken
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

  // basis validatie
  if (vorderingRaw === "") {
    showMelding("Vul de hoogte van de vordering in.");
    return;
  }
  if (!Number.isFinite(vordering) || vordering < 0) {
    showMelding("Vul een geldig bedrag in (0 of hoger).");
    return;
  }

  const punten = getPunten();
  if (!Number.isFinite(punten) || punten < 0) {
    showMelding("Punten moeten 0 of hoger zijn.");
    return;
  }

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

    const nakostenBedrag = nakostenAan ? TARIEVEN.liquidatie_kanton.nakosten_max : 0;

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
  // RECHTBANK CIVIEL
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
    Liquidatietarief: tarief ${tarief.name}, ${euro(tarief.punt)}/punt${tarief.maxPunten ? `, max ${tarief.maxPunten}` : ""}<br>
    Punten: ${punten} (geliquideerd: ${puntenGeliquideerd})<br><br>

    <em>Disclaimer:</em> indicatie; rechter kan afwijken.
  `;
});

// Start
init();
