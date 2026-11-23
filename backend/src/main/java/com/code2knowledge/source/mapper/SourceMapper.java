package com.code2knowledge.source.mapper;

import com.code2knowledge.source.domain.entity.SourceDO;
import com.code2knowledge.source.domain.vo.SourceVO;
import com.code2knowledge.source.domain.vo.SourceGrantVO;
import com.code2knowledge.catalog.domain.vo.SystemVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 来源持久化契约；服务写事务先锁企业，来源变更/版本/关联/审计同事务，无物理删除、软删除恢复或事件投递。 */
@Mapper
public interface SourceMapper {
    /**
     * @param tenantId 可信企业
     * @param userId 当前主体
     * @param manage 当前source.read.all
     * @param analyze 当前source.analyze
     * @param keyword 名称关键词，可空串
     * @param offset 已校验分页偏移
     * @param size 固定页大小
     * @return SQL先过滤的当前页，不返回隐藏来源 */
    List<SourceVO> list(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("manage") boolean manage, @Param("analyze") boolean analyze, @Param("keyword") String keyword, @Param("offset") int offset, @Param("size") int size);
    /**
     * @param tenantId 可信企业
     * @param userId 当前主体
     * @param manage 当前source.read.all
     * @param analyze 当前source.analyze
     * @param keyword 名称关键词，可空串
     * @return 同一授权条件下可见总数 */
    int count(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("manage") boolean manage, @Param("analyze") boolean analyze, @Param("keyword") String keyword);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @param userId 当前主体
     * @param manage 是否允许管理元数据
     * @param analyze 当前分析动作资格
     * @return 可见来源，不存在或无范围为null */
    SourceVO visible(@Param("tenantId") String tenantId, @Param("id") String id, @Param("userId") String userId, @Param("manage") boolean manage, @Param("analyze") boolean analyze);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @return 归属来源，不存在为null；调用方必须先校验管理动作 */
    SourceDO owned(@Param("tenantId") String tenantId, @Param("id") String id);
    /** @param source 已验证来源，不含凭证或正文 */
    void insert(@Param("source") SourceDO source);
    /**
     * @param source 期望版本及完整配置
     * @return 更新条数，0表示并发冲突 */
    int update(@Param("source") SourceDO source);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @return 关联系统摘要，只有source.create或source.update可调用 */
    List<SystemVO> bindings(@Param("tenantId") String tenantId, @Param("id") String id);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID */
    void clearBindings(@Param("tenantId") String tenantId, @Param("id") String id);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @param systemId 同企业系统UUID */
    void bind(@Param("tenantId") String tenantId, @Param("id") String id, @Param("systemId") String systemId);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @return 包含过期版本的成员授权，允许空列表 */
    List<SourceGrantVO> grants(@Param("tenantId") String tenantId, @Param("id") String id);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @param memberId 同企业成员UUID
     * @param revision 当前来源版本
     * @return 新增/更新数；相同授权重复提交为0 */
    int grant(@Param("tenantId") String tenantId, @Param("id") String id, @Param("memberId") String memberId, @Param("revision") int revision);
    /**
     * @param tenantId 可信企业
     * @param id 来源UUID
     * @param memberId 同企业成员UUID
     * @return 删除数；无授权为0 */
    int revoke(@Param("tenantId") String tenantId, @Param("id") String id, @Param("memberId") String memberId);
}
