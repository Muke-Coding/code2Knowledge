# Code2Knowledge

Java 21 / Spring Boot 3 / MyBatis XML，独立 TypeScript / Node.js 22 Runtime，React / Ant Design Web。

当前可验收：本地管理员登录、普通成员创建/启停、系统目录登记与目录读取授权/撤销，以及成员私有设备配对、心跳、停止、撤销；新增自定义角色、成员多角色分配、动作门禁与并发授权保护。使用真实 PostgreSQL；未知接口默认拒绝。已接入来源登记、逐项分析授权和本机来源预检任务。OIDC、组与完整知识权限、已接通多来源Claude执行适配，真实内网模型语义质量待客户本机配置后验收；知识发布及 MCP 尚未实现。平台许可证未定，不对外发布；现有 MIT Skill 不受影响。

## 本地手动验收

需要 Docker、JDK 21、Maven 3.8.8+、Node.js 22、pnpm 10.28.2。仅绑定回环地址，不是生产部署。

```sh
pnpm install --frozen-lockfile
pnpm dev:platform
```

打开 `http://127.0.0.1:15173`。登录名 `admin`，首次随机密码保存在 `.local/admin-password`（权限600，不输出日志）。重启不会重置已有密码。可用 `C2K_JAVA_HOME` 指定JDK21；未设置时本机已知JDK21优先，否则使用JAVA_HOME，不修改全局环境。`C2K_TENANT_NAME` 仅用于空数据库首次引导。

专属PostgreSQL容器 `c2k-platform-local-postgres`，端口 `127.0.0.1:16432`，数据卷 `c2k-platform-local-data`；不复用其他项目数据库。Java端口18080，Web端口15173。Ctrl+C停止本次Java/Web，数据库和数据保留。停止本项目数据库可执行 `docker stop c2k-platform-local-postgres`；不要删除数据卷或凭证文件来重置密码。

浏览器会话内存存储，应用重启后需重新登录，账户、目录、授权、审计仍保存在数据库。成员停用或启用后旧会话版本失效，需重新登录。目录权限不代表知识、源码或证据权限；管理员不隐式获得未来内容阅读权。

## 角色与授权

“角色与权限”使用 Ant Design 树按目录、页面、操作选择细分动作；勾选操作同步勾选实际前置，取消前置会移除依赖操作。菜单由服务端会话导航过滤，按钮独立按动作显示，Java 每次请求仍校验当前动作、企业、所有者及资源范围。“成员→分配角色”可多选；内置身份受保护，角色修改与分配使用版本冲突保护。角色创建、编辑和分配能委派权限，仅授予可信管理者。

新成员默认无业务权限；V11 将升级前基础能力迁移到可撤销的“历史基础访问”角色，并展开旧 manage 动作；原账号、资源标识、ACL、设备和内容保持。旧基础身份不再隐式赋权。新旧成员均需显式角色才能操作，来源分析和内容还须逐项当前授权。撤权对下一次后端请求立即生效，界面每15秒、恢复焦点或遇到403同步导航并清除旧权限页面。

权限源为 `packages/contracts/src/permissions.json`，`pnpm verify` 校验 Java 常量、服务端目录和 V11 升级脚本一致性。未部署的 V11 可用 `node verification/permissions-contract.mjs --write` 重生成；部署后不得改写历史迁移，新增动作应追加新版本迁移并同步维护生成器。旧 manage 码仅用于迁移/历史测试适配，生产角色接口不接受别名。

## 私有设备接入

登录后进入“我的设备”→“接入设备”，复制五分钟有效的一次性配对码。在本仓库终端运行：

```sh
node apps/runtime/dist/cli.js connect --server http://127.0.0.1:15173 --name "我的 Mac"
node apps/runtime/dist/cli.js start
```

connect提示后粘贴配对码，输入不回显；不要将配对码或设备令牌写入命令参数。保持start前台运行，页面刷新显示在线。Ctrl+C停止；约30秒后刷新变为离线。另一个终端可用status/stop检查或停止同一设备；平台撤销后旧凭证无法继续心跳。

凭证默认位于 `~/.code2knowledge/runtime`，目录700、文件600；可通过 `C2K_RUNTIME_HOME` 指定独立目录，后续命令须使用同一目录。不覆盖已有连接，不删除凭证重置平台设备。设备令牌30天有效，本轮到期或撤销后需选择新私有目录重新配对。仅所有者可列出与撤销，管理员无跨所有者查看例外；停用后再启用成员不会恢复旧设备令牌。

本轮实测macOS ARM64/Node22，Windows不支持此文件权限实现，Linux尚未实机验收。服务地址要求HTTPS，仅显式回环IP允许开发HTTP；代理必须将 `/runtime` 与 `/api` 转发到Java。daemon用目录真实路径的摘要选择本机回环独占端口作为进程互斥，不承载业务接口；碰撞时拒绝启动，不终止其他程序。已接入本机来源预检的领取、租约与独立进程执行器；尚无后台系统服务、共享设备或远端 Git 凭证代理。

## 验证命令

先停止手动验收应用，避免占用测试端口：

```sh
pnpm verify
mvn -f backend/pom.xml verify
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:integration
pnpm test:platform
pnpm test:platform-ui
```

Maven须JDK21。`pnpm verify` 检查生成一致性、中文注释、构建、严格类型（含测试配置）、TS/契约/运行时单测。`mvn verify` 执行架构与诊断安全测试。`test:e2e` 模拟诊断状态；`test:integration` 验证无数据库诊断模式真实Java/Web/CLI。`test:platform` 和 `test:platform-ui` 使用独立临时PostgreSQL库，不修改手动验收库；UI入口先构建当前Java，不使用旧jar。正常退出及SIGINT/SIGTERM会等待子进程结束并删除临时库；SIGKILL/机器断电不能保证清理。

默认不带profile的Java仍是拒绝业务接口的诊断模式，页面在 `/diagnostics`，不能替代持久化平台验收。Runtime CLI提供help/doctor/connect/start/status/stop/bind-source/unbind-source/import-candidate；仅执行显式授权的本机 Git 预检，不执行 Skill 或模型任务。

## 维护

公共响应源Schema位于 `packages/contracts/src`；更新后运行 `node verification/health-contract.mjs --write` 或 `node verification/platform-contract.mjs --write`。生成类型不手改，真实API响应也需通过相同Schema校验。业务SQL仅在Mapper XML，结构变更通过Flyway新增迁移。

本地HTTP的会话Cookie不带Secure，仅适用于回环开发。生产必须配置TLS、`C2K_COOKIE_SECURE=true`、企业身份/强认证和反向代理；这些部署能力尚未验收。单节点登录限速不替代企业网关。开发规范见AGENTS.md，过程设计及验收记录维护在指定的外部文档目录。

## 来源与分组导航

菜单按知识管理（候选知识、系统目录、来源管理）、运行管理（我的设备、预检任务）、企业管理（成员、角色与权限）分组，按已实现动作显示。来源管理支持仓库/运行时资料定位、分支与系统多对多关联、启停和版本保护。来源管理的读取、登记、编辑、启停、授权分别控制，不提供默认分析范围；`source.analyze`还需当前配置逐项成员授权，管理员也需自授权。配置变化使旧授权失效。角色树按实际操作选择动作，资源范围独立授权。

资料本轮不上传正文；只接受运行时资料根下的相对定位。仓库地址禁止内嵌凭证，默认建议master但允许main或其他分支。分析资格检查不访问Git、文件或模型，也不创建任务。本机来源预检已接入真实领取/租约；候选导入和对象适配见下节；多来源执行适配见下节；真实模型语义、知识发布与MCP仍待专项验收。

## 本机来源预检

“预检任务”选择逐项授权仓库与本人设备。创建表单显示来源UUID和配置版本；用 `node apps/runtime/dist/cli.js bind-source --id <UUID> --revision <版本> --repo <本机仓库绝对路径>` 显式绑定，再运行 start。仅解析本地已提交分支，固定 commit、生成临时 tar 并回传摘要；不 fetch/checkout、不上传源码。`unbind-source --id <UUID>` 撤销本机许可。支持取消、失败手动重试及尝试历史；配置变化须重新授权/绑定并新建任务。预检完成不代表逆向完成。

仅支持普通本机仓库，拒绝 worktree/裸仓库/子模块与缺失对象；禁用 Git 传输协议和凭证助手。每设备一项任务，租约45秒/续租10秒，10万文件/256MiB归档限额；进程隔离不等同容器沙箱。正常清理临时目录，强杀或断电残留尚无自动恢复清理器。平台拒绝取消/撤权后的旧成果，不承诺离线设备即时物理停止。

Web交互优先复用Ant Design原生组件：导航Menu、当前位置Breadcrumb、Typography复制、表单/表格/分页、抽屉/确认弹窗等。ConfigProvider统一令牌；业务布局保留独立样式，不重复实现组件的键盘与可访问协议。

侧栏不显示企业名称，知识/运行/企业管理采用Menu父子折叠，初次进入或刷新默认全部折叠，不按当前路由自动展开。全部主列表使用Table：来源、任务和候选按服务端20条分页，成员、角色、系统、本人设备按接口完整授权结果本地10条分页；有数据时即使单页也显示分页器，空列表沿用Table默认隐藏。


## 候选原包对象存储

本地开发默认 `C2K_CANDIDATE_STORAGE=local`，原包保存在 `C2K_CANDIDATE_OBJECTS`（默认 `.local/candidate-objects`），目录700、文件创建即600；数据库只存摘要、来源绑定与无正文清单。应将数据库和对象目录作为同一恢复单元备份，不能仅备份其中之一。本地适配不支持跨节点共享。

私有部署可设置 `C2K_CANDIDATE_STORAGE=s3`，配置 `C2K_S3_ENDPOINT`、`C2K_S3_REGION`、`C2K_S3_BUCKET`、`C2K_S3_ACCESS_KEY`、`C2K_S3_SECRET_KEY`。凭证仅由部署密钥系统注入，禁止写入仓库或命令参数。运维须预建私有桶、关闭公开访问，授予该桶 `candidates/` 前缀所需的读/条件写/删除权限；应用不创建桶、不修改ACL，也不生成公开或签名下载链接。内网生产端点应使用TLS。If-None-Match条件写入必须由兼容服务真实支持，否则不得用于正式存储。

已用独立MinIO实测私有桶匿名拒绝、原包读写、条件写入防覆盖和未提交键补偿删除；其他S3厂商、备份恢复、断电孤立对象治理未验收。数据库事务失败会补偿本次新键；强杀可能留下无数据库引用的孤立对象，不能直接按对象目录列举为有效候选。S3适配不代表发布、审核、共享或MCP已实现。固定校验器每JVM最多2个子进程（每个V8旧生代上限96MiB/10秒，非进程RSS硬限制），不排队；满额返回503，设备应沿用原请求ID稍后重试。

`pnpm test:platform` 的S3ObjectIT会启动并销毁无宿主卷的独立MinIO容器，默认固定官方镜像 `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z`；离线或注册表受限时可通过 `C2K_MINIO_TEST_IMAGE` 指定已可信缓存的兼容镜像。测试凭证随机且仅驻测试/容器内存，不复用业务容器。


## 私有候选导入

“候选知识”仅对有来源分析动作的成员显示，列表与下载仅本人且仍持有全部来源当前逐项授权；管理员无越权例外。支持Skill1.0.2/契约2.0代码与资料包，五个目录直接置于ZIP根，最大8MiB。CLI：

```sh
node apps/runtime/dist/cli.js import-candidate --archive /path/knowledge.zip --bindings /path/bindings.json
```

绑定JSON为数组，每项含sourceId、revision、repository、commit；代码项须有bind-source许可；资料项另需kind=document、path，并有bind-documents许可，repository为document_id、commit为原资料SHA-256；全部声明须一致。网络失败沿用CLI输出的请求UUID，加`--request UUID`重试；同请求不同原包或来源拒绝。无需daemon，不访问模型/Git/通知配置。

候选保存原包和稳定摘要，不支持覆盖；原有审核标记只是导入声明，不证明平台核验过代码或业务。候选不是发布版本树，不能直接共享、检索或MCP调用；执行回传区别为EXECUTED，但仍未审核发布，真实模型语义须另行验收。每次源配置变更使旧授权失效，旧候选也不能仅凭新配置授权恢复。


## 多仓库与资料逆向执行

“运行管理→逆向任务”选择最多16项当前逐项授权来源、业务范围和本人设备；至少一个仓库，必须显式选择添加资料或仅代码。产品/业务域使用小写字母数字及单短横线分隔，别名在任务内唯一。Web不配置或接收模型端点、模型名与凭证。

运行时本人0600 JSON配置字段为`executable`（Claude绝对文件路径）、`version`（精确版本）、`endpoint`（企业内网Anthropic兼容HTTPS地址）、`model`、`secretFile`（专用key绝对路径）。不把key写入JSON或CLI参数；`configure-agent --file /absolute/private/profile.json`仅本机保存，不调用模型。现已检查Claude2.1.270参数支持，其他版本需要兼容验收。没有专用配置不领取任务，绝不回退个人Claude账号。

每个仓库`bind-source`；资料`bind-documents --id UUID --revision N --root /absolute/documents`，平台相对locator必须落在显式清单内；新增或替换资料文件须重新绑定。`unbind-documents --id UUID`只撤销许可，不删除资料。配置完成后`start`前台轮询。代码只读本地选定分支commit，不fetch/checkout/执行脚本；未提交修改不纳入。UTF8 md/txt/csv/json/yaml/xml/sql直接读取；PDF/DOCX/XLSX/PPTX需本机自行安装MarkItDown，并设置可选`converter`绝对可执行文件路径。真实Office/PDF转换未验收，不保证图片ERD/扫描件/复杂表格保真。

设备Bearer留父进程；执行器仅获得本次许可和专用模型key引用。Claude私有HOME、无工具/MCP/个人插件、最小环境；仅将已准备材料发送配置端点。此限制不等同OS沙箱或网络出口保证，私有部署需配合专用设备账号/容器和网络允许列表。模型前先检查完整来源清单128KiB预算，不截断来源；最终产物再次同预算检查。secretlint不等同完整DLP。

当前原料限额：每仓库512条目、单文本512KiB、全部原文和模型上下文各4MiB；最多128个仓库/文档指纹。超限失败，不默默截断。尚不支持大型仓库完整分析；按业务范围切片/分批调度、故障恢复另行推进。每设备容量1，续租10秒、租约45秒，最长20分钟；取消、失联、许可变化终止本次进程组，原料finally清理。断电/强杀残留尚无自动恢复清理器。

服务端独立校验全部来源与当前attempt，候选和SUCCEEDED同事务提交；结果为EXECUTED私有候选，审核pending，未发布。不保证业务知识语义正确，不宣称运行过仓库测试。自动化使用明确标记的合成CLI替身，真实企业模型需设备所有者在本机配置后手验。

## 候选审核维护边界

V10迁移新增`review.decide`动作；不会默认授给引导管理员。作者送审需`review.submit`、候选读取及来源分析权限；自审和指定人决定均须审核动作及全部来源当前授权。`/api/v1/reviews`仅本人提交/受派范围，指派阅读不授予原包下载；候选原接口仍仅所有者。

审核保存不可变候选摘要与revision，待审唯一、终态CAS、幂等及审计同事务；对象文本读取在事务外且返回前重新授权。确认不修改ZIP、包内条目状态或发布知识。正文仅纯文本展示。维护时运行`pnpm verify`、`C2K_MINIO_TEST_IMAGE=cooper-minio:local pnpm test:platform`及`pnpm test:platform-ui`，不得用模拟模型测试声称真实模型质量通过。

## 共享逆向内核维护

平台Runtime固定依赖npm `@code2knowledge/kernel@0.1.0`，不再包含同名workspace内核或生成源码副本。唯一源码及测试在Skill仓库packages/reverse-kernel。平台与Java隔离Node校验器只通过公开API调用；部署须携带Runtime的生产node_modules及其yaml依赖，不能仅复制dist。

升级时显式修改Runtime依赖版本并更新pnpm锁文件，运行pnpm verify、Java候选真实Node校验和双入口安装验收。产物契约仍为2.0，旧候选skillVersion 1.0.2保留兼容基线含义，不代表平台执行Skill向导。

```sh
node verification/kernel-entrypoints.mjs --skill-root <Skill源码目录>
pnpm verify
C2K_MINIO_TEST_IMAGE=cooper-minio:local pnpm test:platform
```

双入口检查打包实际安装的内核与Skill，在隔离目录安装并比较模板和报告；不调用个人模型或通知。内核新版本发布不会自动升级平台。
