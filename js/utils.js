const Utils = {
    createShader: (gl, type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
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
            console.error(gl.getProgramInfoLog(program));
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
    },

    parseOBJ: function(text) {
        const objPositions = [[0, 0, 0]];
        const objNormals = [[0, 0, 0]];
        const vertices = [];
        const normals = [];
        const colors = [];

        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#') || line === '') continue;

            const elements = line.split(/\s+/);
            const type = elements.shift();

            if (type === 'v') {
                objPositions.push([parseFloat(elements[0]), parseFloat(elements[1]), parseFloat(elements[2])]);
            } else if (type === 'vn') {
                objNormals.push([parseFloat(elements[0]), parseFloat(elements[1]), parseFloat(elements[2])]);
            } else if (type === 'f') {
                const numVerts = elements.length;
                const triangleCount = numVerts - 2;

                for (let t = 0; t < triangleCount; t++) {
                    const indices = [0, t + 1, t + 2];
                    for (let j = 0; j < 3; j++) {
                        const idx = indices[j];
                        const parts = elements[idx].split('/');
                        const vIndex = parseInt(parts[0]);
                        const nIndex = parts.length > 2 && parts[2].length > 0 ? parseInt(parts[2]) : vIndex;

                        const pos = objPositions[vIndex] || [0,0,0];
                        const norm = (nIndex < objNormals.length) ? objNormals[nIndex] : [0, 1, 0];

                        vertices.push(pos[0], pos[1], pos[2]);
                        normals.push(norm[0], norm[1], norm[2]);
                        colors.push(1.0, 1.0, 1.0);
                    }
                }
            }
        }
        return { vertices, normals, colors };
    }
};