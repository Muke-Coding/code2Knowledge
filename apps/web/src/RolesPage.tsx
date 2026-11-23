/** 企业角色管理页面；复用工作区表格与弹窗，动作资格与系统资源范围分离，内置角色只读。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Grid, Empty, Form, Input, Popconfirm, Popover, Space, Table, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { permissionCatalog, type Session, type Permission, type Role } from '@c2k/contracts';
import { deleteRole, failureMessage, listPermissions, listRoles, saveRole, type RoleInput } from './api';
import SettingsDialog from './SettingsDialog';
import SettingsFilters from './SettingsFilters';
import PermissionTree from './PermissionTree';
import { useList } from './use-list';

/** 页面身份参数，客户端仅控制展示。 */
interface PageProps {
  /** 当前登录会话，不为空。 */
  session: Session;
}
/** @param props 当前有效身份 @returns 可编辑自定义角色、只读基础角色和真实动作选择器，权限由Java重新判定。 */
export default function RolesPage(props: PageProps) {
  const { session } = props;
  const wide = Grid.useBreakpoint().md ?? false;
  const { items, loading, error, reload } = useList(listRoles);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [form] = Form.useForm<RoleInput>();
  const saving = useRef(false);
  const [query, setQuery] = useState(''), [keyword, setKeyword] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const filtered = items.filter((role) => `${role.name} ${role.description}`.toLowerCase().includes(keyword.toLowerCase()));
  // 权限目录失败即禁用编辑，不能把加载失败误当成空权限后覆盖服务端。
  useEffect(() => { let active = true; listPermissions().then((values) => {
    // 部署前后端版本不一致时禁止编辑，不能把未知动作静默丢掉后覆盖角色。
    if (JSON.stringify(values.map((item) => item.code).sort()) !== JSON.stringify(permissionCatalog.permissions.map((item) => item.code).sort())) throw new Error('权限目录版本不一致，请刷新页面或联系管理员完成部署');
    if (active) setPermissions(values);
  }).catch((reason) => { if (active) setCatalogError(reason instanceof Error && reason.message.startsWith('权限目录版本') ? reason.message : failureMessage(reason)); }); return () => { active = false; }; }, []);
  /** @param role 自定义角色；null创建新角色。 @returns 打开已初始化表单，不复用上一次输入。 */
  function show(role: Role | null): void {
    setEditing(role); setMutationError(''); form.resetFields();
    form.setFieldsValue(role ? { name: role.name, description: role.description, permissions: [...role.permissions] } : { name: '', description: '', permissions: [] }); setOpen(true);
  }
  /** @param values 已完成表单校验的角色输入。 @returns 保存后重读列表；冲突保留输入供人工刷新确认。 */
  async function submit(values: RoleInput): Promise<void> {
    if (saving.current) return; saving.current = true; setBusy(true); setMutationError('');
    try { await saveRole({ ...values, description: values.description ?? '', permissions: values.permissions ?? [], ...(editing ? { revision: editing.revision } : {}) }, editing?.id); setOpen(false); form.resetFields(); await reload(); }
    catch (reason) { setMutationError(failureMessage(reason)); }
    finally { saving.current = false; setBusy(false); }
  }
  /** @param role 当前列表自定义角色，不为空。 @returns 删除后重读；有引用则保留角色并提示先撤分配。 */
  async function remove(role: Role): Promise<void> {
    if (saving.current) return; saving.current = true; setRowBusy(role.id); setMutationError('');
    try { await deleteRole(role.id, role.revision); await reload(); }
    catch (reason) { setMutationError(failureMessage(reason)); }
    finally { saving.current = false; setRowBusy(''); }
  }
  return <section className="settings-page">
    <header className="page-heading"><h1>角色与权限</h1></header>
    <SettingsFilters onSearch={() => { setKeyword(query.trim()); setPage(1); }} onReset={() => { setQuery(''); setKeyword(''); setPage(1); }} loading={loading}><Form.Item label="角色信息"><Input aria-label="搜索角色" placeholder="搜索角色名称、说明" allowClear value={query} onChange={(event) => setQuery(event.target.value)} /></Form.Item></SettingsFilters>
    <div className="settings-actions"><span className="settings-result-count">{loading ? '正在加载' : `${items.length} 个角色`}</span><Space><Button aria-label="刷新角色" icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={() => void reload()}>刷新</Button>{session.permissions.includes('role.create') && <Button type="primary" icon={<PlusOutlined aria-hidden />} disabled={!permissions.length || !!catalogError} onClick={() => show(null)}>创建角色</Button>}</Space></div>
    {catalogError && <Alert role="alert" type="error" message={catalogError} action={<Button onClick={() => window.location.reload()}>重试</Button>} className="form-alert" />}
    {!open && mutationError && <Alert role="alert" type="error" message={mutationError} className="form-alert" />}
    {error ? <Alert role="alert" type="error" message={error} action={<Button onClick={() => void reload()}>重试</Button>} /> : <div className="data-surface">
      <Table<Role> rowKey="id" dataSource={filtered} loading={loading} pagination={{ current: Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))), pageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `共 ${total} 个角色`, onChange: (next, size) => { setPage(size !== pageSize ? 1 : next); setPageSize(size); } }} scroll={{ x: 650 }} locale={{ emptyText: <Empty description="暂无角色" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} columns={[
        { title: '角色名称', dataIndex: 'name', width: 200, ellipsis: true, render: (name: string, role: Role) => <span><span>{name}</span> {role.builtIn && <Tag>内置</Tag>}</span> },
        { title: '说明', dataIndex: 'description', ellipsis: true, render: (value: string) => value || '—' },
        { title: '权限动作', key: 'permissions', width: 230, render: (_, role) => role.permissions.length ? <Popover trigger="click" title="权限动作" content={<div className="permission-summary">{role.permissions.map((code) => <div key={code}><span>{permissions.find((item) => item.code === code)?.name ?? code}</span><code>{code}</code></div>)}</div>}><Button type="link" aria-label={`查看${role.permissions.length}项权限`}>{role.permissions.length} 项权限</Button></Popover> : <span className="cell-secondary">无附加动作</span> },
        { title: '操作', key: 'actions', width: 150, fixed: wide ? 'right' : false, render: (_, role) => role.builtIn ? <Tooltip title="基础身份由系统保护，不经自定义角色入口修改"><span className="cell-secondary">只读</span></Tooltip> : <Space size={0}>{session.permissions.includes('role.update') && <Button type="link" disabled={!permissions.length || !!rowBusy} onClick={() => show(role)}>编辑</Button>}{session.permissions.includes('role.delete') && <Popconfirm title={`删除“${role.name}”？`} description="删除后不可恢复；已有成员引用时会拒绝删除。" okText="删除" cancelText="取消" onConfirm={() => remove(role)}><Button type="link" danger loading={rowBusy === role.id}>删除</Button></Popconfirm>}</Space> },
      ]} />
    </div>}
    <SettingsDialog title={editing ? '编辑角色' : '创建角色'} open={open} busy={busy} onOpened={(visible) => { setEntered(visible); if (visible) requestAnimationFrame(() => form.getFieldInstance('name')?.focus()); }} width={720} onSave={() => form.submit()} saveText="保存角色" saveDisabled={!permissions.length || !entered} isDirty={() => form.isFieldsTouched()} onClose={() => { setOpen(false); form.resetFields(); }}>
      {mutationError && <Alert role="alert" type="error" message={mutationError} className="form-alert" />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy || !entered} requiredMark={false}>
        <Form.Item name="name" label="角色名称" rules={[{ required: true, whitespace: true, max: 80, message: '请输入1到80字符的角色名' }]}><Input maxLength={80} autoFocus /></Form.Item>
        <Form.Item name="description" label="职责说明" rules={[{ max: 300 }]}><Input.TextArea maxLength={300} rows={2} /></Form.Item>
        <Form.Item name="permissions" label={<span>权限动作 <Tooltip title="角色决定可做什么，系统目录读取仍须另行授予资源范围；不含知识或源码读取权。"><InfoCircleOutlined aria-label="权限范围说明" /></Tooltip></span>}>
          <PermissionTree permissions={permissions} disabled={busy || !entered} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(previous, current) => previous.permissions !== current.permissions}>{({ getFieldValue }) => (getFieldValue('permissions') as string[] | undefined)?.some((code) => code.startsWith('role.') && code !== 'role.read') ? <Alert type="warning" showIcon message="角色编辑或分配可委派其他权限，请仅授予可信管理员。" className="form-alert" /> : null}</Form.Item>
      </Form>
    </SettingsDialog>
  </section>;
}
