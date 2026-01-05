/**
 * ============================================================================
 * CAD DOCUMENT STORE
 * ============================================================================
 * 
 * Centralized state management for the CAD application using Svelte stores.
 * This module manages:
 * 
 * - Document state (nodes, planes, history)
 * - Selection state
 * - Tool state
 * - Viewport configuration
 * - Computed geometry cache
 * 
 * Design Principles:
 * 1. Single source of truth for all application state
 * 2. Reactive updates via Svelte stores
 * 3. Immutable updates for history/undo support
 * 4. Event-based communication between modules
 * 
 * @module stores/cadStore
 */

import { writable, derived, get, type Writable, type Readable } from 'svelte/store';
import type {
  CADDocument,
  CADNode,
  CADNodeType,
  CADPrimitive,
  CADBoolean,
  CADSketch,
  CADExtrude,
  CADRevolve,
  CADGroup,
  Plane,
  PlaneSource,
  Selection,
  SelectionMode,
  HoverState,
  ToolType,
  ToolState,
  ViewportConfig,
  ComputedGeometry,
  Point3D,
  CADEvent,
  CADEventHandler
} from '../core/types';

// ============================================================================
// INITIAL STATE DEFINITIONS
// ============================================================================

/**
 * Default reference planes (XY, XZ, YZ)
 */
const createDefaultPlanes = (): Map<string, Plane> => {
  const planes = new Map<string, Plane>();

  // XY Plane (Front view)
  planes.set('plane-xy', {
    id: 'plane-xy',
    name: 'XY Plane',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 1, z: 0 },
    isReference: true,
    source: { type: 'reference', axis: 'XY' }
  });

  // XZ Plane (Top view)
  planes.set('plane-xz', {
    id: 'plane-xz',
    name: 'XZ Plane',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    xAxis: { x: 1, y: 0, z: 0 },
    yAxis: { x: 0, y: 0, z: 1 },
    isReference: true,
    source: { type: 'reference', axis: 'XZ' }
  });

  // YZ Plane (Right view)
  planes.set('plane-yz', {
    id: 'plane-yz',
    name: 'YZ Plane',
    origin: { x: 0, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    xAxis: { x: 0, y: 1, z: 0 },
    yAxis: { x: 0, y: 0, z: 1 },
    isReference: true,
    source: { type: 'reference', axis: 'YZ' }
  });

  return planes;
};

/**
 * Default viewport configuration
 */
const DEFAULT_VIEWPORT_CONFIG: ViewportConfig = {
  projection: 'perspective',
  showGrid: true,
  showAxes: true,
  showOrigin: true,
  backgroundColor: '#0f172a',
  gridSize: 100,
  gridDivisions: 10,
  edgeDisplay: 'sharp',
  renderMode: 'shaded'
};

/**
 * Initial tool state
 */
const INITIAL_TOOL_STATE: ToolState = {
  activeTool: 'select',
  data: {},
  isActive: false,
  step: 0
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create identity matrix (16 elements)
 */
export function identityMatrix(): number[] {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

// ============================================================================
// STORE DEFINITIONS
// ============================================================================

/**
 * Main document store
 */
function createDocumentStore() {
  const initialDocument: CADDocument = {
    version: '1.0.0',
    name: 'Untitled',
    nodes: new Map(),
    rootIds: [],
    planes: createDefaultPlanes(),
    activePlaneId: 'plane-xy',
    units: 'mm',
    history: [],
    historyPosition: -1
  };

  const { subscribe, set, update } = writable<CADDocument>(initialDocument);

  return {
    subscribe,
    set,
    update,

    /**
     * Reset document to empty state
     */
    reset: () => {
      set({
        ...initialDocument,
        nodes: new Map(),
        rootIds: [],
        planes: createDefaultPlanes(),
        history: [],
        historyPosition: -1
      });
    },

    /**
     * Set document name
     */
    setName: (name: string) => {
      update(doc => ({ ...doc, name }));
    },

    /**
     * Set active plane
     */
    setActivePlane: (planeId: string) => {
      update(doc => ({ ...doc, activePlaneId: planeId }));
    }
  };
}

/**
 * Nodes store (derived from document for convenience)
 */
function createNodesStore(documentStore: ReturnType<typeof createDocumentStore>) {
  const { subscribe } = derived(documentStore, $doc => $doc.nodes);

  return {
    subscribe,

    /**
     * Add a new node
     */
    add: (node: CADNode) => {
      documentStore.update(doc => {
        const newNodes = new Map(doc.nodes);
        newNodes.set(node.id, node);

        // Add to root if no parent
        const newRootIds = node.parentId === null
          ? [...doc.rootIds, node.id]
          : doc.rootIds;

        // Add to parent's children if parent exists
        if (node.parentId && newNodes.has(node.parentId)) {
          const parent = newNodes.get(node.parentId)!;
          newNodes.set(node.parentId, {
            ...parent,
            childIds: [...parent.childIds, node.id]
          });
        }

        return {
          ...doc,
          nodes: newNodes,
          rootIds: newRootIds
        };
      });

      // Emit event
      emitEvent({ type: 'node-created', nodeId: node.id });
    },

    /**
     * Update an existing node
     */
    update: (nodeId: string, updates: Partial<CADNode>) => {
      documentStore.update(doc => {
        const node = doc.nodes.get(nodeId);
        if (!node) return doc;

        const newNodes = new Map(doc.nodes);
        newNodes.set(nodeId, {
          ...node,
          ...updates,
          modifiedAt: Date.now()
        } as CADNode);

        return { ...doc, nodes: newNodes };
      });

      emitEvent({ type: 'node-updated', nodeId });
    },

    /**
     * Delete a node and its children
     */
    delete: (nodeId: string) => {
      documentStore.update(doc => {
        const node = doc.nodes.get(nodeId);
        if (!node) return doc;

        const newNodes = new Map(doc.nodes);
        
        // Recursively collect all nodes to delete
        const nodesToDelete: string[] = [];
        const collectNodes = (id: string) => {
          const n = newNodes.get(id);
          if (n) {
            nodesToDelete.push(id);
            n.childIds.forEach(collectNodes);
          }
        };
        collectNodes(nodeId);

        // Delete all collected nodes
        nodesToDelete.forEach(id => newNodes.delete(id));

        // Remove from parent's children
        if (node.parentId && newNodes.has(node.parentId)) {
          const parent = newNodes.get(node.parentId)!;
          newNodes.set(node.parentId, {
            ...parent,
            childIds: parent.childIds.filter(id => id !== nodeId)
          });
        }

        // Remove from root if applicable
        const newRootIds = doc.rootIds.filter(id => id !== nodeId);

        return {
          ...doc,
          nodes: newNodes,
          rootIds: newRootIds
        };
      });

      emitEvent({ type: 'node-deleted', nodeId });
    },

    /**
     * Get a node by ID
     */
    get: (nodeId: string): CADNode | undefined => {
      return get(documentStore).nodes.get(nodeId);
    },

    /**
     * Move a node to a new parent
     */
    setParent: (nodeId: string, newParentId: string | null) => {
      documentStore.update(doc => {
        const node = doc.nodes.get(nodeId);
        if (!node) return doc;

        const newNodes = new Map(doc.nodes);
        let newRootIds = [...doc.rootIds];

        // Remove from old parent
        if (node.parentId && newNodes.has(node.parentId)) {
          const oldParent = newNodes.get(node.parentId)!;
          newNodes.set(node.parentId, {
            ...oldParent,
            childIds: oldParent.childIds.filter(id => id !== nodeId)
          });
        } else {
          // Was in root
          newRootIds = newRootIds.filter(id => id !== nodeId);
        }

        // Add to new parent
        if (newParentId && newNodes.has(newParentId)) {
          const newParent = newNodes.get(newParentId)!;
          newNodes.set(newParentId, {
            ...newParent,
            childIds: [...newParent.childIds, nodeId]
          });
        } else if (newParentId === null) {
          newRootIds.push(nodeId);
        }

        // Update node's parent reference
        newNodes.set(nodeId, {
          ...node,
          parentId: newParentId,
          modifiedAt: Date.now()
        });

        return {
          ...doc,
          nodes: newNodes,
          rootIds: newRootIds
        };
      });
    }
  };
}

/**
 * Planes store
 */
function createPlanesStore(documentStore: ReturnType<typeof createDocumentStore>) {
  const { subscribe } = derived(documentStore, $doc => $doc.planes);

  return {
    subscribe,

    /**
     * Add a new plane
     */
    add: (plane: Plane) => {
      documentStore.update(doc => {
        const newPlanes = new Map(doc.planes);
        newPlanes.set(plane.id, plane);
        return { ...doc, planes: newPlanes };
      });

      emitEvent({ type: 'plane-created', planeId: plane.id });
    },

    /**
     * Get a plane by ID
     */
    get: (planeId: string): Plane | undefined => {
      return get(documentStore).planes.get(planeId);
    },

    /**
     * Delete a plane (cannot delete reference planes)
     */
    delete: (planeId: string) => {
      documentStore.update(doc => {
        const plane = doc.planes.get(planeId);
        if (!plane || plane.isReference) return doc;

        const newPlanes = new Map(doc.planes);
        newPlanes.delete(planeId);

        return { ...doc, planes: newPlanes };
      });
    }
  };
}

/**
 * Selection store
 */
function createSelectionStore() {
  const store = writable<Selection[]>([]);

  return {
    subscribe: store.subscribe,

    /**
     * Set selection
     */
    set: (selections: Selection[]) => {
      store.set(selections);
      emitEvent({ type: 'selection-changed', selection: selections });
    },

    /**
     * Add to selection
     */
    add: (selection: Selection) => {
      store.update(current => {
        const exists = current.some(
          s => s.type === selection.type &&
               s.modelId === selection.modelId &&
               s.elementIndex === selection.elementIndex
        );
        if (exists) return current;
        const newSelection = [...current, selection];
        emitEvent({ type: 'selection-changed', selection: newSelection });
        return newSelection;
      });
    },

    /**
     * Remove from selection
     */
    remove: (modelId: string, elementIndex?: number) => {
      store.update(current => {
        const newSelection = current.filter(
          s => !(s.modelId === modelId &&
                (elementIndex === undefined || s.elementIndex === elementIndex))
        );
        emitEvent({ type: 'selection-changed', selection: newSelection });
        return newSelection;
      });
    },

    /**
     * Clear selection
     */
    clear: () => {
      store.set([]);
      emitEvent({ type: 'selection-changed', selection: [] });
    },

    /**
     * Get current selection
     */
    get: () => get(store)
  };
}

/**
 * Hover store
 */
function createHoverStore() {
  return writable<HoverState | null>(null);
}

/**
 * Selection mode store
 */
function createSelectionModeStore() {
  return writable<SelectionMode>('model');
}

/**
 * Tool state store
 */
function createToolStore() {
  const store = writable<ToolState>(INITIAL_TOOL_STATE);

  return {
    subscribe: store.subscribe,

    /**
     * Set active tool
     */
    setTool: (tool: ToolType) => {
      store.update(state => ({
        ...state,
        activeTool: tool,
        data: {},
        isActive: false,
        step: 0
      }));
      emitEvent({ type: 'tool-changed', tool });
    },

    /**
     * Update tool data
     */
    updateData: (data: Record<string, unknown>) => {
      store.update(state => ({
        ...state,
        data: { ...state.data, ...data }
      }));
    },

    /**
     * Set tool active state
     */
    setActive: (isActive: boolean) => {
      store.update(state => ({ ...state, isActive }));
    },

    /**
     * Advance to next step
     */
    nextStep: () => {
      store.update(state => ({ ...state, step: state.step + 1 }));
    },

    /**
     * Reset tool state
     */
    reset: () => {
      store.update(state => ({
        ...state,
        data: {},
        isActive: false,
        step: 0
      }));
    },

    /**
     * Get current state
     */
    get: () => get(store)
  };
}

/**
 * Viewport configuration store
 */
function createViewportStore() {
  const store = writable<ViewportConfig>(DEFAULT_VIEWPORT_CONFIG);

  return {
    subscribe: store.subscribe,

    /**
     * Update viewport configuration
     */
    update: (config: Partial<ViewportConfig>) => {
      store.update(current => ({ ...current, ...config }));
    },

    /**
     * Toggle a boolean setting
     */
    toggle: (key: keyof ViewportConfig) => {
      store.update(current => {
        const value = current[key];
        if (typeof value === 'boolean') {
          return { ...current, [key]: !value };
        }
        return current;
      });
    },

    /**
     * Get current config
     */
    get: () => get(store)
  };
}

/**
 * Computed geometry cache store
 */
function createGeometryCacheStore() {
  const store = writable<Map<string, ComputedGeometry>>(new Map());

  return {
    subscribe: store.subscribe,

    /**
     * Set computed geometry for a node
     */
    set: (nodeId: string, geometry: ComputedGeometry) => {
      store.update(cache => {
        const newCache = new Map(cache);
        newCache.set(nodeId, geometry);
        return newCache;
      });
      emitEvent({ type: 'geometry-computed', nodeId });
    },

    /**
     * Get computed geometry
     */
    get: (nodeId: string): ComputedGeometry | undefined => {
      return get(store).get(nodeId);
    },

    /**
     * Mark geometry as dirty (needs recomputation)
     */
    markDirty: (nodeId: string) => {
      store.update(cache => {
        const geometry = cache.get(nodeId);
        if (geometry) {
          const newCache = new Map(cache);
          newCache.set(nodeId, { ...geometry, dirty: true });
          return newCache;
        }
        return cache;
      });
    },

    /**
     * Remove geometry from cache
     */
    remove: (nodeId: string) => {
      store.update(cache => {
        const newCache = new Map(cache);
        newCache.delete(nodeId);
        return newCache;
      });
    },

    /**
     * Clear entire cache
     */
    clear: () => {
      store.set(new Map());
    }
  };
}

/**
 * Sketch editing state store
 */
function createSketchEditStore() {
  interface SketchEditState {
    isEditing: boolean;
    sketchId: string | null;
    planeId: string | null;
  }

  const store = writable<SketchEditState>({
    isEditing: false,
    sketchId: null,
    planeId: null
  });

  return {
    subscribe: store.subscribe,

    /**
     * Enter sketch editing mode
     */
    enter: (sketchId: string, planeId: string) => {
      store.set({
        isEditing: true,
        sketchId,
        planeId
      });
      emitEvent({ type: 'sketch-entered', sketchId });
    },

    /**
     * Exit sketch editing mode
     */
    exit: () => {
      const state = get(store);
      if (state.sketchId) {
        emitEvent({ type: 'sketch-exited', sketchId: state.sketchId });
      }
      store.set({
        isEditing: false,
        sketchId: null,
        planeId: null
      });
    },

    /**
     * Get current state
     */
    get: () => get(store)
  };
}

// ============================================================================
// EVENT SYSTEM
// ============================================================================

const eventHandlers: CADEventHandler[] = [];

/**
 * Subscribe to CAD events
 */
export function onCADEvent(handler: CADEventHandler): () => void {
  eventHandlers.push(handler);
  return () => {
    const index = eventHandlers.indexOf(handler);
    if (index >= 0) {
      eventHandlers.splice(index, 1);
    }
  };
}

/**
 * Emit a CAD event
 */
function emitEvent(event: CADEvent): void {
  eventHandlers.forEach(handler => {
    try {
      handler(event);
    } catch (error) {
      console.error('[CADStore] Event handler error:', error);
    }
  });
}

// ============================================================================
// STORE INSTANCES
// ============================================================================

export const documentStore = createDocumentStore();
export const nodesStore = createNodesStore(documentStore);
export const planesStore = createPlanesStore(documentStore);
export const selectionStore = createSelectionStore();
export const hoverStore = createHoverStore();
export const selectionModeStore = createSelectionModeStore();
export const toolStore = createToolStore();
export const viewportStore = createViewportStore();
export const geometryCacheStore = createGeometryCacheStore();
export const sketchEditStore = createSketchEditStore();

/**
 * Store for CADSolid objects (3D topology representations)
 */
export const solidStore = writable<Map<string, any>>(new Map());

/**
 * Currently active (selected) model ID for topology operations
 * Must activate a model before selecting faces/edges/vertices within it
 */
export const activeModelStore = writable<string | null>(null);

/**
 * Pivot update trigger - increment to signal pivot changed
 */
export const pivotUpdateStore = writable<number>(0);

export function triggerPivotUpdate() {
  pivotUpdateStore.update(n => n + 1);
}

// ============================================================================
// DERIVED STORES
// ============================================================================

/**
 * Currently selected nodes
 */
export const selectedNodes: Readable<CADNode[]> = derived(
  [selectionStore, documentStore],
  ([$selection, $doc]) => {
    const modelSelections = $selection.filter(s => s.type === 'model');
    return modelSelections
      .map(s => $doc.nodes.get(s.modelId))
      .filter((node): node is CADNode => node !== undefined);
  }
);

/**
 * Active plane
 */
export const activePlane: Readable<Plane | null> = derived(
  documentStore,
  $doc => $doc.activePlaneId ? $doc.planes.get($doc.activePlaneId) ?? null : null
);

/**
 * Root nodes for tree display
 */
export const rootNodes: Readable<CADNode[]> = derived(
  documentStore,
  $doc => $doc.rootIds
    .map(id => $doc.nodes.get(id))
    .filter((node): node is CADNode => node !== undefined)
);

/**
 * Is sketch mode active
 */
export const isSketchMode: Readable<boolean> = derived(
  sketchEditStore,
  $state => $state.isEditing
);
