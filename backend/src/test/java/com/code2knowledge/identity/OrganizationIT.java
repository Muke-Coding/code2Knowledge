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

/** 部门、资源范围和菜单集成验收；真实数据库、安全链和并发更新，不调用模型或读取本机配置。 */
@SpringBootTest(classes = PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class OrganizationIT {
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
     *
     * @return 新随机资源标识，不关联客户
     *
     * @throws Exception 仅保留测试统一签名 */
    private String id() throws Exception { return UUID.randomUUID().toString(); }
    /**
     *
     * @param username 合成账户名
     *
     * @return 独立会话
     *
     * @throws Exception 登录或断言失败 */
    private MockHttpSession login(String username) throws Exception {
        return (MockHttpSession) mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request -> { request.setRemoteAddr("10.79.0." + ADDRESS.incrementAndGet()); return request; }).param("username", username).param("password", "Test-Only-Password-2026"))
            .andExpect(status().isOk()).andReturn().getRequest().getSession(false);
    }
    /**
     *
     * @param session 可信会话
     *
     * @param request HTTP操作
     *
     * @param value 请求正文
     *
     * @param expected 预期HTTP状态
     *
     * @return JSON，空响应返回null节点
     *
     * @throws Exception 状态或响应失败 */
    private JsonNode call(MockHttpSession session, MockHttpServletRequestBuilder request, Object value, int expected) throws Exception {
        org.springframework.test.web.servlet.MvcResult result = mvc.perform(request.session(session).with(csrf()).contentType("application/json").content(json.writeValueAsString(value))).andReturn();
        if (result.getResponse().getStatus() != expected && result.getResolvedException() != null) throw result.getResolvedException();
        assertEquals(expected, result.getResponse().getStatus());
        String content = result.getResponse().getContentAsString();
        return content.isEmpty() ? json.nullNode() : json.readTree(content);
    }
    /**
     *
     * @param admin 管理员
     *
     * @return 新系统UUID
     *
     * @throws Exception 创建失败 */
    private String system(MockHttpSession admin) throws Exception { return call(admin, post("/api/v1/systems"), Map.of("name", "合成来源系统-" + id()), 201).get("id").asText(); }
    /**
     *
     * @param systemId 所属系统
     *
     * @return 明确分支、状态、绑定的可变合成输入
     *
     * @throws Exception 生成标识失败 */
    private Map<String, Object> input(String systemId) throws Exception {
        Map<String, Object> input = new HashMap<>(); input.put("name", "合成来源-" + id()); input.put("kind", "REPOSITORY"); input.put("locator", "https://example.invalid/fixture/" + id() + ".git"); input.put("branch", "main"); input.put("enabled", true); input.put("systemIds", List.of(systemId)); return input;
    }
    /**
     *
     * @param admin 管理员
     *
     * @param sourceId 来源
     *
     * @param memberId 当前企业成员
     *
     * @param revision 配置版本
     *
     * @param allow 授予或撤销
     *
     * @throws Exception 写入失败 */
    private void grant(MockHttpSession admin, String sourceId, String memberId, int revision, boolean allow) throws Exception { call(admin, put("/api/v1/sources/" + sourceId + "/grants/" + allow), Map.of("memberId", memberId, "revision", revision), 204); }
    /**
     *
     * @param tenant 企业
     *
     * @return 新合成成员UUID
     *
     * @throws Exception 数据库造数失败 */
    private String member(String tenant) throws Exception {
        String id = id(); database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role) VALUES(?,?,?,?,?,'MEMBER')", id, tenant, "source" + id.replace("-", ""), "合成来源成员", passwords.encode("Test-Only-Password-2026")); return id;
    }
    /**
     *
     * @return 当前测试企业UUID
     *
     * @throws Exception 数据库失败 */
    private String tenant() throws Exception { return database.queryForObject("SELECT tenant_id FROM c2k_account WHERE username='admin'", String.class); }
    /**
     *
     * @param memberId 同企业成员
     *
     * @return 独立会话
     *
     * @throws Exception 登录失败 */
    private MockHttpSession memberSession(String memberId) throws Exception { return login(database.queryForObject("SELECT username FROM c2k_account WHERE id=?", String.class, memberId)); }
    /**
     *
     * @param admin 角色管理员
     *
     * @param memberId 同企业成员
     *
     * @param codes 允许的动作集合
     *
     * @throws Exception 角色创建或分配失败 */
    private void actions(MockHttpSession admin, String memberId, String... codes) throws Exception {
        String roleId = call(admin, post("/api/v1/roles"), Map.of("name", "来源角色-" + id(), "permissions", TestPermissions.expand(codes)), 201).get("id").asText();
        call(admin, put("/api/v1/members/" + memberId + "/roles"), Map.of("roleIds", List.of(roleId), "revision", 0), 204);
    }
    /**
     *
     * @param user 已登录设备所有者
     *
     * @return 合成设备凭证，仅本测试内存保存
     *
     * @throws Exception 配对失败 */
    private JsonNode device(MockHttpSession user) throws Exception {
        String code = call(user, post("/api/v1/devices/pairings"), Map.of(), 201).get("code").asText();
        return json.readTree(mvc.perform(post("/runtime/v1/pair").contentType("application/json").content(json.writeValueAsString(Map.of("code", code, "name", "合成预检设备", "os", "test", "arch", "test", "version", "1")))).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }
    /**
     *
     * @param user 已有来源动作的成员
     *
     * @param memberId 当前用户UUID
     *
     * @return 已逐项授权的仓库来源
     *
     * @throws Exception 创建或授权失败 */
    private JsonNode source(MockHttpSession user, String memberId) throws Exception { JsonNode source = call(user, post("/api/v1/sources"), input(system(user)), 201); grant(user, source.get("id").asText(), memberId, 0, true); return source; }
    /**
     *
     * @param user 来源分析者
     *
     * @param source 已授权来源
     *
     * @param device 所有者设备
     *
     * @return 新任务
     *
     * @throws Exception 创建失败 */
    private JsonNode task(MockHttpSession user, JsonNode source, JsonNode device) throws Exception { return call(user, post("/api/v1/tasks"), Map.of("name", "合成预检", "sourceId", source.get("id").asText(), "sourceRevision", source.get("revision").asInt(), "deviceId", device.get("id").asText(), "requestId", id()), 201); }
    /**
     *
     * @param device 合成设备凭证
     *
     * @param path 固定协议路径
     *
     * @param input 设备请求
     *
     * @param expected 预期状态
     *
     * @return 设备响应JSON
     *
     * @throws Exception HTTP失败 */
    private JsonNode runtime(JsonNode device, String path, Object input, int expected) throws Exception {
        return json.readTree(mvc.perform(post(path).header("Authorization", "Bearer " + device.get("token").asText()).contentType("application/json").content(json.writeValueAsString(input))).andExpect(status().is(expected)).andReturn().getResponse().getContentAsString());
    }
    /**
     * @param parent 根为空串
     * @param name 合成部门名
     * @param enabled 是否启用
     * @param revision 版本
     * @return 明确配置 */
    private Map<String,Object> department(String parent,String name,boolean enabled,int revision) { return Map.of("parentId",parent,"name",name,"enabled",enabled,"sortOrder",0,"revision",revision); }
    /**
     * @throws Exception 验证层级、循环、乐观锁、删除引用、CSRF和跨企业对象隔离 */
    @Test
    void departmentLifecycle() throws Exception {
        MockHttpSession admin=login("admin");String suffix=id();
        JsonNode root=call(admin,post("/api/v1/departments"),department("","根"+suffix,true,0),201);String a=root.get("id").asText();
        JsonNode child=call(admin,post("/api/v1/departments"),department(a,"子"+suffix,true,0),201);String b=child.get("id").asText();
        call(admin,put("/api/v1/departments/"+a),department(b,"循环"+suffix,true,0),400);
        call(admin,put("/api/v1/departments/"+b),department(a,"子"+suffix,true,2),409);
        call(admin,delete("/api/v1/departments/"+a+"?revision=0"),Map.of(),409);
        call(admin,put("/api/v1/departments/"+id()),department("","不存在",true,0),404);
        mvc.perform(post("/api/v1/departments").session(admin).contentType("application/json").content(json.writeValueAsString(department("","缺CSRF",true,0)))).andExpect(status().isForbidden());
        call(admin,delete("/api/v1/departments/"+b+"?revision=0"),Map.of(),204);call(admin,delete("/api/v1/departments/"+a+"?revision=0"),Map.of(),204);
        String member=member(tenant());MockHttpSession user=memberSession(member);call(user,get("/api/v1/departments"),Map.of(),403);
    }
    /**
     * @throws Exception 验证部门含下级需显式选择、个人角色动作不继承，停用祖先/成员调动/来源变化即时撤范围 */
    @Test
    void explicitResourceScopeAndRevocation() throws Exception {
        MockHttpSession admin=login("admin");String owner=database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'",String.class),member=member(tenant());
        actions(admin,member,"source.analyze","catalog.read");MockHttpSession user=memberSession(member);String root=call(admin,post("/api/v1/departments"),department("","授权根"+id(),true,0),201).get("id").asText();String child=call(admin,post("/api/v1/departments"),department(root,"授权子"+id(),true,0),201).get("id").asText();
        call(admin,put("/api/v1/members/"+member+"/department"),Map.of("departmentId",child,"revision",0),204);
        JsonNode source=source(admin,owner);String sid=source.get("id").asText();
        Map<String,Object> grant=new HashMap<>(Map.of("departmentId",root,"includeChildren",false,"sourceRevision",0,"revision",0));
        call(admin,put("/api/v1/department-grants/SOURCE/"+sid+"/true"),grant,204);call(user,get("/api/v1/sources/"+sid),Map.of(),404);
        grant.put("includeChildren",true);grant.put("revision",1);call(admin,put("/api/v1/department-grants/SOURCE/"+sid+"/true"),grant,204);assertTrue(call(user,get("/api/v1/sources/"+sid),Map.of(),200).get("canAnalyze").asBoolean());
        call(admin,put("/api/v1/departments/"+root),department("","授权根"+root,false,0),200);call(user,get("/api/v1/sources/"+sid),Map.of(),404);
        call(admin,put("/api/v1/departments/"+root),department("","授权根"+root,true,1),200);call(user,get("/api/v1/sources/"+sid),Map.of(),200);
        call(admin,put("/api/v1/members/"+member+"/department"),Map.of("departmentId","","revision",1),204);call(user,get("/api/v1/sources/"+sid),Map.of(),404);
        call(admin,put("/api/v1/members/"+member+"/department"),Map.of("departmentId",child,"revision",2),204);
        database.update("UPDATE c2k_source SET revision=revision+1 WHERE id=?",sid);call(user,get("/api/v1/sources/"+sid),Map.of(),404);
        String system=system(admin);Map<String,Object> systemGrant=Map.of("departmentId",root,"includeChildren",true,"sourceRevision",0,"revision",0);
        call(admin,put("/api/v1/department-grants/SYSTEM/"+system+"/true"),systemGrant,204);call(user,get("/api/v1/systems/"+system),Map.of(),200);
        call(admin,put("/api/v1/department-grants/SYSTEM/"+system+"/false"),Map.of("departmentId",root,"includeChildren",true,"sourceRevision",0,"revision",1),204);call(user,get("/api/v1/systems/"+system),Map.of(),404);
        call(user,get("/api/v1/departments"),Map.of(),403);call(user,put("/api/v1/members/"+member+"/department"),Map.of("departmentId",root,"revision",3),403);
    }
    /**
     * @throws Exception 验证菜单隐藏不撤接口权限、固定页面白名单、防丢管理入口及版本冲突 */
    @Test
    void controlledMenus() throws Exception {
        MockHttpSession admin=login("admin");JsonNode menus=call(admin,get("/api/v1/menus"),Map.of(),200);assertTrue(menus.isArray());
        JsonNode previous=null;for(JsonNode row:menus)if(row.get("path").asText().equals("/systems"))previous=row;
        Map<String,Object> input=new HashMap<>(Map.of("title","业务系统","group","knowledge","sortOrder",5,"visible",false,"revision",previous.get("revision").asInt()));
        JsonNode updated=call(admin,put("/api/v1/menus/systems"),input,200);call(admin,get("/api/v1/systems"),Map.of(),200);
        JsonNode session=call(admin,get("/api/v1/auth/session"),Map.of(),200);boolean hidden=false;for(JsonNode nav:session.get("navigation"))if(nav.get("path").asText().equals("/systems"))hidden=!nav.get("visible").asBoolean();assertTrue(hidden);
        call(admin,put("/api/v1/menus/systems"),input,409);call(admin,put("/api/v1/menus/evil"),input,404);
        input.put("revision",0);call(admin,put("/api/v1/menus/menus"),input,409);
        input.put("revision",updated.get("revision").asInt());input.put("visible",true);input.put("title","系统目录");input.put("sortOrder",0);call(admin,put("/api/v1/menus/systems"),input,200);
        String member=member(tenant());call(memberSession(member),get("/api/v1/menus"),Map.of(),403);
    }
    /** 缺字段必须拒绝；第17层与跨企业父级不能写入。 @throws Exception 请求或数据库断言失败 */
    @Test
    void explicitInputDepthAndForeignTenant() throws Exception {
        MockHttpSession admin=login("admin");
        call(admin,post("/api/v1/departments"),Map.of("name","缺明确状态","parentId",""),400);
        String parent="";
        for(int level=1;level<=16;level++) parent=call(admin,post("/api/v1/departments"),department(parent,"深度"+level+id(),true,0),201).get("id").asText();
        call(admin,post("/api/v1/departments"),department(parent,"超深"+id(),true,0),400);
        String foreign=id(),foreignDepartment=id();
        database.update("INSERT INTO c2k_tenant(id,name) VALUES (?,?)",foreign,"隔离测试企业"+id());
        database.update("INSERT INTO c2k_department(id,tenant_id,name,sort_order,enabled) VALUES (?,?,?,0,true)",foreignDepartment,foreign,"外部部门");
        call(admin,post("/api/v1/departments"),department(foreignDepartment,"跨企业"+id(),true,0),404);
        call(admin,put("/api/v1/departments/"+foreignDepartment),department("","外部修改",true,0),404);
    }
    /** 并发移动使用同企业锁，只有一个旧版本能写入；线程池最终回收。 @throws Exception 请求或线程超时失败 */
    @Test
    void concurrentDepartmentChanges() throws Exception {
        MockHttpSession admin=login("admin");String departmentId=call(admin,post("/api/v1/departments"),department("","并发"+id(),true,0),201).get("id").asText();
        ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
        try {
            // 两个独立请求同步进入同一版本更新，验证企业锁不会出现丢失写入。
            java.util.concurrent.Callable<Integer> change=() -> { start.await(); return mvc.perform(put("/api/v1/departments/"+departmentId).session(admin).with(csrf()).contentType("application/json").content(json.writeValueAsString(department("","并发新名"+id(),true,0)))).andReturn().getResponse().getStatus(); };
            Future<Integer> first=pool.submit(change),second=pool.submit(change);start.countDown();int a=first.get(10,TimeUnit.SECONDS),b=second.get(10,TimeUnit.SECONDS);assertTrue((a==200 && b==409)||(a==409 && b==200));
        } finally { pool.shutdownNow(); assertTrue(pool.awaitTermination(10,TimeUnit.SECONDS)); }
    }
    /** 撤销保留版本防旧授权复活；停用来源拒绝新增但允许撤销。 @throws Exception 断言失败 */
    @Test
    void grantTombstoneAndDisabledSource() throws Exception {
        MockHttpSession admin=login("admin");String owner=database.queryForObject("SELECT id FROM c2k_account WHERE username='admin'",String.class);
        String departmentId=call(admin,post("/api/v1/departments"),department("","墓碑"+id(),true,0),201).get("id").asText(),sourceId=source(admin,owner).get("id").asText();
        Map<String,Object> input=new HashMap<>(Map.of("departmentId",departmentId,"includeChildren",false,"sourceRevision",0,"revision",0));
        call(admin,put("/api/v1/department-grants/SOURCE/"+sourceId+"/true"),input,204);
        input.put("revision",1);call(admin,put("/api/v1/department-grants/SOURCE/"+sourceId+"/false"),input,204);
        call(admin,put("/api/v1/department-grants/SOURCE/"+sourceId+"/true"),input,409);
        input.put("revision",2);call(admin,put("/api/v1/department-grants/SOURCE/"+sourceId+"/true"),input,204);
        database.update("UPDATE c2k_source SET enabled=false WHERE id=?",sourceId);
        input.put("revision",3);call(admin,put("/api/v1/department-grants/SOURCE/"+sourceId+"/true"),input,409);
        call(admin,put("/api/v1/department-grants/SOURCE/"+sourceId+"/false"),input,204);
        call(admin,delete("/api/v1/departments/"+departmentId+"?revision=0"),Map.of(),204);
    }

    /**
     * 用户页批量部门目录须同时具备两项读取权限，验证未分配、已分配、跨企业隔离及撤权即时拒绝。
     * @throws Exception 隔离造数、HTTP状态或契约断言失败
     */
    @Test
    void memberDirectoryRequiresBothReadActionsAndIsTenantScoped() throws Exception {
        MockHttpSession admin = login("admin");
        String tenant = tenant();
        String target = member(tenant);
        String username = database.queryForObject("SELECT username FROM c2k_account WHERE id=?", String.class, target);
        MockHttpSession subject = login(username);
        mvc.perform(get("/api/v1/departments/member-directory")).andExpect(status().isUnauthorized());
        call(subject, get("/api/v1/departments/member-directory"), Map.of(), 403);
        String role = id();
        database.update("INSERT INTO c2k_role(id,tenant_id,name,description) VALUES(?,?,?,'')", role, tenant, "用户目录验收" + role);
        database.update("INSERT INTO c2k_role_permission(role_id,permission_code) VALUES(?,?)", role, "member.read");
        database.update("INSERT INTO c2k_member_role(tenant_id,member_id,role_id) VALUES(?,?,?)", tenant, target, role);
        call(subject, get("/api/v1/departments/member-directory"), Map.of(), 403);
        database.update("INSERT INTO c2k_role_permission(role_id,permission_code) VALUES(?,?)", role, "department.read");
        JsonNode initial = call(subject, get("/api/v1/departments/member-directory"), Map.of(), 200);
        assertTrue(initial.isArray());
        boolean unassigned = false;
        for (JsonNode row : initial) if (row.path("memberId").asText().equals(target)) { assertEquals("", row.path("departmentId").asText()); assertEquals(2, row.size()); unassigned = true; }
        assertTrue(unassigned);
        JsonNode department = call(admin, post("/api/v1/departments"), Map.of("name", "目录关联测试", "parentId", "", "sortOrder", 0, "enabled", true, "revision", 0), 201);
        call(admin, put("/api/v1/members/" + target + "/department"), Map.of("departmentId", department.get("id").asText(), "revision", 0), 204);
        String otherTenant = id();
        database.update("INSERT INTO c2k_tenant(id,name) VALUES(?,?)", otherTenant, "目录隔离企业");
        String other = member(otherTenant);
        JsonNode assigned = call(subject, get("/api/v1/departments/member-directory"), Map.of(), 200);
        boolean found = false;
        for (JsonNode row : assigned) { assertNotEquals(other, row.path("memberId").asText()); if (row.path("memberId").asText().equals(target)) { assertEquals(department.get("id").asText(), row.path("departmentId").asText()); found = true; } }
        assertTrue(found);
        database.update("DELETE FROM c2k_role_permission WHERE role_id=? AND permission_code='department.read'", role);
        call(subject, get("/api/v1/departments/member-directory"), Map.of(), 403);
    }
}
