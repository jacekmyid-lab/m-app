/**
 * ============================================================================
 * FEATURE OPERATIONS
 * ============================================================================
 * 
 * Implements CAD feature operations: Extrude, Revolve, and Boolean operations.
 * Uses Manifold for solid geometry computation.
 */

import * as THREE from 'three';
import type { 
  Point2D, 
  Point3D, 
  Plane, 
  BooleanOperation,
  Result,
  CADSketch
} from '../core/types';
import { manifoldEngine } from '../geometry/ManifoldEngine';
import { CADSolid, CADFace, buildSolidFromMesh } from '../geometry/Topology';
import { Sketcher } from '../sketcher/Sketcher';

// ============================================================================
// EXTRUDE OPERATION
// ============================================================================

export interface ExtrudeOptions {
  /** Sketch or profiles to extrude */
  profiles: Point2D[][];
  /** Plane the sketch is on */
  plane: Plane;
  /** Extrusion distance (positive = along normal) */
  distance: number;
  /** Distance in opposite direction (for symmetric/both) */
  distanceBack?: number;
  /** Twist angle in degrees */
  twist?: number;
  /** Scale at end [x, y] */
  scale?: [number, number];
  /** Boolean operation with target */
  booleanOp?: BooleanOperation | 'new';
  /** Target solid for boolean */
  targetSolid?: any;
}

/**
 * Extrude profiles to create a solid
 */
export async function extrude(options: ExtrudeOptions): Promise<Result<any>> {
  const { 
    profiles, 
    plane, 
    distance, 
    distanceBack = 0,
    twist = 0, 
    scale = [1, 1],
    booleanOp = 'new',
    targetSolid
  } = options;

  if (profiles.length === 0) {
    return { success: false, error: 'No profiles to extrude' };
  }

  await manifoldEngine.initialize();
  if (!manifoldEngine.isReady()) {
    return { success: false, error: 'Manifold engine not ready' };
  }

  try {
    let resultManifold: any = null;

    // Extrude each profile
    for (const profile of profiles) {
      if (profile.length < 3) continue;

      // Transform profile from plane coordinates to 3D
      // For now, assume profile is in XY plane, will transform result
      
      // Create extrusion
      const extrudeResult = manifoldEngine.extrude(
        profile, 
        distance, 
        twist, 
        scale
      );

      if (!extrudeResult.success) {
        return extrudeResult;
      }

      let extruded = extrudeResult.value;

      // Handle backward extrusion
      if (distanceBack > 0) {
        const backResult = manifoldEngine.extrude(
          profile,
          -distanceBack,
          -twist,
          scale
        );
        
        if (backResult.success) {
          const unionResult = manifoldEngine.union(extruded, backResult.value);
          if (unionResult.success) {
            manifoldEngine.deleteManifold(extruded);
            manifoldEngine.deleteManifold(backResult.value);
            extruded = unionResult.value;
          }
        }
      }

      // Transform to plane orientation
      const transformedResult = transformToPlane(extruded, plane);
      if (!transformedResult.success) {
        return transformedResult;
      }
      
      manifoldEngine.deleteManifold(extruded);
      extruded = transformedResult.value;

      // Combine with previous profiles
      if (resultManifold) {
        const unionResult = manifoldEngine.union(resultManifold, extruded);
        if (unionResult.success) {
          manifoldEngine.deleteManifold(resultManifold);
          manifoldEngine.deleteManifold(extruded);
          resultManifold = unionResult.value;
        }
      } else {
        resultManifold = extruded;
      }
    }

    if (!resultManifold) {
      return { success: false, error: 'Failed to create extrusion' };
    }

    // Apply boolean operation with target
    if (booleanOp !== 'new' && targetSolid) {
      const boolResult = manifoldEngine.boolean(targetSolid, resultManifold, booleanOp);
      if (boolResult.success) {
        manifoldEngine.deleteManifold(resultManifold);
        return boolResult;
      }
    }

    return { success: true, value: resultManifold };
  } catch (error) {
    return { success: false, error: `Extrude failed: ${error}` };
  }
}

// ============================================================================
// REVOLVE OPERATION
// ============================================================================

export interface RevolveOptions {
  /** Profiles to revolve */
  profiles: Point2D[][];
  /** Plane the sketch is on */
  plane: Plane;
  /** Revolution axis (two points in plane coordinates) */
  axis: { start: Point2D; end: Point2D };
  /** Angle in degrees (default 360) */
  angle?: number;
  /** Number of segments */
  segments?: number;
  /** Boolean operation with target */
  booleanOp?: BooleanOperation | 'new';
  /** Target solid for boolean */
  targetSolid?: any;
}

/**
 * Revolve profiles around an axis
 */
export async function revolve(options: RevolveOptions): Promise<Result<any>> {
  const {
    profiles,
    plane,
    axis,
    angle = 360,
    segments = 64,
    booleanOp = 'new',
    targetSolid
  } = options;

  if (profiles.length === 0) {
    return { success: false, error: 'No profiles to revolve' };
  }

  await manifoldEngine.initialize();
  if (!manifoldEngine.isReady()) {
    return { success: false, error: 'Manifold engine not ready' };
  }

  try {
    let resultManifold: any = null;

    for (const profile of profiles) {
      if (profile.length < 3) continue;

      // Transform profile relative to axis
      // The axis defines the Y axis for revolution
      const axisVec = {
        x: axis.end.x - axis.start.x,
        y: axis.end.y - axis.start.y
      };
      const axisLen = Math.sqrt(axisVec.x * axisVec.x + axisVec.y * axisVec.y);
      
      if (axisLen < 1e-9) {
        return { success: false, error: 'Invalid revolution axis' };
      }

      // Normalize axis
      axisVec.x /= axisLen;
      axisVec.y /= axisLen;

      // Transform profile points to axis-aligned coordinates
      const transformedProfile: Point2D[] = profile.map(p => {
        // Translate to axis origin
        const dx = p.x - axis.start.x;
        const dy = p.y - axis.start.y;
        
        // Rotate so axis is along Y
        // x' = perpendicular distance (radius)
        // y' = distance along axis
        const perpX = -axisVec.y;
        const perpY = axisVec.x;
        
        return {
          x: dx * perpX + dy * perpY, // radius from axis
          y: dx * axisVec.x + dy * axisVec.y // height along axis
        };
      });

      // Ensure all points have positive x (radius)
      // If profile crosses axis, we need to handle it differently
      const minX = Math.min(...transformedProfile.map(p => p.x));
      if (minX < 0) {
        // Offset profile so all radii are positive
        for (const p of transformedProfile) {
          p.x -= minX;
        }
      }

      // Use manifold revolve
      const revolveResult = manifoldEngine.revolve(transformedProfile, angle);
      
      if (!revolveResult.success) {
        return revolveResult;
      }

      let revolved = revolveResult.value;

      // Transform back to original plane orientation
      // First, rotate around Y to align with original axis orientation
      const axisAngle = Math.atan2(axisVec.y, axisVec.x);
      if (Math.abs(axisAngle) > 1e-9) {
        const rotResult = manifoldEngine.rotate(revolved, { 
          x: 0, 
          y: 0, 
          z: axisAngle * 180 / Math.PI 
        });
        if (rotResult.success) {
          manifoldEngine.deleteManifold(revolved);
          revolved = rotResult.value;
        }
      }

      // Translate to axis start position
      const transResult = manifoldEngine.translate(revolved, {
        x: axis.start.x,
        y: axis.start.y,
        z: 0
      });
      if (transResult.success) {
        manifoldEngine.deleteManifold(revolved);
        revolved = transResult.value;
      }

      // Transform to plane orientation
      const transformedResult = transformToPlane(revolved, plane);
      if (!transformedResult.success) {
        return transformedResult;
      }
      
      manifoldEngine.deleteManifold(revolved);
      revolved = transformedResult.value;

      // Combine with previous
      if (resultManifold) {
        const unionResult = manifoldEngine.union(resultManifold, revolved);
        if (unionResult.success) {
          manifoldEngine.deleteManifold(resultManifold);
          manifoldEngine.deleteManifold(revolved);
          resultManifold = unionResult.value;
        }
      } else {
        resultManifold = revolved;
      }
    }

    if (!resultManifold) {
      return { success: false, error: 'Failed to create revolution' };
    }

    // Apply boolean operation with target
    if (booleanOp !== 'new' && targetSolid) {
      const boolResult = manifoldEngine.boolean(targetSolid, resultManifold, booleanOp);
      if (boolResult.success) {
        manifoldEngine.deleteManifold(resultManifold);
        return boolResult;
      }
    }

    return { success: true, value: resultManifold };
  } catch (error) {
    return { success: false, error: `Revolve failed: ${error}` };
  }
}

// ============================================================================
// BOOLEAN OPERATIONS
// ============================================================================

export interface BooleanOptions {
  /** First operand (base solid) */
  solidA: any;
  /** Second operand (tool solid) */
  solidB: any;
  /** Operation type */
  operation: BooleanOperation;
  /** Keep originals (don't delete) */
  keepOriginals?: boolean;
}

/**
 * Perform boolean operation on two solids
 */
export async function performBoolean(options: BooleanOptions): Promise<Result<any>> {
  const { solidA, solidB, operation, keepOriginals = false } = options;

  await manifoldEngine.initialize();
  if (!manifoldEngine.isReady()) {
    return { success: false, error: 'Manifold engine not ready' };
  }

  try {
    const result = manifoldEngine.boolean(solidA, solidB, operation);
    
    if (result.success && !keepOriginals) {
      manifoldEngine.deleteManifold(solidA);
      manifoldEngine.deleteManifold(solidB);
    }

    return result;
  } catch (error) {
    return { success: false, error: `Boolean operation failed: ${error}` };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Transform a manifold solid from XY plane to target plane
 */
function transformToPlane(solid: any, plane: Plane): Result<any> {
  try {
    // Build rotation matrix to transform from XY to plane orientation
    // XY plane normal is (0, 0, 1)
    // Need to rotate to align with plane.normal
    
    const fromNormal = new THREE.Vector3(0, 0, 1);
    const toNormal = new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z);
    
    // Calculate rotation
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(fromNormal, toNormal);
    
    // Convert to Euler angles (degrees)
    const euler = new THREE.Euler();
    euler.setFromQuaternion(quaternion);
    
    const rotationDeg = {
      x: THREE.MathUtils.radToDeg(euler.x),
      y: THREE.MathUtils.radToDeg(euler.y),
      z: THREE.MathUtils.radToDeg(euler.z)
    };

    // Apply rotation
    let result = solid;
    
    if (Math.abs(rotationDeg.x) > 0.01 || Math.abs(rotationDeg.y) > 0.01 || Math.abs(rotationDeg.z) > 0.01) {
      const rotateResult = manifoldEngine.rotate(solid, rotationDeg);
      if (!rotateResult.success) {
        return rotateResult;
      }
      result = rotateResult.value;
    }

    // Apply translation to plane origin
    if (Math.abs(plane.origin.x) > 1e-9 || Math.abs(plane.origin.y) > 1e-9 || Math.abs(plane.origin.z) > 1e-9) {
      const translateResult = manifoldEngine.translate(result, plane.origin);
      if (!translateResult.success) {
        if (result !== solid) manifoldEngine.deleteManifold(result);
        return translateResult;
      }
      if (result !== solid) manifoldEngine.deleteManifold(result);
      result = translateResult.value;
    }

    return { success: true, value: result };
  } catch (error) {
    return { success: false, error: `Transform to plane failed: ${error}` };
  }
}

/**
 * Create a plane from a face
 */
export function createPlaneFromFace(face: CADFace): Plane {
  const normal = face.getAverageNormal();
  const origin = face.getCentroid();
  
  // Calculate orthogonal axes
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(up)) > 0.9) {
    up = new THREE.Vector3(1, 0, 0);
  }
  
  const xAxis = new THREE.Vector3().crossVectors(up, normal).normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  return {
    id: `plane_${Date.now()}`,
    name: `Plane from ${face.name}`,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    normal: { x: normal.x, y: normal.y, z: normal.z },
    xAxis: { x: xAxis.x, y: xAxis.y, z: xAxis.z },
    yAxis: { x: yAxis.x, y: yAxis.y, z: yAxis.z },
    isReference: false,
    source: { type: 'face', faceId: `${face.faceIndex}`, modelId: face.parentSolid?.nodeId || '' }
  };
}

/**
 * Extract mesh and build CADSolid from manifold
 */
export function manifoldToSolid(manifold: any, nodeId: string): Result<CADSolid> {
  const meshResult = manifoldEngine.extractMesh(manifold);
  if (!meshResult.success) {
    return { success: false, error: meshResult.error };
  }

  const { vertices, indices, normals } = meshResult.value;
  const solid = buildSolidFromMesh(nodeId, vertices, indices, normals);
  
  return { success: true, value: solid };
}

// ============================================================================
// SKETCH TO EXTRUSION WORKFLOW
// ============================================================================

export interface SketchExtrudeOptions {
  /** The sketch to extrude */
  sketch: Sketcher;
  /** The plane the sketch is on */
  plane: Plane;
  /** Extrusion distance */
  distance: number;
  /** Direction: 'normal', 'both', 'symmetric' */
  direction?: 'normal' | 'both' | 'symmetric';
  /** Boolean operation */
  booleanOp?: BooleanOperation | 'new';
  /** Target solid for boolean */
  targetSolid?: any;
}

/**
 * Complete workflow: Sketch -> Profiles -> Extrude -> Solid
 */
export async function extrudeSketch(options: SketchExtrudeOptions): Promise<Result<any>> {
  const { 
    sketch, 
    plane, 
    distance, 
    direction = 'normal',
    booleanOp = 'new',
    targetSolid
  } = options;

  // Detect closed profiles from sketch
  const profiles = sketch.detectProfiles();
  
  if (profiles.length === 0) {
    return { success: false, error: 'No closed profiles found in sketch' };
  }

  // Calculate distances based on direction
  let distForward = distance;
  let distBack = 0;

  if (direction === 'both') {
    distForward = distance;
    distBack = distance;
  } else if (direction === 'symmetric') {
    distForward = distance / 2;
    distBack = distance / 2;
  }

  // Perform extrusion
  return extrude({
    profiles,
    plane,
    distance: distForward,
    distanceBack: distBack,
    booleanOp,
    targetSolid
  });
}

/**
 * Complete workflow: Sketch -> Profiles -> Revolve -> Solid
 */
export interface SketchRevolveOptions {
  /** The sketch to revolve */
  sketch: Sketcher;
  /** The plane the sketch is on */
  plane: Plane;
  /** Axis line entity ID in the sketch */
  axisEntityId: string;
  /** Revolution angle in degrees */
  angle?: number;
  /** Boolean operation */
  booleanOp?: BooleanOperation | 'new';
  /** Target solid for boolean */
  targetSolid?: any;
}

export async function revolveSketch(options: SketchRevolveOptions): Promise<Result<any>> {
  const {
    sketch,
    plane,
    axisEntityId,
    angle = 360,
    booleanOp = 'new',
    targetSolid
  } = options;

  // Get axis from sketch
  const axisEntity = sketch.getEntity(axisEntityId);
  if (!axisEntity || axisEntity.type !== 'line') {
    return { success: false, error: 'Invalid axis entity - must be a line' };
  }

  const axis = {
    start: axisEntity.start,
    end: axisEntity.end
  };

  // Detect profiles (excluding construction geometry)
  const profiles = sketch.detectProfiles();
  
  if (profiles.length === 0) {
    return { success: false, error: 'No closed profiles found in sketch' };
  }

  // Perform revolution
  return revolve({
    profiles,
    plane,
    axis,
    angle,
    booleanOp,
    targetSolid
  });
}
