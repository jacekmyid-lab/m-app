<!--
  ============================================================================
  MAIN LAYOUT COMPONENT
  ============================================================================
  
  Root layout for the CAD application with three-panel design:
  - Left: Model tree and tools
  - Center: 3D Viewport
  - Right: Properties panel
  
  @component +layout.svelte
-->
<script lang="ts">
  import '../app.css';
  
  // Child content slot
  let { children } = $props();
</script>

<svelte:head>
  <title>Manifold CAD</title>
  <meta name="description" content="Professional CAD application based on Manifold-3D" />
</svelte:head>

{@render children()}
