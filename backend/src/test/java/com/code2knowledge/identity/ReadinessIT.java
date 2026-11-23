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

/** 建议性诊断集成验收；真实数据库、安全链和并发领取，不调用模型或读取本机配置。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class ReadinessIT {
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
    /**
     * @return 新随机资源标识，不关联客户
     * @throws Exception 仅保留测试统一签名 */
    private String id() throws Exception { return UUID.randomUUID().toString(); }
    /**
     * @param username 合成账户名
     * @return 独立会话
     * @throws Exception 登录或断言失败 */
    private MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.73.0." + ADDRESS.incrementAndGet()); return request; }).param("username", username).param("password", "Test-Only-Password-2026"))
            .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /**
     * @param session 可信会话
     * @param request HTTP操作
     * @param value 请求正文
     * @param expected 预期HTTP状态
     * @return JSON，空响应返回null节点
     * @throws Exception 状态或响应失败 */
    private JsonNode call(MockHttpSession session, MockHttpServletRequestBuilder request, Object value, int expected) throws Exception {
        String content = mvc.perform(request.session(session).with(csrf()).contentType("application/json").content(json.writeValueAsString(value))).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString();
        return content.isEmpty() ? json.nullNode() : json.readTree(content);
    }
    /**
     * @param admin 管理员
     * @return 新系统UUID
     * @throws Exception 创建失败 */
    private String system(MockHttpSession admin) throws Exception { return call(admin, post("/api/v1/systems"), Map.of("name", "合成来源系统-" + id()), 201).get("id").asText(); }
    /**
     * @param systemId 所属系统
     * @return 明确分支、状态、绑定的可变合成输入
     * @throws Exception 生成标识失败 */
    private Map<String, Object> input(String systemId) throws Exception {
        Map<String, Object> input = new HashMap<>(); input.put("name", "合成来源-" + id()); input.put("kind", "REPOSITORY"); input.put("locator", "https://example.invalid/fixture/" + id() + ".git"); input.put("branch", "main"); input.put("enabled", true); input.put("systemIds", List.of(systemId)); return input;
    }
    /**
     * @param admin 管理员
     * @param sourceId 来源
     * @param memberId 当前企业成员
     * @param revision 配置版本
     * @param allow 授予或撤销
     * @throws Exception 写入失败 */
    private void grant(MockHttpSession admin, String sourceId, String memberId, int revision, boolean allow) throws Exception { call(admin, put("/api/v1/sources/" + sourceId + "/grants/" + allow), Map.of("memberId", memberId, "revision", revision), 204); }
    /**
     * @param tenant 企业
     * @return 新合成成员UUID
     * @throws Exception 数据库造数失败 */
    private String member(String tenant) throws Exception {
        String id = id(); database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role) VALUES(?,?,?,?,?,'MEMBER')", id, tenant, "source" + id.replace("-", ""), "合成来源成员", passwords.encode("Test-Only-Password-2026")); return id;
    }
    /**
     * @return 当前测试企业UUID
     * @throws Exception 数据库失败 */
    private String tenant() throws Exception { return database.queryForObject("SELECT tenant_id FROM c2k_account WHERE username='admin'", String.class); }
    /**
     * @param memberId 同企业成员
     * @return 独立会话
     * @throws Exception 登录失败 */
    private MockHttpSession memberSession(String memberId) throws Exception { return login(database.queryForObject("SELECT username FROM c2k_account WHERE id=?", String.class, memberId)); }
    /**
     * @param admin 角色管理员
     * @param memberId 同企业成员
     * @param codes 允许的动作集合
     * @throws Exception 角色创建或分配失败 */
    private void actions(MockHttpSession admin, String memberId, String... codes) throws Exception {
        String roleId = call(admin, post("/api/v1/roles"), Map.of("name", "来源角色-" + id(), "permissions", TestPermissions.expand(codes)), 201).get("id").asText();
        call(admin, put("/api/v1/members/" + memberId + "/roles"), Map.of("roleIds", List.of(roleId), "revision", 0), 204);
    }
    /**
     * @param user 已登录设备所有者
     * @return 合成设备凭证，仅本测试内存保存
     * @throws Exception 配对失败 */
    private JsonNode device(MockHttpSession user) throws Exception {
        String code = call(user, post("/api/v1/devices/pairings"), Map.of(), 201).get("code").asText();
        return json.readTree(mvc.perform(post("/runtime/v1/pair").contentType("application/json").content(json.writeValueAsString(Map.of("code", code, "name", "合成预检设备", "os", "test", "arch", "test", "version", "1")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    /**
     * @param user 已有来源动作的成员
     * @param memberId 当前用户UUID
     * @return 已逐项授权的仓库来源
     * @throws Exception 创建或授权失败 */
    private JsonNode source(MockHttpSession user, String memberId) throws Exception { JsonNode source = call(user, post("/api/v1/sources"), input(system(user)), 201); grant(user, source.get("id").asText(), memberId, 0, true); return source; }
    /**
     * @param user 来源分析者
     * @param source 已授权来源
     * @param device 所有者设备
     * @return 新任务
     * @throws Exception 创建失败 */
    private JsonNode task(MockHttpSession user, JsonNode source, JsonNode device) throws Exception { return call(user, post("/api/v1/tasks"), Map.of("name", "合成预检", "sourceId", source.get("id").asText(), "sourceRevision", source.get("revision").asInt(), "deviceId", device.get("id").asText(), "requestId", id()), 201); }
    /**
     * @param device 合成设备凭证
     * @param path 固定协议路径
     * @param input 设备请求
     * @param expected 预期状态
     * @return 设备响应JSON
     * @throws Exception HTTP失败 */
    private JsonNode runtime(JsonNode device, String path, Object input, int expected) throws Exception {
        return json.readTree(mvc.perform(post(path).header("Authorization", "Bearer " + device.get("token").asText()).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    /**
     * @param source 当前来源
     * @param device 本人设备
     * @return 就绪检查输入，不含模型
     * @throws Exception 保留合成测试签名 */
    private Map<String, Object> request(JsonNode source, JsonNode device) throws Exception { return Map.of("deviceId", device.get("id").asText(), "documentsChoice", "NONE", "sources", List.of(Map.of("sourceId", source.get("id").asText(), "revision", source.get("revision").asInt(), "alias", "core"))); }
    /**
     * @return 六项固定结果，不含路径或日志 */
    private Map<String, Object> checks() { return Map.of("checks", java.util.Arrays.stream(new String[]{"NODE", "GIT", "SKILL", "AGENT", "CREDENTIAL", "MATERIALS"}).map(code -> Map.of("code", code, "status", "PASS")).toList()); }
    /**
     * @throws Exception 验证创建、CSRF、单次领取、固定回传和期限；失败不接受旧状态 */
    @Test
    void lifecycleAndExpiry() throws Exception {
        MockHttpSession admin = login("admin"); String owner = database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class);
        JsonNode source = source(admin, owner), device = device(admin); Map<String, Object> input = request(source, device);
        mvc.perform(post("/api/v1/readiness").session(admin).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().isForbidden());
        Map<String, Object> ungranted = input(system(admin)); JsonNode hidden = call(admin, post("/api/v1/sources"), ungranted, 201);
        call(admin, post("/api/v1/readiness"), request(hidden, device), 404);
        JsonNode result = call(admin, post("/api/v1/readiness"), input, 201); String id = result.get("id").asText();
        call(admin, post("/api/v1/readiness"), input, 409);
        assertEquals("CHECKING", runtime(device, "/runtime/v1/readiness/claim", Map.of(), 200).get("state").asText());
        assertEquals("", runtime(device, "/runtime/v1/readiness/claim", Map.of(), 200).get("id").asText());
        runtime(device, "/runtime/v1/readiness/" + id + "/complete", Map.of("checks", List.of(Map.of("code", "NODE", "status", "PASS"))), 400);
        JsonNode done = runtime(device, "/runtime/v1/readiness/" + id + "/complete", checks(), 200); assertEquals("COMPLETE", done.get("state").asText()); assertEquals(6, done.get("checks").size());
        runtime(device, "/runtime/v1/readiness/" + id + "/complete", checks(), 409);
        database.update("UPDATE c2k_runtime_readiness SET expires_at=clock_timestamp()-interval '1 second' WHERE id=?", id);
        JsonNode expired = call(admin, get("/api/v1/readiness/" + id), Map.of(), 200); assertEquals("EXPIRED", expired.get("state").asText()); assertEquals(0, expired.get("checks").size());
        call(admin, post("/api/v1/readiness"), input, 201);
    }
    /**
     * @throws Exception 验证无授权管理员、跨成员、跨设备、撤权与版本变化拒绝旧结果 */
    @Test
    void currentAuthorizationAndObjectIsolation() throws Exception {
        MockHttpSession admin = login("admin"); String owner = database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class);
        JsonNode source = source(admin, owner), device = device(admin), otherDevice = device(admin);
        JsonNode result = call(admin, post("/api/v1/readiness"), request(source, device), 201); String id = result.get("id").asText();
        runtime(otherDevice, "/runtime/v1/readiness/" + id + "/complete", checks(), 404);
        String member = member(tenant()); actions(admin, member, "analysis.create", "source.analyze"); MockHttpSession user = memberSession(member);
        call(user, get("/api/v1/readiness/" + id), Map.of(), 404); call(user, post("/api/v1/readiness"), request(source, device), 404);
        runtime(device, "/runtime/v1/readiness/claim", Map.of(), 200);
        grant(admin, source.get("id").asText(), owner, 0, false);
        call(admin, get("/api/v1/readiness/" + id), Map.of(), 404); runtime(device, "/runtime/v1/readiness/" + id + "/complete", checks(), 404);
        grant(admin, source.get("id").asText(), owner, 0, true);
        database.update("UPDATE c2k_source SET revision=revision+1 WHERE id=?", source.get("id").asText());
        grant(admin, source.get("id").asText(), owner, 1, true);
        call(admin, get("/api/v1/readiness/" + id), Map.of(), 409); runtime(device, "/runtime/v1/readiness/" + id + "/complete", checks(), 409);
    }
    /**
     * @throws Exception Java21虚拟线程仅用于模拟两个设备轮询竞争，finally关闭线程池，不泄漏线程 */
    @Test
    void concurrentClaimHasOneWinner() throws Exception {
        MockHttpSession admin = login("admin"); String owner = database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class);
        JsonNode source = source(admin, owner), device = device(admin); call(admin, post("/api/v1/readiness"), request(source, device), 201);
        ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor(); CountDownLatch gate = new CountDownLatch(1);
        try {
            java.util.concurrent.Callable<JsonNode> operation = () -> { gate.await(); return runtime(device, "/runtime/v1/readiness/claim", Map.of(), 200); };
            Future<JsonNode> first = executor.submit(operation), second = executor.submit(operation); gate.countDown();
            int winners = (first.get(10, TimeUnit.SECONDS).get("id").asText().isEmpty() ? 0 : 1) + (second.get(10, TimeUnit.SECONDS).get("id").asText().isEmpty() ? 0 : 1); assertEquals(1, winners);
        } finally { executor.shutdownNow(); }
    }
}
