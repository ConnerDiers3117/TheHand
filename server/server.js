const express = require('express');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const app = express();
app.use(express.json());
app.use(express.static('public'));  // serve frontend files

// ------------------- Serial Configuration -------------------
let serialPort = null;
let isSerialReady = false;

// Change 'COM3' to your Arduino port (Windows) or '/dev/ttyUSB0' (Linux/Mac)
const PORT_NAME = 'COM3';
const BAUD_RATE = 9600;

try {
  serialPort = new SerialPort({ path: PORT_NAME, baudRate: BAUD_RATE });
  const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
  
  serialPort.on('open', () => {
    console.log(`Serial port ${PORT_NAME} opened`);
    isSerialReady = true;
  });
  
  parser.on('data', (data) => {
    console.log('Arduino says:', data.trim());
  });
  
  serialPort.on('error', (err) => {
    console.error('Serial error:', err.message);
    isSerialReady = false;
  });
} catch (err) {
  console.warn('Could not open serial port. Running in simulation mode.');
  isSerialReady = false;
}

// ------------------- Send command to Arduino -------------------
function sendToArduino(finger, angle) {
  if (!isSerialReady || !serialPort) {
    console.log(`[SIMULATE] ${finger}: ${angle}°`);
    return;
  }
  // Send command format: "thumb:150\n"
  const command = `${finger}:${angle}\n`;
  serialPort.write(command, (err) => {
    if (err) console.error(`Error writing to serial: ${err.message}`);
    else console.log(`Sent: ${command.trim()}`);
  });
}

// ------------------- API Endpoint -------------------
app.post('/hand', (req, res) => {
  const { thumb, index, middle, ring, pinky } = req.body;
  console.log('Received hand state:', req.body);
  
  sendToArduino('thumb', thumb);
  sendToArduino('index', index);
  sendToArduino('middle', middle);
  sendToArduino('ring', ring);
  sendToArduino('pinky', pinky);
  
  res.json({ status: 'ok', received: req.body });
});

// ------------------- Start Server -------------------
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Serving frontend from /public`);
});
