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
    // --- AGGIUNGI QUESTA RIGA QUI ---
    if (MocapVisualAnnotations.css2dRenderer) {
        MocapVisualAnnotations.css2dRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
    }
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

// ==========================================
// 12. GESTIONE SALVATAGGIO E CARICAMENTO POSE
// ==========================================
const PoseManager = {
    /**
     * Salva la posa attuale del modello in un file JSON
     * @param {string} baseName Nome di base per il file esportato
     */
    saveCurrentPose(baseName = "MocapPose") {
        if (!model || Object.keys(skeleton).length === 0) {
            UI.log("Errore: Nessun modello caricato. Impossibile salvare la posa.", "error");
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const poseData = {
            name: `${baseName}_${timestamp}`,
            bones: {}
        };

        // Iteriamo su tutte le ossa mappate nell'oggetto skeleton
        for (const [boneName, bone] of Object.entries(skeleton)) {
            // Salviamo la posizione e la rotazione (Quaternione) locale dell'osso
            poseData.bones[boneName] = {
                position: {
                    x: bone.position.x,
                    y: bone.position.y,
                    z: bone.position.z
                },
                quaternion: {
                    x: bone.quaternion.x,
                    y: bone.quaternion.y,
                    z: bone.quaternion.z,
                    w: bone.quaternion.w
                }
            };
        }

        // Serializzazione in JSON
        const jsonString = JSON.stringify(poseData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        // Creazione e trigger automatico del link di download
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `${poseData.name}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // Pulizia
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);

        UI.log(`📸 Posa salvata con successo: ${poseData.name}.json`, "info");
    },

    /**
     * Carica una posa da un file JSON e la applica al modello
     * @param {string} jsonData Il contenuto testo del file JSON
     */
    loadPose(jsonData) {
        if (!model || Object.keys(skeleton).length === 0) {
            UI.log("Errore: Nessun modello caricato su cui applicare la posa.", "error");
            return;
        }

        try {
            const poseData = JSON.parse(jsonData);
            
            // Per disabilitare temporaneamente il tracking se attivo
            const wasMocapActive = mocapActive;
            if (wasMocapActive) {
                document.getElementById('mocap-btn').click(); // Ferma il mocap
            }

            for (const [boneName, transform] of Object.entries(poseData.bones)) {
                const bone = skeleton[boneName];
                if (bone) {
                    // Ripristina la posizione locale
                    bone.position.set(
                        transform.position.x,
                        transform.position.y,
                        transform.position.z
                    );
                    
                    // Ripristina la rotazione locale
                    bone.quaternion.set(
                        transform.quaternion.x,
                        transform.quaternion.y,
                        transform.quaternion.z,
                        transform.quaternion.w
                    );
                }
            }

            // Svuota i target del lerp per evitare che l'animator loop sovrascriva la posa statica
            for (let key in boneTargets) {
                delete boneTargets[key];
            }

            UI.log(`📂 Posa caricata e applicata: ${poseData.name}`, "info");

        } catch (error) {
            UI.log(`Errore nella lettura del file JSON della posa.`, "error");
            console.error("Pose Parse Error:", error);
        }
    }
};

// ==========================================
// 13. UI PER SALVATAGGIO POSE
// ==========================================
const injectPoseControls = () => {
    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = 'margin-top: 10px; display: flex; gap: 8px; justify-content: space-between;';

    // Pulsante di Salvataggio
    const saveBtn = document.createElement('button');
    saveBtn.innerText = '📸 Salva Frame';
    saveBtn.style.cssText = `
        flex: 1; padding: 10px; background: #2b5c8f; color: #fff;
        border: 2px solid #1a3f66; border-radius: 6px; font-weight: bold;
        cursor: pointer; transition: 0.2s;
    `;
    saveBtn.onmouseover = () => saveBtn.style.background = '#3c72ab';
    saveBtn.onmouseleave = () => saveBtn.style.background = '#2b5c8f';
    saveBtn.addEventListener('click', () => PoseManager.saveCurrentPose("CustomPose"));

    // Input File Nascosto per il caricamento
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => PoseManager.loadPose(event.target.result);
        reader.readAsText(file);
        fileInput.value = ''; // Reset per ricaricare lo stesso file se necessario
    });

    // Pulsante di Caricamento
    const loadBtn = document.createElement('button');
    loadBtn.innerText = '📂 Carica Posa';
    loadBtn.style.cssText = `
        flex: 1; padding: 10px; background: #8f6a2b; color: #fff;
        border: 2px solid #664a1a; border-radius: 6px; font-weight: bold;
        cursor: pointer; transition: 0.2s;
    `;
    loadBtn.onmouseover = () => loadBtn.style.background = '#a87f38';
    loadBtn.onmouseleave = () => loadBtn.style.background = '#8f6a2b';
    loadBtn.addEventListener('click', () => fileInput.click());

    controlsContainer.appendChild(saveBtn);
    controlsContainer.appendChild(loadBtn);
    controlsContainer.appendChild(fileInput);

    // Cerchiamo il contenitore del bottone del Mocap creato nello step 3 per affiancarli
    const mocapBtnWrapper = document.getElementById('mocap-btn')?.parentElement;
    
    if (mocapBtnWrapper) {
        mocapBtnWrapper.appendChild(controlsContainer);
    } else {
        // Fallback se l'UI non è stata ancora renderizzata correttamente
        controlsContainer.style.cssText += 'position: fixed; top: 70px; left: 16px; z-index: 9998; width: 200px;';
        document.body.appendChild(controlsContainer);
    }
};

// Inietta la UI una volta che il DOM è pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPoseControls);
} else {
    setTimeout(injectPoseControls, 100); // Piccolo ritardo per assicurarsi che il bottone mocap sia iniettato
}

// ==========================================
// 14. VISUAL ANNOTATIONS MODULE (NEW)
// ==========================================
// Rimpiazza completamente il vecchio VisualDebugger
// Implementa overlay 2D (video) e 3D (modello) come da schizzo utente.

// È necessario aggiungere un renderer CSS2D per mostrare etichette HTML sul modello 3D
// Assicurati che THREE.CSS2DRenderer sia caricato, ad esempio tramite script tag o import map.
// Se non lo hai, aggiungi questa riga all'inizio del file, dopo gli altri import:
// import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MocapVisualAnnotations = {
    canvas: null,
    ctx: null,
    videoEl: document.getElementById('input_video'),
    css2dRenderer: null,
    labels3d: {},

    // Configurazione dei punti da tracciare e numerare, mappando id schizzo a landmark/osso
    // Schizzo Id 1: Spalla DX, 2: Gomito DX, 3: Mano DX
    trackingJoints: {
        1: { lmIdx: 12, boneName: 'rightupperarm' },
        2: { lmIdx: 14, boneName: 'rightforearm' },
        3: { lmIdx: 16, boneName: 'righthand' }
    },

    init() {
        this.setup2DCanvas();
        this.setup3DLabels();
        
        // Hook nel loop di animazione principale per forzare il re-rendering dei label
        const originalAnimate = window.requestAnimationFrame;
        const self = this;
        window.requestAnimationFrame = function(callback) {
            self.update();
            return originalAnimate(callback);
        };
    },

    // --- OVERLAY 2D SULLA WEBCAM ---
    setup2DCanvas() {
        if (!this.videoEl) return;
        
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'mocap-2d-overlay';
        this.canvas.style.cssText = `
            position: absolute; top: 0; left: 0;
            pointer-events: none; z-index: 100;
        `;
        
        if (this.videoEl.parentElement) {
            this.videoEl.parentElement.style.position = 'relative';
            this.videoEl.parentElement.appendChild(this.canvas);
        }
        this.ctx = this.canvas.getContext('2d');
    },

    draw2DOverlay(poseLandmarks) {
        if (!this.ctx || !this.videoEl || !poseLandmarks) return;

        this.canvas.width = this.videoEl.clientWidth;
        this.canvas.height = this.videoEl.clientHeight;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Stile generale per i box e il testo
        const boxSize = 20;
        const textOffset = 8;
        this.ctx.font = '14px monospace';

        for (const [schizzoId, config] of Object.entries(this.trackingJoints)) {
            const lm = poseLandmarks[config.lmIdx];
            if (lm && lm.visibility > 0.35) {
                const x = lm.x * this.canvas.width;
                const y = lm.y * this.canvas.height;
                
                // Disegna box rosso
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.strokeRect(x - (boxSize/2), y - (boxSize/2), boxSize, boxSize);
                
                // Disegna numero dentro (colore di contrasto)
                this.ctx.fillStyle = '#ff0000';
                this.ctx.fillText(schizzoId, x - (textOffset/2), y + (textOffset/2));

                // Disegna coordinate per il punto della mano (Id 3), esattamente come nello schizzo
                if (schizzoId == '3') {
                    this.ctx.fillStyle = '#00ffcc'; // Colore per i dati, come nello schizzo
                    // Nello schizzo c'è "X: 30.1 Y: 40.5". Mostrerò i valori 2D normalizzati.
                    const text = ` X: ${lm.x.toFixed(2)} Y: ${lm.y.toFixed(2)}`;
                    this.ctx.fillText(text, x + (boxSize/2) + 5, y + (textOffset/2));
                }
            }
        }
    },

    // --- OVERLAY 3D SUL MODELLO ---
    setup3DLabels() {
        if (!typeof CSS2DRenderer === 'undefined') {
            console.error('THREE.CSS2DRenderer non trovato. Caricalo per gli overlay 3D.');
            return;
        }

        // Creiamo il renderer CSS2D e lo agganciamo alla viewport
        this.css2dRenderer = new CSS2DRenderer();
        this.css2dRenderer.setSize(viewport.clientWidth, viewport.clientHeight);
        this.css2dRenderer.domElement.style.position = 'absolute';
        this.css2dRenderer.domElement.style.top = '0px';
        this.css2dRenderer.domElement.style.pointerEvents = 'none';
        viewport.appendChild(this.css2dRenderer.domElement);

        // Creiamo e agganciamo i label ossei una volta che il modello è caricato
        const self = this;
        // Ascolta l'evento di completamento del setup del rig per aggiungere le etichette
        // Dobbiamo assicurarsi che setupRig emetta un evento o modifichi una flag
        // Per ora, creiamo una funzione che controllerà se il modello esiste
        this.create3DLabelsOnModelLoaded = () => {
            if (!model) return; // Riprova finché il modello non è caricato

            for (const [schizzoId, config] of Object.entries(this.trackingJoints)) {
                if (self.labels3d[schizzoId]) continue; // Salta se già creato

                const bone = findBone(config.boneName);
                if (bone) {
                    const labelDiv = self.create3DLabelElement(schizzoId);
                    const labelObject = new CSS2DObject(labelDiv);
                    bone.add(labelObject);
                    // Rimuoviamo il wireframe box dal vecchio debugger
                    self.labels3d[schizzoId] = labelObject;
                }
            }
        };
        // Aggiungiamo un check all'init, e all'update per agganciare i label
        // Se si ha un evento più pulito dal setupRig, usarlo.
        setTimeout(this.create3DLabelsOnModelLoaded, 500); 
    },

    create3DLabelElement(schizzoId) {
        // Creazione dell'HTML div per il label 3D, formattato come nello schizzo
        const div = document.createElement('div');
        div.id = `label-3d-${schizzoId}`;
        div.style.cssText = `
            font-family: monospace;
            background: rgba(0, 0, 0, 0.7);
            color: #00ffcc;
            padding: 4px;
            border: 1px solid #ff0000;
            font-size: 11px;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
        `;

        // Box numerato
        const box = document.createElement('div');
        box.style.cssText = `
            width: 14px; height: 14px;
            border: 1px solid #ff0000;
            display: flex; justify-content: center; align-items: center;
            color: #ff0000; font-weight: bold; font-size: 10px;
        `;
        box.textContent = schizzoId;
        div.appendChild(box);

        // Contenitore per i dati coordinate
        const dataContainer = document.createElement('div');
        dataContainer.id = `data-3d-${schizzoId}`;
        
        // Etichette X/Y/Z con punti interrogativi per la mano (Id 3), come nello schizzo
        const isHand = schizzoId == '3';
        const qMark = isHand ? '?' : '';
        dataContainer.innerHTML = `
            <span style="color:#aaa;">X:</span><span id="coord-x-${schizzoId}">0.00</span>${qMark} 
            <span style="color:#aaa;">Y:</span><span id="coord-y-${schizzoId}">0.00</span>${qMark} 
            <span style="color:#aaa;">Z:</span><span id="coord-z-${schizzoId}">0.00</span>${qMark}
        `;
        div.appendChild(dataContainer);
        
        return div;
    },

    update() {
        this.create3DLabelsOnModelLoaded(); // Assicura che i label siano attaccati se il modello è pronto

        if (!model || !this.css2dRenderer) return;

        // Renderizza il layer CSS2D sopra la scena WebGL
        this.css2dRenderer.render(scene, camera);
    },
    
    // Funzione helper per ottenere le coordinate world (assolute) di un osso
    getBoneWorldPos(boneName) {
        const bone = findBone(boneName);
        if (bone) {
            const worldPos = new THREE.Vector3();
            bone.getWorldPosition(worldPos);
            return worldPos;
        }
        return null;
    }
};

// Inizializza il modulo al caricamento
document.addEventListener('DOMContentLoaded', () => MocapVisualAnnotations.init());
