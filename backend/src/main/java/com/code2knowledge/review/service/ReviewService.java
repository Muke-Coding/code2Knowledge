package com.code2knowledge.review.service;

import com.code2knowledge.review.mapper.ReviewMapper;
import com.code2knowledge.review.domain.entity.ReviewDO;
import com.code2knowledge.review.domain.dto.SubmitReviewDTO;
import com.code2knowledge.review.domain.dto.DecideReviewDTO;
import com.code2knowledge.review.domain.vo.ReviewVO;
import com.code2knowledge.review.domain.vo.ReviewPageVO;
import com.code2knowledge.review.domain.vo.ReviewerVO;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.candidate.service.CandidateAccessService;
import com.code2knowledge.candidate.domain.entity.CandidateDO;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.List;
import java.util.ArrayList;
import java.util.UUID;

/** 审核短事务编排；先锁企业再重查角色及所有来源，幂等送审/CAS决定与审计原子提交，不执行对象IO或发布。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class ReviewService {
    /** 当前可信身份与企业锁。 */
    private final IdentityService identity;
    /** 审核SQL边界，逐项过滤来源。 */
    private final ReviewMapper mapper;
    /** 候选所有者授权；审核不能任意选择他人原包。 */
    private final CandidateAccessService candidates;
    /** 审计只记录身份和审核ID，不含正文意见。 */
    private final IdentityMapper audit;
    /**
     *
     * @param input 候选/审核人/幂等键
     *
     * @return 同输入幂等原结果；自审仍需审核动作
     *
     * @throws ApiException 参数400、无动作403、对象404、不同输入/重复在途409；不改变候选
     */
    @Transactional
    public ReviewVO submit(SubmitReviewDTO input) {
        identity.require(PermissionCodes.REVIEW_SUBMIT);
        AccountDO actor = identity.require(PermissionCodes.REVIEW_READ); identity.require(PermissionCodes.SOURCE_ANALYZE);
        if (input == null) invalid(); uuid(input.getRequestId()); uuid(input.getCandidateId()); uuid(input.getReviewerId());
        CandidateDO candidate = candidates.readable(input.getCandidateId());
        ReviewDO previous = mapper.request(actor.getTenantId(), actor.getId(), input.getRequestId());
        if (previous != null) {
            if (!previous.getCandidateId().equals(input.getCandidateId()) || !previous.getReviewerId().equals(input.getReviewerId())) conflict();
            return get(previous.getId());
        }
        if (mapper.eligible(actor.getTenantId(), candidate.getId(), input.getReviewerId()) != 1) throw new ApiException(404, "REVIEWER_UNAVAILABLE", "审核人不存在或缺少当前审核及来源权限");
        if (mapper.pending(actor.getTenantId(), candidate.getId()) != 0) conflict();
        ReviewDO value = new ReviewDO(); value.setId(UUID.randomUUID().toString()); value.setTenantId(actor.getTenantId()); value.setCandidateId(candidate.getId()); value.setDigest(candidate.getDigest()); value.setSubmitterId(actor.getId()); value.setReviewerId(input.getReviewerId()); value.setMethod(actor.getId().equals(input.getReviewerId()) ? "SELF" : "ASSIGNED"); value.setRequestId(input.getRequestId());
        mapper.insert(value); audit.audit(actor.getTenantId(), actor.getId(), "review.submitted", value.getId()); return get(value.getId());
    }
    /**
     *
     * @param candidateId 本人候选
     *
     * @param keyword 姓名搜索，空串有效
     *
     * @param page 起始1
     *
     * @return 最多20个实际可选成员摘要，可选本人，不授予范围
     *
     * @throws ApiException 403动作/404候选/400分页
     */
    @Transactional
    public List<ReviewerVO> reviewers(String candidateId, String keyword, int page) {
        identity.require(PermissionCodes.REVIEW_SUBMIT);
        AccountDO actor = identity.require(PermissionCodes.REVIEW_READ); identity.require(PermissionCodes.SOURCE_ANALYZE); candidates.readable(candidateId); page(page);
        if (keyword == null || keyword.length() > 80) invalid(); return mapper.reviewers(actor.getTenantId(), candidateId, keyword.trim(), (page - 1) * 20);
    }
    /**
     *
     * @param page 起始1
     *
     * @return 当前全部来源有效的本人提交/受派审核分页
     *
     * @throws ApiException 401身份/403分析动作/400页码
     */
    @Transactional
    public ReviewPageVO list(int page) {
        AccountDO actor = identity.require(PermissionCodes.REVIEW_READ); identity.require(PermissionCodes.SOURCE_ANALYZE); page(page); List<ReviewVO> rows = new ArrayList<>(); for (ReviewDO item : mapper.list(actor.getTenantId(), actor.getId(), (page - 1) * 20)) rows.add(view(item)); return new ReviewPageVO(rows, page, mapper.count(actor.getTenantId(), actor.getId()));
    }
    /**
     *
     * @param id 审核UUID
     *
     * @return 本人当前范围内快照，管理员无例外
     *
     * @throws ApiException 401/403/404
     */
    @Transactional
    public ReviewVO get(String id) { AccountDO actor = identity.require(PermissionCodes.REVIEW_READ); identity.require(PermissionCodes.SOURCE_ANALYZE); return view(visible(actor, id)); }
    /**
     *
     * @param id 受派审核UUID
     *
     * @param input 期望版本与意见
     *
     * @return 当前决定；相同revision重放同决定与意见幂等
     *
     * @throws ApiException 参数400/动作403/对象404/冲突409；同事务审计
     */
    @Transactional
    public ReviewVO decide(String id, DecideReviewDTO input) {
        AccountDO actor = identity.require(PermissionCodes.REVIEW_DECIDE); identity.require(PermissionCodes.REVIEW_READ); ReviewDO value = visible(actor, id);
        if (!value.getReviewerId().equals(actor.getId())) throw new ApiException(404, "NOT_FOUND", "审核不存在或不可操作");
        if (input == null || input.getRevision() == null || input.getRevision() < 0 || !("CONFIRMED".equals(input.getDecision()) || "REJECTED".equals(input.getDecision()))) invalid();
        String comment = IdentityService.text(input.getComment(), 2000, "审核意见");
        if (!"PENDING".equals(value.getState())) {
            if (value.getRevision() == input.getRevision() + 1 && value.getState().equals(input.getDecision()) && value.getComment().equals(comment)) return view(value); conflict();
        }
        if (value.getRevision() != input.getRevision() || mapper.eligible(actor.getTenantId(), value.getCandidateId(), actor.getId()) != 1) conflict();
        value.setState(input.getDecision()); value.setComment(comment); if (mapper.decide(value) != 1) conflict(); audit.audit(actor.getTenantId(), actor.getId(), "review." + input.getDecision().toLowerCase(java.util.Locale.ROOT), id); return get(id);
    }
    /**
     *
     * @param id 当前可见审核
     *
     * @return 只供事务外对象读取的不可变候选引用；不授权下载
     *
     * @throws ApiException 无当前范围404或摘要异常503
     */
    @Transactional
    public CandidateDO readable(String id) {
        AccountDO actor = identity.require(PermissionCodes.REVIEW_READ); identity.require(PermissionCodes.SOURCE_ANALYZE); ReviewDO value = visible(actor, id); CandidateDO candidate = mapper.candidate(actor.getTenantId(), value.getCandidateId());
        if (candidate == null || !candidate.getDigest().equals(value.getDigest())) throw new ApiException(503, "REVIEW_CORRUPT", "审核快照完整性异常"); return candidate;
    }
    /**
     *
     * @param actor 当前身份
     *
     * @param id 审核标识
     *
     * @return 当前来源有效快照
     *
     * @throws ApiException 非提交/受派及来源失效统一404
     */
    private ReviewDO visible(AccountDO actor, String id) { ReviewDO value = mapper.visible(actor.getTenantId(), actor.getId(), id); if (value == null) throw new ApiException(404, "NOT_FOUND", "审核不存在或当前不可读"); return value; }
    /**
     *
     * @param value 当前可见实体
     *
     * @return 不含企业和幂等键的响应
     */
    private ReviewVO view(ReviewDO value) { return new ReviewVO(value.getId(), value.getCandidateId(), value.getDigest(), value.getSubmitterId(), value.getReviewerId(), value.getSubmitterName(), value.getReviewerName(), value.getMethod(), value.getState(), value.getRevision(), value.getComment(), value.getCreatedAt(), value.getDecidedAt()); }
    /**
     *
     * @param value 页码
     *
     * @throws ApiException 不在1至100000时400
     */
    private void page(int value) { if (value < 1 || value > 100000) invalid(); }
    /**
     *
     * @param value 必填UUID
     *
     * @throws ApiException 格式不合法400
     */
    private void uuid(String value) { if (value == null || !value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")) invalid(); }
    /**
     * @throws ApiException 不接受空字段或未知决定
     */
    private void invalid() { throw new ApiException(400, "INVALID_REVIEW", "请选择有效候选和审核人，并填写审核决定与意见"); }
    /**
     * @throws ApiException 不覆盖当前审核状态或不同幂等请求
     */
    private void conflict() { throw new ApiException(409, "REVIEW_CONFLICT", "审核已变化或已有在途审核，请刷新后重试"); }
}
