/** 自动生成的平台响应类型；源 platform.schema.json，禁止直接修改。 */
/** 浏览器会话公开身份，不包含凭证，不代表知识阅读授权。 */
export interface Session {
  /** 身份UUID，不为空。 */
  id: string;
  /** 部署内唯一登录名，不为空。 */
  username: string;
  /** 显示名称，不为空。 */
  displayName: string;
  /** 企业名称，不为空。 */
  tenantName: string;
  /** 受保护基础身份，不用于判断当前管理动作；自定义角色动作见permissions。 */
  role: "ADMIN" | "MEMBER";
  /** 当前动作集合，只为界面提示；服务端逐请求重查。 */
  permissions: string[];
  /** 当前动作授权的页面目录；空数组表示无可用功能。 */
  navigation: Navigation[];
}
/** 企业成员管理视图，禁止返回密码摘要。 */
export interface Member {
  /** 成员UUID，不为空。 */
  id: string;
  /** 登录名，不为空。 */
  username: string;
  /** 显示名称，不为空。 */
  displayName: string;
  /** 受保护基础身份ADMIN或MEMBER，不代表全部附加角色。 */
  role: "ADMIN" | "MEMBER";
  /** 启用状态，不为空。 */
  enabled: boolean;
}
/** 目录元数据，catalog.read不代表来源或知识读取。 */
export interface CatalogSystem {
  /** 系统UUID，不为空。 */
  id: string;
  /** 系统名称，不为空。 */
  name: string;
  /** 目录描述，允许空字符串。 */
  description: string;
}
/** 单系统目录读取授权，不代表知识授权。 */
export interface Grant {
  /** 普通成员UUID，不为空。 */
  memberId: string;
  /** 成员显示名，不为空。 */
  displayName: string;
  /** 仅目录读取动作。 */
  action: "catalog.read";
}
/** 当前会话写保护令牌，不是访问令牌。 */
export interface Csrf {
  /** 写请求头名称，不为空。 */
  headerName: string;
  /** CSRF令牌，不记录日志。 */
  token: string;
}
/** 不含敏感正文的稳定HTTP错误。 */
export interface ApiError {
  /** 稳定错误码。 */
  code: string;
  /** 中文恢复提示。 */
  message: string;
}
/** 所有者私有设备视图，不含凭证；仅接入健康不代表可执行任务。 */
export interface Device {
  /** 设备UUID，不为空。 */
  id: string;
  /** 所有者指定名称，不为空。 */
  name: string;
  /** 自报操作系统，不作为信任证明。 */
  os: string;
  /** 自报CPU架构，不作为信任证明。 */
  arch: string;
  /** 运行时协议客户端版本，不为空。 */
  version: string;
  /** 心跳派生状态，撤销或停用优先。 */
  status: "ONLINE" | "OFFLINE" | "REVOKED";
  /** 最近心跳ISO时间；未发送心跳为空字符串。 */
  lastSeen: string;
}
/** 短时单次配对资料，仅创建时返回原码，禁止日志记录。 */
export interface Pairing {
  /** 配对会话UUID，不为空。 */
  id: string;
  /** 256位随机配对码，仅用于标准输入，禁止放命令参数。 */
  code: string;
  /** 配对有效期ISO时间，5分钟后拒绝。 */
  expiresAt: string;
}
/** 配对兑换成功，仅设备本地持久化，禁止日志和浏览器展示。 */
export interface DeviceCredential {
  /** 新设备UUID，不为空。 */
  id: string;
  /** 设备专用256位凭证，仅授予心跳，不授予浏览器业务访问。 */
  token: string;
  /** 设备凭证过期ISO时间，30天后需要重新配对。 */
  expiresAt: string;
}
/** 设备认证后心跳确认，服务端时钟为状态事实源。 */
export interface Heartbeat {
  /** 当前设备UUID，不为空。 */
  id: string;
  /** 当前设备状态。 */
  status: "ONLINE";
  /** 服务端ISO时间，不为空。 */
  serverTime: string;
}
/** 已实现动作目录，未知或未来动作不能配置。 */
export interface Permission {
  /** 稳定动作码。 */
  code: string;
  /** 动作名称。 */
  name: string;
  /** 实际能力和边界。 */
  description: string;
}
/** 角色与动作，内置角色受保护，不自动获得内容读取权。 */
export interface Role {
  /** 角色ID。 */
  id: string;
  /** 角色名称。 */
  name: string;
  /** 职责说明，可空串。 */
  description: string;
  /** 只读基础角色标志。 */
  builtIn: boolean;
  /** 并发编辑版本，非负。 */
  revision: number;
  /** 显式动作数组，可为空。 */
  permissions: string[];
}
/** 成员附加角色分配，基础身份不受此入口修改。 */
export interface MemberRoles {
  /** 并发分配版本，非负。 */
  revision: number;
  /** 同企业自定义角色数组，空表示无附加角色。 */
  roleIds: string[];
}
/** 来源公开元数据，不含正文；canAnalyze只代表当前资格，不证明远端或文件可访问。 */
export interface Source {
  /** 稳定来源UUID。 */
  id: string;
  /** 来源名称。 */
  name: string;
  /** 仓库或资料类型。 */
  kind: "REPOSITORY" | "DOCUMENT";
  /** 无凭证Git地址或运行时相对资料路径。 */
  locator: string;
  /** 默认分析分支，资料为空字符串。 */
  branch: string;
  /** 当前是否启用。 */
  enabled: boolean;
  /** 配置版本，非负。 */
  revision: number;
  /** 同时有动作和当前版本资源授权。 */
  canAnalyze: boolean;
}
/** 服务端授权过滤后分页，每页20项。 */
export interface SourcePage {
  /** 当前页可见来源。 */
  items: Source[];
  /** 页码，从1开始。 */
  page: number;
  /** 仅当前主体可见数量，非负。 */
  total: number;
}
/** 来源成员资源授权，不自动获得角色动作或设备使用权。 */
export interface SourceGrant {
  /** 同企业成员UUID。 */
  memberId: string;
  /** 成员公开名称。 */
  displayName: string;
  /** 授权对应的配置版本。 */
  sourceRevision: number;
  /** 来源启用且授权版本仍匹配。 */
  current: boolean;
}
/** 本次资格检查结果，不是可复用票据，不执行逆向。 */
export interface SourceCheck {
  /** 来源UUID。 */
  sourceId: string;
  /** 本次核对配置版本。 */
  revision: number;
  /** 本次检查通过。 */
  allowed: boolean;
}
/** 私有来源预检及当前尝试，不代表逆向完成或业务发布。 */
export interface Task {
  /** 任务稳定UUID。 */
  id: string;
  /** 已授权仓库来源UUID。 */
  sourceId: string;
  /** 创建时来源名称快照，不随目录改名。 */
  sourceName: string;
  /** 创建时来源配置版本，变化后拒绝执行。 */
  sourceRevision: number;
  /** 明确选择的本地Git分支，不代表远端最新。 */
  branch: string;
  /** 所有者私有设备UUID。 */
  deviceId: string;
  /** 创建时设备名快照。 */
  deviceName: string;
  /** 预检任务名称，不含脚本。 */
  name: string;
  /** 任务控制版本，用于并发取消或重试。 */
  revision: number;
  /** 当前尝试序号，从1开始。 */
  attemptNumber: number;
  /** 当前执行尝试UUID。 */
  attemptId: string;
  /** 当前尝试状态：QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/EXPIRED。 */
  state: string;
  /** 固定Git完整commit，未完成为空字符串。 */
  commitId: string;
  /** 本地隔离归档摘要，未完成为空字符串。 */
  archiveSha256: string;
  /** 已提交树中的条目数，未完成为0。 */
  fileCount: number;
  /** 本地隔离归档字节数，未完成为0。 */
  archiveBytes: number;
  /** 固定可公开状态说明，不接受任意设备日志。 */
  message: string;
  /** 任务UTC创建时间。 */
  createdAt: string;
  /** 本次尝试UTC更新时间。 */
  updatedAt: string;
}
/** 本人任务分页，不含隐藏数量。 */
export interface TaskPage {
  /** 当前页任务。 */
  items: Task[];
  /** 从1开始页码。 */
  page: number;
  /** 当前成员任务数量。 */
  total: number;
}
/** 设备当前领取租约，不进入浏览器或日志。 */
export interface TaskLease {
  /** 是否领取到任务；false时其余文本为空、fence和sourceRevision为0。 */
  available: boolean;
  /** 任务UUID，无任务为空。 */
  taskId: string;
  /** 本次尝试UUID，无任务为空。 */
  attemptId: string;
  /** 本次租约标识，不落日志。 */
  leaseId: string;
  /** 尝试序号，旧尝试不能提交。 */
  fence: number;
  /** 本机必须显式绑定的来源UUID。 */
  sourceId: string;
  /** 本机来源绑定必须匹配的配置版本。 */
  sourceRevision: number;
  /** 只解析该本地分支，不联网、不切换工作区。 */
  branch: string;
}
/** 服务端租约确认，false必须终止。 */
export interface TaskAck {
  /** 当前租约与策略是否仍有效。 */
  valid: boolean;
  /** 本次服务端确认状态，无可见任务时REJECTED。 */
  state: string;
}
/** 本地隔离预检输出，无源码、文件名和宿主定位。 */
export interface PreflightManifest {
  /** 本地执行终态。 */
  outcome: "SUCCEEDED" | "FAILED";
  /** 固定commit；失败为空。 */
  commitId: string;
  /** 隔离归档SHA256；失败为空。 */
  archiveSha256: string;
  /** 树条目数。 */
  fileCount: number;
  /** 隔离归档字节。 */
  archiveBytes: number;
  /** 固定失败码，不传日志。 */
  failureCode: "" | "BINDING_REQUIRED" | "SOURCE_CHANGED" | "PREFLIGHT_FAILED";
}
/** 导入者私有的不可变候选版本，不代表审核或发布。 */
export interface Candidate {
  /** 候选UUID。 */
  id: string;
  /** 规范资产清单SHA256。 */
  digest: string;
  /** 原ZIP字节数。 */
  archiveBytes: number;
  /** 服务端接收时间。 */
  createdAt: string;
  /** 明确为外部产物导入。 */
  mode: "IMPORTED" | "EXECUTED";
}
/** 仅包含当前仍有全部来源授权的本人候选分页。 */
export interface CandidatePage {
  /** 本页可读候选，最多20项。 */
  items: Candidate[];
  /** 从1开始的当前页。 */
  page: number;
  /** 当前可见总数。 */
  total: number;
}
/** 包内单个资产的完整性摘要，不渲染或执行资产正文。 */
export interface CandidateAsset {
  /** 五类资产目录下的相对文件名。 */
  path: string;
  /** 原文字节SHA256。 */
  sha256: string;
  /** UTF8原文字节数。 */
  bytes: number;
  /** 固定Skill契约校验的原始元数据，仅作为不可信数据展示。 */
  meta: Record<string, unknown>;
}
/** 固定版本纯契约校验报告，不证明来源声明真实性或业务正确性。 */
export interface CandidateReport {
  /** 包版本。 */
  version: "1";
  /** 资产清单SHA256。 */
  digest: string;
  /** 导入模式。 */
  mode: "IMPORTED" | "EXECUTED";
  /** 固定Skill版本。 */
  skillVersion: "1.0.2";
  /** 资产契约版本。 */
  contractVersion: "2.0";
  /** 包内资产摘要，最大128项。 */
  assets: CandidateAsset[];
}
/** 多来源逆向固定材料引用，不含本机绝对路径或凭证。 */
export interface AnalysisSource {
  /** 平台来源UUID */
  sourceId: string;
  /** 固定来源配置版本 */
  revision: number;
  /** 唯一材料标识 */
  alias: string;
  /** 平台来源类型 */
  kind: "REPOSITORY" | "DOCUMENT";
  /** 代码分支；资料为空 */
  branch: string;
  /** 资料根内相对定位；代码为空 */
  locator: string;
}
/** 本人多来源逆向任务，成功仅表示候选接收。 */
export interface AnalysisTask {
  /** 任务稳定UUID。 */
  id: string;
  /** 已授权仓库来源UUID。 */
  sourceId: string;
  /** 创建时来源名称快照，不随目录改名。 */
  sourceName: string;
  /** 创建时来源配置版本，变化后拒绝执行。 */
  sourceRevision: number;
  /** 明确选择的本地Git分支，不代表远端最新。 */
  branch: string;
  /** 所有者私有设备UUID。 */
  deviceId: string;
  /** 创建时设备名快照。 */
  deviceName: string;
  /** 逆向任务名称，不含脚本。 */
  name: string;
  /** 任务控制版本，用于并发取消或重试。 */
  revision: number;
  /** 当前尝试序号，从1开始。 */
  attemptNumber: number;
  /** 当前执行尝试UUID。 */
  attemptId: string;
  /** 当前尝试状态：QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/EXPIRED。 */
  state: string;
  /** 固定Git完整commit，未完成为空字符串。 */
  commitId: string;
  /** 本地隔离归档摘要，未完成为空字符串。 */
  archiveSha256: string;
  /** 已提交树中的条目数，未完成为0。 */
  fileCount: number;
  /** 本地隔离归档字节数，未完成为0。 */
  archiveBytes: number;
  /** 固定可公开状态说明，不接受任意设备日志。 */
  message: string;
  /** 任务UTC创建时间。 */
  createdAt: string;
  /** 本次尝试UTC更新时间。 */
  updatedAt: string;
  /** 产品稳定slug */
  product: string;
  /** 业务域稳定slug */
  domain: string;
  /** 明确业务范围，不是脚本 */
  scope: string;
  /** 显式资料选择 */
  documentsChoice: "INCLUDE" | "NONE" | "";
  /** 全部固定来源快照 */
  sources: AnalysisSource[];
  /** 本次尝试成功提交的私有候选；未提交为空 */
  candidateId: string;
}
/** 本人逆向任务分页 */
export interface AnalysisPage {
  /** 当前页任务。 */
  items: AnalysisTask[];
  /** 从1开始页码。 */
  page: number;
  /** 当前成员任务数量。 */
  total: number;
}
/** 独立协议的逆向租约，空租约其余字段为空；模型仅在运行时配置。 */
export interface AnalysisLease {
  /** 是否领取到任务；false时其余文本为空、fence和sourceRevision为0。 */
  available: boolean;
  /** 任务UUID，无任务为空。 */
  taskId: string;
  /** 本次尝试UUID，无任务为空。 */
  attemptId: string;
  /** 本次租约标识，不落日志。 */
  leaseId: string;
  /** 尝试序号，旧尝试不能提交。 */
  fence: number;
  /** 本机必须显式绑定的来源UUID。 */
  sourceId: string;
  /** 本机来源绑定必须匹配的配置版本。 */
  sourceRevision: number;
  /** 只解析该本地分支，不联网、不切换工作区。 */
  branch: string;
  /** 产品稳定slug */
  product: string;
  /** 业务域稳定slug */
  domain: string;
  /** 明确业务范围，不是脚本 */
  scope: string;
  /** 显式资料选择 */
  documentsChoice: "INCLUDE" | "NONE" | "";
  /** 全部固定来源快照 */
  sources: AnalysisSource[];
}
/** 当前主体可见的不可变候选审核快照。 */
export interface Review {
  /** 审核UUID。 */
  id: string;
  /** 不可变候选UUID。 */
  candidateId: string;
  /** 送审摘要。 */
  digest: string;
  /** 提交者UUID。 */
  submitterId: string;
  /** 实际审核人UUID。 */
  reviewerId: string;
  /** SELF或ASSIGNED，不代替审核动作。 */
  method: "SELF" | "ASSIGNED";
  /** 审核状态，与原包及发布状态独立。 */
  state: "PENDING" | "CONFIRMED" | "REJECTED";
  /** CAS控制版本。 */
  revision: number;
  /** 审核意见，待审为空。 */
  comment: string;
  /** 提交时间。 */
  createdAt: string;
  /** 决定时间，待审为空。 */
  decidedAt: string;
  /** 提交人当前显示名称，不作为身份依据。 */
  submitterName: string;
  /** 审核人当前显示名称，不作为身份依据。 */
  reviewerName: string;
}
/** 审核权限过滤分页。 */
export interface ReviewPage {
  /** 本人提交/受派且来源有效的审核。 */
  items: Review[];
  /** 起始1页码。 */
  page: number;
  /** 当前可见数量。 */
  total: number;
}
/** 当前候选可选审核人摘要，不隐含授权。 */
export interface Reviewer {
  /** 当前企业有效成员UUID。 */
  id: string;
  /** 审核人显示名。 */
  displayName: string;
}
/** 通过原包及资产摘要校验的纯文本，不能作为HTML执行。 */
export interface CandidateContent {
  /** 清单中相对路径。 */
  path: string;
  /** 原始正文摘要。 */
  sha256: string;
  /** UTF8原文，字节限制由服务执行。 */
  content: string;
}
/** 源目录按当前动作过滤的可达页面，不包含资源范围。 */
export interface Navigation {
  /** 页面路径 */
  path: string;
  /** 页面名称 */
  title: string;
  /** 目录标识 */
  group: string;
  /** 目录名称 */
  groupTitle: string;
  /** 页面读取动作 */
  permission: string;
  /** 仅导航显示，不撤销动作或路由资格。 */
  visible: boolean;
}
/** 设备自报的脱敏本机检查项；不是平台信任证明或模型质量结论。 */
export interface ReadinessCheck {
  /** 固定检查类型。 */
  code: "NODE" | "GIT" | "SKILL" | "AGENT" | "CREDENTIAL" | "MATERIALS";
  /** 本机检查状态。 */
  status: "PASS" | "FAIL" | "NOT_CHECKED";
}
/** 本人本次设备与来源选择的短期就绪检查，不代替执行授权。 */
export interface Readiness {
  /** 检查UUID；无可领取项为空。 */
  id: string;
  /** 平台状态，过期不再表示就绪。 */
  state: "PENDING" | "CHECKING" | "COMPLETE" | "EXPIRED";
  /** 平台UTC有效期。 */
  expiresAt: string;
  /** 仅本次当前授权来源，不含本机路径。 */
  sources: AnalysisSource[];
  /** 固定六类检查，无原始日志。 */
  checks: ReadinessCheck[];
}
/** Department企业管理公开契约，不含凭证。 */
export interface Department {
  /** 当前对象UUID */
  id: string;
  /** 上级UUID，根为空 */
  parentId: string;
  /** 名称 */
  name: string;
  /** 升序排序 */
  sortOrder: number;
  /** 是否启用 */
  enabled: boolean;
  /** 当前乐观版本 */
  revision: number;
}
/** MemberDepartment企业管理公开契约，不含凭证。 */
export interface MemberDepartment {
  /** 当前部门UUID，分配未设置时为空 */
  departmentId: string;
  /** 当前乐观版本 */
  revision: number;
}
/** DepartmentGrant企业管理公开契约，不含凭证。 */
export interface DepartmentGrant {
  /** 当前部门UUID，分配未设置时为空 */
  departmentId: string;
  /** SYSTEM或SOURCE */
  resourceKind: string;
  /** 资源UUID */
  resourceId: string;
  /** 来源版本，目录为0 */
  sourceRevision: number;
  /** 明确是否包含下级 */
  includeChildren: boolean;
  /** 当前乐观版本 */
  revision: number;
  /** 是否有效；撤销保留版本墓碑，false不产生授权 */
  active: boolean;
}
/** MenuSetting企业管理公开契约，不含凭证。 */
export interface MenuSetting {
  /** 固定页面路径 */
  path: string;
  /** 显示名称 */
  title: string;
  /** 固定组标识 */
  group: string;
  /** 固定组名称 */
  groupTitle: string;
  /** 注册读取动作 */
  permission: string;
  /** 升序排序 */
  sortOrder: number;
  /** 仅导航入口是否显示 */
  visible: boolean;
  /** 当前乐观版本 */
  revision: number;
}
/** 当前有效会话最小锁状态，不携带业务权限或凭证。 */
export interface LockState {
  /** 当前服务端会话是否锁定 */
  locked: boolean;
  /** 当前账户显示名称 */
  displayName: string;
}
/** 本人账户资料，角色和部门只读，不携带密码。 */
export interface Profile {
  /** 不可自行修改的登录名 */
  username: string;
  /** 本人显示名称 */
  displayName: string;
  /** 当前企业名称 */
  tenantName: string;
  /** 主部门名称，未分配为空串 */
  departmentName: string;
  /** 当前基础和显式角色名称 */
  roles: string[];
  /** 显示资料乐观版本 */
  revision: number;
}
/** 用户页只读主部门关联；需同时具备成员与部门读取，不授予任何资源权限。 */
export interface MemberDirectory {
  /** 当前企业成员UUID，不为空。 */
  memberId: string;
  /** 主部门UUID；未分配为空串。 */
  departmentId: string;
}
