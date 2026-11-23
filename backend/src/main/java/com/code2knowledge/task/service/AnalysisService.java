package com.code2knowledge.task.service;

import com.code2knowledge.task.mapper.*;
import com.code2knowledge.task.domain.dto.*;
import com.code2knowledge.task.domain.vo.*;
import com.code2knowledge.task.domain.entity.AnalysisSpecDO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.*;

/** 多来源逆向短事务编排；共享既有任务租约和私有设备容量，模型配置仅在设备本机，无模型/文件/对象IO。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class AnalysisService {
    /** 当前来源动作资格与企业互斥。 */
    private final IdentityService identity;
    /** 既有可靠尝试、控制及领取。 */
    private final TaskService tasks;
    /** 不可变业务范围与全部来源。 */
    private final AnalysisMapper mapper;
    /** 同一任务表的逆向分页。 */
    private final TaskMapper taskMapper;
    /** 当前逐项分析资格。 */
    private final SourceMapper sources;
    /**
     * @param input 明确多仓库、资料选择、范围与本人设备
     * @return 201语义的本人任务，相同请求原样返回
     * @throws ApiException 参数400/动作403/来源404/版本或幂等409；全部定义同事务 */
    @Transactional
    public AnalysisTaskVO create(AnalysisCreateDTO input) {
        AccountDO actor = identity.require(PermissionCodes.ANALYSIS_CREATE); identity.require(PermissionCodes.SOURCE_ANALYZE);
        if (input == null || input.getSources() == null || input.getSources().isEmpty() || input.getSources().size() > 16 || !("INCLUDE".equals(input.getDocumentsChoice()) || "NONE".equals(input.getDocumentsChoice()))) invalid();
        String name = IdentityService.text(input.getName(), 120, "任务名称");
        String product = knowledgeSlug(input.getProduct()), domain = knowledgeSlug(input.getDomain()), scope = IdentityService.text(input.getScope(), 2000, "业务范围");
        List<AnalysisSourceVO> selected = new ArrayList<>(); Set<String> ids = new HashSet<>(), aliases = new HashSet<>(); int documents = 0;
        for (AnalysisSourceDTO reference : input.getSources()) {
            if (reference == null || !ids.add(reference.getSourceId())) invalid(); String alias = slug(reference.getAlias()); if (!aliases.add(alias)) invalid();
            SourceVO source = sources.visible(actor.getTenantId(), reference.getSourceId(), actor.getId(), false, true);
            if (source == null) throw new ApiException(404, "NOT_FOUND", "来源不存在或无分析授权");
            if (reference.getRevision() == null || reference.getRevision() != source.getRevision()) throw new ApiException(409, "SOURCE_CHANGED", "来源已变化，请重新选择");
            if ("DOCUMENT".equals(source.getKind())) documents++;
            selected.add(new AnalysisSourceVO(source.getId(), source.getRevision(), alias, source.getKind(), source.getBranch(), "DOCUMENT".equals(source.getKind()) ? source.getLocator() : ""));
        }
        if (documents == selected.size() || ("INCLUDE".equals(input.getDocumentsChoice()) ? documents == 0 : documents != 0)) invalid();
        selected.sort(Comparator.comparing(AnalysisSourceVO::getAlias));
        com.code2knowledge.task.domain.entity.TaskDO previous = taskMapper.request(actor.getTenantId(), actor.getId(), input.getRequestId());
        if (previous != null) {
            AnalysisSpecDO spec = mapper.spec(previous.getId());
            if (spec == null || !Objects.equals(previous.getName(), name) || !Objects.equals(previous.getDeviceId(), input.getDeviceId()) || !spec.getProduct().equals(product) || !spec.getDomain().equals(domain) || !spec.getScope().equals(scope) || !spec.getDocumentsChoice().equals(input.getDocumentsChoice()) || !mapper.sources(previous.getId()).equals(selected)) throw new ApiException(409, "TASK_CONFLICT", "创建幂等键已用于其他输入");
            return get(previous.getId());
        }
        AnalysisSourceVO first = selected.stream().filter(value -> "REPOSITORY".equals(value.getKind())).findFirst().get();
        CreateTaskDTO base = new CreateTaskDTO(); base.setName(name); base.setDeviceId(input.getDeviceId()); base.setRequestId(input.getRequestId()); base.setSourceId(first.getSourceId()); base.setSourceRevision(first.getRevision());
        TaskVO task = tasks.createAnalysis(base); AnalysisSpecDO spec = new AnalysisSpecDO(); spec.setTaskId(task.getId()); spec.setProduct(product); spec.setDomain(domain); spec.setScope(scope); spec.setDocumentsChoice(input.getDocumentsChoice()); mapper.insert(spec);
        for (AnalysisSourceVO source : selected) mapper.source(task.getId(), source); return get(task.getId());
    }
    /**
     * @param page 从1开始页码
     * @return 本人任务分页；保留历史可见以便取消/重试，创建仍需当前授权
     * @throws ApiException 身份401/参数400 */
    @Transactional
    public AnalysisPageVO list(int page) {
        AccountDO actor = identity.require(PermissionCodes.ANALYSIS_READ); if (page < 1 || page > 100000) invalid();
        List<AnalysisTaskVO> result = new ArrayList<>(); for (com.code2knowledge.task.domain.entity.TaskDO row : taskMapper.listAnalysis(actor.getTenantId(), actor.getId(), (page - 1) * 20)) result.add(get(row.getId()));
        return new AnalysisPageVO(result, page, taskMapper.countAnalysis(actor.getTenantId(), actor.getId()));
    }
    /**
     * @param id 本人逆向任务UUID
     * @return 私有固定范围与当前尝试；不含租约或本地模型配置
     * @throws ApiException 不存在或非本人404 */
    @Transactional
    public AnalysisTaskVO get(String id) {
        TaskVO task = tasks.get(id); AnalysisSpecDO spec = mapper.spec(id); if (spec == null) throw new ApiException(404, "NOT_FOUND", "逆向任务不存在");
        String candidate = mapper.candidate(task.getAttemptId());
        return new AnalysisTaskVO(task.getId(), task.getSourceId(), task.getSourceName(), task.getSourceRevision(), task.getBranch(), task.getDeviceId(), task.getDeviceName(), task.getName(), task.getRevision(), task.getAttemptNumber(), task.getAttemptId(), task.getState(), task.getCommitId(), task.getArchiveSha256(), task.getFileCount(), task.getArchiveBytes(), task.getMessage(), task.getCreatedAt(), task.getUpdatedAt(), spec.getProduct(), spec.getDomain(), spec.getScope(), spec.getDocumentsChoice(), mapper.sources(id), candidate == null ? "" : candidate);
    }
    /**
     * @param id 本人逆向UUID
     * @param input 控制版本
     * @param retry 是否手动重试
     * @return 当前状态；与预检相同短事务fencing，重试重新核全部来源 */
    @Transactional
    public AnalysisTaskVO control(String id, TaskControlDTO input, boolean retry) { get(id); tasks.control(id, input, retry); return get(id); }
    /**
     * @param header 专用设备Bearer
     * @param input 版本1
     * @return 只含逆向固定输入的独立租约，不下发模型、命令或绝对路径
     * @throws ApiException 设备401/协议409 */
    @Transactional
    public AnalysisLeaseVO claim(String header, TaskClaimDTO input) {
        TaskLeaseVO lease = tasks.claimAnalysis(header, input); if (!lease.isAvailable()) return new AnalysisLeaseVO(false, "", "", "", 0, "", 0, "", "", "", "", "", Collections.emptyList());
        AnalysisSpecDO spec = mapper.spec(lease.getTaskId()); return new AnalysisLeaseVO(true, lease.getTaskId(), lease.getAttemptId(), lease.getLeaseId(), lease.getFence(), lease.getSourceId(), lease.getSourceRevision(), lease.getBranch(), spec.getProduct(), spec.getDomain(), spec.getScope(), spec.getDocumentsChoice(), mapper.sources(lease.getTaskId()));
    }
    /**
     * @param value 产品或业务域标识
     * @return 固定Skill支持的小写单短横分隔标识，最大80字符
     * @throws ApiException 不符契约400，在模型调用之前拒绝 */
    private String knowledgeSlug(String value) { if (value == null || value.length() > 80 || !value.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) invalid(); return value; }
    /**
     * @param value 用户材料slug
     * @return 1至80字符小写稳定别名
     * @throws ApiException 不接受路径/命令/空值400 */
    private String slug(String value) { if (value == null || !value.matches("[a-z0-9][a-z0-9_-]{0,79}")) invalid(); return value; }
    /** @throws ApiException 显式资料选择与来源不符时400，不推断业务范围 */
    private void invalid() { throw new ApiException(400, "INVALID_ANALYSIS", "请填写业务范围、稳定标识，并明确选择全部仓库及是否添加资料"); }
}
