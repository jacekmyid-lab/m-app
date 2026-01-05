/**
 * ============================================================================
 * CAD OPERATIONS
 * ============================================================================
 * 
 * This module provides high-level CAD operations:
 * - Primitive creation (box, sphere, cylinder, cone, torus)
 * - Boolean operations (union, difference, intersection)
 * - Transformations (translate, rotate, scale)
 * - Feature operations (extrude, revolve)
 * 
 * All operations create or modify CAD nodes and trigger geometry recomputation.
 * 
 * @module tools/CADOperations
 */

import type {
  CADNode,
  CADPrimitive,
  CADBoolean,
  CADExtrude,
  CADRevolve,
  CADSketch,
  CADGroup,
  BoxParams,
  SphereParams,
  CylinderParams,
  ConeParams,
  TorusParams,
  BooleanOperation,
  ExtrudeParams,
  RevolveParams,
  Point3D,
  Result
} from '../core/types';
import { 
  generateId, 
  identityMatrix, 
  nodesStore, 
  selectionStore,
  documentStore
} from '../stores/cadStore';
import { geometryComputer } from '../geometry/GeometryComputer';
import { Sketcher, SketchEntityFactory } from '../sketcher/Sketcher';

/**
 * ============================================================================
 * PRIMITIVE CREATION
 * ============================================================================
 */

/**
 * Create a box primitive
 */
export async function createBox(
  params: BoxParams,
  name?: string,
  parentId?: string
): Promise<Result<CADPrimitive>> {
  const node: CADPrimitive = {
    id: generateId(),
    name: name ?? 'Box',
    type: 'box',
    visible: true,
    locked: false,
    parentId: parentId ?? null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params: { type: 'box', params }
  };

  nodesStore.add(node);
  
  // Compute geometry
  const result = await geometryComputer.compute(node.id);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Select the new node
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * Create a sphere primitive
 */
export async function createSphere(
  params: SphereParams,
  name?: string,
  parentId?: string
): Promise<Result<CADPrimitive>> {
  const node: CADPrimitive = {
    id: generateId(),
    name: name ?? 'Sphere',
    type: 'sphere',
    visible: true,
    locked: false,
    parentId: parentId ?? null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params: { type: 'sphere', params }
  };

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * Create a cylinder primitive
 */
export async function createCylinder(
  params: CylinderParams,
  name?: string,
  parentId?: string
): Promise<Result<CADPrimitive>> {
  const node: CADPrimitive = {
    id: generateId(),
    name: name ?? 'Cylinder',
    type: 'cylinder',
    visible: true,
    locked: false,
    parentId: parentId ?? null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params: { type: 'cylinder', params }
  };

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * Create a cone primitive
 */
export async function createCone(
  params: ConeParams,
  name?: string,
  parentId?: string
): Promise<Result<CADPrimitive>> {
  const node: CADPrimitive = {
    id: generateId(),
    name: name ?? 'Cone',
    type: 'cone',
    visible: true,
    locked: false,
    parentId: parentId ?? null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params: { type: 'cone', params }
  };

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * Create a torus primitive
 */
export async function createTorus(
  params: TorusParams,
  name?: string,
  parentId?: string
): Promise<Result<CADPrimitive>> {
  const node: CADPrimitive = {
    id: generateId(),
    name: name ?? 'Torus',
    type: 'torus',
    visible: true,
    locked: false,
    parentId: parentId ?? null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params: { type: 'torus', params }
  };

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * ============================================================================
 * BOOLEAN OPERATIONS
 * ============================================================================
 */

/**
 * Perform a boolean operation on selected nodes
 */
export async function performBoolean(
  operation: BooleanOperation,
  operandIds: string[],
  name?: string
): Promise<Result<CADBoolean>> {
  if (operandIds.length < 2) {
    return { success: false, error: 'Boolean requires at least 2 operands' };
  }

  // Verify all operands exist
  for (const id of operandIds) {
    if (!nodesStore.get(id)) {
      return { success: false, error: `Operand not found: ${id}` };
    }
  }

  const node: CADBoolean = {
    id: generateId(),
    name: name ?? `${operation.charAt(0).toUpperCase() + operation.slice(1)}`,
    type: operation,
    visible: true,
    locked: false,
    parentId: null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    operandIds
  };

  // Hide operands
  for (const id of operandIds) {
    nodesStore.update(id, { visible: false });
  }

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * ============================================================================
 * TRANSFORMATION OPERATIONS
 * ============================================================================
 */

/**
 * Translate a node
 */
export function translateNode(
  nodeId: string,
  offset: Point3D,
  pivot?: Point3D
): Result<void> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  const transform = [...node.transform];
  
  // Apply translation to transform matrix
  transform[12] += offset.x;
  transform[13] += offset.y;
  transform[14] += offset.z;

  nodesStore.update(nodeId, { transform });
  
  return { success: true, value: undefined };
}

/**
 * Rotate a node around an axis
 */
export function rotateNode(
  nodeId: string,
  axis: 'x' | 'y' | 'z',
  angleDegrees: number,
  pivot?: Point3D
): Result<void> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Create rotation matrix
  let rotMatrix: number[];
  switch (axis) {
    case 'x':
      rotMatrix = [
        1, 0, 0, 0,
        0, cos, sin, 0,
        0, -sin, cos, 0,
        0, 0, 0, 1
      ];
      break;
    case 'y':
      rotMatrix = [
        cos, 0, -sin, 0,
        0, 1, 0, 0,
        sin, 0, cos, 0,
        0, 0, 0, 1
      ];
      break;
    case 'z':
      rotMatrix = [
        cos, sin, 0, 0,
        -sin, cos, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ];
      break;
  }

  // Multiply with existing transform
  const newTransform = multiplyMatrices(node.transform, rotMatrix);
  nodesStore.update(nodeId, { transform: newTransform });

  return { success: true, value: undefined };
}

/**
 * Scale a node
 */
export function scaleNode(
  nodeId: string,
  scale: Point3D | number,
  pivot?: Point3D
): Result<void> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  const sx = typeof scale === 'number' ? scale : scale.x;
  const sy = typeof scale === 'number' ? scale : scale.y;
  const sz = typeof scale === 'number' ? scale : scale.z;

  const scaleMatrix = [
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1
  ];

  const newTransform = multiplyMatrices(node.transform, scaleMatrix);
  nodesStore.update(nodeId, { transform: newTransform });

  return { success: true, value: undefined };
}

/**
 * Multiply two 4x4 matrices
 */
function multiplyMatrices(a: number[], b: number[]): number[] {
  const result = new Array(16).fill(0);
  
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      for (let k = 0; k < 4; k++) {
        result[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col];
      }
    }
  }
  
  return result;
}

/**
 * ============================================================================
 * FEATURE OPERATIONS
 * ============================================================================
 */

/**
 * Create an extrude feature from a sketch
 */
export async function createExtrude(
  params: ExtrudeParams,
  name?: string
): Promise<Result<CADExtrude>> {
  const sketch = nodesStore.get(params.sketchId);
  if (!sketch || sketch.type !== 'sketch') {
    return { success: false, error: 'Sketch not found' };
  }

  const node: CADExtrude = {
    id: generateId(),
    name: name ?? 'Extrude',
    type: 'extrude',
    visible: true,
    locked: false,
    parentId: null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params
  };

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * Create a revolve feature from a sketch
 */
export async function createRevolve(
  params: RevolveParams,
  name?: string
): Promise<Result<CADRevolve>> {
  const sketch = nodesStore.get(params.sketchId);
  if (!sketch || sketch.type !== 'sketch') {
    return { success: false, error: 'Sketch not found' };
  }

  const node: CADRevolve = {
    id: generateId(),
    name: name ?? 'Revolve',
    type: 'revolve',
    visible: true,
    locked: false,
    parentId: null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    params
  };

  nodesStore.add(node);
  await geometryComputer.compute(node.id);
  selectionStore.set([{ type: 'model', modelId: node.id }]);

  return { success: true, value: node };
}

/**
 * ============================================================================
 * SKETCH OPERATIONS
 * ============================================================================
 */

/**
 * Create a new sketch on a plane
 */
export function createSketch(planeId: string, name?: string): Result<CADSketch> {
  const doc = documentStore;
  
  const node: CADSketch = {
    id: generateId(),
    name: name ?? 'Sketch',
    type: 'sketch',
    visible: true,
    locked: false,
    parentId: null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {},
    planeId,
    entities: [],
    constraints: [],
    fullyConstrained: false,
    profiles: []
  };

  nodesStore.add(node);
  
  return { success: true, value: node };
}

/**
 * Update sketch with new entities and profiles
 */
export function updateSketch(
  sketchId: string,
  sketcher: Sketcher,
  planeId: string
): Result<void> {
  const exportData = sketcher.exportToNode(planeId);
  
  nodesStore.update(sketchId, {
    entities: exportData.entities,
    constraints: exportData.constraints,
    fullyConstrained: exportData.fullyConstrained,
    profiles: exportData.profiles
  });

  return { success: true, value: undefined };
}

/**
 * ============================================================================
 * GROUP OPERATIONS
 * ============================================================================
 */

/**
 * Create a group node
 */
export function createGroup(name?: string, childIds: string[] = []): Result<CADGroup> {
  const node: CADGroup = {
    id: generateId(),
    name: name ?? 'Group',
    type: 'group',
    visible: true,
    locked: false,
    parentId: null,
    childIds: [],
    transform: identityMatrix(),
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata: {}
  };

  nodesStore.add(node);

  // Move children to group
  for (const childId of childIds) {
    nodesStore.setParent(childId, node.id);
  }

  return { success: true, value: node };
}

/**
 * ============================================================================
 * NODE MANAGEMENT
 * ============================================================================
 */

/**
 * Delete a node
 */
export function deleteNode(nodeId: string): Result<void> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }
  if (node.locked) {
    return { success: false, error: 'Node is locked' };
  }

  nodesStore.delete(nodeId);
  selectionStore.clear();

  return { success: true, value: undefined };
}

/**
 * Duplicate a node
 */
export async function duplicateNode(nodeId: string): Promise<Result<CADNode>> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }

  const newNode: CADNode = {
    ...JSON.parse(JSON.stringify(node)),
    id: generateId(),
    name: `${node.name} (copy)`,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };

  // Offset the duplicate
  newNode.transform[12] += 10;

  nodesStore.add(newNode);
  await geometryComputer.compute(newNode.id);
  selectionStore.set([{ type: 'model', modelId: newNode.id }]);

  return { success: true, value: newNode };
}

/**
 * Rename a node
 */
export function renameNode(nodeId: string, name: string): Result<void> {
  nodesStore.update(nodeId, { name });
  return { success: true, value: undefined };
}

/**
 * Toggle node visibility
 */
export function toggleVisibility(nodeId: string): Result<void> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }
  nodesStore.update(nodeId, { visible: !node.visible });
  return { success: true, value: undefined };
}

/**
 * Toggle node lock
 */
export function toggleLock(nodeId: string): Result<void> {
  const node = nodesStore.get(nodeId);
  if (!node) {
    return { success: false, error: 'Node not found' };
  }
  nodesStore.update(nodeId, { locked: !node.locked });
  return { success: true, value: undefined };
}
