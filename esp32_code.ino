/*
 * THERMAVEXIA - ESP32 Firmware
 * 
 * Project Title: Design and Thermal Analysis of a Passive Cooling Mechanism 
 *                for Sealed Titanium-Enclosed Electronics in Underwater Applications
 * 
 * Designed & Developed by: Kiruba
 * All Rights Reserved
 * 
 * Target Hardware:
 *   - Microcontroller: ESP32 DevKit V1
 *   - Internal Temp Sensor (T1): DS18B20 on OneWire Bus (GPIO 4)
 *   - External Temp Sensor (T2): DS18B20 on OneWire Bus (GPIO 4)
 *   - Display: 0.96" SSD1306 OLED (I2C: SDA=GPIO 21, SCL=GPIO 22, Addr=0x3C)
 *   - Serial Telemetry: USB Serial at 115200 Baud
 * 
 * Firmware Modifications from Original:
 *   - Preserved: 100% of sensor logic, OneWire bus, GPIO pins, and OLED interface.
 *   - Enhanced: Replaced plain text serial output with structured JSON strings
 *     ({"t1":XX.XX,"t2":YY.YY,"delta":ZZ.ZZ}\n) for real-time Web Serial API ingest
 *     on the THERMAVEXIA web platform.
 */

#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// DS18B20 DATA Pin
#define ONE_WIRE_BUS 4

// OLED Settings
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDRESS 0x3C

// Setup OneWire instance
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

// Setup OLED Display instance
Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  OLED_RESET
);

// Sensor device addresses
DeviceAddress sensorT1;
DeviceAddress sensorT2;

bool sensorsFound = false;

void setup() {
  // Initialize USB Serial communication at 115200 baud
  Serial.begin(115200);

  // Initialize I2C communication on ESP32 default pins: SDA=21, SCL=22
  Wire.begin(21, 22);

  // Initialize SSD1306 OLED Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("{\"error\":\"oled_init_failed\"}");
    while (true) delay(100);
  }

  // Display startup splash screen
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("THERMAVEXIA");
  display.println("Cooling Project");
  display.println("Starting...");
  display.display();

  // Initialize DS18B20 sensors
  sensors.begin();
  sensors.setWaitForConversion(true);

  // Verify that exactly 2 sensors are detected on the OneWire bus
  if (sensors.getDeviceCount() != 2 ||
      !sensors.getAddress(sensorT1, 0) ||
      !sensors.getAddress(sensorT2, 1)) {

    Serial.println("{\"error\":\"sensor_enumeration_failed\",\"count\":" + String(sensors.getDeviceCount()) + "}");

    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("Sensor error!");
    display.println("Check wiring");
    display.display();
    while (true) delay(100);
  }

  // Sensor index 0 = T1 (Internal enclosure sensor)
  // Sensor index 1 = T2 (External copper rod sensor)
  // Swap indices in getAddress() if physical sensors are reversed.
  sensorsFound = true;
}

void loop() {
  if (!sensorsFound) return;

  // Request temperature conversions from both sensors
  sensors.requestTemperatures();

  float T1 = sensors.getTempC(sensorT1);
  float T2 = sensors.getTempC(sensorT2);

  // Validate temperature readings within DS18B20 operating range (-55C to +125C)
  bool validT1 = (T1 != DEVICE_DISCONNECTED_C) && (T1 >= -55.0f) && (T1 <= 125.0f);
  bool validT2 = (T2 != DEVICE_DISCONNECTED_C) && (T2 >= -55.0f) && (T2 <= 125.0f);

  // Update physical OLED screen
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);

  display.setCursor(0, 0);
  display.println("THERMAVEXIA MONITOR");
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  if (validT1 && validT2) {
    float difference = T1 - T2;

    // Display T1 Inside
    display.setCursor(0, 16);
    display.print("T1 Inside:  ");
    display.print(T1, 2);
    display.println(" C");

    // Display T2 Outside
    display.setCursor(0, 31);
    display.print("T2 Outside: ");
    display.print(T2, 2);
    display.println(" C");

    // Display Delta T
    display.setCursor(0, 46);
    display.print("Delta T:    ");
    display.print(difference, 2);
    display.println(" C");

    // Transmit JSON telemetry line over USB Serial for the web platform
    // Example: {"t1":65.20,"t2":38.40,"delta":26.80}
    Serial.print("{\"t1\":");
    Serial.print(T1, 2);
    Serial.print(",\"t2\":");
    Serial.print(T2, 2);
    Serial.print(",\"delta\":");
    Serial.print(difference, 2);
    Serial.println("}");

  } else {
    // Sensor failure display
    display.setCursor(0, 25);
    display.println("Sensor reading error");

    // Transmit structured error over USB Serial
    Serial.println("{\"error\":\"sensor_reading_error\"}");
  }

  display.display();

  // Sampling interval: 1 second
  delay(1000);
}
