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

// Inizializza Firebase e Firestore (Compat Mode)
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
const navQuickLinks = document.getElementById('quick-links');

// NUOVI SELETTORI PER LA MODALE CARRELLO
const cartModal = document.getElementById('cart-modal');
const toggleCartBtn = document.getElementById('toggle-cart-btn');
const closeCartBtn = document.querySelector('#cart-modal .close-btn');
const cartItemCount = document.getElementById('cart-item-count');
const cartFixedTotal = document.getElementById('cart-fixed-total');

// Stato dell'applicazione
let cart = []; // Array per contenere gli articoli nel carrello
let tableId = 'Tavolo non trovato'; // Modificato il default per chiarezza
let menuStructure = {}; // Salverà la struttura del menu raggruppato

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
 * Gestisce l'apertura e la chiusura della Modale Carrello.
 */
function toggleCartModal(show) {
    if (show) {
        cartModal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Impedisce lo scroll del body
    } else {
        cartModal.style.display = 'none';
        document.body.style.overflow = '';
    }
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
        cart.push({ ...item, quantity: 1 });
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
 * Collega gli eventi di delegation ai pulsanti di manipolazione del carrello (+, -, Rimuovi) nel Modale.
 */
function attachCartEventListeners() {
    // Si usa il delegation event listener sull'elemento genitore (cartList)
    cartList.onclick = (e) => {
        // Cerca il pulsante più vicino con la classe .cart-btn
        const button = e.target.closest('.cart-btn');
        if (!button) return; // Non è un pulsante del carrello

        const itemId = button.dataset.id;

        if (button.classList.contains('cart-increment')) {
            updateQuantity(itemId, 1);
        } else if (button.classList.contains('cart-decrement')) {
            updateQuantity(itemId, -1);
        } else if (button.classList.contains('cart-remove')) {
            // Nota: Se usi solo +/- (come nel CSS), questo blocco non è necessario
            removeItem(itemId); 
        }
    };
}


/**
 * Aggiorna la lista del carrello nell'interfaccia utente (UI) e la barra fissa.
 */
function renderCart() {
    cartList.innerHTML = '';
    let total = 0;
    let itemCount = 0;

    cart.sort((a, b) => a.name.localeCompare(b.name));

    if (cart.length === 0) {
        cartList.innerHTML = '<li style="text-align: center; color: #6c757d; padding: 20px;">Il carrello è vuoto. Aggiungi qualcosa dal menu!</li>';
        sendOrderBtn.disabled = true;
    } else {
        sendOrderBtn.disabled = false;
    }
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        itemCount += item.quantity;

        const li = document.createElement('li');
        li.className = 'cart-item'; // Classe dal CSS moderno
        li.dataset.id = item.id;
        li.innerHTML = `
            <div class="item-details">
                <strong>${item.name}</strong>
                <span>€${item.price.toFixed(2)}</span>
            </div>
            
            <div class="cart-item-controls">
                <button class="cart-btn cart-decrement minus-btn" data-id="${item.id}">-</button>
                <span class="cart-qty">${item.quantity}</span>
                <button class="cart-btn cart-increment" data-id="${item.id}">+</button>
            </div>
        `;
        cartList.appendChild(li);
    });

    // Aggiornamento Totali nel Modale e nella Barra Fissa
    const formattedTotal = total.toFixed(2);
    totalPriceSpan.textContent = formattedTotal;
    cartItemCount.textContent = itemCount;
    cartFixedTotal.textContent = formattedTotal;
}


// ====================================================================
// 4. LOGICA DEL MENU E FIREBASE (Migliorata con Navigazione)
// ====================================================================

/**
 * Raggruppa un array piatto di articoli per il campo 'category'.
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
 * Genera i pulsanti di navigazione rapida (Quick Links) in base alle categorie.
 * @param {object} groupedItems - Il menu raggruppato.
 */
function renderCategoryNavigation(groupedItems) {
    navQuickLinks.innerHTML = '';
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        // Funzione per creare un ID valido per l'ancoraggio
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.textContent = category;
        
        // COLLEGA L'EVENTO DI SCROLL
        button.addEventListener('click', () => {
            const target = document.getElementById(cleanId);
            if (target) 
                // Scroll fluido alla sezione con un offset
                window.scrollTo({
                    // target.offsetTop - 100 tiene conto dell'altezza dell'header fisso
                    top: target.offsetTop - 100, 
                    behavior: 'smooth'
                });
            }
        });
        navQuickLinks.appendChild(button);
    });
}


/**
 * Visualizza il menu raggruppato in sezioni HTML.
 * @param {object} groupedItems - Il menu raggruppato per categoria.
 */
function renderMenu(groupedItems) {
    menuContainer.innerHTML = '';
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        const categorySection = document.createElement('section');
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        categorySection.id = cleanId;
        categorySection.className = 'menu-category'; 
        categorySection.innerHTML = `<h2>${category}</h2>`;

        const itemsListDiv = document.createElement('div');
        itemsListDiv.className = 'category-items-list'; 

        groupedItems[category].forEach(item => {
            const div = document.createElement('div');
            div.className = 'menu-item-card';

            // Usiamo il layout Card moderna con le icone
            div.innerHTML = `
                <div class="item-info">
                    <h3>${item.name}</h3>
                    <p>€${item.price.toFixed(2)}</p>
                </div>
                <div class="item-controls">
                    <button class="add-to-cart-btn" data-id="${item.id}">
                        <i class="fas fa-plus"></i> Aggiungi
                    </button>
                </div>
            `;

            // Aggiunge l'evento al pulsante "Aggiungi" 
            const btn = div.querySelector('.add-to-cart-btn');
            btn.addEventListener('click', () => {
                addToCart({
                    id: item.id,
                    name: item.name,
                    price: parseFloat(item.price) // Conversione sicura
                });
            });

            itemsListDiv.appendChild(div);
        });

        categorySection.appendChild(itemsListDiv);
        menuContainer.appendChild(categorySection);
    });
}

/**
 * Legge il menu da Firestore, raggruppa, renderizza Menu e Navigazione.
 */
async function fetchMenu() {
    menuContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><h2>Caricamento Menu...</h2></div>';
    try {
        // IMPORTANTE: Necessita di un indice in Firestore se usi .orderBy('category')
        const snapshot = await db.collection('menu').orderBy('category').get(); 
        
        if (snapshot.empty) {
            menuContainer.innerHTML = '<p class="error-message">Nessun articolo trovato nel menu.</p>';
            return;
        }

        const menuItems = snapshot.docs.map(doc => ({
            id: doc.id,
            price: parseFloat(doc.data().price),
            ...doc.data()
        }));

        menuStructure = groupItemsByCategory(menuItems); 
        
        renderCategoryNavigation(menuStructure); // 1. Renderizza la Navigazione Veloce
        renderMenu(menuStructure); // 2. Renderizza il Menu

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        // Visualizza l'errore se la connessione fallisce
        menuContainer.innerHTML = '<p class="error-message">Impossibile caricare il menu. Controlla la connessione o le regole di Firebase. (Vedi console F12 per dettagli)</p>';
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
    sendOrderBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Invio in corso...';
    
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
        
        // Chiude la modale dopo l'invio
        toggleCartModal(false); 
        alert(`Ordine inviato con successo al Tavolo ${tableId}! Sarai servito a breve.`);
        
        // Pulisce lo stato
        cart = [];
        renderCart(); 

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("Si è verificato un errore durante l'invio dell'ordine.");
    } finally {
        sendOrderBtn.disabled = false;
        sendOrderBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Invia Ordine al Bar';
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

    // 6. Listener per la Modale Carrello 
    toggleCartBtn.addEventListener('click', () => toggleCartModal(true));
    closeCartBtn.addEventListener('click', () => toggleCartModal(false));
    
    // Chiudi il modale cliccando fuori
    window.addEventListener('click', (event) => {
        if (event.target === cartModal) {
            toggleCartModal(false);
        }
    });
});
