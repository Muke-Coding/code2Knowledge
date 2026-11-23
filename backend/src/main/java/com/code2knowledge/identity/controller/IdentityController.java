package com.code2knowledge.identity.controller;

import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.domain.dto.*;
import com.code2knowledge.identity.domain.vo.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 浏览器身份与企业普通成员入口；所有身份由会话解析，禁止客户端指定企业。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class IdentityController {
    /** 身份应用服务，不直接访问Mapper或DO。 */
    private final IdentityService identity;
    /**
     * 公开取得绑定会话的CSRF值，GET无业务副作用，可能创建会话；不接受跨源凭据读取。
     *
     * @param csrf Spring解析的会话令牌，不为空
     *
     * @return 写请求使用的头名和令牌，不为空
     */
    @GetMapping("/auth/csrf")
    public CsrfVO csrf(CsrfToken csrf) { return new CsrfVO(csrf.getHeaderName(), csrf.getToken()); }
    /** @return 已登录公开身份，匿名或禁用返回401；GET无需CSRF，无业务副作用 */
    @GetMapping("/auth/session")
    public SessionVO session() { return identity.session(); }
    /** @return 同企业成员列表；需成员/角色/目录/来源任一管理动作的会话，401未登录/403缺少管理动作；GET无副作用 */
    @GetMapping("/members")
    public List<MemberVO> members() { return identity.members(); }
    /**
     * 持有member.create的会话创建普通成员，需CSRF；成功201，400参数/401身份/403资格/409重名，不授予资源权。
     *
     * @param input 成员登录名、名称及初始密码JSON，必填
     *
     * @return 新成员公开视图，不含密码
     */
    @PostMapping("/members")
    @ResponseStatus(HttpStatus.CREATED)
    public MemberVO create(@RequestBody CreateMemberDTO input) { return identity.create(input); }
    /**
     * 持有member.status的会话启停普通成员，需CSRF；204成功，400空状态/404目标非法，立即影响既有会话。
     *
     * @param id 同企业普通成员UUID，不为空
     *
     * @param input enabled状态JSON，必填
     */
    @PatchMapping("/members/{id}/status")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void status(@PathVariable String id, @RequestBody MemberStatusDTO input) { identity.status(id, input); }
}
