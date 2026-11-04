// Faz o app abrir sem internet: guarda os arquivos do app e da biblioteca do Firebase no aparelho.
// Arquivos do app: usa a cópia guardada e atualiza em segundo plano (a versão nova vale na próxima abertura).
const CACHE = "expedicao-v1";
const APP = ["./", "index.html", "firebase.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "placa.webp", "ifag.png", "ifag-branco.png", "topo.webp", "linhas.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  // dados do Firebase (banco e login) não passam pelo cache
  if (/googleapis\.com|firebaseio\.com|identitytoolkit|securetoken/.test(url.host)) return;
  const guardavel = url.origin === location.origin || url.host === "www.gstatic.com" || /fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!guardavel) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const salvo = await c.match(req, { ignoreSearch: url.origin === location.origin });
    const rede = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) c.put(req, r.clone()); return r; }).catch(() => salvo);
    return salvo || rede;
  }));
});
