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

// Elementi DOM principali per la nuova interfaccia
const tablesGridContainer = document.getElementById('tables-grid');
const orderDetailsContainer = document.getElementById('order-details');

// Mappa globale per memorizzare gli ordini attivi per Tavolo (key: tableId)
let activeTableOrders = {}; 

// Definizione degli stati e dei colori (per la griglia dei tavoli)
const STATUS_COLORS = {
    pending: 'pending',     // Colore Giallo/Arancio (classe CSS)
    executed: 'executed',   // Colore Blu (classe CSS)
    completed: 'completed', // Colore Verde (classe CSS - da rimuovere dal tavolo attivo)
    free: 'free'            // Grigio (classe CSS - da usare come default)
};
const TOTAL_TABLES = 35; // Numero massimo di tavoli nella griglia

// ====================================================================
// 2. GESTIONE AUTENTICAZIONE (AUTH) - NON MODIFICATA
// ====================================================================

/**
 * Gestisce il processo di login per admin-login.html.
 * ... (omissis, codice non modificato) ...
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
 * ... (omissis, codice non modificato) ...
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
// 3. LOGICA DASHBOARD (CORE) - MODIFICATA PER LA GRIGLIA
// ====================================================================

// Stato globale per il filtro attivo e la funzione per disiscriversi dal listener
let currentFilterStatus = 'pending';
let unsubscribeOrders = null; 
let selectedTableId = null; // Memorizza il tavolo attualmente selezionato

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
    
    // 1. Inizializza la griglia dei tavoli (vuota)
    renderTableGrid();
    
    // 2. Avvia l'ascolto degli ordini in tempo reale (NON FILTRATO)
    // Per la griglia dei tavoli, ascoltiamo TUTTI gli ordini non pagati.
    listenForActiveOrders(); 

    // 3. Configura gli event listener per i click sui tavoli
    if (tablesGridContainer) {
        tablesGridContainer.addEventListener('click', handleTableClick);
    }

    // 4. Configura gli event listener per i filtri (se li hai)
    // setupOrderFilters(); // Rimosso se si usa solo la vista a griglia

    // Event listener per l'aggiornamento dello stato (pulsanti nel pannello di dettaglio)
    if(orderDetailsContainer) {
        orderDetailsContainer.addEventListener('click', handleStatusButtonClick);
    }
}


// ====================================================================
// 4. LOGICA DASHBOARD - VISTA TAVOLI
// ====================================================================

/**
 * Genera la griglia vuota dei tavoli nell'HTML la prima volta.
 */
function renderTableGrid() {
    if (!tablesGridContainer) return;

    tablesGridContainer.innerHTML = ''; 

    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const tableNumber = String(i);

        const tableButton = document.createElement('button');
        tableButton.className = `table-btn ${STATUS_COLORS.free}`; // Inizia come 'free'
        tableButton.textContent = tableNumber;
        tableButton.dataset.table = tableNumber;
        
        tablesGridContainer.appendChild(tableButton);
    }
}

/**
 * Ascolta in tempo reale TUTTI gli ordini non ancora completati (pending, executed).
 */
function listenForActiveOrders() {
    // Stacca il listener precedente, se esiste
    if (unsubscribeOrders) {
        unsubscribeOrders();
        unsubscribeOrders = null;
    }

    // Ascolta tutti gli ordini dove lo stato NON è 'completed'
    const query = db.collection('orders')
      .where('status', '!=', 'completed')
      .orderBy('status', 'asc') // Ordina pending prima di executed
      .orderBy('timestamp', 'asc');
    
    console.log("Avvio listener per gli ordini attivi...");

    unsubscribeOrders = query.onSnapshot(snapshot => {
        // 1. Reset e ricostruzione della mappa degli ordini attivi
        const newActiveOrders = {};
        snapshot.forEach(doc => {
            const order = doc.data();
            // L'ordine più recente per un tavolo è quello da mostrare.
            // Dato che ordiniamo per timestamp ASC, l'ultimo trovato è l'ordine più vecchio in attesa.
            // Per semplicità, consideriamo che ogni tavolo possa avere un solo ordine attivo alla volta.
            // Utilizziamo l'ID dell'ordine di Firestore (doc.id) per le azioni.
            if (!newActiveOrders[order.tableId] || order.timestamp.toDate() > newActiveOrders[order.tableId].timestamp.toDate()) {
                 newActiveOrders[order.tableId] = { ...order, docId: doc.id };
            }
        });
        activeTableOrders = newActiveOrders;

        // 2. Aggiorna l'aspetto di tutti i pulsanti sulla griglia
        updateTableGridAppearance();

        // 3. Ricarica i dettagli se il tavolo selezionato è stato aggiornato
        if (selectedTableId && activeTableOrders[selectedTableId]) {
            displayOrderDetails(activeTableOrders[selectedTableId]);
        } else if (selectedTableId && !activeTableOrders[selectedTableId]) {
            // Se l'ordine del tavolo selezionato è appena stato completato
            displayTableFree(selectedTableId);
            selectedTableId = null;
        }

    }, error => {
        console.error("Errore nel ricevere gli ordini attivi:", error);
    });
}

/**
 * Aggiorna il colore e le classi dei pulsanti dei tavoli in base a activeTableOrders.
 */
function updateTableGridAppearance() {
    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const tableNumber = String(i);
        const tableButton = tablesGridContainer.querySelector(`[data-table="${tableNumber}"]`);

        if (!tableButton) continue;

        const activeOrder = activeTableOrders[tableNumber];

        // Rimuovi tutte le classi di stato precedenti
        Object.values(STATUS_COLORS).forEach(statusClass => {
            tableButton.classList.remove(statusClass);
        });

        if (activeOrder) {
            // Ordine Attivo: applica la classe pending/executed
            tableButton.classList.add(activeOrder.status); 
        } else {
            // Tavolo Libero: applica la classe free
            tableButton.classList.add(STATUS_COLORS.free);
        }
    }
}

/**
 * Gestisce il click su un tavolo della griglia.
 */
function handleTableClick(e) {
    const button = e.target.closest('.table-btn');
    if (!button) return;

    const tableNumber = button.dataset.table;
    selectedTableId = tableNumber;

    // 1. Gestione della selezione visiva
    document.querySelectorAll('.table-btn').forEach(btn => btn.classList.remove('selected'));
    button.classList.add('selected');

    const activeOrder = activeTableOrders[tableNumber];

    if (activeOrder) {
        // 2. Mostra i dettagli dell'ordine
        displayOrderDetails(activeOrder);
    } else {
        // 2. Tavolo Libero
        displayTableFree(tableNumber);
    }
}

/**
 * Visualizza i dettagli dell'ordine selezionato nel pannello di dettaglio.
 * Simile a renderOrderCard, ma orientato alla singola visualizzazione.
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
    
    if (order.status === 'pending') {
        buttonText = 'MARCA COME ESEGUITO';
        newStatusOnNextClick = 'executed';
    } else if (order.status === 'executed') {
        buttonText = 'MARCA COME PAGATO (COMPLETA)';
        newStatusOnNextClick = 'completed';
    } else {
        buttonText = 'STATO SCONOSCIUTO';
        newStatusOnNextClick = '';
    }

    orderDetailsContainer.innerHTML = `
        <div class="card-header">
            <h3>Ordine #${order.docId.substring(0, 6)} - Tavolo ${order.tableId}</h3>
            <span class="order-time">Ricevuto alle ${timeToDisplay}</span>
        </div>
        
        <ul class="order-items">${itemsHtml}</ul>
        
        ${noteHtml} 
        
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <button class="update-status-btn" 
                    data-order-id="${order.docId}" 
                    data-current-status="${order.status}" 
                    data-new-status="${newStatusOnNextClick}">
                ${buttonText}
            </button>
        </div>
    `;
    // L'event listener è già impostato per delegazione in initializeAdminDashboard
}

/**
 * Visualizza il messaggio "Tavolo libero" nel pannello di dettaglio.
 */
function displayTableFree(tableNumber) {
     if (!orderDetailsContainer) return;
     orderDetailsContainer.innerHTML = `<p class="empty-message">Tavolo ${tableNumber} libero. Nessun ordine attivo.</p>`;
}

/**
 * Gestisce il click sui pulsanti di aggiornamento dello stato (dal pannello di dettaglio).
 */
function handleStatusButtonClick(e) {
    const button = e.target.closest('.update-status-btn');
    if (!button) return;

    const orderId = button.dataset.orderId;
    const newStatus = button.dataset.newStatus;

    if (orderId && newStatus) {
        updateOrderStatus(orderId, newStatus);
    }
}


/**
 * Aggiorna lo stato di un ordine su Firestore.
 * @param {string} orderId L'ID del documento Firestore.
 * @param {string} newStatus Lo stato da impostare ('executed' o 'completed').
 */
async function updateOrderStatus(orderId, newStatus) {
    const updateData = { status: newStatus };
    
    // Aggiungi l'ora di completamento solo se lo stato finale è 'completed'
    if (newStatus === 'completed') {
        updateData.completionTime = firebase.firestore.FieldValue.serverTimestamp();
    }

    try {
        await db.collection('orders').doc(orderId).update(updateData);
        console.log(`Ordine ${orderId} segnato come ${newStatus}.`);
        // La vista si aggiornerà automaticamente grazie a listenForActiveOrders()
    } catch (error) {
        console.error("Errore nell'aggiornamento dello stato:", error);
        alert("Impossibile aggiornare lo stato dell'ordine. (Controlla le regole di scrittura admin)");
    }
}

// ====================================================================
// 5. INIZIALIZZAZIONE DOM GLOBALE - NON MODIFICATA
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Si attiva solo la funzione di login se l'URL corrisponde
    if (window.location.pathname.endsWith('admin-login.html')) {
        handleAdminLogin();
    }
    // L'avvio completo della dashboard è gestito da onAuthStateChanged
});
