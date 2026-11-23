package com.code2knowledge.runtime.controller;

import com.code2knowledge.runtime.service.ReadinessService;
import com.code2knowledge.runtime.domain.dto.*;
import com.code2knowledge.runtime.domain.vo.ReadinessVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;

/** 建议性就绪诊断接口；Web会话写入CSRF，运行时专用Bearer且不依赖Cookie，不上传模型配置。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
public class ReadinessController {
    /** 短事务诊断与逐项权限校验，不直接访问持久化对象。 */
    private final ReadinessService service;
    /**
     * 创建检查，需analysis.create、source.analyze及所有来源当前授权；不创建逆向任务。
     *
     * @param input 本人设备与明确来源版本，不为空
     *
     * @return 201短期检查；401身份、403动作或CSRF、404对象、409冲突
     */
    @PostMapping("/api/v1/readiness")
    @ResponseStatus(HttpStatus.CREATED)
    public ReadinessVO create(@RequestBody ReadinessCreateDTO input) { return service.create(input); }
    /**
     * 读取检查，身份与动作同创建，GET无执行副作用，无需CSRF。
     *
     * @param id 本人检查UUID
     *
     * @return 当前状态；401身份、403动作、404对象或撤权、409来源变化
     */
    @GetMapping("/api/v1/readiness/{id}")
    public ReadinessVO get(@PathVariable String id) { return service.get(id); }
    /**
     * 空闲设备单次领取，专用Bearer不使用Cookie，无CSRF。
     *
     * @param header 专用设备Authorization，缺失拒绝
     *
     * @return 固定来源；空id无检查，401凭证、403当前动作、404来源、409版本
     */
    @PostMapping("/runtime/v1/readiness/claim")
    public ReadinessVO claim(@RequestHeader(value="Authorization", required=false) String header) { return service.claim(header); }
    /**
     * 设备提交固定状态，无CSRF；不证明模型可连接或知识质量。
     *
     * @param header 专用Bearer，缺失拒绝
     *
     * @param id 当前设备检查UUID
     *
     * @param input 固定六项状态，不含日志和配置
     *
     * @return 完成状态；400输入、401身份、403动作、404对象、409过期或重复
     */
    @PostMapping("/runtime/v1/readiness/{id}/complete")
    public ReadinessVO complete(@RequestHeader(value="Authorization", required=false) String header, @PathVariable String id, @RequestBody ReadinessReportDTO input) { return service.complete(header, id, input); }
}
