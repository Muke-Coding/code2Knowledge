/** 受控菜单管理；参考OpenDevFlow的树形表与编辑弹窗，仅配置已注册页面，不建立任意路由或替代真实角色动作。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Grid, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import { DownOutlined, ReloadOutlined, UpOutlined } from '@ant-design/icons';
import type { MenuSetting, Session } from '@c2k/contracts';
import { listMenus, saveMenu, failureMessage } from './api';
import SettingsDialog from './SettingsDialog';
import SettingsFilters from './SettingsFilters';
/** 当前公开身份只控制操作展示。 */
interface Props {
  /** 服务端有效会话。 */
  session: Session;
}
/** 表格中目录为固定分组，页面才拥有可编辑设置。 */
interface MenuRow {
  /** 固定分组或注册路径，表格唯一键。 */
  key: string;
  /** 原配置；目录为空，不允许把目录当成可执行页面。 */
  setting: MenuSetting | null;
  /** 原生树形表的直接子菜单。 */
  children?: MenuRow[];
  /** 目录或页面显示名称。 */
  title: string;
}
/** 注册分组与中文标题；只管理导航表现，不授予任何权限。 */
const GROUPS = [{ value: 'knowledge', label: '知识工作台' }, { value: 'runtime', label: '逆向工作台' }, { value: 'device', label: '设备管理' }, { value: 'enterprise', label: '系统设置' }];
/** @param props 当前身份 @returns 四个注册目录下的受控菜单树，修改会校验乐观版本并刷新当前导航 */
export default function MenusPage(props: Props) {
  const { session } = props;
  const wide = Grid.useBreakpoint().md ?? false;
  const [rows, setRows] = useState<MenuSetting[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [editing, setEditing] = useState<MenuSetting | null>(null), [busy, setBusy] = useState(false), [revision, refresh] = useState(0), [drawerError, setDrawerError] = useState(''), [form] = Form.useForm<MenuSetting>();
  const [query, setQuery] = useState(''), [keyword, setKeyword] = useState(''), [visibility, setVisibility] = useState<string>(), [appliedVisibility, setAppliedVisibility] = useState<string>();
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(GROUPS.map((group) => group.value));
  const confirming = useRef(false), saving = useRef(false), [modal, context] = Modal.useModal();
  /** @returns 保存中禁止关闭，脏显示配置须明确丢弃，保留现有乐观版本 */
  function close(): void { if (saving.current || confirming.current) return; if (form.isFieldsTouched()) { confirming.current = true; modal.confirm({ title: '放弃菜单修改？', content: '未保存的显示配置将丢失。', okText: '放弃', cancelText: '继续编辑', onOk: () => setEditing(null), afterClose: () => { confirming.current = false; } }); } else setEditing(null); }
  useEffect(() => { let active = true; setLoading(true); setRows([]); setError(''); listMenus().then((value) => { if (active) setRows(value); }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [revision]);
  /** @param value 已校验显示配置 @returns 保存后重新读取并刷新导航；失败保留草稿，不改变API授权 */
  async function submit(value: MenuSetting): Promise<void> { if (!editing || saving.current) return; saving.current = true; setBusy(true); setDrawerError(''); try { await saveMenu({ ...editing, ...value }); setEditing(null); refresh((value) => value + 1); window.dispatchEvent(new Event('c2k-permissions-changed')); } catch (reason) { setDrawerError(failureMessage(reason)); } finally { saving.current = false; setBusy(false); } }
  const tree: MenuRow[] = GROUPS.flatMap((group) => {
    const children = rows.filter((row) => row.group === group.value && `${group.label} ${row.title} ${row.path} ${row.permission}`.toLowerCase().includes(keyword.toLowerCase()) && (!appliedVisibility || String(row.visible) === appliedVisibility)).sort((a, b) => a.sortOrder - b.sortOrder || a.path.localeCompare(b.path)).map((setting) => ({ key: setting.path, setting, title: setting.title }));
    return children.length ? [{ key: group.value, setting: null, title: group.label, children }] : [];
  });
  return <section className="settings-page">{context}<header className="page-heading"><h1>菜单管理</h1></header>
    <SettingsFilters loading={loading} onSearch={() => { setKeyword(query.trim()); setAppliedVisibility(visibility); setExpandedKeys(GROUPS.map((group) => group.value)); }} onReset={() => { setQuery(''); setKeyword(''); setVisibility(undefined); setAppliedVisibility(undefined); }}><Form.Item label="菜单信息"><Input aria-label="搜索菜单" placeholder="搜索名称、路由或权限" value={query} allowClear onChange={(event) => setQuery(event.target.value)} /></Form.Item><Form.Item label="可见性"><Select aria-label="菜单可见性" placeholder="全部菜单" value={visibility} allowClear onChange={setVisibility} options={[{ value: 'true', label: '显示' }, { value: 'false', label: '隐藏' }]} /></Form.Item></SettingsFilters>
    <div className="settings-actions"><span /><Space><Button icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={() => refresh((value) => value + 1)}>刷新</Button><Button icon={expandedKeys.length ? <UpOutlined aria-hidden /> : <DownOutlined aria-hidden />} disabled={loading || !rows.length} onClick={() => setExpandedKeys(expandedKeys.length ? [] : GROUPS.map((group) => group.value))}>{expandedKeys.length ? '折叠' : '展开'}</Button></Space></div>
    {error && <Alert role="alert" type="error" message={error} className="form-alert" action={<Button onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}
    <div className="data-surface"><Table<MenuRow> rowKey="key" loading={loading} dataSource={tree} expandable={{ expandedRowKeys: expandedKeys, onExpandedRowsChange: (keys) => setExpandedKeys([...keys]) }} scroll={{ x: 1000 }} pagination={false} columns={[
      { title: '菜单名称', dataIndex: 'title', width: 220, ellipsis: true },
      { title: '类型', key: 'type', width: 90, render: (_, row) => <Tag color={row.setting ? 'success' : 'blue'}>{row.setting ? '菜单' : '目录'}</Tag> },
      { title: '路由地址', key: 'path', width: 180, ellipsis: true, render: (_, row) => row.setting?.path ?? '—' },
      { title: '权限标识', key: 'permission', width: 220, ellipsis: true, render: (_, row) => row.setting?.permission ?? '—' },
      { title: '排序', key: 'order', width: 80, render: (_, row) => row.setting?.sortOrder ?? '—' },
      { title: '可见', key: 'visible', width: 90, render: (_, row) => row.setting ? <Tag color={row.setting.visible ? 'success' : 'default'}>{row.setting.visible ? '显示' : '隐藏'}</Tag> : '—' },
      { title: '操作', key: 'action', width: 90, fixed: wide ? 'right' : false, render: (_, row) => row.setting && session.permissions.includes('menu.update') ? <Button type="link" onClick={() => { setDrawerError(''); form.resetFields(); form.setFieldsValue(row.setting!); setEditing(row.setting); }}>配置</Button> : null },
    ]} /></div>
    <SettingsDialog title="配置菜单" open={editing !== null} width={620} busy={busy} onSave={() => form.submit()} saveText="保存配置" onClose={close}>
      {drawerError && <Alert role="alert" type="error" message={drawerError} className="form-alert" />}
      <Form form={form} layout="vertical" disabled={busy} requiredMark={false} onFinish={submit}>
        <Form.Item name="group" label="上级目录" rules={[{ required: true }]}><Select aria-label="菜单工作区" options={GROUPS} /></Form.Item>
        <div className="settings-form-grid"><Form.Item name="title" label="菜单名称" rules={[{ required: true, whitespace: true, max: 40 }]}><Input maxLength={40} autoFocus /></Form.Item><Form.Item name="sortOrder" label="排序" rules={[{ required: true }]}><InputNumber min={0} max={9999} /></Form.Item></div>
        <Form.Item label="路由地址"><Input aria-label="路由地址" value={editing?.path} disabled /></Form.Item><Form.Item label="权限标识"><Input aria-label="权限标识" value={editing?.permission} disabled /></Form.Item>
        <Form.Item name="visible" label="导航显示" tooltip="隐藏只移除导航入口；已获角色动作与对象授权的用户仍可通过原路径访问。" valuePropName="checked"><Switch aria-label="导航显示" /></Form.Item>
      </Form>
    </SettingsDialog>
  </section>;
}
