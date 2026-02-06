<script>
  import { DEFAULT_ALIASES, STANDARD_FIELDS } from '$lib/core/import-utils.js';

  let columnAliases = JSON.parse(localStorage.getItem('columnAliases') || '{}');
  let hiddenBuiltInAliases = JSON.parse(localStorage.getItem('hiddenBuiltInAliases') || '{}');
  let newAliasInputs = {};

  function getBuiltInAliases(field) {
    const builtIn = DEFAULT_ALIASES[field] || [];
    const hidden = hiddenBuiltInAliases[field] || [];
    return builtIn.filter(a => !hidden.includes(a));
  }

  function getUserAliases(field) {
    return columnAliases[field] || [];
  }

  function addAlias(field) {
    const alias = (newAliasInputs[field] || '').trim();
    if (!alias) return;

    if (!columnAliases[field]) columnAliases[field] = [];
    if (!columnAliases[field].includes(alias)) {
      columnAliases[field] = [...columnAliases[field], alias];
      localStorage.setItem('columnAliases', JSON.stringify(columnAliases));
      columnAliases = { ...columnAliases };
    }
    newAliasInputs[field] = '';
    newAliasInputs = { ...newAliasInputs };
  }

  function removeAlias(field, alias) {
    if (!columnAliases[field]) return;
    columnAliases[field] = columnAliases[field].filter(a => a !== alias);
    if (columnAliases[field].length === 0) delete columnAliases[field];
    localStorage.setItem('columnAliases', JSON.stringify(columnAliases));
    columnAliases = { ...columnAliases };
  }

  function hideBuiltIn(field, alias) {
    if (!hiddenBuiltInAliases[field]) hiddenBuiltInAliases[field] = [];
    if (!hiddenBuiltInAliases[field].includes(alias)) {
      hiddenBuiltInAliases[field] = [...hiddenBuiltInAliases[field], alias];
      localStorage.setItem('hiddenBuiltInAliases', JSON.stringify(hiddenBuiltInAliases));
      hiddenBuiltInAliases = { ...hiddenBuiltInAliases };
    }
  }

  export function restoreHidden() {
    hiddenBuiltInAliases = {};
    localStorage.removeItem('hiddenBuiltInAliases');
  }

  function handleKeydown(e, field) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAlias(field);
    }
  }
</script>

<div class="bg-white rounded-xl border border-slate-200 p-4">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-semibold text-slate-800">Column Aliases</h3>
    <button onclick={restoreHidden}
      class="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
      Restore Hidden
    </button>
  </div>
  <p class="text-xs text-slate-500 mb-3">Map alternate column names from lab reports to standard fields. Gray pills are built-in, blue pills are custom.</p>

  <div class="space-y-3 max-h-[500px] overflow-y-auto">
    {#each STANDARD_FIELDS as field}
      <div class="p-3 bg-slate-50 rounded-lg">
        <span class="text-sm font-semibold text-slate-700 block mb-1.5">{field}</span>
        <div class="flex flex-wrap gap-1.5 mb-2">
          {#each getBuiltInAliases(field) as alias}
            <span class="inline-flex items-center gap-1 px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs">
              {alias}
              <button onclick={() => hideBuiltIn(field, alias)}
                class="text-slate-400 hover:text-slate-600 cursor-pointer">&times;</button>
            </span>
          {/each}
          {#each getUserAliases(field) as alias}
            <span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
              {alias}
              <button onclick={() => removeAlias(field, alias)}
                class="text-blue-400 hover:text-blue-600 cursor-pointer">&times;</button>
            </span>
          {/each}
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            bind:value={newAliasInputs[field]}
            onkeydown={(e) => handleKeydown(e, field)}
            placeholder="Add alias..."
            class="flex-1 px-2 py-2 border border-slate-300 rounded-md text-sm text-base min-h-[44px]"
          />
          <button onclick={() => addAlias(field)}
            class="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 cursor-pointer min-h-[44px]">
            Add
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>
