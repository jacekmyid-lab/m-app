<!--
  ============================================================================
  STATUS BAR COMPONENT
  ============================================================================
  
  Bottom status bar showing current application state
  
  @component StatusBar.svelte
-->
<script lang="ts">
  import { 
    selectionStore, 
    selectionModeStore,
    documentStore,
    toolStore,
    viewportStore,
    hoverStore
  } from '$lib/stores/cadStore';

  // Derived state
  let selectionCount = $derived($selectionStore.length);
  let selectionMode = $derived($selectionModeStore);
  let units = $derived($documentStore.units);
  let currentTool = $derived($toolStore.activeTool);
  let gridEnabled = $derived($viewportStore.showGrid);
  let hover = $derived($hoverStore);

  /**
   * Get selection summary text
   */
  function getSelectionText(): string {
    if (selectionCount === 0) return 'No selection';
    if (selectionCount === 1) {
      const sel = $selectionStore[0];
      return `1 ${sel.type} selected`;
    }
    return `${selectionCount} items selected`;
  }

  /**
   * Get tool display name
   */
  function getToolName(tool: string): string {
    const names: Record<string, string> = {
      'select': 'Select',
      'move': 'Move',
      'rotate': 'Rotate',
      'scale': 'Scale',
      'box': 'Box',
      'sphere': 'Sphere',
      'cylinder': 'Cylinder',
      'cone': 'Cone',
      'torus': 'Torus',
      'union': 'Union',
      'difference': 'Difference',
      'intersection': 'Intersection',
      'sketch-line': 'Sketch: Line',
      'sketch-rectangle': 'Sketch: Rectangle',
      'sketch-circle': 'Sketch: Circle',
      'sketch-arc': 'Sketch: Arc',
      'sketch-spline': 'Sketch: Spline',
      'extrude': 'Extrude',
      'revolve': 'Revolve'
    };
    return names[tool] ?? tool;
  }
</script>

<footer class="cad-statusbar">
  <!-- Selection Info -->
  <div class="status-section">
    <span class="status-label">Selection:</span>
    <span class="status-value">{getSelectionText()}</span>
  </div>

  <div class="status-divider"></div>

  <!-- Selection Mode -->
  <div class="status-section">
    <span class="status-label">Mode:</span>
    <span class="status-value mode-badge" data-mode={selectionMode}>
      {selectionMode}
    </span>
  </div>

  <div class="status-divider"></div>

  <!-- Current Tool -->
  <div class="status-section">
    <span class="status-label">Tool:</span>
    <span class="status-value">{getToolName(currentTool)}</span>
  </div>

  <div class="status-divider"></div>

  <!-- Hover Info -->
  {#if hover}
    <div class="status-section">
      <span class="status-label">Hover:</span>
      <span class="status-value hover-info">
        {hover.type}
        {#if hover.elementIndex !== undefined}
          [{hover.elementIndex}]
        {/if}
      </span>
    </div>
    <div class="status-divider"></div>
  {/if}

  <!-- Spacer -->
  <div class="status-spacer"></div>

  <!-- Grid Status -->
  <div class="status-section">
    <span class="status-indicator" class:active={gridEnabled}>
      Grid: {gridEnabled ? 'ON' : 'OFF'}
    </span>
  </div>

  <div class="status-divider"></div>

  <!-- Units -->
  <div class="status-section">
    <span class="status-label">Units:</span>
    <span class="status-value">{units}</span>
  </div>

  <div class="status-divider"></div>

  <!-- Version -->
  <div class="status-section">
    <span class="status-muted">Manifold CAD v1.0</span>
  </div>
</footer>

<style>
  .status-section {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .status-label {
    color: var(--cad-text-muted);
  }

  .status-value {
    color: var(--cad-text-primary);
  }

  .status-divider {
    width: 1px;
    height: 16px;
    background-color: var(--cad-border);
  }

  .status-spacer {
    flex: 1;
  }

  .mode-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .mode-badge[data-mode="model"] {
    background-color: rgba(59, 130, 246, 0.2);
    color: #3b82f6;
  }

  .mode-badge[data-mode="face"] {
    background-color: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .mode-badge[data-mode="edge"] {
    background-color: rgba(249, 115, 22, 0.2);
    color: #f97316;
  }

  .mode-badge[data-mode="vertex"] {
    background-color: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }

  .hover-info {
    color: var(--cad-hover);
  }

  .status-indicator {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    background-color: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .status-indicator.active {
    background-color: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .status-muted {
    color: var(--cad-text-muted);
    font-size: 10px;
  }
</style>
