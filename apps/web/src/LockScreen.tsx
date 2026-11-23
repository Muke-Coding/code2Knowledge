/** 锁屏替换整个受保护页面树；锁状态来自服务端，刷新/多标签页不能用本地标记绕过。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Form, Input, Spin } from 'antd';
import { LockOutlined, LogoutOutlined } from '@ant-design/icons';
import type { Session } from '@c2k/contracts';
import { getLockState, getSession, unlockSession, logout, failureMessage } from './api';
/** 工作壳身份状态的受控恢复入口。 */
interface Props {
  /** 解锁后重新读取的有效会话，不使用锁前缓存。 */
  onUnlocked: (session: Session) => void;
  /** 服务端退出成功后清除本地视图。 */
  onSignedOut: () => void;
}
/** 当前会话解锁表单，不包含可切换身份的登录名。 */
interface UnlockValues {
  /** 仅表单内短暂存在的当前密码。 */
  password: string;
}
/** @param props 解锁和退出成功回调 @returns 无业务正文的锁定页面，错误不泄露未知服务响应 */
export default function LockScreen(props: Props) {
  const [name, setName] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [revision, refresh] = useState(0), [form] = Form.useForm<UnlockValues>();
  const pending = useRef(false), alive = useRef(true);
  useEffect(() => {
    let active = true; alive.current = true; setLoading(true); setName(''); setError('');
    // 迟到的423可能来自锁前请求；如果其他标签页已解锁，重新核验身份后自动恢复，不使用旧会话缓存。
    getLockState().then(async (value) => { if (!active) return; if (value.locked) setName(value.displayName); else { const session = await getSession(); if (active) props.onUnlocked(session); } }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; alive.current = false; };
  }, [revision]);
  /** @param value 当前账户密码 @returns 服务端验证成功才恢复；失败保持锁定并清除输入 */
  async function submit(value: UnlockValues): Promise<void> {
    if (pending.current) return; pending.current = true; setBusy(true); setError('');
    try { await unlockSession(value.password); const session = await getSession(); if (alive.current) props.onUnlocked(session); }
    catch (reason) { if (alive.current) setError(failureMessage(reason)); }
    finally { pending.current = false; form.resetFields(); if (alive.current) setBusy(false); }
  }
  /** @returns 服务端退出成功才显示登录页；失败不解除锁定 */
  async function signOut(): Promise<void> { if (pending.current) return; pending.current = true; setBusy(true); try { await logout(); if (alive.current) props.onSignedOut(); } catch (reason) { if (alive.current) setError(failureMessage(reason)); } finally { pending.current = false; if (alive.current) setBusy(false); } }
  return <main className="lock-layout"><section className="lock-panel" aria-labelledby="lock-title"><Avatar size={60} icon={<LockOutlined aria-hidden />} /><h1 id="lock-title">屏幕已锁定</h1>{name && <p className="lock-name">{name}</p>}{error && <Alert role="alert" type="error" message={error} className="form-alert" action={!name ? <Button onClick={() => refresh((value) => value + 1)}>重试</Button> : undefined} />}{loading ? <Spin aria-label="读取锁定状态" /> : <Form form={form} layout="vertical" requiredMark={false} disabled={busy || !name} onFinish={submit}><Form.Item name="password" label="解锁密码" rules={[{ required: true, message: '请输入当前账户密码' }]}><Input.Password autoFocus autoComplete="current-password" maxLength={72} /></Form.Item><Button type="primary" htmlType="submit" loading={busy} block>解锁</Button></Form>}<Button type="text" icon={<LogoutOutlined aria-hidden />} disabled={busy} onClick={() => void signOut()}>退出登录</Button></section></main>;
}
