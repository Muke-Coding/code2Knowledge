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

/** 临时PostgreSQL来源用例验收；验证动作与逐项范围分离、版本失效、隔离、幂等、分页和并发，不联网或读取业务文件。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class SourceIT {
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
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.30.0." + ADDRESS.incrementAndGet()); return request; }).param("username", username).param("password", "Test-Only-Password-2026"))
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
    /** 管理资格不继承分析范围；显式自授权、幂等审计和撤销在同一旧会话生效。 @throws Exception 请求失败 */
    @Test
    void explicitAdminScopeAndImmediateRevoke() throws Exception {
        MockHttpSession admin = login("admin"); String system = system(admin); Map<String, Object> input = input(system);
        JsonNode source = call(admin, post("/api/v1/sources"), input, 201); String sourceId = source.get("id").asText();
        assertFalse(source.get("canAnalyze").asBoolean());
        call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 404);
        String adminId = database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class);
        grant(admin, sourceId, adminId, 0, true); grant(admin, sourceId, adminId, 0, true);
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event='source.granted' AND target_id=?", Integer.class, sourceId));
        assertTrue(call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 200).get("allowed").asBoolean());
        grant(admin, sourceId, adminId, 0, false); grant(admin, sourceId, adminId, 0, false);
        call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 404);
        mvc.perform(get("/api/v1/sources")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/sources").session(admin).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().isForbidden());
    }
    /** 目录授权、管理动作、分析动作和逐项范围不互相替代；普通分析者不能查看系统绑定或其他成员ACL。 @throws Exception 请求失败 */
    @Test
    void actionAndScopeAreIndependent() throws Exception {
        MockHttpSession admin = login("admin"); String system = system(admin); String memberId = member(tenant()); MockHttpSession member = memberSession(memberId);
        String sourceId = call(admin, post("/api/v1/sources"), input(system), 201).get("id").asText();
        call(admin, post("/api/v1/systems/" + system + "/grants"), Map.of("memberId", memberId), 204);
        call(member, get("/api/v1/sources"), Map.of(), 403); grant(admin, sourceId, memberId, 0, true);
        call(member, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 403);
        actions(admin, memberId, "source.analyze");
        assertTrue(call(member, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 200).get("allowed").asBoolean());
        call(member, get("/api/v1/sources/" + sourceId + "/bindings"), Map.of(), 403);
        call(member, get("/api/v1/sources/" + sourceId + "/grants"), Map.of(), 403);
        grant(admin, sourceId, memberId, 0, false); assertEquals(0, call(member, get("/api/v1/sources"), Map.of(), 200).get("total").asInt());
        call(member, get("/api/v1/sources/" + sourceId), Map.of(), 404);
        String managerId = member(tenant()); actions(admin, managerId, "source.manage"); MockHttpSession manager = memberSession(managerId);
        assertEquals(1, call(manager, get("/api/v1/sources?keyword=" + sourceId), Map.of(), 200).get("page").asInt());
        grant(admin, sourceId, managerId, 0, true); call(manager, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 403);
    }
    /** 配置无变化不增版本；修改分支、停用和恢复均使旧范围失效，不复活旧授权，旧版本写入拒绝。 @throws Exception 请求失败 */
    @Test
    void configurationVersionsNeverReviveGrants() throws Exception {
        MockHttpSession admin = login("admin"); Map<String, Object> input = input(system(admin)); String sourceId = call(admin, post("/api/v1/sources"), input, 201).get("id").asText();
        String adminId = database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class);
        grant(admin, sourceId, adminId, 0, true); input.put("revision", 0);
        assertEquals(0, call(admin, put("/api/v1/sources/" + sourceId), input, 200).get("revision").asInt());
        input.put("branch", "release/2026"); assertEquals(1, call(admin, put("/api/v1/sources/" + sourceId), input, 200).get("revision").asInt());
        call(admin, put("/api/v1/sources/" + sourceId), input, 409);
        call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 1), 404);
        grant(admin, sourceId, adminId, 1, true); call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of(), 400);
        call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 409);
        input.put("revision", 1); input.put("enabled", false); call(admin, put("/api/v1/sources/" + sourceId), input, 200);
        input.put("revision", 2); input.put("enabled", true); call(admin, put("/api/v1/sources/" + sourceId), input, 200);
        call(admin, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 3), 404);
    }
    /** 企业隔离、无凭证定位、显式字段与资料相对路径校验，不探测网络或文件。 @throws Exception 请求失败 */
    @Test
    void isolationAndSafeRegistrationValidation() throws Exception {
        MockHttpSession admin = login("admin"); Map<String, Object> input = input(system(admin));
        for (String invalid : List.of("https://user:synthetic@example.invalid/repo", "https://example.invalid/repo?token=synthetic", "file:///tmp/repo", "https://example.invalid/a/../b")) {
            input.put("locator", invalid); JsonNode error = call(admin, post("/api/v1/sources"), input, 400); assertFalse(error.toString().contains("synthetic"));
        }
        input.put("locator", "git@example.invalid:fixture/repo.git"); input.remove("branch"); call(admin, post("/api/v1/sources"), input, 400);
        input.put("branch", "main"); input.remove("enabled"); call(admin, post("/api/v1/sources"), input, 400); input.put("enabled", true);
        String foreignTenant = id(), foreignSystem = id(); database.update("INSERT INTO c2k_tenant(id,name) VALUES(?,?)", foreignTenant, "合成隔离企业");
        database.update("INSERT INTO c2k_system(id,tenant_id,name) VALUES(?,?,?)", foreignSystem, foreignTenant, "合成隔离系统");
        String foreignMember = member(foreignTenant); input.put("systemIds", List.of(foreignSystem)); call(admin, post("/api/v1/sources"), input, 404);
        input.put("systemIds", List.of(system(admin))); input.put("kind", "DOCUMENT"); input.put("branch", "");
        for (String invalid : List.of("/private/file.md", "../file.md", "docs/%2e%2e/file", "docs//file", "C:\\file.md")) { input.put("locator", invalid); call(admin, post("/api/v1/sources"), input, 400); }
        input.put("locator", "采购资料/流程 ERD.md"); JsonNode source = call(admin, post("/api/v1/sources"), input, 201); String sourceId = source.get("id").asText(); assertEquals("", source.get("branch").asText());
        call(admin, post("/api/v1/sources"), input, 409);
        call(admin, put("/api/v1/sources/" + sourceId + "/grants/true"), Map.of("memberId", foreignMember, "revision", 0), 404);
        call(memberSession(foreignMember), get("/api/v1/sources/" + sourceId), Map.of(), 403);
        input.put("revision", 0); input.put("kind", "REPOSITORY"); input.put("locator", "https://example.invalid/repo"); input.put("branch", "main"); call(admin, put("/api/v1/sources/" + sourceId), input, 409);
    }
    /** 授权过滤在SQL分页前发生；仅计数可见来源，不将未授权数量或隐藏绑定带回浏览器。 @throws Exception 请求失败 */
    @Test
    void authorizedPaginationAndKeyword() throws Exception {
        MockHttpSession admin = login("admin"); String system = system(admin), memberId = member(tenant()); actions(admin, memberId, "source.analyze"); MockHttpSession member = memberSession(memberId);
        String prefix = "分页" + id();
        for (int index = 0; index < 24; index++) { Map<String, Object> input = input(system); input.put("name", prefix + index); String source = call(admin, post("/api/v1/sources"), input, 201).get("id").asText(); if (index < 21) grant(admin, source, memberId, 0, true); }
        JsonNode first = call(member, get("/api/v1/sources").param("keyword", prefix), Map.of(), 200); assertEquals(21, first.get("total").asInt()); assertEquals(20, first.get("items").size()); assertFalse(first.toString().contains("systemIds"));
        JsonNode second = call(member, get("/api/v1/sources").param("keyword", prefix).param("page", "2"), Map.of(), 200); assertEquals(1, second.get("items").size());
        assertEquals(24, call(admin, get("/api/v1/sources").param("keyword", prefix), Map.of(), 200).get("total").asInt());
        call(member, get("/api/v1/sources?page=0"), Map.of(), 400);
    }
    /** 两个编辑者用同一配置版本并发提交，仅一个成功；线程池限时回收，不遗留测试线程。 @throws Exception 请求或并发等待失败 */
    @Test
    void concurrentUpdatesHaveOneWinner() throws Exception {
        MockHttpSession admin = login("admin"); Map<String, Object> input = input(system(admin)); String sourceId = call(admin, post("/api/v1/sources"), input, 201).get("id").asText(); input.put("revision", 0);
        Map<String, Object> other = new HashMap<>(input); input.put("branch", "release/a"); other.put("branch", "release/b");
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try {
            Future<Integer> first = pool.submit(() -> { ready.countDown(); start.await(5, TimeUnit.SECONDS); return mvc.perform(put("/api/v1/sources/" + sourceId).session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(input))).andReturn().getResponse().getStatus(); });
            Future<Integer> second = pool.submit(() -> { ready.countDown(); start.await(5, TimeUnit.SECONDS); return mvc.perform(put("/api/v1/sources/" + sourceId).session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(other))).andReturn().getResponse().getStatus(); });
            assertTrue(ready.await(5, TimeUnit.SECONDS)); start.countDown(); List<Integer> statuses = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)); assertTrue(statuses.contains(200)); assertTrue(statuses.contains(409));
        } finally { start.countDown(); pool.shutdownNow(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS)); }
    }
    /** 来源读取和启停不附送分析、定位编辑或授权；状态更新保留定位并使旧授权失效。 @throws Exception HTTP断言失败 */
    @Test
    void granularStatusAndReadAreIndependent() throws Exception {
        MockHttpSession admin = login("admin"); String owner = member(tenant()); MockHttpSession user = memberSession(owner);
        Map<String, Object> input = input(system(admin)); JsonNode source = call(admin, post("/api/v1/sources"), input, 201); String sourceId = source.get("id").asText();
        actions(admin, owner, "source.read", "source.read.all", "source.status");
        assertFalse(call(user, get("/api/v1/sources/" + sourceId), Map.of(), 200).get("canAnalyze").asBoolean());
        call(user, post("/api/v1/sources/" + sourceId + "/analysis-check"), Map.of("revision", 0), 403);
        input.put("revision", 0); call(user, put("/api/v1/sources/" + sourceId), input, 403);
        call(user, put("/api/v1/sources/" + sourceId + "/grants/true"), Map.of("memberId", owner, "revision", 0), 403);
        JsonNode disabled = call(user, put("/api/v1/sources/" + sourceId + "/status"), Map.of("enabled", false, "revision", 0), 200);
        assertFalse(disabled.get("enabled").asBoolean()); assertEquals(source.get("locator"), disabled.get("locator")); assertEquals(1, disabled.get("revision").asInt());
        call(user, put("/api/v1/sources/" + sourceId + "/status"), Map.of("enabled", true, "revision", 0), 409);
    }

}
