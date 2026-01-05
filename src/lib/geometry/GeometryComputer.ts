/**
 * ============================================================================
 * GEOMETRY COMPUTER
 * ============================================================================
 * 
 * This module is responsible for computing renderable geometry from CAD nodes.
 * It bridges the gap between the parametric CAD model and Three.js rendering:
 * 
 * - Converts CAD node definitions to Manifold solids
 * - Extracts mesh data for Three.js rendering
 * - Manages geometry caching and invalidation
 * - Handles recursive computation of boolean operations
 * 
 * @module geometry/GeometryComputer
 */

import * as THREE from 'three';
import { get } from 'svelte/store';
import { manifoldEngine } from './ManifoldEngine';
import {
  BoxSolid,
  SphereSolid,
  CylinderSolid,
  ConeSolid,
  TorusSolid,
  isModuleReady
} from './Solid';
import {
  documentStore,
  nodesStore,
  geometryCacheStore,
  solidStore,
  onCADEvent
} from '../stores/cadStore';
import type {
  CADNode,
  CADPrimitive,
  CADBoolean,
  CADSketch,
  CADExtrude,
  CADRevolve,
  ComputedGeometry,
  Point2D,
  Result
} from '../core/types';

/**
 * ============================================================================
 * GEOMETRY COMPUTER CLASS
 * ============================================================================
 */
class GeometryComputer {
  private initialized: boolean = false;
  private computing: Set<string> = new Set();

  /**
   * Initialize the geometry computer
   */
  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return { success: true, value: undefined };
    }

    // Initialize Manifold engine
    const result = await manifoldEngine.initialize();
    if (!result.success) {
      return result;
    }

    // Subscribe to node changes
    onCADEvent(event => {
      if (event.type === 'node-created' || event.type === 'node-updated') {
        this.markDirtyWithDependents(event.nodeId);
      }
    });

    this.initialized = true;
    console.log('[GeometryComputer] Initialized');
    return { success: true, value: undefined };
  }

  /**
   * Compute geometry for a node
   */
  async compute(nodeId: string): Promise<Result<ComputedGeometry>> {
    if (!this.initialized) {
      const initResult = await this.initialize();
      if (!initResult.success) {
        return { success: false, error: initResult.error };
      }
    }

    // Prevent re-entrancy
    if (this.computing.has(nodeId)) {
      return { success: false, error: 'Already computing this node' };
    }

    const node = nodesStore.get(nodeId);
    if (!node) {
      return { success: false, error: `Node not found: ${nodeId}` };
    }

    // Check cache
    const cached = geometryCacheStore.get(nodeId);
    if (cached && !cached.dirty) {
      return { success: true, value: cached };
    }

    this.computing.add(nodeId);

    try {
      let geometry: ComputedGeometry;

      switch (node.type) {
        case 'box':
        case 'sphere':
        case 'cylinder':
        case 'cone':
        case 'torus':
          geometry = await this.computePrimitive(node as CADPrimitive);
          break;
        case 'union':
        case 'difference':
        case 'intersection':
          geometry = await this.computeBoolean(node as CADBoolean);
          break;
        case 'extrude':
          geometry = await this.computeExtrude(node as CADExtrude);
          break;
        case 'revolve':
          geometry = await this.computeRevolve(node as CADRevolve);
          break;
        default:
          geometry = this.createEmptyGeometry(`Unsupported node type: ${node.type}`);
      }

      // Store in cache
      geometryCacheStore.set(nodeId, geometry);

      return { success: true, value: geometry };
    } catch (error) {
      const errorGeometry = this.createEmptyGeometry(`Computation error: ${error}`);
      geometryCacheStore.set(nodeId, errorGeometry);
      return { success: false, error: `${error}` };
    } finally {
      this.computing.delete(nodeId);
    }
  }

  /**
   * Compute primitive geometry using BREP-style Solid classes
   */
  private async computePrimitive(node: CADPrimitive): Promise<ComputedGeometry> {
    if (!isModuleReady()) {
      return this.createEmptyGeometry('Solid module not initialized');
    }

    let solid: import('./Solid').Solid;

    try {
      switch (node.type) {
        case 'box': {
          const params = (node.params as { type: 'box'; params: import('../core/types').BoxParams }).params;
          solid = new BoxSolid({
            width: params.width,
            height: params.height,
            depth: params.depth,
            center: params.center,
            name: node.name
          }, node.id);
          break;
        }
        case 'sphere': {
          const params = (node.params as { type: 'sphere'; params: import('../core/types').SphereParams }).params;
          solid = new SphereSolid({
            radius: params.radius,
            segments: params.circularSegments,
            name: node.name
          }, node.id);
          break;
        }
        case 'cylinder': {
          const params = (node.params as { type: 'cylinder'; params: import('../core/types').CylinderParams }).params;
          solid = new CylinderSolid({
            radius: params.radius,
            height: params.height,
            segments: params.circularSegments,
            center: params.center,
            name: node.name
          }, node.id);
          break;
        }
        case 'cone': {
          const params = (node.params as { type: 'cone'; params: import('../core/types').ConeParams }).params;
          solid = new ConeSolid({
            bottomRadius: params.bottomRadius,
            topRadius: params.topRadius,
            height: params.height,
            segments: params.circularSegments,
            center: params.center,
            name: node.name
          }, node.id);
          break;
        }
        case 'torus': {
          const params = (node.params as { type: 'torus'; params: import('../core/types').TorusParams }).params;
          solid = new TorusSolid({
            majorRadius: params.majorRadius,
            minorRadius: params.minorRadius,
            majorSegments: params.majorSegments,
            minorSegments: params.minorSegments,
            name: node.name
          }, node.id);
          break;
        }
        default:
          return this.createEmptyGeometry(`Unknown primitive type`);
      }

      // Add to solidStore for viewport to pick up
      solidStore.update(store => {
        const newStore = new Map(store);
        newStore.set(node.id, solid);
        return newStore;
      });

      console.log(`[GeometryComputer] Created ${node.type} solid: ${node.id} with ${solid.faces.length} faces, ${solid.edges.length} edges`);

      // Extract data for ComputedGeometry (for compatibility)
      const manifold = solid.getManifold();
      const meshResult = manifoldEngine.extractMesh(manifold);
      
      if (!meshResult.success) {
        return this.createEmptyGeometry(meshResult.error);
      }

      const { vertices, indices, normals } = meshResult.value;

      // Create Three.js geometry
      const threeGeometry = new THREE.BufferGeometry();
      threeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      threeGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      threeGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
      threeGeometry.computeBoundingBox();

      // Topology info from solid
      const topology = {
        vertices: solid.vertices.map((v, i) => ({ 
          index: i, 
          position: { x: v.position3D.x, y: v.position3D.y, z: v.position3D.z } 
        })),
        edges: solid.edges.map((e, i) => ({ 
          index: i, 
          name: e.edgeName,
          length: e.getLength()
        })),
        faces: solid.faces.map((f, i) => ({ 
          index: i, 
          name: f.faceName,
          area: f.getSurfaceArea()
        }))
      };

      const bboxResult = manifoldEngine.getBoundingBox(manifold);
      const bounds = bboxResult.success ? bboxResult.value : null;

      return {
        manifold,
        threeGeometry,
        meshData: { vertices, indices, normals },
        topology,
        bounds,
        dirty: false,
        error: null
      };
    } catch (error) {
      console.error('[GeometryComputer] computePrimitive error:', error);
      return this.createEmptyGeometry(`Primitive creation failed: ${error}`);
    }
  }

  /**
   * Compute boolean operation geometry
   */
  private async computeBoolean(node: CADBoolean): Promise<ComputedGeometry> {
    if (node.operandIds.length < 2) {
      return this.createEmptyGeometry('Boolean requires at least 2 operands');
    }

    // Compute all operands first
    const operandGeometries: ComputedGeometry[] = [];
    for (const operandId of node.operandIds) {
      const result = await this.compute(operandId);
      if (!result.success || !result.value.manifold) {
        return this.createEmptyGeometry(`Failed to compute operand: ${operandId}`);
      }
      operandGeometries.push(result.value);
    }

    // Perform boolean operation
    let result = operandGeometries[0].manifold!;

    for (let i = 1; i < operandGeometries.length; i++) {
      const operand = operandGeometries[i].manifold!;
      const boolResult = manifoldEngine.boolean(result, operand, node.type);
      
      if (!boolResult.success) {
        return this.createEmptyGeometry(boolResult.error);
      }
      result = boolResult.value;
    }

    return this.manifoldToGeometry(result);
  }

  /**
   * Compute extrusion geometry
   */
  private async computeExtrude(node: CADExtrude): Promise<ComputedGeometry> {
    const { sketchId, distance, direction } = node.params;

    // Get sketch
    const sketch = nodesStore.get(sketchId) as CADSketch | undefined;
    if (!sketch || sketch.type !== 'sketch') {
      return this.createEmptyGeometry('Sketch not found');
    }

    // Get profiles from sketch
    const profiles = sketch.profiles;
    if (!profiles || profiles.length === 0) {
      return this.createEmptyGeometry('No closed profiles in sketch');
    }

    // Extrude each profile and union them
    const extrusionResults: import('manifold-3d').Manifold[] = [];

    for (const profile of profiles) {
      let height = distance;
      let offsetZ = 0;

      if (direction === 'both') {
        height = distance * 2;
        offsetZ = -distance;
      } else if (direction === 'symmetric') {
        height = distance;
        offsetZ = -distance / 2;
      }

      const extrudeResult = manifoldEngine.extrude(profile, height);
      if (extrudeResult.success) {
        let solid = extrudeResult.value;
        
        // Apply offset if needed
        if (offsetZ !== 0) {
          const translateResult = manifoldEngine.translate(solid, { x: 0, y: 0, z: offsetZ });
          if (translateResult.success) {
            solid = translateResult.value;
          }
        }
        
        extrusionResults.push(solid);
      }
    }

    if (extrusionResults.length === 0) {
      return this.createEmptyGeometry('Extrusion failed');
    }

    // Union all extrusions
    let result = extrusionResults[0];
    for (let i = 1; i < extrusionResults.length; i++) {
      const unionResult = manifoldEngine.union(result, extrusionResults[i]);
      if (unionResult.success) {
        result = unionResult.value;
      }
    }

    // Handle boolean with target body
    if (node.params.booleanOp !== 'new' && node.params.targetBodyId) {
      const targetResult = await this.compute(node.params.targetBodyId);
      if (targetResult.success && targetResult.value.manifold) {
        const boolResult = manifoldEngine.boolean(
          targetResult.value.manifold,
          result,
          node.params.booleanOp
        );
        if (boolResult.success) {
          result = boolResult.value;
        }
      }
    }

    return this.manifoldToGeometry(result);
  }

  /**
   * Compute revolution geometry
   */
  private async computeRevolve(node: CADRevolve): Promise<ComputedGeometry> {
    const { sketchId, angle } = node.params;

    // Get sketch
    const sketch = nodesStore.get(sketchId) as CADSketch | undefined;
    if (!sketch || sketch.type !== 'sketch') {
      return this.createEmptyGeometry('Sketch not found');
    }

    // Get profiles from sketch
    const profiles = sketch.profiles;
    if (!profiles || profiles.length === 0) {
      return this.createEmptyGeometry('No closed profiles in sketch');
    }

    // Revolve each profile
    const revolutionResults: import('manifold-3d').Manifold[] = [];

    for (const profile of profiles) {
      const revolveResult = manifoldEngine.revolve(profile, angle);
      if (revolveResult.success) {
        revolutionResults.push(revolveResult.value);
      }
    }

    if (revolutionResults.length === 0) {
      return this.createEmptyGeometry('Revolution failed');
    }

    // Union all revolutions
    let result = revolutionResults[0];
    for (let i = 1; i < revolutionResults.length; i++) {
      const unionResult = manifoldEngine.union(result, revolutionResults[i]);
      if (unionResult.success) {
        result = unionResult.value;
      }
    }

    return this.manifoldToGeometry(result);
  }

  /**
   * Convert Manifold solid to ComputedGeometry
   */
  private manifoldToGeometry(solid: import('manifold-3d').Manifold): ComputedGeometry {
    // Extract mesh data
    const meshResult = manifoldEngine.extractMesh(solid);
    if (!meshResult.success) {
      return this.createEmptyGeometry(meshResult.error);
    }

    const { vertices, indices, normals } = meshResult.value;

    // Create Three.js BufferGeometry
    const threeGeometry = new THREE.BufferGeometry();
    threeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    threeGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    threeGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    threeGeometry.computeBoundingBox();

    // Extract topology
    const topoResult = manifoldEngine.extractTopology(solid);
    const topology = topoResult.success ? topoResult.value : null;

    // Get bounding box
    const bboxResult = manifoldEngine.getBoundingBox(solid);
    const bounds = bboxResult.success ? bboxResult.value : null;

    return {
      manifold: solid,
      threeGeometry,
      meshData: { vertices, indices, normals },
      topology,
      bounds,
      dirty: false,
      error: null
    };
  }

  /**
   * Create empty geometry with error message
   */
  private createEmptyGeometry(error: string): ComputedGeometry {
    return {
      manifold: null,
      threeGeometry: null,
      meshData: null,
      topology: null,
      bounds: null,
      dirty: false,
      error
    };
  }

  /**
   * Mark a node and its dependents as dirty
   */
  private markDirtyWithDependents(nodeId: string): void {
    geometryCacheStore.markDirty(nodeId);

    // Find all nodes that depend on this one
    const doc = get(documentStore);
    for (const [id, node] of doc.nodes) {
      // Check boolean operands
      if ((node.type === 'union' || node.type === 'difference' || node.type === 'intersection') &&
          (node as CADBoolean).operandIds.includes(nodeId)) {
        this.markDirtyWithDependents(id);
      }

      // Check extrude/revolve sketch references
      if (node.type === 'extrude' && (node as CADExtrude).params.sketchId === nodeId) {
        this.markDirtyWithDependents(id);
      }
      if (node.type === 'revolve' && (node as CADRevolve).params.sketchId === nodeId) {
        this.markDirtyWithDependents(id);
      }
    }
  }

  /**
   * Recompute all dirty geometries
   */
  async recomputeAll(): Promise<void> {
    const doc = get(documentStore);
    
    for (const [nodeId] of doc.nodes) {
      const cached = geometryCacheStore.get(nodeId);
      if (!cached || cached.dirty) {
        await this.compute(nodeId);
      }
    }
  }
}

// Export singleton instance
export const geometryComputer = new GeometryComputer();
