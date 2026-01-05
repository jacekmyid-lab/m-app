/**
 * ============================================================================
 * TRANSFORM CONTROLLER
 * ============================================================================
 * 
 * Provides transformation controls for CAD objects with pivot point support.
 * Uses Three.js TransformControls internally.
 */

import * as THREE from 'three';
import { CADSolid, CADVertex, CADEdge, CADFace } from './Topology';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformSpace = 'world' | 'local';

export interface TransformState {
  mode: TransformMode;
  space: TransformSpace;
  pivot: THREE.Vector3;
  snapping: boolean;
  snapTranslate: number;
  snapRotate: number; // degrees
  snapScale: number;
}

/**
 * Transform Controller class
 * Manages transformations with pivot point support
 */
export class TransformController {
  private _mode: TransformMode = 'translate';
  private _space: TransformSpace = 'world';
  private _pivot: THREE.Vector3 = new THREE.Vector3();
  private _snapping: boolean = false;
  private _snapTranslate: number = 1;
  private _snapRotate: number = 15;
  private _snapScale: number = 0.1;
  private _target: CADSolid | null = null;
  private _pivotHelper: THREE.Object3D | null = null;
  private _onChange: ((solid: CADSolid, matrix: THREE.Matrix4) => void) | null = null;

  constructor() {
    this._createPivotHelper();
  }

  // Getters and setters
  get mode(): TransformMode {
    return this._mode;
  }

  set mode(value: TransformMode) {
    this._mode = value;
  }

  get space(): TransformSpace {
    return this._space;
  }

  set space(value: TransformSpace) {
    this._space = value;
  }

  get pivot(): THREE.Vector3 {
    return this._pivot.clone();
  }

  set pivot(value: THREE.Vector3) {
    this._pivot.copy(value);
    this._updatePivotHelper();
  }

  get snapping(): boolean {
    return this._snapping;
  }

  set snapping(value: boolean) {
    this._snapping = value;
  }

  get target(): CADSolid | null {
    return this._target;
  }

  set target(solid: CADSolid | null) {
    this._target = solid;
    if (solid) {
      this._pivot.copy(solid.pivot);
      this._updatePivotHelper();
    }
  }

  /**
   * Set callback for transform changes
   */
  onChange(callback: (solid: CADSolid, matrix: THREE.Matrix4) => void): void {
    this._onChange = callback;
  }

  /**
   * Create visual helper for pivot point
   */
  private _createPivotHelper(): void {
    const group = new THREE.Group();
    
    // Axes
    const axisLength = 0.5;
    const axisGeom = new THREE.BufferGeometry();
    
    // X axis (red)
    const xLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(axisLength, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    );
    
    // Y axis (green)
    const yLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, axisLength, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x00ff00 })
    );
    
    // Z axis (blue)
    const zLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, axisLength)
      ]),
      new THREE.LineBasicMaterial({ color: 0x0000ff })
    );

    // Center sphere
    const sphereGeom = new THREE.SphereGeometry(0.05, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);

    group.add(xLine, yLine, zLine, sphere);
    group.visible = false;
    this._pivotHelper = group;
  }

  /**
   * Update pivot helper position
   */
  private _updatePivotHelper(): void {
    if (this._pivotHelper) {
      this._pivotHelper.position.copy(this._pivot);
    }
  }

  /**
   * Get pivot helper for adding to scene
   */
  getPivotHelper(): THREE.Object3D | null {
    return this._pivotHelper;
  }

  /**
   * Show/hide pivot helper
   */
  showPivotHelper(visible: boolean): void {
    if (this._pivotHelper) {
      this._pivotHelper.visible = visible;
    }
  }

  /**
   * Set pivot to vertex
   */
  setPivotToVertex(vertex: CADVertex): void {
    const worldPos = vertex.getWorldPosition();
    this._pivot.copy(worldPos);
    if (this._target) {
      this._target.pivot = worldPos;
    }
    this._updatePivotHelper();
  }

  /**
   * Set pivot to edge midpoint
   */
  setPivotToEdge(edge: CADEdge): void {
    const midpoint = edge.getMidpoint(true);
    this._pivot.copy(midpoint);
    if (this._target) {
      this._target.pivot = midpoint;
    }
    this._updatePivotHelper();
  }

  /**
   * Set pivot to face centroid
   */
  setPivotToFace(face: CADFace): void {
    const centroid = face.getCentroid();
    this._pivot.copy(centroid);
    if (this._target) {
      this._target.pivot = centroid;
    }
    this._updatePivotHelper();
  }

  /**
   * Set pivot to object center
   */
  setPivotToCenter(): void {
    if (this._target) {
      this._target.setPivotToCenter();
      this._pivot.copy(this._target.pivot);
      this._updatePivotHelper();
    }
  }

  /**
   * Set pivot to world origin
   */
  setPivotToOrigin(): void {
    this._pivot.set(0, 0, 0);
    if (this._target) {
      this._target.pivot = this._pivot;
    }
    this._updatePivotHelper();
  }

  /**
   * Apply snap to value
   */
  private _snap(value: number, snapValue: number): number {
    if (!this._snapping) return value;
    return Math.round(value / snapValue) * snapValue;
  }

  /**
   * Translate the target
   */
  translate(delta: THREE.Vector3): void {
    if (!this._target) return;

    const snappedDelta = new THREE.Vector3(
      this._snap(delta.x, this._snapTranslate),
      this._snap(delta.y, this._snapTranslate),
      this._snap(delta.z, this._snapTranslate)
    );

    const matrix = new THREE.Matrix4().makeTranslation(
      snappedDelta.x,
      snappedDelta.y,
      snappedDelta.z
    );

    this._target.applyMatrix4(matrix);
    this._pivot.add(snappedDelta);
    this._updatePivotHelper();

    if (this._onChange) {
      this._onChange(this._target, matrix);
    }
  }

  /**
   * Rotate the target around pivot
   */
  rotate(axis: THREE.Vector3, angleDegrees: number): void {
    if (!this._target) return;

    const snappedAngle = this._snap(angleDegrees, this._snapRotate);
    const angleRad = THREE.MathUtils.degToRad(snappedAngle);

    this._target.rotateAroundPivot(axis, angleRad);

    const matrix = new THREE.Matrix4().makeRotationAxis(axis.normalize(), angleRad);
    
    if (this._onChange) {
      this._onChange(this._target, matrix);
    }
  }

  /**
   * Scale the target around pivot
   */
  scale(factor: THREE.Vector3): void {
    if (!this._target) return;

    const snappedFactor = new THREE.Vector3(
      this._snap(factor.x, this._snapScale),
      this._snap(factor.y, this._snapScale),
      this._snap(factor.z, this._snapScale)
    );

    // Ensure minimum scale
    snappedFactor.x = Math.max(0.01, snappedFactor.x);
    snappedFactor.y = Math.max(0.01, snappedFactor.y);
    snappedFactor.z = Math.max(0.01, snappedFactor.z);

    this._target.scaleAroundPivot(snappedFactor);

    const matrix = new THREE.Matrix4().makeScale(
      snappedFactor.x,
      snappedFactor.y,
      snappedFactor.z
    );

    if (this._onChange) {
      this._onChange(this._target, matrix);
    }
  }

  /**
   * Get current state
   */
  getState(): TransformState {
    return {
      mode: this._mode,
      space: this._space,
      pivot: this._pivot.clone(),
      snapping: this._snapping,
      snapTranslate: this._snapTranslate,
      snapRotate: this._snapRotate,
      snapScale: this._snapScale,
    };
  }

  /**
   * Set state
   */
  setState(state: Partial<TransformState>): void {
    if (state.mode !== undefined) this._mode = state.mode;
    if (state.space !== undefined) this._space = state.space;
    if (state.pivot !== undefined) this._pivot.copy(state.pivot);
    if (state.snapping !== undefined) this._snapping = state.snapping;
    if (state.snapTranslate !== undefined) this._snapTranslate = state.snapTranslate;
    if (state.snapRotate !== undefined) this._snapRotate = state.snapRotate;
    if (state.snapScale !== undefined) this._snapScale = state.snapScale;
    this._updatePivotHelper();
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this._mode = 'translate';
    this._space = 'world';
    this._pivot.set(0, 0, 0);
    this._snapping = false;
    this._target = null;
    this._updatePivotHelper();
    this.showPivotHelper(false);
  }

  dispose(): void {
    if (this._pivotHelper) {
      this._pivotHelper.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
    }
  }
}

// Singleton instance
let transformControllerInstance: TransformController | null = null;

export function getTransformController(): TransformController {
  if (!transformControllerInstance) {
    transformControllerInstance = new TransformController();
  }
  return transformControllerInstance;
}
