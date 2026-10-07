import {
  type ColumnType,
  DisabledActionsType,
  PermissionEntity,
  PermissionKey,
  PermissionOptionValue,
  PermissionOptions,
  type TableType,
  getPermissionIcon,
  getPermissionLabel,
  getPermissionOption,
  isActionDisabled,
} from 'nocodb-sdk'

// Re-export the interface from SDK for backward compatibility
export type { PermissionOption } from 'nocodb-sdk'

/**
 * Which `disabled_actions` entry each permission key corresponds to.
 *
 * Only write permissions map — visibility keys have no `disabled_actions`
 * equivalent, and an unmapped key is simply never blocked by this mechanism.
 */
const PERMISSION_KEY_TO_DISABLED_ACTION: Partial<Record<PermissionKey, DisabledActionsType>> = {
  [PermissionKey.TABLE_RECORD_ADD]: DisabledActionsType.INSERT,
  [PermissionKey.TABLE_RECORD_DELETE]: DisabledActionsType.DELETE,
  [PermissionKey.RECORD_FIELD_EDIT]: DisabledActionsType.UPDATE,
}

export const usePermissions = () => {
  // Use centralized permission options from SDK
  const permissionOptions = PermissionOptions

  const { metasWithIdAsKey } = useMetas()

  /**
   * Fields that carry a non-empty `disabled_actions`, indexed by field id.
   *
   * `isAllowed` is called from render paths (every grid cell, every context
   * menu item), so the reverse field lookup is built once per meta change
   * rather than scanning every table's columns per call. Only guarded fields
   * are indexed — in the common case where nothing is disabled this stays
   * empty and lookups miss immediately.
   */
  const guardedFieldsById = computed<Record<string, ColumnType>>(() => {
    const index: Record<string, ColumnType> = {}

    for (const meta of Object.values(metasWithIdAsKey.value ?? {}) as TableType[]) {
      for (const column of meta?.columns ?? []) {
        if (column?.id && column.disabled_actions) {
          index[column.id] = column
        }
      }
    }

    return index
  })

  // Permissions data grouped by entity
  const permissionsByEntity = computed<Record<string, any[]>>(() => {
    return {}
  })

  // Get permission summary for an entity (returns internal value)
  const getPermissionSummary = (..._args: any[]) => {
    return PermissionOptionValue.EDITORS_AND_UP
  }

  // Get permission summary with display label
  const getPermissionSummaryLabel = (entity: string, entityId: string, permissionType: string) => {
    const internalValue = getPermissionSummary(entity, entityId, permissionType)
    return getPermissionLabel(internalValue)
  }

  /**
   * Whether the current user may perform `permission` on the given entity.
   *
   * Truva: role-based grants are an Enterprise feature and still resolve to
   * allowed here. What this does enforce is `disabled_actions` — the CSV
   * switch on a table or field that turns an action off for everyone — so the
   * UI greys the control out instead of letting the user click through to a
   * backend rejection.
   */
  const isAllowed = (entity?: PermissionEntity, entityId?: string, permission?: PermissionKey, ..._rest: any[]) => {
    if (!entity || !entityId || !permission) return true

    const action = PERMISSION_KEY_TO_DISABLED_ACTION[permission]
    if (!action) return true

    if (entity === PermissionEntity.TABLE) {
      return !isActionDisabled(metasWithIdAsKey.value?.[entityId]?.disabled_actions, action)
    }

    if (entity === PermissionEntity.FIELD) {
      return !isActionDisabled(guardedFieldsById.value[entityId]?.disabled_actions, action)
    }

    return true
  }

  const getPermissionColor = (..._args: any[]): string => {
    return 'gray'
  }

  const getPermissionTextColor = (..._args: any[]): string => {
    return 'text-gray-700'
  }

  return {
    permissionOptions,
    permissionsByEntity,
    getPermissionOption,
    getPermissionLabel,
    getPermissionIcon,
    getPermissionColor,
    getPermissionTextColor,
    getPermissionSummary,
    getPermissionSummaryLabel,
    isAllowed,
  }
}
