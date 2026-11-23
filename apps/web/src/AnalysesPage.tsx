/** 多来源业务逆向页面；模型只在运行时配置，平台编排全部来源/业务范围与当前授权，不将任务成功等同业务审核。 */
import { useEffect, useRef, useState } from 'react';
import ReadinessPanel from './ReadinessPanel';
import { Link } from 'react-router-dom';
import { Alert, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Popconfirm, Radio, Select, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Task, AnalysisTask, AnalysisPage, Device, Session, Source, SourcePage } from '@c2k/contracts';
import { controlAnalysis, createAnalysis, failureMessage, taskAttempts, getAnalysis, listAnalyses, listDevices, listSources, type AnalysisInput } from './api';
import type { InputRef } from 'antd';
/** 创建业务表单；来源选择独立保留配置快照。 */
interface AnalysisForm {
  /** 任务名称。 */
  name: string;
  /** 产品稳定标识。 */
  product: string;
  /** 业务域稳定标识。 */
  domain: string;
  /** 本次分析业务范围。 */
  scope: string;
  /** 显式是否添加资料，未选择不能创建。 */
  documentsChoice: 'INCLUDE' | 'NONE';
  /** 本人有效设备。 */
  deviceId: string;
}
/** 选择后的来源与用户确认别名，不受服务端选项分页切换影响。 */
interface SelectedSource {
  /** 选择时来源配置快照。 */
  source: Source;
  /** 本次唯一材料标识。 */
  alias: string;
}
/** 当前身份仅控制入口显示，真正权限由每次请求的服务端执行。 */
interface Props {
  /** 已认证会话，不作为后端授权事实。 */
  session: Session;
}
/** 已实现尝试状态词典，SUCCEEDED仅代表候选接收。 */
const labels: Record<string, string> = { QUEUED: '等待设备', RUNNING: '执行中', SUCCEEDED: '候选已接收', FAILED: '失败', CANCELLED: '已取消', EXPIRED: '租约过期' };
/** @param value 当前尝试状态 @returns 是否仍可取消 */
function active(value: string): boolean { return value === 'QUEUED' || value === 'RUNNING'; }
/** @param task 当前逆向尝试 @returns 文字与颜色双重表达，不伪造阶段百分比 */
function status(task: AnalysisTask) { return <Tag color={task.state === 'SUCCEEDED' ? 'success' : task.state === 'RUNNING' ? 'processing' : task.state === 'FAILED' || task.state === 'EXPIRED' ? 'error' : 'default'}>{labels[task.state]}</Tag>; }
/** @param props 当前主体 @returns 逆向列表、多来源创建与详情；无模型、共享、审核或发布配置 */
export default function AnalysesPage(props: Props) {
  const [page, setPage] = useState(1); const [revision, refresh] = useState(0); const [data, setData] = useState<AnalysisPage | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(''); const [form] = Form.useForm<AnalysisForm>(); const [modal, context] = Modal.useModal();
  const [sourcePage, setSourcePage] = useState(1); const [keyword, setKeyword] = useState(''); const [options, setOptions] = useState<SourcePage | null>(null); const [optionsLoading, setOptionsLoading] = useState(false); const [devices, setDevices] = useState<Device[]>([]); const [chosen, setChosen] = useState<SelectedSource[]>([]);
  const [selected, setSelected] = useState<string | null>(null); const [detail, setDetail] = useState<AnalysisTask | null>(null); const [attempts, setAttempts] = useState<Task[]>([]); const [detailError, setDetailError] = useState(''); const [working, setWorking] = useState(false); const lock = useRef(false); const requestId = useRef(''); const signature = useRef('');
  const firstInput = useRef<InputRef>(null);
  const deviceId = Form.useWatch('deviceId', form);
  const documentsChoice = Form.useWatch('documentsChoice', form);
  // 完成后轮询，不积累慢请求；错误时清空旧列表，切页和卸载使响应失效。
  useEffect(() => {
    let current = true; let timer: ReturnType<typeof setTimeout> | undefined; setLoading(true); setData(null); setError('');
    /** @returns 当前本人分页及下一次轮询，撤权/失败不保留旧行 */
    async function load(): Promise<void> { try { const value = await listAnalyses(page); if (current) { const last = Math.max(1, Math.ceil(value.total / 20)); if (page > last) setPage(last); else setData(value); setError(''); timer = setTimeout(() => void load(), 5000); } } catch (reason) { if (current) { setData(null); setError(failureMessage(reason)); } } finally { if (current) setLoading(false); } }
    void load(); return () => { current = false; clearTimeout(timer); };
  }, [page, revision]);
  // 300+来源使用服务端分页检索；已选项单独保存，不因换页丢失，也不静默升级其配置版本。
  useEffect(() => {
    if (!creating) return; let current = true; setOptionsLoading(true); setOptions(null);
    const timer = setTimeout(() => { Promise.all([listSources(sourcePage, keyword), listDevices()]).then(([sources, values]) => { if (current) { setOptions(sources); setDevices(values.filter((value) => value.status !== 'REVOKED')); setFormError(''); } }).catch((reason) => { if (current) { setOptions(null); setDevices([]); setFormError(failureMessage(reason)); } }).finally(() => { if (current) setOptionsLoading(false); }); }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [creating, sourcePage, keyword, revision]);
  useEffect(() => {
    if (!selected) return; let current = true; let timer: ReturnType<typeof setTimeout> | undefined; setDetail(null); setAttempts([]); setDetailError('');
    /** @returns 当前尝试及候选引用，关闭后不接收旧响应 */
    async function load(): Promise<void> { try { const [value, history] = await Promise.all([getAnalysis(selected!), taskAttempts(selected!)]); if (current) { setDetail(value); setAttempts(history); setDetailError(''); if (active(value.state)) timer = setTimeout(() => void load(), 3000); } } catch (reason) { if (current) { setDetail(null); setAttempts([]); setDetailError(failureMessage(reason)); } } }
    void load(); return () => { current = false; clearTimeout(timer); };
  }, [selected, revision]);
  /** @returns 开启一次明确创建会话，不复用旧成员输入或幂等键 */
  function open(): void { form.resetFields(); setChosen([]); setOptions(null); setKeyword(''); setSourcePage(1); setFormError(''); requestId.current = crypto.randomUUID(); signature.current = ''; setCreating(true); }
  /** @returns 脏输入须确认后放弃，写入中不能关窗 */
  function close(): void { if (lock.current) return; if (form.isFieldsTouched() || chosen.length) modal.confirm({ title: '放弃未提交的逆向任务？', content: '输入将丢失；平台不会创建任务。', okText: '放弃输入', cancelText: '继续填写', onOk: () => setCreating(false) }); else setCreating(false); }
  /** @param source 明确当前行 @param checked 是否选中 @returns 保存用户确认的来源快照，最多16项，不自动增加未授权来源 */
  function choose(source: Source, checked: boolean): void { setChosen((previous) => checked ? previous.some((value) => value.source.id === source.id) || previous.length >= 16 ? previous : [...previous, { source, alias: (source.kind === 'REPOSITORY' ? 'repo-' : 'docs-') + source.id.slice(0, 8) }] : previous.filter((value) => value.source.id !== source.id)); }
  /** @param values 有效业务表单 @returns 成功进入详情；输入不变的网络重试沿用同一幂等键，配置冲突保留输入 */
  async function submit(values: AnalysisForm): Promise<void> {
    if (lock.current) return;
    if (!chosen.some((value) => value.source.kind === 'REPOSITORY') || (values.documentsChoice === 'INCLUDE' ? !chosen.some((value) => value.source.kind === 'DOCUMENT') : chosen.some((value) => value.source.kind === 'DOCUMENT')) || chosen.some((value) => !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value.alias)) || new Set(chosen.map((value) => value.alias)).size !== chosen.length) { setFormError('请选择至少一个仓库，明确资料选择，并填写不重复的稳定材料标识'); return; }
    const input = { ...values, sources: chosen.map((value) => ({ sourceId: value.source.id, revision: value.source.revision, alias: value.alias })).sort((left, right) => left.alias.localeCompare(right.alias)) }; const next = JSON.stringify(input); if (signature.current && signature.current !== next) requestId.current = crypto.randomUUID(); signature.current = next;
    lock.current = true; setBusy(true); setFormError('');
    try { const task = await createAnalysis({ ...input, requestId: requestId.current } as AnalysisInput); setCreating(false); setSelected(task.id); refresh((value) => value + 1); } catch (reason) { setFormError(failureMessage(reason)); } finally { lock.current = false; setBusy(false); }
  }
  /** @param task 当前本人任务 @param retry 是否手动重试 @returns 控制版本提交完成，失败保留错误并刷新，不自动改输入或迁移设备 */
  async function control(task: AnalysisTask, retry: boolean): Promise<void> { if (lock.current) return; lock.current = true; setWorking(true); setError(''); try { await controlAnalysis(task.id, task.revision, retry); refresh((value) => value + 1); } catch (reason) { setError(failureMessage(reason)); setDetailError(failureMessage(reason)); } finally { lock.current = false; setWorking(false); } }
  /** @param task 当前状态 @returns 只显示有效控制；取消明确旧结果与离线物理停止边界 */
  function actions(task: AnalysisTask) { return active(task.state) ? !props.session.permissions.includes('analysis.cancel') ? null : <Popconfirm title="取消逆向任务？" description="平台拒绝旧结果；离线设备可能尚未停止，已发送的模型请求无法撤回。" okText="取消任务" cancelText="继续执行" onConfirm={() => control(task, false)}><Button type="link" danger loading={working} disabled={working}>取消</Button></Popconfirm> : task.state !== 'SUCCEEDED' && props.session.permissions.includes('analysis.retry') ? <Button type="link" disabled={working} onClick={() => void control(task, true)}>重试</Button> : null; }
  return <>{context}
    <header className="page-heading"><h1>逆向任务 <Tooltip title="模型与专用凭证仅在设备配置；任务成功表示私有候选接收，业务仍待审核。"><InfoCircleOutlined aria-label="逆向执行边界" className="heading-info" tabIndex={0} /></Tooltip></h1>{props.session.permissions.includes('analysis.create') && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={open}>创建逆向</Button>}</header>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} action={<Button onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}
    <div className="data-surface"><div className="list-toolbar"><span>{loading ? '正在加载' : `${data?.total ?? 0} 个任务`}</span><Button type="text" aria-label="刷新逆向任务" icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={() => refresh((value) => value + 1)} /></div><Table<AnalysisTask> rowKey="id" loading={loading} dataSource={data?.items ?? []} scroll={{ x: 680 }} pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, hideOnSinglePage: false, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无逆向任务" /> }} columns={[{ title: '任务', key: 'name', width: 240, render: (_: unknown, task: AnalysisTask) => <><Button type="link" className="system-link" onClick={() => setSelected(task.id)}>{task.name}</Button><div className="cell-secondary">{task.product} / {task.domain} · {task.sources.length} 个来源</div></> }, { title: '设备', dataIndex: 'deviceName', width: 140 }, { title: '状态', key: 'state', width: 160, render: (_: unknown, task: AnalysisTask) => <>{status(task)}<div className="cell-secondary">第 {task.attemptNumber} 次尝试</div></> }, { title: '操作', key: 'actions', width: 100, render: (_: unknown, task: AnalysisTask) => actions(task) }]} /></div>
    <Drawer afterOpenChange={(visible) => { if (visible) firstInput.current?.focus(); }} title="创建逆向" aria-label="创建逆向" open={creating} width={840} onClose={close} destroyOnHidden>
      {formError && <Alert className="form-alert" role="alert" type="error" message={formError} action={<Button onClick={() => refresh((value) => value + 1)}>重新加载选项</Button>} />}
      <Form form={form} layout="vertical" requiredMark={false} disabled={busy} onFinish={submit}>
        <Form.Item name="name" label="任务名称" rules={[{ required: true, whitespace: true, max: 120, message: '请输入任务名称' }]}><Input ref={firstInput} maxLength={120} /></Form.Item>
        <div className="analysis-identity"><Form.Item name="product" label="产品标识" tooltip="小写字母数字，可用单个短横线分隔；用于知识稳定ID。" rules={[{ required: true, max: 80, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '请输入80字符内小写稳定标识' }]}><Input maxLength={80} /></Form.Item><Form.Item name="domain" label="业务域标识" rules={[{ required: true, max: 80, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '请输入80字符内小写稳定标识' }]}><Input maxLength={80} /></Form.Item></div>
        <Form.Item name="scope" label="业务范围" rules={[{ required: true, whitespace: true, max: 2000, message: '请明确业务流程、边界及关注点' }]}><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
        <Form.Item name="documentsChoice" label="资料选择" rules={[{ required: true, message: '请明确是否添加资料' }]}><Radio.Group options={[{ label: '添加资料', value: 'INCLUDE' }, { label: '仅代码', value: 'NONE' }]} onChange={(event) => { if (event.target.value === 'NONE') setChosen((values) => values.filter((value) => value.source.kind === 'REPOSITORY')); }} /></Form.Item>
        <section className="permission-section"><h2>来源 <Typography.Text type="secondary">{chosen.length}/16</Typography.Text></h2><Input.Search aria-label="搜索逆向来源" placeholder="搜索来源" allowClear onSearch={(value) => { setKeyword(value); setSourcePage(1); }} />
          <Table<Source> rowKey="id" size="small" loading={optionsLoading} dataSource={options?.items ?? []} scroll={{ x: 540 }} rowSelection={{ selectedRowKeys: chosen.map((value) => value.source.id), preserveSelectedRowKeys: true, hideSelectAll: true, onSelect: choose, getCheckboxProps: (source) => ({ disabled: busy || !source.canAnalyze || !source.enabled || (source.kind === 'DOCUMENT' && documentsChoice !== 'INCLUDE') || (chosen.length >= 16 && !chosen.some((value) => value.source.id === source.id)) }) }} pagination={{ current: sourcePage, pageSize: 20, total: options?.total ?? 0, showSizeChanger: false, onChange: setSourcePage }} columns={[{ title: '来源', dataIndex: 'name', width: 220 }, { title: '类型', key: 'kind', width: 90, render: (_: unknown, source: Source) => source.kind === 'REPOSITORY' ? '代码' : '资料' }, { title: '分支 / 版本', key: 'version', width: 140, render: (_: unknown, source: Source) => `${source.branch || '—'} / ${source.revision}` }]} />
          {chosen.length > 0 && <Table<SelectedSource> className="analysis-selected" rowKey={(value) => value.source.id} size="small" dataSource={chosen} scroll={{ x: 540 }} pagination={false} columns={[{ title: '已选来源', key: 'name', width: 200, render: (_: unknown, value: SelectedSource) => <Tooltip title={`来源ID：${value.source.id}；配置版本：${value.source.revision}`}><Typography.Text ellipsis>{value.source.name}</Typography.Text></Tooltip> }, { title: '材料标识', key: 'alias', width: 240, render: (_: unknown, value: SelectedSource) => <Input aria-label={`${value.source.name}材料标识`} value={value.alias} maxLength={80} disabled={busy} onChange={(event) => setChosen((values) => values.map((item) => item.source.id === value.source.id ? { ...item, alias: event.target.value } : item))} /> }, { title: '操作', key: 'remove', width: 80, render: (_: unknown, value: SelectedSource) => <Button type="link" disabled={busy} onClick={() => choose(value.source, false)}>移除</Button> }]} />}
        </section>
        <Form.Item name="deviceId" label="执行设备" tooltip="需在本机配置专用模型及每个代码/资料许可；未配置模型的设备不会领取逆向任务。" rules={[{ required: true, message: '请选择自己的有效设备' }]}><Select aria-label="执行设备" loading={optionsLoading} options={devices.map((value) => ({ value: value.id, label: `${value.name} · ${value.status === 'ONLINE' ? '在线' : '离线'}` }))} /></Form.Item>
        {creating && <ReadinessPanel deviceId={deviceId} documentsChoice={documentsChoice} sources={chosen.map((value) => ({ sourceId: value.source.id, revision: value.source.revision, alias: value.alias }))} disabled={busy} />}
        <Space><Button type="primary" htmlType="submit" loading={busy} disabled={optionsLoading}>创建任务</Button><Button disabled={busy} onClick={close}>取消</Button></Space>
      </Form>
    </Drawer>
    <Drawer title={detail?.name ?? '逆向详情'} aria-label="逆向详情" open={selected !== null} width={740} onClose={() => { if (!working) setSelected(null); }} destroyOnHidden>
      {detailError ? <Alert role="alert" type="error" message={detailError} action={<Button onClick={() => refresh((value) => value + 1)}>重试</Button>} /> : !detail ? <div className="drawer-loading"><Spin /></div> : <><div className="task-state">{status(detail)}{actions(detail)}</div><p role="status">{detail.message}</p><Descriptions column={1} items={[{ key: 'domain', label: '产品 / 业务域', children: `${detail.product} / ${detail.domain}` }, { key: 'scope', label: '业务范围', children: detail.scope }, { key: 'docs', label: '资料选择', children: detail.documentsChoice === 'INCLUDE' ? '已添加资料' : '仅代码' }, { key: 'device', label: '设备', children: detail.deviceName }, { key: 'attempt', label: '当前尝试', children: `第 ${detail.attemptNumber} 次` }, { key: 'candidate', label: '候选', children: detail.candidateId && props.session.permissions.includes('candidate.read') ? <Link to="/candidates">查看候选知识</Link> : '—' }]} /><section className="permission-section"><h2>固定来源</h2><Table rowKey="sourceId" size="small" dataSource={detail.sources} scroll={{ x: 540 }} pagination={{ pageSize: 10, hideOnSinglePage: false, showSizeChanger: false }} columns={[{ title: '材料标识', dataIndex: 'alias', width: 180 }, { title: '类型', dataIndex: 'kind', width: 90, render: (kind: string) => kind === 'REPOSITORY' ? '代码' : '资料' }, { title: '分支 / 定位', key: 'locator', width: 220, render: (_: unknown, value: AnalysisTask['sources'][number]) => <span className="candidate-path">{value.branch || value.locator}</span> }, { title: '版本', dataIndex: 'revision', width: 70 }]} /></section><section className="permission-section"><h2>尝试历史</h2><Table<Task> rowKey="attemptId" size="small" dataSource={attempts} scroll={{ x: 460 }} pagination={{ pageSize: 10, hideOnSinglePage: false, showSizeChanger: false }} columns={[{ title: '尝试', dataIndex: 'attemptNumber', width: 70 }, { title: '状态', dataIndex: 'state', width: 120, render: (state: string) => labels[state] ?? state }, { title: '结果', dataIndex: 'message', width: 240 }]} /></section></>}
    </Drawer>
  </>;
}
