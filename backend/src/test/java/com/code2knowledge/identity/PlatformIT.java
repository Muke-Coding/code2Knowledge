package com.code2knowledge.identity;

import com.code2knowledge.platform.config.PlatformApplication;
import com.code2knowledge.identity.security.LoginRateFilter;
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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 实际PostgreSQL身份/目录验收；专属测试库由外部脚本创建回收，不使用手动验收库。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class PlatformIT {
    /** 实际Spring安全与HTTP入口。 */
    @Autowired private MockMvc mvc;
    /** 测试JSON解析，不记录请求密码。 */
    @Autowired private ObjectMapper json;
    /** 仅测试造数和断言允许直接SQL，不作为生产实现示范。 */
    @Autowired private JdbcTemplate database;
    /** 测试外企业身份摘要使用与生产相同编码器。 */
    @Autowired private PasswordEncoder encoder;

    /**
     * 真实登录取得轮换后的会话，失败使测试立即停止。
     * @param username 测试用户名，不为空
     * @return 已认证会话，不为空
     * @throws Exception 请求执行或断言失败时抛出
     */
    private MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).param("username", username).param("password", "Test-Only-Password-2026"))
            .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /**
     * 证明真实登录/失败/CSRF/退出行为，匿名端点不会回显密码或数据库摘要。
     * @throws Exception HTTP失败时抛出
     */
    @Test
    void loginCsrfAndLogout() throws Exception {
        mvc.perform(get("/api/v1/auth/session")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login").param("username", "admin").param("password", "invalid")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/login").with(csrf()).param("username", "admin").param("password", "invalid")).andExpect(status().isUnauthorized());
        MockHttpSession session = login("admin");
        mvc.perform(get("/api/v1/auth/session").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN")).andExpect(jsonPath("$.passwordHash").doesNotExist());
        mvc.perform(post("/api/v1/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        assertTrue(session.isInvalid());
    }
    /**
     * 证明成员创建不自带目录权，授予/撤销立即生效，禁用影响旧会话；数据实际存入PostgreSQL。
     * @throws Exception HTTP/数据库断言失败时抛出
     */
    @Test
    void memberCatalogGrantRevokeAndDisable() throws Exception {
        MockHttpSession admin = login("admin");
        String username = "m" + UUID.randomUUID().toString().replace("-", "");
        String memberBody = json.writeValueAsString(Map.of("username", username, "displayName", "测试成员", "password", "Test-Only-Password-2026"));
        String memberResult = mvc.perform(post("/api/v1/members").session(admin).with(csrf()).contentType("application/json").content(memberBody)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String memberId = json.readTree(memberResult).get("id").asText();
        assertFalse(memberResult.contains("password"));
        mvc.perform(post("/api/v1/members").session(admin).with(csrf()).contentType("application/json").content(memberBody)).andExpect(status().isConflict());
        String hash = database.queryForObject("SELECT password_hash FROM c2k_account WHERE id = ?", String.class, memberId);
        assertTrue(encoder.matches("Test-Only-Password-2026", hash));
        String systemResult = mvc.perform(post("/api/v1/systems").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("name", "测试系统-" + username, "description", "合成数据")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = json.readTree(systemResult).get("id").asText();
        String roleId = UUID.randomUUID().toString();
        String tenantId = database.queryForObject("SELECT tenant_id FROM c2k_account WHERE id=?", String.class, memberId);
        database.update("INSERT INTO c2k_role(id,tenant_id,name,description,built_in) VALUES(?,?,?,'合成测试',false)", roleId, tenantId, "目录读取-" + roleId);
        database.update("INSERT INTO c2k_role_permission(role_id,permission_code) VALUES(?,?)", roleId, "catalog.read");
        database.update("INSERT INTO c2k_member_role(tenant_id,member_id,role_id) VALUES(?,?,?)", tenantId, memberId, roleId);
        MockHttpSession member = login(username);
        mvc.perform(get("/api/v1/systems").session(member)).andExpect(content().json("[]"));
        mvc.perform(get("/api/v1/systems/" + id).session(member)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/members").session(member)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/systems").session(member).with(csrf()).contentType("application/json").content("{\"name\":\"禁止创建\"}")).andExpect(status().isForbidden());
        String grantPath = "/api/v1/systems/" + id + "/grants";
        String grant = json.writeValueAsString(Map.of("memberId", memberId));
        mvc.perform(post(grantPath).session(admin).contentType("application/json").content(grant)).andExpect(status().isForbidden());
        mvc.perform(post(grantPath).session(admin).with(csrf()).contentType("application/json").content(grant)).andExpect(status().isNoContent());
        mvc.perform(post(grantPath).session(admin).with(csrf()).contentType("application/json").content(grant)).andExpect(status().isNoContent());
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_system_grant WHERE system_id = ?", Integer.class, id));
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE event = 'catalog.granted' AND target_id = ? AND subject_id = ?", Integer.class, id, memberId));
        mvc.perform(get("/api/v1/systems/" + id).session(member)).andExpect(status().isOk());
        mvc.perform(delete(grantPath + "/" + memberId).session(admin).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/systems/" + id).session(member)).andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/members/" + memberId + "/status").session(admin).with(csrf()).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/session").session(member)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/members/" + memberId + "/status").session(admin).with(csrf()).contentType("application/json").content("{\"enabled\":true}")).andExpect(status().isNoContent());
        mvc.perform(get("/api/v1/auth/session").session(member)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/v1/members/" + memberId + "/status").session(admin).with(csrf()).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/login").with(csrf()).param("username", username).param("password", "Test-Only-Password-2026")).andExpect(status().isUnauthorized());
    }
    /**
     * 外企业管理员猜ID、授权外企业成员均拒绝；任意tenant字段不能改变会话企业。
     * @throws Exception HTTP/数据库断言失败时抛出
     */
    @Test
    void crossTenantAndInvalidInput() throws Exception {
        String tenant = UUID.randomUUID().toString();
        String account = UUID.randomUUID().toString();
        String system = UUID.randomUUID().toString();
        String username = "foreign" + UUID.randomUUID().toString().replace("-", "");
        database.update("INSERT INTO c2k_tenant(id,name) VALUES (?,?)", tenant, "合成外企业");
        database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role,enabled) VALUES (?,?,?,?,?,'MEMBER',true)", account, tenant, username, "外企业成员", encoder.encode("Test-Only-Password-2026"));
        database.update("INSERT INTO c2k_system(id,tenant_id,name,description) VALUES (?,?,?,'')", system, tenant, "外企业系统");
        MockHttpSession admin = login("admin");
        mvc.perform(get("/api/v1/systems/" + system).session(admin)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/systems/" + system + "/grants").session(admin)).andExpect(status().isNotFound());
        mvc.perform(patch("/api/v1/members/" + account + "/status").session(admin).with(csrf()).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/members").session(admin).with(csrf()).contentType("application/json").content("{\"username\":\"bad\",\"displayName\":\"测试\",\"password\":\"short\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/systems").session(admin).with(csrf()).contentType("application/json").content("{\"name\":\"   \"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/systems").session(admin).with(csrf()).contentType("application/json").content("{\"name\":\"隔离测试\",\"tenantId\":\"" + tenant + "\"}")).andExpect(status().isCreated());
        assertEquals(0, database.queryForObject("SELECT count(*) FROM c2k_system WHERE tenant_id = ? AND name = '隔离测试'", Integer.class, tenant));
        String ownSystem = database.queryForObject("SELECT id FROM c2k_system WHERE name = '隔离测试'", String.class);
        mvc.perform(post("/api/v1/systems/" + ownSystem + "/grants").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("memberId", account)))).andExpect(status().isNotFound());
    }
    /**
     * 同IP并发请求最多放行20次，测试线程池最终释放；一分钟后可恢复。
     * @throws Exception 并发任务失败时抛出
     */
    @Test
    void concurrentLoginLimitIsBoundedAndRecovers() throws Exception {
        LoginRateFilter filter = new LoginRateFilter();
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            java.util.List<Future<Boolean>> results = new java.util.ArrayList<>();
            for (int i = 0; i < 50; i++) results.add(pool.submit(() -> filter.allow("127.0.0.1", 1000)));
            int allowed = 0;
            for (Future<Boolean> result : results) if (result.get()) allowed++;
            assertEquals(20, allowed);
            assertTrue(filter.allow("127.0.0.1", 61001));
        } finally { pool.shutdownNow(); }
    }
}
