package com.code2knowledge.runtime.controller;

import com.code2knowledge.runtime.service.RuntimeService;
import com.code2knowledge.runtime.domain.dto.RedeemDTO;
import com.code2knowledge.runtime.domain.vo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

/** 设备配对与心跳入口，不建立用户会话；任务和诊断由各自专用协议控制器校验，不授权浏览器业务API。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/runtime/v1")
public class RuntimeController {
    /** 接入服务，验证码/专用Bearer而非浏览器会话。 */
    private final RuntimeService runtime;
    /**
     * 设备使用配对码换专用凭证；无Cookie认证，不需CSRF；201成功、400输入、401无效、409协议、429限速。
     *
     * @param input 单次码及自报元数据，不为空，禁止日志记录
     *
     * @return 仅本次返回的设备凭证，调用端须安全持久化，不为空
     */
    @PostMapping("/pair")
    @ResponseStatus(HttpStatus.CREATED)
    public DeviceCredentialVO redeem(@RequestBody RedeemDTO input) { return runtime.redeem(input); }
    /**
     * 设备主动心跳；只接受Authorization Bearer，无Cookie认证，不需CSRF；200确认、401失效。
     *
     * @param authorization 设备专用Bearer，缺失为null且被拒绝，不记录
     *
     * @return 当前设备心跳确认，不为空
     */
    @PostMapping("/heartbeat")
    public HeartbeatVO heartbeat(@RequestHeader(value="Authorization", required=false) String authorization) { return runtime.heartbeat(authorization); }
}
