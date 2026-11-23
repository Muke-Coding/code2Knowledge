/** 企业工作壳工具区；AntD原生按钮、Tooltip、Avatar及Dropdown，外观偏好不影响权限。 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Button, Dropdown, Tooltip } from 'antd';
import { SunOutlined, MoonOutlined, FullscreenOutlined, FullscreenExitOutlined, UserOutlined, LockOutlined, LogoutOutlined, DownOutlined } from '@ant-design/icons';
import type { Session } from '@c2k/contracts';
import { useAppearance } from './AppearanceProvider';
/** 工具区操作交给工作壳身份状态机，不能从菜单构造任意路由。 */
interface Props {
  /** 当前公开身份。 */
  session: Session;
  /** 账号自助页面入口，对所有有效账户开放。 */
  onProfile: () => void;
  /** 锁定服务端当前会话，失败仍保留页面。 */
  onLock: () => Promise<void>;
  /** 安全退出，失败由工作壳显示。 */
  onLogout: () => Promise<void>;
  /** 身份变更请求进行中，禁止重复操作。 */
  busy: boolean;
}
/** @param props 当前身份和受控账户操作 @returns 顶栏工具及失败提示，不含业务数据 */
export default function WorkspaceTools(props: Props) {
  const appearance = useAppearance();
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement)), [changing, setChanging] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), alive = useRef(true);
  const supported = document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function';
  useEffect(() => {
    alive.current = true;
    /** @returns 跟随浏览器Esc、浏览器菜单或其他原生全屏操作，避免按钮状态漂移 */
    function sync(): void { setFullscreen(Boolean(document.fullscreenElement)); }
    document.addEventListener('fullscreenchange', sync); return () => { alive.current = false; document.removeEventListener('fullscreenchange', sync); };
  }, []);
  /** @returns 用户点击触发原生全屏；浏览器拒绝时显示恢复提示，不伪造全屏或窗口尺寸 */
  async function toggleFullscreen(): Promise<void> {
    if (pending.current || !supported) return; pending.current = true; setChanging(true); setError('');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { if (alive.current) setError('浏览器未允许全屏，请检查浏览器权限后重试'); }
    finally { pending.current = false; if (alive.current) { setChanging(false); setFullscreen(Boolean(document.fullscreenElement)); } }
  }
  return <><div className="workspace-tools">
    <Tooltip title={appearance.dark ? '切换浅色' : '切换深色'}><Button type="text" aria-label={appearance.dark ? '切换浅色' : '切换深色'} icon={appearance.dark ? <SunOutlined aria-hidden /> : <MoonOutlined aria-hidden />} onClick={appearance.toggle} /></Tooltip>
    <Tooltip title={supported ? (fullscreen ? '退出全屏' : '进入全屏') : '当前浏览器不支持全屏'}><Button type="text" aria-label={fullscreen ? '退出全屏' : '进入全屏'} disabled={!supported} loading={changing} icon={fullscreen ? <FullscreenExitOutlined aria-hidden /> : <FullscreenOutlined aria-hidden />} onClick={() => void toggleFullscreen()} /></Tooltip>
    <Dropdown trigger={['click']} menu={{ items: [{ key: 'profile', label: '个人中心', icon: <UserOutlined aria-hidden /> }, { key: 'lock', label: '锁定屏幕', icon: <LockOutlined aria-hidden /> }, { type: 'divider' }, { key: 'logout', label: '退出登录', icon: <LogoutOutlined aria-hidden /> }], onClick: ({ key }) => { if (key === 'profile') props.onProfile(); else if (key === 'lock') void props.onLock(); else if (key === 'logout') void props.onLogout(); } }} disabled={props.busy}>
      <Button type="text" className="account-trigger" aria-label="账户菜单" loading={props.busy}><Avatar size={30}>{Array.from(props.session.displayName)[0] ?? <UserOutlined />}</Avatar><span className="account-trigger-name">{props.session.displayName}</span><DownOutlined aria-hidden /></Button>
    </Dropdown>
  </div>{error && <Alert className="fullscreen-error" role="alert" type="error" message={error} closable afterClose={() => setError('')} />}</>;
}
