// ====================================================================
// 1. CONFIGURAZIONE E INIZIALIZZAZIONE FIREBASE
// ====================================================================

// CONFIGURAZIONE: Usa la TUA configurazione fornita
const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
    storageBucket: "menu-6630f.firebasestorage.app",
    messagingSenderId: "250958312970",
    appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
    measurementId: "G-GTQS2S4GNF"
};

// Inizializza Firebase e Firestore (Compat Mode per la versione 9.x tramite CDN)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ====================================================================
// 2. VARIABILI GLOBALI E STATO
// ====================================================================

// Elementi DOM (Cache dei selettori)
const menuContainer = document.getElementById('menu-container');
const cartList = document.getElementById('cart-list');
const totalPriceSpan = document.getElementById('total-price');
const sendOrderBtn = document.getElementById('send-order-btn');
const tableIdSpan = document.getElementById('table-id');
// Costante per la navigazione rapida (che implementeremo al prossimo passo)
const navQuickLinks = document.getElementById('quick-links'); 

// Stato dell'applicazione
let cart = []; // Array per contenere gli articoli nel carrello
let tableId = 'DEFAULT_TAVOLO'; // Valore di default

// ====================================================================
// 3. LOGICA DI CARRELLO E STATO
// ====================================================================

/**
 * Ottiene e imposta l'ID del tavolo dall'URL (?tableId=...)
 */
function getTableIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('tableId');
    if (id) {
        tableId = id.toUpperCase();
    }
    tableIdSpan.textContent = tableId;
}

/**
 * Aggiunge un articolo al carrello o incrementa la quantità se già presente.
 * @param {object} item - L'articolo da aggiungere ({id, name, price}).
 */
function addToCart(item) {
    const existingItem = cart.find(i => i.id === item.id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        // Usa l'operatore spread per creare un nuovo oggetto con la quantità
        cart.push({...item, quantity: 1}); 
    }
    renderCart();
}

/**
 * Aggiorna la quantità di un articolo esistente nel carrello.
 * @param {string} itemId - ID dell'articolo da aggiornare.
 * @param {number} change - Valore di incremento/decremento (es. 1 o -1).
 */
function updateQuantity(itemId, change) {
    const itemIndex = cart.findIndex(i => i.id === itemId);

    if (itemIndex !== -1) {
        const newQuantity = cart[itemIndex].quantity + change;
        
        if (newQuantity <= 0) {
            removeItem(itemId);
        } else {
            cart[itemIndex].quantity = newQuantity;
            renderCart();
        }
    }
}

/**
 * Rimuove un articolo completamente dal carrello.
 * @param {string} itemId - ID dell'articolo da rimuovere.
 */
function removeItem(itemId) {
    cart = cart.filter(item => item.id !== itemId);
    renderCart();
}

/**
 * Collega gli eventi ai pulsanti di manipolazione del carrello (+, -, Rimuovi).
 */
function attachCartEventListeners() {
    // Rimuoviamo i vecchi listener prima di collegarne di nuovi per evitare duplicazioni
    // Questo è un metodo semplice, ma ri-renderizza l'intera lista ogni volta
    
    // Si usa il delegation event listener sull'elemento genitore (cartList)
    cartList.onclick = (e) => {
        const button = e.target.closest('.cart-btn');
        if (!button) return; // Non è un pulsante del carrello

        const itemId = button.dataset.id;
        
        if (button.classList.contains('cart-increment')) {
            updateQuantity(itemId, 1);
        } else if (button.classList.contains('cart-decrement')) {
            updateQuantity(itemId, -1);
        } else if (button.classList.contains('cart-remove')) {
            removeItem(itemId);
        }
    };
}


/**
 * Aggiorna la lista del carrello nell'interfaccia utente (UI).
 */
function renderCart() {
    cartList.innerHTML = '';
    let total = 0;

    cart.sort((a, b) => a.name.localeCompare(b.name));

    if (cart.length === 0) {
        cartList.innerHTML = '<li style="text-align: center; color: #ccc;">Il carrello è vuoto. Aggiungi qualcosa dal menu!</li>';
        sendOrderBtn.disabled = true;
        totalPriceSpan.textContent = '0.00';
        return;
    }
    
    sendOrderBtn.disabled = false;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const li = document.createElement('li');
        li.dataset.id = item.id;
        li.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0;">
                
                <span style="flex-grow: 1; color: #f8f9fa;">
                    <strong>${item.name}</strong> 
                    <small>(€${item.price.toFixed(2)})</small>
                </span>
                
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button class="cart-btn cart-decrement" data-id="${item.id}">-</button>
                    <span class="cart-qty" data-id="${item.id}" style="color: #ffc107; font-weight: bold;">${item.quantity}</span>
                    <button class="cart-btn cart-increment" data-id="${item.id}">+</button>
                    <button class="cart-btn cart-remove" data-id="${item.id}" style="color: #dc3545; background: none; border: none; font-size: 1.2em;">&times;</button>
                </div>

            </div>
        `;
        cartList.appendChild(li);
    });

    totalPriceSpan.textContent = total.toFixed(2);
    
    // Attacca i listener di evento SOLO una volta, all'inizio, 
    // ma la funzione è chiamata qui per garantire che il delegation sia attivo.
    // L'ottimizzazione è spostata nella parte di Inizializzazione.
}


// ====================================================================
// 4. LOGICA DEL MENU E FIREBASE
// ====================================================================

/**
 * Raggruppa un array piatto di articoli per il campo 'category'.
 * @param {Array} items - L'array di articoli dal database.
 * @returns {object} Oggetto con le categorie come chiavi e gli array di articoli come valori.
 */
function groupItemsByCategory(items) {
    return items.reduce((acc, item) => {
        const category = item.category || 'Altro'; 
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item);
        return acc;
    }, {});
}

/**
 * Visualizza il menu raggruppato in sezioni HTML.
 * @param {object} groupedItems - Il menu raggruppato per categoria.
 */
function renderMenu(groupedItems) {
    menuContainer.innerHTML = ''; 

    // Ordina le categorie alfabeticamente
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        const categorySection = document.createElement('section');
        // ID pulito per l'ancoraggio (necessario per la navigazione rapida)
        categorySection.id = `category-${category.replace(/\s+/g, '_').toLowerCase()}`; 
        categorySection.innerHTML = `<h2>${category}</h2>`;
        
        const itemsListDiv = document.createElement('div');
        itemsListDiv.className = 'category-items'; 

        groupedItems[category].forEach(item => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.innerHTML = `
                <div>
                    <strong>${item.name}</strong><br>
                    <span>€${item.price.toFixed(2)}</span>
                </div>
                <button class="add-to-cart-btn" data-id="${item.id}" 
                        data-name="${item.name}" data-price="${item.price}">
                    Aggiungi
                </button>
            `;
            
            // Aggiunge l'evento al pulsante "Aggiungi"
            const btn = div.querySelector('.add-to-cart-btn');
            btn.addEventListener('click', () => {
                addToCart({
                    id: item.id,
                    name: item.name,
                    // Converte il prezzo in un numero float per sicurezza
                    price: parseFloat(item.price) 
                });
            });

            itemsListDiv.appendChild(div);
        });
        
        categorySection.appendChild(itemsListDiv);
        menuContainer.appendChild(categorySection);
    });
}

/**
 * Legge il menu da Firestore, raggruppa e renderizza.
 */
async function fetchMenu() {
    menuContainer.innerHTML = '<h2>Caricamento Menu...</h2>';
    try {
        const snapshot = await db.collection('menu').get();
        const menuItems = snapshot.docs.map(doc => ({
            id: doc.id,
            // I prezzi salvati come Stringa vengono convertiti in Float
            price: parseFloat(doc.data().price), 
            ...doc.data()
        }));
        
        const groupedItems = groupItemsByCategory(menuItems);
        renderMenu(groupedItems);

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        menuContainer.innerHTML = '<p style="color:red;">Impossibile caricare il menu. Controlla la connessione a Firebase.</p>';
    }
}

/**
 * Invia l'ordine a Firestore.
 */
async function sendOrder() {
    if (cart.length === 0) {
        alert("Il carrello è vuoto!");
        return;
    }

    sendOrderBtn.disabled = true;
    sendOrderBtn.textContent = 'Invio in corso...';
    
    // Crea una versione pulita degli articoli del carrello per il database
    const itemsToSave = cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
    }));
    
    const orderData = {
        tableId: tableId,
        items: itemsToSave,
        total: parseFloat(totalPriceSpan.textContent),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending' 
    };
    
    try {
        await db.collection('orders').add(orderData);
        
        alert(`Ordine inviato con successo al Tavolo ${tableId}! Sarai servito a breve.`);
        
        // Pulisce lo stato
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

// ====================================================================
// 5. INIZIALIZZAZIONE
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Legge il tavolo dall'URL
    getTableIdFromUrl();
    
    // 2. Carica e visualizza il menu
    fetchMenu();
    
    // 3. Inizializza la visualizzazione del carrello vuoto
    renderCart(); 

    // 4. Collega i listener di base
    sendOrderBtn.addEventListener('click', sendOrder);
    
    // 5. Collega il listener di delegation per il carrello interattivo
    attachCartEventListeners(); 
});
