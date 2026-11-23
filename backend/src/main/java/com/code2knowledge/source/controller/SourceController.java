package com.code2knowledge.source.controller;

import com.code2knowledge.source.service.SourceService;
import com.code2knowledge.source.domain.dto.SaveSourceDTO;
import com.code2knowledge.source.domain.dto.SourceGrantDTO;
import com.code2knowledge.source.domain.dto.SourceRevisionDTO;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.source.domain.vo.SourcePageVO;
import com.code2knowledge.source.domain.vo.SourceGrantVO;
import com.code2knowledge.source.domain.vo.SourceCheckVO;
import com.code2knowledge.catalog.domain.vo.SystemVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 浏览器来源登记入口；企业来自当前会话，未知或跨企业对象404；所有写请求需CSRF，不直接访问Mapper/DO。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/sources")
public class SourceController {
    /** 来源用例服务，统一身份、动作和资源版本判定。 */
    private final SourceService service;
    /**
     * @param page 从1开始页码，默认1
     * @param keyword 来源名检索，默认空串
     * @return 需source.read，范围由source.read.all或逐项ACL限制的分页元数据；GET无副作用，400参数/401身份/403动作 */
    @GetMapping
    public SourcePageVO list(@RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "") String keyword) { return service.list(page, keyword); }
    /** @return source.create或source.update绑定选择的同企业系统摘要；GET无副作用，401身份/403动作，不授予来源或内容权 */
    @GetMapping("/system-options")
    public List<SystemVO> systems() { return service.systems(); }
    /**
     * @param id 来源UUID
     * @return 当前可见元数据；GET无副作用，401身份/404隐藏，无文件或网络探测 */
    @GetMapping("/{id}")
    public SourceVO get(@PathVariable String id) { return service.get(id); }
    /**
     * @param id 来源UUID
     * @return source.create或source.update可见绑定摘要；GET无副作用，401身份/403动作/404隐藏 */
    @GetMapping("/{id}/bindings")
    public List<SystemVO> bindings(@PathVariable String id) { return service.bindings(id); }
    /**
     * @param input 明确配置与关联系统JSON
     * @return 201来源；需source.create及CSRF，400参数/401身份/403动作/404绑定/409重复；写审计但不读取原料 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SourceVO create(@RequestBody SaveSourceDTO input) { return service.create(input); }
    /**
     * @param id 来源UUID
     * @param input 完整配置与当前revision的JSON
     * @return 更新来源；需source.update及CSRF，400参数/401身份/403动作/404隐藏/409冲突；实际变化使旧范围授权失效 */
    @PutMapping("/{id}")
    public SourceVO update(@PathVariable String id, @RequestBody SaveSourceDTO input) { return service.update(id, input); }
    /**
     * @param id 来源UUID
     * @return source.grant成员授权含过期状态；GET无副作用，401身份/403动作/404隐藏 */
    @GetMapping("/{id}/grants")
    public List<SourceGrantVO> grants(@PathVariable String id) { return service.grants(id); }
    /**
     * @param id 来源UUID
     * @param input 同企业成员及当前来源版本JSON
     * @param allow true授予false撤销
     * @throws com.code2knowledge.common.exception.ApiException 400参数/401身份/403动作/404隐藏/409版本或停用；需source.grant及CSRF，204幂等变更并审计，不授予角色动作 */
    @PutMapping("/{id}/grants/{allow}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void permission(@PathVariable String id, @RequestBody SourceGrantDTO input, @PathVariable boolean allow) { service.permission(id, input, allow); }
    /**
     * @param id 来源UUID
     * @param input 明确当前revision的JSON
     * @return 200资格检查；需source.analyze及逐项ACL和CSRF，400参数/401身份/403动作/404隐藏/409版本；不创建任务、无文件读取或模型请求 */
    @PostMapping("/{id}/analysis-check")
    public SourceCheckVO check(@PathVariable String id, @RequestBody SourceRevisionDTO input) { return service.check(id, input); }
    /**
     * 当前会话仅启停来源，CSRF及source.status；不改变定位或绑定，实际变更使旧授权失效。
     *
     * @param id 当前企业来源UUID
     *
     * @param input 启停和版本JSON，不能为空
     *
     * @return 200新来源；400参数、401身份、403动作、404目标、409版本冲突
     */
    @PutMapping("/{id}/status")
    public SourceVO status(@PathVariable String id, @RequestBody com.code2knowledge.source.domain.dto.SourceStatusDTO input) { return service.status(id, input); }
}
