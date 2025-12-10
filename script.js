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
const menuContainer = document.getElementById('menu-container');
const cartList = document.getElementById('cart-list');
const totalPriceSpan = document.getElementById('total-price');
const sendOrderBtn = document.getElementById('send-order-btn');
const tableIdSpan = document.getElementById('table-id');

let cart = []; // Array per contenere gli articoli nel carrello
let tableId = 'DEFAULT_TAVOLO'; // Valore di default

// --- 3. FUNZIONI LOGICHE ---

// Ottiene il parametro 'tableId' dall'URL (simula la scansione QR)
function getTableIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('tableId');
    if (id) {
        tableId = id.toUpperCase();
    }
    tableIdSpan.textContent = tableId;
}

// Aggiunge un articolo al carrello
function addToCart(item) {
    const existingItem = cart.find(i => i.id === item.id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({...item, quantity: 1});
    }

    renderCart();
}

// Aggiorna la lista del carrello e il totale nell'interfaccia
function renderCart() {
    cartList.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        cartList.innerHTML = '<li>Il carrello è vuoto.</li>';
        sendOrderBtn.disabled = true;
        totalPriceSpan.textContent = '0.00';
        return;
    }
    
    // Disabilita il pulsante se il carrello è vuoto
    sendOrderBtn.disabled = cart.length === 0;

    cart.forEach(item => {
        const li = document.createElement('li');
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        li.textContent = `${item.quantity} x ${item.name} (€${item.price.toFixed(2)}) - Totale: €${itemTotal.toFixed(2)}`;
        cartList.appendChild(li);
    });

    totalPriceSpan.textContent = total.toFixed(2);
}

// Visualizza il menu nell'interfaccia HTML
function renderMenu(items) {
    menuContainer.innerHTML = '<h2>Scegli dal Menu</h2>'; // Pulisce e aggiunge titolo
    
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.innerHTML = `
            <div>
                <strong>${item.name}</strong><br>
                <span>€${item.price.toFixed(2)} (${item.category})</span>
            </div>
            <button data-id="${item.id}" data-name="${item.name}" data-price="${item.price}">
                Aggiungi
            </button>
        `;
        
        // Aggiungi l'evento al pulsante
        const btn = div.querySelector('button');
        btn.addEventListener('click', () => {
            // Quando si clicca, aggiungi l'oggetto al carrello
            addToCart({
                id: item.id,
                name: item.name,
                price: item.price
            });
        });

        menuContainer.appendChild(div);
    });
}

// Legge il menu da Firestore
async function fetchMenu() {
    try {
        const snapshot = await db.collection('menu').get();
        const menuItems = snapshot.docs.map(doc => ({
            id: doc.id, // ID del documento (es. 'caffe')
            ...doc.data() // Dati del documento (name, price, category)
        }));
        
        console.log("Menu caricato:", menuItems);
        renderMenu(menuItems);

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        menuContainer.innerHTML = '<p style="color:red;">Impossibile caricare il menu. Controlla la connessione a Firebase.</p>';
    }
}

// Invia l'ordine a Firestore
async function sendOrder() {
    if (cart.length === 0) {
        alert("Il carrello è vuoto!");
        return;
    }

    sendOrderBtn.disabled = true;
    sendOrderBtn.textContent = 'Invio in corso...';
    
    const orderData = {
        tableId: tableId,
        items: cart,
        total: parseFloat(totalPriceSpan.textContent),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending' // Stato iniziale dell'ordine
    };
    
    try {
        // Scrive il nuovo ordine nella raccolta 'orders'
        await db.collection('orders').add(orderData);
        
        alert(`Ordine inviato con successo al Tavolo ${tableId}!`);
        // Pulisce il carrello dopo l'invio
        cart = [];
        renderCart(); 

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("Si è verificato un errore durante l'invio dell'ordine.");
    } finally {
        sendOrderBtn.disabled = false;
        sendOrderBtn.textContent = 'Invia Ordine';
    }
}

// --- 4. INIZIALIZZAZIONE ---

document.addEventListener('DOMContentLoaded', () => {
    getTableIdFromUrl();
    fetchMenu();
    renderCart(); // Per inizializzare la visualizzazione

    // Aggiunge l'evento al pulsante di invio
    sendOrderBtn.addEventListener('click', sendOrder);
});
