/** 系统目录操作页；目录查看和目录读取授权均使用真实API，知识与来源权限不在本轮界面中冒充实现。 */
import DepartmentGrants from './DepartmentGrants';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Form, Input, List, Popconfirm, Select, Space, Spin, Table } from 'antd';
import { PlusOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import type { RefSelectProps } from 'antd';
import type { Session, CatalogSystem, Member, Grant } from '@c2k/contracts';
import { listSystems, getSystem, createSystem, listMembers, listGrants, setGrant, failureMessage } from './api';
import { useList } from './use-list';
/** 当前页面身份，仅用于显示管理操作，服务端仍独立授权。 */
interface Props {
  /** 已认证公开会话，不为空。 */
  session: Session;
}
/** 目录登记表单，不允许客户端指定企业。 */
interface SystemInput {
  /** 系统名称，1到120字符。 */
  name: string;
  /** 描述，最多500字符，可空。 */
  description?: string;
}
/**
 * 展示系统目录及管理员维护入口。
 * @param props 已认证身份，不为空。
 * @returns 目录页面，不为空。
 */
export default function SystemsPage(props: Props) {
  const admin = props.session.permissions.includes('catalog.grant');
  const { items, loading, error, reload } = useList(listSystems);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogSystem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [memberId, setMemberId] = useState<string>();
  const [grantBusy, setGrantBusy] = useState(false);
  const detailGeneration = useRef(0);
  const grantControl = useRef<RefSelectProps>(null);
  const [form] = Form.useForm<SystemInput>();
  /**
   * 读取最新系统详情及授权，不复用列表缓存；关闭或更换系统后旧响应失效。
   * @returns 详情处理完成，无业务返回。
   */
  async function loadDetail(): Promise<void> {
    if (!selected) return;
    const generation = ++detailGeneration.current;
    setDetailLoading(true); setDetailError(''); setDetail(null); setGrants([]); setMembers([]);
    try {
      const [system, users, permissions] = await Promise.all([getSystem(selected), admin ? listMembers() : Promise.resolve([]), admin ? listGrants(selected) : Promise.resolve([])]);
      if (generation === detailGeneration.current) { setDetail(system); setMembers(users); setGrants(permissions); }
    } catch (reason) { if (generation === detailGeneration.current) setDetailError(failureMessage(reason)); }
    finally { if (generation === detailGeneration.current) setDetailLoading(false); }
  }
  // 选中对象或身份变化时清空详情；禁止前一系统授权响应污染后一系统。
  useEffect(() => { setMemberId(undefined); void loadDetail(); return () => { detailGeneration.current++; }; }, [selected, admin]);
  /**
   * 登记目录，不授予成员任何默认读取权。
   * @param values 校验后的名称及描述，不为空。
   * @returns 提交完成，无业务返回。
   */
  async function submit(values: SystemInput): Promise<void> {
    setBusy(true); setCreateError('');
    try { await createSystem(values.name, values.description ?? ''); form.resetFields(); setCreating(false); await reload(); }
    catch (reason) { setCreateError(failureMessage(reason)); }
    finally { setBusy(false); }
  }
  /**
   * 幂等授予或撤销当前系统的目录读取权，成功后重读服务端授权列表。
   * @param target 普通成员UUID，不为空。
   * @param granted 是否授予，不代表知识或代码证据读取权。
   * @returns 操作完成，无业务返回。
   */
  async function permission(target: string, granted: boolean): Promise<void> {
    if (!selected) return;
    setGrantBusy(true); setDetailError('');
    try { await setGrant(selected, target, granted); setMemberId(undefined); await loadDetail(); }
    catch (reason) { setDetailError(failureMessage(reason)); }
    finally {
      setGrantBusy(false);
      // 撤销会移除当前焦点所在列表项；渲染完成后回到授权选择器，保持抽屉键盘/Escape链路。
      requestAnimationFrame(() => grantControl.current?.focus());
    }
  }
  return <>
    <header className="page-heading"><h1>系统目录</h1>{props.session.permissions.includes('catalog.create') && <Button type="primary" icon={<PlusOutlined aria-hidden />} onClick={() => { setCreateError(''); setCreating(true); }}>登记系统</Button>}</header>
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void reload()}>重试</Button>} /> : <div className="data-surface">
      <div className="list-toolbar"><span>{loading ? '正在加载' : `${items.length} 个系统`}</span><Button type="text" aria-label="刷新系统" loading={loading} icon={<ReloadOutlined aria-hidden />} onClick={() => void reload()} /></div>
      <Table<CatalogSystem> rowKey="id" dataSource={items} loading={loading} pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={admin ? '尚未登记系统' : '暂无可访问的系统'}>{props.session.permissions.includes('catalog.create') && <Button onClick={() => setCreating(true)}>登记系统</Button>}</Empty> }} columns={[
        { title: '系统', dataIndex: 'name', render: (name: string, system: CatalogSystem) => <Button className="system-link" type="link" onClick={() => setSelected(system.id)}>{name}</Button> },
        { title: '描述', dataIndex: 'description', responsive: ['md'], render: (description: string) => <span className="description-cell">{description || '—'}</span> },
        ...(admin ? [{ title: '操作', key: 'actions', width: 98, render: (_: unknown, system: CatalogSystem) => <Button type="text" icon={<SafetyOutlined aria-hidden />} aria-label={`${system.name}目录权限`} onClick={() => setSelected(system.id)}>权限</Button> }] : []),
      ]} />
    </div>}
    <Drawer title="登记系统" aria-label="登记系统" open={creating} width={440} onClose={() => { if (!busy) { form.resetFields(); setCreating(false); } }} destroyOnHidden>
      {createError && <Alert type="error" role="alert" message={createError} showIcon className="form-alert" />}
      <Form form={form} layout="vertical" onFinish={submit} disabled={busy} requiredMark={false}>
        <Form.Item name="name" label="系统名称" rules={[{ required: true, whitespace: true, max: 120, message: '请输入1到120字符的系统名称' }]}><Input maxLength={120} autoFocus /></Form.Item>
        <Form.Item name="description" label="描述" rules={[{ max: 500 }]}><Input.TextArea rows={4} maxLength={500} /></Form.Item>
        <Space><Button type="primary" htmlType="submit" loading={busy}>创建系统</Button><Button onClick={() => { form.resetFields(); setCreating(false); }}>取消</Button></Space>
      </Form>
    </Drawer>
    <Drawer title={detail?.name ?? '系统详情'} aria-label={detail?.name ?? '系统详情'} open={selected !== null} width={540} onClose={() => { if (!grantBusy) setSelected(null); }} destroyOnHidden>
      {detailError && <Alert role="alert" type="error" message={detailError} showIcon className="form-alert" action={!detail ? <Button onClick={() => void loadDetail()}>重试</Button> : undefined} />}
      {detailLoading ? <div className="drawer-loading"><Spin /></div> : detail && <>
        <Descriptions column={1} items={[{ key: 'description', label: '描述', children: detail.description || '—' }]} />
        {admin && <section className="permission-section"><h2>目录读取权限</h2>
          <Form layout="vertical" onFinish={() => memberId && permission(memberId, true)}>
            <Form.Item label="添加成员"><div className="grant-form"><Select ref={grantControl} aria-label="选择授权成员" placeholder="选择成员" value={memberId} onChange={setMemberId} disabled={grantBusy} options={members.filter((member) => member.role === 'MEMBER' && member.enabled && !grants.some((grant) => grant.memberId === member.id)).map((member) => ({ value: member.id, label: `${member.displayName} (${member.username})` }))} /><Button htmlType="submit" type="primary" loading={grantBusy} disabled={!memberId}>授权</Button></div></Form.Item>
          </Form>
          <List<Grant> dataSource={grants} locale={{ emptyText: '尚未授权成员' }} renderItem={(grant) => <List.Item actions={[<Popconfirm key="revoke" title="撤销目录读取权限？" description="该成员下次读取时将无法访问此系统目录。" okText="撤销" cancelText="取消" onConfirm={() => permission(grant.memberId, false)}><Button type="link" danger disabled={grantBusy}>撤销</Button></Popconfirm>]}><List.Item.Meta title={grant.displayName} /></List.Item>} />
        </section>}
        {admin && props.session.permissions.includes('department.read') && <DepartmentGrants kind="SYSTEM" id={detail.id} sourceRevision={0} />}
      </>}
    </Drawer>
  </>;
}
