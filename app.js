const SUPABASE_URL = "https://gygahndqvwnilutohhys.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rjWKhm-Vncfz0QbGreX_Wg_gTkeCfye";
const BUCKET_NAME = "zdjecia";
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let folders = [];
let photos = [];
let activeFolderId = "all";
let targetFolderForAdd = null;
let flatPhotosList = [];
let currentLightboxIdx = 0;

// Elementy DOM
const filtersBar = document.getElementById("filtersBar");
const galleryContainer = document.getElementById("galleryContainer");
const statusMsg = document.getElementById("statusMsg");

// Nowy folder
const openNewFolderBtn = document.getElementById("openNewFolderBtn");
const newFolderForm = document.getElementById("newFolderForm");
const folderNameInput = document.getElementById("folderName");
const folderDateInput = document.getElementById("folderDate");
const newFolderFilesInput = document.getElementById("newFolderFiles");
const newFolderProgress = document.getElementById("newFolderProgress");
const submitNewFolderBtn = document.getElementById("submitNewFolderBtn");

// Dodawanie zdjęć do istniejącego folderu
const addPhotosForm = document.getElementById("addPhotosForm");
const targetFolderLabel = document.getElementById("targetFolderLabel");
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

const todayStr = () => new Date().toISOString().split("T")[0];
folderDateInput.value = todayStr();

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  if (id === "newFolderModal") {
    newFolderProgress.classList.add("hidden");
    newFolderProgress.textContent = "";
    newFolderForm.reset();
    folderDateInput.value = todayStr();
  } else if (id === "addPhotosModal") {
    addPhotosProgress.classList.add("hidden");
    addPhotosProgress.textContent = "";
    addPhotosForm.reset();
    targetFolderForAdd = null;
  }
}

openNewFolderBtn.addEventListener("click", () => {
  openModal("newFolderModal");
  folderNameInput.focus();
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => closeModal(el.dataset.close));
});

function openAddPhotosModal(folder) {
  targetFolderForAdd = folder;
  targetFolderLabel.textContent = `Folder: ${folder.nazwa} (${folder.data_wydarzenia})`;
  addPhotosProgress.classList.add("hidden");
  addPhotosProgress.textContent = "";
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
          (blob) => {
            if (!blob) return reject(new Error("Nie udało się skompresować zdjęcia."));
            resolve(blob);
          },
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

// Wyciąga ścieżkę pliku w buckecie z publicznego URL Supabase
function extractStoragePath(publicUrl) {
  if (!publicUrl) return null;
  const marker = `/object/public/${BUCKET_NAME}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0]);
}

// Wysyłka listy plików do wskazanego folderu
async function uploadFilesToFolder(folderId, files, progressEl) {
  for (let i = 0; i < files.length; i++) {
    progressEl.textContent = `Kompresja i wysyłanie ${i + 1} z ${files.length}...`;

    const compressedBlob = await compressImage(files[i]);
    const filePath = `${folderId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}.jpg`;

    const { error: uploadErr } = await db.storage
      .from(BUCKET_NAME)
      .upload(filePath, compressedBlob, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadErr) throw uploadErr;

    const { data: publicUrlData } = db.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    const { error: photoErr } = await db
      .from("zdjecia")
      .insert([{ folder_id: folderId, url: publicUrlData.publicUrl }]);

    if (photoErr) throw photoErr;
  }
}

// Tworzenie nowego folderu + zdjęć
newFolderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = folderNameInput.value.trim();
  const eventDate = folderDateInput.value;
  const files = Array.from(newFolderFilesInput.files || []);

  if (!name || !eventDate || files.length === 0) return;

  submitNewFolderBtn.disabled = true;
  newFolderProgress.classList.remove("hidden");

  try {
    newFolderProgress.textContent = "Tworzenie folderu...";

    const { data: createdFolder, error: folderErr } = await db
      .from("foldery")
      .insert([{ nazwa: name, data_wydarzenia: eventDate }])
      .select()
      .single();

    if (folderErr) throw folderErr;

    await uploadFilesToFolder(createdFolder.id, files, newFolderProgress);

    newFolderProgress.textContent = "Gotowe! Odświeżam galerię...";
    await loadGallery();
    closeModal("newFolderModal");
  } catch (err) {
    console.error(err);
    newFolderProgress.textContent = `Błąd: ${err.message || "coś poszło nie tak"}`;
  } finally {
    submitNewFolderBtn.disabled = false;
  }
});

// Dorzucanie zdjęć do istniejącego folderu
addPhotosForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!targetFolderForAdd) return;

  const files = Array.from(addPhotosFilesInput.files || []);
  if (files.length === 0) return;

  submitAddPhotosBtn.disabled = true;
  addPhotosProgress.classList.remove("hidden");

  try {
    await uploadFilesToFolder(targetFolderForAdd.id, files, addPhotosProgress);
    addPhotosProgress.textContent = "Dodano zdjęcia! Odświeżam...";
    await loadGallery();
    closeModal("addPhotosModal");
  } catch (err) {
    console.error(err);
    addPhotosProgress.textContent = `Błąd: ${err.message || "coś poszło nie tak"}`;
  } finally {
    submitAddPhotosBtn.disabled = false;
  }
});

// Usuwanie pojedynczego zdjęcia
async function deletePhoto(photo) {
  const ok = confirm("Na pewno usunąć to zdjęcie?");
  if (!ok) return;

  try {
    const storagePath = extractStoragePath(photo.url);
    if (storagePath) {
      await db.storage.from(BUCKET_NAME).remove([storagePath]);
    }

    const { error } = await db.from("zdjecia").delete().eq("id", photo.id);
    if (error) throw error;

    closeLightbox();
    await loadGallery();
  } catch (err) {
    alert(`Nie udało się usunąć zdjęcia: ${err.message}`);
  }
}

// Usuwanie całego folderu wraz ze zdjęciami
async function deleteFolder(folder) {
  const folderPhotos = photos.filter((p) => p.folder_id === folder.id);
  const ok = confirm(
    `Usunąć folder „${folder.nazwa}” (${folderPhotos.length} zdjęć)? Tej operacji nie da się cofnąć.`
  );
  if (!ok) return;

  try {
    const pathsToRemove = folderPhotos
      .map((p) => extractStoragePath(p.url))
      .filter(Boolean);

    if (pathsToRemove.length > 0) {
      await db.storage.from(BUCKET_NAME).remove(pathsToRemove);
    }

    if (folderPhotos.length > 0) {
      const { error: delPhotosErr } = await db
        .from("zdjecia")
        .delete()
        .eq("folder_id", folder.id);
      if (delPhotosErr) throw delPhotosErr;
    }

    const { error: delFolderErr } = await db
      .from("foldery")
      .delete()
      .eq("id", folder.id);
    if (delFolderErr) throw delFolderErr;

    if (activeFolderId === folder.id) {
      activeFolderId = "all";
    }

    await loadGallery();
  } catch (err) {
    alert(`Nie udało się usunąć folderu: ${err.message}`);
  }
}

// Ładowanie danych
async function loadGallery() {
  statusMsg.classList.remove("hidden");
  statusMsg.textContent = "Ładowanie galerii...";

  const { data: foldersData, error: foldersErr } = await db
    .from("foldery")
    .select("*")
    .order("data_wydarzenia", { ascending: false })
    .order("utworzono", { ascending: false });

  if (foldersErr) {
    statusMsg.textContent = `Błąd ładowania folderów: ${foldersErr.message}`;
    return;
  }

  const { data: photosData, error: photosErr } = await db
    .from("zdjecia")
    .select("*")
    .order("utworzono", { ascending: true });

  if (photosErr) {
    statusMsg.textContent = `Błąd ładowania zdjęć: ${photosErr.message}`;
    return;
  }

  folders = foldersData || [];
  photos = photosData || [];

  renderFilters();
  renderGallery();
}

function renderFilters() {
  filtersBar.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = `filter-chip ${activeFolderId === "all" ? "active" : ""}`;
  allBtn.textContent = `Wszystkie (${photos.length})`;
  allBtn.addEventListener("click", () => {
    activeFolderId = "all";
    renderFilters();
    renderGallery();
  });
  filtersBar.appendChild(allBtn);

  folders.forEach((folder) => {
    const count = photos.filter((p) => p.folder_id === folder.id).length;
    const btn = document.createElement("button");
    btn.className = `filter-chip ${activeFolderId === folder.id ? "active" : ""}`;
    btn.textContent = `${folder.data_wydarzenia} · ${folder.nazwa} (${count})`;
    btn.addEventListener("click", () => {
      activeFolderId = folder.id;
      renderFilters();
      renderGallery();
    });
    filtersBar.appendChild(btn);
  });
}

function renderGallery() {
  galleryContainer.innerHTML = "";
  flatPhotosList = [];

  const visibleFolders =
    activeFolderId === "all"
      ? folders
      : folders.filter((f) => f.id === activeFolderId);

  if (visibleFolders.length === 0) {
    statusMsg.classList.remove("hidden");
    statusMsg.textContent =
      "Nie ma jeszcze żadnych folderów. Kliknij „+ Nowy folder”, żeby dodać pierwsze zdjęcia.";
    return;
  }

  statusMsg.classList.add("hidden");

  visibleFolders.forEach((folder) => {
    const folderPhotos = photos.filter((p) => p.folder_id === folder.id);

    const section = document.createElement("section");
    section.className = "folder-section";

    const header = document.createElement("div");
    header.className = "folder-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.className = "folder-title";
    title.textContent = folder.nazwa;

    const meta = document.createElement("div");
    meta.className = "folder-meta";
    meta.textContent = `${folder.data_wydarzenia} • ${folderPhotos.length} zdjęć`;

    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "folder-actions";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-secondary btn-sm";
    addBtn.textContent = "+ Dodaj zdjęcia";
    addBtn.addEventListener("click", () => openAddPhotosModal(folder));

    const delFolderBtn = document.createElement("button");
    delFolderBtn.type = "button";
    delFolderBtn.className = "btn btn-danger btn-sm";
    delFolderBtn.textContent = "Usuń folder";
    delFolderBtn.addEventListener("click", () => deleteFolder(folder));

    actions.appendChild(addBtn);
    actions.appendChild(delFolderBtn);

    header.appendChild(titleWrap);
    header.appendChild(actions);
    section.appendChild(header);

    if (folderPhotos.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Brak zdjęć w tym folderze — kliknij „+ Dodaj zdjęcia”.";
      section.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "photo-grid";

      folderPhotos.forEach((photo, idx) => {
        const globalIndex = flatPhotosList.length;
        const filename = `${folder.data_wydarzenia}_${folder.nazwa}_${idx + 1}.jpg`.replace(/\s+/g, "_");

        flatPhotosList.push({
          photo,
          url: photo.url,
          caption: `${folder.data_wydarzenia} — ${folder.nazwa} (${idx + 1}/${folderPhotos.length})`,
          filename,
        });

        const card = document.createElement("div");
        card.className = "photo-card";

        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = folder.nazwa;
        img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(globalIndex));

        const overlay = document.createElement("div");
        overlay.className = "photo-overlay-actions";

        const dlBtn = document.createElement("a");
        dlBtn.className = "photo-chip-btn";
        dlBtn.href = photo.url;
        dlBtn.download = filename;
        dlBtn.textContent = "Pobierz";
        dlBtn.addEventListener("click", (ev) => ev.stopPropagation());

        const delPhotoBtn = document.createElement("button");
        delPhotoBtn.type = "button";
        delPhotoBtn.className = "photo-chip-btn danger";
        delPhotoBtn.textContent = "✕";
        delPhotoBtn.title = "Usuń zdjęcie";
        delPhotoBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          deletePhoto(photo);
        });

        overlay.appendChild(dlBtn);
        overlay.appendChild(delPhotoBtn);

        card.appendChild(img);
        card.appendChild(overlay);
        grid.appendChild(card);
      });

      section.appendChild(grid);
    }

    galleryContainer.appendChild(section);
  });
}

// Lightbox
function openLightbox(index) {
  if (!flatPhotosList.length) return;
  currentLightboxIdx = index;
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
