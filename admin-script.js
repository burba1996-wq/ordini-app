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
// Inizializza Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. VARIABILI GLOBALI ---
const ordersContainer = document.getElementById('orders-container');

// --- 3. FUNZIONI LOGICHE ---

// Formatta la data per una migliore leggibilità
function formatTimestamp(timestamp) {
    if (!timestamp || !timestamp.toDate) return 'N/D';
    return timestamp.toDate().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// Funzione per aggiornare lo stato di un ordine su Firestore
async function updateOrderStatus(orderId, newStatus) {
    try {
        await db.collection('orders').doc(orderId).update({
            status: newStatus
        });
        console.log(`Ordine ${orderId} aggiornato a ${newStatus}`);
    } catch (error) {
        console.error("Errore nell'aggiornamento dello stato: ", error);
        alert("Errore nell'aggiornamento dello stato dell'ordine.");
    }
}

// Visualizza gli ordini nell'interfaccia HTML
function renderOrders(orders) {
    ordersContainer.innerHTML = ''; // Pulisce il container

    if (orders.length === 0) {
        ordersContainer.innerHTML = '<h2>Nessun ordine attivo.</h2>';
        return;
    }

    // Ordina gli ordini: prima i 'pending', poi i 'ready', infine i 'served'
    orders.sort((a, b) => {
        const statusOrder = { 'pending': 1, 'ready': 2, 'served': 3 };
        return statusOrder[a.status] - statusOrder[b.status];
    });

    orders.forEach(order => {
        const orderCard = document.createElement('div');
        // Aggiunge la classe in base allo stato (per lo stile colorato)
        orderCard.className = `order-card ${order.status}`; 

        let itemsList = order.items.map(item => 
            `<li>${item.quantity} x ${item.name} (€${item.price.toFixed(2)})</li>`
        ).join('');
        
        let buttons = '';

        if (order.status === 'pending') {
            buttons += `<button class="status-button btn-ready" data-id="${order.id}" data-status="ready">Segna come Pronto</button>`;
        }
        if (order.status !== 'served') {
             buttons += `<button class="status-button btn-served" data-id="${order.id}" data-status="served">Segna come Servito</button>`;
        }


        orderCard.innerHTML = `
            <h3>Tavolo: ${order.tableId}</h3>
            <p><strong>Ora:</strong> ${formatTimestamp(order.timestamp)}</p>
            <p><strong>Stato Attuale:</strong> ${order.status.toUpperCase()}</p>
            <p><strong>Totale:</strong> €${order.total.toFixed(2)}</p>
            <h4>Articoli Ordinati:</h4>
            <ul class="order-items">${itemsList}</ul>
            <div class="actions">${buttons}</div>
        `;
        
        ordersContainer.appendChild(orderCard);
    });

    // Aggiungi gli event listener DOPO che gli elementi sono stati creati
    document.querySelectorAll('.status-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const orderId = e.target.dataset.id;
            const newStatus = e.target.dataset.status;
            if (confirm(`Sei sicuro di voler cambiare lo stato dell'Ordine ${orderId} a "${newStatus.toUpperCase()}"?`)) {
                updateOrderStatus(orderId, newStatus);
            }
        });
    });
}

// Ascolta gli aggiornamenti in tempo reale dalla raccolta 'orders'
function listenForOrders() {
    // onSnapshot() mantiene una connessione aperta con Firestore
    // e aggiorna la UI ogni volta che i dati cambiano.
    db.collection('orders')
        // Ordina per timestamp in modo da vedere i più recenti in alto
        .orderBy('timestamp', 'desc')
        .limit(20) // Mostra solo gli ultimi 20 ordini
        .onSnapshot((snapshot) => {
            const orders = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            console.log("Nuovi ordini ricevuti/aggiornati:", orders);
            renderOrders(orders);
        }, (error) => {
            console.error("Errore nell'ascolto degli ordini: ", error);
            ordersContainer.innerHTML = '<p style="color:red;">Errore di connessione a Firestore.</p>';
        });
        
        // Per una migliore gestione, potresti voler filtrare solo gli ordini 'pending' e 'ready',
        // ad esempio aggiungendo .where('status', '!=', 'served')
}

// --- 4. INIZIALIZZAZIONE ---

document.addEventListener('DOMContentLoaded', () => {
    // Avvia l'ascolto degli ordini all'avvio dell'app Admin
    listenForOrders(); 
});
