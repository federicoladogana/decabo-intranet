import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, setDoc, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

let authUser = null;
onAuthStateChanged(auth, function (user) { authUser = user; });
signInAnonymously(auth).catch(function (err) { console.error("Errore di accesso:", err); });

const EDIT_PASSWORD = "0079";
let unlocked = false;

let procedures = [];
let tools = [];
let links = [];
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
  procBody.appendChild(editor);

  var imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.className = "word-image-input";
  imageInput.accept = "image/*";
  imageInput.hidden = true;
  imageInput.addEventListener("change", function () { handleImageUpload(p.id, editor, imageInput); });
  procBody.appendChild(imageInput);

  card._imageInput = imageInput;
  card._editor = editor;

  procBody.appendChild(sectionLabel("File allegati"));
  var attachList = document.createElement("div");
  attachList.className = "attach-list";
  (p.attachments || []).forEach(function (att) {
    attachList.appendChild(buildAttachmentRow(p.id, att));
  });
  procBody.appendChild(attachList);

  var addAttachBtn = document.createElement("button");
  addAttachBtn.type = "button";
  addAttachBtn.className = "add-btn";
  addAttachBtn.textContent = "+ Carica PDF";
  var attachInput = document.createElement("input");
  attachInput.type = "file";
  attachInput.accept = "application/pdf";
  attachInput.hidden = true;
  addAttachBtn.addEventListener("click", function () { attachInput.click(); });
  attachInput.addEventListener("change", function () { handleAttachUpload(p.id, attachInput, attachList); });
  procBody.appendChild(addAttachBtn);
  procBody.appendChild(attachInput);

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
  imgBtn.title = "Inserisci immagine";
  imgBtn.textContent = "🖼 Immagine";
  imgBtn.addEventListener("click", function () {
    var card = imgBtn.closest(".proc");
    if (card && card._imageInput) {
      savedImageRange = getCurrentRange(card._editor);
      card._imageInput.click();
    }
  });
  bar.appendChild(imgBtn);
  return bar;
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

var savedImageRange = null;
function getCurrentRange(editor) {
  var sel = window.getSelection();
  if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) return sel.getRangeAt(0).cloneRange();
  var r = document.createRange();
  r.selectNodeContents(editor);
  r.collapse(false);
  return r;
}

function handleImageUpload(procId, editor, input) {
  var file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (!/^image\//.test(file.type)) { alert("Formato non supportato. Scegli un'immagine."); return; }
  if (file.size > 8 * 1024 * 1024) { alert("Immagine troppo grande (max 8 MB)."); return; }
  var path = "procedures/" + procId + "/images/" + Date.now() + "-" + file.name;
  var storageRef = ref(storage, path);
  uploadBytes(storageRef, file).then(function (snap) {
    return getDownloadURL(snap.ref);
  }).then(function (url) {
    editor.focus();
    var sel = window.getSelection();
    sel.removeAllRanges();
    if (savedImageRange) sel.addRange(savedImageRange);
    document.execCommand("insertImage", false, url);
    debouncedUpdate("procedures", procId, "bodyHtml", editor.innerHTML, 0);
    touchMeta();
  }).catch(function (e) { console.error(e); alert("Caricamento immagine non riuscito."); });
}

function buildAttachmentRow(procId, att) {
  var row = document.createElement("div");
  row.className = "attach-row";
  var icon = document.createElement("span");
  icon.className = "attach-icon";
  icon.textContent = "PDF";
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

function handleAttachUpload(procId, input, attachListEl) {
  var file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (file.type !== "application/pdf") { alert("Formato non supportato. Carica un file PDF."); return; }
  if (file.size > 15 * 1024 * 1024) { alert("File troppo grande (max 15 MB)."); return; }
  var path = "procedures/" + procId + "/attachments/" + Date.now() + "-" + file.name;
  var storageRef = ref(storage, path);
  uploadBytes(storageRef, file).then(function (snap) {
    return getDownloadURL(snap.ref);
  }).then(function (url) {
    var att = { name: file.name, url: url };
    return updateDoc(doc(db, "procedures", procId), { attachments: arrayUnion(att) });
  }).then(touchMeta).catch(function (e) { console.error(e); alert("Caricamento file non riuscito."); });
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

function buildLinkRow(l) {
  var row = document.createElement("div");
  row.className = "link-row";
  var nameInput = fieldInput("text", l.name || "", "Nome");
  nameInput.className += " link-name";
  nameInput.addEventListener("input", function () { debouncedUpdate("links", l.id, "name", nameInput.value); touchMeta(); });
  nameInput.addEventListener("click", function () {
    if (nameInput.readOnly) {
      var href = l.fileUrl || l.url;
      if (href) window.open(href, "_blank", "noopener");
    }
  });
  row.appendChild(nameInput);

  var urlInput = fieldInput("url", l.url || "", "Link file Excel/Word (https://…)");
  urlInput.className += " link-url";
  urlInput.addEventListener("input", function () { debouncedUpdate("links", l.id, "url", urlInput.value); touchMeta(); });
  row.appendChild(urlInput);

  var uploadBtn = iconButton("📎", "Carica file", "link-upload-btn");
  var fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".xlsx,.xls,.docx,.doc,.pdf,.ods,.odt";
  fileInput.hidden = true;
  uploadBtn.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () { handleLinkFileUpload(l.id, fileInput); });
  row.appendChild(uploadBtn);

  var delBtn = iconButton("×", "Elimina collegamento", "del-btn");
  delBtn.addEventListener("click", function () { if (confirm("Eliminare questo collegamento?")) deleteDoc(doc(db, "links", l.id)).then(touchMeta); });
  row.appendChild(delBtn);
  row.appendChild(fileInput);

  var badge = document.createElement("span");
  badge.className = "link-file-badge";
  if (l.fileName) { badge.setAttribute("data-filename", l.fileName); }
  row.appendChild(badge);

  setReadonly(nameInput, urlInput);
  return row;
}

function handleLinkFileUpload(linkId, input) {
  var file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (!/\.(xlsx|xls|docx|doc|pdf|ods|odt)$/i.test(file.name)) {
    alert("Formato non supportato. Carica Excel, Word, PDF o OpenDocument.");
    return;
  }
  if (file.size > 25 * 1024 * 1024) { alert("File troppo grande (max 25 MB)."); return; }
  var path = "links/" + linkId + "/" + Date.now() + "-" + file.name;
  var storageRef = ref(storage, path);
  uploadBytes(storageRef, file).then(function (snap) {
    return getDownloadURL(snap.ref);
  }).then(function (url) {
    return updateDoc(doc(db, "links", linkId), { fileUrl: url, fileName: file.name });
  }).then(touchMeta).catch(function (e) { console.error(e); alert("Caricamento file non riuscito."); });
}

document.getElementById("add-link").addEventListener("click", function () {
  addDoc(collection(db, "links"), { name: "", url: "", fileUrl: "", fileName: "", order: Date.now() }).then(touchMeta);
});

var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function renderLinksAgenda() {
  var agendaIndex = document.getElementById("agenda-index");
  var agendaList = document.getElementById("agenda-list");
  var entries = links
    .filter(function (l) { return l.name; })
    .map(function (l) { return { name: l.name, url: l.fileUrl || l.url }; });
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
    var href = m.fileUrl || m.url;
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
