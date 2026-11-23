/** 成员多角色分配对话框；全量替换使用并发版本，加载失败禁止保存，不覆盖引导管理员身份。 */
import { useEffect, useState } from 'react';
import { Alert, Button, Form, Select, Spin } from 'antd';
import SettingsDialog from './SettingsDialog';
import type { Member, Role } from '@c2k/contracts';
import { failureMessage, getMemberRoles, listRoles, setMemberRoles } from './api';
/** 成员角色编辑上下文；null关闭且销毁本次草稿。 */
interface Props {
  /** 同企业普通成员；null不显示。 */
  member: Member | null;
  /** 关闭完成通知，调用者负责还原触发按钮焦点。 */
  onClose: () => void;
}
/** @param props 普通成员和关闭通知。 @returns 带版本保护的角色选择器，不为空。 */
export default function MemberRolesDrawer(props: Props) {
  const { member, onClose } = props;
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  // 身份/成员变化先清空；过期响应不能污染另一个成员的角色草稿。
  useEffect(() => {
    let active = true; setSelected([]); setRoles([]); setRevision(null); setError('');
    if (!member) return;
    setLoading(true);
    Promise.all([listRoles(), getMemberRoles(member.id)]).then(([values, assignment]) => {
      if (active) { setRoles(values.filter((role) => !role.builtIn)); setSelected(assignment.roleIds); setRevision(assignment.revision); }
    }).catch((reason) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [member?.id, attempt]);
  /** @returns 提交明确角色数组；失败保留草稿，刷新后重新选择，不盲目重试冲突。 */
  async function submit(): Promise<void> {
    if (!member || revision === null) return;
    setBusy(true); setError('');
    try { await setMemberRoles(member.id, selected, revision); onClose(); }
    catch (reason) { setError(failureMessage(reason)); setRevision(null); }
    finally { setBusy(false); }
  }
  return <SettingsDialog title={member ? `${member.displayName}的角色` : '分配角色'} open={member !== null} width={640} busy={busy} onSave={() => void submit()} saveText="保存分配" saveDisabled={revision === null || loading} onClose={onClose}>
    {error && <Alert role="alert" type="error" message={error} className="form-alert" action={<Button disabled={busy} onClick={() => setAttempt((value) => value + 1)}>刷新授权</Button>} />}
    {loading ? <div className="drawer-loading"><Spin /></div> : <Form layout="vertical" onFinish={() => void submit()} requiredMark={false}>
      <Form.Item label="自定义角色"><Select mode="multiple" aria-label="选择成员角色" value={selected} onChange={setSelected} disabled={busy || revision === null} placeholder="选择角色，留空仅保留基础成员身份" options={roles.map((role) => ({ value: role.id, label: role.name }))} optionFilterProp="label" /></Form.Item>
      {selected.some((id) => roles.find((role) => role.id === id)?.permissions.some((code) => code.startsWith('role.') && code !== 'role.read')) && <Alert type="warning" message="包含角色与授权管理，可委派其他管理权限。" className="form-alert" />}
    </Form>}
  </SettingsDialog>;
}
