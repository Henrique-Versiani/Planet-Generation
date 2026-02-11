const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;

    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;

    varying vec3 vNormal;
    varying vec3 vColor;

    void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        vNormal = mat3(uModel) * aNormal;
        vColor = aColor;
    }
`;

const fsSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vColor;
    
    uniform vec3 uLightDirection;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uLightDirection);
        float light = max(dot(normal, lightDir), 0.1);
        gl_FragColor = vec4(vColor * light, 1.0);
    }
`;

const vertexShader = Utils.createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = Utils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const program = Utils.createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);

const uModelLoc = gl.getUniformLocation(program, 'uModel');
const uViewLoc = gl.getUniformLocation(program, 'uView');
const uProjectionLoc = gl.getUniformLocation(program, 'uProjection');
const uLightDirLoc = gl.getUniformLocation(program, 'uLightDirection');
const aPosition = gl.getAttribLocation(program, 'aPosition');
const aNormal = gl.getAttribLocation(program, 'aNormal');
const aColor = gl.getAttribLocation(program, 'aColor');

const positionBuffer = gl.createBuffer();
const normalBuffer = gl.createBuffer();
const colorBuffer = gl.createBuffer();

const state = {
    noiseStrength: 0.12,
    noiseFreq: 1.5,
    waterLevel: 1.0,
    resolution: 4,
    treeDensity: 0
};

let currentNoise = new SimplexNoise(); 
let currentSeed = Math.random() * 1000; 
let vertexCount = 0;

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

let mouseRotX = 0;
let mouseRotY = 0;
let planetRotY = 0;
let autoRotateSpeed = 0.001;

let cameraDistance = 4.0;

const FIXED_LIGHT_DIR = [1.0, 1.0, 1.0];

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

window.addEventListener('mouseup', () => { isDragging = false; });

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    
    mouseRotY += deltaX * 0.005;
    mouseRotX += deltaY * 0.005;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();

    const zoomSpeed = 0.005;
    cameraDistance += e.deltaY * zoomSpeed;
    cameraDistance = Math.max(1.8, Math.min(10.0, cameraDistance));
}, { passive: false });

canvas.addEventListener('touchstart', (e) => {
    if(e.touches.length === 1) {
        isDragging = true;
        lastMouseX = e.touches[0].clientX;
        lastMouseY = e.touches[0].clientY;
    }
});

canvas.addEventListener('touchmove', (e) => {
    if(!isDragging) return;
    const deltaX = e.touches[0].clientX - lastMouseX;
    const deltaY = e.touches[0].clientY - lastMouseY;
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
    mouseRotY += deltaX * 0.005;
    mouseRotX += deltaY * 0.005;
    e.preventDefault();
});

window.addEventListener('touchend', () => isDragging = false);

function updatePlanetGeometry() {
    const planet = new IcoSphere(state.resolution); 
    planet.applyNoise(state.noiseStrength, state.noiseFreq, state.waterLevel, currentNoise);
    planet.generateColors(state.waterLevel); 
    planet.toFlatGeometry(); 
    planet.distributeTrees(state.treeDensity, currentSeed);
    planet.calculateNormals();

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.colors), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

    vertexCount = planet.vertices.length / 3;
}

function setupUI() {
    const elSpeed = document.getElementById('rotationSpeed');
    if(elSpeed) {
        elSpeed.addEventListener('input', (e) => {
            autoRotateSpeed = parseFloat(e.target.value);
        });
    }

    const inputs = ['resolution', 'noiseStrength', 'noiseFreq', 'waterLevel', 'treeDensity'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('input', (e) => {
                if(id === 'resolution' || id === 'treeDensity') state[id] = parseInt(e.target.value);
                else state[id] = parseFloat(e.target.value);
                updatePlanetGeometry();
            });
        }
    });

    document.getElementById('btnRegenerate').addEventListener('click', () => {
        currentNoise = new SimplexNoise();
        currentSeed = Math.random() * 1000;
        updatePlanetGeometry();
    });
}

const modelMatrix = mat4.create();
const viewMatrix = mat4.create();
const projectionMatrix = mat4.create();
const mouseRotMatrix = mat4.create();

mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
gl.uniformMatrix4fv(uProjectionLoc, false, projectionMatrix);

function render() {
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    mat4.lookAt(viewMatrix, [0, 0, cameraDistance], [0, 0, 0], [0, 1, 0]);
    gl.uniformMatrix4fv(uViewLoc, false, viewMatrix);

    if (!isDragging) {
        planetRotY += autoRotateSpeed;
    }

    mat4.identity(mouseRotMatrix);
    mat4.rotateX(mouseRotMatrix, mouseRotMatrix, mouseRotX);
    mat4.rotateY(mouseRotMatrix, mouseRotMatrix, mouseRotY);
    mat4.identity(modelMatrix);
    mat4.multiply(modelMatrix, mouseRotMatrix, modelMatrix);
    mat4.rotateY(modelMatrix, modelMatrix, planetRotY);
    gl.uniformMatrix4fv(uModelLoc, false, modelMatrix);
    
    const currentLightDir = vec3.create();
    vec3.transformMat4(currentLightDir, FIXED_LIGHT_DIR, mouseRotMatrix);
    gl.uniform3fv(uLightDirLoc, currentLightDir);
    
    if (vertexCount > 0) {
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    }

    requestAnimationFrame(render);
}

window.onload = function() {
    setupUI();
    updatePlanetGeometry();
    render();
};