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
        this.log(`Avvio operazione: ${message}`, 'info');
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
        
        if(level === 'error') console.error(message);
        else if(level === 'warn') console.warn(message);
        else console.log(message);
    },
    
    hideLoading() {
        this.log("Chiusura Overlay...", 'info');
        this.overlay.style.opacity = '0';
        this.overlay.style.pointerEvents = 'none';
        setTimeout(() => {
            this.overlay.style.display = 'none';
        }, 300);
    },
    
    setTrackerReady() {
        this.status.innerText = "Tracking Attivo";
        this.status.className = "status-online";
        this.log("Sistema di tracking attivato con successo.", 'info');
    }
};

UI.log("Inizializzazione Web Mocap Studio avviata...", "info");

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
    UI.log("Generazione Gerarchia Ossa...", 'info');
    if (model) scene.remove(model); 
    
    model = loadedModel;
    scene.add(model);
    
    skeleton = {};
    let boneCount = 0;
    model.traverse((obj) => {
        if (obj.isBone) {
            const standardName = obj.name.replace('mixamorig', '').replace(':', '').toLowerCase();
            skeleton[standardName] = obj;
            boneCount++;
        }
    });
    
    UI.log(`Rig Setup Completato. Trovate ${boneCount} ossa.`, 'info');
    UI.hideLoading(); 
};

document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    UI.showLoading(`Lettura file ${file.name}...`, 0);
    UI.log(`Formato file rilevato: ${file.name.split('.').pop()}`, 'info');
    
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    
    reader.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = (event.loaded / event.total) * 100;
            UI.updateProgress(percent);
        }
    };
    
    reader.onload = (event) => {
        UI.log("File caricato in memoria. Inizio Parsing...", 'info');
        UI.updateProgress(100);
        
        setTimeout(() => {
            const contents = event.target.result;
            
            try {
                if (extension === 'gltf' || extension === 'glb') {
                    UI.log("Avvio GLTFLoader...", 'info');
                    const loader = new GLTFLoader();
                    loader.parse(contents, '', (gltf) => {
                        UI.log("GLTF Parsato con successo.", 'info');
                        setupRig(gltf.scene);
                    }, (err) => { 
                        UI.log(`Errore loader GLTF: ${err}`, 'error');
                        alert("Impossibile leggere il file GLB/GLTF.");
                        UI.hideLoading(); 
                    });
                    
                } else if (extension === 'fbx') {
                    UI.log("Avvio FBXLoader. Attendere...", 'warn');
                    const loader = new FBXLoader();
                    const fbxModel = loader.parse(contents);
                    UI.log("FBX Parsato con successo.", 'info');
                    fbxModel.scale.set(0.01, 0.01, 0.01); 
                    setupRig(fbxModel);
                }
            } catch (err) {
                UI.log(`Eccezione Critica: ${err.message}`, 'error');
                UI.hideLoading();
            }
        }, 100); 
    };
    
    reader.readAsArrayBuffer(file); 
});

// ==========================================
// 4. IK SOLVER (AVATAR MASKING)
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
    if (!model) return;

    // --- LAYER 1: ISOLAMENTO CORPO ---
    // Questo tracker si basa sulla posizione delle spalle e del bacino.
    if (results.poseLandmarks) {
        const riggedPose = Kalidokit.Pose.solve(results.poseWorldLandmarks, results.poseLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });

        if (riggedPose) {
            // Nota: Abbiamo Rimosso il Neck da qui!
            rigBone("hips", riggedPose.Hips.rotation, 0.1);
            rigBone("spine", riggedPose.Spine.rotation);
            rigBone("rightupperarm", riggedPose.RightUpperArm.rotation);
            rigBone("rightforearm", riggedPose.RightLowerArm.rotation);
            rigBone("leftupperarm", riggedPose.LeftUpperArm.rotation);
            rigBone("leftforearm", riggedPose.LeftLowerArm.rotation);
        }
    }

    // --- LAYER 2: ISOLAMENTO TESTA/VISO ---
    // Questo tracker si basa su una rete neurale ad alta densità (FaceMesh)
    // che rileva i micromovimenti indipendentemente dal resto del corpo.
    if (results.faceLandmarks) {
        const riggedFace = Kalidokit.Face.solve(results.faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement
        });

        if (riggedFace) {
            // riggedFace.head ci restituisce le rotazioni X, Y, Z della testa
            const headRot = riggedFace.head;
            
            // Distribuiamo la rotazione al 50% sul collo e 50% sulla testa.
            // In Unity lo faresti con i pesi delle ossa, qui dimezziamo i radianti.
            // Questo evita l'effetto "collo spezzato" tipico del Mocap a osso singolo.
            rigBone("neck", { x: headRot.x * 0.5, y: headRot.y * 0.5, z: headRot.z * 0.5 }, 0.5);
            rigBone("head", { x: headRot.x * 0.5, y: headRot.y * 0.5, z: headRot.z * 0.5 }, 0.5);
        }
    }
};

// ==========================================
// 5. INIZIALIZZAZIONE MEDIAPIPE
// ==========================================
UI.showLoading("Download Modelli IA MediaPipe...", 10);
UI.log("Connessione ai CDN di jsdelivr per Holistic...", 'info');

try {
    const holistic = new window.Holistic({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
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
        UI.log("Webcam avviata. Sistema Ready.", 'info');
        UI.updateProgress(100);
        UI.setTrackerReady();
        setTimeout(() => UI.hideLoading(), 800);
    }).catch(err => {
        UI.log(`Errore fotocamera: ${err.message}`, 'error');
        document.getElementById('loading-text').innerText = "Accesso alla Fotocamera Negato.";
    });
} catch (e) {
    UI.log(`Errore inizializzazione: ${e.message}`, 'error');
}

// Render Loop Principale
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
