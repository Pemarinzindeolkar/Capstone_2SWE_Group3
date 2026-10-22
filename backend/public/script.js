// ============================================================
// LABZO — FRONTEND
// One page, many <div class="screen">s, switched with showScreen().
// ============================================================

const API = {
    getToken() { return localStorage.getItem('labzo_token'); },
    getUser() {
        const raw = localStorage.getItem('labzo_user');
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    saveSession(user, token) {
        localStorage.setItem('labzo_user', JSON.stringify(user));
        localStorage.setItem('labzo_token', token);
    },
    updateUser(fields) {
        const u = this.getUser();
        if (u) localStorage.setItem('labzo_user', JSON.stringify({ ...u, ...fields }));
    },
    clearSession() {
        localStorage.removeItem('labzo_user');
        localStorage.removeItem('labzo_token');
    },
    async request(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = this.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(path, { ...options, headers });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 && token) {
            // Token expired or invalid — send the user back to login
            sessionExpired();
        }
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    },
    get(p) { return this.request(p); },
    post(p, b) { return this.request(p, { method: 'POST', body: JSON.stringify(b || {}) }); },
    put(p, b) { return this.request(p, { method: 'PUT', body: JSON.stringify(b || {}) }); },
    del(p) { return this.request(p, { method: 'DELETE' }); },
};

// ============================================================
// CONSTANTS
// ============================================================
const CATEGORIES = [
    ['masks', 'Masks'],
    ['textiles', 'Textiles'],
    ['paintings', 'Paintings'],
    ['woodwork', 'Woodwork'],
    ['jewelry', 'Jewelry'],
    ['pottery', 'Pottery'],
    ['bamboo', 'Bamboo & Cane'],
    ['other', 'Other'],
];

// Zorig Chusum — the 13 traditional arts of Bhutan
const CRAFTS = [
    'Lhazo:Painting', 'Jinzo:Sculpture & clay', 'Parzo:Wood carving', 'Yigzo:Calligraphy',
    'Shagzo:Woodturning', 'Shingzo:Carpentry', 'Dozo:Masonry', 'Garzo:Blacksmithing',
    'Troezo:Gold & silver smithing', 'Tsharzo:Bamboo & cane', 'Dezo:Paper making',
    'Thagzo:Weaving', 'Tshemzo:Embroidery & tailoring', 'Other',
];

const DZONGKHAGS = [
    'Bumthang', 'Chhukha', 'Dagana', 'Gasa', 'Haa', 'Lhuentse', 'Mongar', 'Paro', 'Pemagatshel',
    'Punakha', 'Samdrup Jongkhar', 'Samtse', 'Sarpang', 'Thimphu', 'Trashigang', 'Trashiyangtse',
    'Trongsa', 'Tsirang', 'Wangdue Phodrang', 'Zhemgang',
];

// Suggested stock when an artist picks a category (they can change it)
const DEFAULT_STOCK = { paintings: 1, textiles: 4 };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Small bits of app state
const state = {
    bagCount: 0,
    savedIds: new Set(),
    shopRequest: 0,
    adminTab: 'artisans',
};

// ============================================================
// HELPERS
// ============================================================
// Escape user-supplied text before putting it into innerHTML
function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function money(n) {
    return 'Nu. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
    return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function categoryLabel(value) {
    const c = CATEGORIES.find(([v]) => v === value);
    return c ? c[1] : (value || 'Artwork');
}

function pill(status) {
    const s = String(status || 'pending');
    return `<span class="pill pill-${esc(s)}">${esc(s.replace('_', ' '))}</span>`;
}

function verifiedBadge(status) {
    return status === 'verified'
        ? '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">✓ Verified</span>'
        : '';
}

// "Out of stock" / "Only 1 left" / "4 in stock"
function stockBadge(stock) {
    const base = 'inline-block text-[11px] font-semibold px-2 py-0.5 rounded';
    if (stock <= 0) return `<span class="${base} bg-red-600 text-white">Out of stock</span>`;
    if (stock === 1) return `<span class="${base} bg-amber-100 text-amber-800">Only 1 left</span>`;
    return `<span class="${base} bg-gray-100 text-gray-600">${stock} in stock</span>`;
}

const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#F3F4F6"/>' +
    '<text x="50%" y="50%" fill="#9CA3AF" font-family="Inter,sans-serif" font-size="22" text-anchor="middle" dominant-baseline="middle">No image</text></svg>'
);

function img(url, cls = 'w-full h-full object-cover') {
    return `<img src="${url ? esc(url) : PLACEHOLDER_IMG}" class="${cls}" loading="lazy" alt="">`;
}

// Round photo, or the first letter of the name on a brand circle
function avatar(person, size = 'w-14 h-14', text = 'text-lg') {
    if (person?.photo_url) {
        return `<div class="${size} rounded-full overflow-hidden flex-shrink-0 bg-gray-100">${img(person.photo_url)}</div>`;
    }
    const initial = esc((person?.name || '?').charAt(0).toUpperCase());
    return `<div class="${size} ${text} rounded-full bg-brand text-white flex items-center justify-center font-bold flex-shrink-0">${initial}</div>`;
}

// Broken image links (dead URLs) → show the placeholder instead of a broken icon
document.addEventListener('error', (e) => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.src !== PLACEHOLDER_IMG) t.src = PLACEHOLDER_IMG;
}, true);

function toast(msg, type = 'info') {
    const colors = { info: 'bg-gray-900', success: 'bg-green-600', error: 'bg-red-600' };
    const el = document.createElement('div');
    el.className = `fixed top-4 right-4 ${colors[type]} text-white px-4 py-2 rounded shadow-lg z-[9999] text-sm max-w-xs`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// Disable a button and change its label while an async action runs
async function withBusy(btn, label, fn) {
    if (!btn) return fn();
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { return await fn(); }
    finally { btn.disabled = false; btn.textContent = old; }
}

// Upload one image file → returns its URL (Cloudinary or /api/images/<id>)
async function uploadImage(file) {
    if (!file) throw new Error('No file selected');
    if (!file.type.startsWith('image/')) throw new Error(file.name + ' is not an image');
    if (file.size > MAX_IMAGE_BYTES) throw new Error(file.name + ' is larger than 5MB');

    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + API.getToken() },
        body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data.url;
}

// Fill every <select data-options="..."> from the constants above
function fillSelects() {
    const sources = {
        categories: CATEGORIES,
        crafts: CRAFTS.map(c => [c, c]),
        dzongkhags: DZONGKHAGS.map(d => [d, d]),
    };
    document.querySelectorAll('select[data-options]').forEach(sel => {
        const list = sources[sel.dataset.options] || [];
        const first = sel.dataset.all
            ? `<option value="">${esc(sel.dataset.all)}</option>`
            : (sel.dataset.options === 'categories' ? '' : '<option value="">Select...</option>');
        sel.innerHTML = first + list.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    });
}

// ============================================================
// SCREENS + NAV
// ============================================================
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    const t = document.getElementById(id);
    if (t) {
        t.querySelectorAll('header[data-nav]').forEach(renderNav);
        t.style.display = 'flex';
        t.classList.add('active');
        t.scrollTop = 0;
    }
}

const NAV_LINKS = {
    buyer: {
        left: [
            ['home', 'Home', 'goHome()'],
            ['shop', 'Shop', 'openShop()'],
            ['artists', 'Artists', 'showArtists()'],
            ['about', 'About', "showScreen('about-screen')"],
        ],
        right: [
            ['saved', 'Saved', 'showSaved()'],
            ['orders', 'Orders', 'showOrders()'],
            ['profile', 'Profile', 'showProfile()'],
            ['bag', 'Bag', 'openBag()'],
        ],
    },
    artisan: {
        left: [
            ['dashboard', 'Dashboard', 'loadArtistDashboard()'],
            ['products', 'My Products', 'showMyProducts()'],
            ['artist-orders', 'Orders', 'showArtistOrders()'],
            ['add', '+ Add', 'showAddProduct()'],
        ],
        right: [
            ['shop', 'View Shop', 'openShop()'],
            ['artists', 'Artists', 'showArtists()'],
            ['profile', 'Profile', 'showProfile()'],
        ],
    },
    admin: {
        left: [
            ['admin', 'Admin', 'showAdmin()'],
            ['shop', 'Shop', 'openShop()'],
            ['artists', 'Artists', 'showArtists()'],
        ],
        right: [
            ['profile', 'Profile', 'showProfile()'],
        ],
    },
};

function renderNav(header) {
    const u = API.getUser();
    const links = NAV_LINKS[u?.role] || NAV_LINKS.buyer;
    const active = header.dataset.active;
    const link = ([key, label, action]) => {
        const text = key === 'bag' && state.bagCount ? `${label} (${state.bagCount})` : label;
        return `<span class="cursor-pointer ${key === active ? 'font-bold underline' : 'hover:underline'}" onclick="${action}">${esc(text)}</span>`;
    };

    header.innerHTML = `
        <div class="w-full bg-brand px-4 md:px-8 py-4 text-white sticky top-0 z-10">
            <div class="flex items-center gap-5 md:gap-6 text-sm whitespace-nowrap overflow-x-auto nav-scroll">
                <span class="text-lg font-bold tracking-widest cursor-pointer mr-2" onclick="goHome()">LABZO</span>
                ${links.left.map(link).join('')}
                <span class="flex-1"></span>
                ${links.right.map(link).join('')}
                <span class="cursor-pointer hover:underline" onclick="logout()">Logout</span>
            </div>
        </div>`;
}

function refreshNavs() {
    document.querySelectorAll('.screen.active header[data-nav]').forEach(renderNav);
}

function renderFooters() {
    const html = `
        <div class="bg-brand text-white py-14 px-6 md:px-10" style="background-color: #7a5130;">
            <div class="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
                <div class="col-span-2 md:col-span-1">
                    <p class="text-2xl font-bold mb-4">Labzo</p>
                    <p class="text-sm text-white/70">A marketplace built around the maker, not the machine.</p>
                </div>
                <div>
                    <p class="text-xs uppercase tracking-widest font-bold mb-4 text-white/90">Shop</p>
                    <ul class="space-y-2 text-sm text-white/70">
                        <li class="cursor-pointer hover:text-white" onclick="openShop('textiles')">Textiles</li>
                        <li class="cursor-pointer hover:text-white" onclick="openShop('paintings')">Paintings</li>
                        <li class="cursor-pointer hover:text-white" onclick="openShop('masks')">Masks</li>
                    </ul>
                </div>
                <div>
                    <p class="text-xs uppercase tracking-widest font-bold mb-4 text-white/90">Labzo</p>
                    <ul class="space-y-2 text-sm text-white/70">
                        <li class="cursor-pointer hover:text-white" onclick="showScreen('about-screen')">About</li>
                        <li class="cursor-pointer hover:text-white" onclick="showArtists()">Artisan stories</li>
                    </ul>
                </div>
                <div>
                    <p class="text-xs uppercase tracking-widest font-bold mb-4 text-white/90">Support</p>
                    <ul class="space-y-2 text-sm text-white/70">
                        <li><a class="hover:text-white" href="mailto:support@labzo.bt">support@labzo.bt</a></li>
                        <li>Phuentsholing, Bhutan</li>
                    </ul>
                </div>
            </div>
            <div class="max-w-6xl mx-auto mt-12 pt-8 border-t border-white/20 flex flex-col md:flex-row gap-2 justify-between text-xs text-white/60">
                <span>© 2026 LABZO MARKETPLACE · PHUENTSHOLING, BHUTAN</span>
                <span>© 2SWE · GROUP 3</span>
                <span>MADE WITH CARE, PIECE BY PIECE</span>
            </div>
        </div>`;
    document.querySelectorAll('footer[data-footer]').forEach(f => { f.innerHTML = html; });
}

// ============================================================
// SESSION
// ============================================================
function loadDashboard() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');
    if (u.role === 'artisan') return loadArtistDashboard();
    if (u.role === 'admin') return showAdmin();
    refreshBuyerState();
    loadHome();
}

function goHome() {
    loadDashboard();
}

function logout() {
    API.clearSession();
    state.bagCount = 0;
    state.savedIds = new Set();
    ['login-form', 'signup-form', 'artist-form-1', 'artist-form-2'].forEach(id => document.getElementById(id)?.reset());
    showScreen('login-screen');
}

let expiredShown = false;
function sessionExpired() {
    API.clearSession();
    if (!expiredShown) {
        expiredShown = true;
        toast('Your session expired — please log in again', 'error');
        setTimeout(() => { expiredShown = false; }, 2000);
    }
    showScreen('login-screen');
}

// Bag count + saved ids (for the nav badge and the ♡ button)
async function refreshBuyerState() {
    if (API.getUser()?.role !== 'buyer') return;
    try {
        const [cart, saved] = await Promise.all([API.get('/api/cart'), API.get('/api/wishlist')]);
        state.bagCount = cart.items.reduce((n, i) => n + i.quantity, 0);
        state.savedIds = new Set(saved.items.map(i => i.product_id));
        refreshNavs();
    } catch (err) {
        console.warn('[refreshBuyerState]', err.message);
    }
}

// ============================================================
// AUTH — login, buyer signup, artist 3-step signup
// ============================================================
const artistDraft = {
    workshopFiles: [],
    photoFile: null,
    artworkFiles: new Array(6).fill(null),
};

function resetArtistDraft() {
    artistDraft.workshopFiles = [];
    artistDraft.photoFile = null;
    artistDraft.artworkFiles = new Array(6).fill(null);
    renderWorkshopPreviews();
    renderArtworkSlots();
    const pp = document.getElementById('artist-photo-preview');
    if (pp) pp.innerHTML = '<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>';
}

function renderWorkshopPreviews() {
    const box = document.getElementById('workshop-previews');
    if (!box) return;
    box.innerHTML = artistDraft.workshopFiles.map((f, i) => `
        <div class="relative aspect-square rounded overflow-hidden border border-gray-200">
            <img src="${URL.createObjectURL(f)}" class="w-full h-full object-cover" alt="">
            <button type="button" onclick="removeWorkshopFile(${i})" class="absolute top-1 right-1 bg-black/60 text-white text-xs w-5 h-5 rounded-full">✕</button>
        </div>`).join('');
}

function removeWorkshopFile(i) {
    artistDraft.workshopFiles.splice(i, 1);
    renderWorkshopPreviews();
}

function renderArtworkSlots() {
    const box = document.getElementById('artwork-slots');
    if (!box) return;
    box.innerHTML = artistDraft.artworkFiles.map((f, i) => f ? `
        <div class="relative aspect-square rounded overflow-hidden border border-gray-300">
            <img src="${URL.createObjectURL(f)}" class="w-full h-full object-cover" alt="">
            <button type="button" onclick="setArtworkFile(${i}, null)" class="absolute top-1 right-1 bg-black/60 text-white text-xs w-6 h-6 rounded-full">✕</button>
        </div>` : `
        <label class="aspect-square bg-gray-50 border border-gray-300 rounded flex items-center justify-center cursor-pointer hover:border-brand transition">
            <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
            <input type="file" accept="image/*" class="hidden" onchange="setArtworkFile(${i}, this.files[0])">
        </label>`).join('');
}

function setArtworkFile(i, file) {
    if (file && file.size > MAX_IMAGE_BYTES) return toast('Image must be under 5MB', 'error');
    artistDraft.artworkFiles[i] = file || null;
    renderArtworkSlots();
}

async function submitArtistRegistration(btn) {
    const val = id => document.getElementById(id).value.trim();
    const city = val('workshop-city');
    const dzongkhag = val('workshop-dzongkhag');

    const body = {
        role: 'artisan',
        name: val('artist-name'),
        email: val('artist-email'),
        password: document.getElementById('artist-pass').value,
        phone: val('artist-phone'),
        workshop_name: val('workshop-name'),
        location: [city, dzongkhag].filter(Boolean).join(', '),
        technique: val('artist-technique'),
        craft_description: val('artist-bio'),
    };

    await withBusy(btn, 'Creating account...', async () => {
        let result;
        try {
            result = await API.post('/api/auth/register', body);
        } catch (err) {
            toast(err.message, 'error');
            if (/email/i.test(err.message)) showScreen('artist-step1');
            return;
        }
        API.saveSession(result.user, result.token);

        // Account exists now — upload photos with the new token
        const gallery = [...artistDraft.workshopFiles, ...artistDraft.artworkFiles.filter(Boolean)];
        let failed = 0;
        if (artistDraft.photoFile || gallery.length) btn.textContent = 'Uploading photos...';

        if (artistDraft.photoFile) {
            try {
                const photo_url = await uploadImage(artistDraft.photoFile);
                const { user } = await API.put('/api/auth/me', { photo_url });
                API.updateUser(user);
            } catch (err) { failed++; console.error(err); }
        }
        for (const file of gallery) {
            try {
                const image_url = await uploadImage(file);
                await API.post('/api/artisans/me/gallery', { image_url });
            } catch (err) { failed++; console.error(err); }
        }

        toast(failed
            ? `Account created, but ${failed} photo(s) failed to upload — add them from your Profile.`
            : 'Welcome to Labzo, ' + result.user.name + '!', failed ? 'error' : 'success');
        ['artist-form-1', 'artist-form-2'].forEach(id => document.getElementById(id)?.reset());
        document.getElementById('artist-bio').value = '';
        resetArtistDraft();
        loadArtistDashboard();
    });
}

// Signup password fields: a show/hide eye on [data-reveal] inputs, and
// [data-match="<id>"] inputs must equal that field (blocks submit / next step)
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>';

function initPasswordFields() {
    document.querySelectorAll('input[data-reveal]').forEach(input => {
        const wrap = document.createElement('div');
        wrap.className = 'password-wrap';
        input.parentNode.insertBefore(wrap, input);
        wrap.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'password-toggle';
        btn.setAttribute('aria-label', 'Show password');
        btn.innerHTML = EYE_OPEN;
        wrap.appendChild(btn);

        const setShown = (shown) => {
            input.type = shown ? 'text' : 'password';
            btn.innerHTML = shown ? EYE_SHUT : EYE_OPEN;
            btn.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
        };
        btn.addEventListener('click', () => setShown(input.type === 'password'));
        input.form?.addEventListener('reset', () => setShown(false));
    });

    document.querySelectorAll('input[data-match]').forEach(confirm => {
        const original = document.getElementById(confirm.dataset.match);
        const check = () => confirm.setCustomValidity(
            confirm.value && confirm.value !== original.value ? 'Passwords do not match' : ''
        );
        original.addEventListener('input', check);
        confirm.addEventListener('input', check);
        confirm.form?.addEventListener('reset', () => confirm.setCustomValidity(''));
    });
}

function initAuth() {
    const bind = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
    };

    initPasswordFields();

    bind('btn-go-signup', 'click', () => showScreen('signup-screen'));
    bind('btn-go-artist', 'click', () => showScreen('artist-step1'));
    bind('link-to-signup', 'click', () => showScreen('signup-screen'));
    bind('btn-buy-signup', 'click', () => showScreen('login-screen'));
    bind('btn-sell-signup', 'click', () => showScreen('artist-step1'));
    bind('link-to-login', 'click', () => showScreen('login-screen'));
    bind('btn-artist-cancel-1', 'click', () => showScreen('login-screen'));
    bind('btn-artist-back-2', 'click', () => showScreen('artist-step1'));
    bind('btn-artist-back-3', 'click', () => showScreen('artist-step2'));

    // Login — the server works out whether this is a buyer, artisan or admin
    bind('login-form', 'submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        await withBusy(btn, 'Logging in...', async () => {
            try {
                const result = await API.post('/api/auth/login', { email, password });
                API.saveSession(result.user, result.token);
                e.target.reset();
                toast('Welcome, ' + result.user.name, 'success');
                loadDashboard();
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Buyer signup
    bind('signup-form', 'submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        await withBusy(btn, 'Creating account...', async () => {
            try {
                const r = await API.post('/api/auth/register', { name, email, password, role: 'buyer' });
                API.saveSession(r.user, r.token);
                e.target.reset();
                toast('Account created!', 'success');
                loadDashboard();
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    // Artist step 1 → 2
    bind('btn-artist-next-1', 'click', () => {
        const form = document.getElementById('artist-form-1');
        if (!form.reportValidity()) return;
        showScreen('artist-step2');
    });

    // Artist step 2 → 3
    bind('btn-artist-next-2', 'click', () => {
        const form = document.getElementById('artist-form-2');
        if (!form.reportValidity()) return;
        showScreen('artist-step3');
    });

    bind('workshop-files', 'change', (e) => {
        const files = [...e.target.files];
        const tooBig = files.filter(f => f.size > MAX_IMAGE_BYTES);
        if (tooBig.length) toast(tooBig.length + ' image(s) over 5MB were skipped', 'error');
        artistDraft.workshopFiles = [...artistDraft.workshopFiles, ...files.filter(f => f.size <= MAX_IMAGE_BYTES)].slice(0, 6);
        e.target.value = '';
        renderWorkshopPreviews();
    });

    bind('artist-photo-file', 'change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > MAX_IMAGE_BYTES) return toast('Image must be under 5MB', 'error');
        artistDraft.photoFile = f;
        document.getElementById('artist-photo-preview').innerHTML =
            `<img src="${URL.createObjectURL(f)}" class="w-full h-full object-cover" alt="">`;
    });

    bind('btn-artist-submit', 'click', (e) => submitArtistRegistration(e.currentTarget));

    renderArtworkSlots();
}

// ============================================================
// HOME — hero, categories, 4 featured products, 3 featured artisans
// ============================================================
function productCard(p, opts = {}) {
    return `
        <div onclick="openProduct(${p.product_id})"
             class="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer">
            <div class="relative aspect-square bg-gray-100 overflow-hidden">
                ${img(p.image_url, 'w-full h-full object-cover' + (p.stock <= 0 ? ' opacity-50 grayscale' : ''))}
                <div class="absolute top-2 left-2">${stockBadge(p.stock)}</div>
            </div>
            <div class="p-3 md:p-4">
                <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${esc(categoryLabel(p.category))}</p>
                <h3 class="font-bold text-gray-800 mb-1 truncate">${esc(p.title)}</h3>
                ${opts.hideArtisan ? '' : `<p class="text-xs text-gray-500 mb-2 truncate">by ${esc(p.artisan_name)}</p>`}
                <p class="text-base md:text-lg font-bold text-brand">${money(p.price)}</p>
            </div>
        </div>`;
}

function artisanCard(a, centered = false) {
    const where = [a.workshop_name, a.location].filter(Boolean).join(' · ');
    return `
        <div onclick="openArtist(${a.artisan_id})"
             class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100 ${centered ? 'text-center' : ''}">
            <div class="flex ${centered ? 'flex-col items-center' : 'items-center'} gap-4 mb-4">
                ${avatar(a, centered ? 'w-20 h-20' : 'w-14 h-14', centered ? 'text-2xl' : 'text-lg')}
                <div class="min-w-0">
                    <h3 class="font-bold text-gray-800">${esc(a.name)} ${verifiedBadge(a.status)}</h3>
                    <p class="text-xs text-gray-500">${esc(a.technique || 'Artisan')}</p>
                    ${where ? `<p class="text-xs text-gray-400">${esc(where)}</p>` : ''}
                </div>
            </div>
            <p class="text-sm text-gray-600 line-clamp-3">${esc(a.craft_description || 'Artisan workshop.')}</p>
            <p class="text-xs text-brand font-semibold mt-4">${a.product_count ? a.product_count + ' artwork' + (a.product_count === 1 ? '' : 's') + ' · ' : ''}View profile →</p>
        </div>`;
}

async function loadHome() {
    showScreen('home-screen');

    const u = API.getUser();
    const greet = document.getElementById('home-greeting');
    if (greet && u) greet.textContent = 'Kuzuzangpo, ' + u.name.split(' ')[0]
        + ' — handmade masks, textiles, paintings and more, bought directly from the Bhutanese artisans who make them.';

    const cats = document.getElementById('home-categories');
    if (cats) cats.innerHTML = CATEGORIES.map(([v, l]) => `
        <div onclick="openShop('${v}')" class="bg-white border border-gray-200 rounded-lg py-4 px-3 text-center text-sm font-semibold text-gray-700 hover:border-brand hover:text-brand cursor-pointer transition">${esc(l)}</div>
    `).join('');

    const prodEl = document.getElementById('home-products');
    const artEl = document.getElementById('home-artisans');
    const loading = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';
    prodEl.innerHTML = loading;
    artEl.innerHTML = loading;

    const [products, artisans] = await Promise.all([
        API.get('/api/products?limit=4').catch(err => ({ error: err.message })),
        API.get('/api/artisans').catch(err => ({ error: err.message })),
    ]);

    if (products.error) prodEl.innerHTML = `<p class="text-red-500 col-span-full text-center py-10">${esc(products.error)}</p>`;
    else if (!products.products.length) prodEl.innerHTML = '<p class="text-gray-400 col-span-full text-center py-10">No artworks listed yet.</p>';
    else prodEl.innerHTML = products.products.slice(0, 4).map(p => productCard(p)).join('');

    if (artisans.error) artEl.innerHTML = `<p class="text-red-500 col-span-full text-center py-10">${esc(artisans.error)}</p>`;
    else if (!artisans.artisans.length) artEl.innerHTML = '<p class="text-gray-400 col-span-full text-center py-10">No artisans yet.</p>';
    else artEl.innerHTML = artisans.artisans.slice(0, 3).map(a => artisanCard(a, true)).join('');
}

// ============================================================
// SHOP — keyword search, category, sort
// ============================================================
let shopSearchTimer = null;

// Open the shop; pass a category to jump straight to it
function openShop(category) {
    if (category !== undefined) {
        document.getElementById('shop-search').value = '';
        document.getElementById('shop-category').value = category || '';
    }
    showScreen('shop-screen');
    loadShop();
}

function searchShop(keyword) {
    document.getElementById('shop-search').value = keyword || '';
    document.getElementById('shop-category').value = '';
    showScreen('shop-screen');
    loadShop();
}

function clearShopSearch() {
    document.getElementById('shop-search').value = '';
    document.getElementById('shop-category').value = '';
    loadShop();
}

async function loadShop() {
    const grid = document.getElementById('shop-grid');
    const empty = document.getElementById('shop-empty');
    const countEl = document.getElementById('shop-result-count');
    const search = document.getElementById('shop-search').value.trim();
    const category = document.getElementById('shop-category').value;
    const sort = document.getElementById('shop-sort').value;
    const reqId = ++state.shopRequest;

    document.getElementById('shop-search-clear').classList.toggle('hidden', !search);
    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';
    empty.classList.add('hidden');

    try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (category) params.set('category', category);
        const data = await API.get('/api/products' + (params.toString() ? '?' + params : ''));

        // A newer search started while this one was in flight — drop this result
        if (reqId !== state.shopRequest) return;

        const products = [...data.products];
        if (sort === 'price-asc') products.sort((a, b) => a.price - b.price);
        if (sort === 'price-desc') products.sort((a, b) => b.price - a.price);

        const n = products.length;
        countEl.textContent = (search || category)
            ? n + ' result' + (n === 1 ? '' : 's')
                + (search ? ' for "' + search + '"' : '')
                + (category ? ' in ' + categoryLabel(category) : '')
            : n + ' artwork' + (n === 1 ? '' : 's');

        if (n === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        grid.innerHTML = products.map(p => productCard(p)).join('');
    } catch (err) {
        if (reqId !== state.shopRequest) return;
        grid.innerHTML = `<p class="text-red-500 col-span-full text-center py-10">${esc(err.message)}</p>`;
    }
}

function initShop() {
    const input = document.getElementById('shop-search');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(shopSearchTimer);
            loadShop();
        }
    });
    // Live search — wait until the user pauses typing
    input.addEventListener('input', () => {
        clearTimeout(shopSearchTimer);
        shopSearchTimer = setTimeout(loadShop, 350);
    });
    document.getElementById('shop-category').addEventListener('change', loadShop);
    document.getElementById('shop-sort').addEventListener('change', loadShop);
    document.getElementById('shop-search-clear').addEventListener('click', () => {
        input.value = '';
        loadShop();
        input.focus();
    });
    document.getElementById('home-search-form').addEventListener('submit', (e) => {
        e.preventDefault();
        searchShop(document.getElementById('home-search').value.trim());
    });
}

// ============================================================
// PRODUCT DETAIL
// ============================================================
async function openProduct(productId) {
    showScreen('product-screen');
    const container = document.getElementById('product-detail');
    container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';

    try {
        const { product: p } = await API.get('/api/products/' + productId);
        const isBuyer = API.getUser()?.role === 'buyer';
        const available = p.status === 'available';
        const saved = state.savedIds.has(p.product_id);
        const where = [p.workshop_name, p.location].filter(Boolean).join(' · ');

        let actions;
        if (!available) {
            actions = '<p class="text-sm font-semibold text-gray-500 bg-gray-100 rounded py-3 text-center">This piece is no longer available.</p>';
        } else if (p.stock <= 0) {
            actions = '<p class="text-sm font-semibold text-white bg-red-600 rounded py-3 text-center">Out of stock</p>';
        } else if (isBuyer) {
            actions = `
                <div class="flex gap-3">
                    <button onclick="addToBag(${p.product_id}, this)" class="flex-1 bg-gray-900 text-white py-3 rounded text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-50">Add to Bag</button>
                    <button onclick="toggleSaved(${p.product_id}, this)" class="px-6 py-3 border ${saved ? 'border-brand text-brand' : 'border-gray-300 text-gray-700'} rounded text-sm hover:bg-gray-50 transition">${saved ? '♥ Saved' : '♡ Save'}</button>
                </div>
                <button onclick="buyNow(${p.product_id}, this)" class="w-full mt-3 bg-brand text-white py-3 rounded text-sm font-semibold hover:bg-opacity-90 transition disabled:opacity-50">Buy now</button>`;
        } else {
            actions = '<p class="text-xs text-gray-500">Log in with a buyer account to purchase this piece.</p>';
        }

        container.innerHTML = `
            <div class="aspect-square bg-white rounded-lg overflow-hidden shadow-sm">${img(p.image_url)}</div>
            <div class="flex flex-col justify-center">
                <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">${esc(categoryLabel(p.category))}</p>
                <h1 class="text-3xl md:text-4xl font-bold text-gray-800 mb-4">${esc(p.title)}</h1>
                <p class="text-2xl text-brand font-bold mb-2">${money(p.price)}</p>
                <div class="mb-6">${stockBadge(p.stock)}</div>
                <div class="mb-6 pb-6 border-b border-gray-200">
                    <p class="text-sm text-gray-600 leading-relaxed whitespace-pre-line">${esc(p.description || 'No description.')}</p>
                </div>
                <div onclick="openArtist(${p.artisan_id})" class="mb-6 pb-6 border-b border-gray-200 flex items-center gap-3 cursor-pointer group">
                    ${avatar({ name: p.artisan_name, photo_url: p.artisan_photo }, 'w-12 h-12', 'text-base')}
                    <div>
                        <p class="text-xs text-gray-400 uppercase tracking-wide">Artisan</p>
                        <p class="font-bold text-gray-800 group-hover:underline">${esc(p.artisan_name)} ${verifiedBadge(p.artisan_status)}</p>
                        <p class="text-xs text-gray-500">${esc([p.technique, where].filter(Boolean).join(' · '))}</p>
                    </div>
                </div>
                ${actions}
                <button onclick="openShop()" class="mt-6 text-xs text-gray-500 hover:underline text-left">← Back to Shop</button>
            </div>`;
    } catch (err) {
        container.innerHTML = `<p class="text-red-500 col-span-full">${esc(err.message)}</p>`;
    }
}

// ============================================================
// BAG
// ============================================================
function requireBuyer(msg) {
    if (API.getUser()?.role !== 'buyer') {
        toast(msg || 'Please log in as a buyer', 'error');
        return false;
    }
    return true;
}

async function addToBag(productId, btn) {
    if (!requireBuyer('Log in as a buyer to add to bag')) return false;
    return withBusy(btn, 'Adding...', async () => {
        try {
            await API.post('/api/cart/items', { product_id: productId, quantity: 1 });
            state.bagCount++;
            refreshNavs();
            toast('Added to bag ✓', 'success');
            return true;
        } catch (err) { toast(err.message, 'error'); return false; }
    });
}

async function buyNow(productId, btn) {
    if (await addToBag(productId, btn)) openBag();
}

async function openBag() {
    if (!requireBuyer()) return;
    showScreen('bag-screen');
    await renderBag();
}

async function renderBag() {
    const container = document.getElementById('bag-content');
    const empty = document.getElementById('bag-empty');
    container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading bag...</p>';
    empty.classList.add('hidden');

    try {
        const cart = await API.get('/api/cart');
        state.bagCount = cart.items.reduce((n, i) => n + i.quantity, 0);
        refreshNavs();

        if (cart.count === 0) {
            container.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        const artisanCount = new Set(cart.items.map(i => i.artisan_id)).size;

        const itemsHtml = cart.items.map(item => `
            <div class="bg-white rounded-lg p-4 flex gap-4 items-center shadow-sm">
                <div class="w-20 h-20 bg-gray-100 rounded flex-shrink-0 overflow-hidden cursor-pointer" onclick="openProduct(${item.product_id})">${img(item.image_url)}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs text-gray-400 uppercase tracking-wide">${esc(categoryLabel(item.category))}</p>
                    <h3 class="font-bold text-gray-800 truncate">${esc(item.title)}</h3>
                    <p class="text-xs text-gray-500">by ${esc(item.artisan_name)}</p>
                    <p class="text-sm font-bold text-brand mt-1">${money(item.price)}</p>
                    <div class="mt-1">${stockBadge(item.stock)}</div>
                </div>
                <div class="flex flex-col items-end gap-2">
                    <div class="flex items-center border border-gray-300 rounded">
                        <button onclick="updateQty(${item.cart_item_id}, ${item.quantity - 1})" class="px-3 py-1 text-gray-600 hover:bg-gray-100">-</button>
                        <span class="px-3 py-1 text-sm font-semibold">${item.quantity}</span>
                        <button onclick="updateQty(${item.cart_item_id}, ${item.quantity + 1})" ${item.quantity >= item.stock ? 'disabled title="No more in stock"' : ''}
                            class="px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">+</button>
                    </div>
                    <button onclick="removeItem(${item.cart_item_id})" class="text-xs text-red-500 hover:underline">Remove</button>
                </div>
            </div>`).join('');

        const summaryHtml = `
            <div class="lg:col-span-1">
                <div class="bg-white rounded-lg p-6 shadow-sm">
                    <h2 class="text-lg font-bold mb-4">Order Summary</h2>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-600">Subtotal</span>
                        <span class="font-semibold">${money(cart.total)}</span>
                    </div>
                    <div class="flex justify-between text-sm mb-4 pb-4 border-b border-gray-200">
                        <span class="text-gray-600">Shipping</span>
                        <span class="text-gray-500 text-xs">Arranged by artisan</span>
                    </div>
                    <div class="flex justify-between mb-4">
                        <span class="font-bold">Total</span>
                        <span class="font-bold text-xl text-brand">${money(cart.total)}</span>
                    </div>
                    ${artisanCount > 1 ? `<p class="text-xs text-gray-500 mb-4">Your bag has pieces from ${artisanCount} artisans, so it will be split into ${artisanCount} orders.</p>` : ''}
                    <button onclick="checkout(this)" class="w-full bg-gray-900 text-white py-3 rounded text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-50">Checkout</button>
                    <button onclick="openShop()" class="w-full mt-3 text-xs text-gray-500 hover:underline">Continue shopping</button>
                </div>
            </div>`;

        container.innerHTML = '<div class="lg:col-span-2 space-y-4">' + itemsHtml + '</div>' + summaryHtml;
    } catch (err) {
        container.innerHTML = `<p class="text-red-500 col-span-full">${esc(err.message)}</p>`;
    }
}

async function updateQty(itemId, newQty) {
    if (newQty < 1) return removeItem(itemId);
    try {
        await API.put('/api/cart/items/' + itemId, { quantity: newQty });
        await renderBag();
    } catch (err) { toast(err.message, 'error'); }
}

async function removeItem(itemId) {
    try {
        await API.del('/api/cart/items/' + itemId);
        toast('Item removed', 'info');
        await renderBag();
    } catch (err) { toast(err.message, 'error'); }
}

async function checkout(btn) {
    if (!confirm('Place this order? The artisan approves it first — you pay after that.')) return;
    await withBusy(btn, 'Placing order...', async () => {
        try {
            const result = await API.post('/api/orders/checkout');
            state.bagCount = 0;
            toast(result.orders.length + ' order(s) sent to the artisan for approval. You can pay once they approve.', 'success');
            showOrders();
        } catch (err) { toast(err.message, 'error'); }
    });
}

// ============================================================
// BUYER ORDERS + PAYMENT PROOF
// ============================================================
let paymentOrderId = null;

function paymentSection(o) {
    if (o.status === 'cancelled') return '';
    const proofLink = o.proof_url ? `<a href="${esc(o.proof_url)}" target="_blank" class="text-brand hover:underline">View screenshot</a>` : '';
    const cancelBtn = `<button onclick="cancelOrder(${o.order_id})" class="px-4 py-2 border border-gray-300 text-gray-600 text-xs rounded hover:bg-gray-50 transition">Cancel order</button>`;

    if (o.status === 'pending') {
        return `<p class="text-sm text-amber-700 mb-3">Waiting for ${esc(o.artisan_name)} to approve your order. You can pay once they approve it.</p>
            <div class="flex flex-wrap gap-3">${cancelBtn}</div>`;
    }
    if (o.status !== 'approved') {
        return `<p class="text-sm text-green-700 font-semibold">✓ Payment confirmed ${proofLink ? '· ' + proofLink : ''}</p>`;
    }
    if (o.payment_status === 'pending') {
        return `<p class="text-sm text-amber-700">Payment screenshot submitted — waiting for the artisan or Labzo to confirm · ${proofLink}
            · <span class="text-gray-500 hover:underline cursor-pointer" onclick="choosePaymentProof(${o.order_id})">Replace</span></p>`;
    }
    const intro = o.payment_status === 'rejected'
        ? '<p class="text-sm text-red-600 mb-2">Your payment screenshot was rejected. Please upload a clear screenshot of the receipt.</p>'
        : `<p class="text-sm text-gray-700 mb-2"><span class="font-semibold">Approved!</span> Transfer ${money(o.total)} with remark <span class="font-semibold">#${o.order_id}</span>, then upload the receipt screenshot.</p>`;
    return `${intro}
        <div class="flex flex-wrap gap-3">
            <button onclick="choosePaymentProof(${o.order_id})" class="px-4 py-2 bg-brand text-white text-xs font-semibold rounded hover:bg-opacity-90 transition">Upload payment screenshot</button>
            ${cancelBtn}
        </div>`;
}

async function showOrders() {
    if (!requireBuyer()) return;
    showScreen('orders-screen');
    const list = document.getElementById('orders-list');
    const empty = document.getElementById('orders-empty');
    list.innerHTML = '<p class="text-gray-500">Loading...</p>';
    empty.classList.add('hidden');

    try {
        const data = await API.get('/api/orders');
        if (data.count === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        list.innerHTML = data.orders.map(o => `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex justify-between items-start mb-4 pb-4 border-b border-gray-100 gap-4">
                    <div>
                        <p class="text-xs text-gray-400 uppercase tracking-wide">Order #${o.order_id} · ${fmtDate(o.created_at)}</p>
                        <p class="font-bold text-gray-800 cursor-pointer hover:underline" onclick="openArtist(${o.artisan_id})">from ${esc(o.artisan_name)}</p>
                    </div>
                    <div class="text-right">
                        ${pill(o.status)}
                        <p class="font-bold text-lg text-brand mt-2">${money(o.total)}</p>
                    </div>
                </div>
                <div class="space-y-3 mb-4">
                    ${o.items.map(i => `
                        <div class="flex items-center gap-3 text-sm">
                            <div class="w-12 h-12 rounded overflow-hidden bg-gray-100 flex-shrink-0">${img(i.image_url)}</div>
                            <span class="flex-1">${esc(i.title)} × ${i.quantity}</span>
                            <span class="text-gray-500">${money(i.price * i.quantity)}</span>
                        </div>`).join('')}
                </div>
                ${paymentSection(o)}
            </div>`).join('');
    } catch (err) {
        list.innerHTML = `<p class="text-red-500">${esc(err.message)}</p>`;
    }
}

function choosePaymentProof(orderId) {
    paymentOrderId = orderId;
    document.getElementById('payment-file').click();
}

async function cancelOrder(orderId) {
    if (!confirm('Cancel order #' + orderId + '?')) return;
    try {
        await API.put('/api/orders/' + orderId + '/cancel');
        toast('Order cancelled', 'info');
        showOrders();
    } catch (err) { toast(err.message, 'error'); }
}

function initOrders() {
    document.getElementById('payment-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file || !paymentOrderId) return;
        try {
            toast('Uploading payment screenshot...', 'info');
            const proof_url = await uploadImage(file);
            await API.post('/api/orders/' + paymentOrderId + '/payment', { proof_url });
            toast('Payment screenshot submitted ✓', 'success');
            showOrders();
        } catch (err) { toast(err.message, 'error'); }
    });
}

// ============================================================
// SAVED (Wishlist)
// ============================================================
async function toggleSaved(productId, btn) {
    if (!requireBuyer('Log in as a buyer to save')) return;
    const saved = state.savedIds.has(productId);
    try {
        if (saved) {
            await API.del('/api/wishlist/' + productId);
            state.savedIds.delete(productId);
            toast('Removed from saved', 'info');
        } else {
            await API.post('/api/wishlist', { product_id: productId });
            state.savedIds.add(productId);
            toast('Saved ♡', 'success');
        }
        if (btn) {
            const now = state.savedIds.has(productId);
            btn.textContent = now ? '♥ Saved' : '♡ Save';
            btn.classList.toggle('border-brand', now);
            btn.classList.toggle('text-brand', now);
        }
    } catch (err) { toast(err.message, 'error'); }
}

async function showSaved() {
    if (!requireBuyer()) return;
    showScreen('saved-screen');
    const grid = document.getElementById('saved-grid');
    const empty = document.getElementById('saved-empty');
    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';
    empty.classList.add('hidden');

    try {
        const data = await API.get('/api/wishlist');
        state.savedIds = new Set(data.items.map(i => i.product_id));
        if (data.count === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        grid.innerHTML = data.items.map(p => `
            <div class="bg-white rounded-lg overflow-hidden shadow-sm">
                <div class="aspect-square bg-gray-100 overflow-hidden cursor-pointer" onclick="openProduct(${p.product_id})">${img(p.image_url)}</div>
                <div class="p-3 md:p-4">
                    <h3 class="font-bold text-gray-800 truncate">${esc(p.title)}</h3>
                    <p class="text-xs text-gray-500 mb-2 truncate">by ${esc(p.artisan_name)}</p>
                    <p class="text-base font-bold text-brand mb-3">${money(p.price)}</p>
                    <div class="flex gap-2">
                        <button onclick="addToBag(${p.product_id}, this)" class="flex-1 text-xs bg-gray-900 text-white py-2 rounded hover:bg-gray-700 transition disabled:opacity-50">Add to Bag</button>
                        <button onclick="toggleSaved(${p.product_id}).then(showSaved)" class="text-xs border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50 transition">Remove</button>
                    </div>
                </div>
            </div>`).join('');
    } catch (err) {
        grid.innerHTML = `<p class="text-red-500 col-span-full">${esc(err.message)}</p>`;
    }
}

// ============================================================
// PROFILE — everyone: name, photo, password. Artists: workshop details + gallery
// ============================================================
function fillProfile(user) {
    const isArtist = user.role === 'artisan';
    document.getElementById('profile-name').value = user.name || '';
    document.getElementById('profile-email-input').value = user.email || '';
    document.getElementById('profile-email').textContent = user.email || '';
    document.getElementById('profile-heading').textContent = isArtist ? 'Artist Profile' : (user.role === 'admin' ? 'Admin Profile' : 'My Profile');
    document.getElementById('profile-status').innerHTML = isArtist
        ? 'Verification: ' + pill(user.status) + ` · <span class="text-brand hover:underline cursor-pointer" onclick="openArtist(${user.id})">View public profile →</span>`
        : '';

    const av = document.getElementById('profile-avatar');
    av.innerHTML = user.photo_url ? img(user.photo_url) : esc((user.name || '?').charAt(0).toUpperCase());

    document.getElementById('profile-artist-fields').classList.toggle('hidden', !isArtist);
    document.getElementById('profile-gallery-card').classList.toggle('hidden', !isArtist);
    // Admin accounts have no photo column
    av.parentElement.style.pointerEvents = user.role === 'admin' ? 'none' : '';

    if (isArtist) {
        document.getElementById('profile-phone').value = user.phone || '';
        document.getElementById('profile-workshop').value = user.workshop_name || '';
        document.getElementById('profile-location').value = user.location || '';
        document.getElementById('profile-bio').value = user.craft_description || '';
        const sel = document.getElementById('profile-technique');
        // Keep older free-text crafts selectable
        if (user.technique && ![...sel.options].some(o => o.value === user.technique)) {
            sel.insertAdjacentHTML('beforeend', `<option value="${esc(user.technique)}">${esc(user.technique)}</option>`);
        }
        sel.value = user.technique || '';
    }
}

async function showProfile() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');
    document.getElementById('password-form').reset();
    fillProfile(u);
    showScreen('profile-screen');

    try {
        const { user } = await API.get('/api/auth/me');
        API.updateUser(user);
        fillProfile(user);
        if (user.role === 'artisan') loadProfileGallery();
    } catch (err) {
        console.warn('[showProfile] could not refresh:', err.message);
    }
}

async function loadProfileGallery() {
    const box = document.getElementById('profile-gallery');
    try {
        const { gallery } = await API.get('/api/artisans/me/gallery');
        box.innerHTML = gallery.length ? gallery.map(g => `
            <div class="relative aspect-square rounded overflow-hidden border border-gray-200">
                ${img(g.image_url)}
                <button type="button" onclick="removeGalleryImage(${g.artisan_image_id})" class="absolute top-1 right-1 bg-black/60 text-white text-xs w-6 h-6 rounded-full" title="Remove">✕</button>
            </div>`).join('')
            : '<p class="text-xs text-gray-400 col-span-full">No photos yet.</p>';
    } catch (err) {
        box.innerHTML = `<p class="text-red-500 text-xs col-span-full">${esc(err.message)}</p>`;
    }
}

async function removeGalleryImage(id) {
    if (!confirm('Remove this photo from your gallery?')) return;
    try {
        await API.del('/api/artisans/me/gallery/' + id);
        loadProfileGallery();
    } catch (err) { toast(err.message, 'error'); }
}

function initProfile() {
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type=submit]');
        const name = document.getElementById('profile-name').value.trim();
        if (!name) return toast('Name cannot be empty', 'error');

        const body = { name };
        if (API.getUser()?.role === 'artisan') {
            Object.assign(body, {
                phone: document.getElementById('profile-phone').value.trim(),
                workshop_name: document.getElementById('profile-workshop').value.trim(),
                location: document.getElementById('profile-location').value.trim(),
                technique: document.getElementById('profile-technique').value,
                craft_description: document.getElementById('profile-bio').value.trim(),
            });
        }
        await withBusy(btn, 'Saving...', async () => {
            try {
                const { user } = await API.put('/api/auth/me', body);
                API.updateUser(user);
                fillProfile(user);
                toast('Profile updated ✓', 'success');
            } catch (err) { toast(err.message, 'error'); }
        });
    });

    document.getElementById('profile-photo-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            toast('Uploading photo...', 'info');
            const photo_url = await uploadImage(file);
            const { user } = await API.put('/api/auth/me', { photo_url });
            API.updateUser(user);
            fillProfile(user);
            toast('Photo updated ✓', 'success');
        } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('gallery-files').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        if (!files.length) return;
        toast('Uploading ' + files.length + ' photo(s)...', 'info');
        let ok = 0;
        for (const file of files) {
            try {
                const image_url = await uploadImage(file);
                await API.post('/api/artisans/me/gallery', { image_url });
                ok++;
            } catch (err) { toast(err.message, 'error'); }
        }
        if (ok) toast(ok + ' photo(s) added ✓', 'success');
        loadProfileGallery();
    });

    const pwf = document.getElementById('password-form');
    pwf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = pwf.querySelector('button[type=submit]');
        const current_password = document.getElementById('pw-current').value;
        const new_password = document.getElementById('pw-new').value;
        const confirmPw = document.getElementById('pw-confirm').value;
        if (new_password.length < 6) return toast('New password must be at least 6 characters', 'error');
        if (new_password !== confirmPw) return toast('New passwords do not match', 'error');
        await withBusy(btn, 'Updating...', async () => {
            try {
                await API.put('/api/auth/me', { current_password, new_password });
                pwf.reset();
                toast('Password changed ✓', 'success');
            } catch (err) { toast(err.message, 'error'); }
        });
    });
}

// ============================================================
// ARTISTS DIRECTORY + PUBLIC ARTIST PROFILE
// ============================================================
async function showArtists() {
    showScreen('artists-screen');
    const grid = document.getElementById('artists-grid');
    const empty = document.getElementById('artists-empty');
    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';
    empty.classList.add('hidden');

    try {
        const data = await API.get('/api/artisans');
        if (data.count === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        grid.innerHTML = data.artisans.map(a => artisanCard(a)).join('');
    } catch (err) {
        grid.innerHTML = `<p class="text-red-500 col-span-full text-center py-10">${esc(err.message)}</p>`;
    }
}

async function openArtist(artisanId) {
    showScreen('artist-profile-screen');
    const container = document.getElementById('artist-profile-content');
    container.innerHTML = '<p class="text-gray-500">Loading...</p>';

    try {
        const { artisan: a } = await API.get('/api/artisans/' + artisanId);

        const productsHtml = a.products.length === 0
            ? '<p class="text-gray-400 col-span-full">No products listed yet.</p>'
            : a.products.map(p => productCard(p, { hideArtisan: true })).join('');

        const galleryHtml = a.gallery.length ? `
            <div>
                <h2 class="text-lg font-bold text-gray-800 mb-4">From the workshop</h2>
                <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
                    ${a.gallery.map(g => `<a href="${esc(g.image_url)}" target="_blank" class="aspect-square rounded overflow-hidden bg-gray-100 block">${img(g.image_url)}</a>`).join('')}
                </div>
            </div>` : '';

        container.innerHTML = `
            <div class="grid md:grid-cols-3 gap-10 items-start">
                <div class="md:col-span-1">
                    <div class="mb-4">${avatar(a, 'w-32 h-32', 'text-4xl')}</div>
                    <h1 class="text-3xl font-bold text-gray-800 mb-1">${esc(a.name)}</h1>
                    <div class="mb-2">${verifiedBadge(a.status)}</div>
                    <p class="text-sm text-gray-500 mb-1">${esc(a.technique || 'Artisan')}</p>
                    ${a.workshop_name ? `<p class="text-sm text-gray-700 font-semibold">${esc(a.workshop_name)}</p>` : ''}
                    ${a.location ? `<p class="text-xs text-gray-500">${esc(a.location)}</p>` : ''}
                    <p class="text-xs text-gray-400 mb-6 mt-1">On Labzo since ${new Date(a.created_at).getFullYear()}</p>

                    <p class="text-xs uppercase tracking-widest text-brand font-semibold mb-2">About the Artisan</p>
                    <p class="text-sm text-gray-600 leading-relaxed mb-6 whitespace-pre-line">${esc(a.craft_description || 'This artisan has not written a bio yet.')}</p>

                    <div class="flex flex-wrap gap-2">
                        <span class="text-xs border border-gray-300 rounded px-3 py-1 text-gray-600">Hand Made</span>
                        ${a.technique ? `<span class="text-xs border border-gray-300 rounded px-3 py-1 text-gray-600">${esc(a.technique)}</span>` : ''}
                    </div>
                </div>

                <div class="md:col-span-2">
                    <h2 class="text-lg font-bold text-gray-800 mb-4">Artworks by ${esc(a.name)}</h2>
                    <div class="grid grid-cols-2 gap-4">${productsHtml}</div>
                </div>
            </div>
            ${galleryHtml}`;
    } catch (err) {
        container.innerHTML = `<p class="text-red-500">${esc(err.message)}</p>`;
    }
}

// ============================================================
// ARTIST — dashboard, add/edit product, my products, orders
// ============================================================
async function loadArtistDashboard() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');
    showScreen('artist-dashboard-screen');

    document.getElementById('artist-welcome').textContent = 'Welcome, ' + u.name;

    try {
        const [me, products, orders] = await Promise.all([
            API.get('/api/auth/me').catch(() => ({ user: u })),
            API.get('/api/products/me').catch(() => ({ count: 0, products: [] })),
            API.get('/api/orders/artist').catch(() => ({ count: 0, orders: [] })),
        ]);
        API.updateUser(me.user);
        const status = me.user.status || 'pending';

        document.getElementById('artist-status').textContent = status;
        document.getElementById('artist-product-count').textContent = products.count || 0;
        document.getElementById('artist-order-count').textContent = orders.count || 0;
        document.getElementById('artist-pending-count').textContent =
            orders.orders.filter(o => o.status === 'pending' || o.status === 'paid' ||
                (o.status === 'approved' && o.payment_status === 'pending')).length;
        const earned = orders.orders
            .filter(o => ['paid', 'shipped', 'delivered'].includes(o.status))
            .reduce((s, o) => s + Number(o.total), 0) * 0.92;
        document.getElementById('artist-earnings').textContent = money(earned);

        const banner = document.getElementById('artist-verify-banner');
        banner.classList.toggle('hidden', status === 'verified');
        if (status === 'rejected') {
            banner.className = 'mb-6 rounded-lg p-4 text-sm bg-red-50 text-red-800 border border-red-200';
            banner.textContent = 'Your artisan application was not approved, so your listings are hidden from the shop. Contact support@labzo.bt for details.';
        } else if (status !== 'verified') {
            banner.className = 'mb-6 rounded-lg p-4 text-sm bg-amber-50 text-amber-800 border border-amber-200';
            banner.textContent = 'Your account is awaiting verification. You can list products now — the ✓ Verified badge appears on your profile once Labzo approves your workshop.';
        }
    } catch (err) {
        console.error('Artist dashboard error:', err);
    }
}

function setProductPreview(src) {
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('image-preview-img');
    if (src) {
        previewImg.src = src;
        preview.classList.remove('hidden');
    } else {
        preview.classList.add('hidden');
    }
}

function showAddProduct() {
    showScreen('add-product-screen');
    document.getElementById('add-product-form').reset();
    document.getElementById('edit-product-id').value = '';
    document.getElementById('product-form-title').textContent = 'Add New Product';
    document.getElementById('product-form-subtitle').textContent = 'List a new artwork for sale.';
    document.getElementById('product-form-submit').textContent = 'Publish Product';
    document.getElementById('product-status-row').classList.add('hidden');
    document.getElementById('new-stock').value = DEFAULT_STOCK[document.getElementById('new-category').value] || 1;
    setProductPreview(null);
}

async function editProduct(productId) {
    try {
        const { product: p } = await API.get('/api/products/' + productId);
        showAddProduct();
        document.getElementById('edit-product-id').value = p.product_id;
        document.getElementById('new-title').value = p.title;
        document.getElementById('new-description').value = p.description || '';
        document.getElementById('new-price').value = p.price;
        document.getElementById('new-category').value = p.category || 'other';
        document.getElementById('new-stock').value = p.stock;
        document.getElementById('new-status').value = p.status === 'sold_out' ? 'sold_out' : 'available';
        document.getElementById('product-status-row').classList.remove('hidden');
        document.getElementById('product-form-title').textContent = 'Edit Product';
        document.getElementById('product-form-subtitle').textContent = 'Leave the image fields empty to keep the current image.';
        document.getElementById('product-form-submit').textContent = 'Save Changes';
        setProductPreview(p.image_url);
    } catch (err) { toast(err.message, 'error'); }
}

async function showMyProducts() {
    showScreen('my-products-screen');
    const grid = document.getElementById('my-products-grid');
    const empty = document.getElementById('my-products-empty');
    grid.innerHTML = '<p class="text-gray-500 col-span-full">Loading...</p>';
    empty.classList.add('hidden');

    try {
        const data = await API.get('/api/products/me');
        if (data.count === 0) {
            grid.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        grid.innerHTML = data.products.map(p => `
            <div class="bg-white rounded-lg overflow-hidden shadow-sm">
                <div class="aspect-square bg-gray-100 overflow-hidden cursor-pointer" onclick="openProduct(${p.product_id})">${img(p.image_url)}</div>
                <div class="p-3 md:p-4">
                    <div class="flex justify-between items-center mb-1 gap-2">
                        <p class="text-xs text-gray-400 uppercase tracking-wide truncate">${esc(categoryLabel(p.category))}</p>
                        ${pill(p.status)}
                    </div>
                    <h3 class="font-bold text-gray-800 mb-1 truncate">${esc(p.title)}</h3>
                    <p class="text-lg font-bold text-brand mb-1">${money(p.price)}</p>
                    <div class="mb-3">${stockBadge(p.stock)}</div>
                    <div class="flex gap-2">
                        <button onclick="editProduct(${p.product_id})" class="flex-1 text-xs border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-50 transition">Edit</button>
                        <button onclick="deleteProduct(${p.product_id})" class="flex-1 text-xs border border-red-300 text-red-600 py-2 rounded hover:bg-red-50 transition">Delete</button>
                    </div>
                </div>
            </div>`).join('');
    } catch (err) {
        grid.innerHTML = `<p class="text-red-500 col-span-full">${esc(err.message)}</p>`;
    }
}

async function deleteProduct(productId) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
        const r = await API.del('/api/products/' + productId);
        toast(r.archived ? 'Product removed (kept in past orders)' : 'Product deleted', 'success');
        await showMyProducts();
    } catch (err) { toast(err.message, 'error'); }
}

async function showArtistOrders() {
    showScreen('artist-orders-screen');
    const list = document.getElementById('artist-orders-list');
    const empty = document.getElementById('artist-orders-empty');
    list.innerHTML = '<p class="text-gray-500">Loading...</p>';
    empty.classList.add('hidden');

    try {
        const data = await API.get('/api/orders/artist');
        if (data.count === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        list.innerHTML = data.orders.map(o => {
            return `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex justify-between items-start mb-4 pb-4 border-b border-gray-100 gap-4">
                    <div>
                        <p class="text-xs text-gray-400 uppercase tracking-wide">Order #${o.order_id} · ${fmtDate(o.created_at)}</p>
                        <p class="font-bold text-gray-800">${esc(o.buyer_name)}</p>
                        <p class="text-xs text-gray-500"><a href="mailto:${esc(o.buyer_email)}" class="hover:underline">${esc(o.buyer_email)}</a></p>
                    </div>
                    <div class="text-right">
                        ${pill(o.status)}
                        <p class="font-bold text-lg text-brand mt-2">${money(o.total)}</p>
                    </div>
                </div>
                <div class="space-y-3 mb-4">
                    ${o.items.map(i => `
                        <div class="flex items-center gap-3 text-sm">
                            <div class="w-12 h-12 rounded overflow-hidden bg-gray-100 flex-shrink-0">${img(i.image_url)}</div>
                            <span class="flex-1">${esc(i.title)} × ${i.quantity} <span class="text-xs text-gray-400">(${i.stock} in stock)</span></span>
                            <span class="text-gray-500">${money(i.price * i.quantity)}</span>
                        </div>`).join('')}
                </div>
                ${artistOrderActions(o)}
            </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = `<p class="text-red-500">${esc(err.message)}</p>`;
    }
}

// What the artist can do next, depending on the order and its payment screenshot
function artistOrderActions(o) {
    const btn = (label, onclick, cls) =>
        `<button onclick="${onclick}" class="px-4 py-2 rounded text-xs font-semibold transition disabled:opacity-50 ${cls}">${label}</button>`;
    const primary = 'bg-gray-900 text-white hover:bg-gray-700';
    const danger = 'border border-red-300 text-red-600 hover:bg-red-50';
    const status = (s, label, cls) => btn(label, `updateOrderStatus(${o.order_id}, '${s}', this)`, cls);
    const wrap = (inner) => `<div class="pt-4 border-t border-gray-100">${inner}</div>`;

    switch (o.status) {
        case 'pending':
            return wrap(`
                <p class="text-xs text-gray-500 mb-3">Approve this order so the buyer can pay and upload a payment screenshot.</p>
                <div class="flex flex-wrap gap-2">${status('approved', 'Approve order', primary)}${status('cancelled', 'Decline', danger)}</div>`);
        case 'approved':
            if (o.payment_status !== 'pending') {
                return wrap(`
                    <p class="text-xs text-gray-500 mb-3">${o.payment_status === 'rejected'
                        ? 'Screenshot rejected — waiting for the buyer to upload a new one.'
                        : 'Approved — waiting for the buyer to pay and upload a screenshot.'}</p>
                    <div class="flex flex-wrap gap-2">${status('cancelled', 'Cancel order', danger)}</div>`);
            }
            return wrap(`
                <p class="text-xs font-bold uppercase tracking-wide text-gray-700 mb-2">Payment screenshot</p>
                <a href="${esc(o.proof_url)}" target="_blank" class="block w-40 h-40 rounded overflow-hidden bg-gray-100 border border-gray-200 mb-3" title="Open full size">${img(o.proof_url, 'w-full h-full object-contain')}</a>
                <p class="text-xs text-gray-500 mb-3">Check that ${money(o.total)} reached the account. Confirming takes the items out of stock.</p>
                <div class="flex flex-wrap gap-2">
                    ${btn('Confirm payment', `reviewPayment(${o.order_id}, 'verified', this)`, primary)}
                    ${btn('Reject screenshot', `reviewPayment(${o.order_id}, 'rejected', this)`, 'border border-gray-300 text-gray-700 hover:bg-gray-50')}
                </div>`);
        case 'paid':
            return wrap(`<p class="text-xs text-green-700 font-semibold mb-3">✓ Payment confirmed</p>
                <div class="flex flex-wrap gap-2">${status('shipped', 'Mark as shipped', primary)}</div>`);
        case 'shipped':
            return wrap(`<div class="flex flex-wrap gap-2">${status('delivered', 'Mark as delivered', primary)}</div>`);
        default:
            return '';
    }
}

async function updateOrderStatus(orderId, status, btn) {
    if (status === 'cancelled' && !confirm('Cancel order #' + orderId + '? This cannot be undone.')) return;
    await withBusy(btn, 'Saving...', async () => {
        try {
            await API.put('/api/orders/' + orderId + '/status', { status });
            toast('Order #' + orderId + ' → ' + status, 'success');
            showArtistOrders();
        } catch (err) { toast(err.message, 'error'); }
    });
}

async function reviewPayment(orderId, status, btn) {
    const msg = status === 'verified'
        ? 'Confirm you received this payment? The items will be taken out of stock.'
        : 'Reject this screenshot? The buyer will be asked to upload a new one.';
    if (!confirm(msg)) return;
    await withBusy(btn, 'Saving...', async () => {
        try {
            await API.put('/api/orders/' + orderId + '/payment', { status });
            toast(status === 'verified' ? 'Payment confirmed — order marked paid' : 'Screenshot rejected', 'success');
            showArtistOrders();
        } catch (err) { toast(err.message, 'error'); }
    });
}

function initProductForm() {
    const form = document.getElementById('add-product-form');
    const fileInput = document.getElementById('new-image-file');
    const urlInput = document.getElementById('new-image-url');
    const stockInput = document.getElementById('new-stock');

    // New products: suggest a stock count for the chosen category
    document.getElementById('new-category').addEventListener('change', (e) => {
        if (!document.getElementById('edit-product-id').value) {
            stockInput.value = DEFAULT_STOCK[e.target.value] || 1;
        }
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > MAX_IMAGE_BYTES) {
            toast('Image must be under 5MB', 'error');
            fileInput.value = '';
            return;
        }
        setProductPreview(URL.createObjectURL(file));
        urlInput.value = '';
    });

    urlInput.addEventListener('change', () => {
        const url = urlInput.value.trim();
        if (url) {
            setProductPreview(url);
            fileInput.value = '';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('product-form-submit');
        const editId = document.getElementById('edit-product-id').value;
        const title = document.getElementById('new-title').value.trim();
        const description = document.getElementById('new-description').value.trim();
        const price = parseFloat(document.getElementById('new-price').value);
        const category = document.getElementById('new-category').value;
        const stock = parseInt(stockInput.value, 10);
        const file = fileInput.files[0];
        const urlValue = urlInput.value.trim();

        if (!title || isNaN(price) || price < 0) return toast('Title and a valid price are required', 'error');
        if (isNaN(stock) || stock < 0) return toast('Quantity in stock must be 0 or more', 'error');

        await withBusy(btn, file ? 'Uploading image...' : 'Saving...', async () => {
            try {
                let image_url;
                if (file) image_url = await uploadImage(file);
                else if (urlValue) image_url = urlValue;

                const body = { title, description, price, category, image_url, stock };
                if (editId) {
                    body.status = document.getElementById('new-status').value;
                    await API.put('/api/products/' + editId, body);
                    toast('Product updated ✓', 'success');
                } else {
                    await API.post('/api/products', body);
                    toast('Product published ✓', 'success');
                }
                showMyProducts();
            } catch (err) { toast(err.message, 'error'); }
        });
    });
}

// ============================================================
// ADMIN
// ============================================================
async function showAdmin() {
    if (API.getUser()?.role !== 'admin') return goHome();
    showScreen('admin-screen');

    const statsEl = document.getElementById('admin-stats');
    try {
        const s = await API.get('/api/admin/stats');
        const card = (label, value, sub) => `
            <div class="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
                <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${label}</p>
                <p class="text-2xl font-bold text-brand">${value}</p>
                <p class="text-xs text-gray-500 mt-1">${sub}</p>
            </div>`;
        statsEl.innerHTML =
            card('Artisans', s.artisans, s.pending_artisans + ' awaiting verification') +
            card('Payments', s.pending_payments, 'proofs to review') +
            card('Orders', s.orders, s.products + ' live products · ' + s.buyers + ' buyers') +
            card('Sales', money(s.revenue), 'Labzo 8%: ' + money(s.revenue * 0.08));
    } catch (err) {
        statsEl.innerHTML = `<p class="text-red-500 col-span-full">${esc(err.message)}</p>`;
    }
    showAdminTab(state.adminTab);
}

async function showAdminTab(tab) {
    state.adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.adminTab === tab));
    const box = document.getElementById('admin-content');
    box.innerHTML = '<p class="text-gray-500">Loading...</p>';

    try {
        if (tab === 'artisans') {
            const { artisans } = await API.get('/api/admin/artisans');
            box.innerHTML = artisans.length ? artisans.map(a => `
                <div class="bg-white rounded-lg p-5 shadow-sm flex flex-col md:flex-row gap-4 md:items-center">
                    ${avatar(a, 'w-14 h-14', 'text-lg')}
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800">${esc(a.name)} ${pill(a.status)}</p>
                        <p class="text-xs text-gray-500">${esc(a.email)}${a.phone ? ' · ' + esc(a.phone) : ''}</p>
                        <p class="text-xs text-gray-500">${esc([a.technique, a.workshop_name, a.location].filter(Boolean).join(' · ') || 'No workshop details')}</p>
                        <p class="text-xs text-gray-400">${a.product_count} product(s) · joined ${fmtDate(a.created_at)}</p>
                        ${a.craft_description ? `<p class="text-xs text-gray-600 mt-1 line-clamp-2">${esc(a.craft_description)}</p>` : ''}
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="openArtist(${a.artisan_id})" class="text-xs border border-gray-300 px-3 py-2 rounded hover:bg-gray-50">View</button>
                        ${a.status !== 'verified' ? `<button onclick="setArtisanStatus(${a.artisan_id}, 'verified')" class="text-xs bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700">Verify</button>` : ''}
                        ${a.status !== 'rejected' ? `<button onclick="setArtisanStatus(${a.artisan_id}, 'rejected')" class="text-xs border border-red-300 text-red-600 px-3 py-2 rounded hover:bg-red-50">Reject</button>` : ''}
                        ${a.status !== 'pending' ? `<button onclick="setArtisanStatus(${a.artisan_id}, 'pending')" class="text-xs border border-gray-300 text-gray-600 px-3 py-2 rounded hover:bg-gray-50">Reset</button>` : ''}
                    </div>
                </div>`).join('') : '<p class="text-gray-400">No artisans yet.</p>';
        } else if (tab === 'payments') {
            const { payments } = await API.get('/api/admin/payments');
            box.innerHTML = payments.length ? payments.map(p => `
                <div class="bg-white rounded-lg p-5 shadow-sm flex flex-col md:flex-row gap-4 md:items-center">
                    <a href="${esc(p.proof_url)}" target="_blank" class="w-24 h-24 rounded overflow-hidden bg-gray-100 flex-shrink-0 block" title="Open full size">${img(p.proof_url)}</a>
                    <div class="flex-1">
                        <p class="font-bold text-gray-800">Order #${p.order_id} · ${money(p.total)} ${pill(p.status)}</p>
                        <p class="text-xs text-gray-500">${esc(p.buyer_name)} (${esc(p.buyer_email)}) → ${esc(p.artisan_name)}</p>
                        <p class="text-xs text-gray-400">Uploaded ${fmtDate(p.uploaded_at)} · order is ${esc(p.order_status)}</p>
                        ${p.status === 'pending' ? '<p class="text-xs text-amber-700">Waiting for the artisan to verify this payment.</p>' : ''}
                    </div>
                </div>`).join('') : '<p class="text-gray-400">No payment proofs yet.</p>';
        } else {
            const { orders } = await API.get('/api/admin/orders');
            box.innerHTML = orders.length ? `
                <div class="bg-white rounded-lg shadow-sm overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="text-xs text-gray-400 uppercase tracking-wide text-left">
                            <tr><th class="p-4">Order</th><th class="p-4">Date</th><th class="p-4">Buyer</th><th class="p-4">Artisan</th><th class="p-4">Items</th><th class="p-4">Total</th><th class="p-4">Status</th></tr>
                        </thead>
                        <tbody>
                            ${orders.map(o => `
                                <tr class="border-t border-gray-100">
                                    <td class="p-4 font-semibold">#${o.order_id}</td>
                                    <td class="p-4 text-gray-500">${fmtDate(o.created_at)}</td>
                                    <td class="p-4">${esc(o.buyer_name)}</td>
                                    <td class="p-4">${esc(o.artisan_name)}</td>
                                    <td class="p-4">${o.item_count}</td>
                                    <td class="p-4 font-semibold">${money(o.total)}</td>
                                    <td class="p-4">${pill(o.status)}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>` : '<p class="text-gray-400">No orders yet.</p>';
        }
    } catch (err) {
        box.innerHTML = `<p class="text-red-500">${esc(err.message)}</p>`;
    }
}

async function setArtisanStatus(id, status) {
    try {
        await API.put('/api/admin/artisans/' + id + '/status', { status });
        toast('Artisan ' + status, 'success');
        showAdmin();
    } catch (err) { toast(err.message, 'error'); }
}

// ============================================================
// START
// ============================================================
window.addEventListener('load', () => {
    fillSelects();
    renderFooters();
    initAuth();
    initShop();
    initOrders();
    initProfile();
    initProductForm();
    document.querySelectorAll('.admin-tab').forEach(b =>
        b.addEventListener('click', () => showAdminTab(b.dataset.adminTab)));

    // Auto-login if a session exists
    if (API.getUser() && API.getToken()) loadDashboard();
    else showScreen('login-screen');
});

// Expose for inline onclick handlers
Object.assign(window, {
    showScreen, toast, loadDashboard, goHome, logout,
    loadHome, openShop, searchShop, clearShopSearch, loadShop,
    openProduct, addToBag, buyNow, openBag, renderBag, updateQty, removeItem, checkout,
    showOrders, choosePaymentProof, cancelOrder,
    showSaved, toggleSaved,
    showProfile, removeGalleryImage,
    showArtists, openArtist,
    loadArtistDashboard, showAddProduct, editProduct, showMyProducts, deleteProduct,
    showArtistOrders, updateOrderStatus, reviewPayment,
    removeWorkshopFile, setArtworkFile,
    showAdmin, showAdminTab, setArtisanStatus,
});
