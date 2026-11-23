package com.code2knowledge.task.service;

import com.code2knowledge.task.mapper.AnalysisMapper;
import com.code2knowledge.task.mapper.TaskMapper;
import com.code2knowledge.task.domain.entity.TaskDO;
import com.code2knowledge.task.domain.dto.ExecutionReceiptDTO;
import com.code2knowledge.task.domain.vo.AnalysisSourceVO;
import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.runtime.domain.entity.DeviceDO;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import lombok.RequiredArgsConstructor;

/** 全部逆向来源与尝试检查；调用方必须已在短事务锁企业/主体，禁止执行文件、模型或对象IO。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class TaskSourceService {
    /** 不可变逆向来源。 */
    private final AnalysisMapper analyses;
    /** 当前逐项来源授权。 */
    private final SourceMapper sources;
    /** 当前尝试与数据库租约时钟。 */
    private final TaskMapper tasks;
    /**
     * @param task 已核本人的任务
     * @return 预检无额外来源时true；逆向全部当前范围与快照一致才true */
    public boolean eligible(TaskDO task) {
        if (analyses.spec(task.getId()) == null) return true;
        for (AnalysisSourceVO expected : analyses.sources(task.getId())) {
            SourceVO current = sources.visible(task.getTenantId(), expected.getSourceId(), task.getOwnerId(), false, true);
            if (current == null || current.getRevision() != expected.getRevision() || !current.getKind().equals(expected.getKind()) || !current.getBranch().equals(expected.getBranch()) || ("DOCUMENT".equals(current.getKind()) && !current.getLocator().equals(expected.getLocator()))) return false;
        }
        return true;
    }
    /**
     * @param device 已锁定认证的私有设备
     * @param receipt 当前尝试租约
     * @return 仍在途或已成功的同一逆向尝试；幂等另由候选比较
     * @throws ApiException 旧尝试/取消/到期/越权均409或404 */
    public TaskDO execution(DeviceDO device, ExecutionReceiptDTO receipt) {
        if (receipt == null || receipt.getTaskId() == null) throw new ApiException(400, "INVALID_EXECUTION", "缺少逆向尝试凭证");
        tasks.expire(device.getTenantId(), device.getOwnerId());
        TaskDO task = tasks.find(device.getTenantId(), device.getOwnerId(), receipt.getTaskId());
        if (task == null || analyses.spec(task.getId()) == null || !task.getDeviceId().equals(device.getId()) || !eligible(task)) throw new ApiException(404, "NOT_FOUND", "逆向任务或来源不可用");
        if (!task.getAttemptId().equals(receipt.getAttemptId()) || !task.getLeaseId().equals(receipt.getLeaseId()) || receipt.getFence() == null || task.getAttemptNumber() != receipt.getFence() || !("RUNNING".equals(task.getState()) || "SUCCEEDED".equals(task.getState())) || ("RUNNING".equals(task.getState()) && task.isExpired())) throw new ApiException(409, "EXECUTION_REJECTED", "逆向尝试已失效，禁止回传旧结果");
        return task;
    }
}
