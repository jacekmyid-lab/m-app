<!--
  ============================================================================
  MAIN APPLICATION PAGE
  ============================================================================
  
  This is the entry point for the CAD application. It orchestrates all major
  UI components and initializes the application state.
  
  Layout:
  ┌──────────────────────────────────────────────────────────────┐
  │                         TOOLBAR                               │
  ├──────────────┬─────────────────────────────┬─────────────────┤
  │              │                             │                 │
  │   LEFT       │       VIEWPORT              │   RIGHT         │
  │   PANEL      │       (3D View)             │   PANEL         │
  │              │                             │                 │
  │  - Tree      │                             │  - Properties   │
  │  - Tools     │                             │  - Plane Setup  │
  │              │                             │                 │
  ├──────────────┴─────────────────────────────┴─────────────────┤
  │                        STATUS BAR                             │
  └──────────────────────────────────────────────────────────────┘
  
  @component +page.svelte
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from '../lib/ui/Toolbar.svelte';
  import LeftPanel from '../lib/ui/LeftPanel.svelte';
  import RightPanel from '../lib/ui/RightPanel.svelte';
  import StatusBar from '../lib/ui/StatusBar.svelte';
  import Viewport from '../lib/viewport/Viewport.svelte';
  import { geometryComputer } from '../lib/geometry/GeometryComputer';
  import { documentStore, toolStore, selectionModeStore } from '$lib/stores/cadStore';

  // Application initialization state
  let initialized = $state(false);
  let initError = $state<string | null>(null);

  /**
   * Initialize the application
   * - Load Manifold WASM module
   * - Set up event listeners
   * - Create default document
   */
  onMount(async () => {
    try {
      console.log('[App] Starting initialization...');
      console.log('[App] Environment:', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      });

      // Add timeout to detect hanging initialization
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Initialization timeout after 30 seconds')), 30000);
      });

      // Initialize geometry computer (loads Manifold)
      console.log('[App] Calling geometryComputer.initialize()...');
      const result = await Promise.race([
        geometryComputer.initialize(),
        timeoutPromise
      ]);

      console.log('[App] Initialize result:', result);

      if (!result.success) {
        initError = result.error;
        console.error('[App] Initialization failed:', initError);
        return;
      }

      initialized = true;
      console.log('[App] Initialized successfully');
    } catch (error) {
      initError = `Initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[App] Initialization error:', error);

      // Log stack trace if available
      if (error instanceof Error && error.stack) {
        console.error('[App] Stack trace:', error.stack);
      }
    }
  });
</script>

{#if !initialized}
  <!-- Loading Screen -->
  <div class="cad-loading-screen">
    <div class="cad-loading-content">
      <div class="cad-loading-logo">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <rect x="8" y="8" width="48" height="48" rx="4" stroke="currentColor" stroke-width="2"/>
          <path d="M20 32L28 24L36 32L44 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <circle cx="32" cy="40" r="6" stroke="currentColor" stroke-width="2"/>
        </svg>
      </div>
      <h1 class="cad-loading-title">Manifold CAD</h1>

      {#if initError}
        <div class="cad-loading-error">
          <p>Nie udało się zainicjalizować aplikacji:</p>
          <code>{initError}</code>
          <div class="error-hint">
            <p>Sprawdź konsolę przeglądarki (F12) aby zobaczyć więcej szczegółów.</p>
            <p>Możliwe przyczyny:</p>
            <ul>
              <li>Problem z ładowaniem modułu WASM</li>
              <li>Niekompatybilna przeglądarka</li>
              <li>Blokada przez Content Security Policy</li>
            </ul>
          </div>
        </div>
      {:else}
        <div class="cad-spinner"></div>
        <p class="cad-loading-text">Ładowanie silnika geometrii...</p>
        <p class="cad-loading-subtext">Inicjalizacja WebAssembly modułu Manifold-3D</p>
      {/if}
    </div>
  </div>
{:else}
  <!-- Main Application -->
  <div class="cad-app">
    <!-- Top Toolbar -->
    <Toolbar />
    
    <!-- Left Panel: Tree & Tools -->
    <LeftPanel />
    
    <!-- Center: 3D Viewport -->
    <Viewport />
    
    <!-- Right Panel: Properties -->
    <RightPanel />
    
    <!-- Bottom Status Bar -->
    <StatusBar />
  </div>
{/if}

<style>
  /* Loading Screen Styles */
  .cad-loading-screen {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  }

  .cad-loading-content {
    text-align: center;
    color: #f1f5f9;
  }

  .cad-loading-logo {
    color: #3b82f6;
    margin-bottom: 24px;
    animation: pulse 2s ease-in-out infinite;
  }

  .cad-loading-title {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 24px;
    letter-spacing: 2px;
  }

  .cad-loading-text {
    font-size: 14px;
    color: #94a3b8;
    margin-top: 16px;
    margin-bottom: 4px;
  }

  .cad-loading-subtext {
    font-size: 12px;
    color: #64748b;
    font-style: italic;
  }

  .cad-loading-error {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid #ef4444;
    border-radius: 8px;
    padding: 16px;
    margin-top: 16px;
    max-width: 500px;
    text-align: left;
  }

  .cad-loading-error p {
    color: #ef4444;
    margin-bottom: 8px;
  }

  .cad-loading-error code {
    font-size: 12px;
    color: #f1f5f9;
    display: block;
    background-color: rgba(0, 0, 0, 0.3);
    padding: 8px;
    border-radius: 4px;
    word-break: break-all;
    margin-bottom: 12px;
  }

  .error-hint {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(239, 68, 68, 0.3);
  }

  .error-hint p {
    color: #94a3b8;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .error-hint ul {
    list-style: disc;
    padding-left: 24px;
    margin: 8px 0;
  }

  .error-hint li {
    color: #94a3b8;
    font-size: 12px;
    margin: 4px 0;
  }

  @keyframes pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.8;
    }
  }
</style>
