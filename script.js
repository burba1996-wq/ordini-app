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

let activeOrderId = null; // ID dell'ordine attivo per questo tavolo

let unsubscribeOrderListener = null; // Funzione per rimuovere il listener

let hasActiveOrder = false; // Flag per controllare se esiste un ordine attivo



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

}



/**

 * Gestisce l'apertura e la chiusura della Modale Carrello.

 */

function toggleCartModal(show) {

    if (show) {

        // Aggiorna il carrello prima di aprirlo

        renderCart(); 

        cartModal.style.display = 'block';

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

    cartList.onclick = (e) => {

        const button = e.target.closest('.cart-btn');

        if (!button) return;



        const itemId = button.dataset.id;



        if (button.classList.contains('cart-increment')) {

            updateQuantity(itemId, 1);

        } else if (button.classList.contains('cart-decrement')) {

            updateQuantity(itemId, -1);

        }

        // Nota: non c'è un pulsante 'cart-remove' esplicito, ma il decremento a 0 lo rimuove.

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

                <button class="cart-btn cart-decrement" data-id="${item.id}">-</button>

                <span class="cart-qty">${item.quantity}</span>

                <button class="cart-btn cart-increment" data-id="${item.id}">+</button>

            </div>

        `;

        cartList.appendChild(li);

    });



    const formattedTotal = total.toFixed(2);

    totalPriceSpan.textContent = formattedTotal;

    cartItemCount.textContent = itemCount;

    cartFixedTotal.textContent = formattedTotal;

}



// ====================================================================

// 4. GESTIONE ORDINE ATTIVO E STATO IN TEMPO REALE

// ====================================================================



/**

 * Controlla se esiste già un ordine attivo per questo tavolo.

 * Se esiste, blocca il form e mostra lo stato dell'ordine.

 */

async function checkActiveOrder() {

    try {

        // Query per trovare ordini ATTIVI (pending o executed) per questo tavolo

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

            

            // IMPOSTA IL FLAG

            hasActiveOrder = true;

            

            // Mostra l'ordine attivo e blocca il menu

            displayActiveOrder(orderData);

            disableOrdering();

            

            // Avvia il listener in tempo reale per questo ordine

            listenToOrderUpdates(activeOrderId);

        } else {

            console.log('Nessun ordine attivo trovato per il tavolo:', tableId);

            // Nessun ordine attivo, permetti nuovi ordini

            hasActiveOrder = false;

            activeOrderId = null;

            enableOrdering();

            hideActiveOrderDisplay();

        }

    } catch (error) {

        console.error("Errore nel controllo ordini attivi:", error);

        // In caso di errore, per sicurezza permettiamo di ordinare

        hasActiveOrder = false;

        enableOrdering();

    }

}



/**

 * Ascolta gli aggiornamenti in tempo reale dell'ordine attivo.

 */

function listenToOrderUpdates(orderId) {

    // Rimuovi il listener precedente se esiste

    if (unsubscribeOrderListener) {

        unsubscribeOrderListener();

    }

    

    console.log('Avvio listener per ordine:', orderId);

    

    // Crea un nuovo listener

    unsubscribeOrderListener = db.collection('orders').doc(orderId)

        .onSnapshot((doc) => {

            if (!doc.exists) {

                console.log('Ordine eliminato dalla dashboard');

                // L'ordine è stato eliminato dalla dashboard

                hasActiveOrder = false;

                activeOrderId = null;

                enableOrdering();

                hideActiveOrderDisplay();

                return;

            }

            

            const orderData = doc.data();

            console.log('Aggiornamento ordine:', orderData.status);

            

            // Se lo stato è 'completed', l'ordine è concluso

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

                // Aggiorna la visualizzazione dello stato (pending -> executed)

                displayActiveOrder(orderData);

            }

        }, (error) => {

            console.error("Errore nel listener ordine:", error);

        });

}



/**

 * Mostra l'ordine attivo con il suo stato in un banner.

 * CORREZIONE: Inserisce il banner all'inizio di <main> (prima di #menu-container)

 */

function displayActiveOrder(orderData) {

    // Rimuovi eventuali banner precedenti

    const existingBanner = document.getElementById('active-order-banner');

    if (existingBanner) {

        existingBanner.remove();

    }

    

    // Crea il banner

    const banner = document.createElement('div');

    banner.id = 'active-order-banner';

    banner.className = 'active-order-banner';

    

    const statusText = orderData.status === 'pending' ? 'In Attesa' : 'In Preparazione';

    const statusClass = orderData.status === 'pending' ? 'status-pending' : 'status-executed';

    const statusIcon = orderData.status === 'pending' ? '⏳' : '👨‍🍳';

    

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

    

    // CORREZIONE: Inserisci il banner all'inizio di <main>, prima di #menu-container

    const main = document.querySelector('main');

    if (main && menuContainer) {

        main.insertBefore(banner, menuContainer);

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

}



/**

 * Disabilita la possibilità di ordinare (quando c'è già un ordine attivo).

 */

function disableOrdering() {

    console.log('Disabilitazione ordinazione...');

    

    // Blocca il menu visivamente

    if (menuContainer) {

        menuContainer.style.opacity = '0.5';

        menuContainer.style.pointerEvents = 'none';

    }

    

    // Disabilita TUTTI i pulsanti "Aggiungi"

    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {

        btn.disabled = true;

        btn.style.opacity = '0.5';

        btn.style.cursor = 'not-allowed';

    });

    

    // Disabilita il pulsante di invio ordine

    if (sendOrderBtn) {

        sendOrderBtn.disabled = true;

        sendOrderBtn.innerHTML = '<i class="fas fa-lock"></i> Ordine già attivo';

    }

    

    // Nascondi la barra fissa del carrello (non serve più)

    const cartBar = document.getElementById('cart-fixed-bar');

    if (cartBar) {

        cartBar.style.display = 'none';

    }

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

        sendOrderBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Invia Ordine al Bar';

    }

    

    // Mostra la barra fissa del carrello

    const cartBar = document.getElementById('cart-fixed-bar');

    if (cartBar) {

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

    

    const orderData = {

        tableId: tableId,

        items: itemsToSave,

        total: parseFloat(totalPriceSpan.textContent),

        timestamp: firebase.firestore.FieldValue.serverTimestamp(),

        status: 'pending',

        notes: ''

    };

    

    try {

        const docRef = await db.collection('orders').add(orderData);

        activeOrderId = docRef.id;

        hasActiveOrder = true;

        

        console.log('Ordine creato con ID:', activeOrderId);

        

        toggleCartModal(false); 

        alert(`✅ Ordine inviato con successo!\n\nPuoi seguire lo stato nella parte superiore della pagina.`);

        

        cart = [];

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

        sendOrderBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Invia Ordine al Bar';

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



    closeCartBtn.addEventListener('click', () => toggleCartModal(false));

    

    window.addEventListener('click', (event) => {

        if (event.target === cartModal) {

            toggleCartModal(false);

        }

    });



    // CORREZIONE: Aggiunta la chiamata a toggleCartModal(true) per aprire la modale

    toggleCartBtn.addEventListener('click', () => {

        const anchor = document.getElementById('order-anchor-point');

        if (anchor) {

            window.scrollTo({

                top: anchor.offsetTop - 50,

                behavior: 'smooth'

            });

        }

        // Apri la modale dopo lo scroll

        toggleCartModal(true); 

    });

});



// Pulizia quando l'utente lascia la pagina

window.addEventListener('beforeunload', () => {

    if (unsubscribeOrderListener) {

        unsubscribeOrderListener();

    }

});
