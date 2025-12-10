// app.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp,
  query, orderBy, onSnapshot, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/* ----------------- CONFIG FIREBASE (SOSTITUISCI QUI) ----------------- */
const firebaseConfig = {
  apiKey: "TUO_apiKey",
  authDomain: "TUO_authDomain",
  projectId: "TUO_projectId",
  // altri campi...
};
/* --------------------------------------------------------------------- */

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ----------------- MENU (modificabile) ----------------- */
const MENU = [
  { id: "m1", name: "Pizza Margherita", price: 7 },
  { id: "m2", name: "Pasta Carbonara", price: 9 },
  { id: "m3", name: "Insalata Mista", price: 5 },
  { id: "m4", name: "Acqua 0.5L", price: 2 }
];
/* -------------------------------------------------------- */

function formatCurrency(e){ return e + "€"; }

/* ------------- RILEVA TIPO PAGINA ------------- */
const path = location.pathname;
if(path.endsWith("staff.html")){
  initStaffPage();
} else {
  initClientPage();
}

/* ------------- CLIENT PAGE ------------- */
function initClientPage(){
  const menuList = document.getElementById("menuList");
  const cartDiv = document.getElementById("cart");
  const tableInput = document.getElementById("table");
  const tableLabel = document.getElementById("tableLabel");
  const statusMsg = document.getElementById("statusMsg");

  // get table from URL ?table=5
  const params = new URLSearchParams(window.location.search);
  const table = params.get("table") || "Sconosciuto";
  tableInput.value = table;
  tableLabel.textContent = `Tavolo: ${table}`;

  // render menu
  MENU.forEach(item=>{
    const node = document.createElement("div");
    node.className = "menu-item";
    node.innerHTML = `<strong>${item.name}</strong><div>${formatCurrency(item.price)}</div>`;
    const btn = document.createElement("button");
    btn.textContent = "Aggiungi";
    btn.addEventListener("click", ()=> addToCart(item));
    node.appendChild(btn);
    menuList.appendChild(node);
  });

  const cart = {}; // id -> qty

  function renderCart(){
    if(Object.keys(cart).length===0){
      cartDiv.innerHTML = "<p>Carrello vuoto</p>";
      return;
    }
    cartDiv.innerHTML = "";
    for(const id of Object.keys(cart)){
      const item = MENU.find(m=>m.id===id);
      const qty = cart[id];
      const div = document.createElement("div");
      div.className = "cart-item";
      div.innerHTML = `<strong>${item.name}</strong> x ${qty} <button class="small" data-id="${id}">-</button> <button class="small" data-id="${id}" data-add>+</button>`;
      cartDiv.appendChild(div);
    }
    // add remove/add handlers
    cartDiv.querySelectorAll("button").forEach(b=>{
      b.addEventListener("click", (ev)=>{
        const id = b.getAttribute("data-id");
        if(b.hasAttribute("data-add")) { cart[id] = (cart[id]||0)+1; }
        else { cart[id] = Math.max(0, (cart[id]||0)-1); if(cart[id]===0) delete cart[id]; }
        renderCart();
      });
    });
  }

  function addToCart(item){
    cart[item.id] = (cart[item.id]||0)+1;
    renderCart();
  }

  // submit order
  document.getElementById("orderForm").addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(Object.keys(cart).length===0){ statusMsg.textContent = "Seleziona almeno un piatto."; return; }
    const customerName = document.getElementById("customerName").value || "";
    const notes = document.getElementById("notes").value || "";
    const orderItems = Object.keys(cart).map(id=>{
      const it = MENU.find(m=>m.id===id);
      return { id: it.id, name: it.name, price: it.price, qty: cart[id] };
    });

    try {
      await addDoc(collection(db, "orders"), {
        table,
        customerName,
        items: orderItems,
        notes,
        status: "new",
        createdAt: serverTimestamp()
      });
      // reset
      for(const k of Object.keys(cart)) delete cart[k];
      renderCart();
      document.getElementById("notes").value = "";
      document.getElementById("customerName").value = "";
      statusMsg.textContent = "Ordine inviato. Grazie!";
    } catch(err){
      console.error(err);
      statusMsg.textContent = "Errore invio ordine.";
    }
  });

  renderCart();

  // register service worker
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(()=>{/*non critico*/});
  }
}

/* ------------- STAFF PAGE ------------- */
function initStaffPage(){
  const ordersDiv = document.getElementById("orders");

  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snapshot)=>{
    ordersDiv.innerHTML = "";
    snapshot.forEach(docSnap=>{
      const data = docSnap.data();
      const id = docSnap.id;
      const el = document.createElement("div");
      el.className = "order";
      const created = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().toLocaleString() : "";
      el.innerHTML = `
        <div><strong>Ordine #${id}</strong> - Tavolo: ${data.table} ${data.customerName ? (" - " + data.customerName) : ""}</div>
        <div>${created}</div>
        <div>${data.items.map(i=>`${i.name} x ${i.qty}`).join("<br>")}</div>
        <div>Note: ${data.notes || "-"}</div>
        <div>
          <button class="status-btn" data-id="${id}" data-status="preparazione">In preparazione</button>
          <button class="status-btn" data-id="${id}" data-status="completato">Completato</button>
          <button class="status-btn" data-id="${id}" data-status="annullato">Annulla</button>
        </div>
        <div class="order-status">Stato: ${data.status || "new"}</div>
      `;
      ordersDiv.appendChild(el);
    });

    // attach handlers (after render)
    ordersDiv.querySelectorAll(".status-btn").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");
        try {
          await updateDoc(doc(db, "orders", id), { status });
        } catch(err){
          console.error(err);
          alert("Errore aggiornamento stato");
        }
      });
    });
  });
}
