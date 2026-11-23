package com.code2knowledge.catalog.controller;

import com.code2knowledge.catalog.service.CatalogService;
import com.code2knowledge.catalog.domain.dto.*;
import com.code2knowledge.catalog.domain.vo.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 系统目录HTTP入口；会话解析企业，管理资格不等于知识或来源阅读权限。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/systems")
public class CatalogController {
    /** 目录与目录读取授权服务，不依赖持久化对象。 */
    private final CatalogService catalog;
    /** @return 当前可见目录数组，需会话身份，401未登录；GET无需CSRF，不返回隐藏数量 */
    @GetMapping
    public List<SystemVO> list() { return catalog.list(); }
    /**
     * @param id 系统UUID，不为空
     * @return 当前可读目录；需会话，404隐藏不存在或越权，无副作用 */
    @GetMapping("/{id}")
    public SystemVO get(@PathVariable String id) { return catalog.get(id); }
    /**
     * 持有catalog.create的会话创建目录，需CSRF；201成功，400参数/403资格/409重名，无隐式成员授权。
     *
     * @param input 系统名称及描述JSON，不为空
     *
     * @return 新目录元数据，不为空
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SystemVO create(@RequestBody CreateSystemDTO input) { return catalog.create(input); }
    /**
     * @param id 同企业系统UUID，不为空
     * @return 读取授权列表，需catalog.grant会话，401/403/404，无副作用 */
    @GetMapping("/{id}/grants")
    public List<GrantVO> grants(@PathVariable String id) { return catalog.grants(id); }
    /**
     * 持有catalog.grant的会话幂等授予目录资源范围（不授予catalog.read动作），需CSRF；204成功，403资格/404跨企业或目标非法。
     *
     * @param id 同企业系统UUID，不为空
     *
     * @param input 同企业普通成员ID，不为空
     */
    @PostMapping("/{id}/grants")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void grant(@PathVariable String id, @RequestBody GrantDTO input) { catalog.permission(id, input.getMemberId(), true); }
    /**
     * 持有catalog.grant的会话幂等撤销目录资源范围（不撤销catalog.read动作），需CSRF；204成功，403资格/404非法目标，下一次读取立即生效。
     *
     * @param id 同企业系统UUID，不为空
     *
     * @param memberId 同企业普通成员UUID，不为空
     */
    @DeleteMapping("/{id}/grants/{memberId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable String id, @PathVariable String memberId) { catalog.permission(id, memberId, false); }
}
