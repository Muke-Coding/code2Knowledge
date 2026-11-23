# Java 后端

JDK21 / Spring Boot3，默认回环18080。Java8常规语法、MyBatis XML、Flyway；注释与分层由 `mvn verify` 检查。

默认诊断模式无数据库，仅GET `/actuator/health`公开，其余接口拒绝。`platform` profile启用真实数据源、迁移、会话登录和目录管理，建议在仓库根用 `pnpm dev:platform` 启动，避免手动传凭证。

- `identity`：首次管理员引导、成员、密码编码、会话认证版本及CSRF。
- `authorization`：受保护内置基础角色、企业自定义角色、动作目录、多角色分配和乐观版本；企业非键更新锁串行化授权写入，STATEMENT一级缓存确保锁后重查身份。
- `catalog`：系统目录元数据与 `catalog.read` 授予/撤销。
- `source`：仓库/运行时资料定位、系统多对多绑定、逐项版本授权与分析资格；不读文件或Git，管理动作不绕过资源范围。
- `runtime`：所有者私有设备、一次性配对、设备令牌认证与心跳；事务按账户→配对/设备顺序加锁，凭证仅存摘要。
- `task`：本人来源预检任务、手动尝试、容量1领取、45秒租约/续租、取消与无正文清单；企业→账户→设备锁与当前来源授权重查，不执行模型。
- `common`：安全错误响应，不承载领域规则。
- `mapper/<领域>/*Mapper.xml`：全部业务查询与更新；写入和审计同服务事务。
- `db/migration`：只新增结构迁移，不修改已应用迁移。

```sh
mvn -f backend/pom.xml verify
pnpm test:platform
```

前者9项架构/诊断测试；后者创建真实临时PostgreSQL库并运行26项身份/设备/RBAC/来源/任务集成测试，无跳过。勿用无profile健康UP证明持久化或完整业务就绪。平台测试必须显式执行，CI已加入；单独默认Maven verify不含PlatformIT。

当前无OIDC、组、知识权限引擎、真实 Skill 逆向或MCP。管理目录元数据不代表内容阅读；无跨节点会话、MFA、生产TLS或持久化会话声明。
