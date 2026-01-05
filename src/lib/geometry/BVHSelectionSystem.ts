/**
 * ============================================================================
 * BVH SELECTION SYSTEM
 * ============================================================================
 * 
 * This module implements precise raycasting and selection using three-mesh-bvh.
 * The BVH (Bounding Volume Hierarchy) provides:
 * 
 * - Fast ray-mesh intersection testing
 * - Precise vertex, edge, and face selection
 * - Efficient closest-point queries
 * - Support for large meshes without performance degradation
 * 
 * @module geometry/BVHSelectionSystem
 */

import * as THREE from 'three';
import { 
  MeshBVH,
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree
} from 'three-mesh-bvh';

import type {
  Point3D,
  SelectionMode,
  Selection,
  HoverState,
  Result
} from '../core/types';

// Extend Three.js types for BVH
declare module 'three' {
  interface BufferGeometry {
    boundsTree?: MeshBVH;
    computeBoundsTree(options?: object): void;
    disposeBoundsTree(): void;
  }
}

// Add BVH methods to Three.js prototypes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * Configuration for selection system
 */
interface SelectionConfig {
  vertexSnapDistance: number;
  edgeSnapDistance: number;
  sortByDistance: boolean;
}

const DEFAULT_CONFIG: SelectionConfig = {
  vertexSnapDistance: 15,
  edgeSnapDistance: 10,
  sortByDistance: true
};

/**
 * ============================================================================
 * BVH SELECTION SYSTEM CLASS
 * ============================================================================
 */
export class BVHSelectionSystem {
  private raycaster: THREE.Raycaster;
  private camera: THREE.Camera | null = null;
  private scene: THREE.Scene | null = null;
  private config: SelectionConfig;
  
  /** Map of model ID to BVH-enabled meshes */
  private meshMap: Map<string, THREE.Mesh> = new Map();
  
  /** Current selection mode */
  private selectionMode: SelectionMode = 'model';
  
  /** Currently hovered element */
  private currentHover: HoverState | null = null;
  
  /** Currently selected elements */
  private selectedElements: Selection[] = [];
  
  /** Temporary vectors for calculations */
  private tempVec3 = new THREE.Vector3();
  private tempVec3_2 = new THREE.Vector3();

  constructor(config: Partial<SelectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = false;
  }

  /**
   * Initialize the selection system with scene and camera
   */
  initialize(scene: THREE.Scene, camera: THREE.Camera): void {
    this.scene = scene;
    this.camera = camera;
  }

  /**
   * Register a mesh for BVH-accelerated selection
   */
  registerMesh(modelId: string, mesh: THREE.Mesh): Result<void> {
    if (!mesh.geometry) {
      return { success: false, error: 'Mesh has no geometry' };
    }

    try {
      // Ensure geometry has index
      if (!mesh.geometry.index) {
        const posCount = mesh.geometry.attributes.position.count;
        const indices = [];
        for (let i = 0; i < posCount; i++) {
          indices.push(i);
        }
        mesh.geometry.setIndex(indices);
      }

      // Compute BVH
      mesh.geometry.computeBoundsTree({
        maxLeafTris: 5,
        strategy: 0
      });

      // Store model ID in userData
      mesh.userData.modelId = modelId;
      mesh.userData.bvhEnabled = true;

      this.meshMap.set(modelId, mesh);

      console.log(`[BVHSelection] Registered mesh: ${modelId}`);
      return { success: true, value: undefined };
    } catch (error) {
      return { success: false, error: `BVH computation failed: ${error}` };
    }
  }

  /**
   * Unregister a mesh and dispose its BVH
   */
  unregisterMesh(modelId: string): void {
    const mesh = this.meshMap.get(modelId);
    if (mesh && mesh.geometry) {
      mesh.geometry.disposeBoundsTree();
      this.meshMap.delete(modelId);
    }
  }

  /**
   * Set the current selection mode
   */
  setSelectionMode(mode: SelectionMode): void {
    this.selectionMode = mode;
    this.currentHover = null;
  }

  /**
   * Get current selection mode
   */
  getSelectionMode(): SelectionMode {
    return this.selectionMode;
  }

  /**
   * Update hover state based on mouse position
   */
  updateHover(mouseNDC: THREE.Vector2): HoverState | null {
    if (!this.camera || !this.scene) return null;

    this.raycaster.setFromCamera(mouseNDC, this.camera);

    switch (this.selectionMode) {
      case 'model':
        return this.hoverModel();
      case 'face':
        return this.hoverFace();
      case 'edge':
        return this.hoverEdge();
      case 'vertex':
        return this.hoverVertex();
      default:
        return null;
    }
  }

  /**
   * Hover detection for model mode
   */
  private hoverModel(): HoverState | null {
    const meshes = Array.from(this.meshMap.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const modelId = intersects[0].object.userData.modelId;
      this.currentHover = { type: 'model', modelId };
      return this.currentHover;
    }

    this.currentHover = null;
    return null;
  }

  /**
   * Hover detection for face mode
   */
  private hoverFace(): HoverState | null {
    const meshes = Array.from(this.meshMap.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const modelId = hit.object.userData.modelId;
      
      this.currentHover = {
        type: 'face',
        modelId,
        elementIndex: hit.faceIndex ?? 0
      };
      return this.currentHover;
    }

    this.currentHover = null;
    return null;
  }

  /**
   * Hover detection for edge mode
   */
  private hoverEdge(): HoverState | null {
    const meshes = Array.from(this.meshMap.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) {
      this.currentHover = null;
      return null;
    }

    const hit = intersects[0];
    const mesh = hit.object as THREE.Mesh;
    const modelId = mesh.userData.modelId;
    const faceIndex = hit.faceIndex ?? 0;

    const geometry = mesh.geometry;
    const index = geometry.index;
    const position = geometry.attributes.position;

    if (!index) {
      this.currentHover = null;
      return null;
    }

    // Get the three vertices of the hit face
    const i0 = index.getX(faceIndex * 3);
    const i1 = index.getX(faceIndex * 3 + 1);
    const i2 = index.getX(faceIndex * 3 + 2);

    const v0 = new THREE.Vector3().fromBufferAttribute(position, i0);
    const v1 = new THREE.Vector3().fromBufferAttribute(position, i1);
    const v2 = new THREE.Vector3().fromBufferAttribute(position, i2);

    mesh.localToWorld(v0);
    mesh.localToWorld(v1);
    mesh.localToWorld(v2);

    // Find closest edge to hit point
    const hitPoint = hit.point;
    const edges = [
      { indices: [i0, i1] as [number, number], p0: v0, p1: v1 },
      { indices: [i1, i2] as [number, number], p0: v1, p1: v2 },
      { indices: [i2, i0] as [number, number], p0: v2, p1: v0 }
    ];

    let closestEdge = edges[0];
    let minDist = Infinity;

    for (const edge of edges) {
      const closest = this.closestPointOnSegment(hitPoint, edge.p0, edge.p1);
      const dist = hitPoint.distanceTo(closest);
      if (dist < minDist) {
        minDist = dist;
        closestEdge = edge;
      }
    }

    const edgeIndex = Math.min(closestEdge.indices[0], closestEdge.indices[1]);

    this.currentHover = {
      type: 'edge',
      modelId,
      elementIndex: edgeIndex
    };
    return this.currentHover;
  }

  /**
   * Hover detection for vertex mode
   */
  private hoverVertex(): HoverState | null {
    const meshes = Array.from(this.meshMap.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length === 0) {
      this.currentHover = null;
      return null;
    }

    const hit = intersects[0];
    const mesh = hit.object as THREE.Mesh;
    const modelId = mesh.userData.modelId;
    const faceIndex = hit.faceIndex ?? 0;

    const geometry = mesh.geometry;
    const index = geometry.index;
    const position = geometry.attributes.position;

    if (!index) {
      this.currentHover = null;
      return null;
    }

    const indices = [
      index.getX(faceIndex * 3),
      index.getX(faceIndex * 3 + 1),
      index.getX(faceIndex * 3 + 2)
    ];

    // Find closest vertex to hit point
    const hitPoint = hit.point;
    let closestVertex = indices[0];
    let minDist = Infinity;

    for (const idx of indices) {
      const v = new THREE.Vector3().fromBufferAttribute(position, idx);
      mesh.localToWorld(v);
      const dist = hitPoint.distanceTo(v);
      if (dist < minDist) {
        minDist = dist;
        closestVertex = idx;
      }
    }

    this.currentHover = {
      type: 'vertex',
      modelId,
      elementIndex: closestVertex
    };
    return this.currentHover;
  }

  /**
   * Perform selection at current hover position
   */
  select(addToSelection: boolean = false): Selection[] {
    if (!this.currentHover) {
      if (!addToSelection) {
        this.selectedElements = [];
      }
      return this.selectedElements;
    }

    const newSelection: Selection = {
      type: this.currentHover.type,
      modelId: this.currentHover.modelId,
      elementIndex: this.currentHover.elementIndex
    };

    if (addToSelection) {
      const existingIndex = this.selectedElements.findIndex(
        s => s.type === newSelection.type &&
             s.modelId === newSelection.modelId &&
             s.elementIndex === newSelection.elementIndex
      );

      if (existingIndex >= 0) {
        this.selectedElements.splice(existingIndex, 1);
      } else {
        this.selectedElements.push(newSelection);
      }
    } else {
      this.selectedElements = [newSelection];
    }

    return this.selectedElements;
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedElements = [];
    this.currentHover = null;
  }

  /**
   * Get current hover state
   */
  getHover(): HoverState | null {
    return this.currentHover;
  }

  /**
   * Get current selection
   */
  getSelection(): Selection[] {
    return this.selectedElements;
  }

  /**
   * Check if a specific element is selected
   */
  isSelected(type: SelectionMode, modelId: string, elementIndex?: number): boolean {
    return this.selectedElements.some(
      s => s.type === type &&
           s.modelId === modelId &&
           (elementIndex === undefined || s.elementIndex === elementIndex)
    );
  }

  /**
   * Check if a specific element is hovered
   */
  isHovered(type: SelectionMode, modelId: string, elementIndex?: number): boolean {
    if (!this.currentHover) return false;
    return this.currentHover.type === type &&
           this.currentHover.modelId === modelId &&
           (elementIndex === undefined || this.currentHover.elementIndex === elementIndex);
  }

  /**
   * Get world position of a vertex
   */
  getVertexWorldPosition(modelId: string, vertexIndex: number): Point3D | null {
    const mesh = this.meshMap.get(modelId);
    if (!mesh || !mesh.geometry) return null;

    const position = mesh.geometry.attributes.position;
    if (vertexIndex >= position.count) return null;

    const v = new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
    mesh.localToWorld(v);

    return { x: v.x, y: v.y, z: v.z };
  }

  /**
   * Get face center and normal
   */
  getFaceInfo(modelId: string, faceIndex: number): { center: Point3D; normal: Point3D } | null {
    const mesh = this.meshMap.get(modelId);
    if (!mesh || !mesh.geometry) return null;

    const geometry = mesh.geometry;
    const index = geometry.index;
    const position = geometry.attributes.position;

    if (!index || faceIndex * 3 >= index.count) return null;

    const i0 = index.getX(faceIndex * 3);
    const i1 = index.getX(faceIndex * 3 + 1);
    const i2 = index.getX(faceIndex * 3 + 2);

    const v0 = new THREE.Vector3().fromBufferAttribute(position, i0);
    const v1 = new THREE.Vector3().fromBufferAttribute(position, i1);
    const v2 = new THREE.Vector3().fromBufferAttribute(position, i2);

    mesh.localToWorld(v0);
    mesh.localToWorld(v1);
    mesh.localToWorld(v2);

    const center = new THREE.Vector3()
      .add(v0)
      .add(v1)
      .add(v2)
      .divideScalar(3);

    const edge1 = new THREE.Vector3().subVectors(v1, v0);
    const edge2 = new THREE.Vector3().subVectors(v2, v0);
    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

    return {
      center: { x: center.x, y: center.y, z: center.z },
      normal: { x: normal.x, y: normal.y, z: normal.z }
    };
  }

  /**
   * Utility: Find closest point on line segment
   */
  private closestPointOnSegment(
    point: THREE.Vector3,
    segStart: THREE.Vector3,
    segEnd: THREE.Vector3
  ): THREE.Vector3 {
    const line = this.tempVec3.subVectors(segEnd, segStart);
    const len = line.length();
    line.normalize();

    const v = this.tempVec3_2.subVectors(point, segStart);
    let d = v.dot(line);
    d = Math.max(0, Math.min(len, d));

    return new THREE.Vector3()
      .copy(segStart)
      .add(line.multiplyScalar(d));
  }

  /**
   * Raycast for precise point on surface
   */
  raycastPoint(mouseNDC: THREE.Vector2): { 
    point: Point3D; 
    normal: Point3D; 
    modelId: string 
  } | null {
    if (!this.camera) return null;

    this.raycaster.setFromCamera(mouseNDC, this.camera);
    const meshes = Array.from(this.meshMap.values());
    const intersects = this.raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const normal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
      
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
      normal.applyMatrix3(normalMatrix).normalize();

      return {
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        normal: { x: normal.x, y: normal.y, z: normal.z },
        modelId: hit.object.userData.modelId
      };
    }

    return null;
  }

  /**
   * Dispose all BVH structures
   */
  dispose(): void {
    for (const [modelId, mesh] of this.meshMap) {
      if (mesh.geometry) {
        mesh.geometry.disposeBoundsTree();
      }
    }
    this.meshMap.clear();
    this.selectedElements = [];
    this.currentHover = null;
  }
}

// Export singleton instance
export const bvhSelectionSystem = new BVHSelectionSystem();
