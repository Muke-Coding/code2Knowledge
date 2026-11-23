/** 私有候选知识入口；只读取服务端当前授权结果，导入不代表平台执行逆向、审核或发布。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Modal, Space, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { DownloadOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Candidate, CandidatePage, CandidateReport, Session } from '@c2k/contracts';
import { downloadCandidate, failureMessage, getCandidate, listCandidates } from './api';
import CandidateAssets from './CandidateAssets';
import SubmitReview from './SubmitReview';
/** @param bytes 非负字节数 @returns 面向用户的KiB大小，原始字节在详情保留 */
function size(bytes: number): string { return `${(bytes / 1024).toFixed(1)} KiB`; }
/** 页面身份输入；仅控制动作展示，后端重新鉴权。 */
interface PageProps {
  /** 当前登录成员，不为空。 */
  session: Session;
}
/** @param props 当前会话用于审核动作展示，服务端独立鉴权 @returns 本人候选、内容阅读和显式送审，不提供发布 */
export default function CandidatesPage(props: PageProps) {
  const { session } = props;
  const [page, setPage] = useState(1); const [revision, refresh] = useState(0); const [data, setData] = useState<CandidatePage | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [selected, setSelected] = useState<Candidate | null>(null); const [report, setReport] = useState<CandidateReport | null>(null); const [detailError, setDetailError] = useState(''); const [downloading, setDownloading] = useState(false); const [guide, setGuide] = useState(false);
  const downloadController = useRef<AbortController | null>(null);
  const guideDone = useRef<HTMLButtonElement>(null); const retryDetail = useRef<HTMLButtonElement>(null);
  // 页码切换、身份树卸载和刷新使旧响应失效；失败清空旧数据，不能继续展示已撤权内容。
  useEffect(() => {
    let current = true; setData(null); setLoading(true); setError('');
    listCandidates(page).then((value) => { if (!current) return; const last = Math.max(1, Math.ceil(value.total / 20)); if (page > last) setPage(last); else setData(value); }).catch((reason) => { if (current) setError(failureMessage(reason)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, revision]);
  // 每次打开和重试都重新鉴权；关闭后清除报告，不在浏览器持久化任何候选元数据。
  useEffect(() => {
    let current = true; setReport(null); setDetailError(''); if (selected) getCandidate(selected.id).then((value) => { if (current) setReport(value); }).catch((reason) => { if (current) setDetailError(failureMessage(reason)); });
    return () => { current = false; };
  }, [selected, revision]);
  // 关闭候选、导航和身份树卸载均取消在途读取；失效页面不得继续触发原身份下载。
  useEffect(() => () => { downloadController.current?.abort(); downloadController.current = null; }, [selected]);
  // 下载失败会禁用原按钮，将焦点交给可恢复动作，避免焦点落到背景后无法用Escape关闭。
  useEffect(() => { if (detailError) retryDetail.current?.focus(); }, [detailError]);
  /** @returns 下载当前候选原ZIP；下载前服务端重新验证所有来源，失败保留安全错误，不打开未知链接 */
  async function download(): Promise<void> {
    if (!selected || downloading) return; const controller = new AbortController(); downloadController.current = controller; setDownloading(true); setDetailError('');
    try { await downloadCandidate(selected.id, controller.signal); } catch (reason) { if (!controller.signal.aborted) { setReport(null); setDetailError(failureMessage(reason)); } } finally { if (downloadController.current === controller) { downloadController.current = null; setDownloading(false); } }
  }
  return <>
    <header className="page-heading"><h1>候选知识 <Tooltip title="仅本人且保有全部来源当前分析授权时可读；未审核、未发布。"><InfoCircleOutlined aria-label="候选访问范围" className="heading-info" tabIndex={0} /></Tooltip></h1>{session.permissions.includes('candidate.import') && <Button type="primary" onClick={() => setGuide(true)}>导入指引</Button>}</header>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} action={<Button onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}
    <div className="data-surface"><div className="list-toolbar"><span>{loading ? '正在加载' : `${data?.total ?? 0} 个候选版本`}</span><Button type="text" aria-label="刷新候选" loading={loading} icon={<ReloadOutlined aria-hidden />} onClick={() => refresh((value) => value + 1)} /></div>
      <Table<Candidate> rowKey="id" loading={loading} dataSource={data?.items ?? []} scroll={{ x: 680 }} pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, hideOnSinglePage: false, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可读候选知识" /> }} columns={[
        { title: '候选版本', key: 'version', width: 260, render: (_: unknown, value: Candidate) => <><Button type="link" className="system-link candidate-version" onClick={() => setSelected(value)}>{value.digest.slice(0, 16)}</Button><div className="cell-secondary">{value.id.slice(0, 8)}</div></> },
        { title: '接入方式', key: 'mode', width: 120, render: (_: unknown, value: Candidate) => <Tag>{value.mode === 'EXECUTED' ? '平台执行' : '产物导入'}</Tag> },
        { title: '接收时间', dataIndex: 'createdAt', width: 200, render: (value: string) => <time dateTime={value}>{new Date(value).toLocaleString('zh-CN')}</time> },
        { title: '包大小', dataIndex: 'archiveBytes', width: 100, render: size },
      ]} />
    </div>
    <Drawer title="候选版本" aria-label="候选版本" open={selected !== null} width={740} onClose={() => { downloadController.current?.abort(); setDownloading(false); setSelected(null); }} destroyOnHidden extra={<Button icon={<DownloadOutlined aria-hidden />} loading={downloading} disabled={!report || !!detailError || !session.permissions.includes('candidate.download')} onClick={() => void download()}>下载原包</Button>}>
      {detailError ? <Alert role="alert" type="error" message={detailError} action={<Button ref={retryDetail} onClick={() => refresh((value) => value + 1)}>重试</Button>} /> : !report || !selected ? <div className="drawer-loading"><Spin /></div> : <>
        <Space wrap className="candidate-tags"><Tooltip title="仅结构和来源版本校验，业务仍待审核；平台执行由受控设备生成，导入仅校验包内声明。"><Tag tabIndex={0}>{selected?.mode === 'EXECUTED' ? '平台执行' : '产物导入'}</Tag></Tooltip><Tooltip title="此处是原包校验状态；审核决定请在候选审核中查看，原包不改写。"><Tag color="warning">原包业务待核验</Tag></Tooltip></Space>
        <Descriptions column={1} items={[{ key: 'id', label: '候选 ID', children: <Typography.Text copyable className="candidate-hash">{selected.id}</Typography.Text> }, { key: 'digest', label: '资产指纹', children: <Typography.Text copyable className="candidate-hash">{report.digest}</Typography.Text> }, { key: 'versions', label: 'Skill / 契约', children: `${report.skillVersion} / ${report.contractVersion}` }, { key: 'bytes', label: '原包字节', children: selected.archiveBytes }]} />
        {session.permissions.includes('review.submit') && <SubmitReview candidateId={selected.id} session={session} />}
        <CandidateAssets id={selected.id} report={report} />
      </>}
    </Drawer>
    <Modal afterOpenChange={(open) => { if (open) guideDone.current?.focus(); }} title="从设备导入产物" open={guide} onCancel={() => setGuide(false)} footer={<Button ref={guideDone} type="primary" onClick={() => setGuide(false)}>知道了</Button>}>
      <ol className="candidate-guide"><li>在“我的设备”配对设备，使用 CLI 显式绑定已授权仓库或资料根。</li><li>将 Skill 1.0.2 导出的 ontology、domains、graph、mappings、rules 五个目录直接放在 ZIP 根目录。</li><li>建立来源映射文件，每项包含 sourceId、revision、repository、commit；代码提交完整 commit；资料还需 kind=document、path，repository 为 document_id、commit 为原文 SHA-256。</li></ol>
      <Typography.Paragraph copyable={{ text: 'node apps/runtime/dist/cli.js import-candidate --archive /path/knowledge.zip --bindings /path/bindings.json' }}><pre className="runtime-command">{'node apps/runtime/dist/cli.js import-candidate\n  --archive /path/knowledge.zip\n  --bindings /path/bindings.json'}</pre></Typography.Paragraph>
      <Alert type="info" message="支持代码与资料来源包；单包≤8 MiB。导入不会调用 Agent，也不会核验来源声明对应的真实代码。" />
    </Modal>
  </>;
}
