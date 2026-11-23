package com.code2knowledge.review.mapper;

import com.code2knowledge.review.domain.entity.ReviewDO;
import com.code2knowledge.review.domain.vo.ReviewerVO;
import com.code2knowledge.candidate.domain.entity.CandidateDO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 审核持久化端口；SQL仅XML，服务先锁企业再写决定及审计，无软删除恢复或外部事件。 */
@Mapper
public interface ReviewMapper {
    /**
     *
     * @param tenant 可信企业
     *
     * @param actor 当前成员
     *
     * @param id 审核UUID
     *
     * @return 已过滤对象/动作/全部来源的审核，无权null
     */
    ReviewDO visible(@Param("tenant") String tenant, @Param("actor") String actor, @Param("id") String id);
    /**
     *
     * @param tenant 可信企业
     *
     * @param actor 当前成员
     *
     * @param offset 记录偏移
     *
     * @return 权限过滤后当前20条，不泄露隐藏计数
     */
    List<ReviewDO> list(@Param("tenant") String tenant, @Param("actor") String actor, @Param("offset") int offset);
    /**
     *
     * @param tenant 可信企业
     *
     * @param actor 当前成员
     *
     * @return 同列表授权的记录数
     */
    int count(@Param("tenant") String tenant, @Param("actor") String actor);
    /**
     *
     * @param tenant 可信企业
     *
     * @param owner 提交者
     *
     * @param request 幂等UUID
     *
     * @return 原请求，无则null；服务再核当前可见
     */
    ReviewDO request(@Param("tenant") String tenant, @Param("owner") String owner, @Param("request") String request);
    /**
     *
     * @param tenant 可信企业
     *
     * @param candidate 候选UUID
     *
     * @param keyword 审核人姓名搜索
     *
     * @param offset 起始偏移
     *
     * @return 有效审核人20条，作者可选本人；调用方已核候选所有权
     */
    List<ReviewerVO> reviewers(@Param("tenant") String tenant, @Param("candidate") String candidate, @Param("keyword") String keyword, @Param("offset") int offset);
    /**
     *
     * @param tenant 可信企业
     *
     * @param candidate 候选UUID
     *
     * @param reviewer 显式成员
     *
     * @return 当前动作和所有来源均可审核才1
     */
    int eligible(@Param("tenant") String tenant, @Param("candidate") String candidate, @Param("reviewer") String reviewer);
    /**
     *
     * @param tenant 可信企业
     *
     * @param candidate 不可变候选
     *
     * @return 在途数量，企业锁内检查用于明确冲突提示
     */
    int pending(@Param("tenant") String tenant, @Param("candidate") String candidate);
    /**
     * @param value 已鉴权且生成UUID的送审快照，唯一在途索引拒绝重复送审
     */
    void insert(@Param("value") ReviewDO value);
    /**
     *
     * @param value 当前审核及期望revision，固定终态
     *
     * @return CAS更新数量，不为1时冲突
     */
    int decide(@Param("value") ReviewDO value);
    /**
     *
     * @param tenant 可信企业
     *
     * @param id 不可变候选UUID
     *
     * @return 内部原包引用，调用者须先鉴权审核，缺失null
     */
    CandidateDO candidate(@Param("tenant") String tenant, @Param("id") String id);
}
