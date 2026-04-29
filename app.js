import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
        this.overlay.style.display = 'flex';
        this.overlay.style.opacity = '1';
        this.overlay.style.pointerEvents = 'all';
        this.text.innerText = message;
        this.bar.style.width = progress + '%';
        this.log(`Operazione: ${message}`, 'info');
    },

    updateProgress(progress) {
        this.bar.style.width = progress + '%';
    },

    log(message, level = 'info') {
        const line = document.createElement('div');
        line.className = `log-${level}`;
        const time = new Date().toLocaleTimeString();
        line.innerText = `[${time}] ${message}`;
        this.logBox.appendChild(line);
        this.logBox.scrollTop = this.logBox.scrollHeight;
    },

    hideLoading() {
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none';
        setTimeout(() => this.overlay.style.display = 'none', 300);
    },

    setTrackerReady() {
        this.status.innerText = "Tracking Attivo";
        this.status.className = "status-online";
    }
};

// ==========================================
// 2. DEBUG OVERLAY
// ==========================================
const debugDiv = document.createElement('div');
debugDiv.style.cssText = `
    position: fixed; bottom: 16px; right: 16px;
    background: rgba(0,0,0,0.80); color: #0f0;
    font-family: monospace; font-size: 12px;
    padding: 10px 14px; border-radius: 8px;
    border: 1px solid #333; z-index: 9999;
    min-width: 230px; line-height: 1.9;
    pointer-events: none;
`;
debugDiv.innerHTML = `
    <b style="color:#fff">MOCAP DEBUG</b><br>
    Pose: <span id="dbg-pose" style="color:#888">—</span><br>
    Face: <span id="dbg-face" style="color:#888">—</span><br>
    Ossa mappate: <span id="dbg-bones" style="color:#888">0</span><br>
    Frame: <span id="dbg-frame" style="color:#888">0</span><br>
    Stato: <span id="dbg-state" style="color:#f80">IN ATTESA</span>
`;
document.body.appendChild(debugDiv);

let _frame = 0;
const dbg = {
    update(pose, face) {
        _frame++;
        document.getElementById('dbg-pose').textContent  = pose  ? `✅ ${pose} pts`  : '❌ non rilevata';
        document.getElementById('dbg-face').textContent  = face  ? `✅ ${face} pts`  : '❌ non rilevata';
        document.getElementById('dbg-frame').textContent = _frame;
    },
    setBones(n) {
        document.getElementById('dbg-bones').textContent = n;
        document.getElementById('dbg-bones').style.color = n > 0 ? '#0f0' : '#f00';
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
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top: 20px; padding: 0 4px;';

    const btn = document.createElement('button');
    btn.innerText = '▶  Avvia Motion Capture';
    btn.style.cssText = `
        width: 100%; padding: 13px 10px;
        background: #1a7a1a; color: #fff;
        border: 2px solid #2a9a2a; border-radius: 6px;
        font-size: 14px; font-weight: bold;
        cursor: pointer; transition: background 0.2s;
    `;

    btn.addEventListener('click', () => {
        mocapActive = !mocapActive;
        if (mocapActive) {
            btn.innerText = '⏹  Ferma Motion Capture';
            btn.style.background = '#8a1a1a';
            btn.style.borderColor = '#c02020';
            dbg.setState('▶ ATTIVO', '#0f0');
            UI.log("Motion Capture avviato.", 'info');
        } else {
            btn.innerText = '▶  Avvia Motion Capture';
            btn.style.background = '#1a7a1a';
            btn.style.borderColor = '#2a9a2a';
            dbg.setState('⏸ IN PAUSA', '#f80');
            UI.log("Motion Capture in pausa.", 'info');
        }
    });

    wrap.appendChild(btn);

    const sidebar =
        document.querySelector('.sidebar') ||
        document.getElementById('sidebar') ||
        document.querySelector('aside') ||
        document.querySelector('.controls') ||
        document.querySelector('.panel');

    if (sidebar) {
        sidebar.appendChild(wrap);
    } else {
        wrap.style.cssText += 'position:fixed;top:16px;left:16px;z-index:9998;width:200px;';
        document.body.appendChild(wrap);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectMocapButton);
} else {
    injectMocapButton();
}

// ==========================================
// 4. SCENA 3D
// ==========================================
const viewport = document.getElementById('viewport');
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 1000);
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

let model   = null;
let skeleton = {};

window.addEventListener('resize', () => {
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

// ==========================================
// 5. ALIAS OSSA MIXAMO
// ==========================================
const BONE_ALIASES = {
    'hips':          ['hips', 'pelvis', 'hip', 'root'],
    'spine':         ['spine', 'spine1', 'spine01', 'spine_01'],
    'spine1':        ['spine1', 'spine2', 'spine02', 'spine_02'],
    'neck':          ['neck', 'neck1', 'neck_01'],
    'head':          ['head'],
    'rightupperarm': ['rightupperarm', 'rightarm', 'rshoulder', 'rightshoulder'],
    'rightforearm':  ['rightforearm', 'rightlowerarm', 'rforearm'],
    'righthand':     ['righthand', 'rhand'],
    'leftupperarm':  ['leftupperarm', 'leftarm', 'lshoulder', 'leftshoulder'],
    'leftforearm':   ['leftforearm', 'leftlowerarm', 'lforearm'],
    'lefthand':      ['lefthand', 'lhand'],
    'rightupperleg': ['rightupperleg', 'rightleg', 'rthigh', 'rightthigh'],
    'rightlowerleg': ['rightlowerleg', 'rightcalf', 'rshin'],
    'rightfoot':     ['rightfoot', 'rfoot'],
    'leftupperleg':  ['leftupperleg', 'leftleg', 'lthigh', 'leftthigh'],
    'leftlowerleg':  ['leftlowerleg', 'leftcalf', 'lshin'],
    'leftfoot':      ['leftfoot', 'lfoot'],
};

const findBone = (name) => {
    const key = name.toLowerCase();
    if (skeleton[key]) return skeleton[key];
    for (const alias of (BONE_ALIASES[key] || [])) {
        if (skeleton[alias]) return skeleton[alias];
    }
    return null;
};

// ==========================================
// 6. SETUP RIG
// ==========================================
const setupRig = (loadedModel) => {
    UI.log("Setup Rig...", 'info');
    if (model) scene.remove(model);
    model = loadedModel;
    scene.add(model);
    skeleton = {};

    const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.6, metalness: 0.1 });
    let boneCount = 0;

    model.traverse((obj) => {
        if (obj.isMesh || obj.isSkinnedMesh) obj.material = mat;

        // FIX: legge ossa da SkinnedMesh.skeleton.bones, non obj.isBone
        if (obj.isSkinnedMesh && obj.skeleton) {
            obj.skeleton.bones.forEach((bone) => {
                const name = bone.name.toLowerCase()
                    .replace(/mixamorig/gi, '')
                    .replace(/:/g, '')
                    .replace(/_/g, '')   // FIX: /g globale
                    .replace(/\s/g, '')
                    .trim();
                skeleton[name] = bone;
                boneCount++;
            });
        }
    });

    dbg.setBones(boneCount);
    UI.log(`Rig OK — ${boneCount} ossa trovate.`, 'info');
    console.log("=== OSSA ===", Object.keys(skeleton));

    if (boneCount === 0) {
        UI.log("ERRORE: 0 ossa! Usa un modello riggato Mixamo.", 'error');
        dbg.setState('NO BONES', '#f00');
    } else {
        dbg.setState('PRONTO — premi ▶', '#f80');
        UI.log("Premi ▶ Avvia Motion Capture.", 'info');
    }

    UI.hideLoading();
};

// ==========================================
// 7. CARICAMENTO FILE
// ==========================================
document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    UI.showLoading(`Lettura ${file.name}...`, 0);
    const ext    = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onprogress = (ev) => {
        if (ev.lengthComputable) UI.updateProgress((ev.loaded / ev.total) * 100);
    };

    reader.onload = (ev) => {
        UI.log("Parsing...", 'info');
        UI.updateProgress(100);
        setTimeout(() => {
            try {
                if (ext === 'glb' || ext === 'gltf') {
                    new GLTFLoader().parse(ev.target.result, '', (gltf) => setupRig(gltf.scene), (err) => { throw err; });
                } else if (ext === 'fbx') {
                    const fbx = new FBXLoader().parse(ev.target.result);
                    fbx.scale.set(0.01, 0.01, 0.01);
                    setupRig(fbx);
                }
            } catch (err) {
                UI.log(`Errore: ${err.message}`, 'error');
                console.error(err);
                UI.hideLoading();
            }
        }, 100);
    };

    reader.readAsArrayBuffer(file);
});

// ==========================================
// 8. IK SOLVER
// ==========================================
const rigBone = (name, rotation, lerp = 0.3) => {
    if (!rotation) return;
    const bone = findBone(name);
    if (!bone) return;
    try {
        bone.quaternion.slerp(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x, rotation.y, rotation.z)),
            lerp
        );
    } catch (e) { /* ignora errori matematici */ }
};

// ==========================================
// 9. CALLBACK MEDIAPIPE
// 
// FIX CRITICO: Kalidokit.Pose.solve() crasha con
// "lm is undefined" quando poseWorldLandmarks è
// null o ha meno di 33 punti (persona fuori campo).
// Guard triplo prima di ogni chiamata a Kalidokit.
// ==========================================
const videoElement = document.getElementById('input_video');

const isValidLandmarks = (lm, minLen = 33) =>
    Array.isArray(lm) && lm.length >= minLen && lm[0] !== undefined;

const onResults = (results) => {
    const hasPose = results.poseLandmarks?.length ?? 0;
    const hasFace = results.faceLandmarks?.length ?? 0;
    dbg.update(hasPose, hasFace);

    if (!mocapActive || !model) return;

    // --- POSE ---
    // FIX: controlla ENTRAMBI i landmark (2D e World) prima di chiamare Kalidokit
    if (
        isValidLandmarks(results.poseLandmarks, 33) &&
        isValidLandmarks(results.poseWorldLandmarks, 33)  // ← questo era undefined e causava il crash
    ) {
        try {
            const rp = Kalidokit.Pose.solve(
                results.poseWorldLandmarks,
                results.poseLandmarks,
                { runtime: "mediapipe", video: videoElement }
            );
            if (rp) {
                if (rp.Hips)          rigBone("hips",         rp.Hips.rotation,          0.1);
                if (rp.Spine)         rigBone("spine",         rp.Spine.rotation,         0.3);
                if (rp.RightUpperArm) rigBone("rightupperarm", rp.RightUpperArm.rotation, 0.3);
                if (rp.RightLowerArm) rigBone("rightforearm",  rp.RightLowerArm.rotation, 0.3);
                if (rp.LeftUpperArm)  rigBone("leftupperarm",  rp.LeftUpperArm.rotation,  0.3);
                if (rp.LeftLowerArm)  rigBone("leftforearm",   rp.LeftLowerArm.rotation,  0.3);
                if (rp.RightHand)     rigBone("righthand",     rp.RightHand.rotation,     0.3);
                if (rp.LeftHand)      rigBone("lefthand",      rp.LeftHand.rotation,      0.3);
                if (rp.RightUpperLeg) rigBone("rightupperleg", rp.RightUpperLeg.rotation, 0.3);
                if (rp.RightLowerLeg) rigBone("rightlowerleg", rp.RightLowerLeg.rotation, 0.3);
                if (rp.LeftUpperLeg)  rigBone("leftupperleg",  rp.LeftUpperLeg.rotation,  0.3);
                if (rp.LeftLowerLeg)  rigBone("leftlowerleg",  rp.LeftLowerLeg.rotation,  0.3);
            }
        } catch (e) {
            // Kalidokit può ancora lanciare su frame corrotti — catturiamo senza fermare tutto
            console.warn("Kalidokit Pose.solve warning:", e.message);
        }
    }

    // --- FACE ---
    if (isValidLandmarks(results.faceLandmarks, 468)) {
        try {
            const rf = Kalidokit.Face.solve(results.faceLandmarks, {
                runtime: "mediapipe", video: videoElement
            });
            if (rf?.head) {
                const h = rf.head;
                rigBone("neck", { x: h.x * 0.5, y: h.y * 0.5, z: h.z * 0.5 }, 0.5);
                rigBone("head", { x: h.x * 0.5, y: h.y * 0.5, z: h.z * 0.5 }, 0.5);
            }
        } catch (e) {
            console.warn("Kalidokit Face.solve warning:", e.message);
        }
    }
};

// ==========================================
// 10. MEDIAPIPE INIT
// ==========================================
UI.showLoading("Download Modelli IA MediaPipe...", 10);

try {
    const holistic = new window.Holistic({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
    });
    holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    holistic.onResults(onResults);

    new window.Camera(videoElement, {
        onFrame: async () => { await holistic.send({ image: videoElement }); },
        width: 640, height: 480
    }).start().then(() => {
        UI.updateProgress(100);
        UI.setTrackerReady();
        setTimeout(() => UI.hideLoading(), 800);
        UI.log("Telecamera OK. Carica modello → premi ▶ Avvia.", 'info');
    });

} catch (e) {
    UI.log(`Errore telecamera: ${e.message}`, 'error');
    dbg.setState('ERRORE CAM', '#f00');
    console.error(e);
}

// ==========================================
// 11. RENDER LOOP
// ==========================================
(function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
})();
