const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

const vsSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;

    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;

    varying vec3 vNormal;
    varying float vHeight;

    void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
        vNormal = mat3(uModel) * aNormal;
        vHeight = length(aPosition);
    }
`;

const fsSource = `
    precision mediump float;
    
    varying vec3 vNormal;
    varying float vHeight;

    uniform float uWaterLevel;

    vec3 colorFromRGB(float r, float g, float b) {
        return vec3(r / 255.0, g / 255.0, b / 255.0);
    }

    void main() {
        vec3 baseColor;
        
        if (vHeight <= uWaterLevel + 0.001) {
            baseColor = colorFromRGB(30.0, 60.0, 160.0); // Oceano
        } 
        else if (vHeight < uWaterLevel + 0.05) {
            baseColor = colorFromRGB(240.0, 220.0, 150.0); // Areia
        } 
        else if (vHeight < uWaterLevel + 0.20) {
            baseColor = colorFromRGB(60.0, 160.0, 60.0); // Floresta
        } 
        else if (vHeight < uWaterLevel + 0.35) {
             baseColor = colorFromRGB(120.0, 120.0, 120.0); // Rocha
        }
        else {
            baseColor = colorFromRGB(255.0, 255.0, 255.0); // Neve
        }

        vec3 lightDirection = normalize(vec3(1.0, 1.0, 1.0));
        vec3 normal = normalize(vNormal);

        float light = max(dot(normal, lightDirection), 0.2);

        gl_FragColor = vec4(baseColor * light, 1.0);
    }
`;

const vertexShader = Utils.createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = Utils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const program = Utils.createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);

const uModelLoc = gl.getUniformLocation(program, 'uModel');
const uViewLoc = gl.getUniformLocation(program, 'uView');
const uProjectionLoc = gl.getUniformLocation(program, 'uProjection');
const uWaterLevelLoc = gl.getUniformLocation(program, 'uWaterLevel');
const aPosition = gl.getAttribLocation(program, 'aPosition');
const aNormal = gl.getAttribLocation(program, 'aNormal');

const positionBuffer = gl.createBuffer();
const normalBuffer = gl.createBuffer();

const state = {
    noiseStrength: 0.2,
    noiseFreq: 1.5,
    waterLevel: 1.0
};

let vertexCount = 0;

function updatePlanetGeometry() {
    const planet = new IcoSphere(7); 
    
    planet.applyNoise(state.noiseStrength, state.noiseFreq, state.waterLevel);
    
    planet.toFlatGeometry();
    planet.calculateNormals();

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aNormal);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

    vertexCount = planet.vertices.length / 3;
}

function setupUI() {
    const elStrength = document.getElementById('noiseStrength');
    const elFreq = document.getElementById('noiseFreq');
    const elWater = document.getElementById('waterLevel');
    const btnRegenerate = document.getElementById('btnRegenerate');

    if(elStrength) {
        elStrength.addEventListener('input', (e) => {
            state.noiseStrength = parseFloat(e.target.value);
            updatePlanetGeometry(); 
        });
    }

    if(elFreq) {
        elFreq.addEventListener('input', (e) => {
            state.noiseFreq = parseFloat(e.target.value);
            updatePlanetGeometry(); 
        });
    }

    if(elWater) {
        elWater.addEventListener('input', (e) => {
            state.waterLevel = parseFloat(e.target.value);
            updatePlanetGeometry(); 
        });
    }
    
    if(btnRegenerate) {
        btnRegenerate.addEventListener('click', () => {
            updatePlanetGeometry();
        });
    }
}

const modelMatrix = mat4.create();
const viewMatrix = mat4.create();
const projectionMatrix = mat4.create();

mat4.lookAt(viewMatrix, [0, 0, 4], [0, 0, 0], [0, 1, 0]);
mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);

gl.uniformMatrix4fv(uViewLoc, false, viewMatrix);
gl.uniformMatrix4fv(uProjectionLoc, false, projectionMatrix);

let angle = 0;

function render() {
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    angle += 0.005;
    mat4.identity(modelMatrix);
    mat4.rotateY(modelMatrix, modelMatrix, angle);
    mat4.rotateX(modelMatrix, modelMatrix, angle * 0.3);

    gl.uniformMatrix4fv(uModelLoc, false, modelMatrix);
    gl.uniform1f(uWaterLevelLoc, state.waterLevel);

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