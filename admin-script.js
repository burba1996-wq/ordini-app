// ====================================================================
// 1. CONFIGURAZIONE FIREBASE E INIZIALIZZAZIONE
// ====================================================================

// --- Configurazione (Includi solo i campi necessari per App/Auth/Firestore) ---
const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
    // Rimosse le chiavi non usate (storageBucket, messagingSenderId, ecc.) per pulizia
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
 * @returns {void}
 */
function handleAdminLogin() {
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!emailInput || !loginBtn) return; // Controllo se siamo sulla pagina di login

    loginBtn.addEventListener('click', () => {
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

/**
 * Funzione di utilità per formattare il Timestamp in ora leggibile.
 * @param {firebase.firestore.Timestamp} timestamp
 * @returns {string} L'ora formattata.
 */
function formatTimestampToTime(timestamp) {
    if (!timestamp) return 'Ora Sconosciuta';
    // Converte il Timestamp Firebase in un oggetto Date
    const date = timestamp.toDate();
    // Formatta l'ora nel formato IT (es. 18:30:00)
    return date.toLocaleTimeString('it-IT');
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
    
    // Avvia l'ascolto degli ordini in tempo reale
    listenForNewOrders();
}

/**
 * Ascolta in tempo reale gli ordini "pending" (in attesa) da Firestore.
 * Utilizza `onSnapshot` per aggiornare l'interfaccia istantaneamente.
 */
function listenForNewOrders() {
    // La query filtra per 'pending' e ordina dal più vecchio al più recente (asc)
    db.collection('orders')
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'asc') 
      .onSnapshot(snapshot => {
        if (!ordersContainer) return;

        ordersContainer.innerHTML = ''; // Pulisce il contenitore

        if (snapshot.empty) {
            ordersContainer.innerHTML = '<p class="empty-message">Nessun nuovo ordine in attesa.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            const orderId = doc.id;
            renderOrderCard(order, orderId);
        });
    }, error => {
        console.error("Errore nel ricevere gli ordini: ", error);
        if (ordersContainer) {
            ordersContainer.innerHTML = '<p class="error-message">Errore nel caricamento degli ordini. Controlla la console.</p>';
        }
    });
}

/**
 * Crea e aggiunge la card HTML per un singolo ordine al DOM.
 * @param {object} order I dati dell'ordine.
 * @param {string} orderId L'ID del documento Firestore.
 */
function renderOrderCard(order, orderId) {
    const card = document.createElement('div');
    card.className = 'order-card pending';
    
    const time = formatTimestampToTime(order.timestamp);
    
    // Genera l'HTML per la lista degli articoli
    const itemsHtml = order.items.map(item => 
        `<li>${item.quantity}x ${item.name} (€${(item.quantity * item.price).toFixed(2)})</li>`
    ).join('');
    
    card.innerHTML = `
        <h3>Tavolo: ${order.tableId} <span class="order-time">${time}</span></h3>
        <p class="order-staff">Preso da: ${order.staffEmail || 'Cliente QR'}</p>
        
        <ul class="order-items">${itemsHtml}</ul>
        
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <button class="complete-btn" data-id="${orderId}">Completa Ordine</button>
        </div>
    `;

    // Listener per il pulsante 'Completa Ordine'
    card.querySelector('.complete-btn').addEventListener('click', () => {
        updateOrderStatus(orderId, 'completed');
    });

    ordersContainer.appendChild(card);
}

/**
 * Aggiorna lo stato di un ordine da "pending" a "completed" su Firestore.
 * @param {string} orderId L'ID del documento da aggiornare.
 * @param {string} newStatus Il nuovo stato (es. 'completed').
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: newStatus,
            completionTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        // Non è necessario manipolare il DOM, onSnapshot lo farà.
        console.log(`Ordine ${orderId} aggiornato a ${newStatus}.`);
    } catch (error) {
        console.error("Errore nell'aggiornamento dello stato:", error);
        alert("Impossibile aggiornare lo stato dell'ordine.");
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
    // L'avvio completo della dashboard (initializeAdminDashboard) è gestito 
    // dal listener di autenticazione globale (onAuthStateChanged).
});
