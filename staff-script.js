// ===============================================
//           STAFF ORDERING SYSTEM SCRIPT
// ===============================================

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

// Collezioni di riferimento
const menuCollection = db.collection('menu');
const ordersCollection = db.collection('orders');

// --- 2. VARIABILI DI STATO GLOBALI ---
let menuData = []; 
let cartItems = {};
let currentTableId = null; 

// --- 3. RIFERIMENTI DOM (Dichiarati come LET per l'assegnazione successiva) ---
let mainContainer, cartList, totalPriceSpan, sendOrderBtn, tableIdDisplay, cartTableDisplay, navQuickLinks;
let tableSelect; // Elemento cruciale per l'errore precedente

// ===============================================
//           LOGICA DI AUTENTICAZIONE
// ===============================================

/**
 * Reindirizza l'utente in base allo stato di autenticazione.
 */
auth.onAuthStateChanged(user => {
    const isStaffMenu = window.location.pathname.endsWith('staff-menu.html');
    const isStaffLogin = window.location.pathname.endsWith('staff-login.html');

    if (isStaffMenu && !user) {
        window.location.href = 'staff-login.html';
    } else if (isStaffLogin && user) {
        window.location.href = 'staff-menu.html';
    }
});

/**
 * Funzione di Login (chiamata dall'HTML su staff-login.html)
 */
function handleStaffLogin() {
    const email = document.getElementById('staff-email')?.value;
    const password = document.getElementById('staff-password')?.value;
    const loginBtn = document.getElementById('login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!email || !password || !loginBtn) return;

    errorMessage.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Accesso...';

    auth.signInWithEmailAndPassword(email, password)
        .catch(error => {
            console.error("Errore di Login: ", error.message);
            errorMessage.textContent = 'Accesso fallito. Credenziali non valide.';
        })
        .finally(() => {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Accedi';
        });
}

/**
 * Funzione di Logout (chiamata dall'HTML su staff-menu.html)
 */
function handleLogout() {
    auth.signOut().catch(error => {
        console.error("Errore di Logout: ", error);
        alert("Errore durante il logout. Riprova.");
    });
}

// ===============================================
//           LOGICA DI GESTIONE ORDINI E TAVOLI
// ===============================================

/**
 * Popola il dropdown di selezione tavolo e gestisce l'evento 'change'.
 */
function populateTableSelect() {
    if (!tableSelect) return;

    // 1. Inizializzazione del dropdown
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Seleziona Tavolo...';
    defaultOption.disabled = true;
    defaultOption.selected = true; 
    tableSelect.appendChild(defaultOption);
    
    for (let i = 1; i <= 40; i++) {
        const option = document.createElement('option');
        option.value = `TAVOLO_${i}`;
        option.textContent = `Tavolo ${i}`; 
        tableSelect.appendChild(option);
    }

    // 2. Gestione dell'evento di selezione (Risoluzione dell'errore displayId)
    tableSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        
        if (selectedValue === '') {
            // Caso di selezione predefinita (nessun tavolo)
            currentTableId = null;
            if (mainContainer) {
                 mainContainer.style.pointerEvents = 'none';
                 mainContainer.style.opacity = '0.5';
            }
            if (tableIdDisplay) tableIdDisplay.textContent = 'Nessuno';
            if (cartTableDisplay) cartTableDisplay.textContent = 'Nessuno';
            return;
        }

        currentTableId = selectedValue;
        
        // La variabile è definita nello scope locale, risolvendo il ReferenceError
        const displayId = currentTableId.replace('TAVOLO_', 'Tavolo '); 
        
        // Aggiorna i display
        if (tableIdDisplay) tableIdDisplay.textContent = displayId;
        if (cartTableDisplay) cartTableDisplay.textContent = displayId;
        
        // SBLOCCA L'INTERFACCIA
        if (mainContainer) {
            mainContainer.style.pointerEvents = 'auto';
            mainContainer.style.opacity = '1';
        }
        
        // Nasconde il messaggio iniziale
        document.querySelector('.loading-state')?.style.display = 'none';

        // Reset e render del carrello/menu
        cartItems = {};
        renderCart();
        
        const groupedMenu = groupItemsByCategory(menuData);
        renderMenu(groupedMenu); 
    });
}

/**
 * Carica il menu da Firestore e avvia il rendering iniziale.
 */
async function loadMenu() {
    try {
        const snapshot = await menuCollection.orderBy('category').get();
        menuData = snapshot.docs.map(doc => ({
            id: doc.id,
            price: parseFloat(doc.data().price), 
            ...doc.data()
        }));
        
        const groupedMenu = groupItemsByCategory(menuData);
        
        if(navQuickLinks) renderCategoryNavigation(groupedMenu); 
        renderMenu(groupedMenu); 

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        if (mainContainer) mainContainer.innerHTML = `<p style="color: red; padding: 20px;">Impossibile caricare il menu. Controlla la connessione.</p>`;
    }
}

/**
 * Funzione di utilità per raggruppare gli articoli per categoria.
 */
function groupItemsByCategory(items) {
    return items.reduce((acc, item) => {
        const category = item.category || 'Generico';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item);
        return acc;
    }, {});
}

/**
 * Genera i pulsanti di navigazione rapida (Quick Links).
 */
function renderCategoryNavigation(groupedItems) {
    if (!navQuickLinks) return;
    
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
                    top: target.offsetTop - 120, // Offset per l'intestazione fissa
                    behavior: 'smooth'
                });
            } 
        }); 
        
        navQuickLinks.appendChild(button); 
    }); 
}

/**
 * Renderizza il menu completo e aggiunge gli ascoltatori per "Aggiungi al Carrello".
 */
function renderMenu(groupedMenu) {
    if (!mainContainer) return;

    mainContainer.innerHTML = ''; 
    
    Object.keys(groupedMenu).sort().forEach(category => {
        const section = document.createElement('section');
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        section.id = cleanId; 
        section.className = 'menu-category';
        section.innerHTML = `<h2>${category}</h2>`;

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'category-items';

        groupedMenu[category].forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'menu-item-card'; 
            
            itemElement.innerHTML = `
                <div>
                    <strong>${item.name}</strong>
                    <span>€ ${parseFloat(item.price).toFixed(2)}</span>
                </div>
                <button data-id="${item.id}" 
                        data-name="${item.name}" 
                        data-price="${item.price}" 
                        class="add-to-cart-btn">Aggiungi</button>
            `;
            itemsContainer.appendChild(itemElement);
        });

        section.appendChild(itemsContainer);
        mainContainer.appendChild(section);
    });

    // Aggiunge gli ascoltatori per i pulsanti "Aggiungi"
    document.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', handleAddToCart);
    });
}

// --- 5. GESTIONE CARRELLO (CART) ---

/**
 * Aggiunge un articolo al carrello.
 */
function handleAddToCart(event) {
    if (!currentTableId) {
        alert("Seleziona prima un tavolo.");
        return;
    }
    
    const button = event.target;
    const id = button.dataset.id;
    const name = button.dataset.name;
    const price = parseFloat(button.dataset.price);

    if (cartItems[id]) {
        cartItems[id].quantity += 1;
    } else {
        cartItems[id] = { id, name, price, quantity: 1 };
    }
    renderCart();
}

/**
 * Modifica la quantità di un articolo nel carrello.
 */
function updateCartQuantity(id, change) {
    if (cartItems[id]) {
        cartItems[id].quantity += change;
        if (cartItems[id].quantity <= 0) {
            delete cartItems[id]; 
        }
    }
    renderCart();
}

/**
 * Renderizza la lista del carrello e aggiorna il totale.
 */
function renderCart() {
    if (!cartList || !totalPriceSpan) return;
    
    cartList.innerHTML = '';
    let total = 0;
    const cartItemsArray = Object.values(cartItems);

    if (cartItemsArray.length === 0) {
        cartList.innerHTML = '<li>Il carrello è vuoto.</li>';
        if (sendOrderBtn) sendOrderBtn.disabled = true;
    } else {
        cartItemsArray.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;

            const listItem = document.createElement('li');
            listItem.className = 'staff-cart-item'; 
            listItem.innerHTML = `
                ${item.quantity} x ${item.name} 
                (€ ${itemTotal.toFixed(2)})
                <div class="staff-cart-controls">
                    <button class="cart-btn" onclick="updateCartQuantity('${item.id}', 1)">+</button>
                    <button class="cart-btn" onclick="updateCartQuantity('${item.id}', -1)">-</button>
                    <button class="cart-btn cart-remove" onclick="updateCartQuantity('${item.id}', -${item.quantity})">×</button>
                </div>
            `;
            cartList.appendChild(listItem);
        });
        if (sendOrderBtn) sendOrderBtn.disabled = false;
    }

    totalPriceSpan.textContent = total.toFixed(2);
}

/**
 * Invia l'ordine a Firestore.
 */
async function sendOrder(staffUser) {
    if (Object.keys(cartItems).length === 0 || !currentTableId) {
        alert("Carrello vuoto o nessun tavolo selezionato.");
        return;
    }

    if (sendOrderBtn) {
        sendOrderBtn.disabled = true;
        sendOrderBtn.textContent = 'Invio...';
    }

    const total = parseFloat(totalPriceSpan.textContent);
    const orderDetails = Object.values(cartItems).map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price
    }));

    const orderData = {
        tableId: currentTableId,
        staffId: staffUser.uid, 
        staffEmail: staffUser.email,
        items: orderDetails,
        total: total,
        status: 'pending', 
        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
    };

    try {
        await ordersCollection.add(orderData);
        alert(`Ordine inviato con successo per ${currentTableId.replace('TAVOLO_', 'Tavolo ')}!`);
        
        // Reset del carrello dopo l'invio
        cartItems = {};
        renderCart();

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("Errore nell'invio dell'ordine. Controlla la console.");
    } finally {
        if (sendOrderBtn) {
            sendOrderBtn.disabled = false;
            sendOrderBtn.textContent = 'Invia Ordine';
        }
    }
}


// ===============================================
//           INIZIALIZZAZIONE DELL'APP
// ===============================================

/**
 * Avvia l'applicazione Staff Order-Taking DOPO che l'utente è autenticato e il DOM è pronto.
 */
function initializeStaffApp(user) {
    
    // Assegna i riferimenti DOM (sicuro perché viene eseguita dopo DOMContentLoaded)
    window.mainContainer = document.getElementById('menu-container');
    window.cartList = document.getElementById('cart-list');
    window.totalPriceSpan = document.getElementById('total-price');
    window.sendOrderBtn = document.getElementById('send-order-btn');
    window.tableIdDisplay = document.getElementById('table-id');
    window.cartTableDisplay = document.getElementById('cart-table-display');
    window.navQuickLinks = document.getElementById('quick-links');
    window.tableSelect = document.getElementById('table-select'); // Il selettore del tavolo!
    
    if (!mainContainer || !tableSelect) {
        console.error("ERRORE CRITICO: Elementi DOM essenziali mancanti nell'HTML. (Verifica menu-container e table-select).");
        return;
    }

    // 1. Blocca l'interfaccia (fino alla selezione del tavolo)
    mainContainer.style.pointerEvents = 'none';
    mainContainer.style.opacity = '0.5';
    
    // 2. Carica il menu (asincrono)
    loadMenu(); 
    
    // 3. Popola e configura i tavoli
    populateTableSelect(); 

    // 4. Aggiunge i listener globali
    sendOrderBtn?.addEventListener('click', () => sendOrder(user));
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // 5. Stato iniziale del carrello
    renderCart();
}

/**
 * Gestore principale che attende il caricamento della pagina (DOM pronto).
 */
document.addEventListener('DOMContentLoaded', () => {
    // Gestione del login
    if (window.location.pathname.endsWith('staff-login.html')) {
        document.getElementById('login-btn')?.addEventListener('click', handleStaffLogin);
    }
    
    // Gestione dell'app staff
    if (window.location.pathname.endsWith('staff-menu.html')) {
        auth.onAuthStateChanged(user => {
            if (user) {
                initializeStaffApp(user);
            }
            // Il reindirizzamento è gestito da auth.onAuthStateChanged sopra.
        });
    }
});
