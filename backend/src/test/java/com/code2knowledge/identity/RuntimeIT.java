package com.code2knowledge.identity;

import com.code2knowledge.platform.config.PlatformApplication;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.Map;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 真实PostgreSQL私有设备验收；只用合成身份与短时码，覆盖重放、所有权和事务并发，不执行仓库代码。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class RuntimeIT {
    /** 合成功能请求独立直连地址，避免不同测试共享限速额度；限速本身另有专用测试。 */
    private static final java.util.concurrent.atomic.AtomicInteger ADDRESS = new java.util.concurrent.atomic.AtomicInteger();
    /** 真实HTTP安全和控制器入口。 */
    @Autowired private MockMvc mvc;
    /** 测试JSON解析，禁止记录配对码/设备凭证。 */
    @Autowired private ObjectMapper json;
    /** 仅测试建数与数据库时间模拟，不进入生产SQL实现。 */
    @Autowired private JdbcTemplate database;
    /**
     * 登录已引导管理员。
     * @return 已认证会话，不为空
     * @throws Exception HTTP断言失败时抛出
     */
    private MockHttpSession admin() throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).param("username", "admin").param("password", "Test-Only-Password-2026")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /**
     * 创建本次合成普通成员，不共享既有成员身份。
     * @param admin 有效管理员会话，不为空
     * @return 新普通成员会话，不为空
     * @throws Exception HTTP断言失败时抛出
     */
    private MockHttpSession member(MockHttpSession admin) throws Exception {
        String username = "r" + UUID.randomUUID().toString().replace("-", "");
        String memberId = json.readTree(mvc.perform(post("/api/v1/members").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("username", username, "displayName", "设备测试成员", "password", "Test-Only-Password-2026")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        String roleId = json.readTree(mvc.perform(post("/api/v1/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("name", "设备角色-" + username, "permissions", java.util.List.of("device.read", "device.pair", "device.revoke"))))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(put("/api/v1/members/" + memberId + "/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("revision", 0, "roleIds", java.util.List.of(roleId))))).andExpect(status().isNoContent());
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).param("username", username).param("password", "Test-Only-Password-2026")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /** @param session 创建者会话，不为空 @return 配对原码，仅测试内使用 @throws Exception 请求断言失败时抛出 */
    private String code(MockHttpSession session) throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/devices/pairings").session(session).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("code").asText();
    }
    /** @param code 合成配对原码，不为空 @return 兑换JSON，不记录 @throws Exception 序列化失败时抛出 */
    private String payload(String code) throws Exception { return json.writeValueAsString(Map.of("code", code, "name", "合成设备", "os", "darwin", "arch", "arm64", "version", "1")); }
    /**
     * 证明浏览器会话不能替代设备Bearer，配对单次/心跳真实更新/过期撤销均生效；摘要不回传。
     * @throws Exception HTTP或数据库断言失败时抛出
     */
    @Test
    void pairingHeartbeatRevocationAndCredentialBoundary() throws Exception {
        MockHttpSession session = admin();
        mvc.perform(post("/api/v1/devices/pairings").session(session)).andExpect(status().isForbidden());
        mvc.perform(post("/runtime/v1/heartbeat").session(session)).andExpect(status().isUnauthorized());
        String body = payload(code(session));
        String result = mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(body)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = json.readTree(result).get("id").asText(); String token = json.readTree(result).get("token").asText();
        String digest = database.queryForObject("SELECT token_hash FROM c2k_device WHERE id = ?", String.class, id);
        assertNotEquals(token, digest); assertEquals(64, digest.length());
        mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(body)).andExpect(status().isUnauthorized());
        mvc.perform(post("/runtime/v1/heartbeat").header("Authorization", "Bearer " + token)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id));
        mvc.perform(get("/api/v1/devices").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        String list = mvc.perform(get("/api/v1/devices").session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertFalse(list.contains(token)); assertFalse(list.contains(digest)); assertFalse(list.contains("token"));
        database.update("UPDATE c2k_device SET last_seen = current_timestamp - interval '31 seconds' WHERE id = ?", id);
        String offline = mvc.perform(get("/api/v1/devices").session(session)).andReturn().getResponse().getContentAsString();
        assertTrue(offline.contains("OFFLINE"));
        mvc.perform(delete("/api/v1/devices/" + id).session(session).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(delete("/api/v1/devices/" + id).session(session).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(post("/runtime/v1/heartbeat").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event = 'runtime.revoked' AND target_id = ?", Integer.class, id));
    }
    /**
     * 同企业成员及管理员无法查看/撤销其他成员私有设备，跨企业目标同样404。
     * @throws Exception HTTP或建数失败时抛出
     */
    @Test
    void privateOwnershipAndCrossTenant() throws Exception {
        MockHttpSession admin = admin(); MockHttpSession owner = member(admin);
        String result = mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(payload(code(owner)))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = json.readTree(result).get("id").asText();
        String adminList = mvc.perform(get("/api/v1/devices").session(admin)).andReturn().getResponse().getContentAsString();
        assertFalse(adminList.contains(id));
        mvc.perform(delete("/api/v1/devices/" + id).session(admin).with(csrf())).andExpect(status().isNotFound());
        MockHttpSession other = member(admin);
        mvc.perform(get("/api/v1/devices").session(other)).andExpect(content().json("[]"));
        mvc.perform(delete("/api/v1/devices/" + id).session(other).with(csrf())).andExpect(status().isNotFound());
        String tenant = UUID.randomUUID().toString(); String account = UUID.randomUUID().toString(); String foreign = UUID.randomUUID().toString();
        database.update("INSERT INTO c2k_tenant(id,name) VALUES (?, '设备外企业')", tenant);
        database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role,enabled) VALUES (?,?,?,'外企业','unused','MEMBER',true)", account, tenant, account);
        database.update("INSERT INTO c2k_device(id,tenant_id,owner_id,owner_version,name,os,arch,version,token_hash,expires_at) VALUES (?,?,?,0,'外企业设备','linux','x64','1',?,current_timestamp+interval '1 day')", foreign, tenant, account, UUID.randomUUID().toString());
        mvc.perform(delete("/api/v1/devices/" + foreign).session(admin).with(csrf())).andExpect(status().isNotFound());
    }
    /**
     * 过期码、新码覆盖旧码、版本不支持、禁用再启用均不能恢复旧设备凭证。
     * @throws Exception HTTP或数据库断言失败时抛出
     */
    @Test
    void expiryReplacementVersionAndDisabledOwner() throws Exception {
        MockHttpSession admin = admin(); MockHttpSession member = member(admin);
        String old = code(member); String latest = code(member);
        mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(payload(old))).andExpect(status().isUnauthorized());
        mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(payload(latest).replace("\"version\":\"1\"", "\"version\":\"99\""))).andExpect(status().isConflict());
        String paired = mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(payload(latest))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String token = json.readTree(paired).get("token").asText();
        String id = json.readTree(mvc.perform(get("/api/v1/auth/session").session(member)).andReturn().getResponse().getContentAsString()).get("id").asText();
        String pending = code(member);
        mvc.perform(patch("/api/v1/members/" + id + "/status").session(admin).with(csrf()).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isNoContent());
        mvc.perform(post("/runtime/v1/heartbeat").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/members/" + id + "/status").session(admin).with(csrf()).contentType("application/json").content("{\"enabled\":true}")).andExpect(status().isNoContent());
        mvc.perform(post("/runtime/v1/heartbeat").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(payload(pending))).andExpect(status().isUnauthorized());
        String expired = code(admin);
        database.update("UPDATE c2k_pairing SET expires_at = current_timestamp - interval '1 second' WHERE consumed = false");
        mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(payload(expired))).andExpect(status().isUnauthorized());
    }
    /**
     * 同一码的两个同时兑换只成功一次，另一个401；线程池结束释放，不以串行重放冒充并发。
     * @throws Exception 并发执行或断言失败时抛出
     */
    @Test
    void concurrentRedemptionCreatesOneDevice() throws Exception {
        String body = payload(code(admin()));
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2); CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) results.add(pool.submit(() -> { ready.countDown(); go.await(); return mvc.perform(post("/runtime/v1/pair").with(request -> { request.setRemoteAddr("10.95.0." + ADDRESS.incrementAndGet()); return request; }).contentType("application/json").content(body)).andReturn().getResponse().getStatus(); }));
            assertTrue(ready.await(3, TimeUnit.SECONDS)); go.countDown();
            List<Integer> statuses = new ArrayList<>(); for (Future<Integer> result : results) statuses.add(result.get(10, TimeUnit.SECONDS));
            assertTrue(statuses.contains(201)); assertTrue(statuses.contains(401));
        } finally { go.countDown(); pool.shutdownNow(); }
    }
}
