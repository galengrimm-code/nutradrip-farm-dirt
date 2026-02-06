<script>
  export let accept = '';
  export let multiple = false;
  export let label = 'Choose files';
  export let hint = '';
  export let onfiles = () => {};

  let fileInput;
  let files = [];
  let isDragOver = false;

  function handleDragOver(e) {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    isDragOver = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragOver = false;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      files = droppedFiles;
      onfiles(files);
    }
  }

  function handleFileSelect(e) {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      files = selectedFiles;
      onfiles(files);
    }
  }

  export function clear() {
    files = [];
    if (fileInput) fileInput.value = '';
  }
</script>

<div
  class="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors min-h-[100px] flex flex-col items-center justify-center gap-2
    {isDragOver ? 'border-blue-400 bg-blue-50' : files.length ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'}"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={() => fileInput.click()}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } }}
  role="button"
  tabindex="0"
>
  {#if files.length > 0}
    <div class="text-sm text-green-700 font-medium">{files.length} file(s) selected</div>
    <div class="text-xs text-green-600">{files.map(f => f.name).join(', ')}</div>
  {:else}
    <div class="text-sm text-slate-500">{label}</div>
    {#if hint}
      <div class="text-xs text-slate-400">{hint}</div>
    {/if}
  {/if}

  <input
    type="file"
    bind:this={fileInput}
    {accept}
    {multiple}
    onchange={handleFileSelect}
    class="hidden"
  >
</div>
