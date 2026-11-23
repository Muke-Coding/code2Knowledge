/** 创建逆向表单的建议性诊断；输入变化即丢弃旧检查，轮询不重置业务表单，模型连接另行验收。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Space, Tag, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import type { Readiness } from '@c2k/contracts';
import { createReadiness, getReadiness, failureMessage, type AnalysisInput } from './api';
/** 当前已确认范围，不包含模型或宿主路径。 */
interface Props {
  /** 当前本人设备，尚未选择为空。 */
  deviceId?: string;
  /** 显式资料选择，未选择为空。 */
  documentsChoice?: string;
  /** 当前来源配置快照。 */
  sources: AnalysisInput['sources'];
  /** 正在提交任务时禁止新增诊断。 */
  disabled: boolean;
}
/** 固定标签，不展示设备传来的任意日志。 */
const labels: Record<string, string> = { NODE: 'Node.js', GIT: 'Git', SKILL: '逆向内核', AGENT: 'Claude CLI', CREDENTIAL: '本机凭证', MATERIALS: '原料准备' };
/** @param props 当前设备与来源 @returns 建议性检查入口，不将检查通过作为任务门禁 */
export default function ReadinessPanel(props: Props) {
  const [result, setResult] = useState<Readiness | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const generation = useRef(0);
  const signature = JSON.stringify([props.deviceId, props.documentsChoice, props.sources]);
  useEffect(() => { generation.current++; setResult(null); setError(''); setBusy(false); }, [signature]);
  useEffect(() => {
    if (!result || result.state === 'EXPIRED') return;
    let current = true; let timer: ReturnType<typeof setTimeout>;
    /** @returns 串行轮询；期限结束隐藏旧通过状态，失败不保留旧结果 */
    async function poll(): Promise<void> {
      if (Date.parse(result!.expiresAt) <= Date.now()) { if (current) setResult({ ...result!, state: 'EXPIRED', checks: [] }); return; }
      try { const value = await getReadiness(result!.id); if (current) { setResult(value); if (value.state !== 'EXPIRED') timer = setTimeout(() => void poll(), 2000); } } catch (reason) { if (current) { setResult(null); setError(failureMessage(reason)); } }
    }
    timer = setTimeout(() => void poll(), 2000); return () => { current = false; clearTimeout(timer); };
  }, [result?.id, signature]);
  /** @returns 单次创建；输入变化或卸载后不接收旧响应，不重复触发模型 */
  async function check(): Promise<void> {
    const own = ++generation.current; setBusy(true); setError(''); setResult(null);
    try { const value = await createReadiness({ deviceId: props.deviceId!, documentsChoice: props.documentsChoice!, sources: props.sources }); if (own === generation.current) setResult(value); } catch (reason) { if (own === generation.current) setError(failureMessage(reason)); } finally { if (own === generation.current) setBusy(false); }
  }
  useEffect(() => () => { generation.current++; }, []);
  const running = result?.state === 'PENDING' || result?.state === 'CHECKING';
  return <section className="permission-section readiness-panel" aria-label="运行时就绪检查">
    <Space wrap><Button aria-label="检查运行时" onClick={() => void check()} loading={busy || running} disabled={props.disabled || !props.deviceId || !props.documentsChoice || !props.sources.length}>检查运行时</Button><Tooltip title="建议启动前检查，可跳过。检查不调用模型；配置与原料通过不代表模型连通或业务知识准确。"><InfoCircleOutlined tabIndex={0} aria-label="就绪检查边界" /></Tooltip>{running && <span role="status">{result.state === 'PENDING' ? '等待设备检查' : '设备检查中'}</span>}</Space>
    {error && <Alert className="form-alert" role="alert" type="error" message={error} />}
    {result?.state === 'EXPIRED' && <Alert className="form-alert" role="status" type="warning" message="检查已过期，请重新检查" />}
    {result?.state === 'COMPLETE' && <><Descriptions className="readiness-checks" size="small" column={{ xs: 1, sm: 2 }} items={result.checks.map((check) => ({ key: check.code, label: labels[check.code], children: <Tag color={check.status === 'PASS' ? 'success' : check.status === 'FAIL' ? 'error' : 'default'}>{check.status === 'PASS' ? '通过' : check.status === 'FAIL' ? '未就绪' : '未检查'}</Tag> }))} /><Alert type={result.checks.some((value) => value.status !== 'PASS') ? 'warning' : 'info'} message={result.checks.some((value) => value.status !== 'PASS') ? '请在设备本机检查工具版本、专用配置及所选来源许可后重试' : '本机配置与原料就绪；模型连通及逆向质量尚未验证'} /></>}
  </section>;
}
