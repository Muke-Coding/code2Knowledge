/** 本地身份登录页；仅支持已引导管理员和管理员创建的成员，不提供公开注册或伪OIDC入口。 */
import { useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { DeploymentUnitOutlined, ArrowRightOutlined } from '@ant-design/icons';
import type { Session } from '@c2k/contracts';
import { login, failureMessage } from './api';
import type { LoginValues } from './api';
/** 登录成功回调契约；身份来自服务端会话，不信任表单角色。 */
interface Props {
  /** 有效会话建立后切换受保护界面。 */
  onLogin: (session: Session) => void;
}
/**
 * 渲染登录任务，失败保留登录名并清除密码。
 * @param props 登录完成回调，不为空。
 * @returns 登录表单，不为空。
 */
export default function LoginPage(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm<LoginValues>();
  /**
   * 提交本次凭证，不在浏览器持久化密码。
   * @param values 已通过表单必填校验的登录名和密码，不为空。
   * @returns 登录处理完成，无业务返回。
   */
  async function submit(values: LoginValues): Promise<void> {
    setBusy(true); setError('');
    try { props.onLogin(await login(values.username, values.password)); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { form.setFieldValue('password', ''); setBusy(false); }
  }
  return <div className="login-layout">
    <aside className="login-brand"><div className="wordmark"><DeploymentUnitOutlined aria-hidden />Code2Knowledge</div><div className="brand-structure" aria-hidden><span /><span /><span /></div><div className="brand-caption">代码与业务知识</div></aside>
    <main className="login-main"><div className="login-form">
      <h1>登录</h1>
      {error && <Alert role="alert" type="error" showIcon message={error} className="form-alert" />}
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} disabled={busy}>
        <Form.Item name="username" label="登录名" rules={[{ required: true, message: '请输入登录名' }]}><Input autoComplete="username" autoFocus maxLength={64} /></Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" maxLength={72} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block icon={<ArrowRightOutlined aria-hidden />} iconPosition="end">登录</Button>
      </Form>
    </div><footer className="login-footer">私有化部署</footer></main>
  </div>;
}
