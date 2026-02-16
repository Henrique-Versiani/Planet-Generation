class IcoSphere {
    constructor(subdivisions = 1) {
        this.vertices = [];
        this.indices = [];
        this.normals = [];
        this.colors = [];
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

        if (this.indexCache[key] !== undefined) return this.indexCache[key];

        const v1x = this.vertices[smallerIndex * 3], v1y = this.vertices[smallerIndex * 3 + 1], v1z = this.vertices[smallerIndex * 3 + 2];
        const v2x = this.vertices[greaterIndex * 3], v2y = this.vertices[greaterIndex * 3 + 1], v2z = this.vertices[greaterIndex * 3 + 2];
        
        const i = this.addVertex((v1x + v2x) / 2, (v1y + v2y) / 2, (v1z + v2z) / 2);
        this.indexCache[key] = i;
        return i;
    }

    initBaseIcosahedron() {
        const t = (1.0 + Math.sqrt(5.0)) / 2.0;
        this.addVertex(-1, t, 0); this.addVertex(1, t, 0); this.addVertex(-1, -t, 0); this.addVertex(1, -t, 0);
        this.addVertex(0, -1, t); this.addVertex(0, 1, t); this.addVertex(0, -1, -t); this.addVertex(0, 1, -t);
        this.addVertex(t, 0, -1); this.addVertex(t, 0, 1); this.addVertex(-t, 0, -1); this.addVertex(-t, 0, 1);
        this.indices = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
    }

    subdivide(recursionLevel) {
        for (let i = 0; i < recursionLevel; i++) {
            const newIndices = [];
            for (let j = 0; j < this.indices.length; j += 3) {
                const a = this.indices[j], b = this.indices[j+1], c = this.indices[j+2];
                const ab = this.getMiddlePoint(a, b), bc = this.getMiddlePoint(b, c), ca = this.getMiddlePoint(c, a);
                newIndices.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
            }
            this.indices = newIndices;
        }
    }

    applyNoise(strength, frequency, minLevel, noiseFn) {
        for (let i = 0; i < this.vertices.length; i += 3) {
            let x = this.vertices[i], y = this.vertices[i+1], z = this.vertices[i+2];

            const noiseValue = noiseFn(x * frequency, y * frequency, z * frequency);
            
            let deformation = 1.0 + (noiseValue * strength);
            if (deformation < minLevel) deformation = minLevel;
            
            this.vertices[i] = x * deformation;
            this.vertices[i + 1] = y * deformation;
            this.vertices[i + 2] = z * deformation;
        }
    }

    generateColors(waterLevel, noiseFn, strength, freq, maxDepth, palette) {
        this.colors = [];
        const deepWater = palette?.deepWater || [0,0,0.5];
        const shallowWater = palette?.shallowWater || [0,0.5,1];

        for (let i = 0; i < this.vertices.length; i += 3) {
            const x = this.vertices[i], y = this.vertices[i+1], z = this.vertices[i+2];
            const currentLen = Math.sqrt(x*x + y*y + z*z);
            const nx = x / currentLen; const ny = y / currentLen; const nz = z / currentLen;

            let r, g, b;

            if (currentLen <= waterLevel + 0.001) {
                const noiseVal = noiseFn(nx * freq, ny * freq, nz * freq);
                
                const theoreticalHeight = 1.0 + (noiseVal * strength);
                const depth = waterLevel - theoreticalHeight;
                let depthFactor = depth / maxDepth;
                depthFactor = Math.max(0.0, Math.min(1.0, depthFactor));

                r = shallowWater[0] * (1.0 - depthFactor) + deepWater[0] * depthFactor;
                g = shallowWater[1] * (1.0 - depthFactor) + deepWater[1] * depthFactor;
                b = shallowWater[2] * (1.0 - depthFactor) + deepWater[2] * depthFactor;
            } else {
                const altitude = currentLen - waterLevel;
                let col;
                if(!palette) {
                    r=0.5; g=0.5; b=0.5;
                } else {
                    if (altitude < 0.02) col = palette.sand;
                    else if (altitude < 0.05) col = palette.grass;
                    else if (altitude < 0.1) col = palette.forest;
                    else if (altitude < 0.15) col = palette.rock;
                    else if (altitude < 0.20) col = palette.rock; 
                    else col = palette.snow;
                    if(col) { r=col[0]; g=col[1]; b=col[2]; }
                    else { r=1; g=0; b=1; }
                }
            }
            this.colors.push(r, g, b);
        }
    }

    toFlatGeometry() {
        const newVertices = [];
        const newColors = [];
        for (let i = 0; i < this.indices.length; i++) {
            const index = this.indices[i];
            newVertices.push(this.vertices[index * 3], this.vertices[index * 3 + 1], this.vertices[index * 3 + 2]);
            newColors.push(this.colors[index * 3], this.colors[index * 3 + 1], this.colors[index * 3 + 2]);
        }
        this.vertices = newVertices;
        this.colors = newColors;
        this.indices = null;
    }

    getTreeGeometry(treeSeed) {
        const treeVertices = [];
        const treeColors = [];
        const w = 0.007; const h = 0.06; 
        const trunkGeo = [ -w,0,-w, w,0,-w, w,0,w, -w,0,w, -w,h,-w, w,h,-w, w,h,w, -w,h,w ];
        const trunkIndices = [0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
        for (let idx of trunkIndices) {
            treeVertices.push(trunkGeo[idx*3], trunkGeo[idx*3+1], trunkGeo[idx*3+2]);
            treeColors.push(0.4, 0.3, 0.2);
        }
        const foliage = new IcoSphere(0); 
        const leafScale = 0.04;
        const type = Utils.randomFromSeed(treeSeed * 50); 
        let r, g, b;
        if(type < 0.33) { r=0.2; g=0.6; b=0.2; } else if(type < 0.66) { r=0.4; g=0.7; b=0.2; } else { r=0.8; g=0.5; b=0.1; }
        for(let idx of foliage.indices) {
            treeVertices.push(foliage.vertices[idx*3] * leafScale, foliage.vertices[idx*3+1] * leafScale + h, foliage.vertices[idx*3+2] * leafScale);
            treeColors.push(r, g, b);
        }
        return { v: treeVertices, c: treeColors };
    }

    distributeTrees(plantedPositions, waterLevel, noiseFn, strength, freq) {
        const newVertices = [...this.vertices];
        const newColors = [...this.colors];
        const mat = mat4.create(); const q = quat.create(); const up = vec3.fromValues(0, 1, 0);
        const pos = vec3.create(); const norm = vec3.create(); const treePos = vec3.create();

        for (let i = 0; i < plantedPositions.length; i++) {
            const p = plantedPositions[i];
            const seed = p.x + p.y + p.z;
            vec3.set(norm, p.x, p.y, p.z);
            vec3.normalize(norm, norm);

            const noiseVal = noiseFn(norm[0] * freq, norm[1] * freq, norm[2] * freq);
            
            let height = 1.0 + (noiseVal * strength);
            if (height <= waterLevel) continue; 
            const altitude = height - waterLevel;
            if (altitude < 0.02 || altitude > 0.35) continue; 

            vec3.scale(pos, norm, height);

            const treeGeom = this.getTreeGeometry(seed);
            quat.rotationTo(q, up, norm);
            mat4.fromRotationTranslation(mat, q, pos);

            for (let j = 0; j < treeGeom.v.length; j+=3) {
                vec3.set(treePos, treeGeom.v[j], treeGeom.v[j+1], treeGeom.v[j+2]);
                vec3.transformMat4(treePos, treePos, mat);
                newVertices.push(treePos[0], treePos[1], treePos[2]);
                newColors.push(treeGeom.c[j], treeGeom.c[j+1], treeGeom.c[j+2]);
            }
        }
        this.vertices = newVertices;
        this.colors = newColors;
    }

    calculateNormals() {
        this.normals = [];
        for (let i = 0; i < this.vertices.length; i += 9) {
            const ax = this.vertices[i], ay = this.vertices[i+1], az = this.vertices[i+2];
            const bx = this.vertices[i+3], by = this.vertices[i+4], bz = this.vertices[i+5];
            const cx = this.vertices[i+6], cy = this.vertices[i+7], cz = this.vertices[i+8];
            const v1x = bx - ax, v1y = by - ay, v1z = bz - az;
            const v2x = cx - ax, v2y = cy - ay, v2z = cz - az;
            let nx = v1y * v2z - v1z * v2y, ny = v1z * v2x - v1x * v2z, nz = v1x * v2y - v1y * v2x;
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            nx /= len; ny /= len; nz /= len;
            this.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        }
    }
}