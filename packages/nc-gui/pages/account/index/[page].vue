<script setup lang="ts">
const { appInfo } = useGlobal()
</script>

<template>
  <div>
    <AccountProfile v-if="$route.params.page === 'profile'" />
    <AccountToken v-else-if="$route.params.page === 'tokens'" />
    <!-- Nav hides the entry, but the route is still typeable: gate it here too. -->
    <AccountMcp v-else-if="$route.params.page === 'mcp' && appInfo.mcpEnabled" />
    <span v-else></span>
  </div>
</template>
