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
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uLightDirection);
        float nDotL = max(dot(normal, lightDir), 0.0);
        float shadow = 0.0;
        vec3 shadowCoord = vShadowCoord.xyz / vShadowCoord.w;
        if (shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z >= 0.0 && shadowCoord.z <= 1.0) {
            float bias = max(0.005 * (1.0 - nDotL), 0.001);
            float shadowDepth = texture2D(uShadowMap, shadowCoord.xy).r;
            if (shadowCoord.z > shadowDepth + bias) shadow = 1.0;
        }
        if (nDotL == 0.0) shadow = 1.0;
        vec3 finalColor = vColor * (0.4 + (0.6 * (1.0 - shadow) * nDotL));
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
const state = {
    noiseStrength: 0.2, noiseFreq: 1.5, waterLevel: 1.0, resolution: 4
};

let plantedTrees = []; 
let currentPlanetGeometry = null;
let currentNoise = new SimplexNoise(); 
let vertexCount = 0;
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;
let clickStartX = 0, clickStartY = 0;
let mouseRotX = 0, mouseRotY = 0;
let planetRotY = 0;
let autoRotateSpeed = 0.001;
let sunAngle = 1.0;
let cameraDistance = 4.0;

const modelMatrix = mat4.create();
const viewMatrix = mat4.create();
const projectionMatrix = mat4.create();
const mouseRotMatrix = mat4.create();

function rayIntersectsTriangle(rayOrigin, rayDir, v0, v1, v2) {
    const edge1 = vec3.create();
    const edge2 = vec3.create();
    const h = vec3.create();
    const s = vec3.create();
    const q = vec3.create();

    vec3.subtract(edge1, v1, v0);
    vec3.subtract(edge2, v2, v0);
    vec3.cross(h, rayDir, edge2);
    const a = vec3.dot(edge1, h);

    if (a > -0.00001 && a < 0.00001) return null;

    const f = 1.0 / a;
    vec3.subtract(s, rayOrigin, v0);
    const u = f * vec3.dot(s, h);
    if (u < 0.0 || u > 1.0) return null;

    vec3.cross(q, s, edge1);
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
    const rayClip = vec4.fromValues(x, y, -1.0, 1.0);
    const invProj = mat4.create();
    mat4.invert(invProj, projectionMatrix);
    const rayEye = vec4.create();
    vec4.transformMat4(rayEye, rayClip, invProj);
    rayEye[2] = -1.0; 
    rayEye[3] = 0.0;

    const invView = mat4.create();
    mat4.invert(invView, viewMatrix);
    const rayWorldDir = vec4.create();
    vec4.transformMat4(rayWorldDir, rayEye, invView);
    const rayDir = vec3.fromValues(rayWorldDir[0], rayWorldDir[1], rayWorldDir[2]);
    vec3.normalize(rayDir, rayDir);

    const rayOrigin = vec3.fromValues(viewMatrix[12], viewMatrix[13], viewMatrix[14]);
    const camPos = vec3.fromValues(invView[12], invView[13], invView[14]);
    const invModel = mat4.create();
    mat4.invert(invModel, modelMatrix);

    const rayOriginLocal = vec3.create();
    vec3.transformMat4(rayOriginLocal, camPos, invModel);

    const rayDirLocal = vec3.create();
    const rayDirVec4 = vec4.fromValues(rayDir[0], rayDir[1], rayDir[2], 0.0);
    vec4.transformMat4(rayDirVec4, rayDirVec4, invModel);
    vec3.set(rayDirLocal, rayDirVec4[0], rayDirVec4[1], rayDirVec4[2]);
    vec3.normalize(rayDirLocal, rayDirLocal);
    
    let closestDist = Infinity;
    let hitPoint = null;
    let hitColor = null;

    const verts = currentPlanetGeometry.vertices;
    const colors = currentPlanetGeometry.colors;

    for (let i = 0; i < verts.length; i += 9) {
        const v0 = vec3.fromValues(verts[i], verts[i+1], verts[i+2]);
        const v1 = vec3.fromValues(verts[i+3], verts[i+4], verts[i+5]);
        const v2 = vec3.fromValues(verts[i+6], verts[i+7], verts[i+8]);

        const hit = rayIntersectsTriangle(rayOriginLocal, rayDirLocal, v0, v1, v2);
        
        if (hit) {
            const dist = vec3.distance(rayOriginLocal, hit);
            if (dist < closestDist) {
                closestDist = dist;
                hitPoint = hit;
                hitColor = { r: colors[i], g: colors[i+1], b: colors[i+2] };
            }
        }
    }

    if (hitPoint) {
        if (hitColor.g > hitColor.r && hitColor.g > hitColor.b) {
            plantedTrees.push({ x: hitPoint[0], y: hitPoint[1], z: hitPoint[2] });
            updatePlanetGeometry();
        } else {
            console.log("Solo infértil aqui.");
        }
    }
}

canvas.addEventListener('mousedown', e => { 
    isDragging = true; 
    lastMouseX = e.clientX; 
    lastMouseY = e.clientY;
    clickStartX = e.clientX;
    clickStartY = e.clientY;
});

window.addEventListener('mouseup', (e) => { 
    isDragging = false; 
    const dist = Math.hypot(e.clientX - clickStartX, e.clientY - clickStartY);
    if (dist < 5) {
        castRay(e.clientX, e.clientY);
    }
});

canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    mouseRotY += (e.clientX - lastMouseX) * 0.005;
    mouseRotX += (e.clientY - lastMouseY) * 0.005;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
});
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cameraDistance = Math.max(1.8, Math.min(10.0, cameraDistance + e.deltaY * 0.005));
}, {passive: false});

function updatePlanetGeometry() {
    const planet = new IcoSphere(state.resolution); 
    planet.applyNoise(state.noiseStrength, state.noiseFreq, state.waterLevel, currentNoise);
    planet.generateColors(state.waterLevel); 
    planet.toFlatGeometry(); 
    planet.distributeTrees(plantedTrees);
    planet.calculateNormals();

    currentPlanetGeometry = planet;

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.normals), gl.STATIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.colors), gl.STATIC_DRAW);

    vertexCount = planet.vertices.length / 3;
}

function setupUI() {
    const elSpeed = document.getElementById('rotationSpeed');
    if(elSpeed) elSpeed.addEventListener('input', e => autoRotateSpeed = parseFloat(e.target.value));
    const elSun = document.getElementById('sunPosition');
    if(elSun) elSun.addEventListener('input', e => sunAngle = parseFloat(e.target.value));

    ['resolution', 'noiseStrength', 'noiseFreq', 'waterLevel'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', e => {
            state[id] = (id==='resolution') ? parseInt(e.target.value) : parseFloat(e.target.value);
            updatePlanetGeometry();
        });
    });

    document.getElementById('btnRegenerate')?.addEventListener('click', () => {
        currentNoise = new SimplexNoise();
        plantedTrees = [];
        updatePlanetGeometry();
    });
}

const lightProjectionMatrix = mat4.create();
const lightViewMatrix = mat4.create();
const lightSpaceMatrix = mat4.create();

mat4.ortho(lightProjectionMatrix, -10, 10, -10, 10, 0.1, 50.0);

function render() {
    if (!isDragging) planetRotY += autoRotateSpeed;

    mat4.identity(mouseRotMatrix);
    mat4.rotateX(mouseRotMatrix, mouseRotMatrix, mouseRotX);
    mat4.rotateY(mouseRotMatrix, mouseRotMatrix, mouseRotY);

    mat4.identity(modelMatrix);
    mat4.multiply(modelMatrix, mouseRotMatrix, modelMatrix);
    mat4.rotateY(modelMatrix, modelMatrix, planetRotY);

    const sunX = Math.sin(sunAngle);
    const sunZ = Math.cos(sunAngle);
    const baseLightPos = vec3.fromValues(sunX * 20.0, 10.0, sunZ * 20.0);
    const lightPos = vec3.create();
    vec3.transformMat4(lightPos, baseLightPos, mouseRotMatrix);

    mat4.lookAt(lightViewMatrix, lightPos, [0,0,0], [0,1,0]);
    mat4.multiply(lightSpaceMatrix, lightProjectionMatrix, lightViewMatrix);

    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
    gl.viewport(0, 0, shadowTextureSize, shadowTextureSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(shadowProgram);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const sPos = gl.getAttribLocation(shadowProgram, 'aPosition');
    gl.enableVertexAttribArray(sPos);
    gl.vertexAttribPointer(sPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uLightMatrix'), false, lightSpaceMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uModel'), false, modelMatrix);
    
    gl.disable(gl.CULL_FACE); 
    if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.useProgram(mainProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const mPos = gl.getAttribLocation(mainProgram, 'aPosition');
    gl.enableVertexAttribArray(mPos);
    gl.vertexAttribPointer(mPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    const mNorm = gl.getAttribLocation(mainProgram, 'aNormal');
    gl.enableVertexAttribArray(mNorm);
    gl.vertexAttribPointer(mNorm, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    const mCol = gl.getAttribLocation(mainProgram, 'aColor');
    gl.enableVertexAttribArray(mCol);
    gl.vertexAttribPointer(mCol, 3, gl.FLOAT, false, 0, 0);

    mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
    mat4.lookAt(viewMatrix, [0, 0, cameraDistance], [0, 0, 0], [0, 1, 0]);

    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uProjection'), false, projectionMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uView'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uModel'), false, modelMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(mainProgram, 'uLightMatrix'), false, lightSpaceMatrix);

    const lightDirVec = vec3.create();
    vec3.normalize(lightDirVec, lightPos);
    gl.uniform3fv(gl.getUniformLocation(mainProgram, 'uLightDirection'), lightDirVec);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowDepthTexture);
    gl.uniform1i(gl.getUniformLocation(mainProgram, 'uShadowMap'), 0);

    if (vertexCount > 0) gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    requestAnimationFrame(render);
}

window.onload = function() {
    setupUI();
    updatePlanetGeometry();
    render();
};