import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';

class Scene {
    constructor() {
        this.container = document.getElementById('container');
        this.canvas = document.getElementById('webgl');
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        
        this.init();
    }
    
    init() {
        // Setup
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.camera.position.z = 5;
        
        // Create record geometry
        const geometry = new THREE.CylinderGeometry(2, 2, 0.2, 64);
        const material = new THREE.MeshPhongMaterial({
            color: 0x111111,
            shininess: 200,
            metalness: 0.9,
            roughness: 0.1
        });
        this.record = new THREE.Mesh(geometry, material);
        this.record.rotation.x = 0.2; // Tilt the record slightly
        this.scene.add(this.record);
        
        // Add lights with color
        const ambientLight = new THREE.AmbientLight(0x6666ff, 0.5);
        this.scene.add(ambientLight);
        
        const pointLight = new THREE.PointLight(0xff3366, 1);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);
        
        // Add second point light for more dimension
        const pointLight2 = new THREE.PointLight(0x3366ff, 0.8);
        pointLight2.position.set(-5, -5, 2);
        this.scene.add(pointLight2);
        
        // Animation loop
        this.animate();
        
        // Event listeners
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Rotate record
        if (this.record) {
            this.record.rotation.y += 0.005;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Initialize the scene
new Scene(); 