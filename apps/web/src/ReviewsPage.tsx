/** 候选业务审核工作台；只呈现当前可读的本人提交/受派快照，确认不等于发布或逐条确认。 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Space, Spin, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { CandidateReport, Review, ReviewPage, Session } from '@c2k/contracts';
import { decideReview, failureMessage, getReview, getReviewReport, listReviews } from './api';
import CandidateAssets from './CandidateAssets';
/** 审核状态中文文案；不与原包条目状态混用。 */
const states = { PENDING: '待审核', CONFIRMED: '审核确认', REJECTED: '已驳回' };
/** 页面身份输入；仅控制动作展示，后端重新鉴权。 */
interface PageProps {
  /** 当前登录成员，不为空。 */
  session: Session;
}
/** @param props 当前登录身份，用于操作展示，服务端仍重新核查 @returns 分页审核、不可变内容及带版本的确认/驳回表单 */
export default function ReviewsPage(props: PageProps) {
  const { session } = props;
  const decisionTarget = useRef<Review | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [params, setParams] = useSearchParams(); const selected = params.get('review') ?? '';
  const [page, setPage] = useState(1); const [refresh, setRefresh] = useState(0); const [data, setData] = useState<ReviewPage | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [detail, setDetail] = useState<Review | null>(null); const [report, setReport] = useState<CandidateReport | null>(null); const [detailError, setDetailError] = useState(''); const [decision, setDecision] = useState<'CONFIRMED' | 'REJECTED' | null>(null); const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false); const [decideError, setDecideError] = useState('');
  // 历史导航切换对象即撤销未提交决定；意见不能迁移到另一候选。
  useEffect(() => { decisionTarget.current = null; setDecision(null); setComment(''); setDecideError(''); }, [selected]);
  // 列表失败立即清除旧授权数据；分页超出最新范围则回到有效末页。
  useEffect(() => { let active = true; setData(null); setError(''); setLoading(true); listReviews(page).then((value) => { if (active) { const last = Math.max(1, Math.ceil(value.total / 20)); if (page > last) setPage(last); else setData(value); } }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [page, refresh]);
  // 每次打开/刷新重新授权元数据与原包清单；任一失败都不能保留已撤权正文入口。
  useEffect(() => { let active = true; setDetail(null); setReport(null); setDetailError(''); if (selected) Promise.all([getReview(selected), getReviewReport(selected)]).then(([value, assets]) => { if (active) { setDetail(value); setReport(assets); } }).catch((reason) => { if (active) setDetailError(failureMessage(reason)); }); return () => { active = false; }; }, [selected, refresh]);
  /** @param value 明确确认或驳回 @returns 固定打开时的审核ID、摘要及revision；之后刷新不能悄悄替换对象 */
  function openDecision(value: 'CONFIRMED' | 'REJECTED'): void { if (!detail) return; decisionTarget.current = detail; setDecision(value); setDecideError(''); }
  /** @returns CAS提交明确决定；错误保留意见，不自动刷新或重放，成功重取服务端快照 */
  async function decide(): Promise<void> {
    const target = decisionTarget.current;
    if (!target || target.id !== selected || !decision || !comment.trim()) return; setBusy(true); setDecideError('');
    try { await decideReview(target.id, target.revision, decision, comment.trim()); setDecision(null); setComment(''); setRefresh((value) => value + 1); } catch (reason) { setDecideError(failureMessage(reason)); setReport(null); } finally { setBusy(false); }
  }
  return <><header className="page-heading"><h1>候选审核</h1><Button icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={() => setRefresh((value) => value + 1)}>刷新</Button></header>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} action={<Button onClick={() => setRefresh((value) => value + 1)}>重新加载</Button>} />}
    <div className="data-surface"><Table<Review> rowKey="id" loading={loading} dataSource={data?.items ?? []} scroll={{ x: 820 }} pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, hideOnSinglePage: false, showSizeChanger: false, onChange: setPage }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可读审核" /> }} columns={[
      { title: '候选版本', width: 180, render: (_: unknown, row: Review) => <Button type="link" className="system-link" onClick={() => setParams({ review: row.id })}>{row.digest.slice(0, 16)}</Button> },
      { title: '状态', width: 120, render: (_: unknown, row: Review) => <Tag color={row.state === 'CONFIRMED' ? 'success' : row.state === 'REJECTED' ? 'error' : 'warning'}>{states[row.state]}</Tag> },
      { title: '提交人', dataIndex: 'submitterName', width: 130 }, { title: '审核人', dataIndex: 'reviewerName', width: 130 },
      { title: '方式', width: 110, render: (_: unknown, row: Review) => row.method === 'SELF' ? '自己审核' : '指定审核人' },
      { title: '提交时间', dataIndex: 'createdAt', width: 190, render: (value: string) => new Date(value).toLocaleString('zh-CN') },
    ]} /></div>
    <Drawer footer={<Space><Button ref={closeButton} disabled={busy} onClick={() => setParams({})}>返回列表</Button>{detail && !detailError && detail.state === 'PENDING' && detail.reviewerId === session.id && session.permissions.includes('review.decide') ? <Space><Button danger onClick={() => openDecision('REJECTED')}>驳回</Button><Button type="primary" onClick={() => openDecision('CONFIRMED')}>确认审核</Button></Space> : null}</Space>} title="候选审核详情" aria-label="候选审核详情" open={!!selected} width={800} destroyOnHidden onClose={() => { if (!busy) { setParams({}); setDecision(null); setComment(''); } }}>
      {detailError ? <Alert role="alert" type="error" message={detailError} action={<Button onClick={() => setRefresh((value) => value + 1)}>重新读取</Button>} /> : !detail ? <Spin /> : <>
        <Space wrap className="candidate-tags"><Tag color={detail.state === 'CONFIRMED' ? 'success' : detail.state === 'REJECTED' ? 'error' : 'warning'}>{states[detail.state]}</Tag><Tag>{detail.method === 'SELF' ? '自己审核' : '指定审核人'}</Tag></Space>
        <Descriptions column={1} items={[{ key: 'digest', label: '绑定资产指纹', children: <Typography.Text className="candidate-hash" copyable>{detail.digest}</Typography.Text> }, { key: 'submitter', label: '提交人', children: detail.submitterName }, { key: 'reviewer', label: '审核人', children: detail.reviewerName }, { key: 'time', label: '决定时间', children: detail.decidedAt ? new Date(detail.decidedAt).toLocaleString('zh-CN') : '尚未决定' }, { key: 'comment', label: '审核意见', children: <span className="review-comment">{detail.comment || '尚未填写'}</span> }]} />
        <Alert type="info" message="审核仅记录本候选版本的业务决定，不修改原包条目状态，也不发布知识。" />
        {report && <CandidateAssets key={`${selected}:${refresh}`} id={selected} review report={report} />}

      </>}
    </Drawer>
    <Modal destroyOnHidden afterClose={() => closeButton.current?.focus()} title={decision === 'CONFIRMED' ? '确认本候选版本' : '驳回本候选版本'} open={decision !== null} closable={!busy} maskClosable={false} keyboard={!busy} onCancel={() => { setDecision(null); setDecideError(''); }} footer={<Space><Button disabled={busy} onClick={() => setDecision(null)}>取消</Button><Button type="primary" danger={decision === 'REJECTED'} disabled={!comment.trim() || !!decideError} loading={busy} onClick={() => void decide()}>{decision === 'CONFIRMED' ? '确认审核' : '确认驳回'}</Button></Space>}>
      {decideError && <Alert className="form-alert" role="alert" type="error" message={decideError} action={<Button onClick={() => { setDecision(null); setRefresh((value) => value + 1); }}>刷新审核</Button>} />}
      <Form layout="vertical"><Form.Item label="审核意见" required><Input.TextArea aria-label="审核意见" value={comment} disabled={busy} maxLength={2000} showCount autoSize={{ minRows: 4, maxRows: 10 }} onChange={(event) => setComment(event.target.value)} /></Form.Item></Form>
      <Typography.Paragraph>决定提交后不能覆盖；再次审核须由候选所有者重新送审，历史决定保留。</Typography.Paragraph>
    </Modal>
  </>;
}
