package com.code2knowledge.task.controller;

import com.code2knowledge.task.service.AnalysisService;
import com.code2knowledge.task.domain.dto.*;
import com.code2knowledge.task.domain.vo.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;

/** 多仓库及资料逆向Web入口；会话认证，所有写入CSRF，模型配置不属于本接口；无共享或管理员越权。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/analyses")
public class AnalysisController {
    /** 短事务业务服务，Controller不访问Mapper或实体。 */
    private final AnalysisService service;
    /**
     * @param page 起始1页码
     * @return 本人分页，401身份/400参数；GET只结算到期，不触发执行 */
    @GetMapping
    public AnalysisPageVO list(@RequestParam(defaultValue = "1") int page) { return service.list(page); }
    /**
     * @param input 范围、全部来源版本、显式资料选择与私有设备
     * @return 201新任务或相同请求原任务；CSRF与source.analyze及逐项授权，400参数/403动作/404对象/409版本，排队不直接调用模型 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AnalysisTaskVO create(@RequestBody AnalysisCreateDTO input) { return service.create(input); }
    /**
     * @param id 本人任务UUID
     * @return 当前任务；401身份/404对象，GET无执行副作用，不返回模型配置 */
    @GetMapping("/{id}")
    public AnalysisTaskVO get(@PathVariable String id) { return service.get(id); }
    /**
     * @param id 本人任务
     * @param input 当前控制版本
     * @return 取消后状态；会话/CSRF，404对象/409版本，立即拒绝旧结果但不能保证离线设备物理停止 */
    @PostMapping("/{id}/cancel")
    public AnalysisTaskVO cancel(@PathVariable String id, @RequestBody TaskControlDTO input) { return service.control(id, input, false); }
    /**
     * @param id 本人任务
     * @param input 当前控制版本
     * @return 新尝试；会话/CSRF及全部当前来源授权，404对象/409版本，不自动迁移或换模型 */
    @PostMapping("/{id}/retry")
    public AnalysisTaskVO retry(@PathVariable String id, @RequestBody TaskControlDTO input) { return service.control(id, input, true); }
}
