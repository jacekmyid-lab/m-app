/**
 * ManifoldEngine - WASM wrapper for manifold-3d library
 * Based on analysis of BREP CAD application's implementation
 */

import type { Result, BoxParams, SphereParams, CylinderParams, ConeParams, TorusParams, Point2D, Point3D, BooleanOperation } from '../core/types';

// Module-level references (initialized once)
let wasm: any = null;
let Manifold: any = null;
let CrossSection: any = null;
let ManifoldMesh: any = null;

/**
 * Engine configuration
 */
interface ManifoldEngineConfig {
  circularSegments: number;
  epsilon: number;
}

const defaultConfig: ManifoldEngineConfig = {
  circularSegments: 32,
  epsilon: 1e-6
};

/**
 * ManifoldEngine class - singleton wrapper for manifold-3d WASM
 */
export class ManifoldEngine {
  private static instance: ManifoldEngine | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private config: ManifoldEngineConfig;

  private constructor(config: Partial<ManifoldEngineConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ManifoldEngineConfig>): ManifoldEngine {
    if (!ManifoldEngine.instance) {
      ManifoldEngine.instance = new ManifoldEngine(config);
    }
    return ManifoldEngine.instance;
  }

  /**
   * Initialize the WASM module
   */
  async initialize(): Promise<Result<void>> {
    if (this.initialized) {
      return { success: true, value: undefined };
    }
    if (this.initPromise) {
      await this.initPromise;
      return { success: true, value: undefined };
    }

    this.initPromise = this.doInitialize();
    try {
      await this.initPromise;
      return { success: true, value: undefined };
    } catch (error) {
      return { success: false, error: `Initialization failed: ${error}` };
    }
  }

  /**
   * Internal initialization - following BREP's setupManifold.js pattern
   */
  private async doInitialize(): Promise<void> {
    try {
      console.log('[ManifoldEngine] Starting WASM initialization...');

      // Dynamic import of manifold-3d with retry logic
      console.log('[ManifoldEngine] Importing manifold-3d module...');
      let ManifoldModule;
      let importAttempts = 0;
      while (!ManifoldModule && importAttempts < 3) {
        try {
          importAttempts++;
          console.log(`[ManifoldEngine] Import attempt ${importAttempts}...`);
          ManifoldModule = await import('manifold-3d');
          console.log('[ManifoldEngine] Module imported successfully');
          break;
        } catch (importError) {
          console.warn(`[ManifoldEngine] Import attempt ${importAttempts} failed:`, importError);
          if (importAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw importError;
          }
        }
      }

      // Initialize WASM module
      console.log('[ManifoldEngine] Initializing WASM...');
      let wasmAttempts = 0;
      while (!wasm && wasmAttempts < 3) {
        try {
          wasmAttempts++;
          console.log(`[ManifoldEngine] WASM init attempt ${wasmAttempts}...`);
          wasm = await ManifoldModule.default();
          console.log('[ManifoldEngine] WASM initialized:', !!wasm);
          break;
        } catch (wasmError) {
          console.warn(`[ManifoldEngine] WASM init attempt ${wasmAttempts} failed:`, wasmError);
          if (wasmAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw wasmError;
          }
        }
      }

      // CRITICAL: Call setup() to initialize the API!
      // This is what makes Manifold.cube, sphere, etc. available
      if (typeof wasm.setup === 'function') {
        console.log('[ManifoldEngine] Calling setup()...');
        wasm.setup();
        console.log('[ManifoldEngine] setup() completed');
      } else {
        console.warn('[ManifoldEngine] No setup() function found');
      }

      // Store references to classes
      Manifold = wasm.Manifold;
      CrossSection = wasm.CrossSection;
      ManifoldMesh = wasm.Mesh;

      console.log('[ManifoldEngine] Class references:', {
        hasManifold: !!Manifold,
        hasCrossSection: !!CrossSection,
        hasMesh: !!ManifoldMesh
      });

      // Initialize Solid module with Manifold references
      console.log('[ManifoldEngine] Initializing Solid module...');
      const { initializeSolidModule } = await import('./Solid');
      initializeSolidModule({ Manifold, Mesh: ManifoldMesh, CrossSection });
      console.log('[ManifoldEngine] Solid module initialized');

      // Debug logging
      console.log('[ManifoldEngine] API verification:');
      console.log('  - Manifold.cube:', typeof Manifold?.cube);
      console.log('  - Manifold.sphere:', typeof Manifold?.sphere);
      console.log('  - Manifold.cylinder:', typeof Manifold?.cylinder);
      console.log('  - CrossSection.circle:', typeof CrossSection?.circle);
      console.log('  - Manifold.reserveIDs:', typeof Manifold?.reserveIDs);

      // Set circular segments if available
      if (typeof wasm.setCircularSegments === 'function') {
        wasm.setCircularSegments(this.config.circularSegments);
        console.log('[ManifoldEngine] Circular segments set to', this.config.circularSegments);
      }

      this.initialized = true;
      console.log('[ManifoldEngine] ✓ Initialization complete');
    } catch (error) {
      console.error('[ManifoldEngine] ✗ Initialization failed:', error);
      if (error instanceof Error) {
        console.error('[ManifoldEngine] Error message:', error.message);
        console.error('[ManifoldEngine] Stack trace:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.initialized && wasm !== null && Manifold !== null;
  }

  /**
   * Get the raw Manifold class (for advanced usage)
   */
  getManifoldClass(): any {
    return Manifold;
  }

  /**
   * Alias for getManifoldClass for backward compatibility
   */
  getManifold(): any {
    return Manifold;
  }

  /**
   * Get the raw CrossSection class
   */
  getCrossSectionClass(): any {
    return CrossSection;
  }

  /**
   * Get volume of a manifold
   */
  getVolume(solid: any): number {
    if (!solid) return 0;
    try {
      return solid.volume?.() ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get bounding box of a manifold
   */
  getBoundingBox(solid: any): Result<{ min: Point3D; max: Point3D }> {
    if (!this.isReady() || !solid) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const bbox = solid.boundingBox?.();
      if (!bbox) {
        return { success: false, error: 'Could not get bounding box' };
      }
      return {
        success: true,
        value: {
          min: { x: bbox.min[0], y: bbox.min[1], z: bbox.min[2] },
          max: { x: bbox.max[0], y: bbox.max[1], z: bbox.max[2] }
        }
      };
    } catch (error) {
      return { success: false, error: `Bounding box failed: ${error}` };
    }
  }

  /**
   * Extract topology (placeholder - returns empty for now)
   */
  extractTopology(solid: any): Result<any> {
    // Simplified topology extraction - just return basic info
    if (!this.isReady() || !solid) {
      return { success: false, error: 'Manifold not initialized' };
    }
    return {
      success: true,
      value: {
        vertices: [],
        edges: [],
        faces: []
      }
    };
  }

  /**
   * Transform a manifold with full transform object
   */
  transform(solid: any, transform: { position?: Point3D; rotation?: Point3D; scale?: Point3D | number }): Result<any> {
    if (!this.isReady() || !solid) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      let result = solid;

      // Apply scale first
      if (transform.scale !== undefined) {
        const scaleResult = this.scale(result, transform.scale);
        if (!scaleResult.success) return scaleResult;
        result = scaleResult.value;
      }

      // Apply rotation
      if (transform.rotation) {
        const rotateResult = this.rotate(result, transform.rotation);
        if (!rotateResult.success) return rotateResult;
        result = rotateResult.value;
      }

      // Apply translation
      if (transform.position) {
        const translateResult = this.translate(result, transform.position);
        if (!translateResult.success) return translateResult;
        result = translateResult.value;
      }

      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Transform failed: ${error}` };
    }
  }

  // ==========================================================================
  // PRIMITIVES
  // ==========================================================================

  /**
   * Create a box primitive
   */
  createBox(params: BoxParams): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const { width, height, depth, center } = params;
      
      // Manifold.cube([x, y, z], center)
      const box = Manifold.cube([width, height, depth], center);
      
      return { success: true, value: box };
    } catch (error) {
      console.error('[ManifoldEngine] createBox error:', error);
      return { success: false, error: `Failed to create box: ${error}` };
    }
  }

  /**
   * Create a sphere primitive
   */
  createSphere(params: SphereParams): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const { radius, circularSegments } = params;
      
      // Manifold.sphere(radius, circularSegments)
      const sphere = Manifold.sphere(radius, circularSegments || this.config.circularSegments);
      
      return { success: true, value: sphere };
    } catch (error) {
      console.error('[ManifoldEngine] createSphere error:', error);
      return { success: false, error: `Failed to create sphere: ${error}` };
    }
  }

  /**
   * Create a cylinder primitive
   */
  createCylinder(params: CylinderParams): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const { radius, height, circularSegments, center } = params;
      
      // Manifold.cylinder(height, radiusLow, radiusHigh, circularSegments, center)
      const cylinder = Manifold.cylinder(
        height,
        radius,
        radius, // same radius top and bottom
        circularSegments || this.config.circularSegments,
        center
      );
      
      return { success: true, value: cylinder };
    } catch (error) {
      console.error('[ManifoldEngine] createCylinder error:', error);
      return { success: false, error: `Failed to create cylinder: ${error}` };
    }
  }

  /**
   * Create a cone primitive
   */
  createCone(params: ConeParams): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const { bottomRadius, topRadius, height, circularSegments, center } = params;
      
      // Cone is a cylinder with different radii
      const cone = Manifold.cylinder(
        height,
        bottomRadius,
        topRadius,
        circularSegments || this.config.circularSegments,
        center
      );
      
      return { success: true, value: cone };
    } catch (error) {
      console.error('[ManifoldEngine] createCone error:', error);
      return { success: false, error: `Failed to create cone: ${error}` };
    }
  }

  /**
   * Create a torus primitive using CrossSection.circle + revolve
   * Following BREP's Torus implementation
   */
  createTorus(params: TorusParams): Result<any> {
    if (!this.isReady() || !CrossSection) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const { majorRadius, minorRadius, majorSegments, minorSegments } = params;
      
      // Create a circle cross-section and translate it by major radius
      // CrossSection.circle(radius, segments).translate(x, y)
      const cs = CrossSection.circle(minorRadius, minorSegments || 16);
      const translated = cs.translate(majorRadius, 0);
      
      // Revolve around Y axis (360 degrees)
      const torus = translated.revolve(majorSegments || this.config.circularSegments, 360);
      
      // Clean up intermediate objects
      try { if (cs && typeof cs.delete === 'function') cs.delete(); } catch {}
      try { if (translated && typeof translated.delete === 'function') translated.delete(); } catch {}
      
      return { success: true, value: torus };
    } catch (error) {
      console.error('[ManifoldEngine] createTorus error:', error);
      return { success: false, error: `Failed to create torus: ${error}` };
    }
  }

  // ==========================================================================
  // BOOLEAN OPERATIONS
  // ==========================================================================

  /**
   * Union two manifolds
   */
  union(a: any, b: any): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const result = a.add(b);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Union failed: ${error}` };
    }
  }

  /**
   * Subtract b from a
   */
  difference(a: any, b: any): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const result = a.subtract(b);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Difference failed: ${error}` };
    }
  }

  /**
   * Intersect two manifolds
   */
  intersection(a: any, b: any): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const result = a.intersect(b);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Intersection failed: ${error}` };
    }
  }

  /**
   * Perform boolean operation by name
   */
  boolean(a: any, b: any, operation: BooleanOperation): Result<any> {
    switch (operation) {
      case 'union':
        return this.union(a, b);
      case 'difference':
        return this.difference(a, b);
      case 'intersection':
        return this.intersection(a, b);
      default:
        return { success: false, error: `Unknown operation: ${operation}` };
    }
  }

  // ==========================================================================
  // EXTRUSION AND REVOLUTION
  // ==========================================================================

  /**
   * Extrude a 2D profile
   */
  extrude(profile: Point2D[], height: number, twist: number = 0, scale: [number, number] = [1, 1]): Result<any> {
    if (!this.isReady() || !CrossSection) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const polygonPoints: [number, number][] = profile.map(p => [p.x, p.y]);
      
      // Create cross-section from polygon
      const cs = CrossSection.ofPolygons([polygonPoints]);
      
      // Extrude
      const nDivisions = Math.max(1, Math.round(Math.abs(twist) / 10) + 1);
      const extruded = cs.extrude(height, nDivisions, twist, scale);
      
      // Clean up
      try { if (cs && typeof cs.delete === 'function') cs.delete(); } catch {}
      
      return { success: true, value: extruded };
    } catch (error) {
      console.error('[ManifoldEngine] extrude error:', error);
      return { success: false, error: `Extrusion failed: ${error}` };
    }
  }

  /**
   * Revolve a 2D profile
   */
  revolve(profile: Point2D[], angle: number = 360): Result<any> {
    if (!this.isReady() || !CrossSection) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const polygonPoints: [number, number][] = profile.map(p => [p.x, p.y]);
      
      // Create cross-section from polygon
      const cs = CrossSection.ofPolygons([polygonPoints]);
      
      // Calculate segments
      const segments = Math.max(3, Math.round((angle / 360) * this.config.circularSegments));
      
      // Revolve
      const revolved = cs.revolve(segments, angle);
      
      // Clean up
      try { if (cs && typeof cs.delete === 'function') cs.delete(); } catch {}
      
      return { success: true, value: revolved };
    } catch (error) {
      console.error('[ManifoldEngine] revolve error:', error);
      return { success: false, error: `Revolution failed: ${error}` };
    }
  }

  // ==========================================================================
  // TRANSFORMATIONS
  // ==========================================================================

  /**
   * Translate a manifold
   */
  translate(solid: any, offset: Point3D): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const result = solid.translate([offset.x, offset.y, offset.z]);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Translation failed: ${error}` };
    }
  }

  /**
   * Rotate a manifold (degrees)
   */
  rotate(solid: any, rotation: Point3D): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const result = solid.rotate([rotation.x, rotation.y, rotation.z]);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Rotation failed: ${error}` };
    }
  }

  /**
   * Scale a manifold
   */
  scale(solid: any, factor: Point3D | number): Result<any> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      const scaleVec = typeof factor === 'number' 
        ? [factor, factor, factor] 
        : [factor.x, factor.y, factor.z];
      const result = solid.scale(scaleVec);
      return { success: true, value: result };
    } catch (error) {
      return { success: false, error: `Scaling failed: ${error}` };
    }
  }

  // ==========================================================================
  // MESH EXTRACTION
  // ==========================================================================

  /**
   * Extract mesh data from a Manifold for Three.js rendering
   * Following BREP's getMesh pattern
   */
  extractMesh(solid: any): Result<{
    vertices: Float32Array;
    indices: Uint32Array;
    normals: Float32Array;
  }> {
    if (!this.isReady()) {
      return { success: false, error: 'Manifold not initialized' };
    }

    try {
      // Get mesh from manifold - this is the key method!
      const mesh = solid.getMesh();
      
      const numVert = mesh.numVert;
      const numTri = mesh.numTri;
      const numProp = mesh.numProp || 3;
      
      const vertProperties = mesh.vertProperties;
      const triVerts = mesh.triVerts;
      
      // Create typed arrays for Three.js
      const vertices = new Float32Array(numVert * 3);
      const indices = new Uint32Array(numTri * 3);
      const normals = new Float32Array(numVert * 3);
      
      // Copy vertex positions (handle stride if numProp > 3)
      for (let i = 0; i < numVert; i++) {
        vertices[i * 3 + 0] = vertProperties[i * numProp + 0];
        vertices[i * 3 + 1] = vertProperties[i * numProp + 1];
        vertices[i * 3 + 2] = vertProperties[i * numProp + 2];
      }
      
      // Copy indices
      for (let i = 0; i < numTri * 3; i++) {
        indices[i] = triVerts[i];
      }
      
      // Calculate vertex normals
      this.calculateNormals(vertices, indices, normals);
      
      // Clean up mesh object (important for WASM memory!)
      try { if (mesh && typeof mesh.delete === 'function') mesh.delete(); } catch {}
      
      return {
        success: true,
        value: { vertices, indices, normals }
      };
    } catch (error) {
      console.error('[ManifoldEngine] extractMesh error:', error);
      return { success: false, error: `Mesh extraction failed: ${error}` };
    }
  }

  /**
   * Calculate vertex normals from mesh data
   */
  private calculateNormals(
    vertices: Float32Array,
    indices: Uint32Array,
    normals: Float32Array
  ): void {
    // Reset normals
    normals.fill(0);
    
    const numTri = indices.length / 3;
    
    // Accumulate face normals to vertices
    for (let t = 0; t < numTri; t++) {
      const i0 = indices[t * 3 + 0];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];
      
      // Get vertex positions
      const v0x = vertices[i0 * 3 + 0];
      const v0y = vertices[i0 * 3 + 1];
      const v0z = vertices[i0 * 3 + 2];
      
      const v1x = vertices[i1 * 3 + 0];
      const v1y = vertices[i1 * 3 + 1];
      const v1z = vertices[i1 * 3 + 2];
      
      const v2x = vertices[i2 * 3 + 0];
      const v2y = vertices[i2 * 3 + 1];
      const v2z = vertices[i2 * 3 + 2];
      
      // Edge vectors
      const ux = v1x - v0x;
      const uy = v1y - v0y;
      const uz = v1z - v0z;
      
      const vx = v2x - v0x;
      const vy = v2y - v0y;
      const vz = v2z - v0z;
      
      // Cross product
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      
      // Add to each vertex
      normals[i0 * 3 + 0] += nx;
      normals[i0 * 3 + 1] += ny;
      normals[i0 * 3 + 2] += nz;
      
      normals[i1 * 3 + 0] += nx;
      normals[i1 * 3 + 1] += ny;
      normals[i1 * 3 + 2] += nz;
      
      normals[i2 * 3 + 0] += nx;
      normals[i2 * 3 + 1] += ny;
      normals[i2 * 3 + 2] += nz;
    }
    
    // Normalize
    const numVert = vertices.length / 3;
    for (let i = 0; i < numVert; i++) {
      const x = normals[i * 3 + 0];
      const y = normals[i * 3 + 1];
      const z = normals[i * 3 + 2];
      const len = Math.sqrt(x * x + y * y + z * z) || 1;
      normals[i * 3 + 0] = x / len;
      normals[i * 3 + 1] = y / len;
      normals[i * 3 + 2] = z / len;
    }
  }

  // ==========================================================================
  // MEMORY MANAGEMENT
  // ==========================================================================

  /**
   * Delete a manifold object to free WASM memory
   */
  deleteManifold(solid: any): void {
    try {
      if (solid && typeof solid.delete === 'function') {
        solid.delete();
      }
    } catch (error) {
      console.warn('[ManifoldEngine] Error deleting manifold:', error);
    }
  }

  /**
   * Get manifold properties
   */
  getProperties(solid: any): { volume: number; surfaceArea: number; numVert: number; numTri: number } | null {
    if (!solid) return null;
    
    try {
      return {
        volume: solid.volume?.() ?? 0,
        surfaceArea: solid.surfaceArea?.() ?? 0,
        numVert: solid.numVert?.() ?? 0,
        numTri: solid.numTri?.() ?? 0
      };
    } catch {
      return null;
    }
  }
}

// Export singleton getter
export const getManifoldEngine = ManifoldEngine.getInstance;

// Export singleton instance for backward compatibility
export const manifoldEngine = ManifoldEngine.getInstance();
