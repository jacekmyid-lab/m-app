<!--
  ============================================================================
  3D VIEWPORT COMPONENT - REACTIVE VERSION
  ============================================================================
  
  Real-time reactive viewport that updates immediately when:
  - Solids are created/modified
  - Selection changes in panels
  - Position/transforms change
  - Hover state changes
  
  @component Viewport.svelte
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Canvas, T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import * as THREE from 'three';
  
  import { 
    documentStore,
    selectionStore,
    hoverStore,
    selectionModeStore,
    viewportStore,
    sketchEditStore,
    solidStore,
    activeModelStore,
    pivotUpdateStore
  } from '$lib/stores/cadStore';
  import { 
    Solid,
    CADFace,
    CADEdge,
    CADVertex,
    CADMaterials
  } from '$lib/geometry/Solid';
  import SceneContent from './SceneContent.svelte';

  // Use derived for reactive store access
  let viewportConfig = $derived($viewportStore);
  let isSketchMode = $derived($sketchEditStore.isEditing);
  let sketchPlaneId = $derived($sketchEditStore.planeId);
  let selectionMode = $derived($selectionModeStore);
  let planes = $derived($documentStore.planes);
  let solids = $derived($solidStore);
  let selection = $derived($selectionStore);
  let activeModelId = $derived($activeModelStore);
  let hover = $derived($hoverStore);
  let pivotUpdate = $derived($pivotUpdateStore);

  // Scene references
  let canvasContainer: HTMLDivElement;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: any = null;
  let raycaster = new THREE.Raycaster();
  let mouseNDC = new THREE.Vector2();

  // Camera animation state
  let savedCameraState: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let animating = false;
  let targetCameraPos = { x: 50, y: 50, z: 50 };
  let targetCameraLookAt = { x: 0, y: 0, z: 0 };

  // Sketch basis for grid
  let sketchBasis: { origin: THREE.Vector3; x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 } | null = $state(null);

  // Handle sketch mode changes - reactive
  $effect(() => {
    const sketching = isSketchMode;
    const planeId = sketchPlaneId;
    if (sketching && planeId) {
      enterSketchMode();
    } else if (!sketching && savedCameraState) {
      exitSketchMode();
    }
  });

  /**
   * Enter sketch mode - animate camera
   */
  function enterSketchMode(): void {
    if (!sketchPlaneId || !camera || !controls) return;
    
    const plane = planes.get(sketchPlaneId);
    if (!plane) return;

    // Save camera state
    savedCameraState = {
      position: camera.position.clone(),
      target: controls.target?.clone() || new THREE.Vector3()
    };

    // Compute plane basis
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const normal = new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z).normalize();
    
    const worldUp = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3();
    const y = new THREE.Vector3();
    
    if (Math.abs(normal.dot(worldUp)) > 0.9) {
      x.crossVectors(new THREE.Vector3(1, 0, 0), normal).normalize();
    } else {
      x.crossVectors(worldUp, normal).normalize();
    }
    y.crossVectors(normal, x).normalize();

    sketchBasis = { origin, x, y, z: normal };

    // Animate camera to face plane
    const distance = 100;
    const newPos = origin.clone().add(normal.clone().multiplyScalar(distance));
    
    targetCameraPos = { x: newPos.x, y: newPos.y, z: newPos.z };
    targetCameraLookAt = { x: origin.x, y: origin.y, z: origin.z };
    animating = true;

    // Disable rotation
    setTimeout(() => {
      if (controls) controls.enableRotate = false;
    }, 600);
  }

  /**
   * Exit sketch mode
   */
  function exitSketchMode(): void {
    if (savedCameraState && camera && controls) {
      targetCameraPos = { 
        x: savedCameraState.position.x, 
        y: savedCameraState.position.y, 
        z: savedCameraState.position.z 
      };
      targetCameraLookAt = {
        x: savedCameraState.target.x,
        y: savedCameraState.target.y,
        z: savedCameraState.target.z
      };
      animating = true;

      if (controls) controls.enableRotate = true;
    }

    sketchBasis = null;
    savedCameraState = null;
  }

  /**
   * Get active model
   */
  function getActiveModel(): Solid | null {
    return activeModelId ? solids.get(activeModelId) || null : null;
  }

  /**
   * Find element under mouse
   */
  function findElementAtMouse(): CADFace | CADEdge | CADVertex | Solid | null {
    if (!scene || !camera) return null;

    raycaster.setFromCamera(mouseNDC, camera);

    // Model mode: any solid
    if (selectionMode === 'model') {
      const allFaces: THREE.Object3D[] = [];
      for (const solid of solids.values()) {
        allFaces.push(...solid.faces);
      }
      const intersects = raycaster.intersectObjects(allFaces, false);
      if (intersects.length > 0) {
        const face = intersects[0].object as CADFace;
        return face.parentSolid;
      }
      return null;
    }

    // Topology modes: require active model
    const activeModel = getActiveModel();
    if (!activeModel) return null;

    if (selectionMode === 'face') {
      const intersects = raycaster.intersectObjects(activeModel.faces, false);
      if (intersects.length > 0) {
        return intersects[0].object as CADFace;
      }
    }

    if (selectionMode === 'edge') {
      raycaster.params.Line = { threshold: 1.0 };
      const intersects = raycaster.intersectObjects(activeModel.edges, false);
      if (intersects.length > 0) {
        return intersects[0].object as CADEdge;
      }
    }

    if (selectionMode === 'vertex') {
      const threshold = 20;
      let closest: CADVertex | null = null;
      let closestDist = Infinity;

      for (const vertex of activeModel.vertices) {
        if (!vertex.visible) continue;
        
        const screenPos = vertex.position3D.clone().project(camera);
        const rect = canvasContainer?.getBoundingClientRect();
        if (!rect) continue;
        
        const dx = (screenPos.x - mouseNDC.x) * rect.width / 2;
        const dy = (screenPos.y - mouseNDC.y) * rect.height / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < threshold && dist < closestDist) {
          closestDist = dist;
          closest = vertex;
        }
      }
      
      return closest;
    }

    return null;
  }

  /**
   * Handle mouse move
   */
  function handleMouseMove(event: MouseEvent): void {
    if (!canvasContainer || !camera) return;

    const rect = canvasContainer.getBoundingClientRect();
    mouseNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const element = findElementAtMouse();
    
    if (element instanceof CADFace) {
      hoverStore.set({
        type: 'face',
        modelId: element.parentSolid?.nodeId || '',
        elementIndex: element.faceIndex,
        elementName: element.faceName
      });
    } else if (element instanceof CADEdge) {
      hoverStore.set({
        type: 'edge',
        modelId: element.parentSolid?.nodeId || '',
        elementIndex: element.edgeIndex,
        elementName: element.edgeName
      });
    } else if (element instanceof CADVertex) {
      hoverStore.set({
        type: 'vertex',
        modelId: element.parentSolid?.nodeId || '',
        elementIndex: element.vertexIndex,
        elementName: element.vertexName
      });
    } else if (element instanceof Solid) {
      hoverStore.set({
        type: 'model',
        modelId: element.nodeId,
        elementIndex: -1,
        elementName: element.name
      });
    } else {
      hoverStore.set(null);
    }
  }

  /**
   * Handle click - selection only, not activation
   */
  function handleClick(event: MouseEvent): void {
    const addToSelection = event.shiftKey;
    const element = findElementAtMouse();
    
    // Model mode - just show info, don't auto-activate
    if (selectionMode === 'model') {
      if (element instanceof Solid) {
        // In model mode, clicking selects but doesn't activate
        // Double-click activates (handled in handleDoubleClick)
        selectionStore.set([{
          type: 'model',
          modelId: element.nodeId,
          elementIndex: -1,
          elementName: element.name
        }]);
      } else {
        selectionStore.clear();
      }
      return;
    }

    // Topology modes - require active model
    if (!activeModelId) return;

    const baseSelection = addToSelection ? [...selection] : [{
      type: 'model',
      modelId: activeModelId,
      elementIndex: -1,
      elementName: ''
    }];
    
    if (element instanceof CADFace) {
      selectionStore.set([...baseSelection, {
        type: 'face',
        modelId: activeModelId,
        elementIndex: element.faceIndex,
        elementName: element.faceName
      }]);
    } else if (element instanceof CADEdge) {
      selectionStore.set([...baseSelection, {
        type: 'edge',
        modelId: activeModelId,
        elementIndex: element.edgeIndex,
        elementName: element.edgeName
      }]);
    } else if (element instanceof CADVertex) {
      selectionStore.set([...baseSelection, {
        type: 'vertex',
        modelId: activeModelId,
        elementIndex: element.vertexIndex,
        elementName: element.vertexName,
        position: {
          x: element.position3D.x,
          y: element.position3D.y,
          z: element.position3D.z
        }
      }]);
    } else if (!addToSelection) {
      // Keep model active but clear topology selection
      selectionStore.set([{
        type: 'model',
        modelId: activeModelId,
        elementIndex: -1,
        elementName: ''
      }]);
    }
  }

  /**
   * Handle double-click - activates model
   */
  function handleDoubleClick(event: MouseEvent): void {
    const element = findElementAtMouse();
    
    if (element instanceof Solid) {
      // Double-click activates the model, stay in model mode to show Transform panel
      activeModelStore.set(element.nodeId);
      selectionStore.set([{
        type: 'model',
        modelId: element.nodeId,
        elementIndex: -1,
        elementName: element.name
      }]);
      console.log(`[Viewport] Activated model: ${element.nodeId}`);
    } else if (element instanceof CADFace || element instanceof CADEdge || element instanceof CADVertex) {
      // Double-click on topology element - activate its parent
      const parentId = element.parentSolid?.nodeId;
      if (parentId) {
        activeModelStore.set(parentId);
        console.log(`[Viewport] Activated model via topology: ${parentId}`);
      }
    } else {
      // Double-click on empty space - deactivate
      activeModelStore.set(null);
      selectionModeStore.set('model');
      selectionStore.clear();
      console.log(`[Viewport] Deactivated model`);
    }
  }

  /**
   * Handle keyboard
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;
    
    switch (event.key.toLowerCase()) {
      case 'm':
        selectionModeStore.set('model');
        break;
      case 'f':
        selectionModeStore.set('face');
        break;
      case 'e':
        selectionModeStore.set('edge');
        break;
      case 'v':
        selectionModeStore.set('vertex');
        break;
      case 'p':
        const activeModel = getActiveModel();
        if (activeModel) {
          const selFaces = selection.filter(s => s.type === 'face');
          const selEdges = selection.filter(s => s.type === 'edge');
          const selVerts = selection.filter(s => s.type === 'vertex');
          
          if (selVerts.length > 0) {
            const v = activeModel.vertices[selVerts[0].elementIndex];
            if (v) {
              activeModel.setPivotToVertex(v);
              pivotPos = { x: activeModel.pivot.x, y: activeModel.pivot.y, z: activeModel.pivot.z };
            }
          } else if (selEdges.length > 0) {
            const e = activeModel.edges[selEdges[0].elementIndex];
            if (e) {
              activeModel.setPivotToEdge(e);
              pivotPos = { x: activeModel.pivot.x, y: activeModel.pivot.y, z: activeModel.pivot.z };
            }
          } else if (selFaces.length > 0) {
            const f = activeModel.faces[selFaces[0].elementIndex];
            if (f) {
              activeModel.setPivotToFace(f);
              pivotPos = { x: activeModel.pivot.x, y: activeModel.pivot.y, z: activeModel.pivot.z };
            }
          } else {
            // No selection - reset to center
            activeModel.setPivotToCenter();
            pivotPos = { x: activeModel.pivot.x, y: activeModel.pivot.y, z: activeModel.pivot.z };
          }
          console.log(`[Viewport] Pivot set to (${pivotPos.x.toFixed(2)}, ${pivotPos.y.toFixed(2)}, ${pivotPos.z.toFixed(2)})`);
        }
        break;
      case 'escape':
        if (isSketchMode) {
          sketchEditStore.exit();
        } else {
          activeModelStore.set(null);
          selectionStore.clear();
        }
        break;
    }
  }

  /**
   * Handle context menu
   */
  function handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  /**
   * Initialize scene
   */
  function onCameraCreate(cam: THREE.PerspectiveCamera) {
    camera = cam;
    if (cam.parent) {
      scene = cam.parent as THREE.Scene;
      console.log('[Viewport] Scene initialized');
    }
  }

  function onControlsCreate(ctrl: any) {
    controls = ctrl;
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);

    // Animation loop
    let animFrame: number;
    const animate = () => {
      if (camera && controls && animating) {
        const lerp = 0.12;
        camera.position.x += (targetCameraPos.x - camera.position.x) * lerp;
        camera.position.y += (targetCameraPos.y - camera.position.y) * lerp;
        camera.position.z += (targetCameraPos.z - camera.position.z) * lerp;
        
        if (controls.target) {
          controls.target.x += (targetCameraLookAt.x - controls.target.x) * lerp;
          controls.target.y += (targetCameraLookAt.y - controls.target.y) * lerp;
          controls.target.z += (targetCameraLookAt.z - controls.target.z) * lerp;
        }
        
        controls.update?.();
        
        const dist = Math.abs(camera.position.x - targetCameraPos.x) +
                     Math.abs(camera.position.y - targetCameraPos.y) +
                     Math.abs(camera.position.z - targetCameraPos.z);
        if (dist < 0.1) {
          animating = false;
        }
      }
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animFrame);
    };
  });

  // Computed values for template
  let activeSolid = $derived(activeModelId ? solids.get(activeModelId) : null);
  let showWorldGrid = $derived(viewportConfig.showGrid && !isSketchMode);
  let showSketchGrid = $derived(isSketchMode && sketchBasis !== null);
  
  // Pivot position state for reactivity (world space = model position + local pivot)
  let pivotPos = $state({ x: 0, y: 0, z: 0 });
  
  // Update pivot when active solid changes or pivot moves
  $effect(() => {
    const updateCount = pivotUpdate; // Track pivot updates
    const activeId = activeModelId;
    if (activeSolid) {
      // Pivot in world space = model position + local pivot
      pivotPos = {
        x: activeSolid.position.x + activeSolid.pivot.x,
        y: activeSolid.position.y + activeSolid.pivot.y,
        z: activeSolid.position.z + activeSolid.pivot.z
      };
    }
  });
</script>

<div 
  class="cad-viewport"
  class:sketch-mode={isSketchMode}
  class:has-active={activeModelId !== null}
  bind:this={canvasContainer}
  onmousemove={handleMouseMove}
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  oncontextmenu={handleContextMenu}
  role="application"
  tabindex="0"
>
  <Canvas>
    <!-- Scene Content Manager - handles solids -->
    <SceneContent />
    
    <!-- Camera -->
    <T.PerspectiveCamera
      makeDefault
      position={[50, 50, 50]}
      fov={45}
      near={0.1}
      far={10000}
      oncreate={(ref) => onCameraCreate(ref)}
    >
      <OrbitControls 
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.5}
        panSpeed={0.5}
        zoomSpeed={1}
        oncreate={(ref) => onControlsCreate(ref)}
      />
    </T.PerspectiveCamera>

    <!-- Lights -->
    <T.AmbientLight intensity={0.5} />
    <T.DirectionalLight position={[50, 100, 50]} intensity={0.8} />
    <T.DirectionalLight position={[-50, 50, -50]} intensity={0.4} />
    <T.HemisphereLight args={[0xffffff, 0x444444, 0.3]} />

    <!-- World Grid (hidden in sketch mode) -->
    {#if showWorldGrid}
      <T.GridHelper args={[200, 20, 0x2563eb, 0x1e3a5f]} />
    {/if}

    <!-- Sketch Grid (on plane) -->
    {#if showSketchGrid && sketchBasis}
      {@const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sketchBasis.z)}
      <T.Group 
        position={[sketchBasis.origin.x, sketchBasis.origin.y, sketchBasis.origin.z]}
        quaternion={quat}
      >
        <T.GridHelper args={[200, 40, 0x06b6d4, 0x0e7490]} />
      </T.Group>

      <!-- Sketch plane visualization -->
      <T.Mesh 
        position={[sketchBasis.origin.x, sketchBasis.origin.y, sketchBasis.origin.z]}
        quaternion={quat}
      >
        <T.PlaneGeometry args={[200, 200]} />
        <T.MeshBasicMaterial 
          color="#06b6d4"
          transparent
          opacity={0.03}
          side={THREE.DoubleSide}
        />
      </T.Mesh>
    {/if}

    <!-- Axes -->
    {#if viewportConfig.showAxes}
      <T.AxesHelper args={[50]} />
    {/if}

    <!-- Origin point -->
    {#if viewportConfig.showOrigin}
      <T.Mesh position={[0, 0, 0]}>
        <T.SphereGeometry args={[0.3, 16, 16]} />
        <T.MeshBasicMaterial color="#ffffff" />
      </T.Mesh>
    {/if}

    <!-- Active model pivot indicator -->
    {#if activeSolid}
      <T.Group position={[pivotPos.x, pivotPos.y, pivotPos.z]}>
        <!-- Pivot sphere -->
        <T.Mesh>
          <T.SphereGeometry args={[0.6, 16, 16]} />
          <T.MeshBasicMaterial color="#ffff00" transparent opacity={0.9} />
        </T.Mesh>
        <!-- Mini axes at pivot -->
        <T.AxesHelper args={[12]} />
        <!-- Ring around pivot -->
        <T.Mesh rotation={[Math.PI / 2, 0, 0]}>
          <T.RingGeometry args={[0.8, 1.0, 32]} />
          <T.MeshBasicMaterial color="#ffff00" transparent opacity={0.5} side={2} />
        </T.Mesh>
      </T.Group>
    {/if}
  </Canvas>

  <!-- Overlay -->
  <div class="viewport-overlay">
    <div class="status-row">
      <span class="mode-badge" class:active={selectionMode === 'model'}>
        {selectionMode.toUpperCase()}
      </span>
      <span class="count-badge">
        {solids.size} solid{solids.size !== 1 ? 's' : ''}
      </span>
    </div>
    
    {#if activeModelId && activeSolid}
      <div class="active-badge">
        Active: {activeSolid.name || activeModelId.slice(0, 8)}
        <span class="topo-counts">
          ({activeSolid.faces.length}F / {activeSolid.edges.length}E / {activeSolid.vertices.length}V)
        </span>
      </div>
    {:else if selectionMode !== 'model'}
      <div class="hint-badge">Click a model first (M)</div>
    {/if}

    {#if hover}
      <div class="hover-badge" class:face={hover.type === 'face'} class:edge={hover.type === 'edge'} class:vertex={hover.type === 'vertex'}>
        {hover.type}: {hover.elementName || hover.modelId?.slice(0, 8)}
      </div>
    {/if}

    {#if isSketchMode}
      <div class="sketch-badge">✏️ SKETCH MODE</div>
    {/if}
  </div>

  <!-- Shortcuts -->
  <div class="shortcuts">
    <span><kbd>M</kbd> Model</span>
    <span><kbd>F</kbd> Face</span>
    <span><kbd>E</kbd> Edge</span>
    <span><kbd>V</kbd> Vertex</span>
    <span><kbd>P</kbd> Pivot</span>
    <span><kbd>ESC</kbd> Clear</span>
  </div>
</div>

<style>
  .cad-viewport {
    position: relative;
    width: 100%;
    height: 100%;
    outline: none;
    background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
  }

  .cad-viewport.sketch-mode {
    border: 2px solid #06b6d4;
  }

  .cad-viewport.has-active {
    border: 1px solid #3b82f6;
  }

  .viewport-overlay {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }

  .status-row {
    display: flex;
    gap: 8px;
  }

  .mode-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid #334155;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
  }

  .mode-badge.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }

  .count-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 4px;
    font-size: 11px;
    color: #64748b;
  }

  .active-badge {
    padding: 6px 12px;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid #3b82f6;
    border-radius: 4px;
    font-size: 11px;
    color: #93c5fd;
  }

  .topo-counts {
    color: #64748b;
    margin-left: 4px;
  }

  .hint-badge {
    padding: 4px 10px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 4px;
    font-size: 10px;
    color: #64748b;
    font-style: italic;
  }

  .hover-badge {
    padding: 4px 10px;
    background: rgba(34, 197, 94, 0.9);
    border-radius: 4px;
    font-size: 11px;
    color: white;
    font-weight: 500;
  }

  .hover-badge.face { background: rgba(59, 130, 246, 0.9); }
  .hover-badge.edge { background: rgba(34, 197, 94, 0.9); }
  .hover-badge.vertex { background: rgba(251, 191, 36, 0.9); color: black; }

  .sketch-badge {
    padding: 6px 14px;
    background: #06b6d4;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    color: white;
    letter-spacing: 1px;
  }

  .shortcuts {
    position: absolute;
    bottom: 12px;
    left: 12px;
    display: flex;
    gap: 16px;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.95);
    border-radius: 6px;
    font-size: 10px;
    color: #64748b;
    pointer-events: none;
  }

  .shortcuts span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 18px;
    padding: 0 5px;
    background: #334155;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    color: #e2e8f0;
    font-family: inherit;
  }
</style>
