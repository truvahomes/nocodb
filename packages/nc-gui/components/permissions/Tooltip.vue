<script lang="ts" setup>
import { PermissionEntity } from 'nocodb-sdk'
import type { PermissionKey } from 'nocodb-sdk'
import type { TooltipPlacement } from 'ant-design-vue/lib/tooltip'

interface Props {
  entity: PermissionEntity
  entityId?: string // required for permission check otherwise it will always return true
  permission: PermissionKey
  title?: string
  description?: string
  placement?: TooltipPlacement
  showIcon?: boolean
  showOverlay?: boolean
  defaultTooltip?: string
  showPointerEventNone?: boolean
  disabled?: boolean
  arrow?: boolean
}

const props = defineProps<Props>()

const { isAllowed: isActionAllowed } = usePermissions()

const isAllowed = computed(() => isActionAllowed(props.entity, props.entityId, props.permission))

/**
 * Why the control is unavailable. The slot consumer disables the control
 * itself; this only explains it.
 */
const reason = computed(() => {
  if (isAllowed.value) return props.defaultTooltip

  if (props.title) return props.title

  return props.entity === PermissionEntity.FIELD
    ? 'This action is disabled for this field'
    : 'This action is disabled for this table'
})
</script>

<template>
  <NcTooltip v-if="!isAllowed && !disabled" :placement="placement ?? 'right'" :arrow="arrow">
    <template #title>{{ reason }}</template>
    <slot :is-allowed="isAllowed" />
  </NcTooltip>
  <slot v-else :is-allowed="isAllowed" />
</template>
