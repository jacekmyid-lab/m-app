<!--
  ============================================================================
  TOOLBAR COMPONENT
  ============================================================================
  
  Main application toolbar with tool selection and common actions.
  Organized into groups:
  - File operations
  - Selection modes
  - Primitive creation
  - Boolean operations
  - Transform tools
  - View controls
  
  @component Toolbar.svelte
-->
<script lang="ts">
  import { 
    toolStore, 
    selectionModeStore, 
    documentStore,
    viewportStore,
    sketchEditStore 
  } from '$lib/stores/cadStore';
  import { 
    createBox, 
    createSphere, 
    createCylinder, 
    createCone, 
    createTorus,
    performBoolean,
    createSketch
  } from '$lib/tools/CADOperations';
  import type { ToolType, SelectionMode } from '$lib/core/types';

  // Current states
  let activeTool = $derived($toolStore.activeTool);
  let selectionMode = $derived($selectionModeStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);

  /**
   * Set active tool
   */
  function setTool(tool: ToolType): void {
    toolStore.setTool(tool);
  }

  /**
   * Set selection mode
   */
  function setSelectionMode(mode: SelectionMode): void {
    selectionModeStore.set(mode);
  }

  /**
   * Create primitive with default parameters
   */
  async function createPrimitive(type: string): Promise<void> {
    console.log('[Toolbar] Creating primitive:', type);
    try {
      switch (type) {
        case 'box':
          const boxResult = await createBox({ width: 20, height: 20, depth: 20, center: true });
          console.log('[Toolbar] Box result:', boxResult);
          break;
        case 'sphere':
          const sphereResult = await createSphere({ radius: 10, circularSegments: 32 });
          console.log('[Toolbar] Sphere result:', sphereResult);
          break;
        case 'cylinder':
          const cylResult = await createCylinder({ radius: 10, height: 20, circularSegments: 32, center: true });
          console.log('[Toolbar] Cylinder result:', cylResult);
          break;
        case 'cone':
          const coneResult = await createCone({ bottomRadius: 10, topRadius: 0, height: 20, circularSegments: 32, center: true });
          console.log('[Toolbar] Cone result:', coneResult);
          break;
        case 'torus':
          const torusResult = await createTorus({ majorRadius: 15, minorRadius: 5, majorSegments: 32, minorSegments: 16 });
          console.log('[Toolbar] Torus result:', torusResult);
          break;
      }
    } catch (error) {
      console.error('[Toolbar] Error creating primitive:', error);
    }
  }

  /**
   * Toggle viewport setting
   */
  function toggleViewportSetting(setting: 'showGrid' | 'showAxes' | 'showOrigin'): void {
    viewportStore.toggle(setting);
  }

  /**
   * Enter sketch mode on active plane
   */
  function enterSketchMode(): void {
    const doc = $documentStore;
    if (doc.activePlaneId) {
      const result = createSketch(doc.activePlaneId);
      if (result.success) {
        sketchEditStore.enter(result.value.id, doc.activePlaneId);
      }
    }
  }

  /**
   * Exit sketch mode
   */
  function exitSketchMode(): void {
    sketchEditStore.exit();
  }

  /**
   * Set pivot mode - select element to set as pivot point
   */
  function setPivotMode(): void {
    // When in vertex/edge/face mode, selection will be used as pivot
    // For now, just switch to vertex mode
    selectionModeStore.set('vertex');
    // TODO: Implement actual pivot setting workflow
  }
</script>

<header class="cad-toolbar">
  <!-- Logo / App Name -->
  <div class="toolbar-logo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
      <path d="M7 12L10 9L13 12L16 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="12" cy="15" r="2" stroke="currentColor" stroke-width="1.5"/>
    </svg>
    <span>Manifold CAD</span>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Selection Mode Group -->
  <div class="cad-btn-group" title="Selection Mode">
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'model'}
      onclick={() => setSelectionMode('model')}
      title="Select Models (M)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'face'}
      onclick={() => setSelectionMode('face')}
      title="Select Faces (F)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 4L8 2L14 4V12L8 14L2 12V4Z" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 2V14" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'edge'}
      onclick={() => setSelectionMode('edge')}
      title="Select Edges (E)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="2"/>
        <circle cx="3" cy="13" r="1.5" fill="currentColor"/>
        <circle cx="13" cy="3" r="1.5" fill="currentColor"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={selectionMode === 'vertex'}
      onclick={() => setSelectionMode('vertex')}
      title="Select Vertices (V)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" fill="currentColor"/>
        <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Primitives Group -->
  <div class="cad-btn-group" title="Create Primitives">
    <button
      class="cad-btn-icon"
      onclick={() => createPrimitive('box')}
      title="Create Box (B)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 5L8 2L14 5V11L8 14L2 11V5Z" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2 5L8 8M8 8L14 5M8 8V14" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      onclick={() => createPrimitive('sphere')}
      title="Create Sphere"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/>
        <ellipse cx="8" cy="8" rx="6" ry="2" stroke="currentColor" stroke-width="1" opacity="0.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      onclick={() => createPrimitive('cylinder')}
      title="Create Cylinder"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="4" rx="5" ry="2" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 4V12C3 13.1 5.24 14 8 14C10.76 14 13 13.1 13 12V4" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      onclick={() => createPrimitive('cone')}
      title="Create Cone"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2L3 12C3 13.1 5.24 14 8 14C10.76 14 13 13.1 13 12L8 2Z" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      onclick={() => createPrimitive('torus')}
      title="Create Torus"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="6" ry="3" stroke="currentColor" stroke-width="1.5"/>
        <ellipse cx="8" cy="8" rx="2" ry="1" stroke="currentColor" stroke-width="1"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Boolean Operations -->
  <div class="cad-btn-group" title="Boolean Operations">
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'union'}
      onclick={() => setTool('union')}
      title="Union (U)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'difference'}
      onclick={() => setTool('difference')}
      title="Difference (D)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'intersection'}
      onclick={() => setTool('intersection')}
      title="Intersection (I)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="8" r="4" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
        <circle cx="10" cy="8" r="4" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
        <path d="M8 5.5C9 6.5 9 9.5 8 10.5C7 9.5 7 6.5 8 5.5Z" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- Feature Operations -->
  <div class="cad-btn-group" title="Feature Operations">
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'extrude'}
      onclick={() => setTool('extrude')}
      title="Extrude (X)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="10" width="10" height="4" stroke="currentColor" stroke-width="1.5"/>
        <path d="M3 10V6L8 3L13 6V10" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 3V7" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'revolve'}
      onclick={() => setTool('revolve')}
      title="Revolve"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="10" rx="6" ry="3" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 3V7" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2 10V5" stroke="currentColor" stroke-width="1" stroke-dasharray="1 1"/>
        <circle cx="8" cy="3" r="1" fill="currentColor"/>
      </svg>
    </button>
  </div>

  <!-- Sketch Tools -->
  {#if isSketchMode}
    <div class="cad-btn-group sketch-tools" title="Sketch Tools">
      <button
        class="cad-btn-icon"
        class:active={activeTool === 'sketch-line'}
        onclick={() => setTool('sketch-line')}
        title="Line (L)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button
        class="cad-btn-icon"
        class:active={activeTool === 'sketch-rectangle'}
        onclick={() => setTool('sketch-rectangle')}
        title="Rectangle (R)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="4" width="10" height="8" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button
        class="cad-btn-icon"
        class:active={activeTool === 'sketch-circle'}
        onclick={() => setTool('sketch-circle')}
        title="Circle (C)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      </button>
      <button
        class="cad-btn-icon"
        class:active={activeTool === 'sketch-arc'}
        onclick={() => setTool('sketch-arc')}
        title="Arc (A)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 13A7 7 0 0 1 13 3" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
      <button
        class="cad-btn-icon"
        class:active={activeTool === 'sketch-spline'}
        onclick={() => setTool('sketch-spline')}
        title="Spline (S)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 12C5 12 6 4 8 4C10 4 11 12 13 12" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </svg>
      </button>
    </div>
    
    <button class="cad-btn exit-sketch" onclick={exitSketchMode}>
      Exit Sketch
    </button>
  {:else}
    <button 
      class="cad-btn"
      onclick={enterSketchMode}
      title="Create Sketch on Active Plane"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right: 4px;">
        <rect x="2" y="2" width="12" height="12" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M5 8H11M8 5V11" stroke="currentColor" stroke-width="1.5"/>
      </svg>
      New Sketch
    </button>
  {/if}

  <!-- Spacer -->
  <div class="toolbar-spacer"></div>

  <!-- Transform Tools -->
  <div class="cad-btn-group" title="Transform Tools">
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'move'}
      onclick={() => setTool('move')}
      title="Move (G)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2V14M2 8H14" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 2L6 4M8 2L10 4M8 14L6 12M8 14L10 12" stroke="currentColor" stroke-width="1.5"/>
        <path d="M2 8L4 6M2 8L4 10M14 8L12 6M14 8L12 10" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'rotate'}
      onclick={() => setTool('rotate')}
      title="Rotate (R)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 2L6 4M8 2L10 4" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={activeTool === 'scale'}
      onclick={() => setTool('scale')}
      title="Scale (S)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3" y="3" width="6" height="6" stroke="currentColor" stroke-width="1.5"/>
        <rect x="7" y="7" width="6" height="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      onclick={() => setPivotMode()}
      title="Set Pivot Point (P)"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/>
        <line x1="8" y1="2" x2="8" y2="5" stroke="currentColor" stroke-width="1"/>
        <line x1="8" y1="11" x2="8" y2="14" stroke="currentColor" stroke-width="1"/>
        <line x1="2" y1="8" x2="5" y2="8" stroke="currentColor" stroke-width="1"/>
        <line x1="11" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="1"/>
      </svg>
    </button>
  </div>

  <div class="toolbar-separator"></div>

  <!-- View Controls -->
  <div class="cad-btn-group" title="View Controls">
    <button
      class="cad-btn-icon"
      class:active={$viewportStore.showGrid}
      onclick={() => toggleViewportSetting('showGrid')}
      title="Toggle Grid"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 2H14V14H2V2Z" stroke="currentColor" stroke-width="1"/>
        <path d="M2 6H14M2 10H14M6 2V14M10 2V14" stroke="currentColor" stroke-width="0.5" opacity="0.5"/>
      </svg>
    </button>
    <button
      class="cad-btn-icon"
      class:active={$viewportStore.showAxes}
      onclick={() => toggleViewportSetting('showAxes')}
      title="Toggle Axes"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <line x1="8" y1="14" x2="8" y2="4" stroke="#22c55e" stroke-width="1.5"/>
        <line x1="8" y1="8" x2="14" y2="8" stroke="#ef4444" stroke-width="1.5"/>
        <line x1="8" y1="8" x2="4" y2="12" stroke="#3b82f6" stroke-width="1.5"/>
      </svg>
    </button>
  </div>
</header>

<style>
  .toolbar-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--cad-primary-light);
    font-weight: 600;
    font-size: 14px;
    padding-right: 12px;
  }

  .toolbar-separator {
    width: 1px;
    height: 24px;
    background-color: var(--cad-border);
    margin: 0 8px;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .sketch-tools {
    background-color: rgba(6, 182, 212, 0.1);
    border: 1px solid var(--cad-sketch-line);
  }

  .exit-sketch {
    background-color: var(--cad-sketch-line) !important;
    border-color: var(--cad-sketch-line) !important;
    color: white !important;
    margin-left: 8px;
  }

  .exit-sketch:hover {
    background-color: #0891b2 !important;
  }
</style>
