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

    vec3 colorFromRGB(float r, float g, float b) {
        return vec3(r / 255.0, g / 255.0, b / 255.0);
    }

    void main() {
        vec3 baseColor;
        
        if (vHeight < 1.0) {
            // Oceano (Azul escuro)
            baseColor = colorFromRGB(30.0, 60.0, 160.0);
        } 
        else if (vHeight < 1.03) {
            // Areia / Praia (Amarelo claro)
            baseColor = colorFromRGB(240.0, 220.0, 150.0);
        } 
        else if (vHeight < 1.12) {
            // Floresta / Terra (Verde)
            baseColor = colorFromRGB(60.0, 160.0, 60.0);
        } 
        else if (vHeight < 1.16) {
             // Montanha / Rocha (Cinza)
            baseColor = colorFromRGB(120.0, 120.0, 120.0);
        }
        else {
            // Neve / Topo (Branco)
            baseColor = colorFromRGB(255.0, 255.0, 255.0);
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


const planet = new IcoSphere(7);
planet.applyNoise(0.1, 2);
planet.toFlatGeometry();
planet.calculateNormals();

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);

const aPosition = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

const normalBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.normals), gl.STATIC_DRAW);

const aNormal = gl.getAttribLocation(program, 'aNormal');
gl.enableVertexAttribArray(aNormal);
gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

const uModelLoc = gl.getUniformLocation(program, 'uModel');
const uViewLoc = gl.getUniformLocation(program, 'uView');
const uProjectionLoc = gl.getUniformLocation(program, 'uProjection');
const modelMatrix = mat4.create();
const viewMatrix = mat4.create();
const projectionMatrix = mat4.create();
mat4.lookAt(viewMatrix, [0, 0, 4], [0, 0, 0], [0, 1, 0]);
mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100.0);
gl.uniformMatrix4fv(uViewLoc, false, viewMatrix);
gl.uniformMatrix4fv(uProjectionLoc, false, projectionMatrix);

let angle = 0;

const vertexCount = planet.vertices.length / 3;

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
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    requestAnimationFrame(render);
}

render();