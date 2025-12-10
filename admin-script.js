// --- 1. CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
  authDomain: "menu-6630f.firebaseapp.com",
  projectId: "menu-6630f",
  storageBucket: "menu-6630f.firebasestorage.app",
  messagingSenderId: "250958312970",
  appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
  measurementId: "G-GTQS2S4GNF"
};
// Inizializzazione Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ====================================================================
// 2. VARIABILI E GESTIONE AUTENTICAZIONE
// ====================================================================

// --- Funzioni di Login/Logout ---

/**
 * Gestisce il login per la pagina admin-login.html
 */
function handleAdminLogin() {
    // Si attiva solo se siamo sulla pagina di login Admin
    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!emailInput || !loginBtn) return; // Non siamo sulla pagina di login

    loginBtn.addEventListener('click', () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        
        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Accesso...';

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                // Successo, reindirizzamento gestito da onAuthStateChanged
            })
            .catch(error => {
                console.error("Errore di Login Admin: ", error.message);
                errorMessage.textContent = 'Accesso negato. Credenziali non valide.';
            })
            .finally(() => {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Accedi';
            });
    });
}

/**
 * Funzione di Logout (Usata su admin.html)
 */
function handleAdminLogout() {
    auth.signOut().then(() => {
        // Reindirizzamento gestito da onAuthStateChanged
    }).catch(error => {
        console.error("Errore di Logout: ", error);
        alert("Errore durante il logout.");
    });
}

// --- Listener Globale di Stato Autenticazione ---
auth.onAuthStateChanged(user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isAdminLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        // Utente autenticato
        if (isAdminLoginPage) {
            // Se siamo sulla pagina di login ma l'utente è loggato, reindirizza alla dashboard
            window.location.href = 'admin.html';
        } else if (isAdminPage) {
            // Se siamo sulla dashboard e l'utente è loggato, avvia l'app
            initializeAdminDashboard(user);
        }
    } else {
        // Utente NON autenticato
        if (isAdminPage) {
            // Se siamo sulla dashboard ma non siamo loggati, reindirizza al login
            window.location.href = 'admin-login.html';
        }
        // Se siamo sulla pagina di login, non facciamo nulla (aspettiamo il login)
    }
});


// ====================================================================
// 3. LOGICA DASHBOARD ADMIN (Attivata dopo il Login)
// ====================================================================

const ordersContainer = document.getElementById('orders-container');

/**
 * Funzione principale che avvia la dashboard dopo il login.
 */
function initializeAdminDashboard(user) {
    console.log("Dashboard Admin avviata per:", user.email);

    // Collega l'evento di Logout
    const logoutBtn = document.getElementById('admin-logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', handleAdminLogout);
    
    // Avvia l'ascolto degli ordini in tempo reale
    listenForNewOrders();
}

/**
 * Ascolta in tempo reale gli ordini da Firestore e li visualizza.
 */
function listenForNewOrders() {
    // Query: Ordina per timestamp e prende solo gli ordini 'pending' (in attesa)
    db.collection('orders')
      .where('status', '==', 'pending')
      .orderBy('timestamp', 'asc') 
      .onSnapshot(snapshot => {
        ordersContainer.innerHTML = ''; // Pulisce il contenitore

        if (snapshot.empty) {
            ordersContainer.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 30px;">Nessun nuovo ordine in attesa.</p>';
            return;
        }

        snapshot.forEach(doc => {
            const order = doc.data();
            const orderId = doc.id;
            renderOrderCard(order, orderId);
        });
    }, error => {
        console.error("Errore nel ricevere gli ordini: ", error);
        ordersContainer.innerHTML = '<p style="color:red; text-align: center;">Errore nel caricamento degli ordini.</p>';
    });
}

/**
 * Crea la card HTML per un singolo ordine.
 */
function renderOrderCard(order, orderId) {
    const card = document.createElement('div');
    card.className = 'order-card pending'; // Usa la classe CSS 'pending'
    
    // Formatta il timestamp (se esiste)
    const time = order.timestamp ? order.timestamp.toDate().toLocaleTimeString('it-IT') : 'Ora Sconosciuta';
    
    // Contenuto dell'ordine
    const itemsHtml = order.items.map(item => 
        `<li>${item.quantity}x ${item.name} (€${(item.quantity * item.price).toFixed(2)})</li>`
    ).join('');
    
    card.innerHTML = `
        <h3>Tavolo: ${order.tableId} <span class="order-time">${time}</span></h3>
        <p>Staff: ${order.staffEmail || 'Cliente QR'}</p>
        
        <ul class="order-items">${itemsHtml}</ul>
        
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <button class="complete-btn" data-id="${orderId}">Completa Ordine</button>
        </div>
    `;

    // Aggiungi l'event listener al pulsante
    card.querySelector('.complete-btn').addEventListener('click', () => {
        updateOrderStatus(orderId, 'completed');
    });

    ordersContainer.appendChild(card);
}

/**
 * Aggiorna lo stato di un ordine su Firestore.
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: newStatus,
            completionTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Ordine ${orderId} segnato come ${newStatus}.`);
        // La UI si aggiornerà automaticamente grazie a onSnapshot
    } catch (error) {
        console.error("Errore nell'aggiornamento dello stato:", error);
        alert("Impossibile aggiornare lo stato dell'ordine.");
    }
}


// ====================================================================
// 4. INIZIALIZZAZIONE DOM
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Se siamo sulla pagina di login Admin, attiva il gestore login
    if (window.location.pathname.endsWith('admin-login.html')) {
        handleAdminLogin();
    }
    // L'avvio della dashboard su admin.html è gestito da onAuthStateChanged
});
