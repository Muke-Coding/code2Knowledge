/** 显式送审表单；自审与指定人均由服务端核验审核动作及所有来源，客户端不推定授权。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal, Radio, Select, Space } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { Reviewer, Session } from '@c2k/contracts';
import { failureMessage, listReviewers, submitReview } from './api';
/** 送审上下文，提交仅绑定不可变候选，不发布原包。 */
interface SubmitProps {
  /** 当前候选UUID。 */
  candidateId: string;
  /** 登录身份，动作提示仍非服务端授权票据。 */
  session: Session;
}
/** @param props 当前本人候选和会话 @returns 送审操作及显式方式/审核人表单 */
export default function SubmitReview(props: SubmitProps) {
  const { candidateId, session } = props;
  const navigate = useNavigate(); const [open, setOpen] = useState(false); const [mode, setMode] = useState<'SELF' | 'ASSIGNED'>('ASSIGNED'); const [reviewer, setReviewer] = useState<string>(); const [people, setPeople] = useState<Reviewer[]>([]); const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1); const [more, setMore] = useState(false); const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const request = useRef({ signature: '', id: '' });
  // 仅显示服务端当前合格成员；分页按20项追加，搜索重置候选，失效响应不得覆盖新查询。
  useEffect(() => {
    if (!open || mode !== 'ASSIGNED') return; let active = true; setLoading(true); setError('');
    const timer = window.setTimeout(() => { listReviewers(candidateId, keyword, page).then((value) => { if (active) { setPeople((old) => page === 1 ? value : [...old, ...value.filter((item) => !old.some((row) => row.id === item.id))]); setMore(value.length === 20); } }).catch((reason) => { if (active) { setPeople([]); setError(failureMessage(reason)); } }).finally(() => { if (active) setLoading(false); }); }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [candidateId, open, mode, keyword, page]);
  /** @returns 提交成功进入审核页；网络失败保留同输入幂等键，避免重复送审，不自动换审核人 */
  async function submit(): Promise<void> {
    const person = mode === 'SELF' ? session.id : reviewer; if (!person) return;
    const signature = `${candidateId}:${person}`; if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setBusy(true); setError(''); try { const value = await submitReview(candidateId, person, request.current.id); setOpen(false); navigate(`/reviews?review=${encodeURIComponent(value.id)}`); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); }
  }
  return <><Button type="primary" onClick={() => { setOpen(true); setError(''); }}>提交审核</Button><Modal title="提交候选审核" open={open} closable={!busy} maskClosable={false} keyboard={!busy} onCancel={() => setOpen(false)} footer={<Space><Button disabled={busy} onClick={() => setOpen(false)}>取消</Button><Button type="primary" loading={busy} disabled={mode === 'ASSIGNED' ? !reviewer || loading : !session.permissions.includes('review.decide')} onClick={() => void submit()}>提交审核</Button></Space>}>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} />}
    <Form layout="vertical"><Form.Item label="审核方式"><Radio.Group disabled={busy} value={mode} onChange={(event) => { setMode(event.target.value); setError(''); }}><Radio value="SELF" disabled={!session.permissions.includes('review.decide')}>自己审核</Radio><Radio value="ASSIGNED">指定审核人</Radio></Radio.Group></Form.Item>
      {mode === 'ASSIGNED' && <Form.Item label="审核人" required><Select aria-label="审核人" showSearch filterOption={false} disabled={busy} loading={loading} value={reviewer} options={people.filter((person) => person.id !== session.id).map((person) => ({ value: person.id, label: person.displayName }))} onChange={setReviewer} onSearch={(value) => { setKeyword(value); setPage(1); setPeople([]); setReviewer(undefined); }} notFoundContent={loading ? '正在查找' : '没有符合权限的审核人'} />{more && <Button type="link" loading={loading} onClick={() => setPage((value) => value + 1)}>加载更多审核人</Button>}</Form.Item>}
    </Form><Alert type="info" message={mode === 'SELF' ? '自己审核仍须具备审核动作与全部来源当前分析授权。' : '提交后，所选审核人可在授权有效期间阅读本候选内容；不会获得原包下载权限。'} />
  </Modal></>;
}
