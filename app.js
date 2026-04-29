import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Kalidokit from 'kalidokit';

// ==========================================
// 1. UI MANAGER (Il nostro Canvas Manager)
// ==========================================
const UI = {
    overlay: document.getElementById('loading-overlay'),
    text: document.getElementById('loading-text'),
    bar: document.getElementById('progress-bar'),
    status: document.getElementById('status-indicator'),
    
    showLoading(message, progress = 0) {
        this.overlay.style.display = 'flex';
        this.overlay.style.opacity = '1';
        this.overlay.style.pointerEvents = 'all'; // Blocca i click sottostanti
        this.text.innerText = message;
        this.bar.style.width = progress + '%';
    },
    
    updateProgress(progress) {
        this.bar.style.width = progress + '%';
    },
    
    hideLoading() {
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none'; // Lascia passare i click durante la dissolvenza
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 300);
    },
    
    setTrackerReady() {
        this.status.innerText = "Tracking Attivo";
        this.status.className = "status-online";
    }
};

// Inizializzazione
UI.showLoading("Download Modelli IA (Holistic)...", 10);

// ==========================================
// 2. SETUP SCENA 3D (Hierarchy)
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

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// Griglia
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
// 3. CARICAMENTO ASSET & PREFAB (Importer)
// ==========================================
const setupRig = (loadedModel) => {
    if (model) scene.remove(model); 
    
    model = loadedModel;
    scene.add(model);
    
    skeleton = {};
    model.traverse((obj) => {
        if (obj.isBone) {
            const standardName = obj.name.replace('mixamorig', '').replace(':', '').toLowerCase();
            skeleton[standardName] = obj;
        }
    });
    
    console.log("Rig Setup Completato. Ossa:", Object.keys(skeleton));
    UI.hideLoading(); // Sblocca SEMPRE la UI alla fine
};

document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    UI.showLoading(`Lettura file ${file.name}...`, 0);
    
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    
    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            UI.updateProgress(percent);
        }
    };
    
    reader.onload = (event) => {
        UI.showLoading("Estrazione e Compilazione Mesh...", 100);
        
        setTimeout(() => {
            const contents = event.target.result;
            
            try {
                if (extension === 'gltf' || extension === 'glb') {
                    const loader = new GLTFLoader();
                    loader.parse(contents, '', (gltf) => {
                        setupRig(gltf.scene);
                    }, (err) => { 
                        console.error("Errore parse GLTF:", err); 
                        alert("Impossibile leggere il file GLB/GLTF.");
                        UI.hideLoading(); 
                    });
                    
                } else if (extension === 'fbx') {
                    const loader = new FBXLoader();
                    const fbxModel = loader.parse(contents);
                    fbxModel.scale.set(0.01, 0.01, 0.01); 
                    setupRig(fbxModel);
                } else {
                    alert("Formato non supportato.");
                    UI.hideLoading();
                }
            } catch (err) {
                console.error("Eccezione durante il caricamento:", err);
                alert("Errore critico durante il caricamento del file. Assicurati sia un formato valido (FBX Binario).");
                UI.hideLoading(); // Evita freeze se il file è corrotto
            }
        }, 100); 
    };
    
    reader.readAsArrayBuffer(file); 
});

// ==========================================
// 4. IK SOLVER (Update Loop)
// ==========================================
const rigBone = (name, rotation, lerp = 0.3) => {
    const bone = skeleton[name.toLowerCase()];
    if (!bone) return;
    
    const target = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rotation.x, rotation.y, rotation.z)
    );
    bone.quaternion.slerp(target, lerp);
};

const videoElement = document.getElementById('input_video');

const onResults = (results) => {
    if (!model || !results.poseLandmarks) return;

    const riggedPose = Kalidokit.Pose.solve(results.poseWorldLandmarks, results.poseLandmarks, {
        runtime: "mediapipe",
        video: videoElement,
    });

    if (riggedPose) {
        rigBone("hips", riggedPose.Hips.rotation, 0.1);
        rigBone("spine", riggedPose.Spine.rotation);
        rigBone("neck", riggedPose.Neck.rotation);
        
        rigBone("rightupperarm", riggedPose.RightUpperArm.rotation);
        rigBone("rightforearm", riggedPose.RightLowerArm.rotation);
        rigBone("leftupperarm", riggedPose.LeftUpperArm.rotation);
        rigBone("leftforearm", riggedPose.LeftLowerArm.rotation);
    }
};

// ==========================================
// 5. INIZIALIZZAZIONE MEDIAPIPE (Awake/Start)
// ==========================================
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
        UI.setTrackerReady();
        
        // IL FIX: Nascondiamo l'Overlay in ogni caso, così puoi usare la UI!
        setTimeout(() => {
            UI.hideLoading();
        }, 500);
        
    });
} catch (e) {
    console.error("Errore inizializzazione MediaPipe:", e);
    document.getElementById('loading-text').innerText = "Errore di Inizializzazione della Telecamera.";
}

// Render Loop Principale
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
