


};

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

/* ---------------- CONFIG FIREBASE ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
  authDomain: "menu-6630f.firebaseapp.com",
  projectId: "menu-6630f",
  storageBucket: "menu-6630f.firebasestorage.app",
  messagingSenderId: "250958312970",
  appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------------- RICONOSCIMENTO PAGINA ---------------- */
if (location.pathname.includes("staff.html")) {
  initStaff();
} else {
  initClient();
}

/* ---------------- CLIENT PAGE ---------------- */
function initClient() {
  // Legge numero tavolo dal QR
  const params = new URLSearchParams(window.location.search);
  const tableFromUrl = params.get("table") || "Sconosciuto";

  // Campo nascosto per tavolo
  const tableInput = document.createElement("input");
  tableInput.type = "hidden";
  tableInput.id = "table";
  tableInput.value = tableFromUrl;
  document.body.appendChild(tableInput);

  // Form ordine cliente
  const form = document.createElement("form");
  form.id = "orderForm";
  form.innerHTML = `
    <h2>Effettua il tuo ordine</h2>
    <label>Piatto:<br>
      <select id="dish" required>
        <option value="">--Seleziona piatto--</option>
        <option value="Pizza Margherita">Pizza Margherita</option>
        <option value="Pizza Prosciutto">Pizza Prosciutto</option>
        <option value="Pasta al Pomodoro">Pasta al Pomodoro</option>
        <option value="Insalata mista">Insalata mista</option>
        <option value="Bibita">Bibita</option>
      </select>
    </label><br><br>
    <label>Quantità:<br><input type="number" id="qty" value="1" min="1" required></label><br><br>
    <button type="submit">Invia ordine</button>
  `;
  document.body.appendChild(form);

  // Invio ordine
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dish = document.getElementById("dish").value;
    const qty = Number(document.getElementById("qty").value);

    if (!dish) {
      alert("Seleziona un piatto!");
      return;
    }

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
    } catch (err) {
      alert("Errore invio ordine ❌");
      console.error(err);
    }
  });
}

/* ---------------- STAFF PAGE ---------------- */
function initStaff() {
  const ordersContainer = document.getElementById("ordersContainer");
  const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  onSnapshot(q, snapshot => {
    ordersContainer.innerHTML = "";

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;

      // Salta documenti senza dati essenziali
      if (!data.table || !data.dish) return;

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

    // Aggiorna lo stato degli ordini
    document.querySelectorAll(".btnStatus").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");
        try {
          await updateDoc(doc(db, "orders", id), { status });
        } catch (err) {
          alert("Errore aggiornamento stato ❌");
          console.error(err);
        }
      };
    });
  });
}
