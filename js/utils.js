const Utils = {
    createShader: (gl, type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Erro no shader:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    },

    createProgram: (gl, vertexShader, fragmentShader) => {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Erro no programa:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    },

    randomFromSeed: function(seed) {
        var x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    },

    pseudoRandom3D: function(x, y, z, seed) {
        const n = x * 12.9898 + y * 78.233 + z * 37.719 + seed;
        return Utils.randomFromSeed(n);
    }
};