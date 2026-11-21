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
let polls = [];
let responses = [];

let activeMonthKey = "all"; // np. "2026-11"
let activeFolderId = "all";
let targetFolderForAdd = null;
let flatPhotosList = [];
let currentLightboxIdx = 0;
let highlightedPollId = null;

// Elementy DOM
const tabGalleryBtn = document.getElementById("tabGalleryBtn");
const tabPollsBtn = document.getElementById("tabPollsBtn");
const openNewFolderBtn = document.getElementById("openNewFolderBtn");
const openNewPollBtn = document.getElementById("openNewPollBtn");

const galleryView = document.getElementById("galleryView");
const pollsView = document.getElementById("pollsView");

const galleryCountBadge = document.getElementById("galleryCountBadge");
const pollsCountBadge = document.getElementById("pollsCountBadge");

const monthFiltersEl = document.getElementById("monthFilters");
const folderFiltersEl = document.getElementById("folderFilters");
const galleryStatusEl = document.getElementById("galleryStatus");
const galleryContainerEl = document.getElementById("galleryContainer");

const pollsStatusEl = document.getElementById("pollsStatus");
const pollsContainerEl = document.getElementById("pollsContainer");
const toastEl = document.getElementById("toast");

// Modale
const newFolderForm = document.getElementById("newFolderForm");
const folderNameInput = document.getElementById("folderName");
const folderDateInput = document.getElementById("folderDate");
const newFolderFilesInput = document.getElementById("newFolderFiles");
const newFolderProgress = document.getElementById("newFolderProgress");
const submitNewFolderBtn = document.getElementById("submitNewFolderBtn");

const addPhotosForm = document.getElementById("addPhotosForm");
const targetFolderBanner = document.getElementById("targetFolderBanner");
const addPhotosFilesInput = document.getElementById("addPhotosFiles");
const addPhotosProgress = document.getElementById("addPhotosProgress");
const submitAddPhotosBtn = document.getElementById("submitAddPhotosBtn");

const newPollForm = document.getElementById("newPollForm");
const pollTitleInput = document.getElementById("pollTitle");
const pollDescInput = document.getElementById("pollDesc");
const pollTypeSelect = document.getElementById("pollType");
const pollOptionsField = document.getElementById("pollOptionsField");
const pollOptionsTextarea = document.getElementById("pollOptions");
const newPollProgress = document.getElementById("newPollProgress");
const submitNewPollBtn = document.getElementById("submitNewPollBtn");

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

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toastEl.classList.add("hidden"), 2400);
}

// Przełączanie zakładek
function switchTab(tabName) {
  const isGallery = tabName === "gallery";
  galleryView.classList.toggle("hidden", !isGallery);
  pollsView.classList.toggle("hidden", isGallery);

  tabGalleryBtn.classList.toggle("active", isGallery);
  tabPollsBtn.classList.toggle("active", !isGallery);

  openNewFolderBtn.classList.toggle("hidden", !isGallery);
  openNewPollBtn.classList.toggle("hidden", isGallery);
}

tabGalleryBtn.addEventListener("click", () => switchTab("gallery"));
tabPollsBtn.addEventListener("click", () => switchTab("polls"));

// Formatowanie miesiąca + rocznika z daty YYYY-MM-DD
function getMonthInfo(dateStr) {
  if (!dateStr) return { key: "brak", label: "Bez daty" };
  const [year, month] = dateStr.split("-");
  const mIdx = parseInt(month, 10) - 1;
  const monthName = POLISH_MONTHS[mIdx] || month;
  return {
    key: `${year}-${month}`,
    label: `${monthName} ${year}`,
  };
}

// Modale ogólne
function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
  if (id === "newFolderModal") {
    newFolderProgress.classList.add("hidden");
    newFolderForm.reset();
    folderDateInput.value = todayStr();
  } else if (id === "addPhotosModal") {
    addPhotosProgress.classList.add("hidden");
    addPhotosForm.reset();
    targetFolderForAdd = null;
  } else if (id === "newPollModal") {
    newPollProgress.classList.add("hidden");
    newPollForm.reset();
    pollOptionsField.classList.remove("hidden");
  }
}

openNewFolderBtn.addEventListener("click", () => {
  openModal("newFolderModal");
  folderNameInput.focus();
});

openNewPollBtn.addEventListener("click", () => {
  openModal("newPollModal");
  pollTitleInput.focus();
});

pollTypeSelect.addEventListener("change", () => {
  pollOptionsField.classList.toggle("hidden", pollTypeSelect.value !== "wybor");
});

document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => closeModal(el.dataset.close));
});

function openAddPhotosModal(folder) {
  targetFolderForAdd = folder;
  const m = getMonthInfo(folder.data_wydarzenia);
  targetFolderBanner.textContent = `${folder.nazwa} • ${m.label} (${folder.data_wydarzenia})`;
  addPhotosProgress.classList.add("hidden");
  addPhotosForm.reset();
  openModal("addPhotosModal");
}

// Kompresja zdjęcia
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
          (blob) => (blob ? resolve(blob) : reject(new Error("Błąd kompresji."))),
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
  const eventDate = folderDateInput.value;
  const files = Array.from(newFolderFilesInput.files || []);
  if (!name || !eventDate || files.length === 0) return;

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
    await loadAllData();
    closeModal("newFolderModal");
    showToast("Utworzono nowy folder!");
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
    await loadAllData();
    closeModal("addPhotosModal");
    showToast("Dodano zdjęcia do folderu!");
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
    await loadAllData();
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
    await loadAllData();
    showToast("Folder usunięty.");
  } catch (err) {
    alert(`Błąd usuwania folderu: ${err.message}`);
  }
}

// Ankiety
newPollForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const tytul = pollTitleInput.value.trim();
  const opis = pollDescInput.value.trim() || null;
  const typ = pollTypeSelect.value;
  const opcje =
    typ === "wybor"
      ? pollOptionsTextarea.value
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (!tytul) return;
  if (typ === "wybor" && opcje.length < 2) {
    alert("Podaj co najmniej 2 opcje (każdą w nowej linii).");
    return;
  }

  submitNewPollBtn.disabled = true;
  newPollProgress.classList.remove("hidden");
  newPollProgress.textContent = "Zapisywanie ankiety...";

  try {
    const { data, error } = await db
      .from("ankiety")
      .insert([{ tytul, opis, typ, opcje }])
      .select()
      .single();
    if (error) throw error;

    highlightedPollId = data.id;
    await loadAllData();
    closeModal("newPollModal");
    showToast("Ankieta utworzona — możesz skopiować link!");
  } catch (err) {
    newPollProgress.textContent = `Błąd: ${err.message}`;
  } finally {
    submitNewPollBtn.disabled = false;
  }
});

async function submitPollResponse(poll, autor, odpowiedz) {
  const { error } = await db
    .from("odpowiedzi")
    .insert([{ ankieta_id: poll.id, autor: autor.trim(), odpowiedz: odpowiedz.trim() }]);
  if (error) throw error;
  await loadAllData();
  showToast("Odpowiedź zapisana!");
}

async function deletePoll(poll) {
  if (!confirm(`Usunąć ankietę „${poll.tytul}” wraz z odpowiedziami?`)) return;
  const { error } = await db.from("ankiety").delete().eq("id", poll.id);
  if (error) {
    alert(`Błąd: ${error.message}`);
    return;
  }
  await loadAllData();
  showToast("Ankieta usunięta.");
}

function getPollShareUrl(pollId) {
  const url = new URL(window.location.href);
  url.hash = `ankieta=${pollId}`;
  return url.toString();
}

function copyPollLink(pollId) {
  const link = getPollShareUrl(pollId);
  navigator.clipboard?.writeText(link).catch(() => {});
  showToast("Skopiowano link do ankiety na grupę!");
}

// Ładowanie danych
async function loadAllData() {
  const [fRes, pRes, pollRes, respRes] = await Promise.all([
    db.from("foldery").select("*").order("data_wydarzenia", { ascending: false }).order("utworzono", { ascending: false }),
    db.from("zdjecia").select("*").order("utworzono", { ascending: true }),
    db.from("ankiety").select("*").order("utworzono", { ascending: false }),
    db.from("odpowiedzi").select("*").order("utworzono", { ascending: true }),
  ]);

  if (fRes.error || pRes.error) {
    galleryStatusEl.classList.remove("hidden");
    galleryStatusEl.textContent = `Błąd galerii: ${(fRes.error || pRes.error).message}`;
  } else {
    folders = fRes.data || [];
    photos = pRes.data || [];
    galleryCountBadge.textContent = photos.length;
    renderGalleryFilters();
    renderGallery();
  }

  if (pollRes.error || respRes.error) {
    pollsStatusEl.classList.remove("hidden");
    pollsStatusEl.textContent = `Błąd ankiet: ${(pollRes.error || respRes.error).message}`;
  } else {
    polls = pollRes.data || [];
    responses = respRes.data || [];
    pollsCountBadge.textContent = polls.length;
    renderPolls();
  }
}

function renderGalleryFilters() {
  monthFiltersEl.innerHTML = "";
  folderFiltersEl.innerHTML = "";

  // Miesiące + roczniki
  const monthMap = new Map();
  folders.forEach((f) => {
    const info = getMonthInfo(f.data_wydarzenia);
    if (!monthMap.has(info.key)) {
      monthMap.set(info.key, info.label);
    }
  });

  const allMonthsBtn = document.createElement("button");
  allMonthsBtn.className = `chip ${activeMonthKey === "all" ? "active" : ""}`;
  allMonthsBtn.textContent = "Wszystkie miesiące";
  allMonthsBtn.addEventListener("click", () => {
    activeMonthKey = "all";
    activeFolderId = "all";
    renderGalleryFilters();
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
      renderGalleryFilters();
      renderGallery();
    });
    monthFiltersEl.appendChild(btn);
  });

  // Wydarzenia w wybranym miesiącu
  const candidateFolders =
    activeMonthKey === "all"
      ? folders
      : folders.filter((f) => getMonthInfo(f.data_wydarzenia).key === activeMonthKey);

  const allFoldersBtn = document.createElement("button");
  allFoldersBtn.className = `chip ${activeFolderId === "all" ? "active" : ""}`;
  allFoldersBtn.textContent = "Wszystkie wydarzenia";
  allFoldersBtn.addEventListener("click", () => {
    activeFolderId = "all";
    renderGalleryFilters();
    renderGallery();
  });
  folderFiltersEl.appendChild(allFoldersBtn);

  candidateFolders.forEach((f) => {
    const count = photos.filter((p) => p.folder_id === f.id).length;
    const btn = document.createElement("button");
    btn.className = `chip ${activeFolderId === f.id ? "active" : ""}`;
    btn.textContent = `${f.nazwa} (${count})`;
    btn.addEventListener("click", () => {
      activeFolderId = f.id;
      renderGalleryFilters();
      renderGallery();
    });
    folderFiltersEl.appendChild(btn);
  });
}

function renderGallery() {
  galleryContainerEl.innerHTML = "";
  flatPhotosList = [];

  const filtered = folders.filter((f) => {
    const monthOk = activeMonthKey === "all" || getMonthInfo(f.data_wydarzenia).key === activeMonthKey;
    const folderOk = activeFolderId === "all" || f.id === activeFolderId;
    return monthOk && folderOk;
  });

  if (filtered.length === 0) {
    galleryStatusEl.classList.remove("hidden");
    galleryStatusEl.textContent = "Brak folderów dla tego filtra. Kliknij „+ Nowy folder”, żeby dodać wydarzenia.";
    return;
  }

  galleryStatusEl.classList.add("hidden");

  // Grupowanie po miesiącu + roku
  const groupedByMonth = new Map();
  filtered.forEach((folder) => {
    const m = getMonthInfo(folder.data_wydarzenia);
    if (!groupedByMonth.has(m.key)) {
      groupedByMonth.set(m.key, { label: m.label, folders: [] });
    }
    groupedByMonth.get(m.key).folders.push(folder);
  });

  groupedByMonth.forEach((group, monthKey) => {
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
        <span class="month-pill">${group.folders.length} wydarzeń · ${monthPhotosCount} zdjęć</span>
      </h2>
    `;
    monthBlock.appendChild(monthHeader);

    group.folders.forEach((folder) => {
      const folderPhotos = photos.filter((p) => p.folder_id === folder.id);
      const card = document.createElement("article");
      card.className = "folder-card";

      const top = document.createElement("div");
      top.className = "folder-top";

      const infoBox = document.createElement("div");
      infoBox.innerHTML = `
        <h3 class="folder-title">${folder.nazwa}</h3>
        <div class="folder-meta">${folder.data_wydarzenia} • ${folderPhotos.length} zdjęć</div>
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
        empty.textContent = "Ten folder jest pusty — kliknij „+ Dodaj zdjęcia”.";
        card.appendChild(empty);
      } else {
        const grid = document.createElement("div");
        grid.className = "photo-grid";

        folderPhotos.forEach((photo, idx) => {
          const globalIdx = flatPhotosList.length;
          const filename = `${folder.data_wydarzenia}_${folder.nazwa}_${idx + 1}.jpg`.replace(/\s+/g, "_");
          flatPhotosList.push({
            photo,
            url: photo.url,
            caption: `${folder.data_wydarzenia} — ${folder.nazwa} (${idx + 1}/${folderPhotos.length})`,
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

function renderPolls() {
  pollsContainerEl.innerHTML = "";

  if (polls.length === 0) {
    pollsStatusEl.classList.remove("hidden");
    pollsStatusEl.textContent = "Brak ankiet. Kliknij „+ Nowa ankieta”, żeby szybko zebrać info od klasy.";
    return;
  }

  pollsStatusEl.classList.add("hidden");

  polls.forEach((poll) => {
    const pollResponses = responses.filter((r) => r.ankieta_id === poll.id);
    const card = document.createElement("article");
    card.className = `poll-card ${highlightedPollId === poll.id ? "highlighted" : ""}`;
    card.id = `poll-${poll.id}`;

    const head = document.createElement("div");
    head.className = "poll-head";
    head.innerHTML = `
      <div>
        <h3 class="poll-title">${poll.tytul}</h3>
        ${poll.opis ? `<p class="poll-desc">${poll.opis}</p>` : ""}
      </div>
      <span class="badge">${pollResponses.length} odp.</span>
    `;
    card.appendChild(head);

    // Formularz odpowiedzi dla ucznia
    const form = document.createElement("form");
    form.className = "poll-form";

    const authorInput = document.createElement("input");
    authorInput.type = "text";
    authorInput.placeholder = "Twoje imię / pseudonim";
    authorInput.required = true;
    form.appendChild(authorInput);

    let answerControl;
    if (poll.typ === "wybor" && Array.isArray(poll.opcje) && poll.opcje.length > 0) {
      answerControl = document.createElement("select");
      answerControl.required = true;
      poll.opcje.forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt;
        optionEl.textContent = opt;
        answerControl.appendChild(optionEl);
      });
    } else {
      answerControl = document.createElement("input");
      answerControl.type = "text";
      answerControl.placeholder = "Wpisz swoją odpowiedź...";
      answerControl.required = true;
    }
    form.appendChild(answerControl);

    const submitAnsBtn = document.createElement("button");
    submitAnsBtn.type = "submit";
    submitAnsBtn.className = "btn btn-primary btn-sm";
    submitAnsBtn.textContent = "Wyślij odpowiedź";
    form.appendChild(submitAnsBtn);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submitAnsBtn.disabled = true;
      try {
        await submitPollResponse(poll, authorInput.value, answerControl.value);
        form.reset();
      } catch (err) {
        alert(`Błąd wysyłania odpowiedzi: ${err.message}`);
      } finally {
        submitAnsBtn.disabled = false;
      }
    });

    card.appendChild(form);

    // Lista zebranych odpowiedzi
    const respBox = document.createElement("div");
    respBox.className = "responses-box";
    const respTitle = document.createElement("div");
    respTitle.className = "responses-title";
    respTitle.textContent = `Zebrane odpowiedzi (${pollResponses.length})`;
    respBox.appendChild(respTitle);

    if (pollResponses.length === 0) {
      const none = document.createElement("div");
      none.className = "hint";
      none.textContent = "Jeszcze nikt nie odpowiedział.";
      respBox.appendChild(none);
    } else {
      pollResponses.forEach((r) => {
        const row = document.createElement("div");
        row.className = "response-item";
        row.innerHTML = `
          <span class="response-author">${r.autor}</span>
          <span class="response-val">${r.odpowiedz}</span>
        `;
        respBox.appendChild(row);
      });
    }
    card.appendChild(respBox);

    // Stopka karty: kopiuj link na grupę / usuń
    const footer = document.createElement("div");
    footer.className = "poll-footer";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn btn-secondary btn-sm";
    copyBtn.textContent = "Kopiuj link na grupę";
    copyBtn.addEventListener("click", () => copyPollLink(poll.id));

    const delPollBtn = document.createElement("button");
    delPollBtn.type = "button";
    delPollBtn.className = "btn btn-danger btn-sm";
    delPollBtn.textContent = "Usuń ankietę";
    delPollBtn.addEventListener("click", () => deletePoll(poll));

    footer.append(copyBtn, delPollBtn);
    card.appendChild(footer);

    pollsContainerEl.appendChild(card);
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

// Obsługa bezpośredniego linku #ankieta=ID z grupy klasowej
function handleHashNavigation() {
  const hash = window.location.hash || "";
  if (hash.startsWith("#ankieta=")) {
    const pollId = hash.replace("#ankieta=", "").trim();
    if (pollId) {
      highlightedPollId = pollId;
      switchTab("polls");
      setTimeout(() => {
        document.getElementById(`poll-${pollId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
    }
  }
}

window.addEventListener("hashchange", handleHashNavigation);

(async function init() {
  await loadAllData();
  handleHashNavigation();
})();
