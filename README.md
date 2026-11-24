# Code2Knowledge

面向企业私有化部署的代码业务知识逆向平台。通过独立设备运行时读取获准的仓库与资料，生成可追溯的业务知识、图谱和代码映射，回传平台进行版本化管理与审核。

## 当前能力

- 成员、部门、角色与细分动作权限，系统和来源资源授权。
- 私有设备配对、心跳、显式本机来源绑定及隔离预检。
- 多仓库与资料逆向、任务租约、取消、重试及候选回传。
- 候选知识查看、导入、自审或指定审核人审核。

真实内网模型的内容质量及Office/PDF转换仍待专项验收；知识发布、检索与MCP尚未实现。审核通过不会自动发布知识。

## 技术架构

| 部分 | 技术 |
|---|---|
| Web | React、TypeScript、Ant Design |
| 后端 | Java 21、Spring Boot 3、MyBatis XML、Flyway |
| 运行时 | TypeScript、Node.js 22、Claude Code CLI |
| 存储 | PostgreSQL；候选原包支持本地目录或S3兼容存储 |
| 共享内核 | 固定依赖 `@code2knowledge/kernel@0.1.0`，知识契约2.0 |

内核源码在[Skill仓库](https://github.com/Muke-Coding/code2knowledge-skill/tree/main/packages/reverse-kernel)维护。平台仅调用公开API，不执行Skill选择向导；模型配置与凭证仅保存在运行时。

## 本地启动

需要Docker、JDK 21、Maven 3.8.8+、Node.js 22.16+（22.x）及pnpm 10.28.2。

```sh
pnpm install --frozen-lockfile
pnpm dev:platform
```

打开 http://127.0.0.1:15173，登录名为 `admin`，首次随机密码保存在 `.local/admin-password`。重启不重置密码。可用 `C2K_JAVA_HOME` 指定JDK 21。

本地启动使用专属PostgreSQL容器 `c2k-platform-local-postgres`（端口16432），后端端口18080。Ctrl+C停止Java/Web，数据库和数据保留；不要删除数据卷或凭证文件来重置密码。此入口仅供回环开发，不是生产部署方案。

## 接入设备

在“设备管理”创建一次性配对码，再执行：

```sh
node apps/runtime/dist/cli.js connect --server http://127.0.0.1:15173 --name "我的设备"
node apps/runtime/dist/cli.js start
```

按提示输入配对码，不要将凭证写入命令参数。凭证默认保存在 `~/.code2knowledge/runtime`；可用 `C2K_RUNTIME_HOME` 隔离设备配置。其他命令见 `node apps/runtime/dist/cli.js --help`。

来源须逐项获准，并通过 `bind-source` / `bind-documents` 显式绑定本机路径。模型需在运行时单独配置；不会回退使用个人Claude账号。本机执行只读取选定分支的已提交版本，不自动fetch或切换分支。

## 验证

先停止占用测试端口的手动应用，并确保Docker与JDK 21可用：

```sh
pnpm verify
mvn -f backend/pom.xml verify
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:integration
pnpm test:platform
pnpm test:platform-ui
```

`pnpm verify`覆盖契约生成一致性、中文注释、构建、类型和单测。平台测试使用独立临时数据库；S3测试启动独立MinIO，可用 `C2K_MINIO_TEST_IMAGE` 指定可信兼容镜像。模拟Agent测试不代表真实模型质量验收。

## 维护边界

- 开发约定见 [AGENTS.md](AGENTS.md)。业务SQL放Mapper XML，数据库变更追加Flyway迁移，生成契约不手改。
- 内核升级须显式更新Runtime依赖与锁文件，回归Java隔离Node校验器；部署须包含Runtime生产依赖，不能只复制dist。
- 管理动作权限不自动授予知识或源码阅读权；来源授权与设备许可分别校验。
- 数据库与候选对象需配套备份；本地对象目录默认 `.local/candidate-objects`。生产须配置TLS、Secure Cookie、私有存储和密钥注入，相关部署能力仍需专项验收。
- 当前运行时实机验收范围为macOS ARM64；Linux尚未实机验收，Windows文件权限实现不支持。

平台整体许可证尚未确定；独立Skill与内核的MIT及历史许可声明保持不变。
