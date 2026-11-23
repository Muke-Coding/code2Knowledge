/** Web平台入口；浏览器会话控制受保护路由，客户端隐藏仅为体验，真正权限由每个Java接口实施。 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Alert, Breadcrumb, Button, Menu, Tabs, Spin, type MenuProps } from 'antd';
import { UserOutlined, TeamOutlined, ApartmentOutlined, AppstoreOutlined, LaptopOutlined, LogoutOutlined, DeploymentUnitOutlined, BookOutlined, ExperimentOutlined, SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import type { Session } from '@c2k/contracts';
import { ApiFailure, getSession, logout, failureMessage } from './api';
import LoginPage from './LoginPage';
import AppearanceProvider from './AppearanceProvider';
import WorkspaceTools from './WorkspaceTools';
import LockScreen from './LockScreen';
import { lockSession } from './api';
import './styles.css';
import './workspace.css';
const ProfilePage = lazy(() => import('./ProfilePage'));
const DepartmentsPage = lazy(() => import('./DepartmentsPage'));
const MenusPage = lazy(() => import('./MenusPage'));
const SystemsPage = lazy(() => import('./SystemsPage'));
const DevicesPage = lazy(() => import('./DevicesPage'));
const MembersPage = lazy(() => import('./MembersPage'));
const ReviewsPage = lazy(() => import('./ReviewsPage'));
const CandidatesPage = lazy(() => import('./CandidatesPage'));
const AnalysesPage = lazy(() => import('./AnalysesPage'));
const TasksPage = lazy(() => import('./TasksPage'));
const SourcesPage = lazy(() => import('./SourcesPage'));
const RolesPage = lazy(() => import('./RolesPage'));
const DiagnosticPage = lazy(() => import('./DiagnosticPage'));

/** @returns 视图过渡加载占位，不含前一身份数据。 */
function Loading() { return <div className="page-loading" role="status" aria-label="正在加载"><Spin size="large" /></div>; }
/** @returns 平台会话门禁与主导航，不为空。 */
function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // 首次恢复只认服务端会话；卸载后不接收结果，401事件清除整个受保护树及其列表状态。
  useEffect(() => {
    let active = true;
    getSession().then((value) => { if (active) setSession(value); }).catch((reason) => { if (active && !(reason instanceof ApiFailure && [401, 423].includes(reason.status))) setError(failureMessage(reason)); }).finally(() => { if (active) setChecking(false); });
    /** @returns 清除已失效身份和界面，不保留旧成员数据。 */
    function expired(): void { setSession(null); setLocked(false); setError(''); navigate('/login', { replace: true }); }
    /** @returns 立即卸载旧业务树，锁状态由服务器最小接口恢复 */
    function sessionLocked(): void { setLocked(true); setSession(null); setError(''); }
    window.addEventListener('c2k-session-locked', sessionLocked);
    window.addEventListener('c2k-session-expired', expired);
    return () => { active = false; window.removeEventListener('c2k-session-expired', expired); window.removeEventListener('c2k-session-locked', sessionLocked); };
  }, [navigate]);
  // 权限不写本地存储；15秒及窗口恢复重查，网络失败隐藏旧授权树，401统一清除身份。
  useEffect(() => {
    if (!session) return;
    let active = true; let pending = false;
    /** @returns 当前权限刷新完成；单飞避免慢响应覆盖新会话，失败不保留旧按钮和正文 */
    async function syncPermissions(): Promise<void> {
      if (pending) return; pending = true;
      try { const value = await getSession(); if (active) setSession((old) => old?.id === value.id && JSON.stringify(old) === JSON.stringify(value) ? old : value); }
      catch (reason) { if (active) { setSession(null); if (!(reason instanceof ApiFailure && [401, 423].includes(reason.status))) setError(failureMessage(reason)); } }
      finally { pending = false; }
    }
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void syncPermissions(); }, 15000);
    window.addEventListener('focus', syncPermissions); window.addEventListener('c2k-permissions-changed', syncPermissions);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', syncPermissions); window.removeEventListener('c2k-permissions-changed', syncPermissions); };
  }, [session?.id]);
  /**
   * 登录成功时替换完整身份并进入目录，不恢复其他用户的深链接对象。
   * @param value 服务端公开会话，不为空。
   * @returns 路由切换完成，无业务返回。
   */
  function signedIn(value: Session): void { setLocked(false); setSession(value); setNotice(''); setError(''); navigate(value.navigation.find((item) => item.visible)?.path ?? value.navigation[0]?.path ?? '/no-access', { replace: true }); }
  /** @returns 安全退出完成；服务端失败时保留当前页面并给出可重试错误。 */
  async function signOut(): Promise<void> {
    setLeaving(true); setError('');
    try { await logout(); setLocked(false); setSession(null); navigate('/login', { replace: true }); }
    catch (reason) { setError(failureMessage(reason)); }
    finally { setLeaving(false); }
  }
  /** @returns 服务端确认后卸载业务视图，失败不伪装为已锁定 */
  async function lock(): Promise<void> { if (leaving) return; setLeaving(true); setError(''); try { await lockSession(); setLocked(true); setSession(null); } catch (reason) { setError(failureMessage(reason)); } finally { setLeaving(false); } }
  /** @param value 解锁后重新验证的身份 @returns 恢复当前路由，重新加载业务数据，不复用锁前组件 */
  function unlocked(value: Session): void { setError(''); setSession(value); setLocked(false); }
  /** @returns 改密成功提示并进入登录；全部旧会话由认证版本在后端拒绝 */
  function passwordChanged(): void { setSession(null); setLocked(false); setNotice('密码已修改，请重新登录'); navigate('/login', { replace: true }); }
  // 菜单项与路由使用同一权限条件；Menu负责焦点、方向键与选中态，链接保留浏览器原生打开行为。
  const visibleNavigation = session?.navigation.filter((item) => item.visible) ?? [];
  const home = visibleNavigation[0]?.path ?? session?.navigation[0]?.path ?? '/no-access';
  const currentPath = location.pathname.replace(/\/+$/, '') || '/';
  const current = session?.navigation.find((item) => item.path === currentPath);
  const currentGroup = currentPath === '/profile' ? '账户' : current?.groupTitle ?? '访问权限';
  const currentPage = currentPath === '/profile' ? '个人中心' : current?.title ?? '访问权限';
  const groups = ['knowledge', 'runtime', 'device', 'enterprise'];
  const menuItems: MenuProps['items'] = session ? groups.flatMap<NonNullable<MenuProps['items']>[number]>((group) => {
    const rows = visibleNavigation.filter((item) => item.group === group); if (!rows.length) return [];
    const icon = group === 'knowledge' ? <BookOutlined /> : group === 'runtime' ? <ExperimentOutlined /> : group === 'device' ? <LaptopOutlined /> : <SettingOutlined />;
    return group === 'enterprise' ? [{ key: group, label: rows[0]!.groupTitle, icon, children: rows.map((item) => ({ key: item.path, icon: item.path === '/members' ? <UserOutlined aria-hidden /> : item.path === '/roles' ? <TeamOutlined aria-hidden /> : item.path === '/departments' ? <ApartmentOutlined aria-hidden /> : item.path === '/menus' ? <AppstoreOutlined aria-hidden /> : undefined, label: <NavLink to={item.path}>{item.title}</NavLink> })) }] : [{ key: group, label: <NavLink to={rows.some((item) => item.path === currentPath) ? currentPath : rows[0]!.path}>{rows[0]!.groupTitle}</NavLink>, icon }];
  }) : [];
  const tabs = visibleNavigation.filter((item) => item.group === current?.group);
  /** @param path 固定受保护路由 @param element 对应已实现页面 @returns 按当前动作资格显示，菜单隐藏不撤销路由或接口权限 */
  function page(path: string, element: React.ReactNode): React.ReactNode { return session?.navigation.some((item) => item.path === path) ? element : <Navigate to="/no-access" replace />; }
  if (checking) return <Loading />;
  if (locked) return <LockScreen onUnlocked={unlocked} onSignedOut={() => { setLocked(false); setSession(null); navigate('/login', { replace: true }); }} />;
  if (!session) return <>{notice && <Alert className="connection-error" role="status" type="success" message={notice} />}{error && <Alert className="connection-error" role="alert" type="error" message={error} action={<Button onClick={() => window.location.reload()}>重试连接</Button>} />}<LoginPage onLogin={signedIn} /></>;
  return <div className={`workspace${collapsed ? ' workspace-collapsed' : ''}`}>
    <a className="skip-link" href="#workspace-main">跳转到主内容</a>
    <aside className="sidebar"><NavLink to={home} className="wordmark"><DeploymentUnitOutlined aria-hidden />Code2Knowledge</NavLink>
      <nav aria-label="主导航"><Menu mode="inline" inlineCollapsed={collapsed} selectedKeys={[current?.group === 'enterprise' ? currentPath : current?.group ?? '']} openKeys={openMenus} onOpenChange={(keys) => setOpenMenus(keys.slice(-1))} items={menuItems} /></nav>
      <div className="sidebar-bottom"><span className="account-name" title={session.displayName}>{session.displayName}</span><Button type="text" icon={<LogoutOutlined />} aria-label="退出登录" title="退出登录" loading={leaving} onClick={() => void signOut()} /></div>
    </aside>
    <div className="workspace-body"><header className="workspace-topbar"><Button type="text" aria-label={collapsed ? '展开侧栏' : '收起侧栏'} icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} /><Breadcrumb className="workspace-breadcrumb" aria-label="当前位置" items={[{ title: currentGroup }, { title: currentPage }]} /><WorkspaceTools session={session} busy={leaving} onProfile={() => navigate('/profile')} onLock={lock} onLogout={signOut} /></header>
    <main id="workspace-main" className="workspace-main" tabIndex={-1}>
      {tabs.length > 0 && current?.group !== 'enterprise' && (current?.group !== 'device' || tabs.length > 1) && <Tabs className="workspace-tabs" activeKey={currentPath} items={tabs.map((item) => ({ key: item.path, label: item.title }))} onChange={(path) => navigate(path)} />}
      {error && <Alert role="alert" type="error" message={error} className="form-alert" />}
      <Suspense fallback={<Loading />}><Routes key={session.id + session.permissions.join(',')}>
        <Route path="/profile" element={<ProfilePage onPasswordChanged={passwordChanged} />} />
        <Route path="/departments" element={page("/departments", <DepartmentsPage session={session} />)} />
        <Route path="/menus" element={page("/menus", <MenusPage session={session} />)} />
        <Route path="/candidates" element={page("/candidates", <CandidatesPage session={session} />)} />
        <Route path="/reviews" element={page("/reviews", <ReviewsPage session={session} />)} />
        <Route path="/systems" element={page("/systems", <SystemsPage session={session} />)} />
        <Route path="/analyses" element={page("/analyses", <AnalysesPage session={session} />)} />
        <Route path="/tasks" element={page("/tasks", <TasksPage session={session} />)} />
        <Route path="/sources" element={page("/sources", <SourcesPage session={session} />)} />
        <Route path="/roles" element={page("/roles", <RolesPage session={session} />)} />
        <Route path="/devices" element={page("/devices", <DevicesPage session={session} />)} />
        <Route path="/members" element={page("/members", <MembersPage session={session} />)} />
        <Route path="/no-access" element={session.navigation.length ? <Navigate to={home} replace /> : <Alert type="info" message="当前没有可访问的页面" description="请联系管理员分配角色。" />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes></Suspense>
    </main></div>
  </div>;
}
/** @returns 路由根；诊断页独立存在，不作为认证成功依据。 */
function App() {
  return <AppearanceProvider><BrowserRouter><Suspense fallback={<Loading />}><Routes><Route path="/diagnostics" element={<DiagnosticPage />} /><Route path="*" element={<Workspace />} /></Routes></Suspense></BrowserRouter></AppearanceProvider>;
}
const root = document.getElementById('root');
if (!root) throw new Error('缺少Web挂载节点');
createRoot(root).render(<App />);
