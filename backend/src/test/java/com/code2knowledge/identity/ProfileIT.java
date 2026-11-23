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
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 本人资料和会话锁集成验收；合成成员不带业务权限，不改手动验收管理员密码。 */
@SpringBootTest(classes=PlatformApplication.class)
@ActiveProfiles("platform")
@AutoConfigureMockMvc
class ProfileIT {
    /** 真实HTTP安全链。 */
    @Autowired private MockMvc mvc;
    /** 测试JSON编解码。 */
    @Autowired private ObjectMapper json;
    /** 仅用于合成数据和持久化断言。 */
    @Autowired private JdbcTemplate database;
    /** 使用实际BCrypt，不保存真实凭证。 */
    @Autowired private PasswordEncoder passwords;
    /** 各请求独立IP，账户限速单独验证。 */
    private static final AtomicInteger ADDRESS=new AtomicInteger();
    /** 合成账户初始密码，禁止用于部署。 */
    private static final String PASSWORD="Test-Only-Password-2026";
    /** 合成账户新密码，禁止用于部署。 */
    private static final String NEXT="Changed-Only-Password-2026";
    /** @return 当前隔离数据库的企业标识 */
    private String tenant() { return database.queryForObject("SELECT tenant_id FROM c2k_account WHERE username='admin'",String.class); }
    /** @param tenant 合成企业 @return 无业务角色的合成登录名 */
    private String member(String tenant) { String id=UUID.randomUUID().toString(),name="profile"+id.replace("-","");database.update("INSERT INTO c2k_account(id,tenant_id,username,display_name,password_hash,role) VALUES(?,?,?,?,?,'MEMBER')",id,tenant,name,"合成账户",passwords.encode(PASSWORD));return name; }
    /** @param name 合成登录名 @param password 本次合成凭证 @return 独立会话 @throws Exception 登录断言失败 */
    private MockHttpSession login(String name,String password) throws Exception { return (MockHttpSession)mvc.perform(post("/api/v1/auth/login").with(csrf()).with(request->{request.setRemoteAddr("10.92."+ADDRESS.incrementAndGet()+".1");return request;}).param("username",name).param("password",password)).andExpect(status().isOk()).andReturn().getRequest().getSession(false); }
    /** @param session 当前会话 @param request 明确HTTP请求 @param value 合成正文 @param expected 预期状态 @return JSON正文，204为空节点 @throws Exception 请求或断言失败 */
    private JsonNode call(MockHttpSession session,MockHttpServletRequestBuilder request,Object value,int expected) throws Exception { org.springframework.test.web.servlet.MvcResult result=mvc.perform(request.session(session).with(csrf()).with(input->{input.setRemoteAddr("10.93."+ADDRESS.incrementAndGet()+".1");return input;}).contentType("application/json").content(json.writeValueAsString(value))).andReturn();assertEquals(expected,result.getResponse().getStatus(),result.getResponse().getContentAsString());String body=result.getResponse().getContentAsString();return body.isEmpty()?json.nullNode():json.readTree(body); }
    /** 无业务动作也可读改本人名称；不得通过额外字段改他人、角色、部门；旧版本和CSRF均受控。 @throws Exception 断言失败 */
    @Test void selfProfileAndOptimisticProtection() throws Exception {
        String name=member(tenant()),other=member(tenant());MockHttpSession session=login(name,PASSWORD);
        JsonNode profile=call(session,get("/api/v1/profile"),Map.of(),200);assertEquals(name,profile.get("username").asText());assertEquals("",profile.get("departmentName").asText());assertFalse(profile.has("passwordHash"));assertFalse(profile.has("authVersion"));
        mvc.perform(put("/api/v1/profile").session(session).contentType("application/json").content("{\"displayName\":\"无保护\",\"revision\":0}")).andExpect(status().isForbidden());
        call(session,put("/api/v1/profile"),Map.of("displayName","本人新名称","revision",0,"username",other,"role","ADMIN","departmentId","fake"),200);
        assertEquals("本人新名称",call(session,get("/api/v1/profile"),Map.of(),200).get("displayName").asText());
        assertEquals("MEMBER",database.queryForObject("SELECT role FROM c2k_account WHERE username=?",String.class,name));assertEquals("合成账户",database.queryForObject("SELECT display_name FROM c2k_account WHERE username=?",String.class,other));
        call(session,put("/api/v1/profile"),Map.of("displayName","覆盖旧版本","revision",0),409);call(session,put("/api/v1/profile"),Map.of("displayName"," ","revision",1),400);
        mvc.perform(get("/api/v1/profile")).andExpect(status().isUnauthorized());
    }
    /** 锁屏由服务器拒绝读写和重新登录；另一浏览器不受影响，错误密码不解锁，CSRF不可省略。 @throws Exception 断言失败 */
    @Test void lockGateSurvivesRefreshAndKeepsOtherSession() throws Exception {
        String name=member(tenant());MockHttpSession locked=login(name,PASSWORD),other=login(name,PASSWORD);
        assertTrue(call(locked,post("/api/v1/auth/lock"),Map.of(),200).get("locked").asBoolean());
        call(locked,get("/api/v1/profile"),Map.of(),423);call(locked,get("/api/v1/auth/session"),Map.of(),423);call(locked,put("/api/v1/profile"),Map.of("displayName","不可写","revision",0),423);
        assertTrue(call(locked,get("/api/v1/auth/lock-state"),Map.of(),200).get("locked").asBoolean());call(other,get("/api/v1/profile"),Map.of(),200);
        mvc.perform(post("/api/v1/auth/login").session(locked).with(csrf()).param("username",name).param("password",PASSWORD)).andExpect(status().isLocked());
        mvc.perform(post("/api/v1/auth/unlock").session(locked).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        call(locked,post("/api/v1/auth/unlock"),Map.of("password","Wrong-Password-2026"),400);call(locked,get("/api/v1/profile"),Map.of(),423);
        assertFalse(call(locked,post("/api/v1/auth/unlock"),Map.of("password",PASSWORD),200).get("locked").asBoolean());call(locked,get("/api/v1/profile"),Map.of(),200);
        call(locked,post("/api/v1/auth/lock"),Map.of(),200);call(locked,post("/api/v1/auth/logout"),Map.of(),204);assertTrue(locked.isInvalid());
    }
    /** 改密先验证旧密码与规则，成功让所有旧身份版本失效；锁定会话也不能用旧密码解锁。 @throws Exception 断言失败 */
    @Test void passwordInvalidatesEveryOldBrowser() throws Exception {
        String name=member(tenant());MockHttpSession session=login(name,PASSWORD),other=login(name,PASSWORD),locked=login(name,PASSWORD);call(locked,post("/api/v1/auth/lock"),Map.of(),200);
        call(session,post("/api/v1/profile/password"),Map.of("currentPassword","Wrong-Password-2026","newPassword",NEXT),400);call(session,post("/api/v1/profile/password"),Map.of("currentPassword",PASSWORD,"newPassword","short"),400);call(session,post("/api/v1/profile/password"),Map.of("currentPassword",PASSWORD,"newPassword",PASSWORD),400);
        call(session,post("/api/v1/profile/password"),Map.of("currentPassword",PASSWORD,"newPassword",NEXT),204);assertTrue(session.isInvalid());call(other,get("/api/v1/profile"),Map.of(),401);call(locked,get("/api/v1/auth/lock-state"),Map.of(),401);call(locked,post("/api/v1/auth/unlock"),Map.of("password",PASSWORD),401);
        mvc.perform(post("/api/v1/auth/login").with(csrf()).param("username",name).param("password",PASSWORD)).andExpect(status().isUnauthorized());call(login(name,NEXT),get("/api/v1/profile"),Map.of(),200);
    }
    /** 同版本并发只允许一次保存；使用常规线程池并在finally释放，避免测试遗留工作线程。 @throws Exception 并发或断言失败 */
    @Test void concurrentNameUpdateHasOneWinner() throws Exception {
        String name=member(tenant());MockHttpSession first=login(name,PASSWORD),second=login(name,PASSWORD);ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch gate=new CountDownLatch(1);
        try { Future<Integer> a=pool.submit(()->{gate.await();return updateStatus(first,"并发甲");});Future<Integer>b=pool.submit(()->{gate.await();return updateStatus(second,"并发乙");});gate.countDown();int x=a.get(15,TimeUnit.SECONDS),y=b.get(15,TimeUnit.SECONDS);assertTrue(x==200&&y==409 || x==409&&y==200); }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(10,TimeUnit.SECONDS));}
    }
    /** @param session 独立本人会话 @param name 待保存名称 @return 实际HTTP状态 @throws Exception 并发HTTP失败 */
    private int updateStatus(MockHttpSession session,String name) throws Exception { return mvc.perform(put("/api/v1/profile").session(session).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("displayName",name,"revision",0)))).andReturn().getResponse().getStatus(); }
    /** 不同IP不能绕过本人解锁尝试上限，限速不影响读取锁状态或退出。 @throws Exception 断言失败 */
    @Test void unlockRateIsBoundToAccount() throws Exception { String name=member(tenant());MockHttpSession session=login(name,PASSWORD);call(session,post("/api/v1/auth/lock"),Map.of(),200);for(int i=0;i<20;i++)call(session,post("/api/v1/auth/unlock"),Map.of("password","Wrong-Password-2026"),400);call(session,post("/api/v1/auth/unlock"),Map.of("password",PASSWORD),429);call(session,get("/api/v1/auth/lock-state"),Map.of(),200);call(session,post("/api/v1/auth/logout"),Map.of(),204); }
    /** 锁屏不撤销独立设备Bearer；带锁定浏览器Cookie的设备心跳仍只按设备认证，不会被浏览器门禁误拦。 @throws Exception 配对或安全断言失败 */
    @Test void runtimeCredentialContinuesWhileBrowserLocked() throws Exception {
        MockHttpSession session=login("admin",PASSWORD);
        String code=call(session,post("/api/v1/devices/pairings"),Map.of(),201).get("code").asText();
        JsonNode credential=call(session,post("/runtime/v1/pair"),Map.of("code",code,"name","锁屏合成设备","os","darwin","arch","arm64","version","1"),201);
        call(session,post("/api/v1/auth/lock"),Map.of(),200);
        mvc.perform(post("/runtime/v1/heartbeat").session(session).header("Authorization","Bearer "+credential.get("token").asText())).andExpect(status().isOk());
        mvc.perform(post("/runtime/v1/heartbeat").session(session)).andExpect(status().isUnauthorized());
        call(session,post("/api/v1/auth/unlock"),Map.of("password",PASSWORD),200);
        call(session,delete("/api/v1/devices/"+credential.get("id").asText()),Map.of(),204);
    }
    /** 两个旧会话同时改密只能有一个成功，企业锁后重验身份；常规线程池在finally关闭并等待释放。 @throws Exception 并发或安全断言失败 */
    @Test void concurrentPasswordChangeHasOneWinner() throws Exception {
        String name=member(tenant());MockHttpSession first=login(name,PASSWORD),second=login(name,PASSWORD);ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch gate=new CountDownLatch(1);
        try { Future<Integer>a=pool.submit(()->{gate.await();return passwordStatus(first);});Future<Integer>b=pool.submit(()->{gate.await();return passwordStatus(second);});gate.countDown();int x=a.get(15,TimeUnit.SECONDS),y=b.get(15,TimeUnit.SECONDS);assertTrue(x==204&&y==401 || x==401&&y==204); }finally{pool.shutdownNow();assertTrue(pool.awaitTermination(10,TimeUnit.SECONDS));}
    }
    /** @param session 独立旧会话 @return 改密HTTP状态 @throws Exception 请求失败 */
    private int passwordStatus(MockHttpSession session) throws Exception { return mvc.perform(post("/api/v1/profile/password").session(session).with(csrf()).contentType("application/json").content(json.writeValueAsString(Map.of("currentPassword",PASSWORD,"newPassword",NEXT)))).andReturn().getResponse().getStatus(); }

}
