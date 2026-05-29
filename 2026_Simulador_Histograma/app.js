const DEFAULT_CATEGORIES = [
  "Expediente incompleto",
  "Error de registro",
  "Falta de firma",
  "Información incorrecta",
  "Sistema no disponible",
  "Reproceso",
  "Otro"
];

const state = {
  categories: [...DEFAULT_CATEGORIES],
  incidents: [],
  paretoReady: false
};

const palette = ["#0f73b7", "#18a66a", "#35a7d7", "#8fd14f", "#125f88", "#55c7a3", "#7ea7c5", "#0d8050"];
let barChart;
let pieChart;

const $ = (id) => document.getElementById(id);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => box.classList.remove("show"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function countByCategory() {
  const counts = Object.fromEntries(state.categories.map((category) => [category, 0]));
  for (const incident of state.incidents) {
    counts[incident.category] = (counts[incident.category] || 0) + 1;
  }
  return counts;
}

function sortedCounts(includeZeros = true) {
  const counts = countByCategory();
  return Object.entries(counts)
    .filter(([, count]) => includeZeros || count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
}

function analysis() {
  const total = state.incidents.length;
  const nonZero = sortedCounts(false);
  const top = nonZero[0] || null;
  const low = nonZero.length ? [...nonZero].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "es"))[0] : null;
  const share = total && top ? Math.round((top[1] / total) * 100) : 0;
  return { total, top, low, share };
}

function renderCategories() {
  const list = $("categoryList");
  list.innerHTML = "";
  for (const category of state.categories) {
    const pill = document.createElement("div");
    pill.className = "category-pill";
    pill.innerHTML = `
      <span>${category}</span>
      <button class="mini-button" type="button" title="Editar categoría" aria-label="Editar ${category}">
        <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="mini-button danger" type="button" title="Eliminar categoría" aria-label="Eliminar ${category}">
        <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      </button>
    `;
    const [editButton, deleteButton] = pill.querySelectorAll("button");
    editButton.addEventListener("click", () => editCategory(category));
    deleteButton.addEventListener("click", () => deleteCategory(category));
    list.appendChild(pill);
  }

  const select = $("incidentCategory");
  select.innerHTML = state.categories.map((category) => `<option value="${category}">${category}</option>`).join("");
}

function renderIncidents() {
  const tbody = $("incidentTable");
  tbody.innerHTML = state.incidents.length
    ? state.incidents.map((incident, index) => `
      <tr>
        <td>${incident.date}</td>
        <td>${incident.time}</td>
        <td>${incident.category}</td>
        <td>${incident.note || "Sin observación"}</td>
        <td><button class="mini-button danger" type="button" data-delete-incident="${index}" title="Eliminar registro" aria-label="Eliminar registro">
          <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button></td>
      </tr>`).join("")
    : `<tr><td colspan="5">Aún no hay incidencias registradas.</td></tr>`;

  tbody.querySelectorAll("[data-delete-incident]").forEach((button) => {
    button.addEventListener("click", () => {
      state.incidents.splice(Number(button.dataset.deleteIncident), 1);
      state.paretoReady = false;
      renderAll();
    });
  });
}

function renderSummary() {
  const counts = sortedCounts();
  $("summaryTable").innerHTML = counts.map(([category, count]) => `<tr><td>${category}</td><td>${count}</td></tr>`).join("");

  const data = analysis();
  $("totalIncidents").textContent = data.total;
  $("topCategory").textContent = data.top ? `${data.top[0]} (${data.top[1]})` : "Sin datos";
  $("lowCategory").textContent = data.low ? `${data.low[0]} (${data.low[1]})` : "Sin datos";
  $("metricTotal").textContent = data.total;
  $("metricCategories").textContent = state.categories.length;
  $("metricTop").textContent = data.top ? data.top[0] : "Sin datos";
  $("metricShare").textContent = `${data.share}%`;
}

function renderCharts() {
  const counts = sortedCounts();
  const labels = counts.map(([category]) => category);
  const values = counts.map(([, count]) => count);
  const chartColors = labels.map((_, index) => palette[index % palette.length]);

  // Chart.js se carga por CDN. Si la red del aula bloquea el CDN,
  // el simulador sigue funcionando y muestra el resto del análisis.
  if (typeof Chart === "undefined") {
    document.querySelectorAll(".chart-panel").forEach((panel) => {
      panel.innerHTML = "<p>Los gráficos requieren conexión al CDN de Chart.js.</p>";
    });
    return;
  }

  if (!barChart) {
    barChart = new Chart($("barChart"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Frecuencia", data: values, backgroundColor: chartColors, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  } else {
    barChart.data.labels = labels;
    barChart.data.datasets[0].data = values;
    barChart.data.datasets[0].backgroundColor = chartColors;
    barChart.update();
  }

  if (!pieChart) {
    pieChart = new Chart($("pieChart"), {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: chartColors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, cutout: "58%" }
    });
  } else {
    pieChart.data.labels = labels;
    pieChart.data.datasets[0].data = values;
    pieChart.data.datasets[0].backgroundColor = chartColors;
    pieChart.update();
  }
}

function renderInterpretation() {
  const data = analysis();
  const process = $("processName").value.trim() || "el proceso observado";
  if (!data.total || !data.top) {
    $("autoConclusion").textContent = "Registra incidencias o carga el caso de estudio para generar conclusiones automáticas.";
    return;
  }
  $("autoConclusion").textContent = `Durante el periodo analizado se registraron ${data.total} incidencias en ${process}. La categoría más frecuente fue "${data.top[0]}", con ${data.top[1]} casos y una participación aproximada de ${data.share}%. Se recomienda priorizar acciones de mejora sobre esta categoría y usar estos datos para preparar un Diagrama de Pareto.`;
}

function renderPareto() {
  const tbody = $("paretoTable");
  if (!state.paretoReady) {
    tbody.innerHTML = `<tr><td colspan="4">Presiona "Generar datos para Pareto" para preparar la tabla.</td></tr>`;
    return;
  }
  const total = state.incidents.length;
  let cumulative = 0;
  tbody.innerHTML = sortedCounts(false).map(([category, count]) => {
    const percent = total ? (count / total) * 100 : 0;
    cumulative += percent;
    return `<tr><td>${category}</td><td>${count}</td><td>${percent.toFixed(1)}%</td><td>${Math.min(cumulative, 100).toFixed(1)}%</td></tr>`;
  }).join("") || `<tr><td colspan="4">No hay incidencias para preparar Pareto.</td></tr>`;
}

function renderAll() {
  renderCategories();
  renderIncidents();
  renderSummary();
  renderCharts();
  renderInterpretation();
  renderPareto();
  persistDraft();
}

function addCategory() {
  const input = $("categoryInput");
  const value = input.value.trim();
  if (!value) return toast("Escribe una categoría antes de agregarla.");
  if (state.categories.some((category) => category.toLowerCase() === value.toLowerCase())) {
    return toast("Esa categoría ya existe.");
  }
  state.categories.push(value);
  input.value = "";
  renderAll();
}

function editCategory(oldValue) {
  const nextValue = window.prompt("Editar categoría:", oldValue)?.trim();
  if (!nextValue || nextValue === oldValue) return;
  if (state.categories.some((category) => category !== oldValue && category.toLowerCase() === nextValue.toLowerCase())) {
    return toast("Ya existe una categoría con ese nombre.");
  }
  state.categories = state.categories.map((category) => category === oldValue ? nextValue : category);
  state.incidents = state.incidents.map((incident) => incident.category === oldValue ? { ...incident, category: nextValue } : incident);
  state.paretoReady = false;
  renderAll();
}

function deleteCategory(category) {
  const hasIncidents = state.incidents.some((incident) => incident.category === category);
  const message = hasIncidents
    ? `La categoría "${category}" tiene registros. Si la eliminas, también se eliminarán esas incidencias.`
    : `¿Eliminar la categoría "${category}"?`;
  if (!window.confirm(message)) return;
  state.categories = state.categories.filter((item) => item !== category);
  state.incidents = state.incidents.filter((incident) => incident.category !== category);
  state.paretoReady = false;
  renderAll();
}

function registerIncident(event) {
  event.preventDefault();
  if (!state.categories.length) return toast("Agrega al menos una categoría para registrar incidencias.");
  state.incidents.unshift({
    date: $("incidentDate").value,
    time: $("incidentTime").value,
    category: $("incidentCategory").value,
    note: $("incidentNote").value.trim()
  });
  $("incidentNote").value = "";
  state.paretoReady = false;
  renderAll();
  toast("Incidencia registrada.");
}

function loadCaseStudy() {
  $("processName").value = "Atención de trámites ciudadanos";
  $("ownerName").value = "Equipo de mejora continua";
  $("startDate").value = today();
  $("endDate").value = today();
  $("objective").value = "Identificar las incidencias más frecuentes durante la atención.";
  state.categories = [...DEFAULT_CATEGORIES];

  const distribution = {
    "Expediente incompleto": 15,
    "Error de registro": 10,
    "Falta de firma": 7,
    "Información incorrecta": 9,
    "Sistema no disponible": 6,
    "Reproceso": 8,
    "Otro": 3
  };
  const notes = {
    "Expediente incompleto": "Faltan documentos requeridos.",
    "Error de registro": "Dato capturado con formato incorrecto.",
    "Falta de firma": "Solicitud sin validación del ciudadano.",
    "Información incorrecta": "Documento contiene datos inconsistentes.",
    "Sistema no disponible": "Interrupción temporal de plataforma.",
    "Reproceso": "Se repite validación por corrección previa.",
    "Otro": "Incidencia no clasificada."
  };
  state.incidents = [];
  let index = 0;
  for (const [category, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i += 1) {
      const hour = String(8 + (index % 9)).padStart(2, "0");
      const minute = String((index * 7) % 60).padStart(2, "0");
      state.incidents.push({ date: today(), time: `${hour}:${minute}`, category, note: notes[category] });
      index += 1;
    }
  }
  state.paretoReady = true;
  renderAll();
  toast("Caso de estudio cargado con 58 incidencias.");
}

function generatePareto() {
  state.paretoReady = true;
  renderPareto();
  toast("Datos de Pareto preparados.");
}

function exportExcel() {
  const summaryRows = sortedCounts().map(([category, count]) => `<tr><td>${escapeHtml(category)}</td><td>${count}</td></tr>`).join("");
  const incidentRows = state.incidents.map((incident) => `<tr><td>${escapeHtml(incident.date)}</td><td>${escapeHtml(incident.time)}</td><td>${escapeHtml(incident.category)}</td><td>${escapeHtml(incident.note)}</td></tr>`).join("");
  const html = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>Simulador de Hoja de Control</h1>
        <table border="1">
          <tr><th>Proceso</th><td>${escapeHtml($("processName").value)}</td></tr>
          <tr><th>Responsable</th><td>${escapeHtml($("ownerName").value)}</td></tr>
          <tr><th>Fecha inicio</th><td>${escapeHtml($("startDate").value)}</td></tr>
          <tr><th>Fecha fin</th><td>${escapeHtml($("endDate").value)}</td></tr>
          <tr><th>Objetivo</th><td>${escapeHtml($("objective").value)}</td></tr>
        </table>
        <h2>Hoja de control</h2>
        <table border="1"><tr><th>Categoría</th><th>Frecuencia</th></tr>${summaryRows}</table>
        <h2>Histórico de incidencias</h2>
        <table border="1"><tr><th>Fecha</th><th>Hora</th><th>Categoría</th><th>Observación</th></tr>${incidentRows}</table>
      </body>
    </html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadBlob(blob, "hoja-control-resultados.xls");
}

function exportPdf() {
  // La opción más compatible sin librerías adicionales es abrir el diálogo de impresión,
  // desde donde el navegador permite guardar como PDF.
  window.print();
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function persistDraft() {
  const payload = {
    categories: state.categories,
    incidents: state.incidents,
    paretoReady: state.paretoReady,
    form: {
      processName: $("processName").value,
      ownerName: $("ownerName").value,
      startDate: $("startDate").value,
      endDate: $("endDate").value,
      objective: $("objective").value
    },
    dark: document.body.classList.contains("dark")
  };
  localStorage.setItem("checkSheetSimulator", JSON.stringify(payload));
}

function loadDraft() {
  const saved = localStorage.getItem("checkSheetSimulator");
  if (!saved) return false;
  try {
    const payload = JSON.parse(saved);
    state.categories = Array.isArray(payload.categories) ? payload.categories : [...DEFAULT_CATEGORIES];
    state.incidents = Array.isArray(payload.incidents) ? payload.incidents : [];
    state.paretoReady = Boolean(payload.paretoReady);
    for (const [key, value] of Object.entries(payload.form || {})) {
      if ($(key)) $(key).value = value;
    }
    document.body.classList.toggle("dark", Boolean(payload.dark));
    return true;
  } catch {
    return false;
  }
}

function resetSimulation() {
  if (!window.confirm("¿Reiniciar la simulación y borrar los datos actuales?")) return;
  state.categories = [...DEFAULT_CATEGORIES];
  state.incidents = [];
  state.paretoReady = false;
  ["processName", "ownerName", "objective"].forEach((id) => ($(id).value = ""));
  $("startDate").value = today();
  $("endDate").value = today();
  localStorage.removeItem("checkSheetSimulator");
  renderAll();
  toast("Simulación reiniciada.");
}

function bindEvents() {
  $("addCategory").addEventListener("click", addCategory);
  $("categoryInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") addCategory();
  });
  $("incidentForm").addEventListener("submit", registerIncident);
  $("generatePareto").addEventListener("click", generatePareto);
  $("loadCase").addEventListener("click", loadCaseStudy);
  $("loadCaseHero").addEventListener("click", loadCaseStudy);
  $("exportExcel").addEventListener("click", exportExcel);
  $("exportPdf").addEventListener("click", exportPdf);
  $("printHero").addEventListener("click", () => window.print());
  $("saveSession").addEventListener("click", () => {
    persistDraft();
    toast("Sesión guardada en este navegador.");
  });
  $("resetSimulation").addEventListener("click", resetSimulation);
  $("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    persistDraft();
  });
  $("helpToggle").addEventListener("click", () => {
    document.body.classList.toggle("show-help");
    toast(document.body.classList.contains("show-help") ? "Ayuda contextual activada." : "Ayuda contextual desactivada.");
  });
  document.querySelectorAll(".help-chip").forEach((button) => {
    button.addEventListener("click", () => toast(button.dataset.help));
  });
  ["processName", "ownerName", "startDate", "endDate", "objective"].forEach((id) => {
    $(id).addEventListener("input", () => {
      renderInterpretation();
      persistDraft();
    });
  });
}

function init() {
  $("startDate").value = today();
  $("endDate").value = today();
  $("incidentDate").value = today();
  $("incidentTime").value = currentTime();
  bindEvents();
  loadDraft();
  renderAll();
}

init();
