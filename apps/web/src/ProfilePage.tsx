/** 本人账户自助页；所有资料来自本人API，登录名、组织和角色不能在此变更。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Descriptions, Form, Input, Skeleton, Tabs, Tag } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { Profile } from '@c2k/contracts';
import { getProfile, updateProfile, changePassword, failureMessage } from './api';
/** 改密成功后的身份退出由工作壳处理。 */
interface Props {
  /** 成功改密后告知用户重新登录，不继续显示受保护资料。 */
  onPasswordChanged: () => void;
}
/** 只允许自行修改的资料字段。 */
interface NameValues {
  /** 本人显示名称。 */
  displayName: string;
}
/** 密码仅在本次表单内保留，提交后或离开标签立即清除。 */
interface PasswordValues {
  /** 现行密码。 */
  currentPassword: string;
  /** 待保存新密码。 */
  newPassword: string;
  /** 前端确认输入，不传给服务端。 */
  confirmPassword: string;
}
/** @param props 改密成功回调 @returns 本人只读资料与两个明确保存表单 */
export default function ProfilePage(props: Props) {
  const [profile, setProfile] = useState<Profile | null>(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [revision, refresh] = useState(0);
  const [nameForm] = Form.useForm<NameValues>(), [passwordForm] = Form.useForm<PasswordValues>();
  const pending = useRef(false), alive = useRef(true);
  // 显式重载先移除旧资料；卸载后丢弃迟到响应并清除密码，避免身份切换后残留。
  useEffect(() => { let active = true; alive.current = true; setLoading(true); setError(''); setProfile(null); getProfile().then((value) => { if (active) { setProfile(value); nameForm.setFieldsValue({ displayName: value.displayName }); } }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; alive.current = false; passwordForm.resetFields(); }; }, [revision]);
  /** @param value 本人名称 @returns 显式版本保存，冲突不覆盖输入；成功通知工作壳刷新名称 */
  async function saveName(value: NameValues): Promise<void> {
    if (!profile || pending.current) return; pending.current = true; setBusy(true); setError(''); setMessage('');
    try { const saved = await updateProfile(value.displayName, profile.revision); if (alive.current) { setProfile(saved); nameForm.setFieldsValue({ displayName: saved.displayName }); setMessage('个人资料已保存'); window.dispatchEvent(new Event('c2k-permissions-changed')); } }
    catch (reason) { if (alive.current) setError(failureMessage(reason)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  /** @param value 本次密码表单，确认密码不发送 @returns 改密成功后退出全部旧浏览器会话；不修改设备凭证 */
  async function savePassword(value: PasswordValues): Promise<void> {
    if (pending.current) return; pending.current = true; setBusy(true); setError(''); setMessage('');
    try { await changePassword(value.currentPassword, value.newPassword); if (alive.current) props.onPasswordChanged(); }
    catch (reason) { if (alive.current) setError(failureMessage(reason)); }
    finally { pending.current = false; passwordForm.resetFields(); if (alive.current) setBusy(false); }
  }
  return <><header className="page-heading"><h1>个人中心</h1></header>{error && <Alert role="alert" type="error" message={error} className="form-alert" action={<Button disabled={busy} onClick={() => refresh((value) => value + 1)}>重新加载</Button>} />}{message && <Alert role="status" type="success" message={message} className="form-alert" />}{loading ? <Skeleton active /> : profile && <div className="profile-layout"><section className="data-surface profile-summary" aria-label="本人账户"><Avatar size={64} icon={<UserOutlined aria-hidden />}>{Array.from(profile.displayName)[0]}</Avatar><h2>{profile.displayName}</h2><Descriptions column={1} size="small" items={[{ key: 'username', label: '登录名', children: profile.username }, { key: 'tenant', label: '企业', children: profile.tenantName }, { key: 'department', label: '部门', children: profile.departmentName || '未分配' }, { key: 'roles', label: '角色', children: profile.roles.map((role) => <Tag key={role}>{role}</Tag>) }]} /></section><section className="data-surface profile-editor"><Tabs defaultActiveKey="information" destroyOnHidden onChange={() => { passwordForm.resetFields(); setError(''); setMessage(''); }} items={[{ key: 'information', label: '基本资料', children: <Form form={nameForm} layout="vertical" requiredMark={false} disabled={busy} onFinish={saveName}><Form.Item name="displayName" label="显示名称" rules={[{ required: true, whitespace: true, max: 80, message: '请输入1到80字符的显示名称' }]}><Input maxLength={80} autoComplete="nickname" /></Form.Item><Button type="primary" htmlType="submit" loading={busy}>保存资料</Button></Form> }, { key: 'password', label: '修改密码', children: <><Alert type="info" message="修改密码后，所有浏览器会话需重新登录。" className="form-alert" /><Form form={passwordForm} layout="vertical" requiredMark={false} disabled={busy} onFinish={savePassword}><Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}><Input.Password autoComplete="current-password" maxLength={72} /></Form.Item><Form.Item name="newPassword" label="新密码" rules={[{ required: true, pattern: /^[\x21-\x7e]{16,72}$/, message: '请输入16到72个非空格ASCII字符' }]}><Input.Password autoComplete="new-password" maxLength={72} /></Form.Item><Form.Item name="confirmPassword" label="确认新密码" dependencies={['newPassword']} rules={[{ required: true, message: '请再次输入新密码' }, ({ getFieldValue }) => ({ validator: (_, value: string) => value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('两次新密码不一致')) })]}><Input.Password autoComplete="new-password" maxLength={72} /></Form.Item><Button type="primary" htmlType="submit" loading={busy}>修改密码并重新登录</Button></Form></> }]} /></section></div>}</>;
}
