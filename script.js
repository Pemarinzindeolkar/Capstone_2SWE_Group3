// ==========================================
// BACKEND SIMULATION LOGIC
// ==========================================

const brandName = 'Labzo';

function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });

    const activeScreen = document.getElementById(screenId);
    if (activeScreen) {
        activeScreen.classList.add('active');
        activeScreen.style.display = 'flex';
    }
}

function formatDisplayName(email) {
    const localPart = email.split('@')[0] || 'artist';
    return localPart
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function setDashboardContent(title, detailsHtml) {
    const welcomeMessage = document.getElementById('welcome-message');
    const userDataDisplay = document.getElementById('user-data-display');

    if (welcomeMessage) {
        welcomeMessage.innerText = title;
    }

    if (userDataDisplay) {
        userDataDisplay.innerHTML = detailsHtml;
    }
}

function resetAllForms() {
    const forms = [
        document.getElementById('login-form'),
        document.getElementById('signup-form'),
        document.getElementById('artist-form-1'),
        document.getElementById('artist-form-2')
    ];

    forms.forEach(form => {
        if (form) form.reset();
    });
}

// --- 1. NAVIGATION LINKS ---

document.getElementById('btn-go-signup')?.addEventListener('click', () => showScreen('signup-screen'));
document.getElementById('btn-go-artist')?.addEventListener('click', () => showScreen('artist-step1'));
document.getElementById('link-to-signup')?.addEventListener('click', () => showScreen('signup-screen'));

document.getElementById('btn-buy-signup')?.addEventListener('click', () => showScreen('login-screen'));
document.getElementById('btn-sell-signup')?.addEventListener('click', () => showScreen('artist-step1'));
document.getElementById('link-to-login')?.addEventListener('click', () => showScreen('login-screen'));

document.getElementById('btn-artist-cancel-1')?.addEventListener('click', () => showScreen('login-screen'));
document.getElementById('btn-artist-back-2')?.addEventListener('click', () => showScreen('artist-step1'));
document.getElementById('btn-artist-back-3')?.addEventListener('click', () => showScreen('artist-step2'));

// --- 2. LOGIN LOGIC ---

document.getElementById('login-form')?.addEventListener('submit', function (e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (email && password) {
        console.log('Backend: Attempting login for', email);

        const userName = formatDisplayName(email);
        setDashboardContent(
            `Hello, ${userName}! You are logged in.`,
            `
                <p><strong>Status:</strong> Authenticated</p>
                <p><strong>User:</strong> ${email}</p>
                <p><strong>Role:</strong> Buyer</p>
                <p><strong>Member:</strong> ${brandName}</p>
                <p><strong>Token:</strong> sim_${Math.random().toString(36).slice(2, 10)}</p>
            `
        );

        showScreen('dashboard-screen');
    }
});

// --- 3. SIGNUP LOGIC ---

document.getElementById('signup-form')?.addEventListener('submit', function (e) {
    e.preventDefault();

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();

    if (!name || !email) {
        alert('Please complete your account details before continuing.');
        return;
    }

    console.log('Backend: Creating account for', name);
    alert(`Account created for ${name}! Please log in.`);
    showScreen('login-screen');
});

// --- 4. ARTIST FLOW LOGIC ---

document.getElementById('btn-artist-next-1')?.addEventListener('click', function () {
    const name = document.getElementById('artist-name').value.trim();
    const email = document.getElementById('artist-email').value.trim();
    const pass = document.getElementById('artist-pass').value.trim();
    const phone = document.getElementById('artist-phone').value.trim();

    if (!name || !email || !pass || !phone) {
        alert('Please fill in all fields before proceeding.');
        return;
    }

    console.log('Backend: Saving Artist Step 1 Data...', { name, email, phone });
    showScreen('artist-step2');
});

document.getElementById('btn-artist-next-2')?.addEventListener('click', function () {
    const workshop = document.getElementById('workshop-name').value.trim();
    const city = document.getElementById('workshop-city').value.trim();
    const country = document.getElementById('workshop-country').value.trim();

    if (!workshop || !city || !country) {
        alert('Please fill in all fields before proceeding.');
        return;
    }

    console.log('Backend: Saving Artist Step 2 Data...', { workshop, city, country });
    showScreen('artist-step3');
});

document.getElementById('btn-artist-submit')?.addEventListener('click', function () {
    const workshop = document.getElementById('workshop-name').value.trim();
    const city = document.getElementById('workshop-city').value.trim();
    const country = document.getElementById('workshop-country').value.trim();

    console.log('Backend: Artist registration complete. Creating profile...');

    setDashboardContent(
        'Artist Account Created Successfully!',
        `
            <p><strong>Status:</strong> Artist Account Created</p>
            <p><strong>Role:</strong> Seller</p>
            <p><strong>Workshop:</strong> ${workshop || 'Not provided'}</p>
            <p><strong>Location:</strong> ${city || 'Not provided'}, ${country || 'Not provided'}</p>
            <p><strong>Platform:</strong> ${brandName}</p>
        `
    );

    showScreen('dashboard-screen');
});

// --- 5. LOGOUT LOGIC ---

document.getElementById('btn-logout')?.addEventListener('click', function () {
    resetAllForms();
    showScreen('login-screen');
    console.log('Backend: User logged out.');
});