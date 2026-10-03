import {
  evaluatePermission,
  PermissionRoleMap,
  SubjectType,
} from 'nocodb-sdk';
import type {
  PermissionEntity,
  PermissionGrantedType,
  PermissionKey,
  PermissionRole,
  ProjectRoles,
  WorkspaceUserRoles,
} from 'nocodb-sdk';
import type { NcContext } from '~/interface/config';
import Noco from '~/Noco';
import { MetaTable } from '~/utils/globals';

export default class Permission {
  id: string;
  fk_workspace_id: string;
  base_id: string;
  entity: PermissionEntity;
  entity_id: string;
  permission: PermissionKey;
  created_by: string;
  enforce_for_form: boolean;
  enforce_for_automation: boolean;
  granted_type: PermissionGrantedType;
  granted_role: PermissionRole;

  subjects?: {
    type: 'user' | 'team';
    id: string;
  }[];

  constructor(permission: Permission) {
    Object.assign(this, permission);
  }

  /**
   * All permission rows configured for a base, each with its subject list
   * attached.
   *
   * Truva: upstream ships this as `return []` because enforcement is an
   * Enterprise feature. We read the real `nc_permissions` rows so the
   * `checkPermission()` hook in BaseModelSqlv2 can gate writes — this is what
   * replaces the fork's old `disabled_actions` CSV column on MODELS/COLUMNS.
   */
  public static async list(
    context: NcContext,
    baseId: string,
    ncMeta = Noco.ncMeta,
  ): Promise<Permission[]> {
    const permissions = await ncMeta.metaList2(
      context.workspace_id,
      baseId,
      MetaTable.PERMISSIONS,
      {},
    );

    if (!permissions?.length) return [];

    const subjectRows = await ncMeta.metaList2(
      context.workspace_id,
      baseId,
      MetaTable.PERMISSION_SUBJECTS,
      {},
    );

    const subjectsByPermission = new Map<
      string,
      { type: 'user' | 'team'; id: string }[]
    >();

    for (const row of subjectRows ?? []) {
      const list = subjectsByPermission.get(row.fk_permission_id) ?? [];
      list.push({ type: row.subject_type, id: row.subject_id });
      subjectsByPermission.set(row.fk_permission_id, list);
    }

    return permissions.map(
      (p) =>
        new Permission({
          ...p,
          subjects: subjectsByPermission.get(p.id) ?? [],
        }),
    );
  }

  /**
   * Whether `user` satisfies `permissionObj`.
   *
   * The decision itself lives in the SDK's `evaluatePermission`, which the
   * frontend (`usePermissions`) uses too — sharing it is the only way the two
   * can't drift. We only resolve the inputs here.
   *
   * Team-subject matching is deliberately not implemented: resolving team
   * membership needs a DB-backed descendant expansion that Community Edition
   * has no schema for. Passing `matchedTeamSubject: false` means a grant naming
   * only teams denies everyone, which fails closed rather than open.
   */
  static async isAllowed(
    _context: NcContext,
    permissionObj: Permission,
    user: {
      id: string;
      role: ProjectRoles | WorkspaceUserRoles;
      is_agent?: boolean;
    },
  ): Promise<boolean> {
    // No rule configured for this entity ⇒ nothing to enforce.
    if (!permissionObj) return true;

    // An unauthenticated caller can never satisfy a configured restriction.
    if (!user) return false;

    return evaluatePermission(permissionObj, {
      userId: user.id,
      subjectType: user.is_agent ? SubjectType.AGENT : SubjectType.USER,
      permissionRole: PermissionRoleMap[user.role],
      matchedTeamSubject: false,
    });
  }
}
