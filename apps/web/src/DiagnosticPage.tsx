/** Web 工程诊断入口；仅显示真实基础健康，不提供尚未实现的登录、逆向或发布操作。 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import { Alert, Button, ConfigProvider, Spin, Tag } from 'antd';
import { ArrowRightOutlined, ReloadOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { readHealthResponse } from '@c2k/contracts';
import { platformTheme } from './theme';
import './styles.css';

/** 本阶段健康展示状态；检测中和失败不表示任何业务能力可用。 */
type ConnectionState = 'checking' | 'up' | 'unavailable';

/**
 * 渲染单页工程诊断；无登录身份，仅调用公开的最小健康接口。
 * @returns 含加载、成功、错误和重试状态的页面，不返回 null。
 */
export default function DiagnosticPage() {
  const [state, setState] = useState<ConnectionState>('checking');
  const request = useRef<AbortController | null>(null);

  /**
   * 检查同源开发代理的健康接口，并取消先前请求以避免乱序覆盖。
   * @returns 请求处理完成，无业务返回值；网络及契约异常转换为不可用状态。
   */
  async function refresh(): Promise<void> {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState('checking');
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/actuator/health', { signal: controller.signal, redirect: 'error' });
      const health = await readHealthResponse(response);
      if (request.current === controller) setState(health.status === 'UP' ? 'up' : 'unavailable');
    } catch {
      if (request.current === controller) setState('unavailable');
    } finally {
      window.clearTimeout(timeout);
    }
  }

  // 页面卸载和 StrictMode 重挂载时终止请求，避免已卸载视图继续写入状态。
  useEffect(() => { void refresh(); return () => { request.current?.abort(); request.current = null; }; }, []);

  return <>
    <a className="skip-link" href="#main">跳转到主内容</a>
    <div className="shell">
      <header className="masthead"><a className="brand" href="/" aria-label="Code2Knowledge 首页"><DeploymentUnitOutlined aria-hidden />Code2Knowledge</a><Tag bordered={false}>工程基线</Tag></header>
      <main id="main" className="main" tabIndex={-1}>

        <h1>平台诊断</h1>
        <p className="intro">代码与业务知识平台 · 基础服务诊断</p>
        <section className="diagnostic" aria-labelledby="diagnostic-title">
          <div className="diagnostic-top"><div><h2 id="diagnostic-title">平台连接</h2></div><Button icon={<ReloadOutlined aria-hidden />} loading={state === 'checking'} onClick={() => void refresh()}>重新检查</Button></div>
          <div role="status" aria-live="polite" className="status-area">{state === 'checking' ? <div className="checking"><Spin size="small" /><span>正在检查基础服务</span></div> : state === 'up' ? <Alert type="success" showIcon message="基础服务可达" description="仅代表进程存活，身份、任务与知识服务尚未接入。" /> : <Alert type="error" showIcon message="基础服务不可达" description="检查本地后端是否已启动，再重新检查。" />}</div>
        </section>
        <div className="boundary"><ArrowRightOutlined aria-hidden /><span>当前不开放业务操作，也不会读取代码或发送模型请求。</span></div>
      </main>
      <footer>Code2Knowledge<span>私有化部署 · 工程诊断</span></footer>
    </div>
  </>;
}
