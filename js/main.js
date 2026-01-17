const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

const vsSource = `
    attribute vec3 aPosition;
    
    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;

    void main() {
        // Multiplicação na ordem inversa: Projeção * Câmera * Objeto * Vértice
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    }
`;

const fsSource = `
    void main() {
        gl_FragColor = vec4(0.0, 1.0, 0.4, 1.0); // Um verde mais "tech"
    }
`;

const vertexShader = Utils.createShader(gl, gl.VERTEX_SHADER, vsSource);
const fragmentShader = Utils.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
const program = Utils.createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);

const planet = new IcoSphere();

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(planet.vertices), gl.STATIC_DRAW);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(planet.indices), gl.STATIC_DRAW);

// Linkar atributo aPosition
const aPosition = gl.getAttribLocation(program, 'aPosition');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

// Localizações das uniforms
const uModelLoc = gl.getUniformLocation(program, 'uModel');
const uViewLoc = gl.getUniformLocation(program, 'uView');
const uProjectionLoc = gl.getUniformLocation(program, 'uProjection');

// Criar as matrizes usando gl-matrix
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

    angle += 0.01; // Velocidade de rotação
    mat4.identity(modelMatrix); // Reseta a matriz
    mat4.rotateY(modelMatrix, modelMatrix, angle); // Gira no eixo Y
    mat4.rotateX(modelMatrix, modelMatrix, angle * 0.5); // Gira um pouco no X também

    gl.uniformMatrix4fv(uModelLoc, false, modelMatrix);
    gl.drawElements(gl.LINES, planet.indices.length, gl.UNSIGNED_SHORT, 0);

    requestAnimationFrame(render);
}

render();