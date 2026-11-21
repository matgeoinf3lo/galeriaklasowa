const SUPABASE_URL = "https://gygahndqvwnilutohhys.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rjWKhm-Vncfz0QbGreX_Wg_gTkeCfye";
const BUCKET_NAME = "zdjecia";
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let folders = [];
let photos = [];
let activeFolderId = "all";
let flatPhotosList = [];
let currentLightboxIdx = 0;

// Elementy DOM
const filtersBar = document.getElementById("filtersBar");
const galleryContainer = document.getElementById("galleryContainer");
const statusMsg = document.getElementById("statusMsg");

const folderModal = document.getElementById("folderModal");
const openModalBtn = document.getElementById("openModalBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelModalBtn = document.getElementById("cancelModalBtn");
const closeModalBackdrop = document.getElementById("closeModalBackdrop");
const folderForm = document.getElementById("folderForm");
const folderNameInput = document.getElementById("folderName");
const folderDateInput = document.getElementById("folderDate");
const folderFilesInput = document.getElementById("folderFiles");
const uploadProgress = document.getElementById("uploadProgress");
const submitFolderBtn = document.getElementById("submitFolderBtn");

const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbCaption = document.getElementById("lbCaption");
const lbDownload = document.getElementById("lbDownload");
const lbClose = document.getElementById("lbClose");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");

// Ustaw domyślną datę na dzisiaj
folderDateInput.value = new Date().toISOString().split("T")[0];

// Modal
function openModal() {
  folderModal.classList.remove("hidden");
  folderNameInput.focus();
}

function closeModal() {
  folderModal.classList.add("hidden");
  uploadProgress.classList.add("hidden");
  uploadProgress.textContent = "";
  folderForm.reset();
  folderDateInput.value = new Date().toISOString().split("T")[0];
}

openModalBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
cancelModalBtn.addEventListener("click", closeModal);
closeModalBackdrop.addEventListener("click", closeModal);

// Kompresja obrazu w przeglądarce przed wysyłką
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

// Dodawanie nowego folderu i zdjęć
folderForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = folderNameInput.value.trim();
  const eventDate = folderDateInput.value;
  const files = Array.from(folderFilesInput.files || []);

  if (!name || !eventDate || files.length === 0) return;

  submitFolderBtn.disabled = true;
  uploadProgress.classList.remove("hidden");

  try {
    uploadProgress.textContent = "Tworzenie folderu w bazie...";

    const { data: createdFolder, error: folderErr } = await db
      .from("foldery")
      .insert([{ nazwa: name, data_wydarzenia: eventDate }])
      .select()
      .single();

    if (folderErr) throw folderErr;

    for (let i = 0; i < files.length; i++) {
      uploadProgress.textContent = `Kompresja i wysyłanie zdjęcia ${i + 1} z ${files.length}...`;

      const compressedBlob = await compressImage(files[i]);
      const filePath = `${createdFolder.id}/${Date.now()}_${i}.jpg`;

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
        .insert([{ folder_id: createdFolder.id, url: publicUrlData.publicUrl }]);

      if (photoErr) throw photoErr;
    }

    uploadProgress.textContent = "Gotowe! Odświeżam galerię...";
    await loadGallery();
    closeModal();
  } catch (err) {
    console.error(err);
    uploadProgress.textContent = `Błąd: ${err.message || "coś poszło nie tak"}`;
  } finally {
    submitFolderBtn.disabled = false;
  }
});

// Pobieranie folderów i zdjęć
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
    statusMsg.textContent = "Nie ma jeszcze żadnych folderów. Kliknij „+ Nowy folder”, żeby dodać pierwsze zdjęcia.";
    return;
  }

  statusMsg.classList.add("hidden");

  visibleFolders.forEach((folder) => {
    const folderPhotos = photos.filter((p) => p.folder_id === folder.id);

    const section = document.createElement("section");
    section.className = "folder-section";

    const header = document.createElement("div");
    header.className = "folder-header";

    const title = document.createElement("h2");
    title.className = "folder-title";
    title.textContent = folder.nazwa;

    const meta = document.createElement("div");
    meta.className = "folder-meta";
    meta.textContent = `${folder.data_wydarzenia} • ${folderPhotos.length} zdjęć`;

    header.appendChild(title);
    header.appendChild(meta);
    section.appendChild(header);

    if (folderPhotos.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Brak zdjęć w tym folderze.";
      section.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "photo-grid";

      folderPhotos.forEach((photo, idx) => {
        const globalIndex = flatPhotosList.length;
        flatPhotosList.push({
          url: photo.url,
          caption: `${folder.data_wydarzenia} — ${folder.nazwa} (${idx + 1}/${folderPhotos.length})`,
          filename: `${folder.data_wydarzenia}_${folder.nazwa}_${idx + 1}.jpg`.replace(/\s+/g, "_"),
        });

        const card = document.createElement("div");
        card.className = "photo-card";

        const img = document.createElement("img");
        img.src = photo.url;
        img.alt = folder.nazwa;
        img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(globalIndex));

        const dlBtn = document.createElement("a");
        dlBtn.className = "photo-dl-btn";
        dlBtn.href = photo.url;
        dlBtn.download = `${folder.data_wydarzenia}_${folder.nazwa}_${idx + 1}.jpg`.replace(/\s+/g, "_");
        dlBtn.textContent = "Pobierz";
        dlBtn.addEventListener("click", (ev) => ev.stopPropagation());

        card.appendChild(img);
        card.appendChild(dlBtn);
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
