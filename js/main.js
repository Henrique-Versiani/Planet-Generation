const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

// --- 1. SHADERS ---
const vsSource = `
    attribute vec3 aPosition;
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;
    void main() {
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    }
`;

// Mudei a cor para um azul/verde mais sólido para vermos o preenchimento
const fsSource = `
    void main() {
        gl_FragColor = vec4(0.2, 0.6, 0.8, 1.0); 
    }
`;

const vertexShader = Utils.createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = Utils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const program = Utils.createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);


const planet = new IcoSphere(5);
planet.applyNoise(0.1, 2);
planet.toFlatGeometry();

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);

const aPosition = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

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