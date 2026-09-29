// ============================================================
// LABZO — CLEAN WORKING SCRIPT
// ============================================================

const API = {
    getToken() { return localStorage.getItem('labzo_token'); },
    getUser() {
        const raw = localStorage.getItem('labzo_user');
        return raw ? JSON.parse(raw) : null;
    },
    saveSession(user, token) {
        localStorage.setItem('labzo_user', JSON.stringify(user));
        localStorage.setItem('labzo_token', token);
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
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    },
    get(p) { return this.request(p); },
    post(p, b) { return this.request(p, { method: 'POST', body: JSON.stringify(b) }); },
    put(p, b) { return this.request(p, { method: 'PUT', body: JSON.stringify(b) }); },
    del(p) { return this.request(p, { method: 'DELETE' }); },
};

// ---------- Screen navigation ----------
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
    });
    const t = document.getElementById(id);
    if (t) {
        t.style.display = 'flex';
        t.classList.add('active');
    }
    console.log('[showScreen]', id);
}

function toast(msg, type = 'info') {
    const colors = { info: 'bg-gray-900', success: 'bg-green-600', error: 'bg-red-600' };
    const el = document.createElement('div');
    el.className = `fixed top-4 right-4 ${colors[type]} text-white px-4 py-2 rounded shadow-lg z-[9999] text-sm`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ---------- On page load ----------
window.addEventListener('load', () => {
    console.log('Labzo loaded');

    // Wire nav buttons
    const bind = (id, ev, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
    };

    bind('btn-go-signup', 'click', () => showScreen('signup-screen'));
    bind('btn-go-artist', 'click', () => showScreen('artist-step1'));
    bind('link-to-signup', 'click', () => showScreen('signup-screen'));
    bind('btn-buy-signup', 'click', () => showScreen('login-screen'));
    bind('btn-sell-signup', 'click', () => showScreen('artist-step1'));
    bind('link-to-login', 'click', () => showScreen('login-screen'));
    bind('btn-artist-cancel-1', 'click', () => showScreen('login-screen'));
    bind('btn-artist-back-2', 'click', () => showScreen('artist-step1'));
    bind('btn-artist-back-3', 'click', () => showScreen('artist-step2'));

    // Login
    const lf = document.getElementById('login-form');
    if (lf) lf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        try {
            let result;
            try { result = await API.post('/api/auth/login', { email, password, role: 'buyer' }); }
            catch { result = await API.post('/api/auth/login', { email, password, role: 'artisan' }); }
            API.saveSession(result.user, result.token);
            toast('Welcome, ' + result.user.name, 'success');
            loadDashboard();
        } catch (err) { toast(err.message, 'error'); }
    });

    // Signup
    const sf = document.getElementById('signup-form');
    if (sf) sf.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        try {
            const r = await API.post('/api/auth/register', { name, email, password, role: 'buyer' });
            API.saveSession(r.user, r.token);
            toast('Account created!', 'success');
            loadDashboard();
        } catch (err) { toast(err.message, 'error'); }
    });

    // Logout
    bind('btn-logout', 'click', () => {
        API.clearSession();
        toast('Logged out', 'info');
        showScreen('login-screen');
    });

    // Auto-login if session exists
    const u = API.getUser();
    if (u && API.getToken()) {
        console.log('Auto-login for', u.email);
        loadDashboard();
    } else {
        showScreen('login-screen');
    }
});

// ---------- Dashboard ----------
function loadDashboard() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');

    if (u.role === 'artisan') {
        loadArtistDashboard();
    } else {
        loadBuyerDashboard();
    }
}

function loadBuyerDashboard() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');
    loadShop().then(() => showScreen('shop-screen'));
}

async function loadArtistDashboard() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');

    const welcomeEl = document.getElementById('artist-welcome');
    const statusEl = document.getElementById('artist-status');
    if (welcomeEl) welcomeEl.textContent = 'Welcome, ' + u.name;
    if (statusEl) statusEl.textContent = u.status || 'pending';

    try {
        const products = await API.get('/api/products/me').catch(() => ({ count: 0 }));
        const orders = await API.get('/api/orders/artist').catch(() => ({ count: 0 }));
        const prodEl = document.getElementById('artist-product-count');
        const orderEl = document.getElementById('artist-order-count');
        if (prodEl) prodEl.textContent = products.count || 0;
        if (orderEl) orderEl.textContent = orders.count || 0;
    } catch (err) {
        console.error('Artist dashboard error:', err);
    }

    showScreen('artist-dashboard-screen');
}

// ---------- Expose to window (for inline onclick) ----------
window.showScreen = showScreen;
window.toast = toast;
window.loadDashboard = loadDashboard;

// ============================================================
// SHOP — list products
// ============================================================
async function loadShop() {
    console.log('[loadShop] called');
    const grid = document.getElementById('shop-grid');
    const empty = document.getElementById('shop-empty');
    if (!grid) {
        console.warn('[loadShop] shop-grid not found');
        return;
    }

    const search = document.getElementById('shop-search')?.value.trim() || '';
    const category = document.getElementById('shop-category')?.value || '';

    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';
    if (empty) empty.classList.add('hidden');

    try {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (category) params.set('category', category);
        const url = '/api/products' + (params.toString() ? '?' + params.toString() : '');

        const data = await API.get(url);
        console.log('[loadShop] got', data.count, 'products');

        if (data.count === 0) {
            grid.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }

        grid.innerHTML = data.products.map(p => `
            <div onclick="openProduct(${p.product_id})"
                 class="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer">
                <div class="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                    ${p.image_url ? '<img src="' + p.image_url + '" class="w-full h-full object-cover">' : '<span class="text-gray-400 text-sm">No image</span>'}
                </div>
                <div class="p-4">
                    <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${p.category || 'Artwork'}</p>
                    <h3 class="font-bold text-gray-800 mb-1">${p.title}</h3>
                    <p class="text-xs text-gray-500 mb-2">by ${p.artisan_name}</p>
                    <p class="text-lg font-bold text-brand">Nu. ${Number(p.price).toFixed(2)}</p>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('[loadShop] error:', err);
        grid.innerHTML = '<p class="text-red-500 col-span-full text-center py-10">' + err.message + '</p>';
    }
}

window.loadShop = loadShop;
console.log(' Shop module added');

// ============================================================
// BAG — real cart operations
// ============================================================
async function openBag() {
    console.log('[openBag] called');
    const user = API.getUser();
    if (!user || user.role !== 'buyer') {
        toast('Please log in as a buyer', 'error');
        return;
    }
    showScreen('bag-screen');
    await renderBag();
}

async function renderBag() {
    const container = document.getElementById('bag-content');
    const empty = document.getElementById('bag-empty');
    if (!container) {
        console.warn('[renderBag] bag-content not found');
        return;
    }

    container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading bag...</p>';
    if (empty) empty.classList.add('hidden');

    try {
        const cart = await API.get('/api/cart');
        console.log('[renderBag] got', cart.count, 'items');

        if (cart.count === 0) {
            container.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }

        const itemsHtml = cart.items.map(item => `
            <div class="bg-white rounded-lg p-4 flex gap-4 items-center shadow-sm">
                <div class="w-20 h-20 bg-gray-100 rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
                    ${item.image_url ? '<img src="' + item.image_url + '" class="w-full h-full object-cover">' : '<span class="text-xs text-gray-400">No img</span>'}
                </div>
                <div class="flex-1">
                    <p class="text-xs text-gray-400 uppercase tracking-wide">${item.category || 'Artwork'}</p>
                    <h3 class="font-bold text-gray-800">${item.title}</h3>
                    <p class="text-xs text-gray-500">by ${item.artisan_name}</p>
                    <p class="text-sm font-bold text-brand mt-1">Nu. ${Number(item.price).toFixed(2)}</p>
                </div>
                <div class="flex flex-col items-end gap-2">
                    <div class="flex items-center border border-gray-300 rounded">
                        <button onclick="updateQty(${item.cart_item_id}, ${item.quantity - 1})" class="px-3 py-1 text-gray-600 hover:bg-gray-100">-</button>
                        <span class="px-3 py-1 text-sm font-semibold">${item.quantity}</span>
                        <button onclick="updateQty(${item.cart_item_id}, ${item.quantity + 1})" class="px-3 py-1 text-gray-600 hover:bg-gray-100">+</button>
                    </div>
                    <button onclick="removeItem(${item.cart_item_id})" class="text-xs text-red-500 hover:underline">Remove</button>
                </div>
            </div>
        `).join('');

        const summaryHtml = `
            <div class="lg:col-span-1">
                <div class="bg-white rounded-lg p-6 shadow-sm">
                    <h2 class="text-lg font-bold mb-4">Order Summary</h2>
                    <div class="flex justify-between text-sm mb-2">
                        <span class="text-gray-600">Subtotal</span>
                        <span class="font-semibold">$${cart.total.toFixed(2)}</span>
                    </div>
                    <div class="flex justify-between text-sm mb-4 pb-4 border-b border-gray-200">
                        <span class="text-gray-600">Shipping</span>
                        <span class="text-gray-500 text-xs">At delivery</span>
                    </div>
                    <div class="flex justify-between mb-6">
                        <span class="font-bold">Total</span>
                        <span class="font-bold text-xl text-brand">$${cart.total.toFixed(2)}</span>
                    </div>
                    <button onclick="checkout()" class="w-full bg-gray-900 text-white py-3 rounded text-sm font-semibold hover:bg-gray-700 transition">Checkout</button>
                    <button onclick="loadShop(); showScreen('shop-screen')" class="w-full mt-3 text-xs text-gray-500 hover:underline">Continue shopping</button>
                </div>
            </div>
        `;

        container.innerHTML = '<div class="lg:col-span-2 space-y-4">' + itemsHtml + '</div>' + summaryHtml;
    } catch (err) {
        console.error('[renderBag] error:', err);
        container.innerHTML = '<p class="text-red-500 col-span-full">' + err.message + '</p>';
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

async function checkout() {
    if (!confirm('Place this order?')) return;
    try {
        const result = await API.post('/api/orders/checkout');
        toast('Order placed! ' + result.orders.length + ' order(s) created.', 'success');
        await renderBag();
    } catch (err) { toast(err.message, 'error'); }
}

// Add to bag from product detail
async function addToBag(productId) {
    const user = API.getUser();
    if (!user || user.role !== 'buyer') {
        toast('Log in as buyer to add to bag', 'error');
        return;
    }
    try {
        await API.post('/api/cart/items', { product_id: productId, quantity: 1 });
        toast('Added to bag ✓', 'success');
    } catch (err) { toast(err.message, 'error'); }
}

// Wishlist
async function saveToWishlist(productId) {
    const user = API.getUser();
    if (!user || user.role !== 'buyer') {
        toast('Log in as buyer to save', 'error');
        return;
    }
    try {
        await API.post('/api/wishlist', { product_id: productId });
        toast('Saved to wishlist ♡', 'success');
    } catch (err) { toast(err.message, 'error'); }
}

// Product detail
async function openProduct(productId) {
    showScreen('product-screen');
    const container = document.getElementById('product-detail');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';

    try {
        const data = await API.get('/api/products/' + productId);
        const p = data.product;

        container.innerHTML = `
            <div class="aspect-square bg-white rounded-lg overflow-hidden shadow-sm flex items-center justify-center">
                ${p.image_url ? '<img src="' + p.image_url + '" class="w-full h-full object-cover">' : '<span class="text-gray-400">No image</span>'}
            </div>
            <div class="flex flex-col justify-center">
                <p class="text-xs text-gray-400 uppercase tracking-widest mb-2">${p.category || 'Artwork'}</p>
                <h1 class="text-4xl font-bold text-gray-800 mb-4">${p.title}</h1>
                <p class="text-2xl text-brand font-bold mb-6">Nu. ${Number(p.price).toFixed(2)}</p>
                <div class="mb-6 pb-6 border-b border-gray-200">
                    <p class="text-sm text-gray-600 leading-relaxed">${p.description || 'No description.'}</p>
                </div>
                <div class="mb-6 pb-6 border-b border-gray-200">
                    <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">Artisan</p>
                    <p class="font-bold text-gray-800">${p.artisan_name}</p>
                </div>
                <div class="flex gap-3">
                    <button onclick="addToBag(${p.product_id})" class="flex-1 bg-gray-900 text-white py-3 rounded text-sm font-semibold hover:bg-gray-700 transition">Add to Bag</button>
                    <button onclick="saveToWishlist(${p.product_id})" class="px-6 py-3 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 transition">♡ Save</button>
                </div>
                <button onclick="showScreen('shop-screen')" class="mt-6 text-xs text-gray-500 hover:underline text-left">← Back to Shop</button>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<p class="text-red-500 col-span-full">' + err.message + '</p>';
    }
}

window.openBag = openBag;
window.renderBag = renderBag;
window.updateQty = updateQty;
window.removeItem = removeItem;
window.checkout = checkout;
window.addToBag = addToBag;
window.saveToWishlist = saveToWishlist;
window.openProduct = openProduct;

console.log(' Bag + Product modules added');

// ============================================================
// ARTIST FUNCTIONS
// ============================================================
function showAddProduct() {
    showScreen('add-product-screen');
    const form = document.getElementById('add-product-form');
    if (form) form.reset();
}

async function showMyProducts() {
    showScreen('my-products-screen');
    const grid = document.getElementById('my-products-grid');
    const empty = document.getElementById('my-products-empty');
    if (!grid) return;

    grid.innerHTML = '<p class="text-gray-500 col-span-full">Loading...</p>';
    if (empty) empty.classList.add('hidden');

    try {
        const data = await API.get('/api/products/me');
        if (data.count === 0) {
            grid.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        grid.innerHTML = data.products.map(p => `
            <div class="bg-white rounded-lg overflow-hidden shadow-sm">
                <div class="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                    ${p.image_url ? '<img src="' + p.image_url + '" class="w-full h-full object-cover">' : '<span class="text-xs text-gray-400">No image</span>'}
                </div>
                <div class="p-4">
                    <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${p.category || 'Artwork'}</p>
                    <h3 class="font-bold text-gray-800 mb-1">${p.title}</h3>
                    <p class="text-lg font-bold text-brand mb-3">Nu. ${Number(p.price).toFixed(2)}</p>
                    <div class="flex gap-2">
                        <button onclick="editProduct(${p.product_id})"
                            class="flex-1 text-xs border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-50 transition">
                            Edit
                        </button>
                        <button onclick="deleteProduct(${p.product_id})"
                            class="flex-1 text-xs border border-red-300 text-red-600 py-2 rounded hover:bg-red-50 transition">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = '<p class="text-red-500 col-span-full">' + err.message + '</p>';
    }
}

// --------------------------------------------
// DELETE PRODUCT
// --------------------------------------------
async function deleteProduct(productId) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
        await API.del('/api/products/' + productId);
        toast('Product deleted', 'success');
        await showMyProducts();
    } catch (err) {
        toast(err.message, 'error');
    }
}

// --------------------------------------------
// EDIT PRODUCT (simple prompt-based for now)
// --------------------------------------------
async function editProduct(productId) {
    try {
        const data = await API.get('/api/products/' + productId);
        const p = data.product;

        const title = prompt('Title:', p.title);
        if (title === null) return;
        const price = prompt('Price:', p.price);
        if (price === null) return;
        const description = prompt('Description:', p.description || '');
        if (description === null) return;
        const image_url = prompt('Image URL:', p.image_url || '');
        if (image_url === null) return;
        const category = prompt('Category:', p.category || 'other');
        if (category === null) return;

        await API.put('/api/products/' + productId, {
            title, price: parseFloat(price), description, image_url, category
        });
        toast('Product updated ✓', 'success');
        await showMyProducts();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function showArtistOrders() {
    showScreen('artist-orders-screen');
    const list = document.getElementById('artist-orders-list');
    const empty = document.getElementById('artist-orders-empty');
    if (!list) return;

    list.innerHTML = '<p class="text-gray-500">Loading...</p>';
    if (empty) empty.classList.add('hidden');

    try {
        const data = await API.get('/api/orders/artist');
        if (data.count === 0) {
            list.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        list.innerHTML = data.orders.map(o => `
            <div class="bg-white rounded-lg p-6 shadow-sm">
                <div class="flex justify-between items-start mb-4 pb-4 border-b border-gray-100">
                    <div>
                        <p class="text-xs text-gray-400 uppercase tracking-wide">Order #${o.order_id}</p>
                        <p class="font-bold text-gray-800">${o.buyer_name}</p>
                        <p class="text-xs text-gray-500">${o.buyer_email}</p>
                    </div>
                    <div class="text-right">
                        <select onchange="updateOrderStatus(${o.order_id}, this.value)" class="border border-gray-300 rounded text-xs px-2 py-1">
                            ${['pending','paid','shipped','delivered','cancelled'].map(s =>
                                `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                        <p class="font-bold text-lg text-brand mt-2">Nu. ${Number(o.total).toFixed(2)}</p>
                    </div>
                </div>
                <div class="space-y-2">
                    ${o.items.map(i => `
                        <div class="flex justify-between text-sm">
                            <span>${i.title} × ${i.quantity}</span>
                            <span class="text-gray-500">Nu. ${Number(i.price).toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-red-500">' + err.message + '</p>';
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await API.put('/api/orders/' + orderId + '/status', { status });
        toast('Order #' + orderId + ' → ' + status, 'success');
    } catch (err) { toast(err.message, 'error'); }
}

// Add-product form
window.addEventListener('load', () => {
    const form = document.getElementById('add-product-form');
    const fileInput = document.getElementById('new-image-file');
    const urlInput = document.getElementById('new-image-url');
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('image-preview-img');

    // Show preview when file is picked
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file && preview && previewImg) {
                previewImg.src = URL.createObjectURL(file);
                preview.classList.remove('hidden');
                if (urlInput) urlInput.value = ''; // clear the other
            }
        });
    }

    // Show preview when URL is typed (on blur)
    if (urlInput) {
        urlInput.addEventListener('change', () => {
            const url = urlInput.value.trim();
            if (url && preview && previewImg) {
                previewImg.src = url;
                preview.classList.remove('hidden');
                if (fileInput) fileInput.value = ''; // clear the other
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('new-title').value.trim();
            const description = document.getElementById('new-description').value.trim();
            const price = parseFloat(document.getElementById('new-price').value);
            const category = document.getElementById('new-category').value;
            const file = fileInput?.files[0];
            const urlValue = urlInput?.value.trim();

            if (!title || isNaN(price)) {
                toast('Title and price are required', 'error');
                return;
            }

            try {
                let image_url = null;

                if (file) {
                    // Option 1: upload the file
                    toast('Uploading image...', 'info');
                    const fd = new FormData();
                    fd.append('image', file);
                    const token = API.getToken();
                    const res = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token },
                        body: fd,
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Upload failed');
                    image_url = data.url;
                } else if (urlValue) {
                    // Option 2: use the pasted URL
                    image_url = urlValue;
                }

                await API.post('/api/products', { title, description, price, category, image_url });
                toast('Product published ✓', 'success');
                loadArtistDashboard();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }
});

// Exports
window.loadArtistDashboard = loadArtistDashboard;
window.loadBuyerDashboard = loadBuyerDashboard;
window.showAddProduct = showAddProduct;
window.showMyProducts = showMyProducts;
window.showArtistOrders = showArtistOrders;
window.updateOrderStatus = updateOrderStatus;

console.log(' Artist module loaded');

// Delete/Edit exports
window.deleteProduct = deleteProduct;
window.editProduct = editProduct;

// ============================================================
// HOME router — buyers go to Shop, artists go to Dashboard
// ============================================================


console.log(' goHome added');

// ============================================================
// ARTISTS DIRECTORY + PROFILE + ABOUT
// ============================================================

async function showArtists() {
    showScreen('artists-screen');
    const grid = document.getElementById('artists-grid');
    const empty = document.getElementById('artists-empty');
    if (!grid) return;

    grid.innerHTML = '<p class="text-gray-500 col-span-full text-center py-10">Loading...</p>';
    if (empty) empty.classList.add('hidden');

    try {
        const data = await API.get('/api/artisans');
        if (data.count === 0) {
            grid.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        grid.innerHTML = data.artisans.map(a => `
            <div onclick="openArtist(${a.artisan_id})"
                 class="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition cursor-pointer border border-gray-100">
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-14 h-14 rounded-full bg-brand text-white flex items-center justify-center text-lg font-bold">
                        ${a.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h3 class="font-bold text-gray-800">${a.name}</h3>
                        <p class="text-xs text-gray-500">${a.technique || 'Artisan'}</p>
                    </div>
                </div>
                <p class="text-sm text-gray-600 line-clamp-3">${a.craft_description || 'Artisan workshop.'}</p>
                <p class="text-xs text-brand font-semibold mt-4">View profile →</p>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = '<p class="text-red-500 col-span-full text-center py-10">' + err.message + '</p>';
    }
}

async function openArtist(artisanId) {
    showScreen('artist-profile-screen');
    const container = document.getElementById('artist-profile-content');
    if (!container) return;
    container.innerHTML = '<p class="text-gray-500">Loading...</p>';

    try {
        const data = await API.get('/api/artisans/' + artisanId);
        const a = data.artisan;
        const initial = a.name.charAt(0).toUpperCase();

        const productsHtml = a.products.length === 0
            ? '<p class="text-gray-400 col-span-full">No products listed yet.</p>'
            : a.products.map(p => `
                <div onclick="openProduct(${p.product_id})"
                     class="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer">
                    <div class="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                        ${p.image_url ? '<img src="' + p.image_url + '" class="w-full h-full object-cover">' : '<span class="text-xs text-gray-400">No image</span>'}
                    </div>
                    <div class="p-4">
                        <p class="text-xs text-gray-400 uppercase tracking-wide mb-1">${p.category || 'Artwork'}</p>
                        <h3 class="font-bold text-gray-800 mb-1">${p.title}</h3>
                        <p class="text-lg font-bold text-brand">Nu. ${Number(p.price).toFixed(2)}</p>
                    </div>
                </div>
            `).join('');

        container.innerHTML = `
            <div class="grid md:grid-cols-3 gap-10 items-start">
                <div class="md:col-span-1">
                    <div class="w-32 h-32 rounded-full bg-brand text-white flex items-center justify-center text-4xl font-bold mb-4">
                        ${initial}
                    </div>
                    <h1 class="text-3xl font-bold text-gray-800 mb-1">${a.name}</h1>
                    <p class="text-sm text-gray-500 mb-1">${a.technique || 'Artisan'}</p>
                    <p class="text-xs text-gray-400 mb-6">Workshop since ${new Date(a.created_at).getFullYear()}</p>

                    <p class="text-xs uppercase tracking-widest text-brand font-semibold mb-2">About the Artisan</p>
                    <p class="text-sm text-gray-600 leading-relaxed mb-6">${a.craft_description || 'This artisan has not written a bio yet.'}</p>

                    <div class="flex gap-2">
                        <span class="text-xs border border-gray-300 rounded px-3 py-1 text-gray-600">Hand Made</span>
                        ${a.technique ? `<span class="text-xs border border-gray-300 rounded px-3 py-1 text-gray-600">${a.technique}</span>` : ''}
                    </div>
                </div>

                <div class="md:col-span-2">
                    <h2 class="text-lg font-bold text-gray-800 mb-4">Artworks by ${a.name}</h2>
                    <div class="grid grid-cols-2 gap-4">${productsHtml}</div>
                </div>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<p class="text-red-500">' + err.message + '</p>';
    }
}

window.showArtists = showArtists;
window.openArtist = openArtist;
console.log(' Artists + About modules loaded');


function goHome() {
    const u = API.getUser();
    if (!u) return showScreen('login-screen');
    if (u.role === 'artisan') return loadArtistDashboard();
    loadShop().then(() => showScreen('shop-screen'));
}

window.goHome = goHome;
