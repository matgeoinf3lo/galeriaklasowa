const SUPABASE_URL = "https://gygahndqvwnilutohhys.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rjWKhm-Vncfz0QbGreX_Wg_gTkeCfye";
const BUCKET_NAME = "zdjecia";
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

const POLISH_MONTHS = [
  "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let folders = [];
let photos = [];

let activeMonthKey = "all";
let activeFolderId = "all";
let sortMode = "newest"; // "newest" | "oldest" | "most-photos"
let folderCreateMode = "month"; // "month" | "event"
let targetFolderForAdd = null;
let flatPhotosList = [];
let currentLightboxIdx = 0;

// Elementy DOM
const openNewFolderBtn = document.getElementById("openNewFolderBtn");
const monthFiltersEl = document.getElementById("monthFilters");
const folderFiltersEl = document.getElementById("folderFilters");
const sortControlsEl = document.getElementById("sortControls");
const galleryStatusEl = document.getElementById("galleryStatus");
const galleryContainerEl = document.getElementById("galleryContainer");
const toastEl = document.getElementById("toast");

// Modal nowego folderu
const newFolderForm = document.getElementById("newFolderForm");
const folderNameLabel = document.getElementById("folderNameLabel");
const folderNameInput = document.getElementById("folderName");
const monthOnlyInputs = document.getElementById("monthOnlyInputs");
const folderMonthSelect = document.getElementById("folderMonthSelect");
const folderYearInput = document.getElementById("folderYearInput");
const exactDateField = document.getElementById("exactDateField");
const folderDateInput = document.getElementById("folderDate");
const newFolderFilesInput = document.getElementById("newFolderFiles");
const newFolderProgress = document.getElementById("newFolderProgress");
const submitNewFolderBtn = document.getElementById("submitNewFolderBtn");

// Modal dodawania zdjęć
const addPhotosForm = document.getElementById("addPhotosForm");
const targetFolderBanner = document.getElementById("targetFolderBanner");
const addPhotosFilesInput = document.getElementById("addPhotosFiles");
const addPhotosProgress = document.getElementById("addPhotosProgress");
const submitAddPhotosBtn = document.getElementById("submitAddPhotosBtn");

// Lightbox
const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCaption = document.getElementById("lbCaption");
const lbDownload = document.getElementById("lbDownload");
const lbDelete = document.getElementById("lbDelete");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");

const now = new Date();
const todayStr = () => new Date().toISOString().split("T")[0];

POLISH_MONTHS.forEach((mName, idx) => {
  const opt = document.createElement("option");
  opt.value = String(idx + 1).padStart(2, "0");
  opt.textContent = mName;
  folderMonthSelect.appendChild(opt);
});

function resetFolderFormDefaults() {
  folderMonthSelect.value = String(now.getMonth() + 1).padStart(2, "0");
  folderYearInput.value = String(now.getFullYear());
  folderDateInput.value = todayStr();
  setFolderCreateMode("month");
}

function setFolderCreateMode(mode) {
  folderCreateMode = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  const isMonthOnly = mode === "month";
  monthOnlyInputs.classList.toggle("hidden", !isMonthOnly);
  exactDateField.classList.toggle("hidden", isMonthOnly);

  if (isMonthOnly) {
    folderNameLabel.textContent = "Nazwa folderu na miesiąc";
    folderNameInput.placeholder = "np. Lekcje / różne";
    folderDateInput.required = false;
  } else {
    folderNameLabel.textContent = "Nazwa wydarzenia";
    folderNameInput.placeholder = "np. Wyjście klasowe";
    folderDateInput.required = true;
  }
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setFolderCreateMode(btn.dataset.mode));
});

resetFolderFormDefaults();

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.add("hidden"), 2300);
}

// Sortowanie
sortControlsEl.querySelectorAll("[data-sort]").forEach((btn) => {
  btn.addEventListener("click", () => {
    sortMode = btn.dataset.sort;
    sortControlsEl.querySelectorAll("[data-sort]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderGallery();
  });
});

// Parsowanie daty: dzień "01" oznacza folder tylko po miesiącu i roku
function parseFolderDateInfo(dateStr) {
  if (!dateStr) {
    return { key: "brak", label: "Bez daty", isMonthOnly: false, fullDate: "" };
  }
  const [year, month, day] = dateStr.split("-");
  const mIdx = parseInt(month, 10) - 1;
  const monthName = POLISH_MONTHS[mIdx] || month;
  return {
    key: `${year}-${month}`,
    label: `${monthName} ${year}`,
    isMonthOnly: day === "01",
    fullDate: dateStr,
  };
}

// Modale
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  if (id === "newFolderModal") {
    newFolderProgress.classList.add("hidden");
    newFolderForm.reset();
    resetFolderFormDefaults();
  } else if (id === "addPhotosModal") {
    addPhotosProgress.classList.add("hidden");
    addPhotosForm.reset();
    targetFolderForAdd = null;
  }
}

openNewFolderBtn.addEventListener("click", () => {
  resetFolderFormDefaults();
  openModal("newFolderModal");
  folderNameInput.focus();
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => closeModal(el.dataset.close));
});

function openAddPhotosModal(folder) {
  targetFolderForAdd = folder;
  const info = parseFolderDateInfo(folder.data_wydarzenia);
  const dateText = info.isMonthOnly ? `${info.label} (cały miesiąc)` : `${folder.data_wydarzenia} (${info.label})`;
  targetFolderBanner.textContent = `${folder.nazwa} • ${dateText}`;
  addPhotosProgress.classList.add("hidden");
  addPhotosForm.reset();
  openModal("addPhotosModal");
}

// Kompresja obrazu w przeglądarce
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Nie udało się skompresować zdjęcia."))),
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.onerror = () => reject(new Error("Błąd odczytu obrazu."));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("Błąd pliku."));
    reader.readAsDataURL(file);
  });
}

function extractStoragePath(publicUrl) {
  if (!publicUrl) return null;
  const marker = `/object/public/${BUCKET_NAME}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0]);
}

async function uploadFilesToFolder(folderId, files, progressEl) {
  for (let i = 0; i < files.length; i++) {
    progressEl.textContent = `Kompresja i wysyłanie ${i + 1} z ${files.length}...`;
    const compressedBlob = await compressImage(files[i]);
    const filePath = `${folderId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}.jpg`;

    const { error: upErr } = await db.storage
      .from(BUCKET_NAME)
      .upload(filePath, compressedBlob, { contentType: "image/jpeg", upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = db.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    const { error: dbErr } = await db
      .from("zdjecia")
      .insert([{ folder_id: folderId, url: urlData.publicUrl }]);
    if (dbErr) throw dbErr;
  }
}

newFolderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = folderNameInput.value.trim();
  const files = Array.from(newFolderFilesInput.files || []);
  if (!name || files.length === 0) return;

  let eventDate;
  if (folderCreateMode === "month") {
    const yearVal = parseInt(folderYearInput.value, 10);
    const monthVal = folderMonthSelect.value;
    if (!yearVal || yearVal < 2000 || yearVal > 2099) {
      alert("Podaj poprawny rocznik (np. 2026).");
      return;
    }
    eventDate = `${yearVal}-${monthVal}-01`;
  } else {
    eventDate = folderDateInput.value;
    if (!eventDate) return;
  }

  submitNewFolderBtn.disabled = true;
  newFolderProgress.classList.remove("hidden");

  try {
    newFolderProgress.textContent = "Tworzenie folderu...";
    const { data: created, error } = await db
      .from("foldery")
      .insert([{ nazwa: name, data_wydarzenia: eventDate }])
      .select()
      .single();
    if (error) throw error;

    await uploadFilesToFolder(created.id, files, newFolderProgress);
    await loadGallery();
    closeModal("newFolderModal");
    showToast("Utworzono folder!");
  } catch (err) {
    newFolderProgress.textContent = `Błąd: ${err.message}`;
  } finally {
    submitNewFolderBtn.disabled = false;
  }
});

addPhotosForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!targetFolderForAdd) return;
  const files = Array.from(addPhotosFilesInput.files || []);
  if (files.length === 0) return;

  submitAddPhotosBtn.disabled = true;
  addPhotosProgress.classList.remove("hidden");

  try {
    await uploadFilesToFolder(targetFolderForAdd.id, files, addPhotosProgress);
    await loadGallery();
    closeModal("addPhotosModal");
    showToast("Dodano zdjęcia!");
  } catch (err) {
    addPhotosProgress.textContent = `Błąd: ${err.message}`;
  } finally {
    submitAddPhotosBtn.disabled = false;
  }
});

async function deletePhoto(photo) {
  if (!confirm("Usunąć to zdjęcie?")) return;
  try {
    const path = extractStoragePath(photo.url);
    if (path) await db.storage.from(BUCKET_NAME).remove([path]);

    const { error } = await db.from("zdjecia").delete().eq("id", photo.id);
    if (error) throw error;

    closeLightbox();
    await loadGallery();
    showToast("Usunięto zdjęcie.");
  } catch (err) {
    alert(`Błąd usuwania: ${err.message}`);
  }
}

async function deleteFolder(folder) {
  const folderPhotos = photos.filter((p) => p.folder_id === folder.id);
  if (!confirm(`Usunąć folder „${folder.nazwa}” (${folderPhotos.length} zdjęć)?`)) return;

  try {
    const paths = folderPhotos.map((p) => extractStoragePath(p.url)).filter(Boolean);
    if (paths.length) await db.storage.from(BUCKET_NAME).remove(paths);
    if (folderPhotos.length) {
      const { error } = await db.from("zdjecia").delete().eq("folder_id", folder.id);
      if (error) throw error;
    }
    const { error: fErr } = await db.from("foldery").delete().eq("id", folder.id);
    if (fErr) throw fErr;

    if (activeFolderId === folder.id) activeFolderId = "all";
    await loadGallery();
    showToast("Folder usunięty.");
  } catch (err) {
    alert(`Błąd usuwania folderu: ${err.message}`);
  }
}

async function loadGallery() {
  galleryStatusEl.classList.remove("hidden");
  galleryStatusEl.textContent = "Ładowanie galerii...";

  const [fRes, pRes] = await Promise.all([
    db.from("foldery").select("*").order("data_wydarzenia", { ascending: false }).order("utworzono", { ascending: false }),
    db.from("zdjecia").select("*").order("utworzono", { ascending: true }),
  ]);

  if (fRes.error || pRes.error) {
    galleryStatusEl.textContent = `Błąd ładowania: ${(fRes.error || pRes.error).message}`;
    return;
  }

  folders = fRes.data || [];
  photos = pRes.data || [];

  renderFilters();
  renderGallery();
}

function getSortedFolders(list) {
  const copy = [...list];
  if (sortMode === "oldest") {
    return copy.sort((a, b) => (a.data_wydarzenia || "").localeCompare(b.data_wydarzenia || ""));
  }
  if (sortMode === "most-photos") {
    const countMap = new Map();
    folders.forEach((f) => {
      countMap.set(f.id, photos.filter((p) => p.folder_id === f.id).length);
    });
    return copy.sort((a, b) => (countMap.get(b.id) || 0) - (countMap.get(a.id) || 0));
  }
  return copy.sort((a, b) => (b.data_wydarzenia || "").localeCompare(a.data_wydarzenia || ""));
}

function renderFilters() {
  monthFiltersEl.innerHTML = "";
  folderFiltersEl.innerHTML = "";

  const monthMap = new Map();
  getSortedFolders(folders).forEach((f) => {
    const info = parseFolderDateInfo(f.data_wydarzenia);
    if (!monthMap.has(info.key)) {
      monthMap.set(info.key, info.label);
    }
  });

  const allMonthsBtn = document.createElement("button");
  allMonthsBtn.className = `chip ${activeMonthKey === "all" ? "active" : ""}`;
  allMonthsBtn.textContent = "Wszystkie";
  allMonthsBtn.addEventListener("click", () => {
    activeMonthKey = "all";
    activeFolderId = "all";
    renderFilters();
    renderGallery();
  });
  monthFiltersEl.appendChild(allMonthsBtn);

  monthMap.forEach((label, key) => {
    const btn = document.createElement("button");
    btn.className = `chip ${activeMonthKey === key ? "active" : ""}`;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeMonthKey = key;
      activeFolderId = "all";
      renderFilters();
      renderGallery();
    });
    monthFiltersEl.appendChild(btn);
  });

  const candidateFolders = getSortedFolders(folders).filter((f) => {
    return activeMonthKey === "all" || parseFolderDateInfo(f.data_wydarzenia).key === activeMonthKey;
  });

  const allFoldersBtn = document.createElement("button");
  allFoldersBtn.className = `chip ${activeFolderId === "all" ? "active" : ""}`;
  allFoldersBtn.textContent = "Wszystkie";
  allFoldersBtn.addEventListener("click", () => {
    activeFolderId = "all";
    renderFilters();
    renderGallery();
  });
  folderFiltersEl.appendChild(allFoldersBtn);

  candidateFolders.forEach((f) => {
    const count = photos.filter((p) => p.folder_id === f.id).length;
    const info = parseFolderDateInfo(f.data_wydarzenia);
    const btn = document.createElement("button");
    btn.className = `chip ${activeFolderId === f.id ? "active" : ""}`;
    btn.textContent = `${f.nazwa} (${count})${info.isMonthOnly ? " • mies." : ""}`;
    btn.addEventListener("click", () => {
      activeFolderId = f.id;
      renderFilters();
      renderGallery();
    });
    folderFiltersEl.appendChild(btn);
  });
}

function renderGallery() {
  galleryContainerEl.innerHTML = "";
  flatPhotosList = [];

  const filtered = getSortedFolders(folders).filter((f) => {
    const monthOk = activeMonthKey === "all" || parseFolderDateInfo(f.data_wydarzenia).key === activeMonthKey;
    const folderOk = activeFolderId === "all" || f.id === activeFolderId;
    return monthOk && folderOk;
  });

  if (filtered.length === 0) {
    galleryStatusEl.classList.remove("hidden");
    galleryStatusEl.textContent = "Brak folderów. Kliknij „+ Nowy folder”, żeby dodać folder na miesiąc lub wydarzenie.";
    return;
  }

  galleryStatusEl.classList.add("hidden");

  const groupedByMonth = new Map();
  filtered.forEach((folder) => {
    const info = parseFolderDateInfo(folder.data_wydarzenia);
    if (!groupedByMonth.has(info.key)) {
      groupedByMonth.set(info.key, { label: info.label, folders: [] });
    }
    groupedByMonth.get(info.key).folders.push(folder);
  });

  groupedByMonth.forEach((group) => {
    const monthBlock = document.createElement("div");
    monthBlock.className = "month-block";

    const monthPhotosCount = group.folders.reduce(
      (sum, f) => sum + photos.filter((p) => p.folder_id === f.id).length,
      0
    );

    const monthHeader = document.createElement("div");
    monthHeader.className = "month-header";
    monthHeader.innerHTML = `
      <h2 class="month-heading">
        ${group.label}
        <span class="month-pill">${group.folders.length} folderów · ${monthPhotosCount} zdjęć</span>
      </h2>
    `;
    monthBlock.appendChild(monthHeader);

    group.folders.forEach((folder) => {
      const folderPhotos = photos.filter((p) => p.folder_id === folder.id);
      const info = parseFolderDateInfo(folder.data_wydarzenia);
      const card = document.createElement("article");
      card.className = "folder-card";

      const top = document.createElement("div");
      top.className = "folder-top";

      const infoBox = document.createElement("div");
      const subLabel = info.isMonthOnly
        ? `Cały miesiąc: ${info.label} • ${folderPhotos.length} zdjęć`
        : `${folder.data_wydarzenia} • ${folderPhotos.length} zdjęć`;

      infoBox.innerHTML = `
        <div class="folder-title-row">
          <h3 class="folder-title">${folder.nazwa}</h3>
          ${info.isMonthOnly ? `<span class="tag-month-only">Tylko miesiąc</span>` : ""}
        </div>
        <div class="folder-meta">${subLabel}</div>
      `;

      const actions = document.createElement("div");
      actions.className = "folder-actions";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-secondary btn-sm";
      addBtn.textContent = "+ Dodaj zdjęcia";
      addBtn.addEventListener("click", () => openAddPhotosModal(folder));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "Usuń";
      delBtn.addEventListener("click", () => deleteFolder(folder));

      actions.append(addBtn, delBtn);
      top.append(infoBox, actions);
      card.appendChild(top);

      if (folderPhotos.length === 0) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "Brak zdjęć — kliknij „+ Dodaj zdjęcia”.";
        card.appendChild(empty);
      } else {
        const grid = document.createElement("div");
        grid.className = "photo-grid";

        folderPhotos.forEach((photo, idx) => {
          const globalIdx = flatPhotosList.length;
          const filename = `${info.key}_${folder.nazwa}_${idx + 1}.jpg`.replace(/\s+/g, "_");
          flatPhotosList.push({
            photo,
            url: photo.url,
            caption: `${info.label} — ${folder.nazwa} (${idx + 1}/${folderPhotos.length})`,
            filename,
          });

          const tile = document.createElement("div");
          tile.className = "photo-tile";

          const img = document.createElement("img");
          img.src = photo.url;
          img.alt = folder.nazwa;
          img.loading = "lazy";
          img.addEventListener("click", () => openLightbox(globalIdx));

          const bar = document.createElement("div");
          bar.className = "tile-bar";

          const dl = document.createElement("a");
          dl.className = "tile-btn";
          dl.href = photo.url;
          dl.download = filename;
          dl.textContent = "Pobierz";
          dl.addEventListener("click", (e) => e.stopPropagation());

          const rm = document.createElement("button");
          rm.type = "button";
          rm.className = "tile-btn danger";
          rm.textContent = "✕";
          rm.title = "Usuń zdjęcie";
          rm.addEventListener("click", (e) => {
            e.stopPropagation();
            deletePhoto(photo);
          });

          bar.append(dl, rm);
          tile.append(img, bar);
          grid.appendChild(tile);
        });

        card.appendChild(grid);
      }

      monthBlock.appendChild(card);
    });

    galleryContainerEl.appendChild(monthBlock);
  });
}

// Lightbox
function openLightbox(idx) {
  if (!flatPhotosList.length) return;
  currentLightboxIdx = idx;
  updateLightbox();
  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  lightbox.classList.add("hidden");
}

function updateLightbox() {
  const item = flatPhotosList[currentLightboxIdx];
  if (!item) return;
  lbImg.src = item.url;
  lbCaption.textContent = item.caption;
  lbDownload.href = item.url;
  lbDownload.download = item.filename;
  lbDelete.onclick = () => deletePhoto(item.photo);
}

function prevPhoto() {
  currentLightboxIdx = (currentLightboxIdx - 1 + flatPhotosList.length) % flatPhotosList.length;
  updateLightbox();
}

function nextPhoto() {
  currentLightboxIdx = (currentLightboxIdx + 1) % flatPhotosList.length;
  updateLightbox();
}

lbClose.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", prevPhoto);
lbNext.addEventListener("click", nextPhoto);

document.addEventListener("keydown", (e) => {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") prevPhoto();
  if (e.key === "ArrowRight") nextPhoto();
});

loadGallery();
