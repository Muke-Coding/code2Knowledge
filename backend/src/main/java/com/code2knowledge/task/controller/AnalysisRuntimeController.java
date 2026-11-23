package com.code2knowledge.task.controller;

import com.code2knowledge.task.service.AnalysisService;
import com.code2knowledge.task.domain.dto.TaskClaimDTO;
import com.code2knowledge.task.domain.vo.AnalysisLeaseVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import lombok.RequiredArgsConstructor;

/** 逆向领取独立设备路由；只认证设备Bearer、不接受Cookie，故无CSRF；同设备预检和逆向共享容量1。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
public class AnalysisRuntimeController {
    /** 原子领取与当前逐项授权。 */
    private final AnalysisService service;
    /**
     * @param header 专用设备Bearer，缺失401
     * @param input 版本1
     * @return 固定全部来源与范围，协议409；无模型配置/凭证/脚本，领取产生45秒租约 */
    @PostMapping("/runtime/v1/analyses/claim")
    public AnalysisLeaseVO claim(@RequestHeader(value = "Authorization", required = false) String header, @RequestBody TaskClaimDTO input) { return service.claim(header, input); }
}
