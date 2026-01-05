/**
 * ============================================================================
 * SOLID.TS - BREP-Compatible Solid System for Manifold-3D
 * ============================================================================
 * 
 * This module implements a BREP-style solid modeling system compatible with
 * manifold-3d. It mirrors the architecture from the BREP reference project.
 * 
 * Architecture:
 * - Solid class extends THREE.Group
 * - Builds geometry via addTriangle(faceName, p0, p1, p2)
 * - Each face has a unique Manifold ID that survives CSG operations
 * - visualize() creates Face, Edge, Vertex children
 * 
 * Usage:
 *   await initializeSolidModule();
 *   const box = new BoxSolid({ width: 10, height: 10, depth: 10 });
 *   scene.add(box); // Already visualized
 */

import * as THREE from 'three';

// ============================================================================
// MODULE STATE - Manifold references
// ============================================================================

let Manifold: any = null;
let ManifoldMesh: any = null;
let CrossSection: any = null;
let moduleInitialized = false;

/**
 * Initialize the Solid module with Manifold references.
 * Must be called after manifold-3d WASM is loaded.
 */
export function initializeSolidModule(refs: {
  Manifold: any;
  Mesh: any;
  CrossSection?: any;
}): void {
  Manifold = refs.Manifold;
  ManifoldMesh = refs.Mesh;
  CrossSection = refs.CrossSection;
  moduleInitialized = true;
  console.log('[Solid] Module initialized');
  console.log('[Solid] Manifold.reserveIDs:', typeof Manifold?.reserveIDs);
}

export function isModuleReady(): boolean {
  return moduleInitialized && Manifold !== null && ManifoldMesh !== null;
}

// ============================================================================
// MATERIALS - High visibility for hover/selection
// ============================================================================

export const CADMaterials = {
  FACE: {
    BASE: new THREE.MeshStandardMaterial({
      color: 0x5588bb,
      metalness: 0.15,
      roughness: 0.5,
      side: THREE.DoubleSide,
    }),
    HOVER: new THREE.MeshStandardMaterial({
      color: 0x66ddff,
      metalness: 0.1,
      roughness: 0.4,
      side: THREE.DoubleSide,
      emissive: 0x0088cc,
      emissiveIntensity: 0.5,
    }),
    SELECTED: new THREE.MeshStandardMaterial({
      color: 0xff6622,
      metalness: 0.2,
      roughness: 0.3,
      side: THREE.DoubleSide,
      emissive: 0xff4400,
      emissiveIntensity: 0.6,
    }),
  },
  EDGE: {
    BASE: new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 1.5 }),
    HOVER: new THREE.LineBasicMaterial({ color: 0x00ff66, linewidth: 3 }),
    SELECTED: new THREE.LineBasicMaterial({ color: 0xffcc00, linewidth: 4 }),
  },
  VERTEX: {
    BASE: new THREE.PointsMaterial({ color: 0xffdd00, size: 8, sizeAttenuation: false }),
    HOVER: new THREE.PointsMaterial({ color: 0x00ff88, size: 14, sizeAttenuation: false }),
    SELECTED: new THREE.PointsMaterial({ color: 0xff3333, size: 16, sizeAttenuation: false }),
  },
};

// ============================================================================
// CAD FACE - extends THREE.Mesh
// ============================================================================

export class CADFace extends THREE.Mesh {
  public readonly type = 'FACE';
  public faceIndex: number = -1;
  public faceName: string = '';
  public parentSolid: Solid | null = null;
  public edges: CADEdge[] = [];
  
  private _selected = false;
  private _hovered = false;

  constructor(geometry: THREE.BufferGeometry, name: string, index: number) {
    // Create own material instance
    const mat = new THREE.MeshStandardMaterial({
      color: 0x5588bb,
      metalness: 0.15,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    super(geometry, mat);
    this.faceName = name;
    this.faceIndex = index;
    this.name = name;
    this.userData = { type: 'FACE', faceIndex: index, faceName: name };
  }

  setHovered(h: boolean): void {
    if (this._selected) return; // Selected takes priority
    this._hovered = h;
    const mat = this.material as THREE.MeshStandardMaterial;
    if (h) {
      mat.color.setHex(0x66ddff);
      mat.emissive.setHex(0x0088cc);
      mat.emissiveIntensity = 0.6;
    } else {
      mat.color.setHex(0x5588bb);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }
    mat.needsUpdate = true;
  }

  setSelected(s: boolean): void {
    this._selected = s;
    this._hovered = false;
    const mat = this.material as THREE.MeshStandardMaterial;
    if (s) {
      mat.color.setHex(0xff6622);
      mat.emissive.setHex(0xff4400);
      mat.emissiveIntensity = 0.7;
    } else {
      mat.color.setHex(0x5588bb);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }
    mat.needsUpdate = true;
  }

  get isSelected(): boolean { return this._selected; }
  get isHovered(): boolean { return this._hovered; }

  getAverageNormal(): THREE.Vector3 {
    const pos = this.geometry.getAttribute('position');
    if (!pos || pos.count < 3) return new THREE.Vector3(0, 1, 0);
    
    const accum = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    
    for (let t = 0; t < pos.count; t += 3) {
      a.set(pos.getX(t), pos.getY(t), pos.getZ(t));
      b.set(pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1));
      c.set(pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2));
      
      const ab = b.clone().sub(a);
      const ac = c.clone().sub(a);
      accum.add(ab.cross(ac));
    }
    
    return accum.lengthSq() > 0 ? accum.normalize() : new THREE.Vector3(0, 1, 0);
  }

  getCentroid(): THREE.Vector3 {
    const pos = this.geometry.getAttribute('position');
    if (!pos) return new THREE.Vector3();
    
    const sum = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      sum.x += pos.getX(i);
      sum.y += pos.getY(i);
      sum.z += pos.getZ(i);
    }
    return sum.divideScalar(pos.count);
  }

  getSurfaceArea(): number {
    const pos = this.geometry.getAttribute('position');
    if (!pos) return 0;
    
    let area = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    
    for (let t = 0; t < pos.count; t += 3) {
      a.set(pos.getX(t), pos.getY(t), pos.getZ(t));
      b.set(pos.getX(t + 1), pos.getY(t + 1), pos.getZ(t + 1));
      c.set(pos.getX(t + 2), pos.getY(t + 2), pos.getZ(t + 2));
      
      const ab = b.clone().sub(a);
      const ac = c.clone().sub(a);
      area += ab.cross(ac).length() * 0.5;
    }
    return area;
  }
}

// ============================================================================
// CAD EDGE - extends THREE.Line
// ============================================================================

export class CADEdge extends THREE.Line {
  public readonly type = 'EDGE';
  public edgeIndex: number = -1;
  public edgeName: string = '';
  public parentSolid: Solid | null = null;
  public faces: CADFace[] = [];
  public faceA: string = '';
  public faceB: string = '';
  public polylineLocal: number[][] = [];
  public closedLoop: boolean = false;
  
  private _selected = false;
  private _hovered = false;

  constructor(positions: number[][], name: string, index: number, faceA: string, faceB: string) {
    const geom = new THREE.BufferGeometry();
    const pts = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => {
      pts[i * 3] = p[0];
      pts[i * 3 + 1] = p[1];
      pts[i * 3 + 2] = p[2];
    });
    geom.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    
    // Own material instance - thicker lines for visibility
    const mat = new THREE.LineBasicMaterial({ 
      color: 0x333333, 
      linewidth: 2,
      depthTest: true
    });
    super(geom, mat);
    
    this.edgeName = name;
    this.edgeIndex = index;
    this.name = name;
    this.faceA = faceA;
    this.faceB = faceB;
    this.polylineLocal = positions;
    this.userData = { type: 'EDGE', edgeIndex: index, edgeName: name, faceA, faceB };
    
    // Check if closed loop
    if (positions.length >= 2) {
      const first = positions[0];
      const last = positions[positions.length - 1];
      this.closedLoop = 
        Math.abs(first[0] - last[0]) < 1e-9 &&
        Math.abs(first[1] - last[1]) < 1e-9 &&
        Math.abs(first[2] - last[2]) < 1e-9;
    }
  }

  setHovered(h: boolean): void {
    if (this._selected) return;
    this._hovered = h;
    const mat = this.material as THREE.LineBasicMaterial;
    if (h) {
      mat.color.setHex(0x00ffff); // Cyan when hovered
      mat.linewidth = 4;
    } else {
      mat.color.setHex(0x333333); // Dark gray default
      mat.linewidth = 2;
    }
    mat.needsUpdate = true;
  }

  setSelected(s: boolean): void {
    this._selected = s;
    this._hovered = false;
    const mat = this.material as THREE.LineBasicMaterial;
    if (s) {
      mat.color.setHex(0xff6600); // Orange when selected
      mat.linewidth = 5;
    } else {
      mat.color.setHex(0x333333); // Dark gray default
      mat.linewidth = 2;
    }
    mat.needsUpdate = true;
  }

  get isSelected(): boolean { return this._selected; }
  get isHovered(): boolean { return this._hovered; }

  getLength(): number {
    let len = 0;
    for (let i = 0; i < this.polylineLocal.length - 1; i++) {
      const a = this.polylineLocal[i];
      const b = this.polylineLocal[i + 1];
      len += Math.sqrt(
        (b[0] - a[0]) ** 2 + 
        (b[1] - a[1]) ** 2 + 
        (b[2] - a[2]) ** 2
      );
    }
    return len;
  }

  getMidpoint(): THREE.Vector3 {
    if (this.polylineLocal.length === 0) return new THREE.Vector3();
    if (this.polylineLocal.length === 1) {
      const p = this.polylineLocal[0];
      return new THREE.Vector3(p[0], p[1], p[2]);
    }
    
    const targetLen = this.getLength() / 2;
    let accum = 0;
    
    for (let i = 0; i < this.polylineLocal.length - 1; i++) {
      const a = this.polylineLocal[i];
      const b = this.polylineLocal[i + 1];
      const segLen = Math.sqrt(
        (b[0] - a[0]) ** 2 + 
        (b[1] - a[1]) ** 2 + 
        (b[2] - a[2]) ** 2
      );
      
      if (accum + segLen >= targetLen) {
        const t = (targetLen - accum) / segLen;
        return new THREE.Vector3(
          a[0] + t * (b[0] - a[0]),
          a[1] + t * (b[1] - a[1]),
          a[2] + t * (b[2] - a[2])
        );
      }
      accum += segLen;
    }
    
    const last = this.polylineLocal[this.polylineLocal.length - 1];
    return new THREE.Vector3(last[0], last[1], last[2]);
  }
}

// ============================================================================
// CAD VERTEX - extends THREE.Points
// ============================================================================

export class CADVertex extends THREE.Points {
  public readonly type = 'VERTEX';
  public vertexIndex: number = -1;
  public vertexName: string = '';
  public parentSolid: Solid | null = null;
  public position3D: THREE.Vector3;
  
  private _selected = false;
  private _hovered = false;

  constructor(pos: number[], name: string, index: number) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    
    // Own material instance - larger size for visibility
    const mat = new THREE.PointsMaterial({ 
      color: 0x00ff88, 
      size: 12, 
      sizeAttenuation: false
    });
    super(geom, mat);
    
    this.vertexName = name;
    this.vertexIndex = index;
    this.name = name;
    this.position.set(pos[0], pos[1], pos[2]);
    this.position3D = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.userData = { 
      type: 'VERTEX', 
      vertexIndex: index, 
      vertexName: name,
      position: { x: pos[0], y: pos[1], z: pos[2] }
    };
    this.visible = false; // Hidden by default
  }

  setHovered(h: boolean): void {
    if (this._selected) return;
    this._hovered = h;
    const mat = this.material as THREE.PointsMaterial;
    if (h) {
      mat.color.setHex(0x00ffff); // Cyan when hovered
      mat.size = 16;
    } else {
      mat.color.setHex(0x00ff88); // Green default
      mat.size = 12;
    }
    mat.needsUpdate = true;
  }

  setSelected(s: boolean): void {
    this._selected = s;
    this._hovered = false;
    const mat = this.material as THREE.PointsMaterial;
    if (s) {
      mat.color.setHex(0xff3333); // Red when selected
      mat.size = 18;
    } else {
      mat.color.setHex(0x00ff88); // Green default
      mat.size = 12;
    }
    mat.needsUpdate = true;
  }

  get isSelected(): boolean { return this._selected; }
  get isHovered(): boolean { return this._hovered; }
}

// ============================================================================
// SOLID CLASS - Main container, extends THREE.Group
// ============================================================================

export class Solid extends THREE.Group {
  public readonly type = 'SOLID';
  public nodeId: string = '';
  
  // -------------------------------------------------------------------------
  // AUTHORING ARRAYS (MeshGL layout)
  // -------------------------------------------------------------------------
  protected _numProp: number = 3;
  protected _vertProperties: number[] = [];      // flat [x0,y0,z0, x1,y1,z1, ...]
  protected _triVerts: number[] = [];            // flat [i0,i1,i2, ...]
  protected _triIDs: number[] = [];              // per-triangle Manifold face ID
  protected _vertKeyToIndex: Map<string, number> = new Map();
  protected _faceNameToID: Map<string, number> = new Map();
  protected _idToFaceName: Map<number, string> = new Map();
  protected _faceMetadata: Map<string, any> = new Map();
  protected _edgeMetadata: Map<string, any> = new Map();
  protected _auxEdges: any[] = [];
  
  // -------------------------------------------------------------------------
  // CACHING
  // -------------------------------------------------------------------------
  protected _dirty: boolean = true;
  protected _manifold: any = null;
  protected _faceIndex: Map<number, number[]> | null = null;
  
  // -------------------------------------------------------------------------
  // VISUALIZATION RESULTS
  // -------------------------------------------------------------------------
  public faces: CADFace[] = [];
  public edges: CADEdge[] = [];
  public vertices: CADVertex[] = [];
  public pivot: THREE.Vector3 = new THREE.Vector3();

  constructor(nodeId?: string) {
    super();
    this.nodeId = nodeId || `solid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = `Solid_${this.nodeId.slice(0, 8)}`;
    this.userData = { type: 'SOLID', nodeId: this.nodeId };
    this.renderOrder = 1;
  }

  // =========================================================================
  // AUTHORING METHODS
  // =========================================================================

  /** Vertex key for uniquing */
  protected _key(p: number[]): string {
    return `${p[0]},${p[1]},${p[2]}`;
  }

  /** Get or create vertex index */
  protected _getPointIndex(p: number[]): number {
    if (!Array.isArray(p) || p.length < 3) {
      throw new Error('Invalid point: must be [x, y, z]');
    }
    if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) {
      throw new Error(`Invalid coordinates: ${p}`);
    }
    
    const k = this._key(p);
    const found = this._vertKeyToIndex.get(k);
    if (found !== undefined) return found;
    
    const idx = this._vertProperties.length / 3;
    this._vertProperties.push(p[0], p[1], p[2]);
    this._vertKeyToIndex.set(k, idx);
    return idx;
  }

  /** Get or create Manifold face ID for a face name */
  protected _getOrCreateID(faceName: string): number {
    if (!isModuleReady()) {
      throw new Error('Solid module not initialized');
    }
    
    if (!this._faceNameToID.has(faceName)) {
      const id = Manifold.reserveIDs(1);
      this._faceNameToID.set(faceName, id);
      this._idToFaceName.set(id, faceName);
    }
    return this._faceNameToID.get(faceName)!;
  }

  /**
   * Add a triangle with face name (CCW winding recommended)
   */
  addTriangle(faceName: string, p0: number[], p1: number[], p2: number[]): this {
    const id = this._getOrCreateID(faceName);
    const i0 = this._getPointIndex(p0);
    const i1 = this._getPointIndex(p1);
    const i2 = this._getPointIndex(p2);
    
    this._triVerts.push(i0, i1, i2);
    this._triIDs.push(id);
    this._dirty = true;
    this._faceIndex = null;
    
    return this;
  }

  /** Set face metadata */
  setFaceMetadata(faceName: string, meta: any): this {
    this._faceMetadata.set(faceName, meta);
    return this;
  }

  /** Get face metadata */
  getFaceMetadata(faceName: string): any {
    return this._faceMetadata.get(faceName);
  }

  /** Get all face names */
  getFaceNames(): string[] {
    return Array.from(this._faceNameToID.keys());
  }

  // =========================================================================
  // MANIFOLD OPERATIONS
  // =========================================================================

  /**
   * Build/rebuild Manifold from authoring arrays
   */
  protected _manifoldize(): any {
    if (!this._dirty && this._manifold) {
      return this._manifold;
    }

    if (!isModuleReady()) {
      throw new Error('Solid module not initialized');
    }

    const triCount = (this._triVerts.length / 3) | 0;
    if (triCount === 0) {
      throw new Error('No triangles to build');
    }

    // Fix winding by adjacency first
    this._fixTriangleWindingsByAdjacency();
    
    // Ensure outward orientation (positive signed volume)
    const signedVolume = this._computeSignedVolume();
    if (signedVolume < 0) {
      // Flip all triangles
      for (let t = 0; t < this._triVerts.length; t += 3) {
        const tmp = this._triVerts[t + 1];
        this._triVerts[t + 1] = this._triVerts[t + 2];
        this._triVerts[t + 2] = tmp;
      }
    }

    // Build typed arrays
    const triVerts = new Uint32Array(this._triVerts);
    const faceID = new Uint32Array(triCount);
    for (let t = 0; t < triCount; t++) {
      faceID[t] = this._triIDs[t];
    }

    // Create mesh
    const mesh = new ManifoldMesh({
      numProp: this._numProp,
      vertProperties: new Float32Array(this._vertProperties),
      triVerts,
      faceID,
    });

    // Merge vertices
    mesh.merge();

    // Build Manifold
    try {
      this._manifold = new Manifold(mesh);
    } catch (err) {
      console.error('[Solid] Manifold construction failed:', err);
      throw err;
    } finally {
      try { mesh.delete(); } catch {}
    }

    this._dirty = false;
    this._faceIndex = null;
    return this._manifold;
  }

  /**
   * Compute signed volume (positive = outward normals)
   */
  protected _computeSignedVolume(): number {
    const vp = this._vertProperties;
    let vol6 = 0;
    
    for (let t = 0; t < this._triVerts.length; t += 3) {
      const i0 = this._triVerts[t], i1 = this._triVerts[t + 1], i2 = this._triVerts[t + 2];
      const x0 = vp[i0 * 3], y0 = vp[i0 * 3 + 1], z0 = vp[i0 * 3 + 2];
      const x1 = vp[i1 * 3], y1 = vp[i1 * 3 + 1], z1 = vp[i1 * 3 + 2];
      const x2 = vp[i2 * 3], y2 = vp[i2 * 3 + 1], z2 = vp[i2 * 3 + 2];
      // Triple product: p0 · (p1 × p2)
      vol6 += x0 * (y1 * z2 - z1 * y2) - y0 * (x1 * z2 - z1 * x2) + z0 * (x1 * y2 - y1 * x2);
    }
    
    return vol6 / 6.0;
  }

  /**
   * Check if mesh is already coherently oriented (all edges have opposite winding in adjacent tris)
   */
  protected _isCoherentlyOrientedManifold(): boolean {
    const triCount = (this._triVerts.length / 3) | 0;
    if (triCount === 0) return false;
    
    const numVerts = (this._vertProperties.length / 3) | 0;
    const NV = BigInt(Math.max(1, numVerts));
    const ukey = (a: number, b: number) => {
      const A = BigInt(a), B = BigInt(b);
      return A < B ? A * NV + B : B * NV + A;
    };
    
    const edgeMap = new Map<bigint, { a: number; b: number }[]>();
    
    for (let t = 0; t < triCount; t++) {
      const b = t * 3;
      const i0 = this._triVerts[b + 0];
      const i1 = this._triVerts[b + 1];
      const i2 = this._triVerts[b + 2];
      const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
      
      for (const [a, b2] of edges) {
        const key = ukey(a, b2);
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key)!.push({ a, b: b2 });
      }
    }
    
    for (const arr of edgeMap.values()) {
      if (arr.length !== 2) return false; // boundary or non-manifold
      const e0 = arr[0], e1 = arr[1];
      // Opposite orientation means e0.a === e1.b && e0.b === e1.a
      if (!(e0.a === e1.b && e0.b === e1.a)) return false;
    }
    
    return true;
  }

  /**
   * Fix triangle winding by adjacency (ensures consistent orientation)
   */
  protected _fixTriangleWindingsByAdjacency(): void {
    // Skip if already coherent
    if (this._isCoherentlyOrientedManifold()) return;
    
    const triCount = (this._triVerts.length / 3) | 0;
    if (triCount === 0) return;

    const numVerts = (this._vertProperties.length / 3) | 0;
    const NV = BigInt(Math.max(1, numVerts));
    const ukey = (a: number, b: number) => {
      const A = BigInt(a), B = BigInt(b);
      return A < B ? A * NV + B : B * NV + A;
    };

    // Build triangle array
    const tris: [number, number, number][] = [];
    for (let t = 0; t < triCount; t++) {
      tris.push([
        this._triVerts[t * 3],
        this._triVerts[t * 3 + 1],
        this._triVerts[t * 3 + 2]
      ]);
    }

    // Map edge -> triangles using it
    const undirected = new Map<bigint, { tri: number; a: number; b: number }[]>();
    
    for (let ti = 0; ti < tris.length; ti++) {
      const tri = tris[ti];
      for (let e = 0; e < 3; e++) {
        const a = tri[e];
        const b = tri[(e + 1) % 3];
        const k = ukey(a, b);
        if (!undirected.has(k)) undirected.set(k, []);
        undirected.get(k)!.push({ tri: ti, a, b });
      }
    }

    // BFS to fix winding
    const visited = new Array(triCount).fill(false);
    const stack: number[] = [];

    for (let seed = 0; seed < triCount; seed++) {
      if (visited[seed]) continue;
      visited[seed] = true;
      stack.push(seed);

      while (stack.length > 0) {
        const t = stack.pop()!;
        const tri = tris[t];
        
        for (let e = 0; e < 3; e++) {
          const a = tri[e];
          const b = tri[(e + 1) % 3];
          const k = ukey(a, b);
          const adj = undirected.get(k);
          if (!adj || adj.length < 2) continue;

          for (const entry of adj) {
            const n = entry.tri;
            if (n === t || visited[n]) continue;

            const nTri = tris[n];
            // If edges are oriented the same way, flip the neighbor
            if (entry.a === a && entry.b === b) {
              [nTri[1], nTri[2]] = [nTri[2], nTri[1]];
            }

            visited[n] = true;
            stack.push(n);
          }
        }
      }
    }

    // Write back fixed triangles
    this._triVerts.length = 0;
    for (const tri of tris) {
      this._triVerts.push(tri[0], tri[1], tri[2]);
    }
    
    this._dirty = true;
    this._faceIndex = null;
  }

  /** Get underlying Manifold object */
  getManifold(): any {
    return this._manifoldize();
  }

  /** Build face index cache */
  protected _ensureFaceIndex(): void {
    if (this._faceIndex) return;
    
    const m = this._manifoldize();
    const mesh = m.getMesh();
    const { triVerts, faceID } = mesh;
    const triCount = (triVerts.length / 3) | 0;
    
    const map = new Map<number, number[]>();
    if (faceID && faceID.length === triCount) {
      for (let t = 0; t < triCount; t++) {
        const id = faceID[t];
        if (!map.has(id)) map.set(id, []);
        map.get(id)!.push(t);
      }
    }
    
    this._faceIndex = map;
    try { mesh.delete(); } catch {}
  }

  // =========================================================================
  // VISUALIZATION - Creates Three.js children
  // =========================================================================

  /**
   * Build visualization (Faces, Edges, Vertices)
   */
  visualize(options: { showEdges?: boolean } = {}): this {
    const { showEdges = true } = options;

    // Clear existing
    for (const f of this.faces) { this.remove(f); }
    for (const e of this.edges) { this.remove(e); }
    for (const v of this.vertices) { this.remove(v); }
    this.faces = [];
    this.edges = [];
    this.vertices = [];

    // Get mesh
    const m = this._manifoldize();
    const mesh = m.getMesh();
    const { vertProperties: vp, triVerts: tv, faceID } = mesh;
    const triCount = (tv.length / 3) | 0;

    // Group triangles by face name
    const faceTris = new Map<string, { p0: number[]; p1: number[]; p2: number[] }[]>();
    
    for (let t = 0; t < triCount; t++) {
      const id = faceID ? faceID[t] : 0;
      const faceName = this._idToFaceName.get(id) || `Face_${id}`;
      
      if (!faceTris.has(faceName)) {
        faceTris.set(faceName, []);
      }
      
      const i0 = tv[t * 3], i1 = tv[t * 3 + 1], i2 = tv[t * 3 + 2];
      faceTris.get(faceName)!.push({
        p0: [vp[i0 * 3], vp[i0 * 3 + 1], vp[i0 * 3 + 2]],
        p1: [vp[i1 * 3], vp[i1 * 3 + 1], vp[i1 * 3 + 2]],
        p2: [vp[i2 * 3], vp[i2 * 3 + 1], vp[i2 * 3 + 2]],
      });
    }

    // Build CADFace objects
    const faceMap = new Map<string, CADFace>();
    let faceIndex = 0;
    
    for (const [faceName, tris] of faceTris) {
      const positions = new Float32Array(tris.length * 9);
      let w = 0;
      for (const tri of tris) {
        positions[w++] = tri.p0[0]; positions[w++] = tri.p0[1]; positions[w++] = tri.p0[2];
        positions[w++] = tri.p1[0]; positions[w++] = tri.p1[1]; positions[w++] = tri.p1[2];
        positions[w++] = tri.p2[0]; positions[w++] = tri.p2[1]; positions[w++] = tri.p2[2];
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.computeVertexNormals();
      geom.computeBoundingBox();

      const face = new CADFace(geom, faceName, faceIndex);
      face.parentSolid = this;
      faceMap.set(faceName, face);
      this.faces.push(face);
      this.add(face);
      faceIndex++;
    }

    // Extract boundary edges
    if (showEdges) {
      const nv = (vp.length / 3) | 0;
      const NV = BigInt(Math.max(1, nv));
      const ukey = (a: number, b: number) => {
        const A = BigInt(a), B = BigInt(b);
        return A < B ? A * NV + B : B * NV + A;
      };

      // Map edge -> triangles using it
      const e2t = new Map<bigint, { id: number; a: number; b: number }[]>();
      
      for (let t = 0; t < triCount; t++) {
        const id = faceID ? faceID[t] : 0;
        const i0 = tv[t * 3], i1 = tv[t * 3 + 1], i2 = tv[t * 3 + 2];
        const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
        
        for (const [a, b] of edges) {
          const key = ukey(a, b);
          if (!e2t.has(key)) e2t.set(key, []);
          e2t.get(key)!.push({ id, a, b });
        }
      }

      // Group edges by face pair
      const pairToEdges = new Map<string, [number, number][]>();
      
      for (const [, arr] of e2t) {
        if (arr.length !== 2) continue;
        const [e0, e1] = arr;
        if (e0.id === e1.id) continue;
        
        const nameA = this._idToFaceName.get(e0.id) || `Face_${e0.id}`;
        const nameB = this._idToFaceName.get(e1.id) || `Face_${e1.id}`;
        const pair = nameA < nameB ? [nameA, nameB] : [nameB, nameA];
        const pairKey = JSON.stringify(pair);
        
        if (!pairToEdges.has(pairKey)) pairToEdges.set(pairKey, []);
        const v0 = Math.min(e0.a, e0.b), v1 = Math.max(e0.a, e0.b);
        pairToEdges.get(pairKey)!.push([v0, v1]);
      }

      // Build polylines from edge segments
      let edgeIndex = 0;
      
      for (const [pairKey, edgeList] of pairToEdges) {
        const [faceA, faceB] = JSON.parse(pairKey);
        
        // Build adjacency
        const adj = new Map<number, Set<number>>();
        for (const [u, v] of edgeList) {
          if (!adj.has(u)) adj.set(u, new Set());
          if (!adj.has(v)) adj.set(v, new Set());
          adj.get(u)!.add(v);
          adj.get(v)!.add(u);
        }

        // Walk chains
        const visited = new Set<string>();
        const ek = (u: number, v: number) => u < v ? `${u},${v}` : `${v},${u}`;

        for (const [start, nbrs] of adj) {
          if (nbrs.size !== 1) continue;
          
          const firstNbr = [...nbrs][0];
          if (visited.has(ek(start, firstNbr))) continue;

          const chain: number[] = [start];
          let prev = -1, curr = start;
          
          while (true) {
            const currNbrs = adj.get(curr);
            if (!currNbrs) break;
            
            let next: number | undefined;
            for (const n of currNbrs) {
              const k = ek(curr, n);
              if (visited.has(k) || n === prev) continue;
              next = n;
              visited.add(k);
              break;
            }
            
            if (next === undefined) break;
            chain.push(next);
            prev = curr;
            curr = next;
          }

          if (chain.length >= 2) {
            const positions = chain.map(vi => [
              vp[vi * 3], vp[vi * 3 + 1], vp[vi * 3 + 2]
            ]);
            
            const edgeName = `${faceA}|${faceB}`;
            const edge = new CADEdge(positions, edgeName, edgeIndex, faceA, faceB);
            edge.parentSolid = this;
            
            // Link to faces
            const fa = faceMap.get(faceA);
            const fb = faceMap.get(faceB);
            if (fa) { edge.faces.push(fa); fa.edges.push(edge); }
            if (fb) { edge.faces.push(fb); fb.edges.push(edge); }
            
            this.edges.push(edge);
            this.add(edge);
            edgeIndex++;
          }
        }
      }
    }

    // Extract vertices from edge endpoints
    const vertPositions = new Map<string, number[]>();
    const vertEdges = new Map<string, string[]>();
    
    for (const edge of this.edges) {
      if (edge.polylineLocal.length < 2) continue;
      
      const addVert = (p: number[]) => {
        const k = `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)}`;
        if (!vertPositions.has(k)) {
          vertPositions.set(k, p);
          vertEdges.set(k, []);
        }
        vertEdges.get(k)!.push(edge.edgeName);
      };
      
      addVert(edge.polylineLocal[0]);
      addVert(edge.polylineLocal[edge.polylineLocal.length - 1]);
    }

    let vertIndex = 0;
    for (const [, pos] of vertPositions) {
      const meetingEdges = vertEdges.get(`${pos[0].toFixed(6)},${pos[1].toFixed(6)},${pos[2].toFixed(6)}`) || [];
      const name = meetingEdges.length > 0 
        ? `V[${meetingEdges.slice(0, 2).join('+')}]`
        : `V_${vertIndex}`;
      
      const vertex = new CADVertex(pos, name, vertIndex);
      vertex.parentSolid = this;
      this.vertices.push(vertex);
      this.add(vertex);
      vertIndex++;
    }

    try { mesh.delete(); } catch {}

    // Set pivot to center
    this.setPivotToCenter();

    console.log(`[Solid] Visualized: ${this.faces.length} faces, ${this.edges.length} edges, ${this.vertices.length} vertices`);
    return this;
  }

  // =========================================================================
  // PIVOT AND DISPLAY
  // =========================================================================

  get showVertices(): boolean {
    return this.vertices.length > 0 && this.vertices[0].visible;
  }

  set showVertices(v: boolean) {
    this.vertices.forEach(vert => vert.visible = v);
  }

  setPivotToVertex(v: CADVertex): void {
    this.pivot.copy(v.position3D);
  }

  setPivotToEdge(e: CADEdge): void {
    this.pivot.copy(e.getMidpoint());
  }

  setPivotToFace(f: CADFace): void {
    this.pivot.copy(f.getCentroid());
  }

  setPivotToCenter(): void {
    const box = new THREE.Box3().setFromObject(this);
    if (!box.isEmpty()) {
      box.getCenter(this.pivot);
    }
  }

  getVolume(): number {
    try {
      const m = this._manifoldize();
      const props = m.getProperties();
      return props.volume || 0;
    } catch {
      return 0;
    }
  }

  // =========================================================================
  // CLEANUP
  // =========================================================================

  free(): void {
    try {
      if (this._manifold?.delete) this._manifold.delete();
    } catch {}
    this._manifold = null;
    this._dirty = true;
    this._faceIndex = null;
  }

  dispose(): void {
    this.free();
    for (const f of this.faces) this.remove(f);
    for (const e of this.edges) this.remove(e);
    for (const v of this.vertices) this.remove(v);
    this.faces = [];
    this.edges = [];
    this.vertices = [];
  }
}

// ============================================================================
// PRIMITIVE CLASSES
// ============================================================================

export class BoxSolid extends Solid {
  constructor(params: { 
    width: number; 
    height: number; 
    depth: number; 
    center?: boolean; 
    name?: string 
  }, nodeId?: string) {
    super(nodeId);
    this._generateBox(params);
    this.visualize();
  }

  private _generateBox(params: { 
    width: number; 
    height: number; 
    depth: number; 
    center?: boolean; 
    name?: string 
  }): void {
    const { width: x, height: y, depth: z, center = true, name = 'Box' } = params;
    
    // BREP style: Box starts at origin, then translate if centered
    // Vertices at corners
    const p000 = [0, 0, 0];
    const p100 = [x, 0, 0];
    const p010 = [0, y, 0];
    const p110 = [x, y, 0];
    const p001 = [0, 0, z];
    const p101 = [x, 0, z];
    const p011 = [0, y, z];
    const p111 = [x, y, z];

    // BREP exact winding (CCW when viewed from outside = outward normals)
    // NX (x=0) face
    this.addTriangle(`${name}_NX`, p000, p001, p011);
    this.addTriangle(`${name}_NX`, p000, p011, p010);
    // PX (x=x) face  
    this.addTriangle(`${name}_PX`, p100, p110, p111);
    this.addTriangle(`${name}_PX`, p100, p111, p101);
    // NY (y=0) face
    this.addTriangle(`${name}_NY`, p000, p100, p101);
    this.addTriangle(`${name}_NY`, p000, p101, p001);
    // PY (y=y) face
    this.addTriangle(`${name}_PY`, p010, p011, p111);
    this.addTriangle(`${name}_PY`, p010, p111, p110);
    // NZ (z=0) face
    this.addTriangle(`${name}_NZ`, p000, p010, p110);
    this.addTriangle(`${name}_NZ`, p000, p110, p100);
    // PZ (z=z) face
    this.addTriangle(`${name}_PZ`, p001, p101, p111);
    this.addTriangle(`${name}_PZ`, p001, p111, p011);

    // If centered, translate all vertices
    if (center) {
      const ox = -x / 2;
      const oy = -y / 2;
      const oz = -z / 2;
      for (let i = 0; i < this._vertProperties.length; i += 3) {
        this._vertProperties[i] += ox;
        this._vertProperties[i + 1] += oy;
        this._vertProperties[i + 2] += oz;
      }
      // Rebuild vertex key map
      this._vertKeyToIndex.clear();
      const numVerts = this._vertProperties.length / 3;
      for (let v = 0; v < numVerts; v++) {
        const vx = this._vertProperties[v * 3];
        const vy = this._vertProperties[v * 3 + 1];
        const vz = this._vertProperties[v * 3 + 2];
        this._vertKeyToIndex.set(`${vx},${vy},${vz}`, v);
      }
    }
  }
}

export class SphereSolid extends Solid {
  constructor(params: { 
    radius: number; 
    segments?: number; 
    name?: string 
  }, nodeId?: string) {
    super(nodeId);
    this._generateSphere(params);
    this.visualize();
  }

  private _generateSphere(params: { 
    radius: number; 
    segments?: number; 
    name?: string 
  }): void {
    const { radius, segments = 24, name = 'Sphere' } = params;
    
    // Use Manifold.sphere and copy triangles
    const sphere = Manifold.sphere(radius, segments);
    const mesh = sphere.getMesh();
    const { vertProperties: vp, triVerts: tv } = mesh;
    const triCount = (tv.length / 3) | 0;

    for (let t = 0; t < triCount; t++) {
      const i0 = tv[t * 3], i1 = tv[t * 3 + 1], i2 = tv[t * 3 + 2];
      this.addTriangle(name, 
        [vp[i0 * 3], vp[i0 * 3 + 1], vp[i0 * 3 + 2]],
        [vp[i1 * 3], vp[i1 * 3 + 1], vp[i1 * 3 + 2]],
        [vp[i2 * 3], vp[i2 * 3 + 1], vp[i2 * 3 + 2]]
      );
    }

    try { mesh.delete(); } catch {}
    try { sphere.delete(); } catch {}
  }
}

export class CylinderSolid extends Solid {
  constructor(params: { 
    radius: number; 
    height: number; 
    segments?: number; 
    center?: boolean; 
    name?: string 
  }, nodeId?: string) {
    super(nodeId);
    this._generateCylinder(params);
    this.visualize();
  }

  private _generateCylinder(params: { 
    radius: number; 
    height: number; 
    segments?: number; 
    center?: boolean; 
    name?: string 
  }): void {
    const { radius: r, height: h, segments = 32, center = true, name = 'Cylinder' } = params;
    
    const y0 = center ? -h / 2 : 0;
    const y1 = center ? h / 2 : h;
    const n = Math.max(8, segments);
    const step = (Math.PI * 2) / n;

    const ring0: number[][] = [];
    const ring1: number[][] = [];
    
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      ring0.push([x, y0, z]);
      ring1.push([x, y1, z]);
    }

    // Bottom cap
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.addTriangle(`${name}_Bottom`, [0, y0, 0], ring0[j], ring0[i]);
    }

    // Top cap
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.addTriangle(`${name}_Top`, [0, y1, 0], ring1[i], ring1[j]);
    }

    // Side
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.addTriangle(`${name}_Side`, ring0[i], ring0[j], ring1[j]);
      this.addTriangle(`${name}_Side`, ring0[i], ring1[j], ring1[i]);
    }

    this.setFaceMetadata(`${name}_Side`, {
      type: 'cylindrical',
      radius: r,
      height: h,
      axis: [0, 1, 0],
    });
  }
}

export class ConeSolid extends Solid {
  constructor(params: { 
    bottomRadius: number; 
    topRadius: number; 
    height: number; 
    segments?: number; 
    center?: boolean; 
    name?: string 
  }, nodeId?: string) {
    super(nodeId);
    this._generateCone(params);
    this.visualize();
  }

  private _generateCone(params: { 
    bottomRadius: number; 
    topRadius: number; 
    height: number; 
    segments?: number; 
    center?: boolean; 
    name?: string 
  }): void {
    const { bottomRadius: r1, topRadius: r2, height: h, segments = 32, center = true, name = 'Cone' } = params;
    
    const y0 = center ? -h / 2 : 0;
    const y1 = center ? h / 2 : h;
    const n = Math.max(8, segments);
    const step = (Math.PI * 2) / n;

    const ringB: number[][] = [];
    const ringT: number[][] = [];
    
    for (let i = 0; i < n; i++) {
      const a = i * step;
      const c = Math.cos(a), s = Math.sin(a);
      ringB.push([r1 * c, y0, r1 * s]);
      ringT.push([r2 * c, y1, r2 * s]);
    }

    // Bottom cap (if r1 > 0)
    if (r1 > 0) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.addTriangle(`${name}_Bottom`, [0, y0, 0], ringB[j], ringB[i]);
      }
    }

    // Top cap (if r2 > 0)
    if (r2 > 0) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        this.addTriangle(`${name}_Top`, [0, y1, 0], ringT[i], ringT[j]);
      }
    }

    // Side
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (r2 > 0) {
        this.addTriangle(`${name}_Side`, ringB[i], ringB[j], ringT[j]);
        this.addTriangle(`${name}_Side`, ringB[i], ringT[j], ringT[i]);
      } else {
        this.addTriangle(`${name}_Side`, ringB[i], ringB[j], [0, y1, 0]);
      }
    }
  }
}

export class TorusSolid extends Solid {
  constructor(params: { 
    majorRadius: number; 
    minorRadius: number; 
    majorSegments?: number; 
    minorSegments?: number; 
    name?: string 
  }, nodeId?: string) {
    super(nodeId);
    this._generateTorus(params);
    this.visualize();
  }

  private _generateTorus(params: { 
    majorRadius: number; 
    minorRadius: number; 
    majorSegments?: number; 
    minorSegments?: number; 
    name?: string 
  }): void {
    const { majorRadius: R, minorRadius: r, majorSegments = 32, minorSegments = 16, name = 'Torus' } = params;
    
    const nMaj = Math.max(8, majorSegments);
    const nMin = Math.max(4, minorSegments);

    const getPoint = (u: number, v: number): number[] => {
      const theta = u * Math.PI * 2;
      const phi = v * Math.PI * 2;
      
      return [
        (R + r * Math.cos(phi)) * Math.cos(theta),
        r * Math.sin(phi),
        (R + r * Math.cos(phi)) * Math.sin(theta)
      ];
    };

    for (let i = 0; i < nMaj; i++) {
      for (let j = 0; j < nMin; j++) {
        const u0 = i / nMaj;
        const u1 = (i + 1) / nMaj;
        const v0 = j / nMin;
        const v1 = (j + 1) / nMin;

        const p00 = getPoint(u0, v0);
        const p10 = getPoint(u1, v0);
        const p01 = getPoint(u0, v1);
        const p11 = getPoint(u1, v1);

        this.addTriangle(name, p00, p10, p11);
        this.addTriangle(name, p00, p11, p01);
      }
    }
  }
}
