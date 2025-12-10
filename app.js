type="module"
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
  authDomain: "menu-6630f.firebaseapp.com",
  projectId: "menu-6630f",
  storageBucket: "menu-6630f.firebasestorage.app",
  messagingSenderId: "250958312970",
  appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
};

// 2️⃣ INIZIALIZZA FIREBASE
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 3️⃣ CONTROLLA SE SIAMO SU STAFF O CLIENTE
if (location.pathname.includes("staff.html")) {
  initStaff();
} else {
  initClient();
}

/* ---------------- CLIENT PAGE ---------------- */
function initClient(){
  const params = new URLSearchParams(window.location.search);
  const tableFromUrl = params.get("table") || "Sconosciuto";

  const tableInput = document.createElement("input");
  tableInput.type = "hidden";
  tableInput.id = "table";
  tableInput.value = tableFromUrl;
  document.body.appendChild(tableInput);

  const form = document.createElement("form");
  form.id = "orderForm";
  form.innerHTML = `
    <label>Piatto:<br><input type="text" id="dish" required></label><br><br>
    <label>Quantità:<br><input type="number" id="qty" value="1" min="1" required></label><br><br>
    <button type="submit">Invia ordine</button>
  `;
  document.body.appendChild(form);

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const dish = document.getElementById("dish").value;
    const qty = Number(document.getElementById("qty").value);

    try {
      await addDoc(collection(db, "orders"), {
        table: tableFromUrl,
        dish,
        qty,
        status: "new",
        createdAt: serverTimestamp()
      });
      alert("Ordine inviato ✅");
      form.reset();
    } catch(err){
      alert("Errore invio ❌");
      console.error(err);
    }
  });
}

/* ---------------- STAFF PAGE ---------------- */
function initStaff(){
  const ordersContainer = document.getElementById("ordersContainer");
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  onSnapshot(q, snapshot=>{
    ordersContainer.innerHTML = ""; // pulisce prima
    snapshot.forEach(docSnap=>{
      const data = docSnap.data();
      const id = docSnap.id;

      const div = document.createElement("div");
      div.className = "order";
      div.innerHTML = `
        <strong>Ordine #${id}</strong> - Tavolo: ${data.table}<br>
        Piatto: ${data.dish} x ${data.qty}<br>
        Stato: <span class="status">${data.status}</span><br>
        <button class="btnStatus" data-id="${id}" data-status="preparazione">In preparazione</button>
        <button class="btnStatus" data-id="${id}" data-status="completato">Completato</button>
        <button class="btnStatus" data-id="${id}" data-status="annullato">Annulla</button>
        <hr>
      `;
      ordersContainer.appendChild(div);
    });
    
<div id="ordersContainer"></div>
             
    // Aggiorna lo stato
    document.querySelectorAll(".btnStatus").forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");
        try {
          await updateDoc(doc(db, "orders", id), {status});
        } catch(err){
          alert("Errore aggiornamento stato ❌");
          console.error(err);
        }
      }
    });
  });
}


