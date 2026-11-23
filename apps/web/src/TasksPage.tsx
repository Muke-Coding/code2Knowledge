/** 本人来源预检操作页；任务成功只证明无正文来源清单接收，不能作为逆向、业务审核或发布完成。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Device, Session, Source, Task, TaskPage } from '@c2k/contracts';
import { controlTask, createTask, failureMessage, getTask, listDevices, listSources, listTasks, taskAttempts } from './api';
/** 当前已登录身份，仅用于显示新建入口；服务端独立认证。 */
interface Props {
  /** 当前会话，权限不作为服务端事实。 */
  session: Session;
}
/** 已实现预检状态的展示词典；不将来源预检成功写为知识发布。 */
const states: Record<string, string> = { QUEUED: '等待设备', RUNNING: '预检中', SUCCEEDED: '预检完成', FAILED: '失败', CANCELLED: '已取消', EXPIRED: '租约过期' };
/** 创建表单只接受用户明确选择的仓库与私有设备，不接受脚本或Git凭证。 */
interface TaskForm {
  /** 任务名，不能为空。 */
  name: string;
  /** 当前已获范围的仓库来源UUID。 */
  sourceId: string;
  /** 本人有效设备UUID，允许离线排队。 */
  deviceId: string;
}
/** @param state 当前尝试状态 @returns 是否正在等待或执行，可取消 */
function active(state: string): boolean { return state === 'QUEUED' || state === 'RUNNING'; }
/** @param task 当前尝试 @returns 可访问且带明确文字的状态标签 */
function status(task: Task) { return <Tag color={task.state === 'SUCCEEDED' ? 'success' : task.state === 'RUNNING' ? 'processing' : task.state === 'FAILED' || task.state === 'EXPIRED' ? 'error' : 'default'}>{states[task.state] ?? '未知状态'}</Tag>; }
/** @param props 当前身份 @returns 私有预检任务列表、创建表单与尝试历史 */
export default function TasksPage(props: Props) {
  const [page, setPage] = useState(1); const [revision, refresh] = useState(0);
  const [data, setData] = useState<TaskPage | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [creating, setCreating] = useState(false); const [optionsLoading, setOptionsLoading] = useState(false); const [sources, setSources] = useState<Source[]>([]); const [devices, setDevices] = useState<Device[]>([]);
  const [sourceKeyword, setSourceKeyword] = useState(''); const [sourcePage, setSourcePage] = useState(1); const [sourceTotal, setSourceTotal] = useState(0);
  const [formError, setFormError] = useState(''); const [busy, setBusy] = useState(false); const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null); const [detail, setDetail] = useState<Task | null>(null); const [attempts, setAttempts] = useState<Task[]>([]); const [detailError, setDetailError] = useState('');
  const writeLock = useRef(false); const createKey = useRef(''); const lastInput = useRef(''); const generation = useRef(0); const [form] = Form.useForm<TaskForm>();
  const [source, setSource] = useState<Source | null>(null);
  const [modal, modalContext] = Modal.useModal();
  // 轮询由完成后的定时器驱动，避免慢请求叠加；切换页或卸载后旧响应失效。失败清空旧数据并提供手动重试。
  useEffect(() => {
    let current = true; let timer: ReturnType<typeof setTimeout> | undefined; setLoading(true); setError(''); setData(null);
    /** @returns 更新当前页并安排5秒轮询，不跨身份保存历史缓存。 */
    async function load(): Promise<void> {
      try { const value = await listTasks(page); if (!current) return; const last = Math.max(1, Math.ceil(value.total / 20)); if (page > last) setPage(last); else setData(value); setError(''); timer = setTimeout(() => { void load(); }, 5000); }
      catch (reason) { if (current) { setData(null); setError(failureMessage(reason)); } }
      finally { if (current) setLoading(false); }
    }
    void load(); return () => { current = false; clearTimeout(timer); };
  }, [page, revision]);
  // 来源选择按服务器权限与检索分页，300+来源不靠截断全量下拉；旧查询回包不能污染新关键词。
  useEffect(() => {
    if (!creating) return; let current = true; setOptionsLoading(true);
    const timer = setTimeout(() => {
      Promise.all([listSources(sourcePage, sourceKeyword), listDevices()]).then(([values, machines]) => {
        if (current) { setSources((previous) => sourcePage === 1 ? values.items : [...previous, ...values.items.filter((item) => !previous.some((old) => old.id === item.id))]); setSourceTotal(values.total); setDevices(machines.filter((item) => item.status !== 'REVOKED')); setFormError(''); }
      }).catch((reason) => { if (current) { setSources([]); setDevices([]); setFormError(failureMessage(reason)); } }).finally(() => { if (current) setOptionsLoading(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [creating, sourceKeyword, sourcePage, revision]);
  // 详情与尝试独立重读；关闭、更换目标后清理，轮询不依赖用户保持列表页。
  useEffect(() => {
    if (!selected) return; let current = true; let timer: ReturnType<typeof setTimeout> | undefined; setDetail(null); setAttempts([]); setDetailError('');
    /** @returns 重新读取本人的任务和所有尝试；失败清空并保留恢复入口。 */
    async function load(): Promise<void> {
      try { const [value, history] = await Promise.all([getTask(selected!), taskAttempts(selected!)]); if (current) { setDetail(value); setAttempts(history); setDetailError(''); timer = setTimeout(() => { void load(); }, 5000); } }
      catch (reason) { if (current) { setDetail(null); setAttempts([]); setDetailError(failureMessage(reason)); } }
    }
    void load(); return () => { current = false; clearTimeout(timer); };
  }, [selected, revision]);
  useEffect(() => () => { generation.current++; }, []);
  /** @returns 生成一次创建会话的幂等键，清空上次表单，不保留他人数据。 */
  function openCreate(): void { createKey.current = crypto.randomUUID(); lastInput.current = ''; form.resetFields(); setFormError(''); setSources([]); setDevices([]); setSourceKeyword(''); setSourcePage(1); setSource(null); setCreating(true); }
  /** @returns 无在途写入时关闭；脏表单明确确认，不丢失尚未提交的选择。 */
  function closeCreate(): void {
    if (writeLock.current) return;
    if (form.isFieldsTouched()) { modal.confirm({ title: '放弃未提交的预检任务？', content: '输入将丢失；平台不会创建任务。', okText: '放弃输入', cancelText: '继续填写', onOk: () => { setCreating(false); form.resetFields(); } }); }
    else setCreating(false);
  }
  /** @param values 已校验用户选择 @returns 提交后打开任务详情；重复点击使用同步锁，网络失败重试相同输入保留幂等键。 */
  async function submit(values: TaskForm): Promise<void> {
    if (writeLock.current || !source) return; writeLock.current = true; setBusy(true); setFormError('');
    const signature = JSON.stringify({ ...values, sourceRevision: source.revision }); if (lastInput.current && lastInput.current !== signature) createKey.current = crypto.randomUUID(); lastInput.current = signature;
    try { const task = await createTask({ ...values, sourceRevision: source.revision, requestId: createKey.current }); setCreating(false); form.resetFields(); refresh((value) => value + 1); setSelected(task.id); }
    catch (reason) { setFormError(failureMessage(reason)); }
    finally { writeLock.current = false; setBusy(false); }
  }
  /** @param task 当前任务 @param retry true手动重试false取消 @returns 当前版本操作完成，冲突保留错误并重新读取，不自动覆盖。 */
  async function control(task: Task, retry: boolean): Promise<void> {
    if (writeLock.current) return; writeLock.current = true; setWorking(task.id); setError('');
    try { await controlTask(task.id, task.revision, retry); refresh((value) => value + 1); }
    catch (reason) { setError(failureMessage(reason)); if (selected) setDetailError(failureMessage(reason)); }
    finally { writeLock.current = false; setWorking(null); }
  }
  /** @param task 本人任务 @returns 状态允许的控制按钮；取消明确说明平台与离线设备的边界。 */
  function actions(task: Task) { return active(task.state) ? !props.session.permissions.includes('task.cancel') ? null : <Popconfirm title="取消预检任务？" description="平台立即拒绝旧结果；离线设备可能尚未停止。" okText="取消任务" cancelText="继续预检" onConfirm={() => control(task, false)}><Button danger type="link" disabled={working !== null} loading={working === task.id}>取消</Button></Popconfirm> : task.state !== 'SUCCEEDED' && props.session.permissions.includes('task.retry') ? <Button type="link" disabled={working !== null} loading={working === task.id} onClick={() => void control(task, true)}>重试</Button> : null; }
  return <>
    {modalContext}
    <header className="page-heading"><h1>预检任务</h1>{props.session.permissions.includes('task.create') && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={openCreate}>创建预检</Button>}</header>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} action={<Button onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}
    <div className="data-surface"><div className="list-toolbar"><span>{loading ? '正在加载' : `${data?.total ?? 0} 个任务`}</span><Button type="text" aria-label="刷新任务" loading={loading} icon={<ReloadOutlined aria-hidden />} onClick={() => refresh((value) => value + 1)} /></div>
      <Table<Task> rowKey="id" loading={loading} dataSource={data?.items ?? []} scroll={{ x: 620 }} pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, hideOnSinglePage: false, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无预检任务" /> }} columns={[
        { title: '任务', key: 'name', width: 240, render: (_: unknown, value: Task) => <><Button type="link" className="system-link" onClick={() => setSelected(value.id)}>{value.name}</Button><div className="cell-secondary">{value.sourceName} · {value.branch}</div></> },
        { title: '设备', dataIndex: 'deviceName', width: 130 }, { title: '状态', key: 'state', width: 140, render: (_: unknown, value: Task) => <>{status(value)}<div className="cell-secondary">第 {value.attemptNumber} 次尝试</div></> },
        { title: '操作', key: 'actions', width: 100, render: (_: unknown, value: Task) => actions(value) },
      ]} />
    </div>
    <Drawer title="创建预检" aria-label="创建预检" open={creating} width={540} onClose={closeCreate} destroyOnHidden>
      {formError && <Alert className="form-alert" role="alert" type="error" message={formError} action={<Button onClick={() => refresh((value) => value + 1)}>重新加载选项</Button>} />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy} requiredMark={false}>
        <Form.Item name="name" label="任务名称" rules={[{ required: true, whitespace: true, max: 120, message: '请输入1至120字符的任务名称' }]}><Input autoFocus maxLength={120} /></Form.Item>
        <Form.Item name="sourceId" label="代码来源" tooltip="仅已逐项授权的仓库；分支取来源配置，本轮固定本地commit，不判断远端是否最新。" rules={[{ required: true, message: '请选择已获授权的仓库' }]}><Select aria-label="代码来源" showSearch filterOption={false} loading={optionsLoading} onSearch={(value) => { setSourceKeyword(value); setSourcePage(1); }} onChange={(id: string) => setSource(sources.find((value) => value.id === id) ?? null)} options={sources.filter((item) => item.kind === 'REPOSITORY' && item.canAnalyze).map((item) => ({ value: item.id, label: `${item.name} · ${item.branch}` }))} popupRender={(menu) => <>{menu}{sources.length < sourceTotal && <Button type="text" block disabled={optionsLoading} onClick={() => setSourcePage((value) => value + 1)}>加载更多来源</Button>}</>} /></Form.Item>
        <Form.Item name="deviceId" label="执行设备" tooltip="仅自己的有效私有设备，离线时排队；不自动迁移其他设备。" rules={[{ required: true, message: '请选择自己的设备' }]}><Select aria-label="执行设备" loading={optionsLoading} options={devices.map((item) => ({ value: item.id, label: `${item.name} · ${item.status === 'ONLINE' ? '在线' : '离线'}` }))} /></Form.Item>
        {source && <div className="task-binding"><Typography.Text copyable={{ text: source.id }}>来源 ID：{source.id}</Typography.Text><div>配置版本：{source.revision}</div><div>默认分支：{source.branch}</div></div>}
        <Space><Button type="primary" htmlType="submit" loading={busy} disabled={optionsLoading || !source}>创建任务</Button><Button disabled={busy} onClick={closeCreate}>取消</Button></Space>
      </Form>
    </Drawer>
    <Drawer title={detail?.name ?? '任务详情'} aria-label="任务详情" open={selected !== null} width={620} onClose={() => { if (!working) setSelected(null); }} destroyOnHidden>
      {detailError ? <Alert role="alert" type="error" message={detailError} action={<Button onClick={() => refresh((value) => value + 1)}>重试</Button>} /> : !detail ? <div className="drawer-loading"><Spin /></div> : <>
        <div className="task-state">{status(detail)}{actions(detail)}</div><p className="task-message" role="status">{detail.message}</p>
        <Descriptions column={1} items={[{ key: 'source', label: '来源', children: detail.sourceName }, { key: 'sourceId', label: '来源 ID', children: <Typography.Text copyable>{detail.sourceId}</Typography.Text> }, { key: 'revision', label: '配置版本', children: detail.sourceRevision }, { key: 'branch', label: '本地分支', children: detail.branch }, { key: 'device', label: '设备', children: detail.deviceName }, { key: 'commit', label: '固定 commit', children: detail.commitId || '—' }, { key: 'hash', label: '归档 SHA256', children: detail.archiveSha256 || '—' }, { key: 'files', label: '条目 / 字节', children: detail.state === 'SUCCEEDED' ? `${detail.fileCount} / ${detail.archiveBytes}` : '—' }]} />
        <section className="permission-section"><h2>尝试历史</h2><List dataSource={attempts} renderItem={(attempt) => <List.Item><List.Item.Meta title={<Space>第 {attempt.attemptNumber} 次{status(attempt)}</Space>} description={<><div>{attempt.message}</div><time dateTime={attempt.updatedAt}>{new Date(attempt.updatedAt).toLocaleString('zh-CN')}</time></>} /></List.Item>} /></section>
      </>}
    </Drawer>
  </>;
}
