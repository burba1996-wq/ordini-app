// ====================================================================
// 1. CONFIGURAZIONE FIREBASE E INIZIALIZZAZIONE
// ====================================================================

const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const tablesGridContainer = document.getElementById('tables-grid');
const orderDetailsContainer = document.getElementById('order-details');
const dashboardLayout = document.getElementById('admin-dashboard-layout');
const historyContainer = document.getElementById('orders-container-history');

let activeTableOrders = {};
let currentView = 'active';
let selectedTableId = null;
const TOTAL_TABLES = 35;

// 🔊 Suono per i nuovi ordini
const newOrderSound = new Audio('new-order.mp3');
newOrderSound.volume = 0.8;
let initializedSound = false;

// 💡 CORREZIONE: Manteniamo le classi CSS mappate
const STATUS_COLORS = {
    pending: 'pending',
    executed: 'executed',
    free: 'free'
};

// ====================================================================
// 2. AUTENTICAZIONE
// ====================================================================

function handleAdminLogin() {
    const loginForm = document.getElementById('admin-login-form');
    if (!loginForm) return;

    const emailInput = document.getElementById('admin-email');
    const passwordInput = document.getElementById('admin-password');
    const loginBtn = document.getElementById('admin-login-btn');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = emailInput.value;
        const password = passwordInput.value;

        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = 'Accesso...';

        auth.signInWithEmailAndPassword(email, password)
            .catch(() => {
                errorMessage.textContent = 'Accesso negato. Credenziali non valide.';
            })
            .finally(() => {
                loginBtn.disabled = false;
                loginBtn.textContent = 'Accedi';
            });
    });
}

function handleAdminLogout() {
    auth.signOut().catch(() => alert("Errore durante il logout."));
}

/**
 * 💡 FUNZIONE CHIAVE: Verifica il ruolo e reindirizza se non Admin.
 * Ritorna il ruolo dell'utente se ha successo.
 */
async function checkUserRole(user) {
    if (!user) return null;

    try {
        const userDocRef = db.collection('users').doc(user.uid);
        const doc = await userDocRef.get();

        if (doc.exists) {
            return doc.data().role;
        }
    } catch (error) {
        console.error("Errore nel recupero del ruolo:", error);
    }
    return null; // Ritorna null se il documento non esiste o in caso di errore
}


// 💡 Modifica del Listener Principale: Aggiunge la verifica del ruolo
auth.onAuthStateChanged(async user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        // 1. Utente loggato: Verifica il ruolo
        const userRole = await checkUserRole(user);
        
        if (isAdminPage) {
            if (userRole === 'admin') {
                // L'utente è Admin e sulla pagina Admin -> Inizializza
                initializeAdminDashboard(userRole);
            } else {
                // L'utente è loggato (Staff o sconosciuto) ma NON è Admin -> LOGOUT FORZATO E RITORNO AL LOGIN
                console.warn(`Tentativo di accesso non autorizzato del ruolo: ${userRole}`);
                await auth.signOut();
                window.location.href = 'admin-login.html';
            }
        } else if (isLoginPage && userRole === 'admin') {
            // Utente è Admin e si trova sulla pagina di login -> Reindirizza alla dashboard
            window.location.href = 'admin.html';
        }
        
    } else {
        // 2. Utente NON loggato
        if (isAdminPage) {
            // Non loggato e sulla pagina Admin -> Vai al Login
            window.location.href = 'admin-login.html';
        }
    }
});

// ====================================================================
// 3. DASHBOARD
// ====================================================================

function formatTimestampToTime(timestamp, includeDate = false) {
    if (!timestamp) return 'Ora Sconosciuta';
    const date = timestamp.toDate();
    const options = includeDate
        ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit' };
    return date.toLocaleTimeString('it-IT', options);
}

function initializeAdminDashboard(userRole) { 
    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleAdminLogout);

    setupViewFilters();
    renderTableGrid();
    listenForActiveOrders();

    tablesGridContainer?.addEventListener('click', handleTableClick);
    orderDetailsContainer?.addEventListener('click', handleStatusButtonClick);
}

function setupViewFilters() {
    const filterContainer = document.getElementById('order-filters');
    if (!filterContainer) return;

    filterContainer.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newView = button.getAttribute('data-view');
            if (newView === currentView) return;

            filterContainer.querySelector('.active')?.classList.remove('active');
            button.classList.add('active');

            currentView = newView;

            if (newView === 'history') {
                dashboardLayout.classList.add('hidden');
                historyContainer.classList.remove('hidden');
                fetchHistoryOrders();
            } else {
                historyContainer.classList.add('hidden');
                dashboardLayout.classList.remove('hidden');
            }
        });
    });
}

// ====================================================================
// 4. LOGICA TAVOLI E ORDINI
// ====================================================================

function displayOrderDetails(order) {
    const time = formatTimestampToTime(order.timestamp);

    // Mappatura articoli con correzione per estrarre le opzioni
    const itemsHtml = order.items.map(item => {
        // Estraiamo le opzioni: se è un array di stringhe lo uniamo, altrimenti stringa vuota
        const optionsText = (item.options && Array.isArray(item.options) && item.options.length > 0) 
            ? item.options.join(', ') 
            : '';

        const optionsHtml = optionsText 
            ? `<div class="admin-item-options"><i class="fas fa-plus-circle"></i> ${optionsText}</div>` 
            : '';

        return `
            <li>
                <div class="item-main-row">
                    <span><strong>${item.quantity}x</strong> ${item.name}</span>
                    <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span>
                </div>
                ${optionsHtml}
            </li>
        `;
    }).join('');

    const noteHtml = order.notes
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${order.notes}</div>`
        : '';

    const buttonConfig = {
        pending: { text: 'MARCA COME ESEGUITO', next: 'executed', class: 'btn-executed' },
        executed: { text: 'MARCA COME PAGATO (COMPLETA)', next: 'completed', class: 'btn-completed' }
    }[order.status] || { text: 'STATO SCONOSCIUTO', next: '', class: 'btn-default' };

    orderDetailsContainer.innerHTML = `
        <div class="card-header">
            <h3>Ordine Tavolo ${order.tableId}</h3>
            <span class="order-time">Ricevuto alle ${time}</span>
        </div>
        <ul class="order-items">${itemsHtml}</ul>
        ${noteHtml}
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <button class="update-status-btn ${buttonConfig.class}"
                data-order-id="${order.docId}"
                data-new-status="${buttonConfig.next}">
                <i class="fas fa-check"></i> ${buttonConfig.text}
            </button>
        </div>
    `;
}

function displayTableFree(tableNumber) {
    orderDetailsContainer.innerHTML = `<p class="empty-message">Tavolo ${tableNumber} libero.</p>`;
}

function handleTableClick(e) {
    const button = e.target.closest('.table-btn');
    if (!button) return;

    const tableNumber = button.dataset.table;
    
    document.querySelectorAll('.table-btn').forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
    
    selectedTableId = tableNumber;

    const order = activeTableOrders[tableNumber];
    if (order) {
        displayOrderDetails(order);
    } else {
        displayTableFree(tableNumber);
    }
}

function handleStatusButtonClick(e) {
    const button = e.target.closest('.update-status-btn');
    if (!button) return;

    updateOrderStatus(button.dataset.orderId, button.dataset.newStatus);
}

async function updateOrderStatus(orderId, newStatus) {
    const update = { status: newStatus };

    if (newStatus === 'completed')
        update.completionTime = firebase.firestore.FieldValue.serverTimestamp();

    await db.collection('orders').doc(orderId).update(update)
        .catch(() => alert("Impossibile aggiornare lo stato."));
}

function renderTableGrid() {
    tablesGridContainer.innerHTML = '';
    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const btn = document.createElement('button');
        btn.className = 'table-btn free';
        btn.dataset.table = String(i);
        tablesGridContainer.appendChild(btn);
    }
}

/**
 * 💡 FUNZIONE PER AGGIORNARE L'ASPETTO DELLA GRIGLIA DEI TAVOLI
 */
function updateTableGridAppearance() {
    const tableButtons = tablesGridContainer.querySelectorAll('.table-btn');
    
    tableButtons.forEach(button => {
        const tableId = button.dataset.table;
        const order = activeTableOrders[tableId];

        // Rimuovi tutte le classi di stato (incluso 'free')
        Object.values(STATUS_COLORS).forEach(color => button.classList.remove(color));
        
        // Mantieni lo stato "selected" solo se era già selezionato prima di applicare il nuovo stato
        const isSelected = button.classList.contains('selected');
        button.classList.remove('selected');


        if (order) {
            // Aggiungi la classe di stato in base all'ordine attivo
            const statusClass = STATUS_COLORS[order.status] || 'pending';
            button.classList.add(statusClass);
            
            // Se questo tavolo è quello selezionato, ripristina la classe 'selected'
            if (selectedTableId === tableId || isSelected) {
                button.classList.add('selected');
            }
        } else {
            // Tavolo libero
            button.classList.add('free');
            // Se il tavolo appena liberato era quello selezionato, deseleziona
            if (selectedTableId === tableId) {
                 selectedTableId = null;
            }
        }
    });
}


// ====================================================================
// 🔊 LISTENER ORDINI IN TEMPO REALE CON SUONO
// ====================================================================

function listenForActiveOrders() {
    // Ascolta tutti gli ordini che NON sono 'completed'
    db.collection('orders')
        .where('status', 'in', ['pending', 'executed'])
        .onSnapshot(snapshot => {
            const newOrders = {};

            // 1. Trova l'ordine attivo (più recente) per ogni tavolo
            snapshot.forEach(doc => {
                const orderData = { ...doc.data(), docId: doc.id };
                const tableId = orderData.tableId;

                // Conserva solo l'ordine più recente per un dato tavolo
                if (!newOrders[tableId] || orderData.timestamp.toDate() > newOrders[tableId].timestamp.toDate()) {
                    newOrders[tableId] = orderData;
                }
            });
            
            // 2. Gestione del suono per i NUOVI ordini in sospeso ('added')
            if (initializedSound) {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added' && change.doc.data().status === 'pending') {
                        // Verifica che l'ordine aggiunto sia l'ordine attivo per quel tavolo
                        const data = change.doc.data();
                        if (newOrders[data.tableId] && newOrders[data.tableId].docId === change.doc.id) {
                            newOrderSound.play().catch(() => {});
                        }
                    }
                });
            }
            initializedSound = true;

            // 3. Aggiorna lo stato globale
            activeTableOrders = newOrders;
            
            // 4. Aggiorna l'interfaccia utente (GRIGLIA E DETTAGLI)
            updateTableGridAppearance();

            if (selectedTableId) {
                const ord = activeTableOrders[selectedTableId];
                ord ? displayOrderDetails(ord) : displayTableFree(selectedTableId);
            }
        }, error => {
            console.error("Errore nell'ascolto degli ordini attivi:", error);
        });
}


// ====================================================================
// 5. STORICO ORDINI (FUNZIONALITÀ DI ELIMINAZIONE INCLUSA)
// ====================================================================

/**
 * Funzione per ELIMINARE un ordine specifico dallo storico (Completed).
 * @param {string} orderId L'ID del documento dell'ordine in Firestore.
 */
async function deleteOrderFromHistory(orderId) {
    if (!confirm('Sei sicuro di voler eliminare permanentemente questo ordine dallo storico? Questa azione è irreversibile.')) {
        return;
    }

    try {
        // Esegue l'eliminazione del documento
        await db.collection('orders').doc(orderId).delete();
        
        // Ricarica lo storico dopo l'eliminazione
        fetchHistoryOrders();
        alert('Ordine eliminato con successo.');
    } catch (error) {
        console.error("Errore durante l'eliminazione dell'ordine:", error);
        alert("Impossibile eliminare l'ordine. Verifica i permessi o la connessione.");
    }
}


async function fetchHistoryOrders() {
    historyContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Caricamento...</div>';

    try {
        const snapshot = await db.collection('orders')
            .where('status', '==', 'completed')
            .orderBy('completionTime', 'desc')
            .limit(50)
            .get();

        historyContainer.innerHTML = '';

        if (snapshot.empty) {
            historyContainer.innerHTML = '<p class="empty-message">Nessun ordine completato.</p>';
            return;
        }

        // Passa i dati dell'ordine INCLUSO l'ID del documento (docId)
        snapshot.forEach(doc => renderHistoryCard({ ...doc.data(), docId: doc.id }));
        
        // Imposta l'handler per i pulsanti di eliminazione dopo il rendering
        setupHistoryDeleteHandler();

    } catch {
        historyContainer.innerHTML = '<p class="error-message">Errore caricamento storico.</p>';
    }
}

function renderHistoryCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card completed history-card';

    const time = formatTimestampToTime(order.completionTime, true);

    // Mappatura articoli con estrazione corretta delle opzioni (checkbox)
    const itemsHtml = order.items.map(item => {
        // Estraiamo le opzioni e le uniamo con una virgola
        const optionsText = (item.options && Array.isArray(item.options) && item.options.length > 0) 
            ? item.options.join(', ') 
            : '';

        // Se ci sono opzioni, creiamo il div dedicato, altrimenti stringa vuota
        const optionsHtml = optionsText 
            ? `<div class="admin-item-options" style="color: #666; font-size: 0.8em; font-style: italic; margin-left: 28px;">
                <i class="fas fa-plus-circle"></i> ${optionsText}
               </div>` 
            : '';
            
        return `
            <li>
                <div class="item-main-row" style="display: flex; justify-content: space-between; width: 100%;">
                    <span><strong>${item.quantity}x</strong> ${item.name}</span>
                    <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span>
                </div>
                ${optionsHtml}
            </li>`;
    }).join('');

    const noteHtml = order.notes
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${order.notes}</div>`
        : '';

    card.innerHTML = `
        <div class="card-header">
            <h3>Tavolo: ${order.tableId}</h3>
            <span class="order-time">Chiuso: ${time}</span>
        </div>
        <ul class="order-items">${itemsHtml}</ul>
        ${noteHtml}
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <div class="history-actions">
                <span class="completed-label"><i class="fas fa-check-circle"></i> Pagato</span>
                <button class="delete-history-btn" data-order-id="${order.docId}">
                    <i class="fas fa-trash"></i> Elimina
                </button>
            </div>
        </div>`;

    historyContainer.appendChild(card);
}

/**
 * Imposta l'handler per i click sui pulsanti di eliminazione.
 */
function setupHistoryDeleteHandler() {
    // Usiamo la delegazione degli eventi per intercettare il click
    historyContainer.removeEventListener('click', handleHistoryContainerClick);
    historyContainer.addEventListener('click', handleHistoryContainerClick);
}

function handleHistoryContainerClick(e) {
    const button = e.target.closest('.delete-history-btn');
    if (!button) return;

    const orderId = button.dataset.orderId;
    if (orderId) {
        deleteOrderFromHistory(orderId);
    }
}


// ====================================================================
// 6. DOM READY
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('admin-login.html'))
        handleAdminLogin();
});
