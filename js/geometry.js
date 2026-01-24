class IcoSphere {
    constructor(subdivisions = 1) {
        this.vertices = [];
        this.indices = [];
        this.normals = [];
        this.indexCache = {};
        
        this.initBaseIcosahedron();
        this.subdivide(subdivisions);
    }

    addVertex(x, y, z) {
        const length = Math.sqrt(x*x + y*y + z*z);
        this.vertices.push(x / length, y / length, z / length);
        return (this.vertices.length / 3) - 1;
    }

    getMiddlePoint(p1Index, p2Index) {
        const smallerIndex = Math.min(p1Index, p2Index);
        const greaterIndex = Math.max(p1Index, p2Index);
        const key = `${smallerIndex}-${greaterIndex}`;

        if (this.indexCache[key] !== undefined) {
            return this.indexCache[key];
        }

        const v1x = this.vertices[smallerIndex * 3];
        const v1y = this.vertices[smallerIndex * 3 + 1];
        const v1z = this.vertices[smallerIndex * 3 + 2];
        
        const v2x = this.vertices[greaterIndex * 3];
        const v2y = this.vertices[greaterIndex * 3 + 1];
        const v2z = this.vertices[greaterIndex * 3 + 2];

        const mx = (v1x + v2x) / 2;
        const my = (v1y + v2y) / 2;
        const mz = (v1z + v2z) / 2;

        const i = this.addVertex(mx, my, mz);
        this.indexCache[key] = i;
        return i;
    }

    initBaseIcosahedron() {
        const t = (1.0 + Math.sqrt(5.0)) / 2.0;

        this.addVertex(-1,  t,  0); this.addVertex( 1,  t,  0);
        this.addVertex(-1, -t,  0); this.addVertex( 1, -t,  0);
        this.addVertex( 0, -1,  t); this.addVertex( 0,  1,  t);
        this.addVertex( 0, -1, -t); this.addVertex( 0,  1, -t);
        this.addVertex( t,  0, -1); this.addVertex( t,  0,  1);
        this.addVertex(-t,  0, -1); this.addVertex(-t,  0,  1);

        this.indices = [
            0, 11, 5,  0, 5, 1,  0, 1, 7,  0, 7, 10,  0, 10, 11,
            1, 5, 9,  5, 11, 4,  11, 10, 2,  10, 7, 6,  7, 1, 8,
            3, 9, 4,  3, 4, 2,  3, 2, 6,  3, 6, 8,  3, 8, 9,
            4, 9, 5,  2, 4, 11,  6, 2, 10,  8, 6, 7,  9, 8, 1
        ];
    }

    subdivide(recursionLevel) {
        for (let i = 0; i < recursionLevel; i++) {
            const newIndices = [];
            for (let j = 0; j < this.indices.length; j += 3) {
                const a = this.indices[j];
                const b = this.indices[j+1];
                const c = this.indices[j+2];

                const ab = this.getMiddlePoint(a, b);
                const bc = this.getMiddlePoint(b, c);
                const ca = this.getMiddlePoint(c, a);

                newIndices.push(a, ab, ca);
                newIndices.push(b, bc, ab);
                newIndices.push(c, ca, bc);
                newIndices.push(ab, bc, ca);
            }
            this.indices = newIndices;
        }
    }

    applyNoise(strength = 0.1, frequency = 2.0, minLevel = 1.0) {
        const simplex = new SimplexNoise();

        for (let i = 0; i < this.vertices.length; i += 3) {
            let x = this.vertices[i];
            let y = this.vertices[i+1];
            let z = this.vertices[i+2];

            const noiseValue = simplex.noise3D(x * frequency, y * frequency, z * frequency);

            let deformation = 1.0 + (noiseValue * strength);

            if (deformation < minLevel) {
                deformation = minLevel;
            }

            this.vertices[i]     = x * deformation;
            this.vertices[i + 1] = y * deformation;
            this.vertices[i + 2] = z * deformation;
        }
    }

    toFlatGeometry() {
        const newVertices = [];
        for (let i = 0; i < this.indices.length; i++) {
            const index = this.indices[i];
            newVertices.push(
                this.vertices[index * 3],
                this.vertices[index * 3 + 1],
                this.vertices[index * 3 + 2]
            );
        }
        this.vertices = newVertices;
        this.indices = null;
    }

    calculateNormals() {
        this.normals = [];
        for (let i = 0; i < this.vertices.length; i += 9) {
            const ax = this.vertices[i],   ay = this.vertices[i+1], az = this.vertices[i+2];
            const bx = this.vertices[i+3], by = this.vertices[i+4], bz = this.vertices[i+5];
            const cx = this.vertices[i+6], cy = this.vertices[i+7], cz = this.vertices[i+8];

            const v1x = bx - ax, v1y = by - ay, v1z = bz - az;
            const v2x = cx - ax, v2y = cy - ay, v2z = cz - az;

            let nx = v1y * v2z - v1z * v2y;
            let ny = v1z * v2x - v1x * v2z;
            let nz = v1x * v2y - v1y * v2x;

            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            nx /= len; ny /= len; nz /= len;

            this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        }
    }
}