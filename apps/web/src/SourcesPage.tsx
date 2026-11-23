/** 企业来源登记与逐项分析范围管理；仅处理定位元数据，不读取仓库、资料或启动逆向。 */
import DepartmentGrants from './DepartmentGrants';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Form, Input, List, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tag, Tooltip } from 'antd';
import { PlusOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { RefSelectProps } from 'antd';
import type { CatalogSystem, Member, Session, Source, SourceGrant, SourcePage } from '@c2k/contracts';
import { ApiFailure, checkSource, failureMessage, setSourceStatus, getSource, listMembers, listSources, saveSource, setSourceGrant, sourceGrants, sourceSystems, type SourceInput } from './api';
/** 已认证身份用于操作可见性；服务端对每次请求重新鉴权。 */
interface Props {
  /** 当前企业公开会话，不包含任何凭证。 */
  session: Session;
}
/** @param props 当前身份 @returns 来源列表、配置表单与独立范围授权界面 */
export default function SourcesPage(props: Props) {
  const { session } = props;
  const manager = session.permissions.includes('source.read.all');
  const analyzer = session.permissions.includes('source.analyze');
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<SourcePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Source | 'new' | null>(null);
  const [target, setTarget] = useState<Source | null>(null);
  const [systems, setSystems] = useState<CatalogSystem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [grants, setGrants] = useState<SourceGrant[]>([]);
  const [memberId, setMemberId] = useState<string>();
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const generation = useRef(0);
  const grantControl = useRef<RefSelectProps>(null);
  const writeLock = useRef(false);
  const [form] = Form.useForm<SourceInput>();
  const [modal, modalContext] = Modal.useModal();
  const kind = Form.useWatch('kind', form);
  // 查询变化立即移除旧数据；卸载或切换后丢弃旧响应，授权失败不能留下可操作的旧行。
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setData(null);
    listSources(page, keyword).then((value) => { if (active) { const last = Math.max(1, Math.ceil(value.total / 20)); if (page > last) setPage(last); else setData(value); } }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, keyword, version]);
  useEffect(() => () => { generation.current++; }, []);
  /** @returns 刷新服务端分页，不复用旧授权结果。 */
  function reload(): void { setVersion((value) => value + 1); }
  /** @returns 关闭无在途写入的抽屉并废弃在途读取。 */
  function close(): void {
    if (writeLock.current) return;
    if (editor && form.isFieldsTouched()) { modal.confirm({ title: '放弃未保存的来源修改？', content: '未保存的输入将丢失，已保存配置不受影响。', okText: '放弃修改', cancelText: '继续编辑', onOk: finishClose }); return; }
    finishClose();
  }
  /** @returns 已确认退出后清理表单与在途响应；不写入后端。 */
  function finishClose(): void { generation.current++; setEditor(null); setTarget(null); form.resetFields(); }
  /** @param value 新建标识或列表来源 @returns 重新读取当前配置和系统绑定后打开编辑，不用旧列表覆盖新版本。 */
  async function edit(value: Source | 'new'): Promise<void> {
    const current = ++generation.current; setTarget(null); setEditor(value); setDrawerError(''); setDrawerLoading(true); setSystems([]); form.resetFields();
    try {
      const options = await sourceSystems();
      // 绑定读取前后检查单调递增版本，防止新revision与旧绑定拼接；保存仍由服务端校验版本。
      const latest = value === 'new' ? null : await getSource(value.id);
      const bindings = value === 'new' ? [] : await sourceSystems(value.id);
      if (latest && value !== 'new' && (await getSource(value.id)).revision !== latest.revision) throw new ApiFailure(409, '来源读取期间已变化，请重新加载');
      if (current !== generation.current) return;
      setSystems(options); setEditor(latest ?? 'new');
      form.setFieldsValue(latest ? { ...latest, systemIds: bindings.map((item) => item.id) } : { name: '', kind: 'REPOSITORY', locator: '', branch: 'master', enabled: true, systemIds: [] });
      form.setFields((['name', 'kind', 'locator', 'branch', 'enabled', 'systemIds'] as const).map((name) => ({ name, touched: false })));
    } catch (reason) { if (current === generation.current) setDrawerError(failureMessage(reason)); }
    finally { if (current === generation.current) setDrawerLoading(false); }
  }
  /** @param values 完整表单配置 @returns 保存完成；冲突保留输入，必须重新加载版本后再修改，不自动覆盖。 */
  async function submit(values: SourceInput): Promise<void> {
    if (!editor || writeLock.current) return;
    writeLock.current = true; setBusy(true); setDrawerError('');
    try { await saveSource({ ...values, branch: values.kind === 'DOCUMENT' ? '' : values.branch, ...(editor === 'new' ? {} : { revision: editor.revision }) }, editor === 'new' ? undefined : editor.id); writeLock.current = false; finishClose(); setNotice('来源配置已保存'); reload(); }
    catch (reason) { setDrawerError(failureMessage(reason)); }
    finally { writeLock.current = false; setBusy(false); }
  }
  /** @param source 指定来源 @returns 刷新来源版本与成员范围；已停用成员仍在现有授权中展示以便撤销。 */
  async function permissions(source: Source): Promise<void> {
    const current = ++generation.current; setEditor(null); setTarget(source); setDrawerError(''); setDrawerLoading(true); setGrants([]); setMembers([]); setMemberId(undefined);
    try {
      const [latest, users, values] = await Promise.all([getSource(source.id), listMembers(), sourceGrants(source.id)]);
      if (current === generation.current) { setTarget(latest); setMembers(users); setGrants(values); }
    } catch (reason) { if (current === generation.current) setDrawerError(failureMessage(reason)); }
    finally { if (current === generation.current) setDrawerLoading(false); }
  }
  /** @param id 同企业成员ID @param allow 授予或撤销范围 @returns 幂等写入后重读版本；写入锁防止重复点击，失败保留恢复入口。 */
  async function permission(id: string, allow: boolean): Promise<void> {
    if (!target || writeLock.current) return;
    writeLock.current = true; setBusy(true); setDrawerError('');
    try { await setSourceGrant(target.id, id, target.revision, allow); await permissions(target); reload(); }
    catch (reason) { setDrawerError(failureMessage(reason)); }
    finally {
      writeLock.current = false; setBusy(false);
      // 重读授权会移除触发按钮；回到选择器，使键盘和Escape仍在抽屉焦点范围内。
      requestAnimationFrame(() => grantControl.current?.focus());
    }
  }
  /** @param source 当前行 @returns 实时资格检查；不生成任务、不访问Git、不代表后续执行授权。 */
  async function check(source: Source): Promise<void> {
    if (checking) return; setChecking(source.id); setNotice(''); setError('');
    try { await checkSource(source.id, source.revision); setNotice('当前分析资格有效；本次未启动逆向任务'); }
    catch (reason) { setNotice(failureMessage(reason)); reload(); }
    finally { setChecking(null); }
  }
  /** @param source 当前列表来源 @returns 仅启停接口，不以编辑权限替代；失败提示并等待人工刷新版本 */
  async function toggleStatus(source: Source): Promise<void> { if (writeLock.current) return; writeLock.current = true; try { await setSourceStatus(source.id, source.revision, !source.enabled); reload(); } catch (reason) { setError(failureMessage(reason)); } finally { writeLock.current = false; } }
  return <>
    {modalContext}
    <header className="page-heading"><h1>来源管理</h1>{session.permissions.includes('source.create') && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => void edit('new')}>登记来源</Button>}</header>
    {notice && <Alert className="form-alert" message={notice} type="info" closable onClose={() => setNotice('')} />}
    {error ? <Alert role="alert" type="error" message={error} action={<Button onClick={reload}>重试</Button>} /> : <div className="data-surface">
      <div className="list-toolbar source-toolbar"><span>{loading ? '正在加载' : `${data?.total ?? 0} 个来源`}</span><Input.Search aria-label="搜索来源" placeholder="搜索来源名称" allowClear maxLength={80} onSearch={(value) => { setKeyword(value.trim()); setPage(1); }} /><Button type="text" aria-label="刷新来源" icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={reload} /></div>
      <Table<Source> rowKey="id" loading={loading} dataSource={data?.items ?? []} scroll={{ x: 650 }} pagination={{ current: page, total: data?.total ?? 0, pageSize: 20, showSizeChanger: false, hideOnSinglePage: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={manager ? '尚未登记来源' : '暂无可分析的来源'} /> }} columns={[
        { title: '来源', key: 'name', width: 300, render: (_: unknown, value: Source) => <><div className="cell-title">{value.name}</div><div className="cell-secondary">{value.locator}</div></> },
        { title: '类型 / 分支', key: 'kind', width: 150, render: (_: unknown, value: Source) => <>{value.kind === 'REPOSITORY' ? '代码仓库' : '运行时资料'}<div className="cell-secondary">{value.branch || '—'}</div></> },
        { title: '状态', key: 'status', width: 90, render: (_: unknown, value: Source) => <Tag color={value.enabled ? 'success' : 'default'}>{value.enabled ? '启用' : '停用'}</Tag> },
        { title: '操作', key: 'actions', width: 210, render: (_: unknown, value: Source) => <Space size={0} wrap>{session.permissions.includes('source.update') && <Button type="link" onClick={() => void edit(value)}>编辑</Button>}{session.permissions.includes('source.grant') && <Button type="link" onClick={() => void permissions(value)}>分析授权</Button>}{session.permissions.includes('source.status') && <Popconfirm title={value.enabled ? '停用来源？' : '启用来源？'} description="变更会使旧来源授权失效，须重新授权和绑定。" onConfirm={() => toggleStatus(value)}><Button type="link" danger={value.enabled}>{value.enabled ? '停用' : '启用'}</Button></Popconfirm>}{analyzer && value.canAnalyze && <Button type="link" loading={checking === value.id} disabled={checking !== null} onClick={() => void check(value)}>检查资格</Button>}</Space> },
      ]} />
    </div>}
    <Drawer open={editor !== null} aria-label={editor === 'new' ? '登记来源' : '编辑来源'} title={editor === 'new' ? '登记来源' : '编辑来源'} width={560} onClose={close} destroyOnHidden>
      {drawerError && <Alert role="alert" type="error" message={drawerError} className="form-alert" action={<Button disabled={busy} onClick={() => editor && void edit(editor)}>重新加载</Button>} />}
      {drawerLoading ? <div className="drawer-loading"><Spin /></div> : <Form form={form} layout="vertical" onFinish={submit} disabled={busy || systems.length === 0} requiredMark={false}>
        {systems.length === 0 && !drawerError && <Alert type="warning" message="请先在系统目录登记所属系统" className="form-alert" />}
        {editor !== 'new' && <Alert type="warning" message="修改配置会使现有分析授权失效，需要重新授权。" className="form-alert" />}
        <Form.Item name="name" label="来源名称" rules={[{ required: true, whitespace: true, max: 120, message: '请输入1至120字符的来源名称' }]}><Input maxLength={120} autoFocus /></Form.Item>
        <Form.Item name="kind" label="来源类型" rules={[{ required: true }]}><Radio.Group aria-label="来源类型" disabled={busy || editor !== 'new'} options={[{ value: 'REPOSITORY', label: '代码仓库' }, { value: 'DOCUMENT', label: '运行时资料' }]} /></Form.Item>
        <Form.Item name="locator" label={kind === 'DOCUMENT' ? '资料相对路径' : '仓库地址'} tooltip={kind === 'DOCUMENT' ? '运行时资料根目录下的相对路径；本次不上传正文，也不检查文件是否存在。' : 'HTTPS 或 SSH Git 地址，不允许内嵌密码或令牌；凭证仅在运行时配置。'} rules={[{ required: true, whitespace: true, max: 1000, message: '请输入不含凭证的来源定位' }]}><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
        {kind !== 'DOCUMENT' && <Form.Item name="branch" label="默认分支" tooltip="默认建议 master；可选择 main 或输入其他分支，不会强制切换仓库。" rules={[{ required: true, whitespace: true, max: 200, message: '请明确填写分支' }]}><Input maxLength={200} list="source-branches" /></Form.Item>}
        <datalist id="source-branches"><option value="master" /><option value="main" /></datalist>
        <Form.Item name="systemIds" label="关联系统" tooltip="可关联多个系统；不会继承系统目录权限。" rules={[{ required: true, type: 'array', min: 1, message: '至少选择一个系统' }]}><Select aria-label="关联系统" mode="multiple" showSearch optionFilterProp="label" options={systems.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
        <Form.Item name="enabled" label={<>启用来源 <Tooltip title="停用后拒绝新的分析资格检查；重新启用仍需重新授权。"><InfoCircleOutlined tabIndex={0} aria-label="来源停用后果" /></Tooltip></>} valuePropName="checked"><Switch disabled={editor !== 'new' && !session.permissions.includes('source.status')} aria-label="启用来源" /></Form.Item>
        <Space><Button type="primary" htmlType="submit" loading={busy}>保存来源</Button><Button onClick={close}>取消</Button></Space>
      </Form>}
    </Drawer>
    <Drawer open={target !== null} aria-label="分析授权" title={target ? `${target.name} · 分析授权` : '分析授权'} width={560} onClose={close} destroyOnHidden>
      {drawerError && <Alert role="alert" type="error" message={drawerError} className="form-alert" action={<Button disabled={busy} onClick={() => target && void permissions(target)}>重新加载</Button>} />}
      {drawerLoading ? <div className="drawer-loading"><Spin /></div> : target && <>
        <Alert className="form-alert" type="info" message="成员还须拥有“来源分析”角色动作；管理员也需要逐项授权。" />
        <Form layout="vertical" onFinish={() => memberId && permission(memberId, true)}><Form.Item label="授权成员"><div className="grant-form"><Select ref={grantControl} aria-label="选择来源授权成员" showSearch optionFilterProp="label" placeholder="选择成员" disabled={busy || !target.enabled} value={memberId} onChange={setMemberId} options={members.filter((item) => item.enabled && !grants.some((grant) => grant.memberId === item.id && grant.current)).map((item) => ({ value: item.id, label: `${item.displayName} (${item.username})` }))} /><Button type="primary" htmlType="submit" loading={busy} disabled={!memberId || !target.enabled}>授权</Button></div></Form.Item></Form>
        <List dataSource={grants} locale={{ emptyText: '尚未授权成员' }} renderItem={(grant) => <List.Item actions={[<Popconfirm key="revoke" title="撤销来源分析范围？" description="该成员下次检查将无法分析此来源。" okText="撤销" cancelText="取消" onConfirm={() => permission(grant.memberId, false)}><Button type="link" danger disabled={busy}>撤销</Button></Popconfirm>]}><List.Item.Meta title={grant.displayName} description={grant.current ? '当前配置范围有效' : '配置已变更或来源停用，需重新授权'} /></List.Item>} />
        {session.permissions.includes('department.read') && <DepartmentGrants kind="SOURCE" id={target.id} sourceRevision={target.revision} disabled={!target.enabled} />}
      </>}
    </Drawer>
  </>;
}
