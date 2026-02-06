<script>
  export let icon = '';
  export let title = 'No data';
  export let message = '';
</script>

<div class="flex flex-col items-center justify-center py-12 px-6 text-center">
  {#if icon}
    <span class="text-4xl mb-3">{icon}</span>
  {/if}
  <p class="text-lg font-medium text-slate-600">{title}</p>
  {#if message}
    <p class="text-sm text-slate-400 mt-1 max-w-sm">{message}</p>
  {/if}
  {#if $$slots.default}
    <div class="mt-4">
      <slot />
    </div>
  {/if}
</div>
