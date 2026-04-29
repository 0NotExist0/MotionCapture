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
    min-width: 240px; line-height: 1.8;
    pointer-events: none;
`;
debugDiv.innerHTML = `
    <b style="color:#fff">MOCAP TRACKING STATUS</b><hr style="border-color:#333; margin: 4px 0;">
    Testa: <span id="dbg-testa" style="color:#888; float:right;">❌</span><br>
    Corpo: <span id="dbg-corpo" style="color:#888; float:right;">❌</span><br>
    Braccio Sinistro: <span id="dbg-armsx" style="color:#888; float:right;">❌</span><br>
    Braccio Destro: <span id="dbg-armdx" style="color:#888; float:right;">❌</span><br>
    Gamba Sinistra: <span id="dbg-legsx" style="color:#888; float:right;">❌</span><br>
    Gamba Destra: <span id="dbg-legdx" style="color:#888; float:right;">❌</span><br>
    <hr style="border-color:#333; margin: 4px 0;">
    Ossa mappate: <span id="dbg-bones" style="color:#888; float:right;">0</span><br>
    Frame: <span id="dbg-frame" style="color:#888; float:right;">0</span><br>
    Kalidokit OK: <span id="dbg-kali" style="color:#888; float:right;">—</span><br>
    Stato: <span id="dbg-state" style="color:#f80; float:right; font-weight:bold;">IN ATTESA</span>
`;
document.body.appendChild(debugDiv);

const dbg = {
    frame: 0,
    updateFrame() {
        this.frame++;
        document.getElementById('dbg-frame').textContent = this.frame;
    },
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
        setSpan('dbg-legsx', state.gambaSx);
        setSpan('dbg-legdx', state.gambaDx);
    },
    setKali(ok) {
        const el = document.getElementById('dbg-kali');
        if (el) { el.textContent = ok ? '✅' : '❌'; el.style.color = ok ? '#0f0' : '#f00'; }
    },
    setBones(n) {
        const el = document.getElementById('dbg-bones');
        el.textContent = n;
        el.style.color = n > 0 ? '#0f0' : '#f00';
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
// 6. SETUP RIG E MEMORIA ROTAZIONI
// ==========================================
const boneTargets = {}; 
const boneRestQuats = {};

const setupRig = (loadedModel) => {
    UI.log("Setup Rig in corso...", 'info');
    if (model) scene.remove(model);

    model = loadedModel;
    scene.add(model);
    skeleton = {};
    
    for (let key in boneTargets) delete boneTargets[key];
    for (let key in boneRestQuats) delete boneRestQuats[key];

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
                    .replace(/[:\s_]/g, '')
                    .trim();
                
                skeleton[name] = bone;
                boneRestQuats[name] = bone.quaternion.clone(); 
                boneCount++;
            });
        }
    });

    dbg.setBones(boneCount);
    UI.log(`Rig OK — ${boneCount} ossa trovate.`, 'info');

    if (boneCount === 0) {
        UI.log("ERRORE: nessuna osso trovata! Modello non valido.", 'error');
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
// 8. LOGICA DI TARGETING ESCLUSIVA PER MIXAMO (SWIZZLING)
// ==========================================
const setBoneTarget = (name, rotation, lerpSpeed = 0.35, map = { x: 'x', y: 'y', z: 'z', ix: 1, iy: 1, iz: 1 }, isActive = true) => {
    const bone = findBone(name);
    if (!bone) return;

    const restQuat = boneRestQuats[name] || new THREE.Quaternion();

    // FALLBACK A T-POSE: essenziale per stabilizzare arti persi dalla webcam
    if (!isActive || !rotation) {
        boneTargets[name] = { bone: bone, target: restQuat, lerp: lerpSpeed * 0.5 };
        return;
    }

    try {
        // SWIZZLING: Mappiamo dinamicamente gli assi VRM di Kalidokit 
        // sui caotici assi locali di Mixamo. 
        // Es: la rotazione X (map.x) potrebbe leggere il valore Z di Kalidokit.
        const rx = rotation[map.x] * map.ix;
        const ry = rotation[map.y] * map.iy;
        const rz = rotation[map.z] * map.iz;

        const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
        const deltaQuat = new THREE.Quaternion().setFromEuler(euler);
        
        // Applichiamo la rotazione locale partendo rigorosamente dalla T-Pose zero
        const targetQuat = new THREE.Quaternion().copy(restQuat).multiply(deltaQuat);

        boneTargets[name] = { bone: bone, target: targetQuat, lerp: lerpSpeed };
    } catch (e) {
        console.error(`[Mocap Error] Fallito il targeting per ${name}:`, e);
    }
};

const isPartVisible = (landmarks, indices, minConf = 0.35) => {
    if (!landmarks) return false;
    return indices.every(i => landmarks[i] && landmarks[i].visibility > minConf);
};


// ==========================================
// 9. CALLBACK MEDIAPIPE (CORE MIXAMO & MIRRORING)
// ==========================================
const videoElement = document.getElementById('input_video');

const onResults = (results) => {
    dbg.updateFrame();
    if (!mocapActive || !model) return;

    const poseLms = results.poseLandmarks;
    const faceLms = results.faceLandmarks;
    const worldLandmarks = results.poseWorldLandmarks || results.ea || results.za || null;

    const trackingState = {
        testa: !!faceLms,
        corpo: isPartVisible(poseLms, [11, 12]), 
        braccioSx: isPartVisible(poseLms, [13, 15]), 
        braccioDx: isPartVisible(poseLms, [14, 16]), 
        gambaSx: isPartVisible(poseLms, [25, 27]), 
        gambaDx: isPartVisible(poseLms, [26, 28])
    };

    dbg.updateParts(trackingState);

    // --- MAPPATURA ASSI SPECIFICA PER RIG MIXAMO ---
    
    // Testa e Busto mantengono un mapping abbastanza standard, 
    // ma invertiamo la Z per evitare flessioni anomale del torso.
    const mixamoSpineMap = { x: 'x', y: 'y', z: 'z', ix: 1, iy: 1, iz: -1 }; 

    // BRACCIA MIXAMO: Qui avviene la magia. 
    // Scambiamo la Y con la Z (o X con Y) perché in Mixamo l'asse del braccio corre in direzioni diverse.
    // L'input DX guida il lato SX dell'avatar (Mirroring da specchio).
    
    // Braccio Sinistro dell'Avatar (Riceve input braccio destro webcam)
    const mixamoLeftArmMap = { x: 'z', y: 'y', z: 'x', ix: -1, iy: 1, iz: 1 }; 
    
    // Braccio Destro dell'Avatar (Riceve input braccio sinistro webcam)
    // In Mixamo il lato destro è capovolto, quindi invertiamo pesantemente i segni di Y e Z
    const mixamoRightArmMap = { x: 'z', y: 'y', z: 'x', ix: -1, iy: -1, iz: -1 }; 

    // Gambe Mixamo (Solitamente la Y è invertita)
    const mixamoLegMap = { x: 'x', y: 'y', z: 'z', ix: 1, iy: -1, iz: 1 };

    // --- LAYER POSE ---
    if (poseLms && worldLandmarks) {
        try {
            const rp = Kalidokit.Pose.solve(
                worldLandmarks, poseLms, { runtime: "mediapipe", video: videoElement }
            );

            dbg.setKali(!!rp);

            if (rp) {
                // CORPO
                setBoneTarget("hips", rp.Hips ? rp.Hips.rotation : null, 0.3, mixamoSpineMap, trackingState.corpo);
                setBoneTarget("spine", rp.Spine, 0.3, mixamoSpineMap, trackingState.corpo);

                // MIRRORING LOGICO INCROCIATO SULLE BRACCIA MIXAMO
                
                // Input Destro Utente -> Osso Sinistro Avatar
                setBoneTarget("leftupperarm",  rp.RightUpperArm, 0.35, mixamoLeftArmMap, trackingState.braccioDx);
                setBoneTarget("leftforearm",   rp.RightLowerArm, 0.35, mixamoLeftArmMap, trackingState.braccioDx);
                setBoneTarget("lefthand",      rp.RightHand,     0.35, mixamoLeftArmMap, trackingState.braccioDx);

                // Input Sinistro Utente -> Osso Destro Avatar
                setBoneTarget("rightupperarm", rp.LeftUpperArm, 0.35, mixamoRightArmMap, trackingState.braccioSx);
                setBoneTarget("rightforearm",  rp.LeftLowerArm, 0.35, mixamoRightArmMap, trackingState.braccioSx);
                setBoneTarget("righthand",     rp.LeftHand,     0.35, mixamoRightArmMap, trackingState.braccioSx);

                // GAMBE
                setBoneTarget("leftupperleg", rp.RightUpperLeg, 0.3, mixamoLegMap, trackingState.gambaDx);
                setBoneTarget("leftlowerleg", rp.RightLowerLeg, 0.3, mixamoLegMap, trackingState.gambaDx);

                setBoneTarget("rightupperleg",  rp.LeftUpperLeg,  0.3, mixamoLegMap, trackingState.gambaSx);
                setBoneTarget("rightlowerleg",  rp.LeftLowerLeg,  0.3, mixamoLegMap, trackingState.gambaSx);
            }
        } catch (error) {
            console.warn("[Pose solve error]", error);
        }
    } else {
        dbg.setKali(false);
    }

    // --- LAYER FACE ---
    if (trackingState.testa) {
        try {
            const rf = Kalidokit.Face.solve(faceLms, {
                runtime: "mediapipe", video: videoElement
            });

            if (rf && rf.head) {
                const h = rf.head;
                // Eulers custom per la rotazione specchiata della testa
                const headRot = { x: -h.x * 0.5, y: -h.y * 0.5, z: h.z * 0.5 };
                setBoneTarget("neck", headRot, 0.35, { x: 'x', y: 'y', z: 'z', ix: 1, iy: 1, iz: 1 }, true);
                setBoneTarget("head", headRot, 0.35, { x: 'x', y: 'y', z: 'z', ix: 1, iy: 1, iz: 1 }, true);
            }
        } catch (error) {
            console.warn("[Face solve error]", error);
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
        enableSegmentation: false, 
        smoothSegmentation: false,
        minDetectionConfidence: 0.3,
        minTrackingConfidence: 0.3,
        refineFaceLandmarks: false,
    });

    holistic.onResults(onResults);

    new window.Camera(videoElement, {
        onFrame: async () => {
            await holistic.send({ image: videoElement });
        },
        width: 640,
        height: 480
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
// 11. RENDER LOOP (Animazione Continua)
// ==========================================
(function animate() {
    requestAnimationFrame(animate);
    
    if (mocapActive && model) {
        for (const key in boneTargets) {
            const data = boneTargets[key];
            data.bone.quaternion.slerp(data.target, data.lerp);
        }
    }

    if (model) model.updateMatrixWorld(true);
    controls.update();
    renderer.render(scene, camera);
})();
