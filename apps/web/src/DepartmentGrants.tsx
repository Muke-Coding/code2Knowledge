/** 部门资源授权面板；独立于成员ACL，显式选择包含下级，来源配置版本变化后须重新授权。 */
import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { Department, DepartmentGrant } from '@c2k/contracts';
import { listDepartments, listDepartmentGrants, changeDepartmentGrant, failureMessage } from './api';
/** 已由父页面取得元数据授权的当前资源；后端仍独立校验。 */
interface Props {
  /** 固定资源类型，系统目录不会继承为来源分析。 */
  kind: 'SYSTEM' | 'SOURCE';
  /** 当前资源UUID。 */
  id: string;
  /** 当前来源版本，系统目录为0。 */
  sourceRevision: number;
  /** 停用来源禁止新增授权，仍可撤销。 */
  disabled?: boolean;
}
/** @param props 当前资源 @returns 部门授权选择与当前版本列表，失败清空旧授权 */
export default function DepartmentGrants(props: Props) {
  const [departments, setDepartments] = useState<Department[]>([]), [rows, setRows] = useState<DepartmentGrant[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [selected, setSelected] = useState<string>(), [includeChildren, setIncludeChildren] = useState(false), [revision, refresh] = useState(0);
  useEffect(() => { let active = true; setRows([]); setDepartments([]); setLoading(true); setError(''); setSelected(undefined); Promise.all([listDepartments(), listDepartmentGrants(props.kind, props.id)]).then(([tree, grants]) => { if (active) { setDepartments(tree); setRows(grants); } }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [props.id, props.kind, props.sourceRevision, revision]);
  /** @param row 明确授权版本 @param allow true授予false撤销 @returns 原子写入，冲突保留错误，不自动覆盖 */
  async function change(row: DepartmentGrant, allow: boolean): Promise<void> { if (busy) return; setBusy(true); setError(''); try { await changeDepartmentGrant(row, allow); refresh((value) => value + 1); } catch (reason) { setError(failureMessage(reason)); } finally { setBusy(false); } }
  /** @returns 以当前已选部门保存显式下级范围，初次版本0 */
  async function grant(): Promise<void> { if (!selected) return; const old = rows.find((row) => row.departmentId === selected); await change({ departmentId: selected, resourceKind: props.kind, resourceId: props.id, sourceRevision: props.sourceRevision, includeChildren, active: true, revision: old?.revision ?? 0 }, true); }
  return <section className="permission-section"><h2>部门授权</h2>{error && <Alert role="alert" type="error" message={error} className="form-alert" action={<Button onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}<Form layout="vertical" onFinish={grant}><Form.Item label="授权部门"><Select aria-label="选择授权部门" showSearch optionFilterProp="label" value={selected} onChange={(value) => { setSelected(value); setIncludeChildren(rows.find((row) => row.departmentId === value)?.includeChildren ?? false); }} disabled={busy || loading || props.disabled === true} options={departments.filter((row) => row.enabled).map((row) => ({ value: row.id, label: `${row.name}${row.parentId ? ' · ' + (departments.find((parent) => parent.id === row.parentId)?.name ?? '') : ''}` }))} /></Form.Item><Space wrap><Checkbox checked={includeChildren} disabled={busy || props.disabled === true} onChange={(event) => setIncludeChildren(event.target.checked)}>包含下级部门</Checkbox><Button htmlType="submit" type="primary" loading={busy} disabled={!selected || loading || props.disabled === true}>保存部门授权</Button></Space></Form><Table<DepartmentGrant> className="analysis-selected" rowKey="departmentId" size="small" loading={loading} dataSource={rows} scroll={{ x: 420 }} pagination={{ pageSize: 10, hideOnSinglePage: false, showSizeChanger: false }} columns={[{ title: '部门', key: 'name', width: 160, render: (_: unknown, row: DepartmentGrant) => departments.find((value) => value.id === row.departmentId)?.name ?? row.departmentId }, { title: '范围', key: 'scope', width: 120, render: (_: unknown, row: DepartmentGrant) => <>{!row.active && <Tag>已撤销</Tag>}{row.includeChildren ? '部门及下级' : '仅本部门'}{props.kind === 'SOURCE' && row.sourceRevision !== props.sourceRevision && <Tag color="warning">需重新授权</Tag>}</> }, { title: '操作', key: 'action', width: 80, render: (_: unknown, row: DepartmentGrant) => row.active ? <Popconfirm title="撤销部门资源授权？" description="通过该部门获得的访问将失效；其他独立授权仍有效。" okText="撤销" cancelText="取消" onConfirm={() => change({ ...row, sourceRevision: props.sourceRevision }, false)}><Button type="link" danger disabled={busy}>撤销</Button></Popconfirm> : null }]} /></section>;
}
