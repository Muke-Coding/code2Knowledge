# Code2Knowledge 开发约定

## 技术和边界

Java 21、Spring Boot 3、MyBatis XML；Web 为 React/TypeScript/Ant Design；设备运行时为独立 TypeScript/Node.js LTS CLI + daemon + 每任务执行器。Python 仅是 MarkItDown 等第三方工具环境。主业务、授权、治理和查询在 Java；设备负责获准的 Git 读取、原料、逆向、校验和上传，不负责业务审核发布。

仅私有化，无 SaaS；开源核心+独立企业扩展，许可证尚未定。模型默认企业内网；客户管理员授权才可外发指定材料。默认平台只存知识、映射、必要证据片段；完整仓库留设备。运行时共享不代表来源授权。

## 中文说明门禁

所有手写类、接口、枚举、record、类型和模块入口有中文职责、归属和使用边界说明。全部显式方法、构造器、函数（含私有、测试、脚本）有 Java Javadoc 或 JS/TS JSDoc/TSDoc；参数说明业务含义、单位、空值，返回说明结果/空值，异常说明触发条件。DTO/record/公共契约逐字段说明。简单回调不机械注释，复杂回调解释目的和约束。

HTTP 注释说明用途、身份、权限、CSRF 前提、请求响应、关键错误和副作用；服务/Mapper 说明真实事务、锁、幂等、软删除恢复、事件投递约束，未实现不写已支持。公共常量说明协议/业务含义；复杂 SQL/并发/加密/安全解释原因；测试说明场景和预期。

禁止占位说明、复述名称、逐行翻译；行为变化同步注释。生成说明在源契约/生成器维护，不单改生成物。Lombok 生成成员由类型和字段说明承载。缺失或不符不得宣称完成；提交前验证说明完整性、格式、类型和生成一致性。

## Java 分层与 SQL

包名推荐 com.code2knowledge.<业务领域>.<职责>（工程基线冻结时确认）；不采用 Cooper 专属 com.cooper 前缀。controller/service/mapper/config/constant/exception/security 按职责放置，禁止领域根包混层。domain.entity 为持久化 DO、domain.dto 为 DTO、domain.bo 为 BO、domain.vo 为 VO，按职责加对应后缀。DTO/VO 不嵌套 Controller；Controller 不依赖 Mapper/DO；Mapper/领域对象不反向依赖 Service/Controller。common 仅存跨域职责，分 common.response、common.handler、common.persistence.typehandler 等。

业务 SQL 仅 src/main/resources/mapper/<业务领域>/*Mapper.xml；Java Mapper 仅方法/参数绑定。禁止 @Select/@Insert/@Update/@Delete/@SelectKey 及 Provider，禁止 Service/Controller 拼接或执行业务 SQL；允许 @Mapper/@Param。

XML 映射块间空一行，说明在所属语句前；关键 SQL 分行条件对齐，namespace/id/返回类型与 Java 移动同步。Flyway 结构脚本在 db/migration/*.sql；测试建数/断言 SQL 例外不能带进生产。

mvn verify 必须运行 ArchitectureRulesTest：分包依赖、SQL 注解、Mapper/XML 对应、映射块空行；新增域同约束，不得禁用门禁。这不代表自动认证全部阿里巴巴手册。

JDK21/Boot3 构建运行，正式业务优先 Java8 常规语法，避免无必要 record/var/文本块/模式匹配/新 switch/API。确需高版本特性，在使用处中文说明特性、必要性、最低版本、行为约束。测试可用虚拟线程但解释目的/释放。允许 Lombok，@Value 用于适当不可变对象，请求 Bean 保留反序列化/空值语义。

## 工程和逐功能验收

根目录存在 .codegraph 时，理解定位代码先 CodeGraph；未索引不创建。Multica 仅参考，不整库移植；检查许可证。保持状态隔离、响应校验、运行可靠性、兼容测试及 HTTP 轮询/领取/租约可靠路径，WSS 仅通知优化。

每功能立即测试正常/失败/身份与对象权限/必要并发，失败先修。运行时用隔离合成仓库实测，真实 Agent 测试单独标记；UI 做自动化和视觉核验。记录通过/失败/跳过/未验证，不以编译或模拟当业务闭环。

较大代码改动交付前，使用当前可用最强模型独立子代理 review，主代理修复有效问题后验证，通常一轮一次。文档整理不冒充代码 review。

有实质进展追加 progress.txt：YYYY-MM-DD HH:mm（北京时间）| 简短概要。每个工作包交付只向用户报告验收结论、阻塞和未验证边界；详细过程放外部文档。

## 前端

Ant Design，已有可用组件优先直接复用（尤其 Menu、Breadcrumb、表单、表格、分页、弹窗与复制交互），不手写重复实现；自定义仅用于业务编排或组件未覆盖的必要行为。样式通过主题令牌与布局调整，保留组件原生键盘与可访问语义。任务/视觉层级/间距/主操作优先；不用冗余 slogan/教学段落/标签，必要次要说明用 tooltip。保留标签、可访问名称、危险后果提示、键盘和焦点。动作清晰优先于删文案。

已有页面 impeccable 主导；新功能 ui-ux-pro-max 梳理、frontend-design 实现、design-system-patterns 公共令牌、impeccable 精修，使用前读取技能。每阶段一个主导，按需专项。验收加载/空/错/禁用/成功/长文本/数据增长，380×620/中/常规尺寸、滚动、键盘焦点；浏览器和 Electron（若有）分开标记，不假称已有桌面产品。

## 产品和文档

空间不是强制概念，当前按企业、成员/组、系统/知识集合授权，不预建空间表或无空间引导。确需协作边界再经需求和 ADR 决定。不凭旧实现补产品规则。Cooper 专属开发顺序、品牌、Electron 既有界面、包名和文档路径全部不采用。

代码目录 /Users/muke/Documents/personal/AI-Native/code2Knowledge。过程设计文档在 /Users/muke/Documents/personal/notes/muke/50_生活其他/创业思路/Code2Knowledge 维护，不复制进仓库；仓库仅约定、维护、构建运行必需说明。产品边界有实质疑问集中询问，常规技术视觉选择自主执行。
