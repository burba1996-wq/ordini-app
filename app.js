
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { 
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC0SFan3-K074DG5moeqmu4mUgXtxCmTbg",
  authDomain: "menu-6630f.firebaseapp.com",
  projectId: "menu-6630f",
  storageBucket: "menu-6630f.firebasestorage.app",
  messagingSenderId: "250958312970",
  appId: "1:250958312970:web:9a7929c07e8c4fa352d1f3",
 
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const tableFromUrl = params.get("table");

if (tableFromUrl) {
  document.getElementById("table").value = tableFromUrl;
}
document.getElementById("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const table = document.getElementById("table").value;
  const dish = document.getElementById("dish").value;
  const qty = document.getElementById("qty").value;

  try {
    await addDoc(collection(db, "orders"), {
      table: table,
      dish: dish,
      qty: Number(qty),
      status: "new",
      createdAt: serverTimestamp()
    });

    alert("Ordine inviato correttamente ✅");
    document.getElementById("orderForm").reset();

  } catch (error) {
    alert("ERRORE invio ordine ❌");
    console.error(error);
  }
});


