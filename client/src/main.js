import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// =========================================
// Scene, Camera, Renderer
// =========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1e1e1e);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// =========================================
// Orbit Controls
// =========================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1, 0);
controls.minDistance = 2;
controls.maxDistance = 15;
controls.update();

// =========================================
// Lighting
// =========================================
scene.add(new THREE.AmbientLight(0xffffff, 1.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 6, 5);
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight2.position.set(-5, 4, -3);
scene.add(dirLight2);
scene.add(new THREE.GridHelper(10, 10));
scene.add(new THREE.AxesHelper(2));

// =========================================
// Global state
// =========================================
let handModel = null;

// Servo angles (0 = closed, 150 = open)
const state = {
  thumb: 0,
  index: 0,
  middle: 0,
  ring: 0,
  pinky: 0
};

// Node names inside your GLTF model (adjust to your actual names)
const fingerNodeNames = {
  thumb: 'Contr_Fin_Tumb_03_01',
  index: 'Fin_Index_03_01',
  middle: 'Fin_Middle_03_03',
  ring: 'Fin_Ring_03_06',
  pinky: 'Fig_Pinky_03_06'
};

const fingerNodes = { thumb: null, index: null, middle: null, ring: null, pinky: null };
const fingerAxes = { thumb: 'x', index: 'y', middle: 'y', ring: 'y', pinky: 'y' };
const fingerSigns = { thumb: -1, index: -1, middle: -1, ring: -1, pinky: -1 };
const sliderRefs = {};

// =========================================
// Helpers
// =========================================
function autoScaleAndCenter(object, targetSize = 4) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) return;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = scaledBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.y -= center.y;
  object.position.z -= center.z;
  const finalBox = new THREE.Box3().setFromObject(object);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  object.position.y += finalSize.y / 2;
}

function findNodeByExactName(root, name) {
  let found = null;
  root.traverse(child => { if (child.name === name) found = child; });
  return found;
}

function mapFingerNodes(model) {
  for (const finger of Object.keys(fingerNodeNames)) {
    fingerNodes[finger] = findNodeByExactName(model, fingerNodeNames[finger]);
  }
  console.log('Node mapping:', Object.fromEntries(Object.entries(fingerNodes).map(([k,v]) => [k, v?.name || 'NOT FOUND'])));
}

function applyFingerRotation(fingerName, angleDegrees) {
  const node = fingerNodes[fingerName];
  if (!node) return;
  const axis = fingerAxes[fingerName];
  const sign = fingerSigns[fingerName];
  node.rotation[axis] = sign * THREE.MathUtils.degToRad(angleDegrees);
}

// Reverse mapping: servo angle (0-150) → model angle (0-90)
// Servo 150° (open) → Model 0° (closed)
// Servo 0° (closed) → Model 90° (open)
function servoToModelAngle(servoAngle) {
  return 90 - (servoAngle * 90 / 150);
}

function updateModelFromState() {
  applyFingerRotation('thumb', servoToModelAngle(state.thumb));
  applyFingerRotation('index', servoToModelAngle(state.index));
  applyFingerRotation('middle', servoToModelAngle(state.middle));
  applyFingerRotation('ring', servoToModelAngle(state.ring));
  applyFingerRotation('pinky', servoToModelAngle(state.pinky));
}

// Send current servo angles to backend
async function sendHandToArduino() {
  try {
    const response = await fetch('http://localhost:3000/hand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    const result = await response.json();
    console.log('Server response:', result);
  } catch (error) {
    console.error('Error sending to Arduino:', error);
  }
}

let sendTimeout = null;
function queueSendToArduino() {
  clearTimeout(sendTimeout);
  sendTimeout = setTimeout(() => sendHandToArduino(), 80);
}

function setFingerValue(key, value) {
  state[key] = value;
  if (sliderRefs[key]) {
    sliderRefs[key].slider.value = String(value);
    sliderRefs[key].valueEl.textContent = String(value);
    // Optionally display model angle
    const modelAngle = servoToModelAngle(value);
    if (sliderRefs[key].modelAngleEl) {
      sliderRefs[key].modelAngleEl.textContent = `(model: ${Math.round(modelAngle)}°)`;
    }
  }
}

function syncAll() {
  updateModelFromState();
  queueSendToArduino();
}

// =========================================
// UI Construction
// =========================================
function createSliderRow(label, key) {
  const row = document.createElement('div');
  row.className = 'slider-row';
  
  const labelEl = document.createElement('label');
  labelEl.textContent = `${label}:`;
  
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '150';
  slider.value = '0';
  
  const valueEl = document.createElement('span');
  valueEl.className = 'value';
  valueEl.textContent = '0';
  
  const modelAngleEl = document.createElement('span');
  modelAngleEl.style.marginLeft = '10px';
  modelAngleEl.style.fontSize = '0.8em';
  modelAngleEl.textContent = '(model: 90°)';
  
  slider.addEventListener('input', () => {
    const val = Number(slider.value);
    state[key] = val;
    valueEl.textContent = val;
    const modelAngle = servoToModelAngle(val);
    modelAngleEl.textContent = `(model: ${Math.round(modelAngle)}°)`;
    updateModelFromState();
    queueSendToArduino();
  });
  
  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(valueEl);
  row.appendChild(modelAngleEl);
  
  sliderRefs[key] = { slider, valueEl, modelAngleEl };
  return row;
}

function buildUI() {
  const panel = document.createElement('div');
  panel.id = 'control-panel';
  panel.style.position = 'absolute';
  panel.style.top = '20px';
  panel.style.right = '20px';
  panel.style.backgroundColor = 'rgba(0,0,0,0.7)';
  panel.style.color = 'white';
  panel.style.padding = '15px';
  panel.style.borderRadius = '8px';
  panel.style.fontFamily = 'sans-serif';
  panel.style.minWidth = '250px';
  
  const title = document.createElement('h2');
  title.textContent = 'Servo Hand Control (0-150°)';
  panel.appendChild(title);
  
  const desc = document.createElement('p');
  desc.textContent = 'Sliders: 0°=closed, 150°=open. Model moves opposite.';
  panel.appendChild(desc);
  
  panel.appendChild(createSliderRow('Thumb', 'thumb'));
  panel.appendChild(createSliderRow('Index', 'index'));
  panel.appendChild(createSliderRow('Middle', 'middle'));
  panel.appendChild(createSliderRow('Ring', 'ring'));
  panel.appendChild(createSliderRow('Pinky', 'pinky'));
  
  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'flex';
  buttonRow.style.gap = '10px';
  buttonRow.style.marginTop = '10px';
  
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close Hand (0°)';
  closeBtn.onclick = () => {
    setFingerValue('thumb', 0);
    setFingerValue('index', 0);
    setFingerValue('middle', 0);
    setFingerValue('ring', 0);
    setFingerValue('pinky', 0);
    syncAll();
  };
  
  const openBtn = document.createElement('button');
  openBtn.textContent = 'Open Hand (150°)';
  openBtn.onclick = () => {
    setFingerValue('thumb', 150);
    setFingerValue('index', 150);
    setFingerValue('middle', 150);
    setFingerValue('ring', 150);
    setFingerValue('pinky', 150);
    syncAll();
  };
  
  const pointBtn = document.createElement('button');
  pointBtn.textContent = 'Point';
  pointBtn.onclick = () => {
    setFingerValue('thumb', 20);
    setFingerValue('index', 0);
    setFingerValue('middle', 150);
    setFingerValue('ring', 0);
    setFingerValue('pinky', 0);
    syncAll();
  };
  
  buttonRow.appendChild(closeBtn);
  buttonRow.appendChild(openBtn);
  buttonRow.appendChild(pointBtn);
  panel.appendChild(buttonRow);
  
  document.body.appendChild(panel);
}

buildUI();

// =========================================
// Load 3D Model
// =========================================
const loader = new GLTFLoader();
loader.load(
  '/models/robot_hand/scene.gltf',   // change path if needed
  (gltf) => {
    handModel = gltf.scene;
    handModel.rotation.z = Math.PI;   // rotate if needed
    scene.add(handModel);
    autoScaleAndCenter(handModel, 4);
    mapFingerNodes(handModel);
    updateModelFromState();
    
    // Debug: add axis helpers
    for (let finger of Object.keys(fingerNodes)) {
      if (fingerNodes[finger]) {
        const helper = new THREE.AxesHelper(0.2);
        fingerNodes[finger].add(helper);
      }
    }
    
    window.handModel = handModel;
  },
  undefined,
  (error) => console.error('Model load error:', error)
);

// =========================================
// Animation Loop
// =========================================
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
