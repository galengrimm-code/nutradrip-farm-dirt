<script>
  import Modal from './Modal.svelte';

  export let title = 'Confirm';
  export let message = 'Are you sure?';
  export let confirmText = 'Yes';
  export let cancelText = 'Cancel';
  export let destructive = false;
  export let onconfirm = () => {};
  export let oncancel = () => {};
</script>

<Modal title={title} onclose={oncancel}>
  <p class="text-sm text-slate-600">{message}</p>

  <svelte:fragment slot="footer">
    <div class="flex gap-3">
      <button onclick={oncancel}
        class="flex-1 py-2.5 border border-slate-300 text-slate-700 font-semibold rounded-lg min-h-[44px] cursor-pointer hover:bg-slate-50 transition-colors">
        {cancelText}
      </button>
      <button onclick={onconfirm}
        class="flex-1 py-2.5 font-semibold rounded-lg min-h-[44px] cursor-pointer transition-colors
               {destructive ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800' : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'}">
        {confirmText}
      </button>
    </div>
  </svelte:fragment>
</Modal>
