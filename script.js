document.addEventListener("DOMContentLoaded", async () => {
  // Al inicio del DOMContentLoaded
  let isAppInitialized = false;
  const API_BASE_URL = "/api";

  const currentDatetimeEl = document.getElementById("current-datetime");
  const syncTimeBtn = document.getElementById("sync-time-btn");
  const feedSmallBtn = document.getElementById("feed-small-btn");
  const feedLargeBtn = document.getElementById("feed-large-btn");
  const scheduleFormsContainerEl = document.getElementById(
    "schedule-forms-container"
  );
  const rebootBtn = document.getElementById("reboot-btn");
  const statusMessageInlineEl = document.getElementById(
    "status-message-inline"
  );

  const MAX_SCHEDULES = 4;

  async function checkConnection() {
    const isLocalNetwork = window.location.hostname === "192.168.4.1";
    const apiUrl = isLocalNetwork
      ? "/api/status"
      : "http://192.168.4.1/api/status";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        mode: isLocalNetwork ? "same-origin" : "no-cors",
        cache: "no-store",
      });
      clearTimeout(timeout);

      // Modo no-cors no permite leer response.ok, asumimos éxito si no hay error
      return isLocalNetwork ? response.ok : true;
    } catch (error) {
      console.log(
        "Estado de conexión:",
        error.name === "AbortError" ? "Timeout" : "Error de red",
        error.message
      );
      return false;
    }
  }

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
    showUserFeedback("Error inesperado", "error");
  });

  const isLocalComedero = window.location.hostname === "192.168.4.1";

  async function initApp() {
    if (!isLocalComedero) {
      showUserFeedback(
        "Conéctate al WiFi 'PetFeeder_AP' para controlar el comedero",
        "info"
      );
      // Opcional: Mostrar UI alternativa o instrucciones
      document.getElementById("wifi-alert").style.display = "block";
      return;
    }

    try {
      await fetchCurrentDateTime();
      await fetchFullConfig();
      isAppInitialized = true;
    } catch (error) {
      console.error("Error inicializando app:", error);
      showUserFeedback("Error al conectar con el comedero", "error");
    }
  }

  function formatLocalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }

  function showUserFeedback(message, type = "info") {
    if (type === "success" || type === "error") {
      alert(`${type.toUpperCase()}: ${message}`);
    } else if (type === "processing" || type === "info") {
      statusMessageInlineEl.textContent = message;
      statusMessageInlineEl.className = `status-message-inline info`;
      statusMessageInlineEl.style.display = "block";
    }
  }

  function hideProcessingMessage() {
    statusMessageInlineEl.style.display = "none";
  }

  // Reemplaza tu función apiCall actual con:
  async function apiCall(method, path, body = null, requestBodyCode = null) {
    const baseUrl = isLocalComedero ? "" : "http://192.168.4.1";
    const fullUrl = `${baseUrl}${API_BASE_URL}${path}`;

    const options = {
      method: method,
      headers: { "Content-Type": "application/json" },
      // Solo usar mode 'no-cors' cuando sea externo
      mode: isLocalComedero ? "same-origin" : "no-cors",
    };

    if (body !== null) {
      const requestData = requestBodyCode
        ? { code: requestBodyCode, ...body }
        : body;
      options.body = JSON.stringify(requestData);
    }

    try {
      const response = await fetch(fullUrl, options);

      // En modo 'no-cors' la respuesta es opaca, no podemos leer el status
      if (response.type === "opaque") {
        return { status: "success", message: "Petición enviada" };
      }

      const data = await response.json();
      hideProcessingMessage();

      if (!response.ok || (data.status && data.status === "error")) {
        console.error("API Error:", data);
        showUserFeedback(
          data.message || `Error en la solicitud a ${path}`,
          "error"
        );
        return null;
      }
      return data;
    } catch (error) {
      hideProcessingMessage();
      console.error(`Fetch Error (${path}):`, error);
      showUserFeedback("Error de conexión", "error");
      return null;
    }
  }

  function formatTimeForDisplay(hour, minute) {
    const h = (hour || 0).toString().padStart(2, "0");
    const m = (minute || 0).toString().padStart(2, "0");
    return `${h}:${m}`;
  }

  function parseTimeFromApi(timeStr) {
    if (!timeStr || !timeStr.includes(":")) return { hour: 0, minute: 0 };
    const [hour, minute] = timeStr.split(":").map(Number);
    return { hour, minute };
  }

  let datetimeUpdateInterval;
  let failedAttempts = 0;
  const MAX_FAILED_ATTEMPTS = 3;

  async function fetchCurrentDateTime() {
    // Limpiar intervalo existente
    if (datetimeUpdateInterval) {
      clearInterval(datetimeUpdateInterval);
    }

    const updateClock = async () => {
      try {
        const data = await apiCall("GET", "/datetime");

        if (!data) {
          throw new Error("No se recibieron datos");
        }

        if (data.code === 204 && data.datetime) {
          const date = new Date(data.datetime);
          currentDatetimeEl.textContent = date.toLocaleString("es-ES", {
            dateStyle: "medium",
            timeStyle: "medium",
          });
          failedAttempts = 0; // Resetear contador de fallos
        } else {
          throw new Error("Formato de respuesta inválido");
        }
      } catch (error) {
        failedAttempts++;
        console.error(
          `Error actualizando reloj (intento ${failedAttempts}):`,
          error
        );

        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          clearInterval(datetimeUpdateInterval);
          currentDatetimeEl.textContent = "Dispositivo no disponible";
          showUserFeedback("No se puede conectar con el comedero", "error");
        }
      }
    };

    // Actualizar inmediatamente
    await updateClock();

    // Configurar intervalo (5000ms = 5 segundos)
    datetimeUpdateInterval = setInterval(updateClock, 5000);
  }
  async function fetchFullConfig() {
    const data = await apiCall("GET", "/config");
    if (data && data.code === 203) {
      renderSchedulesList(data.schedules || []);
      populateScheduleForms(data.schedules || []);

      // No actualizar la hora aquí para evitar conflictos
      // El reloj se maneja exclusivamente con fetchCurrentDateTime()
    }
  }

  function renderSchedulesList(schedulesFromApi) {
    for (let i = 1; i <= MAX_SCHEDULES; i++) {
      const scheduleItemEl = document.getElementById(
        `programmed-schedule-${i}`
      );
      if (!scheduleItemEl) continue;

      const timeEl = scheduleItemEl.querySelector(".time");
      const portionSliderEl = scheduleItemEl.querySelector(
        ".portion-slider-display"
      );
      const portionValueEl = scheduleItemEl.querySelector(".portion-value");
      const statusIndicatorEl =
        scheduleItemEl.querySelector(".status-indicator");
      const statusTextEl = scheduleItemEl.querySelector(".status-text");

      const apiSchedule = schedulesFromApi.find((s) => s.id === i);

      if (apiSchedule) {
        timeEl.textContent = apiSchedule.time || "00:00";
        portionSliderEl.value = apiSchedule.portion || 1;
        portionValueEl.textContent = apiSchedule.portion || 1;
        statusIndicatorEl.className = `status-indicator ${
          apiSchedule.enabled ? "enabled" : "disabled"
        }`;
        statusTextEl.textContent = apiSchedule.enabled
          ? "Activado"
          : "Desactivado";
      } else {
        // Resetear a valores por defecto si no viene de la API (o mantener los del HTML inicial)
        timeEl.textContent = "00:00";
        portionSliderEl.value = 1;
        portionValueEl.textContent = 1;
        statusIndicatorEl.className = "status-indicator disabled";
        statusTextEl.textContent = "Desactivado";
      }
    }
  }

  function createScheduleForm(scheduleId, existingScheduleData = null) {
    const form = document.createElement("div");
    form.classList.add("schedule-form");
    form.dataset.scheduleId = scheduleId;

    let defaultHour = 0,
      defaultMinute = 0,
      enabled = 0,
      portion = 1;

    if (existingScheduleData) {
      const timeParts = parseTimeFromApi(existingScheduleData.time);
      defaultHour = timeParts.hour;
      defaultMinute = timeParts.minute;
      enabled = existingScheduleData.enabled;
      portion = existingScheduleData.portion || 1;
    }

    form.innerHTML = `
            <h3>Horario ${scheduleId}</h3>
            <div class="form-group">
                <label for="time-${scheduleId}">Hora:</label>
                <input type="time" id="time-${scheduleId}" value="${formatTimeForDisplay(
      defaultHour,
      defaultMinute
    )}">
            </div>
            <div class="form-group portion-config-container">
                <label for="portion-${scheduleId}">Porción:</label>
                <input type="range" id="portion-${scheduleId}" min="1" max="10" value="${portion}">
                <span class="portion-display" id="portion-val-${scheduleId}">${portion}</span>
            </div>
            <div class="form-group">
                <label class="label-text" for="enabled-${scheduleId}">Estado:</label>
                <div class="switch-container">
                    <span class="label-text">Des.</span>
                    <label class="switch">
                        <input type="checkbox" id="enabled-${scheduleId}" ${
      enabled ? "checked" : ""
    }>
                        <span class="slider"></span>
                    </label>
                    <span class="label-text">Act.</span>
                </div>
            </div>
            <button class="btn btn-secondary save-schedule-btn">Guardar Horario ${scheduleId}</button>
        `;

    const portionSlider = form.querySelector(`#portion-${scheduleId}`);
    const portionValDisplay = form.querySelector(`#portion-val-${scheduleId}`);
    portionSlider.addEventListener("input", () => {
      portionValDisplay.textContent = portionSlider.value;
    });

    form.querySelector(".save-schedule-btn").addEventListener("click", () => {
      handleSaveSchedule(scheduleId);
    });

    return form;
  }

  function populateScheduleForms(schedulesFromApi = []) {
    // Aceptar array vacío para inicialización
    scheduleFormsContainerEl.innerHTML = ""; // Limpiar siempre antes de (re)popular
    for (let i = 1; i <= MAX_SCHEDULES; i++) {
      const existing = schedulesFromApi.find((s) => s.id === i);
      const form = createScheduleForm(i, existing); // existing puede ser undefined
      scheduleFormsContainerEl.appendChild(form);
    }
  }

  syncTimeBtn.addEventListener("click", async () => {
    const now = new Date();
    const localDateTime = formatLocalDateTime(now);

    const data = await apiCall(
      "POST",
      "/datetime",
      {
        datetime: localDateTime,
        timezoneOffset: now.getTimezoneOffset(),
      },
      205
    );

    if (data && data.code === 205) {
      fetchCurrentDateTime();
    }
  });

  feedSmallBtn.addEventListener("click", async () => {
    if (!isAppInitialized) {
      showUserFeedback("Conéctate al WiFi del comedero primero", "error");
      return;
    }
    await apiCall("POST", "/feed/small", {}, 103);
  });

  feedLargeBtn.addEventListener("click", async () => {
    await apiCall("POST", "/feed/large", {}, 104);
  });

  async function handleSaveSchedule(scheduleId) {
    const timeInput = document.getElementById(`time-${scheduleId}`);
    const portionInput = document.getElementById(`portion-${scheduleId}`);
    const enabledInput = document.getElementById(`enabled-${scheduleId}`);

    if (!timeInput || !portionInput || !enabledInput) {
      console.error(`Elementos no encontrados para el horario ${scheduleId}`);
      showUserFeedback(
        `Error interno al guardar horario ${scheduleId}.`,
        "error"
      );
      return;
    }

    const [hourStr, minuteStr] = timeInput.value.split(":");
    const scheduleData = {
      id: parseInt(scheduleId),
      enabled: enabledInput.checked ? 1 : 0,
      hour: parseInt(hourStr),
      minute: parseInt(minuteStr),
      portion: parseInt(portionInput.value),
    };

    const data = await apiCall(
      "POST",
      "/schedule",
      { schedule: scheduleData },
      101
    );
    if (data && data.code === 101 && data.status === "success") {
      fetchFullConfig();
    }
  }

  rebootBtn.addEventListener("click", async () => {
    if (confirm("¿Estás seguro de que quieres reiniciar el comedero?")) {
      await apiCall("POST", "/reboot", {}, 401);
    }
  });

  // InitializeApp mejorada
  async function initializeApp() {
    try {
      await fetchCurrentDateTime();
      await fetchFullConfig();
    } catch (error) {
      console.error("Error inicializando app:", error);
      showUserFeedback("Error al cargar los datos iniciales", "error");
    }
    // Al final de initializeApp
    isAppInitialized = true;
  }

  initApp();

  // Modifica el registro del Service Worker (al final de script.js)
  if (
    "serviceWorker" in navigator &&
    window.location.hostname === "192.168.4.1"
  ) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("SW registrado en ESP32"))
      .catch((err) => console.log("SW error (solo en GitHub):", err));
  }
});
