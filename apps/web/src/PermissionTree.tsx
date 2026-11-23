/** 角色授权树；使用Ant Design Tree呈现目录、菜单及动作，读取与写入前置显式联动，不控制业务资源范围。 */
import { useMemo, useState } from 'react';
import { Button, Checkbox, Input, Space, Tree, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { permissionCatalog, permissionPrerequisites, validPermissionSelection } from '@c2k/contracts';
import type { Permission } from '@c2k/contracts';
import type { DataNode } from 'antd/es/tree';
/** 表单受控树参数；权限目录失败时由上层禁用整个编辑。 */
interface PermissionTreeProps {
  /** 角色显式动作，undefined按空数组。 */
  value?: string[];
  /** 更新显式动作及必需前置；不持久化数据。 */
  onChange?: (value: string[]) => void;
  /** 服务端实际动作列表，用于阻止客户端注册表凭空添加权限。 */
  permissions: Permission[];
  /** 保存期间禁用树。 */
  disabled?: boolean;
}
/** @param props 角色当前选择及服务端目录 @returns 可搜索、父子选择、半选状态与前置联动的权限树 */
export default function PermissionTree(props: PermissionTreeProps) {
  const { value = [], onChange, permissions, disabled } = props; const [query, setQuery] = useState(''), [closed, setClosed] = useState<string[]>([]);
  const nodes = useMemo(() => {
    const allowed = new Set(permissions.map((item) => item.code));
    return ['knowledge', 'runtime', 'enterprise'].flatMap((group) => {
      const menus: DataNode[] = permissionCatalog.menus.filter((item) => item.group === group).flatMap((menu) => {
        const actions: DataNode[] = permissionCatalog.permissions.filter((item) => item.module === menu.key && allowed.has(item.code)).filter((item) => !query || `${menu.title} ${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase())).map((item) => ({ key: item.code, title: <Space size={6}><span>{item.name}</span><Tooltip title={`${item.code}：${item.description}`}><InfoCircleOutlined aria-label={`${item.name}权限说明`} tabIndex={0} /></Tooltip></Space> }));
        return actions.length ? [{ key: `menu:${menu.key}`, title: menu.title, children: actions }] : [];
      });
      return menus.length ? [{ key: `group:${group}`, title: permissionCatalog.menus.find((item) => item.group === group)!.groupTitle, children: menus }] : [];
    });
  }, [permissions, query]);
  const parentKeys = nodes.flatMap((node) => [String(node.key), ...(node.children ?? []).map((child) => String(child.key))]);
  const expanded = parentKeys.filter((key) => !closed.includes(key));
  return <div className="permission-tree"><div className="permission-tree-toolbar"><Checkbox aria-label="全选权限" disabled={disabled ?? false} checked={permissions.length > 0 && permissions.every((permission) => value.includes(permission.code))} indeterminate={value.length > 0 && !permissions.every((permission) => value.includes(permission.code))} onChange={(event) => onChange?.(event.target.checked ? permissionPrerequisites(permissions.map((permission) => permission.code)) : [])}>全选 / 全不选</Checkbox><Button type="text" size="small" disabled={disabled ?? false} onClick={() => setClosed(expanded.length ? parentKeys : [])}>{expanded.length ? '折叠权限' : '展开权限'}</Button></div><Input.Search disabled={disabled ?? false} aria-label="搜索权限" placeholder="搜索页面、操作或权限码" allowClear onChange={(event) => { setQuery(event.target.value); setClosed([]); }} /><Tree aria-label="角色权限树" checkable disabled={disabled ?? false} expandedKeys={expanded} onExpand={(keys) => setClosed(parentKeys.filter((key) => !keys.includes(key)))} treeData={nodes} checkedKeys={value} onCheck={(keys, info) => { const selected = (Array.isArray(keys) ? keys : keys.checked).map(String).filter((code) => permissions.some((item) => item.code === code)); const hidden = query ? value.filter((code) => !permissionCatalog.permissions.some((item) => item.code === code && `${permissionCatalog.menus.find((menu) => menu.key === item.module)?.title} ${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()))) : []; onChange?.(info.checked ? permissionPrerequisites([...hidden, ...selected]) : validPermissionSelection([...hidden, ...selected])); }} /><Typography.Text type="secondary">勾选操作会同步选择必要前置权限；资源范围另行授权。</Typography.Text></div>;
}
