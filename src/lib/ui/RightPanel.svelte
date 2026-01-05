<!--
  ============================================================================
  RIGHT PANEL COMPONENT
  ============================================================================
  
  Dynamic properties panel that responds to:
  - Active model selection
  - Face/Edge/Vertex selection within active model
  - Transform controls that update the actual solid
  
  @component RightPanel.svelte
-->
<script lang="ts">
  import { 
    selectionStore, 
    selectedNodes,
    documentStore,
    toolStore,
    sketchEditStore,
    hoverStore,
    selectionModeStore,
    solidStore,
    activeModelStore,
    nodesStore,
    triggerPivotUpdate
  } from '$lib/stores/cadStore';
  import { planeManager } from '$lib/tools/PlaneManager';
  import type { CADNode, CADPrimitive } from '$lib/core/types';
  import type { Solid, CADFace, CADEdge, CADVertex } from '$lib/geometry/Solid';

  // Store values
  let selection = $derived($selectionStore);
  let selectedNodesList = $derived($selectedNodes);
  let currentTool = $derived($toolStore.activeTool);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let selectionMode = $derived($selectionModeStore);
  let hover = $derived($hoverStore);
  let solids = $derived($solidStore);
  let planes = $derived($documentStore.planes);
  let activeModelId = $derived($activeModelStore);

  // Active model and its topology
  let activeSolid = $derived.by(() => {
    if (!activeModelId) return null;
    return solids.get(activeModelId) as Solid | null;
  });

  let faces = $derived(activeSolid?.faces || []);
  let edges = $derived(activeSolid?.edges || []);
  let vertices = $derived(activeSolid?.vertices || []);

  // Selected topology elements (from selection store)
  let selectedFaceIndices = $derived(
    selection.filter(s => s.type === 'face').map(s => s.elementIndex)
  );
  let selectedEdgeIndices = $derived(
    selection.filter(s => s.type === 'edge').map(s => s.elementIndex)
  );
  let selectedVertexIndices = $derived(
    selection.filter(s => s.type === 'vertex').map(s => s.elementIndex)
  );

  // Hover element index
  let hoveredFaceIndex = $derived(
    hover?.type === 'face' && hover.modelId === activeModelId ? hover.elementIndex : -1
  );
  let hoveredEdgeIndex = $derived(
    hover?.type === 'edge' && hover.modelId === activeModelId ? hover.elementIndex : -1
  );
  let hoveredVertexIndex = $derived(
    hover?.type === 'vertex' && hover.modelId === activeModelId ? hover.elementIndex : -1
  );

  // Panel mode
  let panelMode = $derived.by(() => {
    if (isSketchMode) return 'sketch';
    if (!activeModelId) return 'empty';
    if (selectedVertexIndices.length > 0) return 'vertex';
    if (selectedEdgeIndices.length > 0) return 'edge';
    if (selectedFaceIndices.length > 0) return 'face';
    return 'model';
  });

  // Expanded sections
  let topologyExpanded = $state(true);
  let transformExpanded = $state(true);
  let propertiesExpanded = $state(true);
  let planesExpanded = $state(false);

  // Transform values (synced with active solid)
  let posX = $state(0);
  let posY = $state(0);
  let posZ = $state(0);
  let pivotX = $state(0);
  let pivotY = $state(0);
  let pivotZ = $state(0);

  // Sync transform values when active solid changes
  $effect(() => {
    if (activeSolid) {
      posX = activeSolid.position.x;
      posY = activeSolid.position.y;
      posZ = activeSolid.position.z;
      pivotX = activeSolid.pivot.x;
      pivotY = activeSolid.pivot.y;
      pivotZ = activeSolid.pivot.z;
    }
  });

  // Apply position change directly to solid
  function applyPosition(): void {
    if (!activeSolid) return;
    activeSolid.position.set(posX, posY, posZ);
    triggerPivotUpdate(); // Force viewport to re-render
    console.log(`[RightPanel] Set position to (${posX}, ${posY}, ${posZ})`);
  }

  // Apply position on input change
  function onPositionChange(): void {
    applyPosition();
  }

  // Pivot controls
  function setPivotToCenter(): void {
    if (activeSolid) {
      activeSolid.setPivotToCenter();
      pivotX = activeSolid.pivot.x;
      pivotY = activeSolid.pivot.y;
      pivotZ = activeSolid.pivot.z;
      triggerPivotUpdate();
    }
  }

  function setPivotToOrigin(): void {
    if (activeSolid) {
      activeSolid.pivot.set(0, 0, 0);
      pivotX = pivotY = pivotZ = 0;
      triggerPivotUpdate();
    }
  }

  function setPivotToSelected(): void {
    if (!activeSolid) return;
    
    if (selectedVertexIndices.length > 0) {
      const v = vertices[selectedVertexIndices[0]];
      if (v) {
        activeSolid.pivot.copy(v.position3D);
        pivotX = v.position3D.x;
        pivotY = v.position3D.y;
        pivotZ = v.position3D.z;
        triggerPivotUpdate();
      }
    } else if (selectedEdgeIndices.length > 0) {
      const e = edges[selectedEdgeIndices[0]];
      if (e) {
        const mid = e.getMidpoint();
        activeSolid.pivot.copy(mid);
        pivotX = mid.x;
        pivotY = mid.y;
        pivotZ = mid.z;
        triggerPivotUpdate();
      }
    } else if (selectedFaceIndices.length > 0) {
      const f = faces[selectedFaceIndices[0]];
      if (f) {
        const center = f.getCentroid();
        activeSolid.pivot.copy(center);
        pivotX = center.x;
        pivotY = center.y;
        pivotZ = center.z;
        triggerPivotUpdate();
      }
    }
  }

  // Highlight topology element
  function highlightElement(type: 'face' | 'edge' | 'vertex', index: number): void {
    if (!activeModelId) return;
    
    const elem = type === 'face' ? faces[index] : type === 'edge' ? edges[index] : vertices[index];
    
    // Keep model in selection, add topology element
    selectionStore.set([
      { type: 'model', modelId: activeModelId, elementIndex: -1, elementName: '' },
      {
        type,
        modelId: activeModelId,
        elementIndex: index,
        elementName: elem?.name || `${type}_${index}`
      }
    ]);
  }

  // Check if element is highlighted (selected or hovered)
  function isFaceHighlighted(index: number): boolean {
    return selectedFaceIndices.includes(index) || hoveredFaceIndex === index;
  }

  function isEdgeHighlighted(index: number): boolean {
    return selectedEdgeIndices.includes(index) || hoveredEdgeIndex === index;
  }

  function isVertexHighlighted(index: number): boolean {
    return selectedVertexIndices.includes(index) || hoveredVertexIndex === index;
  }

  // Create plane from selected face
  function createPlaneFromFace(): void {
    if (selectedFaceIndices.length === 0 || !activeModelId) return;
    
    const face = faces[selectedFaceIndices[0]];
    if (!face) return;
    
    planeManager.createFromFace(
      activeModelId, 
      selectedFaceIndices[0],
      `Plane from ${face.faceName}`
    );
  }

  // Get selected element properties
  function getSelectedFaceProps() {
    if (selectedFaceIndices.length === 0) return null;
    const face = faces[selectedFaceIndices[0]];
    if (!face) return null;
    
    const normal = face.getAverageNormal();
    const centroid = face.getCentroid();
    const area = face.getSurfaceArea();
    
    return {
      name: face.faceName,
      area: area.toFixed(4),
      normal: `(${normal.x.toFixed(3)}, ${normal.y.toFixed(3)}, ${normal.z.toFixed(3)})`,
      centroid: `(${centroid.x.toFixed(2)}, ${centroid.y.toFixed(2)}, ${centroid.z.toFixed(2)})`
    };
  }

  function getSelectedEdgeProps() {
    if (selectedEdgeIndices.length === 0) return null;
    const edge = edges[selectedEdgeIndices[0]];
    if (!edge) return null;
    
    const length = edge.getLength();
    const midpoint = edge.getMidpoint();
    
    return {
      name: edge.edgeName,
      length: length.toFixed(4),
      faces: `${edge.faceA} / ${edge.faceB}`,
      midpoint: `(${midpoint.x.toFixed(2)}, ${midpoint.y.toFixed(2)}, ${midpoint.z.toFixed(2)})`,
      closed: edge.closedLoop ? 'Yes' : 'No'
    };
  }

  function getSelectedVertexProps() {
    if (selectedVertexIndices.length === 0) return null;
    const vertex = vertices[selectedVertexIndices[0]];
    if (!vertex) return null;
    
    return {
      name: vertex.vertexName,
      position: `(${vertex.position3D.x.toFixed(4)}, ${vertex.position3D.y.toFixed(4)}, ${vertex.position3D.z.toFixed(4)})`
    };
  }

  let selectedFaceProps = $derived(getSelectedFaceProps());
  let selectedEdgeProps = $derived(getSelectedEdgeProps());
  let selectedVertexProps = $derived(getSelectedVertexProps());
</script>

<aside class="cad-panel cad-panel-right">
  <div class="cad-panel-header">
    <span>
      {#if panelMode === 'sketch'}Sketch
      {:else if panelMode === 'vertex'}Vertex Properties
      {:else if panelMode === 'edge'}Edge Properties
      {:else if panelMode === 'face'}Face Properties
      {:else if panelMode === 'model'}Model Properties
      {:else}Properties{/if}
    </span>
  </div>

  <div class="cad-panel-content">
    <!-- Empty State -->
    {#if panelMode === 'empty'}
      <div class="panel-empty">
        <p>Click a model in the viewport to activate it</p>
        <div class="mode-info">
          <span>Selection Mode: </span>
          <span class="mode-val">{selectionMode}</span>
        </div>
        {#if hover}
          <div class="hover-info">Hover: {hover.elementName || hover.modelId?.slice(0, 8)}</div>
        {/if}
      </div>

    <!-- Model Properties -->
    {:else if panelMode === 'model' && activeSolid}
      <!-- Topology Browser -->
      <div class="cad-property-section">
        <button class="section-toggle" onclick={() => topologyExpanded = !topologyExpanded}>
          <span class="toggle-icon">{topologyExpanded ? '▼' : '▶'}</span>
          <span>Topology ({faces.length}F / {edges.length}E / {vertices.length}V)</span>
        </button>
        
        {#if topologyExpanded}
          <div class="section-content">
            <!-- Faces -->
            <div class="topo-group">
              <div class="topo-header">Faces ({faces.length})</div>
              <div class="topo-list">
                {#each faces as face, i}
                  <button 
                    class="topo-item" 
                    class:highlighted={isFaceHighlighted(i)}
                    class:selected={selectedFaceIndices.includes(i)}
                    onclick={() => highlightElement('face', i)}
                  >
                    <span class="topo-icon face">▣</span>
                    <span class="topo-name">{face.faceName}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Edges -->
            <div class="topo-group">
              <div class="topo-header">Edges ({edges.length})</div>
              <div class="topo-list">
                {#each edges as edge, i}
                  <button 
                    class="topo-item"
                    class:highlighted={isEdgeHighlighted(i)}
                    class:selected={selectedEdgeIndices.includes(i)}
                    onclick={() => highlightElement('edge', i)}
                  >
                    <span class="topo-icon edge">―</span>
                    <span class="topo-name">{edge.edgeName}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- Vertices -->
            <div class="topo-group">
              <div class="topo-header">Vertices ({vertices.length})</div>
              <div class="topo-list">
                {#each vertices as vertex, i}
                  <button 
                    class="topo-item"
                    class:highlighted={isVertexHighlighted(i)}
                    class:selected={selectedVertexIndices.includes(i)}
                    onclick={() => highlightElement('vertex', i)}
                  >
                    <span class="topo-icon vertex">●</span>
                    <span class="topo-name">{vertex.vertexName}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>

    <!-- Face Properties -->
    {:else if panelMode === 'face' && selectedFaceProps}
      <div class="cad-property-section">
        <div class="section-content">
          <div class="prop-row">
            <span class="prop-label">Name:</span>
            <span class="prop-value">{selectedFaceProps.name}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Area:</span>
            <span class="prop-value">{selectedFaceProps.area}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Normal:</span>
            <span class="prop-value mono">{selectedFaceProps.normal}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Centroid:</span>
            <span class="prop-value mono">{selectedFaceProps.centroid}</span>
          </div>
          
          <div class="action-buttons">
            <button class="action-btn" onclick={createPlaneFromFace}>
              Create Plane from Face
            </button>
          </div>
        </div>
      </div>

    <!-- Edge Properties -->
    {:else if panelMode === 'edge' && selectedEdgeProps}
      <div class="cad-property-section">
        <div class="section-content">
          <div class="prop-row">
            <span class="prop-label">Name:</span>
            <span class="prop-value">{selectedEdgeProps.name}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Length:</span>
            <span class="prop-value">{selectedEdgeProps.length}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Faces:</span>
            <span class="prop-value">{selectedEdgeProps.faces}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Midpoint:</span>
            <span class="prop-value mono">{selectedEdgeProps.midpoint}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Closed:</span>
            <span class="prop-value">{selectedEdgeProps.closed}</span>
          </div>
        </div>
      </div>

    <!-- Vertex Properties -->
    {:else if panelMode === 'vertex' && selectedVertexProps}
      <div class="cad-property-section">
        <div class="section-content">
          <div class="prop-row">
            <span class="prop-label">Name:</span>
            <span class="prop-value">{selectedVertexProps.name}</span>
          </div>
          <div class="prop-row">
            <span class="prop-label">Position:</span>
            <span class="prop-value mono">{selectedVertexProps.position}</span>
          </div>
          
          <div class="action-buttons">
            <button class="action-btn" onclick={setPivotToSelected}>
              Set as Pivot
            </button>
          </div>
        </div>
      </div>

    <!-- Sketch Mode -->
    {:else if panelMode === 'sketch'}
      <div class="panel-empty">
        <p>Sketch mode active</p>
        <p class="hint">Draw on the plane</p>
      </div>
    {/if}

    <!-- Transform Section (always visible when model is active) -->
    {#if activeSolid && panelMode !== 'sketch'}
      <div class="cad-property-section">
        <button class="section-toggle" onclick={() => transformExpanded = !transformExpanded}>
          <span class="toggle-icon">{transformExpanded ? '▼' : '▶'}</span>
          <span>Transform</span>
        </button>
        
        {#if transformExpanded}
          <div class="section-content">
            <div class="transform-group">
              <label>Position</label>
              <div class="transform-inputs">
                <div class="input-row">
                  <span class="axis x">X</span>
                  <input type="number" bind:value={posX} oninput={onPositionChange} step="1" />
                </div>
                <div class="input-row">
                  <span class="axis y">Y</span>
                  <input type="number" bind:value={posY} oninput={onPositionChange} step="1" />
                </div>
                <div class="input-row">
                  <span class="axis z">Z</span>
                  <input type="number" bind:value={posZ} oninput={onPositionChange} step="1" />
                </div>
              </div>
            </div>

            <div class="transform-group">
              <label>Pivot</label>
              <div class="transform-inputs">
                <div class="input-row">
                  <span class="axis x">X</span>
                  <input type="number" value={pivotX.toFixed(2)} readonly />
                </div>
                <div class="input-row">
                  <span class="axis y">Y</span>
                  <input type="number" value={pivotY.toFixed(2)} readonly />
                </div>
                <div class="input-row">
                  <span class="axis z">Z</span>
                  <input type="number" value={pivotZ.toFixed(2)} readonly />
                </div>
              </div>
              <div class="pivot-buttons">
                <button onclick={setPivotToCenter}>Center</button>
                <button onclick={setPivotToOrigin}>Origin</button>
                <button onclick={setPivotToSelected} disabled={selectedFaceIndices.length === 0 && selectedEdgeIndices.length === 0 && selectedVertexIndices.length === 0}>
                  Selection
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Planes Section (always visible) -->
    <div class="cad-property-section">
      <button class="section-toggle" onclick={() => planesExpanded = !planesExpanded}>
        <span class="toggle-icon">{planesExpanded ? '▼' : '▶'}</span>
        <span>Planes ({planes.size})</span>
      </button>
      
      {#if planesExpanded}
        <div class="section-content">
          {#each [...planes.values()] as plane}
            <div class="plane-item">
              <span class="plane-icon">◇</span>
              <span class="plane-name">{plane.name}</span>
              {#if plane.isReference}
                <span class="plane-badge">REF</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</aside>

<style>
  .cad-panel-right {
    width: 280px;
    min-width: 240px;
    background: var(--cad-bg-panel);
    border-left: 1px solid var(--cad-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cad-panel-header {
    padding: 12px 16px;
    background: var(--cad-bg-dark);
    border-bottom: 1px solid var(--cad-border);
    font-weight: 600;
    font-size: 13px;
    color: var(--cad-text);
  }

  .cad-panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .panel-empty {
    padding: 20px 16px;
    text-align: center;
    color: var(--cad-text-muted);
    font-size: 12px;
  }

  .panel-empty p {
    margin: 0 0 8px 0;
  }

  .mode-info, .hover-info {
    margin-top: 8px;
    font-size: 11px;
  }

  .mode-val {
    color: var(--cad-accent);
    text-transform: capitalize;
  }

  .hint {
    color: var(--cad-text-muted);
    font-style: italic;
  }

  .cad-property-section {
    border-bottom: 1px solid var(--cad-border);
  }

  .section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: none;
    border: none;
    color: var(--cad-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
  }

  .section-toggle:hover {
    background: var(--cad-bg-light);
  }

  .toggle-icon {
    font-size: 8px;
    color: var(--cad-text-muted);
  }

  .section-content {
    padding: 8px 16px 16px;
  }

  .transform-group {
    margin-bottom: 16px;
  }

  .transform-group label {
    display: block;
    font-size: 11px;
    color: var(--cad-text-muted);
    margin-bottom: 6px;
  }

  .transform-inputs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .axis {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
  }

  .axis.x { background: #ef4444; color: white; }
  .axis.y { background: #22c55e; color: white; }
  .axis.z { background: #3b82f6; color: white; }

  .input-row input {
    flex: 1;
    padding: 4px 8px;
    background: var(--cad-bg-input);
    border: 1px solid var(--cad-border);
    border-radius: 4px;
    color: var(--cad-text);
    font-size: 11px;
    font-family: monospace;
  }

  .input-row input:focus {
    outline: none;
    border-color: var(--cad-accent);
  }

  .pivot-buttons {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }

  .pivot-buttons button {
    flex: 1;
    padding: 4px 8px;
    background: var(--cad-bg-light);
    border: 1px solid var(--cad-border);
    border-radius: 4px;
    color: var(--cad-text);
    font-size: 10px;
    cursor: pointer;
  }

  .pivot-buttons button:hover:not(:disabled) {
    background: var(--cad-bg-hover);
  }

  .pivot-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .topo-group {
    margin-bottom: 12px;
  }

  .topo-header {
    font-size: 10px;
    font-weight: 600;
    color: var(--cad-text-muted);
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .topo-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 150px;
    overflow-y: auto;
  }

  .topo-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--cad-bg-light);
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    color: var(--cad-text);
    text-align: left;
    width: 100%;
  }

  .topo-item:hover {
    background: var(--cad-bg-hover);
  }

  .topo-item.highlighted {
    background: rgba(34, 197, 94, 0.2);
    border-color: var(--cad-success);
  }

  .topo-item.selected {
    background: rgba(59, 130, 246, 0.3);
    border-color: var(--cad-accent);
  }

  .topo-icon {
    font-size: 10px;
    width: 14px;
    text-align: center;
  }

  .topo-icon.face { color: #3b82f6; }
  .topo-icon.edge { color: #22c55e; }
  .topo-icon.vertex { color: #fbbf24; }

  .topo-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prop-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid var(--cad-border);
    font-size: 11px;
  }

  .prop-label {
    color: var(--cad-text-muted);
  }

  .prop-value {
    color: var(--cad-text);
    font-weight: 500;
  }

  .prop-value.mono {
    font-family: monospace;
    font-size: 10px;
  }

  .action-buttons {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .action-btn {
    padding: 8px 12px;
    background: var(--cad-accent);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .action-btn:hover {
    background: var(--cad-accent-hover);
  }

  .plane-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--cad-bg-light);
    border-radius: 4px;
    margin-bottom: 4px;
    font-size: 11px;
  }

  .plane-icon {
    color: var(--cad-accent);
  }

  .plane-name {
    flex: 1;
  }

  .plane-badge {
    padding: 2px 6px;
    background: var(--cad-bg-dark);
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    color: var(--cad-text-muted);
  }
</style>
