<script>
  import { toasts, removeToast } from '$lib/stores/app.js';
</script>

{#if $toasts.length > 0}
  <div class="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[90%] max-w-sm">
    {#each $toasts as toast (toast.id)}
      <div
        class="px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white flex items-center justify-between
          {toast.type === 'error' ? 'bg-red-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-emerald-600'}"
        role="alert"
      >
        <span>{toast.message}</span>
        <button
          onclick={() => removeToast(toast.id)}
          class="ml-3 text-white/80 hover:text-white cursor-pointer"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    {/each}
  </div>
{/if}
