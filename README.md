# M-app

A professional-grade CAD application built with modern web technologies, featuring a powerful geometry kernel based on Manifold-3D.

## 🎯 Overview

Manifold CAD is a browser-based parametric CAD application that provides:

- **Solid Modeling**: Create and manipulate 3D solids using CSG (Constructive Solid Geometry)
- **Precise Selection**: BVH-accelerated selection of vertices, edges, and faces
- **2D Sketching**: Full-featured sketch environment with constraint support
- **Feature-Based Design**: Extrude, revolve, and boolean operations
- **Real-time Visualization**: High-performance 3D rendering with Three.js

## 🏗️ Architecture

```
src/
├── lib/
│   ├── core/
│   │   └── types.ts              # TypeScript type definitions
│   ├── geometry/
│   │   ├── ManifoldEngine.ts     # Manifold-3D wrapper
│   │   ├── BVHSelectionSystem.ts # three-mesh-bvh selection
│   │   └── GeometryComputer.ts   # Geometry computation pipeline
│   ├── sketcher/
│   │   └── Sketcher.ts           # 2D sketch functionality
│   ├── stores/
│   │   └── cadStore.ts           # Svelte stores (state management)
│   ├── tools/
│   │   ├── CADOperations.ts      # High-level CAD operations
│   │   └── PlaneManager.ts       # Work plane management
│   ├── ui/
│   │   ├── Toolbar.svelte        # Main toolbar
│   │   ├── LeftPanel.svelte      # Tree view & tools
│   │   ├── RightPanel.svelte     # Properties panel
│   │   └── StatusBar.svelte      # Status information
│   └── viewport/
│       └── Viewport.svelte       # 3D viewport with Threlte
├── routes/
│   ├── +layout.svelte            # App layout
│   └── +page.svelte              # Main page
└── app.css                       # Global styles
```

## 🔧 Technology Stack

| Technology | Purpose |
|------------|---------|
| **Svelte 5** | Reactive UI framework with runes |
| **SvelteKit** | Application framework |
| **Threlte** | Three.js integration for Svelte |
| **Three.js** | 3D graphics library |
| **Manifold-3D** | Geometry kernel for CSG operations |
| **three-mesh-bvh** | Accelerated raycasting and selection |
| **Tailwind CSS v4** | Utility-first styling |
| **Monaco Editor** | Code editor (for advanced scripting) |

## 📦 Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🎮 Usage

### Selection Modes

| Key | Mode | Description |
|-----|------|-------------|
| `M` | Model | Select entire models |
| `F` | Face | Select individual faces |
| `E` | Edge | Select edges |
| `V` | Vertex | Select vertices |

### Creating Primitives

Use the toolbar or keyboard shortcuts:
- **Box**: Click box icon or press `B`
- **Sphere**: Click sphere icon
- **Cylinder**: Click cylinder icon
- **Cone**: Click cone icon
- **Torus**: Click torus icon

### Boolean Operations

1. Select two or more models
2. Choose operation: Union (∪), Difference (−), or Intersection (∩)
3. The result replaces the original models

### Sketching

1. Select a work plane (XY, XZ, YZ, or custom)
2. Click "New Sketch" to enter sketch mode
3. Use sketch tools: Line, Rectangle, Circle, Arc, Spline
4. Exit sketch mode and apply Extrude or Revolve

### Plane Creation

- **3-Point Plane**: Define a plane by selecting 3 points
- **Offset Plane**: Create a plane parallel to an existing plane
- **Face Plane**: Create a plane on a model face

## 🏛️ Core Concepts

### CAD Nodes

All geometry in the application is represented as CAD nodes:

```typescript
interface CADNodeBase {
  id: string;           // Unique identifier
  name: string;         // Display name
  type: CADNodeType;    // Node type (box, sphere, union, etc.)
  visible: boolean;     // Visibility state
  locked: boolean;      // Lock state
  parentId: string | null;  // Parent node
  childIds: string[];   // Child nodes
  transform: number[];  // 4x4 transformation matrix
}
```

### Manifold Integration

The application uses Manifold-3D as its geometry kernel:

```typescript
// Creating a box
const box = manifoldEngine.createBox({
  width: 20,
  height: 20,
  depth: 20,
  center: true
});

// Boolean operations
const result = manifoldEngine.difference(boxA, boxB);
```

### BVH Selection System

Precise selection using Bounding Volume Hierarchies:

```typescript
// Register mesh for selection
bvhSelectionSystem.registerMesh(modelId, mesh);

// Update hover state
const hover = bvhSelectionSystem.updateHover(mouseNDC);

// Perform selection
const selection = bvhSelectionSystem.select(shiftKey);
```

### Sketcher

2D sketch creation with automatic profile detection:

```typescript
const sketcher = createSketcher(sketchId, plane);

// Add entities
sketcher.addEntity(SketchEntityFactory.line(
  { x: 0, y: 0 },
  { x: 10, y: 0 }
));

// Detect closed profiles
const profiles = sketcher.detectProfiles();
```

## 🎨 Styling

The application uses a dark theme optimized for CAD work:

```css
:root {
  --cad-primary: #2563eb;      /* Primary blue */
  --cad-hover: #fbbf24;        /* Yellow for hover */
  --cad-selected: #ef4444;     /* Red for selection */
  --cad-bg-dark: #0f172a;      /* Dark background */
  --cad-axis-x: #ef4444;       /* X axis - red */
  --cad-axis-y: #22c55e;       /* Y axis - green */
  --cad-axis-z: #3b82f6;       /* Z axis - blue */
}
```

## 🔌 Extending the Application

### Adding a New Primitive

1. Add type to `core/types.ts`:
```typescript
export interface NewPrimitiveParams {
  // parameters
}
```

2. Add creation method to `ManifoldEngine.ts`:
```typescript
createNewPrimitive(params: NewPrimitiveParams): Result<Manifold> {
  // implementation
}
```

3. Add operation to `CADOperations.ts`:
```typescript
export async function createNewPrimitive(params, name?, parentId?) {
  // implementation
}
```

4. Add UI button to `Toolbar.svelte`

### Adding a New Tool

1. Add tool type to `ToolType` in `types.ts`
2. Implement tool logic in a new file under `tools/`
3. Add UI elements to appropriate panels
4. Register keyboard shortcuts if needed

## 📝 API Reference

### Stores

| Store | Purpose |
|-------|---------|
| `documentStore` | Main document state |
| `nodesStore` | CAD node operations |
| `selectionStore` | Current selection |
| `hoverStore` | Hover state |
| `toolStore` | Active tool |
| `viewportStore` | Viewport settings |
| `geometryCacheStore` | Computed geometry cache |

### Events

Subscribe to CAD events:

```typescript
import { onCADEvent } from '$lib/stores/cadStore';

const unsubscribe = onCADEvent(event => {
  switch (event.type) {
    case 'node-created':
      console.log('New node:', event.nodeId);
      break;
    case 'selection-changed':
      console.log('Selection:', event.selection);
      break;
  }
});
```

## 🚀 Performance Considerations

- **BVH Acceleration**: All mesh selection uses three-mesh-bvh for O(log n) raycasting
- **Geometry Caching**: Computed geometry is cached and only recomputed when dirty
- **Lazy Loading**: Manifold WASM is loaded on-demand
- **Event Batching**: State updates are batched for efficiency

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.
