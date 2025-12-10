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

// Variabili globali di stato
let menuData = []; 
let cartItems = {};
let currentTableId = null; 

// --- 2. Dichiarazioni DOM Globali (Saranno popolate in initializeStaffApp) ---
// Usiamo 'let' in modo che possano essere assegnate dopo DOMContentLoaded.
let mainContainer, cartList, totalPriceSpan, sendOrderBtn, tableIdDisplay, cartTableDisplay, navQuickLinks;


// --- 3. GESTIONE AUTENTICAZIONE ---

/**
 * Reindirizza alla pagina di login se l'utente non è autenticato.
 */
auth.onAuthStateChanged(user => {
    if (window.location.pathname.endsWith('staff-menu.html') && !user) {
        window.location.href = 'staff-login.html';
    }
    else if (window.location.pathname.endsWith('staff-login.html') && user) {
        window.location.href = 'staff-menu.html';
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

    if (!emailInput || !passwordInput || !loginBtn) return; 

    const email = emailInput.value;
    const password = passwordInput.value;
    
    errorMessage.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Accesso...';

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {})
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
    auth.signOut().then(() => {}).catch(error => {
        console.error("Errore di Logout: ", error);
        alert("Errore durante il logout. Riprova.");
    });
}


// --- 4. GESTIONE TAVOLI E MENU STAFF ---

/**
 * Popola il dropdown di selezione tavolo e gestisce l'evento di cambio.
 */
function populateTableSelect(tableSelect) {
    if (!tableSelect) return;

    // Aggiunge l'opzione iniziale "Seleziona..."
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Seleziona Tavolo...';
    defaultOption.disabled = true;
    defaultOption.selected = true; 
    tableSelect.appendChild(defaultOption);
    
    // Tavoli da 1 a 40
    for (let i = 1; i <= 40; i++) {
        const option = document.createElement('option');
        option.value = `TAVOLO_${i}`;
        option.textContent = `${i}`; // Mostra solo il numero
        tableSelect.appendChild(option);
    }

    tableSelect.addEventListener('change', (e) => {
        
        // Se si tenta di selezionare l'opzione vuota
        if (e.target.value === '') {
            currentTableId = null;
            if (tableIdDisplay) tableIdDisplay.textContent = 'Nessuno';
            if (cartTableDisplay) cartTableDisplay.textContent = 'Nessuno';
            
            // Blocca l'interfaccia se la selezione viene annullata/default
            if (mainContainer) {
                 mainContainer.style.pointerEvents = 'none';
                 mainContainer.style.opacity = '0.5';
            }
            return;
        }

        currentTableId = e.target.value;
        
        // ********* CORREZIONE CRITICA DELL'ERRORE "displayId is not defined" *********
        // La variabile deve essere definita all'interno di questo blocco.
        const displayId = currentTableId.replace('TAVOLO_', 'Tavolo ');
        
        // Aggiorna i display
        if (tableIdDisplay) tableIdDisplay.textContent = displayId;
        if (cartTableDisplay) cartTableDisplay.textContent = displayId;
        
        // SBLOCCA L'INTERFACCIA MENU
        if (mainContainer) {
            mainContainer.style.pointerEvents = 'auto';
            mainContainer.style.opacity = '1';
        }
        
        // Nasconde il messaggio iniziale (se presente)
        const initialMessage = document.querySelector('.loading-state'); 
        if (initialMessage) initialMessage.style.display = 'none';

        
        // Reset carrello quando si cambia tavolo
        cartItems = {};
        renderCart();
        
        // Ricarica il menu 
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
            price: parseFloat(doc.data().price), 
            ...doc.data()
        }));
        
        const groupedMenu = groupItemsByCategory(menuData);
        
        if(navQuickLinks) renderCategoryNavigation(groupedMenu); 
        
        renderMenu(groupedMenu); 

    } catch (error) {
        console.error("Errore nel caricamento del menu: ", error);
        if (mainContainer) mainContainer.innerHTML = `<p style="color: red;">Impossibile caricare il menu. Riprova più tardi.</p>`;
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
        const cleanId = `category-${category.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
        
        const button = document.createElement('button');
        button.className = 'category-btn';
        button.textContent = category;
        
        button.addEventListener('click', () => {
            const target = document.getElementById(cleanId);
            if (target) { 
                window.scrollTo({
                    top: target.offsetTop - 120,
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
