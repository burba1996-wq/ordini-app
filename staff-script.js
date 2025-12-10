// --- 1. CONFIGURAZIONE FIREBASE (USA LA TUA) ---
const firebaseConfig = {
    apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
    authDomain: "menu-6630f.firebaseapp.com",
    projectId: "menu-6630f",
    storageBucket: "menu-6630f.firebasestorage.app",
    messagingSenderId: "250958312970",
    appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
    measurementId: "G-GTQS2SGNF"
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

// --- 2. ELEMENTI DOM (Aggiornati per il layout a barra fissa) ---
const mainContainer = document.getElementById('menu-container');
const sendOrderBtn = document.getElementById('send-order-btn');
const tableIdDisplay = document.getElementById('table-id');

// Elementi del Carrello (Carrello Completo - #full-cart-details)
const cartList = document.getElementById('cart-list'); // UL della lista articoli nel riepilogo completo
const totalPriceSpanFull = document.getElementById('total-price-full'); // Totale nel riepilogo completo
const cartTableDisplayFull = document.getElementById('cart-table-display-full'); // Tavolo nel riepilogo completo

// Elementi della Barra Fissa in Fondo (#cart-fixed-bar-staff)
const totalPriceSpanFixed = document.getElementById('total-price-fixed'); // Totale nella barra fissa
const cartItemCountSpan = document.getElementById('cart-item-count'); // Conteggio nella barra fissa
const cartFixedBarStaff = document.getElementById('cart-fixed-bar-staff');

// Nuovi elementi di controllo UI
const fullCartDetails = document.getElementById('full-cart-details');
const toggleFullCartBtn = document.getElementById('toggle-full-cart-btn');
const closeCartBtn = document.getElementById('close-cart-btn');


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
    else if (window.location.pathname.endsWith('staff-menu.html') && user) {
        initializeStaffApp(user);
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


// --- 4. GESTIONE TAVOLI E MENU STAFF ---

/**
 * Popola il dropdown di selezione tavolo.
 * AGGIORNATO: Inizia con l'opzione "Seleziona Tavolo" e blocca l'interfaccia.
 */
function populateTableSelect() {
    const tableSelect = document.getElementById('table-select');
    if (!tableSelect) return;

    // --- 1. AGGIUNGE L'OPZIONE VUOTA INIZIALE ---
    tableSelect.innerHTML = ''; // Pulisce il selettore
    
    const defaultOption = document.createElement('option');
    defaultOption.value = ""; // Valore nullo
    defaultOption.textContent = "-- Seleziona Tavolo --";
    defaultOption.disabled = true; // Non può essere riselezionata
    defaultOption.selected = true; // Selezionata all'inizio
    tableSelect.appendChild(defaultOption);

    // --- 2. POPOLA LE OPZIONI (Tavoli 1-40) ---
    for (let i = 1; i <= 40; i++) { 
        const option = document.createElement('option');
        option.value = `TAVOLO_${i}`;
        option.textContent = `Tavolo ${i}`;
        tableSelect.appendChild(option);
    }

    // --- 3. GESTIONE DELL'EVENTO DI CAMBIO ---
    tableSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        
        if (!selectedValue) {
            // Logica di blocco (Dovrebbe accadere solo se si manipola il DOM)
            currentTableId = null;
            tableIdDisplay.textContent = "NESSUNO";
            if (cartTableDisplayFull) cartTableDisplayFull.textContent = "NESSUNO";
            
            // Blocca il menu e resetta
            mainContainer.style.pointerEvents = 'none';
            mainContainer.style.opacity = '0.5';
            cartItems = {};
            renderCart();
            return;
        }

        // Logica di sblocco
        currentTableId = selectedValue;
        tableIdDisplay.textContent = currentTableId;
        if (cartTableDisplayFull) cartTableDisplayFull.textContent = currentTableId; 
        
        // Sblocca l'interfaccia menu
        mainContainer.style.pointerEvents = 'auto';
        mainContainer.style.opacity = '1';
        
        // Rimuovi il messaggio di stato di caricamento/istruzione
        const loadingState = mainContainer.querySelector('.loading-state');
        if (loadingState) {
             loadingState.style.display = 'none'; 
        }
        
        // Reset carrello (perché stiamo iniziando un nuovo ordine)
        cartItems = {};
        // Se l'input note esiste, lo pulisce anche al cambio tavolo
        const orderNotesInput = document.getElementById('order-notes');
        if (orderNotesInput) orderNotesInput.value = '';
        
        renderCart();
        renderMenu(); 
    });

    // --- 4. STATO INIZIALE AL CARICAMENTO ---
    currentTableId = null; 
    tableIdDisplay.textContent = "NESSUNO";
    // Blocca l'interfaccia all'avvio
    mainContainer.style.pointerEvents = 'none';
    mainContainer.style.opacity = '0.5';
    // NON C'È PIÙ L'EVENTO DI FORZATURA
}

/**
 * Carica il menu da Firestore e lo memorizza.
 */
async function loadMenu() {
    try {
        const snapshot = await menuCollection.get();
        menuData = snapshot.docs.map(doc => ({
            id: doc.id,
            // Assicura che price sia trattato come numero
            price: parseFloat(doc.data().price), 
            ...doc.data()
        }));
        renderMenu(); // Renderizza subito se il tavolo è già selezionato
    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        // Utilizza il riferimento globale esistente (mainContainer)
        if (mainContainer) mainContainer.innerHTML = `<p style="color: red;">Impossibile caricare il menu. Riprova più tardi.</p>`;
    }
}

/**
 * Renderizza l'intero menu in base ai dati memorizzati e genera i link di navigazione.
 * AGGIORNATA per generare i link di navigazione categoria con scroll.
 */
function renderMenu() {
    const quickLinksNav = document.getElementById('quick-links');
    if (!mainContainer || menuData.length === 0 || !quickLinksNav) return;

    // 1. Raggruppa gli elementi per categoria
    const groupedMenu = menuData.reduce((acc, item) => {
        const category = item.category || 'Generico';
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(item);
        return acc;
    }, {});

    // 2. Genera l'HTML del menu
    mainContainer.innerHTML = '';
    const categories = Object.keys(groupedMenu).sort();
    
    categories.forEach(category => {
        const section = document.createElement('section');
        // Aggiunge un ID basato sulla categoria per lo scroll
        section.id = 'cat-' + category.replace(/\s/g, '_'); 
        
        section.innerHTML = `<h2>${category}</h2>`;

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'category-items';

        groupedMenu[category].forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'menu-item';
            
            itemElement.innerHTML = `
                <div>
                    <strong>${item.name}</strong>
                    <span>€ ${item.price.toFixed(2)}</span>
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

    // 3. Aggiunge gli ascoltatori di eventi per l'aggiunta al carrello
    document.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', handleAddToCart);
    });

    // 4. Genera Link Categorie e aggiunge Listener
    quickLinksNav.innerHTML = '';
    categories.forEach(category => {
        const linkBtn = document.createElement('button');
        linkBtn.className = 'category-btn';
        linkBtn.textContent = category;
        linkBtn.setAttribute('data-target-id', 'cat-' + category.replace(/\s/g, '_'));
        
        linkBtn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target-id');
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                // Scorre fino all'elemento con un offset per l'header fisso
                window.scrollTo({
                    top: targetElement.offsetTop - 150, // Offset di 150px per l'header
                    behavior: 'smooth'
                });
            }
        });
        quickLinksNav.appendChild(linkBtn);
    });
    
    // 5. Aggiunge il link rapido per il Carrello alla fine della barra di navigazione
    const cartLinkBtn = document.createElement('button');
    cartLinkBtn.className = 'category-btn cart-link-quick';
    cartLinkBtn.innerHTML = '<i class="fas fa-receipt"></i> Riepilogo Ordine';
    cartLinkBtn.addEventListener('click', () => {
        // Scorre in fondo alla pagina dove si trova il riepilogo completo
        window.scrollTo({
            top: document.body.scrollHeight, 
            behavior: 'smooth'
        });
        // Assicurati che il riepilogo sia visibile se si è su desktop
        if (fullCartDetails) fullCartDetails.classList.remove('hidden-cart');
    });
    quickLinksNav.appendChild(cartLinkBtn);
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
    // Assicura che price sia un float prima dell'uso
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
 * Renderizza la lista del carrello e aggiorna il totale (Aggiornata per la barra fissa).
 */
function renderCart() {
    // Aggiorna riferimenti DOM
    if (!cartList || !totalPriceSpanFull || !totalPriceSpanFixed || !sendOrderBtn || !cartItemCountSpan) return;
    
    cartList.innerHTML = '';
    let total = 0;
    let itemCount = 0;
    const cartItemsArray = Object.values(cartItems);

    if (cartItemsArray.length === 0) {
        cartList.innerHTML = '<li class="empty-cart-message">Il carrello è vuoto.</li>';
        sendOrderBtn.disabled = true;
        if(cartFixedBarStaff) cartFixedBarStaff.classList.add('hidden'); // Nasconde la barra fissa
    } else {
        cartItemsArray.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;
            itemCount += item.quantity;

            const listItem = document.createElement('li');
            listItem.className = 'staff-cart-item-compact'; // Classe per CSS compatto
            
            // Struttura compatta con icone
            listItem.innerHTML = `
                <div class="item-quantity-controls">
                    <button class="cart-btn compact-btn" onclick="updateCartQuantity('${item.id}', -1)"><i class="fas fa-minus"></i></button>
                    <span class="quantity-display">${item.quantity}</span>
                    <button class="cart-btn compact-btn" onclick="updateCartQuantity('${item.id}', 1)"><i class="fas fa-plus"></i></button>
                </div>
                
                <span class="item-name-compact">${item.name}</span>
                
                <div class="item-price-and-remove">
                    <span class="item-total-price">€ ${itemTotal.toFixed(2)}</span>
                    <button class="cart-btn cart-remove compact-btn" onclick="updateCartQuantity('${item.id}', -${item.quantity})"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            cartList.appendChild(listItem);
        });
        sendOrderBtn.disabled = false;
        if(cartFixedBarStaff) cartFixedBarStaff.classList.remove('hidden'); // Mostra la barra fissa
    }

    // Aggiorna tutti gli elementi del totale e del conteggio
    totalPriceSpanFull.textContent = total.toFixed(2);
    totalPriceSpanFixed.textContent = total.toFixed(2);
    cartItemCountSpan.textContent = itemCount;
}

/**
 * Invia l'ordine a Firestore.
 * AGGIORNATO: Include le note dell'ordine.
 */
async function sendOrder(staffUser) {
    // Recupera l'input delle note
    const orderNotesInput = document.getElementById('order-notes');
    
    // Utilizza i riferimenti globali esistenti
    if (Object.keys(cartItems).length === 0 || !currentTableId || !sendOrderBtn || !totalPriceSpanFull) {
        alert("Carrello vuoto o nessun tavolo selezionato.");
        return;
    }

    sendOrderBtn.disabled = true;
    sendOrderBtn.textContent = 'Invio...';

    // 1. Recupera la nota
    const orderNotes = orderNotesInput ? orderNotesInput.value.trim() : '';

    // Usiamo totalPriceSpanFull per il totale
    const total = parseFloat(totalPriceSpanFull.textContent); 
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
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        // 2. AGGIUNGE LA NOTA AI DATI DELL'ORDINE
        notes: orderNotes || '' // Assicura che sia sempre presente, anche se vuota
    };

    try {
        await ordersCollection.add(orderData);
        alert(`Ordine inviato con successo per ${currentTableId}!`);
        
        // Chiudi il carrello a schermo intero dopo l'invio
        fullCartDetails.classList.add('hidden-cart');
        document.body.classList.remove('no-scroll');

        // Reset Carrello
        cartItems = {};
        renderCart();
        // 3. Pulisce il campo note dopo l'invio
        if (orderNotesInput) orderNotesInput.value = ''; 

    } catch (error) {
        console.error("Errore nell'invio dell'ordine: ", error);
        alert("Errore nell'invio dell'ordine. Controlla la console.");
    } finally {
        sendOrderBtn.disabled = false;
        sendOrderBtn.textContent = 'Invia Ordine';
    }
}


// --- 6. INIZIALIZZAZIONE ---

/**
 * Avvia l'applicazione Staff Order-Taking.
 */
function initializeStaffApp(user) {
    // 1. Carica il menu (che ora genera anche i link categoria)
    loadMenu(); 
    
    // 2. Popola i tavoli
    populateTableSelect(); 

    // 3. Aggiunge l'event listener per l'invio ordine
    if (sendOrderBtn) sendOrderBtn.addEventListener('click', () => sendOrder(user));

    // 4. Aggiunge l'event listener per il logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // 5. Stato iniziale del carrello
    renderCart();

    // 6. Gestione Apertura/Chiusura Carrello Completo (Logica adattata per Staff)
    if (toggleFullCartBtn && closeCartBtn && fullCartDetails) {
        // Funzione per mostrare il carrello completo
        toggleFullCartBtn.addEventListener('click', () => {
             // 768px è un breakpoint standard per distinguere desktop/mobile
            if (window.innerWidth <= 768) { 
                // Su mobile: Apre come modal (slide-up)
                fullCartDetails.classList.remove('hidden-cart');
                document.body.classList.add('no-scroll');
            } else {
                // Su desktop: Scorre in fondo alla pagina
                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'smooth'
                });
                // Rimuove la classe 'hidden-cart' per assicurare che sia visibile
                fullCartDetails.classList.remove('hidden-cart');
            }
            fullCartDetails.scrollTop = 0; 
        });

        // Funzione per nascondere il carrello completo (usata principalmente su mobile o dal pulsante)
        closeCartBtn.addEventListener('click', () => {
            fullCartDetails.classList.add('hidden-cart');
            document.body.classList.remove('no-scroll');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Se siamo nella pagina di login, gestiamo il login
    if (window.location.pathname.endsWith('staff-login.html')) {
        document.getElementById('login-btn')?.addEventListener('click', handleStaffLogin);
    }
});
