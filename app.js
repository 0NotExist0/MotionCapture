import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as Kalidokit from 'kalidokit';

// ==========================================
// 1. UI & LOG MANAGER
// ==========================================
const UI = {
    overlay: document.getElementById('loading-overlay'),
    text: document.getElementById('loading-text'),
    bar: document.getElementById('progress-bar'),
    status: document.getElementById('status-indicator'),
    logBox: document.getElementById('loading-logs'),

    showLoading(message, progress = 0) {
        if (!this.overlay) return;
        this.overlay.style.display = 'flex';
        this.overlay.style.opacity = '1';
        this.text.innerText = message;
        this.bar.style.width = progress + '%';
        this.log(`Operazione: ${message}`, 'info');
    },

    updateProgress(progress) {
        if (this.bar) this.bar.style.width = progress + '%';
    },

    log(message, level = 'info') {
        if (!this.logBox) return;
        const line = document.createElement('div');
        line.className = `log-${level}`;
        const time = new Date().toLocaleTimeString();
        line.innerText = `[${time}] ${message}`;
        this.logBox.appendChild(line);
        this.logBox.scrollTop = this.logBox.scrollHeight;
    },

    hideLoading() {
        if (!this.overlay) return;
        this.overlay.style.opacity = '0';
        setTimeout(() => this.overlay.style.display = 'none', 300);
    },

    setTrackerReady() {
        if (this.status) {
            this.status.innerText = "Tracking Attivo (High Precision)";
            this.status.className = "status-online";
        }
    }
};

// ==========================================
// 2. DEBUG OVERLAY MODULARE
// ==========================================
const debugDiv = document.createElement('div');
debugDiv.id = 'mocap-debug';
debugDiv.style.cssText = `
    position: fixed; bottom: 16px; right: 16px;
    background: rgba(0,0,0,0.85); color: #0f0;
    font-family: monospace; font-size: 12px;
    padding: 12px 16px; border-radius: 8px;
    border: 1px solid #444; z-index: 9999;
    min-width: 240px; line-height: 1.8; pointer-events: none;
`;
debugDiv.innerHTML = `
    <b style="color:#fff">MOCAP TRACKING STATUS</b><hr style="border-color:#333; margin: 4px 0;">
    Testa: <span id="dbg-testa" style="color:#888; float:right;">❌</span><br>
    Corpo: <span id="dbg-corpo" style="color:#888; float:right;">❌</span><br>
    Braccio Sinistro: <span id="dbg-armsx" style="color:#888; float:right;">❌</span><br>
    Braccio Destro: <span id="dbg-armdx" style="color:#888; float:right;">❌</span><br>
    <hr style="border-color:#333; margin: 4px 0;">
    Ossa mappate: <span id="dbg-bones" style="color:#888; float:right;">0</span><br>
    IA Precision: <span style="color:#0f0; float:right;">LEVEL 2</span><br>
    Stato: <span id="dbg-state" style="color:#f80; float:right; font-weight:bold;">IN ATTESA</span>
`;
document.body.appendChild(debugDiv);

const dbg = {
    updateParts(state) {
        const setSpan = (id, isActive) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = isActive ? '✅ OK' : '❌ NO';
                el.style.color = isActive ? '#0f0' : '#888';
            }
        };
        setSpan('dbg-testa', state.testa);
        setSpan('dbg-corpo', state.corpo);
        setSpan('dbg-armsx', state.braccioSx);
        setSpan('dbg-armdx', state.braccioDx);
    },
    setState(text, color = '#0f0') {
        const el = document.getElementById('dbg-state');
        if (el) { el.textContent = text; el.style.color = color; }
    }
};

// ==========================================
// 3. PULSANTE START / STOP MOCAP
// ==========================================
let mocapActive = false;

const injectMocapButton = () => {
    const btnContainer = document.createElement('div');
    btnContainer.id = "mocap-controls-wrapper";
    btnContainer.style.cssText = 'margin-top: 20px; padding: 0 4px;';

    const mocapBtn = document.createElement('button');
    mocapBtn.id = 'mocap-btn';
    mocapBtn.innerText = '▶  Avvia Motion Capture';
    mocapBtn.style.cssText = `
        width: 100%; padding: 13px 10px;
        background: #1a7a1a; color: #fff;
        border: 2px solid #2a9a2a; border-radius: 6px;
        font-size: 14px; font-weight: bold;
        cursor: pointer; transition: 0.2s;
    `;

    mocapBtn.addEventListener('click', () => {
        mocapActive = !mocapActive;
        if (mocapActive) {
            mocapBtn.innerText = '⏹  Ferma Motion Capture';
            mocapBtn.style.background = '#8a1a1a';
            mocapBtn.style.borderColor = '#c02020';
            dbg.setState('▶ ATTIVO', '#0f0');
        } else {
            mocapBtn.innerText = '▶  Avvia Motion Capture';
            mocapBtn.style.background = '#1a7a1a';
            mocapBtn.style.borderColor = '#2a9a2a';
            dbg.setState('⏸ IN PAUSA', '#f80');
        }
    });

    btnContainer.appendChild(mocapBtn);
    const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar') || document.body;
    sidebar.appendChild(btnContainer);
};

// ==========================================
// 4. SETUP SCENA 3D
// ==========================================
const viewport = document.getElementById('viewport');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
camera.position.set(0, 1.4, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);
scene.add(new THREE.GridHelper(10, 10, 0x444444, 0x222222));

let model = null;
let skeleton = {};
const boneTargets = {}; 
const boneRestQuats = {};

window.addEventListener('resize', () => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (MocapVisualAnnotations.css2dRenderer) MocapVisualAnnotations.css2dRenderer.setSize(w, h);
});

// ==========================================
// 5. CORE RIGGING & SOLVER
// ==========================================
const BONE_ALIASES = {
    'hips': ['hips', 'pelvis', 'hip'],
    'spine': ['spine', 'spine1'],
    'neck': ['neck'],
    'head': ['head'],
    'rightupperarm': ['rightupperarm', 'rshoulder'],
    'rightforearm': ['rightforearm', 'rforearm'],
    'righthand': ['righthand', 'rhand'],
    'leftupperarm': ['leftupperarm', 'lshoulder'],
    'leftforearm': ['leftforearm', 'lforearm'],
    'lefthand': ['lefthand', 'lhand']
};

const findBone = (name) => {
    const key = name.toLowerCase();
    if (skeleton[key]) return skeleton[key];
    const aliases = BONE_ALIASES[key] || [];
    for (const a of aliases) if (skeleton[a]) return skeleton[a];
    return null;
};

const setupRig = (loadedModel) => {
    if (model) scene.remove(model);
    model = loadedModel;
    scene.add(model);
    skeleton = {};
    
    model.traverse((obj) => {
        if (obj.isSkinnedMesh && obj.skeleton) {
            obj.skeleton.bones.forEach((bone) => {
                let name = bone.name.toLowerCase().replace(/mixamorig|[:\s_]/gi, '').trim();
                skeleton[name] = bone;
                boneRestQuats[name] = bone.quaternion.clone();
            });
        }
    });
    document.getElementById('dbg-bones').textContent = Object.keys(skeleton).length;
    UI.hideLoading();
};

const setBoneTarget = (name, rotation, lerpSpeed = 0.3, map = { x: 'x', y: 'y', z: 'z', ix: 1, iy: 1, iz: 1 }, active = true) => {
    const bone = findBone(name);
    if (!bone) return;
    const restQuat = boneRestQuats[name] || new THREE.Quaternion();
    
    if (!active || !rotation) {
        boneTargets[name] = { bone, target: restQuat, lerp: 0.1 };
        return;
    }

    const euler = new THREE.Euler(rotation[map.x] * map.ix, rotation[map.y] * map.iy, rotation[map.z] * map.iz, 'XYZ');
    const targetQuat = new THREE.Quaternion().copy(restQuat).multiply(new THREE.Quaternion().setFromEuler(euler));
    boneTargets[name] = { bone, target: targetQuat, lerp: lerpSpeed };
};

// ==========================================
// 6. MEDIAPIPE CALLBACK (onResults)
// ==========================================
const videoElement = document.getElementById('input_video');

const onResults = (results) => {
    // 1. Overlay 2D sempre attivo per debug webcam
    MocapVisualAnnotations.draw2DOverlay(results.poseLandmarks);

    if (!mocapActive || !model) return;

    const poseLms = results.poseLandmarks;
    const faceLms = results.faceLandmarks;
    const worldLms = results.poseWorldLandmarks || null;

    const isVisible = (idxs) => idxs.every(i => poseLms && poseLms[i] && poseLms[i].visibility > 0.5);
    
    const state = {
        testa: !!faceLms,
        corpo: isVisible([11, 12]),
        braccioSx: isVisible([11, 13, 15]),
        braccioDx: isVisible([12, 14, 16])
    };
    dbg.updateParts(state);

    if (poseLms && worldLms) {
        const rp = Kalidokit.Pose.solve(worldLms, poseLms, { runtime: "mediapipe", video: videoElement });
        if (rp) {
            // Mappe Mixamo standard
            const sMap = { x: 'x', y: 'y', z: 'z', ix: 1, iy: 1, iz: -1 };
            const lArmMap = { x: 'z', y: 'y', z: 'x', ix: -1, iy: 1, iz: 1 };
            const rArmMap = { x: 'z', y: 'y', z: 'x', ix: -1, iy: -1, iz: -1 };

            setBoneTarget("hips", rp.Hips?.rotation, 0.3, sMap, state.corpo);
            setBoneTarget("spine", rp.Spine, 0.3, sMap, state.corpo);

            // Braccio Sinistro Avatar (Input Sinistro Utente)
            setBoneTarget("leftupperarm", rp.LeftUpperArm, 0.4, lArmMap, state.braccioSx);
            setBoneTarget("leftforearm", rp.LeftLowerArm, 0.4, lArmMap, state.braccioSx);
            setBoneTarget("lefthand", rp.LeftHand, 0.4, lArmMap, state.braccioSx);

            // Braccio Destro Avatar (Input Destro Utente)
            setBoneTarget("rightupperarm", rp.RightUpperArm, 0.4, rArmMap, state.braccioDx);
            setBoneTarget("rightforearm", rp.RightLowerArm, 0.4, rArmMap, state.braccioDx);
            setBoneTarget("righthand", rp.RightHand, 0.4, rArmMap, state.braccioDx);
        }
    }

    // Aggiornamento coordinate 3D sui label del modello
    for (const [id, config] of Object.entries(MocapVisualAnnotations.trackingJoints)) {
        const bone = findBone(config.boneName);
        if (bone) {
            const wp = new THREE.Vector3();
            bone.getWorldPosition(wp);
            const elX = document.getElementById(`coord-x-${id}`);
            const elY = document.getElementById(`coord-y-${id}`);
            const elZ = document.getElementById(`coord-z-${id}`);
            if (elX) { elX.innerText = wp.x.toFixed(2); elY.innerText = wp.y.toFixed(2); elZ.innerText = wp.z.toFixed(2); }
        }
    }
};

// ==========================================
// 7. IA INIT (HIGH PRECISION)
// ==========================================
UI.showLoading("Inizializzazione IA...", 10);
const holistic = new window.Holistic({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${f}` });
holistic.setOptions({ modelComplexity: 2, smoothLandmarks: true, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
holistic.onResults(onResults);

new window.Camera(videoElement, {
    onFrame: async () => { await holistic.send({ image: videoElement }); },
    width: 640, height: 480
}).start().then(() => { UI.setTrackerReady(); UI.log("Sistema Pronto."); });

// ==========================================
// 8. VISUAL ANNOTATIONS (2D/3D)
// ==========================================
const MocapVisualAnnotations = {
    canvas: null, ctx: null, css2dRenderer: null, labels3d: {},
    // Tracciamo il braccio SINISTRO (quello alzato nel tuo screenshot)
    trackingJoints: {
        1: { lmIdx: 11, boneName: 'leftupperarm' },
        2: { lmIdx: 13, boneName: 'leftforearm' },
        3: { lmIdx: 15, boneName: 'lefthand' }
    },

    init() {
        this.setup2D();
        this.setup3D();
        injectMocapButton();
        injectPoseControls();
    },

    setup2D() {
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none; z-index: 100;';
        videoElement.parentElement.style.position = 'relative';
        videoElement.parentElement.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
    },

    draw2DOverlay(lms) {
        if (!this.ctx || !lms) return;
        const r = videoElement.getBoundingClientRect();
        this.canvas.width = r.width; this.canvas.height = r.height;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.font = 'bold 14px monospace';
        for (const [id, conf] of Object.entries(this.trackingJoints)) {
            const lm = lms[conf.lmIdx];
            if (lm && lm.visibility > 0.5) {
                const x = lm.x * this.canvas.width;
                const y = lm.y * this.canvas.height;
                this.ctx.strokeStyle = '#f00'; this.ctx.lineWidth = 3;
                this.ctx.strokeRect(x - 12, y - 12, 24, 24);
                this.ctx.fillStyle = '#f00'; this.ctx.fillText(id, x - 4, y + 5);
                if (id == '3') {
                    this.ctx.fillStyle = '#0ff';
                    this.ctx.fillText(`X:${lm.x.toFixed(2)} Y:${lm.y.toFixed(2)}`, x + 20, y);
                }
            }
        }
    },

    setup3D() {
        this.css2dRenderer = new CSS2DRenderer();
        this.css2dRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
        this.css2dRenderer.domElement.style.cssText = 'position: absolute; top: 0; pointer-events: none;';
        viewport.appendChild(this.css2dRenderer.domElement);
    },

    update() {
        if (model && this.css2dRenderer) {
            for (const [id, conf] of Object.entries(this.trackingJoints)) {
                if (this.labels3d[id]) continue;
                const bone = findBone(conf.boneName);
                if (bone) {
                    const div = document.createElement('div');
                    div.style.cssText = 'background:rgba(0,0,0,0.8); color:#0ff; border:1px solid red; padding:4px; font-size:10px; display:flex; gap:5px;';
                    div.innerHTML = `<div style="color:red; border:1px solid red; padding:0 3px;">${id}</div>
                                     <div>X:<span id="coord-x-${id}">0</span> Y:<span id="coord-y-${id}">0</span> Z:<span id="coord-z-${id}">0</span></div>`;
                    const obj = new CSS2DObject(div);
                    bone.add(obj);
                    this.labels3d[id] = obj;
                }
            }
            this.css2dRenderer.render(scene, camera);
        }
    }
};

// ==========================================
// 9. POSE MANAGER & RENDER LOOP
// ==========================================
const PoseManager = {
    saveCurrentPose() {
        if (!model) return;
        const data = { bones: {} };
        Object.entries(skeleton).forEach(([n, b]) => {
            data.bones[n] = { p: b.position.toArray(), q: b.quaternion.toArray() };
        });
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = "Pose.json"; a.click();
    }
};

const injectPoseControls = () => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; gap:5px; margin-top:10px;';
    const btn = document.createElement('button');
    btn.innerText = "📸 Salva Posa";
    btn.style.cssText = 'flex:1; padding:8px; cursor:pointer; background:#2b5c8f; color:#fff; border:none; border-radius:4px;';
    btn.onclick = () => PoseManager.saveCurrentPose();
    div.appendChild(btn);
    document.getElementById('mocap-controls-wrapper').appendChild(div);
};

(function animate() {
    requestAnimationFrame(animate);
    if (mocapActive && model) {
        Object.values(boneTargets).forEach(t => t.bone.quaternion.slerp(t.target, t.lerp));
    }
    if (model) model.updateMatrixWorld(true);
    MocapVisualAnnotations.update();
    controls.update();
    renderer.render(scene, camera);
})();

document.addEventListener('DOMContentLoaded', () => MocapVisualAnnotations.init());
