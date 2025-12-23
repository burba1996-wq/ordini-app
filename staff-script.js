// =========================================================
// 1. CONFIGURAZIONE & INIZIALIZZAZIONE FIREBASE
// =========================================================

const firebaseConfig = {
    // *** UTILIZZA LE TUE CREDENZIALI QUI ***
    // (Mantengo quelle fornite per coerenza)
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
    storageBucket: "menu-6630f.firebasestorage.app",
    messagingSenderId: "250958312970",
    appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
    measurementId: "G-GTQS2SGNF"
};

// Inizializzazione (Assumendo che gli script Firebase siano caricati prima)
// Rimuovi la linea seguente se initializeApp è già chiamata in index.html o staff-login.html
if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
}

const auth = typeof firebase !== 'undefined' ? firebase.auth() : {
    onAuthStateChanged: () => {},
    signOut: () => Promise.resolve(),
    signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase non caricato"))
};
const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

// Riferimenti Collezioni
const menuCollection = db ? db.collection('menu') : null;
const ordersCollection = db ? db.collection('orders') : null;

// Variabili Globali
let menuData = []; // Cache del menu
let cartItems = {}; // Carrello {uniqueCartItemId: {itemDetails, options, quantity, price}}
let currentTableId = null; // Tavolo selezionato


// =========================================================
// 2. ELEMENTI DOM (Cache)
// =========================================================

const DOM = {
    // Menu & Tavolo
    mainContainer: document.getElementById('menu-container'),
    tableIdDisplay: document.getElementById('table-id'),
    quickLinksNav: document.getElementById('quick-links'),
    
    // Carrello Barra Fissa
    cartFixedBarStaff: document.getElementById('cart-fixed-bar-staff'),
    totalPriceSpanFixed: document.getElementById('total-price-fixed'),
    cartItemCountSpan: document.getElementById('cart-item-count'),
    toggleFullCartBtn: document.getElementById('toggle-full-cart-btn'),
    
    // Carrello Completo (Modal/Sidebar)
    fullCartDetails: document.getElementById('full-cart-details'),
    cartList: document.getElementById('cart-list'),
    totalPriceSpanFull: document.getElementById('total-price-full'),
    cartTableDisplayFull: document.getElementById('cart-table-display-full'),
    closeCartBtn: document.getElementById('close-cart-btn'), // Pulsante mobile/footer
    sendOrderBtn: document.getElementById('send-order-btn'),
    orderNotesInput: document.getElementById('order-notes'),
    // NUOVO: Pulsante di chiusura X per desktop
    closeCartDesktopBtn: document.getElementById('close-cart-desktop-btn') 
};


// =========================================================
// 3. MODELLAZIONE DATI (Per le Opzioni)
// =========================================================

/**
 * Crea un ID univoco per l'articolo del carrello basato su ID e Opzioni selezionate.
 * @param {string} baseId L'ID dell'articolo (es. Birra).
 * @param {Array<string>} selectedOptions Array di stringhe opzione (es. ["media", "fredda"]).
 * @returns {string} ID univoco.
 */
function createUniqueCartId(baseId, selectedOptions = []) {
    // Ordina le opzioni per avere un ID consistente indipendentemente dall'ordine di selezione
    const sortedOptions = selectedOptions.sort().join('|');
    return `${baseId}_${sortedOptions}`;
}

/**
 * Estrae le opzioni selezionate da un contenitore HTML.
 * @param {HTMLElement} itemElement L'elemento genitore del prodotto.
 * @returns {Array<{name: string, price: number}>} Lista di opzioni selezionate.
 */
function getSelectedOptions(itemElement) {
    const selected = [];
    // Cerca tutte le checkbox nella sezione 'item-options-container' che sono selezionate
    const checkboxes = itemElement.querySelectorAll('.item-options-container input[type="checkbox"]:checked');
    
    checkboxes.forEach(checkbox => {
        const optionName = checkbox.dataset.optionName;
        // Prezzo base è sempre 0, per le opzioni si usa data-extra-price (se presente)
        // Usiamo parseFloat con fallback 0 per sicurezza sul tipo di dato.
        const extraPrice = parseFloat(checkbox.dataset.extraPrice || 0); 
        selected.push({
            name: optionName,
            price: extraPrice
        });
    });
    return selected;
}


// =========================================================
// 4. GESTIONE AUTENTICAZIONE
// =========================================================

/**
 * Gestisce il logout dell'utente (lo staff).
 */
function handleLogout() {
    auth.signOut().then(() => {
        console.log("Utente disconnesso con successo.");
        // Reindirizza l'utente alla pagina di login o ricarica
        window.location.href = 'staff-login.html'; 
    }).catch((error) => {
        console.error("Errore durante il logout:", error);
        alert("Errore durante il logout. Riprova.");
    });
}

/**
 * Funzione di esempio per il login (chiamata da staff-login.html)
 */
function handleStaffLogin(event) {
    // Assicurati che questa funzione sia chiamata solo da staff-login.html
    if (event) event.preventDefault(); 
    
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    
    const email = emailInput ? emailInput.value : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        alert("Inserisci email e password.");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            console.log("Login staff riuscito:", userCredential.user.email);
            // Reindirizzamento gestito da onAuthStateChanged
        })
        .catch((error) => {
            console.error("Errore di login:", error.message);
            alert("Errore di login: " + error.message);
        });
}


auth.onAuthStateChanged(user => {
    // Gestione reindirizzamento
    const path = window.location.pathname;
    
    if (path.endsWith('staff-menu.html') && user) {
        // Se autenticato e sulla pagina del menu
        initializeStaffApp(user);
    } else if (path.endsWith('staff-menu.html') && !user) {
        // Se non autenticato e sulla pagina del menu, reindirizza al login
        window.location.href = 'staff-login.html'; 
    } else if (path.endsWith('staff-login.html') && user) {
        // Se autenticato e sulla pagina di login, reindirizza al menu
        window.location.href = 'staff-menu.html';
    }
});


// =========================================================
// 5. GESTIONE TAVOLI E MENU STAFF
// =========================================================

/**
 * Popola il dropdown di selezione tavolo e gestisce il cambio.
 */
function populateTableSelect() {
    const tableSelect = document.getElementById('table-select');
    if (!tableSelect) return;

    // Aggiunge la logica per il cambio tavolo
    tableSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        
        if (!selectedValue) {
            // Logica di blocco/reset
            currentTableId = null;
            DOM.tableIdDisplay.textContent = "NESSUNO";
            if (DOM.cartTableDisplayFull) DOM.cartTableDisplayFull.textContent = "NESSUNO";
            
            // Disabilita l'interazione con il menu
            if (DOM.mainContainer) {
                DOM.mainContainer.style.pointerEvents = 'none';
                DOM.mainContainer.style.opacity = '0.5';
            }
            cartItems = {};
            renderCart();
            return;
        }

        // Logica di sblocco e aggiornamento
        currentTableId = selectedValue;
        DOM.tableIdDisplay.textContent = currentTableId;
        if (DOM.cartTableDisplayFull) DOM.cartTableDisplayFull.textContent = currentTableId; 
        
        if (DOM.mainContainer) {
            DOM.mainContainer.style.pointerEvents = 'auto';
            DOM.mainContainer.style.opacity = '1';
        }
        
        const loadingState = DOM.mainContainer ? DOM.mainContainer.querySelector('.loading-state') : null;
        if (loadingState) loadingState.style.display = 'none'; 
        
        // Resetta il carrello ad ogni cambio tavolo
        cartItems = {};
        if (DOM.orderNotesInput) DOM.orderNotesInput.value = '';
        
        renderCart();
    });

    // Stato Iniziale e Popolamento del selettore
    currentTableId = null; 
    if (DOM.tableIdDisplay) DOM.tableIdDisplay.textContent = "NESSUNO";
    if (DOM.mainContainer) {
        DOM.mainContainer.style.pointerEvents = 'none';
        DOM.mainContainer.style.opacity = '0.5';
    }

    // *** LOGICA POPOLAMENTO TAVOLI (1-40) ***
    tableSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = "";
    defaultOption.textContent = "-- Seleziona Tavolo --";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    tableSelect.appendChild(defaultOption);

    for (let i = 1; i <= 40; i++) { 
        const option = document.createElement('option');
        option.value = `${i}`;
        option.textContent = `${i}`;
        tableSelect.appendChild(option);
    }
}

/**
 * Carica il menu da Firestore.
 */
async function loadMenu() {
    if (!menuCollection || !DOM.mainContainer) return;
    try {
        const snapshot = await menuCollection.get();
        menuData = snapshot.docs.map(doc => ({
            id: doc.id,
            price: parseFloat(doc.data().price || 0), 
            ...doc.data()
        }));
        renderMenu(); 
    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        DOM.mainContainer.innerHTML = `<p style="color: red;">Impossibile caricare il menu. Riprova più tardi.</p>`;
    }
}

/**
 * Renderizza il menu e genera i link di navigazione con la logica per le opzioni.
 */
function renderMenu() {
    if (!DOM.mainContainer || menuData.length === 0 || !DOM.quickLinksNav) return;

    const groupedMenu = menuData.reduce((acc, item) => {
        const category = item.category || 'Generico';
        if (!acc[category]) acc[category] = [];
        acc[category].push(item);
        return acc;
    }, {});

    DOM.mainContainer.innerHTML = '';
    DOM.quickLinksNav.innerHTML = '';
    const categories = Object.keys(groupedMenu).sort();
    
    categories.forEach(category => {
        const section = document.createElement('section');
        section.id = 'cat-' + category.replace(/\s/g, '_');  
        
        // Titolo categoria
        section.innerHTML = `<h2 class="menu-category-title">${category}</h2>`;

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'category-items';

        groupedMenu[category].forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'menu-item-card';
            
            // --- STRUTTURA LATO STAFF IDENTICA A LATO CLIENTE ---
            let itemHtml = `
                <div class="item-info">
                    <h3>${item.name}</h3>
                    <p>€ ${item.price.toFixed(2)}</p>
                </div>
            `;
            
            // --- GENERAZIONE OPZIONI (PILLOLE) ---
            if (item.options && Array.isArray(item.options) && item.options.length > 0) {
                itemHtml += `<div class="item-options-container" data-item-id="${item.id}">`;
                item.options.forEach((option) => {
                    const optionId = `${item.id}-${option.name.replace(/\s/g, '')}`;
                    const optionPrice = parseFloat(option.price) || 0;
                    const priceLabel = optionPrice > 0 ? ` (+€${optionPrice.toFixed(2)})` : '';
                    
                    itemHtml += `
                        <label for="${optionId}" class="option-label">
                            <input type="checkbox" 
                                id="${optionId}" 
                                data-option-name="${option.name}"
                                data-extra-price="${optionPrice}">
                            ${option.name}${priceLabel}
                        </label>
                    `;
                });
                itemHtml += `</div>`;
            } else {
                itemHtml += `<div class="item-options-container"></div>`;
            }

            // Pulsante Aggiungi (si posizionerà a destra grazie al nuovo CSS)
            itemHtml += `
                <button data-id="${item.id}" 
                        data-name="${item.name}" 
                        data-price="${item.price}" 
                        class="add-to-cart-btn">Aggiungi</button>
            `;
            
            itemElement.innerHTML = itemHtml;
            itemsContainer.appendChild(itemElement);
        });

        section.appendChild(itemsContainer);
        DOM.mainContainer.appendChild(section);
    });

    // 3. Aggiunge gli ascoltatori di eventi per l'aggiunta al carrello
    document.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', handleAddToCart);
    });

    // 4. Genera Link Categorie e aggiunge Listener
    categories.forEach(category => {
        const linkBtn = document.createElement('button');
        linkBtn.className = 'category-btn';
        linkBtn.textContent = category;
        linkBtn.setAttribute('data-target-id', 'cat-' + category.replace(/\s/g, '_'));
        linkBtn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target-id');
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 150,
                    behavior: 'smooth'
                });
            }
        });
        DOM.quickLinksNav.appendChild(linkBtn);
    });
    
    // Aggiunge il link rapido per il Carrello
    const cartLinkBtn = document.createElement('button');
    cartLinkBtn.className = 'category-btn cart-link-quick';
    cartLinkBtn.innerHTML = '<i class="fas fa-receipt"></i> Riepilogo Ordine';
    cartLinkBtn.addEventListener('click', () => {
        if (DOM.toggleFullCartBtn) DOM.toggleFullCartBtn.click();
    });
    DOM.quickLinksNav.appendChild(cartLinkBtn);
}


// =========================================================
// 6. GESTIONE CARRELLO E ORDINE (Logica Staff)
// =========================================================

/**
 * Aggiunge un articolo al carrello, inclusa la logica per le opzioni.
 */
function handleAddToCart(event) {
    if (!currentTableId) {
        alert("Per favore, seleziona un tavolo prima di aggiungere articoli.");
        return;
    }
    
    const button = event.target;
    // L'elemento genitore (la card)
    const itemElement = button.closest('.menu-item-card');
    if (!itemElement) return;
    
    // Dati base dell'articolo
    const baseId = button.dataset.id;
    const name = button.dataset.name;
    const basePrice = parseFloat(button.dataset.price || 0); 
    
    // Opzioni selezionate (con eventuali prezzi extra)
    const selectedOptions = getSelectedOptions(itemElement);
    
    // Calcolo prezzo totale articolo (base + opzioni)
    const totalItemPrice = basePrice + selectedOptions.reduce((sum, opt) => sum + opt.price, 0);
    
    // ID univoco del carrello che include le opzioni (solo i nomi per l'ID)
    const uniqueCartId = createUniqueCartId(baseId, selectedOptions.map(opt => opt.name));

    if (cartItems[uniqueCartId]) {
        cartItems[uniqueCartId].quantity += 1;
    } else {
        cartItems[uniqueCartId] = { 
            id: baseId,
            uniqueId: uniqueCartId,
            name: name, 
            price: totalItemPrice, // Prezzo finale calcolato (unitario)
            basePrice: basePrice,
            options: selectedOptions, // Lista delle opzioni selezionate
            quantity: 1 
        };
    }
    renderCart();
}

/**
 * Modifica la quantità di un articolo nel carrello.
 * @param {string} uniqueId ID univoco del carrello.
 * @param {number} change Variazione (+1 o -1).
 */
function updateCartQuantity(uniqueId, change) {
    if (cartItems[uniqueId]) {
        cartItems[uniqueId].quantity += change;
        if (cartItems[uniqueId].quantity <= 0) {
            delete cartItems[uniqueId]; 
        }
    }
    renderCart();
}

// Rende updateCartQuantity disponibile a livello globale per onclick nel renderCart
window.updateCartQuantity = updateCartQuantity;

/**
 * Renderizza la lista del carrello e aggiorna il totale.
 */
function renderCart() {
    if (!DOM.cartList || !DOM.totalPriceSpanFull || !DOM.totalPriceSpanFixed || !DOM.sendOrderBtn || !DOM.cartItemCountSpan) return;
    
    DOM.cartList.innerHTML = '';
    let total = 0;
    let itemCount = 0;
    const cartItemsArray = Object.values(cartItems);

    if (cartItemsArray.length === 0) {
        DOM.cartList.innerHTML = '<li class="empty-cart-message">Il carrello è vuoto.</li>';
        DOM.sendOrderBtn.disabled = true;
        if(DOM.cartFixedBarStaff) DOM.cartFixedBarStaff.classList.add('hidden');
    } else {
        cartItemsArray.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;
            itemCount += item.quantity;

            const listItem = document.createElement('li');
            listItem.className = 'staff-cart-item-compact'; 
            
            // Visualizzazione delle opzioni
            const optionsDisplay = item.options.length > 0 
                ? `<small class="item-options-display">(${item.options.map(opt => opt.name).join(', ')})</small>`
                : '';
            
            listItem.innerHTML = `
                <div class="item-quantity-controls">
                    <button class="cart-btn compact-btn" onclick="updateCartQuantity('${item.uniqueId}', -1)"><i class="fas fa-minus"></i></button>
                    <span class="quantity-display">${item.quantity}</span>
                    <button class="cart-btn compact-btn" onclick="updateCartQuantity('${item.uniqueId}', 1)"><i class="fas fa-plus"></i></button>
                </div>
                
                <span class="item-name-compact">
                    ${item.name}
                    ${optionsDisplay} 
                </span>
                
                <div class="item-price-and-remove">
                    <span class="item-total-price">€ ${itemTotal.toFixed(2)}</span>
                    <button class="cart-btn cart-remove compact-btn" onclick="updateCartQuantity('${item.uniqueId}', -${item.quantity})"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            DOM.cartList.appendChild(listItem);
        });
        DOM.sendOrderBtn.disabled = false;
        if(DOM.cartFixedBarStaff) DOM.cartFixedBarStaff.classList.remove('hidden');
    }

    // Aggiorna tutti gli elementi del totale e del conteggio
    DOM.totalPriceSpanFull.textContent = total.toFixed(2);
    DOM.totalPriceSpanFixed.textContent = total.toFixed(2);
    DOM.cartItemCountSpan.textContent = itemCount;
}

/**
 * Invia l'ordine a Firestore.
 */
async function sendOrder(staffUser) {
    if (Object.keys(cartItems).length === 0 || !currentTableId || !ordersCollection) {
        alert("Carrello vuoto, nessun tavolo selezionato o database non disponibile.");
        return;
    }

    DOM.sendOrderBtn.disabled = true;
    DOM.sendOrderBtn.textContent = 'Invio...';

    const orderNotes = DOM.orderNotesInput ? DOM.orderNotesInput.value.trim() : '';
    // Ricalcola il totale per sicurezza
    const total = Object.values(cartItems).reduce((sum, item) => sum + item.price * item.quantity, 0); 
    
    // Mappa i dati del carrello per l'invio al database
    const orderDetails = Object.values(cartItems).map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price, // Prezzo unitario finale
        total: item.quantity * item.price,
        baseItemId: item.id, // ID originale del menu
        options: item.options // Opzioni selezionate
    }));

    const orderData = {
        tableId: currentTableId,
        staffId: staffUser.uid, 
        staffEmail: staffUser.email,
        items: orderDetails,
        total: total,
        status: 'pending', 
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        notes: orderNotes
    };

    try {
        await ordersCollection.add(orderData);
        alert(`Ordine inviato con successo per il tavolo ${currentTableId}!`);
        
        // Chiudi il carrello a schermo intero (se aperto)
        if (DOM.fullCartDetails) {
            DOM.fullCartDetails.classList.add('hidden-cart');
            document.body.classList.remove('no-scroll');
        }

        // Reset Carrello
        cartItems = {};
        renderCart();
        if (DOM.orderNotesInput) DOM.orderNotesInput.value = ''; 

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("Errore nell'invio dell'ordine. Controlla la console.");
    } finally {
        DOM.sendOrderBtn.disabled = false;
        DOM.sendOrderBtn.textContent = 'Invia Ordine';
    }
}


// =========================================================
// 7. INIZIALIZZAZIONE
// =========================================================

function initializeStaffApp(user) {
    // 1. Carica Menu e Popola Tavoli
    loadMenu(); 
    populateTableSelect(); 

    // 2. Listener Invio Ordine
    if (DOM.sendOrderBtn) DOM.sendOrderBtn.addEventListener('click', () => sendOrder(user));
    
    // 3. Listener Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // 4. Inizializza Render Carrello
    renderCart();

    // 5. Gestione Apertura/Chiusura Carrello Completo (Sidebar/Modal)
    // Inizializza un array per i pulsanti di chiusura
    const closeButtons = [];
    if (DOM.closeCartBtn) closeButtons.push(DOM.closeCartBtn);
    if (DOM.closeCartDesktopBtn) closeButtons.push(DOM.closeCartDesktopBtn); // NUOVO

    if (DOM.toggleFullCartBtn && DOM.fullCartDetails) {
        DOM.toggleFullCartBtn.addEventListener('click', () => {
             // Mostra il carrello completo
            DOM.fullCartDetails.classList.remove('hidden-cart');
            // Blocca lo scroll del body
            document.body.classList.add('no-scroll');
            DOM.fullCartDetails.scrollTop = 0; 
        });

        // Aggiungi lo stesso listener per tutti i pulsanti di chiusura
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Nasconde il carrello completo
                DOM.fullCartDetails.classList.add('hidden-cart');
                // Sblocca lo scroll del body
                document.body.classList.remove('no-scroll');
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Logica di gestione login (solo se sulla pagina di login)
    if (window.location.pathname.endsWith('staff-login.html')) {
        const loginForm = document.getElementById('staff-login-form');
        if (loginForm) {
            // Sostituisce l'event listener sul bottone con uno sul submit del form
            // per gestire anche l'invio con tasto Invio
            loginForm.addEventListener('submit', handleStaffLogin);
        }
    }
});
