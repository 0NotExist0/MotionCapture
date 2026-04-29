import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';

// ==========================================
// 1. SETUP DELLA SCENA 3D
// ==========================================
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.4, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.4, 0);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040, 2));

let currentVrm = null;

// ==========================================
// 2. CARICAMENTO DEL MODELLO
// ==========================================
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

loader.load(
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
    (gltf) => {
        const vrm = gltf.userData.vrm;
        scene.add(vrm.scene);
        currentVrm = vrm;
        vrm.scene.rotation.y = Math.PI; 
    },
    (progress) => console.log('Caricamento...', 100.0 * (progress.loaded / progress.total), '%'),
    (error) => console.error('Errore loader:', error)
);

// Update Loop
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
// 3. MOTION CAPTURE & RIGGING
// ==========================================
const videoElement = document.querySelector('#input_video');

const rigRotation = (boneName, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentVrm) return;
    const Part = currentVrm.humanoid.getNormalizedBoneNode(boneName);
    if (!Part) return;
    
    let euler = new THREE.Euler(rotation.x * dampener, rotation.y * dampener, rotation.z * dampener, "XYZ");
    let targetQuaternion = new THREE.Quaternion().setFromEuler(euler);
    
    Part.quaternion.slerp(targetQuaternion, lerpAmount); 
};

const onResults = (results) => {
    if (!currentVrm) return;

    if (results.poseLandmarks) {
        const riggedPose = Kalidokit.Pose.solve(results.poseWorldLandmarks, results.poseLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        
        rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
        rigRotation("Spine", riggedPose.Spine.rotation, 1, 0.3);
        rigRotation("Chest", riggedPose.Chest.rotation, 1, 0.3);
        
        rigRotation("RightUpperArm", riggedPose.RightUpperArm.rotation, 1, 0.3);
        rigRotation("RightLowerArm", riggedPose.RightLowerArm.rotation, 1, 0.3);
        rigRotation("LeftUpperArm", riggedPose.LeftUpperArm.rotation, 1, 0.3);
        rigRotation("LeftLowerArm", riggedPose.LeftLowerArm.rotation, 1, 0.3);
        
        rigRotation("RightHand", riggedPose.RightHand.rotation, 1, 0.3);
        rigRotation("LeftHand", riggedPose.LeftHand.rotation, 1, 0.3);
    }

    if (results.faceLandmarks) {
        const riggedFace = Kalidokit.Face.solve(results.faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement
        });
        
        rigRotation("Neck", riggedFace.head, 0.7);
        
        const presetName = THREE.VRMExpressionPresetName;
        currentVrm.expressionManager.setValue(presetName.blink, riggedFace.eye.l);
        currentVrm.expressionManager.setValue(presetName.aa, riggedFace.mouth.y); 
    }
};

// ==========================================
// 4. INIZIALIZZAZIONE WEBCAM
// ==========================================
const holistic = new Holistic({
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

const cameraUtils = new Camera(videoElement, {
    onFrame: async () => {
        await holistic.send({image: videoElement});
    },
    width: 640,
    height: 480
});
cameraUtils.start();
