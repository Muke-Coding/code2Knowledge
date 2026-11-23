package com.code2knowledge.task.controller;

import com.code2knowledge.task.service.TaskService;
import com.code2knowledge.task.domain.dto.CreateTaskDTO;
import com.code2knowledge.task.domain.dto.TaskControlDTO;
import com.code2knowledge.task.domain.vo.TaskVO;
import com.code2knowledge.task.domain.vo.TaskPageVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 浏览器私有来源预检入口；身份来自会话，所有写入需CSRF；只接受来源与设备引用，不接受脚本/凭证/绝对目录。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/tasks")
public class TaskController {
    /** 当前任务应用服务，不直接依赖Mapper或DO。 */
    private final TaskService service;
    /**
     * @param page 起始1的页码
     * @return 本人分页；401未登录/400参数；GET仅惰性结算到期，不跨所有者 */
    @GetMapping
    public TaskPageVO list(@RequestParam(defaultValue = "1") int page) { return service.list(page); }
    /**
     * @param input 名称、来源版本、设备、创建幂等键JSON
     * @return 201新任务或相同请求原任务；会话需source.analyze和来源范围、设备所有权及CSRF，400参数/403动作/404对象/409版本，无Git执行 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskVO create(@RequestBody CreateTaskDTO input) { return service.create(input); }
    /**
     * @param id 本人任务UUID
     * @return 本人当前状态；会话401/对象404，GET只结算到期，不含租约或源码 */
    @GetMapping("/{id}")
    public TaskVO get(@PathVariable String id) { return service.get(id); }
    /**
     * @param id 本人任务UUID
     * @return 全部历史尝试；会话401/对象404，GET仅结算到期，无跨所有者例外 */
    @GetMapping("/{id}/attempts")
    public List<TaskVO> attempts(@PathVariable String id) { return service.attempts(id); }
    /**
     * @param id 本人任务UUID
     * @param input 当前控制版本JSON
     * @return 取消后状态；会话及CSRF，401身份/404对象/409版本或终态；拒绝旧提交但不保证离线宿主物理停止 */
    @PostMapping("/{id}/cancel")
    public TaskVO cancel(@PathVariable String id, @RequestBody TaskControlDTO input) { return service.control(id, input, false); }
    /**
     * @param id 本人任务UUID
     * @param input 当前控制版本JSON
     * @return 新尝试状态；会话及CSRF并重新核验来源/设备，401身份/404对象/409版本或授权变化；不迁移设备 */
    @PostMapping("/{id}/retry")
    public TaskVO retry(@PathVariable String id, @RequestBody TaskControlDTO input) { return service.control(id, input, true); }
}
