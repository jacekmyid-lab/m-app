<!--
  ============================================================================
  LEFT PANEL COMPONENT
  ============================================================================
  
  Contains the model tree (hierarchy view) and tool panels.
  The model tree shows all CAD nodes with their parent-child relationships.
  
  Features:
  - Expandable tree nodes
  - Selection highlighting
  - Context menu for node operations
  - Drag and drop reordering
  - Visibility and lock toggles
  
  @component LeftPanel.svelte
-->
<script lang="ts">
  import { 
    documentStore, 
    selectionStore, 
    rootNodes,
    planesStore,
    sketchEditStore 
  } from '$lib/stores/cadStore';
  import { 
    deleteNode, 
    duplicateNode, 
    toggleVisibility, 
    toggleLock,
    renameNode 
  } from '$lib/tools/CADOperations';
  import { planeManager } from '$lib/tools/PlaneManager';
  import type { CADNode, Plane } from '$lib/core/types';

  // Panel state
  let activeTab = $state<'tree' | 'planes'>('tree');
  let expandedNodes = $state<Set<string>>(new Set());
  let editingNodeId = $state<string | null>(null);
  let editingName = $state('');

  // Get selection state
  let selection = $derived($selectionStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);

  /**
   * Check if a node is selected
   */
  function isSelected(nodeId: string): boolean {
    return selection.some(s => s.modelId === nodeId);
  }

  /**
   * Toggle node expansion in tree
   */
  function toggleExpanded(nodeId: string): void {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    expandedNodes = newExpanded;
  }

  /**
   * Select a node
   */
  function selectNode(nodeId: string, event: MouseEvent): void {
    if (event.shiftKey) {
      // Add to selection
      selectionStore.add({ type: 'model', modelId: nodeId });
    } else {
      // Replace selection
      selectionStore.set([{ type: 'model', modelId: nodeId }]);
    }
  }

  /**
   * Start editing node name
   */
  function startEditing(nodeId: string, currentName: string): void {
    editingNodeId = nodeId;
    editingName = currentName;
  }

  /**
   * Save edited name
   */
  function saveEditedName(): void {
    if (editingNodeId && editingName.trim()) {
      renameNode(editingNodeId, editingName.trim());
    }
    editingNodeId = null;
    editingName = '';
  }

  /**
   * Get node icon based on type
   */
  function getNodeIcon(type: string): string {
    const icons: Record<string, string> = {
      box: '□',
      sphere: '○',
      cylinder: '⬭',
      cone: '△',
      torus: '◎',
      union: '∪',
      difference: '−',
      intersection: '∩',
      sketch: '✎',
      extrude: '↑',
      revolve: '↻',
      group: '📁'
    };
    return icons[type] ?? '•';
  }

  /**
   * Get child nodes of a parent
   */
  function getChildren(parentId: string): CADNode[] {
    const doc = $documentStore;
    const parent = doc.nodes.get(parentId);
    if (!parent) return [];
    return parent.childIds
      .map(id => doc.nodes.get(id))
      .filter((n): n is CADNode => n !== undefined);
  }

  /**
   * Set active plane
   */
  function setActivePlane(planeId: string): void {
    planeManager.setActivePlane(planeId);
  }
</script>

<aside class="cad-panel cad-panel-left">
  <!-- Tab Header -->
  <div class="panel-tabs">
    <button 
      class="panel-tab" 
      class:active={activeTab === 'tree'}
      onclick={() => activeTab = 'tree'}
    >
      Model Tree
    </button>
    <button 
      class="panel-tab" 
      class:active={activeTab === 'planes'}
      onclick={() => activeTab = 'planes'}
    >
      Planes
    </button>
  </div>

  <!-- Model Tree Tab -->
  {#if activeTab === 'tree'}
    <div class="cad-panel-content">
      <div class="cad-tree">
        {#each $rootNodes as node (node.id)}
          {@render treeNode(node, 0)}
        {/each}

        {#if $rootNodes.length === 0}
          <div class="tree-empty">
            <p>No models yet</p>
            <p class="tree-empty-hint">Create primitives from the toolbar</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Planes Tab -->
  {#if activeTab === 'planes'}
    <div class="cad-panel-content">
      <div class="planes-list">
        {#each Array.from($documentStore.planes.values()) as plane (plane.id)}
          <button
            class="plane-item"
            class:active={$documentStore.activePlaneId === plane.id}
            class:reference={plane.isReference}
            onclick={() => setActivePlane(plane.id)}
          >
            <span class="plane-icon">
              {#if plane.source.type === 'reference'}
                {plane.source.axis}
              {:else}
                ◇
              {/if}
            </span>
            <span class="plane-name">{plane.name}</span>
          </button>
        {/each}
      </div>

      <div class="planes-actions">
        <button class="cad-btn" title="Create plane from 3 points">
          <span>+ 3-Point Plane</span>
        </button>
        <button class="cad-btn" title="Create offset plane">
          <span>+ Offset Plane</span>
        </button>
      </div>
    </div>
  {/if}
</aside>

<!-- Recursive tree node snippet -->
{#snippet treeNode(node: CADNode, depth: number)}
  <div class="tree-node" style="--depth: {depth}">
    <div 
      class="cad-tree-item"
      class:selected={isSelected(node.id)}
      class:hidden={!node.visible}
      class:locked={node.locked}
      onclick={(e) => selectNode(node.id, e)}
      ondblclick={() => startEditing(node.id, node.name)}
    >
      <!-- Expand/Collapse Toggle -->
      {#if node.childIds.length > 0}
        <button 
          class="tree-expand-btn"
          onclick={(e) => { e.stopPropagation(); toggleExpanded(node.id); }}
        >
          {expandedNodes.has(node.id) ? '▼' : '▶'}
        </button>
      {:else}
        <span class="tree-expand-spacer"></span>
      {/if}

      <!-- Node Icon -->
      <span class="cad-tree-item-icon" title={node.type}>
        {getNodeIcon(node.type)}
      </span>

      <!-- Node Name -->
      {#if editingNodeId === node.id}
        <input
          type="text"
          class="tree-name-input"
          bind:value={editingName}
          onblur={saveEditedName}
          onkeydown={(e) => e.key === 'Enter' && saveEditedName()}
          autofocus
        />
      {:else}
        <span class="cad-tree-item-label">{node.name}</span>
      {/if}

      <!-- Actions -->
      <div class="tree-item-actions">
        <button
          class="tree-action-btn"
          class:active={node.visible}
          onclick={(e) => { e.stopPropagation(); toggleVisibility(node.id); }}
          title={node.visible ? 'Hide' : 'Show'}
        >
          {node.visible ? '👁' : '👁‍🗨'}
        </button>
        <button
          class="tree-action-btn"
          class:active={node.locked}
          onclick={(e) => { e.stopPropagation(); toggleLock(node.id); }}
          title={node.locked ? 'Unlock' : 'Lock'}
        >
          {node.locked ? '🔒' : '🔓'}
        </button>
      </div>
    </div>

    <!-- Children -->
    {#if expandedNodes.has(node.id)}
      <div class="tree-children">
        {#each getChildren(node.id) as child (child.id)}
          {@render treeNode(child, depth + 1)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--cad-border);
  }

  .panel-tab {
    flex: 1;
    padding: 10px;
    background: none;
    border: none;
    color: var(--cad-text-secondary);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .panel-tab:hover {
    background-color: var(--cad-bg-panel-light);
    color: var(--cad-text-primary);
  }

  .panel-tab.active {
    background-color: var(--cad-bg-panel-light);
    color: var(--cad-primary-light);
    border-bottom: 2px solid var(--cad-primary);
  }

  .tree-node {
    padding-left: calc(var(--depth) * 16px);
  }

  .tree-expand-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    background: none;
    border: none;
    color: var(--cad-text-secondary);
    cursor: pointer;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tree-expand-spacer {
    width: 16px;
  }

  .tree-item-actions {
    display: flex;
    gap: 2px;
    margin-left: auto;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .cad-tree-item:hover .tree-item-actions {
    opacity: 1;
  }

  .tree-action-btn {
    width: 20px;
    height: 20px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 10px;
    opacity: 0.5;
    transition: opacity 0.15s ease;
  }

  .tree-action-btn:hover,
  .tree-action-btn.active {
    opacity: 1;
  }

  .tree-name-input {
    flex: 1;
    background: var(--cad-bg-input);
    border: 1px solid var(--cad-primary);
    border-radius: 2px;
    padding: 2px 4px;
    font-size: 12px;
    color: var(--cad-text-primary);
    outline: none;
  }

  .cad-tree-item.hidden {
    opacity: 0.4;
  }

  .cad-tree-item.locked {
    font-style: italic;
  }

  .tree-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--cad-text-muted);
  }

  .tree-empty p {
    margin: 0;
  }

  .tree-empty-hint {
    font-size: 11px;
    margin-top: 8px !important;
  }

  /* Planes Tab */
  .planes-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .plane-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--cad-text-primary);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .plane-item:hover {
    background-color: var(--cad-bg-panel-light);
  }

  .plane-item.active {
    background-color: var(--cad-primary);
  }

  .plane-item.reference .plane-icon {
    color: var(--cad-accent);
  }

  .plane-icon {
    font-size: 10px;
    font-weight: 600;
    width: 20px;
    text-align: center;
  }

  .planes-actions {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .planes-actions .cad-btn {
    justify-content: flex-start;
    font-size: 11px;
  }
</style>
