package com.code2knowledge.authorization.constant;

/** 自动生成的细分动作常量；源permissions.json，菜单不代替资源授权，禁止直接修改。 */
public final class PermissionCodes {
    /** 查看成员：读取本企业成员公开摘要，不含凭证；不允许创建、启停或分配角色。 */
    public static final String MEMBER_READ = "member.read";
    /** 创建成员：创建本企业普通成员和初始口令；新成员无业务动作，不允许创建引导管理员。 */
    public static final String MEMBER_CREATE = "member.create";
    /** 启停成员：启停本企业普通成员；停用立即失效旧会话和设备身份版本，不可操作引导管理员。 */
    public static final String MEMBER_STATUS = "member.status";
    /** 查看角色：读取本企业自定义角色与只读内置角色及动作目录，不允许修改分配。 */
    public static final String ROLE_READ = "role.read";
    /** 创建角色：创建本企业自定义角色，可选择已注册权限；属于可委派权限的高权限操作。 */
    public static final String ROLE_CREATE = "role.create";
    /** 编辑角色：按版本编辑本企业自定义角色及动作，影响已分配成员；不能编辑内置角色。 */
    public static final String ROLE_UPDATE = "role.update";
    /** 删除角色：按版本删除未被成员引用的自定义角色；禁止删除内置角色。 */
    public static final String ROLE_DELETE = "role.delete";
    /** 分配角色：可委派角色权限，属于高权限；仍受同企业和受保护账号约束。 */
    public static final String ROLE_ASSIGN = "role.assign";
    /** 查看授权目录：读取另行授权的系统目录元数据；目录可见不等于来源分析或知识读取。 */
    public static final String CATALOG_READ = "catalog.read";
    /** 查看全部目录：允许查看本企业全部目录元数据，不授予源码或知识正文权限。 */
    public static final String CATALOG_READ_ALL = "catalog.read.all";
    /** 登记系统：登记本企业系统名称和说明，不授予其他成员目录或内容权限。 */
    public static final String CATALOG_CREATE = "catalog.create";
    /** 授权系统目录：允许调整本企业此类资源授权，不获得分析或内容访问权。 */
    public static final String CATALOG_GRANT = "catalog.grant";
    /** 查看授权来源：读取已逐项授权且当前版本有效的来源元数据，不读取源码或资料正文。 */
    public static final String SOURCE_READ = "source.read";
    /** 查看全部来源：允许查看本企业全部目录元数据，不授予源码或知识正文权限。 */
    public static final String SOURCE_READ_ALL = "source.read.all";
    /** 登记来源：登记本企业仓库或资料定位及系统绑定，不访问网络、本机文件或模型。 */
    public static final String SOURCE_CREATE = "source.create";
    /** 编辑来源：按版本修改来源定位、分支和系统绑定；实际变更使旧版本分析授权失效。 */
    public static final String SOURCE_UPDATE = "source.update";
    /** 启停来源：仅启停本企业来源，不允许修改定位或系统绑定；实际变更使旧分析授权失效。 */
    public static final String SOURCE_STATUS = "source.status";
    /** 授权来源：允许调整本企业此类资源授权，不获得分析或内容访问权。 */
    public static final String SOURCE_GRANT = "source.grant";
    /** 来源分析资格：对另行逐项授权的当前版本来源检查分析资格；不等于任务创建或候选读取。 */
    public static final String SOURCE_ANALYZE = "source.analyze";
    /** 查看本人设备：只读取本人私有设备及连接状态，不包含专用设备凭证。 */
    public static final String DEVICE_READ = "device.read";
    /** 配对本人设备：创建单次短期配对码，兑换时重新核验权限，仅可登记本人设备。 */
    public static final String DEVICE_PAIR = "device.pair";
    /** 撤销本人设备：不可逆撤销本人私有设备，不能撤销或查看其他成员设备。 */
    public static final String DEVICE_REVOKE = "device.revoke";
    /** 查看本人预检：读取本人预检任务、状态和尝试记录，不取得其他成员任务或来源内容。 */
    public static final String TASK_READ = "task.read";
    /** 创建预检：选择本人设备及当前逐项授权来源创建预检任务；运行时领取和回传重查授权。 */
    public static final String TASK_CREATE = "task.create";
    /** 取消本人预检：按版本取消本人预检任务及租约，取消后的迟到结果不得提交。 */
    public static final String TASK_CANCEL = "task.cancel";
    /** 重试本人预检：按版本重试本人失败或取消的预检任务；仍须当前创建资格、来源授权及设备可用。 */
    public static final String TASK_RETRY = "task.retry";
    /** 查看本人逆向：读取本人逆向任务、状态和尝试记录，不取得其他成员任务或来源内容。 */
    public static final String ANALYSIS_READ = "analysis.read";
    /** 创建逆向：选择本人设备及当前逐项授权来源创建逆向任务；运行时领取和回传重查授权。 */
    public static final String ANALYSIS_CREATE = "analysis.create";
    /** 取消本人逆向：按版本取消本人逆向任务及租约，取消后的迟到结果不得提交。 */
    public static final String ANALYSIS_CANCEL = "analysis.cancel";
    /** 重试本人逆向：按版本重试本人失败或取消的逆向任务；仍须当前创建资格、来源授权及设备可用。 */
    public static final String ANALYSIS_RETRY = "analysis.retry";
    /** 查看本人候选：列出并在线读取本人候选；每次校验全部来源当前分析授权，不含ZIP下载。 */
    public static final String CANDIDATE_READ = "candidate.read";
    /** 下载本人原包：下载本人完整候选ZIP；下载前后均重查候选和全部来源当前授权。 */
    public static final String CANDIDATE_DOWNLOAD = "candidate.download";
    /** 导入本人候选：通过本人设备导入固定契约候选包；必须校验全部来源当前授权和包完整性。 */
    public static final String CANDIDATE_IMPORT = "candidate.import";
    /** 查看本人相关审核：读取本人提交或显式指派给本人的审核及上下文，仍须全部来源当前分析授权。 */
    public static final String REVIEW_READ = "review.read";
    /** 提交本人候选审核：提交本人不可变候选进行自审或指定审核；不自动确认内容或发布。 */
    public static final String REVIEW_SUBMIT = "review.submit";
    /** 决定本人受派审核：仅审核显式提交给自己且全部来源授权有效的候选，自审无例外。 */
    public static final String REVIEW_DECIDE = "review.decide";
    /** 查看部门：查看部门，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String DEPARTMENT_READ = "department.read";
    /** 新增部门：新增部门，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String DEPARTMENT_CREATE = "department.create";
    /** 编辑部门：编辑部门，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String DEPARTMENT_UPDATE = "department.update";
    /** 删除部门：删除部门，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String DEPARTMENT_DELETE = "department.delete";
    /** 分配成员部门：分配成员部门，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String DEPARTMENT_ASSIGN = "department.assign";
    /** 查看菜单：查看菜单，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String MENU_READ = "menu.read";
    /** 配置菜单：配置菜单，仅限当前企业；不自动授予来源或知识读取权。 */
    public static final String MENU_UPDATE = "menu.update";
    /** 禁止实例化协议常量容器。 */
    private PermissionCodes() { }
}
