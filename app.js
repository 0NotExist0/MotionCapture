import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';

// ==========================================
// 1. SETUP DELLA SCENA 3D (La nostra "Hierarchy")
// ==========================================
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.4, 3); // Posizioniamo la Main Camera

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.4, 0);

// Luci
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040, 2));

let currentVrm = null;

// ==========================================
// 2. CARICAMENTO DEL MODELLO (Instantiate del Prefab)
// ==========================================
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

// Passiamo ad AliciaSolid, un modello standard estremamente affidabile per i test VRM
loader.load(
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/AliciaSolid.vrm',
    (gltf) => {
        const vrm = gltf.userData.vrm;
        scene.add(vrm.scene);
        currentVrm = vrm;
        // Ruotiamo la root per farle guardare la telecamera (Y = 180 gradi)
        vrm.scene.rotation.y = Math.PI; 
        console.log("Modello VRM caricato e istanziato con successo!");
    },
    (progress) => console.log('Caricamento Modello...', 100.0 * (progress.loaded / progress.total), '%'),
    (error) => console.error('Errore loader Modello:', error)
);

// Update Loop (Il nostro MonoBehaviour.Update)
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    if (currentVrm) {
        currentVrm.update(clock.getDelta());
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==========================================
// 3. MOTION CAPTURE & RIGGING (L'Animator / IK Solver)
// ==========================================
const videoElement = document.querySelector('#input_video');

const rigRotation = (boneName, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentVrm) return;
    
    // Supporto ibrido: cerca l'osso normalizzato (VRM 1.0) o grezzo (VRM 0.0)
    const Part = currentVrm.humanoid.getNormalizedBoneNode(boneName) || currentVrm.humanoid.getRawBoneNode(boneName);
    if (!Part) return;
    
    let euler = new THREE.Euler(rotation.x * dampener, rotation.y * dampener, rotation.z * dampener, "XYZ");
    let targetQuaternion = new THREE.Quaternion().setFromEuler(euler);
    
    Part.quaternion.slerp(targetQuaternion, lerpAmount); 
};

// Callback richiamata ad ogni frame elaborato dalla webcam
const onResults = (results) => {
    if (!currentVrm) return;

    if (results.poseLandmarks) {
        const riggedPose = Kalidokit.Pose.solve(results.poseWorldLandmarks, results.poseLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        
        // I nomi passati come stringa devono essere lowerCamelCase per lo standard VRM
        rigRotation("hips", riggedPose.Hips.rotation, 0.7);
        rigRotation("spine", riggedPose.Spine.rotation, 1, 0.3);
        rigRotation("chest", riggedPose.Chest.rotation, 1, 0.3);
        
        rigRotation("rightUpperArm", riggedPose.RightUpperArm.rotation, 1, 0.3);
        rigRotation("rightLowerArm", riggedPose.RightLowerArm.rotation, 1, 0.3);
        rigRotation("leftUpperArm", riggedPose.LeftUpperArm.rotation, 1, 0.3);
        rigRotation("leftLowerArm", riggedPose.LeftLowerArm.rotation, 1, 0.3);
    }

    if (results.faceLandmarks) {
        const riggedFace = Kalidokit.Face.solve(results.faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement
        });
        
        rigRotation("neck", riggedFace.head, 0.7);
        
        // Gestione sicura delle Blendshapes
        if (currentVrm.expressionManager) {
            const presetName = THREE.VRMExpressionPresetName;
            currentVrm.expressionManager.setValue(presetName.blink, riggedFace.eye.l);
            currentVrm.expressionManager.setValue(presetName.aa, riggedFace.mouth.y); 
        }
    }
};

// ==========================================
// 4. INIZIALIZZAZIONE WEBCAM E SENSORI
// ==========================================
try {
    // Usiamo l'oggetto globale 'window' per agganciare gli script caricati dall'HTML
    const holistic = new window.Holistic({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
    });

    holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
        refineFaceLandmarks: true,
    });

    holistic.onResults(onResults);

    const cameraUtils = new window.Camera(videoElement, {
        onFrame: async () => {
            await holistic.send({image: videoElement});
        },
        width: 640,
        height: 480
    });
    
    cameraUtils.start().then(() => {
        console.log("Webcam avviata e collegata al sistema MediaPipe!");
    });
} catch (e) {
    console.error("Errore Critico nell'inizializzazione del tracking:", e);
}
