(() => {
  "use strict";

  const API_BASE = "";
  const HISTORY_KEY = "mindscore-history-v1";

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");
  const historyList = document.getElementById("history-list");
  const recommendationList = document.getElementById("recommendation-list");
  const scoreRecommendationList = document.getElementById("score-recommendation-list");
  const dailyStepSelect = document.getElementById("daily-step-select");
  const dailyStepSaved = document.getElementById("daily-step-saved");
  const dailyStepSavedText = document.getElementById("daily-step-saved-text");
  const dailyStepFeedback = document.getElementById("daily-step-feedback");
  const completeDailyStepButton = document.getElementById("complete-daily-step");
  const DAILY_STEP_KEY = "mindscore-daily-step-v1";
  const defaultDailySteps = [
    { id: "pause", title: "Take a five-minute pause", text: "Step away, breathe slowly, and let your mind rest for a moment." },
    { id: "walk", title: "Get a little fresh air", text: "Take a short walk or sit somewhere outdoors if that feels comfortable." },
    { id: "connect", title: "Reach out to someone", text: "Send a message to a person whose company helps you feel supported." },
  ];
  let dailyStepIdeas = defaultDailySteps;
  let savedDailyStep = readDailyStep();
  const previewFields = [
    "age", "gender", "country", "academic_level", "most_used_platform", "purpose_of_use",
    "avg_daily_usage_hours", "daily_unlocks", "study_hours", "physical_activity_hours",
    "sleep_hours_per_night", "stress_level",
  ];

  const GAUGE_ARC_LENGTH = 314; // approx pi * r(100)

  // ---------------------------------------------------------
  // Draw tick marks on both gauges (0..10, every 2 units)
  // ---------------------------------------------------------
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI; // 180deg -> 0deg
        const x1 = cx + rOuter * Math.cos(angle);
        const y1 = cy - rOuter * Math.sin(angle);
        const x2 = cx + rInner * Math.cos(angle);
        const y2 = cy - rInner * Math.sin(angle);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toFixed(1));
        line.setAttribute("y1", y1.toFixed(1));
        line.setAttribute("x2", x2.toFixed(1));
        line.setAttribute("y2", y2.toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  // ---------------------------------------------------------
  // Segmented control (stress_level) wiring
  // ---------------------------------------------------------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
      updateLivePreview();
    });
  });

  // ---------------------------------------------------------
  // Field-level error helpers
  // ---------------------------------------------------------
  function fieldWrapper(input) {
    return input.closest(".field");
  }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------------------------------------------------------
  // Client-side validation mirroring the StudentData model
  // ---------------------------------------------------------
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max === Infinity ? "0+" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  // ---------------------------------------------------------
  // Gather form data into the exact StudentData shape
  // ---------------------------------------------------------
  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: fd.get("age") === "" ? NaN : parseInt(fd.get("age"), 10),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: fd.get("avg_daily_usage_hours") === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks: fd.get("daily_unlocks") === "" ? NaN : parseInt(fd.get("daily_unlocks"), 10),
      study_hours: fd.get("study_hours") === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours: fd.get("physical_activity_hours") === "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night: fd.get("sleep_hours_per_night") === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level") || "",
    };
  }

  // ---------------------------------------------------------
  // UI state switching
  // ---------------------------------------------------------
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => (el.hidden = true));
    ({ idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name]).hidden = false;
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function bandFor(score) {
    if (score < 4) {
      return {
        label: "Signal: strained",
        context: "Your responses suggest elevated strain right now. Small shifts in sleep or screen time can go a long way.",
      };
    }
    if (score < 7) {
      return {
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    return {
      label: "Signal: strong",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    const { label, context } = bandFor(clamped);

    scoreNumberEl.textContent = score.toFixed(2);
    scoreBandEl.textContent = label;
    scoreContextEl.textContent = context;

    // reset then animate the arc fill on next frame
    gaugeFill.style.transition = "none";
    gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);
    requestAnimationFrame(() => {
      gaugeFill.style.transition = "";
      const offset = GAUGE_ARC_LENGTH * (1 - clamped / 10);
      gaugeFill.style.strokeDashoffset = String(offset);
    });

    showState("result");
  }

  function renderError(label, copy) {
    errorLabelEl.textContent = label;
    errorCopyEl.textContent = copy;
    showState("error");
  }

  function readHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((entry) => Number.isFinite(entry.score) && typeof entry.date === "string") : [];
    } catch {
      return [];
    }
  }

  function saveHistory(score) {
    const history = [{ score, date: new Date().toISOString() }, ...readHistory()].slice(0, 10);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Keep the current result usable when browser storage is unavailable.
    }
    renderHistory();
  }

  function renderHistory() {
    const history = readHistory();
    historyList.replaceChildren();
    if (history.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Your completed check-ins will appear here.";
      historyList.appendChild(empty);
      return;
    }
    history.forEach(({ score, date }) => {
      const row = document.createElement("div");
      row.className = "history-row";
      const timestamp = document.createElement("time");
      timestamp.dateTime = date;
      timestamp.textContent = new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      const value = document.createElement("strong");
      value.textContent = `${score.toFixed(2)} / 10`;
      row.append(timestamp, value);
      historyList.appendChild(row);
    });
  }

  function renderInsights(payload) {
    document.getElementById("insight-sleep").textContent = payload.sleep_hours_per_night.toFixed(1);
    document.getElementById("insight-screen").textContent = payload.avg_daily_usage_hours.toFixed(1);
    document.getElementById("insight-movement").textContent = payload.physical_activity_hours.toFixed(1);
    document.getElementById("insight-summary").textContent =
      `Your check-in reflects ${payload.stress_level.toLowerCase()} perceived stress and ${payload.sleep_hours_per_night.toFixed(1)} hours of sleep on a typical night.`;
  }

  function recommendationsFor(payload, score) {
    const ideas = [];
    if (payload.sleep_hours_per_night < 7) {
      ideas.push({ id: "rest", title: "Make room for rest", text: "Try a steady wind-down time and a screen-free pause before bed." });
    } else {
      ideas.push({ id: "sleep-rhythm", title: "Protect your sleep rhythm", text: "Keep a regular bedtime when you can; consistent rest supports day-to-day well-being." });
    }
    if (payload.stress_level === "High" || payload.stress_level === "Very High") {
      ideas.push({ id: "ease-pressure", title: "Ease one source of pressure", text: "Choose one small task to postpone, and consider talking with someone you trust." });
    } else {
      ideas.push({ id: "mindful-pause", title: "Take a mindful pause", text: "Try a few slow breaths or a quiet five-minute break between study or work tasks." });
    }
    if (payload.avg_daily_usage_hours > 6) {
      ideas.push({ id: "screen-break", title: "Create a screen break", text: "Step away from your phone briefly and give your attention a chance to reset." });
    } else if (payload.physical_activity_hours < 0.5) {
      ideas.push({ id: "gentle-movement", title: "Add gentle movement", text: "A short walk or light stretch can be an easy, low-pressure place to start." });
    } else {
      ideas.push({ id: "enjoyable-movement", title: "Keep movement enjoyable", text: "Continue making space for activity that feels comfortable and realistic for you." });
    }
    if (score < 4) {
      ideas.push({ id: "professional-support", title: "Reach out for support", text: "If things have felt difficult for a while, consider speaking with a qualified professional." });
    }
    return ideas;
  }

  function renderRecommendations(payload, score) {
    const ideas = recommendationsFor(payload, score);
    populateDailyStepChoices(ideas);

    recommendationList.replaceChildren();
    scoreRecommendationList.replaceChildren();
    ideas.forEach((idea) => {
      const item = document.createElement("li");
      item.textContent = `${idea.title}: ${idea.text}`;
      recommendationList.appendChild(item);

      const scoreItem = document.createElement("li");
      const title = document.createElement("strong");
      const description = document.createElement("span");
      title.textContent = idea.title;
      description.textContent = idea.text;
      scoreItem.append(title, description);
      scoreRecommendationList.appendChild(scoreItem);
    });
  }

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function readDailyStep() {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_STEP_KEY) || "null");
      if (saved?.date === localDateKey() && typeof saved.id === "string" && typeof saved.title === "string" && typeof saved.text === "string") {
        return { ...saved, done: saved.done === true };
      }
    } catch {
      return null;
    }
    return null;
  }

  function persistDailyStep() {
    try {
      localStorage.setItem(DAILY_STEP_KEY, JSON.stringify(savedDailyStep));
      dailyStepFeedback.textContent = "Saved on this device for today.";
    } catch {
      dailyStepFeedback.textContent = "Your browser could not save this step.";
    }
    renderDailyStep();
  }

  function populateDailyStepChoices(ideas) {
    dailyStepIdeas = ideas.length > 0 ? ideas : defaultDailySteps;
    dailyStepSelect.replaceChildren();
    dailyStepIdeas.forEach((idea) => {
      const option = document.createElement("option");
      option.value = idea.id;
      option.textContent = idea.title;
      dailyStepSelect.appendChild(option);
    });

    if (savedDailyStep && !dailyStepIdeas.some((idea) => idea.id === savedDailyStep.id)) {
      const savedOption = document.createElement("option");
      savedOption.value = savedDailyStep.id;
      savedOption.textContent = savedDailyStep.title;
      dailyStepSelect.appendChild(savedOption);
    }
    dailyStepSelect.value = savedDailyStep?.id || dailyStepIdeas[0]?.id || "";
    renderDailyStep();
  }

  function renderDailyStep() {
    dailyStepSaved.hidden = !savedDailyStep;
    if (!savedDailyStep) return;

    dailyStepSavedText.textContent = `${savedDailyStep.title}: ${savedDailyStep.text}`;
    completeDailyStepButton.disabled = savedDailyStep.done;
    completeDailyStepButton.textContent = savedDailyStep.done ? "Done for today" : "Mark as done";
    dailyStepSelect.value = savedDailyStep.id;
  }

  function updateLivePreview() {
    const payload = collectPayload();
    const setMetric = (valueId, trackId, value, maximum) => {
      const valueEl = document.getElementById(valueId);
      const trackEl = document.getElementById(trackId);
      const valid = Number.isFinite(value);
      valueEl.textContent = valid ? value.toFixed(1) : "—";
      trackEl.style.width = valid ? `${Math.min(100, Math.max(0, value / maximum * 100))}%` : "0%";
    };

    setMetric("preview-sleep", "sleep-track", payload.sleep_hours_per_night, 10);
    setMetric("preview-screen", "screen-track", payload.avg_daily_usage_hours, 12);
    setMetric("preview-activity", "activity-track", payload.physical_activity_hours, 3);

    const stressLabels = { Low: "Low", Medium: "Moderate", High: "High", "Very High": "Very high" };
    const stressWidths = { Low: 25, Medium: 48, High: 75, "Very High": 100 };
    const stress = payload.stress_level;
    document.getElementById("preview-mood").textContent = stressLabels[stress] || "Not set";
    document.getElementById("stress-track").style.width = `${stressWidths[stress] || 0}%`;

    const formData = new FormData(form);
    const completed = previewFields.filter((name) => String(formData.get(name) || "").trim() !== "").length;
    const percentage = Math.round(completed / previewFields.length * 100);
    document.getElementById("completion-value").textContent = `${percentage}%`;
    document.querySelector(".completion-ring").style.setProperty("--completion", `${percentage * 3.6}deg`);
    document.querySelector(".progress-fill").style.width = `${percentage}%`;
  }

  // ---------------------------------------------------------
  // Parse FastAPI / Pydantic 422 error responses into
  // field-level messages where possible
  // ---------------------------------------------------------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    showState("loading");

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields — details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score);
      saveHistory(data.predicted_mental_health_score);
      renderInsights(payload);
      renderRecommendations(payload, data.predicted_mental_health_score);
    } catch (err) {
      renderError(
        "Can't reach the server",
        "Couldn't connect to the local API. Start the app with `uvicorn main:app --reload` from the project folder and open http://127.0.0.1:8000."
      );
    } finally {
      setSubmitting(false);
    }
  });

  // live-clear errors as the user edits
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => {
      clearFieldError(el);
      updateLivePreview();
    });
    el.addEventListener("change", () => {
      clearFieldError(el);
      updateLivePreview();
    });
  });

  resetBtn.addEventListener("click", () => {
    showState("idle");
  });

  errorRetryBtn.addEventListener("click", () => {
    showState("idle");
  });

  document.getElementById("clear-history-btn").addEventListener("click", () => {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  });

  dailyStepSelect.addEventListener("change", () => {
    dailyStepFeedback.textContent = "";
  });

  document.getElementById("save-daily-step").addEventListener("click", () => {
    const selected = dailyStepIdeas.find((idea) => idea.id === dailyStepSelect.value)
      || (savedDailyStep?.id === dailyStepSelect.value ? savedDailyStep : null);
    if (!selected) return;
    savedDailyStep = { ...selected, date: localDateKey(), done: false };
    persistDailyStep();
  });

  completeDailyStepButton.addEventListener("click", () => {
    if (!savedDailyStep || savedDailyStep.done) return;
    savedDailyStep = { ...savedDailyStep, done: true };
    persistDailyStep();
  });

  renderHistory();
  populateDailyStepChoices(defaultDailySteps);
  updateLivePreview();

  const navLinks = [...document.querySelectorAll(".nav-item")];
  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((item) => item.classList.toggle("active", item === link));
    });
  });
})();
