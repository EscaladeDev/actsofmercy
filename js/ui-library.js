// ui-library.js
const countEl = document.getElementById('libCount');
const BOOKMARK_KEY = 'auroraReaderBookmarks_v1';
let map = null;

// Safety check for Map library
if (typeof L === 'undefined') {
  countEl.textContent = 'Map Error: Internet needed';
  countEl.style.color = '#ef4444';
  throw new Error('Leaflet JS not loaded. Check internet connection.');
}

function loadBookmarks(){ 
  try{return JSON.parse(localStorage.getItem(BOOKMARK_KEY)||'{}')}
  catch(e){return{}} 
}

function labelFor(bm){
  if(!bm) return null;
  if(bm.mode==='epub'){
    const parts=bm.unitId.split('-'); const n=parseInt(parts[parts.length-1],10);
    return isNaN(n)?'Resume reading':'Resume Ch. '+(n+1);
  }
  if(bm.mode==='pdf'){
    if(bm.unitId?.startsWith('page-')) return 'Resume Pg. '+bm.unitId.split('-')[1];
    return 'Resume reading';
  }
  return 'Resume reading';
}

// New Data Loader: Reads variable instead of fetching
function getBooks(){
  // Check if the variable from manifest.js exists
  if(typeof libraryData === 'undefined'){
    console.warn('libraryData is missing. Did you rename manifest.json to manifest.js?');
    return [];
  }
  
  const data = libraryData.books || [];
  return data.map((b,i)=> ({
    id: b.id || ('b'+i),
    name: b.name || b.file || 'Untitled',
    file: b.file,
    type: b.type || (b.file?.toLowerCase().endsWith('.pdf')?'pdf':'epub'),
    key: b.key || b.file || b.name || ('b'+i),
    lat: b.lat,
    lng: b.lng,
    locationName: b.locationName || 'Unknown Location'
  }));
}

function createPopupContent(book, resumeLabel){
  const div = document.createElement('div');
  div.className = 'pop-meta';
  const typeBadge = book.type === 'pdf' ? 'PDF' : 'EPUB';
  div.innerHTML = `
    <div class="pop-title">${book.name}</div>
    <div class="pop-loc">📍 ${book.locationName}</div>
    <div style="font-size:11px; color:#9aa3c2; margin-top:2px">
      ${typeBadge} • ${resumeLabel || 'Not started'}
    </div>
    <button class="pop-btn">Open Book</button>
  `;
  const btn = div.querySelector('button');
  btn.onclick = () => openBook(book);
  return div;
}

function openBook(book){
  const params = new URLSearchParams({file:book.file,name:book.name,type:book.type,key:book.key});
  location.href = './reader.html?'+params.toString();
}

function initMap(){
  // 1. Initialize Map
  map = L.map('map', {
    zoomControl: false, 
    attributionControl: false 
  }).setView([20, 0], 2);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);

  // 2. Load Data from variable
  const books = getBooks();
  
  // Filter for valid coordinates
  const mappedBooks = books.filter(b => b.lat !== undefined && b.lng !== undefined);
  
  if (books.length === 0) {
    countEl.textContent = 'No books found';
  } else {
    countEl.textContent = mappedBooks.length + ' locations';
  }

  const marks = loadBookmarks();
  const markers = [];

  const auroraIcon = L.divIcon({
    className: 'book-marker',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -10]
  });

  mappedBooks.forEach(book => {
    const resumeLabel = labelFor(marks[book.key]);
    const marker = L.marker([book.lat, book.lng], { icon: auroraIcon }).addTo(map);
    marker.bindPopup(createPopupContent(book, resumeLabel));
    markers.push(marker);
  });

  if(markers.length > 0){
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.2));
  }
}

// Start
initMap();