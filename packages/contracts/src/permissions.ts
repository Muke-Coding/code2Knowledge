/** 页面、角色树和按钮共用的只读权限注册表；前端判定仅控制体验，服务端逐请求校验动作与对象范围。 */
import source from './permissions.json' with { type: 'json' };
/** 已实现目录，包含升级映射；旧manage码仅用于迁移，不可作为新角色动作。 */
export const permissionCatalog = source;
/**
 * 收集显式动作必需的前置项，供角色编辑器同步勾选；不会选择无关写权限。
 * @param codes 用户明确选择的细分动作，允许空数组
 * @returns 去重排序的动作及前置列表，原数组不修改
 */
export function permissionPrerequisites(codes: string[]): string[] {
  const result = new Set(codes); let changed = true;
  while (changed) { changed = false; for (const code of [...result]) for (const dependency of source.dependencies[code as keyof typeof source.dependencies] ?? []) if (!result.has(dependency)) { result.add(dependency); changed = true; } }
  return [...result].sort();
}
/**
 * 从编辑选择中移除依赖已取消动作的操作，避免提交悬空角色；取消不会偷偷重新勾回。
 * @param codes 取消勾选后的显式动作列表，可为空
 * @returns 删除悬空操作后的稳定集合，不增加权限
 */
export function validPermissionSelection(codes: string[]): string[] {
  const result = new Set(codes); let changed = true;
  while (changed) { changed = false; for (const code of [...result]) if ((source.dependencies[code as keyof typeof source.dependencies] ?? []).some((dependency) => !result.has(dependency))) { result.delete(code); changed = true; } }
  return [...result].sort();
}
