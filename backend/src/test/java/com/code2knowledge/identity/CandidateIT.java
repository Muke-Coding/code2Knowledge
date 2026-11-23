package com.code2knowledge.identity;

import com.code2knowledge.platform.config.PlatformApplication;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.util.List;
import java.util.HashMap;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 临时PostgreSQL候选导入验收；真实运行固定Skill纯校验器，验证原包、权限与不可变幂等，不调用模型或客户仓库。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class CandidateIT {
    /** 真实控制器、安全链和数据库调用。 */
    @Autowired private MockMvc mvc;
    /** 合成请求序列化。 */
    @Autowired private ObjectMapper json;
    /** 仅测试造数与断言SQL，不进入生产服务。 */
    @Autowired private JdbcTemplate database;
    /** 合成账户使用生产哈希。 */
    @Autowired private PasswordEncoder passwords;
    /** 用有界闸门暂停真实校验以验证企业锁未跨IO持有。 */
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    private com.code2knowledge.candidate.service.SkillValidationService validator;
    /** 本地对象IO仍真实读写，仅用闸门控制竞态时间。 */
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    private com.code2knowledge.candidate.service.CandidateObjectService objectStore;
    /** 各登录隔离限速来源，不与其他类共享配额。 */
    private static final AtomicInteger ADDRESS = new AtomicInteger();
    /** @return 新随机资源标识，不关联客户 @throws Exception 仅保留测试统一签名 */
    private String id() throws Exception { return UUID.randomUUID().toString(); }
    /** @param username 合成账户名 @return 独立会话 @throws Exception 登录或断言失败 */
    private MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.50.0." + ADDRESS.incrementAndGet()); return request; }).param("username", username).param("password", "Test-Only-Password-2026"))
            .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /** @param session 可信会话 @param request HTTP操作 @param value 请求正文 @param expected 预期HTTP状态 @return JSON，空响应返回null节点 @throws Exception 状态或响应失败 */
    private JsonNode call(MockHttpSession session, MockHttpServletRequestBuilder request, Object value, int expected) throws Exception {
        String content = mvc.perform(request.session(session).with(csrf()).contentType("application/json").content(json.writeValueAsString(value))).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return content.isEmpty() ? json.nullNode() : json.readTree(content);
    }
    /** @param admin 管理员 @return 新系统UUID @throws Exception 创建失败 */
    private String system(MockHttpSession admin) throws Exception { return call(admin, post("/api/v1/systems"), Map.of("name", "合成来源系统-" + id()), 201).get("id").asText(); }
    /** @param systemId 所属系统 @return 明确分支、状态、绑定的可变合成输入 @throws Exception 生成标识失败 */
    private Map<String, Object> input(String systemId) throws Exception {
        Map<String, Object> input = new HashMap<>(); input.put("name", "合成来源-" + id()); input.put("kind", "REPOSITORY"); input.put("locator", "https://example.invalid/fixture/" + id() + ".git"); input.put("branch", "main"); input.put("enabled", true); input.put("systemIds", List.of(systemId)); return input;
    }
    /** @param admin 管理员 @param sourceId 来源 @param memberId 当前企业成员 @param revision 配置版本 @param allow 授予或撤销 @throws Exception 写入失败 */
    private void grant(MockHttpSession admin, String sourceId, String memberId, int revision, boolean allow) throws Exception { call(admin, put("/api/v1/sources/" + sourceId + "/grants/" + allow), Map.of("memberId", memberId, "revision", revision), 204); }
    /** @param tenant 企业 @return 新合成成员UUID @throws Exception 数据库造数失败 */
    private String member(String tenant) throws Exception {
        String id = id(); database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role) VALUES(?,?,?,?,?,'MEMBER')", id, tenant, "source" + id.replace("-", ""), "合成来源成员", passwords.encode("Test-Only-Password-2026")); return id;
    }
    /** @return 当前测试企业UUID @throws Exception 数据库失败 */
    private String tenant() throws Exception { return database.queryForObject("SELECT tenant_id FROM c2k_account WHERE username='admin'", String.class); }
    /** @param memberId 同企业成员 @return 独立会话 @throws Exception 登录失败 */
    private MockHttpSession memberSession(String memberId) throws Exception { return login(database.queryForObject("SELECT username FROM c2k_account WHERE id=?", String.class, memberId)); }
    /** @param admin 角色管理员 @param memberId 同企业成员 @param codes 允许的动作集合 @throws Exception 角色创建或分配失败 */
    private void actions(MockHttpSession admin, String memberId, String... codes) throws Exception {
        String roleId = call(admin, post("/api/v1/roles"), Map.of("name", "来源角色-" + id(), "permissions", TestPermissions.expand(codes)), 201).get("id").asText();
        call(admin, put("/api/v1/members/" + memberId + "/roles"), Map.of("roleIds", List.of(roleId), "revision", 0), 204);
    }
    /** @param user 已登录设备所有者 @return 合成设备凭证，仅本测试内存保存 @throws Exception 配对失败 */
    private JsonNode device(MockHttpSession user) throws Exception {
        String code = call(user, post("/api/v1/devices/pairings"), Map.of(), 201).get("code").asText();
        return json.readTree(mvc.perform(post("/runtime/v1/pair").contentType("application/json").content(json.writeValueAsString(Map.of("code", code, "name", "合成预检设备", "os", "test", "arch", "test", "version", "1")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    /** @param user 已有来源动作的成员 @param memberId 当前用户UUID @return 已逐项授权的仓库来源 @throws Exception 创建或授权失败 */
    private JsonNode source(MockHttpSession user, String memberId) throws Exception { JsonNode source = call(user, post("/api/v1/sources"), input(system(user)), 201); grant(user, source.get("id").asText(), memberId, 0, true); return source; }
    /** @return 当前引导管理员UUID @throws Exception 数据库读取失败 */
    private String adminId() throws Exception { return database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class); }
    /** 独立测试对象根；不会覆盖手动验收对象。 */
    private static final Path OBJECTS = temporaryObjects();
    /** @return 专属临时目录 @throws IllegalStateException 无法准备隔离目录 */
    private static Path temporaryObjects() { try { return Files.createTempDirectory("c2k-candidate-it-"); } catch (Exception error) { throw new IllegalStateException(error); } }
    /** 回收本类专属对象根，不触碰手动库和对象；测试失败仍由JUnit执行。 @throws Exception 文件占用或清理失败 */
    @org.junit.jupiter.api.AfterAll
    static void cleanupObjects() throws Exception { try (java.util.stream.Stream<Path> files = Files.walk(OBJECTS)) { for (Path path : files.sorted(java.util.Comparator.reverseOrder()).collect(java.util.stream.Collectors.toList())) Files.deleteIfExists(path); } }
    /** @param properties Spring测试配置；使用绝对路径避免Maven工作目录差异 */
    @DynamicPropertySource
    static void candidateConfiguration(DynamicPropertyRegistry properties) {
        properties.add("c2k.candidate.objects", () -> OBJECTS.toString());
        properties.add("c2k.candidate.validator", () -> Paths.get("../apps/runtime/dist/skill-inspect.js").toAbsolutePath().normalize().toString());
    }
    /** @param malformed 是否注入越界条目 @return 从公开合成fixture逐文件创建的原始ZIP @throws Exception 本地测试资源不可读 */
    private byte[] archive(boolean malformed) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(); Path root = Paths.get("../verification/fixtures/skill-2.0");
        try (ZipOutputStream zip = new ZipOutputStream(buffer); java.util.stream.Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(Files::isRegularFile).sorted().collect(java.util.stream.Collectors.toList())) { zip.putNextEntry(new ZipEntry(root.relativize(file).toString())); zip.write(Files.readAllBytes(file)); zip.closeEntry(); }
            if (malformed) { zip.putNextEntry(new ZipEntry("../outside.md")); zip.write(new byte[] { 65 }); zip.closeEntry(); }
        }
        return buffer.toByteArray();
    }
    /** @param source 授权来源 @return 固定合成Skill声明映射，不证明真实commit已核验 */
    private List<Map<String, Object>> binding(JsonNode source) { return List.of(Map.of("sourceId", source.get("id").asText(), "revision", 0, "repository", "fixture-core", "commit", "a".repeat(40))); }
    /** @param device 内存专用设备凭证 @param request 请求UUID @param bindings 显式来源 @param data 原始ZIP @param expected HTTP状态 @return 响应JSON @throws Exception 请求断言失败 */
    private JsonNode upload(JsonNode device, String request, Object bindings, byte[] data, int expected) throws Exception {
        String result = mvc.perform(multipart("/runtime/v1/candidates").file(new MockMultipartFile("archive", "knowledge.zip", "application/zip", data)).param("requestId", request).param("bindings", json.writeValueAsString(bindings)).header("Authorization", "Bearer " + device.get("token").asText()))
            .andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(); return result.isEmpty() ? json.nullNode() : json.readTree(result);
    }
    /** 原包可追溯、重复导入只写一次、不同原包拒绝；其他成员及管理员没有所有者例外。 @throws Exception 请求失败 */
    @Test
    void originalArchiveIdempotencyAndOwnerIsolation() throws Exception {
        MockHttpSession admin = login("admin"); String memberId = member(tenant()); actions(admin, memberId, "source.analyze"); MockHttpSession user = memberSession(memberId);
        JsonNode source = source(admin, memberId), device = device(user); byte[] data = archive(false); String request = id();
        JsonNode candidate = upload(device, request, binding(source), data, 201); String candidateId = candidate.get("id").asText();
        assertEquals("IMPORTED", candidate.get("mode").asText()); assertEquals(candidateId, upload(device, request, binding(source), data, 201).get("id").asText());
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event='candidate.imported' AND target_id=?", Integer.class, candidateId));
        JsonNode report = call(user, get("/api/v1/candidates/" + candidateId), Map.of(), 200); assertEquals(13, report.get("assets").size());
        assertArrayEquals(data, mvc.perform(get("/api/v1/candidates/" + candidateId + "/archive").session(user)).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn().getResponse().getContentAsByteArray());
        call(admin, get("/api/v1/candidates/" + candidateId), Map.of(), 404); call(admin, get("/api/v1/candidates/" + candidateId + "/archive"), Map.of(), 404);
        assertEquals(1, call(user, get("/api/v1/candidates"), Map.of(), 200).get("total").asInt());
        // ZIP注释改变原包而不改变资产契约，必须作为幂等冲突拒绝。
        byte[] changed = java.util.Arrays.copyOf(data, data.length + 1); changed[data.length - 2] = 1; changed[changed.length - 1] = 65;
        upload(device, request, binding(source), changed, 409);
    }
    /** 撤销和配置变化立即隐藏列表、清单、原包；旧设备不保留分析权限。 @throws Exception 请求失败 */
    @Test
    void revokeAndRevisionInvalidateEveryRead() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze"); MockHttpSession user = memberSession(owner);
        JsonNode source = source(admin, owner), device = device(user); String sourceId = source.get("id").asText(); byte[] data = archive(false);
        String candidate = upload(device, id(), binding(source), data, 201).get("id").asText(); grant(admin, sourceId, owner, 0, false);
        assertEquals(0, call(user, get("/api/v1/candidates"), Map.of(), 200).get("total").asInt());
        call(user, get("/api/v1/candidates/" + candidate), Map.of(), 404); call(user, get("/api/v1/candidates/" + candidate + "/archive"), Map.of(), 404); upload(device, id(), binding(source), data, 404);
        grant(admin, sourceId, owner, 0, true); database.update("UPDATE c2k_source SET revision=revision+1 WHERE id=?", sourceId);
        assertEquals(0, call(user, get("/api/v1/candidates"), Map.of(), 200).get("total").asInt()); call(user, get("/api/v1/candidates/" + candidate), Map.of(), 404);
        call(admin, put("/api/v1/members/" + owner + "/roles"), Map.of("roleIds", List.of(), "revision", 1), 204);
        call(user, get("/api/v1/candidates"), Map.of(), 403); upload(device, id(), binding(source), data, 403);
    }
    /** 非法ZIP、缺失来源、无设备身份不能落库；匿名无法读取，Cookie不能代替Bearer。 @throws Exception 请求失败 */
    @Test
    void invalidArchiveAndIdentityNeverPersist() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode source = source(admin, adminId()), device = device(admin); long count = database.queryForObject("SELECT count(*) FROM c2k_candidate", Long.class);
        upload(device, id(), binding(source), archive(true), 422); upload(device, id(), binding(source), new byte[] { 1, 2 }, 422);
        upload(device, id(), List.of(), archive(false), 400);
        List<Map<String, Object>> wrong = List.of(Map.of("sourceId", source.get("id").asText(), "revision", 0, "repository", "other-core", "commit", "a".repeat(40)));
        upload(device, id(), wrong, archive(false), 422);
        assertEquals(count, database.queryForObject("SELECT count(*) FROM c2k_candidate", Long.class));
        mvc.perform(get("/api/v1/candidates")).andExpect(status().isUnauthorized());
        mvc.perform(multipart("/runtime/v1/candidates").file(new MockMultipartFile("archive", archive(false))).param("requestId", id()).param("bindings", json.writeValueAsString(binding(source))).session(admin)).andExpect(status().isUnauthorized());
        database.update("UPDATE c2k_device SET revoked=true WHERE id=?", device.get("id").asText()); upload(device, id(), binding(source), archive(false), 401);
    }
    /** 校验、对象写入和对象下载暂停时仍可撤权，释放后不得提交或返回旧权限内容。 @throws Exception 并发请求或断言失败 */
    @Test
    void slowExternalIoDoesNotHoldEnterpriseLocks() throws Exception {
        for (String phase : List.of("validate", "put", "get")) {
            MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze"); MockHttpSession user = memberSession(owner);
            JsonNode source = source(admin, owner), device = device(user); String sourceId = source.get("id").asText(); byte[] data = archive(false);
            String candidateId = "get".equals(phase) ? upload(device, id(), binding(source), data, 201).get("id").asText() : null;
            CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1); ExecutorService pool = Executors.newFixedThreadPool(2);
            // 闸门仅控制真实IO时序，同时断言当前线程没有数据库事务；finally释放避免失败悬挂。
            org.mockito.stubbing.Answer<Object> pause = invocation -> { assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()); entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); return invocation.callRealMethod(); };
            if ("validate".equals(phase)) org.mockito.Mockito.doAnswer(pause).when(validator).validate(org.mockito.ArgumentMatchers.any(byte[].class));
            if ("put".equals(phase)) org.mockito.Mockito.doAnswer(pause).when(objectStore).put(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(byte[].class));
            if ("get".equals(phase)) org.mockito.Mockito.doAnswer(pause).when(objectStore).get(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
            try {
                Future<Integer> pending = pool.submit(() -> {
                    if (candidateId != null) return mvc.perform(get("/api/v1/candidates/" + candidateId + "/archive").session(user)).andReturn().getResponse().getStatus();
                    return mvc.perform(multipart("/runtime/v1/candidates").file(new MockMultipartFile("archive", "knowledge.zip", "application/zip", data)).param("requestId", UUID.randomUUID().toString()).param("bindings", json.writeValueAsString(binding(source))).header("Authorization", "Bearer " + device.get("token").asText())).andReturn().getResponse().getStatus();
                });
                assertTrue(entered.await(5, TimeUnit.SECONDS), "真实外部操作须进入闸门");
                Future<?> revoke = pool.submit(() -> { try { grant(admin, sourceId, owner, 0, false); } catch (Exception error) { throw new IllegalStateException(error); } });
                revoke.get(2, TimeUnit.SECONDS); release.countDown(); assertEquals(404, pending.get(10, TimeUnit.SECONDS));
                assertEquals(candidateId == null ? 0 : 1, database.queryForObject("SELECT count(*) FROM c2k_candidate WHERE owner_id=?", Integer.class, owner));
            } finally { release.countDown(); pool.shutdownNow(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS)); org.mockito.Mockito.reset(validator, objectStore); }
        }
    }

    /** @param device 专用设备 @param receipt 当前租约 @param bindings 全来源 @param data 合成原包 @param expected 预期HTTP状态 @return 安全响应JSON @throws Exception 断言失败 */
    private JsonNode completeAnalysis(JsonNode device, Object receipt, Object bindings, byte[] data, int expected) throws Exception {
        String result = mvc.perform(multipart("/runtime/v1/analyses/complete").file(new MockMultipartFile("archive", "knowledge.zip", "application/zip", data)).param("receipt", json.writeValueAsString(receipt)).param("bindings", json.writeValueAsString(bindings)).header("Authorization", "Bearer " + device.get("token").asText())).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString(); return result.isEmpty() ? json.nullNode() : json.readTree(result);
    }
    /** @param documentPath 本次资料相对路径 @return 全部业务资产一致声明双仓库与资料；不模拟真实模型推理 @throws Exception 本地打包失败 */
    private byte[] multiArchive(String documentPath) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(); Path root = Paths.get("../verification/fixtures/skill-2.0");
        try (ZipOutputStream zip = new ZipOutputStream(buffer); java.util.stream.Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(Files::isRegularFile).sorted().collect(java.util.stream.Collectors.toList())) {
                String path = root.relativize(file).toString(); String content = new String(Files.readAllBytes(file), java.nio.charset.StandardCharsets.UTF_8);
                if (path.startsWith("domains/") || path.startsWith("graph/") || path.startsWith("mappings/")) {
                    String indent = path.endsWith(".md") ? "  " : "    ";
                    content = content.replace(indent + "- fixture-core\n", indent + "- fixture-core\n" + indent + "- fixture-pay\n");
                    String extra = indent + "- kind: code\n" + indent + "  repository: fixture-pay\n" + indent + "  commit: " + "b".repeat(40) + "\n" + indent + "  worktree_status: clean\n" + indent + "- kind: document\n" + indent + "  document_id: design-sample\n" + indent + "  path: " + documentPath + "\n" + indent + "  sha256: " + "c".repeat(64) + "\n";
                    content = content.replace(indent + "  worktree_status: clean\n", indent + "  worktree_status: clean\n" + extra);
                }
                zip.putNextEntry(new ZipEntry(path)); zip.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8)); zip.closeEntry();
            }
        }
        return buffer.toByteArray();
    }
    /** 双仓库与资料同尝试候选/成功原子落库；重复接收幂等，旧协议及取消后拒收，任一资料撤权阻断读取。 @throws Exception 断言失败 */
    @Test
    void multiSourceExecutionAtomicCandidateAndRevocation() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode first = source(admin, adminId()), second = source(admin, adminId()), device = device(admin);
        Map<String, Object> documentInput = input(system(admin)); documentInput.put("kind", "DOCUMENT"); documentInput.put("branch", ""); String locator = "spec-" + id(); documentInput.put("locator", locator);
        JsonNode docs = call(admin, post("/api/v1/sources"), documentInput, 201); grant(admin, docs.get("id").asText(), adminId(), 0, true);
        List<Map<String, Object>> selected = List.of(Map.of("sourceId", first.get("id").asText(), "revision", 0, "alias", "fixture-core"), Map.of("sourceId", second.get("id").asText(), "revision", 0, "alias", "fixture-pay"), Map.of("sourceId", docs.get("id").asText(), "revision", 0, "alias", "design"));
        Map<String, Object> input = Map.of("name", "多来源执行候选", "product", "fixture", "domain", "refund", "scope", "合成退款协议验证", "documentsChoice", "INCLUDE", "sources", selected, "deviceId", device.get("id").asText(), "requestId", id());
        JsonNode task = call(admin, post("/api/v1/analyses"), input, 201); String taskId = task.get("id").asText();
        String leaseBody = mvc.perform(post("/runtime/v1/analyses/claim").header("Authorization", "Bearer " + device.get("token").asText()).contentType("application/json").content("{\"version\":\"1\"}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(); JsonNode lease = json.readTree(leaseBody);
        Map<String, Object> receipt = Map.of("taskId", taskId, "attemptId", lease.get("attemptId").asText(), "leaseId", lease.get("leaseId").asText(), "fence", lease.get("fence").asInt());
        String documentPath = locator + "/PRD.md"; List<Map<String, Object>> bindings = List.of(Map.of("sourceId", first.get("id").asText(), "revision", 0, "repository", "fixture-core", "commit", "a".repeat(40)), Map.of("sourceId", second.get("id").asText(), "revision", 0, "repository", "fixture-pay", "commit", "b".repeat(40)), Map.of("sourceId", docs.get("id").asText(), "revision", 0, "repository", "design-sample", "commit", "c".repeat(64), "kind", "document", "path", documentPath));
        byte[] data = multiArchive(documentPath); completeAnalysis(device, null, bindings, data, 400); completeAnalysis(device, receipt, bindings.subList(0, 2), data, 422);
        JsonNode candidate = completeAnalysis(device, receipt, bindings, data, 201); String candidateId = candidate.get("id").asText(); assertEquals("EXECUTED", candidate.get("mode").asText());
        assertEquals(candidateId, completeAnalysis(device, receipt, bindings, data, 201).get("id").asText());
        JsonNode finished = call(admin, get("/api/v1/analyses/" + taskId), Map.of(), 200); assertEquals("SUCCEEDED", finished.get("state").asText()); assertEquals(candidateId, finished.get("candidateId").asText());
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_candidate WHERE attempt_id=?", Integer.class, lease.get("attemptId").asText()));
        assertEquals("EXECUTED", call(admin, get("/api/v1/candidates/" + candidateId), Map.of(), 200).get("mode").asText());
        grant(admin, docs.get("id").asText(), adminId(), 0, false); call(admin, get("/api/v1/candidates/" + candidateId), Map.of(), 404); completeAnalysis(device, receipt, bindings, data, 404);
    }

    /** 自审不得绕过审核动作；相同请求幂等、终态只读、原包与条目待核验状态不变。 @throws Exception 真实接口或断言失败 */
    @Test
    void selfReviewRequiresExplicitPermissionAndPreservesOriginal() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze"); MockHttpSession user = memberSession(owner);
        JsonNode source = source(admin, owner); byte[] bytes = archive(false); String candidate = upload(device(user), id(), binding(source), bytes, 201).get("id").asText();

        // 原个人范围移除，改用显式部门授权，验证候选和自审查询共享同一当前来源门禁。
        String department=call(admin,post("/api/v1/departments"),Map.of("parentId","","name","候选部门"+id(),"sortOrder",0,"enabled",true,"revision",0),201).get("id").asText();
        call(admin,put("/api/v1/members/"+owner+"/department"),Map.of("departmentId",department,"revision",0),204);
        call(admin,put("/api/v1/department-grants/SOURCE/"+source.get("id").asText()+"/true"),Map.of("departmentId",department,"includeChildren",false,"sourceRevision",0,"revision",0),204);
        grant(admin,source.get("id").asText(),owner,0,false);
        call(user,get("/api/v1/candidates/"+candidate),Map.of(),200);
        call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", owner, "requestId", id()), 404);
        String role = call(admin, post("/api/v1/roles"), Map.of("name", "合成自审-" + id(), "permissions", TestPermissions.expand("source.analyze", "review.decide")), 201).get("id").asText();
        call(admin, put("/api/v1/members/" + owner + "/roles"), Map.of("roleIds", List.of(role), "revision", 1), 204);
        Map<String, Object> input = Map.of("candidateId", candidate, "reviewerId", owner, "requestId", id()); JsonNode review = call(user, post("/api/v1/reviews"), input, 201); String reviewId = review.get("id").asText();
        assertEquals("SELF", review.get("method").asText()); assertEquals("", review.get("decidedAt").asText()); assertEquals("合成来源成员", review.get("reviewerName").asText());
        assertEquals(reviewId, call(user, post("/api/v1/reviews"), input, 201).get("id").asText());
        call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", owner, "requestId", id()), 409);
        mvc.perform(post("/api/v1/reviews/" + reviewId + "/decide").session(user).contentType("application/json").content("{}" )).andExpect(status().isForbidden());
        call(user, post("/api/v1/reviews/" + reviewId + "/decide"), Map.of("revision", 0, "decision", "CONFIRMED", "comment", " "), 400);
        Map<String, Object> decision = Map.of("revision", 0, "decision", "CONFIRMED", "comment", "已核验合成退款流程，原包保持不变");
        JsonNode result = call(user, post("/api/v1/reviews/" + reviewId + "/decide"), decision, 200); assertEquals(1, result.get("revision").asInt()); assertFalse(result.get("decidedAt").asText().isEmpty());
        call(user, post("/api/v1/reviews/" + reviewId + "/decide"), decision, 200);
        call(user, post("/api/v1/reviews/" + reviewId + "/decide"), Map.of("revision", 0, "decision", "REJECTED", "comment", "不可覆盖"), 409);
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event='review.confirmed' AND target_id=?", Integer.class, reviewId));
        assertArrayEquals(bytes, mvc.perform(get("/api/v1/candidates/" + candidate + "/archive").session(user)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        JsonNode again = call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", owner, "requestId", id()), 201); assertNotEquals(reviewId, again.get("id").asText()); assertEquals(2, call(user, get("/api/v1/reviews"), Map.of(), 200).get("total").asInt());
        call(admin,put("/api/v1/department-grants/SOURCE/"+source.get("id").asText()+"/false"),Map.of("departmentId",department,"includeChildren",false,"sourceRevision",0,"revision",1),204);
        call(user,get("/api/v1/candidates/"+candidate),Map.of(),404); assertEquals(0,call(user,get("/api/v1/reviews"),Map.of(),200).get("total").asInt());
    }
    /** 指定人只通过审核范围读取内容，不获得原包/普通候选访问；来源撤权立即隐藏记录及正文。 @throws Exception 请求失败 */
    @Test
    void assignedReviewScopesContentAndRevocation() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()), reviewer = member(tenant()); actions(admin, owner, "source.analyze"); actions(admin, reviewer, "source.analyze", "review.decide"); MockHttpSession user = memberSession(owner), reader = memberSession(reviewer);
        JsonNode source = source(admin, owner); String sourceId = source.get("id").asText(); String candidate = upload(device(user), id(), binding(source), archive(false), 201).get("id").asText();
        call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", reviewer, "requestId", id()), 404);
        grant(admin, sourceId, reviewer, 0, true); JsonNode review = call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", reviewer, "requestId", id()), 201); String reviewId = review.get("id").asText(); assertEquals("ASSIGNED", review.get("method").asText());
        call(admin, get("/api/v1/reviews/" + reviewId), Map.of(), 404); call(reader, get("/api/v1/candidates/" + candidate), Map.of(), 404); call(reader, get("/api/v1/candidates/" + candidate + "/archive"), Map.of(), 404);
        JsonNode report = call(reader, get("/api/v1/reviews/" + reviewId + "/report"), Map.of(), 200); String path = report.get("assets").get(0).get("path").asText();
        JsonNode content = call(reader, get("/api/v1/reviews/" + reviewId + "/content").param("path", path), Map.of(), 200); assertEquals(path, content.get("path").asText()); assertEquals(report.get("assets").get(0).get("sha256"), content.get("sha256"));
        call(user, get("/api/v1/candidates/" + candidate + "/content").param("path", "../outside.md"), Map.of(), 404);
        grant(admin, sourceId, reviewer, 0, false); assertEquals(0, call(reader, get("/api/v1/reviews"), Map.of(), 200).get("total").asInt()); call(reader, get("/api/v1/reviews/" + reviewId + "/content").param("path", path), Map.of(), 404);
        call(reader, post("/api/v1/reviews/" + reviewId + "/decide"), Map.of("revision", 0, "decision", "REJECTED", "comment", "无权不可决定"), 404);
        grant(admin, sourceId, reviewer, 0, true); assertEquals("REJECTED", call(reader, post("/api/v1/reviews/" + reviewId + "/decide"), Map.of("revision", 0, "decision", "REJECTED", "comment", "证据不足，请补充"), 200).get("state").asText());
        call(admin, put("/api/v1/members/" + reviewer + "/roles"), Map.of("roleIds", List.of(), "revision", 1), 204); call(reader, get("/api/v1/reviews/" + reviewId), Map.of(), 403);
    }
    /** 同一在途版本相反决定并发仅成功一次，另一个冲突且只产生一次决定审计。 @throws Exception 并发失败 */
    @Test
    void reviewConcurrentDecisionsAreNotOverwritten() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze", "review.decide"); MockHttpSession user = memberSession(owner); JsonNode source = source(admin, owner);
        String candidate = upload(device(user), id(), binding(source), archive(false), 201).get("id").asText(); String review = call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", owner, "requestId", id()), 201).get("id").asText();
        ExecutorService workers = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Integer> first = workers.submit(() -> { start.await(); return mvc.perform(post("/api/v1/reviews/" + review + "/decide").session(user).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("revision", 0, "decision", "CONFIRMED", "comment", "确认依据")))).andReturn().getResponse().getStatus(); });
            Future<Integer> second = workers.submit(() -> { start.await(); return mvc.perform(post("/api/v1/reviews/" + review + "/decide").session(user).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("revision", 0, "decision", "REJECTED", "comment", "驳回依据")))).andReturn().getResponse().getStatus(); });
            start.countDown(); assertEquals(java.util.Set.of(200, 409), java.util.Set.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)));
            assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event IN ('review.confirmed','review.rejected') AND target_id=?", Integer.class, review));
        } finally { start.countDown(); workers.shutdownNow(); assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS)); }
    }
    /** 正文IO不持企业锁；在对象读取期间撤销来源后，IO结束不能把正文交给旧权限调用者。 @throws Exception 闸门、撤权或请求失败 */
    @Test
    void reviewTextReadRechecksPermissionAfterUnlockedIo() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze", "review.decide"); MockHttpSession user = memberSession(owner); JsonNode source = source(admin, owner);
        String candidate = upload(device(user), id(), binding(source), archive(false), 201).get("id").asText(); String review = call(user, post("/api/v1/reviews"), Map.of("candidateId", candidate, "reviewerId", owner, "requestId", id()), 201).get("id").asText();
        String path = call(user, get("/api/v1/reviews/" + review + "/report"), Map.of(), 200).get("assets").get(0).get("path").asText();
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1); ExecutorService workers = Executors.newFixedThreadPool(2);
        // 模拟存储慢读，保留生产IO并断言不存在跨IO数据库事务，finally总会释放线程。
        org.mockito.Mockito.doAnswer(invocation -> { assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()); entered.countDown(); assertTrue(release.await(10, TimeUnit.SECONDS)); return invocation.callRealMethod(); }).when(objectStore).get(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
        try {
            Future<Integer> response = workers.submit(() -> mvc.perform(get("/api/v1/reviews/" + review + "/content").param("path", path).session(user)).andReturn().getResponse().getStatus());
            assertTrue(entered.await(5, TimeUnit.SECONDS)); Future<?> revoke = workers.submit(() -> { try { grant(admin, source.get("id").asText(), owner, 0, false); } catch (Exception error) { throw new IllegalStateException(error); } });
            revoke.get(2, TimeUnit.SECONDS); release.countDown(); assertEquals(404, response.get(10, TimeUnit.SECONDS));
        } finally { release.countDown(); workers.shutdownNow(); assertTrue(workers.awaitTermination(5, TimeUnit.SECONDS)); org.mockito.Mockito.reset(objectStore); }
    }
    /** @param unicodeExtra true用Unicode path extra覆盖ASCII原名，false用标准CP437原名 @return 接收器支持的合成扩展原包 @throws Exception fixture读取或ZIP生成失败 */
    private byte[] encodedArchive(boolean unicodeExtra) throws Exception {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream(); Path root = Paths.get("../verification/fixtures/skill-2.0");
        try (ZipOutputStream zip = new ZipOutputStream(buffer, java.nio.charset.Charset.forName("Cp437")); java.util.stream.Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(Files::isRegularFile).sorted().collect(java.util.stream.Collectors.toList())) { zip.putNextEntry(new ZipEntry(root.relativize(file).toString())); zip.write(Files.readAllBytes(file)); zip.closeEntry(); }
            String name = unicodeExtra ? "domains/legacy.md" : "domains/café.md"; ZipEntry entry = new ZipEntry(name);
            if (unicodeExtra) {
                byte[] utf8 = "domains/退款.md".getBytes(java.nio.charset.StandardCharsets.UTF_8); java.util.zip.CRC32 crc = new java.util.zip.CRC32(); crc.update(name.getBytes(java.nio.charset.Charset.forName("Cp437")));
                java.nio.ByteBuffer extra = java.nio.ByteBuffer.allocate(9 + utf8.length).order(java.nio.ByteOrder.LITTLE_ENDIAN); extra.putShort((short) 0x7075); extra.putShort((short) (5 + utf8.length)); extra.put((byte) 1); extra.putInt((int) crc.getValue()); extra.put(utf8); entry.setExtra(extra.array());
            }
            zip.putNextEntry(entry); String text = Files.readString(root.resolve("domains/overview.md")).replace("K:fixture:refund:overview", "K:fixture:refund:encoded").replace("knowledge_type: overview", "knowledge_type: business_note"); zip.write(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)); zip.closeEntry();
        }
        return buffer.toByteArray();
    }
    /** 接收成功的CP437及Unicode扩展路径包，每个资产都可读；不能因一个非ASCII文件阻断其他资产。 @throws Exception 原包接收、读取或断言失败 */
    @Test
    void acceptedZipEncodingsAreReadableForEveryAsset() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze"); MockHttpSession user = memberSession(owner); JsonNode source = source(admin, owner), device = device(user);
        for (boolean unicode : new boolean[] { false, true }) {
            String candidate = upload(device, id(), binding(source), encodedArchive(unicode), 201).get("id").asText(); JsonNode report = call(user, get("/api/v1/candidates/" + candidate), Map.of(), 200); assertEquals(14, report.get("assets").size()); boolean found = false;
            for (JsonNode asset : report.get("assets")) { String path = asset.get("path").asText(); JsonNode content = call(user, get("/api/v1/candidates/" + candidate + "/content").param("path", path), Map.of(), 200); assertEquals(asset.get("sha256"), content.get("sha256")); if (path.equals(unicode ? "domains/退款.md" : "domains/café.md")) found = true; }
            assertTrue(found);
        }
    }
    /** 已有候选改为只读角色后，在线查看仍可用，ZIP下载、再次导入和提交审核独立拒绝。 @throws Exception HTTP断言失败 */
    @Test
    void candidateReadDoesNotGrantDownloadImportOrSubmission() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); actions(admin, owner, "source.analyze"); MockHttpSession user = memberSession(owner);
        JsonNode source = source(admin, owner), device = device(user); byte[] bytes = archive(false);
        String candidateId = upload(device, id(), binding(source), bytes, 201).get("id").asText();
        String roleId = call(admin, post("/api/v1/roles"), Map.of("name", "仅候选读取-" + id(), "permissions", List.of("source.read", "source.analyze", "candidate.read")), 201).get("id").asText();
        call(admin, put("/api/v1/members/" + owner + "/roles"), Map.of("roleIds", List.of(roleId), "revision", 1), 204);
        call(user, get("/api/v1/candidates/" + candidateId), Map.of(), 200);
        call(user, get("/api/v1/candidates/" + candidateId + "/archive"), Map.of(), 403);
        upload(device, id(), binding(source), bytes, 403);
        call(user, post("/api/v1/reviews"), Map.of("candidateId", candidateId, "reviewerId", owner, "requestId", id()), 403);
    }

}
