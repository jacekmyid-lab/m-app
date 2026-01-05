/**
 * ============================================================================
 * PLANE MANAGER
 * ============================================================================
 * 
 * Manages work planes in the CAD application.
 * Planes are used as reference surfaces for sketching and operations.
 * 
 * @module tools/PlaneManager
 */

import type { Plane, Point3D, Result } from '../core/types';
import { generateId, planesStore, documentStore } from '../stores/cadStore';
import { bvhSelectionSystem } from '../geometry/BVHSelectionSystem';

/**
 * ============================================================================
 * PLANE MANAGER CLASS
 * ============================================================================
 */
export class PlaneManager {
  /**
   * Create a plane from a face normal
   */
  createFromFace(modelId: string, faceIndex: number, name?: string): Result<Plane> {
    const faceInfo = bvhSelectionSystem.getFaceInfo(modelId, faceIndex);
    if (!faceInfo) {
      return { success: false, error: 'Could not get face information' };
    }

    const { center, normal } = faceInfo;
    const { xAxis, yAxis } = this.calculateAxes(normal);

    const plane: Plane = {
      id: generateId(),
      name: name ?? `Plane from Face ${faceIndex}`,
      origin: center,
      normal,
      xAxis,
      yAxis,
      isReference: false,
      source: { type: 'face', faceId: `${faceIndex}`, modelId }
    };

    planesStore.add(plane);
    return { success: true, value: plane };
  }

  /**
   * Create a plane from three points
   */
  createFromThreePoints(p1: Point3D, p2: Point3D, p3: Point3D, name?: string): Result<Plane> {
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };

    const normal = this.normalize({
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x
    });

    if (Math.abs(normal.x) < 1e-10 && Math.abs(normal.y) < 1e-10 && Math.abs(normal.z) < 1e-10) {
      return { success: false, error: 'Points are collinear' };
    }

    const { xAxis, yAxis } = this.calculateAxes(normal);

    const plane: Plane = {
      id: generateId(),
      name: name ?? 'Three Point Plane',
      origin: p1,
      normal,
      xAxis,
      yAxis,
      isReference: false,
      source: { type: 'threePoint', points: [p1, p2, p3] }
    };

    planesStore.add(plane);
    return { success: true, value: plane };
  }

  /**
   * Create an offset plane from an existing plane
   */
  createOffset(basePlaneId: string, distance: number, name?: string): Result<Plane> {
    const basePlane = planesStore.get(basePlaneId);
    if (!basePlane) {
      return { success: false, error: 'Base plane not found' };
    }

    const offsetOrigin: Point3D = {
      x: basePlane.origin.x + basePlane.normal.x * distance,
      y: basePlane.origin.y + basePlane.normal.y * distance,
      z: basePlane.origin.z + basePlane.normal.z * distance
    };

    const plane: Plane = {
      id: generateId(),
      name: name ?? `Offset Plane (${distance})`,
      origin: offsetOrigin,
      normal: { ...basePlane.normal },
      xAxis: { ...basePlane.xAxis },
      yAxis: { ...basePlane.yAxis },
      isReference: false,
      source: { type: 'offset', basePlaneId, distance }
    };

    planesStore.add(plane);
    return { success: true, value: plane };
  }

  /**
   * Calculate orthogonal X and Y axes from a normal vector
   */
  private calculateAxes(normal: Point3D): { xAxis: Point3D; yAxis: Point3D } {
    let up: Point3D;
    if (Math.abs(normal.y) < 0.9) {
      up = { x: 0, y: 1, z: 0 };
    } else {
      up = { x: 1, y: 0, z: 0 };
    }

    const xAxis = this.normalize({
      x: up.y * normal.z - up.z * normal.y,
      y: up.z * normal.x - up.x * normal.z,
      z: up.x * normal.y - up.y * normal.x
    });

    const yAxis = this.normalize({
      x: normal.y * xAxis.z - normal.z * xAxis.y,
      y: normal.z * xAxis.x - normal.x * xAxis.z,
      z: normal.x * xAxis.y - normal.y * xAxis.x
    });

    return { xAxis, yAxis };
  }

  /**
   * Normalize a vector
   */
  private normalize(v: Point3D): Point3D {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (len < 1e-10) return { x: 0, y: 0, z: 1 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  /**
   * Get a plane by ID
   */
  getPlane(planeId: string): Plane | undefined {
    return planesStore.get(planeId);
  }

  /**
   * Delete a plane
   */
  deletePlane(planeId: string): Result<void> {
    const plane = planesStore.get(planeId);
    if (!plane) return { success: false, error: 'Plane not found' };
    if (plane.isReference) return { success: false, error: 'Cannot delete reference planes' };
    planesStore.delete(planeId);
    return { success: true, value: undefined };
  }

  /**
   * Set the active plane
   */
  setActivePlane(planeId: string): void {
    documentStore.setActivePlane(planeId);
  }
}

export const planeManager = new PlaneManager();
