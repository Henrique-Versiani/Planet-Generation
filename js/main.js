const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

const ext = gl.getExtension('WEBGL_depth_texture');
if (!ext) console.warn('Sem suporte a sombras avançadas.');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

const shadowVsSource = `
    attribute vec3 aPosition;
    uniform mat4 uLightMatrix; 
    uniform mat4 uModel;
    void main() { gl_Position = uLightMatrix * uModel * vec4(aPosition, 1.0); }
`;
const shadowFsSource = `precision mediump float; void main() { gl_FragColor = vec4(1.0); }`;

const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec3 aColor;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform mat4 uLightMatrix; 
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec4 vShadowCoord;
    void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        vNormal = mat3(uModel) * aNormal;
        vColor = aColor;
        const mat4 tMat = mat4(0.5,0,0,0, 0,0.5,0,0, 0,0,0.5,0, 0.5,0.5,0.5,1.0);
        vShadowCoord = tMat * uLightMatrix * uModel * vec4(aPosition, 1.0);
    }
`;
const fsSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vColor;
    varying vec4 vShadowCoord;
    uniform vec3 uLightDirection;
    uniform sampler2D uShadowMap;
    uniform bool uReceiveShadows;
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uLightDirection);
        float nDotL = max(dot(normal, lightDir), 0.0);
        float shadow = 0.0;
        if (uReceiveShadows) {
            vec3 shadowCoord = vShadowCoord.xyz / vShadowCoord.w;
            if (shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z >= 0.0 && shadowCoord.z <= 1.0) {
                float bias = max(0.005 * (1.0 - nDotL), 0.001);
                float shadowDepth = texture2D(uShadowMap, shadowCoord.xy).r;
                if (shadowCoord.z > shadowDepth + bias) shadow = 1.0;
            }
        }
        if (nDotL == 0.0) shadow = 1.0;
        float ambient = 0.5;
        float diffuse = 0.5 * (1.0 - shadow) * nDotL;
        vec3 finalColor = vColor * (ambient + diffuse);
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

const mainVs = Utils.createShader(gl, gl.VERTEX_SHADER, vsSource);
const mainFs = Utils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const mainProgram = Utils.createProgram(gl, mainVs, mainFs);
const shadowVs = Utils.createShader(gl, gl.VERTEX_SHADER, shadowVsSource);
const shadowFs = Utils.createShader(gl, gl.FRAGMENT_SHADER, shadowFsSource);
const shadowProgram = Utils.createProgram(gl, shadowVs, shadowFs);

const shadowDepthTexture = gl.createTexture();
const shadowTextureSize = 2048;
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

const positionBuffer = gl.createBuffer();
const normalBuffer = gl.createBuffer();
const colorBuffer = gl.createBuffer();
const cloudPositionBuffer = gl.createBuffer();
const cloudNormalBuffer = gl.createBuffer();
const cloudColorBuffer = gl.createBuffer();

const state = { 
    noiseType: 'simplex',
    noiseStrength: 0.1, 
    noiseFreq: 1.5, 
    waterLevel: 1.0, 
    resolution: 5, 
    deepWaterThreshold: 0.15,
    palette: {
        deepWater: [0.01, 0.03, 0.25],
        shallowWater: [0.2, 0.7, 0.9],
        sand: [0.94, 0.86, 0.59],
        grass: [0.33, 0.73, 0.22],
        forest: [0.18, 0.53, 0.18],
        rock: [0.55, 0.48, 0.42],
        snow: [0.96, 0.96, 1.0]
    } 
};

let currentSeedString = "Planeta" + Math.floor(Math.random() * 1000);
let numericSeed = 0; 

let plantedTrees = []; 
let currentPlanetGeometry = null;
let simplexInstance = null;
let vertexCount = 0;
let cloudVertexCount = 0;
let loadedCloudModel = null;

let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let clickStartX = 0, clickStartY = 0;
let mouseRotX = 0, mouseRotY = 0;
let planetRotY = 0;
let cloudRotY = 0;
let autoRotateSpeed = 0.001;
let sunAngle = 1.0;
let cameraDistance = 6.0;

const modelMatrix = mat4.create();
const cloudModelMatrix = mat4.create(); 
const viewMatrix = mat4.create();
const projectionMatrix = mat4.create();
const mouseRotMatrix = mat4.create();
const lightProjectionMatrix = mat4.create();
const lightViewMatrix = mat4.create();
const lightSpaceMatrix = mat4.create();

mat4.ortho(lightProjectionMatrix, -10, 10, -10, 10, 0.1, 50.0);

function rayIntersectsTriangle(rayOrigin, rayDir, v0, v1, v2) {
    const edge1 = vec3.create(); vec3.subtract(edge1, v1, v0);
    const edge2 = vec3.create(); vec3.subtract(edge2, v2, v0);
    const h = vec3.create(); vec3.cross(h, rayDir, edge2);
    const a = vec3.dot(edge1, h);
    if (a > -0.00001 && a < 0.00001) return null;
    const f = 1.0 / a;
    const s = vec3.create(); vec3.subtract(s, rayOrigin, v0);
    const u = f * vec3.dot(s, h);
    if (u < 0.0 || u > 1.0) return null;
    const q = vec3.create(); vec3.cross(q, s, edge1);
    const v = f * vec3.dot(rayDir, q);
    if (v < 0.0 || u + v > 1.0) return null;
    const t = f * vec3.dot(edge2, q);
    if (t > 0.00001) {
        const intersectionPoint = vec3.create();
        vec3.scaleAndAdd(intersectionPoint, rayOrigin, rayDir, t);
        return intersectionPoint;
    }
    return null;
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

    let closestDist = Infinity; let hitPoint = null; 
    const verts = currentPlanetGeometry.vertices;
    const limit = verts.length; 

    for (let i = 0; i < limit; i += 9) {
        const v0 = vec3.fromValues(verts[i], verts[i+1], verts[i+2]);
        const v1 = vec3.fromValues(verts[i+3], verts[i+4], verts[i+5]);
        const v2 = vec3.fromValues(verts[i+6], verts[i+7], verts[i+8]);
        
        const hit = rayIntersectsTriangle(rayOriginLocal, rayDirLocal, v0, v1, v2);
        
        if (hit) {
            const dist = vec3.distance(rayOriginLocal, hit);
            if (dist < closestDist) {
                closestDist = dist; 
                hitPoint = hit; 
            }
        }
    }

    if (hitPoint) {
        const radius = Math.sqrt(hitPoint[0]*hitPoint[0] + hitPoint[1]*hitPoint[1] + hitPoint[2]*hitPoint[2]);
        const altitude = radius - state.waterLevel;

        if (altitude > 0.02 && altitude < 0.35) {
            plantedTrees.push({ x: hitPoint[0], y: hitPoint[1], z: hitPoint[2] });
            updatePlanetGeometry(); 
        } else {
            console.log("Solo inválido para plantio. Altitude: " + altitude.toFixed(3));
        }
    }
}

canvas.addEventListener('mousedown', e => { 
    isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; clickStartX = e.clientX; clickStartY = e.clientY;
});
window.addEventListener('mouseup', (e) => { 
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
}, {passive: false});

function initializeSeed(seedStr, clearTrees = true) {
    currentSeedString = seedStr;
    const elSeed = document.getElementById('seedInput');
    if (elSeed) elSeed.value = currentSeedString;
    
    numericSeed = Utils.stringToHash(currentSeedString);
    const seededRandom = Utils.createSeededRandom(numericSeed);
    
    simplexInstance = new SimplexNoise(seededRandom);
    Utils.initPerlin(numericSeed);
    
    if(clearTrees) plantedTrees = []; 
}

function updatePlanetGeometry() {
    if (!simplexInstance) return;

    let getNoiseVal;
    if (state.noiseType === 'simplex') {
        getNoiseVal = (x, y, z) => simplexInstance.noise3D(x, y, z);
    } else if (state.noiseType === 'perlin') {
        getNoiseVal = (x, y, z) => Utils.PerlinNoise3D(x, y, z);
    } else if (state.noiseType === 'random') {
        getNoiseVal = (x, y, z) => Utils.ValueNoise3D(x, y, z, numericSeed);
    } else {
        getNoiseVal = (x, y, z) => simplexInstance.noise3D(x, y, z);
    }

    const planet = new IcoSphere(state.resolution); 
    
    planet.applyNoise(state.noiseStrength, state.noiseFreq, state.waterLevel, getNoiseVal);
    planet.generateColors(state.waterLevel, getNoiseVal, state.noiseStrength, state.noiseFreq, state.deepWaterThreshold, state.palette);
    planet.toFlatGeometry(); 
    planet.distributeTrees(plantedTrees, state.waterLevel, getNoiseVal, state.noiseStrength, state.noiseFreq);
    
    planet.calculateNormals();
    currentPlanetGeometry = planet; 

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.normals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.colors), gl.STATIC_DRAW);
    vertexCount = planet.vertices.length / 3;
}

function updateUIFromState() {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if(el) el.value = val;
    };
    setVal('noiseType', state.noiseType);
    setVal('noiseStrength', state.noiseStrength);
    setVal('noiseFreq', state.noiseFreq);
    setVal('waterLevel', state.waterLevel);
    setVal('resolution', state.resolution);
    setVal('deepWaterThreshold', state.deepWaterThreshold);

    const colors = ['colDeep', 'colShallow', 'colSand', 'colGrass', 'colForest', 'colRock', 'colSnow'];
    const keys = ['deepWater', 'shallowWater', 'sand', 'grass', 'forest', 'rock', 'snow'];
    
    colors.forEach((id, index) => {
        const el = document.getElementById(id);
        const rgb = state.palette[keys[index]];
        if (el && rgb) {
            el.value = Utils.rgbToHex(rgb[0], rgb[1], rgb[2]);
        }
    });
}

function randomizeState() {
    state.noiseStrength = 0.05 + Math.random() * 0.45; 
    state.noiseFreq = 0.5 + Math.random() * 2.5;       
    state.waterLevel = 0.9 + Math.random() * 0.25;     
    state.deepWaterThreshold = 0.05 + Math.random() * 0.3; 

    const types = ['simplex', 'perlin', 'random'];
    state.noiseType = types[Math.floor(Math.random() * types.length)];

    const randColor = () => [Math.random(), Math.random(), Math.random()];
    
    state.palette.deepWater = randColor();
    state.palette.shallowWater = randColor();
    state.palette.sand = randColor();
    state.palette.grass = randColor();
    state.palette.forest = randColor();
    state.palette.rock = randColor();
    state.palette.snow = randColor();
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

    const elType = document.getElementById('noiseType');
    if(elType) elType.addEventListener('change', e => {
        state.noiseType = e.target.value;
        updatePlanetGeometry();
    });

    const elSun = document.getElementById('sunPosition'); 
    if(elSun) elSun.addEventListener('input', e => sunAngle = parseFloat(e.target.value));
    const elSpeed = document.getElementById('rotationSpeed'); 
    if(elSpeed) elSpeed.addEventListener('input', e => autoRotateSpeed = parseFloat(e.target.value));

    const colors = ['colDeep', 'colShallow', 'colSand', 'colGrass', 'colForest', 'colRock', 'colSnow'];
    const keys = ['deepWater', 'shallowWater', 'sand', 'grass', 'forest', 'rock', 'snow'];

    const updatePaletteFromUI = () => {
        colors.forEach((id, index) => {
            const el = document.getElementById(id);
            if (el) state.palette[keys[index]] = Utils.hexToRgb(el.value);
        });
        updatePlanetGeometry();
    };

    colors.forEach(id => {
        document.getElementById(id)?.addEventListener('input', updatePaletteFromUI);
    });

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
        if(inputVal.trim() !== "") {
            loadFromCode(inputVal);
        }
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
    const saveData = { seed: currentSeedString, config: state };
    return btoa(JSON.stringify(saveData));
}

function loadFromCode(code) {
    try {
        const jsonStr = atob(code);
        const savedData = JSON.parse(jsonStr);
        Object.assign(state, savedData.config); 
        initializeSeed(savedData.seed, false);  
        updateUIFromState();                    
        updatePlanetGeometry();                 
        generateClouds();
    } catch (e) {
        console.log("Código inválido, usando como seed de texto.");
        initializeSeed(code, true);
        updatePlanetGeometry();
        generateClouds();
    }
}

async function generateClouds() {
    if (!loadedCloudModel) {
        try {
            const response = await fetch('nuvem.obj');
            if (!response.ok) throw new Error('Falha ao carregar .obj');
            const text = await response.text();
            loadedCloudModel = Utils.parseOBJ(text);
        } catch (err) {
            console.error(err);
            loadedCloudModel = { 
                vertices: [-0.2,0,-0.2, 0.2,0,-0.2, 0,0.3,0], 
                normals: [0,1,0, 0,1,0, 0,1,0], 
                colors: [1,1,1, 1,1,1, 1,1,1] 
            }; 
        }
    }
    const finalVertices = []; const finalNormals = []; const finalColors = [];
    const numClouds = 15; 
    const altitude = 1.35;
    const mat = mat4.create(); const q = quat.create(); const up = vec3.fromValues(0, 1, 0);
    const clusterPos = vec3.create(); const tempVec = vec3.create();

    for (let i = 0; i < numClouds; i++) {
        const seed = numericSeed + i * 55;
        const s1 = Utils.randomFromSeed(seed);
        const s2 = Utils.randomFromSeed(seed + 1);
        const theta = s1 * Math.PI * 2;
        const phi = Math.acos(2 * s2 - 1);
        const x = Math.sin(phi) * Math.cos(theta);
        const y = Math.sin(phi) * Math.sin(theta);
        const z = Math.cos(phi);
        vec3.set(clusterPos, x, y, z);
        vec3.scale(clusterPos, clusterPos, altitude);
        const norm = vec3.clone(clusterPos);
        vec3.normalize(norm, norm);
        quat.rotationTo(q, up, norm);
        const scale = 0.01 + Utils.randomFromSeed(seed + 2) * 0.015; 
        const randomYRot = Utils.randomFromSeed(seed + 3) * Math.PI * 2;
        quat.rotateY(q, q, randomYRot);
        mat4.fromRotationTranslationScale(mat, q, clusterPos, [scale, scale, scale]);
        for (let j = 0; j < loadedCloudModel.vertices.length; j += 3) {
            vec3.set(tempVec, loadedCloudModel.vertices[j], loadedCloudModel.vertices[j+1], loadedCloudModel.vertices[j+2]);
            vec3.transformMat4(tempVec, tempVec, mat);
            finalVertices.push(tempVec[0], tempVec[1], tempVec[2]);
            vec3.set(tempVec, loadedCloudModel.normals[j], loadedCloudModel.normals[j+1], loadedCloudModel.normals[j+2]);
            const normMat = mat3.create(); mat3.fromMat4(normMat, mat);
            vec3.transformMat3(tempVec, tempVec, normMat);
            vec3.normalize(tempVec, tempVec);
            finalNormals.push(tempVec[0], tempVec[1], tempVec[2]);
            finalColors.push(1.0, 1.0, 1.0);
        }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudPositionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(finalVertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudNormalBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(finalNormals), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudColorBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(finalColors), gl.STATIC_DRAW);
    cloudVertexCount = finalVertices.length / 3;
}

function render() {
    if (!isDragging) planetRotY += autoRotateSpeed;
    cloudRotY += autoRotateSpeed * 1.5; 
    mat4.identity(mouseRotMatrix);
    mat4.rotateX(mouseRotMatrix, mouseRotMatrix, mouseRotX);
    mat4.rotateY(mouseRotMatrix, mouseRotMatrix, mouseRotY);
    mat4.identity(modelMatrix);
    mat4.multiply(modelMatrix, mouseRotMatrix, modelMatrix);
    mat4.rotateY(modelMatrix, modelMatrix, planetRotY);
    mat4.identity(cloudModelMatrix);
    mat4.multiply(cloudModelMatrix, mouseRotMatrix, cloudModelMatrix);
    mat4.rotateY(cloudModelMatrix, cloudModelMatrix, cloudRotY);
    const sunX = Math.sin(sunAngle); const sunZ = Math.cos(sunAngle);
    const baseLightPos = vec3.fromValues(sunX * 20.0, 10.0, sunZ * 20.0);
    const lightPos = vec3.create(); vec3.transformMat4(lightPos, baseLightPos, mouseRotMatrix);
    mat4.lookAt(lightViewMatrix, lightPos, [0,0,0], [0,1,0]);
    mat4.multiply(lightSpaceMatrix, lightProjectionMatrix, lightViewMatrix);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.viewport(0, 0, shadowTextureSize, shadowTextureSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shadowProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uLightMatrix'), false, lightSpaceMatrix);
    gl.disable(gl.CULL_FACE); 
    const sPos = gl.getAttribLocation(shadowProgram, 'aPosition');
    gl.enableVertexAttribArray(sPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(sPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uModel'), false, modelMatrix);
    if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudPositionBuffer);
    gl.vertexAttribPointer(sPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uModel'), false, cloudModelMatrix);
    if (cloudVertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, cloudVertexCount);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.useProgram(mainProgram);
    mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
    mat4.lookAt(viewMatrix, [0, 0, cameraDistance], [0, 0, 0], [0, 1, 0]);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uProjection'), false, projectionMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uView'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uLightMatrix'), false, lightSpaceMatrix);
    const lightDirVec = vec3.create(); vec3.normalize(lightDirVec, lightPos);
    gl.uniform3fv(gl.getUniformLocation(mainProgram, 'uLightDirection'), lightDirVec);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture);
    gl.uniform1i(gl.getUniformLocation(mainProgram, 'uShadowMap'), 0);
    const mPos = gl.getAttribLocation(mainProgram, 'aPosition'); gl.enableVertexAttribArray(mPos);
    const mNorm = gl.getAttribLocation(mainProgram, 'aNormal'); gl.enableVertexAttribArray(mNorm);
    const mCol = gl.getAttribLocation(mainProgram, 'aColor'); gl.enableVertexAttribArray(mCol);
    const uReceiveShadowsLoc = gl.getUniformLocation(mainProgram, 'uReceiveShadows');
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.vertexAttribPointer(mPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer); gl.vertexAttribPointer(mNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer); gl.vertexAttribPointer(mCol, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uModel'), false, modelMatrix);
    gl.uniform1i(uReceiveShadowsLoc, 1); 
    if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudPositionBuffer); gl.vertexAttribPointer(mPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudNormalBuffer); gl.vertexAttribPointer(mNorm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, cloudColorBuffer); gl.vertexAttribPointer(mCol, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uModel'), false, cloudModelMatrix);
    gl.uniform1i(uReceiveShadowsLoc, 0); 
    if (cloudVertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, cloudVertexCount);
    requestAnimationFrame(render);
}

window.onload = function() {
    initializeSeed(currentSeedString);
    setupUI();
    updateUIFromState();
    updatePlanetGeometry();
    generateClouds();
    render();
};