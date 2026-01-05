/**
 * ============================================================================
 * MANIFOLD CAD - LIBRARY EXPORTS
 * ============================================================================
 * 
 * Central export point for all library modules.
 * Import from '$lib' to access any module.
 */

// Core types
export * from './core/types';

// Stores
export * from './stores/cadStore';

// Geometry
export { manifoldEngine, ManifoldEngine, getManifoldEngine } from './geometry/ManifoldEngine';
export { bvhSelectionSystem, BVHSelectionSystem } from './geometry/BVHSelectionSystem';
export { geometryComputer } from './geometry/GeometryComputer';
export { 
  Solid,
  BoxSolid,
  SphereSolid,
  CylinderSolid,
  ConeSolid,
  TorusSolid,
  CADFace,
  CADEdge,
  CADVertex,
  CADMaterials,
  initializeSolidModule,
  isModuleReady
} from './geometry/Solid';

// Sketcher
export { Sketcher, createSketcher, SketchEntityFactory } from './sketcher/Sketcher';

// Tools
export { planeManager, PlaneManager } from './tools/PlaneManager';
export { getTransformController, TransformController } from './tools/TransformController';
export * from './tools/CADOperations';
export * from './tools/FeatureOperations';
