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

    stringToHash: function(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; 
        }
        return hash;
    },

    createSeededRandom: function(seed) {
        return function() {
          var t = seed += 0x6D2B79F5;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
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
    },

    hexToRgb: function(hex) {
        const r = parseInt(hex.substr(1, 2), 16) / 255;
        const g = parseInt(hex.substr(3, 2), 16) / 255;
        const b = parseInt(hex.substr(5, 2), 16) / 255;
        return [r, g, b];
    },

    rgbToHex: function(r, g, b) {
        const toHex = (c) => {
            const hex = Math.round(c * 255).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        };
        return "#" + toHex(r) + toHex(g) + toHex(b);
    },

    ValueNoise3D: function(x, y, z, seed) {
        const floorX = Math.floor(x); const floorY = Math.floor(y); const floorZ = Math.floor(z);
        const fractX = x - floorX; const fractY = y - floorY; const fractZ = z - floorZ;
        const smooth = (t) => t * t * (3 - 2 * t);
        const u = smooth(fractX); const v = smooth(fractY); const w = smooth(fractZ);
        const hash = (i, j, k) => Utils.pseudoRandom3D(i, j, k, seed);
        const n000 = hash(floorX, floorY, floorZ);
        const n100 = hash(floorX + 1, floorY, floorZ);
        const n010 = hash(floorX, floorY + 1, floorZ);
        const n110 = hash(floorX + 1, floorY + 1, floorZ);
        const n001 = hash(floorX, floorY, floorZ + 1);
        const n101 = hash(floorX + 1, floorY, floorZ + 1);
        const n011 = hash(floorX, floorY + 1, floorZ + 1);
        const n111 = hash(floorX + 1, floorY + 1, floorZ + 1);
        const i1 = n000 + u * (n100 - n000);
        const i2 = n010 + u * (n110 - n010);
        const j1 = i1 + v * (i2 - i1);
        const i3 = n001 + u * (n101 - n001);
        const i4 = n011 + u * (n111 - n011);
        const j2 = i3 + v * (i4 - i3);
        return (j1 + w * (j2 - j1)) * 2.0 - 1.0; 
    },

    perlinPermutation: null,
    initPerlin: function(seed) {
        const rand = Utils.createSeededRandom(seed);
        this.perlinPermutation = new Uint8Array(512);
        const p = new Uint8Array(256);
        for(let i=0; i<256; i++) p[i] = i;
        for(let i=255; i>0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        for(let i=0; i<512; i++) this.perlinPermutation[i] = p[i & 255];
    },

    PerlinNoise3D: function(x, y, z) {
        if(!this.perlinPermutation) this.initPerlin(0);
        const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255; const Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        const u = fade(x); const v = fade(y); const w = fade(z);
        const p = this.perlinPermutation;
        const A = p[X]+Y, AA = p[A]+Z, AB = p[A+1]+Z;
        const B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;
        const grad = (hash, x, y, z) => {
            const h = hash & 15;
            const u = h < 8 ? x : y;
            const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        };
        return ((1-w) * ((1-v) * ((1-u) * grad(p[AA], x, y, z) + u * grad(p[BA], x-1, y, z)) +
                         v * ((1-u) * grad(p[AB], x, y-1, z) + u * grad(p[BB], x-1, y-1, z))) +
                 w * ((1-v) * ((1-u) * grad(p[AA+1], x, y, z-1) + u * grad(p[BA+1], x-1, y, z-1)) +
                      v * ((1-u) * grad(p[AB+1], x, y-1, z-1) + u * grad(p[BB+1], x-1, y-1, z-1))));
    },

    easeOutElastic: function(x) {
        const c4 = (2 * Math.PI) / 3;
        return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
};