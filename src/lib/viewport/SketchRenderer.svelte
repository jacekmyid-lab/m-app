<!--
  ============================================================================
  SKETCH RENDERER COMPONENT
  ============================================================================
  
  Renders 2D sketch entities in 3D space on a given plane.
  Used when in sketch editing mode.
  
  @component SketchRenderer.svelte
-->
<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';
  import type { Plane, Point2D, SketchEntity } from '$lib/core/types';
  import { sketchEditStore } from '$lib/stores/cadStore';

  // Props
  export let plane: Plane;
  export let entities: SketchEntity[] = [];
  export let selectedEntityIds: string[] = [];
  export let hoveredEntityId: string | null = null;

  // Colors
  const COLORS = {
    normal: '#06b6d4',
    selected: '#f59e0b',
    hovered: '#22c55e',
    construction: '#6366f1',
    point: '#ffffff'
  };

  // Convert 2D point to 3D using plane coordinates
  function to3D(p: Point2D): THREE.Vector3 {
    const origin = new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z);
    const xAxis = new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z);
    const yAxis = new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z);
    
    return origin.clone()
      .add(xAxis.clone().multiplyScalar(p.x))
      .add(yAxis.clone().multiplyScalar(p.y));
  }

  // Get color for entity
  function getColor(entity: SketchEntity): string {
    if (selectedEntityIds.includes(entity.id)) return COLORS.selected;
    if (hoveredEntityId === entity.id) return COLORS.hovered;
    if (entity.construction) return COLORS.construction;
    return COLORS.normal;
  }

  // Generate points for circle
  function circlePoints(center: Point2D, radius: number, segments: number = 64): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const p2d: Point2D = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      };
      points.push(to3D(p2d));
    }
    return points;
  }

  // Generate points for arc
  function arcPoints(center: Point2D, radius: number, startAngle: number, endAngle: number, segments: number = 32): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    let sweep = endRad - startRad;
    if (sweep < 0) sweep += Math.PI * 2;
    
    for (let i = 0; i <= segments; i++) {
      const angle = startRad + (i / segments) * sweep;
      const p2d: Point2D = {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      };
      points.push(to3D(p2d));
    }
    return points;
  }

  // Generate points for rectangle
  function rectanglePoints(corner: Point2D, width: number, height: number): THREE.Vector3[] {
    const corners: Point2D[] = [
      corner,
      { x: corner.x + width, y: corner.y },
      { x: corner.x + width, y: corner.y + height },
      { x: corner.x, y: corner.y + height },
      corner // close the loop
    ];
    return corners.map(c => to3D(c));
  }

  // Generate geometry for entity
  function createLineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(points);
    return geometry;
  }
</script>

{#each entities as entity (entity.id)}
  {@const color = getColor(entity)}
  {@const lineWidth = selectedEntityIds.includes(entity.id) ? 2 : 1}
  
  {#if entity.type === 'line'}
    {@const points = [to3D(entity.start), to3D(entity.end)]}
    <T.Line geometry={createLineGeometry(points)}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    <!-- Start/end points -->
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array([...points[0].toArray(), ...points[1].toArray()]), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={4} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'circle'}
    {@const points = circlePoints(entity.center, entity.radius)}
    <T.Line geometry={createLineGeometry(points)}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    <!-- Center point -->
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(to3D(entity.center).toArray()), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={4} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'arc'}
    {@const points = arcPoints(entity.center, entity.radius, entity.startAngle, entity.endAngle)}
    <T.Line geometry={createLineGeometry(points)}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    <!-- Center and end points -->
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array([
            ...to3D(entity.center).toArray(),
            ...points[0].toArray(),
            ...points[points.length - 1].toArray()
          ]), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={4} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'rectangle'}
    {@const points = rectanglePoints(entity.corner, entity.width, entity.height)}
    <T.Line geometry={createLineGeometry(points)}>
      <T.LineBasicMaterial {color} linewidth={lineWidth} />
    </T.Line>
    <!-- Corner points -->
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(points.slice(0, 4).flatMap(p => p.toArray())), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={4} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'polyline'}
    {@const points = entity.points.map(p => to3D(p))}
    {#if entity.closed}
      {@const closedPoints = [...points, points[0]]}
      <T.Line geometry={createLineGeometry(closedPoints)}>
        <T.LineBasicMaterial {color} linewidth={lineWidth} />
      </T.Line>
    {:else}
      <T.Line geometry={createLineGeometry(points)}>
        <T.LineBasicMaterial {color} linewidth={lineWidth} />
      </T.Line>
    {/if}
    <!-- Vertex points -->
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(points.flatMap(p => p.toArray())), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={4} sizeAttenuation={false} />
    </T.Points>
    
  {:else if entity.type === 'point'}
    <T.Points>
      <T.BufferGeometry>
        <T.BufferAttribute
          attach="attributes-position"
          args={[new Float32Array(to3D(entity.position).toArray()), 3]}
        />
      </T.BufferGeometry>
      <T.PointsMaterial color={COLORS.point} size={6} sizeAttenuation={false} />
    </T.Points>
  {/if}
{/each}
