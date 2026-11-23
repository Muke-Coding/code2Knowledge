/** 系统设置通用筛选条；使用原生AntD Form提交与重置，筛选草稿由业务页维护，查询不触发写操作。 */
import { Button, Form, Space } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
/** 统一筛选区域语义与操作顺序，不定义具体过滤业务。 */
interface SettingsFiltersProps {
  /** 筛选字段，须保留可访问标签。 */
  children: ReactNode;
  /** 搜索当前字段值；支持键盘Enter。 */
  onSearch: () => void;
  /** 清空全部筛选并立即还原列表。 */
  onReset: () => void;
  /** 读取过程中禁止重复查询。 */
  loading?: boolean;
}
/** @param props 筛选字段及页面查询动作 @returns 上方筛选区，与下方业务操作栏和表格分离 */
export default function SettingsFilters(props: SettingsFiltersProps) {
  return <Form layout="inline" className="settings-filters" onFinish={props.onSearch}><div className="settings-filter-fields">{props.children}</div><Space className="settings-filter-actions"><Button type="primary" htmlType="submit" icon={<SearchOutlined aria-hidden />} disabled={props.loading ?? false}>搜索</Button><Button icon={<ReloadOutlined aria-hidden />} disabled={props.loading ?? false} onClick={props.onReset}>重置</Button></Space></Form>;
}
