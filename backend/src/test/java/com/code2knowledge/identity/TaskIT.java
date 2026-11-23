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

/** 临时PostgreSQL来源用例验收；验证任务幂等、私有所有权、租约、取消、手动重试与旧结果拒收，不联网或读取业务文件。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class TaskIT {
    /** 真实控制器、安全链和数据库调用。 */
    @Autowired private MockMvc mvc;
    /** 合成请求序列化。 */
    @Autowired private ObjectMapper json;
    /** 仅测试造数与断言SQL，不进入生产服务。 */
    @Autowired private JdbcTemplate database;
    /** 合成账户使用生产哈希。 */
    @Autowired private PasswordEncoder passwords;
    /** 各登录隔离限速来源，不与其他类共享配额。 */
    private static final AtomicInteger ADDRESS = new AtomicInteger();
    /** @return 新随机资源标识，不关联客户 @throws Exception 仅保留测试统一签名 */
    private String id() throws Exception { return UUID.randomUUID().toString(); }
    /** @param username 合成账户名 @return 独立会话 @throws Exception 登录或断言失败 */
    private MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.40.0." + ADDRESS.incrementAndGet()); return request; }).param("username", username).param("password", "Test-Only-Password-2026"))
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
    /** @param user 来源分析者 @param source 已授权来源 @param device 所有者设备 @return 新任务 @throws Exception 创建失败 */
    private JsonNode task(MockHttpSession user, JsonNode source, JsonNode device) throws Exception { return call(user, post("/api/v1/tasks"), Map.of("name", "合成预检", "sourceId", source.get("id").asText(), "sourceRevision", source.get("revision").asInt(), "deviceId", device.get("id").asText(), "requestId", id()), 201); }
    /** @param device 合成设备凭证 @param path 固定协议路径 @param input 设备请求 @param expected 预期状态 @return 设备响应JSON @throws Exception HTTP失败 */
    private JsonNode runtime(JsonNode device, String path, Object input, int expected) throws Exception {
        return json.readTree(mvc.perform(post(path).header("Authorization", "Bearer " + device.get("token").asText()).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    /** @param lease 已领取租约 @return 可变的成功元数据报告，不含正文 @throws Exception 生成测试标识失败 */
    private Map<String, Object> report(JsonNode lease) throws Exception {
        Map<String, Object> report = new HashMap<>(); report.put("attemptId", lease.get("attemptId").asText()); report.put("leaseId", lease.get("leaseId").asText()); report.put("fence", lease.get("fence").asInt()); report.put("outcome", "SUCCEEDED"); report.put("commitId", "a".repeat(40)); report.put("archiveSha256", "b".repeat(64)); report.put("fileCount", 1); report.put("archiveBytes", 10240); report.put("failureCode", ""); return report;
    }
    /** @return 当前引导管理员UUID @throws Exception 数据库读取失败 */
    private String adminId() throws Exception { return database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class); }
    /** 创建幂等与参数绑定，设备容量1，续租和同结果提交幂等，浏览器不泄漏租约。 @throws Exception 请求失败 */
    @Test
    void idempotentCreateLeaseAndResult() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode source = source(admin, adminId()), device = device(admin);
        Map<String, Object> input = Map.of("name", "合成幂等任务", "sourceId", source.get("id").asText(), "sourceRevision", 0, "deviceId", device.get("id").asText(), "requestId", id());
        JsonNode task = call(admin, post("/api/v1/tasks"), input, 201); String id = task.get("id").asText(); assertFalse(task.has("leaseId"));
        assertEquals(id, call(admin, post("/api/v1/tasks"), input, 201).get("id").asText());
        Map<String, Object> changed = new HashMap<>(input); changed.put("name", "其他任务"); call(admin, post("/api/v1/tasks"), changed, 409);
        JsonNode lease = runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200); assertTrue(lease.get("available").asBoolean());
        assertFalse(runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200).get("available").asBoolean());
        Map<String, Object> report = report(lease); assertTrue(runtime(device, "/runtime/v1/tasks/" + id + "/renew", report, 200).get("valid").asBoolean());
        assertTrue(runtime(device, "/runtime/v1/tasks/" + id + "/complete", report, 200).get("valid").asBoolean()); assertTrue(runtime(device, "/runtime/v1/tasks/" + id + "/complete", report, 200).get("valid").asBoolean());
        report.put("fileCount", 2); runtime(device, "/runtime/v1/tasks/" + id + "/complete", report, 409);
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event='task.completed' AND target_id=?", Integer.class, id));
        assertEquals("SUCCEEDED", call(admin, get("/api/v1/tasks/" + id), Map.of(), 200).get("state").asText());
    }
    /** 取消拒绝旧提交，重试增加尝试，不覆盖历史；过期不能续租或复活。 @throws Exception 请求失败 */
    @Test
    void cancellationRetryExpiryAndFencing() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode source = source(admin, adminId()), device = device(admin), task = task(admin, source, device); String id = task.get("id").asText();
        JsonNode lease = runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200); Map<String, Object> old = report(lease);
        call(admin, post("/api/v1/tasks/" + id + "/cancel"), Map.of("revision", 0), 200);
        assertFalse(runtime(device, "/runtime/v1/tasks/" + id + "/complete", old, 200).get("valid").asBoolean());
        call(admin, post("/api/v1/tasks/" + id + "/retry"), Map.of("revision", 0), 409);
        JsonNode retried = call(admin, post("/api/v1/tasks/" + id + "/retry"), Map.of("revision", 1), 200); assertEquals(2, retried.get("attemptNumber").asInt());
        JsonNode newLease = runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200); assertNotEquals(lease.get("attemptId").asText(), newLease.get("attemptId").asText());
        assertFalse(runtime(device, "/runtime/v1/tasks/" + id + "/complete", old, 200).get("valid").asBoolean());
        database.update("UPDATE c2k_task_attempt SET lease_until=clock_timestamp()-interval '1 second' WHERE id=?", newLease.get("attemptId").asText());
        assertFalse(runtime(device, "/runtime/v1/tasks/" + id + "/renew", report(newLease), 200).get("valid").asBoolean());
        assertEquals("EXPIRED", call(admin, get("/api/v1/tasks/" + id), Map.of(), 200).get("state").asText());
        JsonNode history = call(admin, get("/api/v1/tasks/" + id + "/attempts"), Map.of(), 200); assertEquals(2, history.size()); assertEquals("CANCELLED", history.get(1).get("state").asText());
    }
    /** 领取/续租/提交分别重查当前逐项授权，来源配置或角色变化均不能用旧检查票据绕过。 @throws Exception 请求失败 */
    @Test
    void sourceRevocationAndVersionAreEnforced() throws Exception {
        MockHttpSession admin = login("admin"); String adminId = adminId(); JsonNode source = source(admin, adminId), device = device(admin); String sourceId = source.get("id").asText();
        JsonNode task = task(admin, source, device); grant(admin, sourceId, adminId, 0, false);
        assertFalse(runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200).get("available").asBoolean()); assertEquals("FAILED", call(admin, get("/api/v1/tasks/" + task.get("id").asText()), Map.of(), 200).get("state").asText());
        grant(admin, sourceId, adminId, 0, true); call(admin, post("/api/v1/tasks/" + task.get("id").asText() + "/retry"), Map.of("revision", 0), 200);
        JsonNode lease = runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200); grant(admin, sourceId, adminId, 0, false);
        assertFalse(runtime(device, "/runtime/v1/tasks/" + task.get("id").asText() + "/complete", report(lease), 200).get("valid").asBoolean());
        grant(admin, sourceId, adminId, 0, true);
        database.update("UPDATE c2k_source SET revision=revision+1 WHERE id=?", sourceId);
        call(admin, post("/api/v1/tasks/" + task.get("id").asText() + "/retry"), Map.of("revision", 1), 409);
    }
    /** 他人设备和任务不可访问，Cookie不能冒充设备，设备Bearer不能冒充浏览器；无来源范围不能建任务。 @throws Exception 请求失败 */
    @Test
    void objectIdentityAndCsrfBoundaries() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode source = source(admin, adminId()), device = device(admin), task = task(admin, source, device); String memberId = member(tenant()); MockHttpSession member = memberSession(memberId);
        call(member, get("/api/v1/tasks/" + task.get("id").asText()), Map.of(), 404); call(member, post("/api/v1/tasks/" + task.get("id").asText() + "/cancel"), Map.of("revision", 0), 404);
        actions(admin, memberId, "source.analyze"); grant(admin, source.get("id").asText(), memberId, 0, true);
        call(member, post("/api/v1/tasks"), Map.of("name", "无权设备", "sourceId", source.get("id").asText(), "sourceRevision", 0, "deviceId", device.get("id").asText(), "requestId", id()), 404);
        mvc.perform(post("/runtime/v1/tasks/claim").session(admin).contentType("application/json").content("{\"version\":\"1\"}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/tasks").header("Authorization", "Bearer " + device.get("token").asText())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/tasks").session(admin).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        JsonNode otherDevice = device(member); assertFalse(runtime(otherDevice, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200).get("available").asBoolean());
        runtime(otherDevice, "/runtime/v1/tasks/" + task.get("id").asText() + "/renew", Map.of(), 404);
    }
    /** 两个同时领取只产生一个租约；线程池限时回收，不能重复占用设备容量。 @throws Exception 并发或请求失败 */
    @Test
    void concurrentClaimsHaveSingleWinner() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode source = source(admin, adminId()), device = device(admin); task(admin, source, device); task(admin, source, device);
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch start = new CountDownLatch(1);
        try {
            Future<JsonNode> first = pool.submit(() -> { start.await(5, TimeUnit.SECONDS); return runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200); });
            Future<JsonNode> second = pool.submit(() -> { start.await(5, TimeUnit.SECONDS); return runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200); });
            start.countDown(); int winners = (first.get(10, TimeUnit.SECONDS).get("available").asBoolean() ? 1 : 0) + (second.get(10, TimeUnit.SECONDS).get("available").asBoolean() ? 1 : 0); assertEquals(1, winners);
        } finally { start.countDown(); pool.shutdownNow(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS)); }
    }
}
