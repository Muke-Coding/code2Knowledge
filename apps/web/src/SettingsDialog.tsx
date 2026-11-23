/** 系统设置共用编辑对话框；复用Ant Design的焦点圈定、Esc和遮罩行为，脏草稿关闭前明确确认。 */
import { useRef } from 'react';
import { Button, Modal } from 'antd';
import type { ReactNode } from 'react';
/** 只管理对话框生命周期，保存和版本校验仍归属各业务页面。 */
interface SettingsDialogProps {
  /** 视觉标题，不得为空。 */
  title: string;
  /** 当前是否展示。 */
  open: boolean;
  /** 保存请求中禁止关闭，避免结果不确定。 */
  busy: boolean;
  /** 常规窗口宽度，单位px，窄窗由AntD限制。 */
  width?: number;
  /** 当前草稿是否已修改；省略时无需丢弃确认。 */
  isDirty?: () => boolean;
  /** 确认关闭后的业务清理，不执行保存。 */
  onClose: () => void;
  /** 点击确认触发表单校验或明确写入；省略则不显示统一底栏。 */
  onSave?: () => void;
  /** 确认按钮的业务动作名称；省略为保存。 */
  saveText?: string;
  /** 依赖加载失败或版本未就绪时禁止保存。 */
  saveDisabled?: boolean;
  /** 动效完成通知；用于表单就绪后再允许键盘操作，省略不监听。 */
  onOpened?: (visible: boolean) => void;
  /** 编辑表单及明确的保存和取消动作。 */
  children: ReactNode;
}
/** @param props 当前业务草稿与保存状态 @returns 统一的企业设置弹窗，不接管业务写入或权限 */
export default function SettingsDialog(props: SettingsDialogProps) {
  const { title, open, busy, width = 640, isDirty, onClose, children } = props;
  const [modal, context] = Modal.useModal();
  const confirming = useRef(false);
  /** @returns 写入中保持弹窗；脏草稿明确确认后关闭，不覆盖其他打开的确认框 */
  function close(): void {
    if (busy || confirming.current) return;
    if (!isDirty?.()) { onClose(); return; }
    confirming.current = true;
    modal.confirm({ title: '放弃未保存的修改？', content: '关闭后，未保存的输入将丢失。', okText: '放弃', cancelText: '继续编辑', onOk: onClose, afterClose: () => { confirming.current = false; } });
  }
  return <>{context}<Modal className="settings-dialog" title={title} open={open} width={width} footer={props.onSave ? <><Button disabled={busy} onClick={close}>取消</Button><Button type="primary" loading={busy} disabled={props.saveDisabled ?? false} onClick={props.onSave}>{props.saveText ?? '保存'}</Button></> : null} afterOpenChange={(visible) => props.onOpened?.(visible)} onCancel={close} maskClosable={false} closable={!busy} keyboard={!busy} destroyOnHidden>{children}</Modal></>;
}
