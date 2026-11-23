package com.code2knowledge.task.controller;

import com.code2knowledge.task.service.TaskService;
import com.code2knowledge.task.domain.dto.TaskClaimDTO;
import com.code2knowledge.task.domain.dto.TaskReportDTO;
import com.code2knowledge.task.domain.vo.TaskLeaseVO;
import com.code2knowledge.task.domain.vo.TaskAckVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import lombok.RequiredArgsConstructor;

/** 无Cookie设备任务协议入口；专用Bearer来源于已配对私有设备，禁止浏览器会话替代；无CSRF但每次校验来源授权与租约。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/runtime/v1/tasks")
public class TaskRuntimeController {
    /** 受控任务服务，统一租约与fencing。 */
    private final TaskService service;
    /**
     * @param header 设备Bearer，缺失401
     * @param input 协议版本JSON
     * @return 200可用租约或空租约；401凭证/409版本；原子占容量，不读取文件 */
    @PostMapping("/claim")
    public TaskLeaseVO claim(@RequestHeader(value = "Authorization", required = false) String header, @RequestBody TaskClaimDTO input) { return service.claim(header, input); }
    /**
     * @param header 设备Bearer
     * @param id 任务UUID
     * @param input 当前尝试/租约/fenceJSON
     * @return 200续租确认，valid=false需终止；401身份/404对象，无源码读取副作用 */
    @PostMapping("/{id}/renew")
    public TaskAckVO renew(@RequestHeader(value = "Authorization", required = false) String header, @PathVariable String id, @RequestBody TaskReportDTO input) { return service.report(header, id, input, false); }
    /**
     * @param header 设备Bearer
     * @param id 任务UUID
     * @param input 有界来源清单/固定失败码JSON
     * @return 200接收确认，重复相同结果幂等；401身份/404对象/400契约/409不同终态；只存元数据不发布知识 */
    @PostMapping("/{id}/complete")
    public TaskAckVO complete(@RequestHeader(value = "Authorization", required = false) String header, @PathVariable String id, @RequestBody TaskReportDTO input) { return service.report(header, id, input, true); }
}
