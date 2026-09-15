// ==========================================
// BACKEND SIMULATION LOGIC
// ==========================================

// Utility function to switch screens
function showScreen(screenId) {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none'; 
    });

    // Show the target screen
    const activeScreen = document.getElementById(screenId);
    if (activeScreen) {
        activeScreen.classList.add('active');
        activeScreen.style.display = 'flex';
    }
}

// --- 1. NAVIGATION LINKS ---

// Login screen buttons
document.getElementById('btn-go-signup').addEventListener('click', () => showScreen('signup-screen'));
document.getElementById('btn-go-artist').addEventListener('click', () => showScreen('artist-step1'));
document.getElementById('link-to-signup').addEventListener('click', () => showScreen('signup-screen'));

// Signup screen buttons
document.getElementById('btn-buy-signup').addEventListener('click', () => showScreen('login-screen'));
document.getElementById('btn-sell-signup').addEventListener('click', () => showScreen('artist-step1'));
document.getElementById('link-to-login').addEventListener('click', () => showScreen('login-screen'));

// Artist flow buttons
document.getElementById('btn-artist-cancel-1').addEventListener('click', () => showScreen('login-screen'));
document.getElementById('btn-artist-back-2').addEventListener('click', () => showScreen('artist-step1'));
document.getElementById('btn-artist-back-3').addEventListener('click', () => showScreen('artist-step2'));


// --- 2. LOGIN LOGIC ---

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault(); // Stop page reload
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    // Simulate Backend Check
    if(email && password) {
        console.log("Backend: Attempting login for", email);
        
        // Simulate successful response
        const userName = email.split('@')[0]; 
        document.getElementById('welcome-message').innerText = `Hello, ${userName}! You are logged in.`;
        
        // Display mock data on dashboard
        document.getElementById('user-data-display').innerHTML = `
            <p><strong>Status:</strong> Authenticated</p>
            <p><strong>User:</strong> ${email}</p>
            <p><strong>Token:</strong> sim_${Math.random().toString(36).substr(2)}</p>
        `;

        showScreen('dashboard-screen');
    }
});


// --- 3. SIGNUP LOGIC ---

document.getElementById('signup-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    
    console.log("Backend: Creating account for", name);
    
    // Simulate successful account creation
    alert(`Account created for ${name}! Please log in.`);
    showScreen('login-screen');
});


// --- 4. ARTIST FLOW LOGIC ---

// Step 1: Personal Details
document.getElementById('btn-artist-next-1').addEventListener('click', function() {
    const name = document.getElementById('artist-name').value;
    const email = document.getElementById('artist-email').value;
    const pass = document.getElementById('artist-pass').value;
    const phone = document.getElementById('artist-phone').value;

    if(!name || !email || !pass || !phone) {
        alert("Please fill in all fields before proceeding.");
        return;
    }

    console.log("Backend: Saving Artist Step 1 Data...", { name, email, phone });
    showScreen('artist-step2');
});

// Step 2: Workshop Details
document.getElementById('btn-artist-next-2').addEventListener('click', function() {
    const workshop = document.getElementById('workshop-name').value;
    const city = document.getElementById('workshop-city').value;
    const country = document.getElementById('workshop-country').value;

    if(!workshop || !city || !country) {
        alert("Please fill in all fields before proceeding.");
        return;
    }

    console.log("Backend: Saving Artist Step 2 Data...", { workshop, city, country });
    showScreen('artist-step3');
});

// Step 3: Final Submission
document.getElementById('btn-artist-submit').addEventListener('click', function() {
    console.log("Backend: Artist registration complete. Creating profile...");
    
    document.getElementById('welcome-message').innerText = "Artist Account Created Successfully!";
    
    // Display mock data on dashboard
    document.getElementById('user-data-display').innerHTML = `
        <p><strong>Status:</strong> Artist Account Created</p>
        <p><strong>Role:</strong> Seller</p>
        <p><strong>Workshop:</strong> ${document.getElementById('workshop-name').value}</p>
        <p><strong>Location:</strong> ${document.getElementById('workshop-city').value}, ${document.getElementById('workshop-country').value}</p>
    `;

    showScreen('dashboard-screen');
});


// --- 5. LOGOUT LOGIC ---

document.getElementById('btn-logout').addEventListener('click', function() {
    // Clear all forms
    document.getElementById('login-form').reset();
    document.getElementById('signup-form').reset();
    document.getElementById('artist-form-1').reset();
    document.getElementById('artist-form-2').reset();
    
    // Go back to login
    showScreen('login-screen');
    console.log("Backend: User logged out.");
});