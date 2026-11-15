/**
 * ==============================================================================
 * THERMAVEXIA - Thermal Intelligence & Monitoring Platform
 * Client-Side Application Script
 * 
 * Project: Design and Thermal Analysis of a Passive Cooling Mechanism
 *          for Sealed Titanium-Enclosed Electronics in Underwater Applications.
 * 
 * Features:
 *   - Web Serial API Integration (115200 Baud, Line-buffered JSON Parser)
 *   - Real-time Dual-Sensor Telemetry (T1 Internal Core vs T2 External Sink)
 *   - Live Dynamic Dual-Line Chart with Theme Synchronization (Chart.js)
 *   - Scientific Experimental Data Logger & CSV Export
 *   - Configurable Thermal Alarms & Hardware Diagnostics
 *   - Built-in Bench Simulation Mode for Hardware-less Evaluation
 * ==============================================================================
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------------------
  // 1. STATE MANAGEMENT
  // ----------------------------------------------------------------------------
  const State = {
    // Connection
    port: null,
    reader: null,
    isReading: false,
    connectionState: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'error'
    portName: 'USB Serial',
    serialBuffer: '',

    // Telemetry
    t1: null,
    t2: null,
    delta: null,
    t1Min: null,
    t1Max: null,
    t2Min: null,
    t2Max: null,
    deltaMin: null,
    deltaMax: null,
    lastPacketTime: null,
    packetCount: 0,
    errorCount: 0,
    packetRate: 0,
    packetTimes: [],

    // Alerts & Config
    alertThreshold: 60.0, // °C
    systemStatus: 'Waiting for Device',
    systemStatusDetail: 'Connect ESP32 via USB at 115200 baud to begin real-time passive cooling telemetry acquisition.',
    alertLevel: 'idle', // 'idle' | 'normal' | 'warning' | 'critical' | 'error'

    // Data Logger
    isRecording: false,
    recordedData: [],
    recordStartTime: null,
    recordTimerInterval: null,

    // Chart
    chart: null,
    chartWindowSize: 60, // points

    // Simulation
    isSimulating: false,
    simInterval: null,
    simStep: 0,

    // Theme
    theme: 'dark'
  };

  // ----------------------------------------------------------------------------
  // 2. DOM ELEMENT REFERENCES
  // ----------------------------------------------------------------------------
  const DOM = {
    // Theme
    html: document.documentElement,
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    iconSun: document.getElementById('icon-sun'),
    iconMoon: document.getElementById('icon-moon'),

    // Banners
    unsupportedBanner: document.getElementById('unsupported-banner'),
    simulationBanner: document.getElementById('simulation-banner'),
    btnStopSimBanner: document.getElementById('btn-stop-sim-banner'),

    // Header & Serial Connection
    portBadge: document.getElementById('port-info-badge'),
    portNameText: document.getElementById('port-name-text'),
    connectionStatusBadge: document.getElementById('connection-status-badge'),
    connectionStatusText: document.getElementById('connection-status-text'),
    btnConnect: document.getElementById('btn-connect'),
    btnDisconnect: document.getElementById('btn-disconnect'),

    // Measurement Cards
    valT1: document.getElementById('val-t1'),
    minT1: document.getElementById('min-t1'),
    maxT1: document.getElementById('max-t1'),
    statusT1: document.getElementById('status-t1'),

    valT2: document.getElementById('val-t2'),
    minT2: document.getElementById('min-t2'),
    maxT2: document.getElementById('max-t2'),
    statusT2: document.getElementById('status-t2'),

    valDelta: document.getElementById('val-delta'),
    minDelta: document.getElementById('min-delta'),
    maxDelta: document.getElementById('max-delta'),
    gradientStatus: document.getElementById('gradient-status'),

    systemAlertBadge: document.getElementById('system-alert-badge'),
    systemAlertText: document.getElementById('system-alert-text'),
    systemStateTitle: document.getElementById('system-state-title'),
    systemStateDesc: document.getElementById('system-state-desc'),
    lblThresholdValue: document.getElementById('lbl-threshold-value'),
    lblLastPacket: document.getElementById('lbl-last-packet'),
    lblPacketRate: document.getElementById('lbl-packet-rate'),

    // Chart
    chartCanvas: document.getElementById('temperatureChart'),
    chartEmptyOverlay: document.getElementById('chart-empty-overlay'),
    btnChartWindow: document.getElementById('btn-chart-window'),
    windowSizeText: document.getElementById('window-size-text'),
    btnResetChart: document.getElementById('btn-reset-chart'),

    // Data Logger
    loggerStatusText: document.getElementById('logger-status-text'),
    loggerSamplesCount: document.getElementById('logger-samples-count'),
    loggerDurationTime: document.getElementById('logger-duration-time'),
    btnStartRecord: document.getElementById('btn-start-record'),
    btnStopRecord: document.getElementById('btn-stop-record'),
    btnDownloadCsv: document.getElementById('btn-download-csv'),
    btnClearRecords: document.getElementById('btn-clear-records'),
    tableLogBody: document.getElementById('table-log-body'),

    // Diagnostics & Configuration
    inputWarningThreshold: document.getElementById('input-warning-threshold'),
    btnSaveThreshold: document.getElementById('btn-save-threshold'),
    diagSerialSupport: document.getElementById('diag-serial-support'),
    diagPacketCount: document.getElementById('diag-packet-count'),
    diagErrorCount: document.getElementById('diag-error-count'),
    diagLastTimestamp: document.getElementById('diag-last-timestamp'),
    btnToggleSim: document.getElementById('btn-toggle-sim')
  };

  // ----------------------------------------------------------------------------
  // 3. THEME MANAGEMENT
  // ----------------------------------------------------------------------------
  function initTheme() {
    const savedTheme = localStorage.getItem('thermavexia_theme') || 'dark';
    applyTheme(savedTheme);

    DOM.btnThemeToggle.addEventListener('click', () => {
      const newTheme = State.theme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });
  }

  function applyTheme(theme) {
    State.theme = theme;
    DOM.html.setAttribute('data-theme', theme);
    localStorage.setItem('thermavexia_theme', theme);

    if (theme === 'dark') {
      DOM.iconSun.classList.add('hidden');
      DOM.iconMoon.classList.remove('hidden');
    } else {
      DOM.iconMoon.classList.add('hidden');
      DOM.iconSun.classList.remove('hidden');
    }

    // Adapt Chart.js styling if initialized
    updateChartTheme();
  }

  // ----------------------------------------------------------------------------
  // 4. CHART.JS INITIALIZATION & UPDATES
  // ----------------------------------------------------------------------------
  function initChart() {
    if (!DOM.chartCanvas || typeof Chart === 'undefined') return;

    const ctx = DOM.chartCanvas.getContext('2d');
    const isDark = State.theme === 'dark';

    State.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'T1 Inside (°C)',
            data: [],
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.08)',
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 1,
            pointHoverRadius: 5,
            fill: true
          },
          {
            label: 'T2 Outside (°C)',
            data: [],
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.08)',
            borderWidth: 2,
            tension: 0.25,
            pointRadius: 1,
            pointHoverRadius: 5,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300,
          easing: 'easeOutQuad'
        },
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: false // Using custom clean legend
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(17, 26, 44, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#f1f5f9' : '#0f172a',
            bodyColor: isDark ? '#94a3b8' : '#334155',
            borderColor: isDark ? '#2a3c5d' : '#cbd5e1',
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              afterBody: function (items) {
                if (items.length >= 2) {
                  const t1Val = items[0].parsed.y;
                  const t2Val = items[1].parsed.y;
                  const diff = (t1Val - t2Val).toFixed(2);
                  return `ΔT Gradient: ${diff} °C`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
            },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: {
                family: 'monospace',
                size: 11
              },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Temperature (°C)',
              color: isDark ? '#94a3b8' : '#64748b',
              font: { size: 12, weight: 600 }
            },
            grid: {
              color: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'
            },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: {
                family: 'monospace',
                size: 11
              }
            }
          }
        }
      }
    });

    // Window toggle button (30 / 60 / 120 points)
    DOM.btnChartWindow.addEventListener('click', () => {
      if (State.chartWindowSize === 30) {
        State.chartWindowSize = 60;
      } else if (State.chartWindowSize === 60) {
        State.chartWindowSize = 120;
      } else {
        State.chartWindowSize = 30;
      }
      DOM.windowSizeText.textContent = `${State.chartWindowSize} pts`;
      trimChartData();
      State.chart.update('none');
    });

    // Reset chart button
    DOM.btnResetChart.addEventListener('click', () => {
      if (confirm('Clear the current temperature chart history?')) {
        resetChartData();
      }
    });
  }

  function updateChartTheme() {
    if (!State.chart) return;
    const isDark = State.theme === 'dark';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
    const tickColor = isDark ? '#94a3b8' : '#64748b';

    State.chart.options.scales.x.grid.color = gridColor;
    State.chart.options.scales.x.ticks.color = tickColor;
    State.chart.options.scales.y.grid.color = gridColor;
    State.chart.options.scales.y.ticks.color = tickColor;
    State.chart.options.scales.y.title.color = tickColor;

    State.chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(17, 26, 44, 0.95)' : 'rgba(255, 255, 255, 0.95)';
    State.chart.options.plugins.tooltip.titleColor = isDark ? '#f1f5f9' : '#0f172a';
    State.chart.options.plugins.tooltip.bodyColor = isDark ? '#94a3b8' : '#334155';
    State.chart.options.plugins.tooltip.borderColor = isDark ? '#2a3c5d' : '#cbd5e1';

    State.chart.update('none');
  }

  function addChartDataPoint(timeStr, t1, t2) {
    if (!State.chart) return;

    // Hide empty state overlay
    DOM.chartEmptyOverlay.classList.add('hidden');

    State.chart.data.labels.push(timeStr);
    State.chart.data.datasets[0].data.push(t1);
    State.chart.data.datasets[1].data.push(t2);

    trimChartData();
    State.chart.update('none');
  }

  function trimChartData() {
    if (!State.chart) return;
    const max = State.chartWindowSize;
    while (State.chart.data.labels.length > max) {
      State.chart.data.labels.shift();
      State.chart.data.datasets[0].data.shift();
      State.chart.data.datasets[1].data.shift();
    }
  }

  function resetChartData() {
    if (!State.chart) return;
    State.chart.data.labels = [];
    State.chart.data.datasets[0].data = [];
    State.chart.data.datasets[1].data = [];
    State.chart.update();

    if (State.connectionState !== 'connected' && !State.isSimulating) {
      DOM.chartEmptyOverlay.classList.remove('hidden');
    }
  }

  // ----------------------------------------------------------------------------
  // 5. WEB SERIAL API & PROTOCOL HANDLER
  // ----------------------------------------------------------------------------
  function checkWebSerialSupport() {
    const isSupported = 'serial' in navigator;
    if (isSupported) {
      DOM.diagSerialSupport.textContent = 'Supported (Native)';
      DOM.diagSerialSupport.style.color = 'var(--color-success)';
      DOM.unsupportedBanner.classList.add('hidden');
    } else {
      DOM.diagSerialSupport.textContent = 'Unsupported in this browser';
      DOM.diagSerialSupport.style.color = 'var(--color-danger)';
      DOM.unsupportedBanner.classList.remove('hidden');
      DOM.btnConnect.disabled = true;
    }
    return isSupported;
  }

  async function connectESP32() {
    if (!('serial' in navigator)) {
      alert('The Web Serial API is not supported in this browser. Please use Chrome or Edge desktop over HTTPS.');
      return;
    }

    if (State.isSimulating) {
      stopSimulation();
    }

    try {
      updateConnectionStatus('connecting', 'Requesting Port...');

      // Prompt user to select ESP32 COM port
      State.port = await navigator.serial.requestPort();

      // Open port at 115200 baud (ESP32 standard)
      await State.port.open({ baudRate: 115200 });

      // Retrieve port metadata if available
      const info = State.port.getInfo();
      if (info && (info.usbVendorId || info.usbProductId)) {
        State.portName = `USB VID:0x${info.usbVendorId.toString(16).padStart(4, '0')} PID:0x${info.usbProductId.toString(16).padStart(4, '0')}`;
      } else {
        State.portName = 'ESP32 COM Port';
      }

      DOM.portNameText.textContent = State.portName;
      DOM.portBadge.classList.remove('hidden');

      updateConnectionStatus('connected', 'Connected');
      resetStats();

      // Listen for unexpected hardware detachment
      navigator.serial.addEventListener('disconnect', onDeviceDisconnected);

      // Start asynchronous read loop
      readSerialStream();

    } catch (err) {
      console.error('ESP32 Connection Error:', err);
      if (err.name === 'NotFoundError') {
        // User canceled port selection prompt
        updateConnectionStatus('disconnected', 'Disconnected');
      } else {
        updateConnectionStatus('error', 'Connection Error');
        alert(`Failed to open serial port: ${err.message}`);
      }
    }
  }

  async function disconnectESP32() {
    State.isReading = false;

    if (State.reader) {
      try {
        await State.reader.cancel();
      } catch (e) {
        console.warn('Error canceling serial reader:', e);
      }
    }

    if (State.port) {
      try {
        await State.port.close();
      } catch (e) {
        console.warn('Error closing serial port:', e);
      }
      State.port = null;
    }

    updateConnectionStatus('disconnected', 'Disconnected');
    DOM.portBadge.classList.add('hidden');
    navigator.serial.removeEventListener('disconnect', onDeviceDisconnected);

    // Stop recording if active
    if (State.isRecording) {
      stopRecording();
    }

    // Set UI to disconnected placeholders
    resetToPlaceholders();
  }

  function onDeviceDisconnected(event) {
    console.warn('Physical USB device disconnected:', event);
    alert('ESP32 USB cable was disconnected.');
    disconnectESP32();
  }

  async function readSerialStream() {
    State.isReading = true;
    State.serialBuffer = '';
    const textDecoder = new TextDecoder();

    try {
      State.reader = State.port.readable.getReader();

      while (State.isReading) {
        const { value, done } = await State.reader.read();
        if (done) break;

        if (value) {
          const chunk = textDecoder.decode(value, { stream: true });
          State.serialBuffer += chunk;

          // Process full lines terminated by newline (\n)
          let newlineIndex;
          while ((newlineIndex = State.serialBuffer.indexOf('\n')) !== -1) {
            const rawLine = State.serialBuffer.substring(0, newlineIndex).trim();
            State.serialBuffer = State.serialBuffer.substring(newlineIndex + 1);

            if (rawLine.length > 0) {
              processTelemetryLine(rawLine);
            }
          }
        }
      }
    } catch (err) {
      if (State.isReading) {
        console.error('Serial stream read error:', err);
        updateConnectionStatus('error', 'Stream Read Error');
      }
    } finally {
      if (State.reader) {
        try {
          State.reader.releaseLock();
        } catch (e) {
          console.warn('Error releasing reader lock:', e);
        }
        State.reader = null;
      }
    }
  }

  // ----------------------------------------------------------------------------
  // 6. TELEMETRY PARSING & VALIDATION
  // ----------------------------------------------------------------------------
  function processTelemetryLine(line) {
    // Increment total packet counter
    State.packetCount++;
    DOM.diagPacketCount.textContent = State.packetCount;

    // Track packet arrival time and calculate reception rate
    const now = new Date();
    State.lastPacketTime = now;
    const timeStr = now.toLocaleTimeString();
    DOM.lblLastPacket.textContent = timeStr;
    DOM.diagLastTimestamp.textContent = now.toISOString();

    trackPacketRate(now);

    let parsed = null;

    // 1. Try parsing structured JSON: {"t1":65.20,"t2":38.40,"delta":26.80}
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        console.warn('JSON parsing failed for line:', line);
        State.errorCount++;
        DOM.diagErrorCount.textContent = State.errorCount;
        return;
      }
    } else {
      // 2. Fallback regex parser in case legacy firmware output is sent:
      // "T1 = 65.20 C | T2 = 38.40 C | T1-T2 = 26.80 C"
      const match = line.match(/T1\s*=\s*([-\d.]+).*?T2\s*=\s*([-\d.]+).*?T1-T2\s*=\s*([-\d.]+)/i);
      if (match) {
        parsed = {
          t1: parseFloat(match[1]),
          t2: parseFloat(match[2]),
          delta: parseFloat(match[3])
        };
      } else if (line.toLowerCase().includes('error')) {
        handleSensorErrorState(line);
        return;
      } else {
        // Line does not contain recognizable telemetry
        return;
      }
    }

    // Handle sensor read failure flag from firmware
    if (parsed.error) {
      handleSensorErrorState(parsed.error);
      return;
    }

    // Extract values
    const t1 = parseFloat(parsed.t1);
    const t2 = parseFloat(parsed.t2);
    const delta = parseFloat(parsed.delta !== undefined ? parsed.delta : (t1 - t2));

    // Validate sensor reading bounds (-55°C to 125°C for DS18B20)
    const validT1 = !isNaN(t1) && t1 >= -55 && t1 <= 125;
    const validT2 = !isNaN(t2) && t2 >= -55 && t2 <= 125;

    if (!validT1 || !validT2) {
      handleSensorErrorState('Invalid DS18B20 Reading');
      return;
    }

    // Valid readings - update state and UI
    applyValidTelemetry(t1, t2, delta, timeStr);
  }

  function applyValidTelemetry(t1, t2, delta, timeStr) {
    State.t1 = t1;
    State.t2 = t2;
    State.delta = delta;

    // Update min / max records
    if (State.t1Min === null || t1 < State.t1Min) State.t1Min = t1;
    if (State.t1Max === null || t1 > State.t1Max) State.t1Max = t1;
    if (State.t2Min === null || t2 < State.t2Min) State.t2Min = t2;
    if (State.t2Max === null || t2 > State.t2Max) State.t2Max = t2;
    if (State.deltaMin === null || delta < State.deltaMin) State.deltaMin = delta;
    if (State.deltaMax === null || delta > State.deltaMax) State.deltaMax = delta;

    // Update UI Cards
    DOM.valT1.textContent = t1.toFixed(2);
    DOM.valT1.classList.remove('placeholder-val');
    DOM.minT1.textContent = State.t1Min.toFixed(2);
    DOM.maxT1.textContent = State.t1Max.toFixed(2);
    setSensorChip(DOM.statusT1, 'online', 'Online');

    DOM.valT2.textContent = t2.toFixed(2);
    DOM.valT2.classList.remove('placeholder-val');
    DOM.minT2.textContent = State.t2Min.toFixed(2);
    DOM.maxT2.textContent = State.t2Max.toFixed(2);
    setSensorChip(DOM.statusT2, 'online', 'Online');

    DOM.valDelta.textContent = delta.toFixed(2);
    DOM.valDelta.classList.remove('placeholder-val');
    DOM.minDelta.textContent = State.deltaMin.toFixed(2);
    DOM.maxDelta.textContent = State.deltaMax.toFixed(2);

    // Gradient interpretation
    if (delta > 0.5) {
      DOM.gradientStatus.textContent = 'Dissipating (T1 > T2)';
      DOM.gradientStatus.style.color = 'var(--color-success)';
    } else if (delta < -0.5) {
      DOM.gradientStatus.textContent = 'Inverted (T2 > T1)';
      DOM.gradientStatus.style.color = 'var(--color-warning)';
    } else {
      DOM.gradientStatus.textContent = 'Equilibrium';
      DOM.gradientStatus.style.color = 'var(--text-secondary)';
    }

    // Evaluate Alarm Threshold
    evaluateThermalAlert(t1);

    // Push to Chart
    addChartDataPoint(timeStr, t1, t2);

    // Record sample if logger is active
    if (State.isRecording) {
      recordSample(new Date(), t1, t2, delta, State.alertLevel);
    }
  }

  function handleSensorErrorState(reason) {
    setSensorChip(DOM.statusT1, 'error', 'Error');
    setSensorChip(DOM.statusT2, 'error', 'Error');

    updateSystemState(
      'Sensor Error',
      `Telemetry communication error: ${reason}. Check DS18B20 wiring on GPIO 4.`,
      'error'
    );
  }

  function evaluateThermalAlert(t1) {
    if (t1 >= State.alertThreshold + 10) {
      updateSystemState(
        'Critical Alert',
        `Inside Core Temperature (${t1.toFixed(1)}°C) critically exceeds threshold (${State.alertThreshold}°C)!`,
        'critical'
      );
    } else if (t1 >= State.alertThreshold) {
      updateSystemState(
        'Warning',
        `Inside Core Temperature (${t1.toFixed(1)}°C) reached warning threshold (${State.alertThreshold}°C).`,
        'warning'
      );
    } else {
      updateSystemState(
        'Monitoring',
        'Passive cooling telemetry stream active. All thermal metrics operating within normal thresholds.',
        'normal'
      );
    }
  }

  function updateSystemState(title, detail, level) {
    State.systemStatus = title;
    State.systemStatusDetail = detail;
    State.alertLevel = level;

    DOM.systemStateTitle.textContent = title;
    DOM.systemStateDesc.textContent = detail;

    // Update Card 4 Alert Badge
    DOM.systemAlertBadge.className = `alert-indicator alert-${level}`;
    DOM.systemAlertText.textContent = level.toUpperCase();
  }

  function setSensorChip(element, state, text) {
    element.className = `sensor-chip chip-${state}`;
    element.querySelector('.chip-text').textContent = text;
  }

  function trackPacketRate(now) {
    State.packetTimes.push(now.getTime());
    // Keep timestamps from the last 5 seconds
    const cutoff = now.getTime() - 5000;
    State.packetTimes = State.packetTimes.filter(t => t > cutoff);

    if (State.packetTimes.length > 1) {
      const durationSec = (now.getTime() - State.packetTimes[0]) / 1000;
      if (durationSec > 0) {
        State.packetRate = (State.packetTimes.length / durationSec).toFixed(1);
        DOM.lblPacketRate.textContent = `${State.packetRate} Hz`;
      }
    }
  }

  function updateConnectionStatus(state, label) {
    State.connectionState = state;
    DOM.connectionStatusBadge.className = `status-badge state-${state}`;
    DOM.connectionStatusText.textContent = label;

    if (state === 'connected') {
      DOM.btnConnect.classList.add('hidden');
      DOM.btnDisconnect.classList.remove('hidden');
    } else {
      DOM.btnConnect.classList.remove('hidden');
      DOM.btnDisconnect.classList.add('hidden');
    }
  }

  function resetStats() {
    State.t1Min = null;
    State.t1Max = null;
    State.t2Min = null;
    State.t2Max = null;
    State.deltaMin = null;
    State.deltaMax = null;
    State.packetCount = 0;
    State.errorCount = 0;
    State.packetTimes = [];
    DOM.diagPacketCount.textContent = '0';
    DOM.diagErrorCount.textContent = '0';
  }

  function resetToPlaceholders() {
    DOM.valT1.textContent = '--.--';
    DOM.valT1.classList.add('placeholder-val');
    DOM.minT1.textContent = '--';
    DOM.maxT1.textContent = '--';
    setSensorChip(DOM.statusT1, 'offline', 'Offline');

    DOM.valT2.textContent = '--.--';
    DOM.valT2.classList.add('placeholder-val');
    DOM.minT2.textContent = '--';
    DOM.maxT2.textContent = '--';
    setSensorChip(DOM.statusT2, 'offline', 'Offline');

    DOM.valDelta.textContent = '--.--';
    DOM.valDelta.classList.add('placeholder-val');
    DOM.minDelta.textContent = '--';
    DOM.maxDelta.textContent = '--';
    DOM.gradientStatus.textContent = 'Neutral';
    DOM.gradientStatus.style.color = 'var(--text-secondary)';

    DOM.lblLastPacket.textContent = '--:--:--';
    DOM.lblPacketRate.textContent = '0.0 Hz';

    updateSystemState(
      'Waiting for Device',
      'Connect ESP32 via USB at 115200 baud to begin real-time passive cooling telemetry acquisition.',
      'idle'
    );

    DOM.chartEmptyOverlay.classList.remove('hidden');
  }

  // ----------------------------------------------------------------------------
  // 7. DATA LOGGER & CSV EXPORT
  // ----------------------------------------------------------------------------
  function initLogger() {
    DOM.btnStartRecord.addEventListener('click', startRecording);
    DOM.btnStopRecord.addEventListener('click', stopRecording);
    DOM.btnDownloadCsv.addEventListener('click', downloadCsv);
    DOM.btnClearRecords.addEventListener('click', clearRecords);
  }

  function startRecording() {
    if (State.connectionState !== 'connected' && !State.isSimulating) {
      alert('Please connect the ESP32 (or enable Simulation Mode) before starting a recording session.');
      return;
    }

    State.isRecording = true;
    State.recordStartTime = new Date();

    DOM.loggerStatusText.textContent = 'RECORDING';
    DOM.loggerStatusText.className = 'box-value value-recording';

    DOM.btnStartRecord.disabled = true;
    DOM.btnStopRecord.disabled = false;
    DOM.btnDownloadCsv.disabled = State.recordedData.length === 0;
    DOM.btnClearRecords.disabled = true;

    // Start session timer
    State.recordTimerInterval = setInterval(updateRecordDuration, 1000);
  }

  function stopRecording() {
    State.isRecording = false;

    DOM.loggerStatusText.textContent = 'STOPPED';
    DOM.loggerStatusText.className = 'box-value value-idle';

    DOM.btnStartRecord.disabled = false;
    DOM.btnStopRecord.disabled = true;
    DOM.btnDownloadCsv.disabled = State.recordedData.length === 0;
    DOM.btnClearRecords.disabled = State.recordedData.length === 0;

    if (State.recordTimerInterval) {
      clearInterval(State.recordTimerInterval);
      State.recordTimerInterval = null;
    }
  }

  function updateRecordDuration() {
    if (!State.recordStartTime) return;
    const diff = Math.floor((new Date() - State.recordStartTime) / 1000);
    const hrs = String(Math.floor(diff / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const secs = String(diff % 60).padStart(2, '0');
    DOM.loggerDurationTime.textContent = `${hrs}:${mins}:${secs}`;
  }

  function recordSample(dateObj, t1, t2, delta, alertStatus) {
    const sample = {
      index: State.recordedData.length + 1,
      isoTimestamp: dateObj.toISOString(),
      localTime: dateObj.toLocaleTimeString(),
      t1: t1.toFixed(2),
      t2: t2.toFixed(2),
      delta: delta.toFixed(2),
      status: alertStatus.toUpperCase()
    };

    State.recordedData.push(sample);

    // Update samples counter badge
    DOM.loggerSamplesCount.textContent = State.recordedData.length;
    DOM.btnDownloadCsv.disabled = false;
    DOM.btnClearRecords.disabled = false;

    // Render sample in recent table
    appendSampleToTable(sample);
  }

  function appendSampleToTable(sample) {
    const emptyRow = DOM.tableLogBody.querySelector('.empty-table-row');
    if (emptyRow) {
      emptyRow.remove();
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${sample.index}</td>
      <td>${sample.localTime}</td>
      <td style="color:var(--color-t1); font-weight:600;">${sample.t1}</td>
      <td style="color:var(--color-t2); font-weight:600;">${sample.t2}</td>
      <td style="color:var(--color-delta); font-weight:600;">${sample.delta}</td>
      <td>${sample.status}</td>
    `;

    // Insert at top of table preview
    DOM.tableLogBody.insertBefore(row, DOM.tableLogBody.firstChild);

    // Keep preview trimmed to last 25 entries in DOM for performance
    while (DOM.tableLogBody.children.length > 25) {
      DOM.tableLogBody.removeChild(DOM.tableLogBody.lastChild);
    }
  }

  function downloadCsv() {
    if (State.recordedData.length === 0) {
      alert('No recorded telemetry data available to export.');
      return;
    }

    // CSV Header row
    let csvContent = 'Sample_Index,ISO_Timestamp,Local_Time,T1_Inside_Core_C,T2_Outside_Rod_C,Delta_T_C,Alarm_State\r\n';

    // CSV Data rows
    State.recordedData.forEach(row => {
      csvContent += `${row.index},"${row.isoTimestamp}","${row.localTime}",${row.t1},${row.t2},${row.delta},"${row.status}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute('href', url);
    link.setAttribute('download', `thermavexia_telemetry_${timestampStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function clearRecords() {
    if (confirm('Discard all recorded data samples in the current session?')) {
      State.recordedData = [];
      DOM.loggerSamplesCount.textContent = '0';
      DOM.loggerDurationTime.textContent = '00:00:00';
      DOM.btnDownloadCsv.disabled = true;
      DOM.btnClearRecords.disabled = true;
      DOM.tableLogBody.innerHTML = `
        <tr class="empty-table-row">
          <td colspan="6">No samples recorded in current session. Click "Start Recording" to log live telemetry.</td>
        </tr>
      `;
    }
  }

  // ----------------------------------------------------------------------------
  // 8. CONFIGURATION & ALARM THRESHOLD
  // ----------------------------------------------------------------------------
  function initConfig() {
    const savedThreshold = localStorage.getItem('thermavexia_threshold');
    if (savedThreshold) {
      State.alertThreshold = parseFloat(savedThreshold);
      DOM.inputWarningThreshold.value = State.alertThreshold;
      DOM.lblThresholdValue.textContent = `${State.alertThreshold.toFixed(1)} °C`;
    }

    DOM.btnSaveThreshold.addEventListener('click', () => {
      const val = parseFloat(DOM.inputWarningThreshold.value);
      if (!isNaN(val) && val >= 30 && val <= 110) {
        State.alertThreshold = val;
        localStorage.setItem('thermavexia_threshold', val);
        DOM.lblThresholdValue.textContent = `${val.toFixed(1)} °C`;
        alert(`Warning threshold successfully set to ${val.toFixed(1)} °C.`);
        if (State.t1 !== null) {
          evaluateThermalAlert(State.t1);
        }
      } else {
        alert('Please enter a valid temperature threshold between 30°C and 110°C.');
      }
    });
  }

  // ----------------------------------------------------------------------------
  // 9. OFFLINE BENCH SIMULATION (HARDWARE-LESS VERIFICATION)
  // ----------------------------------------------------------------------------
  function initSimulation() {
    DOM.btnToggleSim.addEventListener('click', toggleSimulation);
    DOM.btnStopSimBanner.addEventListener('click', stopSimulation);
  }

  function toggleSimulation() {
    if (State.isSimulating) {
      stopSimulation();
    } else {
      startSimulation();
    }
  }

  function startSimulation() {
    if (State.connectionState === 'connected') {
      if (!confirm('ESP32 is currently connected. Disconnect hardware to start simulation?')) {
        return;
      }
      disconnectESP32();
    }

    State.isSimulating = true;
    State.simStep = 0;
    resetStats();

    DOM.simulationBanner.classList.remove('hidden');
    DOM.btnToggleSim.innerHTML = `
      <svg class="btn-icon-sm" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
      <span>Stop Offline Simulation</span>
    `;

    updateConnectionStatus('connected', 'Simulated Link');
    DOM.portNameText.textContent = 'Hardware Offline Simulator';
    DOM.portBadge.classList.remove('hidden');

    // Simulate 1 Hz telemetry loop
    State.simInterval = setInterval(runSimulationTick, 1000);
  }

  function stopSimulation() {
    State.isSimulating = false;
    if (State.simInterval) {
      clearInterval(State.simInterval);
      State.simInterval = null;
    }

    DOM.simulationBanner.classList.add('hidden');
    DOM.btnToggleSim.innerHTML = `
      <svg class="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <span>Enable Offline Simulation</span>
    `;

    DOM.portBadge.classList.add('hidden');
    updateConnectionStatus('disconnected', 'Disconnected');

    if (State.isRecording) {
      stopRecording();
    }

    resetToPlaceholders();
  }

  function runSimulationTick() {
    State.simStep++;

    // Generate realistic thermal heating and passive cooling curve:
    // Core (T1) slowly climbs from 28°C towards 65°C under simulated heat dissipation load.
    // Copper rod (T2) tracks behind T1 due to thermal conduction through the copper heat path.
    const heatLoad = Math.sin(State.simStep * 0.05) * 15;
    const t1Base = 45 + heatLoad + (Math.sin(State.simStep * 0.2) * 0.8);
    const t2Base = 32 + (heatLoad * 0.45) + (Math.cos(State.simStep * 0.2) * 0.5);

    const t1 = parseFloat(t1Base.toFixed(2));
    const t2 = parseFloat(t2Base.toFixed(2));
    const delta = parseFloat((t1 - t2).toFixed(2));

    // Construct telemetry packet mimicking the ESP32 JSON output
    const jsonPacket = `{"t1":${t1},"t2":${t2},"delta":${delta}}`;
    processTelemetryLine(jsonPacket);
  }

  // ----------------------------------------------------------------------------
  // 10. APP BOOTSTRAP
  // ----------------------------------------------------------------------------
  function initApp() {
    // 1. Initialize Theme
    initTheme();

    // 2. Initialize Chart
    initChart();

    // 3. Verify Web Serial API support
    checkWebSerialSupport();

    // 4. Bind Serial Connect / Disconnect buttons
    DOM.btnConnect.addEventListener('click', connectESP32);
    DOM.btnDisconnect.addEventListener('click', disconnectESP32);

    // 5. Initialize Logger
    initLogger();

    // 6. Initialize Configuration & Thresholds
    initConfig();

    // 7. Initialize Simulation Mode
    initSimulation();

    console.log('THERMAVEXIA Thermal Intelligence Platform successfully initialized.');
  }

  // Execute on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
