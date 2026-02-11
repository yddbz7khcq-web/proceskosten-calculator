// ======================
// Proceskosten Calculator
// Rechtbank civiel + Kanton + Hof (principaal + incidenteel)
// Nakosten + betekening
// Waarde-type (geld / onbepaalde waarde)
// ======================

const btn = document.getElementById("btnBereken");
const tariefSelect = document.getElementById("tariefset");
const gerechtSelect = document.getElementById("gerecht");

const kantonExtra = document.getElementById("kantonExtra");
const hofExtra = document.getElementById("hofExtra");

const waardeTypeEl = document.getElementById("waardeType");
const vorderingEl = document.getElementById("vordering");

const incidenteelEl = document.getElementById("incidenteel");
const incidenteelNoodzakelijkEl = document.getElementById("incidenteelNoodzakelijk");
const betekeningEl = document.getElementById("betekening");

let TARIEVEN = null;

// ======================
// Helpers
// ======================

function euro(n) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR"
  }).format(n);
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
  if (!res.ok) throw new Error("JSON niet gevonden.");
  return await res.json();
}

function getPunten() {
  const handmatig = document.getElementById("puntenHandmatig").value;
  if (handmatig !== "" && !Number.isNaN(Number(handmatig))) {
    return Number(handmatig);
  }

  return Array.from(document.querySelectorAll(".step"))
    .filter(cb => cb.checked)
    .reduce((sum, cb) => sum + Number(cb.dataset.points), 0);
}

function capNakosten(nakosten, salaris) {
  return Math.min(nakosten, 0.5 * salaris);
}

function syncUI() {
  const gerecht = gerechtSelect.value;

  if (kantonExtra) {
    kantonExtra.style.display = gerecht === "kanton" ? "block" : "none";
  }

  if (hofExtra) {
    hofExtra.style.display = gerecht === "hof" ? "block" : "none";
  }

  const isOnbepaald = waardeTypeEl?.value === "onbepaald";
  if (vorderingEl) {
    vorderingEl.disabled = gerecht !== "kanton" && isOnbepaald;
  }
}

// ======================
// Berekening
// ======================

btn.addEventListener("click", () => {

  showMelding("");

  if (!TARIEVEN) {
    showMelding("Tarieven niet geladen.");
    return;
  }

  const gerecht = gerechtSelect.value;
  const waardeType = waardeTypeEl?.value || "geld";
  const isOnbepaald = waardeType === "onbepaald";

  const vorderingRaw = vorderingEl.value;
  const vordering = vorderingRaw === "" ? 0 : Number(vorderingRaw);

  const punten = getPunten();
  const partijType = document.getElementById("partijType").value;

  const exploot = document.getElementById("exploot").checked;
  const nakostenAan = document.getElementById("nakosten").checked;
  const betekening = betekeningEl?.checked ?? false;

  const explootKosten = exploot ? (TARIEVEN.defaults?.exploot_schatting ?? 115) : 0;

  let griffierecht = 0;
  let salaris = 0;
  let salarisIncidenteel = 0;

  // ======================
  // RECHTBANK
  // ======================
  if (gerecht === "rechtbank_civiel") {

    if (!isOnbepaald && vorderingRaw === "") {
      showMelding("Vul de hoogte van de vordering in.");
      return;
    }

    const g = isOnbepaald
      ? { bedrag: partijType === "natuurlijk" ? 341 : partijType === "onvermogend" ? 93 : 735 }
      : getGriffierechtBand(vordering, partijType);

    griffierecht = g.bedrag;

    const tarief = getTariefInfoLiquidatie(vordering);
    const puntenGeliq = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
    salaris = puntenGeliq * tarief.punt;
  }

  // ======================
  // HOF
  // ======================
  if (gerecht === "hof") {

    if (!isOnbepaald && vorderingRaw === "") {
      showMelding("Vul de hoogte van de vordering in.");
      return;
    }

    const g = getGriffierechtHof(vordering, partijType, isOnbepaald);
    griffierecht = g.bedrag;

    const tarief = getTariefInfoHofPrincipaal(vordering);
    const puntenGeliq = tarief.maxPunten == null ? punten : Math.min(punten, tarief.maxPunten);
    salaris = puntenGeliq * tarief.punt;

    if (incidenteelEl?.checked && incidenteelNoodzakelijkEl?.checked) {
      salarisIncidenteel = 0.5 * salaris;
    }
  }

  // ======================
  // KANTON
  // ======================
  if (gerecht === "kanton") {

    const valueType = document.getElementById("kantonSoort").value;

    const g = getGriffierechtKanton(vordering, valueType);
    griffierecht = g.bedrag;

    const liq = getLiquidatieKanton(vordering, valueType);

    if (liq.type === "range") {
      salaris = pickRangeValue(liq.min, liq.max);
    } else {
      salaris = liq.salaris;
    }
  }

  // ======================
  // Nakosten
  // ======================
  let nakosten = 0;

  if (nakostenAan) {
    if (gerecht === "kanton") {
      nakosten = TARIEVEN.liquidatie_kanton?.nakosten_max ?? 144;
    } else {
      nakosten = TARIEVEN.defaults?.nakosten_schatting ?? 135;
      if (betekening) nakosten += 98;
      nakosten = capNakosten(nakosten, salaris + salarisIncidenteel);
    }
  }

  const totaal = griffierecht + salaris + salarisIncidenteel + explootKosten + nakosten;

  document.getElementById("resultaat").innerHTML = `
    <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

    Griffierecht: ${euro(griffierecht)}<br>
    Salaris principaal: ${euro(salaris)}<br>
    Salaris incidenteel: ${euro(salarisIncidenteel)}<br>
    Explootkosten: ${euro(explootKosten)}<br>
    Nakosten: ${euro(nakosten)}<br><br>

    <em>Indicatief; rechter kan afwijken.</em>
  `;
});

// ======================
// Init
// ======================

async function init() {
  try {
    TARIEVEN = await loadTarieven(tariefSelect.value);
    setTarievenInfo();
  } catch (e) {
    showMelding("Kan tarieven niet laden.");
    console.error(e);
  }

  syncUI();
}

gerechtSelect.addEventListener("change", syncUI);
waardeTypeEl?.addEventListener("change", syncUI);

tariefSelect.addEventListener("change", async () => {
  TARIEVEN = await loadTarieven(tariefSelect.value);
  setTarievenInfo();
});

init();
