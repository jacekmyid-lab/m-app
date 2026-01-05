/**
 * ============================================================================
 * 2D SKETCHER MODULE
 * ============================================================================
 * 
 * This module handles 2D sketch creation and editing. Sketches are the
 * foundation for many CAD operations like extrude and revolve.
 * 
 * Features:
 * - Line, polyline, rectangle, circle, arc, spline creation
 * - Automatic profile detection (closed contours)
 * - Basic constraints and dimensioning
 * - Integration with Manifold for extrusion/revolution
 * 
 * @module sketcher/Sketcher
 */

import type {
  CADSketch,
  SketchEntity,
  SketchLine,
  SketchPolyline,
  SketchRectangle,
  SketchCircle,
  SketchArc,
  SketchSpline,
  SketchPoint,
  Constraint,
  Point2D,
  Plane,
  Result
} from '../core/types';
import { generateId } from '../stores/cadStore';

/**
 * Tolerance for point coincidence detection
 */
const COINCIDENCE_TOLERANCE = 0.001;

/**
 * ============================================================================
 * SKETCH ENTITY FACTORY
 * ============================================================================
 * Factory functions for creating sketch entities
 */
export const SketchEntityFactory = {
  /**
   * Create a line entity
   */
  line(start: Point2D, end: Point2D, construction = false): SketchLine {
    return {
      id: generateId(),
      type: 'line',
      start,
      end,
      construction,
      connections: []
    };
  },

  /**
   * Create a polyline entity
   */
  polyline(points: Point2D[], closed = false, construction = false): SketchPolyline {
    return {
      id: generateId(),
      type: 'polyline',
      points,
      closed,
      construction,
      connections: []
    };
  },

  /**
   * Create a rectangle entity
   */
  rectangle(corner: Point2D, width: number, height: number, construction = false): SketchRectangle {
    return {
      id: generateId(),
      type: 'rectangle',
      corner,
      width,
      height,
      construction,
      connections: []
    };
  },

  /**
   * Create a circle entity
   */
  circle(center: Point2D, radius: number, construction = false): SketchCircle {
    return {
      id: generateId(),
      type: 'circle',
      center,
      radius,
      construction,
      connections: []
    };
  },

  /**
   * Create an arc entity
   */
  arc(
    center: Point2D,
    radius: number,
    startAngle: number,
    endAngle: number,
    construction = false
  ): SketchArc {
    return {
      id: generateId(),
      type: 'arc',
      center,
      radius,
      startAngle,
      endAngle,
      construction,
      connections: []
    };
  },

  /**
   * Create a spline entity
   */
  spline(controlPoints: Point2D[], degree = 3, construction = false): SketchSpline {
    return {
      id: generateId(),
      type: 'spline',
      controlPoints,
      degree,
      construction,
      connections: []
    };
  },

  /**
   * Create a point entity
   */
  point(position: Point2D): SketchPoint {
    return {
      id: generateId(),
      type: 'point',
      position,
      construction: false,
      connections: []
    };
  }
};

/**
 * ============================================================================
 * SKETCHER CLASS
 * ============================================================================
 * Main class for managing sketch geometry
 */
export class Sketcher {
  private entities: Map<string, SketchEntity> = new Map();
  private constraints: Map<string, Constraint> = new Map();
  private plane: Plane;
  private sketchId: string;

  constructor(sketchId: string, plane: Plane) {
    this.sketchId = sketchId;
    this.plane = plane;
  }

  /**
   * Get all entities
   */
  getEntities(): SketchEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get entity by ID
   */
  getEntity(id: string): SketchEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Add an entity to the sketch
   */
  addEntity(entity: SketchEntity): void {
    this.entities.set(entity.id, entity);
    this.updateConnections();
  }

  /**
   * Remove an entity from the sketch
   */
  removeEntity(entityId: string): void {
    this.entities.delete(entityId);
    // Remove related constraints
    for (const [id, constraint] of this.constraints) {
      if (constraint.entityIds.includes(entityId)) {
        this.constraints.delete(id);
      }
    }
    this.updateConnections();
  }

  /**
   * Update an entity
   */
  updateEntity(entityId: string, updates: Partial<SketchEntity>): void {
    const entity = this.entities.get(entityId);
    if (entity) {
      this.entities.set(entityId, { ...entity, ...updates } as SketchEntity);
      this.updateConnections();
    }
  }

  /**
   * Add a constraint
   */
  addConstraint(constraint: Constraint): void {
    this.constraints.set(constraint.id, constraint);
  }

  /**
   * Remove a constraint
   */
  removeConstraint(constraintId: string): void {
    this.constraints.delete(constraintId);
  }

  /**
   * Get all constraints
   */
  getConstraints(): Constraint[] {
    return Array.from(this.constraints.values());
  }

  /**
   * Update connections between entities (for profile detection)
   */
  private updateConnections(): void {
    // Reset all connections
    for (const entity of this.entities.values()) {
      entity.connections = [];
    }

    // Find coincident endpoints
    const endpoints = this.extractEndpoints();
    
    for (let i = 0; i < endpoints.length; i++) {
      for (let j = i + 1; j < endpoints.length; j++) {
        if (this.pointsCoincident(endpoints[i].point, endpoints[j].point)) {
          // Add bidirectional connection
          const entityI = this.entities.get(endpoints[i].entityId);
          const entityJ = this.entities.get(endpoints[j].entityId);
          
          if (entityI && entityJ) {
            if (!entityI.connections.includes(endpoints[j].entityId)) {
              entityI.connections.push(endpoints[j].entityId);
            }
            if (!entityJ.connections.includes(endpoints[i].entityId)) {
              entityJ.connections.push(endpoints[i].entityId);
            }
          }
        }
      }
    }
  }

  /**
   * Extract all endpoints from entities
   */
  private extractEndpoints(): Array<{ entityId: string; point: Point2D; which: string }> {
    const endpoints: Array<{ entityId: string; point: Point2D; which: string }> = [];

    for (const entity of this.entities.values()) {
      if (entity.construction) continue; // Skip construction geometry

      switch (entity.type) {
        case 'line':
          endpoints.push({ entityId: entity.id, point: entity.start, which: 'start' });
          endpoints.push({ entityId: entity.id, point: entity.end, which: 'end' });
          break;
        case 'polyline':
          if (entity.points.length > 0) {
            endpoints.push({ entityId: entity.id, point: entity.points[0], which: 'start' });
            if (!entity.closed && entity.points.length > 1) {
              endpoints.push({ 
                entityId: entity.id, 
                point: entity.points[entity.points.length - 1], 
                which: 'end' 
              });
            }
          }
          break;
        case 'arc':
          endpoints.push({ 
            entityId: entity.id, 
            point: this.arcEndpoint(entity, 'start'), 
            which: 'start' 
          });
          endpoints.push({ 
            entityId: entity.id, 
            point: this.arcEndpoint(entity, 'end'), 
            which: 'end' 
          });
          break;
        case 'spline':
          if (entity.controlPoints.length > 0) {
            endpoints.push({ 
              entityId: entity.id, 
              point: entity.controlPoints[0], 
              which: 'start' 
            });
            endpoints.push({ 
              entityId: entity.id, 
              point: entity.controlPoints[entity.controlPoints.length - 1], 
              which: 'end' 
            });
          }
          break;
        // Circles and rectangles don't have open endpoints
      }
    }

    return endpoints;
  }

  /**
   * Get arc endpoint
   */
  private arcEndpoint(arc: SketchArc, which: 'start' | 'end'): Point2D {
    const angle = which === 'start' ? arc.startAngle : arc.endAngle;
    const radians = (angle * Math.PI) / 180;
    return {
      x: arc.center.x + arc.radius * Math.cos(radians),
      y: arc.center.y + arc.radius * Math.sin(radians)
    };
  }

  /**
   * Check if two points are coincident
   */
  private pointsCoincident(p1: Point2D, p2: Point2D): boolean {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) < COINCIDENCE_TOLERANCE;
  }

  /**
   * Detect closed profiles in the sketch
   * Returns arrays of Point2D representing closed polygons
   */
  detectProfiles(): Point2D[][] {
    const profiles: Point2D[][] = [];
    const visitedEntities = new Set<string>();

    // First, add standalone closed shapes
    for (const entity of this.entities.values()) {
      if (entity.construction) continue;

      if (entity.type === 'circle') {
        // Circle is always a closed profile
        profiles.push(this.circleToPolygon(entity));
        visitedEntities.add(entity.id);
      } else if (entity.type === 'rectangle') {
        // Rectangle is always a closed profile
        profiles.push(this.rectangleToPolygon(entity));
        visitedEntities.add(entity.id);
      } else if (entity.type === 'polyline' && entity.closed) {
        profiles.push([...entity.points]);
        visitedEntities.add(entity.id);
      }
    }

    // Then, try to find closed chains of entities
    for (const entity of this.entities.values()) {
      if (visitedEntities.has(entity.id) || entity.construction) continue;

      const chain = this.findClosedChain(entity.id, visitedEntities);
      if (chain) {
        const polygon = this.chainToPolygon(chain);
        if (polygon.length >= 3) {
          profiles.push(polygon);
        }
      }
    }

    return profiles;
  }

  /**
   * Find a closed chain starting from an entity
   */
  private findClosedChain(
    startId: string,
    globalVisited: Set<string>
  ): string[] | null {
    const chain: string[] = [];
    const visited = new Set<string>();
    
    const dfs = (currentId: string, prevId: string | null): boolean => {
      if (visited.has(currentId)) {
        // Found a cycle back to start
        return currentId === startId && chain.length >= 2;
      }

      visited.add(currentId);
      chain.push(currentId);

      const entity = this.entities.get(currentId);
      if (!entity) return false;

      for (const connectedId of entity.connections) {
        if (connectedId === prevId) continue; // Don't go back
        
        if (connectedId === startId && chain.length >= 2) {
          // Closed the loop
          return true;
        }

        if (!visited.has(connectedId)) {
          if (dfs(connectedId, currentId)) {
            return true;
          }
        }
      }

      chain.pop();
      visited.delete(currentId);
      return false;
    };

    if (dfs(startId, null)) {
      // Mark all entities in chain as visited globally
      chain.forEach(id => globalVisited.add(id));
      return chain;
    }

    return null;
  }

  /**
   * Convert a chain of entity IDs to a polygon
   */
  private chainToPolygon(chain: string[]): Point2D[] {
    const points: Point2D[] = [];

    for (let i = 0; i < chain.length; i++) {
      const entity = this.entities.get(chain[i]);
      if (!entity) continue;

      const entityPoints = this.entityToPoints(entity);
      
      // Determine if we need to reverse the points
      if (i > 0 && points.length > 0) {
        const lastPoint = points[points.length - 1];
        const firstEntityPoint = entityPoints[0];
        const lastEntityPoint = entityPoints[entityPoints.length - 1];

        const distToFirst = this.distance(lastPoint, firstEntityPoint);
        const distToLast = this.distance(lastPoint, lastEntityPoint);

        if (distToLast < distToFirst) {
          entityPoints.reverse();
        }
      }

      // Add points, skipping duplicate at junction
      for (let j = 0; j < entityPoints.length; j++) {
        if (j === 0 && points.length > 0) {
          const lastPoint = points[points.length - 1];
          if (this.pointsCoincident(lastPoint, entityPoints[j])) {
            continue;
          }
        }
        points.push(entityPoints[j]);
      }
    }

    // Close the polygon if needed
    if (points.length >= 3) {
      const first = points[0];
      const last = points[points.length - 1];
      if (this.pointsCoincident(first, last)) {
        points.pop();
      }
    }

    return points;
  }

  /**
   * Convert entity to array of points
   */
  private entityToPoints(entity: SketchEntity): Point2D[] {
    switch (entity.type) {
      case 'line':
        return [entity.start, entity.end];
      case 'polyline':
        return [...entity.points];
      case 'arc':
        return this.arcToPoints(entity);
      case 'spline':
        return this.splineToPoints(entity);
      default:
        return [];
    }
  }

  /**
   * Convert circle to polygon
   */
  private circleToPolygon(circle: SketchCircle, segments = 32): Point2D[] {
    const points: Point2D[] = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      points.push({
        x: circle.center.x + circle.radius * Math.cos(angle),
        y: circle.center.y + circle.radius * Math.sin(angle)
      });
    }
    return points;
  }

  /**
   * Convert rectangle to polygon
   */
  private rectangleToPolygon(rect: SketchRectangle): Point2D[] {
    return [
      { x: rect.corner.x, y: rect.corner.y },
      { x: rect.corner.x + rect.width, y: rect.corner.y },
      { x: rect.corner.x + rect.width, y: rect.corner.y + rect.height },
      { x: rect.corner.x, y: rect.corner.y + rect.height }
    ];
  }

  /**
   * Convert arc to points
   */
  private arcToPoints(arc: SketchArc, segments = 16): Point2D[] {
    const points: Point2D[] = [];
    let startAngle = arc.startAngle;
    let endAngle = arc.endAngle;
    
    // Handle angle wrapping
    while (endAngle < startAngle) {
      endAngle += 360;
    }

    const angleSpan = endAngle - startAngle;
    const numSegments = Math.max(3, Math.ceil(segments * (angleSpan / 360)));

    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const angle = ((startAngle + t * angleSpan) * Math.PI) / 180;
      points.push({
        x: arc.center.x + arc.radius * Math.cos(angle),
        y: arc.center.y + arc.radius * Math.sin(angle)
      });
    }

    return points;
  }

  /**
   * Convert spline to points (simplified - linear interpolation)
   */
  private splineToPoints(spline: SketchSpline, segments = 20): Point2D[] {
    if (spline.controlPoints.length < 2) {
      return [...spline.controlPoints];
    }

    // Simple Catmull-Rom spline interpolation
    const points: Point2D[] = [];
    const n = spline.controlPoints.length;

    for (let i = 0; i < n - 1; i++) {
      const p0 = spline.controlPoints[Math.max(0, i - 1)];
      const p1 = spline.controlPoints[i];
      const p2 = spline.controlPoints[Math.min(n - 1, i + 1)];
      const p3 = spline.controlPoints[Math.min(n - 1, i + 2)];

      const segmentCount = Math.ceil(segments / (n - 1));
      for (let j = 0; j < segmentCount; j++) {
        const t = j / segmentCount;
        points.push(this.catmullRom(p0, p1, p2, p3, t));
      }
    }

    // Add final point
    points.push(spline.controlPoints[n - 1]);

    return points;
  }

  /**
   * Catmull-Rom spline interpolation
   */
  private catmullRom(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
    const t2 = t * t;
    const t3 = t2 * t;

    const x = 0.5 * (
      2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );

    const y = 0.5 * (
      2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    return { x, y };
  }

  /**
   * Calculate distance between two points
   */
  private distance(p1: Point2D, p2: Point2D): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Export sketch to CADSketch node format
   */
  exportToNode(planeId: string): Omit<CADSketch, 'id' | 'name' | 'visible' | 'locked' | 'parentId' | 'childIds' | 'transform' | 'createdAt' | 'modifiedAt' | 'metadata'> {
    const profiles = this.detectProfiles();
    const isFullyConstrained = this.checkFullyConstrained();

    return {
      type: 'sketch',
      planeId,
      entities: this.getEntities(),
      constraints: this.getConstraints(),
      fullyConstrained: isFullyConstrained,
      profiles
    };
  }

  /**
   * Check if sketch is fully constrained
   * (Simplified version - full constraint solving is complex)
   */
  private checkFullyConstrained(): boolean {
    // For now, just return false - real constraint solving is complex
    return false;
  }

  /**
   * Clear all entities and constraints
   */
  clear(): void {
    this.entities.clear();
    this.constraints.clear();
  }

  /**
   * Load entities from a CADSketch node
   */
  loadFromNode(sketch: CADSketch): void {
    this.clear();
    
    for (const entity of sketch.entities) {
      this.entities.set(entity.id, entity);
    }
    
    for (const constraint of sketch.constraints) {
      this.constraints.set(constraint.id, constraint);
    }
    
    this.updateConnections();
  }
}

/**
 * Create a new Sketcher instance
 */
export function createSketcher(sketchId: string, plane: Plane): Sketcher {
  return new Sketcher(sketchId, plane);
}
