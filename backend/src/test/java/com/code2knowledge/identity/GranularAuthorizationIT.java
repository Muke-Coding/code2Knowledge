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
import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 细分授权真实HTTP和V10升级验收；直接提交新动作，不使用历史权限展开辅助器。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class GranularAuthorizationIT {
    /** 真实安全链与接口。 */
    @Autowired private MockMvc mvc;
    /** 合成数据序列化。 */
    @Autowired private ObjectMapper json;
    /** 仅隔离测试库造数，不进入业务SQL。 */
    @Autowired private JdbcTemplate database;
    /** 独立schema迁移使用同一隔离测试数据库。 */
    @Autowired private DataSource dataSource;

    /**
     * 登录隔离合成账号，避免触发其他场景的共享限流。
     * @param name 用户名，不为空
     * @return 已认证会话
     * @throws Exception 登录断言失败
     */
    private MockHttpSession login(String name) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.88." + (Math.abs(name.hashCode()) % 200) + ".1"); return request; }).param("username", name).param("password", "Test-Only-Password-2026")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /**
     * 创建无默认权限成员。
     * @param admin 管理员会话
     * @return 新成员公开信息
     * @throws Exception 创建断言失败
     */
    private JsonNode member(MockHttpSession admin) throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/members").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("username", "g" + UUID.randomUUID().toString().replace("-", ""), "displayName", "细分权限成员", "password", "Test-Only-Password-2026")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    /**
     * 分配依赖完整的细分动作；不扩展旧manage别名。
     * @param admin 角色管理员
     * @param memberId 目标成员UUID
     * @param revision 分配版本，非负
     * @param codes 已显式确认的动作列表，可空
     * @return 新角色UUID
     * @throws Exception 创建或分配失败
     */
    private String grant(MockHttpSession admin, String memberId, int revision, String... codes) throws Exception {
        String id = json.readTree(mvc.perform(post("/api/v1/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("name", "细分-" + UUID.randomUUID(), "permissions", codes)))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
        mvc.perform(put("/api/v1/members/" + memberId + "/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("revision", revision, "roleIds", List.of(id))))).andExpect(status().isNoContent());
        return id;
    }
    /** 新成员空导航；只读菜单不带写能力，旧会话撤权立即失效。 @throws Exception HTTP断言失败 */
    @Test
    void emptyDefaultReadOnlyAndRevocation() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode account = member(admin); MockHttpSession user = login(account.get("username").asText());
        mvc.perform(get("/api/v1/auth/session").session(user)).andExpect(jsonPath("$.permissions.length()").value(0)).andExpect(jsonPath("$.navigation.length()").value(0));
        for (String path : List.of("/systems", "/members", "/roles", "/sources", "/devices", "/tasks", "/analyses", "/candidates", "/reviews")) mvc.perform(get("/api/v1" + path).session(user)).andExpect(status().isForbidden());
        grant(admin, account.get("id").asText(), 0, "catalog.read", "member.read", "role.read", "device.read", "task.read", "analysis.read");
        mvc.perform(get("/api/v1/auth/session").session(user)).andExpect(jsonPath("$.navigation.length()").value(6));
        mvc.perform(get("/api/v1/members").session(user)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/members").session(user).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/devices/pairings").session(user).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/tasks").session(user).with(csrf()).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        grant(admin, account.get("id").asText(), 1);
        mvc.perform(get("/api/v1/auth/session").session(user)).andExpect(jsonPath("$.navigation.length()").value(0));
        mvc.perform(get("/api/v1/members").session(user)).andExpect(status().isForbidden());
    }
    /** 创建成员不带启停，读取角色不带编辑；旧码和悬空依赖均被拒绝。 @throws Exception HTTP断言失败 */
    @Test
    void independentActionsAndInvalidRoleInputs() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode account = member(admin); MockHttpSession user = login(account.get("username").asText());
        grant(admin, account.get("id").asText(), 0, "member.read", "member.create", "role.read");
        JsonNode created = member(user);
        mvc.perform(patch("/api/v1/members/" + created.get("id").asText() + "/status").session(user).with(csrf()).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/roles").session(user).with(csrf()).contentType("application/json").content("{\"name\":\"越权\",\"permissions\":[]}")).andExpect(status().isForbidden());
        for (String code : List.of("member.manage", "device.pair", "candidate.download")) mvc.perform(post("/api/v1/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("name", "应拒绝-" + code, "permissions", List.of(code))))).andExpect(status().isBadRequest());
    }
    /** 配对原码不能绕过后续角色撤权，兑换失败不得新增设备。 @throws Exception HTTP断言失败 */
    @Test
    void pairingRedemptionRechecksCurrentPermission() throws Exception {
        MockHttpSession admin = login("admin"); JsonNode account = member(admin); MockHttpSession user = login(account.get("username").asText());
        grant(admin, account.get("id").asText(), 0, "device.read", "device.pair");
        String code = json.readTree(mvc.perform(post("/api/v1/devices/pairings").session(user).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("code").asText();
        grant(admin, account.get("id").asText(), 1, "device.read");
        mvc.perform(post("/runtime/v1/pair").contentType("application/json").content(json.writeValueAsString(Map.of("code", code, "name", "已撤权设备", "os", "test", "arch", "test", "version", "1")))).andExpect(status().isUnauthorized());
        assertEquals(0, database.queryForObject("SELECT count(*) FROM c2k_device WHERE owner_id=?", Integer.class, account.get("id").asText()));
    }
    /** V10真实升级保留旧角色和成员标识，迁移基础角色可撤销，新成员不获得隐式权限。 @throws Exception 数据库迁移失败 */
    @Test
    void upgradeRetainsRevocableLegacyAbilities() throws Exception {
        String schema = "upgrade_" + UUID.randomUUID().toString().replace("-", "");
        try {
            org.flywaydb.core.Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).target("10").load().migrate();
            try (java.sql.Connection connection = dataSource.getConnection()) {
                connection.setSchema(schema);
                try {
                JdbcTemplate isolated = new JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true));
                String tenant = UUID.randomUUID().toString(), member = UUID.randomUUID().toString(), role = UUID.randomUUID().toString();
                isolated.update("INSERT INTO c2k_tenant(id,name) VALUES(?,?)", tenant, "升级合成企业");
                isolated.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role) VALUES(?,?,?,?,?,'MEMBER')", member, tenant, "before", "升级前成员", "synthetic-not-a-password");
                isolated.update("INSERT INTO c2k_role(id,tenant_id,name,description) VALUES(?,?,?,?)", role, tenant, "旧成员管理", "升级测试");
                isolated.update("INSERT INTO c2k_role_permission VALUES(?,?)", role, "member.manage");
                org.flywaydb.core.Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load().migrate();
                assertEquals(0, isolated.queryForObject("SELECT count(*) FROM c2k_role_permission WHERE role_id='MEMBER'", Integer.class));
                assertEquals(3, isolated.queryForObject("SELECT count(*) FROM c2k_role_permission WHERE role_id=?", Integer.class, role));
                String migrated = isolated.queryForObject("SELECT role_id FROM c2k_member_role WHERE member_id=?", String.class, member);
                assertEquals(8, isolated.queryForObject("SELECT count(*) FROM c2k_role_permission WHERE role_id=?", Integer.class, migrated));
                assertEquals(0, isolated.queryForObject("SELECT count(*) FROM c2k_role_permission WHERE role_id=? AND permission_code='source.analyze'", Integer.class, migrated));
                isolated.update("DELETE FROM c2k_member_role WHERE member_id=?", member);
                assertEquals(0, isolated.queryForObject("SELECT count(*) FROM c2k_member_role WHERE member_id=?", Integer.class, member));
                } finally { connection.setSchema("public"); }
            }
        } finally { database.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE"); }
    }
}
