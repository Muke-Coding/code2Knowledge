/** 平台公开视图的运行时校验，拒绝额外敏感字段；Java响应由真实联通测试核对同一源契约。 */
import Ajv from 'ajv';
import schema from './platform.schema.json' with { type: 'json' };
import type { MemberDirectory, Profile, LockState, Department, MemberDepartment, DepartmentGrant, MenuSetting, Readiness, ReadinessCheck, Session, Member, CatalogSystem, Grant, Csrf, ApiError, Device, Pairing, DeviceCredential, Heartbeat, Permission, Role, MemberRoles, Source, SourcePage, SourceGrant, SourceCheck, Task, TaskPage, TaskLease, TaskAck, PreflightManifest, Candidate, CandidatePage, CandidateAsset, CandidateReport, AnalysisSource, AnalysisTask, AnalysisPage, AnalysisLease, Review, ReviewPage, Reviewer, CandidateContent } from './platform.generated.js';
export type { MemberDirectory, Profile, LockState, Department, MemberDepartment, DepartmentGrant, MenuSetting, Readiness, ReadinessCheck, Session, Member, CatalogSystem, Grant, Csrf, ApiError, Device, Pairing, DeviceCredential, Heartbeat, Permission, Role, MemberRoles, Source, SourcePage, SourceGrant, SourceCheck, Task, TaskPage, TaskLease, TaskAck, PreflightManifest, Candidate, CandidatePage, CandidateAsset, CandidateReport, AnalysisSource, AnalysisTask, AnalysisPage, AnalysisLease, Review, ReviewPage, Reviewer, CandidateContent } from './platform.generated.js';
/** 源Schema定义名与生成类型的对照，不包含客户端权限判定。 */
interface Payloads {
  /** 企业部门。 */
  Department: Department;
  /** 成员部门分配。 */
  MemberDepartment: MemberDepartment;
  /** 部门资源范围。 */
  DepartmentGrant: DepartmentGrant;
  /** 受控菜单配置。 */
  MenuSetting: MenuSetting;
  /** 本次短期设备检查。 */
  Readiness: Readiness;
  /** 固定检查项。 */
  ReadinessCheck: ReadinessCheck;
  /** 当前可读审核快照。 */
  Review: Review;
  /** 权限过滤审核分页。 */
  ReviewPage: ReviewPage;
  /** 审核人选择摘要。 */
  Reviewer: Reviewer;
  /** 有界原文。 */
  CandidateContent: CandidateContent;
  /** AnalysisSource公开逆向契约，模型配置不进入平台。 */
  AnalysisSource: AnalysisSource;
  /** AnalysisTask公开逆向契约，模型配置不进入平台。 */
  AnalysisTask: AnalysisTask;
  /** AnalysisPage公开逆向契约，模型配置不进入平台。 */
  AnalysisPage: AnalysisPage;
  /** AnalysisLease公开逆向契约，模型配置不进入平台。 */
  AnalysisLease: AnalysisLease;

  /** 本人私有候选摘要。 */
  Candidate: Candidate;
  /** 当前授权候选分页。 */
  CandidatePage: CandidatePage;
  /** 候选资产摘要。 */
  CandidateAsset: CandidateAsset;
  /** 固定版本校验报告。 */
  CandidateReport: CandidateReport;
  /** Task公开协议，只接受源契约字段。 */
  Task: Task;
  /** TaskPage公开协议，只接受源契约字段。 */
  TaskPage: TaskPage;
  /** TaskLease公开协议，只接受源契约字段。 */
  TaskLease: TaskLease;
  /** TaskAck公开协议，只接受源契约字段。 */
  TaskAck: TaskAck;
  /** PreflightManifest公开协议，只接受源契约字段。 */
  PreflightManifest: PreflightManifest;

  /** 来源元数据。 */
  Source: Source;
  /** 权限过滤分页。 */
  SourcePage: SourcePage;
  /** 来源成员授权。 */
  SourceGrant: SourceGrant;
  /** 本次分析资格检查。 */
  SourceCheck: SourceCheck;
  /** 已实现动作目录。 */
  Permission: Permission;
  /** 内置或自定义角色。 */
  Role: Role;
  /** 成员附加角色。 */
  MemberRoles: MemberRoles;
  /** 当前所有者设备视图。 */
  Device: Device;
  /** 单次短时配对码。 */
  Pairing: Pairing;
  /** 设备端专用凭证。 */
  DeviceCredential: DeviceCredential;
  /** 心跳确认。 */
  Heartbeat: Heartbeat;
  /** 本人只读/可编辑资料边界。 */
  Profile: Profile;
  /** 当前会话最小锁状态。 */
  LockState: LockState;
  /** 公开会话。 */
  Session: Session;
  /** 用户页最小部门关联。 */
  MemberDirectory: MemberDirectory;
  /** 企业成员。 */
  Member: Member;
  /** 系统目录。 */
  CatalogSystem: CatalogSystem;
  /** 目录授权。 */
  Grant: Grant;
  /** 写保护。 */
  Csrf: Csrf;
  /** 安全错误。 */
  ApiError: ApiError;
}
const ajv = new Ajv.default({ strict: true });
ajv.addSchema(schema);
/**
 * 将不可信响应校验为已知公开视图，不能通过泛型断言绕过敏感字段限制。
 * @param name 源Schema定义名，不为空。
 * @param value HTTP反序列化结果，允许null输入但不能通过验证。
 * @returns 已校验的响应，不返回null。
 * @throws {Error} 字段、类型或额外字段不符时拒绝。
 */
export function parsePlatform<K extends keyof Payloads>(name: K, value: unknown): Payloads[K] {
  if (!ajv.validate({ $ref: `urn:c2k:platform:1#/$defs/${name}` }, value)) throw new Error('平台响应不符合公开契约');
  return value as Payloads[K];
}
