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
debugDiv.id = 'mocap-debug';
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

const dbg = {
    frame: 0,
    update(pose, face) {
        this.frame++;
        document.getElementById('dbg-pose').textContent  = pose  ? `✅ ${pose} pts`  : '❌ non rilevata';
        document.getElementById('dbg-face').textContent  = face  ? `✅ ${face} pts`  : '❌ non rilevata';
        document.getElementById('dbg-frame').textContent = this.frame;
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
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'margin-top: 20px; padding: 0 4px;';

    const mocapBtn = document.createElement('button');
    mocapBtn.id = 'mocap-btn';
    mocapBtn.innerText = '▶  Avvia Motion Capture';
    mocapBtn.style.cssText = `
        width: 100%; padding: 13px 10px;
        background: #1a7a1a; color: #fff;
        border: 2px solid #2a9a2a; border-radius: 6px;
        font-size: 14px; font-weight: bold;
        cursor: pointer; transition: background 0.2s, border-color 0.2s;
        letter-spacing: 0.5px;
    `;

    const updateBtn = () => {
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
    };

    mocapBtn.addEventListener('click', () => {
        mocapActive = !mocapActive;
        updateBtn();
        UI.log(mocapActive ? "Motion Capture avviato." : "Motion Capture in pausa.", 'info');
    });

    btnContainer.appendChild(mocapBtn);

    const sidebar =
        document.querySelector('.sidebar') ||
        document.getElementById('sidebar') ||
        document.querySelector('aside') ||
        document.querySelector('.controls') ||
        document.querySelector('.panel');

    if (sidebar) {
        sidebar.appendChild(btnContainer);
    } else {
        btnContainer.style.cssText += `
            position: fixed; top: 16px; left: 16px;
            z-index: 9998; width: 200px;
        `;
        document.body.appendChild(btnContainer);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectMocapButton);
} else {
    injectMocapButton();
}

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

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

scene.add(new THREE.GridHelper(10, 10, 0x444444, 0x222222));

let model = null;
let skeleton = {};

window.addEventListener('resize', () => {
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

// ==========================================
// 5. MAPPA ALIAS OSSA MIXAMO
// ==========================================
const BONE_ALIASES = {
    'hips':          ['hips', 'pelvis', 'hip', 'root'],
    'spine':         ['spine', 'spine1', 'spine01', 'spine_01'],
    'spine1':        ['spine1', 'spine2', 'spine02', 'spine_02'],
    'neck':          ['neck', 'neck1', 'neck_01'],
    'head':          ['head'],
    'rightupperarm': ['rightupperarm', 'rightarm', 'rshoulder', 'rightshoulder', 'right_upper_arm'],
    'rightforearm':  ['rightforearm', 'rightlowerarm', 'rforearm', 'right_forearm', 'right_lower_arm'],
    'righthand':     ['righthand', 'rhand', 'right_hand'],
    'leftupperarm':  ['leftupperarm', 'leftarm', 'lshoulder', 'leftshoulder', 'left_upper_arm'],
    'leftforearm':   ['leftforearm', 'leftlowerarm', 'lforearm', 'left_forearm', 'left_lower_arm'],
    'lefthand':      ['lefthand', 'lhand', 'left_hand'],
    'rightupperleg': ['rightupperleg', 'rightleg', 'rthigh', 'right_upper_leg', 'rightthigh'],
    'rightlowerleg': ['rightlowerleg', 'rightcalf', 'rshin', 'right_lower_leg'],
    'rightfoot':     ['rightfoot', 'rfoot', 'right_foot'],
    'leftupperleg':  ['leftupperleg', 'leftleg', 'lthigh', 'left_upper_leg', 'leftthigh'],
    'leftlowerleg':  ['leftlowerleg', 'leftcalf', 'lshin', 'left_lower_leg'],
    'leftfoot':      ['leftfoot', 'lfoot', 'left_foot'],
};

const findBone = (targetName) => {
    const key = targetName.toLowerCase();
    if (skeleton[key]) return skeleton[key];
    const aliases = BONE_ALIASES[key] || [];
    for (const alias of aliases) {
        if (skeleton[alias]) return skeleton[alias];
    }
    return null;
};

// ==========================================
// 6. SETUP RIG
// ==========================================
const setupRig = (loadedModel) => {
    UI.log("Setup Rig in corso...", 'info');
    if (model) scene.remove(model);

    model = loadedModel;
    scene.add(model);
    skeleton = {};

    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa, roughness: 0.6, metalness: 0.1,
    });

    let boneCount = 0;

    model.traverse((obj) => {
        if (obj.isMesh || obj.isSkinnedMesh) {
            obj.material = defaultMaterial;
        }

        if (obj.isSkinnedMesh && obj.skeleton) {
            obj.skeleton.bones.forEach((bone) => {
                let name = bone.name.toLowerCase()
                    .replace(/mixamorig/gi, '')
                    .replace(/:/g, '')
                    .replace(/_/g, '')
                    .replace(/\s/g, '')
                    .trim();
                skeleton[name] = bone;
                boneCount++;
            });
        }
    });

    dbg.setBones(boneCount);
    UI.log(`Rig OK — ${boneCount} ossa trovate.`, 'info');

    const boneNames = Object.keys(skeleton);
    console.log("=== OSSA NORMALIZZATE ===", boneNames);

    if (boneCount === 0) {
        UI.log("ERRORE: nessuna osso trovata! Il modello non ha SkinnedMesh riggata.", 'error');
        dbg.setState('NO BONES', '#f00');
    } else {
        UI.log("Premi ▶ Avvia Motion Capture per iniziare.", 'info');
        dbg.setState('PRONTO — premi ▶', '#f80');
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
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onprogress = (event) => {
        if (event.lengthComputable) UI.updateProgress((event.loaded / event.total) * 100);
    };

    reader.onload = (event) => {
        UI.log("File in memoria. Parsing...", 'info');
        UI.updateProgress(100);
        setTimeout(() => {
            const contents = event.target.result;
            try {
                if (extension === 'glb' || extension === 'gltf') {
                    new GLTFLoader().parse(contents, '', (gltf) => setupRig(gltf.scene), err => { throw err; });
                } else if (extension === 'fbx') {
                    const fbx = new FBXLoader().parse(contents);
                    fbx.scale.set(0.01, 0.01, 0.01);
                    setupRig(fbx);
                }
            } catch (err) {
                UI.log(`Errore Parsing: ${err.message}`, 'error');
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
        const target = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x, rotation.y, rotation.z)
        );
        bone.quaternion.slerp(target, lerp);
    } catch (e) {
        // Fallimento silente gestito
    }
};

// ==========================================
// 9. CALLBACK MEDIAPIPE (Fix Assi Locali)
// ==========================================
const videoElement = document.getElementById('input_video');

const onResults = (results) => {
    const hasPose = results.poseLandmarks ? results.poseLandmarks.length : 0;
    const hasFace = results.faceLandmarks ? results.faceLandmarks.length : 0;
    dbg.update(hasPose, hasFace);

    if (!mocapActive || !model) return;

    // --- LAYER POSE ---
    if (results.poseLandmarks && results.poseWorldLandmarks) {
        try {
            const rp = Kalidokit.Pose.solve(
                results.poseWorldLandmarks,
                results.poseLandmarks,
                { runtime: "mediapipe", video: videoElement }
            );
            
            if (rp) {
                // Se anche il corpo o le braccia dovessero muoversi al contrario, 
                // basterà mettere un meno (-) davanti a rp.OSSO.rotation.x o .z
                if (rp.Hips)          rigBone("hips",          rp.Hips.rotation,          0.1);
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
        } catch (error) {}
    }

    // --- LAYER FACE ---
    if (results.faceLandmarks) {
        try {
            const rf = Kalidokit.Face.solve(results.faceLandmarks, {
                runtime: "mediapipe", video: videoElement
            });
            
            if (rf && rf.head) {
                const h = rf.head;
                // FIX MIXAMO: Invertiamo l'asse X e Z moltiplicandoli per -1.
                // h.x controlla il Pitch (Su e Giù). h.z controlla il Roll (Inclinazione).
                // h.y (Yaw / rotazione destra-sinistra) di solito coincide e non serve invertirlo.
                rigBone("neck", { x: -h.x * 0.5, y: h.y * 0.5, z: -h.z * 0.5 }, 0.5);
                rigBone("head", { x: -h.x * 0.5, y: h.y * 0.5, z: -h.z * 0.5 }, 0.5);
            }
        } catch (error) {}
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
        UI.log("Telecamera pronta. Carica un modello e premi ▶ Avvia.", 'info');
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
