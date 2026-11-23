/** 候选与审核共用的只读资产列表；正文只按纯文本呈现，不执行包内HTML、Markdown或链接。 */
import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Spin, Table, Typography } from 'antd';
import type { CandidateContent, CandidateReport } from '@c2k/contracts';
import { failureMessage, getCandidateContent, getReviewContent } from './api';
/** 资产阅读上下文；授权由服务端每次重新判断，不在客户端缓存正文。 */
interface AssetProps {
  /** 候选或审核标识，非空。 */
  id: string;
  /** 审核上下文不得复用候选所有者接口。 */
  review?: boolean;
  /** 已通过契约校验的不可变清单。 */
  report: CandidateReport;
}
/** @param props 已授权清单与对应读取上下文 @returns 分页文件列表及有界纯文本抽屉，关闭后清除内容 */
export default function CandidateAssets(props: AssetProps) {
  const { id, review = false, report } = props;
  const [path, setPath] = useState(''); const [content, setContent] = useState<CandidateContent | null>(null); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  // 身份、文件或重试变化使旧响应失效；新文件读取失败时绝不显示上一份正文。
  useEffect(() => {
    let active = true; setContent(null); setError('');
    if (path) (review ? getReviewContent(id, path) : getCandidateContent(id, path)).then((value) => { if (active) setContent(value); }).catch((reason) => { if (active) setError(failureMessage(reason)); });
    return () => { active = false; };
  }, [id, path, review, retry]);
  return <section className="permission-section"><h2>资产清单</h2>
    <Table rowKey="path" size="small" dataSource={report.assets} scroll={{ x: 470 }} pagination={{ pageSize: 10, hideOnSinglePage: false, showSizeChanger: false }} locale={{ emptyText: <Empty description="没有资产" /> }} columns={[
      { title: '文件', dataIndex: 'path', width: 330, render: (value: string) => <Button type="link" className="system-link candidate-path" onClick={() => setPath(value)}>{value}</Button> },
      { title: '大小', dataIndex: 'bytes', width: 100, render: (value: number) => `${(value / 1024).toFixed(1)} KiB` },
    ]} />
    <Drawer title={path || '资产正文'} aria-label="资产正文" open={!!path} width={840} onClose={() => { setPath(''); setContent(null); }} destroyOnHidden>
      {error ? <Alert role="alert" type="error" message={error} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} /> : !content ? <Spin /> : <><Typography.Paragraph className="candidate-hash" copyable={{ text: content.sha256 }}>SHA-256：{content.sha256}</Typography.Paragraph><pre className="asset-content" tabIndex={0} aria-label="文件纯文本">{content.content}</pre></>}
    </Drawer>
  </section>;
}
