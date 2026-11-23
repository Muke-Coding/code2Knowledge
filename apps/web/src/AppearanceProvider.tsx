/** Web主题容器；只保存非敏感外观偏好，身份和权限不进入浏览器存储。 */
import { createContext, useContext, useLayoutEffect, useEffect, useState, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { appearanceTheme } from './theme';
/** 工作壳共用主题状态；默认浅色，切换不会重建业务页面。 */
interface Appearance {
  /** 是否使用深色。 */
  dark: boolean;
  /** 用户主动切换主题，存储不可用时仍保持本页有效。 */
  toggle: () => void;
}
/** 全站主题上下文，不承载当前用户信息。 */
const AppearanceContext = createContext<Appearance | null>(null);
/** @returns 已保存的合法深色偏好；缺失或浏览器禁用存储时返回false */
function savedDark(): boolean { try { return localStorage.getItem('c2k-appearance') === 'dark'; } catch { return false; } }
/** 主题提供器的页面组合契约，不接受身份或权限数据。 */
interface AppearanceProviderProps {
  /** 使用同一语义令牌的页面子树。 */
  children: ReactNode;
}
/** @param props 仅含React子树 @returns 保留页面状态的Ant Design主题提供器 */
export default function AppearanceProvider(props: AppearanceProviderProps) {
  const [dark, setDark] = useState(savedDark);
  useLayoutEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    /** @param event 浏览器原生同源外观变更事件 @returns 仅同步合法偏好，不读取其他存储字段 */
    function sync(event: StorageEvent): void { if (event.key === 'c2k-appearance' && (event.newValue === 'dark' || event.newValue === 'light')) setDark(event.newValue === 'dark'); }
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  /** @returns 同步更新视图并尽力持久化，不将存储异常作为业务故障 */
  function toggle(): void { const value = !dark; setDark(value); try { localStorage.setItem('c2k-appearance', value ? 'dark' : 'light'); } catch { /* 隐私模式下主题仅在本页有效。 */ } }
  return <AppearanceContext.Provider value={{ dark, toggle }}><ConfigProvider locale={zhCN} theme={appearanceTheme(dark)} button={{ autoInsertSpace: false }}>{props.children}</ConfigProvider></AppearanceContext.Provider>;
}
/** @returns 当前外观状态；不含身份 @throws {Error} 未置于平台主题提供器内时拒绝使用 */
export function useAppearance(): Appearance { const value = useContext(AppearanceContext); if (!value) throw new Error('缺少平台主题容器'); return value; }
