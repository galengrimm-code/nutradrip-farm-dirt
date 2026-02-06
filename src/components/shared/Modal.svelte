<script>
  export let title = '';
  export let onclose = () => {};

  function handleKeydown(e) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Backdrop -->
<button
  class="fixed inset-0 bg-black/50 z-[2000] cursor-default"
  onclick={onclose}
  aria-label="Close modal"
></button>

<!-- Modal -->
<div class="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
            md:w-full md:max-w-lg md:max-h-[85vh] z-[2001] bg-white rounded-xl shadow-2xl
            flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0">
    <h2 class="text-base font-semibold text-slate-800">{title}</h2>
    <button
      class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-lg"
      onclick={onclose}
      aria-label="Close"
    >&times;</button>
  </div>

  <!-- Content (scrollable) -->
  <div class="flex-1 overflow-y-auto p-5">
    <slot />
  </div>

  <!-- Footer slot -->
  {#if $$slots.footer}
    <div class="px-5 py-3 border-t border-slate-200 shrink-0">
      <slot name="footer" />
    </div>
  {/if}
</div>
