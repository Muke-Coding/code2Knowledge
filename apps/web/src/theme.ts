/** 企业后台统一视觉令牌；参考OpenDevFlow的中性灰白底与蓝色主操作，权限语义不由颜色决定。 */
import { theme as antdTheme, type ThemeConfig } from 'antd';
/** 全站复用AntD语义令牌；紧凑表格、清晰焦点与标准控件，不逐页另造主色。 */
export const platformTheme: ThemeConfig = {
  token: { colorPrimary: '#2563eb', colorLink: '#2563eb', colorText: '#1f2937', colorTextSecondary: '#596579', colorTextTertiary: '#596579', colorTextPlaceholder: '#596579', colorBgLayout: '#f5f7fb', colorBorder: '#d8dee8', borderRadius: 6, fontSize: 14, controlHeight: 36, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif' },
  components: { Button: { fontWeight: 500 }, Descriptions: { labelColor: '#596579' }, Menu: { itemBg: 'transparent', subMenuItemBg: 'transparent', itemColor: '#4b5563', itemSelectedBg: '#edf3ff', itemSelectedColor: '#1d4ed8', itemHoverBg: '#f3f5f8', itemHeight: 42, itemMarginInline: 8, itemBorderRadius: 6 }, Table: { headerBg: '#f8fafc', headerColor: '#475569', cellPaddingBlock: 13 }, Tabs: { titleFontSize: 14 }, Breadcrumb: { fontSize: 13 } }
};
/** @param dark 是否启用深色 @returns Ant Design算法和自定义表面一致的主题，不改组件业务语义 */
export function appearanceTheme(dark: boolean): ThemeConfig {
  if (!dark) return platformTheme;
  return { ...platformTheme, algorithm: antdTheme.darkAlgorithm, token: { ...platformTheme.token, colorPrimary: '#6b9cff', colorLink: '#8bb3ff', colorText: '#e5eaf3', colorTextSecondary: '#a8b4c6', colorTextTertiary: '#a8b4c6', colorTextPlaceholder: '#a8b4c6', colorBgLayout: '#111722', colorBgContainer: '#1b2330', colorBorder: '#39465a' }, components: { ...platformTheme.components, Button: { ...platformTheme.components?.Button, colorPrimary: '#2563eb', colorPrimaryHover: '#2f65dc', colorPrimaryActive: '#1d4ed8', primaryColor: '#ffffff' }, Tabs: { ...platformTheme.components?.Tabs, itemSelectedColor: '#8bb3ff', itemHoverColor: '#b5ceff', inkBarColor: '#8bb3ff' }, Descriptions: { labelColor: '#a8b4c6' }, Menu: { ...platformTheme.components?.Menu, itemColor: '#bac5d6', itemSelectedBg: '#253b60', itemSelectedColor: '#a9c8ff', itemHoverBg: '#283447' }, Table: { ...platformTheme.components?.Table, headerBg: '#222e3e', headerColor: '#b5c1d3' } } };
}
