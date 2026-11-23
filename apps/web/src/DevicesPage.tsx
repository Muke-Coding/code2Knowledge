/** 私有设备管理界面；只展示当前所有者接入与心跳，不声称来源访问、任务执行或共享已实现。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Empty, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, CopyOutlined, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { Session, Device, Pairing } from '@c2k/contracts';
import { listDevices, createPairing, revokeDevice, failureMessage } from './api';
import { useList } from './use-list';
/** 设备接入状态中文映射，只显示服务端事实，不用本机计时伪造在线。 */
const stateLabels = { ONLINE: '在线', OFFLINE: '离线', REVOKED: '已失效' };
/** 页面身份参数，客户端仅控制展示。 */
interface PageProps {
  /** 当前登录会话，不为空。 */
  session: Session;
}
/** @param props 当前有效身份 @returns 私有设备列表和配对抽屉，包含加载/空/失败/撤销状态，不为空。 */
export default function DevicesPage(props: PageProps) {
  const { session } = props;
  const { items, loading, error, reload } = useList(listDevices);
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [revoking, setRevoking] = useState('');
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const action = useRef<HTMLButtonElement>(null);
  const deviceOrigin = window.location.origin;
  const expired = pairing !== null && Date.parse(pairing.expiresAt) <= now;
  // 有配对资料时本地计时仅用于到期提示；服务端仍独立拒绝过期码。切页后失效未完成响应。
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); generation.current++; };
  }, []);
  /**
   * 创建单次配对资料；新码会使旧待兑换码失效，不在页面URL/缓存/日志保存。
   * @returns 创建处理完成，无业务返回。
   */
  async function generate(): Promise<void> {
    const current = ++generation.current; setOpen(true); setBusy(true); setMutationError(''); setPairing(null);
    try { const result = await createPairing(); if (generation.current === current) { setPairing(result); setNow(Date.now()); } }
    catch (reason) { if (generation.current === current) setMutationError(failureMessage(reason)); }
    finally { if (generation.current === current) setBusy(false); }
  }
  /** @returns 关闭并移除页面中的配对原码，恢复接入按钮焦点，无业务返回。 */
  function close(): void { generation.current++; setOpen(false); setPairing(null); setBusy(false); setMutationError(''); requestAnimationFrame(() => action.current?.focus()); }
  /**
   * 当前所有者不可逆撤销设备，成功后重读真实状态；不会删除本机文件或承诺物理停止宿主。
   * @param device 目标私有设备，不为空。
   * @returns 撤销处理完成，无业务返回。
   */
  async function revoke(device: Device): Promise<void> {
    setRevoking(device.id); setMutationError('');
    try { await revokeDevice(device.id); await reload(); }
    catch (reason) { setMutationError(failureMessage(reason)); }
    finally { setRevoking(''); }
  }
  return <>
    <header className="page-heading"><h1>我的设备</h1>{session.permissions.includes('device.pair') && <Button ref={action} type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => void generate()}>接入设备</Button>}</header>
    {!open && mutationError && <Alert type="error" role="alert" message={mutationError} className="form-alert" showIcon />}
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void reload()}>重试</Button>} /> : <div className="data-surface">
      <div className="list-toolbar"><Space><span>{loading ? '正在加载' : `${items.length} 台私有设备`}</span><Tooltip title="仅本人可查看和撤销；在线只代表最近30秒收到心跳，在线不代表来源读取许可或执行隔离能力。"><InfoCircleOutlined aria-label="设备状态说明" tabIndex={0} /></Tooltip></Space><Button type="text" aria-label="刷新设备" icon={<ReloadOutlined aria-hidden />} loading={loading} onClick={() => void reload()} /></div>
      <Table<Device> rowKey="id" dataSource={items} loading={loading} pagination={{ pageSize: 10, hideOnSinglePage: false, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未接入设备" /> }} columns={[
        { title: '设备', dataIndex: 'name', render: (name: string, device: Device) => <div><div className="cell-title">{name}</div><div className="cell-secondary">{device.os} · {device.arch}</div></div> },
        { title: '状态', dataIndex: 'status', width: 90, render: (state: Device['status']) => <Tag color={state === 'ONLINE' ? 'success' : 'default'}>{stateLabels[state]}</Tag> },
        { title: '最近心跳', dataIndex: 'lastSeen', responsive: ['lg'], render: (time: string) => time ? new Date(time).toLocaleString('zh-CN') : '尚未收到' },
        { title: '操作', width: 80, render: (_: unknown, device: Device) => device.status === 'REVOKED' || !session.permissions.includes('device.revoke') ? null : <Popconfirm title="撤销此设备？" description="凭证将立即失效，恢复接入需要重新配对。不会删除宿主文件。" okText="撤销" cancelText="取消" onConfirm={() => revoke(device)}><Button type="link" danger loading={revoking === device.id}>撤销</Button></Popconfirm> },
      ]} />
    </div>}
    <Drawer title="接入私有设备" aria-label="接入私有设备" width={540} open={open} onClose={close} destroyOnHidden>
      {mutationError && <Alert type="error" role="alert" message={mutationError} showIcon className="form-alert" />}
      <div className="pair-step"><h2>启动本机配对</h2><p>在运行时安装目录执行：</p><pre className="runtime-command">{`node apps/runtime/dist/cli.js connect \\\n  --server ${deviceOrigin} \\\n  --name "我的设备"`}</pre></div>
      <div className="pair-step"><h2>粘贴配对码</h2><p>终端等待输入时粘贴以下代码并回车。有效期 5 分钟，仅可使用一次。</p>
        {pairing && !expired ? <Typography.Text className="pair-code" copyable={{ text: pairing.code, tooltips: ['复制配对码', '已复制'], icon: [<CopyOutlined aria-label="复制配对码" />, <CheckOutlined aria-label="已复制" />] }}><code aria-label="配对码">{pairing.code}</code></Typography.Text> : <Alert type={expired ? 'warning' : 'info'} message={expired ? '配对码已到期，请重新生成' : busy ? '正在生成配对码' : '未生成配对码'} />}
        <Button className="pair-regenerate" loading={busy} onClick={() => void generate()}>重新生成</Button>
      </div>
      <div className="pair-step"><h2>连接平台</h2><pre className="runtime-command">node apps/runtime/dist/cli.js start</pre><p>保持终端运行，回到设备列表刷新查看心跳。</p></div>
      <Button type="primary" block onClick={() => { close(); void reload(); }}>完成，刷新设备</Button>
    </Drawer>
  </>;
}
