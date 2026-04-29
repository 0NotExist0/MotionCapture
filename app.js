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
// 2. SETUP SCENA 3D
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

const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
scene.add(gridHelper);

let model = null;
let skeleton = {};

window.addEventListener('resize', () => {
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

// ==========================================
// 3. MAPPA ALIAS OSSA MIXAMO
// Copre varianti di naming: snake_case, camelCase, con/senza prefisso
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
    'rightlowerleg': ['rightlowerleg', 'rightcalf', 'rshin', 'right_lower_leg', 'rightcalf'],
    'rightfoot':     ['rightfoot', 'rfoot', 'right_foot'],
    'leftupperleg':  ['leftupperleg', 'leftleg', 'lthigh', 'left_upper_leg', 'leftthigh'],
    'leftlowerleg':  ['leftlowerleg', 'leftcalf', 'lshin', 'left_lower_leg', 'leftcalf'],
    'leftfoot':      ['leftfoot', 'lfoot', 'left_foot'],
};

// Ricerca osso con fallback sugli alias
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
// 4. SETUP RIG — Fix: legge ossa da SkinnedMesh
// ==========================================
const setupRig = (loadedModel) => {
    UI.log("Generazione Gerarchia Ossa e Fix Materiali...", 'info');
    if (model) scene.remove(model);

    model = loadedModel;
    scene.add(model);
    skeleton = {};

    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        roughness: 0.6,
        metalness: 0.1,
        // skinning: true è deprecato in THREE r152+, non serve più
    });

    let boneCount = 0;

    model.traverse((obj) => {
        // Fix materiali su tutte le mesh
        if (obj.isMesh || obj.isSkinnedMesh) {
            obj.material = defaultMaterial;
        }

        // FIX PRINCIPALE: leggiamo le ossa direttamente da SkinnedMesh.skeleton.bones
        // invece di cercare obj.isBone (spesso non funziona con GLB/FBX di Mixamo)
        if (obj.isSkinnedMesh && obj.skeleton) {
            obj.skeleton.bones.forEach((bone) => {
                // FIX: replace con regex /g per rimuovere TUTTE le occorrenze
                let name = bone.name.toLowerCase()
                    .replace(/mixamorig/gi, '')  // rimuove prefisso Mixamo
                    .replace(/:/g, '')            // rimuove ":"
                    .replace(/_/g, '')            // FIX: era replace('_','') — sostituiva solo la prima!
                    .replace(/\s/g, '')           // rimuove spazi
                    .trim();

                skeleton[name] = bone;
                boneCount++;
            });
        }
    });

    UI.log(`Rig Setup Completato. Trovate ${boneCount} ossa.`, 'info');

    // Log diagnostico: mostra i nomi normalizzati trovati
    const boneNames = Object.keys(skeleton);
    console.log("=== DIZIONARIO OSSA NORMALIZZATE ===", boneNames);
    UI.log(`Ossa trovate: ${boneNames.slice(0, 6).join(', ')}...`, 'info');

    if (boneCount === 0) {
        UI.log("ATTENZIONE: 0 ossa trovate! Controlla che il modello sia riggato (ha SkinnedMesh).", 'error');
    }

    UI.hideLoading();
};

// ==========================================
// 5. CARICAMENTO FILE
// ==========================================
document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    UI.showLoading(`Lettura file ${file.name}...`, 0);
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            UI.updateProgress((event.loaded / event.total) * 100);
        }
    };

    reader.onload = (event) => {
        UI.log("File caricato in memoria. Inizio Parsing...", 'info');
        UI.updateProgress(100);

        setTimeout(() => {
            const contents = event.target.result;
            try {
                if (extension === 'glb' || extension === 'gltf') {
                    const loader = new GLTFLoader();
                    loader.parse(contents, '', (gltf) => setupRig(gltf.scene), err => { throw err; });
                } else if (extension === 'fbx') {
                    const loader = new FBXLoader();
                    const fbxModel = loader.parse(contents);
                    fbxModel.scale.set(0.01, 0.01, 0.01);
                    setupRig(fbxModel);
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
// 6. IK SOLVER — usa findBone con alias
// ==========================================
const rigBone = (name, rotation, lerp = 0.3) => {
    if (!skeleton || !rotation) return;

    // FIX: usa findBone invece di skeleton[name] diretto
    const bone = findBone(name);
    if (!bone) return;

    try {
        const target = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x, rotation.y, rotation.z)
        );
        bone.quaternion.slerp(target, lerp);
    } catch (e) {
        console.error("Errore Slerp su osso:", name, e);
    }
};

// ==========================================
// 7. CALLBACK MEDIAPIPE
// ==========================================
const videoElement = document.getElementById('input_video');

const onResults = (results) => {
    if (!model) return;

    // --- POSE ---
    if (results.poseLandmarks) {
        const riggedPose = Kalidokit.Pose.solve(
            results.poseWorldLandmarks,
            results.poseLandmarks,
            { runtime: "mediapipe", video: videoElement }
        );

        if (riggedPose) {
            if (riggedPose.Hips)         rigBone("hips",          riggedPose.Hips.rotation,         0.1);
            if (riggedPose.Spine)        rigBone("spine",         riggedPose.Spine.rotation,          0.3);
            if (riggedPose.RightUpperArm) rigBone("rightupperarm", riggedPose.RightUpperArm.rotation, 0.3);
            if (riggedPose.RightLowerArm) rigBone("rightforearm",  riggedPose.RightLowerArm.rotation, 0.3);
            if (riggedPose.LeftUpperArm)  rigBone("leftupperarm",  riggedPose.LeftUpperArm.rotation,  0.3);
            if (riggedPose.LeftLowerArm)  rigBone("leftforearm",   riggedPose.LeftLowerArm.rotation,  0.3);
            if (riggedPose.RightHand)    rigBone("righthand",     riggedPose.RightHand.rotation,     0.3);
            if (riggedPose.LeftHand)     rigBone("lefthand",      riggedPose.LeftHand.rotation,      0.3);
            if (riggedPose.RightUpperLeg) rigBone("rightupperleg", riggedPose.RightUpperLeg.rotation, 0.3);
            if (riggedPose.RightLowerLeg) rigBone("rightlowerleg", riggedPose.RightLowerLeg.rotation, 0.3);
            if (riggedPose.LeftUpperLeg)  rigBone("leftupperleg",  riggedPose.LeftUpperLeg.rotation,  0.3);
            if (riggedPose.LeftLowerLeg)  rigBone("leftlowerleg",  riggedPose.LeftLowerLeg.rotation,  0.3);
        }
    }

    // --- FACE ---
    if (results.faceLandmarks) {
        const riggedFace = Kalidokit.Face.solve(results.faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement
        });

        if (riggedFace && riggedFace.head) {
            const headRot = riggedFace.head;
            rigBone("neck", { x: headRot.x * 0.5, y: headRot.y * 0.5, z: headRot.z * 0.5 }, 0.5);
            rigBone("head", { x: headRot.x * 0.5, y: headRot.y * 0.5, z: headRot.z * 0.5 }, 0.5);
        }
    }
};

// ==========================================
// 8. INIZIALIZZAZIONE MEDIAPIPE
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

    const cameraUtils = new window.Camera(videoElement, {
        onFrame: async () => { await holistic.send({ image: videoElement }); },
        width: 640,
        height: 480
    });

    cameraUtils.start().then(() => {
        UI.updateProgress(100);
        UI.setTrackerReady();
        setTimeout(() => UI.hideLoading(), 800);
    });
} catch (e) {
    UI.log(`Errore telecamera: ${e.message}`, 'error');
    console.error(e);
}

// ==========================================
// 9. RENDER LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
