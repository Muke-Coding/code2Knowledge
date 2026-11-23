/** 部门管理页面；树结构用AntD TreeSelect，数据分页用Table；主部门不隐式赋角色或开放个人设备。 */
import { useEffect, useState, useRef } from 'react';
import { Alert, Button, Grid, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, TreeSelect } from 'antd';
import { DownOutlined, PlusOutlined, ReloadOutlined, UpOutlined } from '@ant-design/icons';
import SettingsDialog from './SettingsDialog';
import SettingsFilters from './SettingsFilters';
import type { Department, Session, Member } from '@c2k/contracts';
import { listDepartments, saveDepartment, deleteDepartment, listMembers, memberDepartment, assignDepartment, failureMessage, type DepartmentInput } from './api';
/** 已确认企业身份，仅用于显示入口；后端独立授权。 */
interface Props {
  /** 当前用户公开会话。 */
  session: Session;
}
/** 树选项仅保存UUID和名称，不执行任意页面或脚本。 */
interface TreeItem {
  /** 部门标识。 */
  value: string;
  /** 层级显示名称。 */
  title: string;
  /** 子部门。 */
  children: TreeItem[];
}
/** @param rows 企业部门 @param parent 根为空串 @param blocked 禁止选择自身及子级的根UUID @returns AntD TreeSelect选项，不包括被阻止子树 */
export function departmentTree(rows: Department[], parent = '', blocked = ''): TreeItem[] { return rows.filter((row) => row.parentId === parent && row.id !== blocked).map((row) => ({ value: row.id, title: row.name, children: departmentTree(rows, row.id, blocked) })); }
/** @param props 当前会话 @returns 部门维护及成员归属，不改成员角色 */
export default function DepartmentsPage(props: Props) {
  const { session } = props;
  const wide = Grid.useBreakpoint().md ?? false;
  const [rows, setRows] = useState<Department[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, refresh] = useState(0), [editor, setEditor] = useState<Department | 'new' | null>(null), [busy, setBusy] = useState(false), [drawerError, setDrawerError] = useState('');
  const [page, setPage] = useState(1), [keyword, setKeyword] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState<string>(), [appliedStatus, setAppliedStatus] = useState<string>(), [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]), [form] = Form.useForm<DepartmentInput>(), [modal, context] = Modal.useModal();
  const [members, setMembers] = useState<Member[]>([]), [memberId, setMemberId] = useState<string>(), [departmentId, setDepartmentId] = useState(''), [memberVersion, setMemberVersion] = useState<number | null>(null), [assignOpen, setAssignOpen] = useState(false);
  const confirming = useRef(false);
  const saving = useRef(false);
  useEffect(() => { let active = true; setLoading(true); setRows([]); setError(''); listDepartments().then((value) => { if (active) { setRows(value); setExpandedKeys(value.map((row) => row.id)); } }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [revision]);
  useEffect(() => { if (!assignOpen) return; let active = true; setMembers([]); listMembers().then((value) => { if (active) setMembers(value); }).catch((reason) => { if (active) setDrawerError(failureMessage(reason)); }); return () => { active = false; }; }, [assignOpen]);
  useEffect(() => { setMemberVersion(null); setDepartmentId(''); setDrawerError(''); if (!memberId || !assignOpen) return; let active = true; memberDepartment(memberId).then((value) => { if (active) { setDepartmentId(value.departmentId); setMemberVersion(value.revision); } }).catch((reason) => { if (active) setDrawerError(failureMessage(reason)); }); return () => { active = false; }; }, [memberId, assignOpen]);
  /** @param row 新建或现有部门 @param parentId 新建子级时预选的上级；默认根节点 @returns 初始化独立编辑，不复用旧错误 */
  function edit(row: Department | 'new', parentId = ''): void { setDrawerError(''); form.resetFields(); form.setFieldsValue(row === 'new' ? { parentId, name: '', sortOrder: 0, enabled: true, revision: 0 } : row); setEditor(row); }
  /** @returns 未保存输入明确确认后再关闭，写入中禁止关闭 */
  function close(): void { if (saving.current || confirming.current) return; if (form.isFieldsTouched()) { confirming.current = true; modal.confirm({ title: '放弃部门修改？', content: '未保存的输入将丢失。', okText: '放弃', cancelText: '继续编辑', onOk: () => setEditor(null), afterClose: () => { confirming.current = false; } }); } else setEditor(null); }
  /** @param value 明确部门配置 @returns 原子保存，冲突保留输入供用户处理 */
  async function submit(value: DepartmentInput): Promise<void> { if (saving.current) return; saving.current = true; setBusy(true); setDrawerError(''); try { await saveDepartment(editor && editor !== 'new' ? editor.id : '', { ...value, revision: editor && editor !== 'new' ? editor.revision : 0 }); setEditor(null); refresh((value) => value + 1); } catch (reason) { setDrawerError(failureMessage(reason)); } finally { saving.current = false; setBusy(false); } }
  /** @param row 最新部门行 @returns 明确不可恢复删除；引用失败保留表格 */
  async function remove(row: Department): Promise<void> { if (saving.current) return; saving.current = true; setBusy(true); try { await deleteDepartment(row.id, row.revision); refresh((value) => value + 1); } catch (reason) { setError(failureMessage(reason)); } finally { saving.current = false; setBusy(false); } }
  /** @returns 保存当前成员主部门，版本冲突不覆盖 */
  async function assign(): Promise<void> { if (!memberId || memberVersion === null || saving.current) return; saving.current = true; setBusy(true); setDrawerError(''); try { await assignDepartment(memberId, departmentId, memberVersion); setAssignOpen(false); } catch (reason) { setDrawerError(failureMessage(reason)); } finally { saving.current = false; setBusy(false); } }
  const matched = new Set(rows.filter((row) => row.name.toLowerCase().includes(keyword.toLowerCase()) && (!appliedStatus || String(row.enabled) === appliedStatus)).map((row) => row.id));
  // 保留匹配节点的完整父链；过滤不会把子部门误显示成根部门。
  for (const id of [...matched]) { let parent = rows.find((row) => row.id === id)?.parentId; while (parent) { matched.add(parent); parent = rows.find((row) => row.id === parent)?.parentId; } }
  const filtered = departmentRows(rows.filter((row) => matched.has(row.id)));
  return <section className="settings-page">{context}<header className="page-heading"><h1>部门管理</h1></header>
    <SettingsFilters loading={loading} onSearch={() => { setKeyword(query.trim()); setAppliedStatus(status); setPage(1); setExpandedKeys(rows.map((row) => row.id)); }} onReset={() => { setQuery(''); setKeyword(''); setStatus(undefined); setAppliedStatus(undefined); setPage(1); }}><Form.Item label="部门名称"><Input aria-label="搜索部门" placeholder="请输入部门名称" allowClear value={query} onChange={(event) => setQuery(event.target.value)} /></Form.Item><Form.Item label="状态"><Select aria-label="部门状态" allowClear placeholder="全部状态" value={status} onChange={setStatus} options={[{ value: 'true', label: '启用' }, { value: 'false', label: '停用' }]} /></Form.Item></SettingsFilters>
    <div className="settings-actions"><span /><Space wrap><Button icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={() => refresh((value) => value + 1)}>刷新</Button><Button icon={expandedKeys.length ? <UpOutlined aria-hidden /> : <DownOutlined aria-hidden />} disabled={loading || !rows.length} onClick={() => setExpandedKeys(expandedKeys.length ? [] : rows.map((row) => row.id))}>{expandedKeys.length ? '折叠' : '展开'}</Button>{session.permissions.includes('department.assign') && <Button onClick={() => { setDrawerError(''); setMemberId(undefined); setAssignOpen(true); }}>成员归属</Button>}{session.permissions.includes('department.create') && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => edit('new')}>新增部门</Button>}</Space></div>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} action={<Button onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}
    <div className="data-surface"><Table<DepartmentRow> rowKey="id" loading={loading} dataSource={filtered} expandable={{ expandedRowKeys: expandedKeys, onExpandedRowsChange: (keys) => setExpandedKeys([...keys]) }} scroll={{ x: 780 }} pagination={{ current: Math.min(page, Math.max(1, Math.ceil(filtered.length / 20))), pageSize: 20, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配部门" /> }} columns={[{ title: '部门名称', dataIndex: 'name', width: 260, ellipsis: true }, { title: '排序', dataIndex: 'sortOrder', width: 90 }, { title: '状态', key: 'enabled', width: 100, render: (_: unknown, row: Department) => <Tag color={row.enabled ? 'success' : 'default'}>{row.enabled ? '启用' : '停用'}</Tag> }, { title: '操作', key: 'actions', width: 240, fixed: wide ? 'right' : false, render: (_: unknown, row: Department) => <Space size={0}>{session.permissions.includes('department.update') && <Button type="link" disabled={busy} onClick={() => edit(row)}>编辑</Button>}{session.permissions.includes('department.create') && <Button type="link" disabled={busy} onClick={() => edit('new', row.id)}>新增</Button>}{session.permissions.includes('department.delete') && <Popconfirm title="删除部门？" description="删除不可恢复；存在成员、子部门或授权时会拒绝。" okText="删除" cancelText="取消" onConfirm={() => remove(row)}><Button type="link" danger disabled={busy}>删除</Button></Popconfirm>}</Space> }]} /></div>
    <SettingsDialog title={editor === 'new' ? '新增部门' : '编辑部门'} busy={busy} onSave={() => form.submit()} saveText="保存部门" open={editor !== null} onClose={close} width={560}>{drawerError && <Alert role="alert" className="form-alert" type="error" message={drawerError} />}<Form form={form} layout="vertical" requiredMark={false} disabled={busy} onFinish={submit}><Form.Item name="name" label="部门名称" rules={[{ required: true, whitespace: true, max: 80 }]}><Input autoFocus maxLength={80} /></Form.Item><Form.Item name="parentId" label="上级部门"><TreeSelect aria-label="上级部门" treeData={[{ value: '', title: '无（根部门）', children: departmentTree(rows, '', editor && editor !== 'new' ? editor.id : '') }]} treeDefaultExpandAll /></Form.Item><Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}><InputNumber min={0} max={9999} /></Form.Item><Form.Item name="enabled" label="启用" tooltip="停用后本部门及下级均不能通过部门授权访问资源；个人显式授权不受影响。" valuePropName="checked"><Switch aria-label="启用" /></Form.Item></Form></SettingsDialog>
    <SettingsDialog title="成员归属" busy={busy} onSave={() => void assign()} saveText="保存归属" saveDisabled={!memberId || memberVersion === null} open={assignOpen} onClose={() => { if (!busy) setAssignOpen(false); }} width={560}>{drawerError && <Alert role="alert" type="error" message={drawerError} className="form-alert" />}<Form layout="vertical" requiredMark={false}><Form.Item label="成员"><Select aria-label="选择归属成员" showSearch optionFilterProp="label" value={memberId} onChange={setMemberId} disabled={busy} options={members.map((value) => ({ value: value.id, label: `${value.displayName} (${value.username})` }))} /></Form.Item><Form.Item label="主部门"><TreeSelect aria-label="成员主部门" value={departmentId} onChange={setDepartmentId} disabled={busy || memberVersion === null} treeData={[{ value: '', title: '未分配', children: departmentTree(rows) }]} treeDefaultExpandAll /></Form.Item></Form></SettingsDialog>
  </section>;
}

/** 部门树形表格节点；保留真实父子关系，不重新解释部门授权范围。 */
interface DepartmentRow extends Department {
  /** 直接子部门；叶子省略以避免显示无意义展开按钮。 */
  children?: DepartmentRow[];
}
/** @param rows 已匹配且包含祖先的部门 @param parent 根父级为空串 @returns 按服务器排序构建的表格节点，不改变资源权限 */
function departmentRows(rows: Department[], parent = ''): DepartmentRow[] { return rows.filter((row) => row.parentId === parent).map((row) => { const children = departmentRows(rows, row.id); return { ...row, ...(children.length ? { children } : {}) }; }); }
