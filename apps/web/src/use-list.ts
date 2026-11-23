/** 列表读取状态；重试及组件卸载使用序号隔离，旧请求不能覆盖新身份或新页面。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { failureMessage } from './api';
/**
 * 加载可重试列表，不缓存跨身份内容；调用方传稳定的模块级读取函数。
 * @param loader 已认证列表读取函数，不为空。
 * @returns 列表、加载/失败状态及重试动作，不为空。
 */
export function useList<T>(loader: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  /**
   * 启动本次读取并使先前结果失效；加载期间隐藏旧列表，避免撤权后继续展示旧元数据。
   * @returns 读取处理完成，无业务返回。
   */
  const reload = useCallback(async (): Promise<void> => {
    const current = ++generation.current; setLoading(true); setError(''); setItems([]);
    try { const result = await loader(); if (generation.current === current) setItems(result); }
    catch (reason) { if (generation.current === current) setError(failureMessage(reason)); }
    finally { if (generation.current === current) setLoading(false); }
  }, [loader]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  return { items, loading, error, reload };
}
