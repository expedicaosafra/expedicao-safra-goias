// Ligação do app com o Firebase (plano gratuito Spark).
// Expõe ao app a mesma interface que ele usava no Claude: db.doc/collection, set/update/delete/get/onSnapshot.
// Sincronização incremental: cada coleção guarda no aparelho o que já baixou e só pede ao servidor o que mudou
// depois disso (campo _t). Exclusões viram marcação (_del) para chegarem aos outros aparelhos.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, collection, getDoc, setDoc, updateDoc, onSnapshot, query, where, orderBy, limit,
  serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHPvV7-9LpAfGnn5zrGBiOqFqWt5Oi7Vc",
  authDomain: "expedicao-safra-goias.firebaseapp.com",
  projectId: "expedicao-safra-goias",
  storageBucket: "expedicao-safra-goias.firebasestorage.app",
  messagingSenderId: "1022939297458",
  appId: "1:1022939297458:web:8a2cd798ccbb6d323d7bab",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const fs = getFirestore(app);

// ---- erros no formato que o app entende ----
function erro(e) {
  const c = e?.code || "";
  if (c === "not-found" || c === "permission-denied" || c === "invalid-argument" || c === "failed-precondition") return { code: "invalid_argument", message: e.message };
  if (c === "resource-exhausted") return { code: "quota_exceeded", message: e.message };
  return { code: "unavailable", message: e?.message || String(e) };
}
const limpar = (d) => { const o = { ...d }; delete o._t; delete o._del; return o; };
const tsMs = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : 0);

// ---- cópia local por coleção (IndexedDB), para a sincronização incremental ----
const cache = (() => {
  let p = null;
  const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open("expedicao-sync", 1); r.onupgradeneeded = () => r.result.createObjectStore("c"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => { const t = db.transaction("c", mode); const q = fn(t.objectStore("c")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  return { get: (k) => tx("readonly", (s) => s.get(k)).catch(() => null), set: (k, v) => tx("readwrite", (s) => s.put(v, k)).catch(() => {}), clear: () => tx("readwrite", (s) => s.clear()).catch(() => {}) };
})();

const snapDoc = (id, data, extra = {}) => ({ id, exists: !!data, data: () => data, metadata: { fromCache: false, hasPendingWrites: false }, ...extra });

function docRef(path) {
  const ref = doc(fs, path);
  return {
    id: ref.id, path,
    async get() { try { const s = await getDoc(ref); const d = s.exists() ? s.data() : null; return snapDoc(s.id, d && !d._del ? limpar(d) : undefined); } catch (e) { throw erro(e); } },
    async set(data) { try { await setDoc(ref, { ...data, _t: serverTimestamp() }); } catch (e) { throw erro(e); } },
    async update(data) { try { await updateDoc(ref, { ...data, _t: serverTimestamp() }); } catch (e) { throw erro(e); } },
    async delete() { try { await setDoc(ref, { _del: true, _t: serverTimestamp() }, { merge: true }); } catch (e) { throw erro(e); } },
    onSnapshot(next, fail) {
      return onSnapshot(ref, (s) => { const d = s.exists() ? s.data() : null; next(snapDoc(s.id, d && !d._del ? limpar(d) : undefined)); }, (e) => fail && fail(erro(e)));
    },
  };
}

// consulta comum (usada nas fotos recentes do painel)
function plainQuery(col, parts) {
  return {
    orderBy: (f, dir = "asc") => plainQuery(col, [...parts, orderBy(f, dir)]),
    limit: (n) => plainQuery(col, [...parts, limit(n)]),
    onSnapshot(next, fail) {
      return onSnapshot(query(collection(fs, col), ...parts), (s) => {
        const docs = s.docs.filter((d) => !d.data()._del).map((d) => snapDoc(d.id, limpar(d.data())));
        next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} });
      }, (e) => fail && fail(erro(e)));
    },
  };
}

function collRef(col) {
  return {
    path: col,
    doc: (id) => docRef(col + "/" + id),
    orderBy: (f, dir) => plainQuery(col, [orderBy(f, dir)]),
    limit: (n) => plainQuery(col, [limit(n)]),
    // assinatura incremental: entrega sempre a coleção inteira, baixando só o que mudou
    onSnapshot(next, fail) {
      let vivo = true, unsub = null, mapa = {}, since = 0;
      const chave = (auth.currentUser?.uid || "anon") + ":" + col;
      const emitir = (changes = []) => {
        const docs = Object.entries(mapa).map(([id, d]) => snapDoc(id, d));
        next({ docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: {} });
      };
      (async () => {
        const c = await cache.get(chave);
        if (c && c.mapa) { mapa = c.mapa; since = c.since || 0; }
        if (!vivo) return;
        if (c) emitir();
        let salvarT = null;
        unsub = onSnapshot(query(collection(fs, col), where("_t", ">=", Timestamp.fromMillis(since))), (s) => {
          const changes = [];
          s.docChanges().forEach((ch) => {
            const d = ch.doc.data(), t = tsMs(d._t);
            if (t > since) since = t;
            if (ch.type === "removed") return; // saiu da janela de tempo, não foi excluído
            if (d._del) { if (mapa[ch.doc.id]) { changes.push({ type: "removed", doc: snapDoc(ch.doc.id, mapa[ch.doc.id]) }); delete mapa[ch.doc.id]; } }
            else { const novo = !mapa[ch.doc.id]; mapa[ch.doc.id] = limpar(d); changes.push({ type: novo ? "added" : "modified", doc: snapDoc(ch.doc.id, mapa[ch.doc.id]) }); }
          });
          emitir(changes);
          clearTimeout(salvarT); salvarT = setTimeout(() => cache.set(chave, { mapa, since }), 1500);
        }, (e) => { if (vivo && fail) fail(erro(e)); });
      })();
      return () => { vivo = false; if (unsub) unsub(); };
    },
  };
}

const db = { doc: docRef, collection: collRef };

// ---- usuário, downloads ----
const user = {
  id: async () => auth.currentUser?.uid || null,
  isOwner: async () => false,
  canEdit: async () => false,
  can: async () => true,
};
const downloads = {
  async save({ filename, data }) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv;charset=utf-8" : "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return "saved";
  },
};

// ---- login ----
const fb = {
  db, user, downloads,
  emailAtual: () => (auth.currentUser?.email || "").toLowerCase(),
  onAuth: (cb) => onAuthStateChanged(auth, cb),
  entrar: (email, senha) => signInWithEmailAndPassword(auth, email.trim(), senha),
  criarSenha: (email, senha) => createUserWithEmailAndPassword(auth, email.trim(), senha),
  esqueci: (email) => sendPasswordResetEmail(auth, email.trim()),
  sair: async () => { await signOut(auth); },
  // perfil do usuário (lista feita pelo administrador): usuarios/{email}
  async perfil(email) {
    const s = await Promise.race([getDoc(doc(fs, "usuarios", email.toLowerCase())), new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), 8000))]);
    if (!s.exists()) return { estado: "ausente" };
    const d = s.data(); return d._del || d.ativo === false ? { estado: "inativo" } : { estado: "ok", dados: limpar(d) };
  },
  async criarPerfil(email, data) { await setDoc(doc(fs, "usuarios", email.toLowerCase()), { ...data, _t: serverTimestamp() }); },
  limparCache: () => cache.clear(),
};

window.__fbResolve(fb);
