// ====================================================================
// 1. CONFIGURAZIONE FIREBASE E INIZIALIZZAZIONE
// ====================================================================

// --- Configurazione (Devi INSERIRE i tuoi valori reali) ---
const firebaseConfig = {
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    // ! QUI DEVI INSERIRE LA TUA VERA CONFIGURAZIONE !
    // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
};

// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Elementi DOM principali
const tablesGridContainer = document.getElementById('tables-grid');
const orderDetailsContainer = document.getElementById('order-details');
const dashboardLayout = document.getElementById('admin-dashboard-layout');
const historyContainer = document.getElementById('orders-container-history');

// Variabili globali
let activeTableOrders = {}; 
let currentView = 'active'; 
let unsubscribeOrders = null; 
let selectedTableId = null; 
const TOTAL_TABLES = 35; // Numero massimo di tavoli nella griglia

// Definizione degli stati e dei colori (per la griglia dei tavoli)
const STATUS_COLORS = {
    pending: 'pending',     
    executed: 'executed',   
    free: 'free'           
};


// ====================================================================
// 2. GESTIONE AUTENTICAZIONE (AUTH)
// ====================================================================

/**
 * Gestisce il processo di login per admin-login.html.
 */
function handleAdminLogin() {
    const loginForm = document.getElementById('admin-login-form');
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!loginForm || !loginBtn) return;

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = emailInput.value;
        const password = passwordInput.value;
        
        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Accesso...';

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                console.log("Login Admin riuscito.");
            })
            .catch(error => {
                console.error("Errore di Login Admin:", error.message);
                errorMessage.textContent = 'Accesso negato. Credenziali non valide.';
            })
            .finally(() => {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Accedi';
            });
    });
}

/**
 * Funzione di Logout per admin.html.
 */
function handleAdminLogout() {
    auth.signOut().then(() => {
        // Logout riuscito. onAuthStateChanged reindirizzerà a admin-login.html.
        console.log("Logout Admin riuscito. Reindirizzamento...");
    }).catch(error => {
        console.error("Errore durante il Logout:", error);
        alert("Errore durante il logout. Riprova.");
    });
}

// --- Listener Globale di Stato Autenticazione ---
auth.onAuthStateChanged(user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isAdminLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        if (isAdminLoginPage) {
            window.location.href = 'admin.html'; 
        } else if (isAdminPage) {
            initializeAdminDashboard(user); 
        }
    } else {
        if (isAdminPage) {
            window.location.href = 'admin-login.html'; 
        }
    }
});


// ====================================================================
// 3. LOGICA DASHBOARD (CORE)
// ====================================================================

/**
 * Funzione di utilità per formattare il Timestamp in ora leggibile.
 */
function formatTimestampToTime(timestamp, includeDate = false) {
    if (!timestamp) return 'Ora Sconosciuta';
    const date = timestamp.toDate();
    let options = { hour: '2-digit', minute: '2-digit' };
    
    if (includeDate) {
        options = { ...options, day: '2-digit', month: '2-digit', year: 'numeric' };
    }
    
    return date.toLocaleTimeString('it-IT', options);
}


/**
 * Funzione principale che avvia la dashboard dopo il login.
 */
function initializeAdminDashboard(user) {
    console.log(`Dashboard Admin avviata per: ${user.email}`);

    const logoutBtn = document.getElementById('admin-logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout); 
    }
    
    setupViewFilters();
    renderTableGrid();
    listenForActiveOrders(); 

    if (tablesGridContainer) {
        tablesGridContainer.addEventListener('click', handleTableClick); 
    }

    if(orderDetailsContainer) {
        orderDetailsContainer.addEventListener('click', handleStatusButtonClick);
    }
}

/**
 * Configura gli event listener per i pulsanti di cambio vista.
 */
function setupViewFilters() {
    const filterContainer = document.getElementById('order-filters');
    if (!filterContainer) return;

    filterContainer.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newView = button.getAttribute('data-view');
            if (newView === currentView) return; 

            // Aggiorna la classe 'active'
            const activeBtn = filterContainer.querySelector('.active');
            if (activeBtn) activeBtn.classList.remove('active');
            button.classList.add('active');

            // Cambia la vista
            currentView = newView;
            if (newView === 'history') {
                dashboardLayout.classList.add('hidden');
                historyContainer.classList.remove('hidden');
                fetchHistoryOrders(); 
            } else { // active view
                historyContainer.classList.add('hidden');
                dashboardLayout.classList.remove('hidden');
            }
        });
    });
}


// ====================================================================
// 4. LOGICA DASHBOARD - VISTA TAVOLI
// ====================================================================

/**
 * Visualizza i dettagli dell'ordine selezionato nel pannello di dettaglio.
 */
function displayOrderDetails(order) {
    if (!orderDetailsContainer) return;

    const timeToDisplay = formatTimestampToTime(order.timestamp, false);
    
    const itemsHtml = order.items.map(item => 
        `<li>${item.quantity}x ${item.name} <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span></li>`
    ).join('');
    
    const noteText = order.notes ? order.notes.trim() : '';
    const noteHtml = noteText
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${noteText}</div>`
        : '';

    // Contenuto dinamico del pulsante
    let buttonText;
    let newStatusOnNextClick;
    let buttonClass; 
    
    if (order.status === 'pending') {
        buttonText = 'MARCA COME ESEGUITO';
        newStatusOnNextClick = 'executed';
        buttonClass = 'btn-executed'; 
    } else if (
