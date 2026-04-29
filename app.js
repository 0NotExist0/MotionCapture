import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Kalidokit from 'kalidokit';

// ==========================================
// 1. UI MANAGER (Il tuo UIManager.cs)
// ==========================================
const UI = {
    overlay: document.getElementById('loading-overlay'),
    text: document.getElementById('loading-text'),
    bar: document.getElementById('progress-bar'),
    status: document.getElementById('status-indicator'),
    
    showLoading(message, progress = 0) {
        this.overlay.style.display = 'flex';
        this.text.innerText = message;
        this.bar.style.width = progress + '%';
    },
    
    updateProgress(progress) {
        this.bar.style.width = progress + '%';
    },
    
    hideLoading() {
        this.overlay.style.opacity = '0';
        setTimeout(() => this.overlay.style.display = 'none', 300); // Dissolvenza in uscita
    },
    
    setTrackerReady() {
        this.status.innerText = "Tracking Attivo";
        this.status.className = "status-online";
    }
};

// Mostra caricamento iniziale
UI.showLoading("Download Modelli IA (Holistic)...", 10);

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

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// Aggiungiamo una griglia di riferimento (come in Scene View)
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
    
    console.log("Rig Setup Completato.");
    UI.hideLoading(); // File elaborato, togliamo l'overlay
};

document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    UI.showLoading(`Lettura file ${file.name}...`, 0);
    
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    
    // Simula una AsyncOperation per l'UI durante la lettura in memoria
    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            UI.updateProgress(percent);
        }
    };
    
    reader.onload = (event) => {
        UI.showLoading("Estrazione e Compilazione Mesh...", 100);
        
        // Timeout per permettere al browser di renderizzare il testo prima di bloccarsi col parsing
        setTimeout(() => {
            const contents = event.target.result;
            
            if (extension === 'gltf' || extension === 'glb') {
                const loader = new GLTFLoader();
                loader.parse(contents, '', (gltf) => {
                    setupRig(gltf.scene);
                }, (err) => { console.error(err); UI.hideLoading(); });
                
            } else if (extension === 'fbx') {
                const loader = new FBXLoader();
                try {
                    const fbxModel = loader.parse(contents);
                    fbxModel.scale.set(0.01, 0.01, 0.01); 
                    setupRig(fbxModel);
                } catch (err) {
                    alert("Errore FBX. Assicurati che sia Binario, non ASCII.");
                    console.error(err);
                    UI.hideLoading();
                }
            } else {
                alert("Formato non supportato.");
                UI.hideLoading();
            }
        }, 100); 
    };
    
    reader.readAsArrayBuffer(file); 
});

// ==========================================
// 4. IK SOLVER
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
// 5. INIZIALIZZAZIONE MEDIAPIPE E WEBCAM
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
    
    // Quando la camera si accende, il sistema è pronto
    cameraUtils.start().then(() => {
        UI.updateProgress(100);
        UI.setTrackerReady();
        
        // Aspetta mezzo secondo per far vedere il 100% all'utente, poi nascondi
        setTimeout(() => {
            if(!model) UI.showLoading("In attesa del Modello...", 100);
            else UI.hideLoading();
        }, 500);
        
    });
} catch (e) {
    console.error("Errore inizializzazione MediaPipe:", e);
    document.getElementById('loading-text').innerText = "Errore di Inizializzazione.";
}

// Render Loop Principale
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
