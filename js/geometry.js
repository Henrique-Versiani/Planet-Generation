class IcoSphere {
    constructor(subdivisions = 1) {
        this.vertices = [];
        this.indices = [];
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

        const faces = [
            0, 11, 5,  0, 5, 1,  0, 1, 7,  0, 7, 10,  0, 10, 11,
            1, 5, 9,  5, 11, 4,  11, 10, 2,  10, 7, 6,  7, 1, 8,
            3, 9, 4,  3, 4, 2,  3, 2, 6,  3, 6, 8,  3, 8, 9,
            4, 9, 5,  2, 4, 11,  6, 2, 10,  8, 6, 7,  9, 8, 1
        ];

        this.indices = faces;
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

                // Topo
                newIndices.push(a, ab, ca);
                // Direita
                newIndices.push(b, bc, ab);
                // Esquerda
                newIndices.push(c, ca, bc);
                // Centro
                newIndices.push(ab, bc, ca);
            }
            this.indices = newIndices;
        }
    }
    
}