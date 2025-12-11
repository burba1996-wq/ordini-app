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
const tableIdSpan = document.getElementById('table-id');
const navQuickLinks = document.getElementById('quick-links');

// NUOVI SELETTORI PER LA MODALE CARRELLO (Corretti)
const cartModal = document.getElementById('cartModal'); // ID corretto da HTML
const toggleCartBtn = document.getElementById('toggle-cart-btn');
const closeCartBtn = document.querySelector('#cartModal .close-btn'); // ID corretto da HTML
const cartList = document.getElementById('cart-items-list'); // ID corretto da HTML
const cartItemCount = document.getElementById('cart-item-count');
const cartFixedTotal = document.getElementById('cart-fixed-total');
const cartTotalModal = document.getElementById('cart-total-modal'); // ID corretto da HTML
const sendOrderBtn = document.getElementById('send-order-btn'); // Già presente ma ri-definito per chiarezza
const orderNotesInput = document.getElementById('order-notes'); // NUOVO SELETTORE NOTE

// Stato dell'applicazione
let cart = []; // Array per contenere gli articoli nel carrello
let tableId = 'Tavolo non trovato';
let menuStructure = {};
let activeOrderId = null;
let unsubscribeOrderListener = null;
let hasActiveOrder = false;

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
        tableId = id;
    }
    tableIdSpan.textContent = tableId;
    // Aggiorna anche l'ID del tavolo nel modale
    document.getElementById('modal-table-id').textContent = tableId; 
}

/**
 * Gestisce l'apertura e la chiusura della Modale Carrello.
 * CORREZIONE: Usa 'flex' per mostrare e 'none' per nascondere.
 */
function toggleCartModal(show) {
    if (show) {
        // Aggiorna il carrello prima di aprirlo per assicurare i dati freschi
        renderCart(); 
        cartModal.style.display = 'flex'; // Usa 'flex' per centrare (come da CSS)
        document.body.style.overflow = 'hidden';
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
    // CONTROLLO: Non permettere di aggiungere se c'è un ordine attivo
    if (hasActiveOrder) {
        alert("Hai già un ordine attivo! Attendi che venga completato prima di ordinare di nuovo.");
        return;
    }
    
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
    // CONTROLLO: Non permettere modifiche se c'è un ordine attivo
    if (hasActiveOrder) return;
    
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
 * Collega gli eventi di delegation ai pulsanti di manipolazione del carrello (+, -) nel Modale.
 */
function attachCartEventListeners() {
    // Delegation sul corpo della lista per i pulsanti + e -
    cartList.addEventListener('click', (e) => {
        // Ignora se c'è un ordine attivo
        if (hasActiveOrder) return;
        
        const button = e.target.closest('.cart-btn');
        if (!button) return;

        const itemId = button.dataset.id;

        if (button.classList.contains('cart-increment')) {
            updateQuantity(itemId, 1);
        } else if (button.classList.contains('cart-decrement')) {
            updateQuantity(itemId, -1);
        }
    });
}


/**
 * Aggiorna la lista del carrello nell'interfaccia utente (UI) e la barra fissa.
 * CORREZIONE: Aggiorna il totale nella modale usando il selettore corretto.
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
        // IMPORTANTE: Disabilita il pulsante se c'è un ordine attivo
        sendOrderBtn.disabled = hasActiveOrder;
    }
    
    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        itemCount += item.quantity;

        const li = document.createElement('li');
        li.className = 'cart-item';
        li.dataset.id = item.id;
        li.innerHTML = `
            <div class="item-details">
                <strong>${item.name}</strong>
                <span>€${item.price.toFixed(2)}</span>
            </div>
            
            <div class="cart-item-controls">
                <button class="cart-btn cart-decrement" data-id="${item.id}" ${hasActiveOrder ? 'disabled' : ''}>-</button>
                <span class="cart-qty">${item.quantity}</span>
                <button class="cart-btn cart-increment" data-id="${item.id}" ${hasActiveOrder ? 'disabled' : ''}>+</button>
            </div>
        `;
        cartList.appendChild(li);
    });

    const formattedTotal = total.toFixed(2);
    
    // Aggiorna il totale nella modale (CORREZIONE SELETTORE)
    if (cartTotalModal) {
        cartTotalModal.textContent = `€ ${formattedTotal}`;
    }
    // Aggiorna la barra fissa
    if (cartItemCount) {
        cartItemCount.textContent = itemCount;
    }
    if (cartFixedTotal) {
        cartFixedTotal.textContent = `€ ${formattedTotal}`;
    }

    // Se il carrello è vuoto e non ci sono ordini attivi, abilita/disabilita l'invio
    if (sendOrderBtn) {
        sendOrderBtn.disabled = cart.length === 0 || hasActiveOrder;
    }

    // Mostra/Nascondi la barra fissa solo se non c'è un ordine attivo E il carrello è pieno
    const cartBar = document.getElementById('cart-fixed-bar');
    if (cartBar) {
        // Mostra la barra solo se non c'è un ordine attivo E ci sono articoli nel carrello
        cartBar.style.display = (!hasActiveOrder && cart.length > 0) ? 'block' : 'none';
    }
}

// ====================================================================
// 4. GESTIONE ORDINE ATTIVO E STATO IN TEMPO REALE
// ====================================================================

/**
 * Controlla se esiste già un ordine attivo per questo tavolo.
 */
async function checkActiveOrder() {
    // ... (Logica di checkActiveOrder invariata) ...
    try {
        const snapshot = await db.collection('orders')
            .where('tableId', '==', tableId)
            .where('status', 'in', ['pending', 'executed'])
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (!snapshot.empty) {
            const orderDoc = snapshot.docs[0];
            activeOrderId = orderDoc.id;
            const orderData = orderDoc.data();
            
            console.log('Ordine attivo trovato:', activeOrderId, orderData);
            
            hasActiveOrder = true;
            
            displayActiveOrder(orderData);
            disableOrdering();
            
            listenToOrderUpdates(activeOrderId);
        } else {
            console.log('Nessun ordine attivo trovato per il tavolo:', tableId);
            hasActiveOrder = false;
            activeOrderId = null;
            enableOrdering();
            hideActiveOrderDisplay();
        }
    } catch (error) {
        console.error("Errore nel controllo ordini attivi:", error);
        hasActiveOrder = false;
        enableOrdering();
    }
}

/**
 * Ascolta gli aggiornamenti in tempo reale dell'ordine attivo.
 */
function listenToOrderUpdates(orderId) {
    // ... (Logica di listenToOrderUpdates invariata) ...
    if (unsubscribeOrderListener) {
        unsubscribeOrderListener();
    }
    
    console.log('Avvio listener per ordine:', orderId);
    
    unsubscribeOrderListener = db.collection('orders').doc(orderId)
        .onSnapshot((doc) => {
            if (!doc.exists) {
                console.log('Ordine eliminato dalla dashboard');
                hasActiveOrder = false;
                activeOrderId = null;
                enableOrdering();
                hideActiveOrderDisplay();
                return;
            }
            
            const orderData = doc.data();
            console.log('Aggiornamento ordine:', orderData.status);
            
            if (orderData.status === 'completed') {
                console.log('Ordine completato');
                hasActiveOrder = false;
                activeOrderId = null;
                enableOrdering();
                hideActiveOrderDisplay();
                if (unsubscribeOrderListener) {
                    unsubscribeOrderListener();
                    unsubscribeOrderListener = null;
                }
            } else {
                displayActiveOrder(orderData);
            }
        }, (error) => {
            console.error("Errore nel listener ordine:", error);
        });
}

/**
 * Mostra l'ordine attivo con il suo stato in un banner.
 */
function displayActiveOrder(orderData) {
    const existingBanner = document.getElementById('active-order-banner');
    if (existingBanner) {
        existingBanner.remove();
    }
    
    const banner = document.createElement('div');
    banner.id = 'active-order-banner';
    banner.className = 'active-order-banner';
    
    const statusTextMap = { 'pending': 'In Attesa', 'executed': 'In Preparazione' };
    const statusClassMap = { 'pending': 'status-pending', 'executed': 'status-executed' };
    const statusIconMap = { 'pending': '⏳', 'executed': '👨‍🍳' };

    const statusText = statusTextMap[orderData.status] || 'Sconosciuto';
    const statusClass = statusClassMap[orderData.status] || '';
    const statusIcon = statusIconMap[orderData.status] || '';
    
    banner.innerHTML = `
        <div class="order-status-header">
            <h3>${statusIcon} Ordine Attivo - ${statusText}</h3>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="order-items-list">
            ${orderData.items.map(item => `
                <div class="order-item-row">
                    <span>${item.quantity}x ${item.name}</span>
                    <span>€${(item.price * item.quantity).toFixed(2)}</span>
                </div>
            `).join('')}
        </div>
        ${orderData.notes ? `<div class="order-notes"><strong>Note:</strong> ${orderData.notes}</div>` : ''}
        <div class="order-total">
            <strong>Totale: €${orderData.total.toFixed(2)}</strong>
        </div>
        <p class="order-info">📌 Il tuo ordine verrà servito a breve. Non è possibile effettuare nuovi ordini fino al completamento di questo.</p>
    `;
    
    const main = document.querySelector('main');
    const activeOrderMessageContainer = document.getElementById('active-order-message'); // Contenitore nel tuo HTML
    if (activeOrderMessageContainer) {
        activeOrderMessageContainer.appendChild(banner);
        // Nascondi il menu principale leggermente per focalizzare sull'ordine attivo
        menuContainer.style.marginTop = '0'; 
    }
}

/**
 * Nasconde il banner dell'ordine attivo.
 */
function hideActiveOrderDisplay() {
    const banner = document.getElementById('active-order-banner');
    if (banner) {
        banner.remove();
    }
    menuContainer.style.marginTop = ''; // Ripristina il margine
}

/**
 * Disabilita la possibilità di ordinare (quando c'è già un ordine attivo).
 */
function disableOrdering() {
    console.log('Disabilitazione ordinazione...');
    
    // Blocca il menu visivamente e interattivamente
    if (menuContainer) {
        menuContainer.style.opacity = '0.5';
        menuContainer.style.pointerEvents = 'none';
    }
    
    // Disabilita TUTTI i pulsanti "Aggiungi" (se il menu è già renderizzato)
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    });
    
    // Disabilita il pulsante di invio ordine (nel modale)
    if (sendOrderBtn) {
        sendOrderBtn.disabled = true;
        sendOrderBtn.innerHTML = '<i class="fas fa-lock"></i> Ordine già attivo';
    }
    
    // Nascondi la barra fissa del carrello
    const cartBar = document.getElementById('cart-fixed-bar');
    if (cartBar) {
        cartBar.style.display = 'none';
    }
    
    // Chiudi il modale se aperto
    toggleCartModal(false);
}

/**
 * Riabilita la possibilità di ordinare.
 */
function enableOrdering() {
    console.log('Riabilitazione ordinazione...');
    
    // Sblocca il menu
    if (menuContainer) {
        menuContainer.style.opacity = '1';
        menuContainer.style.pointerEvents = 'auto';
    }
    
    // Riabilita i pulsanti "Aggiungi"
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    });
    
    // Riabilita il pulsante di invio (se c'è qualcosa nel carrello)
    if (sendOrderBtn) {
        sendOrderBtn.disabled = cart.length === 0;
        sendOrderBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Invia Ordine';
    }
    
    // Mostra la barra fissa del carrello (se ci sono elementi)
    const cartBar = document.getElementById('cart-fixed-bar');
    if (cartBar && cart.length > 0) {
        cartBar.style.display = 'block';
    }
    
    // Pulisci il carrello locale (l'ordine precedente è concluso)
    cart = [];
    renderCart();
}

// ====================================================================
// 5. LOGICA DEL MENU E FIREBASE
// ====================================================================

/**
 * Raggruppa un array piatto di articoli per il campo 'category'.
 */
function groupItemsByCategory(items) {
    // ... (Invariata) ...
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
 */
function renderCategoryNavigation(groupedItems) {
    // ... (Invariata) ...
    navQuickLinks.innerHTML = '';
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.textContent = category;
        
        button.addEventListener('click', () => {
            const target = document.getElementById(cleanId);
            if (target) { 
                window.scrollTo({
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
 */
function renderMenu(groupedItems) {
    // ... (Invariata) ...
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

            const btn = div.querySelector('.add-to-cart-btn');
            btn.addEventListener('click', () => {
                addToCart({
                    id: item.id,
                    name: item.name,
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
 * Legge il menu da Firestore, raggruppa, renderizza Menu e Navigazione.
 */
async function fetchMenu() {
    // ... (Invariata) ...
    menuContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><h2>Caricamento Menu...</h2></div>';
    try {
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
        
        renderCategoryNavigation(menuStructure);
        renderMenu(menuStructure);
        
        // IMPORTANTE: Controlla se c'è un ordine attivo DOPO aver caricato il menu
        await checkActiveOrder();

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        menuContainer.innerHTML = '<p class="error-message">Impossibile caricare il menu. Controlla la connessione o le regole di Firebase.</p>';
    }
}


/**
 * Invia l'ordine a Firestore.
 * CORREZIONE: Legge il campo note dall'input e lo include nell'ordine.
 */
async function sendOrder() {
    // DOPPIO CONTROLLO: Previeni invio se c'è già un ordine attivo
    if (hasActiveOrder) {
        alert("Hai già un ordine attivo! Attendi che venga completato.");
        return;
    }
    
    if (cart.length === 0) {
        alert("Il carrello è vuoto!");
        return;
    }

    sendOrderBtn.disabled = true;
    sendOrderBtn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Invio in corso...';
    
    const itemsToSave = cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
    }));
    
    // Leggi le note (CORREZIONE)
    const notes = orderNotesInput ? orderNotesInput.value.trim() : '';

    const orderData = {
        tableId: tableId,
        items: itemsToSave,
        total: parseFloat(cartTotalModal.textContent.replace('€ ', '') || 0), // Usa il totale dal modale
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending',
        notes: notes // Includi le note
    };
    
    try {
        const docRef = await db.collection('orders').add(orderData);
        activeOrderId = docRef.id;
        hasActiveOrder = true;
        
        console.log('Ordine creato con ID:', activeOrderId);
        
        toggleCartModal(false); 
        alert(`✅ Ordine inviato con successo!\n\nPuoi seguire lo stato nella parte superiore della pagina.`);
        
        // Pulisci il carrello e le note
        cart = [];
        if (orderNotesInput) {
             orderNotesInput.value = '';
        }
        renderCart();
        
        // Attendi un attimo prima di controllare (per dare tempo al timestamp)
        setTimeout(() => {
            checkActiveOrder();
        }, 500);

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("❌ Errore nell'invio dell'ordine. Riprova.");
        hasActiveOrder = false;
        activeOrderId = null;
    } finally {
        sendOrderBtn.disabled = false;
        sendOrderBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Invia Ordine';
    }
}

// ====================================================================
// 6. INIZIALIZZAZIONE
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Inizializzazione app cliente...');
    
    getTableIdFromUrl();
    fetchMenu(); // Questo chiamerà automaticamente checkActiveOrder() alla fine
    renderCart(); 

    sendOrderBtn.addEventListener('click', sendOrder);
    attachCartEventListeners(); 

    // Evento per chiudere il modale dal pulsante (X)
    closeCartBtn.addEventListener('click', () => toggleCartModal(false));
    
    // Evento per chiudere il modale cliccando fuori
    window.addEventListener('click', (event) => {
        if (event.target === cartModal) {
            toggleCartModal(false);
        }
    });

    // CORREZIONE: Apre la modale al click sul pulsante fisso in basso
    toggleCartBtn.addEventListener('click', () => {
        toggleCartModal(true); 
    });
});

// Pulizia quando l'utente lascia la pagina
window.addEventListener('beforeunload', () => {
    if (unsubscribeOrderListener) {
        unsubscribeOrderListener();
    }
});
