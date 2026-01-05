<!--
  SceneContent.svelte
  Manages solids inside Threlte Canvas context
-->
<script lang="ts">
  import { T, useThrelte } from '@threlte/core';
  import * as THREE from 'three';
  import { solidStore, activeModelStore, selectionStore, hoverStore, selectionModeStore, pivotUpdateStore } from '$lib/stores/cadStore';
  import type { Solid, CADFace, CADEdge, CADVertex } from '$lib/geometry/Solid';

  // Get Threlte context
  const { scene, invalidate } = useThrelte();

  // Reactive store values
  let solids = $derived($solidStore);
  let activeModelId = $derived($activeModelStore);
  let selection = $derived($selectionStore);
  let hover = $derived($hoverStore);
  let selectionMode = $derived($selectionModeStore);
  let pivotUpdate = $derived($pivotUpdateStore);

  // Track managed solids - use $state for reactivity
  let managedSolids = $state(new Set<string>());

  // Current hover for cleanup
  let currentHoveredObject: CADFace | CADEdge | CADVertex | null = null;

  console.log('[SceneContent] Component initialized, scene:', !!scene);

  // Sync solids with scene
  $effect(() => {
    const solidCount = solids.size;
    console.log(`[SceneContent] Effect triggered, solidCount: ${solidCount}, scene: ${!!scene}`);
    
    if (!scene) {
      console.log('[SceneContent] No scene yet');
      return;
    }

    // Add new solids
    for (const [nodeId, solid] of solids) {
      if (!managedSolids.has(nodeId)) {
        scene.add(solid);
        managedSolids = new Set([...managedSolids, nodeId]);
        console.log(`[SceneContent] Added solid: ${nodeId} (${solid.faces.length}F/${solid.edges.length}E/${solid.vertices.length}V)`);
        console.log(`[SceneContent] Scene children count: ${scene.children.length}`);
      }
    }

    // Remove deleted solids
    const toRemove: string[] = [];
    for (const nodeId of managedSolids) {
      if (!solids.has(nodeId)) {
        const obj = scene.children.find((c: any) => c.nodeId === nodeId);
        if (obj) {
          scene.remove(obj);
          console.log(`[SceneContent] Removed solid: ${nodeId}`);
        }
        toRemove.push(nodeId);
      }
    }
    if (toRemove.length > 0) {
      const newManaged = new Set(managedSolids);
      for (const id of toRemove) newManaged.delete(id);
      managedSolids = newManaged;
    }

    invalidate();
  });

  // Re-render when pivot/transform changes
  $effect(() => {
    const update = pivotUpdate;
    invalidate();
  });

  // Apply selection highlighting
  $effect(() => {
    const selCount = selection.length;
    const activeId = activeModelId;
    applySelectionHighlighting();
    invalidate();
  });

  // Apply hover highlighting
  $effect(() => {
    const hoverType = hover?.type;
    const hoverIdx = hover?.elementIndex;
    applyHoverFromStore();
    invalidate();
  });

  // Update vertex visibility
  $effect(() => {
    const mode = selectionMode;
    const activeId = activeModelId;
    const showVerts = mode === 'vertex' && activeId !== null;
    for (const [nodeId, solid] of solids) {
      solid.showVertices = showVerts && nodeId === activeId;
    }
    invalidate();
  });

  function applySelectionHighlighting(): void {
    for (const solid of solids.values()) {
      for (const face of solid.faces) face.setSelected(false);
      for (const edge of solid.edges) edge.setSelected(false);
      for (const vertex of solid.vertices) vertex.setSelected(false);
    }

    for (const sel of selection) {
      const solid = solids.get(sel.modelId);
      if (!solid) continue;

      if (sel.type === 'face' && typeof sel.elementIndex === 'number') {
        const face = solid.faces[sel.elementIndex];
        if (face) face.setSelected(true);
      } else if (sel.type === 'edge' && typeof sel.elementIndex === 'number') {
        const edge = solid.edges[sel.elementIndex];
        if (edge) edge.setSelected(true);
      } else if (sel.type === 'vertex' && typeof sel.elementIndex === 'number') {
        const vertex = solid.vertices[sel.elementIndex];
        if (vertex) vertex.setSelected(true);
      }
    }
  }

  function applyHoverFromStore(): void {
    if (currentHoveredObject) {
      currentHoveredObject.setHovered(false);
      currentHoveredObject = null;
    }

    if (!hover) return;

    const solid = solids.get(hover.modelId);
    if (!solid) return;

    if (hover.type === 'face' && typeof hover.elementIndex === 'number') {
      const face = solid.faces[hover.elementIndex];
      if (face) {
        face.setHovered(true);
        currentHoveredObject = face;
      }
    } else if (hover.type === 'edge' && typeof hover.elementIndex === 'number') {
      const edge = solid.edges[hover.elementIndex];
      if (edge) {
        edge.setHovered(true);
        currentHoveredObject = edge;
      }
    } else if (hover.type === 'vertex' && typeof hover.elementIndex === 'number') {
      const vertex = solid.vertices[hover.elementIndex];
      if (vertex) {
        vertex.setHovered(true);
        currentHoveredObject = vertex;
      }
    }
  }
</script>

<!-- This component doesn't render anything directly, it manages scene objects -->
