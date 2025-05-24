self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Redirige todas las peticiones al ESP32 si estamos en su red
  if (
    url.hostname === "tuusuario.github.io" &&
    navigator.connection.type === "wifi"
  ) {
    const esp32Url = event.request.url.replace(
      "https://tuusuario.github.io",
      "http://192.168.4.1"
    );
    event.respondWith(fetch(esp32Url));
  } else {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => response || fetch(event.request))
    );
  }
});
