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

let activeMonthKey = "all";
let activeFolderId = "all";
let sortMode = "newest"; // "newest" | "oldest" | "most-photos"
let folderCreateMode = "month"; // "month" | "event"
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
const sortControlsEl = document.getElementById("sortControls");
const galleryStatusEl = document.getElementById("galleryStatus");
const galleryContainerEl = document.getElementById("galleryContainer");

const pollsStatusEl = document.getElementById("pollsStatus");
const pollsContainerEl = document.getElementById("pollsContainer");
const toastEl = document.getElementById("toast");

// Modale
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

// Inicjalizacja wyboru miesiąca i roku
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
    folderNameLabel.textContent = "Nazwa folderu na miesiąc (np. Lekcje / różne)";
    folderNameInput.placeholder = "np. Lekcje / różne";
    folderDateInput.required = false;
  } else {
    folderNameLabel.textContent = "Nazwa wydarzenia";
    folderNameInput.placeholder = "np. Wyjście na pizzę / Wigilia klasowa";
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
  showToast._timer = setTimeout(() => toastEl.classList.add("hidden"), 2400);
}

// Przełączanie zakładek
function switchTab(tabName) {
  const isGallery = tabName === "gallery";
  galleryView.classList.toggle("hidden", !isGallery);
  pollsView.classList.toggle("hidden", isGallery);

  tabGalleryBtn.classList.
