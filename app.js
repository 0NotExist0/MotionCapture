import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'; // Aggiunto il Loader FBX
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as Kalidokit from 'kalidokit';

// ==========================================
// 1. SETUP SCENA (Hierarchy & Inspector)
// ==========================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

let model = null;
let skeleton = {}; 

// ==========================================
// 2. LOGICA DI CARICAMENTO MULTI-FORMATO
// ==========================================
// Funzione helper per analizzare il Rig (equivalente a GetComponentInChildren<Transform>())
const setupRig = (loadedModel) => {
    if (model) scene.remove(model); // Pulisce la scena dal modello precedente
    
    model = loadedModel;
    scene.add(model);
    
    // Mappatura delle ossa
    skeleton = {};
    model.traverse((obj) => {
        if (obj.isBone) {
            // Rimuoviamo i prefissi di Mixamo e portiamo tutto in minuscolo
            const standardName = obj.name.replace('mixamorig', '').replace(':', '').toLowerCase();
            skeleton[standardName] = obj;
        }
    });
    console.log("Rig Analizzato. Ossa trovate:", Object.keys(skeleton));
};

document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Estrae l'estensione del file per capire quale loader usare
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    
    reader.onload = (event) => {
        const contents = event.target.result;
        
        if (extension === 'gltf' || extension === 'glb') {
            console.log("Parsing modello GLTF/GLB...");
            const loader = new GLTFLoader();
            loader.parse(contents, '', (gltf) => {
                setupRig(gltf.scene);
            }, (err) => console.error(err));
            
        } else if (extension === 'fbx') {
            console.log("Parsing modello FBX...");
            const loader = new FBXLoader();
            // L'FBX loader accetta direttamente l'ArrayBuffer
            try {
                const fbxModel = loader.parse(contents);
                // Molti FBX di Mixamo sono 100 volte più grandi del normale in ThreeJS (differenza di scala cm/m)
                fbxModel.scale.set(0.01, 0.01, 0.01); 
                setupRig(fbxModel);
            } catch (err) {
                console.error("Errore nel parsing FBX. Assicurati che non sia un FBX ASCII (ThreeJS supporta solo FBX Binari):", err);
            }
        } else {
            console.warn("Formato non supportato: " + extension);
        }
    };
    
    // Leggiamo come ArrayBuffer, che va bene sia per GLB binari che per FBX binari
    reader.readAsArrayBuffer(file); 
});

// ==========================================
// 3. IK SOLVER (Animator Update)
// ==========================================
const rigBone = (name, rotation, lerp = 0.3) => {
    const bone = skeleton[name.toLowerCase()];
    if (!bone) return;
    
    const target = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rotation.x, rotation.y, rotation.z)
    );
    // SmoothDamp / Slerp per movimenti fluidi
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
// 4. INIZIALIZZAZIONE TRACKER
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
    cameraUtils.start();
} catch (e) {
    console.error("Errore inizializzazione MediaPipe:", e);
}

// Main Render Loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
