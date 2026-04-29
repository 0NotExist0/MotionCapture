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
        this.log(message, 'info');
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
// 3. CARICAMENTO ASSET & PREFAB
// ==========================================
const setupRig = (loadedModel) => {
    UI.log("Avatar Mapping in corso...", 'info');
    if (model) scene.remove(model); 
    
    model = loadedModel;
    scene.add(model);
    
    skeleton = {};
    let boneCount = 0;
    
    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa, roughness: 0.6, metalness: 0.1, skinning: true
    });

    model.traverse((obj) => {
        if (obj.isMesh) obj.material = defaultMaterial;
        
        if (obj.isBone) {
            // Puliamo il nome di Mixamo
            let name = obj.name.toLowerCase();
            name = name.replace('mixamorig', '').replace(':', '').replace('_', '');
            skeleton[name] = obj;
            boneCount++;
        }
    });
    
    UI.log(`Avatar configurato. Ossa trovate: ${boneCount}`, 'info');
    UI.hideLoading(); 
};

document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    UI.showLoading(`Lettura file ${file.name}...`, 0);
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    
    reader.onprogress = (event) => {
        if (event.lengthComputable) UI.updateProgress((event.loaded / event.total) * 100);
    };
    
    reader.onload = (event) => {
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
                UI.log(`Errore FBX: ${err.message}`, 'error');
                UI.hideLoading();
            }
        }, 100); 
    };
    reader.readAsArrayBuffer(file); 
});

// ==========================================
// 4. IK SOLVER & HUMANOID RETARGETING
// ==========================================

// Il nostro "Configure Avatar": mappa i nomi ideali ai nomi reali di Mixamo
const findBone = (targetName) => {
    if (!skeleton) return null;
    
    // Se l'osso esiste col nome esatto, usalo
    if (skeleton[targetName]) return skeleton[targetName];
    
    // Altrimenti, cerca gli Alias noti di Mixamo
    const aliases = {
        "rightupperarm": "rightarm",
        "leftupperarm": "leftarm",
        "rightlowerarm": "rightforearm",
        "leftlowerarm": "leftforearm",
        "chest": "spine1", // Mixamo usa spine1 o spine2 per il petto
        "neck": "neck",
        "head": "head",
        "hips": "hips",
        "spine": "spine"
    };

    const mixamoName = aliases[targetName];
    if (mixamoName && skeleton[mixamoName]) {
        return skeleton[mixamoName];
    }
    
    return null;
};

const rigBone = (name, rotation, lerp = 0.3) => {
    if (!rotation) return; 
    
    // Usiamo il sistema di ricerca Alias invece della chiamata diretta
    const bone = findBone(name.toLowerCase());
    if (!bone) return;
    
    try {
        const target = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x, rotation.y, rotation.z)
        );
        bone.quaternion.slerp(target, lerp);
    } catch (e) {
        console.error("Errore rotazione:", e);
    }
};

const videoElement = document.getElementById('input_video');

// Variabile di debug per essere sicuri che la webcam stia inviando dati
let frameCounter = 0;

const onResults = (results) => {
    if (!model) return;

    // Piccola logica per farti sapere nella console F12 che i dati stanno arrivando
    frameCounter++;
    if (frameCounter === 60) {
        console.log("MediaPipe Tracking Data: OK");
        frameCounter = 0;
    }

    // --- LAYER CORPO ---
    if (results.poseLandmarks) {
        const riggedPose = Kalidokit.Pose.solve(results.poseWorldLandmarks, results.poseLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });

        if (riggedPose) {
            if(riggedPose.Hips) rigBone("hips", riggedPose.Hips.rotation, 0.1);
            if(riggedPose.Spine) rigBone("spine", riggedPose.Spine.rotation);
            if(riggedPose.Chest) rigBone("chest", riggedPose.Chest.rotation);
            
            // Usiamo i nomi standard di Kalidokit, la funzione findBone li tradurrà per Mixamo
            if(riggedPose.RightUpperArm) rigBone("rightupperarm", riggedPose.RightUpperArm.rotation);
            if(riggedPose.RightLowerArm) rigBone("rightlowerarm", riggedPose.RightLowerArm.rotation);
            if(riggedPose.LeftUpperArm) rigBone("leftupperarm", riggedPose.LeftUpperArm.rotation);
            if(riggedPose.LeftLowerArm) rigBone("leftlowerarm", riggedPose.LeftLowerArm.rotation);
        }
    }

    // --- LAYER TESTA ---
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
// 5. INIZIALIZZAZIONE MEDIAPIPE
// ==========================================
UI.showLoading("Avvio MediaPipe Engine...", 10);

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
        onFrame: async () => { await holistic.send({image: videoElement}); },
        width: 640, height: 480
    });
    
    cameraUtils.start().then(() => {
        UI.updateProgress(100);
        document.getElementById('status-indicator').innerText = "Tracking Attivo";
        document.getElementById('status-indicator').className = "status-online";
        setTimeout(() => UI.hideLoading(), 800);
    });
} catch (e) {
    UI.log(`Errore telecamera: ${e.message}`, 'error');
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
