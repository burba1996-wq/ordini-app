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

// Variabili globali per l'ordinazione
let menuData = []; // Cache del menu
let cartItems = {}; // Carrello {itemId: {name, price, quantity}}
let currentTableId = null; // Tavolo selezionato dallo staff

// --- 2. ELEMENTI DOM (Comuni a entrambi gli HTML) ---
// Usiamo i controlli DOMContentLoaded per assicurarci che questi esistano
const mainContainer = document.getElementById('menu-container');
const cartList = document.getElementById('cart-list');
const totalPriceSpan = document.getElementById('total-price');
const sendOrderBtn = document.getElementById('send-order-btn');
const tableIdDisplay = document.getElementById('table-id');
const cartTableDisplay = document.getElementById('cart-table-display');
const navQuickLinks = document.getElementById('quick-links');


// --- 3. GESTIONE AUTENTICAZIONE (Solo se su staff-menu.html) ---

/**
 * Reindirizza alla pagina di login se l'utente non è autenticato.
 */
auth.onAuthStateChanged(user => {
    // Se siamo sulla pagina di ordinazione e l'utente non è loggato, reindirizza
    if (window.location.pathname.endsWith('staff-menu.html') && !user) {
        window.location.href = 'staff-login.html';
    }
    // Se siamo sulla pagina di login e l'utente è loggato, reindirizza all'ordinazione
    else if (window.location.pathname.endsWith('staff-login.html') && user) {
        window.location.href = 'staff-menu.html';
    } 
    // Se siamo sulla pagina di ordinazione e l'utente è loggato, avvia l'app
    // NOTA: Qui è dove si avvia la logica principale una volta che l'utente è noto
    else if (window.location.pathname.endsWith('staff-menu.html') && user) {
        // Controlla se gli elementi DOM sono già stati caricati e passali.
        // Se initializeStaffApp è chiamata troppo presto (prima del DOM), fallirà.
        // La logica di avvio è ora spostata sotto la funzione DOMContentLoaded (vedi Sezione 6)
    }
});

/**
 * Funzione di Login (Usata su staff-login.html)
 */
function handleStaffLogin() {
    const emailInput = document.getElementById('staff-email');
    const passwordInput = document.getElementById('staff-password');
    const loginBtn = document.getElementById('login-btn');
    const errorMessage = document.getElementById('error-message');

    if (!emailInput || !passwordInput || !loginBtn) return; // Non siamo sulla pagina di login

    const email = emailInput.value;
    const password = passwordInput.value;
    
    errorMessage.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Accesso...';

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            // Reindirizzamento gestito da onAuthStateChanged
        })
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
 * Funzione di Logout (Usata su staff-menu.html)
 */
function handleLogout() {
    auth.signOut().then(() => {
        // Reindirizzamento gestito da onAuthStateChanged
    }).catch(error => {
        console.error("Errore di Logout: ", error);
        alert("Errore durante il logout. Riprova.");
    });
}


// --- 4. GESTIONE TAVOLI E MENU STAFF (Logica Navigazione Inclusa) ---

/**
 * Popola il dropdown di selezione tavolo.
 */
function populateTableSelect() {
    const tableSelect = document.getElementById('table-select');
    if (!tableSelect) return;

    // Esempio: numeri di tavolo da 1 a 40
    for (let i = 1; i <= 40; i++) {
        const option = document.createElement('option');
        option.value = `TAVOLO_${i}`;
        option.textContent = `${i}`;
        tableSelect.appendChild(option);
    }

    tableSelect.addEventListener('change', (e) => {
        currentTableId = e.target.value;
        tableIdDisplay.textContent = displayId;
        cartTableDisplay.textContent = displayId;
        
        // Sblocca l'interfaccia menu
        mainContainer.style.pointerEvents = 'auto';
        mainContainer.style.opacity = '1';
        // Nasconde il messaggio iniziale
        const initialMessage = mainContainer.querySelector('.loading-state');
        if (initialMessage) initialMessage.style.display = 'none';

        
        // Reset carrello quando si cambia tavolo
        cartItems = {};
        renderCart();
        
        // Ricarica il menu (già caricato, ma meglio per consistenza)
        const groupedMenu = groupItemsByCategory(menuData);
        renderMenu(groupedMenu); 
    });
}

/**
 * Carica il menu da Firestore e lo memorizza.
 */
async function loadMenu() {
    try {
        const snapshot = await menuCollection.orderBy('category').get();
        menuData = snapshot.docs.map(doc => ({
            id: doc.id,
            price: parseFloat(doc.data().price), // Assicurati che il prezzo sia un numero
            ...doc.data()
        }));
        
        // 1. Raggruppa gli elementi per categoria
        const groupedMenu = groupItemsByCategory(menuData);
        
        // 2. Renderizza la navigazione rapida
        renderCategoryNavigation(groupedMenu); 
        
        // 3. Renderizza il menu completo (sarà nascosto finché non si seleziona un tavolo)
        renderMenu(groupedMenu); 

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        mainContainer.innerHTML = `<p style="color: red;">Impossibile caricare il menu. Riprova più tardi.</p>`;
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
 * Genera i pulsanti di navigazione rapida (Quick Links) in base alle categorie.
 */
function renderCategoryNavigation(groupedItems) {
    if (!navQuickLinks) return;
    
    navQuickLinks.innerHTML = '';
    const sortedCategories = Object.keys(groupedItems).sort();

    sortedCategories.forEach(category => {
        // Genera un ID pulito per l'ancoraggio (es. 'category-antipasti')
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.textContent = category;
        
        // COLLEGA L'EVENTO DI SCROLL
        button.addEventListener('click', () => {
            const target = document.getElementById(cleanId);
            if (target) { 
                // Scroll fluido con offset per l'header fisso
                window.scrollTo({
                    top: target.offsetTop - 120, // Offset di sicurezza (compensato dal CSS)
                    behavior: 'smooth'
                });
            } 
        }); 
        
        navQuickLinks.appendChild(button); 
    }); 
}


/**
 * Renderizza l'intero menu in base ai dati memorizzati.
 */
function renderMenu(groupedMenu) {
    if (!mainContainer || Object.keys(groupedMenu).length === 0) return;

    // 2. Genera l'HTML del menu
    mainContainer.innerHTML = ''; // Pulisce il contenitore
    
    Object.keys(groupedMenu).sort().forEach(category => {
        const section = document.createElement('section');
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        section.id = cleanId; // ASSEGNAZIONE ID PER L'ANCORAGGIO
        section.className = 'menu-category';
        section.innerHTML = `<h2>${category}</h2>`;

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'category-items';

        groupedMenu[category].forEach(item => {
            const itemElement = document.createElement('div');
            // Assicurati che l'elemento div per l'articolo abbia la classe corretta
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

    // 3. Aggiunge gli ascoltatori di eventi
    document.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', handleAddToCart);
    });
}

// --- 5. GESTIONE CARRELLO E ORDINE (Logica Staff) ---

/**
 * Aggiunge un articolo al carrello.
 */
function handleAddToCart(event) {
    if (!currentTableId) {
        alert("Per favore, seleziona un tavolo prima di aggiungere articoli.");
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
            delete cartItems[id]; // Rimuove se la quantità scende a zero o meno
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
        staffId: staffUser.uid, // Associa l'ordine allo staff che l'ha preso
        staffEmail: staffUser.email,
        items: orderDetails,
        total: total,
        status: 'pending', 
        timestamp: firebase.firestore.FieldValue.serverTimestamp() 
    };

    try {
        await ordersCollection.add(orderData);
        alert(`Ordine inviato con successo per ${currentTableId}!`);
        
        // Reset Carrello
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


// --- 6. INIZIALIZZAZIONE (LOGICA DI AVVIO REVISIONATA) ---

/**
 * Avvia l'applicazione Staff Order-Taking (chiamata SOLO dopo l'autenticazione).
 */
function initializeStaffApp(user) {
    // 1. Carica il menu, che poi chiama renderCategoryNavigation e renderMenu
    loadMenu(); 
    
    // 2. Popola i tavoli
    populateTableSelect(); 

    // 3. Aggiunge l'event listener per l'invio ordine
    sendOrderBtn?.addEventListener('click', () => sendOrder(user));

    // 4. Aggiunge l'event listener per il logout
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // 5. Stato iniziale del carrello
    renderCart();
}

// Funzione principale che attende il caricamento completo della pagina
document.addEventListener('DOMContentLoaded', () => {
    // Gestione della pagina di LOGIN
    if (window.location.pathname.endsWith('staff-login.html')) {
        document.getElementById('login-btn')?.addEventListener('click', handleStaffLogin);
    }
    
    // Gestione della pagina di ORDINAZIONE STAFF
    if (window.location.pathname.endsWith('staff-menu.html')) {
        
        // 1. Dobbiamo aspettare che l'autenticazione sia risolta
        auth.onAuthStateChanged(user => {
            // Reindirizzamento gestito nella Sezione 3.
            
            // Se l'utente è loggato, avvia l'app DOPO che il DOM è pronto.
            if (user) {
                initializeStaffApp(user);
            }
        });
    }
});
