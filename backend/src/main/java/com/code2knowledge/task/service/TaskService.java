package com.code2knowledge.task.service;

import com.code2knowledge.task.mapper.TaskMapper;
import com.code2knowledge.task.domain.entity.TaskDO;
import com.code2knowledge.task.domain.dto.CreateTaskDTO;
import com.code2knowledge.task.domain.dto.TaskControlDTO;
import com.code2knowledge.task.domain.dto.TaskClaimDTO;
import com.code2knowledge.task.domain.dto.TaskReportDTO;
import com.code2knowledge.task.domain.vo.TaskVO;
import com.code2knowledge.task.domain.vo.TaskPageVO;
import com.code2knowledge.task.domain.vo.TaskLeaseVO;
import com.code2knowledge.task.domain.vo.TaskAckVO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.runtime.service.RuntimeService;
import com.code2knowledge.runtime.mapper.RuntimeMapper;
import com.code2knowledge.runtime.domain.entity.DeviceDO;
import com.code2knowledge.runtime.domain.vo.DeviceVO;
import com.code2knowledge.authorization.mapper.AuthorizationMapper;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** 私有来源预检编排；事务锁序企业→账户→设备，容量1、租约45秒、过期惰性结算，取消/撤权拒绝旧提交。
 * 只存无正文来源清单；创建和提交幂等，无自动重试、软删除、事件、Agent或发布，不保证离线宿主物理停止。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class TaskService {
    /** 任务与尝试事实。 */
    private final TaskMapper mapper;
    /** 浏览器当前身份。 */
    private final IdentityService identity;
    /** 账户锁与事务审计。 */
    private final IdentityMapper accounts;
    /** 来源当前版本和逐项范围。 */
    private final SourceMapper sources;
    /** 角色动作与企业互斥。 */
    private final AuthorizationMapper authorization;
    /** 私有设备所有权。 */
    private final RuntimeMapper devices;
    /** 专用设备认证，禁止浏览器身份替代。 */
    private final RuntimeService runtime;
    /** 多来源当前授权，预检不增加额外来源。 */
    private final TaskSourceService taskSources;
    /** 区分逆向定义，防止旧预检协议提交模型成果。 */
    private final com.code2knowledge.task.mapper.AnalysisMapper analyses;
    /**
     * @param input 明确名称、来源版本、设备和幂等UUID
     * @return 本人新任务或同请求原任务
     * @throws ApiException 参数400/动作403/对象404/冲突409 */
    @Transactional
    public TaskVO create(CreateTaskDTO input) { return createBase(input, false); }
    /**
     * @param input 逆向领域已验证的基础输入
     * @return 仅供逆向服务同事务建立任务
     * @throws ApiException 缺逆向创建或分析资格403 */
    @Transactional
    public TaskVO createAnalysis(CreateTaskDTO input) { return createBase(input, true); }
    /**
     * @param input 显式基础输入
     * @param analysis true为逆向，false为预检
     * @return 当前类别任务
     * @throws ApiException 无动作403或来源/设备失效 */
    private TaskVO createBase(CreateTaskDTO input, boolean analysis) {
        AccountDO actor = identity.require(analysis ? PermissionCodes.ANALYSIS_CREATE : PermissionCodes.TASK_CREATE); identity.require(PermissionCodes.SOURCE_ANALYZE); lockOwner(actor);
        String name = IdentityService.text(input.getName(), 120, "任务名称"); uuid(input.getRequestId());
        TaskDO previous = mapper.request(actor.getTenantId(), actor.getId(), input.getRequestId());
        if (previous != null) {
            if (analyses.spec(previous.getId()) != null || !previous.getName().equals(name) || !previous.getSourceId().equals(input.getSourceId()) || !previous.getDeviceId().equals(input.getDeviceId()) || input.getSourceRevision() == null || previous.getSourceRevision() != input.getSourceRevision()) conflict("创建幂等键已用于其他配置");
            return view(previous);
        }
        SourceVO source = sources.visible(actor.getTenantId(), input.getSourceId(), actor.getId(), false, true);
        if (source == null || !"REPOSITORY".equals(source.getKind())) missing();
        if (input.getSourceRevision() == null || input.getSourceRevision() != source.getRevision()) conflict("来源已变化，请重新选择");
        DeviceVO device = device(actor, input.getDeviceId());
        TaskDO task = new TaskDO(); task.setId(UUID.randomUUID().toString()); task.setTenantId(actor.getTenantId()); task.setOwnerId(actor.getId()); task.setSourceId(source.getId()); task.setSourceName(source.getName()); task.setSourceRevision(source.getRevision()); task.setBranch(source.getBranch()); task.setDeviceId(device.getId()); task.setDeviceName(device.getName()); task.setName(name); task.setRequestId(input.getRequestId());
        mapper.insert(task); mapper.attempt(UUID.randomUUID().toString(), task.getId(), 1); accounts.audit(actor.getTenantId(), actor.getId(), "task.created", task.getId()); return view(owned(actor, task.getId()));
    }
    /**
     * @param page 从1开始页码
     * @return 本人分页；GET仅惰性结算到期
     * @throws ApiException 身份401/参数400 */
    @Transactional
    public TaskPageVO list(int page) {
        AccountDO actor = owner(); identity.require(PermissionCodes.TASK_READ); if (page < 1 || page > 100000) invalid(); mapper.expire(actor.getTenantId(), actor.getId());
        List<TaskVO> result = new ArrayList<>(); for (TaskDO task : mapper.list(actor.getTenantId(), actor.getId(), (page - 1) * 20)) result.add(view(task));
        return new TaskPageVO(result, page, mapper.count(actor.getTenantId(), actor.getId()));
    }
    /**
     * @param id 本人任务UUID
     * @return 当前任务，GET仅结算到期
     * @throws ApiException 身份401/隐藏对象404 */
    @Transactional
    public TaskVO get(String id) { AccountDO actor = owner(); mapper.expire(actor.getTenantId(), actor.getId()); TaskDO task = owned(actor, id); readPermission(task); return view(task); }
    /**
     * @param id 本人任务UUID
     * @return 全部尝试，新尝试在前，GET仅结算到期
     * @throws ApiException 隐藏对象404 */
    @Transactional
    public List<TaskVO> attempts(String id) {
        AccountDO actor = owner(); readPermission(owned(actor, id)); mapper.expire(actor.getTenantId(), actor.getId()); List<TaskVO> result = new ArrayList<>();
        for (TaskDO task : mapper.history(actor.getTenantId(), actor.getId(), id)) result.add(view(task)); return result;
    }
    /**
     * @param id 本人任务
     * @param input 当前控制版本
     * @param retry true新增尝试，false取消
     * @return 最新状态
     * @throws ApiException 身份401/对象404/版本或状态409；取消不保证物理停止 */
    @Transactional
    public TaskVO control(String id, TaskControlDTO input, boolean retry) {
        AccountDO actor = owner(); mapper.expire(actor.getTenantId(), actor.getId()); TaskDO task = owned(actor, id);
        identity.require(analyses.spec(id) == null ? (retry ? PermissionCodes.TASK_RETRY : PermissionCodes.TASK_CANCEL) : (retry ? PermissionCodes.ANALYSIS_RETRY : PermissionCodes.ANALYSIS_CANCEL));
        if (input.getRevision() == null || input.getRevision() != task.getRevision()) conflict("任务已变化，请刷新后重新确认");
        if (retry) {
            if (!("FAILED".equals(task.getState()) || "EXPIRED".equals(task.getState()) || "CANCELLED".equals(task.getState()))) conflict("仅失败、过期或取消任务可以重试");
            if (!eligible(task)) conflict("来源配置或分析授权已变化，请重新创建任务"); device(actor, task.getDeviceId()); mapper.bump(id, true); mapper.attempt(UUID.randomUUID().toString(), id, task.getAttemptNumber() + 1);
        } else {
            if ("CANCELLED".equals(task.getState())) return view(task);
            if (!active(task)) conflict("任务已结束，不能取消"); finish(task, "CANCELLED", "平台已取消；离线设备可能尚未停止"); mapper.bump(id, false);
        }
        accounts.audit(actor.getTenantId(), actor.getId(), retry ? "task.retried" : "task.cancelled", id); return view(owned(actor, id));
    }
    /**
     * @param header 设备Bearer
     * @param input 协议版本1
     * @return 原子容量1领取结果，无任务available=false
     * @throws ApiException 凭证401/版本409 */
    @Transactional
    public TaskLeaseVO claim(String header, TaskClaimDTO input) {
        return claimKind(header, input, false);
    }
    /**
     * @param header 专用设备Bearer
     * @param input 版本1；逆向领取独立路由，不让旧客户端误执行
     * @return 原子共享容量的租约
     * @throws ApiException 设备401/协议409 */
    @Transactional
    public TaskLeaseVO claimAnalysis(String header, TaskClaimDTO input) { return claimKind(header, input, true); }
    /**
     * @param header 设备Bearer
     * @param input 协议版本
     * @param analysis true仅逆向false仅预检
     * @return 原子容量1领取；调用方事务保护 */
    private TaskLeaseVO claimKind(String header, TaskClaimDTO input, boolean analysis) {
        DeviceDO device = runtime.taskDevice(header); if (!"1".equals(input.getVersion())) conflict("任务协议不支持，请升级运行时"); mapper.expire(device.getTenantId(), device.getOwnerId());
        if (mapper.active(device.getTenantId(), device.getId()) > 0) return empty();
        for (TaskDO task : (analysis ? mapper.pendingAnalysis(device.getTenantId(), device.getOwnerId(), device.getId()) : mapper.pending(device.getTenantId(), device.getOwnerId(), device.getId()))) {
            if (!eligible(task)) { finish(task, "FAILED", "来源配置或分析授权已失效"); continue; }
            String lease = UUID.randomUUID().toString();
            if (mapper.lease(task.getAttemptId(), lease) == 1) { accounts.audit(task.getTenantId(), task.getOwnerId(), "task.leased", task.getId()); return new TaskLeaseVO(true, task.getId(), task.getAttemptId(), lease, task.getAttemptNumber(), task.getSourceId(), task.getSourceRevision(), task.getBranch()); }
        }
        return empty();
    }
    /**
     * 重新认证设备和当前动作/范围/版本/租约，valid=false同事务结算，不抛异常回滚失效状态；同结果重放幂等。
     *
     * @param header 设备Bearer，不记录
     * @param id 任务UUID
     * @param input 尝试、租约、清单或固定失败码
     * @param complete true提交false续租
     *
     * @return 当前确认，valid=false必须停止，不允许旧尝试继续提交
     *
     * @throws ApiException 身份401/对象404/字段400/不同终态结果409
     */
    @Transactional
    public TaskAckVO report(String header, String id, TaskReportDTO input, boolean complete) {
        DeviceDO device = runtime.taskDevice(header); mapper.expire(device.getTenantId(), device.getOwnerId()); TaskDO task = mapper.find(device.getTenantId(), device.getOwnerId(), id);
        if (task == null || !device.getId().equals(task.getDeviceId())) missing();
        if (input.getFence() == null || input.getFence() != task.getAttemptNumber() || !task.getAttemptId().equals(input.getAttemptId()) || !task.getLeaseId().equals(input.getLeaseId())) return new TaskAckVO(false, "REJECTED");
        if (!eligible(task)) { if (active(task)) finish(task, "FAILED", "来源配置或分析授权已失效"); return new TaskAckVO(false, "REJECTED"); }
        if ("SUCCEEDED".equals(task.getState()) || "FAILED".equals(task.getState())) {
            if (!complete) return new TaskAckVO(false, task.getState()); validateReport(input);
            if (task.getState().equals(input.getOutcome()) && task.getCommitId().equals(input.getCommitId()) && task.getArchiveSha256().equals(input.getArchiveSha256()) && task.getFileCount() == input.getFileCount() && task.getArchiveBytes() == input.getArchiveBytes() && task.getMessage().equals(reportMessage(input, task))) return new TaskAckVO(true, task.getState());
            conflict("该尝试已提交不同结果，禁止覆盖");
        }
        if (complete && analyses.spec(task.getId()) != null && !"FAILED".equals(input.getOutcome())) invalid();
        if (!"RUNNING".equals(task.getState()) || task.isExpired()) return new TaskAckVO(false, task.getState());
        if (!complete) return new TaskAckVO(mapper.renew(task.getAttemptId()) == 1, "RUNNING"); validateReport(input);
        if (mapper.finish(task.getAttemptId(), input.getOutcome(), reportMessage(input, task), input.getCommitId(), input.getArchiveSha256(), input.getFileCount(), input.getArchiveBytes()) == 0) return new TaskAckVO(false, "EXPIRED");
        accounts.audit(task.getTenantId(), task.getOwnerId(), "task.completed", task.getId()); return new TaskAckVO(true, input.getOutcome());
    }
    /**
     * @param task 当前任务
     * @return 动作、来源版本、类型及逐项范围全部有效，管理不绕过 */
    private boolean eligible(TaskDO task) {
        if (!authorization.effective(task.getTenantId(), task.getOwnerId()).contains(PermissionCodes.SOURCE_ANALYZE) || !authorization.effective(task.getTenantId(), task.getOwnerId()).contains(analyses.spec(task.getId()) == null ? PermissionCodes.TASK_CREATE : PermissionCodes.ANALYSIS_CREATE)) return false;
        SourceVO source = sources.visible(task.getTenantId(), task.getSourceId(), task.getOwnerId(), false, true);
        return taskSources.eligible(task) && source != null && source.getRevision() == task.getSourceRevision() && source.getBranch().equals(task.getBranch()) && "REPOSITORY".equals(source.getKind());
    }
    /**
     * @param actor 当前身份
     * @param id 本人设备UUID
     * @return 有效设备，可离线排队
     * @throws ApiException 非本人404/已失效409 */
    private DeviceVO device(AccountDO actor, String id) {
        DeviceDO locked = devices.lockOwned(actor.getTenantId(), actor.getId(), id); if (locked == null) missing();
        for (DeviceVO value : devices.list(actor.getTenantId(), actor.getId())) if (value.getId().equals(id)) { if ("REVOKED".equals(value.getStatus())) conflict("设备已失效，请重新选择"); return value; }
        missing(); return null;
    }
    /**
     * @return 有效本人身份，企业→账户锁；撤权后仍可查看历史和取消
     * @throws ApiException 身份401 */
    private AccountDO owner() { AccountDO actor = identity.current(); authorization.lockTenant(actor.getTenantId()); actor = identity.current(); lockOwner(actor); return actor; }
    /**
     * @param actor 当前身份
     * @throws ApiException 等待锁期间失效401 */
    private void lockOwner(AccountDO actor) { AccountDO latest = accounts.lockById(actor.getId()); if (latest == null || !latest.isEnabled() || latest.getAuthVersion() != actor.getAuthVersion()) throw new ApiException(401, "UNAUTHENTICATED", "请重新登录"); }
    /**
     * @param actor 当前身份
     * @param id 本人任务
     * @return 私有任务事实
     * @throws ApiException 隐藏对象404 */
    private TaskDO owned(AccountDO actor, String id) { TaskDO task = mapper.find(actor.getTenantId(), actor.getId(), id); if (task == null) missing(); return task; }
    /**
     * @param task 当前尝试
     * @return 是否仍可取消或结算 */
    private boolean active(TaskDO task) { return "QUEUED".equals(task.getState()) || "RUNNING".equals(task.getState()); }
    /**
     * @param task 当前尝试
     * @param state 固定终态
     * @param message 固定中文提示，不含设备日志 */
    private void finish(TaskDO task, String state, String message) { mapper.finish(task.getAttemptId(), state, message, "", "", 0, 0); }
    /**
     * @param input 设备报告
     * @throws ApiException 非允许字段400，不回显材料 */
    private void validateReport(TaskReportDTO input) {
        if (input.getFileCount() == null || input.getArchiveBytes() == null || input.getCommitId() == null || input.getArchiveSha256() == null || input.getFailureCode() == null) invalid();
        if ("SUCCEEDED".equals(input.getOutcome())) {
            if (!input.getCommitId().matches("([a-f0-9]{40}|[a-f0-9]{64})") || !input.getArchiveSha256().matches("[a-f0-9]{64}") || input.getFileCount() < 0 || input.getFileCount() > 100000 || input.getArchiveBytes() < 0 || input.getArchiveBytes() > 268435456L || !input.getFailureCode().isEmpty()) invalid();
        } else if ("FAILED".equals(input.getOutcome())) {
            if (!input.getCommitId().isEmpty() || !input.getArchiveSha256().isEmpty() || input.getFileCount() != 0 || input.getArchiveBytes() != 0 || !("BINDING_REQUIRED".equals(input.getFailureCode()) || "SOURCE_CHANGED".equals(input.getFailureCode()) || "PREFLIGHT_FAILED".equals(input.getFailureCode()))) invalid();
        } else invalid();
    }
    /**
     * @param input 已校验报告
     * @param task 当前任务类型
     * @return 固定状态说明，不接收任意日志 */
    private String reportMessage(TaskReportDTO input, TaskDO task) {
        if ("SUCCEEDED".equals(input.getOutcome())) return "来源清单已接收；未执行逆向或发布";
        if ("BINDING_REQUIRED".equals(input.getFailureCode())) return "设备未显式绑定该来源，请绑定后手动重试";
        if ("SOURCE_CHANGED".equals(input.getFailureCode())) return "本机来源绑定版本不匹配，请核对后重新绑定";
        return analyses.spec(task.getId()) == null ? "本地预检失败，请在设备检查分支、仓库或隔离限制" : "逆向执行失败，请在设备检查来源、材料限制、专用模型配置及产物契约";
    }
    /**
     * @param task 内部事实
     * @return 去掉租约、企业、幂等键的公开视图 */
    private TaskVO view(TaskDO task) { return new TaskVO(task.getId(), task.getSourceId(), task.getSourceName(), task.getSourceRevision(), task.getBranch(), task.getDeviceId(), task.getDeviceName(), task.getName(), task.getRevision(), task.getAttemptNumber(), task.getAttemptId(), task.getState(), task.getCommitId(), task.getArchiveSha256(), task.getFileCount(), task.getArchiveBytes(), task.getMessage(), task.getCreatedAt(), task.getUpdatedAt()); }
    /** @return 无任务协议，不含隐藏数量 */
    private TaskLeaseVO empty() { return new TaskLeaseVO(false, "", "", "", 0, "", 0, ""); }
    /**
     * @param value 客户端创建幂等UUID
     * @throws ApiException 非法格式400 */
    private void uuid(String value) { if (value == null || !value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")) invalid(); }
    /**
     * @param message 固定恢复提示
     * @throws ApiException 409，不自动覆盖或重试 */
    private void conflict(String message) { throw new ApiException(409, "TASK_CONFLICT", message); }
    /** @throws ApiException 404，不泄漏他人任务或设备 */
    private void missing() { throw new ApiException(404, "NOT_FOUND", "任务或关联对象不存在或无权访问"); }
    /** @throws ApiException 400，不回显设备输入 */
    private void invalid() { throw new ApiException(400, "INVALID_TASK", "任务协议字段不合法，请检查客户端与输入"); }
    /**
     * @param task 已核所有者的任务
     * @throws ApiException 当前类别历史读取动作失效403；不以预检读取替代逆向读取 */
    private void readPermission(TaskDO task) { identity.require(analyses.spec(task.getId()) == null ? PermissionCodes.TASK_READ : PermissionCodes.ANALYSIS_READ); }
}
