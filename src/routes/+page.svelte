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
  export const prerender = true;

  import { onMount } from 'svelte';

  // Lazy load components
  let Toolbar: any;
  let LeftPanel: any;
  let RightPanel: any;
  let StatusBar: any;
  let Viewport: any;

  // Application initialization state
  let initialized = $state(false);
  let initError = $state<string | null>(null);
  let showScreen = $state(true);

  onMount(async () => {
    try {
      console.log('[App] Starting initialization...');

      // Load components dynamically
      Toolbar = (await import('../lib/ui/Toolbar.svelte')).default;
      LeftPanel = (await import('../lib/ui/LeftPanel.svelte')).default;
      RightPanel = (await import('../lib/ui/RightPanel.svelte')).default;
      StatusBar = (await import('../lib/ui/StatusBar.svelte')).default;
      Viewport = (await import('../lib/viewport/Viewport.svelte')).default;

      console.log('[App] Components loaded');

      // Now load geometry computer
      const { geometryComputer } = await import('../lib/geometry/GeometryComputer');

      console.log('[App] Initializing geometry computer...');
      const result = await geometryComputer.initialize();

      if (!result.success) {
        initError = result.error;
        console.error('[App] Initialization failed:', initError);
        return;
      }

      console.log('[App] Loading stores...');
      const { documentStore } = await import('$lib/stores/cadStore');

      initialized = true;
      showScreen = false;
      console.log('[App] Initialized successfully');
    } catch (error) {
      initError = `Initialization failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[App] Initialization error:', error);
    }
  });
</script>

{#if showScreen && !initialized}
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
{:else if initialized && Toolbar && LeftPanel && RightPanel && StatusBar && Viewport}
  <!-- Main Application -->
  <div class="cad-app">
    <svelte:component this={Toolbar} />
    <svelte:component this={LeftPanel} />
    <svelte:component this={Viewport} />
    <svelte:component this={RightPanel} />
    <svelte:component this={StatusBar} />
  </div>
{:else if !initialized}
  <!-- Fallback loading screen if components failed to load -->
  <div class="cad-loading-screen">
    <div class="cad-loading-content">
      <h1 class="cad-loading-title">Manifold CAD</h1>
      {#if initError}
        <p style="color: #ef4444; margin-top: 16px;">{initError}</p>
      {:else}
        <div class="cad-spinner" style="margin-top: 16px;"></div>
        <p class="cad-loading-text">Ładowanie aplikacji...</p>
      {/if}
    </div>
  </div>
{:else}
  <!-- Error state -->
  <div class="cad-loading-screen">
    <div class="cad-loading-content">
      <h1 class="cad-loading-title">Błąd</h1>
      <p style="color: #ef4444; margin-top: 16px;">Nie udało się załadować komponentów aplikacji.</p>
    </div>
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
