/* 베릭스 핸드북 서비스 워커
 *
 * 원칙: 상태(state/*.json)와 화면(index.html)은 항상 네트워크를 먼저 본다.
 * 캐시는 신호가 끊겼을 때를 위한 보험일 뿐이다 — 캐시를 먼저 보면 GM이 방금 올린
 * 수치 대신 옛날 화면을 보게 되므로, 이 저장소 용도에는 network-first가 맞다.
 * 대륙 지도처럼 거의 바뀌지 않는 큰 파일만 캐시를 먼저 쓴다.
 */
const VER = "berix-v1";
const SHELL = ["./", "./index.html", "./manifest.json", "./assets/map.jpg",
               "./assets/icons/icon-192.png", "./assets/icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* 거의 바뀌지 않는 정적 자산: 캐시 우선 */
  if (/\.(jpg|png|webp|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VER).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }

  /* 화면과 상태: 네트워크 우선, 실패하면 마지막으로 성공했던 응답 */
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VER).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
  );
});
