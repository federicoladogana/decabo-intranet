import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, setDoc, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let authUser = null;
onAuthStateChanged(auth, function (user) { authUser = user; });
signInAnonymously(auth).catch(function (err) { console.error("Errore di accesso:", err); });

const EDIT_PASSWORD = "0079";
let unlocked = false;

let procedures = [];
let tools = [];
let links = [];
let forms = [];
let pcRows = [];
let procPage = 0;
const PROC_PAGE_SIZE = 3;
let searchQuery = "";
let pcSort = { key: null, dir: 1 };

const saveTimers = new Map();
function debouncedUpdate(colName, id, field, value, delay) {
  const key = colName + "/" + id + "/" + field;
  clearTimeout(saveTimers.get(key));
  const t = setTimeout(function () {
    updateDoc(doc(db, colName, id), fieldObj(field, value)).catch(function (e) { console.error(e); });
  }, delay || 500);
  saveTimers.set(key, t);
}
function fieldObj(field, value) { const o = {}; o[field] = value; return o; }

function touchMeta() {
  setDoc(doc(db, "meta", "settings"), { updatedAt: serverTimestamp() }, { merge: true }).catch(function () {});
}

function formatDate(d) {
  var months = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  return d.getDate() + " " + months[d.getMonth()];
}

/* ---------------- Realtime listeners ---------------- */

onSnapshot(query(collection(db, "procedures"), orderBy("order")), function (snap) {
  procedures = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  renderProcedures();
  updateStats();
});

onSnapshot(query(collection(db, "tools"), orderBy("order")), function (snap) {
  tools = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  renderTools();
  updateStats();
});

onSnapshot(query(collection(db, "links"), orderBy("order")), function (snap) {
  links = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  renderLinksList();
  renderLinksAgenda();
  updateStats();
});

onSnapshot(query(collection(db, "forms"), orderBy("order")), function (snap) {
  forms = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  renderForms();
  updateStats();
});

onSnapshot(query(collection(db, "pcRows"), orderBy("order")), function (snap) {
  pcRows = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
  renderPcTable();
});

onSnapshot(doc(db, "meta", "settings"), function (snap) {
  var el = document.getElementById("stat-updated");
  if (snap.exists() && snap.data().updatedAt) {
    el.textContent = formatDate(snap.data().updatedAt.toDate());
  } else {
    el.textContent = "—";
  }
});

function updateStats() {
  document.getElementById("stat-proc").textContent = procedures.length;
  document.getElementById("stat-tools").textContent = tools.length;
  document.getElementById("stat-links").textContent = links.length;
  document.getElementById("stat-forms").textContent = forms.length;
}

function isEditingWithin(container) {
  var active = document.activeElement;
  return !!(active && container && container.contains(active) && active !== container);
}

/* ---------------- Strumenti ---------------- */

function renderTools() {
  var grid = document.getElementById("tool-grid");
  if (isEditingWithin(grid)) return;
  grid.innerHTML = "";
  var q = searchQuery;
  tools.forEach(function (t) {
    if (q && !((t.name || "") + " " + (t.sub || "")).toLowerCase().includes(q)) return;
    var card = document.createElement("div");
    card.className = "tool";
    card.dataset.id = t.id;

    var row = document.createElement("div");
    row.className = "tool-row";

    var mark = document.createElement("span");
    mark.className = "tool-mark";
    mark.contentEditable = unlocked ? "true" : "false";
    mark.textContent = t.mark || "";
    mark.addEventListener("blur", function () { debouncedUpdate("tools", t.id, "mark", mark.textContent.trim(), 0); touchMeta(); });
    mark.addEventListener("keydown", function (e) { if (e.key === "Enter") e.preventDefault(); });
    row.appendChild(mark);

    var body = document.createElement("span");
    body.className = "tool-body";
    var nameInput = fieldInput("text", t.name || "", "Nome strumento");
    nameInput.addEventListener("input", function () { debouncedUpdate("tools", t.id, "name", nameInput.value); touchMeta(); });
    var subInput = fieldInput("text", t.sub || "", "Descrizione breve");
    subInput.className += " tool-sub";
    subInput.addEventListener("input", function () { debouncedUpdate("tools", t.id, "sub", subInput.value); touchMeta(); });
    nameInput.className += " tool-name";
    body.appendChild(nameInput);
    body.appendChild(subInput);
    row.appendChild(body);

    var actions = document.createElement("span");
    actions.className = "tool-actions";
    var delBtn = iconButton("×", "Elimina strumento", "del-btn");
    delBtn.addEventListener("click", function () { if (confirm("Eliminare questo strumento?")) deleteDoc(doc(db, "tools", t.id)).then(touchMeta); });
    actions.appendChild(delBtn);
    var openA = document.createElement("a");
    openA.className = "open-link";
    openA.target = "_blank";
    openA.rel = "noopener";
    openA.textContent = "Apri ↗";
    if (t.link) openA.href = t.link; else openA.style.display = "none";
    actions.appendChild(openA);
    row.appendChild(actions);

    card.appendChild(row);

    var linkInput = fieldInput("url", t.link || "", "Link (https://…)");
    linkInput.className += " tool-link";
    linkInput.addEventListener("input", function () {
      debouncedUpdate("tools", t.id, "link", linkInput.value);
      openA.href = linkInput.value || "#";
      openA.style.display = linkInput.value ? "" : "none";
      touchMeta();
    });
    card.appendChild(linkInput);

    setReadonly(nameInput, subInput, linkInput);
    grid.appendChild(card);
  });
}

document.getElementById("add-tool").addEventListener("click", function () {
  addDoc(collection(db, "tools"), { mark: "XX", name: "", sub: "", link: "", order: Date.now() }).then(touchMeta);
});

/* ---------------- Procedure ---------------- */

var STATUS_ORDER = [
  { cls: "chip-ok", value: "ok", label: "Aggiornata" },
  { cls: "chip-warn", value: "warn", label: "Da rivedere" },
  { cls: "chip-crit", value: "crit", label: "Urgente" }
];

function statusInfo(value) {
  return STATUS_ORDER.find(function (s) { return s.value === value; }) || STATUS_ORDER[0];
}

var expandedProcId = null;
var backdrop = document.getElementById("proc-backdrop");

function renderProcedures() {
  var list = document.getElementById("proc-list");
  if (isEditingWithin(list)) return;

  var q = searchQuery;
  var matching = procedures.filter(function (p) {
    if (!q) return true;
    var text = ((p.title || "") + " " + (p.desc || "") + " " + (p.dept || "") + " " + (p.bodyHtml || "")).toLowerCase();
    return text.includes(q);
  });

  var totalPages = Math.max(1, Math.ceil(matching.length / PROC_PAGE_SIZE));
  if (procPage >= totalPages) procPage = totalPages - 1;
  if (procPage < 0) procPage = 0;
  document.getElementById("proc-page-indicator").textContent = (matching.length === 0 ? 0 : procPage + 1) + "/" + totalPages;
  document.getElementById("proc-prev").disabled = procPage <= 0;
  document.getElementById("proc-next").disabled = procPage >= totalPages - 1;

  var pageItems = matching.slice(procPage * PROC_PAGE_SIZE, procPage * PROC_PAGE_SIZE + PROC_PAGE_SIZE);

  list.innerHTML = "";
  var emptyState = document.getElementById("empty-state");
  emptyState.style.display = (q && matching.length === 0) ? "block" : "none";

  pageItems.forEach(function (p) { list.appendChild(buildProcCard(p)); });

  if (expandedProcId && !procedures.some(function (p) { return p.id === expandedProcId; })) {
    expandedProcId = null;
    backdrop.hidden = true;
  }
}

document.getElementById("proc-prev").addEventListener("click", function () { procPage--; renderProceduresForce(); });
document.getElementById("proc-next").addEventListener("click", function () { procPage++; renderProceduresForce(); });
function renderProceduresForce() {
  var list = document.getElementById("proc-list");
  list.blur && list.blur();
  document.activeElement && document.activeElement.blur();
  renderProcedures();
}

function fieldInput(type, value, placeholder) {
  var input = document.createElement("input");
  input.className = "field";
  input.type = type;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function setReadonly() {
  for (var i = 0; i < arguments.length; i++) {
    if (unlocked) arguments[i].removeAttribute("readonly");
    else arguments[i].setAttribute("readonly", "");
  }
}

function iconButton(label, ariaLabel, extraClass) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "icon-btn" + (extraClass ? " " + extraClass : "");
  b.setAttribute("aria-label", ariaLabel);
  b.textContent = label;
  return b;
}

function buildProcCard(p) {
  var card = document.createElement("div");
  card.className = "proc" + (expandedProcId === p.id ? " is-expanded" : "");
  card.dataset.id = p.id;

  var summary = document.createElement("div");
  summary.className = "proc-summary";
  summary.addEventListener("click", function (e) {
    if (e.target.closest(".chip, .del-btn, .field, .open-link")) return;
    openProcDetail(p.id);
  });

  var top = document.createElement("div");
  top.className = "proc-top";
  var titleInput = fieldInput("text", p.title || "", "Titolo procedura");
  titleInput.className += " proc-title";
  titleInput.addEventListener("input", function () { debouncedUpdate("procedures", p.id, "title", titleInput.value); touchMeta(); });
  top.appendChild(titleInput);

  var status = statusInfo(p.status);
  var chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip " + status.cls;
  chip.textContent = status.label;
  chip.addEventListener("click", function () {
    if (!unlocked) return;
    var idx = STATUS_ORDER.indexOf(status);
    var next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    updateDoc(doc(db, "procedures", p.id), { status: next.value }).then(touchMeta);
  });
  top.appendChild(chip);

  var delBtn = iconButton("×", "Elimina procedura", "del-btn");
  delBtn.addEventListener("click", function () { if (confirm("Eliminare questa procedura?")) deleteDoc(doc(db, "procedures", p.id)).then(touchMeta); });
  top.appendChild(delBtn);
  summary.appendChild(top);

  var descInput = fieldInput("text", p.desc || "", "Descrizione breve");
  descInput.className += " proc-desc";
  descInput.addEventListener("input", function () { debouncedUpdate("procedures", p.id, "desc", descInput.value); touchMeta(); });
  summary.appendChild(descInput);

  var meta = document.createElement("div");
  meta.className = "proc-meta";
  meta.appendChild(textNode("Reparto:"));
  var deptInput = fieldInput("text", p.dept || "", "Reparto");
  deptInput.className += " proc-dept";
  deptInput.addEventListener("input", function () { debouncedUpdate("procedures", p.id, "dept", deptInput.value); touchMeta(); });
  meta.appendChild(deptInput);
  meta.appendChild(textNode("·"));
  var revInput = fieldInput("text", p.rev || "", "Rev. mm/aaaa");
  revInput.className += " proc-rev mono";
  revInput.addEventListener("input", function () { debouncedUpdate("procedures", p.id, "rev", revInput.value); touchMeta(); });
  meta.appendChild(revInput);

  var openLinkA = document.createElement("a");
  openLinkA.className = "open-link";
  openLinkA.target = "_blank";
  openLinkA.rel = "noopener";
  openLinkA.textContent = "Apri ↗";
  if (p.externalLink) openLinkA.href = p.externalLink; else openLinkA.style.display = "none";
  meta.appendChild(openLinkA);
  summary.appendChild(meta);

  card.appendChild(summary);

  var closeX = iconButton("×", "Chiudi", "detail-close-x");
  closeX.addEventListener("click", function () { closeProcDetail(); });
  card.appendChild(closeX);

  var pdfBtn = document.createElement("button");
  pdfBtn.type = "button";
  pdfBtn.className = "detail-pdf-btn";
  pdfBtn.setAttribute("aria-label", "Scarica PDF");
  pdfBtn.textContent = "⬇ PDF";
  pdfBtn.addEventListener("click", function () { printProcedure(card); });
  card.appendChild(pdfBtn);

  var procBody = document.createElement("div");
  procBody.className = "proc-body";

  procBody.appendChild(sectionLabel("Link esterno"));
  var extLinkInput = fieldInput("url", p.externalLink || "", "Link (https://…)");
  extLinkInput.className += " proc-link";
  extLinkInput.addEventListener("input", function () {
    debouncedUpdate("procedures", p.id, "externalLink", extLinkInput.value);
    openLinkA.href = extLinkInput.value || "#";
    openLinkA.style.display = extLinkInput.value ? "" : "none";
    touchMeta();
  });
  procBody.appendChild(extLinkInput);

  procBody.appendChild(sectionLabel("Testo procedura"));
  procBody.appendChild(buildWordToolbar(p));

  var editor = document.createElement("div");
  editor.className = "word-page";
  editor.contentEditable = unlocked ? "true" : "false";
  editor.innerHTML = p.bodyHtml || "";
  editor.addEventListener("input", function () {
    debouncedUpdate("procedures", p.id, "bodyHtml", editor.innerHTML, 700);
    touchMeta();
  });
  editor.addEventListener("click", function (e) {
    if (e.target.tagName === "IMG") selectedImage = e.target;
  });
  procBody.appendChild(editor);

  card._editor = editor;

  procBody.appendChild(sectionLabel("File collegati (link)"));
  var attachList = document.createElement("div");
  attachList.className = "attach-list";
  (p.attachments || []).forEach(function (att) {
    attachList.appendChild(buildAttachmentRow(p.id, att));
  });
  procBody.appendChild(attachList);

  var addAttachBtn = document.createElement("button");
  addAttachBtn.type = "button";
  addAttachBtn.className = "add-btn";
  addAttachBtn.textContent = "+ Aggiungi link file";
  addAttachBtn.addEventListener("click", function () { addAttachmentLink(p.id); });
  procBody.appendChild(addAttachBtn);

  var quickLinkSelect = document.createElement("select");
  quickLinkSelect.className = "word-select proc-quicklink-select";
  var quickPlaceholder = document.createElement("option");
  quickPlaceholder.value = "";
  quickPlaceholder.textContent = "+ Collega dalla rubrica…";
  quickLinkSelect.appendChild(quickPlaceholder);
  links.forEach(function (l) {
    if (!l.name || !l.url) return;
    var opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = linkTypeInfo(l.type).icon + " " + l.name;
    quickLinkSelect.appendChild(opt);
  });
  quickLinkSelect.addEventListener("change", function () {
    var chosenId = quickLinkSelect.value;
    quickLinkSelect.value = "";
    var chosen = links.find(function (l) { return l.id === chosenId; });
    if (!chosen) return;
    updateDoc(doc(db, "procedures", p.id), { attachments: arrayUnion({ name: chosen.name, url: chosen.url }) }).then(touchMeta);
  });
  procBody.appendChild(quickLinkSelect);

  card.appendChild(procBody);

  setReadonly(titleInput, descInput, deptInput, revInput, extLinkInput);
  return card;
}

function textNode(s) { var span = document.createElement("span"); span.textContent = s; return span; }
function sectionLabel(s) { var d = document.createElement("div"); d.className = "detail-section-label"; d.textContent = s; return d; }

function buildWordToolbar(p) {
  var bar = document.createElement("div");
  bar.className = "word-toolbar";
  var cmds = [
    ["bold", "Grassetto", "B"], ["italic", "Corsivo", "I"], ["underline", "Sottolineato", "S"]
  ];
  cmds.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "word-btn";
    b.title = c[1];
    b.innerHTML = "<" + (c[0] === "bold" ? "b" : c[0] === "italic" ? "i" : "u") + ">" + c[2] + "</" + (c[0] === "bold" ? "b" : c[0] === "italic" ? "i" : "u") + ">";
    b.addEventListener("click", function () { runCmd(p.id, c[0]); });
    bar.appendChild(b);
  });
  bar.appendChild(sep());
  var select = document.createElement("select");
  select.className = "word-select";
  select.title = "Stile paragrafo";
  var optP = document.createElement("option"); optP.value = "<p>"; optP.textContent = "Paragrafo"; select.appendChild(optP);
  var optH = document.createElement("option"); optH.value = "<h3>"; optH.textContent = "Titolo"; select.appendChild(optH);
  select.addEventListener("change", function () { runCmd(p.id, "formatBlock", select.value); });
  bar.appendChild(select);
  bar.appendChild(sep());
  var listCmds = [["insertUnorderedList", "Elenco puntato", "☰•"], ["insertOrderedList", "Elenco numerato", "☰1"]];
  listCmds.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "word-btn"; b.title = c[1]; b.textContent = c[2];
    b.addEventListener("click", function () { runCmd(p.id, c[0]); });
    bar.appendChild(b);
  });
  bar.appendChild(sep());
  var alignCmds = [["justifyLeft", "Allinea a sinistra", "◧"], ["justifyCenter", "Allinea al centro", "▣"], ["justifyRight", "Allinea a destra", "◨"]];
  alignCmds.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "word-btn"; b.title = c[1]; b.textContent = c[2];
    b.addEventListener("click", function () { runCmd(p.id, c[0]); });
    bar.appendChild(b);
  });
  bar.appendChild(sep());
  [["undo", "Annulla", "↺"], ["redo", "Ripeti", "↻"]].forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "word-btn"; b.title = c[1]; b.textContent = c[2];
    b.addEventListener("click", function () { runCmd(p.id, c[0]); });
    bar.appendChild(b);
  });
  bar.appendChild(sep());
  var imgBtn = document.createElement("button");
  imgBtn.type = "button";
  imgBtn.className = "word-btn word-insert-image";
  imgBtn.title = "Inserisci immagine da link";
  imgBtn.textContent = "🖼 Immagine";
  imgBtn.addEventListener("click", function () { insertImageByUrl(p.id); });
  bar.appendChild(imgBtn);
  bar.appendChild(sep());

  var colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "word-color";
  colorInput.title = "Colore testo";
  colorInput.value = "#1a1a1a";
  colorInput.addEventListener("input", function () { applyTextColor(p.id, colorInput.value); });
  bar.appendChild(colorInput);

  var highlightInput = document.createElement("input");
  highlightInput.type = "color";
  highlightInput.className = "word-color";
  highlightInput.title = "Evidenziatore";
  highlightInput.value = "#fff59d";
  highlightInput.addEventListener("input", function () { applyHighlight(p.id, highlightInput.value); });
  bar.appendChild(highlightInput);
  bar.appendChild(sep());

  var tableBtn = document.createElement("button");
  tableBtn.type = "button";
  tableBtn.className = "word-btn";
  tableBtn.title = "Inserisci tabella";
  tableBtn.textContent = "▦ Tabella";
  tableBtn.addEventListener("click", function () { insertTable(p.id); });
  bar.appendChild(tableBtn);
  bar.appendChild(sep());

  var linkBtn = document.createElement("button");
  linkBtn.type = "button";
  linkBtn.className = "word-btn";
  linkBtn.title = "Trasforma il testo selezionato in un link";
  linkBtn.textContent = "🔗 Link";
  linkBtn.addEventListener("click", function () { insertTextLink(p.id); });
  bar.appendChild(linkBtn);

  var unlinkBtn = document.createElement("button");
  unlinkBtn.type = "button";
  unlinkBtn.className = "word-btn";
  unlinkBtn.title = "Rimuovi il link dal testo selezionato";
  unlinkBtn.textContent = "🚫 Link";
  unlinkBtn.addEventListener("click", function () { removeTextLink(p.id); });
  bar.appendChild(unlinkBtn);
  bar.appendChild(sep());

  [["img-sm", "Immagine piccola", "S"], ["img-md", "Immagine media", "M"], ["img-lg", "Immagine grande", "L"]].forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "word-btn"; b.title = c[1]; b.textContent = c[2];
    b.addEventListener("click", function () { setImageSize(c[0]); });
    bar.appendChild(b);
  });
  [["img-left", "Immagine a sinistra", "◧"], ["img-center", "Immagine al centro", "▣"], ["img-right", "Immagine a destra", "◨"]].forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "word-btn"; b.title = c[1]; b.textContent = c[2];
    b.addEventListener("click", function () { setImageAlign(c[0]); });
    bar.appendChild(b);
  });

  return bar;
}

var selectedImage = null;

function applyTextColor(procId, color) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card._editor;
  if (!editor) return;
  editor.focus();
  document.execCommand("foreColor", false, color);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function applyHighlight(procId, color) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card._editor;
  if (!editor) return;
  editor.focus();
  if (!document.execCommand("hiliteColor", false, color)) document.execCommand("backColor", false, color);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function insertTable(procId) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card._editor;
  if (!editor) return;
  var rows = parseInt(prompt("Quante righe?", "3"), 10);
  var cols = parseInt(prompt("Quante colonne?", "3"), 10);
  if (!rows || !cols || rows < 1 || cols < 1) return;
  var html = "<table>";
  for (var r = 0; r < rows; r++) {
    html += "<tr>";
    for (var c = 0; c < cols; c++) html += "<td>&nbsp;</td>";
    html += "</tr>";
  }
  html += "</table><p><br></p>";
  editor.focus();
  document.execCommand("insertHTML", false, html);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function insertTextLink(procId) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card._editor;
  if (!editor) return;
  var url = prompt("Seleziona prima il testo nel documento, poi incolla qui l'indirizzo del link (https://…)");
  if (!url) return;
  editor.focus();
  document.execCommand("createLink", false, url);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function removeTextLink(procId) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card._editor;
  if (!editor) return;
  editor.focus();
  document.execCommand("unlink", false, null);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function setImageSize(cls) {
  if (!unlocked || !selectedImage || !selectedImage.isConnected) { alert("Clicca prima su un'immagine dentro il testo della procedura."); return; }
  selectedImage.classList.remove("img-sm", "img-md", "img-lg");
  selectedImage.classList.add(cls);
  saveImageChange();
}

function setImageAlign(cls) {
  if (!unlocked || !selectedImage || !selectedImage.isConnected) { alert("Clicca prima su un'immagine dentro il testo della procedura."); return; }
  selectedImage.classList.remove("img-left", "img-center", "img-right");
  selectedImage.classList.add(cls);
  saveImageChange();
}

function saveImageChange() {
  var editor = selectedImage.closest(".word-page");
  if (!editor) return;
  var card = editor.closest(".proc");
  var procId = card && card.dataset.id;
  if (!procId) return;
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function sep() { var s = document.createElement("span"); s.className = "word-sep"; return s; }

function runCmd(procId, cmd, arg) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card.querySelector(".word-page");
  if (!editor) return;
  editor.focus();
  document.execCommand(cmd, false, arg || null);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function insertImageByUrl(procId) {
  if (!unlocked) return;
  var card = document.querySelector('.proc[data-id="' + procId + '"]');
  var editor = card && card._editor;
  if (!editor) return;
  var url = prompt("Incolla il link dell'immagine (https://…)");
  if (!url) return;
  editor.focus();
  document.execCommand("insertImage", false, url);
  debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
  touchMeta();
}

function buildAttachmentRow(procId, att) {
  var row = document.createElement("div");
  row.className = "attach-row";
  var icon = document.createElement("span");
  icon.className = "attach-icon";
  icon.textContent = "🔗";
  row.appendChild(icon);
  var link = document.createElement("a");
  link.className = "attach-name";
  link.href = att.url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = att.name;
  row.appendChild(link);
  var del = iconButton("×", "Rimuovi allegato", "del-attach");
  del.addEventListener("click", function () {
    updateDoc(doc(db, "procedures", procId), { attachments: arrayRemove(att) }).then(touchMeta);
  });
  row.appendChild(del);
  return row;
}

function addAttachmentLink(procId) {
  var name = prompt("Nome del file (es. Manuale.pdf)");
  if (!name) return;
  var url = prompt("Link del file (es. link di Google Drive condiviso)");
  if (!url) return;
  updateDoc(doc(db, "procedures", procId), { attachments: arrayUnion({ name: name, url: url }) }).then(touchMeta);
}

function openProcDetail(id) {
  expandedProcId = id;
  backdrop.hidden = false;
  renderProceduresForce();
}
function closeProcDetail() {
  expandedProcId = null;
  backdrop.hidden = true;
  renderProceduresForce();
}
backdrop.addEventListener("click", function () { closeProcDetail(); });

var printStyleTag = null;
function printProcedure(card) {
  var siblings = Array.prototype.slice.call(card.parentElement.children);
  var idx = siblings.indexOf(card) + 1;
  var sel = "body.printing-proc .proc-list > .proc:nth-child(" + idx + ")";
  if (!printStyleTag) { printStyleTag = document.createElement("style"); document.head.appendChild(printStyleTag); }
  printStyleTag.textContent =
    "@media print {" +
    sel + ", " + sel + " * { visibility: visible !important; }" +
    sel + " { position: absolute !important; top:0 !important; left:0 !important; width:100% !important; max-width:none !important; max-height:none !important; transform:none !important; overflow:visible !important; background:#fff !important; color:#1a1a1a !important; border:none !important; box-shadow:none !important; padding:0 !important; }" +
    sel + " .detail-close-x, " + sel + " .detail-pdf-btn, " + sel + " .icon-btn, " + sel + " .add-btn, " + sel + " .word-toolbar { display:none !important; }" +
    sel + " .chip { border:1px solid #999 !important; color:#1a1a1a !important; background:transparent !important; }" +
    sel + " .word-page { border:none !important; padding:0 !important; color:#1a1a1a !important; }" +
    "}";
  document.body.classList.add("printing-proc");
  setTimeout(function () { window.print(); }, 50);
}
window.addEventListener("afterprint", function () { document.body.classList.remove("printing-proc"); });

document.getElementById("add-proc").addEventListener("click", function () {
  addDoc(collection(db, "procedures"), {
    title: "Nuova procedura", desc: "", dept: "", rev: "", status: "ok",
    externalLink: "", bodyHtml: "", attachments: [], order: Date.now()
  }).then(function () { procPage = Infinity; touchMeta(); });
});

/* ---------------- Rubrica collegamenti ---------------- */

function renderLinksList() {
  var listEl = document.getElementById("links-list");
  if (isEditingWithin(listEl)) return;
  listEl.innerHTML = "";
  document.getElementById("links-empty").classList.toggle("is-visible", links.length === 0);
  links.forEach(function (l) { listEl.appendChild(buildLinkRow(l)); });
}

var LINK_TYPES = [
  { value: "sito", label: "Sito web", icon: "🌐", placeholder: "Indirizzo del sito (https://…)" },
  { value: "link", label: "Link", icon: "🔗", placeholder: "Indirizzo (https://…)" },
  { value: "file", label: "Collegamento a file", icon: "📁", placeholder: "Link al file (es. Google Drive condiviso)" }
];
function linkTypeInfo(value) {
  for (var i = 0; i < LINK_TYPES.length; i++) { if (LINK_TYPES[i].value === value) return LINK_TYPES[i]; }
  return LINK_TYPES[1];
}

function buildLinkRow(l) {
  var row = document.createElement("div");
  row.className = "link-row";

  var typeIcon = document.createElement("span");
  typeIcon.className = "link-type-icon";
  row.appendChild(typeIcon);

  var typeSelect = document.createElement("select");
  typeSelect.className = "link-type";
  LINK_TYPES.forEach(function (t) {
    var opt = document.createElement("option");
    opt.value = t.value;
    opt.textContent = t.label;
    typeSelect.appendChild(opt);
  });

  var nameInput = fieldInput("text", l.name || "", "Nome");
  nameInput.className += " link-name";
  nameInput.addEventListener("input", function () { debouncedUpdate("links", l.id, "name", nameInput.value); touchMeta(); });
  nameInput.addEventListener("click", function () {
    if (nameInput.readOnly && l.url) window.open(l.url, "_blank", "noopener");
  });
  row.appendChild(nameInput);

  var urlInput = fieldInput("url", l.url || "", "");
  urlInput.className += " link-url";
  urlInput.addEventListener("input", function () { debouncedUpdate("links", l.id, "url", urlInput.value); touchMeta(); });
  row.appendChild(urlInput);

  var hint = document.createElement("div");
  hint.className = "link-hint";
  hint.textContent = "Suggerimento: carica il file su Google Drive (o simile) → tasto destro → Condividi → Copia link, e incollalo qui sopra.";

  function applyType(value) {
    var info = linkTypeInfo(value);
    typeIcon.textContent = info.icon;
    urlInput.placeholder = info.placeholder;
    hint.classList.toggle("is-visible", value === "file" && unlocked);
  }

  typeSelect.value = l.type || "link";
  applyType(typeSelect.value);
  typeSelect.addEventListener("change", function () {
    debouncedUpdate("links", l.id, "type", typeSelect.value, 0);
    touchMeta();
    applyType(typeSelect.value);
  });
  row.insertBefore(typeSelect, nameInput);

  var delBtn = iconButton("×", "Elimina collegamento", "del-btn");
  delBtn.addEventListener("click", function () { if (confirm("Eliminare questo collegamento?")) deleteDoc(doc(db, "links", l.id)).then(touchMeta); });
  row.appendChild(delBtn);
  row.appendChild(hint);

  setReadonly(nameInput, urlInput);
  return row;
}

document.getElementById("add-link").addEventListener("click", function () {
  addDoc(collection(db, "links"), { name: "", url: "", type: "link", order: Date.now() }).then(touchMeta);
});

var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function renderLinksAgenda() {
  var agendaIndex = document.getElementById("agenda-index");
  var agendaList = document.getElementById("agenda-list");
  var entries = links
    .filter(function (l) { return l.name; })
    .map(function (l) { return { name: l.name, url: l.url, type: l.type }; });
  entries.sort(function (a, b) { return a.name.localeCompare(b.name, "it", { sensitivity: "base" }); });

  var groups = {};
  entries.forEach(function (e) {
    var letter = e.name.charAt(0).toUpperCase();
    if (ALPHABET.indexOf(letter) === -1) letter = "#";
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(e);
  });

  agendaIndex.innerHTML = "";
  ALPHABET.forEach(function (letter) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "agenda-letter";
    btn.textContent = letter;
    if (groups[letter]) {
      btn.classList.add("has-entries");
      btn.addEventListener("click", function () {
        var target = document.getElementById("agenda-letter-" + letter);
        if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    } else {
      btn.disabled = true;
    }
    agendaIndex.appendChild(btn);
  });

  agendaList.innerHTML = "";
  if (entries.length === 0) {
    var empty = document.createElement("p");
    empty.className = "agenda-empty";
    empty.textContent = "Nessun collegamento ancora.";
    agendaList.appendChild(empty);
    return;
  }
  ALPHABET.concat(["#"]).forEach(function (letter) {
    if (!groups[letter]) return;
    var group = document.createElement("div");
    group.className = "agenda-group";
    var label = document.createElement("div");
    label.className = "agenda-group-label";
    label.id = "agenda-letter-" + letter;
    label.textContent = letter;
    group.appendChild(label);
    groups[letter].forEach(function (e) {
      var el = document.createElement(e.url ? "a" : "div");
      el.className = "agenda-entry";
      if (e.url) { el.href = e.url; el.target = "_blank"; el.rel = "noopener"; }
      var iconSpan = document.createElement("span");
      iconSpan.textContent = linkTypeInfo(e.type).icon + " ";
      el.appendChild(iconSpan);
      var nameSpan = document.createElement("span");
      nameSpan.className = "agenda-entry-name";
      nameSpan.textContent = e.name;
      el.appendChild(nameSpan);
      if (e.url) {
        var arrow = document.createElement("span");
        arrow.className = "agenda-entry-arrow";
        arrow.textContent = "↗";
        el.appendChild(arrow);
      }
      group.appendChild(el);
    });
    agendaList.appendChild(group);
  });
}

var linksOverlay = document.getElementById("links-overlay");
document.getElementById("open-links-btn").addEventListener("click", function () { renderLinksAgenda(); linksOverlay.hidden = false; });
document.getElementById("links-close").addEventListener("click", function () { linksOverlay.hidden = true; });
linksOverlay.addEventListener("click", function (e) { if (e.target === linksOverlay) linksOverlay.hidden = true; });

/* ---------------- Moduli ---------------- */

var expandedFormId = null;

function renderForms() {
  var list = document.getElementById("form-list");
  if (isEditingWithin(list)) return;
  list.innerHTML = "";
  forms.forEach(function (f) { list.appendChild(buildFormCard(f)); });
}

function buildFormCard(f) {
  var card = document.createElement("div");
  card.className = "form-card" + (expandedFormId === f.id ? " is-expanded" : "");
  card.dataset.id = f.id;

  var head = document.createElement("div");
  head.className = "form-card-head";
  head.addEventListener("click", function (e) {
    if (e.target.closest(".icon-btn, .field, .form-print-btn")) return;
    expandedFormId = expandedFormId === f.id ? null : f.id;
    renderForms();
  });

  var titleInput = fieldInput("text", f.title || "", "Titolo modulo");
  titleInput.className += " form-title";
  titleInput.addEventListener("input", function () { debouncedUpdate("forms", f.id, "title", titleInput.value); touchMeta(); });
  head.appendChild(titleInput);

  var actions = document.createElement("span");
  actions.className = "form-card-actions";

  var printBtn = document.createElement("button");
  printBtn.type = "button";
  printBtn.className = "form-print-btn";
  printBtn.setAttribute("aria-label", "Stampa modulo");
  printBtn.textContent = "🖨";
  printBtn.addEventListener("click", function (e) { e.stopPropagation(); printForm(card); });
  actions.appendChild(printBtn);

  var delBtn = iconButton("×", "Elimina modulo", "del-btn");
  delBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (confirm("Eliminare questo modulo?")) deleteDoc(doc(db, "forms", f.id)).then(touchMeta);
  });
  actions.appendChild(delBtn);
  head.appendChild(actions);

  card.appendChild(head);

  var fieldsWrap = document.createElement("div");
  fieldsWrap.className = "form-fields";
  (f.fields || []).forEach(function (field, idx) {
    fieldsWrap.appendChild(buildFormFieldRow(f, idx, field));
  });
  card.appendChild(fieldsWrap);

  var addFieldBtn = document.createElement("button");
  addFieldBtn.type = "button";
  addFieldBtn.className = "add-btn form-add-field";
  addFieldBtn.textContent = "+ Aggiungi campo";
  addFieldBtn.addEventListener("click", function () {
    var newFields = (f.fields || []).concat([{ label: "", value: "", type: "text" }]);
    updateDoc(doc(db, "forms", f.id), { fields: newFields }).then(touchMeta);
  });
  card.appendChild(addFieldBtn);

  setReadonly(titleInput);
  return card;
}

function buildFormFieldRow(f, idx, field) {
  var row = document.createElement("div");
  row.className = "form-field-row";

  var labelInput = fieldInput("text", field.label || "", "Nome campo");
  labelInput.className += " form-field-label";
  labelInput.addEventListener("input", function () { updateFormField(f, idx, "label", labelInput.value); });
  row.appendChild(labelInput);

  var toLock = [labelInput];

  if (field.type === "check") {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip " + (field.value === "si" ? "chip-ok" : "chip-crit");
    chip.textContent = field.value === "si" ? "Sì" : "No";
    chip.addEventListener("click", function () {
      if (!unlocked) return;
      updateFormField(f, idx, "value", field.value === "si" ? "no" : "si");
    });
    row.appendChild(chip);
  } else {
    var valueInput = fieldInput("text", field.value || "", "Valore");
    valueInput.className += " form-field-value";
    valueInput.addEventListener("input", function () { updateFormField(f, idx, "value", valueInput.value); });
    row.appendChild(valueInput);
    toLock.push(valueInput);
  }

  var typeSelect = document.createElement("select");
  typeSelect.className = "word-select form-field-type";
  [["text", "Testo"], ["check", "Sì/No"]].forEach(function (t) {
    var opt = document.createElement("option");
    opt.value = t[0]; opt.textContent = t[1];
    typeSelect.appendChild(opt);
  });
  typeSelect.value = field.type || "text";
  typeSelect.addEventListener("change", function () { updateFormField(f, idx, "type", typeSelect.value); });
  row.appendChild(typeSelect);

  var delFieldBtn = iconButton("×", "Rimuovi campo", "del-btn");
  delFieldBtn.addEventListener("click", function () {
    var newFields = (f.fields || []).slice();
    newFields.splice(idx, 1);
    updateDoc(doc(db, "forms", f.id), { fields: newFields }).then(touchMeta);
  });
  row.appendChild(delFieldBtn);

  setReadonly.apply(null, toLock);
  return row;
}

var formFieldSaveTimers = new Map();
function updateFormField(f, idx, key, value) {
  var newFields = (f.fields || []).slice();
  newFields[idx] = Object.assign({}, newFields[idx]);
  newFields[idx][key] = value;
  var timerKey = "forms/" + f.id + "/fields";
  clearTimeout(formFieldSaveTimers.get(timerKey));
  var t = setTimeout(function () {
    updateDoc(doc(db, "forms", f.id), { fields: newFields }).then(touchMeta).catch(function (e) { console.error(e); });
  }, key === "value" ? 400 : 0);
  formFieldSaveTimers.set(timerKey, t);
}

var formPrintStyleTag = null;
function printForm(card) {
  var siblings = Array.prototype.slice.call(card.parentElement.children);
  var idx = siblings.indexOf(card) + 1;
  var sel = "body.printing-form .form-list > .form-card:nth-child(" + idx + ")";
  if (!formPrintStyleTag) { formPrintStyleTag = document.createElement("style"); document.head.appendChild(formPrintStyleTag); }
  formPrintStyleTag.textContent =
    "@media print {" +
    sel + ", " + sel + " * { visibility: visible !important; }" +
    sel + " { position: absolute !important; top:0 !important; left:0 !important; width:100% !important; max-width:none !important; background:#fff !important; color:#1a1a1a !important; border:none !important; box-shadow:none !important; padding:0 !important; }" +
    sel + " .form-fields { display: flex !important; border-top:none !important; margin-top:14px !important; padding-top:0 !important; }" +
    sel + " .icon-btn, " + sel + " .add-btn, " + sel + " .form-print-btn, " + sel + " .form-field-type { display:none !important; }" +
    "}";
  document.body.classList.add("printing-form");
  setTimeout(function () { window.print(); }, 50);
}
window.addEventListener("afterprint", function () { document.body.classList.remove("printing-form"); });

document.getElementById("add-form").addEventListener("click", function () {
  addDoc(collection(db, "forms"), {
    title: "Nuovo modulo",
    fields: [
      { label: "Data", value: "", type: "text" },
      { label: "Condominio / Indirizzo", value: "", type: "text" },
      { label: "Amministratore", value: "", type: "text" },
      { label: "Tipo contratto", value: "", type: "text" },
      { label: "Partita IVA", value: "", type: "text" },
      { label: "Inserimento avvenuto", value: "no", type: "check" }
    ],
    order: Date.now()
  }).then(touchMeta);
});

/* ---------------- Tabella PC ---------------- */

function renderPcTable() {
  var tbody = document.getElementById("pc-table-body");
  if (isEditingWithin(tbody)) return;
  var rows = pcRows.slice();
  if (pcSort.key) {
    rows.sort(function (a, b) {
      var av = (a[pcSort.key] || "").toString().toLowerCase();
      var bv = (b[pcSort.key] || "").toString().toLowerCase();
      if (av < bv) return -1 * pcSort.dir;
      if (av > bv) return 1 * pcSort.dir;
      return 0;
    });
  }
  tbody.innerHTML = "";
  rows.forEach(function (r) {
    var tr = document.createElement("tr");
    ["pc", "name", "email", "ext"].forEach(function (key) {
      var td = document.createElement("td");
      var placeholders = { pc: "PC-00", name: "Nome Cognome", email: "nome@esempio.it", ext: "000" };
      var input = fieldInput("text", r[key] || "", placeholders[key]);
      input.className += " cell-" + key;
      input.addEventListener("input", function () { debouncedUpdate("pcRows", r.id, key, input.value); touchMeta(); });
      setReadonly(input);
      td.appendChild(input);
      tr.appendChild(td);
    });
    var tdActions = document.createElement("td");
    tdActions.className = "td-actions";
    var del = iconButton("×", "Elimina riga", "del-btn");
    del.addEventListener("click", function () { if (confirm("Eliminare questa riga?")) deleteDoc(doc(db, "pcRows", r.id)).then(touchMeta); });
    tdActions.appendChild(del);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

document.getElementById("add-row").addEventListener("click", function () {
  addDoc(collection(db, "pcRows"), { pc: "", name: "", email: "", ext: "", order: Date.now() }).then(touchMeta);
});

document.querySelectorAll(".pc-table th[data-sort]").forEach(function (th) {
  th.addEventListener("click", function () {
    var key = th.dataset.sort;
    if (pcSort.key === key) pcSort.dir *= -1; else { pcSort.key = key; pcSort.dir = 1; }
    document.querySelectorAll(".pc-table th .sort-ind").forEach(function (s) { s.textContent = ""; });
    th.querySelector(".sort-ind").textContent = pcSort.dir === 1 ? " ▲" : " ▼";
    renderPcTable();
  });
});

/* ---------------- Ricerca ---------------- */

var filterInput = document.getElementById("filter");
var searchResults = document.getElementById("search-results");

function renderSearchResults(q) {
  searchResults.innerHTML = "";
  if (!q) { searchResults.hidden = true; return; }
  var matches = links.filter(function (l) { return l.name && l.name.toLowerCase().includes(q); });
  if (matches.length === 0) { searchResults.hidden = true; return; }
  var label = document.createElement("div");
  label.className = "search-result-label";
  label.textContent = "Collegamenti";
  searchResults.appendChild(label);
  matches.forEach(function (m) {
    var href = m.url;
    var el = document.createElement(href ? "a" : "div");
    el.className = "search-result";
    if (href) { el.href = href; el.target = "_blank"; el.rel = "noopener"; }
    var nameSpan = document.createElement("span");
    nameSpan.textContent = m.name;
    el.appendChild(nameSpan);
    if (href) {
      var arrow = document.createElement("span");
      arrow.className = "search-result-arrow";
      arrow.textContent = "↗";
      el.appendChild(arrow);
    }
    searchResults.appendChild(el);
  });
  searchResults.hidden = false;
}

filterInput.addEventListener("input", function () {
  searchQuery = filterInput.value.trim().toLowerCase();
  procPage = 0;
  renderTools();
  renderProcedures();
  renderSearchResults(searchQuery);
});
filterInput.addEventListener("blur", function () { setTimeout(function () { searchResults.hidden = true; }, 150); });
filterInput.addEventListener("focus", function () { if (searchQuery) renderSearchResults(searchQuery); });

/* ---------------- Tema ---------------- */

var themeBtn = document.getElementById("theme-btn");
function currentTheme() {
  var explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  themeBtn.setAttribute("aria-label", theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro");
}
try {
  var savedTheme = localStorage.getItem("decabo-theme");
  if (savedTheme === "light" || savedTheme === "dark") applyTheme(savedTheme);
  else themeBtn.textContent = currentTheme() === "dark" ? "☀️" : "🌙";
} catch (e) { themeBtn.textContent = currentTheme() === "dark" ? "☀️" : "🌙"; }
themeBtn.addEventListener("click", function () {
  var next = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("decabo-theme", next); } catch (e) {}
});

/* ---------------- Blocco / sblocco ---------------- */

var lockBtn = document.getElementById("lock-btn");
var overlay = document.getElementById("pw-overlay");
var pwInput = document.getElementById("pw-input");
var pwError = document.getElementById("pw-error");

function setEditMode(on) {
  unlocked = on;
  document.body.classList.toggle("edit-unlocked", on);
  lockBtn.setAttribute("aria-label", on ? "Blocca modifica" : "Sblocca modifica");
  renderTools();
  renderProceduresForce();
  renderLinksList();
  renderForms();
  renderPcTable();
}

function openModal() { pwError.hidden = true; pwInput.value = ""; overlay.hidden = false; pwInput.focus(); }
function closeModal() { overlay.hidden = true; }

lockBtn.addEventListener("click", function () {
  if (unlocked) setEditMode(false); else openModal();
});
document.getElementById("pw-cancel").addEventListener("click", closeModal);
overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

function trySubmit() {
  if (pwInput.value === EDIT_PASSWORD) { setEditMode(true); closeModal(); }
  else { pwError.hidden = false; pwInput.value = ""; pwInput.focus(); }
}
document.getElementById("pw-submit").addEventListener("click", trySubmit);
pwInput.addEventListener("keydown", function (e) { if (e.key === "Enter") trySubmit(); });

document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  if (!overlay.hidden) { closeModal(); return; }
  if (!linksOverlay.hidden) { linksOverlay.hidden = true; return; }
  if (expandedProcId) closeProcDetail();
});
