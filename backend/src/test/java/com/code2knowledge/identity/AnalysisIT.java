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

/** 多来源逆向集成验收；真实数据库验证逐项资料授权、独立领取、取消、容量及候选原子结算，不调用真实模型。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class AnalysisIT {
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
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.60.0." + ADDRESS.incrementAndGet()); return request; }).param("username", username).param("password", "Test-Only-Password-2026"))
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
    /** @param admin 管理员 @param memberId 分析者 @return 已授权资料目录来源 @throws Exception 登记或授权失败 */
    private JsonNode documents(MockHttpSession admin, String memberId) throws Exception {
        Map<String, Object> input = input(system(admin)); input.put("kind", "DOCUMENT"); input.put("locator", "spec-" + id()); input.put("branch", "");
        JsonNode source = call(admin, post("/api/v1/sources"), input, 201); grant(admin, source.get("id").asText(), memberId, 0, true); return source;
    }
    /** @param sources 已授权来源 @param device 本人设备 @return 双仓库及资料显式输入 @throws Exception 随机UUID失败 */
    private Map<String, Object> analysis(List<JsonNode> sources, JsonNode device) throws Exception {
        List<Map<String, Object>> selected = new java.util.ArrayList<>(); String[] aliases = {"fixture-core", "fixture-pay", "design"};
        for (int index = 0; index < sources.size(); index++) selected.add(Map.of("sourceId", sources.get(index).get("id").asText(), "revision", 0, "alias", aliases[index]));
        Map<String, Object> value = new HashMap<>(); value.put("name", "多来源合成任务"); value.put("product", "fixture"); value.put("domain", "refund"); value.put("scope", "仅验证协议，不证明业务语义"); value.put("documentsChoice", "INCLUDE"); value.put("sources", selected); value.put("deviceId", device.get("id").asText()); value.put("requestId", id()); return value;
    }
    /** 明确资料选择、至少仓库、幂等输入和私有对象边界；管理员不自动具有资料分析权。 @throws Exception 接口失败 */
    @Test
    void explicitMultiSourceInputAndOwnership() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode code = source(admin, adminId()), second = source(admin, adminId()), docs = documents(admin, adminId()), device = device(admin);
        Map<String, Object> value = analysis(List.of(code, second, docs), device); JsonNode task = call(admin, post("/api/v1/analyses"), value, 201); String taskId = task.get("id").asText();
        assertEquals(3, task.get("sources").size()); assertFalse(task.has("leaseId")); assertFalse(task.toString().contains("endpoint"));
        assertEquals(taskId, call(admin, post("/api/v1/analyses"), value, 201).get("id").asText());
        Map<String, Object> changed = new HashMap<>(value); changed.put("scope", "不同范围"); call(admin, post("/api/v1/analyses"), changed, 409);
        changed = new HashMap<>(value); changed.put("product", "my_product"); call(admin, post("/api/v1/analyses"), changed, 400);
        changed = new HashMap<>(value); changed.put("domain", "trailing-"); call(admin, post("/api/v1/analyses"), changed, 400);
        changed = new HashMap<>(value); changed.remove("documentsChoice"); call(admin, post("/api/v1/analyses"), changed, 400);
        changed = new HashMap<>(value); changed.put("documentsChoice", "NONE"); call(admin, post("/api/v1/analyses"), changed, 400);
        changed = new HashMap<>(value); changed.put("sources", List.of(Map.of("sourceId", docs.get("id").asText(), "revision", 0, "alias", "design"))); call(admin, post("/api/v1/analyses"), changed, 400);
        MockHttpSession stranger = memberSession(member(tenant())); call(stranger, get("/api/v1/analyses/" + taskId), Map.of(), 404);
        grant(admin, docs.get("id").asText(), adminId(), 0, false); changed = new HashMap<>(value); changed.put("requestId", id()); call(admin, post("/api/v1/analyses"), changed, 404);
        assertFalse(runtime(device, "/runtime/v1/analyses/claim", Map.of("version", "1"), 200).get("available").asBoolean());
        assertEquals("FAILED", call(admin, get("/api/v1/analyses/" + taskId), Map.of(), 200).get("state").asText());
    }
    /** 两协议共享容量但隔离领取；任一资料撤权使续租终止，旧结果/旧尝试不能复活。 @throws Exception 请求失败 */
    @Test
    void separateProtocolAndAllSourceLeaseFencing() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode code = source(admin, adminId()), second = source(admin, adminId()), docs = documents(admin, adminId()), device = device(admin);
        JsonNode task = call(admin, post("/api/v1/analyses"), analysis(List.of(code, second, docs), device), 201); String taskId = task.get("id").asText();
        assertFalse(runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200).get("available").asBoolean());
        JsonNode lease = runtime(device, "/runtime/v1/analyses/claim", Map.of("version", "1"), 200); assertTrue(lease.get("available").asBoolean()); assertEquals(3, lease.get("sources").size());
        task(admin, code, device); assertFalse(runtime(device, "/runtime/v1/tasks/claim", Map.of("version", "1"), 200).get("available").asBoolean());
        runtime(device, "/runtime/v1/tasks/" + taskId + "/complete", report(lease), 400);
        assertEquals("RUNNING", call(admin, get("/api/v1/analyses/" + taskId), Map.of(), 200).get("state").asText());
        grant(admin, docs.get("id").asText(), adminId(), 0, false);
        assertFalse(runtime(device, "/runtime/v1/tasks/" + taskId + "/renew", report(lease), 200).get("valid").asBoolean());
        JsonNode failed = call(admin, get("/api/v1/analyses/" + taskId), Map.of(), 200); call(admin, post("/api/v1/analyses/" + taskId + "/retry"), Map.of("revision", failed.get("revision").asInt()), 409);
        grant(admin, docs.get("id").asText(), adminId(), 0, true);
        JsonNode retried = call(admin, post("/api/v1/analyses/" + taskId + "/retry"), Map.of("revision", failed.get("revision").asInt()), 200); assertEquals(2, retried.get("attemptNumber").asInt());
        assertFalse(runtime(device, "/runtime/v1/tasks/" + taskId + "/complete", report(lease), 200).get("valid").asBoolean());
        call(admin, post("/api/v1/analyses/" + taskId + "/cancel"), Map.of("revision", retried.get("revision").asInt()), 200);
        assertEquals("CANCELLED", call(admin, get("/api/v1/analyses/" + taskId), Map.of(), 200).get("state").asText());
    }
}
