const btn = document.getElementById("btnBereken");
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

btn.addEventListener("click", () => {
  showMelding("");

  if (!TARIEVEN) {
    showMelding("Tarieven zijn nog niet geladen. Open via GitHub Pages of een lokale webserver.");
    return;
  }

  const vorderingRaw = document.getElementById("vordering").value;
  const vordering = Number(vorderingRaw);
  const partijType = document.getElementById("partijType").value;

  // Validatie
  if (vorderingRaw === "") {
    showMelding("Vul de hoogte van de vordering in.");
    return;
  }
  if (!Number.isFinite(vordering) || vordering <= 0) {
    showMelding("Vul een positief getal in voor de vordering.");
    return;
  }
  if (vordering > 1_000_000_000) {
    showMelding("Dit bedrag is wel héél hoog. Check of je geen typefout hebt gemaakt.");
  }

  const punten = getPunten();
  if (!Number.isFinite(punten) || punten < 0) {
    showMelding("Punten moeten 0 of hoger zijn.");
    return;
  }

  const exploot = document.getElementById("exploot").checked;
  const nakosten = document.getElementById("nakosten").checked;

  // Griffierecht
  const g = getGriffierechtBand(vordering, partijType);
  const griffierecht = g.bedrag;

  // Liquidatie
  const tarief = getTariefInfoLiquidatie(vordering);
  const maxPunten = tarief.maxPunten;
  const puntenGeliquideerd = maxPunten == null ? punten : Math.min(punten, maxPunten);
  const salaris = puntenGeliquideerd * tarief.punt;

  // Overige posten (indicatief)
  const explootKosten = exploot ? TARIEVEN.defaults.exploot_schatting : 0;
  const nakostenBedrag = nakosten ? TARIEVEN.defaults.nakosten_schatting : 0;

  const totaal = griffierecht + salaris + explootKosten + nakostenBedrag;

  const partijLabel =
    partijType === "onvermogend" ? "Onvermogend" :
    partijType === "natuurlijk" ? "Natuurlijke persoon" :
    "Niet-natuurlijke persoon";

  const maxTxt = maxPunten == null ? "geen max" : `max ${maxPunten}`;

  const noteTxt = g.note ? `<br><em>Let op:</em> ${g.note}` : "";

  document.getElementById("resultaat").innerHTML = `
    <strong>Totaal (indicatie):</strong> ${euro(totaal)}<br><br>

    <strong>Specificatie</strong><br>
    Griffierecht: ${euro(griffierecht)}<br>
    Salaris advocaat (liquidatietarief): ${euro(salaris)}<br>
    Explootkosten: ${euro(explootKosten)}<br>
    Nakosten: ${euro(nakostenBedrag)}<br><br>

    <strong>Transparantie</strong><br>
    Tariefjaar: ${tariefSelect.value}<br>
    Vordering: ${euro(vordering)}<br>
    Partij: ${partijLabel}<br>
    Griffierecht-band: ${g.bandLabel}${noteTxt}<br>
    Liquidatietarief: tarief ${tarief.name}, ${euro(tarief.punt)}/punt, ${maxTxt}<br>
    Punten: ${punten} (geliquideerd: ${puntenGeliquideerd})<br><br>

    <em>Disclaimer:</em> indicatie. Rechter kan afwijken; exploot/nakosten hangen af van de concrete situatie.
  `;
});

init();

