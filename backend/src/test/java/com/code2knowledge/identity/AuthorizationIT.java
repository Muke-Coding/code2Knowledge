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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 真实PostgreSQL RBAC验证；合成身份与角色限定临时库，验证动作、资源、撤权、企业隔离及并发版本，不用管理员页面隐藏替代服务端授权。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class AuthorizationIT {
    /** 真实HTTP和安全链。 */
    @Autowired private MockMvc mvc;
    /** 合成JSON读写，不记录密码。 */
    @Autowired private ObjectMapper json;
    /** 测试造数和断言，不作为生产SQL路径。 */
    @Autowired private JdbcTemplate database;
    /** 合成身份使用真实密码哈希。 */
    @Autowired private PasswordEncoder passwords;
    /** 使用生产Mapper的真实锁语义，避免测试硬编码正确锁掩盖生产回归。 */
    @Autowired private com.code2knowledge.authorization.mapper.AuthorizationMapper authorization;
    /** 受控持锁事务，仅用于复现授权等待与外键并发场景。 */
    @Autowired private PlatformTransactionManager transactions;
    /** 测试登录各自独立来源，避免与专门限速测试共享配额。 */
    private static final AtomicInteger ADDRESS = new AtomicInteger();

    /** @param username 合成用户名 @return 已登录会话 @throws Exception 登录失败时停止测试 */
    private MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.20.0." + ADDRESS.incrementAndGet()); return request; })
            .param("username", username).param("password", "Test-Only-Password-2026")).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /** @return 新同企业普通成员UUID @throws Exception 数据库造数失败时抛出 */
    private String member() throws Exception {
        String id = UUID.randomUUID().toString();
        String tenant = database.queryForObject("SELECT tenant_id FROM c2k_account WHERE username='admin'", String.class);
        database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role) VALUES(?,?,?,?,?,'MEMBER')", id, tenant, "rb" + id.replace("-", ""), "合成角色成员", passwords.encode("Test-Only-Password-2026"));
        return id;
    }
    /** @param memberId 已造数成员UUID @return 同成员已登录会话 @throws Exception 登录失败时抛出 */
    private MockHttpSession memberLogin(String memberId) throws Exception { return login(database.queryForObject("SELECT username FROM c2k_account WHERE id=?", String.class, memberId)); }
    /** @param admin 角色管理会话 @param codes 已实现动作码 @return 新角色JSON @throws Exception HTTP失败时抛出 */
    private JsonNode role(MockHttpSession admin, String... codes) throws Exception {
        return json.readTree(mvc.perform(post("/api/v1/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("name", "角色-" + UUID.randomUUID(), "permissions", TestPermissions.expand(codes)))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    /** @param admin 角色管理会话 @param memberId 普通成员UUID @param revision 当前分配版本 @param ids 显式自定义角色ID @throws Exception 分配失败时抛出 */
    private void assign(MockHttpSession admin, String memberId, int revision, String... ids) throws Exception {
        mvc.perform(put("/api/v1/members/" + memberId + "/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("revision", revision, "roleIds", ids)))).andExpect(status().isNoContent());
    }
    /**
     * 两角色动作取并集，普通成员无全局目录权，catalog.manage可管理元数据但不产生内容动作；同一旧会话在撤销后立即拒绝。
     * @throws Exception 请求或断言失败时抛出
     */
    @Test
    void unionDelegationAndImmediateRevocation() throws Exception {
        MockHttpSession admin = login("admin"); String id = member(); MockHttpSession member = memberLogin(id);
        JsonNode catalog = role(admin, "catalog.manage"); JsonNode members = role(admin, "member.manage");
        mvc.perform(get("/api/v1/roles").session(member)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/members").session(member)).andExpect(status().isForbidden());
        assign(admin, id, 0, catalog.get("id").asText(), members.get("id").asText());
        mvc.perform(get("/api/v1/auth/session").session(member)).andExpect(jsonPath("$.permissions").isArray()).andExpect(jsonPath("$.permissions.length()").value(7));
        mvc.perform(get("/api/v1/members").session(member)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/systems").session(member).with(csrf()).contentType("application/json").content("{\"name\":\"委派目录-" + id + "\"}")).andExpect(status().isCreated());
        assign(admin, id, 1);
        mvc.perform(get("/api/v1/members").session(member)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/systems").session(member).with(csrf()).contentType("application/json").content("{\"name\":\"禁止委派写入\"}")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/auth/session").session(member)).andExpect(status().isOk()).andExpect(jsonPath("$.permissions.length()").value(0));
        // 不要求重新登录；角色变更不误伤私有设备认证版本，运行时所有权规则仍由独立测试覆盖。
        assertEquals(0, database.queryForObject("SELECT auth_version FROM c2k_account WHERE id=?", Integer.class, id));
    }
    /**
     * 已分配角色编辑即时改变资格，版本冲突不覆盖；引用角色不能删除，先撤分配后可删，内置角色与基础管理员始终受保护。
     * @throws Exception 请求或断言失败时抛出
     */
    @Test
    void roleLifecycleProtectionAndValidation() throws Exception {
        MockHttpSession admin = login("admin"); String id = member(); MockHttpSession member = memberLogin(id);
        JsonNode role = role(admin, "member.manage"); String roleId = role.get("id").asText(); assign(admin, id, 0, roleId);
        String update = json.writeValueAsString(Map.of("name", "新职责-" + id, "permissions", List.of(), "revision", 0));
        mvc.perform(put("/api/v1/roles/" + roleId).session(admin).with(csrf()).contentType("application/json").content(update)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        mvc.perform(get("/api/v1/members").session(member)).andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/roles/" + roleId).session(admin).with(csrf()).contentType("application/json").content(update)).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/roles/" + roleId + "?revision=1").session(admin).with(csrf())).andExpect(status().isConflict());
        mvc.perform(delete("/api/v1/roles/ADMIN?revision=0").session(admin).with(csrf())).andExpect(status().isConflict());
        mvc.perform(put("/api/v1/roles/MEMBER").session(admin).with(csrf()).contentType("application/json").content(update)).andExpect(status().isConflict());
        mvc.perform(put("/api/v1/members/" + id + "/roles").session(admin).with(csrf()).contentType("application/json").content("{\"revision\":1,\"roleIds\":[\"ADMIN\"]}")).andExpect(status().isConflict());
        String adminId = database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'", String.class);
        mvc.perform(get("/api/v1/members/" + adminId + "/roles").session(admin)).andExpect(status().isNotFound());
        for (String body : List.of("{\"name\":\"遗漏权限\"}", "{\"name\":\"未来权限\",\"permissions\":[\"knowledge.read\"]}", "{\"name\":\"重复\",\"permissions\":[\"catalog.read\",\"catalog.read\"]}"))
            mvc.perform(post("/api/v1/roles").session(admin).with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/roles").session(admin).contentType("application/json").content(update)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/roles")).andExpect(status().isUnauthorized());
        assign(admin, id, 1); mvc.perform(delete("/api/v1/roles/" + roleId + "?revision=1").session(admin).with(csrf())).andExpect(status().isNoContent());
        assertEquals(0, database.queryForObject("SELECT count(*) FROM c2k_role WHERE id=?", Integer.class, roleId));
    }
    /**
     * 外企业角色ID不泄露且不可分配；普通成员不能伪造角色或企业提权，角色管理可委派但不等于成员启停。
     * @throws Exception 请求或断言失败时抛出
     */
    @Test
    void tenantIsolationAndRoleAdministrationBoundary() throws Exception {
        MockHttpSession admin = login("admin"); String id = member(); MockHttpSession member = memberLogin(id);
        String tenant = UUID.randomUUID().toString(), foreignRole = UUID.randomUUID().toString();
        database.update("INSERT INTO c2k_tenant(id,name) VALUES(?,?)", tenant, "合成外企业");
        database.update("INSERT INTO c2k_role(id,tenant_id,name,description) VALUES(?,?,?,'')", foreignRole, tenant, "外企业角色");
        mvc.perform(put("/api/v1/members/" + id + "/roles").session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("roleIds", List.of(foreignRole), "revision", 0)))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/v1/roles/" + foreignRole + "?revision=0").session(admin).with(csrf())).andExpect(status().isNotFound());
        JsonNode manager = role(admin, "role.manage"); assign(admin, id, 0, manager.get("id").asText());
        mvc.perform(get("/api/v1/roles").session(member)).andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(foreignRole))));
        mvc.perform(patch("/api/v1/members/" + id + "/status").session(member).with(csrf()).contentType("application/json").content("{\"enabled\":false}")).andExpect(status().isForbidden());
        role(member, "catalog.manage");
        mvc.perform(get("/api/v1/permissions").session(member)).andExpect(status().isOk()).andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("knowledge.read"))));
        assign(admin, id, 1);
        mvc.perform(get("/api/v1/roles").session(member)).andExpect(status().isForbidden());
    }
    /**
     * 两个编辑者携带相同角色版本并发写入，仅一人成功；线程池在finally释放，不禁用版本或锁门禁。
     * @throws Exception 请求或线程断言失败时抛出
     */
    @Test
    void concurrentRoleEditHasOneWinner() throws Exception {
        MockHttpSession first = login("admin"), second = login("admin"); JsonNode role = role(first); String id = role.get("id").asText();
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2), go = new CountDownLatch(1);
        try {
            Future<Integer> one = pool.submit(() -> { ready.countDown(); go.await(); return edit(first, id, "甲"); });
            Future<Integer> two = pool.submit(() -> { ready.countDown(); go.await(); return edit(second, id, "乙"); });
            assertTrue(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)); go.countDown();
            assertEquals(java.util.Set.of(200, 409), java.util.Set.of(one.get(10, java.util.concurrent.TimeUnit.SECONDS), two.get(10, java.util.concurrent.TimeUnit.SECONDS)));
            assertEquals(1, database.queryForObject("SELECT revision FROM c2k_role WHERE id=?", Integer.class, id));
        } finally { go.countDown(); pool.shutdownNow(); }
    }
    /**
     * 成员角色两窗口并发修改只允许一个版本成功；相同最新分配重复提交不递增版本或重复审计。
     * @throws Exception 请求或并发断言失败时抛出
     */
    @Test
    void concurrentMemberAssignmentsAndNoOpAudit() throws Exception {
        MockHttpSession first = login("admin"), second = login("admin"); String memberId = member();
        String oneRole = role(first, "catalog.manage").get("id").asText(), twoRole = role(first, "member.manage").get("id").asText();
        ExecutorService pool = Executors.newFixedThreadPool(2); CountDownLatch ready = new CountDownLatch(2), go = new CountDownLatch(1);
        try {
            Future<Integer> one = pool.submit(() -> { ready.countDown(); go.await(); return assignStatus(first, memberId, oneRole); });
            Future<Integer> two = pool.submit(() -> { ready.countDown(); go.await(); return assignStatus(second, memberId, twoRole); });
            assertTrue(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)); go.countDown();
            assertEquals(java.util.Set.of(204, 409), java.util.Set.of(one.get(10, java.util.concurrent.TimeUnit.SECONDS), two.get(10, java.util.concurrent.TimeUnit.SECONDS)));
        } finally { go.countDown(); pool.shutdownNow(); }
        String winner = database.queryForObject("SELECT role_id FROM c2k_member_role WHERE member_id=?", String.class, memberId);
        assign(first, memberId, 1, winner);
        assertEquals(1, database.queryForObject("SELECT role_revision FROM c2k_account WHERE id=?", Integer.class, memberId));
        assertEquals(1, database.queryForObject("SELECT count(*) FROM c2k_audit WHERE target_id=? AND event='member.roles_changed'", Integer.class, memberId));
    }
    /** @param actor 角色管理会话 @param memberId 同企业普通成员UUID @param roleId 同企业自定义角色UUID @return HTTP状态 @throws Exception 请求失败时抛出 */
    private int assignStatus(MockHttpSession actor, String memberId, String roleId) throws Exception {
        return mvc.perform(put("/api/v1/members/" + memberId + "/roles").session(actor).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("revision", 0, "roleIds", List.of(roleId))))).andReturn().getResponse().getStatus();
    }
    /**
     * 写请求等待企业锁期间被停用再启用后，锁后必须真正重读auth_version并返回401，不产生目录写入。
     * @throws Exception 并发请求或断言失败时抛出
     */
    @Test
    void waitingWriterCannotReuseCachedIdentity() throws Exception {
        MockHttpSession admin = login("admin"); String memberId = member(); MockHttpSession member = memberLogin(memberId);
        assign(admin, memberId, 0, role(admin, "catalog.manage").get("id").asText());
        String tenant = database.queryForObject("SELECT tenant_id FROM c2k_account WHERE id=?", String.class, memberId);
        ExecutorService pool = Executors.newSingleThreadExecutor(); java.util.concurrent.atomic.AtomicReference<Future<Integer>> pending = new java.util.concurrent.atomic.AtomicReference<>();
        try {
            // 先持与生产相同的企业锁，再启动已认证写请求；确认数据库实际等待锁后改变身份版本，避免用sleep猜时序。
            new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
                authorization.lockTenant(tenant);
                pending.set(pool.submit(() -> mvc.perform(post("/api/v1/systems").session(member).with(csrf()).contentType("application/json")
                    .content("{\"name\":\"缓存拒绝-" + memberId + "\"}")).andReturn().getResponse().getStatus()));
                waitForTenantLock();
                database.update("UPDATE c2k_account SET enabled=false, auth_version=auth_version+1 WHERE id=?", memberId);
                database.update("UPDATE c2k_account SET enabled=true, auth_version=auth_version+1 WHERE id=?", memberId);
            });
            assertEquals(401, pending.get().get(10, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(0, database.queryForObject("SELECT count(*) FROM c2k_system WHERE name=?", Integer.class, "缓存拒绝-" + memberId));
        } finally { pool.shutdownNow(); }
    }
    /**
     * 已配对设备心跳只持账户与设备锁，企业授权互斥期间仍能完成；配对写入则必须串行核验当前动作。
     * @throws Exception 真实请求或线程失败时抛出
     */
    @Test
    void tenantMutexAllowsDeviceAuditForeignKey() throws Exception {
        MockHttpSession admin = login("admin");
        String code = json.readTree(mvc.perform(post("/api/v1/devices/pairings").session(admin).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("code").asText();
        String token = json.readTree(mvc.perform(post("/runtime/v1/pair").contentType("application/json").content(json.writeValueAsString(Map.of("code", code, "name", "锁隔离设备", "os", "test", "arch", "test", "version", "1")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("token").asText();
        String tenant = database.queryForObject("SELECT tenant_id FROM c2k_account WHERE username='admin'", String.class);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        try {
            new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
                authorization.lockTenant(tenant);
                Future<Integer> request = pool.submit(() -> mvc.perform(post("/runtime/v1/heartbeat").header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus());
                try { assertEquals(200, request.get(5, java.util.concurrent.TimeUnit.SECONDS)); }
                catch (Exception error) { throw new AssertionError("心跳不应与企业授权锁形成等待", error); }
            });
        } finally { pool.shutdownNow(); }
    }
    /** @throws AssertionError 五秒内未观察到真实企业锁等待时拒绝把竞态当通过 */
    private void waitForTenantLock() {
        long end = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < end) {
            database.execute("SELECT pg_stat_clear_snapshot()");
            Integer count = database.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM c2k_tenant%'", Integer.class);
            if (count != null && count > 0) return;
            try { Thread.sleep(20); } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new AssertionError("等待测试被中断", error); }
        }
        throw new AssertionError("未观察到请求等待企业锁");
    }
    /** @param actor 已授权会话 @param id 目标角色UUID @param suffix 并发操作者后缀 @return HTTP状态 @throws Exception 请求失败时抛出 */
    private int edit(MockHttpSession actor, String id, String suffix) throws Exception {
        return mvc.perform(put("/api/v1/roles/" + id).session(actor).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("name", "并发-" + id + suffix, "permissions", List.of("catalog.read"), "revision", 0)))).andReturn().getResponse().getStatus();
    }
}
