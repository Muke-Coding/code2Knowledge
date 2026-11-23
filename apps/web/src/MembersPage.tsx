/** 企业用户管理；参考OpenDevFlow的部门树与列表布局，保留当前创建、启停和角色分配能力，管理动作不自动获得资源内容。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Grid, Empty, Form, Input, Popconfirm, Select, Space, Table, Tag, Tree } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { Department, Member, MemberDirectory, Session } from '@c2k/contracts';
import { listMembers, listDepartments, listMemberDirectory, createMember, setMemberStatus, failureMessage } from './api';
import { useList } from './use-list';
import { departmentTree } from './DepartmentsPage';
import MemberRolesDrawer from './MemberRolesDrawer';
import SettingsDialog from './SettingsDialog';
import SettingsFilters from './SettingsFilters';
/** 公开身份只控制界面展示，Java逐次校验动作资格。 */
interface Props {
  /** 当前服务端会话，不为空。 */
  session: Session;
}
/** 新成员输入；初始密码只存在于本次表单及请求中。 */
interface MemberInput {
  /** 3到64位小写登录名，不允许空。 */
  username: string;
  /** 1到80字符的显示名称，不允许空。 */
  displayName: string;
  /** 16到72个非空格ASCII字符。 */
  password: string;
}
/** @param props 当前公开身份 @returns 部门筛选、成员列表及受权限控制的操作，部门读取失败不冒充未分配 */
export default function MembersPage(props: Props) {
  const { session } = props;
  const wide = Grid.useBreakpoint().md ?? false;
  const manage = session.permissions.includes('member.create');
  const assign = session.permissions.includes('role.assign');
  const readDepartments = session.permissions.includes('department.read');
  const [roleMember, setRoleMember] = useState<Member | null>(null);
  const roleTrigger = useRef<HTMLElement | null>(null);
  const { items, loading, error, reload } = useList(listMembers);
  const [departments, setDepartments] = useState<Department[]>([]), [directory, setDirectory] = useState<MemberDirectory[]>([]);
  const [orgLoading, setOrgLoading] = useState(readDepartments), [orgError, setOrgError] = useState(''), [attempt, setAttempt] = useState(0);
  const [department, setDepartment] = useState('all'), [departmentQuery, setDepartmentQuery] = useState('');
  const [query, setQuery] = useState(''), [status, setStatus] = useState<string>(), [filter, setFilter] = useState({ query: '', status: '' });
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [mutationError, setMutationError] = useState(''), [rowBusy, setRowBusy] = useState('');
  const [form] = Form.useForm<MemberInput>();
  const saving = useRef(false);
  // 批量读取避免每成员一个请求；失败清除旧关联，不将网络或撤权错误解释成“未分配”。
  useEffect(() => {
    let active = true; setDepartments([]); setDirectory([]); setOrgError(''); setDepartment('all');
    if (!readDepartments) { setOrgLoading(false); return; }
    setOrgLoading(true);
    Promise.all([listDepartments(), listMemberDirectory()]).then(([rows, links]) => { if (active) { setDepartments(rows); setDirectory(links); } }).catch((reason) => { if (active) setOrgError(failureMessage(reason)); }).finally(() => { if (active) setOrgLoading(false); });
    return () => { active = false; };
  }, [readDepartments, attempt]);
  /** @returns 重新读取成员及部门关联，不保留可能失效的部门结果 */
  function refresh(): void { void reload(); setAttempt((value) => value + 1); }
  /** @returns 原子应用当前筛选草稿并回到第一页，部门选择保持独立 */
  function search(): void { setFilter({ query: query.trim(), status: status ?? '' }); setPage(1); }
  /** @returns 清空名称、状态和部门选择，恢复全部成员 */
  function reset(): void { setQuery(''); setStatus(undefined); setFilter({ query: '', status: '' }); setDepartment('all'); setDepartmentQuery(''); setPage(1); }
  /** @param values 校验后的成员表单 @returns 创建成功后清空密码并刷新；失败清空密码且保留其他输入 */
  async function submit(values: MemberInput): Promise<void> {
    if (saving.current) return; saving.current = true; setBusy(true); setMutationError('');
    try { await createMember(values); form.resetFields(); setOpen(false); refresh(); }
    catch (reason) { setMutationError(failureMessage(reason)); form.setFieldValue('password', ''); }
    finally { saving.current = false; setBusy(false); }
  }
  /** @param member 当前企业普通成员 @returns 修改启停并重读列表；管理员基础身份不能由此入口停用 */
  async function toggle(member: Member): Promise<void> {
    if (saving.current) return; saving.current = true; setRowBusy(member.id); setMutationError('');
    try { await setMemberStatus(member.id, !member.enabled); await reload(); }
    catch (reason) { setMutationError(failureMessage(reason)); }
    finally { saving.current = false; setRowBusy(''); }
  }
  const visible = items.filter((member) => {
    const departmentId = directory.find((link) => link.memberId === member.id)?.departmentId;
    return `${member.username} ${member.displayName}`.toLowerCase().includes(filter.query.toLowerCase()) && (!filter.status || String(member.enabled) === filter.status) && (department === 'all' || departmentId === department);
  });
  const matchedDepartments = new Set(departments.filter((row) => row.name.toLowerCase().includes(departmentQuery.toLowerCase())).map((row) => row.id));
  // 搜索部门时保留祖先上下文，用户仍能辨认同名部门的位置。
  for (const id of [...matchedDepartments]) { let parent = departments.find((row) => row.id === id)?.parentId; while (parent) { matchedDepartments.add(parent); parent = departments.find((row) => row.id === parent)?.parentId; } }
  const tree = departmentTree(departments.filter((row) => matchedDepartments.has(row.id)));
  const tableLoading = loading || orgLoading;
  return <section className="settings-page">
    <header className="page-heading"><h1>成员</h1></header>
    <SettingsFilters onSearch={search} onReset={reset} loading={tableLoading}><Form.Item label="用户信息"><Input aria-label="搜索成员" prefix={<SearchOutlined aria-hidden />} placeholder="搜索登录名、姓名" allowClear value={query} onChange={(event) => setQuery(event.target.value)} /></Form.Item><Form.Item label="状态"><Select aria-label="成员状态" placeholder="全部状态" allowClear value={status} onChange={setStatus} options={[{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }]} /></Form.Item></SettingsFilters>
    <div className="settings-actions"><span className="settings-result-count">{loading ? '正在加载' : `${items.length} 位成员`}</span><Space wrap><Button aria-label="刷新成员" icon={<ReloadOutlined aria-hidden />} loading={tableLoading} onClick={refresh}>刷新</Button>{manage && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => { setMutationError(''); form.resetFields(); setOpen(true); }}>添加成员</Button>}</Space></div>
    {!open && mutationError && <Alert type="error" role="alert" showIcon message={mutationError} className="form-alert" />}
    {error && <Alert type="error" role="alert" message={error} action={<Button onClick={refresh}>重试</Button>} className="form-alert" />}
    {orgError && <Alert type="error" role="alert" message={`部门信息加载失败：${orgError}`} action={<Button onClick={refresh}>重新加载</Button>} className="form-alert" />}
    <div className={readDepartments ? 'settings-user-layout' : ''}>
      {readDepartments && <aside className="settings-department-filter" aria-label="按部门筛选成员"><Input aria-label="搜索部门树" prefix={<SearchOutlined aria-hidden />} placeholder="搜索部门" value={departmentQuery} allowClear onChange={(event) => setDepartmentQuery(event.target.value)} /><Tree aria-label="成员部门树" blockNode defaultExpandAll key={departmentQuery || attempt} selectedKeys={[department]} treeData={[{ key: 'all', title: '全部成员' }, { key: '', title: '未分配部门' }, ...tree.map((row) => toTreeNode(row))]} disabled={orgLoading || !!orgError} onSelect={(keys) => { setDepartment(String(keys[0] ?? 'all')); setPage(1); }} /></aside>}
      <div className="data-surface"><Table<Member> rowKey="id" dataSource={error || orgError || tableLoading ? [] : visible} loading={tableLoading} pagination={{ current: Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize))), pageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (total) => `共 ${total} 位成员`, onChange: (next, size) => { setPage(size !== pageSize ? 1 : next); setPageSize(size); } }} scroll={{ x: 800 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error || orgError ? '列表加载失败' : '暂无匹配成员'} /> }} columns={[
        { title: '登录名', dataIndex: 'username', width: 160, ellipsis: true },
        { title: '姓名', dataIndex: 'displayName', width: 160, ellipsis: true },
        ...(readDepartments ? [{ title: '所属部门', key: 'department', width: 160, ellipsis: true, render: (_: unknown, member: Member) => departments.find((row) => row.id === directory.find((link) => link.memberId === member.id)?.departmentId)?.name ?? '未分配' }] : []),
        { title: '基础身份', dataIndex: 'role', width: 110, render: (role: string) => <Tag>{role === 'ADMIN' ? '管理员' : '成员'}</Tag> },
        { title: '状态', dataIndex: 'enabled', width: 100, render: (enabled: boolean) => <Tag color={enabled ? 'success' : 'default'}>{enabled ? '已启用' : '已停用'}</Tag> },
        { title: '操作', key: 'actions', width: 210, fixed: wide ? 'right' : false, render: (_, member) => member.role === 'ADMIN' ? <span className="cell-secondary">受保护</span> : <Space size={0}>{assign && <Button type="link" disabled={!!rowBusy} onClick={(event) => { roleTrigger.current = event.currentTarget; setRoleMember(member); }}>分配角色</Button>}{session.permissions.includes('member.status') && <Popconfirm title={member.enabled ? '停用此成员？' : '启用此成员？'} description={member.enabled ? '停用后，该成员的现有会话也无法继续访问。' : undefined} onConfirm={() => toggle(member)} okText="确认" cancelText="取消"><Button type="link" disabled={!!rowBusy} danger={member.enabled} loading={rowBusy === member.id}>{member.enabled ? '停用' : '启用'}</Button></Popconfirm>}</Space> },
      ]} /></div>
    </div>
    <MemberRolesDrawer member={roleMember} onClose={() => { setRoleMember(null); requestAnimationFrame(() => roleTrigger.current?.focus()); }} />
    <SettingsDialog title="添加成员" open={open} busy={busy} isDirty={() => form.isFieldsTouched()} onSave={() => form.submit()} saveText="创建成员" onClose={() => { form.resetFields(); setOpen(false); }}>
      {mutationError && <Alert role="alert" type="error" showIcon message={mutationError} className="form-alert" />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy} requiredMark={false}>
        <div className="settings-form-grid"><Form.Item name="username" label="登录名" rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9._-]{2,63}$/, message: '使用3到64位小写字母、数字、点、下划线或横线' }]}><Input maxLength={64} autoComplete="off" autoFocus /></Form.Item><Form.Item name="displayName" label="显示名称" rules={[{ required: true, whitespace: true, max: 80, message: '请输入1到80字符的名称' }]}><Input maxLength={80} /></Form.Item></div>
        <Form.Item name="password" label="初始密码" rules={[{ required: true, pattern: /^[\x21-\x7e]{16,72}$/, message: '使用16到72个非空格ASCII字符' }]}><Input.Password maxLength={72} autoComplete="new-password" /></Form.Item>
      </Form>
    </SettingsDialog>
  </section>;
}
/** @param row 只含ID和显示名称的部门节点 @returns 原生Tree节点；不把部门名作为HTML执行 */
function toTreeNode(row: ReturnType<typeof departmentTree>[number]): DataNode { return { key: row.value, title: row.title, children: row.children.map(toTreeNode) }; }
