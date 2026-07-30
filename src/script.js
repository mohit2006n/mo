import {
  transform,
  inspect,
  formats,
  clearStorage,
  deleteFile,
  readFile,
  zipFiles as createZip,
} from "../index.js";
import { safeName, outputs } from "../lib/formats.js";
import "./components/index.js";
(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const formatLabels = {
    png: "PNG image",
    jpg: "JPG image",
    webp: "WebP image",
    bmp: "BMP image",
    tiff: "TIFF image",
    ico: "ICO icon",
    pdf: "PDF document",
    mp4: "MP4 video",
    webm: "WebM video",
    mov: "MOV video",
    mkv: "MKV video",
    avi: "AVI video",
    gif: "Animated GIF",
    mp3: "MP3 audio",
    wav: "WAV audio",
    ogg: "OGG audio",
    opus: "Opus audio",
    flac: "FLAC audio",
    aiff: "AIFF audio",
    m4a: "M4A audio",
    aac: "AAC audio",
    txt: "Plain text",
    md: "Markdown",
    html: "HTML document",
    doc: "Word 97–2003 document",
    docx: "Word document",
    odt: "OpenDocument text",
    rtf: "Rich Text Format",
    epub: "EPUB ebook",
    ppt: "PowerPoint 97–2003 presentation",
    pptx: "PowerPoint presentation",
    odp: "OpenDocument presentation",
    xls: "Excel 97–2003 workbook",
    csv: "CSV table",
    tsv: "TSV table",
    json: "JSON data",
    ndjson: "Newline-delimited JSON",
    yaml: "YAML data",
    xlsx: "Excel workbook",
    ods: "OpenDocument sheet",
    xml: "XML data",
    toml: "TOML data",
    ini: "INI data",
    srt: "SubRip subtitles",
    vtt: "WebVTT subtitles",
    ass: "ASS subtitles",
    sqlite: "SQLite database",
    zip: "ZIP archive",
    rar: "RAR archive",
    "7z": "7-Zip archive",
    tar: "TAR archive",
    tgz: "Compressed TAR archive",
    gz: "GZIP file",
  };

  const groupLabels = {
    image: "Images",
    video: "Video & subtitles",
    audio: "Audio",
    document: "Documents & slides",
    pdf: "PDF & ebooks",
    data: "Tables, data & databases",
    archive: "Archives",
  };

  const preferredTargets = {
    jpg: "png",
    png: "webp",
    webp: "jpg",
    svg: "png",
    tga: "png",
    raw: "png",
    dng: "png",
    cr2: "png",
    cr3: "png",
    nef: "png",
    arw: "png",
    gif: "mp4",
    mp4: "mp3",
    mov: "mp4",
    webm: "mp4",
    avi: "mp4",
    "3g2": "mp4",
    wav: "mp3",
    flac: "mp3",
    m4b: "m4a",
    caf: "wav",
    voc: "wav",
    doc: "pdf",
    docx: "pdf",
    odt: "pdf",
    rtf: "pdf",
    ppt: "pdf",
    pptx: "pdf",
    odp: "pdf",
    fodt: "pdf",
    fodp: "pdf",
    key: "pdf",
    numbers: "pdf",
    mobi: "pdf",
    azw: "pdf",
    azw3: "pdf",
    epub: "pdf",
    xls: "pdf",
    md: "html",
    html: "pdf",
    txt: "pdf",
    pdf: "jpg",
    csv: "xlsx",
    xlsx: "csv",
    json: "csv",
    yaml: "json",
    xml: "json",
    toml: "json",
    ini: "json",
    sqlite: "xlsx",
    srt: "vtt",
    vtt: "srt",
    ass: "srt",
    rar: "zip",
    "7z": "zip",
    tar: "zip",
    gz: "zip",
    tgz: "zip",
  };

  const storageReady = clearStorage();
  let wakeLock = null;
  const formatGroups = formats().map((group) => ({
    ...group,
    name: groupLabels[group.kind],
  }));
  const formatName = (ext) => formatLabels[ext];
  const chooseDefaultTarget = (targets, sourceExt) => {
    if (!targets.length) {
      return "";
    }

    const preferred = preferredTargets[sourceExt];
    if (preferred && targets.includes(preferred) && preferred !== sourceExt) {
      return preferred;
    }

    const alternatives = targets.filter((target) => target !== sourceExt);
    const choices = alternatives.length ? alternatives : targets;
    const priority = ["pdf", "png", "mp4", "mp3", "xlsx", "json", "txt"];
    return priority.find((value) => choices.includes(value));
  };

  const elements = {
    skip: $("#skipButton"),
    formatsButton: $("#formatsButton"),
    conversion: $("#conversion"),
    backButton: $("#backButton"),
    dropZone: $("#dropZone"),
    fileInput: $("#fileInput"),
    workspace: $("#workspace"),
    fileQueue: $("#fileQueue"),
    queueCount: $("#queueCount"),
    selectAll: $("#selectAllFiles"),
    selectPendingGroup: $("#selectPendingGroup"),
    selectPending: $("#selectPendingFiles"),
    selectPendingLabel: $("#selectPendingLabel"),
    selectConvertedGroup: $("#selectConvertedGroup"),
    selectConverted: $("#selectConvertedFiles"),
    selectConvertedLabel: $("#selectConvertedLabel"),
    selectConvertingGroup: $("#selectConvertingGroup"),
    selectConverting: $("#selectConvertingFiles"),
    selectConvertingLabel: $("#selectConvertingLabel"),
    target: $("#targetFormat"),
    convert: $("#convertButton"),
    addMore: $("#addMoreButton"),
    template: $("#queueItemTemplate"),
    formatGrid: $("#formatGrid"),
    formatCardTemplate: $("#formatCardTemplate"),
    themeToggle: $("#themeToggle"),
  };

  const state = {
    items: [],
    target: "",
    get processing() {
      return this.items.some((item) => item.status === "converting");
    },
  };

  function humanBytes(bytes) {
    if (bytes < 1) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    const value = bytes / Math.pow(1024, index);
    return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function selectedItems() {
    return state.items.filter((item) => item.selected);
  }

  function commonTargets() {
    const items = selectedItems();
    if (!items.length) {
      return [];
    }

    const targetSets = items.map(
      (item) => new Set(outputs(item.kind, item.ext)),
    );
    const common = targetSets.reduce(
      (current, next) =>
        new Set([...current].filter((value) => next.has(value))),
    );
    return [...common];
  }

  function clearOutput(item) {
    if (item.output) void deleteFile(item.output);
    item.output = null;
    item.error = "";
    item.progress = 0;
    item.status = "ready";
  }

  function clearOutputs(items = state.items) {
    items.forEach(clearOutput);
  }

  async function addFiles(fileList) {
    const files = [...fileList];
    for (const file of files) {
      const { rawExt, ext, kind } = await inspect(file);
      if (!kind) {
        continue;
      }

      const targets = outputs(kind, ext);
      state.items.push({
        id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0]}`,
        file,
        rawExt,
        ext,
        kind,
        selected: true,
        target: chooseDefaultTarget(targets, ext),
        status: "ready",
        progress: 0,
        output: null,
        error: "",
      });
    }

    if (state.items.length) {
      renderWorkspace();
    }
  }

  function removeItem(id) {
    const item = state.items.find((entry) => entry.id === id);
    if (item?.output) void deleteFile(item.output);
    state.items = state.items.filter((entry) => entry.id !== id);
    renderWorkspace();
  }

  function clearAll() {
    for (const item of state.items) {
      if (item.output) void deleteFile(item.output);
    }
    state.items = [];
    state.target = "";
    renderWorkspace();
  }

  function cancel() {
    for (const item of selectedItems()) {
      if (item.status === "converting") {
        if (item.abortController) {
          item.abortController.abort();
        }
        item.status = "ready";
        item.progress = 0;
      }
    }
    renderWorkspace();
  }

  function setupSelect(select) {
    select.replaceChildren();
    const button = document.createElement("button");
    const selectedContent = document.createElement("selectedcontent");
    const indicator = document.createElement("span");
    indicator.className = "select-indicator icon icon-chevron";
    indicator.setAttribute("aria-hidden", "true");
    button.append(selectedContent, indicator);
    select.append(button);
    return selectedContent;
  }

  function syncSelect(select) {
    const selectedContent = select.querySelector("selectedcontent");
    if (selectedContent)
      selectedContent.textContent = select.selectedOptions[0]?.textContent;
  }

  function renderTargets() {
    const items = selectedItems();
    const targets = commonTargets().sort((a, b) => a.localeCompare(b));
    setupSelect(elements.target);
    const targetSet = new Set(items.map((item) => item.target).filter(Boolean));
    const sharedTarget = targetSet.size === 1 ? [...targetSet][0] : "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = items.length
      ? "Choose a format for selected files"
      : "Select files first";
    placeholder.disabled = true;
    placeholder.hidden = true;
    elements.target.append(placeholder);
    for (const target of targets) {
      const option = document.createElement("option");
      option.value = target;
      option.textContent = `${formatName(target)} (.${target})`;
      elements.target.append(option);
    }
    state.target = targets.includes(sharedTarget) ? sharedTarget : "";
    elements.target.value = state.target;
    syncSelect(elements.target);
    const anyConverting = items.some((item) => item.status === "converting");
    elements.target.disabled = !targets.length || anyConverting;
  }

  function isPending(item) {
    return item.status === "ready" || item.status === "error";
  }

  function applyGroup(group, checkbox, label, name, items) {
    const total = items.length;
    const selected = items.filter((i) => i.selected).length;
    group.hidden = total === 0;
    checkbox.disabled = total === 0;
    label.textContent = `${name} (${total})`;
    checkbox.checked = total > 0 && selected === total;
    checkbox.indeterminate = selected > 0 && selected < total;
  }

  function renderSelectAll() {
    const total = state.items.length;
    const selectedCount = selectedItems().length;
    elements.selectAll.disabled = total === 0;
    elements.selectAll.checked = total > 0 && selectedCount === total;
    elements.selectAll.indeterminate =
      selectedCount > 0 && selectedCount < total;
    applyGroup(
      elements.selectPendingGroup,
      elements.selectPending,
      elements.selectPendingLabel,
      "Pending",
      state.items.filter(isPending),
    );
    applyGroup(
      elements.selectConvertedGroup,
      elements.selectConverted,
      elements.selectConvertedLabel,
      "Converted",
      state.items.filter((i) => i.status === "done"),
    );
    applyGroup(
      elements.selectConvertingGroup,
      elements.selectConverting,
      elements.selectConvertingLabel,
      "Converting",
      state.items.filter((i) => i.status === "converting"),
    );
  }

  function renderWorkspace() {
    const hasItems = state.items.length > 0;
    document.body.classList.toggle("workspace-active", hasItems);
    if (elements.backButton) elements.backButton.hidden = !hasItems;
    elements.workspace.hidden = !hasItems;
    elements.dropZone.classList.toggle("files-present", hasItems);
    elements.queueCount.textContent = `${state.items.length} file${state.items.length === 1 ? "" : "s"}`;
    renderTargets();
    elements.fileQueue.innerHTML = "";
    for (const item of state.items) elements.fileQueue.append(renderItem(item));
    renderAction();
  }

  function renderItem(item) {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.dataset.status = item.status;
    node.dataset.selected = String(item.selected);
    const checkbox = $(".file-checkbox", node);
    checkbox.checked = item.selected;
    checkbox.setAttribute("aria-label", `Select ${item.file.name}`);
    checkbox.addEventListener("change", () => {
      item.selected = checkbox.checked;
      if (item.selected) {
        for (const other of state.items) {
          if (other === item) {
            continue;
          }

          if (
            item.status === "done" &&
            (other.status === "converting" || isPending(other))
          )
            other.selected = false;
          else if (
            item.status === "converting" &&
            (other.status === "done" || isPending(other))
          )
            other.selected = false;
          else if (
            isPending(item) &&
            (other.status === "done" || other.status === "converting")
          )
            other.selected = false;
        }
      }
      renderWorkspace();
    });
    $(".file-type-label", node).textContent = item.ext.slice(0, 5);
    $(".file-name", node).textContent = item.file.name;
    const verified = $(".file-verified", node);
    const detail = $(".file-detail", node);
    detail.textContent = `${humanBytes(item.file.size)} · ${item.kind}`;
    const progress = $(".progress-value", node);
    progress.style.setProperty(
      "--progress",
      Math.max(0, Math.min(100, item.progress)),
    );
    const percent = $(".file-progress-percent", node);
    if (percent) percent.textContent = `${Math.round(item.progress)}%`;
    const targetSelect = $(".file-target-select", node);
    setupSelect(targetSelect);
    for (const target of outputs(item.kind, item.ext)) {
      const option = document.createElement("option");
      option.value = target;
      option.textContent = `${formatName(target)} (.${target})`;
      targetSelect.append(option);
    }
    targetSelect.value = item.target;
    targetSelect.disabled = !item.selected || item.status === "converting";
    syncSelect(targetSelect);
    targetSelect.addEventListener("change", () => {
      item.target = targetSelect.value;
      clearOutput(item);
      renderWorkspace();
    });
    const download = $(".download-button", node);
    const isDone = item.status === "done";
    download.hidden = !isDone;
    verified.hidden = !isDone;
    if (isDone) {
      const count = item.output.files.length;
      download.textContent = count > 1 ? "Download ZIP" : "Download";
      download.addEventListener("click", () => downloadItem(item));
    } else if (item.status === "error") {
      detail.textContent = item.error;
    }

    const remove = $(".remove-file", node);
    remove.addEventListener("click", () => removeItem(item.id));
    return node;
  }

  function renderProgress(item) {
    const itemNode = elements.fileQueue.querySelector(
      `[data-id="${CSS.escape(item.id)}"]`,
    );
    if (!itemNode) {
      return;
    }
    itemNode.dataset.status = item.status;
    const progress = $(".progress-value", itemNode);
    progress.style.setProperty(
      "--progress",
      Math.max(0, Math.min(100, item.progress)),
    );
    const percent = $(".file-progress-percent", itemNode);
    if (percent) percent.textContent = `${Math.round(item.progress)}%`;
  }

  function renderAction() {
    const items = selectedItems();
    const count = items.length;
    const convertingCount = items.filter(
      (item) => item.status === "converting",
    ).length;
    const converting = convertingCount > 0;
    const doneCount = items.filter((item) => item.status === "done").length;
    const done = doneCount > 0;
    const missingTarget = items.some((item) => !item.target);
    const mode = done ? "download" : converting ? "cancel" : "convert";
    elements.convert.dataset.mode = mode;
    elements.convert.disabled =
      !converting && !done && (!count || missingTarget);
    const text = $("span", elements.convert);
    if (mode === "download") text.textContent = `Download (${doneCount})`;
    else if (mode === "cancel")
      text.textContent = `Cancel (${convertingCount})`;
    else if (count === 0) text.textContent = "Convert";
    else text.textContent = `Convert (${count})`;
    elements.addMore.disabled = false;
    renderSelectAll();
  }

  function renderQueue() {
    elements.fileQueue.innerHTML = "";
    for (const item of state.items) elements.fileQueue.append(renderItem(item));
    renderAction();
  }

  function renderFormats() {
    function badge(ext) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = ext;
      return b;
    }

    const frag = document.createDocumentFragment();
    for (const group of formatGroups) {
      const card = elements.formatCardTemplate.content.cloneNode(true);
      card.querySelector(".format-card-name").textContent = group.name;
      const inputTags = card.querySelector(".format-input-tags");
      for (const ext of group.inputs) inputTags.append(badge(ext));
      const outputTags = card.querySelector(".format-output-tags");
      const uniqueOutputs = [
        ...new Set(group.inputs.flatMap((e) => outputs(group.kind, e))),
      ].sort();
      for (const ext of uniqueOutputs) outputTags.append(badge(ext));
      frag.append(card);
    }
    elements.formatGrid.replaceChildren(frag);
  }

  async function run() {
    const mode = elements.convert.dataset.mode;
    if (mode === "cancel") {
      cancel();
      return;
    }

    if (mode === "download") {
      return downloadAll();
    }
    await storageReady;
    const items = selectedItems();
    if (!items.length || items.some((item) => !item.target)) {
      return;
    }
    // Skip already-done items unless all are done (re-convert)
    const targetItems = items.filter(isPending);
    if (!targetItems.length) {
      return;
    }

    for (const item of targetItems) {
      if (item.abortController) {
        item.abortController.abort();
      }
      item.abortController = new AbortController();
      item.status = "converting";
      item.progress = 1;
      item.error = "";
      item.output = null;
    }
    renderQueue();
    await acquireWakeLock();
    await transform(
      targetItems.map((item) => ({
        file: item.file,
        target: item.target,
        save: true,
        signal: item.abortController.signal,
      })),
      {
        onStart(_task, index) {
          const item = targetItems[index];
          if (!item) {
            return;
          }
          renderProgress(item);
          renderSelectAll();
          renderAction();
        },
        onProgress(_task, progress, index) {
          const item = targetItems[index];
          if (!item || item.status !== "converting") {
            return;
          }
          item.progress = Math.max(item.progress, Math.min(99, progress));
          renderProgress(item);
        },
        onComplete(_task, output, index) {
          const item = targetItems[index];
          if (!item || item.status !== "converting") {
            return;
          }
          item.output = output;
          item.status = "done";
          item.progress = 100;
          renderQueue();
        },
        onError(_task, error, index) {
          const item = targetItems[index];
          if (!item || item.status !== "converting") {
            return;
          }

          if (error?.name === "AbortError") {
            return;
          }
          item.status = "error";
          item.progress = 0;
          item.error = formatError(error);
          renderQueue();
        },
      },
    ).finally(async () => {
      await releaseWakeLock();
      renderQueue();
    });
  }

  function formatError(error) {
    const message = String(error.message);
    if (/memory|abort|out of bounds|infinity/i.test(message)) {
      return "Memory limit or aborted";
    }

    if (/codec|encoder|decoder|invalid data/i.test(message)) {
      return "Unsupported format";
    }

    if (/password|encrypted/i.test(message)) {
      return "Protected file";
    }

    if (
      /could not be found|not found/i.test(message) ||
      error.name === "NotFoundError"
    ) {
      return "File not found";
    }

    if (message.length > 40) {
      return message.slice(0, 37) + "...";
    }

    return message;
  }

  function downloadFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function downloadZip(files, archiveName) {
    const archive = await createZip(files, archiveName);
    downloadFile(archive.blob, archive.name);
  }

  async function downloadItem(item) {
    const files = item.output.files;
    if (!files.length) {
      return;
    }

    if (files.length === 1)
      downloadFile(await readFile(files[0]), files[0].name);
    else
      await downloadZip(
        files,
        `${safeName(item.file.name)}-${item.target}-pages.zip`,
      );
  }

  async function downloadAll() {
    const files = selectedItems().flatMap((item) => item.output.files);
    if (!files.length) {
      return;
    }

    if (files.length === 1) {
      downloadFile(await readFile(files[0]), files[0].name);
      return;
    }
    await downloadZip(files, "converted-files.zip");
  }

  async function acquireWakeLock() {
    if (!navigator.wakeLock?.request || wakeLock) {
      return;
    }
    wakeLock = await navigator.wakeLock.request("screen").catch(() => null);
    wakeLock?.addEventListener("release", () => {
      wakeLock = null;
    });
  }

  async function releaseWakeLock() {
    if (!wakeLock) {
      return;
    }
    await wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  function bindEvents() {
    elements.skip.addEventListener("click", () => {
      elements.conversion.scrollIntoView({ block: "start" });
      elements.conversion.focus({ preventScroll: true });
    });
    elements.formatsButton.addEventListener("click", (event) => {
      event.preventDefault();
      document
        .getElementById("formatsTitle")
        ?.scrollIntoView({ block: "start" });
    });
    elements.dropZone.addEventListener("click", () =>
      elements.fileInput.click(),
    );
    elements.dropZone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        elements.fileInput.click();
      }
    });
    elements.fileInput.addEventListener("change", (event) => {
      addFiles(event.target.files);
      event.target.value = "";
    });
    ["dragenter", "dragover"].forEach((type) =>
      elements.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        elements.dropZone.classList.add("dragover");
      }),
    );
    ["dragleave", "drop"].forEach((type) =>
      elements.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove("dragover");
      }),
    );
    elements.dropZone.addEventListener("drop", (event) =>
      addFiles(event.dataTransfer.files),
    );
    document.addEventListener("dragover", (event) => event.preventDefault());
    document.addEventListener("drop", (event) => event.preventDefault());
    elements.addMore.addEventListener("click", () =>
      elements.fileInput.click(),
    );
    elements.selectAll.addEventListener("change", () => {
      for (const item of state.items) {
        item.selected = elements.selectAll.checked;
      }
      renderWorkspace();
    });
    function bindGroupListener(checkbox, matchFn) {
      checkbox?.addEventListener("change", () => {
        const checked = checkbox.checked;
        for (const item of state.items) {
          if (matchFn(item)) item.selected = checked;
          else if (checked) item.selected = false;
        }
        renderWorkspace();
      });
    }
    bindGroupListener(elements.selectPending, isPending);
    bindGroupListener(
      elements.selectConverted,
      (item) => item.status === "done",
    );
    bindGroupListener(
      elements.selectConverting,
      (item) => item.status === "converting",
    );
    if (elements.backButton)
      elements.backButton.addEventListener("click", clearAll);
    elements.convert.addEventListener("click", run);
    elements.target.addEventListener("change", () => {
      if (!elements.target.value) {
        return;
      }
      state.target = elements.target.value;
      for (const item of selectedItems()) {
        item.target = state.target;
        clearOutput(item);
      }
      syncSelect(elements.target);
      renderWorkspace();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.processing)
        void acquireWakeLock();
    });
    document.addEventListener("theme:change", (e) => {
      elements.themeToggle?.setAttribute(
        "aria-pressed",
        String(e.detail.isDark),
      );
    });
    const isDark = document.documentElement.classList.contains("dark");
    elements.themeToggle?.setAttribute("aria-pressed", String(isDark));
  }
  renderFormats();
  renderWorkspace();
  bindEvents();
})();