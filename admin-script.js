// ====================================================================
// 1. CONFIGURAZIONE FIREBASE E INIZIALIZZAZIONE
// ====================================================================

// --- Configurazione (Include solo i campi necessari per App/Auth/Firestore) ---
const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
};

// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Elemento DOM principale per gli ordini
const ordersContainer = document.getElementById('orders-container');


// ====================================================================
// 2. GESTIONE AUTENTICAZIONE (AUTH)
// ====================================================================

/**
 * Gestisce il processo di login per admin-login.html.
 * Usa l'evento 'submit' del form per supportare sia il click che il tasto Invio.
 * @returns {void}
 */
function handleAdminLogin() {
    const loginForm = document.getElementById('admin-login-form'); // Riferimento al form
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!loginForm || !loginBtn) return; // Controllo se siamo sulla pagina di login

    // Modificato da click a submit del form
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Impedisce il ricaricamento della pagina
        
        const email = emailInput.value;
        const password = passwordInput.value;
        
        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Accesso...';

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                // Successo. onAuthStateChanged reindirizzerà a admin.html.
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
 * @returns {void}
 */
function handleAdminLogout() {
    auth.signOut().then(() => {
        // Logout riuscito. onAuthStateChanged reindirizzerà a admin-login.html.
    }).catch(error => {
        console.error("Errore durante il Logout:", error);
        alert("Errore durante il logout. Riprova.");
    });
}

// --- Listener Globale di Stato Autenticazione ---
/**
 * Verifica lo stato di autenticazione e gestisce il reindirizzamento.
 * È il punto di ingresso per l'applicazione Admin.
 */
auth.onAuthStateChanged(user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isAdminLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        // Utente autenticato
        // NOTA: La validazione del Custom Claim 'role: admin' dovrebbe avvenire qui.
        // Se non hai implementato i Custom Claims, questo reindirizzamento è sufficiente per ora.
        if (isAdminLoginPage) {
            window.location.href = 'admin.html'; // Reindirizza alla dashboard
        } else if (isAdminPage) {
            initializeAdminDashboard(user); // Avvia la dashboard
        }
    } else {
        // Utente NON autenticato
        if (isAdminPage) {
            window.location.href = 'admin-login.html'; // Reindirizza al login
        }
    }
});


// ====================================================================
// 3. LOGICA DASHBOARD (CORE)
// ====================================================================

// Stato globale per il filtro attivo e la funzione per disiscriversi dal listener
let currentFilterStatus = 'pending';
let unsubscribeOrders = null; 

/**
 * Funzione di utilità per formattare il Timestamp in ora leggibile.
 * @param {firebase.firestore.Timestamp} timestamp
 * @param {boolean} includeDate - Se includere la data (utile per gli ordini completati)
 * @returns {string} L'ora formattata.
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
 * @param {firebase.User} user L'oggetto utente loggato.
 */
function initializeAdminDashboard(user) {
    console.log(`Dashboard Admin avviata per: ${user.email}`);

    // Collega l'evento di Logout
    const logoutBtn = document.getElementById('admin-logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', handleAdminLogout);
    }
    
    // 1. Configura i pulsanti di filtro
    setupOrderFilters(); 
    
    // 2. Avvia l'ascolto degli ordini in tempo reale
    listenForOrdersByStatus(currentFilterStatus);
}

/**
 * Configura gli event listener per i pulsanti di filtro.
 */
function setupOrderFilters() {
    const filterContainer = document.getElementById('order-filters');
    if (!filterContainer) return;

    filterContainer.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newStatus = button.getAttribute('data-status');
            if (newStatus === currentFilterStatus) return; // Non fare nulla se lo stato è lo stesso

            // Aggiorna la classe 'active'
            const currentActive = filterContainer.querySelector('.active');
            if (currentActive) {
                currentActive.classList.remove('active');
            }
            button.classList.add('active');

            // Aggiorna lo stato e riavvia il listener
            currentFilterStatus = newStatus;
            listenForOrdersByStatus(currentFilterStatus);
        });
    });
}

/**
 * Ascolta in tempo reale gli ordini in base allo stato selezionato.
 * @param {string} status Lo stato da filtrare ('pending' o 'completed').
 */
function listenForOrdersByStatus(status) {
    if (!ordersContainer) return;
    
    // Stacca il listener precedente, se esiste
    if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
    }
    
    ordersContainer.innerHTML = '<h2 style="text-align: center;">Caricamento Ordini...</h2>';

    // Determina l'ordinamento: pending (dal più vecchio, asc), completed (dal più nuovo, desc)
    const sortDirection = (status === 'pending') ? 'asc' : 'desc';

    // Query dinamica
    const query = db.collection('orders')
      .where('status', '==', status)
      .orderBy('timestamp', sortDirection); 
      
    // Avvia il nuovo listener e salva la funzione di unsubscribe
    unsubscribeOrders = query.onSnapshot(snapshot => {
        ordersContainer.innerHTML = ''; // Pulisce il contenitore

        if (snapshot.empty) {
            const message = (status === 'pending') 
                ? 'Nessun nuovo ordine in attesa.' 
                : 'Nessun ordine completato di recente.';
            ordersContainer.innerHTML = `<p class="empty-message">${message}</p>`;
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            const orderId = doc.id;
            renderOrderCard(order, orderId);
        });
    }, error => {
        console.error("Errore nel ricevere gli ordini:", error);
        // NOTA: Se l'errore è "Permission Denied", controllare le Regole di Sicurezza di Firestore!
        ordersContainer.innerHTML = '<p class="error-message">Errore nel caricamento degli ordini. Controlla la console.</p>';
    });
}

/**
 * Crea e aggiunge la card HTML per un singolo ordine al DOM.
 * @param {object} order I dati dell'ordine.
 * @param {string} orderId L'ID del documento Firestore.
 */
function renderOrderCard(order, orderId) {
    const card = document.createElement('div');
    card.className = `order-card ${order.status}`; 
    
    // Formatta l'ora in base allo stato
    const timeToDisplay = (order.status === 'completed' && order.completionTime)
        ? formatTimestampToTime(order.completionTime, true) // Include data e ora per storico
        : formatTimestampToTime(order.timestamp, false); // Solo ora per pending
    
    // Crea la lista degli articoli
    const itemsHtml = order.items.map(item => 
        `<li>${item.quantity}x ${item.name} <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span></li>`
    ).join('');
    
    // Contenuto dinamico del footer (Pulsante vs Etichetta Completato)
    let footerContent;
    if (order.status === 'pending') {
        footerContent = `<button class="complete-btn" data-id="${orderId}">Completa Ordine</button>`;
    } else {
        footerContent = `<span class="completed-label">Completato alle ${timeToDisplay}</span>`;
    }

    card.innerHTML = `
        <div class="card-header">
            <h3>Tavolo: ${order.tableId}</h3>
            <span class="order-time">${timeToDisplay}</span>
        </div>
        
        <ul class="order-items">${itemsHtml}</ul>
        
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            ${footerContent}
        </div>
    `;

    // Aggiungi l'event listener solo se l'ordine è in attesa
    if (order.status === 'pending') {
        // Usa il delegation o l'elemento specifico per l'evento
        const completeButton = card.querySelector('.complete-btn');
        if (completeButton) {
             completeButton.addEventListener('click', () => {
                updateOrderStatus(orderId, 'completed');
            });
        }
    }

    ordersContainer.appendChild(card);
}

/**
 * Aggiorna lo stato di un ordine su Firestore.
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: newStatus,
            // Registra l'ora di completamento solo quando l'ordine viene segnato come completato
            completionTime: firebase.firestore.FieldValue.serverTimestamp() 
        });
        console.log(`Ordine ${orderId} segnato come ${newStatus}.`);
    } catch (error) {
        console.error("Errore nell'aggiornamento dello stato:", error);
        alert("Impossibile aggiornare lo stato dell'ordine. (Controlla le regole di scrittura admin)");
    }
}

// ====================================================================
// 4. INIZIALIZZAZIONE DOM GLOBALE
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Si attiva solo la funzione di login se l'URL corrisponde
    if (window.location.pathname.endsWith('admin-login.html')) {
        handleAdminLogin();
    }
    // L'avvio completo della dashboard è gestito da onAuthStateChanged
});
