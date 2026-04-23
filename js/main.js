const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

const ext = gl.getExtension('WEBGL_depth_texture');
if (!ext) console.warn('Sem suporte a sombras avançadas.');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

// ─── Shaders ─────────────────────────────────────────────────────────────────

const shadowVsSource = `
    attribute vec3 aPosition;
    uniform mat4 uLightMatrix; 
    uniform mat4 uModel;
    void main() { gl_Position = uLightMatrix * uModel * vec4(aPosition, 1.0); }
`;
const shadowFsSource = `precision mediump float; void main() { gl_FragColor = vec4(1.0); }`;

const vsSource = `
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform mat4 uLightMatrix;
    uniform vec3 uLightDirection;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec3 vWorldPos;
    varying vec4 vShadowCoord;
    void main() {
        vec4 worldPos4   = uModel * vec4(aPosition, 1.0);
        vec3 worldPos    = worldPos4.xyz;
        vec3 worldNormal = normalize(mat3(uModel) * aNormal);
        vec3 lightDir    = normalize(uLightDirection);

        // Shadow bias: desloca a posicao ao longo da normal em world space
        // antes de projetar no shadow map.
        // O fator cos(theta) faz o offset crescer em superficies rasantes,
        // que sao as mais propensas ao self-shadowing (acne de sombra).
        float cosTheta   = clamp(dot(worldNormal, lightDir), 0.0, 1.0);
        float normalBias = mix(0.012, 0.002, cosTheta);
        vec3 biasedPos   = worldPos + worldNormal * normalBias;

        gl_Position  = uProjection * uView * worldPos4;
        vNormal      = worldNormal;
        vColor       = aColor;
        vWorldPos    = worldPos;

        const mat4 tMat  = mat4(0.5,0,0,0, 0,0.5,0,0, 0,0,0.5,0, 0.5,0.5,0.5,1.0);
        // Shadow coord usa a posicao deslocada — a superficie fica levemente
        // acima do limite de sombra sem alterar a posicao visual do vertice
        vShadowCoord = tMat * uLightMatrix * vec4(biasedPos, 1.0);
    }
`;

const fsSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec3 vWorldPos;
    varying vec4 vShadowCoord;
    uniform vec3  uLightDirection;
    uniform vec3  uCameraPos;
    uniform float uSpecularStrength;
    uniform float uShininess;
    uniform sampler2D uShadowMap;
    uniform bool  uReceiveShadows;
    void main() {
        vec3  normal   = normalize(vNormal);
        vec3  lightDir = normalize(uLightDirection);
        float nDotL    = max(dot(normal, lightDir), 0.0);

        // Sombra: o bias de profundidade residual aqui e apenas uma segunda
        // linha de defesa, muito menor do que antes pois o normal-offset
        // no vertex shader ja resolve a maior parte do acne.
        float shadow = 0.0;
        if (uReceiveShadows) {
            vec3 sc = vShadowCoord.xyz / vShadowCoord.w;
            if (sc.x >= 0.0 && sc.x <= 1.0 &&
                sc.y >= 0.0 && sc.y <= 1.0 &&
                sc.z >= 0.0 && sc.z <= 1.0) {
                float bias = 0.0005;
                if (sc.z > texture2D(uShadowMap, sc.xy).r + bias) shadow = 1.0;
            }
        }
        if (nDotL == 0.0) shadow = 1.0;
        float lit = 1.0 - shadow;

        // Ambient
        vec3 ambient  = 0.30 * vColor;

        // Diffuse (Lambert)
        vec3 diffuse  = 0.55 * lit * nDotL * vColor;

        // Specular (Blinn-Phong): halfDir evita o reflect() e e mais
        // fisicamente correto para superficies roughas
        vec3  viewDir  = normalize(uCameraPos - vWorldPos);
        vec3  halfDir  = normalize(lightDir + viewDir);
        float spec     = pow(max(dot(normal, halfDir), 0.0), uShininess);
        vec3  specular = uSpecularStrength * lit * spec * vec3(1.0);

        gl_FragColor = vec4(ambient + diffuse + specular, 1.0);
    }
`;

const starVsSource = `
    attribute vec3 aPosition;
    attribute float aSize;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform mat4 uModel;
    void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        gl_PointSize = aSize;
    }
`;
const starFsSource = `
    precision mediump float;
    void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); }
`;

// ─── Programs ─────────────────────────────────────────────────────────────────

const mainVs = Utils.createShader(gl, gl.VERTEX_SHADER, vsSource);
const mainFs = Utils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const mainProgram = Utils.createProgram(gl, mainVs, mainFs);

const shadowVs = Utils.createShader(gl, gl.VERTEX_SHADER, shadowVsSource);
const shadowFs = Utils.createShader(gl, gl.FRAGMENT_SHADER, shadowFsSource);
const shadowProgram = Utils.createProgram(gl, shadowVs, shadowFs);

const starVs = Utils.createShader(gl, gl.VERTEX_SHADER, starVsSource);
const starFs = Utils.createShader(gl, gl.FRAGMENT_SHADER, starFsSource);
const starProgram = Utils.createProgram(gl, starVs, starFs);

const locs = {
    main: {
        aPosition:          gl.getAttribLocation(mainProgram, 'aPosition'),
        aNormal:            gl.getAttribLocation(mainProgram, 'aNormal'),
        aColor:             gl.getAttribLocation(mainProgram, 'aColor'),
        uModel:             gl.getUniformLocation(mainProgram, 'uModel'),
        uView:              gl.getUniformLocation(mainProgram, 'uView'),
        uProjection:        gl.getUniformLocation(mainProgram, 'uProjection'),
        uLightMatrix:       gl.getUniformLocation(mainProgram, 'uLightMatrix'),
        uLightDirection:    gl.getUniformLocation(mainProgram, 'uLightDirection'),
        uCameraPos:         gl.getUniformLocation(mainProgram, 'uCameraPos'),
        uSpecularStrength:  gl.getUniformLocation(mainProgram, 'uSpecularStrength'),
        uShininess:         gl.getUniformLocation(mainProgram, 'uShininess'),
        uShadowMap:         gl.getUniformLocation(mainProgram, 'uShadowMap'),
        uReceiveShadows:    gl.getUniformLocation(mainProgram, 'uReceiveShadows'),
    },
    shadow: {
        aPosition:    gl.getAttribLocation(shadowProgram, 'aPosition'),
        uLightMatrix: gl.getUniformLocation(shadowProgram, 'uLightMatrix'),
        uModel:       gl.getUniformLocation(shadowProgram, 'uModel'),
    },
    star: {
        aPosition:   gl.getAttribLocation(starProgram, 'aPosition'),
        aSize:       gl.getAttribLocation(starProgram, 'aSize'),
        uView:       gl.getUniformLocation(starProgram, 'uView'),
        uProjection: gl.getUniformLocation(starProgram, 'uProjection'),
        uModel:      gl.getUniformLocation(starProgram, 'uModel'),
    }
};

// ─── Shadow map ───────────────────────────────────────────────────────────────

const shadowTextureSize = 1024;
const shadowDepthTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, shadowTextureSize, shadowTextureSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const shadowFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowDepthTexture, 0);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

// ─── Buffers ──────────────────────────────────────────────────────────────────

const positionBuffer   = gl.createBuffer();
const normalBuffer     = gl.createBuffer();
const colorBuffer      = gl.createBuffer();

const treePositionBuffer = gl.createBuffer();
const treeNormalBuffer   = gl.createBuffer();
const treeColorBuffer    = gl.createBuffer();

const cloudPositionBuffer = gl.createBuffer();
const cloudNormalBuffer   = gl.createBuffer();
const cloudColorBuffer    = gl.createBuffer();
const planePositionBuffer = gl.createBuffer();
const planeNormalBuffer   = gl.createBuffer();
const planeColorBuffer    = gl.createBuffer();
const starPositionBuffer  = gl.createBuffer();
const starSizeBuffer      = gl.createBuffer();

// ─── Estado ───────────────────────────────────────────────────────────────────

const state = { 
    noiseType: 'simplex',
    noiseStrength: 0.2, 
    noiseFreq: 1.5, 
    waterLevel: 1.0, 
    resolution: 7, 
    deepWaterThreshold: 0.15,
    octaves: 8,
    palette: {
        deepWater:    [0.02, 0.08, 0.25],
        shallowWater: [0.15, 0.65, 0.75],
        sand:         [0.88, 0.84, 0.65],
        grass:        [0.28, 0.55, 0.20],
        forest:       [0.10, 0.35, 0.10],
        rock:         [0.45, 0.40, 0.38],
        snow:         [0.95, 0.95, 1.0]
    } 
};

let currentSeedString = "Planeta" + Math.floor(Math.random() * 1000);
let numericSeed = 0; 

let plantedTrees = [];
let lastPlantTime = 0;
let currentPlanetGeometry = null;
let currentNoiseFn = null;

let simplexInstance = null; 
let vertexCount = 0;
let treeVertexCount = 0;
let cloudVertexCount = 0;
let planeVertexCount = 0;
let starCount = 0;
let loadedCloudModel = null;

let animationState = {
    active: false,
    startTime: 0,
    duration: 1500,
    currentScale: 1.0
};

let planeOrbitAngle = 0;
let planeSpeed = 0.005;

let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let clickStartX = 0, clickStartY = 0;
let mouseRotX = 0, mouseRotY = 0;
let planetRotY = 0;
let cloudRotY = 0;
let autoRotateSpeed = 0.001;
let sunAngle = 1.0;
let cameraDistance = 6.0;

let projectionDirty = true;
let viewDirty = true;
let prevCameraDistance = -1;

const modelMatrix       = mat4.create();
const cloudModelMatrix  = mat4.create(); 
const planeModelMatrix  = mat4.create(); 
const viewMatrix        = mat4.create();
const projectionMatrix  = mat4.create();
const mouseRotMatrix    = mat4.create();
const lightProjectionMatrix = mat4.create();
const lightViewMatrix   = mat4.create();
const lightSpaceMatrix  = mat4.create();

mat4.ortho(lightProjectionMatrix, -10, 10, -10, 10, 0.1, 50.0);

// ─── Ray casting com vetores pré-alocados ─────────────────────────────────────

const _rc = {
    edge1: vec3.create(), edge2: vec3.create(), h: vec3.create(),
    s: vec3.create(), q: vec3.create(),
    v0: vec3.create(), v1: vec3.create(), v2: vec3.create()
};

function rayIntersectsTriangle(rayOrigin, rayDir, v0, v1, v2) {
    vec3.subtract(_rc.edge1, v1, v0);
    vec3.subtract(_rc.edge2, v2, v0);
    vec3.cross(_rc.h, rayDir, _rc.edge2);
    const a = vec3.dot(_rc.edge1, _rc.h);
    if (a > -0.00001 && a < 0.00001) return -1;
    const f = 1.0 / a;
    vec3.subtract(_rc.s, rayOrigin, v0);
    const u = f * vec3.dot(_rc.s, _rc.h);
    if (u < 0.0 || u > 1.0) return -1;
    vec3.cross(_rc.q, _rc.s, _rc.edge1);
    const v = f * vec3.dot(rayDir, _rc.q);
    if (v < 0.0 || u + v > 1.0) return -1;
    const t = f * vec3.dot(_rc.edge2, _rc.q);
    return t > 0.00001 ? t : -1;
}

function triggerPlanetAnimation() {
    animationState.active = true;
    animationState.startTime = performance.now();
    animationState.currentScale = 0.0;
}

function castRay(mouseX, mouseY) {
    if (!currentPlanetGeometry) return;
    const x = (2.0 * mouseX) / canvas.width - 1.0;
    const y = 1.0 - (2.0 * mouseY) / canvas.height;
    
    const invProj = mat4.create(); mat4.invert(invProj, projectionMatrix);
    const rayEye = vec4.create(); vec4.transformMat4(rayEye, vec4.fromValues(x, y, -1.0, 1.0), invProj);
    rayEye[2] = -1.0; rayEye[3] = 0.0;
    
    const invView = mat4.create(); mat4.invert(invView, viewMatrix);
    const rayWorldDirVec4 = vec4.create(); vec4.transformMat4(rayWorldDirVec4, rayEye, invView);
    const rayWorldDir = vec3.fromValues(rayWorldDirVec4[0], rayWorldDirVec4[1], rayWorldDirVec4[2]);
    vec3.normalize(rayWorldDir, rayWorldDir);

    const camPos = vec3.fromValues(invView[12], invView[13], invView[14]);
    const invModel = mat4.create(); mat4.invert(invModel, modelMatrix);

    const rayOriginLocal = vec3.create(); 
    vec3.transformMat4(rayOriginLocal, camPos, invModel);

    const rayDirVec4_Local = vec4.fromValues(rayWorldDir[0], rayWorldDir[1], rayWorldDir[2], 0.0);
    vec4.transformMat4(rayDirVec4_Local, rayDirVec4_Local, invModel);
    const rayDirLocal = vec3.create(); 
    vec3.set(rayDirLocal, rayDirVec4_Local[0], rayDirVec4_Local[1], rayDirVec4_Local[2]);
    vec3.normalize(rayDirLocal, rayDirLocal);

    let closestT = Infinity;
    let hitX = 0, hitY = 0, hitZ = 0, didHit = false;
    const verts = currentPlanetGeometry.vertices;

    for (let i = 0; i < verts.length; i += 9) {
        // Reusa vetores pré-alocados — sem new vec3 por triângulo
        vec3.set(_rc.v0, verts[i],   verts[i+1], verts[i+2]);
        vec3.set(_rc.v1, verts[i+3], verts[i+4], verts[i+5]);
        vec3.set(_rc.v2, verts[i+6], verts[i+7], verts[i+8]);
        const t = rayIntersectsTriangle(rayOriginLocal, rayDirLocal, _rc.v0, _rc.v1, _rc.v2);
        if (t > 0 && t < closestT) {
            closestT = t;
            hitX = rayOriginLocal[0] + rayDirLocal[0] * t;
            hitY = rayOriginLocal[1] + rayDirLocal[1] * t;
            hitZ = rayOriginLocal[2] + rayDirLocal[2] * t;
            didHit = true;
        }
    }

    if (didHit) {
        const radius = Math.sqrt(hitX*hitX + hitY*hitY + hitZ*hitZ);
        const altitude = radius - state.waterLevel;
        if (altitude > 0.02 && altitude < 0.35) {
            const now = performance.now();
            plantedTrees.push({ x: hitX, y: hitY, z: hitZ, startTime: now });
            lastPlantTime = now;
            updateTreeGeometry();
        }
    }
}

canvas.addEventListener('mousedown', e => { 
    isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY;
    clickStartX = e.clientX; clickStartY = e.clientY;
});
window.addEventListener('mouseup', e => { 
    isDragging = false; 
    if (Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY) < 5) castRay(e.clientX, e.clientY);
});
canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    mouseRotY += (e.clientX - lastMouseX) * 0.005; mouseRotX += (e.clientY - lastMouseY) * 0.005;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
});
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cameraDistance = Math.max(1.8, Math.min(10.0, cameraDistance + e.deltaY * 0.005));
    viewDirty = true;
}, {passive: false});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    projectionDirty = true;
});

function initializeSeed(seedStr, clearTrees = true) {
    currentSeedString = seedStr;
    const elSeed = document.getElementById('seedInput');
    if (elSeed) elSeed.value = currentSeedString;
    numericSeed = Utils.stringToHash(currentSeedString);
    const seededRandom = Utils.createSeededRandom(numericSeed);
    simplexInstance = new SimplexNoise(seededRandom);
    Utils.initPerlin(numericSeed);
    if (clearTrees) plantedTrees = []; 
    triggerPlanetAnimation();
    generateStars();
}

function updatePlanetGeometry() {
    if (!simplexInstance) return;

    let baseNoiseFn;
    if (state.noiseType === 'simplex') {
        baseNoiseFn = (x, y, z) => simplexInstance.noise3D(x, y, z);
    } else if (state.noiseType === 'perlin') {
        baseNoiseFn = (x, y, z) => Utils.PerlinNoise3D(x, y, z);
    } else {
        baseNoiseFn = (x, y, z) => Utils.ValueNoise3D(x, y, z, numericSeed);
    }

    const octaves = state.octaves;
    const persistence = 0.5;
    const lacunarity = 2.0;

    const getNoiseVal = (x, y, z) => {
        let total = 0, frequency = 1.0, amplitude = 1.0, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += baseNoiseFn(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / maxValue;
    };

    currentNoiseFn = getNoiseVal;

    const planet = new IcoSphere(state.resolution);
    planet.applyNoise(state.noiseStrength, state.noiseFreq, state.waterLevel, getNoiseVal);
    planet.generateColors(state.waterLevel, getNoiseVal, state.noiseStrength, state.noiseFreq, state.deepWaterThreshold, state.palette);
    planet.toFlatGeometry();
    planet.calculateNormals();
    currentPlanetGeometry = planet;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.normals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.colors), gl.STATIC_DRAW);
    vertexCount = planet.vertices.length / 3;
    updateTreeGeometry();
}

function updateTreeGeometry() {
    if (!currentPlanetGeometry || !currentNoiseFn) { treeVertexCount = 0; return; }
    const treeData = currentPlanetGeometry.buildTreesOnly(
        plantedTrees, state.waterLevel, currentNoiseFn,
        state.noiseStrength, state.noiseFreq, performance.now()
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, treePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(treeData.vertices), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, treeNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(treeData.normals), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, treeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(treeData.colors), gl.DYNAMIC_DRAW);
    treeVertexCount = treeData.vertices.length / 3;
}

function updateUIFromState() {
    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
    setVal('noiseType', state.noiseType);
    setVal('noiseStrength', state.noiseStrength);
    setVal('noiseFreq', state.noiseFreq);
    setVal('waterLevel', state.waterLevel);
    setVal('resolution', state.resolution);
    setVal('deepWaterThreshold', state.deepWaterThreshold);
    setVal('octaves', state.octaves);
    const colors = ['colDeep', 'colShallow', 'colSand', 'colGrass', 'colForest', 'colRock', 'colSnow'];
    const keys = ['deepWater', 'shallowWater', 'sand', 'grass', 'forest', 'rock', 'snow'];
    colors.forEach((id, index) => {
        const el = document.getElementById(id);
        const rgb = state.palette[keys[index]];
        if (el && rgb) el.value = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
    });
}

function randomizeState() {
    state.noiseStrength = 0.05 + Math.random() * 0.45; 
    state.noiseFreq     = 0.5  + Math.random() * 2.5;       
    state.waterLevel    = 0.9  + Math.random() * 0.25;     
    state.deepWaterThreshold = 0.05 + Math.random() * 0.3; 
    const types = ['simplex', 'perlin', 'random'];
    state.noiseType = types[Math.floor(Math.random() * types.length)];
    const randomCol = (min, max) => { const r = max-min; return [min+Math.random()*r, min+Math.random()*r, min+Math.random()*r]; };
    const shiftCol = (b, v) => [Math.min(1,Math.max(0,b[0]+(Math.random()-.5)*v)), Math.min(1,Math.max(0,b[1]+(Math.random()-.5)*v)), Math.min(1,Math.max(0,b[2]+(Math.random()-.5)*v))];
    state.palette.deepWater    = randomCol(0.0, 0.3);
    state.palette.shallowWater = Math.random() > 0.5 ? shiftCol(state.palette.deepWater, 0.5).map(c=>c+0.3) : randomCol(0.2, 0.8);
    state.palette.sand         = randomCol(0.5, 1.0);
    state.palette.grass        = randomCol(0.1, 0.8);
    state.palette.forest       = Math.random() > 0.7 ? randomCol(0.0, 0.5) : shiftCol(state.palette.grass, 0.3).map(c=>c*0.7);
    state.palette.rock         = randomCol(0.2, 0.6);
    state.palette.snow         = randomCol(0.85, 1.0);
    triggerPlanetAnimation();
}

function setupUI() {
    const bindSlider = (id, key, isInt = false) => {
        document.getElementById(id)?.addEventListener('input', e => {
            state[key] = isInt ? parseInt(e.target.value) : parseFloat(e.target.value);
            updatePlanetGeometry();
        });
    };
    bindSlider('noiseStrength', 'noiseStrength');
    bindSlider('noiseFreq', 'noiseFreq');
    bindSlider('waterLevel', 'waterLevel');
    bindSlider('deepWaterThreshold', 'deepWaterThreshold');
    bindSlider('resolution', 'resolution', true);
    bindSlider('octaves', 'octaves', true);

    document.getElementById('noiseType')?.addEventListener('change', e => {
        state.noiseType = e.target.value;
        updatePlanetGeometry();
    });
    document.getElementById('sunPosition')?.addEventListener('input', e => sunAngle = parseFloat(e.target.value));
    document.getElementById('rotationSpeed')?.addEventListener('input', e => autoRotateSpeed = parseFloat(e.target.value));

    const colors = ['colDeep', 'colShallow', 'colSand', 'colGrass', 'colForest', 'colRock', 'colSnow'];
    const keys   = ['deepWater', 'shallowWater', 'sand', 'grass', 'forest', 'rock', 'snow'];
    const updatePaletteFromUI = () => {
        colors.forEach((id, index) => {
            const el = document.getElementById(id);
            if (el) state.palette[keys[index]] = Utils.hexToRgb(el.value);
        });
        updatePlanetGeometry();
    };
    colors.forEach(id => document.getElementById(id)?.addEventListener('input', updatePaletteFromUI));

    document.getElementById('btnRegenerate')?.addEventListener('click', () => {
        const newSeed = "Seed-" + Math.floor(Math.random() * 10000);
        initializeSeed(newSeed);
        randomizeState();
        updateUIFromState();
        updatePlanetGeometry();
        generateClouds();
    });
    document.getElementById('btnLoadSeed')?.addEventListener('click', () => {
        const inputVal = document.getElementById('seedInput').value;
        if (inputVal.trim() !== "") loadFromCode(inputVal);
    });
    document.getElementById('btnCopySeed')?.addEventListener('click', () => {
        const fullCode = serializeWorld();
        const elInput = document.getElementById("seedInput");
        elInput.value = fullCode;
        elInput.select();
        navigator.clipboard.writeText(fullCode).then(() => alert("Código copiado!"));
    });
}

function serializeWorld() {
    return btoa(JSON.stringify({ seed: currentSeedString, config: state }));
}

function loadFromCode(code) {
    try {
        const savedData = JSON.parse(atob(code));
        Object.assign(state, savedData.config);
        initializeSeed(savedData.seed, false);
        updateUIFromState();
        updatePlanetGeometry();
        generateClouds();
    } catch (e) {
        initializeSeed(code, true);
        updatePlanetGeometry();
        generateClouds();
    }
}

async function generateClouds() {
    if (!loadedCloudModel) {
        try {
            const response = await fetch('nuvem.obj');
            if (!response.ok) throw new Error();
            loadedCloudModel = Utils.parseOBJ(await response.text());
        } catch (err) {
            loadedCloudModel = { 
                vertices: [-0.2,0,-0.2, 0.2,0,-0.2, 0,0.3,0], 
                normals:  [0,1,0, 0,1,0, 0,1,0], 
                colors:   [1,1,1, 1,1,1, 1,1,1] 
            }; 
        }
    }
    const finalVertices = [], finalNormals = [], finalColors = [];
    const numClouds = 15, altitude = 1.35;
    const mat = mat4.create(), q = quat.create(), up = vec3.fromValues(0, 1, 0);
    const clusterPos = vec3.create(), tempVec = vec3.create();

    for (let i = 0; i < numClouds; i++) {
        const seed = numericSeed + i * 55;
        const s1 = Utils.randomFromSeed(seed), s2 = Utils.randomFromSeed(seed + 1);
        const theta = s1 * Math.PI * 2, phi = Math.acos(2 * s2 - 1);
        vec3.set(clusterPos, Math.sin(phi)*Math.cos(theta), Math.sin(phi)*Math.sin(theta), Math.cos(phi));
        vec3.scale(clusterPos, clusterPos, altitude);
        const norm = vec3.clone(clusterPos); vec3.normalize(norm, norm);
        quat.rotationTo(q, up, norm);
        quat.rotateY(q, q, Utils.randomFromSeed(seed + 3) * Math.PI * 2);
        const scale = 0.01 + Utils.randomFromSeed(seed + 2) * 0.015;
        mat4.fromRotationTranslationScale(mat, q, clusterPos, [scale, scale, scale]);
        const normMat = mat3.create(); mat3.fromMat4(normMat, mat);
        for (let j = 0; j < loadedCloudModel.vertices.length; j += 3) {
            vec3.set(tempVec, loadedCloudModel.vertices[j], loadedCloudModel.vertices[j+1], loadedCloudModel.vertices[j+2]);
            vec3.transformMat4(tempVec, tempVec, mat);
            finalVertices.push(tempVec[0], tempVec[1], tempVec[2]);
            vec3.set(tempVec, loadedCloudModel.normals[j], loadedCloudModel.normals[j+1], loadedCloudModel.normals[j+2]);
            vec3.transformMat3(tempVec, tempVec, normMat);
            vec3.normalize(tempVec, tempVec);
            finalNormals.push(tempVec[0], tempVec[1], tempVec[2]);
            finalColors.push(1.0, 1.0, 1.0);
        }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudPositionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(finalVertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudNormalBuffer);   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(finalNormals),   gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudColorBuffer);    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(finalColors),    gl.STATIC_DRAW);
    cloudVertexCount = finalVertices.length / 3;
}

function generateStars() {
    const positions = [], sizes = [];
    starCount = 2000;
    const dist = 80.0;
    for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = dist + Math.random() * 20.0;
        positions.push(r*Math.sin(phi)*Math.cos(theta), r*Math.sin(phi)*Math.sin(theta), r*Math.cos(phi));
        sizes.push(1.0 + Math.random() * 2.0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, starPositionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, starSizeBuffer);     gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes),     gl.STATIC_DRAW);
}

async function loadAirplane() {
    try {
        const response = await fetch('aviao.obj');
        if (!response.ok) throw new Error();
        const model = Utils.parseOBJ(await response.text());
        const planeColors = [];
        for (let i = 0; i < model.vertices.length/3; i++) planeColors.push(0.9, 0.9, 0.95);
        gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(model.vertices), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeNormalBuffer);   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(model.normals),  gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeColorBuffer);    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planeColors),    gl.STATIC_DRAW);
        planeVertexCount = model.vertices.length / 3;
    } catch (err) {
        const vertices = [
            0,0,0.5,   -0.2,0,-0.2,   0.2,0,-0.2,
            0,0,0.5,    0.2,0,-0.2,   0,0.15,-0.1,
            0,0,0.5,    0,0.15,-0.1, -0.2,0,-0.2,
            0,0,-0.2,   0,0.2,-0.3,   0,0,-0.3
        ];
        const normals = [0,1,0,0,1,0,0,1,0, 1,1,0,1,1,0,1,1,0, -1,1,0,-1,1,0,-1,1,0, 0,0,1,0,0,1,0,0,1];
        const colors  = [
            0.9,0.9,0.9, 0.9,0.9,0.9, 0.9,0.9,0.9,
            0.9,0.9,0.9, 0.9,0.9,0.9, 0.1,0.1,0.3,
            0.9,0.9,0.9, 0.1,0.1,0.3, 0.9,0.9,0.9,
            0.8,0.1,0.1, 0.8,0.1,0.1, 0.8,0.1,0.1
        ];
        gl.bindBuffer(gl.ARRAY_BUFFER, planePositionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeNormalBuffer);   gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals),  gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, planeColorBuffer);    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors),   gl.STATIC_DRAW);
        planeVertexCount = vertices.length / 3;
    }
}

// ─── Helper de draw: evita repetição de bind+vertexAttribPointer ─────────────

function bindMesh(posBuffer, normBuffer, colBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.vertexAttribPointer(locs.main.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
    gl.vertexAttribPointer(locs.main.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
    gl.vertexAttribPointer(locs.main.aColor, 3, gl.FLOAT, false, 0, 0);
}

function bindShadowMesh(posBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.vertexAttribPointer(locs.shadow.aPosition, 3, gl.FLOAT, false, 0, 0);
}

// ─── Loop principal ───────────────────────────────────────────────────────────

function render() {
    if (performance.now() - lastPlantTime < 1500) {
        updateTreeGeometry();
    }

    if (!isDragging) planetRotY += autoRotateSpeed;
    cloudRotY += autoRotateSpeed * 1.5;

    let animScale = 1.0;
    if (animationState.active) {
        const now = performance.now();
        const progress = Math.min((now - animationState.startTime) / animationState.duration, 1.0);
        animScale = Utils.easeOutElastic(progress);
        if (progress >= 1.0) { animationState.active = false; animScale = 1.0; }
    }

    planeOrbitAngle += planeSpeed;

    mat4.identity(mouseRotMatrix);
    mat4.rotateX(mouseRotMatrix, mouseRotMatrix, mouseRotX);
    mat4.rotateY(mouseRotMatrix, mouseRotMatrix, mouseRotY);

    mat4.identity(modelMatrix);
    mat4.multiply(modelMatrix, mouseRotMatrix, modelMatrix);
    mat4.rotateY(modelMatrix, modelMatrix, planetRotY);
    mat4.scale(modelMatrix, modelMatrix, [animScale, animScale, animScale]);

    mat4.identity(cloudModelMatrix);
    mat4.multiply(cloudModelMatrix, mouseRotMatrix, cloudModelMatrix);
    mat4.rotateY(cloudModelMatrix, cloudModelMatrix, cloudRotY);
    mat4.scale(cloudModelMatrix, cloudModelMatrix, [animScale, animScale, animScale]);

    mat4.identity(planeModelMatrix);
    mat4.multiply(planeModelMatrix, mouseRotMatrix, planeModelMatrix);
    mat4.rotateZ(planeModelMatrix, planeModelMatrix, 0.3);
    mat4.rotateY(planeModelMatrix, planeModelMatrix, planeOrbitAngle);
    mat4.translate(planeModelMatrix, planeModelMatrix, [0, 0, 1.6]);
    mat4.rotateX(planeModelMatrix, planeModelMatrix, Math.PI / 2);
    mat4.rotateY(planeModelMatrix, planeModelMatrix, -Math.PI);
    mat4.rotateX(planeModelMatrix, planeModelMatrix, -Math.PI / 2);
    mat4.scale(planeModelMatrix, planeModelMatrix, [0.0002*animScale, 0.0002*animScale, 0.0002*animScale]);

    if (projectionDirty) {
        mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
        projectionDirty = false;
    }
    if (viewDirty || cameraDistance !== prevCameraDistance) {
        mat4.lookAt(viewMatrix, [0, 0, cameraDistance], [0, 0, 0], [0, 1, 0]);
        prevCameraDistance = cameraDistance;
        viewDirty = false;
    }

    const sunX = Math.sin(sunAngle), sunZ = Math.cos(sunAngle);
    const baseLightPos = vec3.fromValues(sunX * 20.0, 10.0, sunZ * 20.0);
    const lightPos = vec3.create(); vec3.transformMat4(lightPos, baseLightPos, mouseRotMatrix);
    mat4.lookAt(lightViewMatrix, lightPos, [0,0,0], [0,1,0]);
    mat4.multiply(lightSpaceMatrix, lightProjectionMatrix, lightViewMatrix);

    // ── Shadow pass ───────────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.viewport(0, 0, shadowTextureSize, shadowTextureSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shadowProgram);
    gl.uniformMatrix4fv(locs.shadow.uLightMatrix, false, lightSpaceMatrix);
    gl.disable(gl.CULL_FACE);
    gl.enableVertexAttribArray(locs.shadow.aPosition);

    bindShadowMesh(positionBuffer);
    gl.uniformMatrix4fv(locs.shadow.uModel, false, modelMatrix);
    if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    if (treeVertexCount > 0) {
        bindShadowMesh(treePositionBuffer);
        gl.uniformMatrix4fv(locs.shadow.uModel, false, modelMatrix);
        gl.drawArrays(gl.TRIANGLES, 0, treeVertexCount);
    }

    bindShadowMesh(planePositionBuffer);
    gl.uniformMatrix4fv(locs.shadow.uModel, false, planeModelMatrix);
    if (planeVertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, planeVertexCount);

    bindShadowMesh(cloudPositionBuffer);
    gl.uniformMatrix4fv(locs.shadow.uModel, false, cloudModelMatrix);
    if (cloudVertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, cloudVertexCount);

    // ── Main pass ─────────────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.08, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    // Estrelas
    gl.useProgram(starProgram);
    gl.uniformMatrix4fv(locs.star.uProjection, false, projectionMatrix);
    gl.uniformMatrix4fv(locs.star.uView, false, viewMatrix);
    gl.uniformMatrix4fv(locs.star.uModel, false, mouseRotMatrix);
    gl.enableVertexAttribArray(locs.star.aPosition);
    gl.enableVertexAttribArray(locs.star.aSize);
    gl.bindBuffer(gl.ARRAY_BUFFER, starPositionBuffer);
    gl.vertexAttribPointer(locs.star.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, starSizeBuffer);
    gl.vertexAttribPointer(locs.star.aSize, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, starCount);

    // Setup programa principal (uniforms comuns)
    gl.useProgram(mainProgram);
    gl.uniformMatrix4fv(locs.main.uProjection, false, projectionMatrix);
    gl.uniformMatrix4fv(locs.main.uView, false, viewMatrix);
    gl.uniformMatrix4fv(locs.main.uLightMatrix, false, lightSpaceMatrix);
    const lightDirVec = vec3.create(); vec3.normalize(lightDirVec, lightPos);
    gl.uniform3fv(locs.main.uLightDirection, lightDirVec);
    // Posição da câmera em world space (câmera fixa, planeta rotaciona)
    gl.uniform3fv(locs.main.uCameraPos, [0, 0, cameraDistance]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture);
    gl.uniform1i(locs.main.uShadowMap, 0);
    gl.enableVertexAttribArray(locs.main.aPosition);
    gl.enableVertexAttribArray(locs.main.aNormal);
    gl.enableVertexAttribArray(locs.main.aColor);

    // Planeta: especular baixo (terreno rugoso), agua um pouco mais brilhante pela cor
    bindMesh(positionBuffer, normalBuffer, colorBuffer);
    gl.uniformMatrix4fv(locs.main.uModel, false, modelMatrix);
    gl.uniform1i(locs.main.uReceiveShadows, 1);
    gl.uniform1f(locs.main.uSpecularStrength, 0.25);
    gl.uniform1f(locs.main.uShininess, 24.0);
    if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    // Arvores: vegetacao absorve luz, especular muito baixo
    if (treeVertexCount > 0) {
        bindMesh(treePositionBuffer, treeNormalBuffer, treeColorBuffer);
        gl.uniformMatrix4fv(locs.main.uModel, false, modelMatrix);
        gl.uniform1i(locs.main.uReceiveShadows, 1);
        gl.uniform1f(locs.main.uSpecularStrength, 0.08);
        gl.uniform1f(locs.main.uShininess, 8.0);
        gl.drawArrays(gl.TRIANGLES, 0, treeVertexCount);
    }

    // Aviao: superficie metalica/pintada — especular alto e foco apertado
    bindMesh(planePositionBuffer, planeNormalBuffer, planeColorBuffer);
    gl.uniformMatrix4fv(locs.main.uModel, false, planeModelMatrix);
    gl.uniform1i(locs.main.uReceiveShadows, 0);
    gl.uniform1f(locs.main.uSpecularStrength, 0.85);
    gl.uniform1f(locs.main.uShininess, 96.0);
    if (planeVertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, planeVertexCount);

    // Nuvens: difusas e suaves, sem brilho concentrado
    bindMesh(cloudPositionBuffer, cloudNormalBuffer, cloudColorBuffer);
    gl.uniformMatrix4fv(locs.main.uModel, false, cloudModelMatrix);
    gl.uniform1i(locs.main.uReceiveShadows, 0);
    gl.uniform1f(locs.main.uSpecularStrength, 0.15);
    gl.uniform1f(locs.main.uShininess, 6.0);
    if (cloudVertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, cloudVertexCount);

    requestAnimationFrame(render);
}

window.onload = function() {
    initializeSeed(currentSeedString);
    setupUI();
    updateUIFromState();
    updatePlanetGeometry();
    generateClouds();
    loadAirplane();
    render();
};