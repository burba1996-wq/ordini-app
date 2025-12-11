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
            .then(() => console.log("Login Admin riuscito."))
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
    auth.signOut()
        .then(() => console.log("Logout Admin riuscito."))
        .catch(() => alert("Errore durante il logout. Riprova."));
}

auth.onAuthStateChanged(user => {
    const isAdminPage = window.location.pathname.endsWith('admin.html');
    const isLoginPage = window.location.pathname.endsWith('admin-login.html');

    if (user) {
        if (isLoginPage) window.location.href = 'admin.html';
        if (isAdminPage) initializeAdminDashboard(user);
    } else {
        if (isAdminPage) window.location.href = 'admin-login.html';
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

function initializeAdminDashboard(user) {
    console.log(`Dashboard Admin avviata per: ${user.email}`);

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
// 4. LOGICA TAVOLI
// ====================================================================

function displayOrderDetails(order) {
    if (!orderDetailsContainer) return;

    const timeToDisplay = formatTimestampToTime(order.timestamp);
    const itemsHtml = order.items.map(item =>
        `<li>${item.quantity}x ${item.name} <span class="item-price">€${(item.quantity * item.price).toFixed(2)}</span></li>`
    ).join('');

    const noteHtml = order.notes
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${order.notes.trim()}</div>`
        : '';

    const buttonConfig = {
        pending: { text: 'MARCA COME ESEGUITO', next: 'executed', class: 'btn-executed' },
        executed: { text: 'MARCA COME PAGATO (COMPLETA)', next: 'completed', class: 'btn-completed' }
    }[order.status] || { text: 'STATO SCONOSCIUTO', next: '', class: 'btn-default' };

    orderDetailsContainer.innerHTML = `
        <div class="card-header">
            <h3>Ordine Tavolo ${order.tableId}</h3>
            <span class="order-time">Ricevuto alle ${timeToDisplay}</span>
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
    if (!orderDetailsContainer) return;
    orderDetailsContainer.innerHTML = `<p class="empty-message">Tavolo ${tableNumber} libero. Nessun ordine attivo.</p>`;
}

function handleTableClick(e) {
    const button = e.target.closest('.table-btn');
    if (!button) return;

    const tableNumber = button.dataset.table;
    selectedTableId = tableNumber;

    document.querySelectorAll('.table-btn').forEach(btn => btn.classList.remove('selected'));

    const order = activeTableOrders[tableNumber];
    if (order) {
        button.classList.add('selected');
        displayOrderDetails(order);
    } else {
        displayTableFree(tableNumber);
    }
}

function handleStatusButtonClick(e) {
    const button = e.target.closest('.update-status-btn');
    if (!button) return;

    const orderId = button.dataset.orderId;
    const newStatus = button.dataset.newStatus;

    if (orderId && newStatus) updateOrderStatus(orderId, newStatus);
}

async function updateOrderStatus(orderId, newStatus) {
    const updateData = { status: newStatus };
    if (newStatus === 'completed')
        updateData.completionTime = firebase.firestore.FieldValue.serverTimestamp();

    try {
        await db.collection('orders').doc(orderId).update(updateData);
    } catch {
        alert("Impossibile aggiornare lo stato dell'ordine.");
    }
}

function renderTableGrid() {
    if (!tablesGridContainer) return;
    tablesGridContainer.innerHTML = '';

    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const btn = document.createElement('button');
        btn.className = `table-btn free`;
        btn.dataset.table = String(i);
        tablesGridContainer.appendChild(btn);
    }
}

function listenForActiveOrders() {
    const pendingQuery = db.collection('orders').where('status', '==', 'pending').orderBy('timestamp', 'asc');
    const executedQuery = db.collection('orders').where('status', '==', 'executed').orderBy('timestamp', 'asc');

    const processSnapshots = () => {
        Promise.all([pendingQuery.get(), executedQuery.get()])
            .then(([pendingSnap, executedSnap]) => {
                const newOrders = {};

                pendingSnap.forEach(doc => newOrders[doc.data().tableId] = { ...doc.data(), docId: doc.id });
                executedSnap.forEach(doc => {
                    const data = doc.data();
                    if (!newOrders[data.tableId] ||
                        data.timestamp.toDate() >= newOrders[data.tableId].timestamp.toDate())
                        newOrders[data.tableId] = { ...data, docId: doc.id };
                });

                activeTableOrders = newOrders;
                updateTableGridAppearance();

                if (selectedTableId) {
                    const order = activeTableOrders[selectedTableId];
                    order ? displayOrderDetails(order) : displayTableFree(selectedTableId);
                }
            });
    };

    pendingQuery.onSnapshot(processSnapshots);
    executedQuery.onSnapshot(processSnapshots);
}

function updateTableGridAppearance() {
    for (let i = 1; i <= TOTAL_TABLES; i++) {
        const tableNumber = String(i);
        const btn = tablesGridContainer.querySelector(`[data-table="${tableNumber}"]`);
        if (!btn) continue;

        Object.values(STATUS_COLORS).forEach(c => btn.classList.remove(c));
        btn.classList.remove('selected');

        const order = activeTableOrders[tableNumber];
        btn.classList.add(order ? order.status : STATUS_COLORS.free);

        if (tableNumber === selectedTableId && order)
            btn.classList.add('selected');
    }
}

// ====================================================================
// 5. STORICO ORDINI
// ====================================================================

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

        snapshot.forEach(doc => renderHistoryCard(doc.data(), doc.id));

    } catch {
        historyContainer.innerHTML = '<p class="error-message">Errore nel caricamento dello storico.</p>';
    }
}

function renderHistoryCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card completed history-card';

    const time = formatTimestampToTime(order.completionTime, true);
    const items = order.items.map(i =>
        `<li>${i.quantity}x ${i.name} <span class="item-price">€${(i.quantity * i.price).toFixed(2)}</span></li>`
    ).join('');

    const noteHtml = order.notes
        ? `<div class="order-note-display"><strong><i class="fas fa-sticky-note"></i> NOTA:</strong> ${order.notes}</div>`
        : '';

    card.innerHTML = `
        <div class="card-header">
            <h3>Tavolo: ${order.tableId}</h3>
            <span class="order-time">Chiuso: ${time}</span>
        </div>
        <ul class="order-items">${items}</ul>
        ${noteHtml}
        <div class="order-footer">
            <strong>TOTALE: €${order.total.toFixed(2)}</strong>
            <span class="completed-label"><i class="fas fa-check-circle"></i> Ordine Pagato</span>
        </div>
    `;

    historyContainer.appendChild(card);
}

// ====================================================================
// 6. DOM READY
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('admin-login.html'))
        handleAdminLogin();
});
